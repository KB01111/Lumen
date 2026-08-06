use std::{
    env,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::Manager;

const LEMONADE_PORT: u16 = 13_305;
const REQUIRED_LEMONADE: &str = "11.5.1";
const REQUIRED_FLM: &str = "0.9.46";
const EXTERNAL_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const EXTERNAL_PROBE_POLL_INTERVAL: Duration = Duration::from_millis(20);
const EXTERNAL_PROBE_DRAIN_TIMEOUT: Duration = Duration::from_millis(250);
const MAX_PROBE_OUTPUT_BYTES: u64 = 64 * 1024;
const API_PROBE_TIMEOUT: Duration = Duration::from_millis(500);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(8);
const STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(100);

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

fn bounded_command_output(
    binary: &Path,
    arguments: &[&str],
    timeout: Duration,
) -> Option<(std::process::ExitStatus, Vec<u8>, Vec<u8>)> {
    let mut command = Command::new(binary);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = crate::child_process::spawn_hidden(&mut command).ok()?;
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    };
    let Some(stderr) = child.stderr.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    };
    let (output_sender, output_receiver) = mpsc::sync_channel(2);
    let stdout_sender = output_sender.clone();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout
            .take(MAX_PROBE_OUTPUT_BYTES + 1)
            .read_to_end(&mut bytes);
        let _ = stdout_sender.send((true, bytes));
    });
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr
            .take(MAX_PROBE_OUTPUT_BYTES + 1)
            .read_to_end(&mut bytes);
        let _ = output_sender.send((false, bytes));
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => {
                thread::sleep(EXTERNAL_PROBE_POLL_INTERVAL);
            }
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let status = status?;
    let mut stdout = None;
    let mut stderr = None;
    for _ in 0..2 {
        let (is_stdout, bytes) = output_receiver
            .recv_timeout(EXTERNAL_PROBE_DRAIN_TIMEOUT)
            .ok()?;
        if is_stdout {
            stdout = Some(bytes);
        } else {
            stderr = Some(bytes);
        }
    }
    let stdout = stdout?;
    let stderr = stderr?;
    if stdout.len() as u64 > MAX_PROBE_OUTPUT_BYTES || stderr.len() as u64 > MAX_PROBE_OUTPUT_BYTES
    {
        return None;
    }
    Some((status, stdout, stderr))
}

