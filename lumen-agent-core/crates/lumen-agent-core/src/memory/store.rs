use super::types::*;
use rusqlite::{Connection, OptionalExtension, params};
use std::{path::Path, sync::Mutex};

pub(super) struct MemoryStore(Mutex<Connection>);
fn storage<T>(_: T) -> MemoryError {
    MemoryError::Storage
}
impl MemoryStore {
    pub fn open(path: &Path) -> Result<Self, MemoryError> {
        Self::init(Connection::open(path).map_err(storage)?)
    }
    pub fn in_memory() -> Result<Self, MemoryError> {
        Self::init(Connection::open_in_memory().map_err(storage)?)
    }
    fn init(connection: Connection) -> Result<Self, MemoryError> {
        connection
            .busy_timeout(std::time::Duration::from_millis(250))
            .map_err(storage)?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(storage)?;
        if version > 1 {
            return Err(MemoryError::Storage);
        }
        connection.execute_batch("PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS memory_records (
                provider TEXT NOT NULL, scope TEXT NOT NULL, source_id TEXT NOT NULL,
                data TEXT NOT NULL, content TEXT NOT NULL, expires_at INTEGER,
                PRIMARY KEY(provider, scope, source_id));
            CREATE TABLE IF NOT EXISTS memory_providers (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
            PRAGMA user_version=1; COMMIT;").map_err(storage)?;
        let store = Self(Mutex::new(connection));
        store.prune(now_ms())?;
        Ok(store)
    }
    pub fn enabled(&self, id: &str) -> Result<bool, MemoryError> {
        self.0
            .lock()
            .map_err(storage)?
            .query_row(
                "SELECT enabled FROM memory_providers WHERE id=?1",
                [id],
                |r| r.get::<_, bool>(0),
            )
            .optional()
            .map(|v| v.unwrap_or(id == NATIVE_PROVIDER))
            .map_err(storage)
    }
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), MemoryError> {
        self.0.lock().map_err(storage)?.execute("INSERT INTO memory_providers VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled", params![id, enabled]).map_err(storage)?;
        Ok(())
    }
    pub fn save(&self, memory: &ApprovedMemory) -> Result<(), MemoryError> {
        let json = serde_json::to_string(memory).map_err(storage)?;
        self.0.lock().map_err(storage)?.execute("INSERT INTO memory_records VALUES (?1,?2,?3,?4,?5,?6)
            ON CONFLICT(provider,scope,source_id) DO UPDATE SET data=excluded.data,content=excluded.content,expires_at=excluded.expires_at",
            params![memory.provider_id, memory.record.scope.key()?, memory.record.source_id, json, memory.record.content, memory.approval.expires_at.map(|at| at as i64)]).map_err(storage)?;
        Ok(())
    }
    pub fn search(
        &self,
        provider: &str,
        scope: &MemoryScope,
        query: &MemoryQuery,
        after: Option<&str>,
    ) -> Result<Vec<ApprovedMemory>, MemoryError> {
        self.prune(now_ms())?;
        let connection = self.0.lock().map_err(storage)?;
        let mut statement = connection
            .prepare(
                "SELECT data, content FROM memory_records WHERE provider=?1 AND scope=?2
            AND (?3 IS NULL OR source_id>?3) ORDER BY source_id",
            )
            .map_err(storage)?;
        let rows = statement
            .query_map(params![provider, scope.key()?, after], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(storage)?;
        let text = query.text.to_lowercase();
        let mut matches = Vec::new();
        for row in rows {
            let (data, content) = row.map_err(storage)?;
            if content.to_lowercase().contains(&text) {
                matches.push(serde_json::from_str(&data).map_err(storage)?);
                if matches.len() == MAX_PROVIDER_RECORDS {
                    break;
                }
            }
        }
        Ok(matches)
    }
    pub fn get(
        &self,
        provider: &str,
        scope: &MemoryScope,
        id: &str,
    ) -> Result<Option<ApprovedMemory>, MemoryError> {
        let data: Option<String> = self.0.lock().map_err(storage)?.query_row("SELECT data FROM memory_records
            WHERE provider=?1 AND scope=?2 AND source_id=?3 AND (expires_at IS NULL OR expires_at>?4)",
            params![provider, scope.key()?, id, now_ms() as i64], |r| r.get(0)).optional().map_err(storage)?;
        data.map(|data| serde_json::from_str(&data).map_err(storage))
            .transpose()
    }
    pub fn forget(&self, provider: &str, scope: &MemoryScope, id: &str) -> Result<(), MemoryError> {
        self.0
            .lock()
            .map_err(storage)?
            .execute(
                "DELETE FROM memory_records WHERE provider=?1 AND scope=?2 AND source_id=?3",
                params![provider, scope.key()?, id],
            )
            .map_err(storage)?;
        Ok(())
    }
    pub fn prune(&self, now: u64) -> Result<(), MemoryError> {
        self.0
            .lock()
            .map_err(storage)?
            .execute(
                "DELETE FROM memory_records WHERE expires_at IS NOT NULL AND expires_at<=?1",
                [now as i64],
            )
            .map_err(storage)?;
        Ok(())
    }
}
