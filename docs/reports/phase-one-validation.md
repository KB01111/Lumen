# Phase-one validation report

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

## Integration-hardening addendum — 2026-08-06

The report above remains the historical July phase-one snapshot. This addendum supersedes its current-state scope claims.

**Branch:** `codex/lumen-integration-hardening`

**Base SHA:** `0af619319f0d2e12ce304ce214afb663b8d6de0e`

**Evidence state:** regenerated from the uncommitted hardening tree; each manifest records `gitDirty: true` so the base SHA is not misrepresented as the complete source.

### Integrated surface

- Native search now combines immediate confined filename results with a durable, generation-safe SQLite content index and bounded local text, Office, and PDF extraction.
- OCR and transcription use durable SQLite leases, retry backoff, source-hash and generation guards, persisted consent, and per-root opt-in. SQLite provider processing remains operational when Rivet coordination is unavailable.
- Checksum-pinned AgentGateway lanes provide bounded local/cloud answer streaming. Local mode never falls back to cloud; auto/cloud routes require persisted consent and a Credential Manager credential.
- Local runtime readiness requires a live Lumen-owned Lemonade child plus an authenticated HTTP health response. A pre-existing unowned listener is rejected.
- Computer Use release builds embed the staged worker SHA-256 and revalidate it before credential access and spawn. Source fallback is debug-only, tasks use the same 4,000-code-point limit in React, Rust, and Python, and worker events/failures are bounded.
- Settings has eleven pages, including truthful browser/native boundaries, transactional native mutations, real search history and index deletion, active Gateway/enrichment diagnostics, and read-only Session Relief.
- E2E and evidence runners refuse stale port-1420 servers, start the current Vite source directly, and wait for clean shutdown.

### Verification results

| Gate | Result |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run lint` | Passed with zero warnings |
| `bun run test` | 40 files, 219 tests passed |
| `bun run test:e2e` | 26 serial Microsoft Edge tests passed |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --all-targets --all-features -- -D warnings` | Passed |
| `cargo test --all-features` | 94 library tests and 14 contract tests passed; 3 staged tests ignored by default |
| Explicit staged Rust tests | AgentGateway config, dual-lane restart, and truthful Rivet degraded probe: 3 passed |
| `bun run verify:computer-use` | 7 Python tests plus source and packaged health probes passed |
| `bun run stage:sidecars` | AgentGateway 1.4.1, compiled enrichment worker, Rivet 2.3.10 engine, and Computer Use worker staged and verified |
| `bun run build` | TypeScript and Vite production build passed |
| Tauri optimized release | `lumen.exe` compiled successfully |
| NSIS bundle | Built successfully |
| MSI bundle | Blocked in WiX ICE validation: sandboxed `light.exe` could not access the running Windows Installer service (`LGHT0217`); the required unsandboxed retry could not be approved because workspace approval credits were exhausted |

The release hook's exact commands, `bun run stage:sidecars` and `bun run build`, were run successfully before Tauri bundling. A supported Tauri config overlay skipped only that already-executed hook because the managed shell dropped Bun from the hook's child `PATH`; Rust compilation and bundling were unchanged.

### Regenerated evidence

- Gallery: 46 states and contact sheet, Edge 151.0.4129.59.
- Recordings: four flows; settings navigation now includes Computer Use and Session Relief.
- Performance: warm-launcher p95 6.6 ms, input-to-paint p95 2.6 ms, selection-to-paint p95 1.7 ms, no repeated or rapid-burst long tasks over 16 ms, and zero active animations after settle.

| Release file | Bytes | SHA-256 |
| --- | ---: | --- |
| `src-tauri/target/release/lumen.exe` | 22,076,928 | `EA50BABBE701EF83CD6C29E9586DAAE81E3625E2308B14114DF05A0AB2F8E9E8` |
| `src-tauri/target/release/bundle/nsis/Lumen_0.1.0_x64-setup.exe` | 148,696,362 | `3D25301A7210C28F070D23AE3E28A2C4C5D764FCA18C9C769D40A77C92D617AC` |

The final NSIS build patched its bundle metadata into `lumen.exe` and completed successfully. MSI output is not listed because its validation gate did not complete.

### Remaining acceptance boundaries

- The staged Rivet 2.3.10 Windows engine exits with `0xc0000005` on this machine. Lumen suppresses modal sidecar crash dialogs, reports the coordinator unavailable, and keeps the independently tested SQLite enrichment processor ready.
- No live billable OpenAI or Gemini request was made. Provider credentials, content upload, screenshots, and charges remain an explicit user-consent gate.
- No qualified Lemonade/FLM inference session or manual installed-app walkthrough was run in this pass; ownership, version, HTTP readiness, and native collector behavior are covered by automated tests.
- Semantic/vector search, reranking, MCP tools, and automatic Windows game/fullscreen/video/battery detection remain intentionally unavailable and are not represented as working features.
