use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Output, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{State, ipc::Channel};

use crate::{
    consent::PersistedConsent,
    gateway::{credentials, supervisor::assign_kill_on_close_job},
};

const MAX_TASK_LENGTH: usize = 4_000;
const MAX_WORKER_BINARY_BYTES: u64 = 128 * 1024 * 1024;
const MAX_WORKER_EVENT_LINE_BYTES: usize = 64 * 1024;
const MAX_WORKER_EVENT_BYTES: usize = 16 * 1024;
const MAX_WORKER_FAILURE_CHARS: usize = 2_048;
const MAX_WORKER_CODE_CHARS: usize = 64;
const HEALTH_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const STAGED_WORKER_SHA256: &str = env!("LUMEN_COMPUTER_USE_SHA256");
const SUPPORTED_MODELS: [&str; 5] = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-computer-use-preview-10-2025",
    "gemini-3-flash-preview",
];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseRequest {
    task_id: u64,
    task: String,
    model: String,
    initial_url: String,
    cloud_consent: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ComputerUseEvent {
    Started {
        model: String,
        browser: String,
    },
    Reasoning {
        text: String,
    },
    Action {
        action: String,
    },
    Observation {
        url: String,
    },
    ApprovalRequired {
        approval_id: String,
        explanation: String,
    },
    ApprovalResolved {
        approval_id: String,
        approved: bool,
    },
    Completed {
        summary: String,
    },
    Cancelled,
    Failed {
        message: String,
        code: String,
    },
}

impl ComputerUseEvent {
    fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed { .. } | Self::Cancelled | Self::Failed { .. }
        )
    }
}

enum WorkerEventLine {
    Line(Vec<u8>),
    Oversized,
}

fn next_worker_event_line(
    reader: &mut impl BufRead,
) -> Result<Option<WorkerEventLine>, std::io::Error> {
    let mut line = Vec::new();
    let mut oversized = false;
    loop {
        let (take, has_newline) = {
            let available = reader.fill_buf()?;
            if available.is_empty() {
                return Ok((!line.is_empty() || oversized).then_some({
                    if oversized {
                        WorkerEventLine::Oversized
                    } else {
                        WorkerEventLine::Line(line)
                    }
                }));
            }
            let newline = available.iter().position(|byte| *byte == b'\n');
            let take = newline.unwrap_or(available.len());
            if !oversized {
                if line.len().saturating_add(take) > MAX_WORKER_EVENT_LINE_BYTES {
                    oversized = true;
                } else {
                    line.extend_from_slice(&available[..take]);
                }
            }
            (take, newline.is_some())
        };
        reader.consume(take + usize::from(has_newline));
        if has_newline {
            return Ok(Some(if oversized {
                WorkerEventLine::Oversized
            } else {
                WorkerEventLine::Line(line)
            }));
        }
    }
}

fn sanitized_worker_text(value: String, maximum_characters: usize) -> String {
    let mut output = String::new();
    let mut truncated = false;
    for (characters, character) in value.chars().enumerate() {
        if characters == maximum_characters {
            truncated = true;
            break;
        }
        output.push(if character.is_control() {
            ' '
        } else {
            character
        });
    }
    if truncated && maximum_characters > 0 {
        output.pop();
        output.push('…');
    }
    output.trim().to_owned()
}

