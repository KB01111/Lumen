//! Shared domain & UI view models for the Lumen GPUI frontend.

use std::path::PathBuf;

use gpui_kit::assets::IconName;
use lumen_core::{
    calculator::{CalculatorKind, CalculatorResult},
    catalogue::CommandAction,
    search::{BasicPreview, FileKind, HybridHit},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LauncherSurface {
    #[default]
    Launcher,
    ComputerUse,
    Settings,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LauncherScope {
    #[default]
    All,
    Apps,
    Files,
    Folders,
    Documents,
    Code,
    Images,
    Recent,
    Clipboard,
    Help,
}

impl LauncherScope {
    pub const ALL: &'static [Self] = &[
        Self::All,
        Self::Apps,
        Self::Files,
        Self::Folders,
        Self::Documents,
        Self::Code,
        Self::Images,
        Self::Recent,
        Self::Clipboard,
        Self::Help,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Apps => "apps",
            Self::Files => "files",
            Self::Folders => "folders",
            Self::Documents => "documents",
            Self::Code => "code",
            Self::Images => "images",
            Self::Recent => "recent",
            Self::Clipboard => "clipboard",
            Self::Help => "help",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::All => "All",
            Self::Apps => "Apps",
            Self::Files => "Files",
            Self::Folders => "Folders",
            Self::Documents => "Docs",
            Self::Code => "Code",
            Self::Images => "Images",
            Self::Recent => "Recent",
            Self::Clipboard => "Clipboard",
            Self::Help => "Help",
        }
    }

    pub fn next(self) -> Self {
        let idx = Self::ALL.iter().position(|s| *s == self).unwrap_or(0);
        Self::ALL[(idx + 1) % Self::ALL.len()]
    }

    pub fn prev(self) -> Self {
        let idx = Self::ALL.iter().position(|s| *s == self).unwrap_or(0);
        Self::ALL[(idx + Self::ALL.len() - 1) % Self::ALL.len()]
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueryFilter {
    pub id: String,
    pub value: String,
    pub label: String,
}

#[derive(Clone, Debug)]
pub enum ItemPayload {
    Calculator(CalculatorResult),
    App {
        path: PathBuf,
        category: String,
    },
    File {
        stable_id: String,
        root_path: PathBuf,
        path: PathBuf,
        file_kind: FileKind,
        size_bytes: u64,
        pinned: bool,
        indexed: bool,
    },
    Command {
        action: CommandAction,
        description: String,
        is_help: bool,
    },
    Clipboard {
        entry_id: String,
        text: String,
        pinned: bool,
    },
}

#[derive(Clone, Debug)]
pub struct LauncherItem {
    pub title: String,
    pub subtitle: String,
    pub badge: String,
    pub meta: String,
    pub match_ranges: Vec<[usize; 2]>,
    pub pinned: bool,
    pub payload: ItemPayload,
}

impl LauncherItem {
    pub fn from_file_hit(hit: HybridHit, ranges: Vec<[usize; 2]>) -> Self {
        let display_path = strip_win_prefix(&hit.metadata.path);
        let subtitle = if hit.match_source != "filename" && !hit.hit.snippet.trim().is_empty() {
            let clean_snip: String = hit
                .hit
                .snippet
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(120)
                .collect();
            format!("{display_path}  ·  {clean_snip}")
        } else {
            display_path
        };
        let badge = match hit.match_source.as_str() {
            "content" => "Content",
            "semantic" => "Semantic",
            "ocr" => "OCR",
            "related" => "Related",
            "metadata" => "Meta",
            _ => kind_short_label(hit.metadata.kind),
        }
        .to_owned();
        let meta = if hit.metadata.kind == FileKind::Folder {
            "Folder".to_owned()
        } else {
            format_bytes(hit.metadata.size_bytes)
        };
        let indexed = hit.hit.stable_id.starts_with("indexed:");
        Self {
            title: hit.hit.name.clone(),
            subtitle,
            badge,
            meta,
            match_ranges: ranges,
            pinned: hit.pinned,
            payload: ItemPayload::File {
                stable_id: hit.hit.stable_id,
                root_path: hit.hit.root_path,
                path: hit.hit.path,
                file_kind: hit.metadata.kind,
                size_bytes: hit.metadata.size_bytes,
                pinned: hit.pinned,
                indexed,
            },
        }
    }

    pub fn icon(&self) -> IconName {
        match &self.payload {
            ItemPayload::Calculator(calc) => match calc.kind {
                CalculatorKind::ColorSwatch { .. } => IconName::Palette,
                _ => IconName::Calculator,
            },
            ItemPayload::App { .. } => IconName::AppWindow,
            ItemPayload::File { file_kind, .. } => icon_for_file_kind(*file_kind),
            ItemPayload::Command {
                action: CommandAction::OpenSettingsPage(_),
                ..
            } => IconName::Settings,
            ItemPayload::Command {
                action: CommandAction::ToggleComputerUse,
                ..
            } => IconName::Monitor,
            ItemPayload::Command { .. } => IconName::Terminal,
            ItemPayload::Clipboard { .. } => IconName::Copy,
        }
    }

    pub fn primary_action_label(&self) -> &'static str {
        match &self.payload {
            ItemPayload::Calculator(_) => "Copy Result",
            ItemPayload::App { .. } => "Launch",
            ItemPayload::File { .. } => "Open",
            ItemPayload::Command { .. } => "Run",
            ItemPayload::Clipboard { .. } => "Copy",
        }
    }

    pub fn section_label(&self) -> &'static str {
        match &self.payload {
            ItemPayload::Calculator(_) => "CALCULATOR",
            ItemPayload::App { .. } => "APPLICATIONS",
            ItemPayload::File { .. } => "LOCAL FILES",
            ItemPayload::Command { .. } => "COMMANDS & HELP",
            ItemPayload::Clipboard { .. } => "CLIPBOARD",
        }
    }
}

