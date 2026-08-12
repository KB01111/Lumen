use std::{
    fs,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use tauri::State;

use crate::search::SearchFailure;

#[derive(Clone)]
pub struct PrivacyRuntime {
    previews_enabled: Arc<AtomicBool>,
}

impl Default for PrivacyRuntime {
    fn default() -> Self {
        Self {
            previews_enabled: Arc::new(AtomicBool::new(true)),
        }
    }
}

fn persisted_bool(path: &Path, section: &str, key: &str) -> Option<bool> {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<serde_json::Value>(&contents).ok())
        .and_then(|settings| {
            settings
                .get("management")?
                .get(section)?
                .get(key)?
                .as_bool()
        })
}

impl PrivacyRuntime {
    pub fn load(path: &Path) -> Self {
        Self {
            previews_enabled: Arc::new(AtomicBool::new(
                persisted_bool(path, "privacy", "previewsEnabled").unwrap_or(true),
            )),
        }
    }

    pub fn previews_enabled(&self) -> bool {
        self.previews_enabled.load(Ordering::SeqCst)
    }

    pub fn set_previews_enabled(&self, enabled: bool) {
        self.previews_enabled.store(enabled, Ordering::SeqCst);
    }

    pub fn ensure_previews_enabled(&self) -> Result<(), SearchFailure> {
        if self.previews_enabled() {
            Ok(())
        } else {
            Err(SearchFailure::new(
                "permission-denied",
                "File previews are disabled in Privacy settings.",
                None,
            ))
        }
    }
}

pub fn load_history_enabled(path: &Path) -> bool {
    persisted_bool(path, "general", "historyEnabled").unwrap_or(true)
}

#[tauri::command]
pub fn set_previews_enabled(state: State<'_, PrivacyRuntime>, enabled: bool) {
    state.set_previews_enabled(enabled);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privacy_runtime_loads_persisted_values_and_preserves_product_defaults() {
        let directory =
            std::env::temp_dir().join(format!("lumen-privacy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("lumen.settings.json");

        let defaults = PrivacyRuntime::load(&path);
        assert!(defaults.previews_enabled());
        assert!(load_history_enabled(&path));

        std::fs::write(
            &path,
            r#"{"management":{"general":{"historyEnabled":false},"privacy":{"previewsEnabled":false}}}"#,
        )
        .unwrap();
        let disabled = PrivacyRuntime::load(&path);
        assert!(!disabled.previews_enabled());
        assert!(!load_history_enabled(&path));

        std::fs::write(
            &path,
            r#"{"management":{"general":{"historyEnabled":"yes"},"privacy":{"previewsEnabled":1}}}"#,
        )
        .unwrap();
        let invalid = PrivacyRuntime::load(&path);
        assert!(invalid.previews_enabled());
        assert!(load_history_enabled(&path));

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn preview_gate_rejects_requests_before_work_starts() {
        let runtime = PrivacyRuntime::default();
        runtime.set_previews_enabled(false);
        let error = runtime.ensure_previews_enabled().unwrap_err();

        assert_eq!(error.code, "permission-denied");
        assert_eq!(error.path, None);
    }
}
