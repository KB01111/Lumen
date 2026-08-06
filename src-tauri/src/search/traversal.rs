use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path};

use super::metadata::file_record;
use super::root_policy::canonicalize_root;
use super::types::{FileListResponse, FileRecord, SearchFailure, SearchWarning};

const MAX_TRAVERSED_ITEMS: usize = 250_000;
pub const MAX_RESPONSE_ITEMS: usize = 10_000;
const MAX_WARNINGS: usize = 32;
const GENERATED_DIRECTORIES: [&str; 9] = [
    ".git",
    ".next",
    ".turbo",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
    "vendor",
];

pub struct TraversalOutcome {
    pub records: Vec<FileRecord>,
    pub warnings: Vec<SearchWarning>,
    pub truncated: bool,
}

#[derive(Clone, Debug)]
pub struct TraversalPolicy {
    pub include_hidden: bool,
    pub exclusions: Vec<String>,
    pub max_file_size_bytes: u64,
}

impl Default for TraversalPolicy {
    fn default() -> Self {
        Self {
            include_hidden: true,
            exclusions: Vec::new(),
            max_file_size_bytes: u64::MAX,
        }
    }
}

fn warning(path: &Path, message: impl Into<String>) -> SearchWarning {
    SearchWarning {
        message: message.into(),
        path: path.to_string_lossy().into_owned(),
    }
}

fn push_warning(warnings: &mut Vec<SearchWarning>, value: SearchWarning) {
    if warnings.len() < MAX_WARNINGS {
        warnings.push(value);
    }
}

fn is_generated_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|name| {
            GENERATED_DIRECTORIES
                .iter()
                .any(|ignored| name.eq_ignore_ascii_case(ignored))
        })
}

fn wildcard_matches(pattern: &str, value: &str) -> bool {
    let pattern = pattern.chars().collect::<Vec<_>>();
    let value = value.chars().collect::<Vec<_>>();
    let mut previous = vec![false; value.len() + 1];
    previous[0] = true;
    for token in pattern {
        let mut current = vec![false; value.len() + 1];
        if token == '*' {
            current[0] = previous[0];
        }
        for index in 1..=value.len() {
            current[index] = match token {
                '*' => previous[index] || current[index - 1],
                '?' => previous[index - 1],
                literal => previous[index - 1] && literal == value[index - 1],
            };
        }
        previous = current;
    }
    previous[value.len()]
}

fn is_excluded(root: &Path, path: &Path, exclusions: &[String]) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return true;
    };
    let components = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_lowercase()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let relative = components.join("/");
    exclusions.iter().any(|pattern| {
        let pattern = pattern.trim().replace('\\', "/").to_lowercase();
        if pattern.is_empty() {
            return false;
        }
        if pattern.contains('/') {
            wildcard_matches(&pattern, &relative)
                || (!pattern.contains('*')
                    && !pattern.contains('?')
                    && relative
                        .strip_prefix(&pattern)
                        .is_some_and(|suffix| suffix.is_empty() || suffix.starts_with('/')))
        } else {
            components
                .iter()
                .any(|component| wildcard_matches(&pattern, component))
        }
    })
}

fn is_hidden(path: &Path) -> bool {
    let dot_hidden = path
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|name| name.starts_with('.'));
    if dot_hidden {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        fs::metadata(path)
            .map(|metadata| metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    false
}

pub fn traverse_with_policy(
    root: &Path,
    policy: &TraversalPolicy,
) -> Result<TraversalOutcome, SearchFailure> {
    let root = canonicalize_root(root)?;
    let mut records = Vec::new();
    let mut warnings = Vec::new();
    let mut directories = vec![root.clone()];
    let mut visited = HashSet::new();
    let mut truncated = false;

    'walk: while let Some(directory) = directories.pop() {
        let canonical_directory = match fs::canonicalize(&directory) {
            Ok(value) if value.starts_with(&root) => value,
            Ok(_) => continue,
            Err(error) => {
                push_warning(
                    &mut warnings,
                    warning(&directory, format!("Directory was skipped: {error}")),
                );
                continue;
            }
        };
        if !visited.insert(canonical_directory.clone()) {
            continue;
        }

        let read_directory = match fs::read_dir(&canonical_directory) {
            Ok(value) => value,
            Err(error) => {
                push_warning(
                    &mut warnings,
                    warning(
                        &canonical_directory,
                        format!("Directory was skipped: {error}"),
                    ),
                );
                continue;
            }
        };
        let mut entries = Vec::new();
        for entry in read_directory {
            match entry {
                Ok(value) => entries.push(value),
                Err(error) => push_warning(
                    &mut warnings,
                    warning(
                        &canonical_directory,
                        format!("Directory entry was skipped: {error}"),
                    ),
                ),
            }
        }
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());

        for entry in entries {
            if records.len() >= MAX_TRAVERSED_ITEMS {
                truncated = true;
                break 'walk;
            }

            let path = entry.path();
            if (!policy.include_hidden && is_hidden(&path))
                || is_excluded(&root, &path, &policy.exclusions)
            {
                continue;
            }
            let file_type = match entry.file_type() {
                Ok(value) => value,
                Err(error) => {
                    push_warning(
                        &mut warnings,
                        warning(&path, format!("Item was skipped: {error}")),
                    );
                    continue;
                }
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if is_generated_directory(&path) {
                    continue;
                }
                match fs::canonicalize(&path) {
                    Ok(value) if value.starts_with(&root) => directories.push(value),
                    Ok(_) => continue,
                    Err(error) => {
                        push_warning(
                            &mut warnings,
                            warning(&path, format!("Directory was skipped: {error}")),
                        );
                        continue;
                    }
                }
            }

            if file_type.is_file()
                && entry
                    .metadata()
                    .map(|metadata| metadata.len() > policy.max_file_size_bytes)
                    .unwrap_or(false)
            {
                continue;
            }

            match file_record(&root, &path) {
                Ok(record) => records.push(record),
                Err(error) => push_warning(&mut warnings, warning(&path, error.message)),
            }
        }
    }

    records.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(TraversalOutcome {
        records,
        warnings,
        truncated,
    })
}

