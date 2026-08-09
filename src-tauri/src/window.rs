use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow,
    window::{Color, Effect, EffectsBuilder},
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowMode {
    Collapsed,
    Expanded,
    Onboarding,
    Settings,
    Gallery,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WindowGeometry {
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub max_width: f64,
    pub min_height: f64,
    pub max_height: f64,
    pub resizable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LauncherPosition {
    x: i32,
    y: i32,
}

pub struct ShortcutRegistration(pub Mutex<String>);

pub const fn geometry_for(mode: WindowMode) -> WindowGeometry {
    match mode {
        WindowMode::Collapsed => WindowGeometry {
            width: 700.0,
            height: 66.0,
            min_width: 620.0,
            max_width: 760.0,
            min_height: 66.0,
            max_height: 66.0,
            resizable: false,
        },
        WindowMode::Expanded => WindowGeometry {
            width: 800.0,
            height: 540.0,
            min_width: 720.0,
            max_width: 960.0,
            min_height: 320.0,
            max_height: 600.0,
            resizable: true,
        },
        WindowMode::Onboarding => WindowGeometry {
            width: 800.0,
            height: 600.0,
            min_width: 720.0,
            max_width: 960.0,
            min_height: 560.0,
            max_height: 720.0,
            resizable: true,
        },
        WindowMode::Settings => WindowGeometry {
            width: 880.0,
            height: 600.0,
            min_width: 760.0,
            max_width: 1080.0,
            min_height: 520.0,
            max_height: 760.0,
            resizable: true,
        },
        WindowMode::Gallery => WindowGeometry {
            width: 1120.0,
            height: 760.0,
            min_width: 880.0,
            max_width: 1440.0,
            min_height: 640.0,
            max_height: 960.0,
            resizable: true,
        },
    }
}

pub fn effect_fallback_order() -> [Effect; 3] {
    [Effect::Acrylic, Effect::Mica, Effect::Blur]
}

fn launcher_position(
    work_area: WorkArea,
    logical_width: f64,
    logical_height: f64,
    scale_factor: f64,
) -> LauncherPosition {
    let physical_width = (logical_width * scale_factor).round() as i32;
    let physical_height = (logical_height * scale_factor).round() as i32;
    let horizontal_space = (work_area.width as i32 - physical_width).max(0);
    let vertical_space = (work_area.height as i32 - physical_height).max(0);

    LauncherPosition {
        x: work_area.x + horizontal_space / 2,
        y: work_area.y + (f64::from(vertical_space) * 0.18).round() as i32,
    }
}

fn apply_geometry(window: &WebviewWindow, geometry: WindowGeometry) -> Result<(), String> {
    window
        .set_resizable(true)
        .map_err(|error| error.to_string())?;
    window
        .set_min_size(None::<LogicalSize<f64>>)
        .map_err(|error| error.to_string())?;
    window
        .set_max_size(None::<LogicalSize<f64>>)
        .map_err(|error| error.to_string())?;
    window
        .set_size(LogicalSize::new(geometry.width, geometry.height))
        .map_err(|error| error.to_string())?;
    window
        .set_min_size(Some(LogicalSize::new(
            geometry.min_width,
            geometry.min_height,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_max_size(Some(LogicalSize::new(
            geometry.max_width,
            geometry.max_height,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_resizable(geometry.resizable)
        .map_err(|error| error.to_string())
}

fn place_on_active_monitor(window: &WebviewWindow, geometry: WindowGeometry) -> Result<(), String> {
    let cursor = window
        .cursor_position()
        .map_err(|error| error.to_string())?;
    let monitor = window
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|error| error.to_string())?
        .or(window
            .current_monitor()
            .map_err(|error| error.to_string())?);

    let Some(monitor) = monitor else {
        return Ok(());
    };

    let work_area = monitor.work_area();
    let position = launcher_position(
        WorkArea {
            x: work_area.position.x,
            y: work_area.position.y,
            width: work_area.size.width,
            height: work_area.size.height,
        },
        geometry.width,
        geometry.height,
        monitor.scale_factor(),
    );

    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())
}

pub fn apply_native_material(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_effects(
            EffectsBuilder::new()
                .effects(effect_fallback_order())
                .color(Color(10, 18, 27, 196))
                .build(),
        )
        .map_err(|error| error.to_string())
}

pub fn show_from_app(app: &AppHandle, mode: WindowMode) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The Lumen window is unavailable.".to_owned())?;
    show_window(&window, mode)
}

fn show_window(window: &WebviewWindow, mode: WindowMode) -> Result<(), String> {
    let geometry = geometry_for(mode);
    apply_geometry(window, geometry)?;
    place_on_active_monitor(window, geometry)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .emit("lumen://focus-input", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_lumen_window(window: WebviewWindow, mode: WindowMode) -> Result<(), String> {
    show_window(&window, mode)
}

#[tauri::command]
pub fn hide_lumen_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_lumen_input(window: WebviewWindow) -> Result<(), String> {
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .emit("lumen://focus-input", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_lumen_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let registered = app.state::<ShortcutRegistration>();
    let mut current = registered
        .0
        .lock()
        .map_err(|_| "Shortcut registration state is unavailable.".to_owned())?;

    if *current == accelerator {
        return Ok(());
    }

    let shortcuts = app.global_shortcut();
    shortcuts
        .register(accelerator.as_str())
        .map_err(|error| format!("Could not register {accelerator}: {error}"))?;

    if let Err(error) = shortcuts.unregister(current.as_str()) {
        let _ = shortcuts.unregister(accelerator.as_str());
        return Err(format!("Could not replace the current shortcut: {error}"));
    }

    *current = accelerator;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_geometry_table_matches_each_window_mode_contract() {
        let expected = [
            (
                WindowMode::Collapsed,
                WindowGeometry {
                    width: 700.0,
                    height: 66.0,
                    min_width: 620.0,
                    max_width: 760.0,
                    min_height: 66.0,
                    max_height: 66.0,
                    resizable: false,
                },
            ),
            (
                WindowMode::Expanded,
                WindowGeometry {
                    width: 800.0,
                    height: 540.0,
                    min_width: 720.0,
                    max_width: 960.0,
                    min_height: 320.0,
                    max_height: 600.0,
                    resizable: true,
                },
            ),
            (
                WindowMode::Onboarding,
                WindowGeometry {
                    width: 800.0,
                    height: 600.0,
                    min_width: 720.0,
                    max_width: 960.0,
                    min_height: 560.0,
                    max_height: 720.0,
                    resizable: true,
                },
            ),
            (
                WindowMode::Settings,
                WindowGeometry {
                    width: 880.0,
                    height: 600.0,
                    min_width: 760.0,
                    max_width: 1080.0,
                    min_height: 520.0,
                    max_height: 760.0,
                    resizable: true,
                },
            ),
            (
                WindowMode::Gallery,
                WindowGeometry {
                    width: 1120.0,
                    height: 760.0,
                    min_width: 880.0,
                    max_width: 1440.0,
                    min_height: 640.0,
                    max_height: 960.0,
                    resizable: true,
                },
            ),
        ];

        for (mode, geometry) in expected {
            assert_eq!(geometry_for(mode), geometry, "{mode:?}");
        }
    }

    #[test]
    fn launcher_position_respects_scale_and_upper_fifth() {
        let position = launcher_position(
            WorkArea {
                x: 1920,
                y: 0,
                width: 2560,
                height: 1400,
            },
            700.0,
            66.0,
            1.5,
        );

        assert_eq!(position, LauncherPosition { x: 2675, y: 234 });
    }

    #[test]
    fn native_material_uses_documented_fallback_order() {
        assert_eq!(
            effect_fallback_order(),
            [Effect::Acrylic, Effect::Mica, Effect::Blur]
        );
    }
}