fn raw_command_output(binary: &Path, arguments: &[&str]) -> Option<String> {
    let (status, stdout, stderr) =
        bounded_command_output(binary, arguments, EXTERNAL_PROBE_TIMEOUT)?;
    if !status.success() {
        return None;
    }
    let combined = format!(
        "{} {}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );
    Some(combined)
}

fn command_output(binary: &Path, arguments: &[&str]) -> Option<String> {
    let combined = raw_command_output(binary, arguments)?;
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

fn normalize_file_version(major_minor: u32, build_revision: u32) -> String {
    let mut values = vec![
        major_minor >> 16,
        major_minor & 0xffff,
        build_revision >> 16,
        build_revision & 0xffff,
    ];
    while values.len() > 1 && values.last() == Some(&0) {
        values.pop();
    }
    values
        .into_iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(".")
}

#[cfg(windows)]
fn lemonade_binary_version(binary: &Path) -> Option<String> {
    use std::{ffi::c_void, iter::once, os::windows::ffi::OsStrExt, ptr};
    use windows::{
        Win32::Storage::FileSystem::{
            GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW,
        },
        core::PCWSTR,
    };

    let wide_path: Vec<u16> = binary.as_os_str().encode_wide().chain(once(0)).collect();
    let mut ignored = 0_u32;
    let size = unsafe {
        GetFileVersionInfoSizeW(PCWSTR::from_raw(wide_path.as_ptr()), Some(&mut ignored))
    };
    if size == 0 || size > MAX_PROBE_OUTPUT_BYTES as u32 {
        return None;
    }
    let mut data = vec![0_u8; size as usize];
    if unsafe {
        GetFileVersionInfoW(
            PCWSTR::from_raw(wide_path.as_ptr()),
            None,
            size,
            data.as_mut_ptr().cast(),
        )
        .is_err()
    } {
        return None;
    }
    let root = [b'\\' as u16, 0];
    let mut value: *mut c_void = ptr::null_mut();
    let mut length = 0_u32;
    if !unsafe {
        VerQueryValueW(
            data.as_ptr().cast(),
            PCWSTR::from_raw(root.as_ptr()),
            &mut value,
            &mut length,
        )
        .as_bool()
    } || length < std::mem::size_of::<VS_FIXEDFILEINFO>() as u32
    {
        return None;
    }
    let value = unsafe { &*value.cast::<VS_FIXEDFILEINFO>() };
    (value.dwSignature == 0xfeef_04bd)
        .then(|| normalize_file_version(value.dwFileVersionMS, value.dwFileVersionLS))
}

#[cfg(not(windows))]
fn lemonade_binary_version(_binary: &Path) -> Option<String> {
    None
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

fn loopback_http_ready(port: u16, path: &str, authorization: Option<&str>) -> bool {
    let Ok(mut stream) =
        TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), API_PROBE_TIMEOUT)
    else {
        return false;
    };
    if stream.set_read_timeout(Some(API_PROBE_TIMEOUT)).is_err()
        || stream.set_write_timeout(Some(API_PROBE_TIMEOUT)).is_err()
    {
        return false;
    }
    let authorization = authorization
        .map(|value| format!("Authorization: Bearer {value}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{authorization}Connection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = [0_u8; 512];
    let Ok(read) = stream.read(&mut response) else {
        return false;
    };
    let status_line = String::from_utf8_lossy(&response[..read]);
    status_line
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse::<u16>().ok())
        .is_some_and(|status| (200..300).contains(&status))
}

fn loopback_api_ready() -> bool {
    loopback_http_ready(LEMONADE_PORT, "/api/v1/models", Some("lumen-local"))
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

fn spawn_runtime(binary: &Path) -> Result<RuntimeProcess, String> {
    let mut command = Command::new(binary);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = crate::child_process::spawn_hidden(&mut command)
        .map_err(|error| format!("Could not start Lemonade: {error}"))?;
    #[cfg(windows)]
    let job = match super::supervisor::assign_kill_on_close_job(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    Ok(RuntimeProcess {
        child,
        #[cfg(windows)]
        job: job.0 as isize,
    })
}

fn owned_runtime_ready(
    process: &mut Option<RuntimeProcess>,
    endpoint_ready: impl FnOnce() -> bool,
) -> Result<bool, String> {
    let Some(runtime) = process.as_mut() else {
        return Ok(false);
    };
    match runtime.child.try_wait() {
        Ok(None) => Ok(endpoint_ready()),
        Ok(Some(_)) => {
            process.take();
            Ok(false)
        }
        Err(error) => {
            process.take();
            Err(format!("Could not inspect Lemonade: {error}"))
        }
    }
}

fn wait_for_runtime(process: &mut RuntimeProcess) -> Result<(), String> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        if let Some(status) = process
            .child
            .try_wait()
            .map_err(|error| format!("Could not inspect Lemonade: {error}"))?
        {
            return Err(format!(
                "Lemonade exited before its loopback API became ready ({status})"
            ));
        }
        if loopback_api_ready() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("Lemonade did not expose a healthy loopback API in time".to_owned());
        }
        thread::sleep(STARTUP_POLL_INTERVAL);
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
                raw_command_output(&binary, &["--query-gpu=name", "--format=csv,noheader"])
            })
            .map(|output| output.trim().to_owned())
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

    fn owned_runtime_ready(&self) -> Result<bool, String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "Local runtime state is poisoned".to_owned())?;
        owned_runtime_ready(&mut process, loopback_api_ready)
    }

    pub fn health(&self) -> LocalRuntimeHealth {
        let accelerator = self.accelerator();
        let profile = profile_for(self.flm.is_some(), &accelerator);
        let lemonade_version = self.lemonade.as_deref().and_then(lemonade_binary_version);
        let flm_version = self
            .flm
            .as_deref()
            .and_then(|binary| command_output(binary, &["version", "--json"]));
        let mistral_version = self
            .mistral_rs
            .as_deref()
            .and_then(|binary| command_output(binary, &["--version"]));
        let (running, runtime_error) = match self.owned_runtime_ready() {
            Ok(running) => (running, None),
            Err(error) => (false, Some(error)),
        };
        let lemonade_compatible =
            self.lemonade.is_some() && lemonade_version.as_deref() == Some(REQUIRED_LEMONADE);
        let flm_compatible = self.flm.is_none() || flm_version.as_deref() == Some(REQUIRED_FLM);
        let compatible = lemonade_compatible && flm_compatible;
        let detail = if let Some(error) = runtime_error {
            Some(error)
        } else if self.lemonade.is_none() {
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
        let binary = self
            .lemonade
            .as_ref()
            .ok_or_else(|| "LemonadeServer.exe is not installed".to_owned())?;
        let mut state = self
            .process
            .lock()
            .map_err(|_| "Local runtime state is poisoned")?;
        if owned_runtime_ready(&mut state, loopback_api_ready)? {
            return Ok(());
        }
        if loopback_api_ready() {
            return Err(
                "A local Lemonade endpoint is already listening, but it is not owned by Lumen"
                    .to_owned(),
            );
        }
        state.take();
        let mut candidate = spawn_runtime(binary)?;
        wait_for_runtime(&mut candidate)?;
        *state = Some(candidate);
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
pub async fn local_runtime_health(app: tauri::AppHandle) -> Result<LocalRuntimeHealth, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<LocalRuntimeSupervisor>().health())
        .await
        .map_err(|error| format!("Could not join the local runtime health worker: {error}"))
}

