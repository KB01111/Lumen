//! Spotlight search header with borderless `gpui-kit` Input, dynamic leading mode/spinner icon,
//! inline ghost autocomplete hint, and Search / Computer Use mode switcher.

use gpui_kit::{
    assets::IconName,
    component::{
        Icon,
        input::{Input, InputEvent, InputState},
        spinner::Spinner,
    },
    prelude::FluentBuilder,
    *,
};

use crate::{model::LauncherSurface, theme::LumenPalette, views::kbd_pill};

#[derive(Clone, Debug)]
pub enum SearchHeaderEvent {
    QueryChanged(String),
    Submit { secondary: bool, shift: bool },
    SwitchSurface(LauncherSurface),
    Clear,
    AcceptGhost,
}

pub struct SearchHeader {
    palette: LumenPalette,
    input: Entity<InputState>,
    surface: LauncherSurface,
    searching: bool,
    ghost_hint: Option<String>,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<SearchHeaderEvent> for SearchHeader {}

impl SearchHeader {
    pub fn new(palette: LumenPalette, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Search apps, files, math, > commands, or Shift+Enter for AI...")
        });

        let sub =
            cx.subscribe_in(
                &input,
                window,
                |this, state, event: &InputEvent, _w, cx| match event {
                    InputEvent::Change => {
                        let val = state.read(cx).value().to_string();
                        cx.emit(SearchHeaderEvent::QueryChanged(val));
                    }
                    InputEvent::PressEnter { secondary, shift } => {
                        cx.emit(SearchHeaderEvent::Submit {
                            secondary: *secondary,
                            shift: *shift,
                        });
                    }
                    InputEvent::Focus | InputEvent::Blur => {
                        this.on_focus_change(cx);
                    }
                },
            );

        Self {
            palette,
            input,
            surface: LauncherSurface::Launcher,
            searching: false,
            ghost_hint: None,
            _subscriptions: vec![sub],
        }
    }

    fn on_focus_change(&mut self, cx: &mut Context<Self>) {
        cx.notify();
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn set_surface(&mut self, surface: LauncherSurface, cx: &mut Context<Self>) {
        if self.surface != surface {
            self.surface = surface;
            cx.notify();
        }
    }

    pub fn set_searching(&mut self, searching: bool, cx: &mut Context<Self>) {
        if self.searching != searching {
            self.searching = searching;
            cx.notify();
        }
    }

    pub fn set_ghost_hint(&mut self, hint: Option<String>, cx: &mut Context<Self>) {
        if self.ghost_hint != hint {
            self.ghost_hint = hint;
            cx.notify();
        }
    }

    pub fn ghost_hint(&self) -> Option<&str> {
        self.ghost_hint.as_deref()
    }

    pub fn set_value(&mut self, value: String, window: &mut Window, cx: &mut Context<Self>) {
        self.input.update(cx, |state, cx| {
            state.set_value(value, window, cx);
        });
        cx.notify();
    }

    pub fn input_focus_handle(&self, cx: &App) -> FocusHandle {
        self.input.read(cx).focus_handle(cx)
    }

    pub fn is_focused(&self, window: &Window, cx: &App) -> bool {
        self.input.read(cx).focus_handle(cx).is_focused(window)
    }

    pub fn insert_char(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.input.read(cx).focus_handle(cx).focus(window, cx);
        let next = format!("{}{}", self.input.read(cx).value(), text);
        self.input.update(cx, |state, cx| {
            state.replace_all(next, window, cx);
        });
    }
}

impl Render for SearchHeader {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let query = self.input.read(cx).value().to_string();
        let has_query = !query.is_empty();
        let is_command = query.trim_start().starts_with('>');
        let focused = self.input.read(cx).focus_handle(cx).is_focused(window);
        let in_cu = self.surface == LauncherSurface::ComputerUse;

        let leading: AnyElement = if self.searching {
            Spinner::new().color(p.accent).into_any_element()
        } else if in_cu {
            Icon::new(IconName::Monitor)
                .size(px(19.0))
                .text_color(p.accent)
                .into_any_element()
        } else if is_command {
            Icon::new(IconName::Terminal)
                .size(px(19.0))
                .text_color(p.kind_command)
                .into_any_element()
        } else {
            Icon::new(IconName::Search)
                .size(px(19.0))
                .text_color(if focused { p.accent } else { p.text_secondary })
                .into_any_element()
        };

