//! Lightweight in-process clipboard history ring and quick snippets store.

use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_CLIPBOARD_ENTRIES: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClipboardEntry {
    pub id: String,
    pub title: String,
    pub text: String,
    pub captured_ms: u64,
    pub pinned: bool,
}

#[derive(Default)]
pub struct ClipboardHistory {
    entries: Mutex<VecDeque<ClipboardEntry>>,
}

impl ClipboardHistory {
    pub fn record(&self, text: impl Into<String>) {
        let text = text.into();
        let trimmed = text.trim();
        if trimmed.is_empty() || text.len() > 64 * 1024 {
            return;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return;
        };
        if entries.front().is_some_and(|e| e.text == text) {
            return;
        }
        entries.retain(|e| e.text != text || e.pinned);
        let title: String = trimmed
            .lines()
            .next()
            .unwrap_or(trimmed)
            .chars()
            .take(80)
            .collect();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let seq = entries.len();
        entries.push_front(ClipboardEntry {
            id: format!("clip:{now}-{seq}"),
            title,
            text,
            captured_ms: now,
            pinned: false,
        });
        while entries.len() > MAX_CLIPBOARD_ENTRIES {
            if let Some(pos) = entries.iter().rposition(|e| !e.pinned) {
                entries.remove(pos);
            } else {
                break;
            }
        }
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<ClipboardEntry> {
        let q = query.trim().to_ascii_lowercase();
        let Ok(entries) = self.entries.lock() else {
            return Vec::new();
        };
        entries
            .iter()
            .filter(|entry| {
                q.is_empty()
                    || entry.title.to_ascii_lowercase().contains(&q)
                    || entry.text.to_ascii_lowercase().contains(&q)
            })
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn toggle_pin(&self, id: &str) -> bool {
        let Ok(mut entries) = self.entries.lock() else {
            return false;
        };
        if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
            entry.pinned = !entry.pinned;
            return entry.pinned;
        }
        false
    }

    pub fn clear(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.retain(|e| e.pinned);
        }
    }
}
