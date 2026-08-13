# Lumen production completion

**Date:** 2026-08-13  
**Platform:** Windows 11 x64, Tauri 2, React 19, Microsoft Edge 151  
**Status:** Complete local implementation and packaged NSIS acceptance; installer signing remains an external release credential gate.

## Delivered application

- Minimal keyboard-first launcher with bounded Rust-owned collapsed, expanded, onboarding, and settings geometry.
- Confined durable local indexing with filename, lexical, history, recency, pin, filter, and hybrid ranking behavior.
- Embedded sqlite-vector 1.0.0 exact cosine retrieval with a checksum-pinned native DLL and lexical fallback when vector loading is unavailable.
- Transactional startup, shortcut, active/primary monitor, hide/quit, preview, history, and index-data policies.
- Native Windows activity classification and background indexing/enrichment throttling without weakening exact search.
- Secret-free provider/model registry, Windows Credential Manager integration, supervised AgentGateway routes, and native-enforced MCP permissions.
- Verified Lemonade, answer-model, and embedding-model provisioning with immutable coordinates, SHA-256 checks, progress, cancellation, atomic promotion, and health rollback.
- On-demand native diagnostics covering the index, vector runtime, activity, Gateway, MCP, local runtime, provisioning, and provider routes; exports are sanitized before the native save dialog.
- Browser-only Computer Use remains confined to its pinned worker, fresh Edge profile, explicit consent, approval, cancellation, task-length, and step limits.

## Verification matrix

| Gate | Result |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run lint` | Passed with zero warnings |
| `bun run test` | 42 files, 285 tests passed |
| `bun run test:e2e` | 36 tests passed serially in installed Edge |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --all-targets --all-features -- -D warnings` | Passed |
| `cargo test --all-features` | 82 passed; 3 sidecar-dependent tests intentionally ignored |
| `bun run capture:gallery` | 53 states regenerated and visually inspected |
| `bun run record:interactions` | 6 interaction studies regenerated |
| `bun run profile` | Passed every cadence-aware budget |
| `bun run tauri build` | Release executable and NSIS installer built |
| `scripts/smoke-packaged.ps1` | Installed, exercised, and uninstalled successfully after a clean-user-profile preflight, with app data isolated beneath Windows Temp |

The three ignored Rust tests require their checksum-pinned AgentGateway or compiled Rivet enrichment sidecars. Their surrounding supervisor/configuration unit tests pass, and the packaged acceptance independently exercised the staged application resources.

## Performance evidence

The checked-in warm deterministic profile reports:

- warm launcher p95: 2.50 ms;
- input response p95: 0.10 ms;
- selection-to-paint p95: 1.90 ms;
- hover-to-paint p95: 6.60 ms within the measured 10.10 ms cadence-aware budget;
- idle CPU: 0.36%;
- JavaScript heap: 27.61 MB;
- no browser long tasks above 50 ms during the rapid input, selection, or hover studies;
- zero active animations after settling.

The observed display cadence was approximately 238 Hz. The profile therefore reports the cadence-aware release result as passed; its separate nominal strict-240 Hz hover diagnostic is retained as environment evidence and is not the release gate.

## Packaged Windows evidence

The NSIS acceptance artifact at `artifacts/packaged/packaged-smoke.json` records:

| Check | Result |
| --- | --- |
| Installer | `Lumen_0.1.0_x64-setup.exe` |
| Size | 148,103,934 bytes |
| SHA-256 | `4906ba086a5118ce65cf8a751000d014f3ad78054c656a4796510fca07609007` |
| Authenticode | `NotSigned` |
| sqlite-vector runtime | 1.0.0 |
| Exact vector query | Passed |
| Missing-DLL lexical fallback | Passed |
| Production placement and close-to-hide core | Passed |
| Sanitized diagnostics write core | Passed |
| Silent uninstall | Passed |
| Clean-profile preflight and cleanup | Passed |

The smoke mode requires an explicit app-data directory beneath the Windows temporary directory and fails closed otherwise. Because NSIS registration is per user, the script also refuses to run if that Windows account has an installed or running Lumen instance, Lumen registration/autostart value, or Lumen shortcut. It disables shortcut creation, verifies that uninstall removed the smoke registration, restores its environment, and removes only its validated temporary root. Run this gate in a clean release-test account; it must never replace an existing user's Lumen installation.

Lumen currently configures Tauri to produce NSIS only, so no current MSI artifact or MSI installation result is claimed. Authenticode signing was inspected and is `NotSigned`; publishing a trusted installer therefore still requires the product owner's Windows code-signing certificate and release process. This does not hide or weaken any in-app capability, but it remains mandatory before public distribution.

## Visual and product review

The 53-state contact sheet and focused full-size captures for general settings, AgentGateway, Computer Use approval, and constrained work-area behavior were inspected after regeneration. The launcher remains a flat, single-column default with progressive detail, compact actions, no nested dashboard card treatment, and no observed clipping or overlap at the tested bounds. Production Tauri paths use typed native operations; deterministic browser states remain restricted to development/gallery use.
