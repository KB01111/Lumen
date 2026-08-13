# Phase-one validation report

> Historical snapshot: this report describes the July 2026 phase-one baseline. Its deferred-capability list is superseded by `2026-08-12-production-completion.md` for the current application.

**Date:** 2026-07-31  
**Branch:** `codex/lumen-phase-one`  
**Platform:** Windows 11 build 26200, x64, Tauri 2, Edge WebView2 150  
**Status:** Phase-one frontend complete against the lightweight real-file adapter.

## Delivered surface

| Area | Evidence |
| --- | --- |
| Native shell | Persistent borderless Tauri window, native material fallback, single instance, `Alt+Space`, active-monitor placement, hide-on-close |
| Launcher | Collapsed and expanded modes, Unicode/IME input, scopes, filters, live status, action bar |
| Results | Stable-ID keyboard selection, disabled states, groups, 10,000-result virtualization, long filename handling |
| Preview | Loading, safe content, passive document/media metadata, failure/permission states, narrow details overlay |
| Motion | Shared tokens, interruptible spatial continuity, reduced-motion path, no idle loop |
| Onboarding | Eight keyboard-complete scenes with real native folder selection |
| Settings | Nine pages with fixed navigation, persistence, confirmations, appearance, roots, AI/gateway/activity/privacy/diagnostics states |
| Real local files | Canonical-root traversal, ranked filename matching, metadata, bounded preview, file/folder openers |
| Visual evidence | 46 deterministic screenshots, contact sheet, four interaction recordings, full scenario registry |
| Quality | Accessibility, DPI, responsive, performance, frontend, Rust, native build, and manual Windows checks |

## Automated results

- TypeScript: `bun run typecheck` passed.
- ESLint: `bun run lint` passed with zero warnings.
- Vitest: 20 files, 119 tests passed.
- Playwright: 26 tests passed serially, including keyboard, IME, accessibility, DPI/text scaling, responsive preview, themes, 10,000 results, gallery, and performance.
- Rust formatting: `cargo fmt --all -- --check` passed.
- Clippy: all targets and all features passed with warnings denied.
- Cargo: 13 unit tests passed, including confinement, generated-directory exclusion, Unicode matching, deterministic traversal, bounded preview, material fallback, geometry, and scale-aware placement.
- Tauri release: frontend production bundle, optimized Rust executable, MSI, and NSIS installers built successfully.

## Native Windows acceptance

The rebuilt release executable was driven directly, not through a browser substitute:

1. Completed all eight onboarding scenes with the keyboard.
2. Opened the Windows folder picker and selected the active source worktree.
3. Searched for `package.json` against the real filesystem.
4. Received exactly the root file; `node_modules` and `target` duplicates were excluded.
5. Verified the UI hides the Windows `\\?\` canonical prefix and shows a readable 2 KB result.
6. Loaded the real JSON text preview and clean absolute path in the details overlay.
7. Hid the launcher, focused File Explorer, and reopened the release app through global `Alt+Space`.
8. Confirmed Lumen and Narrator processes were not left running after validation.

Earlier in the same native pass, Windows UI Automation/Narrator exposed the named application, onboarding, search, scopes, result grid, preview, actions, progress, and live status. See the dedicated accessibility report for its limits.

## Release outputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `src-tauri/target/release/lumen.exe` | 11,442,176 | `DB3D14ECBC5759CD8E1D23E8074212C63C50D8227B58BDA210CEE07B70D5408E` |
| `src-tauri/target/release/bundle/msi/Lumen_0.1.0_x64_en-US.msi` | 3,899,392 | `9EE9F6306B2B04FC8B71353FD73A95CC76B0E39348AF909D4F082B7919FAFAE8` |
| `src-tauri/target/release/bundle/nsis/Lumen_0.1.0_x64-setup.exe` | 2,592,210 | `22F1CBE670D9279988E54CD21D6930B4C64075C41CA18C4EEEAB8B5259218E9F` |

These build outputs remain local and are not checked into Git.

## Honest limits and deferred production work

- The production NTFS/USN index, extraction/OCR, semantic/vector search, reranking, local-model inference, NPU execution, AgentGateway runtime, MCP server, cloud providers, and process/activity detection are intentionally not implemented.
- AI, gateway, provider, and activity management surfaces are deterministic phase-one states and identify themselves as previews.
- Only one 150 percent physical monitor was available; mixed-DPI/multi-monitor transitions remain a physical-hardware release gate.
- Narrator audio/utterances, real IME candidate UI, touch, voice access, and user studies remain future manual validation.
- Performance is browser wall-clock/React/long-task evidence plus native visual smoke testing, not PresentMon or ETW present telemetry.

Within those explicit boundaries, the phase-one frontend is complete, native, installable, and fully driven by the confined local-file adapter.
