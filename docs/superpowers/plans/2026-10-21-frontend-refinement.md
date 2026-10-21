# Frontend refinement implementation plan

> Execute inline in the existing isolated worktree using executing-plans. The user approved the complete design and its verification scope; no further design checkpoints are needed.

**Goal:** Refine the whole frontend's hierarchy, layout, copy, and loading while preserving keyboard-first search and native safety boundaries.

**Architecture:** Keep existing service/store contracts. Change presentation components and shared styling, with a settings-only lazy page boundary. Leave Rust, native geometry, persistence schemas, search ranking, consent and process execution unchanged.

**Tech stack:** React 19, TypeScript, React Aria Components, Tailwind CSS v4, Motion, Bun, Vitest, installed Microsoft Edge.

## Constraints

- No new dependency, decorative animation framework, provider execution path, or native capability.
- Preserve semantic themes/status, visible focus, rem text, 32/36/44px control targets and 100–200 percent text scaling.
- Preserve selected-row geometry, passive previews, virtualization, bounded diagnostics, keyboard/IME behavior and consent/Stop reachability.
- Use existing performance budgets without changing thresholds. Distinguish browser fixture, native and installed evidence.
- Supply the existing uv Python 3.11 via process-scoped `LUMEN_PYTHON` when running staging tests.

## Task 1: Launcher and result hierarchy

Files: `CollapsedLauncher.tsx`, `SearchExperience.tsx`, `ExpandedWorkspace.tsx`, `ContextActions.tsx`, `ResultRow.tsx`, their colocated tests, and `tests/e2e/dpi-responsive.spec.ts`.

- [x] Add behavioral regressions to existing component tests: no fixed `Local runtime` assertion; filename/path accessible without duplicate extension text; a single visible result-count location with operational messages retained.
- [x] Run focused tests and confirm these assertions fail before implementation.
- [x] Quiet composer brand/mode decoration without hiding the label, losing the 32px target or constraining query width. Remove redundant extension text and the duplicate list count, retain the footer's truthful search/answer/activity state, and replace `Local runtime` with `Esc to clear` (the first Escape clears a nonempty query).
- [x] Make Open the visually emphasized result action using the existing subtle button variant. Keep the selected filename as useful action context and preserve all four actions and live announcements.
- [x] Update the responsive test's footer locator to its structural slot instead of the obsolete runtime text. Preserve all original geometry/keyboard assertions.
- [x] Rerun focused tests, then inspect launcher captures at normal and constrained sizes.

Example regression assertions:

```tsx
expect(screen.queryByText('Local runtime', {exact: true})).not.toBeInTheDocument();
expect(screen.getByText('Esc to clear')).toBeVisible();
expect(screen.queryByText('TSX', {exact: true})).not.toBeInTheDocument();
expect(screen.getByRole('row', {name: /report\.tsx.*C:/})).toBeVisible();
```

## Task 2: Coherent management layout

Files: `SettingsShell.tsx`, `SettingsNav.tsx`, `pages/ProvidersPage.tsx`, `OnboardingScene.tsx`, `ComputerUsePanel.tsx`, and `docs/architecture/management-surfaces.md`.

- [x] Reduce navigation's upper width from 260px to 224px, retaining its 148px minimum and wrapping/scroll policy. Use a consistent 24px page gutter where room permits and keep small-window geometry bounded.
- [x] Align provider section/row spacing with shared 16px padding and 24px section gaps. Keep Add provider content-sized, all actions wrapping, and profile identifiers/URLs breakable.
- [x] Replace implementation jargon with accurate language: connection status, provider switching, saving versus activation, sign-in, request counts. Preserve unavailable/error/consent and credential semantics.
- [x] Reduce oversized onboarding ornament to 64px, strengthen the title/description/support hierarchy using shared text roles. Align Computer Use card rhythm and content-sized refresh action; retain all approval/denial/Stop controls.
- [x] Use existing settings, onboarding and Computer Use component/Edge coverage for these reversible styling and copy changes; add no CSS-mirroring tests.

## Task 3: Load default settings pages on demand

Files: new `src/features/settings/SettingsPageContent.tsx`, `SettingsShell.loading.test.tsx`, `tests/e2e/settings-loading.spec.ts`, `SettingsShell.tsx`, and existing settings tests.

- [x] Test a deferred default page import: loading message remains inside the active panel, navigation/close stay usable, and resolving the import does not move focus. Test rejected imports expose a safe recovery action while another page remains reachable.
- [x] Add module-scope `lazy` declarations for the eleven default pages, with a local `Suspense` fallback and an error boundary. React caches rejected lazy imports; recovery must honestly reload the app rather than repeatedly remounting the same rejection.
- [x] Keep injected gallery/test pages outside default lazy rendering: `pages?.[page.id] ?? <SettingsPageContent page={page.id} />`, with the boundary keyed internally.
- [x] Use a fixed safe failure message and `Reload Lumen` action (`window.location.reload()`), never raw error content. Keep close/navigation outside the boundary. Switching pages resets boundary error state via the page key.
- [x] Confirm focused loading/failure tests pass and existing page navigation/focus tests remain green.
- [x] Build production and compare the SettingsShell chunk and its required imports to the recorded 149.79 kB / 40.06 kB gzip baseline. Same-dependency Vite manifest closures show initial JavaScript +513 bytes raw, and launcher plus General settings -135,696 bytes raw / -34,118 bytes gzip, with eleven separate default page chunks.

## Task 4: Complete verification and evidence

- [x] Run `bun run typecheck`, `bun run lint`, and full `bun run test` with process-scoped Python 3.11; fix failures without reducing coverage or deadlines.
- [x] Ensure 1420 and 1424 are not serving another checkout, then run `bun run test:e2e` followed by `bun run test:performance` serially against installed Edge. Full functional 133/133, strengthened settings rerun 26/26, performance 4/4.
- [x] Run `bun run build`, `bun run capture:gallery`, `bun run record:interactions`, and `bun run profile` serially. Profiling ran first against the clean source commit so generated visual evidence could not mark its source tree dirty. Inspect full-size representative results, settings, onboarding, Computer Use, light/forced-color and constrained screenshots.
- [x] Address any observed geometry, focus, lazy loading, or frame-budget regression at its cause. Re-run affected checks after changes, followed by final required checks as warranted. No runtime correction was needed after source review; the settings containment helper was strengthened and its full affected matrix rerun. Strict 240Hz remains an explicit failed result.
- [x] Update architecture docs and create `docs/reports/2026-10-21-frontend-refinement.md` with exact changes, command outcomes, chunk measurements, artifact provenance, and remaining native/strict-refresh limits.
- [x] Review the final diff and checklist, run `git diff --check`, commit the scoped source/docs/evidence, and report verified completion only when the approved deliverable is satisfied.

## Plan review

The four tasks cover launcher/results/preview preservation, management/onboarding/Computer Use consistency, measured loading efficiency, accessibility, all requested artifacts and verification. No backend scope or dependency changes are required. Existing native/package evidence is historical and will not be presented as fresh verification.
