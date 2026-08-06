use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::Engine as _;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{Manager, State};

use crate::{
    consent::PersistedConsent,
    search::{EnrichmentArtifact, EnrichmentJobRecord, EnrichmentLease, IndexRuntime},
};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const READINESS_TIMEOUT: Duration = Duration::from_millis(200);
const PROCESSING_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const PROCESSING_TIMEOUT: Duration = Duration::from_secs(45);
const INVALIDATION_POLL_INTERVAL: Duration = Duration::from_millis(150);
const MINIMUM_WAKE_DELAY: Duration = Duration::from_millis(250);
const MAXIMUM_WAKE_DELAY: Duration = Duration::from_secs(300);
const MAX_JOBS_PER_PASS: usize = 4;
const MAX_OCR_INPUT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_TRANSCRIPTION_INPUT_BYTES: u64 = 25 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_ARTIFACT_TEXT_BYTES: usize = 1024 * 1024;
const MAX_LOG_DETAIL_BYTES: u64 = 16 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentHealth {
    pub state: &'static str,
    pub processor_state: &'static str,
    pub coordinator_state: &'static str,
    pub paused: bool,
    pub control_port: u16,
    pub actor_port: u16,
    pub detail: Option<String>,
    pub processor_detail: Option<String>,
    pub coordinator_detail: Option<String>,
}

#[derive(Debug)]
struct ProcessingFailure {
    retryable: bool,
    message: String,
}

impl ProcessingFailure {
    fn permanent(message: impl Into<String>) -> Self {
        Self {
            retryable: false,
            message: message.into(),
        }
    }

    fn retryable(message: impl Into<String>) -> Self {
        Self {
            retryable: true,
            message: message.into(),
        }
    }
}

struct ManagedProcess {
    child: Child,
    #[cfg(windows)]
    job: isize,
}

impl Drop for ManagedProcess {
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

struct EnrichmentProcesses {
    worker: ManagedProcess,
    engine: ManagedProcess,
}

impl EnrichmentProcesses {
    fn is_running(&mut self) -> bool {
        self.worker.child.try_wait().ok() == Some(None)
            && self.engine.child.try_wait().ok() == Some(None)
    }
}

pub struct EnrichmentSupervisor {
    binary: PathBuf,
    engine_binary: PathBuf,
    runtime_directory: PathBuf,
    control_port: u16,
    actor_port: u16,
    engine_port: u16,
    engine_peer_port: u16,
    engine_metrics_port: u16,
    bearer: String,
    paused: AtomicBool,
    processing: AtomicBool,
    wake_scheduled: AtomicBool,
    process: Mutex<Option<EnrichmentProcesses>>,
    detail: Mutex<Option<String>>,
    coordinator_detail: Mutex<Option<String>>,
}

struct ProcessingGuard<'a>(&'a AtomicBool);

impl Drop for ProcessingGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn allocate_ports() -> Result<[u16; 5], String> {
    let listeners = (0..5)
        .map(|_| TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let ports = listeners
        .iter()
        .map(|listener| listener.local_addr().map(|address| address.port()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    ports
        .try_into()
        .map_err(|_| "Could not allocate all enrichment ports".to_owned())
}

fn tcp_ready(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), READINESS_TIMEOUT).is_ok()
}

fn worker_ready(port: u16, bearer: &str) -> bool {
    let Ok(mut stream) =
        TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), READINESS_TIMEOUT)
    else {
        return false;
    };
    if stream.set_read_timeout(Some(READINESS_TIMEOUT)).is_err()
        || stream.set_write_timeout(Some(READINESS_TIMEOUT)).is_err()
    {
        return false;
    }
    let request = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {bearer}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = [0_u8; 512];
    let Ok(read) = stream.read(&mut response) else {
        return false;
    };
    String::from_utf8_lossy(&response[..read])
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .is_some_and(|status| status == "200")
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
    let text = String::from_utf8_lossy(&bytes).trim().to_owned();
    (!text.is_empty()).then_some(text)
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_secs()).ok())
        .unwrap_or_default()
}

fn image_mime(path: &Path, bytes: &[u8]) -> Result<&'static str, ProcessingFailure> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok("image/png"),
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Ok("image/jpeg"),
        "gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => Ok("image/gif"),
        "webp" if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" => {
            Ok("image/webp")
        }
        _ => Err(ProcessingFailure::permanent(
            "The OCR input has an unsupported or mismatched image type",
        )),
    }
}

fn audio_mime(path: &Path, bytes: &[u8]) -> Result<&'static str, ProcessingFailure> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "mp3" | "mpga" | "mpeg"
            if bytes.starts_with(b"ID3")
                || (bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0) =>
        {
            Ok("audio/mpeg")
        }
        "wav" if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE" => {
            Ok("audio/wav")
        }
        "m4a" | "mp4" if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" => Ok("audio/mp4"),
        "webm" if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) => Ok("audio/webm"),
        _ => Err(ProcessingFailure::permanent(
            "The transcription input has an unsupported or mismatched audio type",
        )),
    }
}

fn retryable_provider_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 408 | 425 | 429 | 500 | 502 | 503 | 504)
}