pub fn traverse(root: &Path) -> Result<TraversalOutcome, SearchFailure> {
    traverse_with_policy(root, &TraversalPolicy::default())
}

pub fn list_files_impl(root: &Path) -> Result<FileListResponse, SearchFailure> {
    let outcome = traverse(root)?;
    let total = outcome.records.len();
    Ok(FileListResponse {
        items: outcome
            .records
            .into_iter()
            .take(MAX_RESPONSE_ITEMS)
            .collect(),
        total,
        truncated: outcome.truncated || total > MAX_RESPONSE_ITEMS,
        warnings: outcome.warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn traversal_preserves_unicode_and_has_stable_ordering() {
        let fixture = SearchFixture::new("traversal");
        fixture.file("zeta.txt", b"z");
        fixture.file("Alpha.txt", b"a");
        fixture.file("International/Årsrapport 東京.md", b"unicode");

        let first = list_files_impl(fixture.root()).unwrap();
        let second = list_files_impl(fixture.root()).unwrap();
        let names = first
            .items
            .iter()
            .map(|item| item.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(first.items, second.items);
        assert!(names.contains(&"Årsrapport 東京.md"));
        assert_eq!(first.total, 4);
    }

    #[test]
    fn traversal_skips_common_generated_directories() {
        let fixture = SearchFixture::new("generated-directories");
        fixture.file("package.json", b"{}");
        fixture.file("node_modules/dependency/package.json", b"{}");
        fixture.file("target/debug/generated.rs", b"");

        let response = list_files_impl(fixture.root()).unwrap();
        let relative_paths = response
            .items
            .iter()
            .map(|item| item.relative_path.as_str())
            .collect::<Vec<_>>();

        assert!(relative_paths.contains(&"package.json"));
        assert!(
            !relative_paths
                .iter()
                .any(|path| path.contains("node_modules"))
        );
        assert!(!relative_paths.iter().any(|path| path.contains("target")));
    }

    #[test]
    fn indexing_policy_applies_hidden_exclusion_and_size_limits() {
        let fixture = SearchFixture::new("traversal-policy");
        fixture.file("visible/keep.txt", b"keep");
        fixture.file(".private/secret.txt", b"secret");
        fixture.file("logs/trace.txt", b"trace");
        fixture.file("visible/cache.tmp", b"temporary");
        fixture.file("visible/large.txt", b"123456789");

        let outcome = traverse_with_policy(
            fixture.root(),
            &TraversalPolicy {
                include_hidden: false,
                exclusions: vec!["logs".to_owned(), "*.tmp".to_owned()],
                max_file_size_bytes: 8,
            },
        )
        .unwrap();
        let relative_paths = outcome
            .records
            .iter()
            .map(|item| item.relative_path.as_str())
            .collect::<Vec<_>>();

        assert!(relative_paths.contains(&"visible/keep.txt"));
        assert!(!relative_paths.iter().any(|path| path.contains(".private")));
        assert!(!relative_paths.iter().any(|path| path.contains("logs")));
        assert!(!relative_paths.iter().any(|path| path.ends_with(".tmp")));
        assert!(
            !relative_paths
                .iter()
                .any(|path| path.ends_with("large.txt"))
        );
    }
}
