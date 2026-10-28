use super::SearchFailure;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Read,
    num::NonZeroU32,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

const ENGINE_COMMIT: &str = "85a915d460b1fa751bbe86f289ff77c18c032c25";

fn unavailable() -> SearchFailure {
    SearchFailure::new(
        "engine-unavailable",
        "The local search engine is unavailable or could not be verified.",
        None,
    )
}

struct VerifiedPayload {
    root: PathBuf,
    _files: Vec<File>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    engine_commit: String,
    target: String,
    files: Vec<PayloadFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PayloadFile {
    path: String,
    sha256: String,
    size_bytes: u64,
}

fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn no_links(path: &Path) -> Result<(), SearchFailure> {
    if !path.is_absolute() {
        return Err(unavailable());
    }
    for parent in path.ancestors() {
        let metadata = fs::symlink_metadata(parent).map_err(|_| unavailable())?;
        if metadata.file_type().is_symlink() {
            return Err(unavailable());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(unavailable());
            }
        }
    }
    Ok(())
}

fn locked_file(path: &Path, directory: bool) -> Result<File, SearchFailure> {
    no_links(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options
            .share_mode(1)
            .custom_flags(0x00200000 | if directory { 0x02000000 } else { 0 });
    }
    #[cfg(not(windows))]
    let _ = directory;
    let file = options.open(path).map_err(|_| unavailable())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let attributes = file
            .metadata()
            .map_err(|_| unavailable())?
            .file_attributes();
        if attributes & (0x400 | 0x1000 | 0x40000 | 0x400000) != 0 {
            return Err(unavailable());
        }
    }
    Ok(file)
}

fn safe_relative(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && value.split('/').all(|part| {
            let stem = part
                .split('.')
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            !part.is_empty()
                && !part.ends_with(['.', ' '])
                && part
                    .bytes()
                    .next()
                    .is_some_and(|b| b.is_ascii_alphanumeric() || b == b'_')
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_. -".contains(&b))
                && !["con", "prn", "aux", "nul"].contains(&stem.as_str())
                && !(stem.len() == 4
                    && (stem.starts_with("com") || stem.starts_with("lpt"))
                    && stem.as_bytes()[3].is_ascii_digit())
        })
}

fn inventory(
    root: &Path,
    current: &Path,
    actual: &mut HashSet<String>,
    count: &mut usize,
    depth: usize,
) -> Result<(), SearchFailure> {
    if depth > 32 {
        return Err(unavailable());
    }
    for entry in fs::read_dir(current).map_err(|_| unavailable())? {
        let path = entry.map_err(|_| unavailable())?.path();
        *count += 1;
        if *count > 1024 {
            return Err(unavailable());
        }
        no_links(&path)?;
        let info = fs::symlink_metadata(&path).map_err(|_| unavailable())?;
        if info.is_dir() {
            inventory(root, &path, actual, count, depth + 1)?;
        } else if info.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| unavailable())?
                .to_str()
                .ok_or_else(unavailable)?
                .replace('\\', "/");
            if !safe_relative(&relative) || !actual.insert(relative) {
                return Err(unavailable());
            }
        } else {
            return Err(unavailable());
        }
    }
    Ok(())
}

