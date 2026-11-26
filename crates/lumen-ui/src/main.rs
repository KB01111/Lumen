//! Lumen — Native Windows 11 Spotlight launcher powered by GPUI (`gpui-kit` + `gpui-fast`)
//! wired directly in-process to `lumen-core`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod model;
mod platform;
mod theme;
mod views;

use std::sync::Arc;

use gpui_kit::*;
use lumen_core::{LumenPaths, LumenRuntime};

use crate::app::LauncherRoot;

fn main() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    // Multi-threaded Tokio runtime dedicated to Lumen's async search, indexing, AI answers,
    // AgentGateway, and Computer Use background services.
    let tokio_rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("lumen-backend")
        .build()
        .expect("failed to initialize Lumen Tokio runtime");
    let tokio_handle = tokio_rt.handle().clone();

    let paths = LumenPaths::discover();
    let lumen_runtime = LumenRuntime::initialize(paths, &tokio_handle)
        .expect("failed to initialize Lumen core services");
    let shutdown_runtime = Arc::clone(&lumen_runtime);

    // Boot GPUI Fast through gpui-kit with full bundled Lucide icon assets.
    gpui_kit::application()
        .with_assets(gpui_kit::assets::AllAssets)
        .run(move |cx| {
            gpui_kit::init(cx);

            let initial_appearance = lumen_runtime.settings.snapshot().appearance.transparency;
            let window_background = match initial_appearance {
                lumen_core::settings::TransparencySetting::Native => {
                    WindowBackgroundAppearance::Blurred
                }
                lumen_core::settings::TransparencySetting::Reduced => {
                    WindowBackgroundAppearance::MicaBackdrop
                }
                lumen_core::settings::TransparencySetting::Disabled => {
                    WindowBackgroundAppearance::Opaque
                }
            };

            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(720.0), px(64.0)),
                    cx,
                ))),
                titlebar: None,
                focus: true,
                show: true,
                kind: WindowKind::PopUp,
                is_movable: false,
                is_resizable: false,
                window_background,
                app_id: Some("com.bridgehammer.lumen".to_owned()),
                ..Default::default()
            };

            let runtime = Arc::clone(&lumen_runtime);
            let handle = tokio_handle.clone();
            gpui_kit::open_window(options, cx, move |window, cx| {
                cx.new(|cx| LauncherRoot::new(runtime, handle, window, cx))
            })
            .expect("failed to open Lumen Spotlight window");
        });

    shutdown_runtime.shutdown();
    drop(tokio_rt);
}