fn sanitize_worker_event(event: ComputerUseEvent) -> ComputerUseEvent {
    match event {
        ComputerUseEvent::Failed { message, code } => ComputerUseEvent::Failed {
            message: sanitized_worker_text(message, MAX_WORKER_FAILURE_CHARS),
            code: sanitized_worker_text(code, MAX_WORKER_CODE_CHARS),
        },
        event => event,
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerUseHealth {
    state: &'static str,
    mode: &'static str,
    browser: &'static str,
    credential_configured: bool,
    detail: Option<String>,
}

#[derive(Clone, Debug)]
enum WorkerTarget {
    Binary(PathBuf),
    #[cfg(debug_assertions)]
    Python {
        binary: PathBuf,
        script: PathBuf,
    },
    Missing,
}

impl WorkerTarget {
    fn mode(&self) -> &'static str {
        match self {
            Self::Binary(_) => "packaged",
            #[cfg(debug_assertions)]
            Self::Python { .. } => "python",
            Self::Missing => "missing",
        }
    }

    fn verify_integrity(&self) -> Result<(), String> {
        match self {
            Self::Binary(binary) => verify_worker_binary(binary, STAGED_WORKER_SHA256),
            #[cfg(debug_assertions)]
            Self::Python { .. } => Ok(()),
            Self::Missing => Err("The Computer Use worker is not installed".to_owned()),
        }
    }

    fn command(&self) -> Result<Command, String> {
        match self {
            Self::Binary(binary) => Ok(Command::new(binary)),
            #[cfg(debug_assertions)]
            Self::Python { binary, script } => {
                let mut command = Command::new(binary);
                command.arg(script);
                Ok(command)
            }
            Self::Missing => Err("The Computer Use worker is not installed".to_owned()),
        }
    }
}

fn sha256_file_bounded(path: &Path) -> Result<String, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("Could not inspect the Computer Use worker: {error}"))?;
    if !metadata.is_file() {
        return Err("The Computer Use worker is not a file".to_owned());
    }
    if metadata.len() > MAX_WORKER_BINARY_BYTES {
        return Err(format!(
            "The Computer Use worker exceeds the {} MiB integrity limit",
            MAX_WORKER_BINARY_BYTES / (1024 * 1024)
        ));
    }

    let mut file = File::open(path)
        .map_err(|error| format!("Could not open the Computer Use worker: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut total = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read the Computer Use worker: {error}"))?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read as u64);
        if total > MAX_WORKER_BINARY_BYTES {
            return Err(format!(
                "The Computer Use worker exceeds the {} MiB integrity limit",
                MAX_WORKER_BINARY_BYTES / (1024 * 1024)
            ));
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn verify_worker_binary(path: &Path, expected_digest: &str) -> Result<(), String> {
    if !valid_sha256(expected_digest) {
        return Err("The Computer Use worker has no build-time integrity digest".to_owned());
    }
    let actual_digest = sha256_file_bounded(path)?;
    if !actual_digest.eq_ignore_ascii_case(expected_digest) {
        return Err("The Computer Use worker failed its integrity check".to_owned());
    }
    Ok(())
}

struct ActiveTask {
    id: u64,
    child: Child,
    stdin: ChildStdin,
    channel: Channel<ComputerUseEvent>,
    #[cfg(windows)]
    job: isize,
}

impl Drop for ActiveTask {
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

#[derive(Clone)]
pub struct ComputerUseSupervisor {
    target: WorkerTarget,
    active: Arc<Mutex<Option<ActiveTask>>>,
}

#[cfg(debug_assertions)]
fn executable_on_path(names: &[&str]) -> Option<PathBuf> {
    use std::env;

    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|candidate| candidate.is_file())
}

fn supported_model(model: &str) -> bool {
    SUPPORTED_MODELS.contains(&model)
}

fn run_probe(mut command: Command, timeout: Duration) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = crate::child_process::spawn_hidden(&mut command)
        .map_err(|error| format!("Could not start the Computer Use health probe: {error}"))?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child.wait_with_output().map_err(|error| {
                    format!("Could not collect the Computer Use health probe: {error}")
                });
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Computer Use worker health check timed out after {} seconds",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Could not inspect the Computer Use health probe: {error}"
                ));
            }
        }
    }
}

fn validate_request(request: &ComputerUseRequest) -> Result<(), String> {
    if request.task.trim().is_empty() {
        return Err("Enter a browser task before starting Computer Use".to_owned());
    }
    if request.task.chars().take(MAX_TASK_LENGTH + 1).count() > MAX_TASK_LENGTH {
        return Err(format!(
            "Browser tasks are limited to {MAX_TASK_LENGTH} characters"
        ));
    }
    if !supported_model(&request.model) {
        return Err("Unsupported Gemini Computer Use model".to_owned());
    }
    let initial_url = reqwest::Url::parse(&request.initial_url)
        .map_err(|_| "Initial URL must be an absolute HTTP or HTTPS URL".to_owned())?;
    if !matches!(initial_url.scheme(), "http" | "https")
        || initial_url.host().is_none()
        || !initial_url.username().is_empty()
        || initial_url.password().is_some()
    {
        return Err("Initial URL must be an absolute HTTP or HTTPS URL".to_owned());
    }
    if !request.cloud_consent {
        return Err(
            "Computer Use requires explicit consent to send the task and browser screenshots to Gemini"
                .to_owned(),
        );
    }
    Ok(())
}

