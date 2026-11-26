//! Streaming AI Answer Banner wired directly to `lumen_core::gateway::answer`.

use std::time::Duration;

use gpui_kit::{
    assets::IconName,
    base::animation::ease_out_cubic,
    component::{Icon, spinner::Spinner},
    prelude::FluentBuilder,
    *,
};
use lumen_core::gateway::answer::{AnswerEvent, Citation, RuntimeMode, Usage};

use crate::theme::LumenPalette;

#[derive(Clone, Debug)]
pub enum AnswerBannerEvent {
    Stop,
    Retry(RuntimeMode),
    Dismiss,
    OpenCitation(String),
    CopyAnswer(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnswerPhase {
    Idle,
    Streaming,
    Completed,
    Cancelled,
    Failed,
}

pub struct AnswerBanner {
    palette: LumenPalette,
    phase: AnswerPhase,
    query: String,
    mode: RuntimeMode,
    provider: Option<String>,
    model: Option<String>,
    route: Option<String>,
    text: String,
    citations: Vec<Citation>,
    usage: Option<Usage>,
    error: Option<String>,
    open_seq: u64,
}

impl EventEmitter<AnswerBannerEvent> for AnswerBanner {}

impl AnswerBanner {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            phase: AnswerPhase::Idle,
            query: String::new(),
            mode: RuntimeMode::Auto,
            provider: None,
            model: None,
            route: None,
            text: String::new(),
            citations: Vec::new(),
            usage: None,
            error: None,
            open_seq: 0,
        }
    }

    pub fn is_visible(&self) -> bool {
        self.phase != AnswerPhase::Idle
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn begin(&mut self, query: String, mode: RuntimeMode, cx: &mut Context<Self>) {
        self.phase = AnswerPhase::Streaming;
        self.query = query;
        self.mode = mode;
        self.provider = None;
        self.model = None;
        self.route = None;
        self.text.clear();
        self.citations.clear();
        self.usage = None;
        self.error = None;
        self.open_seq += 1;
        cx.notify();
    }

    pub fn apply_event(&mut self, event: AnswerEvent, cx: &mut Context<Self>) {
        match event {
            AnswerEvent::Started {
                provider,
                model,
                route,
            } => {
                self.phase = AnswerPhase::Streaming;
                self.provider = Some(provider);
                self.model = Some(model);
                self.route = Some(route);
            }
            AnswerEvent::Citation { citation } => {
                if !self
                    .citations
                    .iter()
                    .any(|c| c.file_id == citation.file_id && c.label == citation.label)
                {
                    self.citations.push(citation);
                }
            }
            AnswerEvent::Delta { text } => {
                self.text.push_str(&text);
            }
            AnswerEvent::Usage { usage } => {
                self.usage = Some(usage);
            }
            AnswerEvent::Completed {
                provider,
                model,
                route,
            } => {
                self.phase = AnswerPhase::Completed;
                self.provider = Some(provider);
                self.model = Some(model);
                self.route = Some(route);
            }
            AnswerEvent::Cancelled => {
                self.phase = AnswerPhase::Cancelled;
            }
            AnswerEvent::Failed { message, .. } => {
                self.phase = AnswerPhase::Failed;
                self.error = Some(message);
            }
        }
        cx.notify();
    }

    pub fn dismiss(&mut self, cx: &mut Context<Self>) {
        if self.phase != AnswerPhase::Idle {
            self.phase = AnswerPhase::Idle;
            self.text.clear();
            self.citations.clear();
            self.error = None;
            cx.notify();
        }
    }
}

impl Render for AnswerBanner {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.phase == AnswerPhase::Idle {
            return div().into_any_element();
        }
        let p = self.palette;
        let streaming = self.phase == AnswerPhase::Streaming;
        let dur = if p.reduced_motion {
            Duration::from_millis(1)
        } else {
            Duration::from_millis(150)
        };
        let route_badge = match (&self.provider, &self.model) {
            (Some(prov), Some(model)) => format!("{prov} · {model}"),
            _ => match self.mode {
                RuntimeMode::Auto => "Auto route".to_owned(),
                RuntimeMode::Local => "Local AI".to_owned(),
                RuntimeMode::Cloud => "Cloud route".to_owned(),
            },
        };
        let answer_copy = self.text.clone();

