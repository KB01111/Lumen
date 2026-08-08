# Tailwind/EinUI redesign validation

Date: 2026-08-08

## Acceptance coverage

- `window-service.test.ts` locks the native geometry table exactly: collapsed is
  `700 x 66`, fixed at a 66 px height and non-resizable; expanded, onboarding,
  settings, and gallery bounds remain unchanged.
- The accessibility and search E2E contracts use roles and labels rather than
  implementation classes. They cover initial composer focus, `Ctrl+K`, explicit
  Enter submission, a single stable AI answer region, and the gallery Stop
  control.
- The DPI E2E matrix covers 100%, 125%, 150%, 175%, and 200% CSS zoom at a
  constrained `720 x 540` work area. The parent workspace owns internal result
  scrolling, the preview collapses first, the composer and footer stay visible,
  the secondary mode label is capped and truncated at 180 px with its accessible
  name intact, and the page has no horizontal overflow.
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
| `bun run test` | 0 | Terminal; 35 files and 214 tests passed in 24.09 s. |
| `bun run test:e2e` | 0 | Terminal; 33 Playwright tests passed in 1.4 min against one explicitly owned Vite server using `reuseExistingServer`. The server tree was then stopped and port 1420 confirmed free. |
| `bun run build` | 0 | Terminal; production assets emitted. Main CSS asset: `dist/assets/index-DNQkXcTl.css`, 54.02 kB raw / 10.04 kB gzip. |
| `bun run stage:sidecars` | 0 | Terminal; AgentGateway v1.4.1 checksum verified; Rivet enrichment worker, Rivet 2.3.10 Windows engine, and Computer Use worker staged. |
| `bun run tauri build` | 0 | Terminal; controlled retained `rtk cmd /c bun run tauri build` completed in 280.6 s. Sidecars verified/staged, Vite built 2,620 modules, Rust release compilation took 46.87 s, and both installer bundles were emitted. |

The prior terminal native staging failure was resolved by removing only its
verified ignored `.stage-mingw` temporary directory (888 files / 144,038,222
logical bytes) before the retained successful run. The earlier Playwright auto-start cleanup did not exit terminally on this host;
it is not recorded as a pass. The terminal E2E result above used the explicitly
started, recorded Vite process and did not weaken serial workers or `strictPort`.

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