fn verify_payload(root: &Path, expected: &str) -> Result<VerifiedPayload, SearchFailure> {
    if !is_hash(expected) {
        return Err(unavailable());
    }
    no_links(root)?;
    let canonical = fs::canonicalize(root).map_err(|_| unavailable())?;
    let directory = locked_file(&canonical, true)?;
    let mut manifest_file = locked_file(&canonical.join("payload.json"), false)?;
    if manifest_file.metadata().map_err(|_| unavailable())?.len() > 1024 * 1024 {
        return Err(unavailable());
    }
    let mut bytes = Vec::new();
    (&mut manifest_file)
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.len() > 1024 * 1024 || hex(Sha256::digest(&bytes).as_slice()) != expected {
        return Err(unavailable());
    }
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
    if manifest.schema_version != 1
        || manifest.engine_commit != ENGINE_COMMIT
        || manifest.target != "x86_64-pc-windows-msvc"
        || manifest.files.len() > 512
    {
        return Err(unavailable());
    }
    let mut declared = HashSet::from(["payload.json".to_owned()]);
    let mut folded = HashSet::from(["payload.json".to_owned()]);
    let mut files = vec![directory, manifest_file];
    for item in manifest.files {
        if !safe_relative(&item.path)
            || !is_hash(&item.sha256)
            || item.size_bytes == 0
            || item.size_bytes > 256 * 1024 * 1024
            || !folded.insert(item.path.to_ascii_lowercase())
            || !declared.insert(item.path.clone())
        {
            return Err(unavailable());
        }
        let mut file = locked_file(&canonical.join(&item.path), false)?;
        if !file.metadata().map_err(|_| unavailable())?.is_file()
            || file.metadata().map_err(|_| unavailable())?.len() != item.size_bytes
        {
            return Err(unavailable());
        }
        let mut hash = Sha256::new();
        let mut size = 0;
        let mut buffer = [0u8; 65536];
        loop {
            let n = file.read(&mut buffer).map_err(|_| unavailable())?;
            if n == 0 {
                break;
            }
            size += n as u64;
            if size > item.size_bytes {
                return Err(unavailable());
            }
            hash.update(&buffer[..n]);
        }
        if size != item.size_bytes || hex(hash.finalize().as_slice()) != item.sha256 {
            return Err(unavailable());
        }
        files.push(file);
    }
    for required in [
        "winsearchd.exe",
        "winsearch-embed.exe",
        "winsearch-extract.exe",
    ] {
        if !declared.contains(required) {
            return Err(unavailable());
        }
    }
    let mut actual = HashSet::new();
    inventory(&canonical, &canonical, &mut actual, &mut 0, 0)?;
    no_links(root)?;
    if declared != actual || fs::canonicalize(root).map_err(|_| unavailable())? != canonical {
        return Err(unavailable());
    }
    Ok(VerifiedPayload {
        root: canonical,
        _files: files,
    })
}

struct Job(isize);
impl Job {
    fn kill(&self) {
        #[cfg(windows)]
        unsafe {
            let _ = windows::Win32::System::JobObjects::TerminateJobObject(
                windows::Win32::Foundation::HANDLE(self.0 as *mut _),
                1,
            );
        }
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(
                self.0 as *mut _,
            ));
        }
    }
}

