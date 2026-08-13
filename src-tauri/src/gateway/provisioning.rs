use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use zip::ZipArchive;

use super::LocalRuntimeSupervisor;

pub const LOCAL_CORE_PROFILE: &str = "local-core";
pub const RUNTIME_VERSION: &str = "11.5.2";
const PROFILE_VERSION: &str = "11.5.2-qwen-6727efff-nomic-1f34490d";
const RUNTIME_URL: &str = "https://github.com/lemonade-sdk/lemonade/releases/download/v11.5.2/lemonade-embeddable-11.5.2-windows-x64.zip";
const RUNTIME_SHA256: &str = "6cd164e83ca7378ad8e81906373491d70434de56b76d67a1c930ae25682c9545";
const RUNTIME_SIZE_BYTES: u64 = 5_042_340;
const MAX_RUNTIME_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_MODEL_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const QWEN_REVISION: &str = "6727efff692673b7a2ebb4c6ba830ce4f5fb1309";
const NOMIC_REVISION: &str = "1f34490d38ddbfdc0a88e5659530230f13ba21fb";
const ANSWER_MODEL_ID: &str = "extra.Qwen3.5-4B-UD-Q4_K_XL.gguf";
const EMBEDDING_MODEL_ID: &str = "extra.nomic-embed-text-v1.Q4_K_S.gguf";
const PROFILE_DOWNLOAD_BYTES: u64 = 3_667_673_476;
const PROFILE_REQUIRED_DISK_BYTES: u64 =
    PROFILE_DOWNLOAD_BYTES + 512 * 1024 * 1024 + RUNTIME_SIZE_BYTES * 2;
const LOCAL_API_BASE: &str = "http://127.0.0.1:13305/v1";
const LOCAL_API_KEY: &str = "lumen-local";

pub(crate) const RUNTIME_INVENTORY: &[&str] = &[
    "LICENSE",
    "lemonade.exe",
    "lemond.exe",
    "resources/backend_versions.json",
    "resources/bench_scenarios.json",
    "resources/defaults.json",
    "resources/server_models.json",
    "resources/toolDefinitions.json",
    "resources/vllm_model_config.json",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallScope {
    Runtime,
    Model,
}

#[derive(Clone, Debug)]
pub struct ProvisioningArtifact {
    pub id: &'static str,
    pub version: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size_bytes: u64,
    pub install_scope: InstallScope,
}

const RUNTIME_ARTIFACT: ProvisioningArtifact = ProvisioningArtifact {
    id: LOCAL_CORE_PROFILE,
    version: RUNTIME_VERSION,
    url: RUNTIME_URL,
    sha256: RUNTIME_SHA256,
    size_bytes: RUNTIME_SIZE_BYTES,
    install_scope: InstallScope::Runtime,
};

const MODEL_ARTIFACTS: &[ProvisioningArtifact] = &[
    ProvisioningArtifact {
        id: "qwen3.5-4b",
        version: QWEN_REVISION,
        url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/6727efff692673b7a2ebb4c6ba830ce4f5fb1309/Qwen3.5-4B-UD-Q4_K_XL.gguf",
        sha256: "b252c5610a42ca82d20fe2a12813e9d069eed89292907e26c783eeb0bc961bc7",
        size_bytes: 2_912_109_728,
        install_scope: InstallScope::Model,
    },
    ProvisioningArtifact {
        id: "qwen3.5-mmproj",
        version: QWEN_REVISION,
        url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/6727efff692673b7a2ebb4c6ba830ce4f5fb1309/mmproj-F16.gguf",
        sha256: "cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864",
        size_bytes: 672_423_616,
        install_scope: InstallScope::Model,
    },
    ProvisioningArtifact {
        id: "nomic-embed-text-v1",
        version: NOMIC_REVISION,
        url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1-GGUF/resolve/1f34490d38ddbfdc0a88e5659530230f13ba21fb/nomic-embed-text-v1.Q4_K_S.gguf",
        sha256: "9b72dd549a1589e4047ed3cd737ba6ae974ae635a0e327f4352c56536573b9d4",
        size_bytes: 78_097_792,
        install_scope: InstallScope::Model,
    },
];

const MODEL_STATUS: &[(&str, &str)] = &[
    (ANSWER_MODEL_ID, "Qwen 3.5 4B"),
    (EMBEDDING_MODEL_ID, "Nomic Embed Text v1"),
];

pub fn manifest_artifacts(profile_id: &str) -> Option<Vec<&'static ProvisioningArtifact>> {
    (profile_id == LOCAL_CORE_PROFILE).then(|| {
        std::iter::once(&RUNTIME_ARTIFACT)
            .chain(MODEL_ARTIFACTS.iter())
            .collect()
    })
}

