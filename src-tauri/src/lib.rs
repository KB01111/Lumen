mod gateway;
mod search;
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
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let development_sidecar = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/agentgateway-x86_64-pc-windows-msvc.exe");
            let packaged_sidecar = app.path().resource_dir()?.join("agentgateway.exe");
            let sidecar = if packaged_sidecar.is_file() {
                packaged_sidecar
            } else {
                development_sidecar
            };
            let gateway =
                gateway::GatewaySupervisor::new(sidecar, &data_directory.join("runtime"))?;
            let _ = gateway.start();
            app.manage(gateway);
            app.manage(gateway::answer::AnswerRuntime::default());
            app.manage(gateway::LocalRuntimeSupervisor::detect());
            let development_worker = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/lumen-enrichment-x86_64-pc-windows-msvc.exe");
            let packaged_worker = app.path().resource_dir()?.join("lumen-enrichment.exe");
            let worker_binary = if packaged_worker.is_file() {
                packaged_worker
            } else {
                development_worker
            };
            let development_engine = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/lumen-rivet-engine-x86_64-pc-windows-msvc.exe");
            let packaged_engine = app.path().resource_dir()?.join("lumen-rivet-engine.exe");
            let engine_binary = if packaged_engine.is_file() {
                packaged_engine
            } else {
                development_engine
            };
            let enrichment = gateway::EnrichmentSupervisor::new(
                worker_binary,
                engine_binary,
                data_directory.join("enrichment"),
            )?;
            let _ = enrichment.start();
            app.manage(enrichment);
            app.manage(search::IndexRuntime::open(
                &data_directory.join("lumen-index.sqlite3"),
            )?);
            app.manage(window::ShortcutRegistration(Mutex::new(
                "Alt+Space".to_owned(),
            )));

            if let Some(main_window) = app.get_webview_window("main") {
                window::apply_native_material(&main_window)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search::list_files,
            search::search_filenames,
            search::get_file_metadata,
            search::get_basic_preview,
            search::open_file,
            search::open_containing_folder,
            search::indexing::get_index_status,
            search::indexing::synchronize_index_roots,
            search::indexing::search_indexed,
            search::indexing::delete_index_data,
            gateway::answer::start_answer,
            gateway::answer::cancel_answer,
            gateway::supervisor::gateway_health,
            gateway::supervisor::restart_gateway,
            gateway::credentials::set_provider_credential,
            gateway::credentials::delete_provider_credential,
            gateway::credentials::provider_credential_status,
            gateway::enrichment::enrichment_health,
            gateway::enrichment::enrichment_queue_status,
            gateway::enrichment::pause_enrichment,
            gateway::enrichment::resume_enrichment,
            gateway::enrichment::restart_enrichment,
            gateway::local_runtime::local_runtime_health,
            gateway::local_runtime::set_local_runtime_mode,
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
