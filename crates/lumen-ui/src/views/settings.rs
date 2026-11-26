//! Native 11-page Lumen Settings surface wired directly to `lumen_core::LumenRuntime`.

use std::sync::Arc;

use gpui_kit::{
    assets::IconName,
    component::{
        Icon,
        input::{Input, InputState},
    },
    prelude::FluentBuilder,
    *,
};
use lumen_core::{
    LumenRuntime,
    computer_use::protocol::{ExecutionMode, Provider as CuProvider},
    gateway::{
        answer::RuntimeMode, credentials, local_runtime::LocalRuntimeHealth, mcp::ToolAccess,
    },
    search::{NativeDiagnostics, SemanticSearchStatus},
    settings::{
        CloseBehavior, DensitySetting, IndexedRootConfig, MonitorBehavior, MotionSetting,
        PreviewBehavior, ShortcutStatus, ThemeModeSetting, TransparencySetting,
    },
};

use crate::{
    model::SettingsTab,
    theme::LumenPalette,
    views::{kbd_pill, status_pill},
};

#[derive(Clone, Debug)]
pub enum SettingsEvent {
    Close,
    AppearanceChanged,
    ShortcutChanged(String),
    RootsChanged,
    Toast(String),
}

const CREDENTIAL_PROVIDERS: &[(&str, &str)] = &[
    ("openai", "OpenAI"),
    ("gemini", "Gemini (Computer Use)"),
    ("google", "Google (AI Answers)"),
    ("anthropic", "Anthropic"),
    ("openrouter", "OpenRouter"),
    ("openai-compatible", "OpenAI-Compatible"),
];

pub struct SettingsView {
    palette: LumenPalette,
    runtime: Arc<LumenRuntime>,
    tokio_handle: tokio::runtime::Handle,
    active_tab: SettingsTab,
    shortcut_status: ShortcutStatus,
    diagnostics: Option<NativeDiagnostics>,
    local_health: Option<LocalRuntimeHealth>,
    semantic_status: Option<SemanticSearchStatus>,
    cred_provider: &'static str,
    cred_input: Entity<InputState>,
    dialog_open: bool,
}

impl EventEmitter<SettingsEvent> for SettingsView {}