        div()
            .w_full()
            .flex_none()
            .px(px(12.0))
            .pt(px(8.0))
            .pb(px(4.0))
            .child(
                div()
                    .w_full()
                    .rounded(px(11.0))
                    .bg(p.surface_elevated)
                    .border_1()
                    .border_color(if self.phase == AnswerPhase::Failed {
                        Hsla {
                            a: 0.42,
                            ..p.danger
                        }
                    } else {
                        p.accent_border
                    })
                    .p(px(12.0))
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(
                        // Top bar: icon + route + mode chips + Stop/Copy/Dismiss
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(7.0))
                                    .child(if streaming {
                                        Spinner::new().color(p.accent).into_any_element()
                                    } else {
                                        Icon::new(IconName::Sparkles)
                                            .size(px(14.0))
                                            .text_color(if self.phase == AnswerPhase::Failed {
                                                p.danger
                                            } else {
                                                p.accent
                                            })
                                            .into_any_element()
                                    })
                                    .child(
                                        div()
                                            .text_size(px(12.0))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(p.text_primary)
                                            .child("Lumen Answer"),
                                    )
                                    .child(
                                        div()
                                            .px(px(7.0))
                                            .py(px(1.5))
                                            .rounded(px(999.0))
                                            .bg(p.accent_soft)
                                            .text_size(px(10.5))
                                            .text_color(p.accent_bright)
                                            .child(route_badge),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(4.0))
                                    .children(
                                        [
                                            (RuntimeMode::Auto, "Auto"),
                                            (RuntimeMode::Local, "Local"),
                                            (RuntimeMode::Cloud, "Cloud"),
                                        ]
                                        .into_iter()
                                        .map(
                                            |(m, label)| {
                                                let active = self.mode == m;
                                                div()
                                                    .id(SharedString::from(format!(
                                                        "ans-mode-{label}"
                                                    )))
                                                    .px(px(6.0))
                                                    .py(px(2.0))
                                                    .rounded(px(5.0))
                                                    .text_size(px(10.5))
                                                    .cursor_pointer()
                                                    .when(active, |el| {
                                                        el.bg(p.accent_soft)
                                                            .text_color(p.accent_bright)
                                                    })
                                                    .when(!active, |el| {
                                                        el.text_color(p.text_muted)
                                                            .hover(move |s| s.bg(p.row_hover))
                                                    })
                                                    .on_click(cx.listener(move |_, _, _, cx| {
                                                        cx.emit(AnswerBannerEvent::Retry(m));
                                                    }))
                                                    .child(label)
                                            },
                                        ),
                                    )
                                    .when(streaming, |el| {
                                        el.child(
                                            div()
                                                .id("ans-stop")
                                                .ml(px(4.0))
                                                .px(px(7.0))
                                                .py(px(2.0))
                                                .rounded(px(5.0))
                                                .bg(Hsla {
                                                    a: 0.16,
                                                    ..p.danger
                                                })
                                                .text_size(px(10.5))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(p.danger)
                                                .cursor_pointer()
                                                .on_click(cx.listener(|_, _, _, cx| {
                                                    cx.emit(AnswerBannerEvent::Stop);
                                                }))
                                                .child("Stop"),
                                        )
                                    })
                                    .when(!self.text.is_empty(), |el| {
                                        el.child(
                                            div()
                                                .id("ans-copy")
                                                .ml(px(2.0))
                                                .p(px(4.0))
                                                .rounded(px(5.0))
                                                .cursor_pointer()
                                                .hover(move |s| s.bg(p.row_hover))
                                                .on_click(cx.listener(move |_, _, _, cx| {
                                                    cx.emit(AnswerBannerEvent::CopyAnswer(
                                                        answer_copy.clone(),
                                                    ));
                                                }))
                                                .child(
                                                    Icon::new(IconName::Copy)
                                                        .size(px(12.0))
                                                        .text_color(p.text_secondary),
                                                ),
                                        )
                                    })
                                    .child(
                                        div()
                                            .id("ans-dismiss")
                                            .p(px(4.0))
                                            .rounded(px(5.0))
                                            .cursor_pointer()
                                            .hover(move |s| s.bg(p.row_hover))
                                            .on_click(cx.listener(|_, _, _, cx| {
                                                cx.emit(AnswerBannerEvent::Dismiss);
                                            }))
                                            .child(
                                                Icon::new(IconName::X)
                                                    .size(px(12.0))
                                                    .text_color(p.text_muted),
                                            ),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .id("answer-body-scroll")
                            .max_h(px(124.0))
                            .overflow_y_scroll()
                            .text_size(px(12.5))
                            .line_height(px(18.5))
                            .text_color(if self.error.is_some() {
                                p.danger
                            } else {
                                p.text_primary
                            })
                            .child(if let Some(err) = &self.error {
                                err.clone()
                            } else if self.text.is_empty() {
                                if streaming {
                                    "Gathering local context and streaming answer...".to_owned()
                                } else if self.phase == AnswerPhase::Cancelled {
                                    "Answer cancelled.".to_owned()
                                } else {
                                    "No answer returned.".to_owned()
                                }
                            } else {
                                self.text.clone()
                            }),
                    )
                    .when(!self.citations.is_empty() || self.usage.is_some(), |el| {
                        el.child(
                            div()
                                .flex()
                                .items_center()
                                .justify_between()
                                .gap(px(8.0))
                                .pt(px(4.0))
                                .border_t_1()
                                .border_color(p.border_subtle)
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .flex_wrap()
                                        .gap(px(5.0))
                                        .children(self.citations.iter().take(6).enumerate().map(
                                            |(i, cit)| {
                                                let file_id = cit.file_id.clone();
                                                div()
                                                    .id(SharedString::from(format!("cit-{i}")))
                                                    .px(px(7.0))
                                                    .py(px(2.0))
                                                    .rounded(px(999.0))
                                                    .bg(p.kbd_bg)
                                                    .border_1()
                                                    .border_color(p.kbd_border)
                                                    .text_size(px(10.5))
                                                    .text_color(p.accent_bright)
                                                    .cursor_pointer()
                                                    .on_click(cx.listener(move |_, _, _, cx| {
                                                        cx.emit(AnswerBannerEvent::OpenCitation(
                                                            file_id.clone(),
                                                        ));
                                                    }))
                                                    .child(cit.label.clone())
                                            },
                                        )),
                                )
                                .when_some(self.usage.as_ref(), |row, usage| {
                                    row.child(
                                        div().text_size(px(10.5)).text_color(p.text_muted).child(
                                            format!(
                                                "{} in · {} out tok",
                                                usage.input_tokens, usage.output_tokens
                                            ),
                                        ),
                                    )
                                }),
                        )
                    })
                    .with_animation(
                        ("lumen-answer-enter", self.open_seq),
                        Animation::new(dur).with_easing(ease_out_cubic),
                        |el, delta| el.opacity(delta),
                    ),
            )
            .into_any_element()
    }
}
