//! Contextual split Preview Pane with rich renderers for files, folders, images,
//! calculator/unit conversions, live CSS color swatches, applications, commands, and clipboard items.

use std::{path::PathBuf, time::Duration};

use gpui_kit::{
    assets::IconName,
    base::animation::ease_out_cubic,
    component::{Icon, spinner::Spinner},
    prelude::FluentBuilder,
    *,
};
use lumen_core::{
    calculator::{CalculatorKind, CalculatorResult},
    search::{BasicPreview, FileKind, PreviewKind},
};

use crate::{
    model::{
        PreviewContentState, format_bytes, icon_for_file_kind, kind_short_label, strip_win_prefix,
    },
    theme::{LumenPalette, rgba_hsla},
    views::{icon_tile, kbd_pill},
};

#[derive(Clone, Debug)]
pub enum PreviewPaneEvent {
    OpenPrimary,
    RevealInExplorer,
    CopyText(String, &'static str),
}

pub struct PreviewPane {
    palette: LumenPalette,
    content: PreviewContentState,
    seq: u64,
}

impl EventEmitter<PreviewPaneEvent> for PreviewPane {}

impl PreviewPane {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            content: PreviewContentState::Empty,
            seq: 0,
        }
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn set_content(&mut self, content: PreviewContentState, cx: &mut Context<Self>) {
        self.content = content;
        self.seq += 1;
        cx.notify();
    }

    fn render_calculator(&self, calc: &CalculatorResult, cx: &mut Context<Self>) -> AnyElement {
        let p = self.palette;
        let copy_value = calc.copy_value.clone();
        let kind_label = match calc.kind {
            CalculatorKind::Math => "INSTANT MATH",
            CalculatorKind::UnitConversion { .. } => "UNIT CONVERSION",
            CalculatorKind::BaseConversion { .. } => "BASE CONVERSION",
            CalculatorKind::ColorSwatch { .. } => "COLOR INSPECTOR",
        };

        let swatch_block = if let CalculatorKind::ColorSwatch {
            r,
            g,
            b,
            ref hex,
            ref rgb,
            ref hsl,
            ..
        } = calc.kind
        {
            let swatch_color = rgba_hsla(r, g, b, 1.0);
            let hex_val = hex.clone();
            let rgb_val = rgb.clone();
            let hsl_val = hsl.clone();
            Some(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(
                        div()
                            .w_full()
                            .h(px(108.0))
                            .rounded(px(10.0))
                            .bg(swatch_color)
                            .border_1()
                            .border_color(p.border_outer)
                            .shadow_md(),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(5.0))
                            .child(self.copy_row("HEX", hex_val, cx))
                            .child(self.copy_row("RGB", rgb_val, cx))
                            .child(self.copy_row("HSL", hsl_val, cx)),
                    ),
            )
        } else {
            None
        };

