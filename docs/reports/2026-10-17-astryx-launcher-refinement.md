# Unified UI integration and launcher refinement

## October 20 wrap-up revision

The owner subsequently reported a gray rectangular surround in both launcher states and requested a cleaner, transparent design, then asked to wrap up. The final refinement removes the logo and nested input outline, uses a restrained keyboard focus underline with a high-contrast outline fallback, removes redundant extension labels and selection bevel, and quiets the footer and outer border. The launcher has a lighter static translucent tint; opaque, reduced-effects and high-contrast preferences retain their semantic surfaces. No animation loop or interaction owner changes.

The document no longer opts its entire canvas into light/dark color schemes: those schemes now live on the existing themed application subtree. An isolated native DOM experiment confirmed that removing the root opt-in restores transmitted desktop content. Full-window native effects are also cleared for both collapsed and expanded launcher states, following the owner's explicit transparency request; settings, onboarding and gallery retain their native effects. The native policy regression covers both modes. Controlled-background attempts are diagnostic only: the initial collapsed captures reproduced the opaque surround; later attempts timed out or failed foreground/underlay admission and do not establish a final composited acceptance result.

All bundle, startup, full-suite, gallery and performance results below precede this last appearance refinement. They are retained as dated evidence, not relabelled as final-source acceptance. Wrap-up checks passed: typecheck, zero-warning lint, the focused component cases (34 cases across four files, with the obsolete bevel assertion updated and all 13 ResultGrid cases rerun), all 14 focused installed-Edge design/integration tests, the frontend production build, Rust formatting, all nine window-policy tests and the native debug build. The full strict high-refresh, Clippy/all-features Rust suite, release packaging and gallery/recording matrix has not been repeated after this last change; these items remain open at the owner's requested stopping point. This report records the worktree evidence before the owner's subsequent request to commit and publish the branch. The latest fetched GitHub main remains `3b60ba43104ec7c450423c13db4bc5ee06662e68`.

The earlier isolated native attempt `native-attempt-5/` achieved a valid capture before the final style change: three hide/show and caret reversals passed with unchanged foreground, 30 input and 120 selection samples. WebView2 is `155.0.4283.62`, at 150% DPI. Ordinary React p95 was 5.7 ms across 141 samples, input callback p95 4.7 ms, selection callback p95 5.1 ms and cadence p95 8.3 ms; no ordinary workload Long Tasks were recorded. Its strict 240 Hz subset failed and full native acceptance was unmeasured. Earlier attachment/visibility failures remain preserved. None of these results certifies the final transparency revision.

The final production bundle is recorded separately in `bundle-wrapup-transparent.json`: JavaScript 1,805,270 B raw / 534,992 B gzip; CSS 256,147 B raw / 45,077 B gzip; initial static delivery 1,309,667 B raw / 390,246 B gzip. The earlier paired startup study does not describe these changed delivery hashes. Two final browser previews and computed paint receipts are in `artifacts/native/astryx-launcher-2026-10-20/final-browser-preview/`; the document scheme is normal, the control subtree is dark, the provider background is transparent and the full-effects dark launcher tint has alpha 0.847. These previews are not native compositor evidence. Unadmitted controlled-background PNGs were moved to ignored local diagnostic storage and excluded from published evidence.

Implementation branch: `codex/astryx-launcher-refinement`, initially based on GitHub main `8ab5a6fdde39013c867d2caca314a738de23de00`, then refreshed to `3b60ba43104ec7c450423c13db4bc5ee06662e68` on October 19. The intervening changes affect CI and test fixtures, with no production application changes. All launcher work was preserved; the original stricter browser timing tolerance is retained rather than adopting the new upstream relaxation. The evidence archive supplies the pre-publication worktree patch and file hashes. Strict high-refresh acceptance remains open.