        div()
            .w_full()
            .h(px(62.0))
            .flex_none()
            .relative()
            .flex()
            .items_center()
            .gap(px(12.0))
            .px(px(18.0))
            .border_b_1()
            .border_color(if focused {
                Hsla {
                    a: 0.24,
                    ..p.accent
                }
            } else {
                p.border_subtle
            })
            // Luminous top specular accent edge
            .child(
                div()
                    .absolute()
                    .top_0()
                    .left(px(28.0))
                    .right(px(28.0))
                    .h(px(1.5))
                    .rounded(px(999.0))
                    .bg(if focused { p.top_beam } else { p.border_subtle }),
            )
            // Leading dynamic lens / spinner icon
            .child(
                div()
                    .w(px(26.0))
                    .h(px(26.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(leading),
            )
            // Borderless primary Spotlight text input
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .text_size(px(18.0))
                    .font_weight(FontWeight::NORMAL)
                    .child(
                        Input::new(&self.input)
                            .appearance(false)
                            .bordered(false)
                            .focus_bordered(false),
                    ),
            )
            // Inline ghost autocomplete chip (accepted with Tab)
            .when_some(self.ghost_hint.clone(), |el, hint| {
                el.child(
                    div()
                        .id("header-ghost-hint")
                        .flex()
                        .items_center()
                        .gap(px(5.0))
                        .px(px(8.0))
                        .py(px(3.0))
                        .rounded(px(6.0))
                        .bg(p.surface_inset)
                        .border_1()
                        .border_color(p.border_subtle)
                        .cursor_pointer()
                        .on_click(cx.listener(|_, _, _, cx| {
                            cx.emit(SearchHeaderEvent::AcceptGhost);
                        }))
                        .child(
                            div()
                                .max_w(px(140.0))
                                .overflow_hidden()
                                .text_ellipsis()
                                .whitespace_nowrap()
                                .text_size(px(11.5))
                                .text_color(p.text_muted)
                                .child(hint),
                        )
                        .child(kbd_pill("Tab", &p)),
                )
            })
            // Quick clear button when query is non-empty
            .when(has_query, |el| {
                el.child(
                    div()
                        .id("header-clear-btn")
                        .w(px(24.0))
                        .h(px(24.0))
                        .rounded(px(6.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .hover(move |s| s.bg(p.row_hover))
                        .on_click(cx.listener(|_, _, _, cx| {
                            cx.emit(SearchHeaderEvent::Clear);
                        }))
                        .child(
                            Icon::new(IconName::X)
                                .size(px(13.0))
                                .text_color(p.text_muted),
                        ),
                )
            })
            // Compact Search <-> Computer Use mode switcher
            .child(
                div()
                    .flex_none()
                    .p(px(3.0))
                    .rounded(px(8.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .flex()
                    .items_center()
                    .gap(px(2.0))
                    .child(
                        div()
                            .id("mode-pill-search")
                            .px(px(8.0))
                            .py(px(4.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .gap(px(5.0))
                            .cursor_pointer()
                            .when(!in_cu, |el| {
                                el.bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                            })
                            .when(in_cu, |el| el.border_1().border_color(transparent_black()))
                            .on_click(cx.listener(|_, _, _, cx| {
                                cx.emit(SearchHeaderEvent::SwitchSurface(
                                    LauncherSurface::Launcher,
                                ));
                            }))
                            .child(
                                Icon::new(IconName::Search)
                                    .size(px(12.0))
                                    .text_color(if !in_cu { p.accent } else { p.text_muted }),
                            )
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(if !in_cu {
                                        p.accent_bright
                                    } else {
                                        p.text_muted
                                    })
                                    .child("Search"),
                            ),
                    )
                    .child(
                        div()
                            .id("mode-pill-cu")
                            .px(px(8.0))
                            .py(px(4.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .gap(px(5.0))
                            .cursor_pointer()
                            .when(in_cu, |el| {
                                el.bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                            })
                            .when(!in_cu, |el| el.border_1().border_color(transparent_black()))
                            .on_click(cx.listener(|_, _, _, cx| {
                                cx.emit(SearchHeaderEvent::SwitchSurface(
                                    LauncherSurface::ComputerUse,
                                ));
                            }))
                            .child(
                                Icon::new(IconName::Monitor)
                                    .size(px(12.0))
                                    .text_color(if in_cu { p.accent } else { p.text_muted }),
                            )
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(if in_cu { p.accent_bright } else { p.text_muted })
                                    .child("Automate"),
                            ),
                    ),
            )
    }
}