        div()
            .size_full()
            .p(px(16.0))
            .flex()
            .flex_col()
            .justify_between()
            .gap(px(12.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(
                        div()
                            .text_size(px(10.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(p.kind_calc)
                            .child(kind_label),
                    )
                    .child(
                        div()
                            .text_size(px(12.0))
                            .text_color(p.text_muted)
                            .child(calc.expression.clone()),
                    )
                    .child(
                        div()
                            .p(px(14.0))
                            .rounded(px(10.0))
                            .bg(p.surface_inset)
                            .border_1()
                            .border_color(p.border_subtle)
                            .child(
                                div()
                                    .text_size(px(24.0))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(p.text_primary)
                                    .child(calc.formatted.clone()),
                            ),
                    )
                    .when_some(swatch_block, |el, block| el.child(block))
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(p.text_secondary)
                            .child(calc.subtitle.clone()),
                    ),
            )
            .child(
                div()
                    .id("preview-copy-calc")
                    .w_full()
                    .py(px(8.0))
                    .px(px(12.0))
                    .rounded(px(8.0))
                    .bg(p.accent_soft)
                    .border_1()
                    .border_color(p.accent_border)
                    .flex()
                    .items_center()
                    .justify_center()
                    .gap(px(8.0))
                    .cursor_pointer()
                    .on_click(cx.listener(move |_, _, _, cx| {
                        cx.emit(PreviewPaneEvent::CopyText(
                            copy_value.clone(),
                            "Copied value to clipboard",
                        ));
                    }))
                    .child(
                        Icon::new(IconName::Copy)
                            .size(px(13.0))
                            .text_color(p.accent),
                    )
                    .child(
                        div()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(p.accent_bright)
                            .child("Copy Result"),
                    )
                    .child(kbd_pill("↵", &p)),
            )
            .into_any_element()
    }

    fn copy_row(
        &self,
        label: &'static str,
        value: String,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let p = self.palette;
        let click_val = value.clone();
        div()
            .id(SharedString::from(format!("color-copy-{label}")))
            .px(px(10.0))
            .py(px(6.0))
            .rounded(px(7.0))
            .bg(p.surface_inset)
            .border_1()
            .border_color(p.border_subtle)
            .flex()
            .items_center()
            .justify_between()
            .cursor_pointer()
            .hover(move |s| s.bg(p.row_hover))
            .on_click(cx.listener(move |_, _, _, cx| {
                cx.emit(PreviewPaneEvent::CopyText(
                    click_val.clone(),
                    "Copied color value",
                ));
            }))
            .child(
                div()
                    .text_size(px(10.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(p.text_muted)
                    .child(label),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .child(
                        div()
                            .font_family("Cascadia Code")
                            .text_size(px(11.5))
                            .text_color(p.text_primary)
                            .child(value),
                    )
                    .child(
                        Icon::new(IconName::Copy)
                            .size(px(11.0))
                            .text_color(p.text_muted),
                    ),
            )
    }

    fn render_file_preview(
        &self,
        preview: &BasicPreview,
        path: &PathBuf,
        file_kind: FileKind,
        size_bytes: u64,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = self.palette;
        let display_path = strip_win_prefix(&path.to_string_lossy());
        let copy_path = display_path.clone();
        let tint = match file_kind {
            FileKind::Folder => p.kind_folder,
            FileKind::Source => p.kind_code,
            FileKind::Image | FileKind::Video | FileKind::Audio => p.kind_image,
            FileKind::Pdf | FileKind::Document | FileKind::Presentation | FileKind::Spreadsheet => {
                p.kind_doc
            }
            _ => p.accent,
        };

        let body: AnyElement = match preview.kind {
            PreviewKind::Image => div()
                .flex_1()
                .min_h(px(140.0))
                .w_full()
                .rounded(px(9.0))
                .bg(p.surface_inset)
                .border_1()
                .border_color(p.border_subtle)
                .overflow_hidden()
                .flex()
                .items_center()
                .justify_center()
                .p(px(8.0))
                .child(
                    img(path.clone())
                        .max_w_full()
                        .max_h(px(210.0))
                        .object_fit(ObjectFit::Contain)
                        .rounded(px(6.0)),
                )
                .into_any_element(),
            PreviewKind::Folder => {
                let children_list = preview.children.clone();
                div()
                    .id("preview-folder-scroll")
                    .flex_1()
                    .w_full()
                    .rounded(px(9.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .overflow_y_scroll()
                    .p(px(8.0))
                    .flex()
                    .flex_col()
                    .gap(px(3.0))
                    .when(children_list.is_empty(), |el| {
                        el.child(
                            div()
                                .p(px(8.0))
                                .text_size(px(11.5))
                                .text_color(p.text_muted)
                                .child("Empty folder"),
                        )
                    })
                    .children(children_list.into_iter().take(48).map(|child| {
                        div()
                            .px(px(6.0))
                            .py(px(4.0))
                            .rounded(px(5.0))
                            .flex()
                            .items_center()
                            .gap(px(7.0))
                            .child(
                                Icon::new(icon_for_file_kind(child.kind))
                                    .size(px(12.0))
                                    .text_color(if child.kind == FileKind::Folder {
                                        p.kind_folder
                                    } else {
                                        p.text_muted
                                    }),
                            )
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(p.text_secondary)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(child.name),
                            )
                    }))
                    .into_any_element()
            }
            PreviewKind::Spreadsheet if preview.rows.is_some() => {
                let cols = preview.columns.clone().unwrap_or_default();
                let rows = preview.rows.clone().unwrap_or_default();
                div()
                    .id("preview-sheet-scroll")
                    .flex_1()
                    .w_full()
                    .rounded(px(9.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .overflow_y_scroll()
                    .p(px(8.0))
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .when(!cols.is_empty(), |el| {
                        el.child(
                            div()
                                .flex()
                                .gap(px(6.0))
                                .pb(px(4.0))
                                .border_b_1()
                                .border_color(p.border_subtle)
                                .children(cols.into_iter().take(4).map(|col| {
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .text_size(px(10.5))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(p.accent_bright)
                                        .overflow_hidden()
                                        .text_ellipsis()
                                        .whitespace_nowrap()
                                        .child(col)
                                })),
                        )
                    })
                    .children(rows.into_iter().take(16).map(|r| {
                        div()
                            .flex()
                            .gap(px(6.0))
                            .children(r.into_iter().take(4).map(|cell| {
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .text_size(px(10.5))
                                    .text_color(p.text_secondary)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(cell)
                            }))
                    }))
                    .into_any_element()
            }
            PreviewKind::Text | PreviewKind::Markdown | PreviewKind::Source => {
                let raw = preview
                    .text
                    .clone()
                    .unwrap_or_else(|| preview.subtitle.clone());
                let snippet: String = raw.lines().take(64).collect::<Vec<_>>().join("\n");
                div()
                    .id("preview-text-scroll")
                    .flex_1()
                    .w_full()
                    .rounded(px(9.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .overflow_y_scroll()
                    .p(px(10.0))
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .child(
                        div()
                            .font_family(if preview.kind == PreviewKind::Markdown {
                                "Segoe UI Variable Text"
                            } else {
                                "Cascadia Code"
                            })
                            .text_size(px(11.5))
                            .line_height(px(17.0))
                            .text_color(p.text_secondary)
                            .child(snippet),
                    )
                    .into_any_element()
            }
            _ => {
                let detail = preview
                    .text
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| {
                        if !preview.subtitle.is_empty() {
                            preview.subtitle.clone()
                        } else {
                            format!(
                                "{} file ready to open natively.",
                                kind_short_label(file_kind)
                            )
                        }
                    });
                div()
                    .flex_1()
                    .w_full()
                    .rounded(px(9.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .p(px(12.0))
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(10.0))
                    .child(icon_tile(
                        icon_for_file_kind(file_kind),
                        tint,
                        true,
                        48.0,
                        24.0,
                        &p,
                    ))
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(p.text_secondary)
                            .child(detail),
                    )
                    .into_any_element()
            }
        };

        div()
            .size_full()
            .p(px(14.0))
            .flex()
            .flex_col()
            .gap(px(10.0))
            .child(
                // File header
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(icon_tile(
                        icon_for_file_kind(file_kind),
                        tint,
                        true,
                        34.0,
                        17.0,
                        &p,
                    ))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(2.0))
                            .child(
                                div()
                                    .text_size(px(13.0))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_primary)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(preview.title.clone()),
                            )
                            .child(
                                div()
                                    .text_size(px(11.0))
                                    .text_color(p.text_muted)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(display_path.clone()),
                            ),
                    ),
            )
            .child(body)
            .child(
                // Compact metadata table + quick actions
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .pt(px(8.0))
                    .border_t_1()
                    .border_color(p.border_subtle)
                    .child(meta_kv("Kind", kind_short_label(file_kind), &p))
                    .child(meta_kv(
                        "Size",
                        if file_kind == FileKind::Folder {
                            format!("{} items", preview.children.len())
                        } else {
                            format_bytes(size_bytes)
                        },
                        &p,
                    ))
                    .child(
                        div()
                            .mt(px(4.0))
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .id("preview-open-file")
                                    .flex_1()
                                    .py(px(5.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .gap(px(5.0))
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(PreviewPaneEvent::OpenPrimary);
                                    }))
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(p.accent_bright)
                                            .child("Open"),
                                    ),
                            )
                            .child(
                                div()
                                    .id("preview-reveal-file")
                                    .py(px(5.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(PreviewPaneEvent::RevealInExplorer);
                                    }))
                                    .child(
                                        Icon::new(IconName::FolderOpen)
                                            .size(px(13.0))
                                            .text_color(p.text_secondary),
                                    ),
                            )
                            .child(
                                div()
                                    .id("preview-copy-path")
                                    .py(px(5.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(move |_, _, _, cx| {
                                        cx.emit(PreviewPaneEvent::CopyText(
                                            copy_path.clone(),
                                            "Copied file path",
                                        ));
                                    }))
                                    .child(
                                        Icon::new(IconName::Copy)
                                            .size(px(13.0))
                                            .text_color(p.text_secondary),
                                    ),
                            ),
                    ),
            )
            .into_any_element()
    }
}

fn meta_kv(key: &'static str, val: impl Into<SharedString>, palette: &LumenPalette) -> Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .text_size(px(11.0))
        .child(div().text_color(palette.text_muted).child(key))
        .child(
            div()
                .text_color(palette.text_secondary)
                .font_weight(FontWeight::MEDIUM)
                .child(val.into()),
        )
}

impl Render for PreviewPane {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let seq = self.seq;
        let dur = if p.reduced_motion {
            Duration::from_millis(1)
        } else {
            Duration::from_millis(130)
        };

