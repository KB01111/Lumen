# Frontend refinement verification

Date: 2026-10-21
Status: review fixes verified functionally; current performance gates fail; native/installed acceptance remains separate
Baseline: `ba6ef4479ea71cd210099aef4e253813eeda0041`
Original verified runtime source: `d6f80c30545e79cac020e4bc07668f19d4e3fccf`
Review fixes runtime source: `190f5fa787dc5f02cadd05acf01b0020db82ca99`
Final follow-up runtime source: `d8666e11fcd6fdca56d388bdd025d59caea8f71b`

## Resulting behavior

The composer keeps the query visually primary with an unboxed neutral brand mark, tighter gaps and a bounded visible mode label. Result rows keep filename, path, source and availability while dropping the duplicate file-extension badge. The filename's actual final suffix stays visible beside its truncating basename. The normal result count appears once in the footer, including alongside an active activity-policy message. The Escape hint follows the live draft: `Esc to clear` for nonempty input and `Esc to close` for empty input. Open has a subtle button surface while secondary actions stay quiet. Full paths, accessible row counts and live announcements remain available.

Settings navigation caps at 224px instead of 260px, leaving more content width, with 24px page gutters and independent scrollports. Provider rows use the common 16px padding and 24px section rhythm; Add provider and Refresh targets retain their natural action width. Provider copy explains connections, switching, sign-in and request counts without internal implementation jargon. Onboarding keeps its four scenes and anchored actions, with a smaller 64px ornament and clearer title/description/support hierarchy.

All eleven default settings pages now load on first visit. Loading and page failures stay inside the active panel, leaving navigation, heading, persistence notices and Close usable. Loading does not request focus. Switching pages clears a failed panel. Reload Lumen provides an honest recovery from a rejected import, which React otherwise caches. The gallery's injected service-backed pages keep their existing seam. Gallery capture now waits for the loading message to disappear before taking its screenshot.

Rust and native window dimensions are unchanged. Search/preview services, persisted schemas, credentials, policy, consent, provider execution, target admission, approvals and independent Stop retain their existing ownership. No dependencies, animation systems or providers were added.

## Production import graph comparison

The baseline was rebuilt from a `git archive` of the baseline commit into an ignored temporary source directory, using the same installed dependencies and Vite configuration. Both builds emitted Vite manifests. The comparison follows static JavaScript imports recursively, deduplicates emitted files, and sums raw bytes and gzip bytes per file. Dynamic imports are included only for the explicitly measured route. This measures emitted code needed by a route, not network latency, runtime startup time, native compositor presentation or total application size.

| JavaScript closure | Baseline raw bytes | Refined raw bytes | Baseline gzip bytes | Refined gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial application | 1,006,568 | 1,007,738 | 317,953 | 319,304 |
| Application plus General settings | 1,162,723 | 1,027,684 | 360,693 | 326,957 |
| Additional code to open General settings | 156,155 | 19,946 | 42,740 | 7,653 |

The combined General settings closure removes 135,039 raw bytes and 33,736 gzip bytes. The initial closure changes by +1,170 raw bytes and +1,351 gzip bytes. Eleven default page chunks remain separate. These measurements were refreshed after the final review fixes. A final remeasurement of the emitted baseline/current files confirmed the artifact totals; the table above replaces stale baseline gzip values retained from the earlier report. Detailed filenames and measurement method are in `artifacts/performance/frontend-refinement-bundle-size.json`.

## Original verification

- `bun run typecheck`: passed.
- `bun run lint`: passed with zero warnings, including the updated capture script and new loading tests.
- `bun run test`: 93 files and 807 tests passed. Staging tests use the existing uv-managed Python 3.11 interpreter through process-scoped `LUMEN_PYTHON`; the user's global Python configuration is unchanged.
- `bun run build`: passed. The existing Lottie dependency direct-eval warning remains.
- Focused Edge module-loading tests: two passed. A delayed Providers module retains navigation/Close and navigation focus; an aborted Diagnostics module is contained, permits opening Privacy, and loads successfully after Reload Lumen.
- `bun run test:e2e`: all 133 installed-Edge tests passed in 18.0 minutes, using one worker with no retries. Coverage includes all six presentation modes, Rust-bound viewport/text-scale matrices, keyboard/IME behavior, selection/preview geometry, all management pages, provider dialogs and Computer Use safety actions.
- `bun run test:performance`: all four production-profiling Edge tests passed in 23.6 seconds, retaining existing budgets. The 80-sample hover study measured 4.70ms p95 against its 6.30ms observed-cadence budget. This callback measurement is not compositor presentation proof.
- The added unit regressions were observed failing against the original behavior before implementation: duplicate result count, duplicate extension label, suspended shell and uncontained page error. Existing tests retain their behavior and thresholds. The loading unit test waits for the existing page entrance before asserting visibility.