pub fn validate_manifest_artifact(artifact: &ProvisioningArtifact) -> Result<(), String> {
    let url = Url::parse(artifact.url).map_err(|_| "The provisioning URL is invalid")?;
    let immutable = match artifact.install_scope {
        InstallScope::Runtime => {
            url.host_str() == Some("github.com")
                && url
                    .path()
                    .contains(&format!("/releases/download/v{}/", artifact.version))
                && !url.path().contains("/latest/")
        }
        InstallScope::Model => {
            artifact.version.len() == 40
                && artifact
                    .version
                    .bytes()
                    .all(|value| value.is_ascii_hexdigit())
                && url.host_str() == Some("huggingface.co")
                && url
                    .path()
                    .contains(&format!("/resolve/{}/", artifact.version))
                && !url.path().contains("/resolve/main/")
        }
    };
    if url.scheme() != "https" || url.query().is_some() || url.fragment().is_some() || !immutable {
        return Err("The provisioning URL must be an immutable HTTPS release".to_owned());
    }
    if artifact.sha256.len() != 64
        || !artifact
            .sha256
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err("The provisioning checksum is invalid".to_owned());
    }
    let maximum = match artifact.install_scope {
        InstallScope::Runtime => MAX_RUNTIME_ARCHIVE_BYTES,
        InstallScope::Model => MAX_MODEL_BYTES,
    };
    if artifact.size_bytes == 0 || artifact.size_bytes > maximum {
        return Err("The provisioning artifact size is outside the allowed range".to_owned());
    }
    Ok(())
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|value| format!("{value:02x}"))
        .collect()
}

pub fn verify_file(
    path: &Path,
    expected_size: u64,
    expected_sha256: &str,
    maximum_size: u64,
) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|_| "The downloaded artifact is unavailable")?;
    if metadata.len() != expected_size || metadata.len() > maximum_size {
        return Err("The downloaded artifact has an unexpected size".to_owned());
    }
    let mut file = File::open(path).map_err(|_| "The downloaded artifact could not be read")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "The downloaded artifact could not be read")?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    if hex_digest(hasher.finalize()) != expected_sha256.to_ascii_lowercase() {
        return Err("The downloaded artifact failed checksum verification".to_owned());
    }
    Ok(())
}

pub fn verify_archive(
    path: &Path,
    expected_size: u64,
    expected_sha256: &str,
) -> Result<(), String> {
    verify_file(
        path,
        expected_size,
        expected_sha256,
        MAX_RUNTIME_ARCHIVE_BYTES,
    )?;

    let file = File::open(path).map_err(|_| "The downloaded runtime could not be read")?;
    let mut archive = ZipArchive::new(file).map_err(|_| "The runtime archive is invalid")?;
    let mut inventory = BTreeSet::new();
    let mut expanded_bytes = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| "The runtime archive is invalid")?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "The runtime archive contains an unsafe path".to_owned())?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170_000 == 0o120_000)
        {
            return Err("The runtime archive contains an unsupported link".to_owned());
        }
        if entry.is_dir() {
            continue;
        }
        expanded_bytes = expanded_bytes.saturating_add(entry.size());
        if expanded_bytes > MAX_RUNTIME_ARCHIVE_BYTES * 4 {
            return Err("The runtime archive expands beyond the allowed size".to_owned());
        }
        let relative = enclosed
            .components()
            .skip(1)
            .collect::<PathBuf>()
            .to_string_lossy()
            .replace('\\', "/");
        if relative.is_empty() || !inventory.insert(relative) {
            return Err("The runtime archive has an invalid inventory".to_owned());
        }
    }
    let expected = RUNTIME_INVENTORY
        .iter()
        .map(|name| (*name).to_owned())
        .collect::<BTreeSet<_>>();
    if inventory != expected {
        return Err("The runtime archive inventory does not match the manifest".to_owned());
    }
    Ok(())
}

fn extract_archive(archive_path: &Path, destination: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(destination)
        .map_err(|_| "The runtime staging directory could not be created")?;
    let file = File::open(archive_path).map_err(|_| "The downloaded runtime could not be read")?;
    let mut archive = ZipArchive::new(file).map_err(|_| "The runtime archive is invalid")?;
    let mut root_component: Option<PathBuf> = None;
    let mut expanded_bytes = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "The runtime archive is invalid")?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "The runtime archive contains an unsafe path".to_owned())?
            .to_owned();
        let first = enclosed
            .components()
            .next()
            .ok_or_else(|| "The runtime archive has an invalid root".to_owned())?;
        let first = PathBuf::from(first.as_os_str());
        if root_component.as_ref().is_some_and(|root| root != &first) {
            return Err("The runtime archive has multiple roots".to_owned());
        }
        root_component.get_or_insert(first);
        let output = destination.join(&enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|_| "The runtime archive could not be extracted")?;
            continue;
        }
        expanded_bytes = expanded_bytes.saturating_add(entry.size());
        if expanded_bytes > MAX_RUNTIME_ARCHIVE_BYTES * 4 {
            return Err("The runtime archive expands beyond the allowed size".to_owned());
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|_| "The runtime archive could not be extracted")?;
        }
        let mut output_file =
            File::create(&output).map_err(|_| "The runtime archive could not be extracted")?;
        std::io::copy(&mut entry, &mut output_file)
            .map_err(|_| "The runtime archive could not be extracted")?;
        output_file
            .sync_all()
            .map_err(|_| "The runtime archive could not be committed")?;
    }
    let root = root_component.ok_or_else(|| "The runtime archive is empty".to_owned())?;
    Ok(destination.join(root))
}

