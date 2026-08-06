use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use sqlite_vec::sqlite3_vec_init;

use super::root_policy::canonicalize_confined;
use super::types::SearchFailure;

static REGISTER_SQLITE_VEC: Once = Once::new();
const MAX_ENRICHMENT_ATTEMPTS: u32 = 5;
const ENRICHMENT_LEASE_SECONDS: i64 = 60;
const MAX_ENRICHMENT_TEXT_BYTES: usize = 1024 * 1024;
const MAX_ENRICHMENT_ERROR_BYTES: usize = 2 * 1024;

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
    #[error("Invalid enrichment transition: {0}")]
    InvalidEnrichment(String),
}

type IndexResult<T> = std::result::Result<T, IndexError>;

fn register_sqlite_vec() {
    REGISTER_SQLITE_VEC.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute::<
            *const (),
            unsafe extern "C" fn(
                *mut rusqlite::ffi::sqlite3,
                *mut *mut std::ffi::c_char,
                *const rusqlite::ffi::sqlite3_api_routines,
            ) -> std::ffi::c_int,
        >(sqlite3_vec_init as *const ())));
    });
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
    let version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= 2 {
        return Ok(());
    }

    if version == 0 {
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
         CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
           chunk_id INTEGER PRIMARY KEY,
           embedding FLOAT[768]
         );
         CREATE TABLE enrichment_jobs (
           id INTEGER PRIMARY KEY,
           file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,
           route TEXT NOT NULL,
           content_hash TEXT NOT NULL,
           status TEXT NOT NULL,
           attempt INTEGER NOT NULL DEFAULT 0,
           not_before INTEGER,
           lease_token TEXT,
           lease_until INTEGER,
           last_error TEXT,
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
        )?;
    } else {
        connection.execute_batch(
            "BEGIN IMMEDIATE;
             DROP INDEX IF EXISTS enrichment_jobs_status;
             ALTER TABLE enrichment_jobs RENAME TO enrichment_jobs_v1;
             CREATE TABLE enrichment_jobs (
               id INTEGER PRIMARY KEY,
               file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
               kind TEXT NOT NULL,
               route TEXT NOT NULL,
               content_hash TEXT NOT NULL,
               status TEXT NOT NULL,
               attempt INTEGER NOT NULL DEFAULT 0,
               not_before INTEGER,
               lease_token TEXT,
               lease_until INTEGER,
               last_error TEXT,
               UNIQUE(file_id, kind, route, content_hash)
             );
             INSERT INTO enrichment_jobs (
               id, file_id, kind, route, content_hash, status, attempt, not_before
             )
             SELECT id, file_id, kind, route, content_hash, status, attempt,
                    CAST(not_before AS INTEGER)
             FROM enrichment_jobs_v1;
             DROP TABLE enrichment_jobs_v1;
             CREATE INDEX enrichment_jobs_status ON enrichment_jobs(status, not_before);
             PRAGMA user_version = 2;
             COMMIT;",
        )?;
    }
    Ok(())
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnrichmentLease {
    pub idempotency_key: String,
    pub file_id: String,
    pub root_path: PathBuf,
    pub path: PathBuf,
    pub content_hash: String,
    pub kind: String,
    pub route: String,
    pub attempt: u32,
    pub lease_token: String,
    pub lease_until: i64,
    pub generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct EnrichmentArtifact {
    pub provider: String,
    pub model: String,
    pub text: String,
    pub page: Option<u32>,
    pub time_start_ms: Option<u64>,
    pub time_end_ms: Option<u64>,
}

pub struct IndexDatabase {
    connection: Mutex<Connection>,
}

impl IndexDatabase {
    pub fn open(path: &Path) -> IndexResult<Self> {
        register_sqlite_vec();
        let connection = Connection::open(path)?;
        configure(&connection)?;
        migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    #[cfg(test)]
    fn open_memory() -> IndexResult<Self> {
        register_sqlite_vec();
        let connection = Connection::open_in_memory()?;
        configure(&connection)?;
        migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
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
                "DELETE FROM chunk_embeddings
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
                    "DELETE FROM chunk_embeddings WHERE chunk_id IN
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

    pub fn enrichment_status_counts(&self) -> IndexResult<Vec<(String, u64)>> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let mut statement = connection.prepare(
            "SELECT status, count(*)
             FROM enrichment_jobs
             GROUP BY status
             ORDER BY status",
        )?;
        statement
            .query_map([], |row| {
                let count = u64::try_from(row.get::<_, i64>(1)?)
                    .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(1, i64::MAX))?;
                Ok((row.get::<_, String>(0)?, count))
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(IndexError::from)
    }

    pub fn lease_enrichment(&self, now: i64) -> IndexResult<Option<EnrichmentLease>> {
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "UPDATE enrichment_jobs
             SET status = CASE WHEN attempt >= ?2 THEN 'failed' ELSE 'queued' END,
                 not_before = CASE WHEN attempt >= ?2 THEN NULL ELSE ?1 END,
                 lease_token = NULL, lease_until = NULL,
                 last_error = 'The previous enrichment lease expired'
             WHERE status = 'running' AND lease_until <= ?1",
            params![now, MAX_ENRICHMENT_ATTEMPTS],
        )?;
        let candidate = transaction
            .query_row(
                "SELECT enrichment_jobs.id, files.stable_id, files.root_path, files.path,
                        enrichment_jobs.content_hash, enrichment_jobs.kind,
                        enrichment_jobs.route, enrichment_jobs.attempt
                 FROM enrichment_jobs
                 JOIN files ON files.id = enrichment_jobs.file_id
                 WHERE enrichment_jobs.status = 'queued'
                   AND enrichment_jobs.attempt < ?1
                   AND (enrichment_jobs.not_before IS NULL
                        OR CAST(enrichment_jobs.not_before AS INTEGER) <= ?2)
                   AND files.content_hash = enrichment_jobs.content_hash
                   AND files.extraction_version LIKE '%;cloud-enrichment=true'
                 ORDER BY enrichment_jobs.id
                 LIMIT 1",
                params![MAX_ENRICHMENT_ATTEMPTS, now],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        PathBuf::from(row.get::<_, String>(2)?),
                        PathBuf::from(row.get::<_, String>(3)?),
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        u32::try_from(row.get::<_, i64>(7)?)
                            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(7, i64::MAX))?,
                    ))
                },
            )
            .optional()?;
        let Some((job_id, file_id, root_path, path, content_hash, kind, route, prior_attempt)) =
            candidate
        else {
            transaction.commit()?;
            return Ok(None);
        };
        let lease_token = uuid::Uuid::new_v4().simple().to_string();
        let lease_until = now.saturating_add(ENRICHMENT_LEASE_SECONDS);
        let updated = transaction.execute(
            "UPDATE enrichment_jobs
             SET status = 'running', attempt = attempt + 1,
                 lease_token = ?2, lease_until = ?3, last_error = NULL
             WHERE id = ?1 AND status = 'queued'",
            params![job_id, lease_token, lease_until],
        )?;
        if updated != 1 {
            return Err(IndexError::InvalidEnrichment(
                "The queued enrichment job changed before it could be leased".to_owned(),
            ));
        }
        transaction.commit()?;
        let attempt = prior_attempt.saturating_add(1);
        Ok(Some(EnrichmentLease {
            idempotency_key: format!("{file_id}:{content_hash}:{kind}:{route}"),
            file_id,
            root_path,
            path,
            content_hash,
            kind,
            route,
            attempt,
            lease_token,
            lease_until,
            generation: 0,
        }))
    }

    pub fn next_enrichment_wake(&self, now: i64) -> IndexResult<Option<i64>> {
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        connection
            .query_row(
                "SELECT min(
                   CASE
                     WHEN enrichment_jobs.status = 'queued'
                       THEN COALESCE(CAST(enrichment_jobs.not_before AS INTEGER), ?1)
                     WHEN enrichment_jobs.status = 'running'
                       THEN COALESCE(enrichment_jobs.lease_until, ?1)
                   END
                 )
                 FROM enrichment_jobs
                 JOIN files ON files.id = enrichment_jobs.file_id
                 WHERE enrichment_jobs.status IN ('queued', 'running')
                   AND files.content_hash = enrichment_jobs.content_hash
                   AND files.extraction_version LIKE '%;cloud-enrichment=true'",
                [now],
                |row| row.get(0),
            )
            .map_err(IndexError::from)
    }

    pub fn retry_enrichment(
        &self,
        lease: &EnrichmentLease,
        now: i64,
        retryable: bool,
        error: &str,
    ) -> IndexResult<bool> {
        let error = error
            .chars()
            .take(MAX_ENRICHMENT_ERROR_BYTES)
            .collect::<String>();
        let should_retry = retryable && lease.attempt < MAX_ENRICHMENT_ATTEMPTS;
        let exponent = lease.attempt.saturating_sub(1).min(6);
        let delay = 5_i64.saturating_mul(1_i64 << exponent).min(300);
        let connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let updated = connection.execute(
            "UPDATE enrichment_jobs
             SET status = ?3, not_before = ?4, lease_token = NULL,
                 lease_until = NULL, last_error = ?5
             WHERE lease_token = ?1 AND status = 'running'
               AND content_hash = ?2",
            params![
                lease.lease_token,
                lease.content_hash,
                if should_retry { "queued" } else { "failed" },
                should_retry.then_some(now.saturating_add(delay)),
                error,
            ],
        )?;
        Ok(updated == 1)
    }

    pub fn complete_enrichment(
        &self,
        lease: &EnrichmentLease,
        artifact: &EnrichmentArtifact,
        now: i64,
    ) -> IndexResult<bool> {
        validate_artifact(lease, artifact)?;
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        let current = transaction
            .query_row(
                "SELECT enrichment_jobs.id, files.id, files.stable_id, files.name, files.path,
                        files.content_hash, files.extraction_version,
                        files.index_revision, enrichment_jobs.kind,
                        enrichment_jobs.route, enrichment_jobs.lease_until
                 FROM enrichment_jobs
                 JOIN files ON files.id = enrichment_jobs.file_id
                 WHERE enrichment_jobs.lease_token = ?1
                   AND enrichment_jobs.status = 'running'",
                [&lease.lease_token],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                        row.get::<_, i64>(10)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            job_id,
            file_db_id,
            stable_id,
            name,
            path,
            hash,
            extraction,
            revision,
            kind,
            route,
            until,
        )) = current
        else {
            return Ok(false);
        };
        if until < now
            || stable_id != lease.file_id
            || hash != lease.content_hash
            || kind != lease.kind
            || route != lease.route
            || !extraction.ends_with(";cloud-enrichment=true")
        {
            return Ok(false);
        }
        let ordinal: i64 = transaction.query_row(
            "SELECT COALESCE(max(ordinal), -1) + 1 FROM chunks WHERE file_id = ?1",
            [file_db_id],
            |row| row.get(0),
        )?;
        let time_start = artifact
            .time_start_ms
            .map(i64::try_from)
            .transpose()
            .map_err(|_| IndexError::IntegerOverflow)?;
        let time_end = artifact
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
                file_db_id,
                ordinal,
                artifact.text.trim(),
                kind,
                hash,
                artifact.page,
                time_start,
                time_end,
                revision,
            ],
        )?;
        let chunk_id = transaction.last_insert_rowid();
        transaction.execute(
            "INSERT INTO search_fts(file_id, chunk_id, name, path, body)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![file_db_id, chunk_id, name, path, artifact.text.trim()],
        )?;
        let payload = serde_json::to_string(artifact)
            .map_err(|error| IndexError::InvalidEnrichment(error.to_string()))?;
        transaction.execute(
            "INSERT INTO enrichment_artifacts
             (file_id, chunk_id, kind, provider, model, content_hash, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                file_db_id,
                chunk_id,
                kind,
                artifact.provider,
                artifact.model,
                hash,
                payload,
            ],
        )?;
        transaction.execute("DELETE FROM answer_cache WHERE file_id = ?1", [file_db_id])?;
        let completed = transaction.execute(
            "UPDATE enrichment_jobs SET status = 'completed', lease_token = NULL,
                    lease_until = NULL, not_before = NULL, last_error = NULL
             WHERE id = ?1 AND lease_token = ?2 AND status = 'running'",
            params![job_id, lease.lease_token],
        )?;
        if completed != 1 {
            return Err(IndexError::InvalidEnrichment(
                "The enrichment lease changed before completion".to_owned(),
            ));
        }
        transaction.commit()?;
        Ok(true)
    }

    pub fn delete_all(&self) -> IndexResult<()> {
        let mut connection = self.connection.lock().map_err(|_| IndexError::Poisoned)?;
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM chunk_embeddings", [])?;
        transaction.execute("DELETE FROM search_fts", [])?;
        transaction.execute("DELETE FROM answer_cache", [])?;
        transaction.execute("DELETE FROM enrichment_artifacts", [])?;
        transaction.execute("DELETE FROM enrichment_jobs", [])?;
        transaction.execute("DELETE FROM chunks", [])?;
        transaction.execute("DELETE FROM files", [])?;
        transaction.commit()?;
        Ok(())
    }
}