struct Process {
    client: ws_client::Client,
    child: Mutex<Child>,
    job: Job,
    _payload: VerifiedPayload,
}
impl Process {
    fn alive(&self) -> bool {
        self.child
            .lock()
            .ok()
            .is_some_and(|mut child| matches!(child.try_wait(), Ok(None)))
    }
    fn kill(&self) {
        self.job.kill();
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
    #[cfg(windows)]
    fn release_gate(&self) -> Result<(), SearchFailure> {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows::Win32::{
            Foundation::{ERROR_NO_MORE_FILES, HANDLE},
            System::{
                Diagnostics::ToolHelp::{
                    CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First,
                    Thread32Next,
                },
                Threading::{
                    GetProcessIdOfThread, OpenThread, ResumeThread,
                    THREAD_QUERY_LIMITED_INFORMATION, THREAD_SUSPEND_RESUME,
                },
            },
        };
        let mut child = self.child.lock().map_err(|_| unavailable())?;
        if child.try_wait().map_err(|_| unavailable())?.is_some() {
            return Err(unavailable());
        }
        let snapshot = unsafe {
            OwnedHandle::from_raw_handle(
                CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                    .map_err(|_| unavailable())?
                    .0,
            )
        };
        let handle = HANDLE(snapshot.as_raw_handle());
        let mut entry = THREADENTRY32 {
            dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };
        unsafe { Thread32First(handle, &mut entry) }.map_err(|_| unavailable())?;
        let mut primary = None;
        loop {
            if entry.th32OwnerProcessID == child.id()
                && primary.replace(entry.th32ThreadID).is_some()
            {
                return Err(unavailable());
            }
            match unsafe { Thread32Next(handle, &mut entry) } {
                Ok(()) => {}
                Err(error)
                    if error.code()
                        == windows::core::HRESULT::from_win32(ERROR_NO_MORE_FILES.0) =>
                {
                    break;
                }
                Err(_) => return Err(unavailable()),
            }
        }
        let thread = unsafe {
            OwnedHandle::from_raw_handle(
                OpenThread(
                    THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION,
                    false,
                    primary.ok_or_else(unavailable)?,
                )
                .map_err(|_| unavailable())?
                .0,
            )
        };
        let thread = HANDLE(thread.as_raw_handle());
        if unsafe { GetProcessIdOfThread(thread) } != child.id()
            || unsafe { ResumeThread(thread) } != 1
        {
            return Err(unavailable());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    fn release_gate(&self) -> Result<(), SearchFailure> {
        Err(unavailable())
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        self.kill();
        if let Ok(mut child) = self.child.lock() {
            let _ = child.wait();
        }
    }
}

#[cfg(windows)]
fn current_sid() -> Result<String, SearchFailure> {
    use windows::{
        Win32::{
            Foundation::{CloseHandle, HANDLE, HLOCAL, LocalFree},
            Security::{
                Authorization::ConvertSidToStringSidW, GetTokenInformation, TOKEN_QUERY,
                TOKEN_USER, TokenUser,
            },
            System::Threading::{GetCurrentProcess, OpenProcessToken},
        },
        core::PWSTR,
    };
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token)
            .map_err(|_| unavailable())?;
        let mut needed = 0;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut needed);
        if needed < std::mem::size_of::<TOKEN_USER>() as u32 || needed > 65536 {
            let _ = CloseHandle(token);
            return Err(unavailable());
        }
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
        let result = GetTokenInformation(
            token,
            TokenUser,
            Some(buffer.as_mut_ptr().cast()),
            needed,
            &mut needed,
        );
        let _ = CloseHandle(token);
        result.map_err(|_| unavailable())?;
        let user = std::ptr::read_unaligned(buffer.as_ptr().cast::<TOKEN_USER>());
        let base = buffer.as_ptr() as usize;
        let sid = user.User.Sid.0 as usize;
        if sid < base
            || sid
                .checked_add(8)
                .is_none_or(|end| end > base + buffer.len() * 8)
        {
            return Err(unavailable());
        }
        let sub_count = *(sid as *const u8).add(1) as usize;
        if sub_count > 15 || sid + 8 + sub_count * 4 > base + buffer.len() * 8 {
            return Err(unavailable());
        }
        let mut text = PWSTR::null();
        ConvertSidToStringSidW(user.User.Sid, &mut text).map_err(|_| unavailable())?;
        let result = text.to_string().map_err(|_| unavailable());
        let _ = LocalFree(Some(HLOCAL(text.0.cast())));
        result
    }
}

