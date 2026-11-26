//! Built-in Lumen commands and public help catalogue (mirrors `catalogue.json`).

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CommandAction {
    OpenSettingsPage(&'static str),
    ToggleComputerUse,
    ToggleTheme,
    TogglePreviewPane,
    SynchronizeRoots,
    ClearSearchHistory,
    RefreshDiagnostics,
    HideLauncher,
    QuitLumen,
}

#[derive(Clone, Debug)]
pub struct BuiltinCommand {
    pub id: &'static str,
    pub title: &'static str,
    pub subtitle: &'static str,
    pub keywords: &'static [&'static str],
    pub action: CommandAction,
    pub is_help: bool,
}

pub const BUILTIN_COMMANDS: &[BuiltinCommand] = &[
    BuiltinCommand {
        id: "cmd.settings",
        title: "Open Lumen Settings",
        subtitle: "Configure shortcuts, folders, appearance, AI, and privacy",
        keywords: &["settings", "preferences", "config", "options"],
        action: CommandAction::OpenSettingsPage("general"),
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.computer-use",
        title: "Switch to Computer Use",
        subtitle: "Run a browser or selected-window task with approval controls",
        keywords: &["computer", "agent", "browser", "edge", "automation"],
        action: CommandAction::ToggleComputerUse,
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.theme",
        title: "Toggle Dark / Light Theme",
        subtitle: "Switch Lumen's visual palette and Windows DWM immersion mode",
        keywords: &["theme", "dark", "light", "appearance", "color"],
        action: CommandAction::ToggleTheme,
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.preview",
        title: "Toggle Preview Pane",
        subtitle: "Show or hide the split file inspector pane",
        keywords: &["preview", "inspector", "split", "pane"],
        action: CommandAction::TogglePreviewPane,
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.reindex",
        title: "Re-sync Indexed Folders",
        subtitle: "Refresh local SQLite & WinSearch indexes for all active roots",
        keywords: &["reindex", "refresh", "sync", "folders", "index"],
        action: CommandAction::SynchronizeRoots,
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.clear-history",
        title: "Clear Search History",
        subtitle: "Remove recorded recent queries and opened file history",
        keywords: &["history", "clear", "privacy", "recent"],
        action: CommandAction::ClearSearchHistory,
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.diagnostics",
        title: "View Runtime Diagnostics",
        subtitle: "Inspect index counts, sqlite-vector, AgentGateway, and local AI health",
        keywords: &["diagnostics", "status", "health", "debug", "vector"],
        action: CommandAction::OpenSettingsPage("diagnostics"),
        is_help: false,
    },
    BuiltinCommand {
        id: "cmd.quit",
        title: "Quit Lumen",
        subtitle: "Shut down background workers and exit Lumen",
        keywords: &["quit", "exit", "close", "shutdown"],
        action: CommandAction::QuitLumen,
        is_help: false,
    },
    // Public help catalogue items (matching src/services/windows-ai/catalogue.json)
    BuiltinCommand {
        id: "help.folders",
        title: "Choose indexed folders",
        subtitle: "Select local folders to search, pause roots, and configure exclusions",
        keywords: &["files", "directories", "index", "roots", "exclude", "folder"],
        action: CommandAction::OpenSettingsPage("indexed-roots"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.search",
        title: "Control search scopes and ranking",
        subtitle: "Tune filename priority, recency, pinned boost, and semantic search",
        keywords: &["meaning", "semantic", "find", "ranking", "help", "search"],
        action: CommandAction::OpenSettingsPage("search"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.local-ai",
        title: "Set up on-device AI",
        subtitle: "Check local Lemonade runtime, NPU/GPU profile, and Qwen/Nomic models",
        keywords: &["offline", "model", "download", "npu", "local", "ai"],
        action: CommandAction::OpenSettingsPage("local-ai"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.agents",
        title: "AgentGateway and MCP permissions",
        subtitle: "Manage provider routes, credentials, and MCP tool approvals",
        keywords: &["gateway", "mcp", "provider", "route", "tools"],
        action: CommandAction::OpenSettingsPage("agent-gateway"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.privacy",
        title: "Manage privacy and sanitized diagnostics",
        subtitle: "Control previews, search history, and secret-free diagnostics export",
        keywords: &["privacy", "consent", "export", "delete", "private"],
        action: CommandAction::OpenSettingsPage("privacy"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.activity",
        title: "Pause work while gaming or on battery",
        subtitle: "Control quiet modes during games, fullscreen video, and battery use",
        keywords: &["battery", "power", "gaming", "fullscreen", "pause", "activity"],
        action: CommandAction::OpenSettingsPage("activity"),
        is_help: true,
    },
    BuiltinCommand {
        id: "help.shortcut",
        title: "Configure launcher shortcut and monitor",
        subtitle: "Customize global hotkey (Alt+Space), startup, and monitor placement",
        keywords: &["alt", "space", "hotkey", "keyboard", "shortcut", "monitor"],
        action: CommandAction::OpenSettingsPage("general"),
        is_help: true,
    },
];

pub fn fuzzy_match_ranges(text: &str, query: &str) -> Option<(f64, Vec<[usize; 2]>)> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Some((0.5, Vec::new()));
    }
    let lower = text.to_lowercase();
    if lower == q {
        return Some((1.0, vec![[0, text.chars().count()]]));
    }
    if lower.starts_with(&q) {
        return Some((0.95, vec![[0, q.chars().count()]]));
    }
    if let Some(byte_idx) = lower.find(&q) {
        let start = lower[..byte_idx].chars().count();
        return Some((
            (0.86 - start as f64 * 0.003).max(0.70),
            vec![[start, start + q.chars().count()]],
        ));
    }
    let mut chars = lower.chars().enumerate();
    let mut first = None;
    let mut last = 0;
    let mut ranges = Vec::new();
    for qc in q.chars() {
        let (idx, _) = chars.find(|(_, c)| *c == qc)?;
        first.get_or_insert(idx);
        last = idx;
        ranges.push([idx, idx + 1]);
    }
    let span = last - first.unwrap_or(0) + 1;
    let score = (0.68 - span.saturating_sub(q.chars().count()) as f64 * 0.012).max(0.45);
    Some((score, ranges))
}

pub fn search_commands(query: &str, command_mode: bool) -> Vec<(&'static BuiltinCommand, f64, Vec<[usize; 2]>)> {
    let q = query.trim().strip_prefix('>').unwrap_or(query.trim()).trim();
    let mut matches = Vec::new();
    for cmd in BUILTIN_COMMANDS {
        if q.is_empty() {
            if command_mode && !cmd.is_help {
                matches.push((cmd, 0.9, Vec::new()));
            }
            continue;
        }
        if let Some((score, ranges)) = fuzzy_match_ranges(cmd.title, q) {
            let bonus = if command_mode && !cmd.is_help { 0.1 } else { 0.0 };
            matches.push((cmd, (score + bonus).min(1.0), ranges));
        } else if cmd
            .keywords
            .iter()
            .any(|kw| kw.to_ascii_lowercase().contains(&q.to_ascii_lowercase()))
            || cmd.subtitle.to_ascii_lowercase().contains(&q.to_ascii_lowercase())
        {
            matches.push((cmd, 0.62, Vec::new()));
        }
    }
    matches.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.title.cmp(b.0.title)));
    matches
}
