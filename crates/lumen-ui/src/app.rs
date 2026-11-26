//! Root Spotlight launcher entity (`LauncherRoot`) orchestrating all granular child entities,
//! keyboard-first ergonomics, dynamic Spotlight sizing, summon/dismiss motion, native hotkey/tray
//! integration, and direct in-process `lumen_core::LumenRuntime` invocation.

use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use gpui_kit::{base::animation::ease_out_cubic, prelude::FluentBuilder, *};
use lumen_core::{
    EventChannel, LumenRuntime,
    activity::ActivityMode,
    apps::AppCatalog,
    calculator::evaluate as evaluate_calculator,
    catalogue::{CommandAction, fuzzy_match_ranges, search_commands},
    gateway::answer::{AnswerEvent, AnswerRequest, RuntimeMode},
    search::SearchFilterRequest,
    settings::{PreviewBehavior, ThemeModeSetting, WindowMode, geometry_for},
};

use crate::{
    model::{
        ContextActionId, ItemPayload, LauncherItem, LauncherScope, LauncherSurface,
        PreviewContentState, QueryFilter, SettingsTab, actions_for_item, parse_inline_filters,
        strip_win_prefix,
    },
    platform::{
        HotkeyController, TrayAction, TrayController, apply_spotlight_window_style, hide_window,
        position_and_size_window, show_and_focus_window,
    },
    theme::{LumenPalette, sync_kit_theme},
    views::{
        action_menu::{ActionMenu, ActionMenuEvent},
        answer_banner::{AnswerBanner, AnswerBannerEvent},
        computer_use::{ComputerUseView, ComputerUseViewEvent},
        footer_bar::{FooterBar, FooterEvent, FooterSnapshot},
        preview_pane::{PreviewPane, PreviewPaneEvent},
        results_list::{ResultsList, ResultsListEvent},
        scope_bar::{ScopeBar, ScopeBarEvent},
        search_header::{SearchHeader, SearchHeaderEvent},
        settings::{SettingsEvent, SettingsView},
        toast::{ToastOverlay, ToastTone},
    },
};

pub struct LauncherRoot {
    runtime: Arc<LumenRuntime>,
    tokio_handle: tokio::runtime::Handle,
    focus_handle: FocusHandle,
    palette: LumenPalette,

    // Granular child entities (minimize GPUI invalidations)
    search_header: Entity<SearchHeader>,
    scope_bar: Entity<ScopeBar>,
    results_list: Entity<ResultsList>,
    preview_pane: Entity<PreviewPane>,
    answer_banner: Entity<AnswerBanner>,
    action_menu: Entity<ActionMenu>,
    footer_bar: Entity<FooterBar>,
    computer_use: Entity<ComputerUseView>,
    settings_view: Entity<SettingsView>,
    toast: Entity<ToastOverlay>,

    // Shell state
    surface: LauncherSurface,
    scope: LauncherScope,
    query: String,
    active_filters: Vec<QueryFilter>,
    preview_override: Option<bool>,
    visible: bool,
    summon_seq: u64,
    last_window_size: (f32, f32),
    last_clipboard: String,

    // Cancellation & generation guards
    search_generation: Arc<AtomicU64>,
    preview_generation: Arc<AtomicU64>,
    answer_generation: Arc<AtomicU64>,
    active_answer_id: u64,
    answer_rx: std::sync::mpsc::Receiver<(u64, AnswerEvent)>,
    answer_tx: std::sync::mpsc::Sender<(u64, AnswerEvent)>,

    // Native Windows shell controllers
    hotkey: HotkeyController,
    tray: TrayController,

    _subscriptions: Vec<Subscription>,
}

