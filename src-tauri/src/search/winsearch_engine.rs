use super::SearchFailure;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
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
    fn release_gate(&self) -> Result<(), SearchFailure> {
        let input = self.child.lock().map_err(|_| unavailable())?.stdin.take();
        input
            .ok_or_else(unavailable)?
            .write_all(&[1])
            .map_err(|_| unavailable())
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
    // The existing stdin barrier holds initialization until job assignment.
    command
        .args(["--test-stdin-gate", "--defer-root-admission"])
        .current_dir(&payload.root)
        .env_clear()
        .env("SystemRoot", system.parent().ok_or_else(unavailable)?)
        .env("WINDIR", system.parent().ok_or_else(unavailable)?)
        .env("PATH", &system)
        .env("TEMP", &temporary)
        .env("TMP", &temporary)
        .env("WINSEARCH_DATA_DIR", &data)
        .env("WINSEARCH_INSTANCE_ID", instance)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000);
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

pub(crate) struct EngineRuntime {
    resources: PathBuf,
    data: PathBuf,
    instance: String,
    process: Mutex<Option<Arc<Process>>>,
    closed: AtomicBool,
    startup: tokio::sync::Mutex<()>,
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