fn response_output_text(value: &serde_json::Value) -> Result<String, ProcessingFailure> {
    let mut text = value
        .get("output_text")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_owned();
    if text.is_empty()
        && let Some(output) = value.get("output").and_then(serde_json::Value::as_array)
    {
        for item in output {
            if let Some(content) = item.get("content").and_then(serde_json::Value::as_array) {
                for part in content {
                    if matches!(
                        part.get("type").and_then(serde_json::Value::as_str),
                        Some("output_text" | "text")
                    ) && let Some(fragment) =
                        part.get("text").and_then(serde_json::Value::as_str)
                    {
                        if !text.is_empty() {
                            text.push('\n');
                        }
                        text.push_str(fragment);
                        if text.len() > MAX_ARTIFACT_TEXT_BYTES {
                            return Err(ProcessingFailure::permanent(
                                "The OCR provider returned more than 1 MiB of text",
                            ));
                        }
                    }
                }
            }
        }
    }
    let text = text.trim().to_owned();
    if text.is_empty() || text.len() > MAX_ARTIFACT_TEXT_BYTES {
        return Err(ProcessingFailure::permanent(
            "The OCR provider returned invalid or oversized text",
        ));
    }
    Ok(text)
}

async fn ocr_request(
    client: &reqwest::Client,
    endpoint: &str,
    bearer: &str,
    lease: &EnrichmentLease,
    bytes: &[u8],
) -> Result<EnrichmentArtifact, ProcessingFailure> {
    let mime = image_mime(&lease.path, bytes)?;
    let image_url = format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    let response = client
        .post(format!("{endpoint}/v1/responses"))
        .bearer_auth(bearer)
        .json(&serde_json::json!({
            "model": "lumen.vision.cloud",
            "input": [{
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Extract all visible text faithfully. Return only the extracted text."
                    },
                    {"type": "input_image", "image_url": image_url}
                ]
            }],
            "max_output_tokens": 4_000
        }))
        .send()
        .await
        .map_err(|error| ProcessingFailure::retryable(format!("OCR request failed: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        let retryable = retryable_provider_status(status);
        return Err(ProcessingFailure {
            retryable,
            message: format!("OCR provider returned HTTP {status}"),
        });
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            ProcessingFailure::retryable(format!("OCR response failed: {error}"))
        })?;
        if body.len().saturating_add(chunk.len()) > MAX_PROVIDER_RESPONSE_BYTES {
            return Err(ProcessingFailure::permanent(
                "The OCR provider response exceeded 1 MiB",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let value = serde_json::from_slice::<serde_json::Value>(&body)
        .map_err(|error| ProcessingFailure::permanent(format!("Invalid OCR response: {error}")))?;
    Ok(EnrichmentArtifact {
        provider: "openai".to_owned(),
        model: "lumen.vision.cloud".to_owned(),
        text: response_output_text(&value)?,
        page: None,
        time_start_ms: None,
        time_end_ms: None,
    })
}

async fn transcription_request(
    client: &reqwest::Client,
    endpoint: &str,
    bearer: &str,
    lease: &EnrichmentLease,
    bytes: Vec<u8>,
) -> Result<EnrichmentArtifact, ProcessingFailure> {
    let mime = audio_mime(&lease.path, &bytes)?;
    let filename = lease
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("audio")
        .to_owned();
    let file = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(mime)
        .map_err(|error| ProcessingFailure::permanent(format!("Invalid audio type: {error}")))?;
    let form = reqwest::multipart::Form::new()
        .text("model", "gpt-4o-mini-transcribe")
        .part("file", file);
    let response = client
        .post(format!("{endpoint}/v1/audio/transcriptions"))
        .bearer_auth(bearer)
        .multipart(form)
        .send()
        .await
        .map_err(|error| {
            ProcessingFailure::retryable(format!("Transcription request failed: {error}"))
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(ProcessingFailure {
            retryable: retryable_provider_status(status),
            message: format!("Transcription provider returned HTTP {status}"),
        });
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            ProcessingFailure::retryable(format!("Transcription response failed: {error}"))
        })?;
        if body.len().saturating_add(chunk.len()) > MAX_PROVIDER_RESPONSE_BYTES {
            return Err(ProcessingFailure::permanent(
                "The transcription provider response exceeded 1 MiB",
            ));
        }
        body.extend_from_slice(&chunk);
    }
    let value = serde_json::from_slice::<serde_json::Value>(&body).map_err(|error| {
        ProcessingFailure::permanent(format!("Invalid transcription response: {error}"))
    })?;
    let text = value
        .get("text")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_owned();
    if text.is_empty() || text.len() > MAX_ARTIFACT_TEXT_BYTES {
        return Err(ProcessingFailure::permanent(
            "The transcription provider returned invalid or oversized text",
        ));
    }
    Ok(EnrichmentArtifact {
        provider: "openai".to_owned(),
        model: "gpt-4o-mini-transcribe".to_owned(),
        text,
        page: None,
        time_start_ms: None,
        time_end_ms: None,
    })
}

async fn consent_granted(consent: PersistedConsent) -> bool {
    tauri::async_runtime::spawn_blocking(move || consent.answer_granted())
        .await
        .unwrap_or(false)
}

async fn wait_for_invalidation(
    runtime: IndexRuntime,
    consent: PersistedConsent,
    paused: &AtomicBool,
    generation: u64,
) {
    loop {
        tokio::time::sleep(INVALIDATION_POLL_INTERVAL).await;
        if paused.load(Ordering::Acquire)
            || runtime.generation() != generation
            || !consent_granted(consent.clone()).await
        {
            return;
        }
    }
}

impl EnrichmentSupervisor {
    pub fn new(
        binary: PathBuf,
        engine_binary: PathBuf,
        runtime_directory: PathBuf,
    ) -> Result<Self, String> {
        fs::create_dir_all(&runtime_directory).map_err(|error| error.to_string())?;
        let [
            control_port,
            actor_port,
            engine_port,
            engine_peer_port,
            engine_metrics_port,
        ] = allocate_ports()?;
        Ok(Self {
            binary,
            engine_binary,
            runtime_directory,
            control_port,
            actor_port,
            engine_port,
            engine_peer_port,
            engine_metrics_port,
            bearer: format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            ),
            paused: AtomicBool::new(false),
            processing: AtomicBool::new(false),
            wake_scheduled: AtomicBool::new(false),
            process: Mutex::new(None),
            detail: Mutex::new(None),
            coordinator_detail: Mutex::new(None),
        })
    }

    pub fn start(&self) -> Result<(), String> {
        let result = self.start_inner();
        if let Err(error) = &result {
            *self
                .detail
                .lock()
                .unwrap_or_else(|value| value.into_inner()) = Some(error.clone());
        }
        result
    }

    fn start_inner(&self) -> Result<(), String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "Worker state is poisoned")?;
        if process
            .as_mut()
            .is_some_and(EnrichmentProcesses::is_running)
            && tcp_ready(self.engine_port)
            && tcp_ready(self.actor_port)
            && worker_ready(self.control_port, &self.bearer)
        {
            return Ok(());
        }
        *process = None;
        if !self.binary.is_file() {
            let message = "Rivet enrichment worker is not staged".to_owned();
            *self
                .coordinator_detail
                .lock()
                .unwrap_or_else(|error| error.into_inner()) = Some(message.clone());
            return Err(message);
        }
        if !self.engine_binary.is_file() {
            return Err("Rivet engine sidecar is not staged".to_owned());
        }
        let engine_log_path = self.runtime_directory.join("rivet-engine.log");
        let engine_log = fs::File::create(&engine_log_path).map_err(|error| error.to_string())?;
        let engine_error_log = engine_log.try_clone().map_err(|error| error.to_string())?;
        let engine_db = self.runtime_directory.join("rivet-engine-db");
        fs::create_dir_all(&engine_db).map_err(|error| error.to_string())?;
        let mut engine_command = Command::new(&self.engine_binary);
        engine_command
            .arg("start")
            .current_dir(&self.runtime_directory)
            .env("RIVET__GUARD__HOST", "127.0.0.1")
            .env("RIVET__GUARD__PORT", self.engine_port.to_string())
            .env("RIVET__API_PEER__HOST", "127.0.0.1")
            .env("RIVET__API_PEER__PORT", self.engine_peer_port.to_string())
            .env("RIVET__METRICS__HOST", "127.0.0.1")
            .env("RIVET__METRICS__PORT", self.engine_metrics_port.to_string())
            .env("RIVET__FILE_SYSTEM__PATH", &engine_db)
            .stdin(Stdio::null())
            .stdout(Stdio::from(engine_log))
            .stderr(Stdio::from(engine_error_log));
        let mut engine_child = crate::child_process::spawn_hidden(&mut engine_command)
            .map_err(|error| format!("Could not start the Rivet engine: {error}"))?;
        #[cfg(windows)]
        let engine_job = match super::supervisor::assign_kill_on_close_job(&engine_child) {
            Ok(job) => job,
            Err(error) => {
                let _ = engine_child.kill();
                let _ = engine_child.wait();
                return Err(error);
            }
        };
        let mut engine = ManagedProcess {
            child: engine_child,
            #[cfg(windows)]
            job: engine_job.0 as isize,
        };

        let deadline = std::time::Instant::now() + STARTUP_TIMEOUT;
        while !tcp_ready(self.engine_port) {
            if let Some(status) = engine.child.try_wait().map_err(|error| error.to_string())? {
                return Err(format!(
                    "Rivet 2.3.10 Windows engine exited before readiness ({status})"
                ));
            }
            if std::time::Instant::now() >= deadline {
                return Err(read_log_tail(&engine_log_path)
                    .unwrap_or_else(|| "Rivet engine did not become ready".to_owned()));
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        let mut command = Command::new(&self.binary);
        let log_path = self.runtime_directory.join("rivet-worker.log");
        let log = fs::File::create(&log_path).map_err(|error| error.to_string())?;
        let error_log = log.try_clone().map_err(|error| error.to_string())?;
        command
            .current_dir(&self.runtime_directory)
            .env("LUMEN_WORKER_CONTROL_PORT", self.control_port.to_string())
            .env("LUMEN_RIVET_PORT", self.actor_port.to_string())
            .env("LUMEN_RIVET_ENGINE_PORT", self.engine_port.to_string())
            .env("LUMEN_WORKER_BEARER", &self.bearer)
            .env("RIVET_PORT", self.actor_port.to_string())
            .env("RIVETKIT_RUNTIME", "wasm")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(error_log));
        let mut child = crate::child_process::spawn_hidden(&mut command)
            .map_err(|error| format!("Could not start the Rivet worker: {error}"))?;
        #[cfg(windows)]
        let job = match super::supervisor::assign_kill_on_close_job(&child) {
            Ok(job) => job,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        let mut candidates = EnrichmentProcesses {
            worker: ManagedProcess {
                child,
                #[cfg(windows)]
                job: job.0 as isize,
            },
            engine,
        };
        let deadline = std::time::Instant::now() + STARTUP_TIMEOUT;
        while !(candidates.is_running()
            && tcp_ready(self.actor_port)
            && worker_ready(self.control_port, &self.bearer))
        {
            if !candidates.is_running() {
                return Err("The Rivet enrichment processes exited before readiness".to_owned());
            }
            if std::time::Instant::now() >= deadline {
                return Err(read_log_tail(&log_path)
                    .unwrap_or_else(|| "Rivet enrichment worker did not become ready".to_owned()));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        *process = Some(candidates);
        *self
            .coordinator_detail
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
        Ok(())
    }

    pub fn restart(&self) -> Result<(), String> {
        *self
            .process
            .lock()
            .map_err(|_| "Worker state is poisoned")? = None;
        self.start()
    }

    fn endpoint(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.control_port)
    }

    fn coordinator_ready(&self) -> bool {
        let mut process = self
            .process
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        process
            .as_mut()
            .is_some_and(EnrichmentProcesses::is_running)
            && tcp_ready(self.engine_port)
            && tcp_ready(self.actor_port)
            && worker_ready(self.control_port, &self.bearer)
    }

    pub async fn sync_jobs(&self, jobs: &[EnrichmentJobRecord]) {
        if self.paused.load(Ordering::Acquire) || !self.coordinator_ready() {
            return;
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();
        for job in jobs {
            let response = client
                .post(self.endpoint("/jobs"))
                .bearer_auth(&self.bearer)
                .json(job)
                .send()
                .await
                .and_then(reqwest::Response::error_for_status);
            if let Err(error) = response {
                *self
                    .coordinator_detail
                    .lock()
                    .unwrap_or_else(|value| value.into_inner()) =
                    Some(format!("Rivet queue sync is waiting: {error}"));
                break;
            }
        }
    }

    async fn complete_remote_job(
        &self,
        client: &reqwest::Client,
        idempotency_key: &str,
    ) -> Result<(), String> {
        let mut endpoint = reqwest::Url::parse(&self.endpoint("/jobs/"))
            .map_err(|error| format!("Could not build the Rivet completion URL: {error}"))?;
        endpoint
            .path_segments_mut()
            .map_err(|_| "Could not encode the Rivet completion URL".to_owned())?
            .pop_if_empty()
            .push(idempotency_key)
            .push("complete");
        client
            .post(endpoint)
            .bearer_auth(&self.bearer)
            .send()
            .await
            .map_err(|error| format!("Could not report Rivet completion: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Rivet rejected enrichment completion: {error}"))?;
        Ok(())
    }

    fn acquire_processing(&self) -> Option<ProcessingGuard<'_>> {
        self.processing
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
            .then_some(ProcessingGuard(&self.processing))
    }

    fn arm_wake(&self, app: tauri::AppHandle, wake_at: i64) {
        if self
            .wake_scheduled
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }
        let seconds = wake_at.saturating_sub(unix_timestamp()).max(0) as u64;
        let delay = Duration::from_secs(seconds)
            .max(MINIMUM_WAKE_DELAY)
            .min(MAXIMUM_WAKE_DELAY);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(delay).await;
            app.state::<EnrichmentSupervisor>()
                .wake_scheduled
                .store(false, Ordering::Release);
            schedule_enrichment_drain(app);
        });
    }

    pub async fn process_pending(
        &self,
        runtime: IndexRuntime,
        consent: PersistedConsent,
        gateway_endpoint: (String, String),
    ) {
        let Some(_processing) = self.acquire_processing() else {
            return;
        };
        let client = match reqwest::Client::builder()
            .connect_timeout(PROCESSING_CONNECT_TIMEOUT)
            .timeout(PROCESSING_TIMEOUT)
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                *self
                    .detail
                    .lock()
                    .unwrap_or_else(|value| value.into_inner()) =
                    Some(format!("Could not create the enrichment client: {error}"));
                return;
            }
        };
        for _ in 0..MAX_JOBS_PER_PASS {
            if self.paused.load(Ordering::Acquire) || !consent_granted(consent.clone()).await {
                break;
            }
            let lease_runtime = runtime.clone();
            let lease = match tauri::async_runtime::spawn_blocking(move || {
                lease_runtime.lease_enrichment(true, unix_timestamp())
            })
            .await
            {
                Ok(Ok(Some(lease))) => lease,
                Ok(Ok(None)) => break,
                Ok(Err(error)) => {
                    *self
                        .detail
                        .lock()
                        .unwrap_or_else(|value| value.into_inner()) = Some(error.message);
                    break;
                }
                Err(error) => {
                    *self
                        .detail
                        .lock()
                        .unwrap_or_else(|value| value.into_inner()) = Some(format!(
                        "Could not join the enrichment lease worker: {error}"
                    ));
                    break;
                }
            };

            let supported_route = matches!(
                (lease.kind.as_str(), lease.route.as_str()),
                ("ocr", "lumen.vision.cloud") | ("transcription", "lumen.audio.cloud")
            );
            let result = if !supported_route {
                Err(ProcessingFailure::permanent(
                    "The enrichment job requested an unsupported kind or route",
                ))
            } else {
                let input_runtime = runtime.clone();
                let input_lease = lease.clone();
                let max_input_bytes = if lease.kind == "ocr" {
                    MAX_OCR_INPUT_BYTES
                } else {
                    MAX_TRANSCRIPTION_INPUT_BYTES
                };
                match tauri::async_runtime::spawn_blocking(move || {
                    input_runtime.load_enrichment_input(&input_lease, max_input_bytes)
                })
                .await
                {
                    Ok(Ok(bytes)) => {
                        if self.paused.load(Ordering::Acquire) {
                            Err(ProcessingFailure::retryable(
                                "Cloud enrichment was paused before upload",
                            ))
                        } else if !consent_granted(consent.clone()).await {
                            Err(ProcessingFailure::retryable(
                                "Cloud enrichment consent was revoked before upload",
                            ))
                        } else {
                            let request = async {
                                if lease.kind == "ocr" {
                                    ocr_request(
                                        &client,
                                        &gateway_endpoint.0,
                                        &gateway_endpoint.1,
                                        &lease,
                                        &bytes,
                                    )
                                    .await
                                } else {
                                    transcription_request(
                                        &client,
                                        &gateway_endpoint.0,
                                        &gateway_endpoint.1,
                                        &lease,
                                        bytes,
                                    )
                                    .await
                                }
                            };
                            tokio::select! {
                                result = request => result,
                                () = wait_for_invalidation(
                                    runtime.clone(),
                                    consent.clone(),
                                    &self.paused,
                                    lease.generation,
                                ) => Err(ProcessingFailure::retryable(
                                    "Cloud enrichment was cancelled because it was paused, consent was revoked, or the index changed",
                                )),
                            }
                        }
                    }
                    Ok(Err(error)) => Err(ProcessingFailure::permanent(error.message)),
                    Err(error) => Err(ProcessingFailure::retryable(format!(
                        "Could not join the enrichment input worker: {error}"
                    ))),
                }
            };

            match result {
                Ok(artifact) => {
                    let still_consented = !self.paused.load(Ordering::Acquire)
                        && consent_granted(consent.clone()).await;
                    let apply_runtime = runtime.clone();
                    let apply_lease = lease.clone();
                    let applied = tauri::async_runtime::spawn_blocking(move || {
                        apply_runtime.complete_enrichment(
                            &apply_lease,
                            &artifact,
                            still_consented,
                            unix_timestamp(),
                        )
                    })
                    .await;
                    match applied {
                        Ok(Ok(true)) => {
                            let completion_error = if self.coordinator_ready() {
                                self.complete_remote_job(&client, &lease.idempotency_key)
                                    .await
                                    .err()
                            } else {
                                None
                            };
                            *self
                                .coordinator_detail
                                .lock()
                                .unwrap_or_else(|value| value.into_inner()) = completion_error;
                            *self
                                .detail
                                .lock()
                                .unwrap_or_else(|value| value.into_inner()) = None;
                        }
                        Ok(Ok(false)) => {
                            let retry_runtime = runtime.clone();
                            let retry_lease = lease.clone();
                            let _ = tauri::async_runtime::spawn_blocking(move || {
                                retry_runtime.retry_enrichment(
                                    &retry_lease,
                                    unix_timestamp(),
                                    true,
                                    "The enrichment result was invalidated before apply",
                                )
                            })
                            .await;
                        }
                        Ok(Err(error)) => {
                            let retry_runtime = runtime.clone();
                            let retry_lease = lease.clone();
                            let message = error.message.clone();
                            let _ = tauri::async_runtime::spawn_blocking(move || {
                                retry_runtime.retry_enrichment(
                                    &retry_lease,
                                    unix_timestamp(),
                                    true,
                                    &message,
                                )
                            })
                            .await;
                            *self
                                .detail
                                .lock()
                                .unwrap_or_else(|value| value.into_inner()) = Some(error.message);
                        }
                        Err(error) => {
                            let message =
                                format!("Could not join the enrichment apply worker: {error}");
                            let retry_runtime = runtime.clone();
                            let retry_lease = lease.clone();
                            let retry_message = message.clone();
                            let _ = tauri::async_runtime::spawn_blocking(move || {
                                retry_runtime.retry_enrichment(
                                    &retry_lease,
                                    unix_timestamp(),
                                    true,
                                    &retry_message,
                                )
                            })
                            .await;
                            *self
                                .detail
                                .lock()
                                .unwrap_or_else(|value| value.into_inner()) = Some(message);
                        }
                    }
                }
                Err(failure) => {
                    let retry_runtime = runtime.clone();
                    let retry_lease = lease.clone();
                    let retryable = failure.retryable;
                    let message = failure.message.clone();
                    let _ = tauri::async_runtime::spawn_blocking(move || {
                        retry_runtime.retry_enrichment(
                            &retry_lease,
                            unix_timestamp(),
                            retryable,
                            &message,
                        )
                    })
                    .await;
                    *self
                        .detail
                        .lock()
                        .unwrap_or_else(|value| value.into_inner()) = Some(failure.message);
                    if failure.retryable {
                        break;
                    }
                }
            }
        }
    }

    #[cfg(test)]
    async fn queue_status(&self) -> Result<serde_json::Value, String> {
        if !self.coordinator_ready() {
            return Err(
                "Rivet coordinator status is unavailable; SQLite enrichment processing remains operational"
                    .to_owned(),
            );
        }
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|error| error.to_string())?
            .get(self.endpoint("/jobs"))
            .bearer_auth(&self.bearer)
            .send()
            .await
            .map_err(|error| error.to_string())?
            .error_for_status()
            .map_err(|error| error.to_string())?
            .json()
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn resume(&self) -> Result<(), String> {
        self.paused.store(false, Ordering::Release);
        if !self.coordinator_ready() {
            return Ok(());
        }
        let result = match reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            Ok(client) => client
                .post(self.endpoint("/jobs/resume"))
                .bearer_auth(&self.bearer)
                .send()
                .await
                .map_err(|error| error.to_string())
                .and_then(|response| {
                    response
                        .error_for_status()
                        .map_err(|error| error.to_string())
                })
                .map(|_| ()),
            Err(error) => Err(error.to_string()),
        };
        *self
            .coordinator_detail
            .lock()
            .unwrap_or_else(|value| value.into_inner()) = result.err();
        Ok(())
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::Release);
    }

    pub fn health(&self) -> EnrichmentHealth {
        let ready = self.coordinator_ready();
        if ready {
            *self
                .coordinator_detail
                .lock()
                .unwrap_or_else(|error| error.into_inner()) = None;
        } else {
            let mut detail = self
                .coordinator_detail
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if detail.is_none() {
                *detail = read_log_tail(&self.runtime_directory.join("rivet-worker.log"))
                    .or_else(|| read_log_tail(&self.runtime_directory.join("rivet-engine.log")))
                    .or_else(|| Some("Rivet coordination is unavailable".to_owned()));
            }
        }
        let processor_detail = self
            .detail
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let coordinator_detail = self
            .coordinator_detail
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        EnrichmentHealth {
            state: if ready { "ready" } else { "unavailable" },
            processor_state: "ready",
            coordinator_state: if ready { "ready" } else { "unavailable" },
            paused: self.paused.load(Ordering::Acquire),
            control_port: self.control_port,
            actor_port: self.actor_port,
            detail: if ready {
                processor_detail.clone()
            } else {
                coordinator_detail.clone()
            },
            processor_detail,
            coordinator_detail,
        }
    }
}

