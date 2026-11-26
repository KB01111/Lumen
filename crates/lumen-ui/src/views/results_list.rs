//! Virtualized Spotlight results list with grouped section headers, fuzzy match highlighting,
//! and an interruptible spring-gliding selection highlight pill.

use std::{rc::Rc, time::Duration};

use gpui_kit::{
    assets::IconName,
    base::{Spring, spring},
    component::{Icon, VirtualListScrollHandle, v_virtual_list},
    prelude::FluentBuilder,
    *,
};

use crate::{
    model::{DisplayRow, LauncherItem},
    theme::LumenPalette,
    views::{highlighted_text, icon_tile, item_accent_color, kbd_pill},
};

#[derive(Clone, Debug)]
pub enum ResultsListEvent {
    SelectionChanged,
    ActivateIndex(usize),
    AskAi,
    OpenSettings,
}

pub struct ResultsList {
    palette: LumenPalette,
    items: Vec<LauncherItem>,
    rows: Vec<DisplayRow>,
    selected_item: usize,
    scroll_handle: VirtualListScrollHandle,
    searching: bool,
    query: String,
    degradation: Option<String>,
}

impl EventEmitter<ResultsListEvent> for ResultsList {}

impl ResultsList {
    pub fn new(palette: LumenPalette) -> Self {
        Self {
            palette,
            items: Vec::new(),
            rows: Vec::new(),
            selected_item: 0,
            scroll_handle: VirtualListScrollHandle::new(),
            searching: false,
            query: String::new(),
            degradation: None,
        }
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn set_searching(&mut self, searching: bool, cx: &mut Context<Self>) {
        if self.searching != searching {
            self.searching = searching;
            cx.notify();
        }
    }

    pub fn set_results(
        &mut self,
        query: String,
        items: Vec<LauncherItem>,
        degradation: Option<String>,
        cx: &mut Context<Self>,
    ) {
        self.query = query;
        self.degradation = degradation;
        self.items = items;
        self.rows = build_display_rows(&self.items);
        self.selected_item = 0;
        self.searching = false;
        if !self.rows.is_empty() {
            self.scroll_handle.scroll_to_item(0, ScrollStrategy::Top);
        }
        cx.notify();
    }

    pub fn items(&self) -> &[LauncherItem] {
        &self.items
    }

    pub fn selected_item(&self) -> Option<&LauncherItem> {
        self.items.get(self.selected_item)
    }

    pub fn move_selection(&mut self, delta: isize, cx: &mut Context<Self>) -> Option<usize> {
        if self.items.is_empty() {
            return None;
        }
        let len = self.items.len() as isize;
        let next = (self.selected_item as isize + delta).rem_euclid(len) as usize;
        self.select_index(next, cx);
        Some(next)
    }

    pub fn select_index(&mut self, index: usize, cx: &mut Context<Self>) {
        if index >= self.items.len() {
            return;
        }
        self.selected_item = index;
        if let Some(row_idx) = self.row_index_for_item(index) {
            self.scroll_handle
                .scroll_to_item(row_idx, ScrollStrategy::Nearest);
        }
        cx.notify();
    }

    /// Computes desired content height for dynamic Spotlight window resizing.
    pub fn desired_content_height(&self) -> f32 {
        if self.rows.is_empty() {
            return if self.searching { 196.0 } else { 148.0 };
        }
        let row_h = self.palette.row_height();
        let sec_h = self.palette.section_height();
        let total: f32 = self
            .rows
            .iter()
            .map(|r| match r {
                DisplayRow::SectionHeader(_) => sec_h,
                DisplayRow::Item { .. } => row_h,
            })
            .sum();
        total + 12.0
    }

    fn row_index_for_item(&self, item_idx: usize) -> Option<usize> {
        self.rows.iter().position(|row| {
            matches!(
                row,
                DisplayRow::Item {
                    item_index,
                    ..
                } if *item_index == item_idx
            )
        })
    }

    fn selected_row_top(&self) -> Option<f32> {
        let row_h = self.palette.row_height();
        let sec_h = self.palette.section_height();
        let mut y = 6.0_f32;
        for row in &self.rows {
            match row {
                DisplayRow::SectionHeader(_) => y += sec_h,
                DisplayRow::Item { item_index, .. } => {
                    if *item_index == self.selected_item {
                        return Some(y);
                    }
                    y += row_h;
                }
            }
        }
        None
    }
}

fn build_display_rows(items: &[LauncherItem]) -> Vec<DisplayRow> {
    let mut rows = Vec::with_capacity(items.len() + 6);
    let mut current_section: Option<&'static str> = None;
    let mut digit = 1u8;

    for (idx, item) in items.iter().enumerate() {
        let section = item.section_label();
        if current_section != Some(section) {
            current_section = Some(section);
            rows.push(DisplayRow::SectionHeader(section.to_owned()));
        }
        let shortcut_digit = if digit <= 9 {
            let d = digit;
            digit += 1;
            Some(d)
        } else {
            None
        };
        rows.push(DisplayRow::Item {
            item_index: idx,
            shortcut_digit,
        });
    }
    rows
}

impl Render for ResultsList {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;

