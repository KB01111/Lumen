//! Horizontal Spotlight scope strip + removable inline filter chips.

use gpui_kit::{assets::IconName, component::Icon, prelude::FluentBuilder, *};

use crate::{
    model::{LauncherScope, QueryFilter},
    theme::LumenPalette,
    views::kbd_pill,
};

#[derive(Clone, Debug)]
pub enum ScopeBarEvent {
    SelectScope(LauncherScope),
    RemoveFilter(String),
}

pub struct ScopeBar {
    palette: LumenPalette,
    active_scope: LauncherScope,
    filters: Vec<QueryFilter>,
}

impl EventEmitter<ScopeBarEvent> for ScopeBar {}

impl ScopeBar {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            active_scope: LauncherScope::All,
            filters: Vec::new(),
        }
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn set_state(
        &mut self,
        scope: LauncherScope,
        filters: Vec<QueryFilter>,
        cx: &mut Context<Self>,
    ) {
        if self.active_scope != scope || self.filters != filters {
            self.active_scope = scope;
            self.filters = filters;
            cx.notify();
        }
    }
}

impl Render for ScopeBar {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;

        div()
            .w_full()
            .h(px(34.0))
            .flex_none()
            .px(px(14.0))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(8.0))
            .border_b_1()
            .border_color(p.border_subtle)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(3.0))
                    .overflow_hidden()
                    .children(LauncherScope::ALL.iter().copied().map(|scope| {
                        let active = scope == self.active_scope;
                        div()
                            .id(SharedString::from(format!("scope-{}", scope.id())))
                            .px(px(8.0))
                            .py(px(3.0))
                            .rounded(px(6.0))
                            .text_size(px(11.5))
                            .font_weight(if active {
                                FontWeight::SEMIBOLD
                            } else {
                                FontWeight::MEDIUM
                            })
                            .text_color(if active {
                                p.accent_bright
                            } else {
                                p.text_secondary
                            })
                            .when(active, |el| {
                                el.bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                            })
                            .when(!active, |el| {
                                el.border_1().border_color(transparent_black())
                            })
                            .cursor_pointer()
                            .hover(move |s| {
                                if active {
                                    s
                                } else {
                                    s.bg(p.row_hover).text_color(p.text_primary)
                                }
                            })
                            .on_click(cx.listener(move |_, _, _, cx| {
                                cx.emit(ScopeBarEvent::SelectScope(scope));
                            }))
                            .child(scope.label())
                    })),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .flex_none()
                    .children(self.filters.iter().map(|filter| {
                        let filter_id = filter.id.clone();
                        div()
                            .id(SharedString::from(format!("filter-{}", filter.id)))
                            .flex()
                            .items_center()
                            .gap(px(4.0))
                            .px(px(7.0))
                            .py(px(2.0))
                            .rounded(px(999.0))
                            .bg(p.accent_soft)
                            .border_1()
                            .border_color(p.accent_border)
                            .text_size(px(11.0))
                            .text_color(p.accent_bright)
                            .cursor_pointer()
                            .on_click(cx.listener(move |_, _, _, cx| {
                                cx.emit(ScopeBarEvent::RemoveFilter(filter_id.clone()));
                            }))
                            .child(filter.label.clone())
                            .child(Icon::new(IconName::X).size(px(10.0)).text_color(p.accent))
                    }))
                    .child(kbd_pill("Tab", &p)),
            )
    }
}