pub(crate) fn schedule_enrichment_drain(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let runtime = app.state::<IndexRuntime>().inner().clone();
        let jobs_runtime = runtime.clone();
        let jobs =
            match tauri::async_runtime::spawn_blocking(move || jobs_runtime.pending_enrichment())
                .await
            {
                Ok(Ok(jobs)) => jobs,
                Ok(Err(error)) => {
                    *app.state::<EnrichmentSupervisor>()
                        .detail
                        .lock()
                        .unwrap_or_else(|value| value.into_inner()) = Some(error.message);
                    return;
                }
                Err(error) => {
                    *app.state::<EnrichmentSupervisor>()
                        .detail
                        .lock()
                        .unwrap_or_else(|value| value.into_inner()) = Some(format!(
                        "Could not join the enrichment scheduling worker: {error}"
                    ));
                    return;
                }
            };
        if app.state::<EnrichmentSupervisor>().coordinator_ready() {
            app.state::<EnrichmentSupervisor>().sync_jobs(&jobs).await;
        }
        let consent = app.state::<PersistedConsent>().inner().clone();
        let gateway_endpoint = app.state::<super::GatewaySupervisor>().endpoint(true);
        app.state::<EnrichmentSupervisor>()
            .process_pending(runtime.clone(), consent.clone(), gateway_endpoint)
            .await;

        if app
            .state::<EnrichmentSupervisor>()
            .paused
            .load(Ordering::Acquire)
            || !consent_granted(consent).await
        {
            return;
        }
        let wake_runtime = runtime.clone();
        if let Ok(Ok(Some(wake_at))) = tauri::async_runtime::spawn_blocking(move || {
            wake_runtime.next_enrichment_wake(unix_timestamp())
        })
        .await
        {
            app.state::<EnrichmentSupervisor>()
                .arm_wake(app.clone(), wake_at);
        }
    });
}