#[derive(Clone, Debug)]
pub enum DisplayRow {
    SectionHeader(String),
    Item {
        item_index: usize,
        shortcut_digit: Option<u8>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContextActionId {
    Primary,
    OpenFolder,
    CopyPath,
    CopyTitleOrValue,
    TogglePin,
    TogglePreview,
    SearchRelated,
    AskAi,
    OpenSettings,
}

#[derive(Clone, Debug)]
pub struct ContextAction {
    pub id: ContextActionId,
    pub label: &'static str,
    pub shortcut: &'static str,
    pub icon: IconName,
    pub destructive: bool,
}

pub fn actions_for_item(item: Option<&LauncherItem>, preview_visible: bool) -> Vec<ContextAction> {
    let mut actions = Vec::new();
    if let Some(item) = item {
        actions.push(ContextAction {
            id: ContextActionId::Primary,
            label: item.primary_action_label(),
            shortcut: "↵",
            icon: IconName::CornerDownLeft,
            destructive: false,
        });
        match &item.payload {
            ItemPayload::File {
                pinned, indexed, ..
            } => {
                actions.push(ContextAction {
                    id: ContextActionId::OpenFolder,
                    label: "Reveal in Explorer",
                    shortcut: "Ctrl+↵",
                    icon: IconName::FolderOpen,
                    destructive: false,
                });
                actions.push(ContextAction {
                    id: ContextActionId::CopyPath,
                    label: "Copy Full Path",
                    shortcut: "Ctrl+Shift+C",
                    icon: IconName::Copy,
                    destructive: false,
                });
                if *indexed {
                    actions.push(ContextAction {
                        id: ContextActionId::TogglePin,
                        label: if *pinned { "Unpin File" } else { "Pin to Top" },
                        shortcut: "Ctrl+P",
                        icon: if *pinned {
                            IconName::PinOff
                        } else {
                            IconName::Pin
                        },
                        destructive: false,
                    });
                    actions.push(ContextAction {
                        id: ContextActionId::SearchRelated,
                        label: "Find Related Files",
                        shortcut: "Ctrl+R",
                        icon: IconName::Sparkles,
                        destructive: false,
                    });
                }
            }
            ItemPayload::App { .. } => {
                actions.push(ContextAction {
                    id: ContextActionId::OpenFolder,
                    label: "Reveal Shortcut in Explorer",
                    shortcut: "Ctrl+↵",
                    icon: IconName::FolderOpen,
                    destructive: false,
                });
                actions.push(ContextAction {
                    id: ContextActionId::CopyPath,
                    label: "Copy Path",
                    shortcut: "Ctrl+Shift+C",
                    icon: IconName::Copy,
                    destructive: false,
                });
            }
            ItemPayload::Calculator(_) => {
                actions.push(ContextAction {
                    id: ContextActionId::CopyTitleOrValue,
                    label: "Copy Value",
                    shortcut: "Ctrl+C",
                    icon: IconName::Copy,
                    destructive: false,
                });
            }
            ItemPayload::Clipboard { pinned, .. } => {
                actions.push(ContextAction {
                    id: ContextActionId::CopyTitleOrValue,
                    label: "Copy Snippet",
                    shortcut: "Ctrl+C",
                    icon: IconName::Copy,
                    destructive: false,
                });
                actions.push(ContextAction {
                    id: ContextActionId::TogglePin,
                    label: if *pinned {
                        "Unpin Snippet"
                    } else {
                        "Pin Snippet"
                    },
                    shortcut: "Ctrl+P",
                    icon: if *pinned {
                        IconName::PinOff
                    } else {
                        IconName::Pin
                    },
                    destructive: false,
                });
            }
            ItemPayload::Command { .. } => {}
        }
        actions.push(ContextAction {
            id: ContextActionId::AskAi,
            label: "Ask Lumen AI",
            shortcut: "Shift+↵",
            icon: IconName::Sparkles,
            destructive: false,
        });
    }
    actions.push(ContextAction {
        id: ContextActionId::TogglePreview,
        label: if preview_visible {
            "Hide Preview Pane"
        } else {
            "Show Preview Pane"
        },
        shortcut: "Alt+↵",
        icon: IconName::PanelRight,
        destructive: false,
    });
    actions.push(ContextAction {
        id: ContextActionId::OpenSettings,
        label: "Open Lumen Settings",
        shortcut: "Ctrl+,",
        icon: IconName::Settings,
        destructive: false,
    });
    actions
}

#[derive(Clone, Debug)]
pub enum PreviewContentState {
    Empty,
    Loading(String),
    File {
        preview: BasicPreview,
        path: PathBuf,
        file_kind: FileKind,
        size_bytes: u64,
    },
    Calculator(CalculatorResult),
    App {
        name: String,
        path: String,
        category: String,
    },
    Command {
        title: String,
        description: String,
    },
    Clipboard {
        title: String,
        text: String,
        pinned: bool,
    },
    Error {
        title: String,
        message: String,
    },
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SettingsTab {
    #[default]
    General,
    Appearance,
    IndexedRoots,
    Search,
    LocalAi,
    AgentGateway,
    Providers,
    ComputerUse,
    Activity,
    Privacy,
    Diagnostics,
}

impl SettingsTab {
    pub const ALL: &'static [Self] = &[
        Self::General,
        Self::Appearance,
        Self::IndexedRoots,
        Self::Search,
        Self::LocalAi,
        Self::AgentGateway,
        Self::Providers,
        Self::ComputerUse,
        Self::Activity,
        Self::Privacy,
        Self::Diagnostics,
    ];

    pub fn from_id(id: &str) -> Self {
        match id {
            "appearance" => Self::Appearance,
            "indexed-roots" => Self::IndexedRoots,
            "search" => Self::Search,
            "local-ai" => Self::LocalAi,
            "agent-gateway" => Self::AgentGateway,
            "providers" => Self::Providers,
            "computer-use" => Self::ComputerUse,
            "activity" => Self::Activity,
            "privacy" => Self::Privacy,
            "diagnostics" => Self::Diagnostics,
            _ => Self::General,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::General => "General",
            Self::Appearance => "Appearance",
            Self::IndexedRoots => "Indexed Roots",
            Self::Search => "Search",
            Self::LocalAi => "Local AI",
            Self::AgentGateway => "AgentGateway",
            Self::Providers => "Providers",
            Self::ComputerUse => "Computer Use",
            Self::Activity => "Activity",
            Self::Privacy => "Privacy",
            Self::Diagnostics => "Diagnostics",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            Self::General => "Global shortcut, monitor placement, and window lifecycle",
            Self::Appearance => "Windows 11 Acrylic/Mica backdrop, theme, density, and motion",
            Self::IndexedRoots => "Local folders, exclusions, hidden files, and live re-sync",
            Self::Search => "Scopes, filename priority, recency, pinned boost, and vectors",
            Self::LocalAi => "Hardware profile, Lemonade local runtime, and model provisioning",
            Self::AgentGateway => "Supervisor health, model routes, and MCP tool permissions",
            Self::Providers => "Windows Credential Manager keys and provider switcher profiles",
            Self::ComputerUse => "Browser and selected-window automation consent and safety",
            Self::Activity => "Quiet modes during games, fullscreen video, and battery power",
            Self::Privacy => "Previews, search history, local index data, and diagnostics export",
            Self::Diagnostics => "Live health telemetry across search, vector, gateway, and shell",
        }
    }

    pub fn icon(self) -> IconName {
        match self {
            Self::General => IconName::Settings,
            Self::Appearance => IconName::Palette,
            Self::IndexedRoots => IconName::Folder,
            Self::Search => IconName::Search,
            Self::LocalAi => IconName::Cpu,
            Self::AgentGateway => IconName::Plug,
            Self::Providers => IconName::Key,
            Self::ComputerUse => IconName::Monitor,
            Self::Activity => IconName::Activity,
            Self::Privacy => IconName::Shield,
            Self::Diagnostics => IconName::HardDrive,
        }
    }
}

pub fn icon_for_file_kind(kind: FileKind) -> IconName {
    match kind {
        FileKind::Folder => IconName::Folder,
        FileKind::Pdf | FileKind::Document | FileKind::Presentation => IconName::FileText,
        FileKind::Spreadsheet => IconName::FileSpreadsheet,
        FileKind::Source => IconName::FileCode,
        FileKind::Image => IconName::Image,
        FileKind::Video => IconName::Film,
        FileKind::Audio => IconName::Music,
        FileKind::Archive => IconName::Archive,
        FileKind::Executable => IconName::Terminal,
        FileKind::Model => IconName::Cpu,
        FileKind::Unknown => IconName::File,
    }
}

pub fn kind_short_label(kind: FileKind) -> &'static str {
    match kind {
        FileKind::Folder => "Folder",
        FileKind::Pdf => "PDF",
        FileKind::Document => "Doc",
        FileKind::Spreadsheet => "Sheet",
        FileKind::Presentation => "Slide",
        FileKind::Source => "Code",
        FileKind::Image => "Image",
        FileKind::Video => "Video",
        FileKind::Audio => "Audio",
        FileKind::Archive => "Archive",
        FileKind::Executable => "App",
        FileKind::Model => "Model",
        FileKind::Unknown => "File",
    }
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{} KB", (bytes + 512) / 1024)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn strip_win_prefix(path: &str) -> String {
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc}");
    }
    if let Some(rest) = path.strip_prefix(r"\\?\") {
        return rest.to_owned();
    }
    path.to_owned()
}

