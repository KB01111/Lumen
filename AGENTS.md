# Lumen

Keyboard-first Windows 11 file-search launcher. Tauri 2 + React 19 + TypeScript + StyleX + React Aria Components + Motion. Phase one is a finished frontend against a confined local-file adapter — the production index, semantic search, AI inference, AgentGateway, and MCP services intentionally do **not** exist. New backend capability must go behind the existing typed contracts (`src/services`), never into UI components.

## Environment

- Windows 11 only: requires WebView2 Runtime, Bun 1.3+, Rust stable (MSVC), and VS 2022 / Build Tools with C++ + Windows SDK.
- Use `bun` for everything (bun.lock is the lockfile); do not use npm/yarn.
- No CI exists in this repo — verification is local, using the commands below.

## Commands

```powershell
bun install
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
- Playwright auto-starts `bun run dev` on `127.0.0.1:1420` and **reuses an already-running server** (`reuseExistingServer`). A stale dev server serving old code will silently affect e2e results.
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
- `src/features` — launcher, results, preview, onboarding, settings, activity, gateway, local-AI, diagnostics, gallery.
- `src/services/search` — the key boundary: UI only knows the `SearchService` interface and never imports Tauri commands directly. Adapters: `DevelopmentFileSearchService` (default, real Tauri commands), `DevelopmentSearchService` (`?service=memory`), `MemorySearchService` (unit tests), `FutureProductionSearchService` (throws — the phase-two seam). Every native payload is Zod-parsed before entering UI state.
- `src/state` + feature `*.store.ts` — zustand stores. Persistence uses the Tauri Store plugin when `window.__TAURI_INTERNALS__` exists, else `localStorage`. Persisted stores must be `hydrate()`d before their state is read (see `App.tsx`).
- `src/platform` — Tauri/window abstractions.
- `src-tauri/src` — `lib.rs` (plugins, Alt+Space global shortcut, single-instance, close-to-hide), `window.rs` (owns the window-mode geometry table and native material), `search/` (confined local-file commands).

## Hard constraints (do not break)

- Security: Rust search commands canonicalize all paths, reject paths outside selected roots, never follow symlinks, skip `.git`/`node_modules`/`dist`/`target`/etc., and cap previews (64 KiB text, 4 MiB images). `src-tauri/capabilities/main.json` is least-privilege — the shell plugin is deliberately absent; do not add execute/spawn permissions.
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
