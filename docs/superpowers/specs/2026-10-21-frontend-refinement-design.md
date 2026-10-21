# Frontend and layout refinement

Date: 2026-10-21
Status: approved by the user on 2026-10-21; implementation in progress
Baseline: `ba6ef4479ea71cd210099aef4e253813eeda0041` (`origin/main` when inspected)

## Goal

Make the complete frontend quieter, easier to scan, and more efficient to load while preserving Lumen's compact, keyboard-first search experience. Apply one coherent visual hierarchy across the launcher, results, previews, settings, onboarding, and Computer Use.

## Approaches

1. **Refine the existing frontend (recommended).** Improve shared primitives and the specific surfaces with duplicated information, inconsistent spacing, or unnecessary loading. Keep current routes, controls, palette, and architecture. This addresses the whole frontend with a bounded implementation.
2. **Launcher-only cleanup.** Smaller visual change, but leaves management surfaces and their loading behavior outside the pass.
3. **New visual direction.** Redesign navigation, palette, and composition. Requires broader product decisions and substantially more native/layout acceptance work; current evidence does not justify this scope.

## Findings from the current source

- `CollapsedLauncher.tsx` puts a brand tile, a text-bearing Computer Use switch, the query, optional dictation, and a shortcut hint in one composer. Refine their relative emphasis and responsive allocation so the query remains the primary element. Keep the visible mode label and accessible intent switch.
- `ExpandedWorkspace.tsx` displays a result count above the list while `SearchExperience.tsx` supplies the same count to the footer. `ContextActions.tsx` also repeats the selected filename. Reduce repeated visual information while keeping the selected result, action context, and live announcements clear.
- `CollapsedLauncher.tsx` unconditionally renders `Local runtime`, including when cloud answering or Computer Use is active. Replace that fixed assertion with a useful neutral hint or an existing authoritative state; do not infer provider readiness from UI mode.
- `ResultRow.tsx` shows filenames including their extension alongside a second extension label. Remove redundant extension chrome, preserving file glyphs, full accessible labels, source/availability information, and paths.
- `SettingsShell.tsx` statically imports all eleven settings pages. Measure production chunks, then load unvisited default pages on demand if the measurement confirms a benefit. Preserve the existing injected-page seam used by gallery/tests.
- Settings use shared 16px row padding and 24px section spacing, but provider content adds `p-5` and `gap-8`, and the Add provider action stretches across the available grid width. Align these controls with the shared rhythm and use content-sized actions with wrapping when space is constrained.
- Provider explanations include implementation language such as `floor keys` and `Go proxy health on the loopback management port`. Replace such language with accurate user-facing explanations, preserving consent, save-versus-activate, credential storage, and unavailable-state meaning.

These are source-backed cleanup opportunities. They do not establish a measured performance regression or a new responsive defect.

## Fresh build baseline

`bun install` and `bun run build` completed successfully on October 21 against the baseline above. The latter includes TypeScript checking and a production Vite build. The generated SettingsShell chunk is 149.79 kB (40.06 kB gzip), the main application chunk is 209.24 kB (71.07 kB gzip), and CSS is 63.02 kB (11.46 kB gzip). These are emitted chunk sizes, not a measurement of startup latency or total transferred code. Vite reported the existing Lottie dependency's direct-eval warning and plugin timing advice.

`bun run lint` passed with zero warnings. The full `bun run test` run completed with 91 passing files, one failing file, 801 passing tests, and two failures. Both failures were in `scripts/stage-computer-use.test.ts`: the checkout has no staged worker interpreter, so its fallback selected the host's Python 3.14.5 and staging rejected it with `Computer Use staging requires Python 3.11`. An existing uv-managed Python 3.11 is available at `C:\Users\kevin\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe`. Rerunning that file with this interpreter supplied through the existing `LUMEN_PYTHON` setting passed both tests (58.51 seconds). No source or test changes were needed. This is a failing default-environment full run plus a passing configured focused rerun, not a newly green full-suite run.

Implementation verification must supply Python 3.11 through `LUMEN_PYTHON` for commands exercising staging. Scope that setting to the verification process; do not change the user's global Python configuration. No frontend source changes, live visual capture, browser functional/performance run, or native verification have been performed for this proposal.

## Proposed design

### Shared appearance and hierarchy

Keep graphite/off-white surfaces, semantic status colors, and the existing blue focus/intent accent. Use the existing text, button, surface, radius, and motion contracts. Prefer a clear primary surface and restrained inset sections; avoid adding decorative borders, shadows, or nested cards. Align settings content to a consistent 8/12/16/24px spacing rhythm, preserving 32/36/44px control targets and rem-based text.

