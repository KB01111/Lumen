//! Granular GPUI view entities and shared visual primitives for Lumen.

pub mod action_menu;
pub mod answer_banner;
pub mod computer_use;
pub mod footer_bar;
pub mod preview_pane;
pub mod results_list;
pub mod scope_bar;
pub mod search_header;
pub mod settings;
pub mod toast;

use gpui_kit::{assets::IconName, component::Icon, *};

use crate::{
    model::{ItemPayload, LauncherItem},
    theme::LumenPalette,
};
use lumen_core::search::FileKind;

/// Renders a crisp keycap badge (e.g. `↵`, `Ctrl+K`, `Tab`).
pub fn kbd_pill(label: impl Into<SharedString>, palette: &LumenPalette) -> Div {
    div()
        .px(px(6.0))
        .py(px(2.0))
        .rounded(px(5.0))
        .bg(palette.kbd_bg)
        .border_1()
        .border_color(palette.kbd_border)
        .text_size(px(10.5))
        .font_weight(FontWeight::MEDIUM)
        .text_color(palette.kbd_text)
        .line_height(px(13.0))
        .child(label.into())
}

/// Renders a subtle semantic pill/tag badge.
pub fn status_pill(label: impl Into<SharedString>, fg: Hsla, bg: Hsla, border: Hsla) -> Div {
    div()
        .px(px(7.0))
        .py(px(2.0))
        .rounded(px(999.0))
        .bg(bg)
        .border_1()
        .border_color(border)
        .text_size(px(10.5))
        .font_weight(FontWeight::MEDIUM)
        .text_color(fg)
        .line_height(px(13.0))
        .child(label.into())
}

/// Returns the accent color tint for a launcher item's icon tile.
pub fn item_accent_color(item: &LauncherItem, palette: &LumenPalette) -> Hsla {
    match &item.payload {
        ItemPayload::Calculator(_) => palette.kind_calc,
        ItemPayload::App { .. } => palette.kind_app,
        ItemPayload::File { file_kind, .. } => match file_kind {
            FileKind::Folder => palette.kind_folder,
            FileKind::Source => palette.kind_code,
            FileKind::Pdf | FileKind::Document | FileKind::Presentation | FileKind::Spreadsheet => {
                palette.kind_doc
            }
            FileKind::Image | FileKind::Video | FileKind::Audio => palette.kind_image,
            FileKind::Archive | FileKind::Executable | FileKind::Model | FileKind::Unknown => {
                palette.text_secondary
            }
        },
        ItemPayload::Command { is_help: true, .. } => palette.kind_help,
        ItemPayload::Command { is_help: false, .. } => palette.kind_command,
        ItemPayload::Clipboard { .. } => palette.kind_clipboard,
    }
}

/// Renders a square rounded icon badge tinted subtly by item category.
pub fn icon_tile(
    icon: IconName,
    tint: Hsla,
    selected: bool,
    size_px: f32,
    icon_px: f32,
    palette: &LumenPalette,
) -> Div {
    let tile_bg = if selected {
        Hsla {
            a: if palette.is_dark { 0.22 } else { 0.16 },
            ..tint
        }
    } else {
        Hsla {
            a: if palette.is_dark { 0.12 } else { 0.10 },
            ..tint
        }
    };
    let tile_border = Hsla {
        a: if selected { 0.38 } else { 0.16 },
        ..tint
    };
    div()
        .w(px(size_px))
        .h(px(size_px))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(8.0))
        .bg(tile_bg)
        .border_1()
        .border_color(tile_border)
        .child(Icon::new(icon).size(px(icon_px)).text_color(tint))
}

/// Renders a title string with character-level fuzzy match ranges emphasized in bold + accent.
pub fn highlighted_text(
    text: &str,
    ranges: &[[usize; 2]],
    base_color: Hsla,
    highlight_color: Hsla,
    font_size: f32,
) -> Div {
    if ranges.is_empty() {
        return div()
            .flex()
            .items_center()
            .overflow_hidden()
            .text_ellipsis()
            .whitespace_nowrap()
            .text_size(px(font_size))
            .font_weight(FontWeight::MEDIUM)
            .text_color(base_color)
            .child(text.to_owned());
    }

    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    let mut normalized: Vec<(usize, usize)> = ranges
        .iter()
        .filter_map(|&[start, end]| {
            let s = start.min(total);
            let e = end.min(total);
            (s < e).then_some((s, e))
        })
        .collect();
    normalized.sort_by_key(|(s, _)| *s);

    let mut row = div()
        .flex()
        .items_center()
        .overflow_hidden()
        .whitespace_nowrap()
        .text_size(px(font_size));

    let mut cursor = 0usize;
    for (start, end) in normalized {
        let s = start.max(cursor);
        let e = end.max(s);
        if s > cursor {
            let plain: String = chars[cursor..s].iter().collect();
            row = row.child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(base_color)
                    .child(plain),
            );
        }
        if e > s {
            let matched: String = chars[s..e].iter().collect();
            row = row.child(
                div()
                    .font_weight(FontWeight::BOLD)
                    .text_color(highlight_color)
                    .child(matched),
            );
        }
        cursor = e;
    }
    if cursor < total {
        let tail: String = chars[cursor..total].iter().collect();
        row = row.child(
            div()
                .font_weight(FontWeight::MEDIUM)
                .text_color(base_color)
                .child(tail),
        );
    }
    row
}