#[cfg(debug_assertions)]
fn python_target(source_worker: &Path) -> Option<WorkerTarget> {
    if !source_worker.is_file() {
        return None;
    }
    let root = source_worker.parent()?;
    let virtual_environment = root.join(".venv/Scripts/python.exe");
    let binary = virtual_environment
        .is_file()
        .then_some(virtual_environment)
        .or_else(|| executable_on_path(&["python.exe", "python3.exe", "python"]))?;
    Some(WorkerTarget::Python {
        binary,
        script: source_worker.to_owned(),
    })
}

impl ComputerUseSupervisor {
    pub fn detect(packaged: PathBuf, staged: PathBuf, _source_worker: PathBuf) -> Self {
        let target = if packaged.is_file() {
            WorkerTarget::Binary(packaged)
        } else if staged.is_file() {
            WorkerTarget::Binary(staged)
        } else {
            #[cfg(debug_assertions)]
            {
                python_target(&_source_worker).unwrap_or(WorkerTarget::Missing)
            }
            #[cfg(not(debug_assertions))]
            {
                WorkerTarget::Missing
            }
        };
        Self {
            target,
            active: Arc::new(Mutex::new(None)),
        }
    }

    pub fn health(&self) -> ComputerUseHealth {
        let credential_configured = credentials::get("gemini").is_some();
        let mut detail = None;
        let ready = match self.target.verify_integrity() {
            Err(error) => {
                detail = Some(error);
                false
            }
            Ok(()) => match self.target.command() {
                Ok(mut command) => {
                    command.arg("--health").stdin(Stdio::null());
                    match run_probe(command, HEALTH_PROBE_TIMEOUT) {
                        Ok(output) if output.status.success() => true,
                        Ok(output) => {
                            detail = Some(
                                String::from_utf8_lossy(&output.stderr)
                                    .lines()
                                    .last()
                                    .unwrap_or("Computer Use worker failed its health check")
                                    .chars()
                                    .take(240)
                                    .collect(),
                            );
                            false
                        }
                        Err(error) => {
                            detail =
                                Some(format!("Could not start the Computer Use worker: {error}"));
                            false
                        }
                    }
                }
                Err(error) => {
                    detail = Some(error);
                    false
                }
            },
        };
        ComputerUseHealth {
            state: if ready { "ready" } else { "unavailable" },
            mode: self.target.mode(),
            browser: "Microsoft Edge",
            credential_configured,
            detail,
        }
    }

    pub fn start(
        &self,
        request: ComputerUseRequest,
        channel: Channel<ComputerUseEvent>,
    ) -> Result<(), String> {
        validate_request(&request)?;
        self.target.verify_integrity()?;
        let credential = credentials::get("gemini")
            .ok_or_else(|| "Add a Gemini API key in Computer Use settings first".to_owned())?;
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Computer Use state is unavailable".to_owned())?;
        if active.is_some() {
            return Err("Another Computer Use task is already running".to_owned());
        }

        let mut command = self.target.command()?;
        command
            .arg("--model")
            .arg(&request.model)
            .arg("--initial-url")
            .arg(&request.initial_url)
            .env("GEMINI_API_KEY", credential)
            .env("LUMEN_COMPUTER_USE_QUERY", request.task.trim())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = crate::child_process::spawn_hidden(&mut command)
            .map_err(|error| format!("Could not start Computer Use: {error}"))?;
        let Some(stdin) = child.stdin.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Computer Use approval input is unavailable".to_owned());
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Computer Use event output is unavailable".to_owned());
        };
        #[cfg(windows)]
        let job = match assign_kill_on_close_job(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };

