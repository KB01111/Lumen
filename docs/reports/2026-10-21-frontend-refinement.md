# Frontend refinement verification

Date: 2026-10-21
Status: approved frontend scope completed and verified; native/installed acceptance and strict 240Hz remain separate limits
Baseline: `ba6ef4479ea71cd210099aef4e253813eeda0041`
Verified runtime source: `d6f80c30545e79cac020e4bc07668f19d4e3fccf`

## Resulting behavior

The composer keeps the query visually primary with an unboxed neutral brand mark, tighter gaps and a bounded visible mode label. Result rows keep filename, path, source and availability while dropping the duplicate file-extension badge. The normal result count appears once in the footer; search, answering and activity-policy messages retain their existing priority. `Esc to clear` replaces the unsupported unconditional `Local runtime` assertion. Open has a subtle button surface while secondary actions stay quiet. Full paths, accessible row counts and live announcements remain available.

Settings navigation caps at 224px instead of 260px, leaving more content width, with 24px page gutters and independent scrollports. Provider rows use the common 16px padding and 24px section rhythm; Add provider and Refresh targets retain their natural action width. Provider copy explains connections, switching, sign-in and request counts without internal implementation jargon. Onboarding keeps its four scenes and anchored actions, with a smaller 64px ornament and clearer title/description/support hierarchy.

All eleven default settings pages now load on first visit. Loading and page failures stay inside the active panel, leaving navigation, heading, persistence notices and Close usable. Loading does not request focus. Switching pages clears a failed panel. Reload Lumen provides an honest recovery from a rejected import, which React otherwise caches. The gallery's injected service-backed pages keep their existing seam. Gallery capture now waits for the loading message to disappear before taking its screenshot.

Rust and native window dimensions are unchanged. Search/preview services, persisted schemas, credentials, policy, consent, provider execution, target admission, approvals and independent Stop retain their existing ownership. No dependencies, animation systems or providers were added.

## Production import graph comparison

The baseline was rebuilt from a `git archive` of the baseline commit into an ignored temporary source directory, using the same installed dependencies and Vite configuration. Both builds emitted Vite manifests. The comparison follows static JavaScript imports recursively, deduplicates emitted files, and sums raw bytes and gzip bytes per file. Dynamic imports are included only for the explicitly measured route. This measures emitted code needed by a route, not network latency, runtime startup time, native compositor presentation or total application size.

| JavaScript closure | Baseline raw bytes | Refined raw bytes | Baseline gzip bytes | Refined gzip bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial application | 1,006,568 | 1,007,081 | 320,638 | 321,825 |
| Application plus General settings | 1,162,723 | 1,027,027 | 363,606 | 329,488 |
| Additional code to open General settings | 156,155 | 19,946 | 42,968 | 7,663 |

The combined General settings closure removes 135,696 raw bytes and 34,118 gzip bytes. The initial closure changes by +513 raw bytes and +1,187 gzip bytes. The SettingsShell chunk itself changes from 149.79 kB / 40.06 kB gzip to 11.32 kB / 3.88 kB gzip, with eleven separate default page chunks; the closure totals above account for shared code moving between chunks. Detailed filenames and measurement method are in `artifacts/performance/frontend-refinement-bundle-size.json`.

## Verification

- `bun run typecheck`: passed.
- `bun run lint`: passed with zero warnings, including the updated capture script and new loading tests.
- `bun run test`: 93 files and 807 tests passed. Staging tests use the existing uv-managed Python 3.11 interpreter through process-scoped `LUMEN_PYTHON`; the user's global Python configuration is unchanged.
- `bun run build`: passed. The existing Lottie dependency direct-eval warning remains.
- Focused Edge module-loading tests: two passed. A delayed Providers module retains navigation/Close and navigation focus; an aborted Diagnostics module is contained, permits opening Privacy, and loads successfully after Reload Lumen.
- `bun run test:e2e`: all 133 installed-Edge tests passed in 18.0 minutes, using one worker with no retries. Coverage includes all six presentation modes, Rust-bound viewport/text-scale matrices, keyboard/IME behavior, selection/preview geometry, all management pages, provider dialogs and Computer Use safety actions.
- `bun run test:performance`: all four production-profiling Edge tests passed in 23.6 seconds, retaining existing budgets. The 80-sample hover study measured 4.70ms p95 against its 6.30ms observed-cadence budget. This callback measurement is not compositor presentation proof.
- The added unit regressions were observed failing against the original behavior before implementation: duplicate result count, duplicate extension label, suspended shell and uncontained page error. Existing tests retain their behavior and thresholds. The loading unit test waits for the existing page entrance before asserting visibility.

Independent read-only source review found no actionable Critical, Important or Minor issues. A subsequent acceptance audit strengthened the existing settings containment helper to await loaded content, reject the page-load failure fallback, and require an actual control before measurement; an empty loading panel cannot now produce a vacuous pass. The affected 26 settings cases passed in a separate 13.2-minute rerun across all four window sizes, six presentation modes, eleven pages and five text scales. The reviewer also checked this strengthening and found no issues.

## Final profile

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

## Refreshed visual evidence

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

The screenshot and recording manifests both name runtime source `d6f80c30545e79cac020e4bc07668f19d4e3fccf`; all 86 capture entries and six recording entries were checked against that SHA and their nonempty files. The profile uses the same SHA. Final evidence/documentation changes do not alter runtime sources, tests, build configuration or dependencies.

## Evidence boundaries

Browser tests and gallery/recording fixtures establish frontend behavior; simulated provider/Computer Use states do not execute native input or call live providers. Native WebView2 material, installed appearance, signing, provider availability and live execution are separate acceptance gates. This frontend pass does not change those gates or refresh the historical native acceptance report. Rust, native geometry, security capabilities and dependency files are unchanged, so no native build or installer acceptance was performed. This report is scoped frontend evidence, not a claim of complete application production readiness.