The owner subsequently prioritized Fluent UI, selected launcher controls and theming, and then supplied the broader unified UI objective. `@fluentui/react-components@9.74.9` supplies launcher and selected provider-management controls. `@astryxdesign/core@0.7.1` adds lazy, static session progress; the existing Apps SDK UI `0.2.2` supplies AI status as well as icons. All use Lumen's semantic appearance. The owned shell, React Aria virtualized results, established modal/settings ownership and typed/native services remain. The design follows [Fluent's React v9 quick start](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-quick-start--docs), [Fluent 2 accessibility](https://fluent2.microsoft.design/accessibility) and [motion guidance](https://fluent2.microsoft.design/motion). Earlier validation is historical evidence, not final-source acceptance.

## Changes

The composer now puts the search field before a quieter, explicitly named Computer Use switch. The brand tile and composer shortcut chrome are removed. The expanded palette footer composes status, the shortcut hint and the existing selection-bound actions through optional `footerActions?: ReactNode`. Open/Enter remains visible; secondary labels adapt to available space and text size. Footer status can shrink without colliding with actions at 200% text. Filename matches no longer repeat a Name badge, other sources use quiet text, and preview headings align with result typography.

One 120 ms collection opacity reveal replaces the result cascade, with an 80 ms reduced-motion duration. Selection and scrolling do not replay the reveal. Replacement, hiding and unmount cancel the owned animation and pending frame. The existing selection spring, interruption rules, input identity, native geometry, semantic materials, forced colors, services and security boundaries remain in place. Expanded keyboard routing includes the relocated mode switch in both directions.

Astryx CLI `0.7.1` is pinned as a development dependency. Initialization updated only `AGENTS.md`, with `docsError: null`, no theme/template and exactly one complete managed block. The full generated file was read. Notes outside that block retain Lumen's authority and document the later runtime integration. The final repeated initialization was byte-stable; `astryx-init-final.json` records its receipt and SHA-256. The newly authorized runtime uses a locally generated public theme with the precompiled distribution; no Astryx reset, global Theme provider or StyleX compiler is added.

## Architecture and dependency decisions

| Category | Production owner |
| --- | --- |
| Semantic colors, materials, typography, motion and preferences | Lumen tokens and the existing hydrated appearance store |
| Shell, window geometry, show/hide, native admission and Stop | Owned EinUI shell, existing typed services and Rust |
| Virtualized results, selection and preview | Existing React Aria/TanStack/Motion paths |
| Launcher buttons/tabs/choice controls, provider profile forms and gateway model selection | Fluent v9; one complete semantic theme adapter and the existing root/portal boundary |
| Core search input and draft/IME/caret lifecycle | Existing Lumen-owned native input; Fluent Input rejected for its measured rapid-input regression |
| Settings navigation and modal focus/triggers | Existing React Aria ownership; no competing focus trap or overlay |
| Agent progress and bounded history | Lazy Astryx ChatMessage/ChatToolCalls for the session phase, with lightweight Lumen history fallback |
| AI status and interface glyphs | Apps SDK UI Badge and existing LumenUiIcon |

Provider forms keep native payload validation, save-versus-activation semantics, secret clearing, async fences and modal restoration. Fields are disabled during persistence. The fixed registry picker uses native Fluent Select with stable model IDs, capability filtering and existing consent; custom URL/model changes still require Apply. Freeform upstream model names remain Input fields.

The root is the existing application element, with a transparent background and inherited type scale. Fluent's full light/dark contracts are adapted rather than replaced. Checked-control backgrounds, inverse foregrounds, disabled roles and icon colors follow Lumen. Astryx CSS loads only with the activity presentation, in an early vendor layer; its public generated theme is scoped to the region. It never mutates document theme attributes. The Apps SDK component CSS uses a local variable bridge without aggregate globals. Layer order and explicit Tailwind sources remain documented in [the design system](../architecture/design-system.md).

Git history shows Astryx dependencies before `741c049`, but no runtime source imports at that revision. The redesign removed an unused stack; there was no earlier runtime adapter to restore. This integration reuses the Lumen foundation and adds only the selected advanced presentation. No individual action is falsely labelled completed: only the native session-completed phase maps to Astryx complete; approval, stopping and stopped retain their actual state. There is no new disclosure tab stop or animation loop. A delayed or failed presentation import retains visible history and immediate approval/Stop controls.

Fluent Nav, Tree and Drawer were evaluated but their inspected package documentation warns against production use. Table/DataGrid do not improve the current profile groups or virtualized launcher. Astryx Power Search and Tree List do not justify replacing the current input or flat history. Apps SDK ShimmerText and SegmentedControl add incompatible independent motion/measurement; its Markdown renderer adds remote-image policy and eager syntax highlighting without incremental streaming. Keep escaped answer text and the existing safe file-preview renderer.

Dependency changes are pinned Fluent `9.74.9`, runtime Astryx `0.7.1`, development CLI `0.7.1`, and a narrow Keyborg `2.14.1` focus-descriptor compatibility patch. Apps SDK UI stays at the existing locked `0.2.2`, with no duplicate package or new Markdown/animation framework. Third-party permission notices are retained and included as a native bundle resource. Native Rust source, service/IPC contracts, persisted settings and executable permissions are unchanged.

## Bundle measurements

The baseline production build comes from an exact Git archive of main `8ab5a6f`, built with the existing resolved dependency versions. File hashes, exact raw bytes and per-file gzip sizes are recorded in `bundle-baseline.json`; this is a normal production build, not the diagnostic profiling output.

| Measurement | Main baseline | Final integration |
| --- | ---: | ---: |
| All emitted JavaScript | 1,433,717 B raw / 433,463 B gzip | 1,805,803 B raw / 535,135 B gzip |
| All emitted CSS | 63,025 B raw / 11,449 B gzip | 256,302 B raw / 45,131 B gzip |
| Initial HTML assets and transitive static ESM imports | 1,069,271 B raw / 329,319 B gzip | 1,310,355 B raw / 390,447 B gzip |

The initial measure excludes dynamic imports. Initial gzip delivery increases by 61,128 B (18.6%); total JavaScript increases by 101,672 B gzip. The full precompiled Astryx stylesheet is deferred with its activity module, accounting for much of the additional total CSS rather than increasing the initial CSS by that amount. This is a measured dependency cost, not a size optimization. `bundle-final.json` lists exact files and hashes; the production integration check independently intercepts the deferred activity chunk and proves approval/Stop remain available while it is delayed or fails.

Raw profiling exposed a synchronous 30-input burst regression from 0.7 ms on main to 13.2 ms with Fluent Input. The core search input therefore returns to Lumen's existing DOM-owned draft path; Fluent still supplies the other launcher controls and provider form inputs. The unchanged workload then measures 1.0 ms. A focused Profiler regression first failed with 32 commits, then passes without input-driven commits. The published input slot does not support a typed render override for a void element, so no cast, private hook or reconstructed slot tree is introduced. Earlier bundle, startup and profile results remain under `*-before-input-fix.json`; the table above uses the final input implementation.

A separate paired normal-production browser study uses 20 fresh installed-Edge processes and empty browser caches per variant, alternating order. Both builds use a valid browser onboarding record; neither exposes development diagnostics or native IPC. Windows readback remains 2560 × 1600 at 240 Hz before and after. `startup-comparison.json` retains all 40 samples and matching build hashes.

| Browser renderer bootstrap | Main baseline p50 / p95 | Integration p50 / p95 |
| --- | ---: | ---: |
| Navigation to visible search input | 208.9 / 306.2 ms | 228.8 / 269.3 ms |
| Navigation to its next callback | 211.3 / 309.3 ms | 231.4 / 271.8 ms |

The integration adds 19.9 ms at the median; p95 is 36.9 ms lower in this paired capture. These distributions do not establish a uniform startup improvement. The pre-fix candidate's separate paired study had a higher p95; raw samples retain that history rather than comparing absolute timings across studies as a causal speedup. This bounded local comparison excludes browser-process launch, native cold startup, indexing, credentials, compositor presentation and live providers. No native startup improvement is claimed.

## Earlier verification, before the final appearance revision

| Gate | Final result |
| --- | --- |
| Typecheck | Passed on the final input implementation, 2026-10-19 |
| Zero-warning lint | Passed on the final input implementation, 2026-10-19 |
| Full unit suite | 793 passed across 92 files, including the new input regression and upstream CI tests |
| Focused launcher/keyboard regressions | Included in the passing full unit suite |
| Native tooling contracts | 14 passed, including server ownership, signal termination, lost IPC and the Windows listener-only API |
| Performance-budget and evidence-generator contracts | 15 passed |
| Functional installed-Edge e2e | All 138 passed on the final input implementation; one worker and no retries |
| Production performance tests | All 9 passed: four original timed cases and five integration checks |
| Frontend production build | Passed after the final frontend gates; emitted hashes match the measured bundle and startup study |
| Native Tauri release build | Passed: unsigned release executable and NSIS installer; source-worker and packaged-resource health checks retained |
| Rust formatting / Clippy | Both passed; Clippy denies warnings |
| Rust all-features tests | Passed: 383 library tests, 26 ignored; 16 and 10 integration tests passed |
| Native offline WebView2 capture | Valid isolated subset in attempt 5; strict 240 Hz subset failed, full native gate unmeasured |
| 86-state gallery and six recordings | 86 gallery states regenerated before the last appearance revision; recordings were not regenerated |

The focused regressions cover footer action eligibility and latest selection, preserved input focus, the mode switch's keyboard order and the new collection reveal's ownership/cancellation. Existing reversal, caret/composition, reduced-motion, hidden cleanup, Computer Use approval/Stop and virtualization checks remain required. No timing threshold, sample requirement, workload or test retry policy was weakened.

The final complete frontend suites use the refreshed base and final input implementation. Functional Edge completed at 21:32:59 UTC on October 19, followed by production performance tests at 21:34:05. The full unsigned native build completed at 21:04:57, before the timed performance suite. The post-gate normal frontend rebuild produces identical measured delivery assets. The upstream refresh adds no production application changes; tracked `src/` files were compared against the preserved pre-refresh snapshot, and the new integration files were retained in place. The newly added upstream CodeQL workflow suite passes all 22 tests. Raw historical evidence keeps its actual original Git SHA rather than being relabelled. The 26 ignored Rust tests are not counted as passes or as native/live-provider acceptance.

The independent source review found missing Fluent checked-checkbox background/inverse roles; these are now mapped and verified through actual hydrated light/dark and forced-colors computed styles. The final focused checks also verify theme/typography/transparency isolation, themed modal placement and focus restoration, static Astryx icon geometry, and immediate Stop during delayed or failed presentation loading. The original four timed performance cases are unchanged; the same production profiling build additionally runs the five integration checks after those cases. This does not substitute for the complete functional matrix or native acceptance.

The initial full functional matrix overlapped part of native resource staging and debug compilation. Its constrained settings text-scale test exceeded its unchanged 30-second test timeout. The failure context and trace are preserved under `initial-e2e-failure/`; the subsequent complete 138-test run passed with the same timeout. The first unsigned native build also stopped at source worker health verification. The final full build passed source and packaged worker health, resource staging and NSIS packaging with no health comparison or deadline bypass. Functional tests overlapped the start of installer creation; all timed browser captures ran after native build completion.

The final isolated native attempt exposed a host verification limitation before attachment or timing. A controlled owned HTTP listener responds successfully, but `Get-NetTCPConnection` reports its listener state as null; a direct [GetExtendedTcpTable](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable) diagnostic returns state 0 rather than the documented LISTEN value 2. Raw observations are preserved in `listener-diagnostic.json` and `tcp-api-diagnostic.json`. The development-server helper now obtains a fresh private IPC readiness receipt from its exact Node child, checking PID, nonce, resolved source root and the actual loopback listener handle. It preserves strict-port startup, the 30-second deadline, refusal of competing servers and exact-child cleanup; normal reusable callers retain their existing CLI path. Tests reject stale identities, lost IPC and signal termination. `native-attempt-2/source-server.json` proves that source-server startup succeeded.

The WebView2 CDP ownership check now uses the documented `TCP_TABLE_OWNER_PID_LISTENER` API table, which contains listening endpoints only. Admission requires a successful call, exactly one matching loopback endpoint including rejection of competing wildcard listeners, and its PID in the freshly launched fixture's process tree. The API, address family, table class and raw row are retained in attachment evidence, including this host's anomalous state 0. `native-final/` and `native-attempt-2/` preserve the original refused captures; attempts 3 and 4 passed attachment but timed out before sampling. Attempt 5 completed the unchanged workload and all three lifecycle reversals, while failing the strict performance subset. No existing user browser profile was attached, no ordinary Lumen session was launched, and no fixture identity or native security check was bypassed.

## Performance evidence

The host is an ASUS ROG Zephyrus G16 GA605WI with AMD Ryzen AI 9 HX 370 (12 cores / 24 logical processors), approximately 31.1 GiB physical RAM, Windows 11 Pro build 26300 and AMD Radeon 890M driver `32.0.31041.1004`. Windows readback after the owner's display change confirms 2560 × 1600 at 240 Hz. Hardware and raw results are in [the task archive](../../artifacts/performance/astryx-launcher-2026-10-17/).

| Measurement | Clean-main baseline | Intermediate capture at 60 Hz | Final 240 Hz capture |
| --- | --- | --- | --- |
| Ordinary React p95 (required <3 ms) | 3.8 ms / 151 samples, failed | 3.4 ms / 151 samples, failed | 3.0 ms / 136 samples, failed |
| Input to next callback p95 | 7.6 ms | 13.7 ms | 8.4 ms |
| Selection to callback p95 | 6.7 ms | 18.0 ms | 6.2 ms |
| Hover to callback p95 | 9.0 ms | 17.5 ms | 9.8 ms |
| Nominal cadence median / p95 | 4.2 / 12.6 ms | 16.7 / 17.3 ms | 4.2 / 8.4 ms |
| Strict 120 / 240 Hz | Failed / failed | Failed / failed | Failed / failed |

The intermediate capture used a different physical mode and is not a causal before/after comparison. Separate fiber diagnostics identified ordinary React work in React Aria's collection and the owning search composition; diagnostic overhead is excluded from acceptance. No speculative performance rewrite was retained from that study.

The final capture at 03:14 UTC on October 20 also records no workload Long Tasks of at least 50 ms, zero settled/hidden animation and measurement work, and 0 px selection alignment error. Idle renderer CPU is 0.172% and JavaScript heap is 13.38 MiB; these are browser-renderer measurements, not whole native-app CPU/RSS. Edge is `155.0.4283.62`; the earlier baseline used `.60`. The unchanged 24-query phase admits 136 ordinary commits, reported without altering query count or settling time. The prior final-input capture remains in `input-optimization/`: React p95 3.3 ms, input 4.5 ms, selection 5.2 ms, hover 7.0 ms and cadence p95 16.7 ms. Both runs miss acceptance. This variation and the browser patch difference prevent causal speedup claims; final input and hover callbacks are slower than the original baseline. Exactly 3.0 ms still fails the ordinary target below 3 ms.

All timed phases run serially, without overlapping builds, traces or screenshots. The separate trace study begins only after timing is complete. The final browser profile is headless and observes approximately 238 Hz callback cadence; physical Windows readback is separately 240 Hz. Callback intervals do not measure compositor presentation or delivered FPS. A 240 Hz Windows setting alone cannot establish either strict timing gate, and a physical 120 Hz mode has not been exercised in this task.

## Remaining acceptance

The earlier integration passed the full frontend, ordinary performance-test and build gates listed above. Strict browser 120/240 Hz checks and ordinary React p95 remained failed; the valid isolated native subset also missed its timing targets. The final appearance revision has the focused verification listed at the top of this report. Full matrix, strict performance, final release packaging and complete visual evidence remain open at the owner's requested wrap-up. No production-readiness or physical 120/240 FPS claim is made. Ordinary packaged-user-session behavior, live-provider/Computer Use execution, signing, installer acceptance and physical IME/screen-reader acceptance remain unverified.
