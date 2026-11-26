//! Platform windowing, DWM backdrop, global hotkey, and system tray integration.

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "windows")]
pub use windows::{
    HotkeyController, TrayAction, TrayController, apply_spotlight_window_style, hide_window,
    position_and_size_window, show_and_focus_window,
};
