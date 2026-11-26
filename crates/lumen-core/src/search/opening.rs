use std::path::Path;

use super::root_policy::canonicalize_confined;
use super::types::SearchFailure;

#[cfg(windows)]
fn to_wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(std::iter::once(0)).collect()
}

/// Strip Windows extended-length prefix (`\\?\`) for ShellExecute / Explorer display compatibility.
pub(crate) fn strip_extended_prefix(path: &Path) -> std::path::PathBuf {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        return std::path::PathBuf::from(format!(r"\\{unc}"));
    }
    if let Some(stripped) = text.strip_prefix(r"\\?\") {
        return std::path::PathBuf::from(stripped);
    }
    path.to_path_buf()
}

/// Opens a file or folder directly via the OS shell after verifying root confinement.
pub fn open_file_impl(root: &Path, path: &Path) -> Result<(), SearchFailure> {
    let canonical_path = canonicalize_confined(root, path)?;
    open_path_unconfined(&canonical_path).map_err(|error| {
        SearchFailure::new(
            "open-failed",
            format!("The selected file could not be opened: {error}"),
            Some(&canonical_path),
        )
    })
}

/// Reveals a file or folder inside Windows Explorer after verifying root confinement.
pub fn open_containing_folder_impl(root: &Path, path: &Path) -> Result<(), SearchFailure> {
    let canonical_path = canonicalize_confined(root, path)?;
    let display = strip_extended_prefix(&canonical_path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", display.display()))
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|error| {
                SearchFailure::new(
                    "open-failed",
                    format!("The containing folder could not be opened: {error}"),
                    Some(&canonical_path),
                )
            })?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = display;
        Err(SearchFailure::new(
            "open-failed",
            "Opening containing folders requires Windows.",
            Some(&canonical_path),
        ))
    }
}

/// Launches an arbitrary local target (e.g. an installed Start Menu shortcut or URL) with ShellExecuteW.
pub fn open_path_unconfined(path: &Path) -> Result<(), String> {
    let display = strip_extended_prefix(path);
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::core::PCWSTR;

        let verb = to_wide(std::ffi::OsStr::new("open"));
        let target = to_wide(display.as_os_str());
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if (result.0 as isize) <= 32 {
            return Err(format!("ShellExecuteW failed with code {}", result.0 as isize));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = display;
        Err("Shell launch requires Windows.".to_owned())
    }
}
