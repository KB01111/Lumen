mod embedding;
mod extraction;
mod index;
pub mod indexing;
mod matching;
mod metadata;
mod opening;
mod preview;
mod ranking;
mod root_policy;
mod traversal;
mod types;

use std::path::Path;

use tauri::{AppHandle, Runtime, State};

pub(crate) use index::{EnrichmentJobRecord, IndexedHit};
pub use indexing::IndexRuntime;
pub use types::{
    BasicPreview, FileKind, FileListResponse, FileRecord, FilenameSearchResponse, SearchFailure,
};

pub(crate) fn indexed_file_metadata(
    index: &IndexRuntime,
    stable_id: &str,
) -> Result<FileRecord, SearchFailure> {
    let (root, path) = index.file_location(stable_id)?.ok_or_else(|| {
        SearchFailure::new(
            "not-found",
            "The indexed file is no longer available.",
            None,
        )
    })?;
    metadata::get_file_metadata_impl(&root, &path)
}

pub(crate) fn open_indexed_file<R: Runtime>(
    app: &AppHandle<R>,
    index: &IndexRuntime,
    stable_id: &str,
) -> Result<(), SearchFailure> {
    let (root, path) = index.file_location(stable_id)?.ok_or_else(|| {
        SearchFailure::new(
            "not-found",
            "The indexed file is no longer available.",
            None,
        )
    })?;
    opening::open_file_impl(app, &root, &path)?;
    index.record_file_open(stable_id)?;
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
pub async fn get_basic_preview(
    privacy: State<'_, crate::privacy::PrivacyRuntime>,
    root: String,
    path: String,
) -> Result<BasicPreview, SearchFailure> {
    privacy.ensure_previews_enabled()?;
    let privacy = privacy.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_basic_preview_if_enabled(&privacy, Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|error| SearchFailure::new("preview-failed", error.to_string(), None))?
}

#[tauri::command]
pub fn open_file<R: Runtime>(
    app: AppHandle<R>,
    index: State<'_, IndexRuntime>,
    root: String,
    path: String,
) -> Result<(), SearchFailure> {
    opening::open_file_impl(&app, Path::new(&root), Path::new(&path))?;
    let canonical = root_policy::canonicalize_confined(Path::new(&root), Path::new(&path))?;
    if let Some(stable_id) = index.stable_id_for_path(&canonical)? {
        index.record_file_open(&stable_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_containing_folder<R: Runtime>(
    app: AppHandle<R>,
    root: String,
    path: String,
) -> Result<(), SearchFailure> {
    opening::open_containing_folder_impl(&app, Path::new(&root), Path::new(&path))
}

fn get_basic_preview_if_enabled(
    privacy: &crate::privacy::PrivacyRuntime,
    root: &Path,
    path: &Path,
) -> Result<BasicPreview, SearchFailure> {
    privacy.ensure_previews_enabled()?;
    preview::get_basic_preview_impl(root, path)
}

#[cfg(test)]
mod privacy_tests {
    use super::*;

    #[test]
    fn disabled_preview_wins_before_path_validation_or_file_reads() {
        let privacy = crate::privacy::PrivacyRuntime::default();
        privacy.set_previews_enabled(false);
        let missing =
            std::env::temp_dir().join(format!("lumen-disabled-preview-{}", uuid::Uuid::new_v4()));

        let error = get_basic_preview_if_enabled(&privacy, &missing, &missing.join("secret.txt"))
            .unwrap_err();

        assert_eq!(error.code, "permission-denied");
        assert_eq!(error.path, None);
    }
}

#[cfg(test)]
pub(crate) mod test_support {
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
