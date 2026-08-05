use std::{
    env, fs,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use serde::Serialize;
use tauri::State;

const LEMONADE_PORT: u16 = 13_305;
const REQUIRED_LEMONADE: &str = "11.5.1";
const REQUIRED_FLM: &str = "0.9.46";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeComponent {
    pub installed: bool,
    pub version: Option<String>,
    pub required_version: &'static str,
    pub state: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRuntimeHealth {
    pub profile: &'static str,
    pub state: &'static str,
    pub accelerator: String,
    pub answer_model: &'static str,
    pub embedding_model: &'static str,
    pub transcription_model: &'static str,
    pub base_url: &'static str,
    pub lemonade: RuntimeComponent,
    pub flm: RuntimeComponent,
    pub mistral_rs: RuntimeComponent,
    pub detail: Option<String>,
}

struct RuntimeProcess {
    child: Child,
    #[cfg(windows)]
    job: isize,
}

impl Drop for RuntimeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        #[cfg(windows)]
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(
                self.job as *mut _,
            ));
        }
    }
}

pub struct LocalRuntimeSupervisor {
    lemonade: Option<PathBuf>,
    flm: Option<PathBuf>,
    mistral_rs: Option<PathBuf>,
    process: Mutex<Option<RuntimeProcess>>,
}

fn executable_on_path(names: &[&str]) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|candidate| candidate.is_file())
}

fn known_executable(path: Option<PathBuf>, names: &[&str]) -> Option<PathBuf> {
    path.filter(|candidate| candidate.is_file())
        .or_else(|| executable_on_path(names))
}

fn command_output(binary: &Path, arguments: &[&str]) -> Option<String> {
    let mut command = Command::new(binary);
    command.args(arguments).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().ok()?;
    let combined = format!(
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let version = parse_version(&combined)?;
    (!version.is_empty()).then_some(version)
}

fn parse_version(output: &str) -> Option<String> {
    output.split_whitespace().find_map(|part| {
        let candidate = part
            .trim_start_matches('v')
            .trim_matches(|value: char| !value.is_ascii_digit() && value != '.');
        (candidate
            .chars()
            .next()
            .is_some_and(|value| value.is_ascii_digit())
            && candidate.contains('.'))
        .then(|| candidate.to_owned())
    })
}

fn component(
    binary: Option<&Path>,
    version: Option<String>,
    required: &'static str,
) -> RuntimeComponent {
    let installed = binary.is_some();
    let state = if !installed {
        "missing"
    } else if version.as_deref() == Some(required) {
        "ready"
    } else {
        "update-required"
    };
    RuntimeComponent {
        installed,
        version,
        required_version: required,
        state,
    }
}

fn lemonade_ready() -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], LEMONADE_PORT)),
        Duration::from_millis(150),
    )
    .is_ok()
}

fn profile_for(flm: bool, accelerator: &str) -> &'static str {
    if flm {
        "laptop-amd-npu"
    } else if accelerator.contains("RTX 5070 Ti") {
        "desktop-nvidia-cuda"
    } else {
        "generic-local"
    }
}

impl LocalRuntimeSupervisor {
    pub fn detect() -> Self {
        let lemonade = known_executable(
            env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .map(|path| path.join("lemonade_server/bin/LemonadeServer.exe")),
            &["LemonadeServer.exe"],
        );
        let flm = known_executable(
            env::var_os("ProgramFiles")
                .map(PathBuf::from)
                .map(|path| path.join("flm/flm.exe")),
            &["flm.exe"],
        );
        let mistral_rs = executable_on_path(&["mistralrs-server.exe", "mistralrs.exe"]);
        Self {
            lemonade,
            flm,
            mistral_rs,
            process: Mutex::new(None),
        }
    }