#[tauri::command]
pub async fn enrichment_health(app: tauri::AppHandle) -> Result<EnrichmentHealth, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<EnrichmentSupervisor>().health())
        .await
        .map_err(|error| format!("Could not join the enrichment health worker: {error}"))
}

#[tauri::command]
pub async fn enrichment_queue_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let runtime = app.state::<IndexRuntime>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.enrichment_queue_status())
        .await
        .map_err(|error| format!("Could not join the enrichment status worker: {error}"))?
        .map_err(|error| error.message)
}

#[tauri::command]
pub fn pause_enrichment(state: State<'_, EnrichmentSupervisor>) {
    state.inner().pause();
}

#[tauri::command]
pub async fn resume_enrichment(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<EnrichmentSupervisor>().resume().await?;
    schedule_enrichment_drain(app);
    Ok(())
}

#[tauri::command]
pub async fn restart_enrichment(app: tauri::AppHandle) -> Result<(), String> {
    let restart_app = app.clone();
    let coordinator_result = tauri::async_runtime::spawn_blocking(move || {
        restart_app.state::<EnrichmentSupervisor>().restart()
    })
    .await
    .map_err(|error| format!("Could not join the enrichment restart worker: {error}"))
    .and_then(|result| result);
    schedule_enrichment_drain(app);
    coordinator_result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::indexing::IndexRootRequest;
    use std::{collections::HashSet, sync::mpsc, thread, time::Duration};

    fn mock_json_server(
        response: &'static str,
    ) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let (sender, receiver) = mpsc::sync_channel(1);
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4 * 1024];
            loop {
                let read = stream.read(&mut buffer).unwrap();
                request.extend_from_slice(&buffer[..read]);
                let header_end = request.windows(4).position(|value| value == b"\r\n\r\n");
                if let Some(header_end) = header_end {
                    let headers = String::from_utf8_lossy(&request[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.split_once(':').and_then(|(name, value)| {
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse::<usize>().ok())
                                    .flatten()
                            })
                        })
                        .unwrap_or_default();
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }
            sender
                .send(String::from_utf8_lossy(&request).into_owned())
                .unwrap();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        (endpoint, receiver, worker)
    }

    #[test]
    fn worker_ports_are_loopback_selected_and_token_is_not_in_paths() {
        let root = std::env::temp_dir().join(format!("lumen-rivet-{}", uuid::Uuid::new_v4()));
        let supervisor = EnrichmentSupervisor::new(
            root.join("missing.exe"),
            root.join("missing-engine.exe"),
            root.clone(),
        )
        .unwrap();
        assert_eq!(
            HashSet::from([
                supervisor.control_port,
                supervisor.actor_port,
                supervisor.engine_port,
                supervisor.engine_peer_port,
                supervisor.engine_metrics_port,
            ])
            .len(),
            5
        );
        assert!(
            !supervisor
                .runtime_directory
                .to_string_lossy()
                .contains(&supervisor.bearer)
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn enrichment_processing_is_single_flight_and_releases_its_guard() {
        let root = std::env::temp_dir().join(format!("lumen-rivet-{}", uuid::Uuid::new_v4()));
        let supervisor = EnrichmentSupervisor::new(
            root.join("missing.exe"),
            root.join("missing-engine.exe"),
            root.clone(),
        )
        .unwrap();

        let first = supervisor.acquire_processing().unwrap();
        assert!(supervisor.acquire_processing().is_none());
        drop(first);
        assert!(supervisor.acquire_processing().is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sqlite_provider_drain_operates_without_the_rivet_coordinator() {
        let root = std::env::temp_dir().join(format!("lumen-degraded-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let image_path = root.join("scan.png");
        let mut image = b"\x89PNG\r\n\x1a\n".to_vec();
        image.extend_from_slice(b"mock image");
        fs::write(&image_path, image).unwrap();
        let settings_path = root.join("lumen.settings.json");
        fs::write(
            &settings_path,
            r#"{"management":{"ai":{"cloudAnswerConsent":true}}}"#,
        )
        .unwrap();
        let runtime = IndexRuntime::open(&root.join("index.sqlite")).unwrap();
        runtime
            .synchronize_for_test(vec![IndexRootRequest {
                path: root.to_string_lossy().into_owned(),
                cloud_enrichment: true,
                exclusions: vec!["index.sqlite*".to_owned(), "lumen.settings.json".to_owned()],
                include_hidden: false,
                max_file_size_mb: 16,
            }])
            .unwrap();
        let supervisor = EnrichmentSupervisor::new(
            root.join("missing-worker.exe"),
            root.join("missing-engine.exe"),
            root.join("coordinator"),
        )
        .unwrap();
        let (endpoint, request, worker) = mock_json_server(r#"{"output_text":"degraded OCR"}"#);

        tauri::async_runtime::block_on(supervisor.process_pending(
            runtime.clone(),
            PersistedConsent::new(settings_path),
            (endpoint, "loopback-bearer".to_owned()),
        ));

        assert!(request.recv().unwrap().starts_with("POST /v1/responses"));
        worker.join().unwrap();
        let hits = runtime.answer_context("degraded", 10).unwrap();
        assert_eq!(hits.len(), 1);
        let queue = runtime.enrichment_queue_status().unwrap();
        assert_eq!(queue[0]["status"], "completed");
        assert_eq!(queue[0]["count"], 1);
        let health = supervisor.health();
        assert_eq!(health.state, "unavailable");
        assert_eq!(health.coordinator_state, "unavailable");
        assert_eq!(health.processor_state, "ready");
        assert!(health.coordinator_detail.is_some());
        supervisor.pause();
        assert!(supervisor.health().paused);
        tauri::async_runtime::block_on(supervisor.resume()).unwrap();
        assert!(!supervisor.health().paused);
        drop(runtime);
        drop(supervisor);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ocr_uses_the_bounded_enrichment_responses_contract() {
        let (endpoint, request, worker) = mock_json_server(r#"{"output_text":"mock OCR text"}"#);
        let lease = EnrichmentLease {
            idempotency_key: "file:hash:ocr:route".to_owned(),
            file_id: "file".to_owned(),
            root_path: PathBuf::from("C:\\root"),
            path: PathBuf::from("scan.png"),
            content_hash: "hash".to_owned(),
            kind: "ocr".to_owned(),
            route: "lumen.vision.cloud".to_owned(),
            attempt: 1,
            lease_token: "lease".to_owned(),
            lease_until: 1_000,
            generation: 1,
        };
        let mut image = b"\x89PNG\r\n\x1a\n".to_vec();
        image.extend_from_slice(b"mock");
        let client = reqwest::Client::builder().build().unwrap();
        let artifact = tauri::async_runtime::block_on(ocr_request(
            &client,
            &endpoint,
            "loopback-bearer",
            &lease,
            &image,
        ))
        .unwrap();

        assert_eq!(artifact.text, "mock OCR text");
        let request = request.recv().unwrap();
        assert!(request.starts_with("POST /v1/responses HTTP/1.1"));
        assert!(request.contains("authorization: Bearer loopback-bearer"));
        assert!(request.contains("\"model\":\"lumen.vision.cloud\""));
        assert!(request.contains("\"type\":\"input_text\""));
        assert!(request.contains("data:image/png;base64,"));
        worker.join().unwrap();
    }

    #[test]
    fn transcription_uses_the_explicit_bounded_multipart_contract() {
        let (endpoint, request, worker) = mock_json_server(r#"{"text":"mock transcript"}"#);
        let lease = EnrichmentLease {
            idempotency_key: "file:hash:transcription:route".to_owned(),
            file_id: "file".to_owned(),
            root_path: PathBuf::from("C:\\root"),
            path: PathBuf::from("recording.wav"),
            content_hash: "hash".to_owned(),
            kind: "transcription".to_owned(),
            route: "lumen.audio.cloud".to_owned(),
            attempt: 1,
            lease_token: "lease".to_owned(),
            lease_until: 1_000,
            generation: 1,
        };
        let mut audio = b"RIFF\x04\x00\x00\x00WAVE".to_vec();
        audio.extend_from_slice(b"mock");
        let client = reqwest::Client::builder().build().unwrap();
        let artifact = tauri::async_runtime::block_on(transcription_request(
            &client,
            &endpoint,
            "loopback-bearer",
            &lease,
            audio,
        ))
        .unwrap();

        assert_eq!(artifact.text, "mock transcript");
        assert_eq!(artifact.model, "gpt-4o-mini-transcribe");
        let request = request.recv().unwrap();
        let lowercase_request = request.to_ascii_lowercase();
        assert!(request.starts_with("POST /v1/audio/transcriptions HTTP/1.1"));
        assert!(lowercase_request.contains("authorization: bearer loopback-bearer"));
        assert!(lowercase_request.contains("content-type: multipart/form-data; boundary="));
        assert!(request.contains("name=\"model\""));
        assert!(request.contains("gpt-4o-mini-transcribe"));
        assert!(request.contains("name=\"file\"; filename=\"recording.wav\""));
        assert!(lowercase_request.contains("content-type: audio/wav"));
        worker.join().unwrap();
    }

    #[test]
    fn provider_output_and_image_types_fail_closed() {
        let oversized = serde_json::json!({"output_text": "x".repeat(MAX_ARTIFACT_TEXT_BYTES + 1)});
        assert!(response_output_text(&oversized).is_err());
        assert!(image_mime(Path::new("scan.png"), b"not-a-png").is_err());
        assert!(audio_mime(Path::new("recording.wav"), b"not-a-wave").is_err());
    }

    #[test]
    #[ignore = "requires the compiled Rivet enrichment worker"]
    fn staged_rivet_probe_is_ready_or_truthfully_degraded() {
        let binary = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/lumen-enrichment-x86_64-pc-windows-msvc.exe");
        let engine = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/lumen-rivet-engine-x86_64-pc-windows-msvc.exe");
        let root = std::env::temp_dir().join(format!("lumen-rivet-{}", uuid::Uuid::new_v4()));
        let supervisor = EnrichmentSupervisor::new(binary, engine, root.clone()).unwrap();
        if supervisor.start().is_err() {
            let health = supervisor.health();
            assert_eq!(health.state, "unavailable");
            assert_eq!(health.coordinator_state, "unavailable");
            assert_eq!(health.processor_state, "ready");
            assert!(health.coordinator_detail.is_some());
            drop(supervisor);
            let _ = fs::remove_dir_all(root);
            return;
        }
        thread::sleep(Duration::from_secs(2));
        let job = EnrichmentJobRecord {
            idempotency_key: "file:hash:ocr:route".to_owned(),
            file_id: "file".to_owned(),
            content_hash: "hash".to_owned(),
            kind: "ocr".to_owned(),
            route: "lumen.vision.cloud".to_owned(),
        };
        tauri::async_runtime::block_on(async {
            supervisor.sync_jobs(&[job.clone(), job]).await;
            let first = supervisor.queue_status().await.unwrap();
            assert_eq!(first[0]["count"].as_u64(), Some(1));
        });
        supervisor.restart().unwrap();
        thread::sleep(Duration::from_secs(2));
        tauri::async_runtime::block_on(async {
            supervisor.resume().await.unwrap();
            let after_restart = supervisor.queue_status().await.unwrap();
            assert_eq!(after_restart[0]["count"].as_u64(), Some(1));
        });
        drop(supervisor);
        let _ = fs::remove_dir_all(root);
    }
}