        let task_id = request.task_id;
        *active = Some(ActiveTask {
            id: task_id,
            child,
            stdin,
            channel: channel.clone(),
            #[cfg(windows)]
            job: job.0 as isize,
        });
        drop(active);

        let active_state = Arc::clone(&self.active);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut terminal = false;
            let mut protocol_error = false;
            loop {
                let line = match next_worker_event_line(&mut reader) {
                    Ok(Some(WorkerEventLine::Line(line))) => line,
                    Ok(Some(WorkerEventLine::Oversized)) => {
                        protocol_error = true;
                        break;
                    }
                    Ok(None) => break,
                    Err(_) => break,
                };
                if line.len() > MAX_WORKER_EVENT_BYTES {
                    protocol_error = true;
                    break;
                }
                let Ok(line) = String::from_utf8(line) else {
                    protocol_error = true;
                    break;
                };
                let Ok(event) = serde_json::from_str::<ComputerUseEvent>(&line) else {
                    continue;
                };
                let event = sanitize_worker_event(event);
                terminal |= event.is_terminal();
                let _ = channel.send(event);
            }
            let finished = active_state.lock().ok().and_then(|mut slot| {
                if slot.as_ref().is_some_and(|task| task.id == task_id) {
                    slot.take()
                } else {
                    None
                }
            });
            let owned_task = finished.is_some();
            drop(finished);
            if !terminal && owned_task {
                let _ = channel.send(ComputerUseEvent::Failed {
                    message: if protocol_error {
                        "The Computer Use worker emitted an invalid or oversized event".to_owned()
                    } else {
                        "The Computer Use worker stopped unexpectedly".to_owned()
                    },
                    code: if protocol_error {
                        "worker_protocol".to_owned()
                    } else {
                        "worker_stopped".to_owned()
                    },
                });
            }
        });
        Ok(())
    }

    pub fn respond(&self, task_id: u64, approval_id: &str, approved: bool) -> Result<(), String> {
        if approval_id.is_empty()
            || approval_id.len() > 128
            || !approval_id
                .chars()
                .all(|value| value.is_ascii_alphanumeric())
        {
            return Err("Invalid Computer Use approval identifier".to_owned());
        }
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Computer Use state is unavailable".to_owned())?;
        let task = active
            .as_mut()
            .filter(|task| task.id == task_id)
            .ok_or_else(|| "The Computer Use task is no longer active".to_owned())?;
        serde_json::to_writer(
            &mut task.stdin,
            &serde_json::json!({
                "type": "approval",
                "approvalId": approval_id,
                "approved": approved,
            }),
        )
        .map_err(|error| error.to_string())?;
        task.stdin
            .write_all(b"\n")
            .and_then(|_| task.stdin.flush())
            .map_err(|error| format!("Could not answer the Computer Use approval: {error}"))
    }

    pub fn cancel(&self, task_id: Option<u64>) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Computer Use state is unavailable".to_owned())?;
        if task_id
            .is_some_and(|requested_id| active.as_ref().is_some_and(|task| task.id != requested_id))
        {
            return Err("The requested Computer Use task is not active".to_owned());
        }
        let Some(mut task) = active.take() else {
            return Ok(());
        };
        drop(active);
        let _ = task.stdin.write_all(b"{\"type\":\"cancel\"}\n");
        let _ = task.stdin.flush();
        let _ = task.channel.send(ComputerUseEvent::Cancelled);
        drop(task);
        Ok(())
    }
}

#[tauri::command]
pub async fn computer_use_health(
    supervisor: State<'_, ComputerUseSupervisor>,
) -> Result<ComputerUseHealth, String> {
    let supervisor = supervisor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || supervisor.health())
        .await
        .map_err(|error| format!("Could not join the Computer Use health probe: {error}"))
}

#[tauri::command]
pub fn start_computer_use(
    request: ComputerUseRequest,
    on_event: Channel<ComputerUseEvent>,
    supervisor: State<'_, ComputerUseSupervisor>,
    consent: State<'_, PersistedConsent>,
) -> Result<(), String> {
    if request.cloud_consent && !consent.computer_use_granted() {
        return Err(
            "Computer Use consent is not recorded in the device settings; review consent again"
                .to_owned(),
        );
    }
    supervisor.inner().start(request, on_event)
}

