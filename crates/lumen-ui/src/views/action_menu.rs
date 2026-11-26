//! Contextual floating Actions popover (`Ctrl+K`) with keyboard navigation and smooth enter motion.

use std::time::Duration;

use gpui_kit::{base::animation::ease_out_cubic, component::Icon, prelude::FluentBuilder, *};

use crate::{
    model::{ContextAction, ContextActionId},
    theme::LumenPalette,
    views::kbd_pill,
};

#[derive(Clone, Debug)]
pub enum ActionMenuEvent {
    Execute(ContextActionId),
    Dismiss,
}

pub struct ActionMenu {
    palette: LumenPalette,
    open: bool,
    open_seq: u64,
    item_title: SharedString,
    actions: Vec<ContextAction>,
    selected_index: usize,
}

impl EventEmitter<ActionMenuEvent> for ActionMenu {}

impl ActionMenu {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            open: false,
            open_seq: 0,
            item_title: SharedString::from(""),
            actions: Vec::new(),
            selected_index: 0,
        }
    }

    pub fn is_open(&self) -> bool {
        self.open
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn open_with(
        &mut self,
        item_title: impl Into<SharedString>,
        actions: Vec<ContextAction>,
        cx: &mut Context<Self>,
    ) {
        self.open = true;
        self.open_seq += 1;
        self.item_title = item_title.into();
        self.actions = actions;
        self.selected_index = 0;
        cx.notify();
    }

    pub fn close(&mut self, cx: &mut Context<Self>) {
        if self.open {
            self.open = false;
            cx.notify();
        }
    }

    pub fn move_selection(&mut self, delta: isize, cx: &mut Context<Self>) {
        if self.actions.is_empty() {
            return;
        }
        let len = self.actions.len() as isize;
        let next = (self.selected_index as isize + delta).rem_euclid(len) as usize;
        self.selected_index = next;
        cx.notify();
    }

    pub fn confirm_selected(&mut self, cx: &mut Context<Self>) {
        if let Some(action) = self.actions.get(self.selected_index) {
            let id = action.id;
            self.open = false;
            cx.notify();
            cx.emit(ActionMenuEvent::Execute(id));
        }
    }
}

impl Render for ActionMenu {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !self.open || self.actions.is_empty() {
            return div().into_any_element();
        }
        let p = self.palette;
        let seq = self.open_seq;
        let dur = if p.reduced_motion {
            Duration::from_millis(1)
        } else {
            Duration::from_millis(140)
        };

        div()
            .id("action-menu-backdrop")
            .absolute()
            .inset_0()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.open = false;
                    cx.notify();
                    cx.emit(ActionMenuEvent::Dismiss);
                }),
            )
            .child(
                div()
                    .id("action-menu-sheet")
                    .absolute()
                    .bottom(px(42.0))
                    .right(px(14.0))
                    .w(px(292.0))
                    .rounded(px(12.0))
                    .bg(p.surface_popover)
                    .border_1()
                    .border_color(p.border_outer)
                    .shadow_xl()
                    .overflow_hidden()
                    .on_mouse_down(MouseButton::Left, |_, _, cx| {
                        cx.stop_propagation();
                    })
                    .child(
                        div()
                            .px(px(12.0))
                            .py(px(8.0))
                            .border_b_1()
                            .border_color(p.border_subtle)
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_size(px(11.0))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_muted)
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .whitespace_nowrap()
                                    .child(if self.item_title.is_empty() {
                                        SharedString::from("ACTIONS")
                                    } else {
                                        self.item_title.clone()
                                    }),
                            )
                            .child(kbd_pill("Esc", &p)),
                    )
                    .child(div().p(px(5.0)).flex().flex_col().gap(px(2.0)).children(
                        self.actions.iter().enumerate().map(|(idx, action)| {
                            let selected = idx == self.selected_index;
                            let action_id = action.id;
                            let fg = if action.destructive {
                                p.danger
                            } else if selected {
                                p.text_primary
                            } else {
                                p.text_secondary
                            };
                            let icon_color = if action.destructive {
                                p.danger
                            } else if selected {
                                p.accent
                            } else {
                                p.text_muted
                            };

                            div()
                                .id(SharedString::from(format!("ctx-action-{idx}")))
                                .px(px(9.0))
                                .py(px(7.0))
                                .rounded(px(7.0))
                                .flex()
                                .items_center()
                                .justify_between()
                                .cursor_pointer()
                                .when(selected, |el| {
                                    el.bg(p.row_selected_bg)
                                        .border_1()
                                        .border_color(p.row_selected_border)
                                })
                                .when(!selected, |el| {
                                    el.border_1().border_color(transparent_black())
                                })
                                .hover(move |s| if selected { s } else { s.bg(p.row_hover) })
                                .on_mouse_move(cx.listener(move |this, _, _, cx| {
                                    if this.selected_index != idx {
                                        this.selected_index = idx;
                                        cx.notify();
                                    }
                                }))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.open = false;
                                    cx.notify();
                                    cx.emit(ActionMenuEvent::Execute(action_id));
                                }))
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(8.0))
                                        .child(
                                            Icon::new(action.icon.clone())
                                                .size(px(14.0))
                                                .text_color(icon_color),
                                        )
                                        .child(
                                            div()
                                                .text_size(px(12.5))
                                                .font_weight(if selected {
                                                    FontWeight::SEMIBOLD
                                                } else {
                                                    FontWeight::MEDIUM
                                                })
                                                .text_color(fg)
                                                .child(action.label),
                                        ),
                                )
                                .child(kbd_pill(action.shortcut, &p))
                        }),
                    ))
                    .with_animation(
                        ("action-menu-enter", seq),
                        Animation::new(dur).with_easing(ease_out_cubic),
                        |el, delta| el.opacity(delta).mb(px((1.0 - delta) * 8.0)),
                    ),
            )
            .into_any_element()
    }
}