        // Loading skeleton state when searching with no cached results yet
        if self.searching && self.items.is_empty() {
            return div()
                .flex_1()
                .h_full()
                .p(px(12.0))
                .flex()
                .flex_col()
                .gap(px(8.0))
                .children((0..4).map(|i| {
                    let title_w = 180.0 + (i as f32 * 37.0) % 110.0;
                    div()
                        .h(px(46.0))
                        .px(px(10.0))
                        .rounded(px(9.0))
                        .bg(p.row_hover)
                        .flex()
                        .items_center()
                        .gap(px(10.0))
                        .child(
                            div()
                                .w(px(30.0))
                                .h(px(30.0))
                                .rounded(px(8.0))
                                .bg(p.icon_tile_bg),
                        )
                        .child(
                            div()
                                .flex_1()
                                .flex()
                                .flex_col()
                                .gap(px(5.0))
                                .child(
                                    div()
                                        .w(px(title_w))
                                        .h(px(11.0))
                                        .rounded(px(4.0))
                                        .bg(p.kbd_bg),
                                )
                                .child(
                                    div()
                                        .w(px(title_w * 0.72))
                                        .h(px(9.0))
                                        .rounded(px(4.0))
                                        .bg(p.icon_tile_bg),
                                ),
                        )
                }))
                .into_any_element();
        }

