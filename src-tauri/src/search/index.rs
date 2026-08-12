use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use super::root_policy::canonicalize_confined;
use super::types::SearchFailure;

#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    Policy(#[from] SearchFailure),
    #[error("The index mutex is poisoned")]
    Poisoned,
    #[error("An index integer exceeded SQLite's signed 64-bit range")]
    IntegerOverflow,
    // Kept for the exact-vector storage API, which is exercised before an embedding producer ships.
    #[allow(dead_code)]
    #[error("Invalid vector input: {0}")]
    InvalidVector(String),
    #[error("Semantic search is unavailable: {0}")]
    VectorUnavailable(String),
}

type IndexResult<T> = std::result::Result<T, IndexError>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VectorRuntimeInfo {
    pub version: String,
    pub backend: String,
}

const SQLITE_VECTOR_VERSION: &str = "1.0.0";

fn validate_vector_runtime(info: VectorRuntimeInfo) -> IndexResult<VectorRuntimeInfo> {
    if info.version != SQLITE_VECTOR_VERSION {
        return Err(IndexError::VectorUnavailable(
            "pinned sqlite-vector runtime version mismatch".to_owned(),
        ));
    }
    Ok(info)
}

pub fn register_or_load_sqlite_vector(
    connection: &Connection,
    extension: &Path,
) -> IndexResult<VectorRuntimeInfo> {
    unsafe { connection.load_extension_enable()? };
    let load_result = unsafe { connection.load_extension(extension, None::<&str>) };
    let disable_result = connection.load_extension_disable();
    load_result?;
    disable_result?;

    let info = connection
        .query_row("SELECT vector_version(), vector_backend()", [], |row| {
            Ok(VectorRuntimeInfo {
                version: row.get(0)?,
                backend: row.get(1)?,
            })
        })
        .map_err(IndexError::from)?;
    validate_vector_runtime(info)
}

fn configure(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA temp_store = MEMORY;",
    )
}

