use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use super::extraction::extract_document;
use super::index::{
    EnrichmentArtifact, EnrichmentLease, IndexDatabase, IndexedDocument, IndexedHit,
};
use super::root_policy::{canonicalize_confined, canonicalize_root};
use super::traversal;
use super::types::SearchFailure;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexRootRequest {
    pub path: String,
    #[serde(default)]
    pub cloud_enrichment: bool,
    #[serde(default)]
    pub exclusions: Vec<String>,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default = "default_max_file_size_mb")]
    pub max_file_size_mb: u64,
}

const MAX_EXCLUSION_PATTERNS: usize = 256;
const MAX_EXCLUSION_PATTERN_CHARS: usize = 256;
const MAX_CONFIGURED_FILE_SIZE_MB: u64 = 10_240;

const fn default_max_file_size_mb() -> u64 {
    256
}

impl IndexRootRequest {
    fn traversal_policy(&self) -> Result<traversal::TraversalPolicy, SearchFailure> {
        if self.exclusions.len() > MAX_EXCLUSION_PATTERNS {
            return Err(SearchFailure::new(
                "search-failed",
                "An indexed root has too many exclusion patterns.",
                Some(Path::new(&self.path)),
            ));
        }
        for exclusion in &self.exclusions {
            let trimmed = exclusion.trim();
            if trimmed.is_empty()
                || trimmed.chars().count() > MAX_EXCLUSION_PATTERN_CHARS
                || trimmed.contains('\0')
                || trimmed.contains("..")
                || trimmed.starts_with('/')
                || trimmed.starts_with('\\')
                || trimmed.as_bytes().get(1) == Some(&b':')
            {
                return Err(SearchFailure::new(
                    "search-failed",
                    "Indexed-root exclusions must be short relative patterns without parent traversal.",
                    Some(Path::new(&self.path)),
                ));
            }
        }
        if !(1..=MAX_CONFIGURED_FILE_SIZE_MB).contains(&self.max_file_size_mb) {
            return Err(SearchFailure::new(
                "search-failed",
                "The indexed-root file-size limit is outside the supported range.",
                Some(Path::new(&self.path)),
            ));
        }
        let max_file_size_bytes =
            self.max_file_size_mb
                .checked_mul(1024 * 1024)
                .ok_or_else(|| {
                    SearchFailure::new(
                        "search-failed",
                        "The indexed-root file-size limit is too large.",
                        Some(Path::new(&self.path)),
                    )
                })?;
        Ok(traversal::TraversalPolicy {
            include_hidden: self.include_hidden,
            exclusions: self.exclusions.clone(),
            max_file_size_bytes,
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub phase: String,
    pub indexed_items: u64,
    pub queued_enrichment: u64,
    pub skipped_items: u64,
    pub message: String,
}

#[derive(Clone)]
pub struct IndexRuntime {
    database: Arc<IndexDatabase>,
    status: Arc<Mutex<IndexStatus>>,
    generation: Arc<AtomicU64>,
    operation_control: Arc<Mutex<()>>,
    mutations: Arc<Mutex<()>>,
}

fn search_failure(operation: &str, error: impl std::fmt::Display) -> SearchFailure {
    SearchFailure::new(
        "search-failed",
        format!("Could not {operation}: {error}"),
        None,
    )
}

fn stable_id(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let identity = format!(
        "{}\0{}",
        root.to_string_lossy().replace('\\', "/").to_lowercase(),
        relative.to_string_lossy().replace('\\', "/").to_lowercase(),
    );
    let digest = Sha256::digest(identity.as_bytes());
    let suffix = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("indexed:{suffix}")
}

fn enforce_cloud_consent(
    roots: Vec<IndexRootRequest>,
    cloud_consent: bool,
) -> Vec<IndexRootRequest> {
    roots
        .into_iter()
        .map(|mut root| {
            root.cloud_enrichment &= cloud_consent;
            root
        })
        .collect()
}

impl IndexRuntime {
    pub fn open(path: &Path) -> Result<Self, SearchFailure> {
        let database =
            IndexDatabase::open(path).map_err(|error| search_failure("open the index", error))?;
        let (indexed_items, queued_enrichment) = database
            .counts()
            .map_err(|error| search_failure("read index status", error))?;
        Ok(Self {
            database: Arc::new(database),
            status: Arc::new(Mutex::new(IndexStatus {
                phase: "ready".to_owned(),
                indexed_items,
                queued_enrichment,
                skipped_items: 0,
                message: "Local index ready".to_owned(),
            })),
            generation: Arc::new(AtomicU64::new(0)),
            operation_control: Arc::new(Mutex::new(())),
            mutations: Arc::new(Mutex::new(())),
        })
    }

    fn snapshot(&self) -> IndexStatus {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    fn set_status(&self, status: IndexStatus) {
        *self
            .status
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = status;
    }

    fn begin_operation(&self, phase: &str, message: &str) -> Result<u64, SearchFailure> {
        let _control = self
            .operation_control
            .lock()
            .map_err(|error| search_failure("start the indexing operation", error))?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let previous = self.snapshot();
        self.set_status(IndexStatus {
            phase: phase.to_owned(),
            indexed_items: previous.indexed_items,
            queued_enrichment: previous.queued_enrichment,
            skipped_items: 0,
            message: message.to_owned(),
        });
        Ok(generation)
    }

    fn set_status_for_generation(
        &self,
        generation: u64,
        status: IndexStatus,
    ) -> Result<bool, SearchFailure> {
        let _control = self
            .operation_control
            .lock()
            .map_err(|error| search_failure("publish the indexing status", error))?;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(false);
        }
        self.set_status(status);
        Ok(true)
    }

    pub(crate) fn answer_context(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<IndexedHit>, SearchFailure> {
        self.database
            .search(query, limit)
            .map_err(|error| search_failure("build answer context", error))
    }

    pub(crate) fn pending_enrichment(
        &self,
    ) -> Result<Vec<super::EnrichmentJobRecord>, SearchFailure> {
        self.database
            .queued_jobs()
            .map_err(|error| search_failure("read enrichment jobs", error))
    }

    pub(crate) fn enrichment_queue_status(&self) -> Result<serde_json::Value, SearchFailure> {
        self.database
            .enrichment_status_counts()
            .map(|counts| {
                serde_json::Value::Array(
                    counts
                        .into_iter()
                        .map(
                            |(status, count)| serde_json::json!({"status": status, "count": count}),
                        )
                        .collect(),
                )
            })
            .map_err(|error| search_failure("read enrichment queue status", error))
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    pub(crate) fn lease_enrichment(
        &self,
        cloud_consent: bool,
        now: i64,
    ) -> Result<Option<EnrichmentLease>, SearchFailure> {
        if !cloud_consent {
            return Ok(None);
        }
        let generation = self.generation();
        let mut lease = self
            .database
            .lease_enrichment(now)
            .map_err(|error| search_failure("lease enrichment work", error))?;
        if self.generation() != generation {
            if let Some(stale) = &lease {
                let _ = self.database.retry_enrichment(
                    stale,
                    now,
                    true,
                    "The index changed while enrichment work was leased",
                );
            }
            return Ok(None);
        }
        if let Some(lease) = &mut lease {
            lease.generation = generation;
        }
        Ok(lease)
    }

    pub(crate) fn retry_enrichment(
        &self,
        lease: &EnrichmentLease,
        now: i64,
        retryable: bool,
        error: &str,
    ) -> Result<bool, SearchFailure> {
        self.database
            .retry_enrichment(lease, now, retryable, error)
            .map_err(|error| search_failure("retry enrichment work", error))
    }

    pub(crate) fn next_enrichment_wake(&self, now: i64) -> Result<Option<i64>, SearchFailure> {
        self.database
            .next_enrichment_wake(now)
            .map_err(|error| search_failure("schedule enrichment work", error))
    }

    pub(crate) fn load_enrichment_input(
        &self,
        lease: &EnrichmentLease,
        max_bytes: u64,
    ) -> Result<Vec<u8>, SearchFailure> {
        if self.generation() != lease.generation {
            return Err(SearchFailure::new(
                "enrichment-invalidated",
                "The index changed before enrichment upload.",
                Some(&lease.path),
            ));
        }
        let link_metadata = fs::symlink_metadata(&lease.path).map_err(|error| {
            SearchFailure::from_io("inspect enrichment input", &lease.path, &error)
        })?;
        if link_metadata.file_type().is_symlink() {
            return Err(SearchFailure::new(
                "permission-denied",
                "Enrichment inputs cannot be symbolic links.",
                Some(&lease.path),
            ));
        }
        let path = canonicalize_confined(&lease.root_path, &lease.path)?;
        let metadata = fs::metadata(&path)
            .map_err(|error| SearchFailure::from_io("inspect enrichment input", &path, &error))?;
        if !metadata.is_file() || metadata.len() > max_bytes {
            return Err(SearchFailure::new(
                "enrichment-input-too-large",
                "The enrichment input exceeds its upload limit.",
                Some(&path),
            ));
        }
        let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or_default());
        File::open(&path)
            .map_err(|error| SearchFailure::from_io("read enrichment input", &path, &error))?
            .take(max_bytes.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|error| SearchFailure::from_io("read enrichment input", &path, &error))?;
        if bytes.len() as u64 > max_bytes {
            return Err(SearchFailure::new(
                "enrichment-input-too-large",
                "The enrichment input exceeds its upload limit.",
                Some(&path),
            ));
        }
        let hash = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        if hash != lease.content_hash {
            return Err(SearchFailure::new(
                "enrichment-invalidated",
                "The source file changed before enrichment upload.",
                Some(&path),
            ));
        }
        Ok(bytes)
    }

    pub(crate) fn complete_enrichment(
        &self,
        lease: &EnrichmentLease,
        artifact: &EnrichmentArtifact,
        cloud_consent: bool,
        now: i64,
    ) -> Result<bool, SearchFailure> {
        let _control = self
            .operation_control
            .lock()
            .map_err(|error| search_failure("validate enrichment completion", error))?;
        if !cloud_consent || self.generation() != lease.generation {
            return Ok(false);
        }
        self.database
            .complete_enrichment(lease, artifact, now)
            .map_err(|error| search_failure("apply enrichment artifact", error))
    }

    fn synchronize(&self, roots: Vec<IndexRootRequest>) -> Result<IndexStatus, SearchFailure> {
        let generation = self.begin_operation("indexing", "Updating local content index")?;
        let _mutation = match self.mutations.lock() {
            Ok(mutation) => mutation,
            Err(error) => {
                let failure = search_failure("lock index mutations", error);
                let current = self.snapshot();
                self.set_status_for_generation(
                    generation,
                    IndexStatus {
                        phase: "degraded".to_owned(),
                        indexed_items: current.indexed_items,
                        queued_enrichment: current.queued_enrichment,
                        skipped_items: current.skipped_items,
                        message: failure.message.clone(),
                    },
                )?;
                return Err(failure);
            }
        };
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(self.snapshot());
        }

        let result = self.synchronize_generation(generation, roots);
        if let Err(error) = &result {
            let current = self.snapshot();
            self.set_status_for_generation(
                generation,
                IndexStatus {
                    phase: "degraded".to_owned(),
                    indexed_items: current.indexed_items,
                    queued_enrichment: current.queued_enrichment,
                    skipped_items: current.skipped_items,
                    message: error.message.clone(),
                },
            )?;
        }
        result
    }

    #[cfg(test)]
    pub(crate) fn synchronize_for_test(
        &self,
        roots: Vec<IndexRootRequest>,
    ) -> Result<IndexStatus, SearchFailure> {
        self.synchronize(roots)
    }

    fn synchronize_generation(
        &self,
        generation: u64,
        roots: Vec<IndexRootRequest>,
    ) -> Result<IndexStatus, SearchFailure> {
        let mut canonical_roots = Vec::with_capacity(roots.len());
        for requested_root in roots {
            let policy = requested_root.traversal_policy()?;
            let root = canonicalize_root(Path::new(&requested_root.path))?;
            if canonical_roots.iter().any(
                |(_, existing, _): &(IndexRootRequest, PathBuf, traversal::TraversalPolicy)| {
                    root.starts_with(existing) || existing.starts_with(&root)
                },
            ) {
                return Err(SearchFailure::new(
                    "search-failed",
                    format!("Indexed roots cannot overlap: {}", root.to_string_lossy()),
                    Some(&root),
                ));
            }
            canonical_roots.push((requested_root, root, policy));
        }

        let mut indexed_items = 0_u64;
        let mut skipped_items = 0_u64;
        let mut inventory = HashMap::<String, HashSet<String>>::new();
        for (requested_root, root, policy) in canonical_roots {
            if self.generation.load(Ordering::SeqCst) != generation {
                return Ok(self.snapshot());
            }
            let root_key = root.to_string_lossy().into_owned();
            inventory.entry(root_key.clone()).or_default();
            let outcome = traversal::traverse_with_policy(&root, &policy)?;
            skipped_items = skipped_items.saturating_add(outcome.warnings.len() as u64);
            for record in outcome.records {
                if self.generation.load(Ordering::SeqCst) != generation {
                    return Ok(self.snapshot());
                }
                let path = PathBuf::from(&record.path);
                if path.is_dir() {
                    continue;
                }
                let extracted = match extract_document(&path) {
                    Ok(value) => value,
                    Err(_) => {
                        skipped_items = skipped_items.saturating_add(1);
                        continue;
                    }
                };
                if self.generation.load(Ordering::SeqCst) != generation {
                    return Ok(self.snapshot());
                }
                let id = stable_id(&root, &path);
                inventory
                    .entry(root_key.clone())
                    .or_default()
                    .insert(id.clone());
                let document = IndexedDocument {
                    stable_id: id.clone(),
                    path,
                    content_hash: extracted.content_hash,
                    extraction_version: format!(
                        "{};cloud-enrichment={}",
                        extracted.extraction_version, requested_root.cloud_enrichment
                    ),
                    chunks: extracted.chunks,
                };
                self.database
                    .upsert_document(&root, &document)
                    .map_err(|error| search_failure("update the index", error))?;
                indexed_items = indexed_items.saturating_add(1);
                if requested_root.cloud_enrichment
                    && let Some(kind) = extracted.pending_enrichment
                {
                    let route = if kind == "ocr" {
                        "lumen.vision.cloud"
                    } else {
                        "lumen.audio.cloud"
                    };
                    self.database
                        .enqueue_enrichment(&id, &kind, route)
                        .map_err(|error| search_failure("queue enrichment", error))?;
                }
            }
        }
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(self.snapshot());
        }
        self.database
            .retain_inventory(&inventory)
            .map_err(|error| search_failure("remove stale index inventory", error))?;
        let (stored_items, queued_enrichment) = self
            .database
            .counts()
            .map_err(|error| search_failure("read index status", error))?;
        let status = IndexStatus {
            phase: "ready".to_owned(),
            indexed_items: stored_items,
            queued_enrichment,
            skipped_items,
            message: format!("Indexed {indexed_items} local items"),
        };
        if self.set_status_for_generation(generation, status.clone())? {
            Ok(status)
        } else {
            Ok(self.snapshot())
        }
    }

    fn delete_generation(&self, generation: u64) -> Result<IndexStatus, SearchFailure> {
        let _mutation = match self.mutations.lock() {
            Ok(mutation) => mutation,
            Err(error) => {
                let failure = search_failure("lock index mutations", error);
                let current = self.snapshot();
                self.set_status_for_generation(
                    generation,
                    IndexStatus {
                        phase: "degraded".to_owned(),
                        indexed_items: current.indexed_items,
                        queued_enrichment: current.queued_enrichment,
                        skipped_items: current.skipped_items,
                        message: failure.message.clone(),
                    },
                )?;
                return Err(failure);
            }
        };
        if self.generation.load(Ordering::SeqCst) != generation {
            return Ok(self.snapshot());
        }
        if let Err(error) = self.database.delete_all() {
            let failure = search_failure("delete generated index data", error);
            let current = self.snapshot();
            self.set_status_for_generation(
                generation,
                IndexStatus {
                    phase: "degraded".to_owned(),
                    indexed_items: current.indexed_items,
                    queued_enrichment: current.queued_enrichment,
                    skipped_items: current.skipped_items,
                    message: failure.message.clone(),
                },
            )?;
            return Err(failure);
        }
        let status = IndexStatus {
            phase: "ready".to_owned(),
            indexed_items: 0,
            queued_enrichment: 0,
            skipped_items: 0,
            message: "Local index data deleted; source files were not changed".to_owned(),
        };
        if self.set_status_for_generation(generation, status.clone())? {
            Ok(status)
        } else {
            Ok(self.snapshot())
        }
    }
}

#[tauri::command]
pub fn get_index_status(state: State<'_, IndexRuntime>) -> IndexStatus {
    state.snapshot()
}

#[tauri::command]
pub async fn synchronize_index_roots(
    app: AppHandle,
    roots: Vec<IndexRootRequest>,
) -> Result<IndexStatus, SearchFailure> {
    let runtime = app.state::<IndexRuntime>().inner().clone();
    let persisted_consent = app
        .state::<crate::consent::PersistedConsent>()
        .inner()
        .clone();
    let cloud_consent = persisted_consent.answer_granted();
    let roots = enforce_cloud_consent(roots, cloud_consent);
    let worker_runtime = runtime.clone();
    let status = tauri::async_runtime::spawn_blocking(move || worker_runtime.synchronize(roots))
        .await
        .map_err(|error| search_failure("join the indexing worker", error))??;
    crate::gateway::enrichment::schedule_enrichment_drain(app);
    Ok(status)
}

#[tauri::command]
pub async fn search_indexed(
    state: State<'_, IndexRuntime>,
    query: String,
    limit: usize,
) -> Result<Vec<IndexedHit>, SearchFailure> {
    super::validate_search_query(&query)?;
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime
            .database
            .search(&query, limit.min(10_000))
            .map_err(|error| search_failure("search the local index", error))
    })
    .await
    .map_err(|error| search_failure("join the index search", error))?
}

