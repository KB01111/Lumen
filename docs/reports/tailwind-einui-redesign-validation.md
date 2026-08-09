# Tailwind/EinUI redesign validation

Date: 2026-08-09

Task 11 review fix completed: 2026-08-09

Task 12 evidence refresh completed with a performance concern: 2026-08-09

## Task 12 evidence inventory and inspection

The refreshed Microsoft Edge 151.0.4129.72 gallery manifest contains 53
scenarios plus one contact sheet (54 PNG files total). The complete contact
sheet and full-resolution dark, corrected light, opaque, high-contrast,
AI-waiting, AI-streaming, completed-answer, isolated answer-error,
Computer-Use approval, constrained-work-area, and reduced-motion captures were
inspected. They show the borderless palette surface without a title bar or
fullscreen application backdrop, retain readable semantic foregrounds, keep
the composer/footer anchored in constrained height, and preserve the intended
fallback and motion states. No remaining clipped glow, page overflow,
transparent click-blocking area, or nested-card regression was found.

The recording manifest contains six fresh WebM files: launcher search,
settings routing, onboarding, explicit answer submission/retry/dismissal,
answer streaming/completion/approval controls, and activity/provider states.
Every recording was decoded and scrubbed through its key transitions using
FFmpeg contact sheets. The launcher recording covers collapsed appearance,
downward expansion, local results, keyboard selection, preview/details, scope,
and open confirmations. The answer recordings cover explicit Enter submission,
failure isolation, retry, streaming Stop, completion, approval/denial, collapse,
and dismissal. Settings, onboarding, and provider/activity transitions also
completed. Browser video keeps a fixed recording canvas, so collapsed native
geometry is shown with neutral letterboxing around the simulated `700 x 66`
viewport; this is a recording-harness limitation, not a product surface.

## Task 12 evidence-driven corrections

Visual inspection caught a real light-theme defect: the upstream transparent
EinUI recipe kept white foregrounds and near-transparent white rows on the pale
light glass surface. A raw theme-token contract was RED first, and a computed
Playwright assertion reproduced `rgb(255, 255, 255)` instead of the semantic
light foreground. The minimal production correction scopes the command palette
recipe to Lumen's semantic light-theme foreground, surface, border, divider,
row, shortcut, and shadow tokens. The focused CSS contract then passed 3/3 and
the computed light-gallery assertion passed 1/1. The corrected gallery was
regenerated in full; capture CSS and product behavior were not altered for the
screenshot.

The first recording run also exposed two deterministic harness races. Settings
navigation could send `Ctrl+,` before the launcher keyboard listener mounted,
and the fixed browser viewport could not represent the native collapsed/expanded
geometry contract. The recorder now waits for the launcher searchbox and changes
the page viewport at the same transition boundaries owned by the native window
service. New explicit-answer and approval-state recordings close the prior flow
coverage gaps. Failed generator runs demonstrated the missing readiness and
dismissal assertions before the terminal six-recording run passed.

## Task 12 performance profile

The refreshed machine-readable profile is deliberately retained as RED. On this
host's AMD Radeon 890M at 2560 x 1600 / 240 Hz, Edge observed approximately
238 Hz (`4.2 ms` median frame interval, `8.3 ms` p95). Warm launcher p95 was
`2.3 ms`; input-to-paint p95 was `5.1 ms`; selection-to-paint p95 was `5.7 ms`;
hover-to-paint p95 was `2.1 ms`; React commit p95 was `2.2 ms`; idle CPU was
`0.70%`; garbage-collected heap was `26.70 MB`; and no animation remained after
settling. The input and selection paint values exceed the unchanged absolute
`4.1667 ms` release budgets. The unpaced input burst reached all 30 samples and
the correct final value but observed `53 ms` and `50 ms` long tasks; the unpaced
selection burst reached all 30 samples with exactly one selected row and no long
task. Consequently `profile-summary.json` truthfully records `passed: false`.

The input distribution contains 31 paint samples (the 30 paced samples plus the
final `report` fill): minimum `0.2 ms`, median `1.3 ms`, p95 `5.1 ms`, maximum
`5.9 ms`. The 120 selection samples have minimum `1.0 ms`, median `1.4 ms`, p95
`5.7 ms`, and maximum `7.6 ms`; the 120 correlated React commits have p95
`2.2 ms` and maximum `2.8 ms`. The Playwright trace records the 30 unpaced fill
calls from trace time `7650.291 ms` through `9711.737 ms`; multiple protocol
calls took more than 50 ms, including calls 3 (`99.571 ms`), 5 (`56.805 ms`), 6
(`54.307 ms`), 7 (`52.832 ms`), 8 (`67.161 ms`), 9 (`104.322 ms`), and 10
(`121.361 ms`). Trace snapshot collection itself was only `0.6-1.8 ms` per
snapshot. The saved Playwright trace and current diagnostics summary do not
retain LongTask entry timestamps/origin or rapid-burst React commits, so an
exact one-to-one attribution of the `53/50 ms` entries is unavailable; they are
bounded to the unpaced input phase and cannot be explained by the `4.2 ms`
display cadence alone.

A single bounded browser-flag diagnostic did not provide an acceptable
unthrottled alternative. Default and `--disable-gpu-vsync` stayed near
`4.2/4.3 ms` median/p95 frame intervals, while
`--disable-frame-rate-limit` alone and paired with `--disable-gpu-vsync`
regressed to approximately `17.7/18.5 ms`. No flag was committed, no budget was
relaxed, and no speculative product hot-path change was made. Compared with the
older NVIDIA/500 Hz host results in `high-refresh-performance.md`, this host
does not satisfy the dedicated absolute 240 Hz release profile even though the
functional and settled-work metrics remain correct.

## Task 12 generator and audit command evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `bun run capture:gallery` | 0 | Terminal controlled-server rerun; 53 scenarios plus contact sheet regenerated in 41.8 s. An earlier auto-start run produced all files but required stopping its verified idle orphan Vite process before the retained command exited 0; it is not treated as the clean acceptance run. |
| `bun run record:interactions` | 0 | Terminal controlled-server rerun; six recordings regenerated in 41.9 s. |
| `bun run profile` | 1 | Terminal and honestly RED with the measurements above; `passed: false` retained. |
| focused light-theme CSS contract | 0 | Terminal; 3/3 tests passed after the demonstrated RED. |
| focused light-theme Playwright contract | 0 | Terminal; 1/1 passed after the demonstrated computed-color RED. |
| forbidden-source `rg` scan | 1 | Expected no-match exit; no forbidden source/dependency reference was found. |

All browser and artifact runners were serialized. The explicitly owned Vite
tree was stopped after evidence generation and port 1420 was confirmed free.
Post-commit typecheck, lint, full unit, exact full E2E, and Tauri release-build
results are recorded in the ignored Task 12 execution report so the committed
validation evidence is not rewritten after its required evidence commit.

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
