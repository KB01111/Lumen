//! Native Windows 11 Spotlight shell integration:
//! - Frameless tool window (`WS_EX_TOOLWINDOW | WS_EX_TOPMOST`, hidden from taskbar & Alt-Tab)
//! - Windows 11 DWM Acrylic (`DWMSBT_TRANSIENTWINDOW`) / Mica (`DWMSBT_MAINWINDOW`) backdrop,
//!   rounded corners (`DWMWCP_ROUND`), and immersive dark-mode frame tint
//! - Multi-monitor DPI-aware upper-third placement anchored by expanded height
//! - Global hotkey (`global-hotkey`, default `Alt + Space`) and system tray (`tray-icon`)

use std::ffi::c_void;

use global_hotkey::{
    GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState,
    hotkey::{Code, HotKey, Modifiers},
};
use gpui_kit::*;
use lumen_core::settings::{
    AppearanceSettings, MonitorBehavior, ShortcutStatus, TransparencySetting, WorkArea,
    launcher_position,
};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tray_icon::{
    Icon as TrayIconImage, MouseButton as TrayMouseButton, MouseButtonState, TrayIcon,
    TrayIconBuilder, TrayIconEvent,
    menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem},
};
use windows::Win32::{
    Foundation::{HWND, POINT},
    Graphics::{
        Dwm::{
            DWM_SYSTEMBACKDROP_TYPE, DWMSBT_MAINWINDOW, DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW,
            DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_USE_IMMERSIVE_DARK_MODE,
            DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DwmSetWindowAttribute,
        },
        Gdi::{
            GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY, MONITORINFO,
            MonitorFromPoint,
        },
    },
    System::Threading::{AttachThreadInput, GetCurrentThreadId},
    UI::{
        HiDpi::GetDpiForWindow,
        WindowsAndMessaging::{
            GWL_EXSTYLE, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW,
            GetWindowThreadProcessId, HWND_TOPMOST, SW_HIDE, SW_SHOW, SWP_FRAMECHANGED,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetForegroundWindow, SetWindowLongPtrW,
            SetWindowPos, ShowWindow, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
        },
    },
};

fn extract_hwnd(window: &Window) -> Option<HWND> {
    let handle = HasWindowHandle::window_handle(window).ok()?;
    match handle.as_raw() {
        RawWindowHandle::Win32(win32) => Some(HWND(win32.hwnd.get() as *mut c_void)),
        _ => None,
    }
}

/// Applies Lumen's Spotlight Win32 extended styles and Windows 11 DWM backdrop + rounded corners.
pub fn apply_spotlight_window_style(
    window: &mut Window,
    is_dark: bool,
    appearance: &AppearanceSettings,
) {
    // Sync GPUI Fast's own background appearance first so its compositor matches our DWM call.
    let gpui_bg = match appearance.transparency {
        TransparencySetting::Native => WindowBackgroundAppearance::Blurred,
        TransparencySetting::Reduced => WindowBackgroundAppearance::MicaBackdrop,
        TransparencySetting::Disabled => WindowBackgroundAppearance::Opaque,
    };
    window.set_background_appearance(gpui_bg);

    let Some(hwnd) = extract_hwnd(window) else {
        return;
    };

    unsafe {
        // Hide from taskbar & Alt-Tab (`WS_EX_TOOLWINDOW`), keep floating (`WS_EX_TOPMOST`).
        let current_ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let desired_ex = (current_ex | (WS_EX_TOOLWINDOW.0 as isize) | (WS_EX_TOPMOST.0 as isize))
            & !(WS_EX_APPWINDOW.0 as isize);
        if desired_ex != current_ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, desired_ex);
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }

        // Rounded native corners on Windows 11.
        let corner_pref = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_pref as *const _ as *const c_void,
            std::mem::size_of_val(&corner_pref) as u32,
        );

        // Match DWM dark/light acrylic tint to Lumen's resolved theme.
        let dark_mode: u32 = u32::from(is_dark);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &dark_mode as *const _ as *const c_void,
            std::mem::size_of_val(&dark_mode) as u32,
        );

        // Apply Windows 11 System Backdrop explicitly (Acrylic for Native, Mica for Reduced, None for Opaque).
        let backdrop: DWM_SYSTEMBACKDROP_TYPE = match appearance.transparency {
            TransparencySetting::Native => DWMSBT_TRANSIENTWINDOW,
            TransparencySetting::Reduced => DWMSBT_MAINWINDOW,
            TransparencySetting::Disabled => DWMSBT_NONE,
        };
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop as *const _ as *const c_void,
            std::mem::size_of_val(&backdrop) as u32,
        );
    }
}

