use std::fs;
use std::path::{Path, PathBuf};

use super::types::SearchFailure;

pub fn canonicalize_root(root: &Path) -> Result<PathBuf, SearchFailure> {
    if !root.is_absolute() {
        return Err(SearchFailure::new(
            "invalid-root",
            "The selected search root must be an absolute path.",
            Some(root),
        ));
    }

    let canonical = fs::canonicalize(root)
        .map_err(|error| SearchFailure::from_io("read the selected root", root, &error))?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| SearchFailure::from_io("inspect the selected root", root, &error))?;
    if !metadata.is_dir() {
        return Err(SearchFailure::new(
            "invalid-root",
            "The selected search root is not a directory.",
            Some(root),
        ));
    }

    Ok(canonical)
}

pub fn canonicalize_confined(root: &Path, path: &Path) -> Result<PathBuf, SearchFailure> {
    let canonical_root = canonicalize_root(root)?;
    let canonical_path = fs::canonicalize(path)
        .map_err(|error| SearchFailure::from_io("read the selected path", path, &error))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err(SearchFailure::new(
            "permission-denied",
            "The requested path is outside the selected search root.",
            Some(path),
        ));
    }

    Ok(canonical_path)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn rejects_paths_outside_the_selected_root() {
        let fixture = SearchFixture::new("root-policy");
        let inside = fixture.file("inside/report.txt", b"report");
        let outside = fixture.outside_file("private.txt", b"private");

        assert_eq!(
            canonicalize_confined(fixture.root(), &inside).unwrap(),
            fs::canonicalize(inside).unwrap()
        );
        let failure = canonicalize_confined(fixture.root(), &outside).unwrap_err();
        assert_eq!(failure.code, "permission-denied");
    }

    #[test]
    fn rejects_relative_roots() {
        let failure = canonicalize_root(Path::new("relative-root")).unwrap_err();
        assert_eq!(failure.code, "invalid-root");
    }
}
