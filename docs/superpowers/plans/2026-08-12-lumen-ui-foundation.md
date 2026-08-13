# Lumen UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the launcher, settings, and onboarding structurally bounded, adaptive, minimal, and responsive before deeper feature completion.

**Architecture:** Preserve Rust-owned window bounds and fix the shared frontend height chain. The launcher defaults to one result column, conditionally mounts inline preview from the persisted appearance policy and viewport width, and mounts the answer region only after explicit submission. Reuse the existing appearance store, typed services, React Aria behavior, and diagnostics harness.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS v4, React Aria Components, Motion, Zustand, Vitest, Playwright, Tauri 2.

## Global Constraints

- Use Bun commands only.
- Keep native window geometry in `src-tauri/src/window.rs` unchanged.
- Do not add a component library or state-management dependency.
- Search and preview stay behind the existing typed services.
- Preserve keyboard, IME, reduced-motion, high-contrast, and path-confinement behavior.
- Every production change follows a failing-test-first cycle.
- No document-level scrolling is allowed in launcher, onboarding, or settings modes.

---

### Task 1: Restore direct layout ownership

**Files:**
- Modify: `src/design-system/primitives/LumenSurface.tsx`
- Modify: `src/design-system/primitives/primitives.test.tsx`
- Modify: `src/features/settings/SettingsShell.test.tsx`
- Modify: `tests/e2e/dpi-responsive.spec.ts`

**Interfaces:**
- Consumes: existing `LumenSurfaceProps` and material decoration layers.
- Produces: a `LumenSurface` whose authored children remain direct DOM children of the material boundary.

- [ ] **Step 1: Write the failing primitive test**

Add a test that renders a `header` and `main` inside `LumenSurface`, then asserts both elements have the surface as `parentElement`; decorative spans may remain siblings.

```tsx
const {getByLabelText, getByRole} = render(
  <LumenSurface aria-label="Shell">
    <header>Header</header>
    <main>Main</main>
  </LumenSurface>,
);
const surface = getByLabelText('Shell');
expect(getByRole('banner').parentElement).toBe(surface);
expect(getByRole('main').parentElement).toBe(surface);
```

- [ ] **Step 2: Run the focused test and verify the current wrapper fails it**

Run: `bun run test -- src/design-system/primitives/primitives.test.tsx`

Expected: FAIL because both authored children are inside the anonymous `h-full w-full` wrapper.

- [ ] **Step 3: Remove the anonymous layout wrapper**

Render `{children}` directly after the three `aria-hidden` material layers. Keep the root, material classes, ref, data attributes, and decorations unchanged.

- [ ] **Step 4: Add settings/onboarding containment assertions**

Extend settings coverage to assert the header and vertical `Tabs` own the two grid rows. Extend the live 800x540 and settings 880x600 Playwright cases to assert the surface, composer/header, content scroll owner, action/footer, and close control stay within viewport bounds.

- [ ] **Step 5: Run focused verification**

Run:

```powershell
bun run test -- src/design-system/primitives/primitives.test.tsx src/features/settings/SettingsShell.test.tsx
bun run test:e2e -- tests/e2e/dpi-responsive.spec.ts
```

Expected: PASS with no document scroll overflow.

- [ ] **Step 6: Commit**

```powershell
git add src/design-system/primitives/LumenSurface.tsx src/design-system/primitives/primitives.test.tsx src/features/settings/SettingsShell.test.tsx tests/e2e/dpi-responsive.spec.ts
git commit -m "fix: restore bounded surface layout"
```

### Task 2: Remove the idle answer block

**Files:**
- Modify: `src/features/launcher/SearchExperience.tsx`
- Modify: `src/features/launcher/SearchExperience.test.tsx`
- Modify: `src/features/answer/AnswerPanel.tsx`
- Modify: `src/features/answer/AnswerPanel.test.tsx`
- Modify: `tests/e2e/search-experience.spec.ts`

**Interfaces:**
- Consumes: `useQueryStore.submitted` and `AnswerState.phase`.
- Produces: no answer section before submission; phase-correct Stop, Retry, and Copy actions afterward.

- [ ] **Step 1: Write failing interaction tests**

Add tests proving that typing search text does not render `AI answer` or `answer-region`; pressing Enter mounts one answer region; idle `AnswerPanel` has neither Retry nor Copy; error/completed/cancelled states expose Retry; waiting/streaming expose Stop.