impl Focusable for LauncherRoot {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl LauncherRoot {
    pub fn new(
        runtime: Arc<LumenRuntime>,
        tokio_handle: tokio::runtime::Handle,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let settings = runtime.settings.snapshot();
        let palette = LumenPalette::resolve(
            &settings.appearance,
            settings.management.presentation.glass_intensity,
            window.appearance(),
        );
        sync_kit_theme(&palette, Some(window), cx);
        apply_spotlight_window_style(window, palette.is_dark, &settings.appearance);

        let hotkey = HotkeyController::new(&settings.management.general.shortcut);
        let tray = TrayController::new();
        let shortcut_status = hotkey.status();

        let search_header = cx.new(|cx| SearchHeader::new(palette, window, cx));
        let scope_bar = cx.new(|_| ScopeBar::new(palette));
        let results_list = cx.new(|_| ResultsList::new(palette));
        let preview_pane = cx.new(|_| PreviewPane::new(palette));
        let answer_banner = cx.new(|_| AnswerBanner::new(palette));
        let action_menu = cx.new(|_| ActionMenu::new(palette));
        let footer_bar = cx.new(|_| FooterBar::new(palette));
        let computer_use = cx.new(|cx| {
            ComputerUseView::new(
                palette,
                Arc::clone(&runtime),
                tokio_handle.clone(),
                window,
                cx,
            )
        });
        let settings_view = cx.new(|cx| {
            SettingsView::new(
                palette,
                Arc::clone(&runtime),
                tokio_handle.clone(),
                shortcut_status,
                window,
                cx,
            )
        });
        let toast = cx.new(|_| ToastOverlay::new(palette));

        let (answer_tx, answer_rx) = std::sync::mpsc::channel();
        let focus_handle = cx.focus_handle();

        let mut subs = Vec::new();

        // Subscribe to SearchHeader events
        subs.push(cx.subscribe_in(
            &search_header,
            window,
            |this, _, event: &SearchHeaderEvent, window, cx| match event {
                SearchHeaderEvent::QueryChanged(text) => {
                    this.on_query_changed(text.clone(), window, cx);
                }
                SearchHeaderEvent::Submit { secondary, shift } => {
                    if *shift {
                        this.trigger_ai_answer(None, window, cx);
                    } else if *secondary {
                        this.reveal_selected_in_explorer(cx);
                    } else {
                        this.execute_selected_primary(window, cx);
                    }
                }
                SearchHeaderEvent::SwitchSurface(surface) => {
                    this.switch_surface(*surface, window, cx);
                }
                SearchHeaderEvent::Clear => {
                    this.clear_query(window, cx);
                }
                SearchHeaderEvent::AcceptGhost => {
                    this.accept_ghost_hint(window, cx);
                }
            },
        ));

        // Subscribe to ScopeBar
        subs.push(cx.subscribe_in(
            &scope_bar,
            window,
            |this, _, event: &ScopeBarEvent, window, cx| match event {
                ScopeBarEvent::SelectScope(scope) => {
                    this.scope = *scope;
                    this.trigger_search(window, cx);
                    this.focus_search_header(window, cx);
                }
                ScopeBarEvent::RemoveFilter(filter_id) => {
                    let removed = this
                        .active_filters
                        .iter()
                        .find(|f| f.id == *filter_id)
                        .map(|f| f.label.clone());
                    if let Some(tok) = removed {
                        let cleaned = this.query.replace(&tok, "").trim().to_owned();
                        this.search_header
                            .update(cx, |h, cx| h.set_value(cleaned.clone(), window, cx));
                        this.on_query_changed(cleaned, window, cx);
                    }
                }
            },
        ));

        // Subscribe to ResultsList
        subs.push(cx.subscribe_in(
            &results_list,
            window,
            |this, _, event: &ResultsListEvent, window, cx| match event {
                ResultsListEvent::SelectionChanged => {
                    this.sync_selection_side_effects(window, cx);
                }
                ResultsListEvent::ActivateIndex(idx) => {
                    this.results_list
                        .update(cx, |list, cx| list.select_index(*idx, cx));
                    this.execute_selected_primary(window, cx);
                }
                ResultsListEvent::AskAi => {
                    this.trigger_ai_answer(None, window, cx);
                }
                ResultsListEvent::OpenSettings => {
                    this.open_settings(SettingsTab::IndexedRoots, window, cx);
                }
            },
        ));

        // Subscribe to PreviewPane
        subs.push(cx.subscribe_in(
            &preview_pane,
            window,
            |this, _, event: &PreviewPaneEvent, window, cx| match event {
                PreviewPaneEvent::OpenPrimary => this.execute_selected_primary(window, cx),
                PreviewPaneEvent::RevealInExplorer => this.reveal_selected_in_explorer(cx),
                PreviewPaneEvent::CopyText(text, label) => {
                    this.copy_to_clipboard(text, label, cx);
                }
            },
        ));

        // Subscribe to AnswerBanner
        subs.push(cx.subscribe_in(
            &answer_banner,
            window,
            |this, _, event: &AnswerBannerEvent, window, cx| match event {
                AnswerBannerEvent::Stop => {
                    if this.active_answer_id > 0 {
                        this.runtime.cancel_answer(this.active_answer_id);
                    }
                }
                AnswerBannerEvent::Retry(mode) => {
                    this.trigger_ai_answer(Some(*mode), window, cx);
                }
                AnswerBannerEvent::Dismiss => {
                    if this.active_answer_id > 0 {
                        this.runtime.cancel_answer(this.active_answer_id);
                    }
                    this.answer_banner.update(cx, |b, cx| b.dismiss(cx));
                    this.sync_window_geometry(window, cx);
                }
                AnswerBannerEvent::OpenCitation(file_id) => {
                    if let Err(err) =
                        lumen_core::search::open_indexed_file(&this.runtime.index, file_id)
                    {
                        this.show_toast(err.message, ToastTone::Warning, cx);
                    }
                }
                AnswerBannerEvent::CopyAnswer(text) => {
                    this.copy_to_clipboard(text, "Copied Lumen answer", cx);
                }
            },
        ));

        // Subscribe to ActionMenu
        subs.push(cx.subscribe_in(
            &action_menu,
            window,
            |this, _, event: &ActionMenuEvent, window, cx| match event {
                ActionMenuEvent::Execute(id) => this.execute_context_action(*id, window, cx),
                ActionMenuEvent::Dismiss => {
                    this.sync_footer(cx);
                    this.focus_search_header(window, cx);
                }
            },
        ));

        // Subscribe to FooterBar
        subs.push(cx.subscribe_in(
            &footer_bar,
            window,
            |this, _, event: &FooterEvent, window, cx| match event {
                FooterEvent::RunPrimary => this.execute_selected_primary(window, cx),
                FooterEvent::ToggleActions => this.toggle_action_menu(cx),
                FooterEvent::TogglePreview => this.toggle_preview_pane(window, cx),
                FooterEvent::OpenSettings => {
                    this.open_settings(SettingsTab::General, window, cx);
                }
                FooterEvent::AskAi => this.trigger_ai_answer(None, window, cx),
            },
        ));

        // Subscribe to ComputerUseView
        subs.push(cx.subscribe_in(
            &computer_use,
            window,
            |this, _, event: &ComputerUseViewEvent, window, cx| match event {
                ComputerUseViewEvent::BackToLauncher => {
                    this.switch_surface(LauncherSurface::Launcher, window, cx);
                }
                ComputerUseViewEvent::OpenConsentSettings => {
                    this.open_settings(SettingsTab::ComputerUse, window, cx);
                }
                ComputerUseViewEvent::Toast(msg) => {
                    this.show_toast(msg.clone(), ToastTone::Info, cx);
                }
            },
        ));

        // Subscribe to SettingsView
        subs.push(cx.subscribe_in(
            &settings_view,
            window,
            |this, _, event: &SettingsEvent, window, cx| match event {
                SettingsEvent::Close => {
                    this.switch_surface(LauncherSurface::Launcher, window, cx);
                }
                SettingsEvent::AppearanceChanged => {
                    this.refresh_theme(window, cx);
                    this.sync_window_geometry(window, cx);
                }
                SettingsEvent::ShortcutChanged(accel) => {
                    let status = this.hotkey.register(accel);
                    let ok = status.registered;
                    this.settings_view
                        .update(cx, |s, cx| s.set_shortcut_status(status, cx));
                    this.show_toast(
                        if ok {
                            format!("Global hotkey bound to {accel}")
                        } else {
                            format!("Could not register {accel} (already in use)")
                        },
                        if ok {
                            ToastTone::Success
                        } else {
                            ToastTone::Warning
                        },
                        cx,
                    );
                }
                SettingsEvent::RootsChanged => {
                    this.trigger_search(window, cx);
                }
                SettingsEvent::Toast(msg) => {
                    this.show_toast(msg.clone(), ToastTone::Info, cx);
                }
            },
        ));

        // Auto-hide Spotlight when focus moves outside the window (never while Settings or file picker is open)
        subs.push(cx.observe_window_activation(window, |this, window, cx| {
            if !window.is_window_active()
                && this.visible
                && this.surface == LauncherSurface::Launcher
                && !this.settings_view.read(cx).is_dialog_open()
            {
                this.dismiss_launcher(window, cx);
            }
        }));

        // React to Windows light/dark system appearance changes
        subs.push(cx.observe_window_appearance(window, |this, window, cx| {
            this.refresh_theme(window, cx);
        }));

        // Foreground 50ms event pump for global hotkeys, system tray, streaming answers,
        // Computer Use updates, clipboard history capture, and periodic status refresh.
        cx.spawn_in(window, async move |this, cx| {
            let mut ticks = 0u64;
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(50))
                    .await;
                ticks = ticks.wrapping_add(1);
                let keep_going = this.update_in(cx, |view, window, cx| {
                    view.on_tick(ticks, window, cx);
                });
                if keep_going.is_err() {
                    break;
                }
            }
        })
        .detach();