fn runtime_root(provisioning_root: &Path) -> PathBuf {
    provisioning_root.join("runtime").join("lemonade")
}

fn current_file(root: &Path) -> PathBuf {
    root.join("current.json")
}

#[derive(Deserialize, Serialize)]
struct CurrentVersion {
    version: String,
}

pub fn read_current_version(root: &Path) -> Option<String> {
    let value = fs::read_to_string(current_file(root)).ok()?;
    let current = serde_json::from_str::<CurrentVersion>(&value).ok()?;
    let candidate = root.join("versions").join(&current.version);
    (candidate.join("lemonade.exe").is_file() && candidate.join("lemond.exe").is_file())
        .then_some(current.version)
}

#[cfg(test)]
fn seed_current_version(root: &Path, version: &str) -> Result<(), String> {
    let version_root = root.join("versions").join(version);
    fs::create_dir_all(&version_root).map_err(|_| "Could not seed version")?;
    fs::write(version_root.join("lemonade.exe"), b"test").map_err(|_| "Could not seed")?;
    fs::write(version_root.join("lemond.exe"), b"test").map_err(|_| "Could not seed")?;
    write_current_version(root, version)
}

fn wide_path(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str().encode_wide().chain(Some(0)).collect()
}

fn replace_file_atomic(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::{
            Win32::Storage::FileSystem::{
                MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
            },
            core::PCWSTR,
        };
        let source = wide_path(source);
        let destination = wide_path(destination);
        unsafe {
            MoveFileExW(
                PCWSTR(source.as_ptr()),
                PCWSTR(destination.as_ptr()),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        }
        .map_err(|_| "The runtime version pointer could not be replaced")?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination)
            .map_err(|_| "The runtime version pointer could not be replaced")
    }
}

fn write_current_version(root: &Path, version: &str) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|_| "The runtime directory could not be created")?;
    let temporary = root.join(format!("current-{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec(&CurrentVersion {
        version: version.to_owned(),
    })
    .map_err(|_| "The runtime version pointer is invalid")?;
    let mut file =
        File::create(&temporary).map_err(|_| "The runtime version pointer could not be created")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "The runtime version pointer could not be committed")?;
    replace_file_atomic(&temporary, &current_file(root))
}

