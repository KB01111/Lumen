# PR 6 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address every concrete correctness finding currently posted on PR #6 without broadening the redesign scope.

**Architecture:** Keep native geometry ownership in the existing shared `WindowService` and mirror route-owned gallery/onboarding modes into `useLauncherStore`. Preserve provider error text at the answer boundary, and propagate invalid result selection back through the existing selection callback so preview, actions, and announcements share one valid selection.

**Tech Stack:** React 19, TypeScript, Zustand, React Aria Components, Vitest, Testing Library, Tauri 2.

## Global Constraints

- Use Bun commands and the checked-in `bun.lock`; do not use npm or yarn.
- Keep native window sizes in `src-tauri/src/window.rs`; frontend code requests typed modes only.
- Do not add Tauri shell permissions or provider-specific calls to React.
- Follow test-driven development: each behavioral fix starts with a focused failing test.

---

### Task 1: Preserve route-owned native window modes

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/features/gallery/VisualStateGallery.tsx`
- Modify: `src/features/onboarding/OnboardingFlow.test.tsx`
- Modify: `src/features/onboarding/OnboardingFlow.tsx`

**Interfaces:**
- Consumes: `WindowService.show(mode)` and `useLauncherStore.getState().show(mode)`.
- Produces: gallery and onboarding routes that retain `gallery` or `onboarding` ownership even when native presentation is reactivated or rejected.

- [ ] **Step 1: Write failing gallery and onboarding regression tests**

Add an App test that injects a reactivatable browser window service into `?gallery=1&scenario=collapsed-idle`, then asserts both the service snapshot and launcher store return to `gallery` after a collapsed shortcut event. Add an onboarding test whose window service rejects `show('onboarding')`, then assert the launcher store still owns `onboarding`.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `bun run test -- src/app/App.test.tsx src/features/onboarding/OnboardingFlow.test.tsx`

Expected: the gallery test observes collapsed/inactive injected geometry, and the onboarding rejection test observes a rolled-back launcher mode.

- [ ] **Step 3: Route gallery through the App-owned service and synchronize both route modes before native show**

Pass `windowService` from `App` into `VisualStateGallery`, remove the gallery's second native service, and issue the gallery show through that shared instance after setting `useLauncherStore` to `gallery`. In onboarding, set the store to `onboarding` before calling `windowService.show('onboarding')`, swallowing only the presentation rejection because the mounted route remains authoritative.

- [ ] **Step 4: Rerun the focused tests**

Run: `bun run test -- src/app/App.test.tsx src/features/onboarding/OnboardingFlow.test.tsx`

Expected: both files pass.

### Task 2: Preserve provider-neutral answer errors

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/features/answer/AnswerPanel.test.tsx`
- Modify: `src/features/answer/AnswerPanel.tsx`
- Modify: `tests/e2e/search-experience.spec.ts`

**Interfaces:**
- Consumes: `AnswerState.error` when `phase === 'error'` and the existing `UnavailableAnswerService` outside Tauri.
- Produces: the exact typed service error in the stable answer region, with the current generic copy only as a missing-error fallback and no raw Tauri bridge exception in browser development.

- [ ] **Step 1: Add and run a failing error-message test**

Render an error answer with `error: 'The local runtime is still loading.'` and assert that exact message appears in `answer-region`.

Run: `bun run test -- src/features/answer/AnswerPanel.test.tsx`

Expected: FAIL because the panel currently replaces the message with generic retry copy.

- [ ] **Step 2: Render the typed error with a safe fallback and rerun the test**

Use `answer.error ?? 'The answer could not be completed. You can retry without interrupting local search.'` for the error phase.

Select `UnavailableAnswerService` in `App` when `isNativeRuntime()` is false, and assert its provider-neutral message in the App and browser end-to-end tests.

Run: `bun run test -- src/features/answer/AnswerPanel.test.tsx`

Expected: PASS.

### Task 3: Clear invalid result selection at the source

**Files:**
- Modify: `src/features/results/ResultGrid.test.tsx`
- Modify: `src/features/results/ResultGrid.tsx`

**Interfaces:**
- Consumes: `selectedId`, result availability, and `onSelectionChange`.
- Produces: `onSelectionChange(null)` when the requested ID is missing or unavailable, allowing preview, actions, announcements, and the grid to converge on the same selection.

- [ ] **Step 1: Add and run a failing selection-normalization test**

Render a permission-denied selected result with an `onSelectionChange` spy and assert the callback receives `null`.

Run: `bun run test -- src/features/results/ResultGrid.test.tsx`

Expected: FAIL because invalid selection is currently suppressed only inside the grid.

- [ ] **Step 2: Propagate invalid selection and rerun the test**

Add a layout effect that calls `onSelectionChange(null)` only when a non-null requested selection resolves to `null`.

Run: `bun run test -- src/features/results/ResultGrid.test.tsx`

Expected: PASS without firing for an already-null selection.

### Task 4: Verify and publish the review patch

**Files:**
- Verify all modified source, test, and plan files.
- Modify if required by baseline verification: raw-CSS contract tests whose LF-only literals fail on the repository's Windows CRLF checkout.

**Interfaces:**
- Consumes: repository verification commands and PR #6 head branch `codex/lumen-tailwind-einui`.
- Produces: one Conventional Commit pushed to the existing PR branch.

- [ ] **Step 1: Run the full frontend verification gate**

Run in order: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:e2e`.

Expected: every command exits 0 with no warnings or failed tests.

If the raw-CSS contract tests fail only because Vite preserves CRLF from the Windows checkout, normalize `\r\n` to `\n` in the test inputs without changing production CSS.

- [ ] **Step 2: Inspect the final diff and whitespace**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only the intended review-fix files.

- [ ] **Step 3: Commit and push the existing PR head**

Commit message: `fix: address launcher review feedback`

Push detached `HEAD` to `origin/codex/lumen-tailwind-einui` only after confirming the remote head remains the reviewed base commit.
