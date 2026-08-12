use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use super::extraction::extract_document;
use super::index::{
    DeletedIndexData, HistoryClearResult, HistoryStatus, IndexDatabase, IndexedDocument,
    IndexedHit, VectorStatus,
};
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDiagnostics {
    pub indexed_files: u64,
    pub indexed_chunks: u64,
    pub history_entries: u64,
    pub history_enabled: bool,
    pub vector: VectorStatus,
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
    pub fn open(
        path: &Path,
        vector_extension: &Path,
        history_enabled: bool,
    ) -> Result<Self, SearchFailure> {
        let database = IndexDatabase::open(path, vector_extension)
            .map_err(|error| search_failure("open the index", error))?;
        database.set_history_enabled(history_enabled);
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

    fn set_history_enabled(&self, enabled: bool) {
        self.database.set_history_enabled(enabled);
    }

    fn history_status(&self) -> Result<HistoryStatus, SearchFailure> {
        self.database
            .history_status()
            .map_err(|error| search_failure("read search history status", error))
    }

    fn clear_history(&self) -> Result<HistoryClearResult, SearchFailure> {
        self.database
            .clear_history()
            .map_err(|error| search_failure("clear search history", error))
    }

    fn native_diagnostics(&self) -> Result<NativeDiagnostics, SearchFailure> {
        let (indexed_files, indexed_chunks) = self
            .database
            .operational_counts()
            .map_err(|error| search_failure("read index diagnostics", error))?;
        let history = self.history_status()?;
        Ok(NativeDiagnostics {
            indexed_files,
            indexed_chunks,
            history_entries: history.entry_count,
            history_enabled: history.enabled,
            vector: self.database.vector_status(),
        })
    }

    fn delete_indexed_content(&self) -> Result<DeletedIndexData, SearchFailure> {
        let _synchronization = self
            .synchronization
            .lock()
            .map_err(|error| search_failure("lock the indexing worker", error))?;
        self.generation.fetch_add(1, Ordering::SeqCst);
        let deleted = self
            .database
            .delete_indexed_content()
            .map_err(|error| search_failure("delete generated index data", error))?;
        self.set_status(IndexStatus {
            phase: "ready".to_owned(),
            indexed_items: 0,
            queued_enrichment: 0,
            skipped_items: 0,
            message: "Local index data deleted; source files were not changed".to_owned(),
        });
        Ok(deleted)
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
        let hits = runtime
            .database
            .search(&query, limit.min(10_000))
            .map_err(|error| search_failure("search the local index", error))?;
        runtime
            .database
            .record_user_query(&query, !hits.is_empty())
            .map_err(|error| search_failure("record search history", error))?;
        Ok(hits)
    })
    .await
    .map_err(|error| search_failure("join the index search", error))?
}

#[tauri::command]
pub fn set_history_enabled(state: State<'_, IndexRuntime>, enabled: bool) {
    state.set_history_enabled(enabled);
}

#[tauri::command]
pub fn get_search_history_status(
    state: State<'_, IndexRuntime>,
) -> Result<HistoryStatus, SearchFailure> {
    state.history_status()
}

#[tauri::command]
pub fn clear_search_history(
    state: State<'_, IndexRuntime>,
) -> Result<HistoryClearResult, SearchFailure> {
    state.clear_history()
}

#[tauri::command]
pub fn get_native_diagnostics(
    state: State<'_, IndexRuntime>,
) -> Result<NativeDiagnostics, SearchFailure> {
    state.native_diagnostics()
}

#[tauri::command]
pub async fn delete_index_data(
    state: State<'_, IndexRuntime>,
) -> Result<DeletedIndexData, SearchFailure> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.delete_indexed_content())
        .await
        .map_err(|error| search_failure("join the index deletion worker", error))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn runtime_history_and_diagnostics_are_durable_and_redacted() {
        let fixture = SearchFixture::new("runtime-privacy-data");
        fixture.file("private-report.txt", b"quarterly private report");
        let database_path = fixture.root().parent().unwrap().join("index.sqlite");
        let vector_extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let runtime = IndexRuntime::open(&database_path, &vector_extension, false).unwrap();
        runtime
            .synchronize(vec![IndexRootRequest {
                path: fixture.root().to_string_lossy().into_owned(),
                cloud_enrichment: false,
            }])
            .unwrap();

        assert_eq!(runtime.answer_context("quarterly", 10).unwrap().len(), 1);
        assert_eq!(runtime.history_status().unwrap().entry_count, 0);
        runtime.set_history_enabled(true);
        assert_eq!(runtime.answer_context("quarterly", 10).unwrap().len(), 1);
        assert_eq!(runtime.history_status().unwrap().entry_count, 0);
        runtime
            .database
            .record_user_query("quarterly", true)
            .unwrap();
        let status = runtime.history_status().unwrap();
        assert_eq!(status.entry_count, 1);
        assert!(status.enabled);

        let diagnostics = runtime.native_diagnostics().unwrap();
        assert_eq!(diagnostics.indexed_files, 1);
        assert_eq!(diagnostics.indexed_chunks, 1);
        assert_eq!(diagnostics.history_entries, 1);
        assert!(diagnostics.vector.available);
        let serialized = serde_json::to_string(&diagnostics).unwrap();
        assert!(!serialized.contains("private-report"));
        assert!(!serialized.contains(&fixture.root().to_string_lossy().into_owned()));

        let deleted = runtime.delete_indexed_content().unwrap();
        assert_eq!(deleted.deleted_files, 1);
        assert_eq!(deleted.deleted_chunks, 1);
        assert_eq!(runtime.history_status().unwrap().entry_count, 1);
        drop(runtime);

        let reopened = IndexRuntime::open(&database_path, &vector_extension, false).unwrap();
        let persisted = reopened.history_status().unwrap();
        assert_eq!(persisted.entry_count, 1);
        assert!(!persisted.enabled);
    }

    #[test]
    fn cloud_jobs_require_explicit_root_consent() {
        let fixture = SearchFixture::new("index-runtime-consent");
        fixture.file("scan.png", &[0, 1, 2]);
        let database_path = fixture.root().join("index.sqlite");
        let vector_extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let runtime = IndexRuntime::open(&database_path, &vector_extension, true).unwrap();

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