- [ ] **Step 2: Verify the tests fail for the current permanent panel**

Run:

```powershell
bun run test -- src/features/launcher/SearchExperience.test.tsx src/features/answer/AnswerPanel.test.tsx
```

Expected: FAIL because the idle panel and Retry control are currently rendered.

- [ ] **Step 3: Gate the panel on explicit submission**

Pass `null` as `answerPanel` until `submittedQuery.trim()` is non-empty. Preserve the current controller lifecycle so submission, retry, cancellation, and stable streaming still work.

- [ ] **Step 4: Gate footer actions by phase**

Compute:

```ts
const canStop = answer.phase === 'waiting' || answer.phase === 'streaming';
const canRetry = answer.phase === 'error' || answer.phase === 'cancelled' || answer.phase === 'completed';
```

Render Copy only when `hasAnswer` and reset the copied label when `answer.text` changes.

- [ ] **Step 5: Run focused unit and browser tests**

Run:

```powershell
bun run test -- src/features/launcher/SearchExperience.test.tsx src/features/answer/AnswerPanel.test.tsx
bun run test:e2e -- tests/e2e/search-experience.spec.ts
```

Expected: PASS; search remains available when answer submission fails.

- [ ] **Step 6: Commit**

```powershell
git add src/features/launcher/SearchExperience.tsx src/features/launcher/SearchExperience.test.tsx src/features/answer/AnswerPanel.tsx src/features/answer/AnswerPanel.test.tsx tests/e2e/search-experience.spec.ts
git commit -m "fix: disclose answers only after submission"
```

### Task 3: Implement adaptive preview policy

**Files:**
- Modify: `src/app/AppProviders.tsx`
- Modify: `src/app/AppProviders.test.tsx`
- Modify: `src/features/launcher/ExpandedWorkspace.tsx`
- Create: `src/features/launcher/ExpandedWorkspace.test.tsx`
- Modify: `tests/e2e/search-experience.spec.ts`
- Modify: `tests/e2e/dpi-responsive.spec.ts`

**Interfaces:**
- Consumes: `AppearanceSettings.preview` (`automatic | always | never`) and native `matchMedia` viewport queries.
- Produces: exported `useMediaPreference(query: string): boolean`; inline preview mounting rules; unchanged details-dialog path.

- [ ] **Step 1: Write failing preview-policy tests**

Cover this matrix:

| Policy | 720 px | 800 px | 960 px |
| --- | --- | --- | --- |
| automatic | hidden | hidden | mounted |
| always | hidden | mounted | mounted |
| never | hidden | hidden | hidden |

Assert `Alt+Enter` still opens the details dialog for all policies.

- [ ] **Step 2: Verify failure**

Run:

```powershell
bun run test -- src/app/AppProviders.test.tsx src/features/launcher/ExpandedWorkspace.test.tsx
bun run test:e2e -- tests/e2e/search-experience.spec.ts tests/e2e/dpi-responsive.spec.ts
```

Expected: FAIL because the current preview ignores the persisted policy and appears at 800 px.

- [ ] **Step 3: Reuse the existing media subscription**

Export the existing `useMediaPreference` helper from `AppProviders.tsx`. In `ExpandedWorkspace`, read the preview policy once and compute:

```ts
const atMinimumPreviewWidth = useMediaPreference('(min-width: 760px)');
const atAutomaticPreviewWidth = useMediaPreference('(min-width: 900px)');
const showInlinePreview = preview === 'always'
  ? atMinimumPreviewWidth
  : preview === 'automatic' && atAutomaticPreviewWidth;
```

Mount `LazyPreviewPane` only when `showInlinePreview` is true and change the result/preview grid to two columns only for that state.

- [ ] **Step 4: Run focused verification**

Run the commands from Step 2. Expected: PASS with zero preview IPC/mount when policy is `never` or width is below its threshold.

- [ ] **Step 5: Commit**

```powershell
git add src/app/AppProviders.tsx src/app/AppProviders.test.tsx src/features/launcher/ExpandedWorkspace.tsx src/features/launcher/ExpandedWorkspace.test.tsx tests/e2e/search-experience.spec.ts tests/e2e/dpi-responsive.spec.ts
git commit -m "feat: add adaptive preview disclosure"
```