        let inner: AnyElement = match &self.content {
            PreviewContentState::Empty => div()
                .size_full()
                .p(px(16.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(8.0))
                .child(
                    Icon::new(IconName::Eye)
                        .size(px(20.0))
                        .text_color(p.text_muted),
                )
                .child(
                    div()
                        .text_size(px(12.0))
                        .text_color(p.text_muted)
                        .child("Select an item to inspect"),
                )
                .into_any_element(),
            PreviewContentState::Loading(name) => div()
                .size_full()
                .p(px(16.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(10.0))
                .child(Spinner::new().color(p.accent))
                .child(
                    div()
                        .text_size(px(12.0))
                        .text_color(p.text_secondary)
                        .overflow_hidden()
                        .text_ellipsis()
                        .whitespace_nowrap()
                        .child(format!("Loading {name}...")),
                )
                .into_any_element(),
            PreviewContentState::Calculator(calc) => self.render_calculator(calc, cx),
            PreviewContentState::File {
                preview,
                path,
                file_kind,
                size_bytes,
            } => self.render_file_preview(preview, path, *file_kind, *size_bytes, cx),
            PreviewContentState::App {
                name,
                path,
                category,
            } => {
                let copy_path = path.clone();
                div()
                    .size_full()
                    .p(px(16.0))
                    .flex()
                    .flex_col()
                    .justify_between()
                    .gap(px(12.0))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(10.0))
                            .child(icon_tile(
                                IconName::AppWindow,
                                p.kind_app,
                                true,
                                44.0,
                                22.0,
                                &p,
                            ))
                            .child(
                                div()
                                    .text_size(px(15.0))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_primary)
                                    .child(name.clone()),
                            )
                            .child(meta_kv("Category", category.clone(), &p))
                            .child(
                                div()
                                    .p(px(9.0))
                                    .rounded(px(8.0))
                                    .bg(p.surface_inset)
                                    .border_1()
                                    .border_color(p.border_subtle)
                                    .font_family("Cascadia Code")
                                    .text_size(px(10.5))
                                    .text_color(p.text_muted)
                                    .child(path.clone()),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .id("preview-launch-app")
                                    .flex_1()
                                    .py(px(7.0))
                                    .rounded(px(7.0))
                                    .bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .gap(px(6.0))
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(PreviewPaneEvent::OpenPrimary);
                                    }))
                                    .child(
                                        div()
                                            .text_size(px(12.0))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(p.accent_bright)
                                            .child("Launch"),
                                    )
                                    .child(kbd_pill("↵", &p)),
                            )
                            .child(
                                div()
                                    .id("preview-copy-app-path")
                                    .py(px(7.0))
                                    .px(px(9.0))
                                    .rounded(px(7.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(move |_, _, _, cx| {
                                        cx.emit(PreviewPaneEvent::CopyText(
                                            copy_path.clone(),
                                            "Copied app path",
                                        ));
                                    }))
                                    .child(
                                        Icon::new(IconName::Copy)
                                            .size(px(13.0))
                                            .text_color(p.text_secondary),
                                    ),
                            ),
                    )
                    .into_any_element()
            }
            PreviewContentState::Command { title, description } => div()
                .size_full()
                .p(px(16.0))
                .flex()
                .flex_col()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(10.0))
                        .child(icon_tile(
                            IconName::Terminal,
                            p.kind_command,
                            true,
                            42.0,
                            20.0,
                            &p,
                        ))
                        .child(
                            div()
                                .text_size(px(14.5))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(p.text_primary)
                                .child(title.clone()),
                        )
                        .child(
                            div()
                                .text_size(px(12.0))
                                .line_height(px(18.0))
                                .text_color(p.text_secondary)
                                .child(description.clone()),
                        ),
                )
                .child(
                    div()
                        .id("preview-run-cmd")
                        .w_full()
                        .py(px(7.0))
                        .rounded(px(7.0))
                        .bg(p.accent_soft)
                        .border_1()
                        .border_color(p.accent_border)
                        .flex()
                        .items_center()
                        .justify_center()
                        .gap(px(6.0))
                        .cursor_pointer()
                        .on_click(cx.listener(|_, _, _, cx| {
                            cx.emit(PreviewPaneEvent::OpenPrimary);
                        }))
                        .child(
                            div()
                                .text_size(px(12.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(p.accent_bright)
                                .child("Run Command"),
                        )
                        .child(kbd_pill("↵", &p)),
                )
                .into_any_element(),
            PreviewContentState::Clipboard {
                title,
                text,
                pinned,
            } => {
                let copy_text = text.clone();
                div()
                    .size_full()
                    .p(px(14.0))
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_size(px(12.5))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_primary)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(title.clone()),
                            )
                            .when(*pinned, |el| {
                                el.child(
                                    Icon::new(IconName::Pin).size(px(12.0)).text_color(p.accent),
                                )
                            }),
                    )
                    .child(
                        div()
                            .id("preview-clip-scroll")
                            .flex_1()
                            .rounded(px(9.0))
                            .bg(p.surface_inset)
                            .border_1()
                            .border_color(p.border_subtle)
                            .overflow_y_scroll()
                            .p(px(10.0))
                            .font_family("Cascadia Code")
                            .text_size(px(11.5))
                            .line_height(px(17.0))
                            .text_color(p.text_secondary)
                            .child(text.clone()),
                    )
                    .child(
                        div()
                            .id("preview-copy-clip")
                            .w_full()
                            .py(px(7.0))
                            .rounded(px(7.0))
                            .bg(p.accent_soft)
                            .border_1()
                            .border_color(p.accent_border)
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap(px(6.0))
                            .cursor_pointer()
                            .on_click(cx.listener(move |_, _, _, cx| {
                                cx.emit(PreviewPaneEvent::CopyText(
                                    copy_text.clone(),
                                    "Copied snippet to clipboard",
                                ));
                            }))
                            .child(
                                Icon::new(IconName::Copy)
                                    .size(px(12.0))
                                    .text_color(p.accent),
                            )
                            .child(
                                div()
                                    .text_size(px(12.0))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.accent_bright)
                                    .child("Copy Snippet"),
                            ),
                    )
                    .into_any_element()
            }
            PreviewContentState::Error { title, message } => div()
                .size_full()
                .p(px(16.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(8.0))
                .child(
                    Icon::new(IconName::Shield)
                        .size(px(20.0))
                        .text_color(p.warning),
                )
                .child(
                    div()
                        .text_size(px(12.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(p.text_primary)
                        .child(title.clone()),
                )
                .child(
                    div()
                        .text_size(px(11.5))
                        .text_color(p.text_muted)
                        .child(message.clone()),
                )
                .into_any_element(),
        };

        div()
            .w(px(316.0))
            .h_full()
            .flex_none()
            .border_l_1()
            .border_color(p.border_subtle)
            .bg(Hsla {
                a: if p.is_dark { 0.28 } else { 0.35 },
                ..p.surface_inset
            })
            .child(div().size_full().child(inner).with_animation(
                ("lumen-preview-fade", seq),
                Animation::new(dur).with_easing(ease_out_cubic),
                |el, delta| el.opacity(0.6 + 0.4 * delta),
            ))
    }
}
