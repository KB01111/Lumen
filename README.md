# Lumen

Lumen is a keyboard-first Windows 11 search and browser-agent experience built with Tauri 2, React 19, TypeScript, StyleX, React Aria Components, and Motion. It combines confined local-file search, local/cloud answers behind AgentGateway, and an explicitly consented Gemini Computer Use mode for browser-only tasks.

![Lumen phase-one visual state gallery](artifacts/screenshots/contact-sheet.png)

## Product

- Persistent borderless native window with Acrylic, Mica, Blur, and opaque fallbacks.
- Global `Alt+Space` invocation, single-instance redirection, active-monitor placement, and hide-on-close lifecycle.
- Collapsed launcher and expanded search workspace with scopes, filters, stable selection, action bar, virtualized 10,000-result handling, and responsive preview.
- Keyboard-complete search, details, open, containing-folder, settings, onboarding, and dialog flows.
- Eight-scene onboarding and eleven settings pages covering appearance, roots, search, local AI, AgentGateway, Computer Use, activity, read-only Session Relief, privacy, and diagnostics.
- Light, dark, opaque, reduced-effects, reduced-motion, and forced-colors/high-contrast presentation.
- Immediate confined filename search plus a durable SQLite content index with bounded text, Office, and PDF extraction. OCR and audio transcription require both provider consent and per-root opt-in.
- Local/cloud answers route through checksum-pinned AgentGateway lanes; local readiness requires a Lumen-owned Lemonade process, and cloud fallback requires persisted consent plus a Credential Manager secret.
- A supervised, build-pinned Gemini Computer Use sidecar that controls a fresh Microsoft Edge context, pauses model-requested sensitive actions for approval, and stops with Lumen.
- On-demand Session Relief reports current Windows resource pressure and process families without terminating processes or changing files; copied summaries omit names, PIDs, trees, and finding evidence.
- Development-only 46-scenario visual gallery, screenshot set, contact sheet, interaction recordings, accessibility/DPI suites, and a strict high-refresh profiler.

The normal Tauri application always uses the real local-file adapter. Deterministic memory data is available only to development tests, recordings, and gallery routes.

## Requirements

- Windows 11 with the Microsoft Edge WebView2 Runtime.
- Bun 1.3 or newer.
- Rust stable with the MSVC target.
- Visual Studio 2022 or Build Tools with Desktop development with C++ and the Windows SDK.
- Python 3.11 (directly or through `uv`) when staging the Computer Use sidecar from source; installed applications include the compiled worker.

Install dependencies and start the native development app:

```powershell
bun install
bun run stage:sidecars
bun run tauri dev
```

The first run asks for one development search root. Press `Alt+Space` from another application to reopen the warm launcher.

## Verification and evidence

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run profile
bun run capture:gallery
bun run record:interactions
bun run tauri build
```

Rust validation runs from `src-tauri` inside a Visual Studio developer shell:

```powershell
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

Generated evidence is checked in under `artifacts`:

- `artifacts/screenshots/contact-sheet.png` and `manifest.json`: all 46 deterministic states.
- `artifacts/recordings/manifest.json`: four silent WebM interaction studies.
- `artifacts/performance/profile-summary.json`: machine-readable budgets, measurements, burst guards, browser version, and source SHA.
- `artifacts/performance/interaction-trace.zip`: Playwright trace for the measured interaction run.

The MSI and NSIS bundles are generated under `src-tauri/target/release/bundle`. Build outputs are not committed.

## Architecture

- `src/app`: composition, startup, route boundaries, and providers.
- `src/design-system`: semantic tokens, themes, material, icons, type, primitives, and motion.
- `src/features`: launcher, results, preview, onboarding, settings, activity, gateway, local-AI, Session Relief, diagnostics, and gallery surfaces.
- `src/services`: search, answer, Computer Use, Session Relief, and settings contracts plus native, browser, deterministic, and unavailable adapters.
- `src/platform`: Tauri/window abstractions.
- `src-tauri/src`: native window lifecycle, confined search/indexing, AgentGateway and enrichment supervision, Computer Use, local-runtime ownership, and read-only Session Relief collection.
- `tests/e2e`: keyboard, accessibility, DPI, visual, responsive, and performance acceptance.
- `docs/architecture`: design, motion, shell, management, and search-service boundaries.
- `docs/reports`: accessibility, DPI, high-refresh, and phase-one validation evidence.

Start with [the native AI and enrichment architecture](docs/architecture/native-ai-and-enrichment.md), [the Computer Use boundary](docs/architecture/computer-use.md), [the search-service boundary](docs/architecture/search-service.md), and [native shell architecture](docs/architecture/native-shell.md).

## Security and scope boundary

Local search commands canonicalize every root and requested path. Paths outside a selected root are rejected, symlinks are not followed, generated dependency/build directories are skipped, text previews are capped at 64 KiB, image previews at 4 MiB, and binary text is not returned to the webview. The Tauri capability does not grant shell execute or spawn permissions.

The webview cannot launch arbitrary processes, contact Gemini directly, or read provider credentials. Computer Use accepts only a typed task request, approval responses, and cancellation through Rust IPC. Release builds embed the staged worker's SHA-256; Rust rehashes the bounded binary before health reporting and again before reading the Gemini credential or spawning it. The task, visited page URLs, and browser screenshots leave the device only after explicit consent; the key is read from Windows Credential Manager and passed directly to the fixed worker process.

AgentGateway binds three dynamically selected loopback ports and keeps provider keys out of generated configuration and React. SQLite owns enrichment leases, retries, and atomic searchable completion; the Rivet worker is optional coordination and is reported separately when unavailable. Semantic/vector search, reranking, MCP tools, and generic process execution remain intentionally unavailable.