pub fn promote_candidate<F>(
    root: &Path,
    version: &str,
    candidate: &Path,
    health_probe: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> bool,
{
    if !health_probe(candidate) {
        let _ = fs::remove_dir_all(candidate);
        return Err("The staged runtime did not pass its loopback health check".to_owned());
    }
    let versions = root.join("versions");
    fs::create_dir_all(&versions).map_err(|_| "The runtime directory could not be created")?;
    let target = versions.join(version);
    if target.exists() {
        fs::remove_dir_all(candidate)
            .map_err(|_| "The redundant runtime staging directory could not be removed")?;
    } else {
        fs::rename(candidate, &target).map_err(|_| "The verified runtime could not be promoted")?;
    }
    write_current_version(root, version)
}

pub(crate) fn current_runtime_path(provisioning_root: &Path) -> Option<(String, PathBuf)> {
    let root = runtime_root(provisioning_root);
    let version = read_current_version(&root)?;
    let path = root.join("versions").join(&version);
    Some((version, path))
}

pub fn cleanup_cancelled_staging(
    staging: &Path,
    cancellation: &CancellationToken,
) -> Result<(), String> {
    if cancellation.is_cancelled() && staging.exists() {
        fs::remove_dir_all(staging)
            .map_err(|_| "The cancelled runtime staging directory could not be removed")?;
    }
    Ok(())
}

fn available_space(path: &Path) -> Result<u64, String> {
    #[cfg(windows)]
    {
        use windows::{Win32::Storage::FileSystem::GetDiskFreeSpaceExW, core::PCWSTR};
        let path = wide_path(path);
        let mut available = 0_u64;
        unsafe { GetDiskFreeSpaceExW(PCWSTR(path.as_ptr()), Some(&mut available), None, None) }
            .map_err(|_| "Available disk space could not be checked")?;
        Ok(available)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(u64::MAX)
    }
}

fn runtime_health_probe(candidate: &Path) -> bool {
    let lemonade = candidate.join("lemonade.exe");
    let lemond = candidate.join("lemond.exe");
    if !lemonade.is_file() || !lemond.is_file() {
        return false;
    }
    let mut version = Command::new(&lemonade);
    version
        .arg("--version")
        .current_dir(candidate)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        version.creation_flags(0x0800_0000);
    }
    let version = match version.output() {
        Ok(output) if output.status.success() => format!(
            "{} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ),
        _ => return false,
    };
    if !version
        .split_whitespace()
        .any(|part| part.contains(RUNTIME_VERSION))
    {
        return false;
    }
    let port = match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(listener) => listener.local_addr().map(|address| address.port()),
        Err(error) => Err(error),
    };
    let Ok(port) = port else {
        return false;
    };
    let mut command = Command::new(&lemond);
    command
        .arg(".")
        .arg("--port")
        .arg(port.to_string())
        .env("LEMONADE_API_KEY", LOCAL_API_KEY)
        .current_dir(candidate)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    let deadline = Instant::now() + Duration::from_secs(8);
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let healthy = loop {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(150)) {
            let request = format!(
                "GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {LOCAL_API_KEY}\r\nConnection: close\r\n\r\n"
            );
            let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.starts_with("HTTP/1.1 200")
                {
                    break true;
                }
            }
        }
        if Instant::now() >= deadline || child.try_wait().ok().flatten().is_some() {
            break false;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let _ = child.kill();
    let _ = child.wait();
    healthy
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisioningModelStatus {
    pub id: String,
    pub label: String,
    pub state: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisioningStatus {
    pub profile_id: String,
    pub label: String,
    pub version: String,
    pub installed_version: Option<String>,
    pub state: String,
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub required_disk_bytes: u64,
    pub progress: u8,
    pub can_download: bool,
    pub can_update: bool,
    pub can_cancel: bool,
    pub detail: Option<String>,
    pub models: Vec<ProvisioningModelStatus>,
}

#[derive(Deserialize, Serialize)]
struct ProfileMarker {
    profile_id: String,
    profile_version: String,
    runtime_version: String,
    artifacts: Vec<String>,
}

pub struct ProvisioningManager {
    root: PathBuf,
    status: Mutex<ProvisioningStatus>,
    cancellation: Mutex<Option<CancellationToken>>,
}

impl ProvisioningManager {
    pub fn new(app_data: PathBuf) -> Self {
        let root = app_data.join("provisioning");
        let status = disk_status(&root);
        Self {
            root,
            status: Mutex::new(status),
            cancellation: Mutex::new(None),
        }
    }

    fn snapshot(&self) -> ProvisioningStatus {
        let active = self
            .cancellation
            .lock()
            .ok()
            .is_some_and(|active| active.is_some());
        if !active {
            let disk = disk_status(&self.root);
            if let Ok(mut status) = self.status.lock()
                && !matches!(status.state.as_str(), "failed" | "cancelled")
            {
                *status = disk;
            }
        }
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| disk_status(&self.root))
    }

    fn begin(&self) -> Result<CancellationToken, String> {
        let mut active = self
            .cancellation
            .lock()
            .map_err(|_| "Provisioning state is unavailable")?;
        if active.is_some() {
            return Err("Local AI provisioning is already running".to_owned());
        }
        let cancellation = CancellationToken::new();
        *active = Some(cancellation.clone());
        if let Ok(mut status) = self.status.lock() {
            status.state = "working".to_owned();
            status.phase = "preparing".to_owned();
            status.can_download = false;
            status.can_update = false;
            status.can_cancel = true;
            status.detail = Some("Preparing the verified local AI profile.".to_owned());
        }
        Ok(cancellation)
    }

    fn update<F>(&self, app: &AppHandle, change: F)
    where
        F: FnOnce(&mut ProvisioningStatus),
    {
        if let Ok(mut status) = self.status.lock() {
            change(&mut status);
            status.progress = status
                .downloaded_bytes
                .saturating_mul(100)
                .checked_div(status.total_bytes)
                .unwrap_or(0)
                .min(100) as u8;
            let _ = app.emit("lumen://provisioning-progress", status.clone());
        }
    }

    fn finish(&self, app: &AppHandle, result: &Result<(), ProvisioningError>) {
        if let Ok(mut active) = self.cancellation.lock() {
            *active = None;
        }
        let disk = disk_status(&self.root);
        if let Ok(mut status) = self.status.lock() {
            match result {
                Ok(()) => *status = disk,
                Err(ProvisioningError::Cancelled) => {
                    status.state = "cancelled".to_owned();
                    status.phase = "cancelled".to_owned();
                    status.can_download = true;
                    status.can_update = false;
                    status.can_cancel = false;
                    status.detail = Some("The local AI download was cancelled.".to_owned());
                }
                Err(ProvisioningError::Failed(message)) => {
                    status.state = "failed".to_owned();
                    status.phase = "failed".to_owned();
                    status.can_download = true;
                    status.can_update = false;
                    status.can_cancel = false;
                    status.detail = Some((*message).to_owned());
                }
            }
            let _ = app.emit("lumen://provisioning-progress", status.clone());
        }
    }

    fn cancel(&self) -> bool {
        let Ok(active) = self.cancellation.lock() else {
            return false;
        };
        let Some(cancellation) = active.as_ref() else {
            return false;
        };
        cancellation.cancel();
        true
    }
}

fn profile_marker(root: &Path) -> PathBuf {
    root.join("local-core.json")
}

fn model_version_root(root: &Path) -> PathBuf {
    root.join("models").join("versions").join(PROFILE_VERSION)
}

fn artifact_file_name(artifact: &ProvisioningArtifact) -> Option<&str> {
    artifact.url.rsplit('/').next().filter(|name| {
        !name.is_empty() && !name.contains(['\\', ':']) && *name != "." && *name != ".."
    })
}

fn artifact_marker(artifact: &ProvisioningArtifact) -> String {
    format!("{}:{}:{}", artifact.id, artifact.version, artifact.sha256)
}

fn profile_ready(root: &Path) -> bool {
    let Ok(contents) = fs::read_to_string(profile_marker(root)) else {
        return false;
    };
    let Ok(marker) = serde_json::from_str::<ProfileMarker>(&contents) else {
        return false;
    };
    marker.profile_id == LOCAL_CORE_PROFILE
        && marker.profile_version == PROFILE_VERSION
        && marker.runtime_version == RUNTIME_VERSION
        && marker.artifacts
            == MODEL_ARTIFACTS
                .iter()
                .map(artifact_marker)
                .collect::<Vec<_>>()
        && MODEL_ARTIFACTS.iter().all(|artifact| {
            artifact_file_name(artifact)
                .map(|name| model_version_root(root).join(name))
                .and_then(|path| fs::metadata(path).ok())
                .is_some_and(|metadata| metadata.len() == artifact.size_bytes)
        })
}

fn write_profile_marker(root: &Path) -> Result<(), ProvisioningError> {
    fs::create_dir_all(root)
        .map_err(|_| ProvisioningError::Failed("The local AI profile could not be saved."))?;
    let temporary = root.join(format!("local-core-{}.tmp", Uuid::new_v4()));
    let marker = ProfileMarker {
        profile_id: LOCAL_CORE_PROFILE.to_owned(),
        profile_version: PROFILE_VERSION.to_owned(),
        runtime_version: RUNTIME_VERSION.to_owned(),
        artifacts: MODEL_ARTIFACTS.iter().map(artifact_marker).collect(),
    };
    let bytes = serde_json::to_vec(&marker)
        .map_err(|_| ProvisioningError::Failed("The local AI profile could not be saved."))?;
    let mut file = File::create(&temporary)
        .map_err(|_| ProvisioningError::Failed("The local AI profile could not be saved."))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| ProvisioningError::Failed("The local AI profile could not be saved."))?;
    replace_file_atomic(&temporary, &profile_marker(root))
        .map_err(|_| ProvisioningError::Failed("The local AI profile could not be saved."))
}

