//! Floating toast notification pill with smooth enter animation.

use std::time::{Duration, Instant};

use gpui_kit::{assets::IconName, base::animation::ease_out_cubic, component::Icon, *};

use crate::theme::LumenPalette;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToastTone {
    Info,
    Success,
    Warning,
}

#[derive(Clone, Debug)]
struct ActiveToast {
    seq: u64,
    message: SharedString,
    tone: ToastTone,
    expires_at: Instant,
}

pub struct ToastOverlay {
    palette: LumenPalette,
    toast: Option<ActiveToast>,
    next_seq: u64,
}

impl ToastOverlay {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            toast: None,
            next_seq: 1,
        }
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn show(
        &mut self,
        message: impl Into<SharedString>,
        tone: ToastTone,
        cx: &mut Context<Self>,
    ) {
        let seq = self.next_seq;
        self.next_seq += 1;
        let duration = Duration::from_millis(2200);
        self.toast = Some(ActiveToast {
            seq,
            message: message.into(),
            tone,
            expires_at: Instant::now() + duration,
        });
        cx.notify();

        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(duration).await;
            let _ = this.update(cx, |view, cx| {
                if view.toast.as_ref().is_some_and(|t| t.seq == seq) {
                    view.toast = None;
                    cx.notify();
                }
            });
        })
        .detach();
    }

    pub fn clear_if_expired(&mut self, cx: &mut Context<Self>) {
        if self
            .toast
            .as_ref()
            .is_some_and(|t| Instant::now() >= t.expires_at)
        {
            self.toast = None;
            cx.notify();
        }
    }
}

impl Render for ToastOverlay {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let Some(toast) = self.toast.as_ref() else {
            return div().into_any_element();
        };
        let (icon, accent) = match toast.tone {
            ToastTone::Info => (IconName::Info, self.palette.accent),
            ToastTone::Success => (IconName::Check, self.palette.success),
            ToastTone::Warning => (IconName::Shield, self.palette.warning),
        };
        let duration = if self.palette.reduced_motion {
            Duration::from_millis(1)
        } else {
            Duration::from_millis(170)
        };
        let seq = toast.seq;
        let msg = toast.message.clone();

        div()
            .absolute()
            .bottom(px(42.0))
            .right(px(14.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .px(px(12.0))
                    .py(px(7.0))
                    .rounded(px(999.0))
                    .bg(self.palette.surface_popover)
                    .border_1()
                    .border_color(Hsla { a: 0.38, ..accent })
                    .shadow_lg()
                    .child(Icon::new(icon).size(px(13.0)).text_color(accent))
                    .child(
                        div()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(self.palette.text_primary)
                            .child(msg),
                    )
                    .with_animation(
                        ("lumen-toast", seq),
                        Animation::new(duration).with_easing(ease_out_cubic),
                        |el, delta| el.opacity(delta).mb(px((1.0 - delta) * 6.0)),
                    ),
            )
            .into_any_element()
    }
}
