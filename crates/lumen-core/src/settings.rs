//! Persisted settings, appearance preferences, and window geometry contracts.
//!
//! Reads and writes the same `lumen.settings.json` layout used by the legacy Tauri Store
//! (`{ "appearance": ..., "management": ..., "onboarding": ... }`) while preserving unknown keys.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::computer_use::protocol::{ExecutionMode, Provider as ComputerUseProvider};
use crate::gateway::answer::RuntimeMode;
use crate::search::IndexRootRequest;

pub const APP_IDENTIFIER: &str = "com.bridgehammer.lumen";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowMode {
    #[default]
    Collapsed,
    Expanded,
    Onboarding,
    Settings,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowGeometry {
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub max_width: f64,
    pub min_height: f64,
    pub max_height: f64,
    pub resizable: bool,
}

pub const fn geometry_for(mode: WindowMode) -> WindowGeometry {
    match mode {
        WindowMode::Collapsed => WindowGeometry {
            width: 720.0,
            height: 64.0,
            min_width: 640.0,
            max_width: 820.0,
            min_height: 64.0,
            max_height: 64.0,
            resizable: false,
        },
        WindowMode::Expanded => WindowGeometry {
            width: 820.0,
            height: 520.0,
            min_width: 720.0,
            max_width: 960.0,
            min_height: 320.0,
            max_height: 560.0,
            resizable: false,
        },
        WindowMode::Onboarding => WindowGeometry {
            width: 760.0,
            height: 520.0,
            min_width: 700.0,
            max_width: 900.0,
            min_height: 480.0,
            max_height: 640.0,
            resizable: false,
        },
        WindowMode::Settings => WindowGeometry {
            width: 900.0,
            height: 620.0,
            min_width: 780.0,
            max_width: 1080.0,
            min_height: 540.0,
            max_height: 760.0,
            resizable: false,
        },
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LauncherPosition {
    pub x: i32,
    pub y: i32,
}

/// Computes horizontal-center, upper-third Spotlight placement anchored by the expanded height
/// so expanding/collapsing never shifts the search bar vertically.
pub fn launcher_position(
    work_area: WorkArea,
    logical_width: f64,
    reference_logical_height: f64,
    scale_factor: f64,
) -> LauncherPosition {
    let physical_width = (logical_width * scale_factor).round() as i32;
    let physical_height = (reference_logical_height * scale_factor).round() as i32;
    let horizontal_space = (work_area.width as i32 - physical_width).max(0);
    let vertical_space = (work_area.height as i32 - physical_height).max(0);
    LauncherPosition {
        x: work_area.x + horizontal_space / 2,
        y: work_area.y + (f64::from(vertical_space) * 0.18).round() as i32,
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub registered: bool,
    pub accelerator: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MonitorBehavior {
    #[default]
    Active,
    Primary,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseBehavior {
    #[default]
    Hide,
    Quit,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeModeSetting {
    #[default]
    Dark,
    Light,
    System,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TransparencySetting {
    #[default]
    Native,
    Reduced,
    Disabled,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DensitySetting {
    #[default]
    Comfortable,
    Compact,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PreviewBehavior {
    #[default]
    Automatic,
    Always,
    Never,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MotionSetting {
    #[default]
    Full,
    System,
    Reduced,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectsSetting {
    #[default]
    Full,
    Reduced,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub mode: ThemeModeSetting,
    pub transparency: TransparencySetting,
    pub density: DensitySetting,
    pub preview: PreviewBehavior,
    pub motion: MotionSetting,
    pub effects: EffectsSetting,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            mode: ThemeModeSetting::Dark,
            transparency: TransparencySetting::Native,
            density: DensitySetting::Comfortable,
            preview: PreviewBehavior::Automatic,
            motion: MotionSetting::Full,
            effects: EffectsSetting::Full,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct IndexedRootConfig {
    pub id: String,
    pub path: String,
    pub paused: bool,
    pub exclusions: Vec<String>,
    pub include_hidden: bool,
    pub max_file_size_mb: u64,
    pub status: String,
}

impl Default for IndexedRootConfig {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            path: String::new(),
            paused: false,
            exclusions: Vec::new(),
            include_hidden: false,
            max_file_size_mb: 256,
            status: "ready".to_owned(),
        }
    }
}

impl IndexedRootConfig {
    pub fn from_path(path: impl Into<String>) -> Self {
        let path = path.into();
        let id = format!(
            "root-{}",
            path.to_lowercase()
                .replace(['\\', '/', ':', ' '], "-")
                .trim_matches('-')
        );
        Self {
            id,
            path,
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GeneralSettings {
    pub launch_at_startup: bool,
    pub shortcut: String,
    pub monitor_behavior: MonitorBehavior,
    pub history_enabled: bool,
    pub close_behavior: CloseBehavior,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            launch_at_startup: false,
            shortcut: "Alt + Space".to_owned(),
            monitor_behavior: MonitorBehavior::Active,
            history_enabled: true,
            close_behavior: CloseBehavior::Hide,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PresentationSettings {
    pub glass_intensity: u8,
}

impl Default for PresentationSettings {
    fn default() -> Self {
        Self {
            glass_intensity: 76,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchSettings {
    pub enabled_scopes: Vec<String>,
    pub filename_priority: u8,
    pub recency: String,
    pub show_pinned: bool,
    pub semantic_enabled: bool,
    pub reranking_enabled: bool,
}

impl Default for SearchSettings {
    fn default() -> Self {
        Self {
            enabled_scopes: vec![
                "all".into(),
                "apps".into(),
                "files".into(),
                "folders".into(),
                "documents".into(),
                "code".into(),
                "images".into(),
                "recent".into(),
                "clipboard".into(),
            ],
            filename_priority: 82,
            recency: "balanced".to_owned(),
            show_pinned: true,
            semantic_enabled: false,
            reranking_enabled: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AiSettings {
    pub runtime_mode: RuntimeMode,
    pub keep_local_warm: bool,
    pub cloud_answer_consent: bool,
    pub cloud_enriched_root_ids: Vec<String>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            runtime_mode: RuntimeMode::Auto,
            keep_local_warm: false,
            cloud_answer_consent: false,
            cloud_enriched_root_ids: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ComputerUseSettings {
    pub model: String,
    pub openai_model: String,
    pub provider: ComputerUseProvider,
    pub execution_mode: ExecutionMode,
    pub desktop_control_consent: bool,
    pub desktop_cloud_consent: bool,
    pub initial_url: String,
    pub cloud_consent: bool,
}

impl Default for ComputerUseSettings {
    fn default() -> Self {
        Self {
            model: "gemini-3.8-flash".to_owned(),
            openai_model: "gpt-6.1-sol".to_owned(),
            provider: ComputerUseProvider::Gemini,
            execution_mode: ExecutionMode::Fast,
            desktop_control_consent: false,
            desktop_cloud_consent: false,
            initial_url: "https://www.google.com".to_owned(),
            cloud_consent: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrivacySettings {
    pub previews_enabled: bool,
    pub ocr_enabled: bool,
    pub image_analysis_enabled: bool,
    pub history_entries: u64,
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            previews_enabled: true,
            ocr_enabled: false,
            image_analysis_enabled: false,
            history_entries: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ManagementSettings {
    pub active_page: String,
    pub general: GeneralSettings,
    pub presentation: PresentationSettings,
    pub roots: Vec<IndexedRootConfig>,
    pub search: SearchSettings,
    pub ai: AiSettings,
    pub computer_use: ComputerUseSettings,
    pub privacy: PrivacySettings,
}

impl Default for ManagementSettings {
    fn default() -> Self {
        Self {
            active_page: "general".to_owned(),
            general: GeneralSettings::default(),
            presentation: PresentationSettings::default(),
            roots: Vec::new(),
            search: SearchSettings::default(),
            ai: AiSettings::default(),
            computer_use: ComputerUseSettings::default(),
            privacy: PrivacySettings::default(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LumenSettings {
    pub appearance: AppearanceSettings,
    pub management: ManagementSettings,
    pub onboarding_completed: bool,
}

impl LumenSettings {
    pub fn active_index_roots(&self) -> Vec<IndexRootRequest> {
        self.management
            .roots
            .iter()
            .filter(|root| !root.paused && !root.path.trim().is_empty())
            .map(|root| IndexRootRequest {
                path: root.path.clone(),
                cloud_enrichment: self
                    .management
                    .ai
                    .cloud_enriched_root_ids
                    .contains(&root.id),
                exclusions: root.exclusions.clone(),
                include_hidden: root.include_hidden,
                max_file_size_mb: root.max_file_size_mb,
            })
            .collect()
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<LumenSettings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let settings = read_settings_file(&path);
        Self {
            path,
            current: Mutex::new(settings),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn snapshot(&self) -> LumenSettings {
        self.current
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn update<F>(&self, mutate: F) -> Result<LumenSettings, String>
    where
        F: FnOnce(&mut LumenSettings),
    {
        let mut guard = self
            .current
            .lock()
            .map_err(|_| "Settings state is unavailable.".to_owned())?;
        mutate(&mut guard);
        let updated = guard.clone();
        write_settings_file(&self.path, &updated)?;
        Ok(updated)
    }
}

fn read_settings_file(path: &Path) -> LumenSettings {
    let Ok(contents) = fs::read_to_string(path) else {
        return LumenSettings::default();
    };
    let Ok(root) = serde_json::from_str::<Value>(&contents) else {
        return LumenSettings::default();
    };
    let appearance = root
        .get("appearance")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let management = root
        .get("management")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let onboarding_completed = root
        .get("onboarding")
        .and_then(|v| v.get("completed"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    LumenSettings {
        appearance,
        management,
        onboarding_completed,
    }
}

fn write_settings_file(path: &Path, settings: &LumenSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create settings directory: {error}"))?;
    }
    // Preserve any extra keys written by Tauri Store (e.g. activity overrides, userGames).
    let mut doc = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Map<String, Value>>(&text).ok())
        .unwrap_or_default();

    let appearance_val = serde_json::to_value(&settings.appearance)
        .map_err(|error| format!("Could not serialize appearance settings: {error}"))?;
    doc.insert("appearance".to_owned(), appearance_val);

    let mut mgmt_val = serde_json::to_value(&settings.management)
        .map_err(|error| format!("Could not serialize management settings: {error}"))?;
    // Preserve existing `management.activity` sub-object if present.
    if let (Some(existing_activity), Some(mgmt_obj)) = (
        doc.get("management")
            .and_then(|m| m.get("activity"))
            .cloned(),
        mgmt_val.as_object_mut(),
    ) {
        mgmt_obj.insert("activity".to_owned(), existing_activity);
    }
    doc.insert("management".to_owned(), mgmt_val);

    let mut onboarding = doc
        .get("onboarding")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    onboarding.insert(
        "completed".to_owned(),
        Value::Bool(settings.onboarding_completed),
    );
    doc.insert("onboarding".to_owned(), Value::Object(onboarding));

    let payload = serde_json::to_string_pretty(&Value::Object(doc))
        .map_err(|error| format!("Could not encode settings JSON: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, payload)
        .map_err(|error| format!("Could not write temporary settings file: {error}"))?;
    fs::rename(&temp, path).or_else(|_| {
        let _ = fs::remove_file(path);
        fs::rename(&temp, path)
    })
    .map_err(|error| format!("Could not commit settings file: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_preserves_unknown_keys() {
        let dir = std::env::temp_dir().join(format!("lumen-settings-{}", uuid::Uuid::new_v4()));
        let path = dir.join("lumen.settings.json");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            &path,
            r#"{"management":{"activity":{"detectGames":false}},"extra":123}"#,
        )
        .unwrap();

        let store = SettingsStore::load(path.clone());
        store
            .update(|s| {
                s.appearance.mode = ThemeModeSetting::Light;
                s.management.general.shortcut = "Ctrl + Space".to_owned();
                s.onboarding_completed = true;
            })
            .unwrap();

        let reloaded = SettingsStore::load(path.clone()).snapshot();
        assert_eq!(reloaded.appearance.mode, ThemeModeSetting::Light);
        assert_eq!(reloaded.management.general.shortcut, "Ctrl + Space");
        assert!(reloaded.onboarding_completed);

        let raw: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(raw["extra"], 123);
        assert_eq!(raw["management"]["activity"]["detectGames"], false);
        let _ = fs::remove_dir_all(dir);
    }
}