### Launcher, results, and preview

Make the input the strongest visual element. Quiet the mode switch and brand decoration without hiding the visible mode name or reducing its hit target. Keep the native collapsed/expanded dimensions and presentation lifecycle. Preserve all keyboard shortcuts, IME behavior, optional dictation, locked intent during active work, and focus restoration.

Show result count once in the normal visual hierarchy. Use the footer for concise operational state and a neutral useful hint; retain actionable failures and activity-policy messages. Preserve screen-reader announcements. Keep Open, Folder, Pin, and Details available, with Open visibly primary among result actions. Remove redundant extension labels and reduce metadata competition with filenames. Keep full paths accessible via the existing label/title mechanisms.

Retain the measured-width/height preview policy, bounded passive previews, selected-row capsule geometry, virtualized rows, and independent answer/result scrolling. Any changes must retain results before optional preview space.

### Settings, onboarding, and Computer Use

Keep all eleven settings destinations and the existing keyboard navigation. Tighten the navigation/content balance using the existing shell, and align action groups and sections with shared primitives. Preserve independent navigation/page scrolling at enlarged text sizes. Make loading of a newly visited page explicit inside the active panel, retaining navigation and close controls; asynchronous loading must not steal focus. Keep recoverable loading failures visible with a retry path if new lazy boundaries require one.

Apply shared spacing/typography improvements to onboarding and Computer Use where their current layouts benefit. Keep the four onboarding steps, durable-save ordering, native availability messages, independent browser/desktop consent, approval/denial controls, and Stop immediately reachable. No new capabilities or workflow steps are introduced.

### Frontend efficiency

Measure the production build before and after. Prefer a small settings-page import change when it removes unvisited code from the first Settings load. Do not broadly refactor controllers, add dependencies, or introduce generic loaders, polling, background prefetch, or memoization without measured need. Preserve existing lazy preview loading, bounded diagnostics, query subscriptions, row virtualization, and property-specific animation ownership.

## Architecture and state

Changes stay in presentation components, shared semantic styling, copy, and narrowly scoped import boundaries. Rust remains authoritative for native geometry, credentials, processes, policy, cancellation, and consent. React continues to use existing typed services and Zod-parsed events. Persisted schemas and stored preferences remain compatible. UI cleanup does not alter root admission, search ranking, preview permissions, or provider execution.

## Acceptance and verification

- Run typecheck, zero-warning lint, unit/component tests, serial installed-Edge functional tests, production build, and the existing production performance workload, in repository order where specified. Keep all thresholds intact.
- Add focused behavioral regression coverage for changed loading, status, or metadata behavior; avoid tests that merely mirror CSS classes.
- Verify dark/light/opaque/reduced-effects/reduced-motion/forced-colors presentations and 100/125/150/175/200 percent text sizes at the existing Rust-bound viewport matrix.
- Keep search, mode switch, selected result, preview/details, settings navigation, close, consent, approvals, and Stop reachable. Confirm no horizontal document overflow and that keyboard selection and the capsule remain aligned.
- Regenerate the 86-state gallery, six interaction recordings, and production profile after the final UI changes. Inspect representative launcher, settings, onboarding, and Computer Use screenshots at full resolution.
- Compare relevant production chunk sizes before/after import changes. Report measured changes rather than predicting startup or frame-rate gains.
- Report strict 120Hz and strict 240Hz results separately from cadence-aware tests. The checked-in October 16 report has strict 120Hz passing and strict 240Hz failing; it is historical evidence, not a result for this change.
- Browser fixtures verify frontend behavior only. Native WebView2/material and installed-runtime appearance require separate native evidence. Build Rust only if native source changes become necessary; such a scope change must be explained.

## Delivery boundary

The deliverable is a cohesive frontend refinement with tests, refreshed visual/performance artifacts, and an honest verification report in this worktree. Public publication and unrelated backend changes are outside this design. Design approval authorizes implementation and the necessary verification for this scope without repeated design checkpoints.

## Review checklist

- [x] Inspect architecture, recent commits, presentation code, and checked-in evidence.
- [x] Refresh clean worktree from remote main and verify no divergence.
- [x] Identify approaches, recommendation, affected components, and acceptance criteria.
- [x] Check this proposal for missing decisions, conflicting scope, and unsupported performance claims.
- [x] Receive user design approval.
- [x] Commit the approved spec and write the implementation plan.
- [ ] Implement, validate, refresh evidence, and review the final change.
