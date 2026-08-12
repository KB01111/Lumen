mod computer_use;
mod consent;
mod gateway;
mod privacy;
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
                let _ = window::show_from_app(
                    app,
                    window::WindowMode::Collapsed,
                    window::WindowStateSource::Shortcut,
                );
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = window::show_from_app(
                app,
                window::WindowMode::Collapsed,
                window::WindowStateSource::SecondInstance,
            );
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
            let settings_path = data_directory.join("lumen.settings.json");
            app.manage(consent::PersistedConsent::new(settings_path.clone()));
            app.manage(window::RuntimePreferences::load(&settings_path));
            app.manage(privacy::PrivacyRuntime::load(&settings_path));
            let history_enabled = privacy::load_history_enabled(&settings_path);
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
            let packaged_computer_use = app.path().resource_dir()?.join("lumen-computer-use.exe");
            let staged_computer_use = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/lumen-computer-use-x86_64-pc-windows-msvc.exe");
            let source_computer_use = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../workers/computer-use-preview/worker.py");
            app.manage(computer_use::ComputerUseSupervisor::detect(
                packaged_computer_use,
                staged_computer_use,
                source_computer_use,
            ));
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
            let packaged_vector = app.path().resource_dir()?.join("vector.dll");
            let development_vector =
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
            let vector_extension = if packaged_vector.is_file() {
                packaged_vector
            } else {
                development_vector
            };
            app.manage(search::IndexRuntime::open(
                &data_directory.join("lumen-index.sqlite3"),
                &vector_extension,
                history_enabled,
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
            search::indexing::set_history_enabled,
            search::indexing::clear_search_history,
            search::indexing::get_search_history_status,
            search::indexing::get_native_diagnostics,
            privacy::set_previews_enabled,
            privacy::export_diagnostics,
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
            computer_use::computer_use_health,
            computer_use::start_computer_use,
            computer_use::respond_computer_use_approval,
            computer_use::cancel_computer_use,
            window::show_lumen_window,
            window::hide_lumen_window,
            window::focus_lumen_input,
            window::set_lumen_shortcut,
            window::set_monitor_behavior,
            window::set_close_behavior,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let preferences = window.state::<window::RuntimePreferences>();
                match window::close_action(preferences.close_behavior()) {
                    window::CloseAction::Hide => {
                        api.prevent_close();
                        if window.hide().is_ok() {
                            let _ = window::emit_hidden_from_app(
                                window.app_handle(),
                                window::WindowStateSource::Close,
                            );
                        }
                    }
                    window::CloseAction::Exit => window.app_handle().exit(0),
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
