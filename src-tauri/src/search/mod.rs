mod extraction;
mod index;
pub mod indexing;
mod matching;
mod metadata;
mod opening;
mod preview;
mod root_policy;
mod traversal;
mod types;

use std::path::Path;

use tauri::{AppHandle, Runtime};

pub(crate) use index::{EnrichmentArtifact, EnrichmentJobRecord, EnrichmentLease, IndexedHit};
pub use indexing::IndexRuntime;
pub use types::{
    BasicPreview, FileListResponse, FileRecord, FilenameSearchResponse, SearchFailure,
};

const MAX_SEARCH_QUERY_CHARACTERS: usize = 4_000;

pub(crate) fn validate_search_query(query: &str) -> Result<(), SearchFailure> {
    if query.chars().take(MAX_SEARCH_QUERY_CHARACTERS + 1).count() > MAX_SEARCH_QUERY_CHARACTERS {
        return Err(SearchFailure::new(
            "invalid-search-query",
            format!("Search queries must be {MAX_SEARCH_QUERY_CHARACTERS} characters or fewer."),
            None,
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_files(root: String) -> Result<FileListResponse, SearchFailure> {
    tauri::async_runtime::spawn_blocking(move || traversal::list_files_impl(Path::new(&root)))
        .await
        .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
}

#[tauri::command]
pub async fn search_filenames(
    root: String,
    query: String,
) -> Result<FilenameSearchResponse, SearchFailure> {
    validate_search_query(&query)?;
    tauri::async_runtime::spawn_blocking(move || {
        matching::search_filenames_impl(Path::new(&root), &query)
    })
    .await
    .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
}

#[cfg(test)]
mod query_tests {
    use super::*;

    #[test]
    fn query_limit_counts_unicode_code_points() {
        assert!(validate_search_query(&"🦀".repeat(MAX_SEARCH_QUERY_CHARACTERS)).is_ok());
        assert_eq!(
            validate_search_query(&"🦀".repeat(MAX_SEARCH_QUERY_CHARACTERS + 1))
                .unwrap_err()
                .code,
            "invalid-search-query"
        );
    }
}

#[tauri::command]
pub async fn get_file_metadata(root: String, path: String) -> Result<FileRecord, SearchFailure> {
    tauri::async_runtime::spawn_blocking(move || {
        metadata::get_file_metadata_impl(Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
}

#[tauri::command]
pub async fn get_basic_preview(root: String, path: String) -> Result<BasicPreview, SearchFailure> {
    tauri::async_runtime::spawn_blocking(move || {
        preview::get_basic_preview_impl(Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|error| SearchFailure::new("preview-failed", error.to_string(), None))?
}

#[tauri::command]
pub fn open_file<R: Runtime>(
    app: AppHandle<R>,
    root: String,
    path: String,
) -> Result<(), SearchFailure> {
    opening::open_file_impl(&app, Path::new(&root), Path::new(&path))
}

#[tauri::command]
pub fn open_containing_folder<R: Runtime>(
    app: AppHandle<R>,
    root: String,
    path: String,
) -> Result<(), SearchFailure> {
    opening::open_containing_folder_impl(&app, Path::new(&root), Path::new(&path))
}

#[cfg(test)]
mod test_support {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub struct SearchFixture {
        base: PathBuf,
        root: PathBuf,
        outside: PathBuf,
    }

    impl SearchFixture {
        pub fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = std::env::temp_dir().join(format!(
                "lumen-search-{label}-{}-{nonce}",
                std::process::id()
            ));
            let root = base.join("root");
            let outside = base.join("outside");
            fs::create_dir_all(&root).unwrap();
            fs::create_dir_all(&outside).unwrap();
            Self {
                base,
                root,
                outside,
            }
        }

        pub fn root(&self) -> &Path {
            &self.root
        }

        pub fn file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.root.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, bytes).unwrap();
            path
        }

        pub fn outside_file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.outside.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, bytes).unwrap();
            path
        }
    }

    impl Drop for SearchFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }
}
