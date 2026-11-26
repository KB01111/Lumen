//! Lazy native host for agent memory (Tauri-free).
use lumen_agent_core::memory::*;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

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

    pub fn providers(&self) -> Result<Vec<ProviderStatus>, MemoryError> {
        self.core()?.provider_status()
    }

    pub fn set_provider(&self, id: &str, enabled: bool) -> Result<(), MemoryError> {
        self.core()?.set_provider_enabled(id, enabled)
    }
}
