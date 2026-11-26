//! Installed Windows application discovery (Start Menu `.lnk` and `.exe` entries).

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::RwLock,
};

use crate::catalogue::fuzzy_match_ranges;

#[derive(Clone, Debug)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub category: String,
}

#[derive(Clone, Debug)]
pub struct AppMatch {
    pub app: InstalledApp,
    pub score: f64,
    pub ranges: Vec<[usize; 2]>,
}

pub struct AppCatalog {
    apps: RwLock<Vec<InstalledApp>>,
}

impl Default for AppCatalog {
    fn default() -> Self {
        Self {
            apps: RwLock::new(Vec::new()),
        }
    }
}

impl AppCatalog {
    pub fn refresh(&self) -> usize {
        let discovered = discover_start_menu_apps();
        let count = discovered.len();
        if let Ok(mut slot) = self.apps.write() {
            *slot = discovered;
        }
        count
    }

    pub fn count(&self) -> usize {
        self.apps.read().map(|a| a.len()).unwrap_or(0)
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<AppMatch> {
        let q = query.trim();
        let Ok(apps) = self.apps.read() else {
            return Vec::new();
        };
        let mut results: Vec<AppMatch> = if q.is_empty() {
            apps.iter()
                .take(limit)
                .map(|app| AppMatch {
                    app: app.clone(),
                    score: 0.5,
                    ranges: Vec::new(),
                })
                .collect()
        } else {
            apps.iter()
                .filter_map(|app| {
                    let (score, ranges) = fuzzy_match_ranges(&app.name, q)?;
                    Some(AppMatch {
                        app: app.clone(),
                        score,
                        ranges,
                    })
                })
                .collect()
        };
        results.sort_by(|a, b| {
            b.score
                .total_cmp(&a.score)
                .then_with(|| a.app.name.cmp(&b.app.name))
        });
        results.truncate(limit);
        results
    }

    pub fn launch(path: &Path) -> Result<(), String> {
        crate::search::opening::open_path_unconfined(path)
    }
}

fn discover_start_menu_apps() -> Vec<InstalledApp> {
    let mut roots = Vec::new();
    if let Some(pd) = std::env::var_os("ProgramData") {
        roots.push(PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Some(ad) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs"));
    }

    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for root in roots {
        if root.is_dir() {
            walk_start_menu(&root, &root, 0, &mut seen, &mut apps);
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

fn walk_start_menu(
    root: &Path,
    dir: &Path,
    depth: usize,
    seen: &mut HashSet<String>,
    out: &mut Vec<InstalledApp>,
) {
    if depth > 4 || out.len() >= 600 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.is_dir() {
            walk_start_menu(root, &path, depth + 1, seen, out);
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "lnk" | "appref-ms" | "url") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let lower = stem.to_ascii_lowercase();
        // Skip noisy uninstaller / readme / help shortcuts.
        if lower.contains("uninstall")
            || lower.starts_with("readme")
            || lower.contains("release notes")
            || lower.contains("documentation")
        {
            continue;
        }
        if !seen.insert(lower) {
            continue;
        }
        let category = path
            .parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .and_then(|rel| rel.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Application")
            .to_owned();
        out.push(InstalledApp {
            id: format!("app:{}", path.to_string_lossy().to_lowercase()),
            name: stem.to_owned(),
            path,
            category,
        });
    }
}
