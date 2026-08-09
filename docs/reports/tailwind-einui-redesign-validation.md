# Tailwind/EinUI redesign validation

Date: 2026-08-08

Task 11 review fix completed: 2026-08-09

## Acceptance coverage

- `src-tauri/src/window.rs` owns the exact native geometry invariant: collapsed
  is `700 x 66`, has fixed 66 px min/max height and `resizable: false`; expanded,
  onboarding, settings, and gallery literal bounds are also asserted. The
  TypeScript window-service test remains a browser-mirror contract only.
- The accessibility and search E2E contracts use roles and labels rather than
  implementation classes. They cover initial composer focus, `Ctrl+K`, explicit
  Enter submission, a single stable AI answer region, and the gallery Stop
  control.
- The DPI E2E matrix covers 100%, 125%, 150%, 175%, and 200% CSS zoom at a
  constrained `720 x 540` work area. It measures palette, composer, footer, and
  control rectangles, proves usable input plus real result/answer scrolling,
  verifies preview-first collapse and one stable answer region, and rejects page
  horizontal overflow without coupling to Tailwind implementation declarations.
- Foundation coverage retains the anchored composer as the inner surface opens.
  The palette host, rather than the document, contains decorative exterior ink.
- Performance coverage confirms one answer region, no idle animation loop after
  the finite entry transition settles, and retains the 240 Hz interaction
  budgets without relaxing thresholds.

## Source adjustments justified by the acceptance REDs

At a 520 px palette width inside the constrained work area, the fixed composer
controls left the search input zero pixels wide: the `w-full` input flex basis
competed with the clear button. The input now uses `flex-1 min-w-0`, so it takes
the remaining composer width. The middle workspace receives the measured 161 px
allocation and is a `min-h-0` contained flex layer; result/answer content scrolls
inside it while the composer and footer remain fixed.

The shortcut visibility is an actual palette container query, not a viewport
breakpoint: a 720 px page can contain a 520 px palette. The secondary label
truncates inside a 180 px cap while its button `aria-label` retains the complete
mode name. `App` clips horizontal decorative overflow only at the existing root
host; the palette remains overflow-visible in normal bounds so its exterior glow
is not clipped.

## Terminal command evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `bun run typecheck` | 0 | Terminal; TypeScript completed without errors. |
| `bun run lint` | 0 | Terminal; zero warnings permitted by the command. |
| `bun run test` | 0 | Terminal review-fix rerun; 36 files and 218 tests passed in 37.58 s. |
| `bun run test:e2e` | 0 | Terminal review-fix rerun; 33 Playwright tests passed in 96.3 s against one explicitly owned IPv4 Vite server using `reuseExistingServer`. The server tree was then stopped and port 1420 confirmed free. |
| `bun run build` | 0 | Terminal; production assets emitted. Main CSS asset: `dist/assets/index-DNQkXcTl.css`, 54.02 kB raw / 10.04 kB gzip. |
| `bun run stage:sidecars` | 0 | Terminal; AgentGateway v1.4.1 checksum verified; Rivet enrichment worker, Rivet 2.3.10 Windows engine, and Computer Use worker staged. |
| `bun run tauri build` | 0 | Terminal; controlled retained `rtk cmd /c bun run tauri build` completed in 280.6 s. Sidecars verified/staged, Vite built 2,620 modules, Rust release compilation took 46.87 s, and both installer bundles were emitted. |

The prior terminal native staging failure was resolved by removing only its
verified ignored `.stage-mingw` temporary directory (888 files / 144,038,222
logical bytes) before the retained successful run. The earlier Playwright auto-start cleanup did not exit terminally on this host;
it is not recorded as a pass. The terminal E2E result above used the explicitly
started, recorded Vite process and did not weaken serial workers or `strictPort`.

## Task 11 review-fix native verification