fn validate_artifact(lease: &EnrichmentLease, artifact: &EnrichmentArtifact) -> IndexResult<()> {
    let text = artifact.text.trim();
    if !matches!(lease.kind.as_str(), "ocr" | "transcription") {
        return Err(IndexError::InvalidEnrichment(
            "Only OCR and transcription artifacts are supported".to_owned(),
        ));
    }
    if text.is_empty() || text.len() > MAX_ENRICHMENT_TEXT_BYTES {
        return Err(IndexError::InvalidEnrichment(
            "Artifact text must be non-empty and no larger than 1 MiB".to_owned(),
        ));
    }
    if artifact.provider.is_empty()
        || artifact.provider.len() > 128
        || artifact.model.is_empty()
        || artifact.model.len() > 128
    {
        return Err(IndexError::InvalidEnrichment(
            "Artifact provider and model must be bounded".to_owned(),
        ));
    }
    if artifact
        .time_start_ms
        .zip(artifact.time_end_ms)
        .is_some_and(|(start, end)| start > end)
    {
        return Err(IndexError::InvalidEnrichment(
            "Artifact timestamps are out of order".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::SearchFixture;

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
        let vec_version: String = connection
            .query_row("SELECT vec_version()", [], |row| row.get(0))
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
        assert!(!vec_version.is_empty());
        for expected in [
            "answer_cache",
            "chunk_embeddings",
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
    fn migrates_existing_enrichment_queues_to_leased_schema() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE files (
                   id INTEGER PRIMARY KEY
                 );
                 CREATE TABLE enrichment_jobs (
                   id INTEGER PRIMARY KEY,
                   file_id INTEGER NOT NULL,
                   kind TEXT NOT NULL,
                   route TEXT NOT NULL,
                   content_hash TEXT NOT NULL,
                   status TEXT NOT NULL,
                   attempt INTEGER NOT NULL DEFAULT 0,
                   not_before TEXT,
                   UNIQUE(file_id, kind, route, content_hash)
                 );
                 PRAGMA user_version = 1;",
            )
            .unwrap();

        migrate(&connection).unwrap();
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let columns = connection
            .prepare("PRAGMA table_info(enrichment_jobs)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(version, 2);
        for column in ["lease_token", "lease_until", "last_error"] {
            assert!(columns.iter().any(|candidate| candidate == column));
        }
        let not_before_type = connection
            .query_row(
                "SELECT type FROM pragma_table_info('enrichment_jobs') WHERE name = 'not_before'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(not_before_type, "INTEGER");
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

    #[test]
    fn enrichment_lease_completion_atomically_adds_searchable_text() {
        let fixture = SearchFixture::new("enrichment-completion");
        let path = fixture.file("scan.png", b"image bytes");
        let database = IndexDatabase::open_memory().unwrap();
        database
            .upsert_document(
                fixture.root(),
                &IndexedDocument {
                    stable_id: "scan".to_owned(),
                    path,
                    content_hash: "hash-image".to_owned(),
                    extraction_version: "image-v1;cloud-enrichment=true".to_owned(),
                    chunks: Vec::new(),
                },
            )
            .unwrap();
        assert!(
            database
                .enqueue_enrichment("scan", "ocr", "lumen.vision.cloud")
                .unwrap()
        );

        let lease = database.lease_enrichment(1_000).unwrap().unwrap();
        assert_eq!(lease.attempt, 1);
        assert!(
            database
                .complete_enrichment(
                    &lease,
                    &EnrichmentArtifact {
                        provider: "mock".to_owned(),
                        model: "lumen.vision.cloud".to_owned(),
                        text: "Quarterly invoice total".to_owned(),
                        page: None,
                        time_start_ms: None,
                        time_end_ms: None,
                    },
                    1_001,
                )
                .unwrap()
        );

        let hits = database.search("invoice", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].stable_id, "scan");
        assert_eq!(hits[0].extraction_kind, "ocr");
        assert_eq!(database.counts().unwrap().1, 0);
        let connection = database.connection.lock().unwrap();
        let artifacts: u32 = connection
            .query_row("SELECT count(*) FROM enrichment_artifacts", [], |row| {
                row.get(0)
            })
            .unwrap();
        let completed: String = connection
            .query_row("SELECT status FROM enrichment_jobs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(artifacts, 1);
        assert_eq!(completed, "completed");
    }

    #[test]
    fn enrichment_leases_expire_retry_with_backoff_and_stop_permanently() {
        let fixture = SearchFixture::new("enrichment-retry");
        let path = fixture.file("scan.png", b"image bytes");
        let database = IndexDatabase::open_memory().unwrap();
        database
            .upsert_document(
                fixture.root(),
                &IndexedDocument {
                    stable_id: "scan".to_owned(),
                    path,
                    content_hash: "hash-image".to_owned(),
                    extraction_version: "image-v1;cloud-enrichment=true".to_owned(),
                    chunks: Vec::new(),
                },
            )
            .unwrap();
        database
            .enqueue_enrichment("scan", "ocr", "lumen.vision.cloud")
            .unwrap();

        let expired = database.lease_enrichment(1_000).unwrap().unwrap();
        let recovered = database
            .lease_enrichment(expired.lease_until + 1)
            .unwrap()
            .unwrap();
        assert_eq!(recovered.attempt, 2);
        assert!(
            database
                .retry_enrichment(&recovered, 2_000, true, "rate limited")
                .unwrap()
        );
        assert_eq!(database.next_enrichment_wake(2_000).unwrap(), Some(2_010));
        assert!(database.lease_enrichment(2_009).unwrap().is_none());
        let retried = database.lease_enrichment(2_010).unwrap().unwrap();
        assert_eq!(retried.attempt, 3);
        assert!(
            database
                .retry_enrichment(&retried, 2_011, false, "unsupported")
                .unwrap()
        );
        assert!(database.lease_enrichment(9_999).unwrap().is_none());
        assert_eq!(database.next_enrichment_wake(9_999).unwrap(), None);
    }
}