#[cfg(windows)]
fn spawn_gated(
    payload: VerifiedPayload,
    data: PathBuf,
    instance: String,
) -> Result<Arc<Process>, SearchFailure> {
    use std::os::windows::{ffi::OsStringExt, io::AsRawHandle, process::CommandExt};
    use windows::{
        Win32::{
            Foundation::HANDLE,
            System::{
                JobObjects::{
                    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
                    SetInformationJobObject,
                },
                SystemInformation::GetSystemDirectoryW,
            },
        },
        core::PCWSTR,
    };
    no_links(data.parent().ok_or_else(unavailable)?)?;
    fs::create_dir_all(&data).map_err(|_| unavailable())?;
    no_links(&data)?;
    let temporary = data.join("temp");
    fs::create_dir_all(&temporary).map_err(|_| unavailable())?;
    no_links(&temporary)?;
    let mut system = vec![0u16; 32768];
    let n = unsafe { GetSystemDirectoryW(Some(&mut system)) } as usize;
    if n == 0 || n >= system.len() {
        return Err(unavailable());
    }
    let system = PathBuf::from(std::ffi::OsString::from_wide(&system[..n]));
    let sid = current_sid()?;
    let pipe = format!(r"\\.\pipe\winsearch-{sid}-{instance}");
    let mut command = Command::new(payload.root.join("winsearchd.exe"));
    // OS suspension applies to the pinned release binary as well as debug builds.
    command
        .arg("--defer-root-admission")
        .current_dir(&payload.root)
        .env_clear()
        .env("SystemRoot", system.parent().ok_or_else(unavailable)?)
        .env("WINDIR", system.parent().ok_or_else(unavailable)?)
        .env("PATH", &system)
        .env("TEMP", &temporary)
        .env("TMP", &temporary)
        .env("WINSEARCH_DATA_DIR", &data)
        .env("WINSEARCH_INSTANCE_ID", instance)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000004); // CREATE_NO_WINDOW | CREATE_SUSPENDED
    for key in [
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "ProgramData",
        "ProgramFiles",
        "ProgramFiles(x86)",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    let mut child = command.spawn().map_err(|_| unavailable())?;
    let attach = (|| {
        let handle =
            unsafe { CreateJobObjectW(None, PCWSTR::null()) }.map_err(|_| unavailable())?;
        let job = Job(handle.0 as isize);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                std::ptr::from_ref(&limits).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
            .and_then(|()| AssignProcessToJobObject(handle, HANDLE(child.as_raw_handle())))
        }
        .map_err(|_| unavailable())?;
        let client = ws_client::Client::for_process(
            pipe.clone(),
            NonZeroU32::new(child.id()).ok_or_else(unavailable)?,
        )
        .map_err(|_| unavailable())?;
        Ok::<_, SearchFailure>((job, client))
    })();
    let (job, client) = match attach {
        Ok(value) => value,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    Ok(Arc::new(Process {
        client,
        child: Mutex::new(child),
        job,
        _payload: payload,
    }))
}

#[cfg(not(windows))]
fn spawn_gated(
    _payload: VerifiedPayload,
    _data: PathBuf,
    _instance: String,
) -> Result<Arc<Process>, SearchFailure> {
    Err(unavailable())
}

/// The engine answers only once it has indexed something, is not failed and has no backlog: a
/// partial inventory would otherwise replace the complete local result set.
pub(super) fn engine_ready(status: &ws_client::protocol::EngineStatus) -> bool {
    status.state != ws_client::protocol::EngineRunState::Error
        && status.files_indexed > 0
        && status.queue_depth == 0
}

pub(crate) struct EngineRuntime {
    resources: PathBuf,
    data: PathBuf,
    instance: String,
    process: Mutex<Option<Arc<Process>>>,
    closed: AtomicBool,
    startup: tokio::sync::Mutex<()>,
    /// Last folder policy sent by the host; a restarted engine comes back deferred, so it is re-sent.
    config: Mutex<Option<ws_client::protocol::IndexingConfig>>,
    /// Granted roots with their admission policy, for confining engine results.
    roots: Mutex<Vec<GrantedRoot>>,
    /// Whether background work is currently allowed (no pause, game or battery restriction).
    background_normal: AtomicBool,
    /// Serializes configuration sends so the newest policy is always the last one delivered.
    lane: tokio::sync::Mutex<()>,
    /// Single-flight guard (with a short backoff) for background engine starts triggered by queries.
    warm_up: Mutex<WarmUp>,
}

#[derive(Default)]
struct WarmUp {
    in_flight: bool,
    last_attempt: Option<std::time::Instant>,
}

/// Minimum spacing between query-triggered start attempts while the engine stays down.
const WARM_UP_BACKOFF: std::time::Duration = std::time::Duration::from_secs(5);

/// A folder grant and the policy its results must still satisfy when they are shown.
#[derive(Clone, Debug)]
pub(super) struct GrantedRoot {
    pub path: PathBuf,
    pub policy: super::traversal::TraversalPolicy,
}

/// Engine results must not delay typing: a search never waits for a cold start.
const STATUS_DEADLINE: std::time::Duration = std::time::Duration::from_millis(750);