/// Computes the target monitor work area (cursor monitor or primary monitor).
fn resolve_work_area(behavior: MonitorBehavior) -> WorkArea {
    unsafe {
        let monitor = match behavior {
            MonitorBehavior::Active => {
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST)
            }
            MonitorBehavior::Primary => {
                MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY)
            }
        };
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            let r = info.rcWork;
            return WorkArea {
                x: r.left,
                y: r.top,
                width: (r.right - r.left).max(640) as u32,
                height: (r.bottom - r.top).max(480) as u32,
            };
        }
    }
    WorkArea {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    }
}

/// Places the Spotlight window in the upper-third horizontal center of the target monitor,
/// anchored by `reference_height` so expanding/collapsing grows downward without shifting the search bar.
pub fn position_and_size_window(
    window: &mut Window,
    logical_width: f32,
    logical_height: f32,
    reference_logical_height: f32,
    behavior: MonitorBehavior,
) {
    let Some(hwnd) = extract_hwnd(window) else {
        window.resize(size(px(logical_width), px(logical_height)));
        return;
    };

    unsafe {
        let dpi = GetDpiForWindow(hwnd);
        let scale = if dpi > 0 {
            f64::from(dpi) / 96.0
        } else {
            f64::from(window.scale_factor())
        };
        let work_area = resolve_work_area(behavior);
        let pos = launcher_position(
            work_area,
            f64::from(logical_width),
            f64::from(reference_logical_height),
            scale,
        );
        let phys_w = (f64::from(logical_width) * scale).round() as i32;
        let phys_h = (f64::from(logical_height) * scale).round() as i32;
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            pos.x,
            pos.y,
            phys_w,
            phys_h,
            SWP_NOACTIVATE,
        );
    }
    window.resize(size(px(logical_width), px(logical_height)));
}

/// Shows the launcher window and brings keyboard focus cleanly to it even when invoked from another app.
pub fn show_and_focus_window(window: &mut Window) {
    if let Some(hwnd) = extract_hwnd(window) {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOW);
            let fg = GetForegroundWindow();
            let current_tid = GetCurrentThreadId();
            let fg_tid = if !fg.0.is_null() {
                GetWindowThreadProcessId(fg, None)
            } else {
                0
            };
            let attached = fg_tid != 0
                && fg_tid != current_tid
                && AttachThreadInput(fg_tid, current_tid, true).as_bool();
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE,
            );
            let _ = SetForegroundWindow(hwnd);
            if attached {
                let _ = AttachThreadInput(fg_tid, current_tid, false);
            }
        }
    }
    window.activate_window();
}

/// Hides the launcher window immediately without destroying GPUI state.
pub fn hide_window(window: &mut Window) {
    if let Some(hwnd) = extract_hwnd(window) {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
    }
}

/// Global hotkey manager supporting dynamic rebinding (default `Alt + Space`).
pub struct HotkeyController {
    manager: Option<GlobalHotKeyManager>,
    active: Option<HotKey>,
    status: ShortcutStatus,
}

impl HotkeyController {
    pub fn new(shortcut: &str) -> Self {
        let manager = GlobalHotKeyManager::new().ok();
        let mut controller = Self {
            manager,
            active: None,
            status: ShortcutStatus::default(),
        };
        controller.register(shortcut);
        controller
    }

    pub fn status(&self) -> ShortcutStatus {
        self.status.clone()
    }

