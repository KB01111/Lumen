use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use sqlite_vec::sqlite3_vec_init;

use super::root_policy::canonicalize_confined;
use super::types::SearchFailure;

static REGISTER_SQLITE_VEC: Once = Once::new();

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
    if version >= 1 {
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
         PRAGMA user_version = 1;
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

        assert_eq!(version, 1);
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
