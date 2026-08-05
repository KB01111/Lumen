use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};

use crate::gateway::{credentials, supervisor::assign_kill_on_close_job};

const MAX_TASK_LENGTH: usize = 4_000;
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
    Python { binary: PathBuf, script: PathBuf },
    Missing,
}

impl WorkerTarget {
    fn mode(&self) -> &'static str {
        match self {
            Self::Binary(_) => "packaged",
            Self::Python { .. } => "python",
            Self::Missing => "missing",
        }
    }

    fn command(&self) -> Result<Command, String> {
        match self {
            Self::Binary(binary) => Ok(Command::new(binary)),
            Self::Python { binary, script } => {
                let mut command = Command::new(binary);
                command.arg(script);
                Ok(command)
            }
            Self::Missing => Err("The Computer Use worker is not installed".to_owned()),
        }
    }
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

pub struct ComputerUseSupervisor {
    target: WorkerTarget,
    active: Arc<Mutex<Option<ActiveTask>>>,
}

fn executable_on_path(names: &[&str]) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|candidate| candidate.is_file())
}

fn supported_model(model: &str) -> bool {
    SUPPORTED_MODELS.contains(&model)
}

fn validate_request(request: &ComputerUseRequest) -> Result<(), String> {
    if request.task.trim().is_empty() {
        return Err("Enter a browser task before starting Computer Use".to_owned());
    }
    if request.task.len() > MAX_TASK_LENGTH {
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
    pub fn detect(packaged: PathBuf, staged: PathBuf, source_worker: PathBuf) -> Self {
        let target = if packaged.is_file() {
            WorkerTarget::Binary(packaged)
        } else if staged.is_file() {
            WorkerTarget::Binary(staged)
        } else {
            python_target(&source_worker).unwrap_or(WorkerTarget::Missing)
        };
        Self {
            target,
            active: Arc::new(Mutex::new(None)),
        }
    }

    pub fn health(&self) -> ComputerUseHealth {
        let credential_configured = credentials::get("gemini").is_some();
        let mut detail = None;
        let ready = match self.target.command() {
            Ok(mut command) => {
                command.arg("--health").stdin(Stdio::null());
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x0800_0000);
                }
                match command.output() {
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
                        detail = Some(format!("Could not start the Computer Use worker: {error}"));
                        false
                    }
                }
            }
            Err(error) => {
                detail = Some(error);
                false
            }
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
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command
            .spawn()
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
            let reader = BufReader::new(stdout);
            let mut terminal = false;
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let Ok(event) = serde_json::from_str::<ComputerUseEvent>(&line) else {
                    continue;
                };
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
                    message: "The Computer Use worker stopped unexpectedly".to_owned(),
                    code: "worker_stopped".to_owned(),
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

    pub fn cancel(&self, task_id: u64) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Computer Use state is unavailable".to_owned())?;
        if active.as_ref().is_some_and(|task| task.id != task_id) {
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
pub fn computer_use_health(supervisor: State<'_, ComputerUseSupervisor>) -> ComputerUseHealth {
    supervisor.inner().health()
}

#[tauri::command]
pub fn start_computer_use(
    request: ComputerUseRequest,
    on_event: Channel<ComputerUseEvent>,
    supervisor: State<'_, ComputerUseSupervisor>,
) -> Result<(), String> {
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
    task_id: u64,
    supervisor: State<'_, ComputerUseSupervisor>,
) -> Result<(), String> {
    supervisor.inner().cancel(task_id)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
