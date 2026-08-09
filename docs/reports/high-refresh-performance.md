# High-refresh performance report

**Original baseline:** 2026-07-31; Windows 11 build 26200, NVIDIA GeForce RTX 5070 Ti, 2560 × 1440 at 150 percent scale; driver-reported 500 Hz; Edge 150  
**Task 12 refresh:** 2026-08-09; AMD Radeon 890M, 2560 × 1600 at 240 Hz; Edge 151.0.4129.72  
**Result:** The current cadence-aware release profile passes and retains the raw strict-240 result separately. Lumen does not claim a fixed 240 FPS output.

## Method

`bun run profile` launches a non-background-throttled Edge context at 800 × 540 against the deterministic development adapter. It warms lazy routes and input work, records 24 launcher round trips, 30 paced input samples, 120 paced selection samples, 80 hover samples paired with their directly surrounding animation-frame intervals, and two unpaced 30-event renderer-side burst guards. It then samples React Profiler commits, browser Long Tasks, active animations, one second of idle task time, garbage-collected JavaScript heap, and 120 animation-frame intervals. A Playwright trace is saved with the JSON summary.

Isolated p95 samples are paced so they measure response latency rather than whole-query replacements overlapping their own deferred work. The input burst is one renderer-side synchronous callback containing 30 native input-value updates and bubbled input events, not 30 awaited automation calls. The selection burst similarly dispatches 30 bubbled keyboard events in one renderer callback. Their directly measured synchronous durations must each remain below 16 ms while sample count, final-state correctness, and one selected row are asserted independently.

The nominal target remains `1000 / 240 = 4.1667 ms`. Raw input, selection, and hover results against that strict target are recorded under `strict240Hz`. The release check compares input and selection with `max(nominal target, observed p95 frame interval)`. Hover is paired with its actual surrounding frame interval and uses the equivalent contemporaneous p95 maximum. Both cadence measurements must be available. Hover dispatch has a separate direct synchronous maximum below 16 ms, and both rapid bursts have direct synchronous totals below 16 ms, so observed frame cadence cannot excuse slow handler work.

The browser Long Tasks API is a separate coarse signal: by definition it reports tasks of at least 50 ms, not tasks over 16 ms. The profile therefore records those entries as `*BrowserLongTasksOver50Ms`, budgets them at 50 ms, and requires none in the rapid-input, rapid-selection, paced-selection, or hover windows. It does not use that API to substantiate the independent 16 ms synchronous-work guards.

## Budgets and repeatability

| Metric | Release budget | Task 12 retained result |
| --- | ---: | ---: |
| Warm launcher visible p95 | < 20 ms | 3.4 ms |
| Input to paint p95 | < 8.1 ms observed frame | 5.1 ms |
| Arrow selection to paint p95 | < 8.1 ms observed frame | 2.2 ms |
| Hover to paint p95 | < 10.368 ms paired frame | 6.9 ms |
| Raw strict-240 input / selection / hover | < 4.1667 ms each | false / true / false |
| Ordinary React commit p95 | < 3 ms | 2.2 ms |
| Direct synchronous input/selection bursts and hover dispatch | < 16 ms | 0.9 / 1.6 / 1.0 ms |
| Browser Long Tasks | none >= 50 ms | none |
| Active animations after settle | 0 | 0 |
| Idle UI CPU | < 2 percent | 0.31 percent |
| JavaScript heap after GC | < 100 MB | 26.71 MB |
| Unpaced input/selection bursts | correct final state, direct synchronous duration < 16 ms | passed |

The machine-readable result for source commit `4edbb78f545096831c6a657dc37883b95ccb3849` is `artifacts/performance/profile-summary.json`; `interaction-trace.zip` contains the correlated trace. The JSON records that exact source SHA, browser build, samples, budgets, checks, and observed cadence. A later evidence-only commit may contain these generated files without changing the source SHA they identify.

## Render-path findings

- The search input is uncontrolled, so visible typing is not gated on global React state.
- Query work commits after input paint and stale searches are aborted/ignored by request ID.
- Keyboard selection intent and the capsule paint directly; selection-dependent React and preview work settle afterward.
- Preview selection is coalesced and stale preview work is abortable.
- Result-row accessibility selection attributes are updated with the same selection intent.
- 10,000-result collections remain virtualized with a small mounted-row count.
- Pointer movement is not connected to synchronous global React renders.
- Continuous visual work uses opacity/transform; no idle animation loop remains.

## Interpretation and limits

The original host's observed browser cadence was lower than its driver-reported 500 Hz and varied between 250, 256, and 476 Hz. The Task 12 host is driver-configured for 240 Hz while Edge estimated 238 Hz with a 4.2 ms median and 8.1 ms p95 frame interval. The report therefore preserves nominal and observed values rather than inferring a fixed rate. Browser automation is not GPU-present instrumentation, and the Tauri WebView2 compositor was spot-checked visually rather than captured with PresentMon. A future release gate should repeat this profile on representative 60, 120, 144, 165, and 240 Hz panels and add native present/ETW evidence.