fn disk_status(root: &Path) -> ProvisioningStatus {
    let installed_version = read_current_version(&runtime_root(root));
    let ready = installed_version.as_deref() == Some(RUNTIME_VERSION) && profile_ready(root);
    let update =
        installed_version.is_some() && installed_version.as_deref() != Some(RUNTIME_VERSION);
    let state = if ready {
        "ready"
    } else if update {
        "updateAvailable"
    } else {
        "missing"
    };
    ProvisioningStatus {
        profile_id: LOCAL_CORE_PROFILE.to_owned(),
        label: "Local core".to_owned(),
        version: RUNTIME_VERSION.to_owned(),
        installed_version,
        state: state.to_owned(),
        phase: "idle".to_owned(),
        downloaded_bytes: if ready { PROFILE_DOWNLOAD_BYTES } else { 0 },
        total_bytes: PROFILE_DOWNLOAD_BYTES,
        required_disk_bytes: PROFILE_REQUIRED_DISK_BYTES,
        progress: if ready { 100 } else { 0 },
        can_download: !ready && !update,
        can_update: update,
        can_cancel: false,
        detail: ready.then(|| "The verified runtime and local models are installed.".to_owned()),
        models: MODEL_STATUS
            .iter()
            .map(|(id, label)| ProvisioningModelStatus {
                id: (*id).to_owned(),
                label: (*label).to_owned(),
                state: if ready { "ready" } else { "missing" }.to_owned(),
            })
            .collect(),
    }
}