pub(super) fn indexing_config(
    roots: &[super::indexing::IndexRootRequest],
    background_normal: bool,
) -> ws_client::protocol::IndexingConfig {
    ws_client::protocol::IndexingConfig {
        roots: roots.iter().map(|root| root.path.clone()).collect(),
        root_policies: roots
            .iter()
            .map(|root| ws_client::protocol::RootPolicy {
                root: root.path.clone(),
                exclusions: root.exclusions.clone(),
                include_hidden: root.include_hidden,
                max_file_size_bytes: root.max_file_size_mb.saturating_mul(1024 * 1024),
            })
            .collect(),
        paused: roots.is_empty() || !background_normal,
        ..Default::default()
    }
}

impl EngineRuntime {
    pub(crate) fn new(resources: PathBuf, data: PathBuf) -> Self {
        Self {
            resources,
            data,
            instance: format!("lumen-{}", uuid::Uuid::new_v4().simple()),
            process: Mutex::new(None),
            closed: AtomicBool::new(false),
            startup: tokio::sync::Mutex::new(()),
            config: Mutex::new(None),
            roots: Mutex::new(Vec::new()),
            background_normal: AtomicBool::new(true),
            lane: tokio::sync::Mutex::new(()),
            warm_up: Mutex::new(WarmUp::default()),
        }
    }

