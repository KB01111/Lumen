use std::{
    io,
    process::{Child, Command},
};

#[cfg(windows)]
use std::sync::Mutex;

#[cfg(windows)]
static PROCESS_ERROR_MODE_LOCK: Mutex<()> = Mutex::new(());

/// Starts a fixed Lumen-owned child without a console or modal Windows crash UI.
///
/// Windows children inherit the parent's process error mode at creation time. The
/// process-wide change is therefore serialized, scoped to `spawn`, and restored
/// immediately after the child has inherited it.
pub(crate) fn spawn_hidden(command: &mut Command) -> io::Result<Child> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        use windows::Win32::System::{
            Diagnostics::Debug::{
                GetErrorMode, SEM_FAILCRITICALERRORS, SEM_NOGPFAULTERRORBOX, SetErrorMode,
                THREAD_ERROR_MODE,
            },
            Threading::CREATE_NO_WINDOW,
        };

        struct RestoreErrorMode(THREAD_ERROR_MODE);

        impl Drop for RestoreErrorMode {
            fn drop(&mut self) {
                unsafe {
                    SetErrorMode(self.0);
                }
            }
        }

        command.creation_flags(CREATE_NO_WINDOW.0);
        let _lock = PROCESS_ERROR_MODE_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let previous = unsafe { GetErrorMode() };
        let suppressed = previous | SEM_FAILCRITICALERRORS.0 | SEM_NOGPFAULTERRORBOX.0;
        unsafe {
            SetErrorMode(THREAD_ERROR_MODE(suppressed));
        }
        let _restore = RestoreErrorMode(THREAD_ERROR_MODE(previous));
        command.spawn()
    }

    #[cfg(not(windows))]
    {
        command.spawn()
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::process::{Command, Stdio};

    use windows::Win32::System::Diagnostics::Debug::{
        GetErrorMode, SEM_FAILCRITICALERRORS, SEM_NOGPFAULTERRORBOX,
    };

    use super::spawn_hidden;

    const PROBE_ENVIRONMENT: &str = "LUMEN_CHILD_ERROR_MODE_PROBE";

    #[test]
    fn inherited_error_mode_probe() {
        if std::env::var_os(PROBE_ENVIRONMENT).is_none() {
            return;
        }

        let mode = unsafe { GetErrorMode() };
        assert_ne!(mode & SEM_FAILCRITICALERRORS.0, 0);
        assert_ne!(mode & SEM_NOGPFAULTERRORBOX.0, 0);
    }

    #[test]
    fn hidden_child_inherits_suppressed_dialogs_and_parent_mode_is_restored() {
        let before = unsafe { GetErrorMode() };
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "child_process::tests::inherited_error_mode_probe",
                "--nocapture",
            ])
            .env(PROBE_ENVIRONMENT, "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = spawn_hidden(&mut command)
            .unwrap()
            .wait_with_output()
            .unwrap();
        assert!(
            output.status.success(),
            "child error-mode probe failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(unsafe { GetErrorMode() }, before);
    }
}
