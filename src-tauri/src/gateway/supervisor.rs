use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::Manager;

use super::{
    config::{
        AGENTGATEWAY_SHA256, AGENTGATEWAY_VERSION, GatewayPorts, render_enrichment_config,
        render_gateway_config,
    },
    credentials,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayHealth {
    pub state: &'static str,
    pub version: &'static str,
    pub interactive_port: u16,
    pub enrichment_port: u16,
    pub admin_port: u16,
    pub cloud_credential_configured: bool,
    pub detail: Option<String>,
}

struct ProcessState {
    slots: Vec<ProcessSlot>,
    detail: Option<String>,
}

struct ProcessSlot {
    child: Child,
    #[cfg(windows)]
    job: isize,
}

const READINESS_CONNECT_TIMEOUT: Duration = Duration::from_millis(150);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(8);
const STARTUP_POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_LOG_DETAIL_BYTES: u64 = 16 * 1024;

impl Drop for ProcessSlot {
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

pub struct GatewaySupervisor {
    binary: PathBuf,
    config_paths: [PathBuf; 2],
    log_paths: [PathBuf; 2],
    ports: GatewayPorts,
    bearer: String,
    state: Mutex<ProcessState>,
}

fn allocate_ports() -> Result<GatewayPorts, String> {
    let listeners = (0..3)
        .map(|_| {
            TcpListener::bind("127.0.0.1:0")
                .map_err(|error| format!("Could not reserve a loopback port: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let ports = listeners
        .iter()
        .map(|listener| {
            listener
                .local_addr()
                .map(|address| address.port())
                .map_err(|error| format!("Could not inspect a loopback port: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let ports = GatewayPorts {
        interactive: ports[0],
        enrichment: ports[1],
        admin: ports[2],
    };
    if !ports.are_distinct() {
        return Err("Could not allocate distinct AgentGateway ports".to_owned());
    }
    Ok(ports)
}

fn port_ready(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        READINESS_CONNECT_TIMEOUT,
    )
    .is_ok()
}

fn ports_ready(ports: GatewayPorts) -> bool {
    port_ready(ports.interactive) && port_ready(ports.enrichment) && port_ready(ports.admin)
}

fn wait_for_readiness(slots: &mut [ProcessSlot], ports: GatewayPorts) -> Result<(), String> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        for (index, slot) in slots.iter_mut().enumerate() {
            if let Some(status) = slot
                .child
                .try_wait()
                .map_err(|error| format!("Could not inspect AgentGateway lane {index}: {error}"))?
            {
                return Err(format!(
                    "AgentGateway lane {index} exited before becoming ready ({status})"
                ));
            }
        }
        if ports_ready(ports) {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("AgentGateway did not open all loopback listeners in time".to_owned());
        }
        std::thread::sleep(STARTUP_POLL_INTERVAL);
    }
}

fn read_log_tail(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(MAX_LOG_DETAIL_BYTES)))
        .ok()?;
    let mut bytes = Vec::with_capacity(MAX_LOG_DETAIL_BYTES as usize);
    file.take(MAX_LOG_DETAIL_BYTES)
        .read_to_end(&mut bytes)
        .ok()?;
    let detail = String::from_utf8_lossy(&bytes).trim().to_owned();
    (!detail.is_empty()).then_some(detail)
}

fn redact_detail(mut detail: String, secrets: &[&str]) -> String {
    for secret in secrets.iter().filter(|secret| !secret.is_empty()) {
        detail = detail.replace(secret, "[redacted]");
    }
    detail
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    use std::fmt::Write;
    let mut output = String::with_capacity(64);
    for byte in hash.finalize() {
        let _ = write!(output, "{byte:02x}");
    }
    Ok(output)
}

impl GatewaySupervisor {
    pub fn new(binary: PathBuf, runtime_directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(runtime_directory).map_err(|error| error.to_string())?;
        let ports = allocate_ports()?;
        let interactive_config = runtime_directory.join("agentgateway.interactive.yaml");
        let enrichment_config = runtime_directory.join("agentgateway.enrichment.yaml");
        let interactive_log = runtime_directory.join("agentgateway.interactive.log");
        let enrichment_log = runtime_directory.join("agentgateway.enrichment.log");
        fs::write(&interactive_config, render_gateway_config(ports))
            .map_err(|error| error.to_string())?;
        fs::write(&enrichment_config, render_enrichment_config(ports))
            .map_err(|error| error.to_string())?;
        Ok(Self {
            binary,
            config_paths: [interactive_config, enrichment_config],
            log_paths: [interactive_log, enrichment_log],
            ports,
            bearer: format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            ),
            state: Mutex::new(ProcessState {
                slots: Vec::new(),
                detail: None,
            }),
        })
    }

    pub fn start(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Gateway state is poisoned")?;
        let mut all_running = state.slots.len() == self.config_paths.len();
        for slot in &mut state.slots {
            all_running &= slot.child.try_wait().is_ok_and(|status| status.is_none());
        }
        if all_running && ports_ready(self.ports) {
            state.detail = None;
            return Ok(());
        }
        state.slots.clear();
        if !self.binary.is_file() {
            state.detail = Some("AgentGateway sidecar is not staged".to_owned());
            return Err(state.detail.clone().unwrap_or_default());
        }
        let actual = match sha256_file(&self.binary) {
            Ok(actual) => actual,
            Err(error) => {
                state.detail = Some(format!("Could not validate AgentGateway: {error}"));
                return Err(state.detail.clone().unwrap_or_default());
            }
        };
        if actual != AGENTGATEWAY_SHA256 {
            state.detail = Some("AgentGateway checksum validation failed".to_owned());
            return Err(state.detail.clone().unwrap_or_default());
        }

        let cloud_key = credentials::get("openai").unwrap_or_default();
        let mut candidates = Vec::with_capacity(self.config_paths.len());
        for (index, config_path) in self.config_paths.iter().enumerate() {
            let log = match fs::File::create(&self.log_paths[index]) {
                Ok(log) => log,
                Err(error) => {
                    let error = format!("Could not create AgentGateway log: {error}");
                    state.detail = Some(error.clone());
                    return Err(error);
                }
            };
            let error_log = match log.try_clone() {
                Ok(error_log) => error_log,
                Err(error) => {
                    let error = format!("Could not clone AgentGateway log: {error}");
                    state.detail = Some(error.clone());
                    return Err(error);
                }
            };
            let mut command = Command::new(&self.binary);
            command
                .arg("-f")
                .arg(config_path)
                .env("LUMEN_GATEWAY_BEARER", &self.bearer)
                .env("LUMEN_OPENAI_API_KEY", &cloud_key)
                .env("LUMEN_LOCAL_BASE_URL", "http://127.0.0.1:13305/api/v1")
                .env("LUMEN_LOCAL_API_KEY", "lumen-local")
                .stdin(Stdio::null())
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(error_log));
            let mut child = match crate::child_process::spawn_hidden(&mut command) {
                Ok(child) => child,
                Err(error) => {
                    let error = format!("Could not start AgentGateway lane {index}: {error}");
                    state.detail = Some(error.clone());
                    return Err(error);
                }
            };
            #[cfg(windows)]
            let job = match assign_kill_on_close_job(&child) {
                Ok(job) => job,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    state.detail = Some(error.clone());
                    return Err(error);
                }
            };
            candidates.push(ProcessSlot {
                child,
                #[cfg(windows)]
                job: job.0 as isize,
            });
        }
        if let Err(error) = wait_for_readiness(&mut candidates, self.ports) {
            let detail = self
                .log_paths
                .iter()
                .find_map(|path| read_log_tail(path))
                .map_or_else(|| error.clone(), |log| format!("{error}: {log}"));
            let detail = redact_detail(detail, &[&self.bearer, &cloud_key]);
            state.detail = Some(detail);
            return Err(error);
        }
        state.slots = candidates;
        state.detail = None;
        Ok(())
    }

    pub fn restart(&self) -> Result<(), String> {
        {
            let mut state = self.state.lock().map_err(|_| "Gateway state is poisoned")?;
            state.slots.clear();
        }
        self.start()
    }

    pub fn health(&self) -> GatewayHealth {
        let cloud_key = credentials::get("openai");
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut running = state.slots.len() == self.config_paths.len();
        for slot in &mut state.slots {
            running &= slot
                .child
                .try_wait()
                .ok()
                .is_some_and(|status| status.is_none());
        }
        let ready = running && ports_ready(self.ports);
        if ready {
            state.detail = None;
        } else if running {
            state.detail = Some(
                "AgentGateway processes are running but their loopback listeners are unavailable"
                    .to_owned(),
            );
        } else if state.detail.is_none() {
            state.detail = self
                .log_paths
                .iter()
                .find_map(|path| read_log_tail(path))
                .map(|detail| {
                    redact_detail(
                        detail,
                        &[&self.bearer, cloud_key.as_deref().unwrap_or_default()],
                    )
                });
        }
        GatewayHealth {
            state: if ready { "ready" } else { "unavailable" },
            version: AGENTGATEWAY_VERSION,
            interactive_port: self.ports.interactive,
            enrichment_port: self.ports.enrichment,
            admin_port: self.ports.admin,
            cloud_credential_configured: cloud_key.is_some(),
            detail: state.detail.clone(),
        }
    }

    pub(crate) fn endpoint(&self, enrichment: bool) -> (String, String) {
        let port = if enrichment {
            self.ports.enrichment
        } else {
            self.ports.interactive
        };
        (format!("http://127.0.0.1:{port}"), self.bearer.clone())
    }
}

#[cfg(windows)]
pub(crate) fn assign_kill_on_close_job(
    child: &Child,
) -> Result<windows::Win32::Foundation::HANDLE, String> {
    use std::{mem::size_of, os::windows::io::AsRawHandle};
    use windows::Win32::{
        Foundation::{HANDLE, INVALID_HANDLE_VALUE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        },
    };

    unsafe {
        let job = CreateJobObjectW(None, None).map_err(|error| error.to_string())?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if let Err(error) = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) {
            let _ = windows::Win32::Foundation::CloseHandle(job);
            return Err(error.to_string());
        }
        let process = HANDLE(child.as_raw_handle());
        if process == INVALID_HANDLE_VALUE || AssignProcessToJobObject(job, process).is_err() {
            let _ = windows::Win32::Foundation::CloseHandle(job);
            return Err("Could not assign AgentGateway to the Lumen Job Object".to_owned());
        }
        Ok(job)
    }
}