fn migrate(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS query_history (
           id INTEGER PRIMARY KEY,
           query TEXT NOT NULL,
           searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )?;
    let version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= 2 {
        return Ok(());
    }

    if version == 1 {
        connection.execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE vector_embeddings (
               chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
               embedding BLOB NOT NULL,
               embedding_model TEXT NOT NULL,
               dimension INTEGER NOT NULL CHECK(dimension > 0),
               distance_metric TEXT NOT NULL CHECK(distance_metric = 'cosine'),
               content_hash TEXT NOT NULL,
               index_revision INTEGER NOT NULL
             );
             PRAGMA user_version = 2;
             COMMIT;",
        )?;
        return Ok(());
    }

    connection.execute_batch(
        "BEGIN IMMEDIATE;
         CREATE TABLE files (
           id INTEGER PRIMARY KEY,
           stable_id TEXT NOT NULL UNIQUE,
           root_path TEXT NOT NULL,
           path TEXT NOT NULL UNIQUE,
           name TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           extraction_version TEXT NOT NULL,
           index_revision INTEGER NOT NULL CHECK(index_revision > 0),
           indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE TABLE chunks (
           id INTEGER PRIMARY KEY,
           file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           ordinal INTEGER NOT NULL,
           text TEXT NOT NULL,
           extraction_kind TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           page INTEGER,
           time_start_ms INTEGER,
           time_end_ms INTEGER,
           embedding_model TEXT,
           index_revision INTEGER NOT NULL,
           UNIQUE(file_id, ordinal)
         );
         CREATE VIRTUAL TABLE search_fts USING fts5(
           file_id UNINDEXED,
           chunk_id UNINDEXED,
           name,
           path,
           body,
           tokenize = 'unicode61 remove_diacritics 2'
         );
         CREATE TABLE vector_embeddings (
           chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
           embedding BLOB NOT NULL,
           embedding_model TEXT NOT NULL,
           dimension INTEGER NOT NULL CHECK(dimension > 0),
           distance_metric TEXT NOT NULL CHECK(distance_metric = 'cosine'),
           content_hash TEXT NOT NULL,
           index_revision INTEGER NOT NULL
         );
         CREATE TABLE enrichment_jobs (
           id INTEGER PRIMARY KEY,
           file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,
           route TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           status TEXT NOT NULL,
           attempt INTEGER NOT NULL DEFAULT 0,
           not_before TEXT,
           UNIQUE(file_id, kind, route, content_hash)
         );
         CREATE TABLE enrichment_artifacts (
           id INTEGER PRIMARY KEY,
           file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           chunk_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,
           provider TEXT NOT NULL,
           model TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           payload TEXT NOT NULL,
           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE TABLE answer_cache (
           cache_key TEXT PRIMARY KEY,
           file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
           query TEXT NOT NULL,
           mode TEXT NOT NULL,
           provider TEXT NOT NULL,
           model TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           index_revision INTEGER NOT NULL,
           answer TEXT NOT NULL,
           created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE INDEX chunks_file_id ON chunks(file_id);
         CREATE INDEX enrichment_jobs_status ON enrichment_jobs(status, not_before);
         PRAGMA user_version = 2;
         COMMIT;",
    )
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexedChunk {
    pub text: String,
    pub extraction_kind: String,
    pub page: Option<u32>,
    pub time_start_ms: Option<u64>,
    pub time_end_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexedDocument {
    pub stable_id: String,
    pub path: PathBuf,
    pub content_hash: String,
    pub extraction_version: String,
    pub chunks: Vec<IndexedChunk>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpsertOutcome {
    Unchanged { revision: u64 },
    Updated { revision: u64 },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedHit {
    pub stable_id: String,
    pub root_path: PathBuf,
    pub path: PathBuf,
    pub name: String,
    pub content_hash: String,
    pub index_revision: u64,
    pub extraction_kind: String,
    pub snippet: String,
    pub page: Option<u32>,
    pub time_start_ms: Option<u64>,
    pub time_end_ms: Option<u64>,
    pub rank: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichmentJobRecord {
    pub idempotency_key: String,
    pub file_id: String,
    pub content_hash: String,
    pub kind: String,
    pub route: String,
}

#[derive(Clone, Debug, PartialEq)]
#[allow(dead_code)]
pub struct EmbeddingHit {
    pub stable_id: String,
    pub chunk_id: i64,
    pub distance: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStatus {
    pub entry_count: u64,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryClearResult {
    pub entry_count: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedIndexData {
    pub deleted_files: u64,
    pub deleted_chunks: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorStatus {
    pub available: bool,
    pub version: Option<String>,
    pub backend: Option<String>,
    pub last_error: Option<String>,
}

pub struct IndexDatabase {
    connection: Mutex<Connection>,
    vector_error: Option<String>,
    vector_runtime: Option<VectorRuntimeInfo>,
    #[allow(dead_code)]
    vector_dimension: Mutex<Option<usize>>,
    history_enabled: AtomicBool,
}

impl IndexDatabase {
    pub fn open(path: &Path, extension: &Path) -> IndexResult<Self> {
        let connection = Connection::open(path)?;
        let (vector_runtime, vector_error) =
            match register_or_load_sqlite_vector(&connection, extension) {
                Ok(info) => (Some(info), None),
                Err(_) => (
                    None,
                    Some("pinned sqlite-vector runtime could not be loaded".to_owned()),
                ),
            };
        configure(&connection)?;
        migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            vector_error,
            vector_runtime,
            vector_dimension: Mutex::new(None),
            history_enabled: AtomicBool::new(true),
        })
    }

    #[cfg(test)]
    fn open_memory() -> IndexResult<Self> {
        let connection = Connection::open_in_memory()?;
        let extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let vector_runtime = register_or_load_sqlite_vector(&connection, &extension)?;
        configure(&connection)?;
        migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            vector_error: None,
            vector_runtime: Some(vector_runtime),
            vector_dimension: Mutex::new(None),
            history_enabled: AtomicBool::new(true),
        })
    }

    #[allow(dead_code)]
    fn encode_vector(dimension: usize, values: &[f32]) -> IndexResult<Vec<u8>> {
        if dimension == 0 {
            return Err(IndexError::InvalidVector(
                "dimension must be greater than zero".to_owned(),
            ));
        }
        if values.len() != dimension {
            return Err(IndexError::InvalidVector(format!(
                "expected {dimension} values, got {}",
                values.len()
            )));
        }
        if values.iter().any(|value| !value.is_finite()) {
            return Err(IndexError::InvalidVector(
                "values must be finite".to_owned(),
            ));
        }

        Ok(values
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect())
    }

    #[allow(dead_code)]
    fn ensure_vector_dimension(
        &self,
        connection: &Connection,
        dimension: usize,
    ) -> IndexResult<()> {
        if let Some(error) = &self.vector_error {
            return Err(IndexError::VectorUnavailable(error.clone()));
        }
        let mut initialized = self
            .vector_dimension
            .lock()
            .map_err(|_| IndexError::Poisoned)?;
        if let Some(active) = *initialized {
            if active != dimension {
                return Err(IndexError::InvalidVector(format!(
                    "active dimension is {active}, requested {dimension}"
                )));
            }
            return Ok(());
        }
        let options = format!("type=FLOAT32,dimension={dimension},distance=COSINE");
        connection.query_row(
            "SELECT vector_init('vector_embeddings', 'embedding', ?1)",
            [options],
            |_| Ok(()),
        )?;
        *initialized = Some(dimension);
        Ok(())
    }

    #[allow(dead_code)]
    pub fn upsert_embedding(
        &self,
        chunk_id: i64,
        model: &str,
        dimension: usize,
        content_hash: &str,
        revision: u64,
        values: &[f32],
    ) -> IndexResult<()> {
        let encoded = Self::encode_vector(dimension, values)?;
        let dimension_sql = i64::try_from(dimension).map_err(|_| IndexError::IntegerOverflow)?;
        let revision_sql = i64::try_from(revision).map_err(|_| IndexError::IntegerOverflow)?;
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        self.ensure_vector_dimension(&connection, dimension)?;
        connection.execute(
            "INSERT INTO vector_embeddings
             (chunk_id, embedding, embedding_model, dimension, distance_metric, content_hash, index_revision)
             VALUES (?1, vector_as_f32(?2, ?3), ?4, ?3, 'cosine', ?5, ?6)
             ON CONFLICT(chunk_id) DO UPDATE SET
               embedding = excluded.embedding,
               embedding_model = excluded.embedding_model,
               dimension = excluded.dimension,
               distance_metric = excluded.distance_metric,
               content_hash = excluded.content_hash,
               index_revision = excluded.index_revision",
            params![
                chunk_id,
                encoded,
                dimension_sql,
                model,
                content_hash,
                revision_sql
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn search_embeddings(
        &self,
        model: &str,
        dimension: usize,
        query: &[f32],
        limit: usize,
    ) -> IndexResult<Vec<EmbeddingHit>> {
        let encoded = Self::encode_vector(dimension, query)?;
        if limit == 0 {
            return Ok(Vec::new());
        }
        let dimension_sql = i64::try_from(dimension).map_err(|_| IndexError::IntegerOverflow)?;
        let limit_sql = i64::try_from(limit).map_err(|_| IndexError::IntegerOverflow)?;
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        self.ensure_vector_dimension(&connection, dimension)?;
        let scan_limit: i64 =
            connection.query_row("SELECT count(*) FROM vector_embeddings", [], |row| {
                row.get(0)
            })?;
        if scan_limit == 0 {
            return Ok(Vec::new());
        }
        let mut statement = connection.prepare(
            "SELECT files.stable_id, chunks.id, scan.distance
             FROM vector_full_scan(
               'vector_embeddings', 'embedding', vector_as_f32(?1, ?2), ?3
             ) AS scan
             JOIN vector_embeddings ON vector_embeddings.rowid = scan.rowid
             JOIN chunks ON chunks.id = vector_embeddings.chunk_id
             JOIN files ON files.id = chunks.file_id
             WHERE vector_embeddings.embedding_model = ?4
               AND vector_embeddings.dimension = ?2
             ORDER BY scan.distance ASC, chunks.id ASC
             LIMIT ?5",
        )?;
        let rows = statement.query_map(
            params![encoded, dimension_sql, scan_limit, model, limit_sql],
            |row| {
                Ok(EmbeddingHit {
                    stable_id: row.get(0)?,
                    chunk_id: row.get(1)?,
                    distance: row.get(2)?,
                })
            },
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(IndexError::from)
    }

    pub fn upsert_document(
        &self,
        _root: &Path,
        _document: &IndexedDocument,
    ) -> IndexResult<UpsertOutcome> {
        let canonical_root = super::root_policy::canonicalize_root(_root)?;
        let canonical_path = canonicalize_confined(&canonical_root, &_document.path)?;
        let root_path = canonical_root.to_string_lossy().into_owned();
        let path = canonical_path.to_string_lossy().into_owned();
        let name = canonical_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        let existing = transaction
            .query_row(
                "SELECT id, root_path, path, content_hash, extraction_version, index_revision
                 FROM files WHERE stable_id = ?1",
                [&_document.stable_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        u64::try_from(row.get::<_, i64>(5)?)
                            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(5, i64::MAX))?,
                    ))
                },
            )
            .optional()?;

        if let Some((_, old_root, old_path, old_hash, old_extraction, revision)) = &existing
            && old_root == &root_path
            && old_path == &path
            && old_hash == &_document.content_hash
            && old_extraction == &_document.extraction_version
        {
            return Ok(UpsertOutcome::Unchanged {
                revision: *revision,
            });
        }

        let (file_id, revision) = if let Some((file_id, _, _, _, _, old_revision)) = existing {
            transaction.execute(
                "DELETE FROM vector_embeddings
                 WHERE chunk_id IN (SELECT id FROM chunks WHERE file_id = ?1)",
                [file_id],
            )?;
            transaction.execute("DELETE FROM search_fts WHERE file_id = ?1", [file_id])?;
            transaction.execute(
                "DELETE FROM enrichment_artifacts WHERE file_id = ?1",
                [file_id],
            )?;
            transaction.execute("DELETE FROM enrichment_jobs WHERE file_id = ?1", [file_id])?;
            transaction.execute("DELETE FROM answer_cache WHERE file_id = ?1", [file_id])?;
            transaction.execute("DELETE FROM chunks WHERE file_id = ?1", [file_id])?;
            let revision = old_revision + 1;
            let revision_sql = i64::try_from(revision).map_err(|_| IndexError::IntegerOverflow)?;
            transaction.execute(
                "UPDATE files SET
                   root_path = ?2,
                   path = ?3,
                   name = ?4,
                   content_hash = ?5,
                   extraction_version = ?6,
                   index_revision = ?7,
                   indexed_at = CURRENT_TIMESTAMP
                 WHERE id = ?1",
                params![
                    file_id,
                    root_path,
                    path,
                    name,
                    _document.content_hash,
                    _document.extraction_version,
                    revision_sql,
                ],
            )?;
            (file_id, revision)
        } else {
            transaction.execute(
                "INSERT INTO files
                 (stable_id, root_path, path, name, content_hash, extraction_version, index_revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
                params![
                    _document.stable_id,
                    root_path,
                    path,
                    name,
                    _document.content_hash,
                    _document.extraction_version,
                ],
            )?;
            (transaction.last_insert_rowid(), 1)
        };

        for (ordinal, chunk) in _document.chunks.iter().enumerate() {
            let ordinal = i64::try_from(ordinal).map_err(|_| IndexError::IntegerOverflow)?;
            let revision_sql = i64::try_from(revision).map_err(|_| IndexError::IntegerOverflow)?;
            let time_start_ms = chunk
                .time_start_ms
                .map(i64::try_from)
                .transpose()
                .map_err(|_| IndexError::IntegerOverflow)?;
            let time_end_ms = chunk
                .time_end_ms
                .map(i64::try_from)
                .transpose()
                .map_err(|_| IndexError::IntegerOverflow)?;
            transaction.execute(
                "INSERT INTO chunks
                 (file_id, ordinal, text, extraction_kind, content_hash, page,
                  time_start_ms, time_end_ms, index_revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    file_id,
                    ordinal,
                    chunk.text,
                    chunk.extraction_kind,
                    _document.content_hash,
                    chunk.page,
                    time_start_ms,
                    time_end_ms,
                    revision_sql,
                ],
            )?;
            let chunk_id = transaction.last_insert_rowid();
            transaction.execute(
                "INSERT INTO search_fts(file_id, chunk_id, name, path, body)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![file_id, chunk_id, name, path, chunk.text],
            )?;
        }
        transaction.commit()?;
        Ok(UpsertOutcome::Updated { revision })
    }

    pub fn search(&self, query: &str, limit: usize) -> IndexResult<Vec<IndexedHit>> {
        let tokens: Vec<String> = query
            .split_whitespace()
            .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
            .collect();
        if tokens.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let match_query = tokens.join(" AND ");
        let normalized_query = query.trim().to_lowercase();
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let mut statement = connection.prepare(
            "SELECT
               files.stable_id,
               files.root_path,
               files.path,
               files.name,
               files.content_hash,
               files.index_revision,
               chunks.extraction_kind,
               chunks.text,
               chunks.page,
               chunks.time_start_ms,
               chunks.time_end_ms,
               bm25(search_fts, 0.0, 0.0, 12.0, 2.0, 1.0) AS rank,
               CASE
                 WHEN lower(files.name) = ?2 OR lower(files.name) LIKE ?2 || '.%' THEN 1
                 ELSE 0
               END AS exact_name
             FROM search_fts
             JOIN files ON files.id = CAST(search_fts.file_id AS INTEGER)
             JOIN chunks ON chunks.id = CAST(search_fts.chunk_id AS INTEGER)
             WHERE search_fts MATCH ?1
             ORDER BY exact_name DESC, rank ASC, lower(files.name) ASC, files.stable_id ASC",
        )?;
        let rows = statement.query_map(params![match_query, normalized_query], |row| {
            Ok(IndexedHit {
                stable_id: row.get(0)?,
                root_path: PathBuf::from(row.get::<_, String>(1)?),
                path: PathBuf::from(row.get::<_, String>(2)?),
                name: row.get(3)?,
                content_hash: row.get(4)?,
                index_revision: u64::try_from(row.get::<_, i64>(5)?)
                    .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(5, i64::MAX))?,
                extraction_kind: row.get(6)?,
                snippet: row.get(7)?,
                page: row.get(8)?,
                time_start_ms: row
                    .get::<_, Option<i64>>(9)?
                    .and_then(|value| u64::try_from(value).ok()),
                time_end_ms: row
                    .get::<_, Option<i64>>(10)?
                    .and_then(|value| u64::try_from(value).ok()),
                rank: row.get(11)?,
            })
        })?;
        let mut seen = HashSet::new();
        let mut hits = Vec::with_capacity(limit);
        for row in rows {
            let hit = row?;
            if seen.insert(hit.stable_id.clone()) {
                hits.push(hit);
                if hits.len() == limit {
                    break;
                }
            }
        }
        Ok(hits)
    }

    pub fn record_user_query(&self, query: &str, successful: bool) -> IndexResult<()> {
        let query = query.trim();
        if !successful || query.is_empty() || !self.history_enabled.load(Ordering::SeqCst) {
            return Ok(());
        }
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        connection.execute("INSERT INTO query_history(query) VALUES (?1)", [query])?;
        Ok(())
    }

    pub fn set_history_enabled(&self, enabled: bool) {
        self.history_enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn history_status(&self) -> IndexResult<HistoryStatus> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let count: i64 =
            connection.query_row("SELECT count(*) FROM query_history", [], |row| row.get(0))?;
        Ok(HistoryStatus {
            entry_count: u64::try_from(count).map_err(|_| IndexError::IntegerOverflow)?,
            enabled: self.history_enabled.load(Ordering::SeqCst),
        })
    }

    pub fn clear_history(&self) -> IndexResult<HistoryClearResult> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        connection.execute("DELETE FROM query_history", [])?;
        Ok(HistoryClearResult { entry_count: 0 })
    }

    pub fn enqueue_enrichment(
        &self,
        stable_id: &str,
        kind: &str,
        route: &str,
    ) -> IndexResult<bool> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let inserted = connection.execute(
            "INSERT OR IGNORE INTO enrichment_jobs
             (file_id, kind, route, content_hash, status)
             SELECT id, ?2, ?3, content_hash, 'queued'
             FROM files WHERE stable_id = ?1",
            params![stable_id, kind, route],
        )?;
        Ok(inserted > 0)
    }

    pub fn retain_inventory(
        &self,
        inventory: &HashMap<String, HashSet<String>>,
    ) -> IndexResult<u64> {
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        let candidates = {
            let mut statement =
                transaction.prepare("SELECT id, stable_id, root_path FROM files")?;
            statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        let removed = candidates
            .into_iter()
            .filter(|(_, stable_id, root)| {
                !inventory
                    .get(root)
                    .is_some_and(|observed| observed.contains(stable_id))
            })
            .try_fold(0_u64, |removed, (file_id, _, _)| {
                transaction.execute(
                    "DELETE FROM vector_embeddings WHERE chunk_id IN
                     (SELECT id FROM chunks WHERE file_id = ?1)",
                    [file_id],
                )?;
                transaction.execute("DELETE FROM search_fts WHERE file_id = ?1", [file_id])?;
                transaction.execute("DELETE FROM files WHERE id = ?1", [file_id])?;
                Ok::<_, rusqlite::Error>(removed + 1)
            })?;
        transaction.commit()?;
        Ok(removed)
    }

    pub fn counts(&self) -> IndexResult<(u64, u64)> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let files =
            connection.query_row("SELECT count(*) FROM files", [], |row| row.get::<_, i64>(0))?;
        let queued = connection.query_row(
            "SELECT count(*) FROM enrichment_jobs WHERE status = 'queued'",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        Ok((
            u64::try_from(files).map_err(|_| IndexError::IntegerOverflow)?,
            u64::try_from(queued).map_err(|_| IndexError::IntegerOverflow)?,
        ))
    }

    pub fn operational_counts(&self) -> IndexResult<(u64, u64)> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let files: i64 =
            connection.query_row("SELECT count(*) FROM files", [], |row| row.get(0))?;
        let chunks: i64 =
            connection.query_row("SELECT count(*) FROM chunks", [], |row| row.get(0))?;
        Ok((
            u64::try_from(files).map_err(|_| IndexError::IntegerOverflow)?,
            u64::try_from(chunks).map_err(|_| IndexError::IntegerOverflow)?,
        ))
    }

    pub fn vector_status(&self) -> VectorStatus {
        VectorStatus {
            available: self.vector_runtime.is_some(),
            version: self
                .vector_runtime
                .as_ref()
                .map(|info| info.version.clone()),
            backend: self
                .vector_runtime
                .as_ref()
                .map(|info| info.backend.clone()),
            last_error: self.vector_error.clone(),
        }
    }

    pub fn queued_jobs(&self) -> IndexResult<Vec<EnrichmentJobRecord>> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let mut statement = connection.prepare(
            "SELECT files.stable_id, enrichment_jobs.content_hash,
                    enrichment_jobs.kind, enrichment_jobs.route
             FROM enrichment_jobs
             JOIN files ON files.id = enrichment_jobs.file_id
             WHERE enrichment_jobs.status = 'queued'
             ORDER BY enrichment_jobs.id",
        )?;
        let rows = statement.query_map([], |row| {
            let file_id: String = row.get(0)?;
            let content_hash: String = row.get(1)?;
            let kind: String = row.get(2)?;
            let route: String = row.get(3)?;
            Ok(EnrichmentJobRecord {
                idempotency_key: format!("{file_id}:{content_hash}:{kind}:{route}"),
                file_id,
                content_hash,
                kind,
                route,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(IndexError::from)
    }

    pub fn delete_indexed_content(&self) -> IndexResult<DeletedIndexData> {
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        let deleted_files: i64 =
            transaction.query_row("SELECT count(*) FROM files", [], |row| row.get(0))?;
        let deleted_chunks: i64 =
            transaction.query_row("SELECT count(*) FROM chunks", [], |row| row.get(0))?;
        transaction.execute("DELETE FROM vector_embeddings", [])?;
        transaction.execute("DELETE FROM search_fts", [])?;
        transaction.execute("DELETE FROM answer_cache", [])?;
        transaction.execute("DELETE FROM enrichment_artifacts", [])?;
        transaction.execute("DELETE FROM enrichment_jobs", [])?;
        transaction.execute("DELETE FROM chunks", [])?;
        transaction.execute("DELETE FROM files", [])?;
        transaction.commit()?;
        Ok(DeletedIndexData {
            deleted_files: u64::try_from(deleted_files).map_err(|_| IndexError::IntegerOverflow)?,
            deleted_chunks: u64::try_from(deleted_chunks)
                .map_err(|_| IndexError::IntegerOverflow)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn explicit_user_queries_are_recorded_only_when_successful_and_enabled() {
        let fixture = SearchFixture::new("query-history");
        let path = fixture.file("report.txt", b"quarterly report");
        let database = IndexDatabase::open_memory().unwrap();
        database
            .upsert_document(
                fixture.root(),
                &document(path, "report", "hash-report", "quarterly report"),
            )
            .unwrap();

        database.set_history_enabled(true);
        assert_eq!(database.search("quarterly", 10).unwrap().len(), 1);
        assert_eq!(database.history_status().unwrap().entry_count, 0);
        database.record_user_query("quarterly", true).unwrap();
        assert_eq!(database.history_status().unwrap().entry_count, 1);
        database.record_user_query("   ", true).unwrap();
        database.record_user_query("missing", false).unwrap();
        assert_eq!(database.history_status().unwrap().entry_count, 1);
        database.set_history_enabled(false);
        database.record_user_query("report", true).unwrap();
        assert_eq!(database.history_status().unwrap().entry_count, 1);

        let cleared = database.clear_history().unwrap();
        assert_eq!(cleared.entry_count, 0);
        assert!(!database.history_status().unwrap().enabled);
    }

    #[test]
    fn deleting_indexed_content_reports_counts_and_keeps_query_history() {
        let fixture = SearchFixture::new("delete-index-data");
        let path = fixture.file("report.txt", b"quarterly report");
        let database = IndexDatabase::open_memory().unwrap();
        database
            .upsert_document(
                fixture.root(),
                &document(path, "report", "hash-report", "quarterly report"),
            )
            .unwrap();
        assert_eq!(database.search("quarterly", 10).unwrap().len(), 1);
        database.set_history_enabled(true);
        database.record_user_query("quarterly", true).unwrap();

        let deleted = database.delete_indexed_content().unwrap();

        assert_eq!(deleted.deleted_files, 1);
        assert_eq!(deleted.deleted_chunks, 1);
        assert_eq!(database.counts().unwrap().0, 0);
        assert_eq!(database.history_status().unwrap().entry_count, 1);
    }

    #[test]
    fn sqlite_vector_runtime_is_pinned() {
        let connection = Connection::open_in_memory().unwrap();
        let extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let info = register_or_load_sqlite_vector(&connection, &extension).unwrap();

        assert_eq!(info.version, "1.0.0");
        assert!(!info.backend.is_empty());
    }

    #[test]
    fn sqlite_vector_runtime_rejects_version_drift() {
        let error = validate_vector_runtime(VectorRuntimeInfo {
            version: "1.0.1".to_owned(),
            backend: "generic".to_owned(),
        })
        .unwrap_err()
        .to_string();

        assert_eq!(
            error,
            "Semantic search is unavailable: pinned sqlite-vector runtime version mismatch"
        );
    }

    #[test]
    fn migrates_vec0_to_sqlite_vector_rows() {
        let fixture = SearchFixture::new("vec0-migration");
        let database_path = fixture.root().join("index.sqlite");
        let connection = Connection::open(&database_path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE files (
                   id INTEGER PRIMARY KEY,
                   stable_id TEXT NOT NULL UNIQUE
                 );
                 CREATE TABLE chunks (
                   id INTEGER PRIMARY KEY,
                   file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                   text TEXT NOT NULL
                 );
                 CREATE VIRTUAL TABLE search_fts USING fts5(file_id UNINDEXED, chunk_id UNINDEXED, body);
                 CREATE TABLE chunk_embeddings_info(key TEXT PRIMARY KEY, value ANY);
                 CREATE TABLE chunk_embeddings_chunks(chunk_id INTEGER PRIMARY KEY);
                 CREATE TABLE chunk_embeddings_rowids(rowid INTEGER PRIMARY KEY);
                 CREATE TABLE chunk_embeddings_vector_chunks00(rowid INTEGER PRIMARY KEY, vectors BLOB NOT NULL);
                 INSERT INTO files(id, stable_id) VALUES (1, 'kept-file');
                 INSERT INTO chunks(id, file_id, text) VALUES (11, 1, 'kept text');
                 INSERT INTO search_fts(file_id, chunk_id, body) VALUES (1, 11, 'kept text');
                 INSERT INTO chunk_embeddings_vector_chunks00(rowid, vectors) VALUES (11, x'00000000');
                 PRAGMA user_version = 1;
                 PRAGMA writable_schema = ON;
                 INSERT INTO sqlite_schema(type, name, tbl_name, rootpage, sql)
                 VALUES (
                   'table',
                   'chunk_embeddings',
                   'chunk_embeddings',
                   0,
                   'CREATE VIRTUAL TABLE chunk_embeddings USING vec0(chunk_id INTEGER PRIMARY KEY, embedding FLOAT[768])'
                 );
                 PRAGMA writable_schema = RESET;",
            )
            .unwrap();
        drop(connection);

        let extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let database = IndexDatabase::open(&database_path, &extension).unwrap();
        {
            let connection = database.connection.lock().unwrap();
            let version: u32 = connection
                .query_row("PRAGMA user_version", [], |row| row.get(0))
                .unwrap();
            let embedding_sql: String = connection
                .query_row(
                    "SELECT sql FROM sqlite_schema WHERE name = 'vector_embeddings'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            let legacy_sql: String = connection
                .query_row(
                    "SELECT sql FROM sqlite_schema WHERE name = 'chunk_embeddings'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            let kept_rows: u32 = connection
                .query_row(
                    "SELECT count(*) FROM files
                     JOIN chunks ON chunks.file_id = files.id
                     JOIN search_fts ON CAST(search_fts.chunk_id AS INTEGER) = chunks.id",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            let vector_rows: u32 = connection
                .query_row("SELECT count(*) FROM vector_embeddings", [], |row| {
                    row.get(0)
                })
                .unwrap();
            let legacy_shadow_tables: u32 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_schema
                     WHERE name GLOB 'chunk_embeddings_*'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            let integrity: String = connection
                .query_row("PRAGMA integrity_check", [], |row| row.get(0))
                .unwrap();

            assert_eq!(version, 2);
            assert_eq!(kept_rows, 1);
            assert!(!embedding_sql.contains("VIRTUAL TABLE"));
            assert!(legacy_sql.contains("VIRTUAL TABLE"));
            assert_eq!(vector_rows, 0);
            assert_eq!(legacy_shadow_tables, 4);
            assert_eq!(integrity, "ok");
        }
        drop(database);

        let reopened = IndexDatabase::open(&database_path, &extension).unwrap();
        let connection = reopened.connection.lock().unwrap();
        assert_eq!(
            connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
                .unwrap(),
            2
        );
    }

    fn chunk_id(database: &IndexDatabase, stable_id: &str) -> i64 {
        database
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT chunks.id FROM chunks
                 JOIN files ON files.id = chunks.file_id
                 WHERE files.stable_id = ?1",
                [stable_id],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn exact_vector_search() {
        let fixture = SearchFixture::new("exact-vector-search");
        let database = IndexDatabase::open_memory().unwrap();
        for (stable_id, name) in [
            ("a", "a.txt"),
            ("b", "b.txt"),
            ("c", "c.txt"),
            ("other", "other.txt"),
        ] {
            let path = fixture.file(name, stable_id.as_bytes());
            database
                .upsert_document(
                    fixture.root(),
                    &document(path, stable_id, &format!("hash-{stable_id}"), stable_id),
                )
                .unwrap();
        }

        let a = chunk_id(&database, "a");
        let b = chunk_id(&database, "b");
        let c = chunk_id(&database, "c");
        let other = chunk_id(&database, "other");
        database
            .upsert_embedding(a, "model-a", 3, "hash-a", 1, &[1.0, 0.0, 0.0])
            .unwrap();
        database
            .upsert_embedding(b, "model-a", 3, "hash-b", 1, &[0.8, 0.2, 0.0])
            .unwrap();
        database
            .upsert_embedding(c, "model-a", 3, "hash-c", 1, &[0.0, 1.0, 0.0])
            .unwrap();
        database
            .upsert_embedding(other, "model-b", 3, "hash-other", 1, &[1.0, 0.0, 0.0])
            .unwrap();

        let hits = database
            .search_embeddings("model-a", 3, &[1.0, 0.0, 0.0], 2)
            .unwrap();
        assert_eq!(
            hits.iter()
                .map(|hit| hit.stable_id.as_str())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert!(hits[0].distance <= hits[1].distance);
        assert!(
            database
                .search_embeddings("model-a", 3, &[1.0, 0.0, 0.0], 0)
                .unwrap()
                .is_empty()
        );

        database
            .upsert_embedding(c, "model-a", 3, "hash-c", 1, &[0.9, 0.1, 0.0])
            .unwrap();
        let updated = database
            .search_embeddings("model-a", 3, &[0.0, 1.0, 0.0], 3)
            .unwrap();
        assert_ne!(updated[0].stable_id, "c");

        database
            .connection
            .lock()
            .unwrap()
            .execute("DELETE FROM chunks WHERE id = ?1", [b])
            .unwrap();
        let after_delete = database
            .search_embeddings("model-a", 3, &[1.0, 0.0, 0.0], 10)
            .unwrap();
        assert!(!after_delete.iter().any(|hit| hit.stable_id == "b"));

        assert!(
            database
                .upsert_embedding(a, "model-a", 0, "hash-a", 1, &[])
                .is_err()
        );
        assert!(
            database
                .upsert_embedding(a, "model-a", 3, "hash-a", 1, &[1.0, 0.0])
                .is_err()
        );
        assert!(
            database
                .upsert_embedding(a, "model-a", 3, "hash-a", 1, &[f32::NAN, 0.0, 0.0])
                .is_err()
        );
        assert!(
            database
                .search_embeddings("model-a", 3, &[f32::INFINITY, 0.0, 0.0], 1)
                .is_err()
        );
        assert!(
            database
                .search_embeddings("model-a", 2, &[1.0, 0.0, 0.0], 1)
                .is_err()
        );
    }

    #[test]
    fn lexical_search_survives_an_unavailable_vector_runtime() {
        let fixture = SearchFixture::new("vector-fallback");
        let database_path = fixture.root().join("index.sqlite");
        let missing_extension = fixture.root().join("missing-vector.dll");
        let database = IndexDatabase::open(&database_path, &missing_extension).unwrap();
        let path = fixture.file("fallback.txt", b"lexical fallback");
        database
            .upsert_document(
                fixture.root(),
                &document(path, "fallback", "hash-fallback", "lexical fallback"),
            )
            .unwrap();

        assert_eq!(
            database.search("lexical", 1).unwrap()[0].stable_id,
            "fallback"
        );
        let error = database
            .search_embeddings("model-a", 3, &[1.0, 0.0, 0.0], 1)
            .unwrap_err()
            .to_string();
        assert!(error.contains("pinned sqlite-vector runtime could not be loaded"));
        assert!(!error.contains(&fixture.root().to_string_lossy().into_owned()));
    }

    fn document(path: PathBuf, stable_id: &str, hash: &str, text: &str) -> IndexedDocument {
        IndexedDocument {
            stable_id: stable_id.to_owned(),
            path,
            content_hash: hash.to_owned(),
            extraction_version: "text-v1".to_owned(),
            chunks: vec![IndexedChunk {
                text: text.to_owned(),
                extraction_kind: "text".to_owned(),
                page: None,
                time_start_ms: None,
                time_end_ms: None,
            }],
        }
    }

    #[test]
    fn creates_authoritative_and_rebuildable_schema() {
        let database = IndexDatabase::open_memory().unwrap();
        let connection = database.connection.lock().unwrap();
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let vector_version: String = connection
            .query_row("SELECT vector_version()", [], |row| row.get(0))
            .unwrap();
        let tables: Vec<String> = connection
            .prepare(
                "SELECT name FROM sqlite_master
                 WHERE type IN ('table', 'view') ORDER BY name",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect();

        assert_eq!(version, 2);
        assert_eq!(vector_version, "1.0.0");
        for expected in [
            "answer_cache",
            "vector_embeddings",
            "chunks",
            "enrichment_artifacts",
            "enrichment_jobs",
            "files",
            "search_fts",
        ] {
            assert!(
                tables.iter().any(|table| table == expected),
                "missing {expected}"
            );
        }
    }

    #[test]
    fn ranks_an_exact_filename_before_a_content_only_match() {
        let fixture = SearchFixture::new("fts-rank");
        let exact_path = fixture.file("quarterly report.txt", b"summary");
        let content_path = fixture.file("notes.txt", b"quarterly report notes");
        let database = IndexDatabase::open_memory().unwrap();

        database
            .upsert_document(
                fixture.root(),
                &document(exact_path, "exact", "hash-a", "summary"),
            )
            .unwrap();
        database
            .upsert_document(
                fixture.root(),
                &document(content_path, "content", "hash-b", "quarterly report notes"),
            )
            .unwrap();

        let hits = database.search("quarterly report", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].stable_id, "exact");
        assert_eq!(hits[1].stable_id, "content");
    }

    #[test]
    fn content_changes_invalidate_derived_state_and_advance_revision() {
        let fixture = SearchFixture::new("invalidation");
        let path = fixture.file("report.txt", b"old body");
        let database = IndexDatabase::open_memory().unwrap();
        let first = document(path.clone(), "report", "hash-old", "old body");
        assert_eq!(
            database.upsert_document(fixture.root(), &first).unwrap(),
            UpsertOutcome::Updated { revision: 1 },
        );

        {
            let connection = database.connection.lock().unwrap();
            let file_id: i64 = connection
                .query_row(
                    "SELECT id FROM files WHERE stable_id = 'report'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO enrichment_artifacts
                 (file_id, kind, provider, model, content_hash, payload)
                 VALUES (?1, 'ocr', 'cloud', 'vision', 'hash-old', 'artifact')",
                    [file_id],
                )
                .unwrap();
            connection.execute(
                "INSERT INTO answer_cache
                 (cache_key, file_id, query, mode, provider, model, content_hash, index_revision, answer)
                 VALUES ('cache', ?1, 'old', 'cloud', 'cloud', 'answer', 'hash-old', 1, 'cached')",
                [file_id],
            ).unwrap();
        }

        std::fs::write(&path, b"new body").unwrap();
        let changed = document(path, "report", "hash-new", "new body");
        assert_eq!(
            database.upsert_document(fixture.root(), &changed).unwrap(),
            UpsertOutcome::Updated { revision: 2 },
        );
        assert!(database.search("old", 10).unwrap().is_empty());
        assert_eq!(database.search("new", 10).unwrap()[0].index_revision, 2);

        let connection = database.connection.lock().unwrap();
        for table in ["enrichment_artifacts", "answer_cache"] {
            let count: u32 = connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} was not invalidated");
        }
    }

    #[test]
    fn rejects_documents_outside_the_selected_root() {
        let fixture = SearchFixture::new("index-confinement");
        let outside = fixture.outside_file("private.txt", b"private");
        let database = IndexDatabase::open_memory().unwrap();
        let error = database
            .upsert_document(
                fixture.root(),
                &document(outside, "private", "hash-private", "private"),
            )
            .unwrap_err();

        assert!(error.to_string().contains("outside"));
    }

    #[test]
    fn removes_deleted_files_and_roots_from_all_search_lanes() {
        let fixture = SearchFixture::new("inventory-prune");
        let path = fixture.file("obsolete.txt", b"obsolete body");
        let database = IndexDatabase::open_memory().unwrap();
        database
            .upsert_document(
                fixture.root(),
                &document(path, "obsolete", "hash-old", "obsolete body"),
            )
            .unwrap();

        assert_eq!(database.retain_inventory(&HashMap::new()).unwrap(), 1);
        assert!(database.search("obsolete", 10).unwrap().is_empty());
        assert_eq!(database.counts().unwrap().0, 0);
    }
}
