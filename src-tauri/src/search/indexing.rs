use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use super::extraction::extract_document;
use super::index::{IndexDatabase, IndexedDocument, IndexedHit};
use super::root_policy::canonicalize_root;
use super::traversal;
use super::types::SearchFailure;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexRootRequest {
    pub path: String,
    #[serde(default)]
    pub cloud_enrichment: bool,
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
    synchronization: Arc<Mutex<()>>,
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
            synchronization: Arc::new(Mutex::new(())),
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

    pub(crate) fn answer_context(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<IndexedHit>, SearchFailure> {
        let _synchronization = self
            .synchronization
            .lock()
            .map_err(|error| search_failure("lock the indexing worker", error))?;
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

    fn synchronize(&self, roots: Vec<IndexRootRequest>) -> Result<IndexStatus, SearchFailure> {
        let _synchronization = self
            .synchronization
            .lock()
            .map_err(|error| search_failure("lock the indexing worker", error))?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.set_status(IndexStatus {
            phase: "indexing".to_owned(),
            indexed_items: self.snapshot().indexed_items,
            queued_enrichment: self.snapshot().queued_enrichment,
            skipped_items: 0,
            message: "Updating local content index".to_owned(),
        });

        let mut indexed_items = 0_u64;
        let mut skipped_items = 0_u64;
        let mut inventory = HashMap::<String, HashSet<String>>::new();
        for requested_root in roots {
            if self.generation.load(Ordering::SeqCst) != generation {
                return Ok(self.snapshot());
            }
            let root = canonicalize_root(Path::new(&requested_root.path))?;
            let root_key = root.to_string_lossy().into_owned();
            inventory.entry(root_key.clone()).or_default();
            let outcome = traversal::traverse(&root)?;
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
                let id = stable_id(&root, &path);
                inventory
                    .entry(root_key.clone())
                    .or_default()
                    .insert(id.clone());
                let document = IndexedDocument {
                    stable_id: id.clone(),
                    path,
                    content_hash: extracted.content_hash,
                    extraction_version: extracted.extraction_version,
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
        self.set_status(status.clone());
        Ok(status)
    }
}

#[tauri::command]
pub fn get_index_status(state: State<'_, IndexRuntime>) -> IndexStatus {
    state.snapshot()
}

#[tauri::command]
pub async fn synchronize_index_roots(
    state: State<'_, IndexRuntime>,
    enrichment: State<'_, crate::gateway::EnrichmentSupervisor>,
    roots: Vec<IndexRootRequest>,
) -> Result<IndexStatus, SearchFailure> {
    let runtime = state.inner().clone();
    let worker_runtime = runtime.clone();
    let status = tauri::async_runtime::spawn_blocking(move || worker_runtime.synchronize(roots))
        .await
        .map_err(|error| search_failure("join the indexing worker", error))??;
    if let Ok(jobs) = runtime.pending_enrichment() {
        enrichment.inner().sync_jobs(&jobs).await;
    }
    Ok(status)
}

#[tauri::command]
pub async fn search_indexed(
    state: State<'_, IndexRuntime>,
    query: String,
    limit: usize,
) -> Result<Vec<IndexedHit>, SearchFailure> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _synchronization = runtime
            .synchronization
            .lock()
            .map_err(|error| search_failure("lock the indexing worker", error))?;
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
    tauri::async_runtime::spawn_blocking(move || {
        let _synchronization = runtime
            .synchronization
            .lock()
            .map_err(|error| search_failure("lock the indexing worker", error))?;
        runtime.generation.fetch_add(1, Ordering::SeqCst);
        runtime
            .database
            .delete_all()
            .map_err(|error| search_failure("delete generated index data", error))?;
        let status = IndexStatus {
            phase: "ready".to_owned(),
            indexed_items: 0,
            queued_enrichment: 0,
            skipped_items: 0,
            message: "Local index data deleted; source files were not changed".to_owned(),
        };
        runtime.set_status(status.clone());
        Ok(status)
    })
    .await
    .map_err(|error| search_failure("join the index deletion worker", error))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn cloud_jobs_require_explicit_root_consent() {
        let fixture = SearchFixture::new("index-runtime-consent");
        fixture.file("scan.png", &[0, 1, 2]);
        let database_path = fixture.root().join("index.sqlite");
        let runtime = IndexRuntime::open(&database_path).unwrap();

        let private = runtime
            .synchronize(vec![IndexRootRequest {
                path: fixture.root().to_string_lossy().into_owned(),
                cloud_enrichment: false,
            }])
            .unwrap();
        assert_eq!(private.queued_enrichment, 0);

        let consented = runtime
            .synchronize(vec![IndexRootRequest {
                path: fixture.root().to_string_lossy().into_owned(),
                cloud_enrichment: true,
            }])
            .unwrap();
        assert_eq!(consented.queued_enrichment, 1);
    }
}