#[derive(Debug)]
enum ProvisioningError {
    Cancelled,
    Failed(&'static str),
}

async fn download_artifact(
    app: &AppHandle,
    manager: &ProvisioningManager,
    artifact: &ProvisioningArtifact,
    destination: &Path,
    completed_bytes: u64,
    cancellation: &CancellationToken,
) -> Result<(), ProvisioningError> {
    let response = reqwest::Client::new()
        .get(artifact.url)
        .send()
        .await
        .map_err(|_| ProvisioningError::Failed("The verified download could not start."))?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size != artifact.size_bytes)
    {
        return Err(ProvisioningError::Failed(
            "The verified download did not match the manifest.",
        ));
    }
    let mut file = File::create(destination)
        .map_err(|_| ProvisioningError::Failed("The staging file could not be created."))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0_u64;
    loop {
        let next = tokio::select! {
            () = cancellation.cancelled() => return Err(ProvisioningError::Cancelled),
            next = stream.next() => next,
        };
        let Some(chunk) = next else {
            break;
        };
        let chunk = chunk
            .map_err(|_| ProvisioningError::Failed("The verified download was interrupted."))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        let maximum = match artifact.install_scope {
            InstallScope::Runtime => MAX_RUNTIME_ARCHIVE_BYTES,
            InstallScope::Model => MAX_MODEL_BYTES,
        };
        if downloaded > artifact.size_bytes || downloaded > maximum {
            return Err(ProvisioningError::Failed(
                "The verified download exceeded its manifest size.",
            ));
        }
        file.write_all(&chunk)
            .map_err(|_| ProvisioningError::Failed("The staging file could not be written."))?;
        manager.update(app, |status| {
            status.phase = match artifact.install_scope {
                InstallScope::Runtime => "downloadingRuntime",
                InstallScope::Model => "downloadingModels",
            }
            .to_owned();
            status.downloaded_bytes = completed_bytes.saturating_add(downloaded);
            status.detail = Some(
                match artifact.id {
                    "qwen3.5-4b" => "Downloading the verified Qwen model.",
                    "qwen3.5-mmproj" => "Downloading the verified Qwen vision projector.",
                    "nomic-embed-text-v1" => "Downloading the verified embedding model.",
                    _ => "Downloading the signed Lemonade runtime.",
                }
                .to_owned(),
            );
            if let Some(item) = status.models.iter_mut().find(|item| {
                (artifact.id == "qwen3.5-4b" && item.id == ANSWER_MODEL_ID)
                    || (artifact.id == "nomic-embed-text-v1" && item.id == EMBEDDING_MODEL_ID)
            }) {
                item.state = "downloading".to_owned();
            }
        });
    }
    file.sync_all()
        .map_err(|_| ProvisioningError::Failed("The staging file could not be committed."))?;
    if downloaded != artifact.size_bytes {
        return Err(ProvisioningError::Failed(
            "The verified download was incomplete.",
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
struct ModelList {
    data: Vec<ModelListItem>,
}

#[derive(Deserialize)]
struct ModelListItem {
    id: String,
}

async fn configure_and_probe_models(model_directory: &Path) -> Result<(), ProvisioningError> {
    let client = reqwest::Client::new();
    let path = model_directory.to_str().ok_or(ProvisioningError::Failed(
        "The verified model directory is invalid.",
    ))?;
    let response = client
        .post("http://127.0.0.1:13305/internal/set")
        .bearer_auth(LOCAL_API_KEY)
        .json(&serde_json::json!({"extra_models_dir": path}))
        .send()
        .await
        .map_err(|_| {
            ProvisioningError::Failed("The local runtime could not import verified models.")
        })?;
    if !response.status().is_success() {
        return Err(ProvisioningError::Failed(
            "The local runtime rejected the verified model directory.",
        ));
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    while tokio::time::Instant::now() < deadline {
        let response = client
            .get(format!("{LOCAL_API_BASE}/models"))
            .bearer_auth(LOCAL_API_KEY)
            .send()
            .await
            .ok()
            .and_then(|response| response.error_for_status().ok());
        if let Some(response) = response
            && let Ok(models) = response.json::<ModelList>().await
        {
            let ids = models
                .data
                .into_iter()
                .map(|model| model.id)
                .collect::<BTreeSet<_>>();
            if ids.contains(ANSWER_MODEL_ID) && ids.contains(EMBEDDING_MODEL_ID) {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err(ProvisioningError::Failed(
        "The local runtime could not discover the verified models.",
    ))
}

async fn install_profile(
    app: &AppHandle,
    manager: &ProvisioningManager,
    runtime: &LocalRuntimeSupervisor,
    artifacts: &[&ProvisioningArtifact],
    cancellation: &CancellationToken,
) -> Result<(), ProvisioningError> {
    for artifact in artifacts {
        validate_manifest_artifact(artifact).map_err(|_| {
            ProvisioningError::Failed("The embedded provisioning manifest is invalid.")
        })?;
    }
    let runtime_artifact = artifacts
        .iter()
        .copied()
        .find(|artifact| artifact.install_scope == InstallScope::Runtime)
        .ok_or(ProvisioningError::Failed(
            "The embedded provisioning manifest is incomplete.",
        ))?;
    fs::create_dir_all(&manager.root).map_err(|_| {
        ProvisioningError::Failed("The local AI data directory could not be created.")
    })?;
    if available_space(&manager.root)
        .map_err(|_| ProvisioningError::Failed("Available disk space could not be checked."))?
        < PROFILE_REQUIRED_DISK_BYTES
    {
        return Err(ProvisioningError::Failed(
            "Local core needs at least 4.2 GB of free disk space.",
        ));
    }
    if read_current_version(&runtime_root(&manager.root)).as_deref()
        != Some(runtime_artifact.version)
    {
        let staging = manager
            .root
            .join("staging")
            .join(Uuid::new_v4().to_string());
        fs::create_dir_all(&staging).map_err(|_| {
            ProvisioningError::Failed("The runtime staging directory could not be created.")
        })?;
        let archive = staging.join("runtime.zip");
        let result = async {
            download_artifact(app, manager, runtime_artifact, &archive, 0, cancellation).await?;
            if cancellation.is_cancelled() {
                return Err(ProvisioningError::Cancelled);
            }
            manager.update(app, |status| {
                status.phase = "verifyingRuntime".to_owned();
                status.detail = Some("Verifying the runtime checksum and inventory.".to_owned());
            });
            verify_archive(
                &archive,
                runtime_artifact.size_bytes,
                runtime_artifact.sha256,
            )
            .map_err(|_| ProvisioningError::Failed("The runtime failed manifest verification."))?;
            manager.update(app, |status| {
                status.phase = "installingRuntime".to_owned();
                status.detail = Some("Installing the verified runtime.".to_owned());
            });
            let candidate = extract_archive(&archive, &staging.join("expanded")).map_err(|_| {
                ProvisioningError::Failed("The verified runtime could not be extracted.")
            })?;
            if cancellation.is_cancelled() {
                return Err(ProvisioningError::Cancelled);
            }
            promote_candidate(
                &runtime_root(&manager.root),
                runtime_artifact.version,
                &candidate,
                runtime_health_probe,
            )
            .map_err(|_| {
                ProvisioningError::Failed("The verified runtime failed its health check.")
            })?;
            Ok(())
        }
        .await;
        let _ = fs::remove_dir_all(&staging);
        cleanup_cancelled_staging(&staging, cancellation)
            .map_err(|_| ProvisioningError::Failed("Cancelled staging cleanup failed."))?;
        result?;
    }
    if cancellation.is_cancelled() {
        return Err(ProvisioningError::Cancelled);
    }
    manager.update(app, |status| {
        status.phase = "startingRuntime".to_owned();
        status.downloaded_bytes = RUNTIME_SIZE_BYTES;
        status.detail = Some("Starting the verified loopback runtime.".to_owned());
    });
    runtime
        .start()
        .map_err(|_| ProvisioningError::Failed("The verified local runtime could not start."))?;

    let staging = manager
        .root
        .join("staging")
        .join(format!("models-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(|_| {
        ProvisioningError::Failed("The model staging directory could not be created.")
    })?;
    let previous_models = fs::read_to_string(profile_marker(&manager.root))
        .ok()
        .and_then(|value| serde_json::from_str::<ProfileMarker>(&value).ok())
        .map(|marker| {
            manager
                .root
                .join("models")
                .join("versions")
                .join(marker.profile_version)
        })
        .filter(|path| path.is_dir());
    let result = async {
        let mut completed = RUNTIME_SIZE_BYTES;
        for artifact in artifacts
            .iter()
            .copied()
            .filter(|artifact| artifact.install_scope == InstallScope::Model)
        {
            if cancellation.is_cancelled() {
                return Err(ProvisioningError::Cancelled);
            }
            let name = artifact_file_name(artifact).ok_or(ProvisioningError::Failed(
                "The embedded model filename is invalid.",
            ))?;
            let destination = staging.join(name);
            download_artifact(
                app,
                manager,
                artifact,
                &destination,
                completed,
                cancellation,
            )
            .await?;
            manager.update(app, |status| {
                status.phase = "verifyingModels".to_owned();
                status.detail = Some("Verifying the model checksum.".to_owned());
            });
            verify_file(
                &destination,
                artifact.size_bytes,
                artifact.sha256,
                MAX_MODEL_BYTES,
            )
            .map_err(|_| {
                ProvisioningError::Failed("A local model failed manifest verification.")
            })?;
            completed = completed.saturating_add(artifact.size_bytes);
            manager.update(app, |status| {
                status.downloaded_bytes = completed;
                if artifact.id == "qwen3.5-4b" {
                    if let Some(item) = status
                        .models
                        .iter_mut()
                        .find(|item| item.id == ANSWER_MODEL_ID)
                    {
                        item.state = "ready".to_owned();
                    }
                } else if artifact.id == "nomic-embed-text-v1"
                    && let Some(item) = status
                        .models
                        .iter_mut()
                        .find(|item| item.id == EMBEDDING_MODEL_ID)
                {
                    item.state = "ready".to_owned();
                }
            });
        }
        if cancellation.is_cancelled() {
            return Err(ProvisioningError::Cancelled);
        }
        manager.update(app, |status| {
            status.phase = "testingModels".to_owned();
            status.detail = Some("Testing the verified models on the loopback runtime.".to_owned());
        });
        if let Err(error) = configure_and_probe_models(&staging).await {
            if let Some(previous) = previous_models.as_deref() {
                let _ = configure_and_probe_models(previous).await;
            }
            return Err(error);
        }
        let target = model_version_root(&manager.root);
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|_| {
                ProvisioningError::Failed("The stale model version could not be replaced.")
            })?;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                ProvisioningError::Failed("The model version directory could not be created.")
            })?;
        }
        fs::rename(&staging, &target)
            .map_err(|_| ProvisioningError::Failed("The verified models could not be promoted."))?;
        if let Err(error) = configure_and_probe_models(&target).await {
            if let Some(previous) = previous_models.as_deref() {
                let _ = configure_and_probe_models(previous).await;
            }
            let _ = fs::remove_dir_all(&target);
            return Err(error);
        }
        Ok(())
    }
    .await;
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    cleanup_cancelled_staging(&staging, cancellation)
        .map_err(|_| ProvisioningError::Failed("Cancelled staging cleanup failed."))?;
    result?;
    write_profile_marker(&manager.root)?;
    Ok(())
}

#[tauri::command]
pub fn get_provisioning_status(state: State<'_, ProvisioningManager>) -> ProvisioningStatus {
    state.snapshot()
}

#[tauri::command]
pub async fn start_provisioning(
    app: AppHandle,
    profile_id: String,
    state: State<'_, ProvisioningManager>,
    runtime: State<'_, LocalRuntimeSupervisor>,
) -> Result<ProvisioningStatus, String> {
    let artifacts = manifest_artifacts(&profile_id)
        .ok_or_else(|| "Unknown local AI provisioning profile".to_owned())?;
    let cancellation = state.begin()?;
    state.update(&app, |_| {});
    let result = install_profile(
        &app,
        state.inner(),
        runtime.inner(),
        &artifacts,
        &cancellation,
    )
    .await;
    state.finish(&app, &result);
    match result {
        Ok(()) => Ok(state.snapshot()),
        Err(ProvisioningError::Cancelled) => Ok(state.snapshot()),
        Err(ProvisioningError::Failed(message)) => Err(message.to_owned()),
    }
}

#[tauri::command]
pub fn cancel_provisioning(state: State<'_, ProvisioningManager>) -> ProvisioningStatus {
    let _ = state.cancel();
    state.snapshot()
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write};

    use sha2::{Digest, Sha256};
    use tokio_util::sync::CancellationToken;
    use zip::{ZipWriter, write::SimpleFileOptions};

    use super::*;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("lumen-provisioning-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn runtime_archive(path: &std::path::Path) -> (u64, String) {
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        for name in RUNTIME_INVENTORY {
            archive
                .start_file(
                    format!("lemonade-test/{name}"),
                    SimpleFileOptions::default(),
                )
                .unwrap();
            archive.write_all(name.as_bytes()).unwrap();
        }
        archive.finish().unwrap();
        let bytes = fs::read(path).unwrap();
        (bytes.len() as u64, hex_digest(Sha256::digest(bytes)))
    }

    #[test]
    fn production_manifest_is_https_immutable_and_exactly_pinned() {
        let artifacts = manifest_artifacts(LOCAL_CORE_PROFILE).unwrap();
        assert_eq!(artifacts.len(), 4);
        for artifact in &artifacts {
            validate_manifest_artifact(artifact).unwrap();
            assert_eq!(artifact.sha256.len(), 64);
        }
        let artifact = artifacts[0];
        assert_eq!(artifact.version, "11.5.2");
        assert!(artifact.url.contains("/releases/download/v11.5.2/"));
        assert!(artifacts[1..].iter().all(|artifact| {
            artifact.install_scope == InstallScope::Model
                && artifact
                    .url
                    .contains(&format!("/resolve/{}/", artifact.version))
        }));
        assert_eq!(
            artifacts
                .iter()
                .map(|artifact| artifact.size_bytes)
                .sum::<u64>(),
            PROFILE_DOWNLOAD_BYTES
        );

        let mut insecure = artifact.clone();
        insecure.url = "http://example.test/latest/runtime.zip";
        assert!(validate_manifest_artifact(&insecure).is_err());

        let mut wrong_version = artifact.clone();
        wrong_version.version = "11.5.1";
        assert!(validate_manifest_artifact(&wrong_version).is_err());
    }

    #[test]
    fn rejects_unknown_profile_ids() {
        assert!(manifest_artifacts("custom-download").is_none());
    }

    #[test]
    fn checksum_size_and_inventory_are_all_required() {
        let temp = TestDir::new();
        let archive = temp.path().join("runtime.zip");
        let (size, sha256) = runtime_archive(&archive);
        verify_archive(&archive, size, &sha256).unwrap();
        assert!(verify_archive(&archive, size + 1, &sha256).is_err());
        assert!(verify_archive(&archive, size, &"0".repeat(64)).is_err());

        let model = temp.path().join("model.gguf");
        fs::write(&model, b"verified-model").unwrap();
        let bytes = fs::read(&model).unwrap();
        let sha256 = hex_digest(Sha256::digest(&bytes));
        verify_file(&model, bytes.len() as u64, &sha256, 1024).unwrap();
        assert!(verify_file(&model, bytes.len() as u64, &"0".repeat(64), 1024).is_err());
    }

    #[test]
    fn cancellation_removes_the_staging_directory() {
        let temp = TestDir::new();
        let staging = temp.path().join("staging");
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("partial.zip"), b"partial").unwrap();
        let cancellation = CancellationToken::new();
        cancellation.cancel();

        cleanup_cancelled_staging(&staging, &cancellation).unwrap();
        assert!(!staging.exists());
    }

    #[test]
    fn promotion_keeps_the_last_healthy_version_until_probe_passes() {
        let temp = TestDir::new();
        let root = temp.path();
        seed_current_version(root, "old").unwrap();
        let failed = root.join("candidate-failed");
        fs::create_dir_all(&failed).unwrap();
        fs::write(failed.join("lemonade.exe"), b"test").unwrap();
        fs::write(failed.join("lemond.exe"), b"test").unwrap();
        assert!(promote_candidate(root, "new", &failed, |_| false).is_err());
        assert_eq!(read_current_version(root).as_deref(), Some("old"));

        let healthy = root.join("candidate-healthy");
        fs::create_dir_all(&healthy).unwrap();
        fs::write(healthy.join("lemonade.exe"), b"test").unwrap();
        fs::write(healthy.join("lemond.exe"), b"test").unwrap();
        promote_candidate(root, "new", &healthy, |_| true).unwrap();
        assert_eq!(read_current_version(root).as_deref(), Some("new"));
    }
}
