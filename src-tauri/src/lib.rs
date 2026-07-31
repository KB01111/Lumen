mod window;

use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let global_shortcut = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut("Alt+Space")
        .expect("Alt+Space must be a valid shortcut")
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = window::show_from_app(app, window::WindowMode::Collapsed);
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = window::show_from_app(app, window::WindowMode::Collapsed);
        }))
        .plugin(global_shortcut)
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(window::ShortcutRegistration(Mutex::new(
                "Alt+Space".to_owned(),
            )));

            if let Some(main_window) = app.get_webview_window("main") {
                window::apply_native_material(&main_window)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::show_lumen_window,
            window::hide_lumen_window,
            window::focus_lumen_input,
            window::set_lumen_shortcut,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