### Task 4: Wire compact result density

**Files:**
- Modify: `src/app/AppProviders.tsx`
- Modify: `src/design-system/global.css`
- Modify: `src/features/results/ResultRow.tsx`
- Modify: `src/features/results/useResultVirtualizer.ts`
- Create: `src/features/results/useResultVirtualizer.test.tsx`
- Modify: `src/features/results/ResultGrid.test.tsx`
- Modify: `tests/e2e/search-experience.spec.ts`

**Interfaces:**
- Consumes: persisted `AppearanceSettings.density`.
- Produces: `data-density` on the application root; comfortable 58 px and compact 46 px row contracts used by both CSS and virtualization.

- [ ] **Step 1: Write failing density tests**

Assert the application root exposes the hydrated density, compact rows measure below comfortable rows, and a 10,000-row virtual list uses the matching estimate without overlap.

- [ ] **Step 2: Verify failure**

Run:

```powershell
bun run test -- src/app/AppProviders.test.tsx src/features/results/useResultVirtualizer.test.tsx src/features/results/ResultGrid.test.tsx
```

- [ ] **Step 3: Add one shared row-height contract**

Export `comfortableResultHeight = 58` and `compactResultHeight = 46`. Pass the selected height into `useResultVirtualizer`; use `--lumen-result-row-height` from `data-density` for the rendered minimum height. Do not subscribe once per row.

- [ ] **Step 4: Verify unit and browser behavior**

Run the Step 2 tests plus the focused density E2E. Expected: PASS with stable keyboard selection and virtualization.

- [ ] **Step 5: Commit**

```powershell
git add src/app/AppProviders.tsx src/design-system/global.css src/features/results/ResultRow.tsx src/features/results/useResultVirtualizer.ts src/features/results/useResultVirtualizer.test.tsx src/features/results/ResultGrid.test.tsx tests/e2e/search-experience.spec.ts
git commit -m "feat: apply launcher result density"
```

### Task 5: Remove rapid-input long tasks

**Files:**
- Modify: `src/features/diagnostics/diagnostics.metrics.ts`
- Modify: `src/features/diagnostics/diagnostics.metrics.test.ts`
- Modify: `src/features/launcher/SearchInput.tsx`
- Modify: `src/features/launcher/CollapsedLauncher.test.tsx`
- Modify: `tests/e2e/performance.spec.ts`

**Interfaces:**
- Consumes: existing `measureAfterPaint(name, startedAt)` calls and diagnostics buffers.
- Produces: the same bounded diagnostics samples without one expensive User Timing measure per synthetic input event.

- [ ] **Step 1: Reproduce the failure**

Run:

```powershell
bun run test:e2e -- tests/e2e/performance.spec.ts -g "warm launcher"
```

Expected: FAIL because the 30-event rapid input burst records a browser long task around 69-70 ms.

- [ ] **Step 2: Add the smallest diagnostics regression test**

Use fake `requestAnimationFrame` and `performance.measure`. Schedule several `measureAfterPaint` samples in one frame, flush the frame, and assert all local samples are captured without invoking `performance.measure` for each sample.

- [ ] **Step 3: Remove redundant User Timing writes**

Keep the bounded in-memory diagnostics buffer used by the overlay and profiler. Do not call `performance.measure` per interaction because no production consumer reads those named entries. Preserve cancellation and one timing sample per requested measurement.

- [ ] **Step 4: Re-run the focused performance gate**

Run the command from Step 1. Expected: PASS with 30 input samples and zero browser long tasks.

- [ ] **Step 5: Run the complete frontend gate**

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
```

Expected: all commands exit 0 with no warnings.

- [ ] **Step 6: Regenerate UI evidence**

```powershell
bun run capture:gallery
bun run record:interactions
bun run profile
```

Inspect the contact sheet, six recordings, and `artifacts/performance/profile-summary.json`; reject clipped controls, idle answer chrome, hidden-preview work, or budget regressions.

- [ ] **Step 7: Commit**

```powershell
git add src/features/diagnostics/diagnostics.metrics.ts src/features/diagnostics/diagnostics.metrics.test.ts src/features/launcher/SearchInput.tsx src/features/launcher/CollapsedLauncher.test.tsx tests/e2e/performance.spec.ts artifacts
git commit -m "perf: keep launcher input inside frame budget"
```