    fn accelerator(&self) -> String {
        let nvidia = executable_on_path(&["nvidia-smi.exe"])
            .and_then(|binary| {
                let mut command = Command::new(binary);
                command.args(["--query-gpu=name", "--format=csv,noheader"]);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x0800_0000);
                }
                command.output().ok()
            })
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
            .filter(|value| !value.is_empty());
        if self.flm.is_some() {
            match nvidia {
                Some(gpu) => format!("AMD Ryzen AI NPU + {gpu}"),
                None => "AMD Ryzen AI NPU".to_owned(),
            }
        } else {
            nvidia.unwrap_or_else(|| "CPU".to_owned())
        }
    }

    pub fn health(&self) -> LocalRuntimeHealth {
        let accelerator = self.accelerator();
        let profile = profile_for(self.flm.is_some(), &accelerator);
        let lemonade_version = self.lemonade.as_deref().and_then(|binary| {
            fs::metadata(binary).ok()?;
            executable_on_path(&["lemonade.exe"])
                .and_then(|cli| command_output(&cli, &["--version"]))
        });
        let flm_version = self
            .flm
            .as_deref()
            .and_then(|binary| command_output(binary, &["version", "--json"]));
        let mistral_version = self
            .mistral_rs
            .as_deref()
            .and_then(|binary| command_output(binary, &["--version"]));
        let running = lemonade_ready();
        let lemonade_compatible =
            self.lemonade.is_some() && lemonade_version.as_deref() == Some(REQUIRED_LEMONADE);
        let flm_compatible = self.flm.is_none() || flm_version.as_deref() == Some(REQUIRED_FLM);
        let compatible = lemonade_compatible && flm_compatible;
        let detail = if self.lemonade.is_none() {
            Some("LemonadeServer.exe is not installed".to_owned())
        } else if !lemonade_compatible {
            Some(format!(
                "Lemonade {REQUIRED_LEMONADE} is required for local answers"
            ))
        } else if !flm_compatible {
            Some(format!(
                "FLM {REQUIRED_FLM} is required for the qualified NPU profile"
            ))
        } else if !running {
            Some("Lemonade is installed but its loopback API is stopped".to_owned())
        } else {
            None
        };
        LocalRuntimeHealth {
            profile,
            state: if !compatible {
                "update-required"
            } else if running {
                "ready"
            } else {
                "stopped"
            },
            accelerator,
            answer_model: if profile == "desktop-nvidia-cuda" {
                "Qwen 3.5 9B (4-bit)"
            } else {
                "qwen3.5:4b"
            },
            embedding_model: "embed-gemma:300m",
            transcription_model: "whisper-v3:turbo",
            base_url: "http://127.0.0.1:13305/api/v1",
            lemonade: component(
                self.lemonade.as_deref(),
                lemonade_version,
                REQUIRED_LEMONADE,
            ),
            flm: component(self.flm.as_deref(), flm_version, REQUIRED_FLM),
            mistral_rs: component(self.mistral_rs.as_deref(), mistral_version, "0.9.0"),
            detail,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        let health = self.health();
        if health.lemonade.state != "ready" || health.flm.state == "update-required" {
            return Err(health
                .detail
                .unwrap_or_else(|| "The local AI runtime must be updated".to_owned()));
        }
        if lemonade_ready() {
            return Ok(());
        }
        let binary = self
            .lemonade
            .as_ref()
            .ok_or_else(|| "LemonadeServer.exe is not installed".to_owned())?;
        let mut command = Command::new(binary);
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let child = command
            .spawn()
            .map_err(|error| format!("Could not start Lemonade: {error}"))?;
        #[cfg(windows)]
        let job = super::supervisor::assign_kill_on_close_job(&child)?;
        *self
            .process
            .lock()
            .map_err(|_| "Local runtime state is poisoned")? = Some(RuntimeProcess {
            child,
            #[cfg(windows)]
            job: job.0 as isize,
        });
        let deadline = std::time::Instant::now() + Duration::from_secs(8);
        while !lemonade_ready() {
            if std::time::Instant::now() >= deadline {
                return Err("Lemonade did not open its loopback API".to_owned());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Ok(())
    }

    pub fn apply_mode(&self, mode: &str, keep_warm: bool) -> Result<(), String> {
        match mode {
            "local" => self.start(),
            "auto" if keep_warm => self.start(),
            "auto" => Ok(()),
            "cloud" if keep_warm => self.start(),
            "cloud" => {
                *self
                    .process
                    .lock()
                    .map_err(|_| "Local runtime state is poisoned")? = None;
                Ok(())
            }
            _ => Err("Unsupported runtime mode".to_owned()),
        }
    }
}

#[tauri::command]
pub fn local_runtime_health(state: State<'_, LocalRuntimeSupervisor>) -> LocalRuntimeHealth {
    state.inner().health()
}

#[tauri::command]
pub fn set_local_runtime_mode(
    mode: String,
    keep_warm: bool,
    state: State<'_, LocalRuntimeSupervisor>,
) -> Result<(), String> {
    state.inner().apply_mode(&mode, keep_warm)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hardware_profiles_prefer_qualified_accelerators() {
        assert_eq!(profile_for(true, "AMD Ryzen AI NPU"), "laptop-amd-npu");
        assert_eq!(
            profile_for(false, "NVIDIA GeForce RTX 5070 Ti"),
            "desktop-nvidia-cuda"
        );
        assert_eq!(profile_for(false, "CPU"), "generic-local");
    }

    #[test]
    fn component_requires_the_pinned_version() {
        assert_eq!(
            component(
                Some(Path::new("runtime.exe")),
                Some("0.9.43".to_owned()),
                "0.9.46"
            )
            .state,
            "update-required"
        );
        assert_eq!(component(None, None, "0.9.46").state, "missing");
    }

    #[test]
    fn parses_plain_and_json_version_output() {
        assert_eq!(parse_version("Lemonade 11.5.1"), Some("11.5.1".to_owned()));
        assert_eq!(
            parse_version(r#"{\"version\": \"0.9.43\"}"#),
            Some("0.9.43".to_owned())
        );
    }
}