    fn live(&self) -> Result<Option<Arc<Process>>, SearchFailure> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(unavailable());
        }
        Ok(self
            .process
            .lock()
            .map_err(|_| unavailable())?
            .as_ref()
            .filter(|p| p.alive())
            .cloned())
    }

    async fn ensure_process(&self) -> Result<Arc<Process>, SearchFailure> {
        if let Some(process) = self.live()? {
            return Ok(process);
        }
        let _startup = self.startup.lock().await;
        if let Some(process) = self.live()? {
            return Ok(process);
        }
        let packaged = self.resources.join("binaries/winsearch");
        let root = match fs::symlink_metadata(&packaged) {
            Err(error)
                if cfg!(debug_assertions) && error.kind() == std::io::ErrorKind::NotFound =>
            {
                Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/winsearch")
            }
            _ => packaged,
        };
        let expected = option_env!("LUMEN_WINSEARCH_MANIFEST_SHA256")
            .unwrap_or_default()
            .to_owned();
        let data = self.data.clone();
        let instance = self.instance.clone();
        let process = tauri::async_runtime::spawn_blocking(move || {
            spawn_gated(verify_payload(&root, &expected)?, data, instance)
        })
        .await
        .map_err(|_| unavailable())??;
        {
            let mut slot = self.process.lock().map_err(|_| unavailable())?;
            if self.closed.load(Ordering::SeqCst) {
                return Err(unavailable());
            }
            let previous = slot.replace(process.clone());
            drop(slot);
            drop(previous);
        }
        if process.release_gate().is_err() {
            process.kill();
            return Err(unavailable());
        }
        if process.client.info().await.is_err() {
            process.kill();
            return Err(unavailable());
        }
        let cached = self.config.lock().ok().and_then(|config| config.clone());
        if let Some(config) = cached {
            // A rejected policy leaves the engine deferred; the local index keeps serving.
            let _ = process.client.set_indexing_config(config).await;
        }
        if self.closed.load(Ordering::SeqCst) {
            process.kill();
            return Err(unavailable());
        }
        Ok(process)
    }

    pub(crate) async fn status(&self) -> Result<ws_client::protocol::EngineStatus, SearchFailure> {
        let process = self.ensure_process().await?;
        process.client.status().await.map_err(|_| unavailable())
    }

    /// Records the host's folder grants synchronously so result confinement is never stale.
    pub(crate) fn remember_roots(
        &self,
        roots: &[super::indexing::IndexRootRequest],
        background_normal: bool,
    ) -> Result<(), SearchFailure> {
        self.background_normal
            .store(background_normal, Ordering::SeqCst);
        let config = indexing_config(roots, background_normal);
        // A root whose policy cannot be enforced locally is never served from the engine.
        let granted = roots
            .iter()
            .filter_map(|root| {
                let bytes = root.max_file_size_mb.checked_mul(1024 * 1024)?;
                let policy = super::traversal::TraversalPolicy::new(
                    root.exclusions.clone(),
                    root.include_hidden,
                    bytes,
                )
                .ok()?;
                Some(GrantedRoot {
                    path: PathBuf::from(&root.path),
                    policy,
                })
            })
            .collect();
        *self.config.lock().map_err(|_| unavailable())? = Some(config);
        *self.roots.lock().map_err(|_| unavailable())? = granted;
        Ok(())
    }

    /// Applies a background-policy change (pause, game, battery) to the cached engine policy.
    /// Returns whether the engine's configuration changed and must be re-sent.
    pub(crate) fn set_background_normal(&self, normal: bool) -> bool {
        if self.background_normal.swap(normal, Ordering::SeqCst) == normal {
            return false;
        }
        let Ok(mut slot) = self.config.lock() else {
            return false;
        };
        let Some(config) = slot.as_mut() else {
            return false;
        };
        config.paused = config.roots.is_empty() || !normal;
        true
    }

    #[cfg(test)]
    pub(super) fn cached_config(&self) -> Option<ws_client::protocol::IndexingConfig> {
        self.config.lock().ok().and_then(|config| config.clone())
    }

    /// Sends the newest cached policy to the (possibly restarted) engine, in order.
    pub(crate) async fn push_config(&self) -> Result<(), SearchFailure> {
        let _lane = self.lane.lock().await;
        let process = self.ensure_process().await?;
        let latest = self.config.lock().map_err(|_| unavailable())?.clone();
        let Some(latest) = latest else {
            return Ok(());
        };
        if process.client.set_indexing_config(latest).await.is_err() {
            // An engine left with stale grants could keep indexing revoked folders. Stopping it is
            // fail-closed: the next start re-sends the newest cached policy.
            process.kill();
            return Err(unavailable());
        }
        Ok(())
    }

    /// Records the host's folder grants and forwards them to the engine.
    pub(crate) async fn configure_roots(
        &self,
        roots: &[super::indexing::IndexRootRequest],
        background_normal: bool,
    ) -> Result<(), SearchFailure> {
        self.remember_roots(roots, background_normal)?;
        self.push_config().await
    }

    pub(super) fn configured_roots(&self) -> Vec<GrantedRoot> {
        self.roots
            .lock()
            .map(|roots| roots.clone())
            .unwrap_or_default()
    }

    /// Claims the right to start the engine in the background; false while a start is running or
    /// the last attempt was moments ago, so typing never piles up start attempts.
    pub(super) fn begin_warm_up(&self) -> bool {
        let Ok(mut state) = self.warm_up.lock() else {
            return false;
        };
        let recent = state
            .last_attempt
            .is_some_and(|at| at.elapsed() < WARM_UP_BACKOFF);
        if state.in_flight || recent {
            return false;
        }
        state.in_flight = true;
        state.last_attempt = Some(std::time::Instant::now());
        true
    }

    pub(super) fn end_warm_up(&self) {
        if let Ok(mut state) = self.warm_up.lock() {
            state.in_flight = false;
        }
    }

    pub(super) fn is_live(&self) -> bool {
        matches!(self.live(), Ok(Some(_)))
    }

    /// Opens an exact/semantic search on the already running engine.
    pub(super) async fn search_stream(
        &self,
        query: ws_client::protocol::SearchQuery,
    ) -> Result<ws_client::SearchStream, SearchFailure> {
        let process = self.live()?.ok_or_else(unavailable)?;
        let status = tokio::time::timeout(STATUS_DEADLINE, process.client.status())
            .await
            .map_err(|_| unavailable())?
            .map_err(|_| unavailable())?;
        if !engine_ready(&status) {
            return Err(unavailable());
        }
        process
            .client
            .search(query)
            .await
            .map_err(|_| unavailable())
    }

    pub(crate) fn shutdown(&self) {
        self.closed.store(true, Ordering::SeqCst);
        if let Ok(slot) = self.process.lock()
            && let Some(process) = slot.as_ref()
        {
            process.kill();
        }
    }
}

impl Drop for EngineRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[tauri::command]
pub(crate) async fn get_winsearch_engine_status(
    runtime: tauri::State<'_, EngineRuntime>,
) -> Result<ws_client::protocol::EngineStatus, SearchFailure> {
    runtime.status().await
}

#[cfg(test)]
#[path = "winsearch_engine_tests.rs"]
mod tests;