Independent read-only source review found no actionable Critical, Important or Minor issues. A subsequent acceptance audit strengthened the existing settings containment helper to await loaded content, reject the page-load failure fallback, and require an actual control before measurement; an empty loading panel cannot now produce a vacuous pass. The affected 26 settings cases passed in a separate 13.2-minute rerun across all four window sizes, six presentation modes, eleven pages and five text scales. The reviewer also checked this strengthening and found no issues.

## Original profile

`bun run profile` passed all 23 cadence-aware checks against the runtime source commit above, with `sourceWorktreeDirty: false`. Profiling ran before screenshot/recording capture, with no concurrent GPU test workload. It used headless Microsoft Edge 155.0.4283.62, the production profiling renderer, an 800x540 viewport and AMD Radeon 890M graphics (driver 32.0.32015.7029). The observed rAF estimate was 238Hz, with a 4.40ms p95 nominal frame interval; these are browser callback observations rather than native display-presentation measurements.

| Measurement | Result |
| --- | ---: |
| Warm launcher p95 | 3.40ms |
| Input to next actual rAF callback p95 | 5.00ms |
| Selection to callback p95 | 4.40ms |
| Hover to callback p95 | 4.70ms |
| Ordinary React commit p95 | 1.60ms |
| Selection alignment error | 0px |
| Settled/hidden selection measurements | 0 / 0 |
| Settled/hidden animations | 0 / 0 |
| Settled/hidden active-work indicators | 0 / 0 |
| Ordinary browser long tasks over 50ms | 0 |
| Idle CPU estimate | 0.15% |
| JavaScript heap | 11.98MiB |

Strict 120Hz passed. Strict 240Hz failed its cadence, input, selection and hover checks; React commit and synchronous-work checks passed. Neither budgets nor thresholds were modified. These results support the existing cadence-aware browser gate, not a strict 240Hz or native compositor claim. Raw samples, graphics/environment eligibility, checks and a separate post-measurement interaction trace are retained in `artifacts/performance/profile-summary.json` and `artifacts/performance/interaction-trace.zip`.

## Original visual evidence

- `bun run capture:gallery`: all 86 states captured, plus the contact sheet and manifest. Inspected the contact sheet and full-size expanded results, General settings, Providers, onboarding Welcome, Computer Use approval, light theme, forced-colors theme and constrained work-area captures. No new visual correction was required. Partially visible list/card content belongs to the existing bounded scrollports; reachability is covered by the Edge matrices.
- `bun run record:interactions`: all six browser studies regenerated. Their existing automation exercises search/selection, settings routing, onboarding, answer submission, approvals/denial/Stop, and activity/provider states. FFprobe confirmed VP8 at 1120x760, and FFmpeg decoded every recording without errors.

| Recording | Duration |
| --- | ---: |
| launcher-search.webm | 8.32s |
| settings-routing.webm | 8.56s |
| onboarding.webm | 5.44s |
| answer-submission.webm | 5.16s |
| answer-approval-states.webm | 10.76s |
| activity-provider-states.webm | 10.88s |

The original screenshot and recording manifests named runtime source `d6f80c30545e79cac020e4bc07668f19d4e3fccf`; all 86 capture entries and six recording entries were checked against that SHA and their nonempty files. The original profile used the same SHA. The review follow-up refreshes this evidence for the corrected runtime below.

## PR #30 review follow-up

All three inline findings were valid and fixed in `190f5fa787dc5f02cadd05acf01b0020db82ca99`:

- Long filenames now truncate only their basename, keeping the actual final suffix visible in the same visual filename. The accessible full filename/path remains unchanged; extension metadata cannot substitute a different suffix.
- Active activity-policy text now appears alongside the supplied launcher status, keeping the result count visible exactly once through pause/resume.
- The Escape hint uses a boolean selected from the live draft, including empty-draft/committed-query divergence during composition and the retained exiting workspace.

Fresh typecheck, zero-warning lint and production build passed. All 809 unit/component tests in 93 files passed with process-scoped Python 3.11. The focused tests first reproduced all three findings, then passed after the fixes. Edge also verified that a long basename actually clips while its `.docx` suffix fits inside the filename bounds at 720px width.

The full serial Edge run passed 132 cases in 35.2 minutes. Its combined 55-page/scale constrained matrix exhausted the default 30-second test deadline during the fifth scale; the trace showed successful containment assertions through Local AI at 200% before the deadline. That matrix is now five independent tests, one per text scale, retaining every page, assertion and the original default deadline. All five passed in 36.8 seconds (6.8–7.2 seconds each). The resulting 137-case suite was covered by the 132-case full-run success plus this five-case focused run; it was not rerun as one command after splitting the matrix. No performance or layout tolerance was relaxed.