The exact debug-profile `cargo test --all-features` could not complete on this
host after serial attempts exhausted the worktree volume (`os error 112`).
`cargo fmt --all -- --check` and exact
`cargo clippy --all-targets --all-features -- -D warnings` completed cleanly.
The accepted disk-safe gate was `cargo test --release --all-features -j 1`,
which terminally passed with 35 tests passed and 3 ignored. The final review-fix
reruns completed in 98.5 seconds for clippy and 39.4 seconds for the release test.
A temporary native
geometry mutation changing collapsed `max_height` from 66 to 65 produced the
expected assertion RED in `window::tests::native_geometry_table_matches_each_window_mode_contract`; it was immediately reverted, and the final full release-profile command was green. The TypeScript mirror remains supplemental, not native enforcement.

The fallback used normal `bun install --frozen-lockfile` and
`bun run stage:sidecars` restoration before release testing. Sandbox cache/network
attempts were retried with scoped access; `package.json` and `bun.lock` stayed
unchanged. All sidecars and runtime DLLs were then staged, with AgentGateway
matching its pinned SHA-256. Task12 must rerun normal staging and the full Tauri
bundle gate; this release-profile test does not replace that bundle verification.

## Task 11 review-fix frontend verification

The constrained DPI contract first failed because the deterministic answer was
only 48 px high (`scrollHeight === clientHeight`), so it could not prove internal
answer scrolling. The constrained gallery fixture now supplies a deterministic
long streaming answer; the focused role/rectangle/scroll test then passed, and
the complete DPI specification passed 7/7 in 49.8 seconds. Current typecheck,
lint, and production build are terminally green; the build transformed 2,620
modules and retained the 54.02 kB / 10.04 kB gzip CSS asset.

The final focused App, launcher, and metrics run passed 14/14; the complete
Vitest run passed 218/218. The exact full E2E command passed 33/33 in 96.3
seconds against one fresh Vite process bound to `127.0.0.1:1420`. The process
tree was then stopped by its recorded IDs and the strict port was confirmed
free. No performance threshold, Playwright worker, retry, or port setting was
changed.

## Performance observations

The isolated selection-commit reruns produced a 2.10 ms p95 (117 and 121
samples respectively), below the unchanged 3 ms budget. A single 3.40 ms sample
from the first full run was not reproducible. Hover instrumentation found 80
`pointerover` dispatches but only four React commits; the focused run measured a
3.40 ms hover p95 and a 4.60 ms frame p95. No pointer-induced selection, preview,
or Motion churn was found, so no production hot-path change or budget relaxation
was made. The only animation seen at initial sampling was the intended finite
160 ms entry transition; after it settled, the additional 500 ms idle observation
found no running animation.

One accumulated-suite run delivered a 52 ms long-task entry after the rapid
input metrics reset even though two isolated warm-launcher runs were clean. A
deterministic observer test reproduced the boundary: a queued entry beginning at
99 ms and delivered after a reset at 100 ms was incorrectly counted alongside a
new 101 ms entry. Diagnostics now retain the reset epoch and accept only entries
whose `startTime` belongs to the current window. The regression was RED as
`[52, 52]` versus `[52]`, then GREEN 2/2. After a fresh server restart, the full
performance specification passed 3/3 twice consecutively, followed by the exact
33/33 suite above. Thresholds and product UI were unchanged.

## Architecture alignment

The updated architecture documents record Tailwind CSS v4's CSS-first token
ownership, frozen owned EinUI provenance, the Apps SDK icon bridge, explicit AI
submission, native-before-inner and inner-before-native transition ordering,
React Aria ownership, and the absence of the legacy StyleX/Astryx/Phosphor stack.
Search/security contracts remain unchanged except for the relevant UI boundary
cross-links.

## Native build artifacts

- `src-tauri/target/release/lumen.exe` was built.
- `src-tauri/target/release/bundle/msi/Lumen_0.1.0_x64_en-US.msi` was emitted.
- `src-tauri/target/release/bundle/nsis/Lumen_0.1.0_x64-setup.exe` was emitted.
- The Vite output includes the 54.02 kB / 10.04 kB gzip main CSS asset and a
  76.22 kB / 25.43 kB gzip `LumenUiIcon` JavaScript chunk. Release bundles are
  generated outputs and remain untracked.
