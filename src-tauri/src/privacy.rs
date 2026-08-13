use std::{
    fs,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use tauri::AppHandle;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use serde::Serialize;
use serde_json::{Map, Value};

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

fn sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    [
        "api_key",
        "apikey",
        "authorization",
        "body",
        "content",
        "credential",
        "detail",
        "directory",
        "error",
        "log",
        "message",
        "password",
        "path",
        "prompt",
        "query",
        "secret",
        "text",
        "token",
    ]
    .iter()
    .any(|candidate| key.contains(candidate))
}

fn contains_windows_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.windows(2).enumerate().any(|(index, part)| {
        part == b"\\\\" || (part == b"//" && (index == 0 || bytes[index - 1] != b':'))
    }) || bytes.windows(3).any(|part| {
        part[0].is_ascii_alphabetic() && part[1] == b':' && matches!(part[2], b'\\' | b'/')
    })
}

fn sanitize_diagnostics(value: Value) -> Value {
    match value {
        Value::Array(values) => {
            Value::Array(values.into_iter().map(sanitize_diagnostics).collect())
        }
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| {
                    let value = if sensitive_key(&key) {
                        Value::String("[redacted]".to_owned())
                    } else {
                        sanitize_diagnostics(value)
                    };
                    (key, value)
                })
                .collect::<Map<_, _>>(),
        ),
        Value::String(value) if contains_windows_path(&value) => {
            Value::String("[local-path]".to_owned())
        }
        Value::String(value)
            if value.to_ascii_lowercase().contains("authorization:")
                || value.to_ascii_lowercase().contains("bearer ") =>
        {
            Value::String("[redacted]".to_owned())
        }
        value => value,
    }
}

pub(crate) fn sanitized_diagnostics_string(value: Value) -> Result<String, String> {
    serde_json::to_string_pretty(&sanitize_diagnostics(value))
        .map_err(|_| "The diagnostics snapshot could not be prepared.".to_owned())
}

pub(crate) fn write_sanitized_diagnostics(path: &Path, contents: &str) -> Result<(), String> {
    const MAX_EXPORT_BYTES: usize = 256 * 1024;
    if contents.len() > MAX_EXPORT_BYTES {
        return Err("The diagnostics snapshot is too large to export.".to_owned());
    }
    let parsed = serde_json::from_str::<Value>(contents)
        .map_err(|_| "The diagnostics snapshot is invalid.".to_owned())?;
    let sanitized = sanitized_diagnostics_string(parsed)?;
    fs::write(path, sanitized)
        .map_err(|_| "The diagnostics snapshot could not be saved.".to_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsExportResult {
    saved: bool,
    file_name: Option<String>,
}

#[tauri::command]
pub fn export_diagnostics(
    app: AppHandle,
    contents: String,
) -> Result<DiagnosticsExportResult, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("lumen-diagnostics.json")
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(DiagnosticsExportResult {
            saved: false,
            file_name: None,
        });
    };
    let path = selected
        .into_path()
        .map_err(|_| "The selected export location is unavailable.".to_owned())?;
    write_sanitized_diagnostics(&path, &contents)?;
    Ok(DiagnosticsExportResult {
        saved: true,
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .map(ToOwned::to_owned),
    })
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

    #[test]
    fn diagnostic_export_sanitizer_removes_paths_prompts_and_credentials() {
        let sanitized = sanitize_diagnostics(serde_json::json!({
            "appVersion": "0.1.0",
            "authorization": "Bearer private-token",
            "nested": {
                "prompt": "Summarize my file",
                "message": "Failed at C:\\Users\\Kevin\\Private\\note.txt",
                "unc": "\\\\server\\private\\report.pdf",
                "embeddedUnc": "failed while reading \\\\vault\\private\\embedded.txt",
                "forwardUnc": "failed while reading //vault/private/forward.txt",
                "providerError": "upstream rejected request: quota for account 42",
                "runtimeFile": "C:/Users/Kevin/AppData/Local/Lumen/runtime/config.json"
            }
        }));
        let serialized = serde_json::to_string(&sanitized).unwrap();

        assert!(serialized.contains("0.1.0"));
        for forbidden in [
            "private-token",
            "Summarize",
            "Kevin",
            "server",
            "report.pdf",
            "embedded.txt",
            "forward.txt",
            "quota",
            "AppData",
        ] {
            assert!(!serialized.contains(forbidden), "leaked {forbidden}");
        }
        assert!(serialized.contains("[redacted]"));
        assert!(serialized.contains("[local-path]"));
    }

    #[test]
    fn diagnostic_export_core_writes_the_same_sanitized_payload_without_a_dialog() {
        let directory =
            std::env::temp_dir().join(format!("lumen-diagnostics-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("diagnostics.json");

        write_sanitized_diagnostics(
            &path,
            r#"{"appVersion":"0.1.0","prompt":"private","location":"failed at \\\\vault\\share\\file.txt"}"#,
        )
        .unwrap();
        let written = std::fs::read_to_string(&path).unwrap();

        assert!(written.contains("0.1.0"));
        assert!(written.contains("[redacted]"));
        assert!(written.contains("[local-path]"));
        assert!(!written.contains("private"));
        assert!(!written.contains("vault"));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
