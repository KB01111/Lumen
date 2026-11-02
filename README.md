# Lumen

Lumen is a keyboard-first Windows 11 search and Computer Use experience built with Tauri 2, React 19, TypeScript, Tailwind CSS v4, React Aria Components, and Motion. Its owned EinUI command palette uses OpenAI Apps SDK UI icons within Lumen's semantic glass theme. It combines confined local-file search, local/cloud answers behind AgentGateway, and explicitly consented Gemini/OpenAI planning for fresh Edge sessions and selected Windows windows.

![Lumen phase-one visual state gallery](artifacts/screenshots/contact-sheet.png)

## Phase-one product

- Persistent borderless native window with Acrylic, Mica, Blur, and opaque fallbacks.
- Global `Alt+Space` invocation, single-instance redirection, active-monitor placement, and hide-on-close lifecycle.
- Collapsed launcher and expanded search workspace with scopes, filters, stable selection, action bar, virtualized 10,000-result handling, and responsive preview.
- Keyboard-complete search, details, open, containing-folder, settings, onboarding, and dialog flows.
- Four-step onboarding and eleven settings pages covering appearance, roots, search, local AI, AgentGateway, provider profiles, Computer Use, activity, privacy, and diagnostics.
- Light, dark, opaque, reduced-effects, reduced-motion, and forced-colors/high-contrast presentation.
- Typed local-file search, metadata, preview, and opener commands confined to user-selected roots.
- A Rust Computer Use coordinator with semantic Edge/UI Automation routes, a credential-free local executor, scoped approvals, Fast/Background modes, and native Ctrl+Alt+Esc Stop.
- Availability-checked Windows AI and Agent Launcher controls, the public App Content Search catalogue integration (currently blocked pending Microsoft activation), and current-host Edge AI detection in existing settings pages.
- Development-only 86-scenario visual gallery, screenshot set, contact sheet, six interaction recordings, accessibility/DPI suites, and a strict high-refresh profiler.

The normal Tauri application always uses the real local-file adapter. Deterministic memory data is available only to development tests, recordings, and gallery routes.

The answer path is provider-neutral at the React boundary and routes typed requests through native services. The native AgentGateway provider/model registry and MCP services, plus local vector-backed semantic search and ranking, have implemented paths behind typed services. Their use still depends on host availability, local runtime/vector support, configuration and consent. `FutureProductionSearchService` remains an intentionally unavailable adapter stub; the normal Tauri application uses the real local-file/index adapter. These source paths do not establish broad live-provider or release acceptance.

## Production readiness