#[tauri::command]
pub async fn delete_index_data(
    state: State<'_, IndexRuntime>,
) -> Result<IndexStatus, SearchFailure> {
    let runtime = state.inner().clone();
    let generation = runtime.begin_operation("deleting", "Deleting generated local index data")?;
    tauri::async_runtime::spawn_blocking(move || runtime.delete_generation(generation))
        .await
        .map_err(|error| search_failure("join the index deletion worker", error))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

    fn root_request(path: &Path, cloud_enrichment: bool) -> IndexRootRequest {
        IndexRootRequest {
            path: path.to_string_lossy().into_owned(),
            cloud_enrichment,
            exclusions: Vec::new(),
            include_hidden: false,
            max_file_size_mb: default_max_file_size_mb(),
        }
    }

    #[test]
    fn cloud_jobs_require_explicit_root_consent() {
        let fixture = SearchFixture::new("index-runtime-consent");
        fixture.file("scan.png", &[0, 1, 2]);
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();

        let private = runtime
            .synchronize(vec![root_request(fixture.root(), false)])
            .unwrap();
        assert_eq!(private.queued_enrichment, 0);

        let consented = runtime
            .synchronize(vec![root_request(fixture.root(), true)])
            .unwrap();
        assert_eq!(consented.queued_enrichment, 1);

        let revoked = runtime
            .synchronize(vec![root_request(fixture.root(), false)])
            .unwrap();
        assert_eq!(revoked.queued_enrichment, 0);
    }

    #[test]
    fn persisted_cloud_consent_is_a_second_required_gate() {
        let requested = vec![root_request(Path::new("C:\\documents"), true)];

        assert!(enforce_cloud_consent(requested.clone(), true)[0].cloud_enrichment);
        assert!(!enforce_cloud_consent(requested, false)[0].cloud_enrichment);
    }

    #[test]
    fn overlapping_roots_fail_before_writing_duplicate_paths() {
        let fixture = SearchFixture::new("index-runtime-overlap");
        let nested = fixture.root().join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("notes.txt"), b"nested notes").unwrap();
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();

        let error = runtime
            .synchronize(vec![
                root_request(fixture.root(), false),
                root_request(&nested, false),
            ])
            .unwrap_err();

        assert!(error.message.contains("cannot overlap"));
        assert_eq!(runtime.snapshot().phase, "degraded");
        assert_eq!(runtime.database.counts().unwrap().0, 0);
    }

    #[test]
    fn synchronization_failure_publishes_a_degraded_status() {
        let fixture = SearchFixture::new("index-runtime-failure-status");
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();

        let missing = fixture.root().join("missing");
        let error = runtime
            .synchronize(vec![root_request(&missing, false)])
            .unwrap_err();

        let status = runtime.snapshot();
        assert_eq!(status.phase, "degraded");
        assert_eq!(status.message, error.message);
    }

    #[test]
    fn stale_generation_cannot_write_or_publish_terminal_status() {
        let fixture = SearchFixture::new("index-runtime-stale-generation");
        fixture.file("notes.txt", b"generation guarded notes");
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();
        let stale_generation = runtime
            .begin_operation("indexing", "First synchronization")
            .unwrap();
        let current_generation = runtime
            .begin_operation("indexing", "Replacement synchronization")
            .unwrap();

        let status = runtime
            .synchronize_generation(stale_generation, vec![root_request(fixture.root(), false)])
            .unwrap();

        assert_eq!(
            runtime.generation.load(Ordering::SeqCst),
            current_generation
        );
        assert_eq!(status.phase, "indexing");
        assert_eq!(status.message, "Replacement synchronization");
        assert_eq!(runtime.database.counts().unwrap().0, 0);
        assert!(
            !runtime
                .set_status_for_generation(
                    stale_generation,
                    IndexStatus {
                        phase: "ready".to_owned(),
                        indexed_items: 99,
                        queued_enrichment: 0,
                        skipped_items: 0,
                        message: "Stale completion".to_owned(),
                    },
                )
                .unwrap()
        );
        assert_eq!(runtime.snapshot().message, "Replacement synchronization");
    }

    #[test]
    fn newer_synchronization_supersedes_a_queued_delete() {
        let fixture = SearchFixture::new("index-runtime-stale-delete");
        fixture.file("notes.txt", b"preserve the current generation");
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();
        runtime
            .synchronize(vec![root_request(fixture.root(), false)])
            .unwrap();
        let indexed_before = runtime.database.counts().unwrap().0;
        assert!(indexed_before > 0);

        let delete_generation = runtime
            .begin_operation("deleting", "Queued deletion")
            .unwrap();
        let synchronize_generation = runtime
            .begin_operation("indexing", "Newer synchronization")
            .unwrap();
        let status = runtime.delete_generation(delete_generation).unwrap();

        assert_eq!(
            runtime.generation.load(Ordering::SeqCst),
            synchronize_generation
        );
        assert_eq!(runtime.database.counts().unwrap().0, indexed_before);
        assert_eq!(status.phase, "indexing");
        assert_eq!(status.message, "Newer synchronization");
    }

    #[test]
    fn enrichment_completion_rejects_a_stale_index_generation() {
        let fixture = SearchFixture::new("enrichment-generation");
        fixture.file("scan.png", &[0, 1, 2, 3]);
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();
        runtime
            .synchronize(vec![root_request(fixture.root(), true)])
            .unwrap();
        let lease = runtime.lease_enrichment(true, 1_000).unwrap().unwrap();
        runtime
            .begin_operation("indexing", "Replacement synchronization")
            .unwrap();

        assert!(
            !runtime
                .complete_enrichment(
                    &lease,
                    &EnrichmentArtifact {
                        provider: "mock".to_owned(),
                        model: "lumen.vision.cloud".to_owned(),
                        text: "stale OCR text".to_owned(),
                        page: None,
                        time_start_ms: None,
                        time_end_ms: None,
                    },
                    true,
                    1_001,
                )
                .unwrap()
        );
        assert!(runtime.answer_context("stale", 10).unwrap().is_empty());
    }

    #[test]
    fn enrichment_upload_rejects_a_source_changed_after_indexing() {
        let fixture = SearchFixture::new("enrichment-source-hash");
        let path = fixture.file("scan.png", b"indexed image bytes");
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();
        runtime
            .synchronize(vec![root_request(fixture.root(), true)])
            .unwrap();
        let lease = runtime.lease_enrichment(true, 1_000).unwrap().unwrap();
        std::fs::write(path, b"changed image bytes").unwrap();

        let error = runtime
            .load_enrichment_input(&lease, 4 * 1024 * 1024)
            .unwrap_err();
        assert_eq!(error.code, "enrichment-invalidated");
        assert!(error.message.contains("changed"));
    }

    #[test]
    fn enrichment_completion_requires_current_persisted_consent() {
        let fixture = SearchFixture::new("enrichment-completion-consent");
        fixture.file("scan.png", b"indexed image bytes");
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();
        runtime
            .synchronize(vec![root_request(fixture.root(), true)])
            .unwrap();
        let lease = runtime.lease_enrichment(true, 1_000).unwrap().unwrap();

        assert!(
            !runtime
                .complete_enrichment(
                    &lease,
                    &EnrichmentArtifact {
                        provider: "mock".to_owned(),
                        model: "lumen.vision.cloud".to_owned(),
                        text: "must not be applied".to_owned(),
                        page: None,
                        time_start_ms: None,
                        time_end_ms: None,
                    },
                    false,
                    1_001,
                )
                .unwrap()
        );
        assert!(runtime.answer_context("applied", 10).unwrap().is_empty());
    }
}