        let mut root = Self {
            runtime,
            tokio_handle,
            focus_handle,
            palette,
            search_header,
            scope_bar,
            results_list,
            preview_pane,
            answer_banner,
            action_menu,
            footer_bar,
            computer_use,
            settings_view,
            toast,
            surface: LauncherSurface::Launcher,
            scope: LauncherScope::All,
            query: String::new(),
            active_filters: Vec::new(),
            preview_override: None,
            visible: true,
            summon_seq: 1,
            last_window_size: (0.0, 0.0),
            last_clipboard: String::new(),
            search_generation: Arc::new(AtomicU64::new(1)),
            preview_generation: Arc::new(AtomicU64::new(1)),
            answer_generation: Arc::new(AtomicU64::new(1)),
            active_answer_id: 0,
            answer_rx,
            answer_tx,
            hotkey,
            tray,
            _subscriptions: subs,
        };

        root.sync_window_geometry(window, cx);
        root.focus_search_header(window, cx);
        root.trigger_search(window, cx);
        root
    }

    fn focus_search_header(&self, window: &mut Window, cx: &mut Context<Self>) {
        let handle = self.search_header.read(cx).input_focus_handle(cx);
        handle.focus(window, cx);
    }

    fn focus_computer_use_input(&self, window: &mut Window, cx: &mut Context<Self>) {
        let handle = self.computer_use.read(cx).input_focus_handle(cx);
        handle.focus(window, cx);
    }

    fn on_tick(&mut self, ticks: u64, window: &mut Window, cx: &mut Context<Self>) {
        // 1. Global hotkey toggle (`Alt + Space` by default)
        if self.hotkey.poll_triggered() {
            if self.visible && window.is_window_active() {
                self.dismiss_launcher(window, cx);
            } else {
                self.summon_launcher(window, cx);
            }
        }

        // 2. System tray clicks and menu items
        for action in self.tray.poll_actions() {
            match action {
                TrayAction::ToggleLauncher => {
                    if self.visible && window.is_window_active() {
                        self.dismiss_launcher(window, cx);
                    } else {
                        self.summon_launcher(window, cx);
                    }
                }
                TrayAction::OpenComputerUse => {
                    self.summon_launcher(window, cx);
                    self.switch_surface(LauncherSurface::ComputerUse, window, cx);
                }
                TrayAction::OpenSettings => {
                    self.summon_launcher(window, cx);
                    self.open_settings(SettingsTab::General, window, cx);
                }
                TrayAction::Quit => {
                    self.runtime.shutdown();
                    cx.quit();
                }
            }
        }

        // 3. Drain streaming AI answer events
        let mut got_answer = false;
        while let Ok((req_id, ev)) = self.answer_rx.try_recv() {
            if req_id == self.active_answer_id {
                self.answer_banner
                    .update(cx, |banner, cx| banner.apply_event(ev, cx));
                got_answer = true;
            }
        }
        if got_answer {
            self.sync_window_geometry(window, cx);
        }

        // 4. Drain Computer Use supervisor events
        self.computer_use.update(cx, |cu, cx| cu.poll_events(cx));

        // 5. Capture clipboard text changes every ~1s for instant Clipboard scope search
        if ticks % 20 == 0 {
            if let Some(clip) = cx.read_from_clipboard()
                && let Some(text) = clip.text()
                && text != self.last_clipboard
            {
                self.last_clipboard = text.clone();
                self.runtime.clipboard.record(text);
            }
            self.toast.update(cx, |t, cx| t.clear_if_expired(cx));
            self.sync_footer(cx);
        }
    }

    fn refresh_theme(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let settings = self.runtime.settings.snapshot();
        let palette = LumenPalette::resolve(
            &settings.appearance,
            settings.management.presentation.glass_intensity,
            window.appearance(),
        );
        self.palette = palette;
        sync_kit_theme(&palette, Some(window), cx);
        apply_spotlight_window_style(window, palette.is_dark, &settings.appearance);

        self.search_header
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.scope_bar
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.results_list
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.preview_pane
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.answer_banner
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.action_menu
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.footer_bar
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.computer_use
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.settings_view
            .update(cx, |v, cx| v.set_palette(palette, cx));
        self.toast.update(cx, |v, cx| v.set_palette(palette, cx));
        cx.notify();
    }

    fn summon_launcher(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.visible = true;
        self.summon_seq += 1;
        let settings = self.runtime.settings.snapshot();
        apply_spotlight_window_style(window, self.palette.is_dark, &settings.appearance);
        self.last_window_size = (0.0, 0.0); // Force monitor-aware re-centering on cursor monitor
        self.sync_window_geometry(window, cx);
        show_and_focus_window(window);
        match self.surface {
            LauncherSurface::Launcher => self.focus_search_header(window, cx),
            LauncherSurface::ComputerUse => self.focus_computer_use_input(window, cx),
            LauncherSurface::Settings => {}
        }
        cx.notify();
    }

    fn dismiss_launcher(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.action_menu.update(cx, |m, cx| m.close(cx));
        self.visible = false;
        hide_window(window);
        cx.notify();
    }

    fn switch_surface(
        &mut self,
        surface: LauncherSurface,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.surface = surface;
        self.action_menu.update(cx, |m, cx| m.close(cx));
        self.search_header
            .update(cx, |h, cx| h.set_surface(surface, cx));
        self.sync_window_geometry(window, cx);
        match surface {
            LauncherSurface::Launcher => self.focus_search_header(window, cx),
            LauncherSurface::ComputerUse => {
                self.computer_use.update(cx, |cu, cx| cu.refresh_status(cx));
                self.focus_computer_use_input(window, cx);
            }
            LauncherSurface::Settings => {
                self.settings_view
                    .update(cx, |s, cx| s.refresh_telemetry(cx));
            }
        }
        cx.notify();
    }

    fn open_settings(&mut self, tab: SettingsTab, window: &mut Window, cx: &mut Context<Self>) {
        self.settings_view.update(cx, |s, cx| s.open_tab(tab, cx));
        self.switch_surface(LauncherSurface::Settings, window, cx);
    }

    fn is_expanded(&self, cx: &App) -> bool {
        match self.surface {
            LauncherSurface::Settings | LauncherSurface::ComputerUse => true,
            LauncherSurface::Launcher => {
                !self.query.trim().is_empty()
                    || self.scope != LauncherScope::All
                    || self.answer_banner.read(cx).is_visible()
                    || !self.results_list.read(cx).items().is_empty()
            }
        }
    }

    fn is_preview_visible(&self, cx: &App) -> bool {
        if self.surface != LauncherSurface::Launcher || !self.is_expanded(cx) {
            return false;
        }
        if let Some(ov) = self.preview_override {
            return ov;
        }
        match self.runtime.settings.snapshot().appearance.preview {
            PreviewBehavior::Never => false,
            PreviewBehavior::Always => true,
            PreviewBehavior::Automatic => self.results_list.read(cx).selected_item().is_some(),
        }
    }

    fn sync_window_geometry(&mut self, window: &mut Window, cx: &App) {
        let settings = self.runtime.settings.snapshot();
        let monitor = settings.management.general.monitor_behavior;
        let expanded_ref = geometry_for(WindowMode::Expanded).height as f32;

        let (width, height, ref_height) = match self.surface {
            LauncherSurface::Settings => {
                let g = geometry_for(WindowMode::Settings);
                (g.width as f32, g.height as f32, g.height as f32)
            }
            LauncherSurface::ComputerUse => (840.0, 540.0, 540.0),
            LauncherSurface::Launcher => {
                if !self.is_expanded(cx) {
                    (720.0, 64.0, expanded_ref)
                } else {
                    let preview_on = self.is_preview_visible(cx);
                    let w = if preview_on { 860.0 } else { 720.0 };
                    let header_h = 62.0;
                    let scope_h = 34.0;
                    let footer_h = 34.0;
                    let answer_h = if self.answer_banner.read(cx).is_visible() {
                        164.0
                    } else {
                        0.0
                    };
                    let list_h = self.results_list.read(cx).desired_content_height();
                    let min_body = if preview_on { 330.0 } else { 150.0 };
                    let target_h =
                        (header_h + scope_h + footer_h + answer_h + list_h.max(min_body))
                            .clamp(280.0, 540.0);
                    (w, target_h, expanded_ref)
                }
            }
        };

        if (self.last_window_size.0 - width).abs() > 1.0
            || (self.last_window_size.1 - height).abs() > 1.0
        {
            self.last_window_size = (width, height);
            position_and_size_window(window, width, height, ref_height, monitor);
        }
    }

    fn on_query_changed(&mut self, text: String, window: &mut Window, cx: &mut Context<Self>) {
        self.query = text;
        if self.surface != LauncherSurface::Launcher {
            self.switch_surface(LauncherSurface::Launcher, window, cx);
        }
        self.trigger_search(window, cx);
    }

    fn clear_query(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.query.clear();
        self.scope = LauncherScope::All;
        self.active_filters.clear();
        self.search_header
            .update(cx, |h, cx| h.set_value(String::new(), window, cx));
        self.search_header
            .update(cx, |h, cx| h.set_ghost_hint(None, cx));
        self.trigger_search(window, cx);
        self.focus_search_header(window, cx);
    }

    fn accept_ghost_hint(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(hint) = self.search_header.read(cx).ghost_hint().map(str::to_owned) else {
            return;
        };
        self.query = hint.clone();
        self.search_header
            .update(cx, |h, cx| h.set_value(hint, window, cx));
        self.trigger_search(window, cx);
    }

    /// Runs instant synchronous providers (Calculator, Commands, Apps, Clipboard) immediately
    /// and merges asynchronous local file search (`WinSearch -> SQLite Hybrid -> Filename`) off the UI thread.
    fn trigger_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let req_gen = self.search_generation.fetch_add(1, Ordering::Relaxed) + 1;
        let raw_query = self.query.trim().to_owned();
        let (clean_query, filters) = parse_inline_filters(&raw_query);
        self.active_filters = filters.clone();
        self.scope_bar
            .update(cx, |s, cx| s.set_state(self.scope, filters.clone(), cx));

        let scope = self.scope;

        // 1. Instant local providers (zero latency)
        let mut instant_items = Vec::new();
        let is_command_prefix = raw_query.starts_with('>');

        // Inline calculator, unit converter, base converter, color swatch
        if !raw_query.is_empty()
            && !is_command_prefix
            && scope == LauncherScope::All
            && let Some(calc) = evaluate_calculator(&clean_query)
        {
            instant_items.push(LauncherItem {
                title: calc.formatted.clone(),
                subtitle: calc.subtitle.clone(),
                badge: "Calc".to_owned(),
                meta: String::new(),
                match_ranges: Vec::new(),
                pinned: false,
                payload: ItemPayload::Calculator(calc),
            });
        }

        // Applications (Windows Start Menu discovery)
        if !is_command_prefix && matches!(scope, LauncherScope::All | LauncherScope::Apps) {
            let app_limit = if scope == LauncherScope::Apps {
                24
            } else if clean_query.is_empty() {
                0
            } else {
                5
            };
            if app_limit > 0 {
                for m in self.runtime.apps.search(&clean_query, app_limit) {
                    instant_items.push(LauncherItem {
                        title: m.app.name,
                        subtitle: m.app.path.to_string_lossy().to_string(),
                        badge: "App".to_owned(),
                        meta: m.app.category.clone(),
                        match_ranges: m.ranges,
                        pinned: false,
                        payload: ItemPayload::App {
                            path: m.app.path,
                            category: m.app.category,
                        },
                    });
                }
            }
        }

        // Clipboard history
        if scope == LauncherScope::Clipboard
            || (!raw_query.is_empty() && raw_query.to_ascii_lowercase().starts_with("clip "))
        {
            let clip_q = raw_query.strip_prefix("clip ").unwrap_or(&clean_query);
            for entry in self.runtime.clipboard.search(clip_q, 24) {
                let ranges = fuzzy_match_ranges(&entry.title, clip_q)
                    .map(|(_, r)| r)
                    .unwrap_or_default();
                instant_items.push(LauncherItem {
                    title: entry.title,
                    subtitle: entry.text.replace('\n', " ").chars().take(90).collect(),
                    badge: "Clip".to_owned(),
                    meta: format!("{} ch", entry.text.chars().count()),
                    match_ranges: ranges,
                    pinned: entry.pinned,
                    payload: ItemPayload::Clipboard {
                        entry_id: entry.id,
                        text: entry.text,
                        pinned: entry.pinned,
                    },
                });
            }
        }

        // Commands & public Lumen help catalogue
        let cmd_items: Vec<LauncherItem> =
            if is_command_prefix || scope == LauncherScope::Help || !clean_query.is_empty() {
                let cmd_limit = if is_command_prefix || scope == LauncherScope::Help {
                    18
                } else {
                    4
                };
                search_commands(
                    &raw_query,
                    is_command_prefix || scope == LauncherScope::Help,
                )
                .into_iter()
                .filter(|(c, _, _)| scope != LauncherScope::Help || c.is_help)
                .take(cmd_limit)
                .map(|(c, _score, ranges)| LauncherItem {
                    title: c.title.to_owned(),
                    subtitle: c.subtitle.to_owned(),
                    badge: if c.is_help { "Help" } else { "Cmd" }.to_owned(),
                    meta: String::new(),
                    match_ranges: ranges,
                    pinned: false,
                    payload: ItemPayload::Command {
                        action: c.action.clone(),
                        description: c.subtitle.to_owned(),
                        is_help: c.is_help,
                    },
                })
                .collect()
            } else {
                Vec::new()
            };

        let should_search_files = !is_command_prefix
            && !matches!(
                scope,
                LauncherScope::Apps | LauncherScope::Clipboard | LauncherScope::Help
            )
            && (!clean_query.is_empty()
                || !filters.is_empty()
                || scope == LauncherScope::Recent
                || scope != LauncherScope::All);

        if !should_search_files {
            instant_items.extend(cmd_items);
            self.apply_search_results(raw_query, instant_items, None, window, cx);
            return;
        }

        // Paint instant results immediately so calculator & apps feel <1ms
        let mut provisional = instant_items.clone();
        provisional.extend(cmd_items.clone());
        self.search_header
            .update(cx, |h, cx| h.set_searching(true, cx));
        if !provisional.is_empty() {
            self.apply_search_results(raw_query.clone(), provisional, None, window, cx);
        } else {
            self.results_list
                .update(cx, |list, cx| list.set_searching(true, cx));
            self.sync_window_geometry(window, cx);
        }

        // 2. Async local file search on Tokio worker pool (never blocks GPUI render thread)
        let runtime = Arc::clone(&self.runtime);
        let handle = self.tokio_handle.clone();
        let gen_counter = Arc::clone(&self.search_generation);
        let scope_str = scope.id().to_owned();
        let req_filters: Vec<SearchFilterRequest> = filters
            .into_iter()
            .map(|f| SearchFilterRequest {
                id: f.id,
                value: f.value,
            })
            .collect();

        cx.spawn_in(window, async move |this, cx| {
            // Brief 25ms coalesce only when typing rapidly
            cx.background_executor()
                .timer(Duration::from_millis(25))
                .await;
            if gen_counter.load(Ordering::Relaxed) != req_gen {
                return;
            }

            let file_result = handle
                .spawn(async move {
                    runtime
                        .search_files(req_gen, clean_query, scope_str, req_filters, 48, None)
                        .await
                })
                .await;

            if gen_counter.load(Ordering::Relaxed) != req_gen {
                return;
            }

            let _ = this.update_in(cx, |view, window, cx| {
                if view.search_generation.load(Ordering::Relaxed) != req_gen {
                    return;
                }
                view.search_header
                    .update(cx, |h, cx| h.set_searching(false, cx));

                let mut combined = instant_items;
                let mut degradation = None;
                if let Ok(Ok(outcome)) = file_result {
                    degradation = outcome.degradation;
                    for (hit, ranges) in outcome.hits.into_iter().zip(outcome.ranges.into_iter()) {
                        combined.push(LauncherItem::from_file_hit(hit, ranges));
                    }
                }
                combined.extend(cmd_items);
                view.apply_search_results(raw_query, combined, degradation, window, cx);
            });
        })
        .detach();
    }

    fn apply_search_results(
        &mut self,
        query: String,
        items: Vec<LauncherItem>,
        degradation: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // Compute inline ghost autocomplete hint when top hit starts cleanly with the typed query
        let ghost = if !query.trim().is_empty() && !query.starts_with('>') {
            let q_low = query.trim().to_ascii_lowercase();
            items.first().and_then(|top| {
                let t_low = top.title.to_ascii_lowercase();
                (t_low.starts_with(&q_low) && top.title.len() > query.trim().len())
                    .then(|| top.title.clone())
            })
        } else {
            None
        };
        self.search_header
            .update(cx, |h, cx| h.set_ghost_hint(ghost, cx));

        self.results_list.update(cx, |list, cx| {
            list.set_results(query, items, degradation, cx)
        });
        self.sync_selection_side_effects(window, cx);
        self.sync_window_geometry(window, cx);
        cx.notify();
    }

    fn sync_selection_side_effects(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.sync_footer(cx);
        self.load_selected_preview(window, cx);
    }

    fn sync_footer(&mut self, cx: &mut Context<Self>) {
        let list = self.results_list.read(cx);
        let selected = list.selected_item();
        let idx = self.runtime.index_status();
        let activity = self.runtime.activity_snapshot();
        let activity_label = if activity.mode == ActivityMode::User {
            "Paused".to_owned()
        } else if activity.background_policy != lumen_core::activity::BackgroundPolicy::Normal {
            format!("Quiet ({:?})", activity.mode)
        } else {
            String::new()
        };

        let snapshot = FooterSnapshot {
            result_count: list.items().len(),
            indexed_files: idx.indexed_items,
            index_state: idx.phase,
            activity_label,
            primary_label: selected.map_or("Open", |it| it.primary_action_label()),
            has_selection: selected.is_some(),
            actions_open: self.action_menu.read(cx).is_open(),
            preview_visible: self.is_preview_visible(cx),
            has_query: !self.query.trim().is_empty(),
            searching: false,
        };
        self.footer_bar
            .update(cx, |f, cx| f.update_state(snapshot, cx));
    }

    fn load_selected_preview(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let req_gen = self.preview_generation.fetch_add(1, Ordering::Relaxed) + 1;
        let selected = self.results_list.read(cx).selected_item().cloned();

        let Some(item) = selected else {
            self.preview_pane
                .update(cx, |p, cx| p.set_content(PreviewContentState::Empty, cx));
            return;
        };

        match item.payload {
            ItemPayload::Calculator(calc) => {
                self.preview_pane.update(cx, |p, cx| {
                    p.set_content(PreviewContentState::Calculator(calc), cx);
                });
            }
            ItemPayload::App { path, category } => {
                self.preview_pane.update(cx, |p, cx| {
                    p.set_content(
                        PreviewContentState::App {
                            name: item.title,
                            path: strip_win_prefix(&path.to_string_lossy()),
                            category,
                        },
                        cx,
                    );
                });
            }
            ItemPayload::Command { description, .. } => {
                self.preview_pane.update(cx, |p, cx| {
                    p.set_content(
                        PreviewContentState::Command {
                            title: item.title,
                            description,
                        },
                        cx,
                    );
                });
            }
            ItemPayload::Clipboard { text, pinned, .. } => {
                self.preview_pane.update(cx, |p, cx| {
                    p.set_content(
                        PreviewContentState::Clipboard {
                            title: item.title,
                            text,
                            pinned,
                        },
                        cx,
                    );
                });
            }
            ItemPayload::File {
                root_path,
                path,
                file_kind,
                size_bytes,
                ..
            } => {
                let name = item.title.clone();
                self.preview_pane.update(cx, |p, cx| {
                    p.set_content(PreviewContentState::Loading(name.clone()), cx);
                });

                let runtime = Arc::clone(&self.runtime);
                let handle = self.tokio_handle.clone();
                let gen_counter = Arc::clone(&self.preview_generation);
                let root_str = root_path.to_string_lossy().to_string();
                let path_str = path.to_string_lossy().to_string();
                let path_clone = path.clone();

                cx.spawn_in(window, async move |this, cx| {
                    let res = handle
                        .spawn(async move { runtime.get_preview(root_str, path_str).await })
                        .await;
                    if gen_counter.load(Ordering::Relaxed) != req_gen {
                        return;
                    }
                    let _ = this.update_in(cx, |view, _, cx| {
                        if view.preview_generation.load(Ordering::Relaxed) != req_gen {
                            return;
                        }
                        let state = match res {
                            Ok(Ok(preview)) => PreviewContentState::File {
                                preview,
                                path: path_clone,
                                file_kind,
                                size_bytes,
                            },
                            Ok(Err(err)) => PreviewContentState::Error {
                                title: name,
                                message: err.message,
                            },
                            Err(_) => PreviewContentState::Error {
                                title: name,
                                message: "Preview worker cancelled.".to_owned(),
                            },
                        };
                        view.preview_pane
                            .update(cx, |p, cx| p.set_content(state, cx));
                    });
                })
                .detach();
            }
        }
    }

    fn execute_selected_primary(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(item) = self.results_list.read(cx).selected_item().cloned() else {
            return;
        };
        match item.payload {
            ItemPayload::Calculator(calc) => {
                self.copy_to_clipboard(&calc.copy_value, "Copied result to clipboard", cx);
            }
            ItemPayload::App { path, .. } => {
                if let Err(err) = AppCatalog::launch(&path) {
                    self.show_toast(err, ToastTone::Warning, cx);
                } else {
                    self.dismiss_launcher(window, cx);
                }
            }
            ItemPayload::File {
                root_path, path, ..
            } => {
                if let Err(err) = self.runtime.open_file(&root_path, &path) {
                    self.show_toast(err.message, ToastTone::Warning, cx);
                } else {
                    self.dismiss_launcher(window, cx);
                }
            }
            ItemPayload::Clipboard { text, .. } => {
                self.copy_to_clipboard(&text, "Copied snippet to clipboard", cx);
                self.dismiss_launcher(window, cx);
            }
            ItemPayload::Command { action, .. } => {
                self.run_command_action(action, window, cx);
            }
        }
    }

    fn run_command_action(
        &mut self,
        action: CommandAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            CommandAction::OpenSettingsPage(page) => {
                self.open_settings(SettingsTab::from_id(&page), window, cx);
            }
            CommandAction::ToggleComputerUse => {
                self.switch_surface(LauncherSurface::ComputerUse, window, cx);
            }
            CommandAction::ToggleTheme => {
                let _ = self.runtime.update_settings(|s| {
                    s.appearance.mode = match s.appearance.mode {
                        ThemeModeSetting::Dark => ThemeModeSetting::Light,
                        ThemeModeSetting::Light => ThemeModeSetting::System,
                        ThemeModeSetting::System => ThemeModeSetting::Dark,
                    };
                });
                self.refresh_theme(window, cx);
                self.show_toast("Switched Lumen appearance theme", ToastTone::Success, cx);
            }
            CommandAction::TogglePreviewPane => {
                self.toggle_preview_pane(window, cx);
            }
            CommandAction::SynchronizeRoots => {
                let rt = Arc::clone(&self.runtime);
                self.tokio_handle.spawn(async move {
                    let _ = rt.synchronize_roots().await;
                });
                self.show_toast("Re-indexing configured folders...", ToastTone::Info, cx);
            }
            CommandAction::ClearSearchHistory => {
                let _ = self.runtime.clear_search_history();
                self.show_toast("Cleared local search history", ToastTone::Success, cx);
            }
            CommandAction::RefreshDiagnostics => {
                self.open_settings(SettingsTab::Diagnostics, window, cx);
            }
            CommandAction::HideLauncher => {
                self.dismiss_launcher(window, cx);
            }
            CommandAction::QuitLumen => {
                self.runtime.shutdown();
                cx.quit();
            }
        }
    }

    fn reveal_selected_in_explorer(&mut self, cx: &mut Context<Self>) {
        let Some(item) = self.results_list.read(cx).selected_item().cloned() else {
            return;
        };
        match item.payload {
            ItemPayload::File {
                root_path, path, ..
            } => {
                if let Err(err) = self.runtime.open_containing_folder(&root_path, &path) {
                    self.show_toast(err.message, ToastTone::Warning, cx);
                }
            }
            ItemPayload::App { path, .. } => {
                if let Some(parent) = path.parent() {
                    let _ = self.runtime.open_containing_folder(parent, &path);
                }
            }
            _ => {}
        }
    }

    fn toggle_preview_pane(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let current = self.is_preview_visible(cx);
        self.preview_override = Some(!current);
        self.sync_footer(cx);
        self.sync_window_geometry(window, cx);
        cx.notify();
    }

    fn toggle_action_menu(&mut self, cx: &mut Context<Self>) {
        if self.action_menu.read(cx).is_open() {
            self.action_menu.update(cx, |m, cx| m.close(cx));
        } else {
            let selected = self.results_list.read(cx).selected_item().cloned();
            let title = selected
                .as_ref()
                .map(|i| i.title.clone())
                .unwrap_or_else(|| "Lumen Actions".to_owned());
            let actions = actions_for_item(selected.as_ref(), self.is_preview_visible(cx));
            self.action_menu
                .update(cx, |m, cx| m.open_with(title, actions, cx));
        }
        self.sync_footer(cx);
    }

    fn execute_context_action(
        &mut self,
        id: ContextActionId,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let selected = self.results_list.read(cx).selected_item().cloned();
        match id {
            ContextActionId::Primary => self.execute_selected_primary(window, cx),
            ContextActionId::OpenFolder => self.reveal_selected_in_explorer(cx),
            ContextActionId::CopyPath => {
                if let Some(item) = selected {
                    let path_opt = match item.payload {
                        ItemPayload::File { path, .. } | ItemPayload::App { path, .. } => {
                            Some(strip_win_prefix(&path.to_string_lossy()))
                        }
                        _ => None,
                    };
                    if let Some(p) = path_opt {
                        self.copy_to_clipboard(&p, "Copied path to clipboard", cx);
                    }
                }
            }
            ContextActionId::CopyTitleOrValue => {
                if let Some(item) = selected {
                    let val = match item.payload {
                        ItemPayload::Calculator(c) => c.copy_value,
                        ItemPayload::Clipboard { text, .. } => text,
                        _ => item.title,
                    };
                    self.copy_to_clipboard(&val, "Copied to clipboard", cx);
                }
            }
            ContextActionId::TogglePin => {
                if let Some(item) = selected {
                    match item.payload {
                        ItemPayload::File {
                            stable_id, pinned, ..
                        } => match self.runtime.set_pinned(&stable_id, !pinned) {
                            Ok(res) => {
                                self.show_toast(
                                    if res.pinned {
                                        "Pinned file to top"
                                    } else {
                                        "Unpinned file"
                                    },
                                    ToastTone::Success,
                                    cx,
                                );
                                self.trigger_search(window, cx);
                            }
                            Err(err) => self.show_toast(err.message, ToastTone::Warning, cx),
                        },
                        ItemPayload::Clipboard { entry_id, .. } => {
                            let now_pinned = self.runtime.clipboard.toggle_pin(&entry_id);
                            self.show_toast(
                                if now_pinned {
                                    "Pinned clipboard snippet"
                                } else {
                                    "Unpinned clipboard snippet"
                                },
                                ToastTone::Success,
                                cx,
                            );
                            self.trigger_search(window, cx);
                        }
                        _ => {}
                    }
                }
            }
            ContextActionId::SearchRelated => {
                if let Some(item) = selected
                    && let ItemPayload::File { stable_id, .. } = item.payload
                {
                    let rt = Arc::clone(&self.runtime);
                    let handle = self.tokio_handle.clone();
                    let title = item.title.clone();
                    cx.spawn_in(window, async move |this, cx| {
                        let res = handle
                            .spawn(async move { rt.search_related(stable_id, 24).await })
                            .await;
                        let _ = this.update_in(cx, |view, window, cx| {
                            if let Ok(Ok(hits)) = res {
                                let mapped = hits
                                    .into_iter()
                                    .map(|h| LauncherItem::from_file_hit(h, Vec::new()))
                                    .collect();
                                view.apply_search_results(
                                    format!("Related to {title}"),
                                    mapped,
                                    None,
                                    window,
                                    cx,
                                );
                            }
                        });
                    })
                    .detach();
                }
            }
            ContextActionId::TogglePreview => self.toggle_preview_pane(window, cx),
            ContextActionId::AskAi => self.trigger_ai_answer(None, window, cx),
            ContextActionId::OpenSettings => {
                self.open_settings(SettingsTab::General, window, cx);
            }
        }
        self.sync_footer(cx);
    }

    fn trigger_ai_answer(
        &mut self,
        mode_override: Option<RuntimeMode>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let query = self.query.trim().to_owned();
        if query.is_empty() {
            return;
        }
        if self.active_answer_id > 0 {
            self.runtime.cancel_answer(self.active_answer_id);
        }
        let req_id = self.answer_generation.fetch_add(1, Ordering::Relaxed) + 1;
        self.active_answer_id = req_id;

        let ai_settings = self.runtime.settings.snapshot().management.ai;
        let mode = mode_override.unwrap_or(ai_settings.runtime_mode);

        self.answer_banner
            .update(cx, |b, cx| b.begin(query.clone(), mode, cx));
        self.sync_window_geometry(window, cx);

        let tx = self.answer_tx.clone();
        let channel = EventChannel::new(move |ev: AnswerEvent| {
            tx.send((req_id, ev)).map_err(|e| e.to_string())
        });
        let request = AnswerRequest {
            request_id: req_id,
            query,
            mode,
            cloud_consent: ai_settings.cloud_answer_consent,
            workflow_run_id: None,
        };
        let rt = Arc::clone(&self.runtime);
        let tx_err = self.answer_tx.clone();
        self.tokio_handle.spawn(async move {
            if let Err(err) = rt.start_answer(request, channel).await {
                let _ = tx_err.send((
                    req_id,
                    AnswerEvent::Failed {
                        message: err,
                        code: None,
                    },
                ));
            }
        });
    }

    fn copy_to_clipboard(&mut self, text: &str, toast_msg: &str, cx: &mut Context<Self>) {
        self.last_clipboard = text.to_owned();
        self.runtime.clipboard.record(text);
        cx.write_to_clipboard(ClipboardItem::new_string(text.to_owned()));
        self.show_toast(toast_msg.to_owned(), ToastTone::Success, cx);
    }

    fn show_toast(
        &mut self,
        msg: impl Into<SharedString>,
        tone: ToastTone,
        cx: &mut Context<Self>,
    ) {
        self.toast.update(cx, |t, cx| t.show(msg, tone, cx));
    }

    /// Global keyboard-first routing across Launcher, ActionMenu, ComputerUse, and Settings.
    fn on_key_down(&mut self, event: &KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        let key = event.keystroke.key.as_str();
        let mods = event.keystroke.modifiers;

        // Global Ctrl+, -> Settings
        if mods.control && !mods.alt && !mods.shift && key == "," {
            cx.stop_propagation();
            if self.surface == LauncherSurface::Settings {
                self.switch_surface(LauncherSurface::Launcher, window, cx);
            } else {
                self.open_settings(SettingsTab::General, window, cx);
            }
            return;
        }

        // Action menu captures Up/Down/Enter/Esc/Ctrl+K while open
        if self.action_menu.read(cx).is_open() {
            match key {
                "escape" => {
                    cx.stop_propagation();
                    self.action_menu.update(cx, |m, cx| m.close(cx));
                    self.sync_footer(cx);
                    self.focus_search_header(window, cx);
                    return;
                }
                "down" => {
                    cx.stop_propagation();
                    self.action_menu.update(cx, |m, cx| m.move_selection(1, cx));
                    return;
                }
                "up" => {
                    cx.stop_propagation();
                    self.action_menu
                        .update(cx, |m, cx| m.move_selection(-1, cx));
                    return;
                }
                "enter" => {
                    cx.stop_propagation();
                    self.action_menu.update(cx, |m, cx| m.confirm_selected(cx));
                    return;
                }
                "k" if mods.control => {
                    cx.stop_propagation();
                    self.toggle_action_menu(cx);
                    return;
                }
                _ => {}
            }
        }

        // Layered Escape behavior across surfaces
        if key == "escape" {
            cx.stop_propagation();
            if self.surface != LauncherSurface::Launcher {
                self.switch_surface(LauncherSurface::Launcher, window, cx);
                return;
            }
            if self.answer_banner.read(cx).is_visible() {
                if self.active_answer_id > 0 {
                    self.runtime.cancel_answer(self.active_answer_id);
                }
                self.answer_banner.update(cx, |b, cx| b.dismiss(cx));
                self.sync_window_geometry(window, cx);
                return;
            }
            if !self.query.is_empty() || self.scope != LauncherScope::All {
                self.clear_query(window, cx);
                return;
            }
            self.dismiss_launcher(window, cx);
            return;
        }

        if self.surface != LauncherSurface::Launcher {
            return;
        }

        // Ctrl+K -> contextual Actions sheet
        if mods.control && !mods.alt && !mods.shift && key == "k" {
            cx.stop_propagation();
            self.toggle_action_menu(cx);
            return;
        }

        // Alt+Enter -> toggle Preview Pane (or secondary inspect)
        if mods.alt && !mods.control && key == "enter" {
            cx.stop_propagation();
            self.toggle_preview_pane(window, cx);
            return;
        }

        // Ctrl+Enter -> reveal selected in Windows Explorer
        if mods.control && !mods.alt && key == "enter" {
            cx.stop_propagation();
            self.reveal_selected_in_explorer(cx);
            return;
        }

        // Shift+Enter -> Ask Lumen AI
        if mods.shift && !mods.control && !mods.alt && key == "enter" {
            cx.stop_propagation();
            self.trigger_ai_answer(None, window, cx);
            return;
        }

        // Up / Down / Ctrl+N / Ctrl+P -> navigate results
        if key == "down" || (mods.control && !mods.alt && key == "n") {
            cx.stop_propagation();
            self.results_list
                .update(cx, |list, cx| list.move_selection(1, cx));
            self.sync_selection_side_effects(window, cx);
            return;
        }
        if key == "up" || (mods.control && !mods.alt && key == "p") {
            cx.stop_propagation();
            self.results_list
                .update(cx, |list, cx| list.move_selection(-1, cx));
            self.sync_selection_side_effects(window, cx);
            return;
        }

        // Tab / Shift+Tab -> accept ghost completion if present, else cycle scopes
        if key == "tab" && !mods.control && !mods.alt {
            cx.stop_propagation();
            if !mods.shift && self.search_header.read(cx).ghost_hint().is_some() {
                self.accept_ghost_hint(window, cx);
            } else {
                self.scope = if mods.shift {
                    self.scope.prev()
                } else {
                    self.scope.next()
                };
                self.trigger_search(window, cx);
            }
            return;
        }

        // Ctrl+1..9 -> quick-launch visible top results
        if mods.control && !mods.alt && !mods.shift && key.len() == 1 {
            if let Some(digit) = key.chars().next().and_then(|c| c.to_digit(10))
                && (1..=9).contains(&digit)
            {
                let idx = (digit - 1) as usize;
                if idx < self.results_list.read(cx).items().len() {
                    cx.stop_propagation();
                    self.results_list
                        .update(cx, |list, cx| list.select_index(idx, cx));
                    self.execute_selected_primary(window, cx);
                    return;
                }
            }
        }

        // Type-to-focus: any printable character immediately routes focus back to the search bar
        if !mods.control
            && !mods.alt
            && !mods.platform
            && !self.search_header.read(cx).is_focused(window, cx)
            && let Some(key_char) = event.keystroke.key_char.as_deref()
            && !key_char.is_empty()
            && !key_char.chars().all(char::is_control)
        {
            cx.stop_propagation();
            self.search_header
                .update(cx, |h, cx| h.insert_char(key_char, window, cx));
        }
    }
}

