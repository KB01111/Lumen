//! Compact 32px Spotlight footer bar with live index/activity status and action hints.

use gpui_kit::{assets::IconName, component::Icon, prelude::FluentBuilder, *};

use crate::{theme::LumenPalette, views::kbd_pill};

#[derive(Clone, Debug)]
pub enum FooterEvent {
    RunPrimary,
    ToggleActions,
    TogglePreview,
    OpenSettings,
    AskAi,
}

#[derive(Clone, Debug, Default)]
pub struct FooterSnapshot {
    pub result_count: usize,
    pub indexed_files: u64,
    pub index_state: String,
    pub activity_label: String,
    pub primary_label: &'static str,
    pub has_selection: bool,
    pub actions_open: bool,
    pub preview_visible: bool,
    pub has_query: bool,
    pub searching: bool,
}

pub struct FooterBar {
    palette: LumenPalette,
    state: FooterSnapshot,
}

impl EventEmitter<FooterEvent> for FooterBar {}

impl FooterBar {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            state: FooterSnapshot {
                primary_label: "Open",
                ..Default::default()
            },
        }
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn update_state(&mut self, state: FooterSnapshot, cx: &mut Context<Self>) {
        self.state = state;
        cx.notify();
    }
}

impl Render for FooterBar {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let dot_color = if self.state.searching || self.state.index_state == "indexing" {
            p.accent
        } else if self.state.activity_label.contains("Paused")
            || self.state.activity_label.contains("Quiet")
        {
            p.warning
        } else {
            p.success
        };

        let left_label = if self.state.searching {
            "Searching local workspace...".to_owned()
        } else if self.state.result_count > 0 {
            if self.state.indexed_files > 0 {
                format!(
                    "{} results  ·  {} indexed",
                    self.state.result_count, self.state.indexed_files
                )
            } else {
                format!("{} results", self.state.result_count)
            }
        } else if self.state.indexed_files > 0 {
            format!("{} files indexed", self.state.indexed_files)
        } else {
            "Ready  ·  Add a folder in Settings to index local files".to_owned()
        };

        div()
            .h(px(34.0))
            .w_full()
            .flex_none()
            .px(px(14.0))
            .flex()
            .items_center()
            .justify_between()
            .bg(p.surface_footer)
            .border_t_1()
            .border_color(p.border_subtle)
            .child(
                // Left: status dot + counts + activity badge
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .overflow_hidden()
                    .child(
                        div()
                            .w(px(7.0))
                            .h(px(7.0))
                            .flex_none()
                            .rounded(px(999.0))
                            .bg(dot_color),
                    )
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(p.text_secondary)
                            .overflow_hidden()
                            .text_ellipsis()
                            .whitespace_nowrap()
                            .child(left_label),
                    )
                    .when(!self.state.activity_label.is_empty(), |el| {
                        el.child(
                            div()
                                .px(px(6.0))
                                .py(px(1.0))
                                .rounded(px(4.0))
                                .bg(p.kbd_bg)
                                .text_size(px(10.5))
                                .text_color(p.text_muted)
                                .child(self.state.activity_label.clone()),
                        )
                    }),
            )
            .child(
                // Right: interactive primary/AI/Actions/Settings controls
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .flex_none()
                    .when(self.state.has_query, |el| {
                        el.child(
                            div()
                                .id("footer-ask-ai")
                                .flex()
                                .items_center()
                                .gap(px(5.0))
                                .px(px(7.0))
                                .py(px(3.0))
                                .rounded(px(6.0))
                                .cursor_pointer()
                                .hover(move |s| s.bg(p.row_hover))
                                .on_click(cx.listener(|_, _, _, cx| cx.emit(FooterEvent::AskAi)))
                                .child(
                                    Icon::new(IconName::Sparkles)
                                        .size(px(12.0))
                                        .text_color(p.accent),
                                )
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .text_color(p.text_secondary)
                                        .child("Ask"),
                                )
                                .child(kbd_pill("⇧↵", &p)),
                        )
                    })
                    .when(self.state.has_selection, |el| {
                        let primary = self.state.primary_label;
                        el.child(
                            div()
                                .id("footer-primary")
                                .flex()
                                .items_center()
                                .gap(px(5.0))
                                .px(px(8.0))
                                .py(px(3.0))
                                .rounded(px(6.0))
                                .bg(p.accent_soft)
                                .border_1()
                                .border_color(p.accent_border)
                                .cursor_pointer()
                                .hover(move |s| s.bg(p.row_selected_bg))
                                .on_click(
                                    cx.listener(|_, _, _, cx| cx.emit(FooterEvent::RunPrimary)),
                                )
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(p.accent_bright)
                                        .child(primary),
                                )
                                .child(kbd_pill("↵", &p)),
                        )
                    })
                    .child(
                        div()
                            .id("footer-actions")
                            .flex()
                            .items_center()
                            .gap(px(5.0))
                            .px(px(7.0))
                            .py(px(3.0))
                            .rounded(px(6.0))
                            .when(self.state.actions_open, |s| s.bg(p.row_selected_bg))
                            .cursor_pointer()
                            .hover(move |s| s.bg(p.row_hover))
                            .on_click(
                                cx.listener(|_, _, _, cx| cx.emit(FooterEvent::ToggleActions)),
                            )
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(p.text_secondary)
                                    .child("Actions"),
                            )
                            .child(kbd_pill("Ctrl+K", &p)),
                    )
                    .child(
                        div()
                            .id("footer-preview")
                            .flex()
                            .items_center()
                            .justify_center()
                            .w(px(24.0))
                            .h(px(22.0))
                            .rounded(px(5.0))
                            .when(self.state.preview_visible, |s| s.bg(p.accent_soft))
                            .cursor_pointer()
                            .hover(move |s| s.bg(p.row_hover))
                            .on_click(
                                cx.listener(|_, _, _, cx| cx.emit(FooterEvent::TogglePreview)),
                            )
                            .child(Icon::new(IconName::PanelRight).size(px(13.0)).text_color(
                                if self.state.preview_visible {
                                    p.accent
                                } else {
                                    p.text_muted
                                },
                            )),
                    )
                    .child(
                        div()
                            .id("footer-settings")
                            .flex()
                            .items_center()
                            .justify_center()
                            .w(px(24.0))
                            .h(px(22.0))
                            .rounded(px(5.0))
                            .cursor_pointer()
                            .hover(move |s| s.bg(p.row_hover))
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(FooterEvent::OpenSettings)))
                            .child(
                                Icon::new(IconName::Settings)
                                    .size(px(13.0))
                                    .text_color(p.text_muted),
                            ),
                    ),
            )
    }
}
