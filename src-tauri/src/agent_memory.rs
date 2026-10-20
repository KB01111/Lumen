//! Lazy native host. Agent workers receive MemoryReader, never these management commands.
use lumen_agent_core::memory::*;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::State;
use tokio_util::sync::CancellationToken;

pub struct AgentMemoryRuntime {
    path: PathBuf,
    core: Mutex<Option<Arc<MemoryCore>>>,
}
impl AgentMemoryRuntime {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            core: Mutex::new(None),
        }
    }
    pub fn core(&self) -> Result<Arc<MemoryCore>, MemoryError> {
        let mut initialized = self.core.lock().map_err(|_| MemoryError::Unavailable)?;
        if let Some(core) = initialized.as_ref() {
            return Ok(core.clone());
        }
        let mut core = MemoryCore::open(&self.path)?;
        if let Ok(beacon) = BeaconMemoryProvider::loopback(8766) {
            core.register_provider(Arc::new(beacon))?;
        }
        let core = Arc::new(core);
        *initialized = Some(core.clone());
        Ok(core)
    }
}

#[tauri::command]
pub fn agent_memory_providers(
    runtime: State<'_, AgentMemoryRuntime>,
) -> Result<Vec<ProviderStatus>, MemoryError> {
    runtime.core()?.provider_status()
}
#[tauri::command]
pub fn set_agent_memory_provider(
    runtime: State<'_, AgentMemoryRuntime>,
    id: String,
    enabled: bool,
) -> Result<(), MemoryError> {
    runtime.core()?.set_provider_enabled(&id, enabled)
}
#[tauri::command]
pub fn review_native_agent_memory(
    runtime: State<'_, AgentMemoryRuntime>,
    record: MemoryRecord,
) -> Result<MemoryReview, MemoryError> {
    runtime.core()?.review_native(record)
}
#[tauri::command]
pub async fn review_provider_agent_memory(
    runtime: State<'_, AgentMemoryRuntime>,
    provider: String,
    scope: MemoryScope,
    id: String,
) -> Result<MemoryReview, MemoryError> {
    runtime
        .core()?
        .review_provider(&provider, scope, &id, CancellationToken::new())
        .await
}
#[tauri::command]
pub fn approve_agent_memory(
    runtime: State<'_, AgentMemoryRuntime>,
    review_id: String,
    retention: RetentionPolicy,
) -> Result<MemoryApproval, MemoryError> {
    runtime.core()?.approve(&review_id, retention)
}
#[tauri::command]
pub fn delete_agent_memory(
    runtime: State<'_, AgentMemoryRuntime>,
    provider: String,
    scope: MemoryScope,
    id: String,
) -> Result<(), MemoryError> {
    runtime.core()?.forget(&provider, &scope, &id)
}
#[tauri::command]
pub fn prune_agent_memory(runtime: State<'_, AgentMemoryRuntime>) -> Result<(), MemoryError> {
    runtime.core()?.prune_expired()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn absent_memory_storage_is_lazy_and_does_not_fail_native_startup() {
        let runtime = AgentMemoryRuntime::new(
            std::env::temp_dir()
                .join(uuid::Uuid::new_v4().to_string())
                .join("memory.sqlite3"),
        );
        assert!(runtime.core.lock().unwrap().is_none());
        assert!(matches!(runtime.core(), Err(MemoryError::Storage)));
    }
}
