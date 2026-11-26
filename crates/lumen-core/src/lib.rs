//! Tauri-free pure-Rust core services for Lumen.
//!
//! Extracted directly from Lumen's existing backend modules so the native GPUI
//! frontend (`crates/lumen-ui`) invokes search, indexing, previews, AI answers,
//! Computer Use, activity awareness, privacy, credentials, and settings directly
//! in-process with zero IPC or JSON serialization overhead.

use std::sync::Arc;

pub mod activity;
pub mod agent_memory;
pub mod apps;
pub mod calculator;
pub mod catalogue;
pub mod clipboard;
pub mod computer_use;
pub mod consent;
pub mod gateway;
pub mod improvement;
pub mod local_http;
#[cfg(test)]
mod local_http_tests;
pub mod privacy;
pub mod provider_switcher;
pub mod runtime;
pub mod search;
pub mod settings;
pub mod windows_ai;

pub use runtime::{FileSearchOutcome, LumenPaths, LumenRuntime};

/// Typed in-process streaming event channel replacing `tauri::ipc::Channel<T>`.
#[derive(Clone)]
pub struct EventChannel<T> {
    sender: Arc<dyn Fn(T) -> Result<(), String> + Send + Sync>,
}

impl<T> EventChannel<T> {
    pub fn new<F>(sender: F) -> Self
    where
        F: Fn(T) -> Result<(), String> + Send + Sync + 'static,
    {
        Self {
            sender: Arc::new(sender),
        }
    }

    pub fn noop() -> Self {
        Self::new(|_| Ok(()))
    }

    pub fn send(&self, event: T) -> Result<(), String> {
        (self.sender)(event)
    }
}

/// Pure Tokio async runtime helpers replacing `tauri::async_runtime`.
pub mod async_runtime {
    pub use tokio::spawn;
    pub use tokio::task::spawn_blocking;

    pub fn block_on<F: std::future::Future>(future: F) -> F::Output {
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| handle.block_on(future))
        } else {
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime")
                .block_on(future)
        }
    }
}
