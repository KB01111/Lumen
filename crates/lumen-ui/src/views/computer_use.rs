//! Computer Use workspace surface wired directly to `lumen_core::computer_use::ComputerUseSupervisor`.
//! Preserves Lumen's strict browser/desktop opt-in consents, snapshot-scoped one-time approval,
//! fresh Edge isolation, and native Ctrl+Alt+Esc emergency stop.

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

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
use lumen_core::{
    EventChannel, LumenRuntime,
    computer_use::{
        ComputerUseEvent, ComputerUseHealth, ComputerUseRequest, StopReason, WindowTarget,
        protocol::{ApprovalScope, EventKind, ExecutionMode, Provider, TargetSelection},
    },
};

use crate::{
    theme::LumenPalette,
    views::{kbd_pill, status_pill},
};

#[derive(Clone, Debug)]
pub enum ComputerUseViewEvent {
    BackToLauncher,
    OpenConsentSettings,
    Toast(String),
}

#[derive(Clone, Debug)]
struct PendingApproval {
    task_id: u64,
    approval_id: String,
    scope: ApprovalScope,
    explanation: String,
}

#[derive(Clone, Debug)]
struct FeedEntry {
    badge: &'static str,
    text: String,
    is_error: bool,
}

pub struct ComputerUseView {
    palette: LumenPalette,
    runtime: Arc<LumenRuntime>,
    tokio_handle: tokio::runtime::Handle,
    task_input: Entity<InputState>,
    health: Option<ComputerUseHealth>,
    targets: Vec<WindowTarget>,
    selected_target_id: Option<String>, // None => Fresh Microsoft Edge
    running: bool,
    active_task_id: u64,
    next_task_id: Arc<AtomicU64>,
    current_url: Option<String>,
    pending_approval: Option<PendingApproval>,
    feed: Vec<FeedEntry>,
    event_rx: std::sync::mpsc::Receiver<ComputerUseEvent>,
    event_tx: std::sync::mpsc::Sender<ComputerUseEvent>,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<ComputerUseViewEvent> for ComputerUseView {}

impl ComputerUseView {
    pub fn new(
        palette: LumenPalette,
        runtime: Arc<LumenRuntime>,
        tokio_handle: tokio::runtime::Handle,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let task_input = cx.new(|cx| {
            InputState::new(window, cx).placeholder(
                "Describe a browser or selected-window task for Lumen (up to 4,000 chars)...",
            )
        });
        let sub = cx.subscribe_in(&task_input, window, |this, _, event: &InputEvent, _, cx| {
            if let InputEvent::PressEnter { .. } = event {
                this.start_task(cx);
            }
        });
        let (event_tx, event_rx) = std::sync::mpsc::channel();
        let mut view = Self {
            palette,
            runtime,
            tokio_handle,
            task_input,
            health: None,
            targets: Vec::new(),
            selected_target_id: None,
            running: false,
            active_task_id: 0,
            next_task_id: Arc::new(AtomicU64::new(1)),
            current_url: None,
            pending_approval: None,
            feed: Vec::new(),
            event_rx,
            event_tx,
            _subscriptions: vec![sub],
        };
        view.refresh_status(cx);
        view
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn input_focus_handle(&self, cx: &App) -> FocusHandle {
        self.task_input.read(cx).focus_handle(cx)
    }

    pub fn refresh_status(&mut self, cx: &mut Context<Self>) {
        let runtime = Arc::clone(&self.runtime);
        let handle = self.tokio_handle.clone();
        cx.spawn(async move |this, cx| {
            let (health, targets) = handle
                .spawn(async move {
                    let health = runtime.computer_use_health().await;
                    let targets = runtime.computer_use_targets().unwrap_or_default();
                    (Some(health), targets)
                })
                .await
                .unwrap_or_else(|_| (None, Vec::new()));
            let _ = this.update(cx, |view, cx| {
                view.health = health;
                view.targets = targets;
                cx.notify();
            });
        })
        .detach();
    }

    /// Drains any pending Computer Use events emitted by the native supervisor thread.
    pub fn poll_events(&mut self, cx: &mut Context<Self>) {
        let mut changed = false;
        while let Ok(ev) = self.event_rx.try_recv() {
            changed = true;
            match ev.event {
                EventKind::Started {
                    provider,
                    model,
                    execution_mode,
                    browser,
                } => {
                    self.running = true;
                    self.feed.push(FeedEntry {
                        badge: "START",
                        text: format!(
                            "{} · {} ({:?}) on {}",
                            provider.id(),
                            model,
                            execution_mode,
                            browser
                        ),
                        is_error: false,
                    });
                }
                EventKind::Reasoning { text } => {
                    self.feed.push(FeedEntry {
                        badge: "THINK",
                        text,
                        is_error: false,
                    });
                }
                EventKind::Action { action, .. } => {
                    self.feed.push(FeedEntry {
                        badge: "ACT",
                        text: action,
                        is_error: false,
                    });
                }
                EventKind::Observation { url, snapshot_id } => {
                    if let Some(u) = url {
                        self.current_url = Some(u.clone());
                        self.feed.push(FeedEntry {
                            badge: "VIEW",
                            text: format!("Observed {u} ({snapshot_id})"),
                            is_error: false,
                        });
                    }
                }
                EventKind::ApprovalRequired {
                    approval_id,
                    scope,
                    explanation,
                    ..
                } => {
                    self.pending_approval = Some(PendingApproval {
                        task_id: ev.task_id,
                        approval_id,
                        scope,
                        explanation,
                    });
                }
                EventKind::ApprovalResolved { approved, .. } => {
                    self.pending_approval = None;
                    self.feed.push(FeedEntry {
                        badge: "GATE",
                        text: if approved {
                            "One-time snapshot approval granted".to_owned()
                        } else {
                            "Approval denied — stopping task".to_owned()
                        },
                        is_error: !approved,
                    });
                }
                EventKind::Completed { summary } => {
                    self.running = false;
                    self.pending_approval = None;
                    self.feed.push(FeedEntry {
                        badge: "DONE",
                        text: summary,
                        is_error: false,
                    });
                }
                EventKind::Stopped { reason, uncertain } => {
                    self.running = false;
                    self.pending_approval = None;
                    self.feed.push(FeedEntry {
                        badge: "STOP",
                        text: format!(
                            "Stopped ({reason:?}){}",
                            if uncertain {
                                " — verify target state"
                            } else {
                                ""
                            }
                        ),
                        is_error: false,
                    });
                }
                EventKind::Failed { message, code } => {
                    self.running = false;
                    self.pending_approval = None;
                    self.feed.push(FeedEntry {
                        badge: "ERR",
                        text: format!("[{code}] {message}"),
                        is_error: true,
                    });
                }
            }
            if self.feed.len() > 80 {
                let overflow = self.feed.len() - 80;
                self.feed.drain(0..overflow);
            }
        }
        if changed {
            cx.notify();
        }
    }

    fn start_task(&mut self, cx: &mut Context<Self>) {
        let task = self.task_input.read(cx).value().trim().to_owned();
        if task.is_empty() {
            cx.emit(ComputerUseViewEvent::Toast(
                "Enter a task before starting Computer Use.".to_owned(),
            ));
            return;
        }
        if self.running {
            return;
        }
        let settings = self.runtime.settings.snapshot().management.computer_use;
        let model = match settings.provider {
            Provider::Gemini => settings.model.clone(),
            Provider::Openai => settings.openai_model.clone(),
        };
        let target = match &self.selected_target_id {
            Some(target_id) => TargetSelection::Window {
                target_id: target_id.clone(),
            },
            None => TargetSelection::Browser {
                initial_url: settings.initial_url.clone(),
                visible: settings.execution_mode == ExecutionMode::Fast,
            },
        };
        let task_id = self.next_task_id.fetch_add(1, Ordering::Relaxed);
        let request = ComputerUseRequest {
            task_id,
            task,
            provider: settings.provider,
            model,
            execution_mode: settings.execution_mode,
            target,
            cloud_consent: settings.cloud_consent,
            desktop_control_consent: settings.desktop_control_consent,
            desktop_cloud_consent: settings.desktop_cloud_consent,
        };

        self.feed.clear();
        self.pending_approval = None;
        self.current_url = None;

        let tx = self.event_tx.clone();
        let channel =
            EventChannel::new(move |ev: ComputerUseEvent| tx.send(ev).map_err(|e| e.to_string()));

        match self.runtime.start_computer_use(request, channel) {
            Ok(()) => {
                self.running = true;
                self.active_task_id = task_id;
                cx.notify();
            }
            Err(err) => {
                self.running = false;
                self.feed.push(FeedEntry {
                    badge: "GATE",
                    text: err.clone(),
                    is_error: true,
                });
                cx.emit(ComputerUseViewEvent::Toast(err));
                cx.notify();
            }
        }
    }

    fn stop_task(&mut self, reason: StopReason, cx: &mut Context<Self>) {
        if self.active_task_id > 0 {
            let _ = self.runtime.stop_computer_use(self.active_task_id, reason);
        }
        self.running = false;
        self.pending_approval = None;
        cx.notify();
    }

    fn respond_approval(&mut self, approved: bool, cx: &mut Context<Self>) {
        if let Some(pending) = self.pending_approval.take() {
            let _ = self.runtime.respond_computer_use_approval(
                pending.task_id,
                &pending.approval_id,
                approved,
            );
            cx.notify();
        }
    }
}

impl Render for ComputerUseView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;
        let cu_settings = self.runtime.settings.snapshot().management.computer_use;
        let is_window_target = self.selected_target_id.is_some();
        let consent_ok = if is_window_target {
            cu_settings.desktop_control_consent && cu_settings.desktop_cloud_consent
        } else {
            cu_settings.cloud_consent
        };
        let health_state = self.health.as_ref().map_or("checking", |h| h.state);