    pub fn register(&mut self, shortcut: &str) -> ShortcutStatus {
        let Some(manager) = self.manager.as_ref() else {
            self.status = ShortcutStatus {
                registered: false,
                accelerator: Some(shortcut.to_owned()),
                error_code: Some("manager-unavailable".to_owned()),
            };
            return self.status.clone();
        };

        if let Some(prev) = self.active.take() {
            let _ = manager.unregister(prev);
        }

        let Some(hotkey) = parse_hotkey(shortcut) else {
            self.status = ShortcutStatus {
                registered: false,
                accelerator: Some(shortcut.to_owned()),
                error_code: Some("invalid-shortcut".to_owned()),
            };
            return self.status.clone();
        };

        match manager.register(hotkey) {
            Ok(()) => {
                self.active = Some(hotkey);
                self.status = ShortcutStatus {
                    registered: true,
                    accelerator: Some(shortcut.to_owned()),
                    error_code: None,
                };
            }
            Err(_) => {
                self.status = ShortcutStatus {
                    registered: false,
                    accelerator: Some(shortcut.to_owned()),
                    error_code: Some("shortcut-conflict".to_owned()),
                };
            }
        }
        self.status.clone()
    }

    /// Returns `true` if the registered hotkey was pressed since the last poll.
    pub fn poll_triggered(&self) -> bool {
        let Some(active_id) = self.active.map(|hk| hk.id()) else {
            return false;
        };
        let mut triggered = false;
        let rx = GlobalHotKeyEvent::receiver();
        while let Ok(event) = rx.try_recv() {
            if event.id == active_id && event.state == HotKeyState::Pressed {
                triggered = true;
            }
        }
        triggered
    }
}