All 86 gallery captures and six recordings were refreshed against the review-fix runtime SHA. The contact sheet, expanded-results and long-filename captures were visually inspected, manifests/source SHAs and nonempty screenshot files were verified, and all six recordings decoded successfully with FFmpeg. The later evidence and test commits leave runtime sources unchanged.

### Earlier review-fix performance observations

The fresh performance evidence supersedes the original passing results above. It does **not** establish current performance acceptance:

- `bun run test:performance`: the ready-indicator case passed, but input-to-next-frame p95 was 11.4ms against a 6.7ms cadence budget, failing the ordinary-interactions case. The two later cases did not run after that failure; a focused run subsequently passed both hover/idle/heap and static-palette cases. Hover p95 was 8.7ms against a 13.534ms observed-cadence budget.
- `bun run profile`: 22 of 23 cadence-aware checks passed against clean source `1d123bcf0ef54064c8d7625578e5aa36c211b9c1`. React commit p95 was 4.2ms against 3ms, so the profile failed. Warm launcher p95 was 14.9ms, input-to-next-frame 12.6ms, selection 7.3ms and hover 9.1ms. The sampled frame-interval p95 was 16.7ms. Both strict 120Hz and strict 240Hz failed. Raw samples and the separate interaction trace are retained in the refreshed profile artifacts.
- A diagnostic control temporarily restored only the three changed production components from pre-fix `af06108`, leaving the test workload/configuration unchanged. The same performance command failed React commit p95 at 4.4ms against 3ms. The corrected components were then restored from HEAD. This control shows that the pre-fix components also miss the gate in this session; it does not prove the source of timing variation or rule out every regression.

No budgets, retries, animation policy, dependencies or native code were changed. Performance acceptance remains unresolved, and the PR must not be described as fully green or merge-ready from this local evidence. `artifacts/performance/review-verification.json` records these command outcomes alongside the raw profile.

## Final review follow-up

Five subsequent inline comments were also valid (two describe the same suffix overflow). They are addressed in `d8666e1`:

- An oversized suffix now has `max-w-full` and truncation, preserving ordinary extensions while containing a 200-character suffix at 520x340. Edge observed the overflow before the fix and verified clipping/containment afterward, with the exact full filename and accessible row label retained.
- The footer uses an external boolean snapshot of the actual input value, subscribing to input events and programmatic query-store updates. It therefore reflects pending input before deferred search admission. Stable subscriptions avoid rerenders when empty/nonempty presence is unchanged. A frozen-frame regression reproduced the lag and verifies deletion, pending input and Escape clearing.
- The filename assertion is anchored to reject appended text, and the Edge geometry assertion also checks that the suffix does not overlap the basename.

Fresh typecheck, zero-warning lint, production build and all **810 unit/component tests** passed. All **34 affected Edge tests** passed in 7.1 minutes across search/results, accessibility/IME and the six-mode viewport/text-scale matrices. The two focused ordinary/oversized suffix cases also passed. The final functional suite has 138 cases; unchanged settings coverage comes from the full run and split-case verification described above, rather than another complete 138-case run.

All 86 captures and six recordings were refreshed again for `d8666e1`; manifests and screenshot files were verified and all six recordings decoded successfully. Runtime sources remain unchanged by the later fixture/evidence commits.

Final performance acceptance still fails. On the final runtime, `bun run test:performance` passed the ready-indicator case but failed ordinary React commit p95 at **3.4ms against 3ms**; the later two cases did not run in that final command. Their earlier focused passes are recorded above. The final clean-source profile (`00968db8836915846aa2cdde0e776609e36927f9`) passed **22 of 23** checks, failing React commit p95 at **3.6ms against 3ms**. Warm launcher p95 was 4.8ms, input-to-next-frame 7.4ms, selection 6ms and hover 12.4ms. Both strict 120Hz and 240Hz failed. The refreshed raw profile/trace and verification JSON preserve these limits. No further performance reruns or threshold changes were used to obtain a passing result.

## Evidence boundaries

Browser tests and gallery/recording fixtures establish frontend behavior; simulated provider/Computer Use states do not execute native input or call live providers. Native WebView2 material, installed appearance, signing, provider availability and live execution are separate acceptance gates. This frontend pass does not change those gates or refresh the historical native acceptance report. Rust, native geometry, security capabilities and dependency files are unchanged, so no native build or installer acceptance was performed. This report is scoped frontend evidence, not a claim of complete application production readiness.