        div()
            .flex_1()
            .w_full()
            .min_h_0()
            .p(px(14.0))
            .flex()
            .flex_col()
            .gap(px(10.0))
            // Status + Target picker header
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(status_pill(
                                format!("Engine: {health_state}"),
                                if health_state == "ready" {
                                    p.success
                                } else {
                                    p.warning
                                },
                                p.surface_inset,
                                p.border_subtle,
                            ))
                            .child(status_pill(
                                format!(
                                    "{} · {:?}",
                                    cu_settings.provider.id(),
                                    cu_settings.execution_mode
                                ),
                                p.accent_bright,
                                p.accent_soft,
                                p.accent_border,
                            ))
                            .child(status_pill(
                                "Emergency Stop: Ctrl+Alt+Esc",
                                p.text_secondary,
                                p.kbd_bg,
                                p.kbd_border,
                            )),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .id("cu-refresh-targets")
                                    .px(px(8.0))
                                    .py(px(4.0))
                                    .rounded(px(6.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .flex()
                                    .items_center()
                                    .gap(px(5.0))
                                    .cursor_pointer()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.refresh_status(cx);
                                    }))
                                    .child(
                                        Icon::new(IconName::RefreshCw)
                                            .size(px(11.0))
                                            .text_color(p.text_secondary),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(11.0))
                                            .text_color(p.text_secondary)
                                            .child("Refresh Windows"),
                                    ),
                            )
                            .child(
                                div()
                                    .id("cu-open-settings")
                                    .px(px(8.0))
                                    .py(px(4.0))
                                    .rounded(px(6.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(ComputerUseViewEvent::OpenConsentSettings);
                                    }))
                                    .child(
                                        div()
                                            .text_size(px(11.0))
                                            .text_color(p.text_secondary)
                                            .child("Consents & Models"),
                                    ),
                            )
                            .child(
                                div()
                                    .id("cu-back-search")
                                    .px(px(8.0))
                                    .py(px(4.0))
                                    .rounded(px(6.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(ComputerUseViewEvent::BackToLauncher);
                                    }))
                                    .child(
                                        div()
                                            .text_size(px(11.0))
                                            .text_color(p.text_secondary)
                                            .child("Back"),
                                    ),
                            ),
                    ),
            )
            // Target selector pills (Fresh Edge + discovered non-elevated windows)
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(px(6.0))
                    .child(
                        div()
                            .id("cu-target-edge")
                            .px(px(9.0))
                            .py(px(4.0))
                            .rounded(px(7.0))
                            .flex()
                            .items_center()
                            .gap(px(5.0))
                            .cursor_pointer()
                            .when(self.selected_target_id.is_none(), |el| {
                                el.bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                            })
                            .when(self.selected_target_id.is_some(), |el| {
                                el.bg(p.surface_inset)
                                    .border_1()
                                    .border_color(p.border_subtle)
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.selected_target_id = None;
                                cx.notify();
                            }))
                            .child(Icon::new(IconName::Globe).size(px(12.0)).text_color(p.accent))
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(p.text_primary)
                                    .child("Fresh Microsoft Edge"),
                            ),
                    )
                    .children(self.targets.iter().take(6).enumerate().map(|(i, target)| {
                        let active = self.selected_target_id.as_deref() == Some(&target.target_id);
                        let tid = target.target_id.clone();
                        let available = target.available;
                        let label: String = format!("{} ({})", target.title, target.process_name)
                            .chars()
                            .take(36)
                            .collect();
                        div()
                            .id(SharedString::from(format!("cu-win-{i}")))
                            .px(px(9.0))
                            .py(px(4.0))
                            .rounded(px(7.0))
                            .flex()
                            .items_center()
                            .gap(px(5.0))
                            .when(available, |el| el.cursor_pointer())
                            .when(!available, |el| el.opacity(0.45))
                            .when(active, |el| {
                                el.bg(p.accent_soft)
                                    .border_1()
                                    .border_color(p.accent_border)
                            })
                            .when(!active, |el| {
                                el.bg(p.surface_inset)
                                    .border_1()
                                    .border_color(p.border_subtle)
                            })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if available {
                                    this.selected_target_id = Some(tid.clone());
                                    cx.notify();
                                }
                            }))
                            .child(
                                Icon::new(IconName::AppWindow)
                                    .size(px(12.0))
                                    .text_color(p.kind_app),
                            )
                            .child(
                                div()
                                    .text_size(px(11.5))
                                    .text_color(p.text_secondary)
                                    .child(label),
                            )
                    })),
            )
            // Consent guard banner if current target lacks explicit consent
            .when(!consent_ok, |el| {
                el.child(
                    div()
                        .px(px(12.0))
                        .py(px(8.0))
                        .rounded(px(9.0))
                        .bg(Hsla { a: 0.12, ..p.warning })
                        .border_1()
                        .border_color(Hsla { a: 0.32, ..p.warning })
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(10.0))
                        .child(
                            div()
                                .text_size(px(11.5))
                                .text_color(p.warning)
                                .child(if is_window_target {
                                    "Desktop window control and desktop cloud observation consents are both required (both default off)."
                                } else {
                                    "Browser cloud Computer Use consent is currently off. Enable it in Settings → Computer Use."
                                }),
                        )
                        .child(
                            div()
                                .id("cu-grant-link")
                                .px(px(9.0))
                                .py(px(4.0))
                                .rounded(px(6.0))
                                .bg(p.surface_elevated)
                                .text_size(px(11.0))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(p.text_primary)
                                .cursor_pointer()
                                .on_click(cx.listener(|_, _, _, cx| {
                                    cx.emit(ComputerUseViewEvent::OpenConsentSettings);
                                }))
                                .child("Configure"),
                        ),
                )
            })
            // Task prompt row + Start / Stop controls
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .p(px(6.0))
                    .rounded(px(10.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .px(px(6.0))
                            .child(
                                Input::new(&self.task_input)
                                    .appearance(false)
                                    .bordered(false)
                                    .focus_bordered(false),
                            ),
                    )
                    .when(!self.running, |el| {
                        el.child(
                            div()
                                .id("cu-start-btn")
                                .px(px(12.0))
                                .py(px(6.0))
                                .rounded(px(7.0))
                                .bg(p.accent_soft)
                                .border_1()
                                .border_color(p.accent_border)
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .cursor_pointer()
                                .on_click(cx.listener(|this, _, _, cx| this.start_task(cx)))
                                .child(Icon::new(IconName::Play).size(px(12.0)).text_color(p.accent))
                                .child(
                                    div()
                                        .text_size(px(12.0))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(p.accent_bright)
                                        .child("Run Task"),
                                )
                                .child(kbd_pill("↵", &p)),
                        )
                    })
                    .when(self.running, |el| {
                        el.child(Spinner::new().color(p.accent))
                            .child(
                                div()
                                    .id("cu-takeover-btn")
                                    .px(px(10.0))
                                    .py(px(6.0))
                                    .rounded(px(7.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .text_size(px(11.5))
                                    .text_color(p.text_primary)
                                    .cursor_pointer()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.stop_task(StopReason::TakeOver, cx);
                                    }))
                                    .child("Take Over"),
                            )
                            .child(
                                div()
                                    .id("cu-stop-btn")
                                    .px(px(10.0))
                                    .py(px(6.0))
                                    .rounded(px(7.0))
                                    .bg(Hsla { a: 0.16, ..p.danger })
                                    .border_1()
                                    .border_color(Hsla { a: 0.35, ..p.danger })
                                    .flex()
                                    .items_center()
                                    .gap(px(5.0))
                                    .cursor_pointer()
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        this.stop_task(StopReason::Stop, cx);
                                    }))
                                    .child(
                                        Icon::new(IconName::Square)
                                            .size(px(11.0))
                                            .text_color(p.danger),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(p.danger)
                                            .child("Stop"),
                                    ),
                            )
                    }),
            )
            // One-time snapshot-scoped approval card when requested by Rust supervisor
            .when_some(self.pending_approval.clone(), |el, pending| {
                el.child(
                    div()
                        .p(px(11.0))
                        .rounded(px(10.0))
                        .bg(Hsla { a: 0.14, ..p.accent })
                        .border_1()
                        .border_color(p.accent_border)
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(12.0))
                        .child(
                            div()
                                .flex_1()
                                .flex()
                                .flex_col()
                                .gap(px(2.0))
                                .child(
                                    div()
                                        .text_size(px(12.0))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(p.accent_bright)
                                        .child(format!(
                                            "One-time Approval Required ({:?})",
                                            pending.scope
                                        )),
                                )
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .text_color(p.text_primary)
                                        .child(pending.explanation),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(
                                    div()
                                        .id("cu-approve-once")
                                        .px(px(10.0))
                                        .py(px(5.0))
                                        .rounded(px(6.0))
                                        .bg(Hsla { a: 0.20, ..p.success })
                                        .border_1()
                                        .border_color(Hsla { a: 0.40, ..p.success })
                                        .text_size(px(11.5))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(p.success)
                                        .cursor_pointer()
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.respond_approval(true, cx);
                                        }))
                                        .child("Approve Once"),
                                )
                                .child(
                                    div()
                                        .id("cu-deny-stop")
                                        .px(px(10.0))
                                        .py(px(5.0))
                                        .rounded(px(6.0))
                                        .bg(Hsla { a: 0.16, ..p.danger })
                                        .text_size(px(11.5))
                                        .text_color(p.danger)
                                        .cursor_pointer()
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.respond_approval(false, cx);
                                        }))
                                        .child("Deny & Stop"),
                                ),
                        ),
                )
            })
            // Live activity log
            .child(
                div()
                    .id("cu-feed-scroll")
                    .flex_1()
                    .w_full()
                    .min_h_0()
                    .rounded(px(10.0))
                    .bg(p.surface_inset)
                    .border_1()
                    .border_color(p.border_subtle)
                    .overflow_y_scroll()
                    .p(px(10.0))
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .when(self.feed.is_empty(), |el| {
                        el.items_center().justify_center().child(
                            div()
                                .text_size(px(12.0))
                                .text_color(p.text_muted)
                                .child("Rust supervises every turn, credential, and Job Object. Press Esc to return to Search."),
                        )
                    })
                    .children(self.feed.iter().map(|entry| {
                        div()
                            .flex()
                            .items_start()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .w(px(46.0))
                                    .flex_none()
                                    .px(px(5.0))
                                    .py(px(1.5))
                                    .rounded(px(4.0))
                                    .bg(if entry.is_error {
                                        Hsla { a: 0.16, ..p.danger }
                                    } else {
                                        p.kbd_bg
                                    })
                                    .text_size(px(9.5))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(if entry.is_error {
                                        p.danger
                                    } else {
                                        p.accent
                                    })
                                    .child(entry.badge),
                            )
                            .child(
                                div()
                                    .flex_1()
                                    .text_size(px(12.0))
                                    .line_height(px(17.0))
                                    .text_color(if entry.is_error {
                                        p.danger
                                    } else {
                                        p.text_primary
                                    })
                                    .child(entry.text.clone()),
                            )
                    })),
            )
    }
}