#[tauri::command]
pub fn respond_computer_use_approval(
    task_id: u64,
    approval_id: String,
    approved: bool,
    supervisor: State<'_, ComputerUseSupervisor>,
) -> Result<(), String> {
    supervisor.inner().respond(task_id, &approval_id, approved)
}

#[tauri::command]
pub fn cancel_computer_use(
    task_id: Option<u64>,
    supervisor: State<'_, ComputerUseSupervisor>,
) -> Result<(), String> {
    supervisor.inner().cancel(task_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::Cursor,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn request() -> ComputerUseRequest {
        ComputerUseRequest {
            task_id: 1,
            task: "Find the Lumen repository".to_owned(),
            model: "gemini-3.6-flash".to_owned(),
            initial_url: "https://www.google.com".to_owned(),
            cloud_consent: true,
        }
    }

    #[test]
    fn request_requires_explicit_cloud_consent() {
        let mut value = request();
        value.cloud_consent = false;
        assert!(
            validate_request(&value)
                .unwrap_err()
                .contains("explicit consent")
        );
    }

    #[test]
    fn request_rejects_non_web_initial_urls() {
        let mut value = request();
        value.initial_url = "file:///C:/Secrets".to_owned();
        assert!(validate_request(&value).is_err());
    }

    #[test]
    fn request_rejects_credentials_in_initial_url() {
        let mut value = request();
        value.initial_url = "https://user:secret@example.com".to_owned();
        assert!(validate_request(&value).is_err());
    }

    #[test]
    fn request_limits_unicode_code_points_not_utf8_bytes() {
        let mut value = request();
        value.task = "🧪".repeat(MAX_TASK_LENGTH);
        assert!(validate_request(&value).is_ok());

        value.task.push('🧪');
        assert!(validate_request(&value).unwrap_err().contains("limited to"));
    }

    #[test]
    fn worker_events_parse_camel_case_approval_fields() {
        let event: ComputerUseEvent = serde_json::from_str(
            r#"{"type":"approvalRequired","approvalId":"abc123","explanation":"Confirm"}"#,
        )
        .unwrap();
        assert!(matches!(
            event,
            ComputerUseEvent::ApprovalRequired { approval_id, .. } if approval_id == "abc123"
        ));
    }

    #[test]
    fn worker_protocol_rejects_an_oversized_line_without_buffering_it() {
        let mut stream = vec![b'x'; MAX_WORKER_EVENT_LINE_BYTES + 1];
        stream.push(b'\n');
        let mut reader = Cursor::new(stream);
        assert!(matches!(
            next_worker_event_line(&mut reader).unwrap(),
            Some(WorkerEventLine::Oversized)
        ));
    }

    #[test]
    fn worker_failures_are_sanitized_and_bounded_before_delivery() {
        let event = sanitize_worker_event(ComputerUseEvent::Failed {
            message: format!("unsafe\u{0007}{}", "x".repeat(MAX_WORKER_FAILURE_CHARS + 1)),
            code: "provider\nerror".repeat(MAX_WORKER_CODE_CHARS),
        });
        let ComputerUseEvent::Failed { message, code } = event else {
            panic!("failed events remain failed events");
        };
        assert!(message.chars().count() <= MAX_WORKER_FAILURE_CHARS);
        assert!(code.chars().count() <= MAX_WORKER_CODE_CHARS);
        assert!(!message.chars().any(char::is_control));
        assert!(!code.chars().any(char::is_control));
    }

    #[test]
    fn worker_integrity_rejects_tampering() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "lumen-computer-use-integrity-{}-{unique}.bin",
            std::process::id()
        ));
        fs::write(&path, b"trusted-worker").unwrap();
        let expected = sha256_file_bounded(&path).unwrap();
        assert!(verify_worker_binary(&path, &expected).is_ok());

        fs::write(&path, b"tampered-worker").unwrap();
        assert!(
            verify_worker_binary(&path, &expected)
                .unwrap_err()
                .contains("failed its integrity check")
        );
        fs::remove_file(path).unwrap();
    }
}
