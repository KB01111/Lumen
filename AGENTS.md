# Lumen

Keyboard-first Windows 11 file-search launcher. Tauri 2 + React 19 + TypeScript + StyleX + React Aria Components + Motion. The native app includes confined filename search, a durable SQLite content index, checksum-pinned AgentGateway and enrichment supervision, local/cloud answers, browser-only Computer Use, and read-only Session Relief. Semantic/vector search, reranking, MCP tools, and generic execution intentionally do **not** exist. New backend capability must go behind the existing typed contracts (`src/services`), never into UI components.

## Environment

- Windows 11 only: requires WebView2 Runtime, Bun 1.3+, Rust stable (MSVC), and VS 2022 / Build Tools with C++ + Windows SDK. Staging Computer Use also needs a healthy Python 3.11 runtime (the script prefers `uv`; `LUMEN_PYTHON` can select another interpreter).
- Use `bun` for everything (bun.lock is the lockfile); do not use npm/yarn.
- No CI exists in this repo — verification is local, using the commands below.

## Commands

```powershell
bun install
bun run stage:sidecars # checksum-pinned native workers, including Computer Use
bun run tauri dev        # native app (beforeDevCommand runs vite on port 1420)
bun run dev              # browser-only vite, strict port 1420 (no Tauri commands available)
```

Verification order — run all of these before considering work done:

```powershell
bun run typecheck        # tsc --noEmit
bun run lint             # eslint --max-warnings 0: warnings FAIL the run
bun run test             # vitest run (unit/component, colocated src/**/*.test.ts(x))
bun run test:e2e         # playwright
bun run tauri build      # full release build when touching src-tauri
```

Focused runs:

- Single unit test: `bun run test -- src/state/appearance.store.test.ts` (add `-t "name"` to filter inside).
- Single e2e: `bun run test:e2e -- tests/e2e/foundation-shell.spec.ts` (add `-g "name"`).
- Rust (from `src-tauri`, in a Visual Studio developer shell): `cargo fmt --all -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --all-features`.

## Testing gotchas

- Playwright is serial (`workers: 1`, no retries) and uses the installed Edge via `channel: 'msedge'` — do not switch to a downloaded chromium.
- `bun run test:e2e` starts and owns the current Vite server on `127.0.0.1:1420` and refuses to reuse an existing listener. Stop the exact listener before e2e; a different Lumen worktree on the strict port must fail visibly instead of supplying stale code.
- Vitest compiles StyleX with `devMode: 'css-only'`; jsdom + `@testing-library/jest-dom` setup is in `src/test/setup.ts`. Mocks restore automatically (`restoreMocks: true`).

## Dev-only URL modes (browser/e2e, gated by `import.meta.env.DEV`)

The plain browser has no Tauri IPC, so deterministic states are reached via query params (wired in `src/app/App.tsx`):

- `?service=memory` — deterministic in-memory search data; also bypasses onboarding. Used by e2e, recordings, profiler.
- `?gallery=1&scenario=<id>[&theme=...]` — 46-state visual gallery (see `artifacts/screenshots/manifest.json` for IDs).
- `?mode=foundation` — shell preview; `Ctrl+Shift+L` cycles dark/light/opaque.
- `?onboarding=1` / `?onboarded=1` — force or bypass onboarding.

## Architecture (what actually matters)

- `src/app` — composition root (`App.tsx`), providers, route/dev-mode branching.
- `src/design-system` — StyleX tokens (`tokens.stylex.ts`), themes, materials, motion, primitives. All styling goes through `stylex.create` + these tokens; do not add raw CSS (only `global.css` exists).
- `src/features` — launcher, results, preview, onboarding, settings, activity, gateway, local-AI, Session Relief, diagnostics, gallery.
- `src/services/search` — the key boundary: UI only knows the `SearchService` interface and never imports Tauri commands directly. `DevelopmentFileSearchService` is the native default and combines immediate filename results with the matching durable index; `DevelopmentSearchService` (`?service=memory`) and `MemorySearchService` are deterministic test adapters. Every native payload is Zod-parsed before entering UI state.
- `src/services/computer-use` — typed Computer Use health, stream, approval, and cancellation boundary. Rust owns the fixed worker process and Job Object; React receives only Zod-parsed progress events. The Gemini key is never returned to React.
- `src/services/session-relief` — typed, bounded, read-only Windows pressure report. Browser mode is unavailable; copied summaries remove process names, PIDs, trees, and finding evidence.
- `src-tauri/src/gateway` — checksum-pinned AgentGateway, owned local runtime, bounded answer streaming, and the durable SQLite enrichment processor. Rivet is optional coordination and its health must remain separate from processor readiness.
- `src/state` + feature `*.store.ts` — zustand stores. Persistence uses the Tauri Store plugin when `window.__TAURI_INTERNALS__` exists, else `localStorage`. Persisted stores must be `hydrate()`d before their state is read (see `App.tsx`).
- `src/platform` — Tauri/window abstractions.
- `src-tauri/src` — `lib.rs` (plugins, Alt+Space global shortcut, single-instance, close-to-hide), `window.rs` (owns the window-mode geometry table and native material), `search/` (confined local-file commands).

## Hard constraints (do not break)

- Security: Rust search commands canonicalize all paths, reject paths outside selected roots, never follow symlinks, skip `.git`/`node_modules`/`dist`/`target`/etc., and cap previews (64 KiB text, 4 MiB images). `src-tauri/capabilities/main.json` is least-privilege — the shell plugin is deliberately absent; do not add execute/spawn permissions.
- Computer Use remains browser automation only. It requires recorded cloud consent, launches only the staged worker whose build-time SHA-256 Rust revalidates before secrets or spawn (source fallback is debug-only), uses a fresh Microsoft Edge context, rejects non-HTTP(S) start pages, caps tasks at 4,000 Unicode code points/60 steps, bounds worker events, and pauses Gemini safety decisions for one-time approval. Never replace this with webview-side provider calls or generic process arguments.
- The window is borderless/transparent with Acrylic→Mica→Blur fallback; close hides rather than destroys. Window sizes/constraints per mode are owned by Rust (`window.rs`), not the frontend.
- Vite port 1420 is `strictPort` — it must be free for dev/e2e.
- tsconfig has `noUnusedLocals`/`noUnusedParameters` — dead variables fail typecheck.
- Commit style is Conventional Commits (`feat:`, `test:`, `perf:`, `docs:`, ...), lowercase, no scope.

## Checked-in evidence

`artifacts/` is committed and expected to be regenerated after UI/perf changes:

- `bun run capture:gallery` → `artifacts/screenshots/` (46 states + contact sheet + manifest)
- `bun run record:interactions` → `artifacts/recordings/`
- `bun run profile` → `artifacts/performance/profile-summary.json` (240 Hz frame budgets, driven via the dev-only `window.__LUMEN_DIAGNOSTICS__`)

All three auto-start a dev server if none is running. Build outputs under `src-tauri/target/release/bundle` are not committed.

## Docs

Authoritative deep-dives live in `docs/architecture/` (search-service, native-shell, design-system, motion-system, management-surfaces) and phase-one evidence in `docs/reports/`. Read `docs/architecture/search-service.md` before touching search, preview, or result-selection code.
