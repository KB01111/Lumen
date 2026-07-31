# High-refresh performance report

**Date:** 2026-07-31  
**Host:** Windows 11 build 26200, NVIDIA GeForce RTX 5070 Ti, 2560 × 1440 at 150 percent scale  
**Display report:** Windows video controller reports 500 Hz; browser `requestAnimationFrame` measurements observed 250–256 Hz in repeatable isolated runs  
**Browser:** Microsoft Edge 150 / Chromium WebView2 150  
**Result:** Strict 240 Hz interaction budgets passed. Lumen does not claim a fixed 240 FPS output.

## Method

`bun run profile` launches a non-background-throttled Edge context at 800 × 540 against the deterministic development adapter. It warms lazy routes and input work, records 24 launcher round trips, 30 input samples at 25 Hz, 120 selection samples at approximately 83 Hz, 80 hover samples at approximately 83 Hz, and two unpaced 30-update burst guards. It then samples React Profiler commits, long tasks, active animations, one second of idle task time, garbage-collected JavaScript heap, and 120 animation-frame intervals. A Playwright trace is saved with the JSON summary.

Isolated p95 samples are paced so they measure response latency rather than protocol-generated whole-query replacements overlapping their own deferred work. Unpaced burst guards separately prove final-state correctness, one selected row, and absence of repeated tasks over 16 ms.

The normal E2E suite compares response p95 with the browser's observed p95 frame interval because that suite follows 24 other GPU/browser flows. The dedicated profiler remains the release authority and keeps the absolute 4.17 ms thresholds for input, selection, and hover.

## Budgets and repeatability

| Metric | Budget | Repeated isolated result |
| --- | ---: | ---: |
| Warm launcher visible p95 | < 20 ms | 5.8–6.3 ms |
| Input to paint p95 | < 4.17 ms | 2.0–2.8 ms |
| Arrow selection to paint p95 | < 4.17 ms | 1.5–2.2 ms |
| Hover to paint p95 | < 4.17 ms | 0.6–1.6 ms |
| Ordinary React commit p95 | < 3 ms | 1.4–1.6 ms |
| Repeated main-thread tasks | none > 16 ms | none |
| Active animations after settle | 0 | 0 |
| Idle UI CPU | < 2 percent | 0.15–0.57 percent |
| JavaScript heap after GC | < 100 MB | 46.9–47.1 MB |
| Unpaced input/selection bursts | correct final state, no long task | passed |

The machine-readable result for the delivered source is `artifacts/performance/profile-summary.json`; `interaction-trace.zip` contains the correlated trace. The JSON records the exact browser build, source SHA, samples, budgets, checks, and observed cadence.

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

The observed browser cadence is lower than the 500 Hz value reported by the display driver and can vary between 250, 256, and 476 Hz depending on compositor scheduling. The report therefore states both values and uses measured wall-clock samples rather than inferring a fixed frame rate. Browser automation is not GPU-present instrumentation, and the Tauri WebView2 compositor was spot-checked visually rather than captured with PresentMon. A future release gate should repeat this profile on representative 60, 120, 144, 165, and 240 Hz panels and add native present/ETW evidence.