fn parse_hotkey(spec: &str) -> Option<HotKey> {
    let mut mods = Modifiers::empty();
    let mut key_code: Option<Code> = None;

    for raw in spec.split('+') {
        let token = raw.trim().to_ascii_lowercase();
        match token.as_str() {
            "alt" | "option" => mods |= Modifiers::ALT,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "win" | "meta" | "cmd" => mods |= Modifiers::META,
            "space" => key_code = Some(Code::Space),
            "enter" | "return" => key_code = Some(Code::Enter),
            "tab" => key_code = Some(Code::Tab),
            "escape" | "esc" => key_code = Some(Code::Escape),
            "a" => key_code = Some(Code::KeyA),
            "b" => key_code = Some(Code::KeyB),
            "c" => key_code = Some(Code::KeyC),
            "d" => key_code = Some(Code::KeyD),
            "e" => key_code = Some(Code::KeyE),
            "f" => key_code = Some(Code::KeyF),
            "g" => key_code = Some(Code::KeyG),
            "h" => key_code = Some(Code::KeyH),
            "i" => key_code = Some(Code::KeyI),
            "j" => key_code = Some(Code::KeyJ),
            "k" => key_code = Some(Code::KeyK),
            "l" => key_code = Some(Code::KeyL),
            "m" => key_code = Some(Code::KeyM),
            "n" => key_code = Some(Code::KeyN),
            "o" => key_code = Some(Code::KeyO),
            "p" => key_code = Some(Code::KeyP),
            "q" => key_code = Some(Code::KeyQ),
            "r" => key_code = Some(Code::KeyR),
            "s" => key_code = Some(Code::KeyS),
            "t" => key_code = Some(Code::KeyT),
            "u" => key_code = Some(Code::KeyU),
            "v" => key_code = Some(Code::KeyV),
            "w" => key_code = Some(Code::KeyW),
            "x" => key_code = Some(Code::KeyX),
            "y" => key_code = Some(Code::KeyY),
            "z" => key_code = Some(Code::KeyZ),
            "f1" => key_code = Some(Code::F1),
            "f2" => key_code = Some(Code::F2),
            "f3" => key_code = Some(Code::F3),
            "f4" => key_code = Some(Code::F4),
            "f5" => key_code = Some(Code::F5),
            "f6" => key_code = Some(Code::F6),
            "f7" => key_code = Some(Code::F7),
            "f8" => key_code = Some(Code::F8),
            "f9" => key_code = Some(Code::F9),
            "f10" => key_code = Some(Code::F10),
            "f11" => key_code = Some(Code::F11),
            "f12" => key_code = Some(Code::F12),
            _ => {}
        }
    }

    let code = key_code?;
    let mods_opt = if mods.is_empty() { None } else { Some(mods) };
    Some(HotKey::new(mods_opt, code))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayAction {
    ToggleLauncher,
    OpenComputerUse,
    OpenSettings,
    Quit,
}

/// System tray icon and native context menu for background Lumen summoning.
pub struct TrayController {
    _tray: Option<TrayIcon>,
    id_show: MenuId,
    id_computer_use: MenuId,
    id_settings: MenuId,
    id_quit: MenuId,
}

impl TrayController {
    pub fn new() -> Self {
        let show_item = MenuItem::new("Toggle Lumen (Alt+Space)", true, None);
        let cu_item = MenuItem::new("Computer Use", true, None);
        let settings_item = MenuItem::new("Settings...", true, None);
        let quit_item = MenuItem::new("Quit Lumen", true, None);

        let id_show = show_item.id().clone();
        let id_computer_use = cu_item.id().clone();
        let id_settings = settings_item.id().clone();
        let id_quit = quit_item.id().clone();

        let menu = Menu::new();
        let _ = menu.append(&show_item);
        let _ = menu.append(&cu_item);
        let _ = menu.append(&settings_item);
        let _ = menu.append(&PredefinedMenuItem::separator());
        let _ = menu.append(&quit_item);

        let tray = build_lumen_tray_icon().ok().and_then(|icon| {
            TrayIconBuilder::new()
                .with_tooltip("Lumen — Press Alt+Space to search")
                .with_icon(icon)
                .with_menu(Box::new(menu))
                .build()
                .ok()
        });

        Self {
            _tray: tray,
            id_show,
            id_computer_use,
            id_settings,
            id_quit,
        }
    }

    pub fn poll_actions(&self) -> Vec<TrayAction> {
        let mut actions = Vec::new();
        let menu_rx = MenuEvent::receiver();
        while let Ok(event) = menu_rx.try_recv() {
            if event.id == self.id_show {
                actions.push(TrayAction::ToggleLauncher);
            } else if event.id == self.id_computer_use {
                actions.push(TrayAction::OpenComputerUse);
            } else if event.id == self.id_settings {
                actions.push(TrayAction::OpenSettings);
            } else if event.id == self.id_quit {
                actions.push(TrayAction::Quit);
            }
        }
        let icon_rx = TrayIconEvent::receiver();
        while let Ok(event) = icon_rx.try_recv() {
            if let TrayIconEvent::Click {
                button: TrayMouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                actions.push(TrayAction::ToggleLauncher);
            }
        }
        actions
    }
}

/// Generates a crisp 32x32 RGBA Lumen tray emblem (obsidian rounded badge + cyan halo ring + core).
fn build_lumen_tray_icon() -> Result<TrayIconImage, tray_icon::BadIcon> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let center = (SIZE as f32 - 1.0) * 0.5;

    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = ((y * SIZE + x) * 4) as usize;

            if dist <= 14.5 {
                // Dark obsidian circular disc
                let edge_alpha = (14.5 - dist).clamp(0.0, 1.0);
                let ring = (1.0 - ((dist - 9.2).abs() / 2.2)).clamp(0.0, 1.0);
                let core = (1.0 - (dist / 4.2)).clamp(0.0, 1.0);
                let glow = (ring * 0.95 + core * 0.85).clamp(0.0, 1.0);

                let r = (12.0 + glow * (126.0 - 12.0)).round() as u8;
                let g = (18.0 + glow * (212.0 - 18.0)).round() as u8;
                let b = (28.0 + glow * (255.0 - 28.0)).round() as u8;
                let a = (edge_alpha * 255.0).round() as u8;

                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = a;
            }
        }
    }

    TrayIconImage::from_rgba(rgba, SIZE, SIZE)
}
