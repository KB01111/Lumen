mod matching;
mod metadata;
mod opening;
mod preview;
mod root_policy;
mod traversal;
mod types;

use std::path::Path;

use tauri::{AppHandle, Runtime};

pub use types::{
    BasicPreview, FileListResponse, FileRecord, FilenameSearchResponse, SearchFailure,
};

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
    tauri::async_runtime::spawn_blocking(move || {
        matching::search_filenames_impl(Path::new(&root), &query)
    })
    .await
    .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
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