        // Empty state with actionable shortcuts
        if self.items.is_empty() {
            let has_query = !self.query.trim().is_empty();
            return div()
                .flex_1()
                .h_full()
                .px(px(20.0))
                .py(px(22.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(10.0))
                .child(
                    div()
                        .w(px(38.0))
                        .h(px(38.0))
                        .rounded(px(10.0))
                        .bg(p.accent_soft)
                        .border_1()
                        .border_color(p.accent_border)
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            Icon::new(if has_query {
                                IconName::Search
                            } else {
                                IconName::Sparkles
                            })
                            .size(px(18.0))
                            .text_color(p.accent),
                        ),
                )
                .child(
                    div()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(p.text_primary)
                        .child(if has_query {
                            format!("No local matches for \"{}\"", self.query.trim())
                        } else {
                            "Start typing to search apps, files, math, or commands".to_owned()
                        }),
                )
                .child(
                    div()
                        .text_size(px(12.0))
                        .text_color(p.text_muted)
                        .child(if has_query {
                            "Press Shift+Enter to ask Lumen AI, or try ext:rs / kind:pdf / > settings"
                        } else {
                            "Try `24 * 16`, `#38bdf8`, `120 km to mi`, or `> settings`"
                        }),
                )
                .child(
                    div()
                        .mt(px(4.0))
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .when(has_query, |el| {
                            el.child(
                                div()
                                    .id("empty-ask-ai")
                                    .flex()
                                    .items_center()
                                    .gap(px(6.0))
                                    .px(px(10.0))
                                    .py(px(5.0))
                                    .rounded(px(7.0))
                                    .bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(ResultsListEvent::AskAi);
                                    }))
                                    .child(
                                        Icon::new(IconName::Sparkles)
                                            .size(px(12.0))
                                            .text_color(p.accent),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(12.0))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(p.accent_bright)
                                            .child("Ask Lumen AI"),
                                    )
                                    .child(kbd_pill("⇧↵", &p)),
                            )
                        })
                        .child(
                            div()
                                .id("empty-open-settings")
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .px(px(10.0))
                                .py(px(5.0))
                                .rounded(px(7.0))
                                .bg(p.kbd_bg)
                                .border_1()
                                .border_color(p.kbd_border)
                                .cursor_pointer()
                                .on_click(cx.listener(|_, _, _, cx| {
                                    cx.emit(ResultsListEvent::OpenSettings);
                                }))
                                .child(
                                    Icon::new(IconName::Folder)
                                        .size(px(12.0))
                                        .text_color(p.text_secondary),
                                )
                                .child(
                                    div()
                                        .text_size(px(12.0))
                                        .text_color(p.text_secondary)
                                        .child("Indexed Folders"),
                                ),
                        ),
                )
                .into_any_element();
        }

        let row_h = p.row_height();
        let sec_h = p.section_height();
        let item_sizes: Rc<Vec<Size<Pixels>>> = Rc::new(
            self.rows
                .iter()
                .map(|row| match row {
                    DisplayRow::SectionHeader(_) => size(px(100.0), px(sec_h)),
                    DisplayRow::Item { .. } => size(px(100.0), px(row_h)),
                })
                .collect(),
        );

        // Compute interruptible spring-gliding selection highlight pill position.
        let scroll_offset_y: f32 = self.scroll_handle.base_handle().offset().y.into();
        let target_pill_y = self.selected_row_top().unwrap_or(6.0);
        let animated_pill_y = spring(
            "lumen-results-active-pill-y",
            target_pill_y,
            Spring::new(Duration::from_millis(145))
                .with_damping(0.88)
                .with_epsilon(0.15)
                .with_travel(!p.reduced_motion),
            window,
            cx,
        );
        let visible_pill_top = animated_pill_y + scroll_offset_y;

        let list_element = v_virtual_list(
            cx.entity().clone(),
            "lumen-results-vlist",
            item_sizes,
            move |view, range, _window, cx| {
                let p = view.palette;
                let row_h = p.row_height();
                let sec_h = p.section_height();

                range
                    .map(|row_idx| match &view.rows[row_idx] {
                        DisplayRow::SectionHeader(label) => div()
                            .h(px(sec_h))
                            .w_full()
                            .px(px(16.0))
                            .pt(px(6.0))
                            .flex()
                            .items_center()
                            .child(
                                div()
                                    .text_size(px(10.5))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_muted)
                                    .child(label.clone()),
                            )
                            .into_any_element(),
                        DisplayRow::Item {
                            item_index,
                            shortcut_digit,
                        } => {
                            let idx = *item_index;
                            let item = &view.items[idx];
                            let selected = idx == view.selected_item;
                            let tint = item_accent_color(item, &p);
                            let icon_size = if p.compact { 26.0 } else { 32.0 };
                            let glyph_size = if p.compact { 14.0 } else { 16.0 };

                            div()
                                .h(px(row_h))
                                .w_full()
                                .px(px(8.0))
                                .py(px(2.0))
                                .flex()
                                .items_center()
                                .child(
                                    div()
                                        .id(SharedString::from(format!("result-row-{idx}")))
                                        .w_full()
                                        .h_full()
                                        .px(px(10.0))
                                        .rounded(px(9.0))
                                        .flex()
                                        .items_center()
                                        .gap(px(10.0))
                                        .cursor_pointer()
                                        .when(!selected, |el| el.hover(move |s| s.bg(p.row_hover)))
                                        .on_click(cx.listener(
                                            move |this, event: &ClickEvent, _, cx| {
                                                if event.click_count() >= 2
                                                    || this.selected_item == idx
                                                {
                                                    this.select_index(idx, cx);
                                                    cx.emit(ResultsListEvent::ActivateIndex(idx));
                                                } else {
                                                    this.select_index(idx, cx);
                                                    cx.emit(ResultsListEvent::SelectionChanged);
                                                }
                                            },
                                        ))
                                        .child(icon_tile(
                                            item.icon(),
                                            tint,
                                            selected,
                                            icon_size,
                                            glyph_size,
                                            &p,
                                        ))
                                        .child(
                                            div()
                                                .flex_1()
                                                .min_w_0()
                                                .flex()
                                                .flex_col()
                                                .justify_center()
                                                .gap(px(if p.compact { 1.0 } else { 2.0 }))
                                                .child(highlighted_text(
                                                    &item.title,
                                                    &item.match_ranges,
                                                    if selected {
                                                        p.text_primary
                                                    } else {
                                                        p.text_primary
                                                    },
                                                    p.accent_bright,
                                                    if p.compact { 13.0 } else { 13.5 },
                                                ))
                                                .when(!item.subtitle.is_empty(), |el| {
                                                    el.child(
                                                        div()
                                                            .text_size(px(11.5))
                                                            .text_color(if selected {
                                                                p.text_secondary
                                                            } else {
                                                                p.text_muted
                                                            })
                                                            .overflow_hidden()
                                                            .text_ellipsis()
                                                            .whitespace_nowrap()
                                                            .child(item.subtitle.clone()),
                                                    )
                                                }),
                                        )
                                        .child(
                                            div()
                                                .flex_none()
                                                .flex()
                                                .items_center()
                                                .gap(px(6.0))
                                                .when(item.pinned, |el| {
                                                    el.child(
                                                        Icon::new(IconName::Pin)
                                                            .size(px(11.0))
                                                            .text_color(p.accent),
                                                    )
                                                })
                                                .when(!item.meta.is_empty(), |el| {
                                                    el.child(
                                                        div()
                                                            .text_size(px(11.0))
                                                            .text_color(p.text_muted)
                                                            .child(item.meta.clone()),
                                                    )
                                                })
                                                .when(!item.badge.is_empty(), |el| {
                                                    el.child(
                                                        div()
                                                            .px(px(6.0))
                                                            .py(px(1.5))
                                                            .rounded(px(5.0))
                                                            .bg(if selected {
                                                                p.accent_soft
                                                            } else {
                                                                p.kbd_bg
                                                            })
                                                            .text_size(px(10.5))
                                                            .font_weight(FontWeight::MEDIUM)
                                                            .text_color(if selected {
                                                                p.accent_bright
                                                            } else {
                                                                p.text_secondary
                                                            })
                                                            .child(item.badge.clone()),
                                                    )
                                                })
                                                .when(selected, |el| el.child(kbd_pill("↵", &p)))
                                                .when(!selected, |el| {
                                                    if let Some(d) = shortcut_digit {
                                                        el.child(kbd_pill(format!("^{d}"), &p))
                                                    } else {
                                                        el
                                                    }
                                                }),
                                        ),
                                )
                                .into_any_element()
                        }
                    })
                    .collect()
            },
        )
        .track_scroll(&self.scroll_handle)
        .size_full()
        .py(px(6.0));

        div()
            .flex_1()
            .h_full()
            .min_w_0()
            .relative()
            .overflow_hidden()
            .flex()
            .flex_col()
            .when_some(self.degradation.clone(), |el, notice| {
                el.child(
                    div()
                        .mx(px(12.0))
                        .mt(px(6.0))
                        .px(px(10.0))
                        .py(px(5.0))
                        .rounded(px(7.0))
                        .bg(Hsla {
                            a: 0.12,
                            ..p.warning
                        })
                        .border_1()
                        .border_color(Hsla {
                            a: 0.30,
                            ..p.warning
                        })
                        .text_size(px(11.0))
                        .text_color(p.warning)
                        .child(notice),
                )
            })
            .child(
                div()
                    .flex_1()
                    .w_full()
                    .relative()
                    .overflow_hidden()
                    // Spring-gliding luminous selection highlight capsule behind the virtualized rows
                    .child(
                        div()
                            .absolute()
                            .left(px(8.0))
                            .right(px(8.0))
                            .top(px(visible_pill_top + 2.0))
                            .h(px(row_h - 4.0))
                            .rounded(px(9.0))
                            .bg(p.row_selected_bg)
                            .border_1()
                            .border_color(p.row_selected_border)
                            .flex()
                            .items_center()
                            .child(
                                // Crisp 3px glowing left indicator bar
                                div()
                                    .w(px(3.0))
                                    .h(px((row_h - 20.0).max(16.0)))
                                    .ml(px(1.0))
                                    .rounded(px(999.0))
                                    .bg(p.accent),
                            ),
                    )
                    .child(list_element),
            )
            .into_any_element()
    }
}