#[tauri::command]
pub async fn gateway_health(app: tauri::AppHandle) -> Result<GatewayHealth, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<GatewaySupervisor>().health())
        .await
        .map_err(|error| format!("Could not join the AgentGateway health worker: {error}"))
}

#[tauri::command]
pub async fn restart_gateway(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<GatewaySupervisor>().restart())
        .await
        .map_err(|error| format!("Could not join the AgentGateway restart worker: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashSet, net::TcpStream, thread, time::Duration};

    #[test]
    fn allocated_ports_are_distinct_and_loopback_only() {
        let ports = allocate_ports().unwrap();
        assert!(ports.are_distinct());
        assert_eq!(
            HashSet::from([ports.interactive, ports.enrichment, ports.admin]).len(),
            3
        );
    }

    #[test]
    fn readiness_requires_every_configured_listener() {
        let interactive = TcpListener::bind("127.0.0.1:0").unwrap();
        let enrichment = TcpListener::bind("127.0.0.1:0").unwrap();
        let admin = TcpListener::bind("127.0.0.1:0").unwrap();
        let ports = GatewayPorts {
            interactive: interactive.local_addr().unwrap().port(),
            enrichment: enrichment.local_addr().unwrap().port(),
            admin: admin.local_addr().unwrap().port(),
        };

        assert!(ports_ready(ports));
        drop(admin);
        assert!(!ports_ready(ports));
    }

    #[test]
    fn diagnostics_redact_runtime_credentials() {
        let detail = redact_detail(
            "bearer-token failed with cloud-secret".to_owned(),
            &["bearer-token", "cloud-secret"],
        );
        assert_eq!(detail, "[redacted] failed with [redacted]");
    }

    #[test]
    fn generated_config_is_secret_free_and_uses_loopback_admin() {
        let root = std::env::temp_dir().join(format!("lumen-gateway-{}", uuid::Uuid::new_v4()));
        let supervisor = GatewaySupervisor::new(root.join("missing.exe"), &root).unwrap();
        let config = fs::read_to_string(&supervisor.config_paths[0]).unwrap();
        assert!(config.contains("adminAddr: 127.0.0.1:"));
        assert!(config.contains("$LUMEN_GATEWAY_BEARER"));
        assert!(!config.contains(&supervisor.bearer));
        assert!(supervisor.start().is_err());
        assert!(supervisor.state.lock().unwrap().slots.is_empty());
        let health = supervisor.health();
        assert_eq!(health.state, "unavailable");
        assert_eq!(
            health.detail.as_deref(),
            Some("AgentGateway sidecar is not staged")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "requires the checksum-pinned AgentGateway sidecar"]
    fn pinned_gateway_starts_restarts_and_stops_both_lanes() {
        let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/agentgateway-x86_64-pc-windows-msvc.exe");
        let root = std::env::temp_dir().join(format!("lumen-gateway-{}", uuid::Uuid::new_v4()));
        let supervisor = GatewaySupervisor::new(binary, &root).unwrap();
        supervisor.start().unwrap();
        thread::sleep(Duration::from_millis(500));
        let health = supervisor.health();
        assert_eq!(health.state, "ready", "{:?}", health.detail);
        for port in [health.interactive_port, health.enrichment_port] {
            assert!(TcpStream::connect(("127.0.0.1", port)).is_ok());
        }
        supervisor.restart().unwrap();
        thread::sleep(Duration::from_millis(500));
        assert_eq!(supervisor.health().state, "ready");
        drop(supervisor);
        let _ = fs::remove_dir_all(root);
    }
}