impl Render for LauncherRoot {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let expanded = self.is_expanded(cx);
        let show_preview = self.is_preview_visible(cx);
        let summon_dur = if p.reduced_motion {
            Duration::from_millis(1)
        } else {
            Duration::from_millis(165)
        };

        let body: AnyElement = match self.surface {
            LauncherSurface::Settings => self.settings_view.clone().into_any_element(),
            LauncherSurface::ComputerUse => div()
                .size_full()
                .flex()
                .flex_col()
                .child(self.search_header.clone())
                .child(self.computer_use.clone())
                .child(self.footer_bar.clone())
                .into_any_element(),
            LauncherSurface::Launcher => div()
                .size_full()
                .flex()
                .flex_col()
                .child(self.search_header.clone())
                .when(expanded, |el| {
                    el.child(self.scope_bar.clone())
                        .child(self.answer_banner.clone())
                        .child(
                            div()
                                .flex_1()
                                .min_h_0()
                                .w_full()
                                .flex()
                                .child(self.results_list.clone())
                                .when(show_preview, |row| row.child(self.preview_pane.clone())),
                        )
                        .child(self.footer_bar.clone())
                })
                .into_any_element(),
        };

        div()
            .id("lumen-spotlight-shell")
            .track_focus(&self.focus_handle)
            .size_full()
            .relative()
            .rounded(px(14.0))
            .bg(p.window_bg)
            .border_1()
            .border_color(p.border_outer)
            .font_family("Segoe UI Variable Text")
            .text_color(p.text_primary)
            .overflow_hidden()
            .on_key_down(cx.listener(Self::on_key_down))
            .child(body)
            .child(self.action_menu.clone())
            .child(self.toast.clone())
            .with_animation(
                ("lumen-summon", self.summon_seq),
                Animation::new(summon_dur).with_easing(ease_out_cubic),
                |el, delta| el.opacity(0.25 + 0.75 * delta).mt(px((1.0 - delta) * 7.0)),
            )
    }
}
