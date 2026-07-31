use std::path::Path;

use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::root_policy::canonicalize_confined;
use super::types::SearchFailure;

pub fn open_file_impl<R: Runtime>(
    app: &AppHandle<R>,
    root: &Path,
    path: &Path,
) -> Result<(), SearchFailure> {
    let canonical_path = canonicalize_confined(root, path)?;
    app.opener()
        .open_path(canonical_path.to_string_lossy(), None::<String>)
        .map_err(|error| {
            SearchFailure::new(
                "open-failed",
                format!("The selected file could not be opened: {error}"),
                Some(&canonical_path),
            )
        })
}

pub fn open_containing_folder_impl<R: Runtime>(
    app: &AppHandle<R>,
    root: &Path,
    path: &Path,
) -> Result<(), SearchFailure> {
    let canonical_path = canonicalize_confined(root, path)?;
    app.opener()
        .reveal_item_in_dir(&canonical_path)
        .map_err(|error| {
            SearchFailure::new(
                "open-failed",
                format!("The containing folder could not be opened: {error}"),
                Some(&canonical_path),
            )
        })
}
