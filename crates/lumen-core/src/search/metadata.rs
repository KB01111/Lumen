use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::root_policy::canonicalize_confined;
use super::types::{FileKind, FileRecord, SearchFailure};

pub fn kind_for_path(path: &Path, is_directory: bool) -> FileKind {
    if is_directory {
        return FileKind::Folder;
    }

    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => FileKind::Pdf,
        "doc" | "docx" | "odt" | "rtf" | "txt" | "md" => FileKind::Document,
        "csv" | "ods" | "xls" | "xlsx" => FileKind::Spreadsheet,
        "odp" | "ppt" | "pptx" => FileKind::Presentation,
        "c" | "cc" | "cpp" | "cs" | "css" | "go" | "h" | "hpp" | "html" | "java" | "js" | "jsx"
        | "json" | "kt" | "kts" | "lua" | "php" | "py" | "rb" | "rs" | "scss" | "sh" | "sql"
        | "swift" | "toml" | "ts" | "tsx" | "vue" | "xml" | "yaml" | "yml" => FileKind::Source,
        "avif" | "bmp" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "webp" => FileKind::Image,
        "avi" | "m4v" | "mkv" | "mov" | "mp4" | "webm" | "wmv" => FileKind::Video,
        "aac" | "flac" | "m4a" | "mp3" | "ogg" | "wav" | "wma" => FileKind::Audio,
        "7z" | "bz2" | "gz" | "rar" | "tar" | "xz" | "zip" => FileKind::Archive,
        "bat" | "cmd" | "com" | "exe" | "msi" | "ps1" => FileKind::Executable,
        "fbx" | "gltf" | "glb" | "obj" | "stl" => FileKind::Model,
        _ => FileKind::Unknown,
    }
}

pub fn file_record(root: &Path, path: &Path) -> Result<FileRecord, SearchFailure> {
    let metadata = fs::metadata(path)
        .map_err(|error| SearchFailure::from_io("inspect a local item", path, &error))?;
    let relative_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok());

    Ok(FileRecord {
        path: path.to_string_lossy().into_owned(),
        relative_path,
        name,
        kind: kind_for_path(path, metadata.is_dir()),
        extension,
        size_bytes: if metadata.is_file() {
            metadata.len()
        } else {
            0
        },
        modified_ms,
    })
}

pub fn get_file_metadata_impl(root: &Path, path: &Path) -> Result<FileRecord, SearchFailure> {
    let canonical_root = super::root_policy::canonicalize_root(root)?;
    let canonical_path = canonicalize_confined(&canonical_root, path)?;
    file_record(&canonical_root, &canonical_path)
}