impl SettingsView {
    pub fn new(
        palette: LumenPalette,
        runtime: Arc<LumenRuntime>,
        tokio_handle: tokio::runtime::Handle,
        shortcut_status: ShortcutStatus,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let cred_input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Paste API key — saved only in Windows Credential Manager")
        });
        let mut view = Self {
            palette,
            runtime,
            tokio_handle,
            active_tab: SettingsTab::General,
            shortcut_status,
            diagnostics: None,
            local_health: None,
            semantic_status: None,
            cred_provider: "openai",
            cred_input,
            dialog_open: false,
        };
        view.refresh_telemetry(cx);
        view
    }

    pub fn is_dialog_open(&self) -> bool {
        self.dialog_open
    }

    pub fn set_palette(&mut self, palette: LumenPalette, cx: &mut Context<Self>) {
        self.palette = palette;
        cx.notify();
    }

    pub fn set_shortcut_status(&mut self, status: ShortcutStatus, cx: &mut Context<Self>) {
        self.shortcut_status = status;
        cx.notify();
    }

    pub fn open_tab(&mut self, tab: SettingsTab, cx: &mut Context<Self>) {
        self.active_tab = tab;
        self.refresh_telemetry(cx);
        cx.notify();
    }

    pub fn refresh_telemetry(&mut self, cx: &mut Context<Self>) {
        let runtime = Arc::clone(&self.runtime);
        let shortcut = self.shortcut_status.clone();
        let handle = self.tokio_handle.clone();
        cx.spawn(async move |this, cx| {
            let result = handle
                .spawn_blocking(move || {
                    let diag = runtime.native_diagnostics(shortcut).ok();
                    let local = runtime.local_runtime.health();
                    let semantic = runtime.semantic_status().ok();
                    (diag, local, semantic)
                })
                .await;
            if let Ok((diag, local, semantic)) = result {
                let _ = this.update(cx, |view, cx| {
                    view.diagnostics = diag;
                    view.local_health = Some(local);
                    view.semantic_status = semantic;
                    cx.notify();
                });
            }
        })
        .detach();
    }

    fn add_folder_via_dialog(&mut self, cx: &mut Context<Self>) {
        if self.dialog_open {
            return;
        }
        self.dialog_open = true;
        let runtime = Arc::clone(&self.runtime);
        let handle = self.tokio_handle.clone();
        cx.spawn(async move |this, cx| {
            let picked = handle
                .spawn_blocking(|| {
                    rfd::FileDialog::new()
                        .set_title("Choose a folder for Lumen to index")
                        .pick_folder()
                })
                .await
                .ok()
                .flatten();

            let mut added_path: Option<String> = None;
            if let Some(folder) = picked {
                let path_str = folder.to_string_lossy().to_string();
                let res = runtime.update_settings(|s| {
                    if !s
                        .management
                        .roots
                        .iter()
                        .any(|r| r.path.eq_ignore_ascii_case(&path_str))
                    {
                        s.management
                            .roots
                            .push(IndexedRootConfig::from_path(&path_str));
                    }
                });
                if res.is_ok() {
                    added_path = Some(path_str);
                    let rt_sync = Arc::clone(&runtime);
                    handle.spawn(async move {
                        let _ = rt_sync.synchronize_roots().await;
                    });
                }
            }

            let _ = this.update(cx, |view, cx| {
                view.dialog_open = false;
                if let Some(path) = added_path {
                    cx.emit(SettingsEvent::RootsChanged);
                    cx.emit(SettingsEvent::Toast(format!("Indexing {path}")));
                }
                view.refresh_telemetry(cx);
                cx.notify();
            });
        })
        .detach();
    }

    fn export_diagnostics_via_dialog(&mut self, cx: &mut Context<Self>) {
        if self.dialog_open {
            return;
        }
        self.dialog_open = true;
        let runtime = Arc::clone(&self.runtime);
        let shortcut = self.shortcut_status.clone();
        let handle = self.tokio_handle.clone();
        cx.spawn(async move |this, cx| {
            let outcome = handle
                .spawn_blocking(move || {
                    let dest = rfd::FileDialog::new()
                        .set_title("Export Sanitized Lumen Diagnostics")
                        .set_file_name("lumen-diagnostics.json")
                        .add_filter("JSON", &["json"])
                        .save_file()?;
                    Some(runtime.export_sanitized_diagnostics(&dest, shortcut))
                })
                .await
                .ok()
                .flatten();
            let _ = this.update(cx, |view, cx| {
                view.dialog_open = false;
                if let Some(res) = outcome {
                    match res {
                        Ok(()) => cx.emit(SettingsEvent::Toast(
                            "Exported sanitized diagnostics snapshot".to_owned(),
                        )),
                        Err(err) => cx.emit(SettingsEvent::Toast(err)),
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn section_card(&self, title: &'static str, subtitle: &'static str) -> Div {
        let p = self.palette;
        div()
            .w_full()
            .p(px(14.0))
            .rounded(px(11.0))
            .bg(p.surface_inset)
            .border_1()
            .border_color(p.border_subtle)
            .flex()
            .flex_col()
            .gap(px(10.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(2.0))
                    .child(
                        div()
                            .text_size(px(12.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(p.text_primary)
                            .child(title),
                    )
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(p.text_muted)
                            .child(subtitle),
                    ),
            )
    }

    fn chip_button(
        &self,
        id: impl Into<SharedString>,
        label: impl Into<SharedString>,
        active: bool,
        on_click: impl Fn(&mut Self, &mut Window, &mut Context<Self>) + 'static,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let p = self.palette;
        div()
            .id(id.into())
            .px(px(10.0))
            .py(px(5.0))
            .rounded(px(7.0))
            .text_size(px(11.5))
            .font_weight(if active {
                FontWeight::SEMIBOLD
            } else {
                FontWeight::MEDIUM
            })
            .cursor_pointer()
            .when(active, |el| {
                el.bg(p.accent_soft)
                    .border_1()
                    .border_color(p.accent_border)
                    .text_color(p.accent_bright)
            })
            .when(!active, |el| {
                el.bg(p.surface_elevated)
                    .border_1()
                    .border_color(p.border_subtle)
                    .text_color(p.text_secondary)
                    .hover(move |s| s.bg(p.row_hover).text_color(p.text_primary))
            })
            .on_click(cx.listener(move |this, _, window, cx| on_click(this, window, cx)))
            .child(label.into())
    }

    fn toggle_row(
        &self,
        id: &'static str,
        title: &'static str,
        desc: &'static str,
        checked: bool,
        on_toggle: impl Fn(&mut Self, &mut Context<Self>) + 'static,
        cx: &mut Context<Self>,
    ) -> Stateful<Div> {
        let p = self.palette;
        div()
            .id(id)
            .w_full()
            .py(px(6.0))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .cursor_pointer()
            .on_click(cx.listener(move |this, _, _, cx| on_toggle(this, cx)))
            .child(
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .gap(px(1.5))
                    .child(
                        div()
                            .text_size(px(12.5))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(p.text_primary)
                            .child(title),
                    )
                    .child(
                        div()
                            .text_size(px(11.0))
                            .text_color(p.text_muted)
                            .child(desc),
                    ),
            )
            .child(
                div()
                    .w(px(36.0))
                    .h(px(20.0))
                    .flex_none()
                    .rounded(px(999.0))
                    .p(px(2.0))
                    .bg(if checked { p.accent } else { p.kbd_bg })
                    .border_1()
                    .border_color(if checked {
                        p.accent_bright
                    } else {
                        p.kbd_border
                    })
                    .flex()
                    .items_center()
                    .when(checked, |el| el.justify_end())
                    .when(!checked, |el| el.justify_start())
                    .child(
                        div()
                            .w(px(14.0))
                            .h(px(14.0))
                            .rounded(px(999.0))
                            .bg(if checked {
                                p.text_inverse
                            } else {
                                p.text_secondary
                            }),
                    ),
            )
    }

    fn render_active_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = self.palette;
        let settings = self.runtime.settings.snapshot();

        match self.active_tab {
            SettingsTab::General => {
                let general = settings.management.general;
                let reg_text = if self.shortcut_status.registered {
                    format!(
                        "Active ({})",
                        self.shortcut_status
                            .accelerator
                            .as_deref()
                            .unwrap_or(&general.shortcut)
                    )
                } else {
                    format!(
                        "Conflict ({})",
                        self.shortcut_status
                            .error_code
                            .as_deref()
                            .unwrap_or("unregistered")
                    )
                };
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Global Summon Hotkey",
                            "Summon and hide Lumen from any Windows app.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .justify_between()
                                .gap(px(8.0))
                                .child(
                                    div().flex().items_center().gap(px(6.0)).children(
                                        ["Alt + Space", "Ctrl + Space", "Ctrl + Shift + L"]
                                            .into_iter()
                                            .map(|accel| {
                                                let active =
                                                    general.shortcut.eq_ignore_ascii_case(accel);
                                                self.chip_button(
                                                    format!("sc-{accel}"),
                                                    accel,
                                                    active,
                                                    move |this, _, cx| {
                                                        let _ = this.runtime.update_settings(|s| {
                                                            s.management.general.shortcut =
                                                                accel.to_owned();
                                                        });
                                                        cx.emit(SettingsEvent::ShortcutChanged(
                                                            accel.to_owned(),
                                                        ));
                                                    },
                                                    cx,
                                                )
                                            }),
                                    ),
                                )
                                .child(status_pill(
                                    reg_text,
                                    if self.shortcut_status.registered {
                                        p.success
                                    } else {
                                        p.warning
                                    },
                                    p.surface_elevated,
                                    p.border_subtle,
                                )),
                        ),
                    )
                    .child(
                        self.section_card(
                            "Placement & Lifecycle",
                            "Control which display hosts Lumen and what happens when closed.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(self.chip_button(
                                    "mon-active",
                                    "Follow Cursor Monitor",
                                    general.monitor_behavior == MonitorBehavior::Active,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.general.monitor_behavior =
                                                MonitorBehavior::Active;
                                        });
                                        cx.emit(SettingsEvent::AppearanceChanged);
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "mon-primary",
                                    "Always Primary Monitor",
                                    general.monitor_behavior == MonitorBehavior::Primary,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.general.monitor_behavior =
                                                MonitorBehavior::Primary;
                                        });
                                        cx.emit(SettingsEvent::AppearanceChanged);
                                    },
                                    cx,
                                )),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(self.chip_button(
                                    "close-hide",
                                    "Hide to Tray on Close",
                                    general.close_behavior == CloseBehavior::Hide,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.general.close_behavior =
                                                CloseBehavior::Hide;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "close-quit",
                                    "Quit on Close",
                                    general.close_behavior == CloseBehavior::Quit,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.general.close_behavior =
                                                CloseBehavior::Quit;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                )),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::Appearance => {
                let app = settings.appearance;
                let glass = settings.management.presentation.glass_intensity;
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Theme & Windows 11 DWM Backdrop",
                            "Live-applied via DWMWA_SYSTEMBACKDROP_TYPE without flickering.",
                        )
                        .child(
                            div().flex().items_center().gap(px(6.0)).children(
                                [
                                    (ThemeModeSetting::Dark, "Dark"),
                                    (ThemeModeSetting::Light, "Light"),
                                    (ThemeModeSetting::System, "System"),
                                ]
                                .into_iter()
                                .map(|(mode, label)| {
                                    self.chip_button(
                                        format!("theme-{label}"),
                                        label,
                                        app.mode == mode,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                s.appearance.mode = mode;
                                            });
                                            cx.emit(SettingsEvent::AppearanceChanged);
                                        },
                                        cx,
                                    )
                                }),
                            ),
                        )
                        .child(
                            div().flex().items_center().gap(px(6.0)).children(
                                [
                                    (TransparencySetting::Native, "Acrylic Glass"),
                                    (TransparencySetting::Reduced, "Mica Backdrop"),
                                    (TransparencySetting::Disabled, "Solid Opaque"),
                                ]
                                .into_iter()
                                .map(|(tr, label)| {
                                    self.chip_button(
                                        format!("mat-{label}"),
                                        label,
                                        app.transparency == tr,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                s.appearance.transparency = tr;
                                            });
                                            cx.emit(SettingsEvent::AppearanceChanged);
                                        },
                                        cx,
                                    )
                                }),
                            ),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(
                                    div()
                                        .text_size(px(11.5))
                                        .text_color(p.text_muted)
                                        .mr(px(4.0))
                                        .child("Glass tint:"),
                                )
                                .children(
                                    [(45u8, "Dense"), (76u8, "Balanced"), (96u8, "Airy")]
                                        .into_iter()
                                        .map(|(val, label)| {
                                            self.chip_button(
                                                format!("glass-{val}"),
                                                label,
                                                glass == val,
                                                move |this, _, cx| {
                                                    let _ = this.runtime.update_settings(|s| {
                                                        s.management.presentation.glass_intensity =
                                                            val;
                                                    });
                                                    cx.emit(SettingsEvent::AppearanceChanged);
                                                },
                                                cx,
                                            )
                                        }),
                                ),
                        ),
                    )
                    .child(
                        self.section_card(
                            "Density, Preview Pane & Motion",
                            "Tune row spacing, contextual split preview, and spring animations.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(self.chip_button(
                                    "dens-comf",
                                    "Comfortable (54px)",
                                    app.density == DensitySetting::Comfortable,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.appearance.density = DensitySetting::Comfortable;
                                        });
                                        cx.emit(SettingsEvent::AppearanceChanged);
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "dens-comp",
                                    "Compact (44px)",
                                    app.density == DensitySetting::Compact,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.appearance.density = DensitySetting::Compact;
                                        });
                                        cx.emit(SettingsEvent::AppearanceChanged);
                                    },
                                    cx,
                                )),
                        )
                        .child(
                            div().flex().items_center().gap(px(6.0)).children(
                                [
                                    (PreviewBehavior::Automatic, "Preview: Auto"),
                                    (PreviewBehavior::Always, "Preview: Always"),
                                    (PreviewBehavior::Never, "Preview: Hidden"),
                                ]
                                .into_iter()
                                .map(|(beh, label)| {
                                    self.chip_button(
                                        format!("prev-{label}"),
                                        label,
                                        app.preview == beh,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                s.appearance.preview = beh;
                                            });
                                            cx.emit(SettingsEvent::AppearanceChanged);
                                        },
                                        cx,
                                    )
                                }),
                            ),
                        )
                        .child(
                            div().flex().items_center().gap(px(6.0)).children(
                                [
                                    (MotionSetting::Full, "Springs: Full"),
                                    (MotionSetting::System, "Springs: System"),
                                    (MotionSetting::Reduced, "Springs: Reduced"),
                                ]
                                .into_iter()
                                .map(|(m, label)| {
                                    self.chip_button(
                                        format!("mot-{label}"),
                                        label,
                                        app.motion == m,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                s.appearance.motion = m;
                                            });
                                            cx.emit(SettingsEvent::AppearanceChanged);
                                        },
                                        cx,
                                    )
                                }),
                            ),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::IndexedRoots => {
                let roots = settings.management.roots;
                let idx_status = self.runtime.index_status();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(status_pill(
                                format!(
                                    "{} · {} indexed ({} pending)",
                                    idx_status.phase,
                                    idx_status.indexed_items,
                                    idx_status.pending_items
                                ),
                                p.accent_bright,
                                p.accent_soft,
                                p.accent_border,
                            ))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.0))
                                    .child(self.chip_button(
                                        "roots-add",
                                        "+ Add Folder...",
                                        true,
                                        |this, _, cx| this.add_folder_via_dialog(cx),
                                        cx,
                                    ))
                                    .child(self.chip_button(
                                        "roots-sync",
                                        "Re-sync Now",
                                        false,
                                        |this, _, cx| {
                                            let rt = Arc::clone(&this.runtime);
                                            this.tokio_handle.spawn(async move {
                                                let _ = rt.synchronize_roots().await;
                                            });
                                            cx.emit(SettingsEvent::Toast(
                                                "Re-syncing indexed folders...".to_owned(),
                                            ));
                                        },
                                        cx,
                                    )),
                            ),
                    )
                    .when(roots.is_empty(), |el| {
                        el.child(self.section_card(
                            "No folders indexed yet",
                            "Lumen only indexes folders you explicitly select, skips .git/node_modules/target, and never follows symlinks.",
                        ))
                    })
                    .children(roots.into_iter().enumerate().map(|(i, root)| {
                        let root_id = root.id.clone();
                        let root_id_rm = root.id.clone();
                        let paused = root.paused;
                        div()
                            .p(px(12.0))
                            .rounded(px(10.0))
                            .bg(p.surface_inset)
                            .border_1()
                            .border_color(p.border_subtle)
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(10.0))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .flex()
                                    .flex_col()
                                    .gap(px(2.0))
                                    .child(
                                        div()
                                            .text_size(px(12.5))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(p.text_primary)
                                            .overflow_hidden()
                                            .text_ellipsis()
                                            .whitespace_nowrap()
                                            .child(root.path.clone()),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(11.0))
                                            .text_color(p.text_muted)
                                            .child(format!(
                                                "{} · Max {} MiB",
                                                if paused { "Paused" } else { "Active" },
                                                root.max_file_size_mb
                                            )),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.0))
                                    .child(self.chip_button(
                                        format!("root-pause-{i}"),
                                        if paused { "Resume" } else { "Pause" },
                                        false,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                if let Some(r) = s
                                                    .management
                                                    .roots
                                                    .iter_mut()
                                                    .find(|r| r.id == root_id)
                                                {
                                                    r.paused = !r.paused;
                                                }
                                            });
                                            let rt = Arc::clone(&this.runtime);
                                            this.tokio_handle.spawn(async move {
                                                let _ = rt.synchronize_roots().await;
                                            });
                                            cx.emit(SettingsEvent::RootsChanged);
                                            cx.notify();
                                        },
                                        cx,
                                    ))
                                    .child(self.chip_button(
                                        format!("root-rm-{i}"),
                                        "Remove",
                                        false,
                                        move |this, _, cx| {
                                            let _ = this.runtime.update_settings(|s| {
                                                s.management
                                                    .roots
                                                    .retain(|r| r.id != root_id_rm);
                                            });
                                            let rt = Arc::clone(&this.runtime);
                                            this.tokio_handle.spawn(async move {
                                                let _ = rt.synchronize_roots().await;
                                            });
                                            cx.emit(SettingsEvent::RootsChanged);
                                            cx.notify();
                                        },
                                        cx,
                                    )),
                            )
                    }))
                    .into_any_element()
            }
            SettingsTab::Search => {
                let s = settings.management.search;
                let sem_label = self
                    .semantic_status
                    .as_ref()
                    .map(|st| {
                        format!(
                            "Vectors: {} ({} indexed chunks)",
                            if st.semantic_available {
                                "ready"
                            } else if st.vector_available {
                                "available"
                            } else {
                                "unavailable"
                            },
                            st.indexed_chunks
                        )
                    })
                    .unwrap_or_else(|| "Checking vector runtime...".to_owned());
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Ranking & Recency",
                            "Balance filename exact/fuzzy precision against content excerpts and recency.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .children(
                                    [
                                        (92u8, "Filename First"),
                                        (82u8, "Balanced (Default)"),
                                        (60u8, "Content First"),
                                    ]
                                    .into_iter()
                                    .map(|(prio, label)| {
                                        self.chip_button(
                                            format!("prio-{prio}"),
                                            label,
                                            s.filename_priority == prio,
                                            move |this, _, cx| {
                                                let _ = this.runtime.update_settings(|st| {
                                                    st.management.search.filename_priority = prio;
                                                });
                                                cx.notify();
                                            },
                                            cx,
                                        )
                                    }),
                                ),
                        )
                        .child(self.toggle_row(
                            "search-pinned",
                            "Boost Pinned Files",
                            "Keep pinned local files near the top of matching searches.",
                            s.show_pinned,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|st| {
                                    st.management.search.show_pinned =
                                        !st.management.search.show_pinned;
                                });
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .child(
                        self.section_card(
                            "Semantic Retrieval & Reranking",
                            "Runs locally via sqlite-vector + Lemonade when available.",
                        )
                        .child(status_pill(
                            sem_label,
                            p.accent_bright,
                            p.accent_soft,
                            p.accent_border,
                        ))
                        .child(self.toggle_row(
                            "search-semantic",
                            "Enable Local Semantic Vector Search",
                            "Blend dense vector matches with SQLite FTS5 lexical hits.",
                            s.semantic_enabled,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|st| {
                                    st.management.search.semantic_enabled =
                                        !st.management.search.semantic_enabled;
                                });
                                cx.notify();
                            },
                            cx,
                        ))
                        .child(self.toggle_row(
                            "search-rerank",
                            "Enable Cross-Encoder Reranking",
                            "Re-score top hybrid candidates when a rerank route is available.",
                            s.reranking_enabled,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|st| {
                                    st.management.search.reranking_enabled =
                                        !st.management.search.reranking_enabled;
                                });
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .into_any_element()
            }
            SettingsTab::LocalAi => {
                let ai = settings.management.ai;
                let health = self.local_health.as_ref();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Answer Routing Mode",
                            "Choose whether Shift+Enter AI answers prefer local Lemonade, cloud routes, or automatic selection.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .children(
                                    [
                                        (RuntimeMode::Auto, "Auto"),
                                        (RuntimeMode::Local, "Local Only"),
                                        (RuntimeMode::Cloud, "Cloud"),
                                    ]
                                    .into_iter()
                                    .map(|(m, label)| {
                                        self.chip_button(
                                            format!("ai-mode-{label}"),
                                            label,
                                            ai.runtime_mode == m,
                                            move |this, _, cx| {
                                                let _ = this.runtime.update_settings(|s| {
                                                    s.management.ai.runtime_mode = m;
                                                });
                                                cx.notify();
                                            },
                                            cx,
                                        )
                                    }),
                                ),
                        )
                        .child(self.toggle_row(
                            "ai-cloud-consent",
                            "Allow Cloud Answer Routing",
                            "Permit sending selected local snippets to configured cloud providers.",
                            ai.cloud_answer_consent,
                            |this, cx| {
                                let next = !this
                                    .runtime
                                    .settings
                                    .snapshot()
                                    .management
                                    .ai
                                    .cloud_answer_consent;
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.ai.cloud_answer_consent = next;
                                });
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .child(
                        self.section_card(
                            "Local Runtime (Lemonade / FLM)",
                            "Hardware profile detected natively on this Windows 11 machine.",
                        )
                        .when_some(health, |card, h| {
                            card.child(info_row("State", h.state, &p))
                                .child(info_row("Profile", h.profile, &p))
                                .child(info_row("Accelerator", h.accelerator.clone(), &p))
                                .child(info_row("Answer Model", h.answer_model, &p))
                                .child(info_row("Embedding Model", h.embedding_model, &p))
                                .child(info_row(
                                    "Lemonade",
                                    format!(
                                        "{} ({})",
                                        h.lemonade.state,
                                        h.lemonade.version.as_deref().unwrap_or("not installed")
                                    ),
                                    &p,
                                ))
                        })
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(self.chip_button(
                                    "local-start",
                                    "Start Local Runtime",
                                    false,
                                    |this, _, cx| {
                                        let msg = match this.runtime.local_runtime.start() {
                                            Ok(()) => {
                                                let h = this.runtime.local_runtime.health();
                                                format!("Local runtime: {}", h.state)
                                            }
                                            Err(e) => e,
                                        };
                                        this.refresh_telemetry(cx);
                                        cx.emit(SettingsEvent::Toast(msg));
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "local-stop",
                                    "Stop Runtime",
                                    false,
                                    |this, _, cx| {
                                        let msg = match this
                                            .runtime
                                            .local_runtime
                                            .apply_mode("cloud", false)
                                        {
                                            Ok(()) => "Stopped local runtime".to_owned(),
                                            Err(err) => err,
                                        };
                                        this.refresh_telemetry(cx);
                                        cx.emit(SettingsEvent::Toast(msg));
                                    },
                                    cx,
                                )),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::AgentGateway => {
                let gw = self.runtime.gateway.health();
                let mcp = self.runtime.mcp.snapshot();
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "AgentGateway Supervisor",
                            "In-process supervised local router for answers, embeddings, and MCP tools.",
                        )
                        .child(info_row("Status", gw.state, &p))
                        .child(info_row("Version", gw.version, &p))
                        .child(info_row(
                            "Interactive Port",
                            format!("127.0.0.1:{}", gw.interactive_port),
                            &p,
                        )),
                    )
                    .child(
                        self.section_card(
                            "MCP Local Tool Permissions",
                            "Controls whether agents may search, read metadata, or open indexed files.",
                        )
                        .children(mcp.permissions.into_iter().map(|perm| {
                            let tool_id = perm.id;
                            div()
                                .py(px(6.0))
                                .border_t_1()
                                .border_color(p.border_subtle)
                                .flex()
                                .items_center()
                                .justify_between()
                                .gap(px(10.0))
                                .child(
                                    div()
                                        .flex_1()
                                        .flex()
                                        .flex_col()
                                        .child(
                                            div()
                                                .text_size(px(12.0))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(p.text_primary)
                                                .child(perm.label),
                                        )
                                        .child(
                                            div()
                                                .text_size(px(11.0))
                                                .text_color(p.text_muted)
                                                .child(perm.description),
                                        ),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(4.0))
                                        .children(
                                            [
                                                (ToolAccess::Allow, "Allow"),
                                                (ToolAccess::Ask, "Ask"),
                                                (ToolAccess::Deny, "Deny"),
                                            ]
                                            .into_iter()
                                            .map(|(access, label)| {
                                                self.chip_button(
                                                    format!("mcp-{tool_id}-{label}"),
                                                    label,
                                                    perm.access == access,
                                                    move |this, _, cx| {
                                                        let _ = this
                                                            .runtime
                                                            .mcp
                                                            .set_permission(tool_id, access);
                                                        cx.notify();
                                                    },
                                                    cx,
                                                )
                                            }),
                                        ),
                                )
                        })),
                    )
                    .into_any_element()
            }
            SettingsTab::Providers => {
                let selected_prov = self.cred_provider;
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Windows Credential Manager",
                            "API keys are stored exclusively in Windows Credential Manager and never written to JSON settings.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .flex_wrap()
                                .gap(px(6.0))
                                .children(CREDENTIAL_PROVIDERS.iter().map(|&(id, label)| {
                                    let configured = credentials::status(id);
                                    let badge = if configured {
                                        format!("{label} ✓")
                                    } else {
                                        label.to_owned()
                                    };
                                    self.chip_button(
                                        format!("cred-sel-{id}"),
                                        badge,
                                        selected_prov == id,
                                        move |this, _, cx| {
                                            this.cred_provider = id;
                                            cx.notify();
                                        },
                                        cx,
                                    )
                                })),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.0))
                                .p(px(6.0))
                                .rounded(px(8.0))
                                .bg(p.surface_elevated)
                                .border_1()
                                .border_color(p.border_subtle)
                                .child(
                                    div().flex_1().child(
                                        Input::new(&self.cred_input)
                                            .appearance(false)
                                            .bordered(false)
                                            .focus_bordered(false),
                                    ),
                                )
                                .child(self.chip_button(
                                    "cred-save",
                                    "Save Key",
                                    true,
                                    |this, window, cx| {
                                        let secret = this.cred_input.read(cx).value().trim().to_owned();
                                        match credentials::set(this.cred_provider, &secret) {
                                            Ok(()) => {
                                                this.cred_input.update(cx, |s, cx| {
                                                    s.set_value("", window, cx);
                                                });
                                                cx.emit(SettingsEvent::Toast(format!(
                                                    "Saved {} credential in Windows Credential Manager",
                                                    this.cred_provider
                                                )));
                                            }
                                            Err(err) => cx.emit(SettingsEvent::Toast(err)),
                                        }
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "cred-del",
                                    "Remove",
                                    false,
                                    |this, _, cx| {
                                        match credentials::delete(this.cred_provider) {
                                            Ok(()) => cx.emit(SettingsEvent::Toast(format!(
                                                "Removed {} credential",
                                                this.cred_provider
                                            ))),
                                            Err(err) => cx.emit(SettingsEvent::Toast(err)),
                                        }
                                        cx.notify();
                                    },
                                    cx,
                                )),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::ComputerUse => {
                let cu = settings.management.computer_use;
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Explicit Opt-In Consents",
                            "Browser consent never grants desktop window control or observation; each consent is stored separately.",
                        )
                        .child(self.toggle_row(
                            "cu-browser-consent",
                            "Browser Cloud Automation Consent",
                            "Allow sending fresh Edge screenshots to your configured Gemini/OpenAI Computer Use model.",
                            cu.cloud_consent,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.computer_use.cloud_consent =
                                        !s.management.computer_use.cloud_consent;
                                });
                                cx.notify();
                            },
                            cx,
                        ))
                        .child(self.toggle_row(
                            "cu-desktop-ctrl",
                            "Selected-Window Desktop Control Consent",
                            "Allow controlling an explicitly selected non-elevated Windows window (default off).",
                            cu.desktop_control_consent,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.computer_use.desktop_control_consent =
                                        !s.management.computer_use.desktop_control_consent;
                                });
                                cx.notify();
                            },
                            cx,
                        ))
                        .child(self.toggle_row(
                            "cu-desktop-cloud",
                            "Desktop Cloud Observation Consent",
                            "Allow sending selected-window screenshots to the Computer Use provider (default off).",
                            cu.desktop_cloud_consent,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.computer_use.desktop_cloud_consent =
                                        !s.management.computer_use.desktop_cloud_consent;
                                });
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .child(
                        self.section_card(
                            "Provider & Execution Mode",
                            "Background mode never escalates to foreground; Fast requires snapshot-scoped approval.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(6.0))
                                .child(self.chip_button(
                                    "cu-prov-gemini",
                                    "Gemini",
                                    cu.provider == CuProvider::Gemini,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.computer_use.provider = CuProvider::Gemini;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "cu-prov-openai",
                                    "OpenAI",
                                    cu.provider == CuProvider::Openai,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.computer_use.provider = CuProvider::Openai;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "cu-mode-fast",
                                    "Fast (Interactive)",
                                    cu.execution_mode == ExecutionMode::Fast,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.computer_use.execution_mode =
                                                ExecutionMode::Fast;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "cu-mode-bg",
                                    "Background (Isolated)",
                                    cu.execution_mode == ExecutionMode::Background,
                                    |this, _, cx| {
                                        let _ = this.runtime.update_settings(|s| {
                                            s.management.computer_use.execution_mode =
                                                ExecutionMode::Background;
                                        });
                                        cx.notify();
                                    },
                                    cx,
                                )),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::Activity => {
                let snap = self.runtime.activity_snapshot();
                let pol = self.runtime.activity.policy();
                let paused = pol.user_paused;
                let detect_games = pol.detect_games;
                let pause_on_battery = pol.pause_on_battery;
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Live Background Activity",
                            "Automatically throttles indexing and enrichment during games, fullscreen video, or battery power.",
                        )
                        .child(info_row("Mode", format!("{:?}", snap.mode), &p))
                        .child(info_row(
                            "Background Policy",
                            format!("{:?}", snap.background_policy),
                            &p,
                        ))
                        .child(info_row(
                            "Power",
                            if snap.on_battery { "Battery" } else { "AC Power" },
                            &p,
                        ))
                        .child(self.chip_button(
                            "act-pause",
                            if paused {
                                "Resume Background Work"
                            } else {
                                "Pause Background Work"
                            },
                            paused,
                            move |this, _, cx| {
                                let _ = this.runtime.set_user_pause(!paused);
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .child(
                        self.section_card(
                            "Quiet Mode Policies",
                            "Keep Windows 11 responsive during demanding foreground apps.",
                        )
                        .child(self.toggle_row(
                            "act-quiet-game",
                            "Pause During Fullscreen Games",
                            "Suspend indexing and enrichment whenever a fullscreen game is detected.",
                            detect_games,
                            move |this, cx| {
                                let mut next = this.runtime.activity.policy();
                                next.detect_games = !next.detect_games;
                                let _ = this.runtime.set_activity_policy(next);
                                cx.notify();
                            },
                            cx,
                        ))
                        .child(self.toggle_row(
                            "act-quiet-batt",
                            "Throttle on Battery Power",
                            "Slow background extraction when unplugged.",
                            pause_on_battery,
                            move |this, cx| {
                                let mut next = this.runtime.activity.policy();
                                next.pause_on_battery = !next.pause_on_battery;
                                let _ = this.runtime.set_activity_policy(next);
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .into_any_element()
            }
            SettingsTab::Privacy => {
                let priv_s = settings.management.privacy;
                div()
                    .flex()
                    .flex_col()
                    .gap(px(12.0))
                    .child(
                        self.section_card(
                            "Local Content & Previews",
                            "All previews stay confined to selected roots with 64 KiB text / 4 MiB image caps.",
                        )
                        .child(self.toggle_row(
                            "priv-previews",
                            "Enable File Previews",
                            "Read bounded snippets and image thumbnails inside the Preview Pane.",
                            priv_s.previews_enabled,
                            |this, cx| {
                                let next = !this
                                    .runtime
                                    .settings
                                    .snapshot()
                                    .management
                                    .privacy
                                    .previews_enabled;
                                let _ = this.runtime.privacy.set_previews_enabled(next);
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.privacy.previews_enabled = next;
                                });
                                cx.notify();
                            },
                            cx,
                        ))
                        .child(self.toggle_row(
                            "priv-ocr",
                            "Enable Local OCR Extraction",
                            "Extract text from screenshots and scanned documents during local indexing.",
                            priv_s.ocr_enabled,
                            |this, cx| {
                                let _ = this.runtime.update_settings(|s| {
                                    s.management.privacy.ocr_enabled =
                                        !s.management.privacy.ocr_enabled;
                                });
                                cx.notify();
                            },
                            cx,
                        )),
                    )
                    .child(
                        self.section_card(
                            "Data Maintenance & Sanitized Diagnostics",
                            "Clear search history, wipe local SQLite index data, or export a path-redacted diagnostics JSON.",
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .flex_wrap()
                                .gap(px(8.0))
                                .child(self.chip_button(
                                    "priv-clear-hist",
                                    "Clear Search History",
                                    false,
                                    |this, _, cx| {
                                        let _ = this.runtime.clear_search_history();
                                        this.refresh_telemetry(cx);
                                        cx.emit(SettingsEvent::Toast(
                                            "Cleared local search history".to_owned(),
                                        ));
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "priv-del-index",
                                    "Delete Local Index Data",
                                    false,
                                    |this, _, cx| {
                                        let rt = Arc::clone(&this.runtime);
                                        this.tokio_handle.spawn(async move {
                                            let _ = rt.delete_index_data().await;
                                        });
                                        cx.emit(SettingsEvent::Toast(
                                            "Deleted local index data".to_owned(),
                                        ));
                                    },
                                    cx,
                                ))
                                .child(self.chip_button(
                                    "priv-export-diag",
                                    "Export Sanitized Diagnostics...",
                                    true,
                                    |this, _, cx| this.export_diagnostics_via_dialog(cx),
                                    cx,
                                )),
                        ),
                    )
                    .into_any_element()
            }
            SettingsTab::Diagnostics => div()
                .flex()
                .flex_col()
                .gap(px(12.0))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .text_size(px(12.0))
                                .text_color(p.text_secondary)
                                .child("Live in-process Rust backend telemetry (zero IPC)"),
                        )
                        .child(self.chip_button(
                            "diag-refresh",
                            "Refresh",
                            false,
                            |this, _, cx| this.refresh_telemetry(cx),
                            cx,
                        )),
                )
                .when_some(self.diagnostics.as_ref(), |col, d| {
                    col.child(
                        self.section_card("Search & SQLite Index", "Confined local index health")
                            .child(info_row("Phase", d.index.phase.clone(), &p))
                            .child(info_row(
                                "Indexed Files",
                                d.index.indexed_files.to_string(),
                                &p,
                            ))
                            .child(info_row(
                                "Indexed Chunks",
                                d.index.indexed_chunks.to_string(),
                                &p,
                            ))
                            .child(info_row(
                                "Vector Extension",
                                format!(
                                    "{} ({})",
                                    d.vector.backend.as_deref().unwrap_or("none"),
                                    if d.vector.available {
                                        d.vector.version.as_deref().unwrap_or("ready")
                                    } else {
                                        "unavailable"
                                    }
                                ),
                                &p,
                            )),
                    )
                    .child(
                        self.section_card(
                            "Gateway, MCP & Local Runtime",
                            "Supervised native services",
                        )
                        .child(info_row("AgentGateway", d.gateway.state.clone(), &p))
                        .child(info_row(
                            "MCP Tools",
                            format!(
                                "{} tools ({} allow / {} ask / {} deny)",
                                d.mcp.tools, d.mcp.allowed, d.mcp.ask, d.mcp.denied
                            ),
                            &p,
                        ))
                        .child(info_row("Local Runtime", d.runtime.state.clone(), &p))
                        .child(info_row(
                            "Hotkey",
                            if d.shortcut.registered {
                                d.shortcut
                                    .accelerator
                                    .clone()
                                    .unwrap_or_else(|| "Registered".into())
                            } else {
                                "Unregistered".into()
                            },
                            &p,
                        )),
                    )
                })
                .into_any_element(),
        }
    }
}

fn info_row(label: &'static str, val: impl Into<SharedString>, p: &LumenPalette) -> Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .text_size(px(11.5))
        .child(div().text_color(p.text_muted).child(label))
        .child(
            div()
                .font_family("Cascadia Code")
                .text_color(p.text_primary)
                .child(val.into()),
        )
}

impl Render for SettingsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.palette;

        div()
            .size_full()
            .flex()
            .flex_col()
            // Top bar
            .child(
                div()
                    .h(px(54.0))
                    .flex_none()
                    .px(px(16.0))
                    .border_b_1()
                    .border_color(p.border_subtle)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.0))
                            .child(
                                div()
                                    .id("settings-back-btn")
                                    .px(px(9.0))
                                    .py(px(5.0))
                                    .rounded(px(7.0))
                                    .bg(p.kbd_bg)
                                    .border_1()
                                    .border_color(p.kbd_border)
                                    .flex()
                                    .items_center()
                                    .gap(px(5.0))
                                    .cursor_pointer()
                                    .on_click(cx.listener(|_, _, _, cx| {
                                        cx.emit(SettingsEvent::Close);
                                    }))
                                    .child(
                                        Icon::new(IconName::X)
                                            .size(px(12.0))
                                            .text_color(p.text_secondary),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(11.5))
                                            .text_color(p.text_secondary)
                                            .child("Launcher"),
                                    )
                                    .child(kbd_pill("Esc", &p)),
                            )
                            .child(
                                div()
                                    .text_size(px(14.5))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(p.text_primary)
                                    .child("Lumen Settings"),
                            ),
                    )
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(p.text_muted)
                            .child(self.active_tab.description()),
                    ),
            )
            // Sidebar + content body
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child(
                        // Sidebar
                        div()
                            .id("settings-sidebar")
                            .w(px(206.0))
                            .flex_none()
                            .h_full()
                            .p(px(10.0))
                            .border_r_1()
                            .border_color(p.border_subtle)
                            .overflow_y_scroll()
                            .flex()
                            .flex_col()
                            .gap(px(3.0))
                            .children(SettingsTab::ALL.iter().copied().map(|tab| {
                                let active = tab == self.active_tab;
                                div()
                                    .id(SharedString::from(format!("stab-{}", tab.label())))
                                    .px(px(10.0))
                                    .py(px(7.0))
                                    .rounded(px(8.0))
                                    .flex()
                                    .items_center()
                                    .gap(px(9.0))
                                    .cursor_pointer()
                                    .when(active, |el| {
                                        el.bg(p.row_selected_bg)
                                            .border_1()
                                            .border_color(p.row_selected_border)
                                    })
                                    .when(!active, |el| {
                                        el.border_1()
                                            .border_color(transparent_black())
                                            .hover(move |s| s.bg(p.row_hover))
                                    })
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.open_tab(tab, cx);
                                    }))
                                    .child(
                                        Icon::new(tab.icon()).size(px(14.0)).text_color(
                                            if active { p.accent } else { p.text_muted },
                                        ),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(12.5))
                                            .font_weight(if active {
                                                FontWeight::SEMIBOLD
                                            } else {
                                                FontWeight::MEDIUM
                                            })
                                            .text_color(if active {
                                                p.text_primary
                                            } else {
                                                p.text_secondary
                                            })
                                            .child(tab.label()),
                                    )
                            })),
                    )
                    .child(
                        // Active settings tab content
                        div()
                            .id("settings-content-scroll")
                            .flex_1()
                            .h_full()
                            .overflow_y_scroll()
                            .p(px(18.0))
                            .child(self.render_active_page(cx)),
                    ),
            )
    }
}