/// Parses inline query filter prefixes such as `ext:rs` or `kind:pdf` out of the raw search text.
pub fn parse_inline_filters(raw: &str) -> (String, Vec<QueryFilter>) {
    let mut query_parts = Vec::new();
    let mut filters = Vec::new();
    for token in raw.split_whitespace() {
        if let Some(ext) = token
            .strip_prefix("ext:")
            .or_else(|| token.strip_prefix("EXT:"))
        {
            let clean = ext.trim_start_matches('.').to_ascii_lowercase();
            if !clean.is_empty() && clean.chars().all(|c| c.is_ascii_alphanumeric()) {
                filters.push(QueryFilter {
                    id: "extension".into(),
                    label: format!(".{clean}"),
                    value: clean,
                });
                continue;
            }
        }
        if let Some(kind) = token
            .strip_prefix("kind:")
            .or_else(|| token.strip_prefix("type:"))
        {
            let clean = kind.to_ascii_lowercase();
            if matches!(
                clean.as_str(),
                "folder"
                    | "pdf"
                    | "document"
                    | "spreadsheet"
                    | "presentation"
                    | "source"
                    | "image"
                    | "video"
                    | "audio"
                    | "archive"
                    | "executable"
            ) {
                filters.push(QueryFilter {
                    id: "kind".into(),
                    label: clean.clone(),
                    value: clean,
                });
                continue;
            }
        }
        query_parts.push(token);
    }
    (query_parts.join(" "), filters)
}