**Source-verified; not yet released.** The 2026-11-02 checkpoint verifies the implemented source and a
complete hosted `Verify and package` run on `907bc62`. That run passed typecheck, zero-warning lint, the
unit/component suite, both native-bridge and tooling checks, the production-profiling and full installed-Edge
suites, staging, every compiled/`--ignored` native gate (including compiled enrichment recovery), and an
unsigned NSIS + MSI build with a real MSI install/uninstall smoke. See the
[2026-11-02 status report](docs/reports/2026-11-02-current-status.md) and its recorded
[CI run](https://github.com/KB01111/Lumen/actions/runs/40633188800).

What is still required before a signed, broadly supported release:

- **Dependency security:** a local audit of the resolved graphs (see the
  [2026-11-02 status report](docs/reports/2026-11-02-current-status.md)) finds **40 npm advisories
  (12 high) across 13 transitive packages** and **39 Rust advisories across 15 crates**, materially more
  than the single `glib` alert previously recorded. The non-breaking direct fixes (`zod`, `vite`,
  `vitest`) are applied; the remainder need parent-dependency migrations (`rivetkit` 2.3.10 is pinned
  exactly; `@openai/apps-sdk-ui`, `jsdom`, `eslint`) or a Windows-host `cargo audit` pass. `glib` and
  the other GTK/`zbus`/`unic-*` crates are Linux/BSD-only and never compile in a Windows build. No
  advisory scan runs in CI today, and there is no committed Dependabot configuration.
- **Performance budgets:** the ordinary-query `reactCommit p95 < 3 ms` check and the strict-240 Hz target
  remain unmet (last measured 3.4–4.2 ms); the deterministic `?service=memory` workload does not measure the
  real native search path. Refresh the 86-state gallery, six recordings and performance evidence, which
  still carry a 2026-10-21 source SHA. See [performance evidence](docs/reports/2026-10-15-performance-continuation.md).
- **Native capacity and recovery:** complete the 50,000-file and traversal-cap workloads with actual
  completion/normal joins, cold indexing, warm queries, edit/delete propagation, cancellation, settled
  resources and restart. The 1,000-file run completed; the later 50,000-file run is **UNCLOSED**, not a pass.
  See [capacity evidence](docs/reports/2026-10-15-native-search-capacity.md).
- **Real Prime:** run pinned Docker/Prime execution, ACP delivery, isolation/resource limits, recovery,
  promotion/rejection, cancellation and rollback. Docker acceptance is explicitly deferred by the owner;
  deterministic fixtures are separate.
- **Live AI and providers:** exercise supported local/cloud routes and all five real tool clients,
  authentication/expiry, unavailable models, rate limits, fallback, Stop/Retry, restart and OAuth
  cancellation. See [provider acceptance](docs/reports/2026-10-15-provider-workflow-source-validation.md).
- **Installed Computer Use:** validate both providers through the installed app, approval denial/retry,
  target loss/reuse, Background restrictions, revoked consent, native emergency Stop and owned-process
  cleanup. See [Computer Use acceptance](docs/reports/2026-10-15-computer-use-acceptance.md).
- **Signed distribution:** provision the owner's existing Windows signing certificate, verify final signed
  payloads, and test clean installation, state-preserving upgrade, interrupted upgrade, uninstall and
  process cleanup. The successful unsigned build does not establish these outcomes. No tag or release has
  been published yet. See [release acceptance](docs/reports/signed-release-and-upgrade-acceptance.md).
- **Physical Windows accessibility/lifecycle:** complete Narrator, real IME, text scaling, high contrast,
  mixed-DPI monitors, sleep/resume and shortcut-conflict testing. See
  [physical acceptance](docs/reports/2026-10-15-windows-physical-acceptance.md).
- **Release evidence:** re-run the hosted `Verify and package` job for the exact release commit and reconcile
  every failed, ignored and pending gate. Local, browser, native, installed, live-provider and physical
  evidence remain separate.

The 26 ignored Rust entries are tracked individually in the
[ignored-test disposition](artifacts/verification/final-windows-gates/ignored-tests.json): 11 have direct
fixture evidence, 6 are child entrypoints exercised by parent tests, 2 are excluded because they read
ordinary credential slots, 3 await a desktop-privacy prerequisite, 2 are owner-deferred Docker cases, 1
awaits live-provider consent and the 50k-capacity case remains open.

Optional Windows capabilities retain explicit unavailable states until their prerequisites exist: App Content
Search needs Microsoft's feature ID, token and attestation; eligible hardware/runtime checks and signed
optional identity acceptance remain outstanding. Aion remains excluded pending a stable redistributable
contract. Automatic updating is optional follow-up; the first release uses signed installer updates.

## Requirements

- Windows 11 with the Microsoft Edge WebView2 Runtime.
- Bun 1.3 or newer.
- Rust stable with the MSVC target.
- Visual Studio 2022 or Build Tools with Desktop development with C++ and the Windows SDK.
- Python 3.11 (directly or through `uv`) when staging the Computer Use sidecar from source; installed applications include the compiled worker.
- .NET 10 SDK when building the Windows AI helper from source; staged helpers include their .NET runtime.

Install dependencies and start the native development app:

```powershell
bun install
bun run stage:sidecars
bun run tauri dev
```

The first run asks for one development search root. Press `Alt+Space` from another application to reopen the warm launcher.

## Windows integrations

Open Settings with `Ctrl+,`. Local AI contains the Windows/Edge enable switches, local answer engine, capability status, explicit preparation, engine test and native access-token setup. Privacy contains separate permissions for downloads, selected-preview text tools, OCR, image descriptions and local microphone dictation, plus language settings. Search controls local scopes, ranking, and the public App Content Search catalogue; that Windows API remains blocked until Microsoft activation is available. Local vector-backed semantic search is a separate optional path whose availability depends on the local runtime and vector support. AgentGateway controls installed Windows agents and Lumen's opt-in agent registration. Diagnostics reports the current host, runtime, provider and per-feature availability.

The launcher uses only ready, enabled engines. Automatic local answers prefer a ready Windows model and otherwise use the existing local runtime. An explicitly selected unsupported engine shows an error; cloud answers retain their separate consent. Preview tools run on an explicit press. Local dictation updates the draft and exposes Stop. Windows agent activations fill a browser-task draft that still needs the user's Run action and cloud consent.

The Windows helper is built and verified by `bun run stage:windows-ai`, also included in `stage:sidecars` and release builds. It targets the stable Windows App SDK/runtime 2.5.1. Preview features require their actual Windows runtime, hardware and access prerequisites. Identity-dependent APIs additionally need [the optional signed identity package](packaging/windows/README.md). Stable App Content Search remains blocked until Microsoft issues the feature-specific ID, token and attestation; the helper stops before search/index operations. Native Aion has no verified stable redistributable contract and is unavailable on every architecture; Aion and experimental AI speech artifacts are excluded. Edge APIs are detected in the executing browser/WebView2 realm; an installed Edge version does not establish their availability. Availability refresh never downloads models or starts microphone capture.

The App Content Search catalogue is limited to shipped public help/actions, but indexing and search stay unavailable pending Microsoft's separate activation contract. Personal file content stays in the confined SQLite index. Preview SDK provenance and distribution terms are recorded in [the helper notices](workers/windows-ai/THIRD_PARTY.md); local preview build evidence does not establish production redistribution rights.

The [Windows and Edge verification report](docs/reports/2026-10-04-windows-ai-integrations.md) records the implemented controls, current host availability, local quality gates and remaining checks on eligible preview hardware.

## Verification and evidence

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
bun run test:performance
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

- `artifacts/screenshots/contact-sheet.png` and `manifest.json`: all 86 deterministic states; this preserved gallery evidence is not production acceptance.
- `artifacts/recordings/manifest.json`: six silent WebM interaction studies.
- `artifacts/performance/profile-summary.json`: machine-readable budgets, measurements, burst guards, browser version, and source SHA.
- `artifacts/performance/interaction-trace.zip`: Playwright trace for the measured interaction run.

The 86-state browser gallery and six recordings are deterministic browser artifacts, not native or release
acceptance; their manifests record source `d8666e1` (2026-10-21) and predate the current WinSearch cutover, so
regenerate them with `bun run capture:gallery` / `bun run record:interactions` after any UI change. The
[launcher-native appearance report](docs/reports/2026-10-15-launcher-native-appearance.md) links the owned
synthetic fixture captures and provenance; it does not establish ordinary-app, packaged, physical-display, or
performance acceptance.

The per-user NSIS installer is generated under `src-tauri/target/release/bundle/nsis` and the per-machine MSI under `src-tauri/target/release/bundle/msi`. Build outputs are not committed.

Releases are published by the `Publish release` job in CI for `v<version>` tags (or a manual run on `main` with the `release_tag` input). With the complete `LUMEN_SIGN_*` signing identity configured, a tag push publishes the signed NSIS installer only. Without it, CI publishes an **unsigned prerelease** carrying the NSIS installer, the MSI and `SHA256SUMS`, after smoke-installing and uninstalling the MSI and checking the installed WinSearch manifest against `src-tauri/winsearch-payload.lock.json`. The MSI's `upgradeCode` in `tauri.conf.json` must never change once an MSI has shipped.

## Architecture

- `src/app`: composition, startup, route boundaries, and providers.
- `src/design-system`: semantic tokens, themes, material, icons, type, primitives, and motion.
- `src/features`: launcher, results, preview, onboarding, settings, activity, gateway, local-AI, diagnostics, and gallery surfaces.
- `src/services`: search, answer, Computer Use, Windows AI, Edge AI and settings contracts plus native, browser, deterministic, and unavailable adapters.
- `src/platform`: Tauri/window abstractions.
- `src-tauri/src`: native window lifecycle and confined local-file commands.
- `tests/e2e`: keyboard, accessibility, DPI, visual, responsive, and performance acceptance.
- `docs/architecture`: design, motion, shell, management, and search-service boundaries.
- `docs/reports`: accessibility, DPI, high-refresh, and phase-one validation evidence.

Start with [the Computer Use architecture](docs/architecture/computer-use.md), [the search-service boundary](docs/architecture/search-service.md), and [native shell architecture](docs/architecture/native-shell.md).

## Security and scope boundary

Local search commands canonicalize every root and requested path. Paths outside a selected root are rejected, symlinks are not followed, generated dependency/build directories are skipped, text previews are capped at 64 KiB, image previews at 4 MiB, and binary text is not returned to the webview. The Tauri capability does not grant shell execute or spawn permissions.

The webview cannot launch arbitrary processes, contact Computer Use providers directly, or read provider credentials. Computer Use accepts typed tasks, target discovery, approval responses, and Stop through Rust IPC. Rust keeps provider keys in native requests; the fixed local executor receives no credentials. Browser cloud consent and the two desktop grants are independent. Tasks, selected-target observations and optional screenshots leave the device only within the recorded scope. Background mode forbids foreground escalation, and Stop reports uncertain in-flight outcomes without implying rollback.
