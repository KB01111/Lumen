pub mod classify;
pub mod collector;
pub mod tree;
pub mod types;

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use serde::Serialize;
use tauri::State;

use self::types::SessionReliefReport;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReliefFailure {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl SessionReliefFailure {
    pub(crate) fn collection_failed() -> Self {
        Self {
            code: "collection-failed".to_owned(),
            message: "Lumen could not complete the local session analysis.".to_owned(),
            recoverable: true,
        }
    }

    pub(crate) fn from_internal(_error: impl std::fmt::Display) -> Self {
        Self::collection_failed()
    }

    fn collection_in_progress() -> Self {
        Self {
            code: "collection-in-progress".to_owned(),
            message: "A local session analysis is already in progress.".to_owned(),
            recoverable: true,
        }
    }
}

#[derive(Clone, Default)]
pub struct SessionReliefRuntime {
    collecting: Arc<AtomicBool>,
}

#[derive(Debug)]
struct CollectionGuard {
    collecting: Arc<AtomicBool>,
}

impl Drop for CollectionGuard {
    fn drop(&mut self) {
        self.collecting.store(false, Ordering::Release);
    }
}

impl SessionReliefRuntime {
    fn begin(&self) -> Result<CollectionGuard, SessionReliefFailure> {
        self.collecting
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| SessionReliefFailure::collection_in_progress())?;
        Ok(CollectionGuard {
            collecting: Arc::clone(&self.collecting),
        })
    }
}

#[tauri::command]
pub async fn session_relief_snapshot(
    runtime: State<'_, SessionReliefRuntime>,
) -> Result<SessionReliefReport, SessionReliefFailure> {
    let guard = runtime.inner().begin()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        collector::collect_session_relief()
    })
    .await
    .map_err(|_| SessionReliefFailure::collection_failed())?
}

#[cfg(test)]
mod tests {
    use super::{SessionReliefFailure, SessionReliefRuntime};

    #[test]
    fn internal_failures_are_sanitized() {
        let failure = SessionReliefFailure::from_internal("C:\\Users\\Kevin\\Secret");
        assert_eq!(
            failure.message,
            "Lumen could not complete the local session analysis."
        );
        assert!(!failure.message.contains("Secret"));
    }

    #[test]
    fn collection_is_single_flight_and_releases_after_completion() {
        let runtime = SessionReliefRuntime::default();
        let first = runtime.begin().unwrap();
        assert_eq!(runtime.begin().unwrap_err().code, "collection-in-progress");
        drop(first);
        assert!(runtime.begin().is_ok());
    }
}