#[tauri::command]
pub async fn set_local_runtime_mode(
    mode: String,
    keep_warm: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<LocalRuntimeSupervisor>()
            .apply_mode(&mode, keep_warm)
    })
    .await
    .map_err(|error| format!("Could not join the local runtime mode worker: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn serve_status(status: u16) -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 512];
            let _ = stream.read(&mut request);
            let response = format!(
                "HTTP/1.1 {status} Test\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        (port, worker)
    }

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

    #[test]
    fn file_version_is_normalized_without_running_the_binary() {
        assert_eq!(normalize_file_version(0x000b_0005, 0x0001_0000), "11.5.1");
        assert_eq!(normalize_file_version(0x000b_0005, 0), "11.5");
    }

    #[test]
    fn an_unowned_endpoint_is_never_considered_ready() {
        let mut process = None;
        let endpoint_was_probed = std::cell::Cell::new(false);
        assert!(
            !owned_runtime_ready(&mut process, || {
                endpoint_was_probed.set(true);
                true
            })
            .unwrap()
        );
        assert!(!endpoint_was_probed.get());
    }

    #[test]
    fn readiness_requires_a_successful_http_api_response() {
        let (ready_port, ready_worker) = serve_status(200);
        assert!(loopback_http_ready(
            ready_port,
            "/api/v1/models",
            Some("test-key")
        ));
        ready_worker.join().unwrap();

        let (failed_port, failed_worker) = serve_status(503);
        assert!(!loopback_http_ready(
            failed_port,
            "/api/v1/models",
            Some("test-key")
        ));
        failed_worker.join().unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn external_version_probes_are_bounded() {
        assert_eq!(
            command_output(Path::new("cmd.exe"), &["/C", "echo runtime version 1.2.3"]),
            Some("1.2.3".to_owned())
        );

        let started = Instant::now();
        assert!(
            bounded_command_output(
                Path::new("cmd.exe"),
                &["/C", "ping -n 6 127.0.0.1 > nul"],
                Duration::from_millis(100),
            )
            .is_none()
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
