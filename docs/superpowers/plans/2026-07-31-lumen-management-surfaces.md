# Lumen Onboarding and Management Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver first-run onboarding and every phase-one settings, local-AI, gateway, indexing, activity, privacy, and diagnostics surface with complete deterministic states.

**Architecture:** One settings shell hosts focused page modules backed by schema-validated stores and phase-one service contracts. React Aria owns Lumen controls; Astryx may own a secondary control only through a visual adapter and is never wrapped with an equivalent React Aria primitive.

**Tech Stack:** React 19, TypeScript, React Aria Components, StyleX, Motion for React, selective Astryx, Phosphor and Lumen icons, Zustand, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Onboarding is spatial and concise, not a long form wizard.
- Settings pages are General, Appearance, Indexed Roots, Search, Local AI, AgentGateway, Activity and Indexing, Privacy, and Diagnostics.
- Every operational and provider state named in the design specification must be representable deterministically.
- Controls without a phase-one runtime must communicate preview or simulated status and must not imply a live backend.
- Do not wrap React Aria and Astryx behavior primitives around each other.
- Settings must remain usable with keyboard, Narrator, high contrast, reduced motion, transparency disabled, and text scaling.

---

## File Structure

- `src/features/onboarding/*`: onboarding store, scenes, progress, root chooser, and completion.
- `src/features/settings/SettingsShell.tsx`: navigation rail and content region.
- `src/features/settings/settings.store.ts`: schema-validated settings domains.
- `src/features/settings/pages/*`: nine focused settings pages.
- `src/features/settings/components/*`: setting row, section, status badge, shortcut recorder, root row, app override, and diagnostic item.
- `src/features/settings/astryx/*`: optional Lumen-styled Astryx adapters.
- `src/features/gateway/*`: gateway/provider models, stores, routes, permissions, tests.
- `src/features/activity/*`: activity classification and presentation.
- `src/features/diagnostics/*`: diagnostics contract, overlay, export model.

### Task 1: Build concise first-run onboarding

**Files:**
- Create: `src/features/onboarding/onboarding.store.ts`
- Create: `src/features/onboarding/OnboardingFlow.tsx`
- Create: `src/features/onboarding/OnboardingScene.tsx`
- Create: `src/features/onboarding/RootSelectionScene.tsx`
- Create: `src/features/onboarding/ShortcutScene.tsx`
- Create: `src/features/onboarding/OnboardingFlow.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `OnboardingStep`, `OnboardingState`, `completeOnboarding()`, and selected development root.

- [ ] **Step 1: Write failing keyboard-complete onboarding tests**

```tsx
it('completes onboarding with a selected root and shortcut', async () => {
  render(<OnboardingFlow rootService={rootService} />);
  await userEvent.click(screen.getByRole('button', {name: 'Begin'}));
  await userEvent.click(screen.getByRole('button', {name: 'Choose folder'}));
  rootService.resolve('C:\\Projects');
  await userEvent.keyboard('{Enter}{Enter}{Enter}');
  expect(useOnboardingStore.getState()).toMatchObject({completed: true, root: 'C:\\Projects'});
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/onboarding/OnboardingFlow.test.tsx`

Expected: FAIL because onboarding is missing.

- [ ] **Step 3: Implement eight concise spatial scenes**

Cover product promise, local privacy, root choice, shortcut, future indexing, future local AI, exact search without AI, and background gaming/fullscreen behavior. Keep one sentence, one supporting line, one visual, and one primary action per scene.

- [ ] **Step 4: Implement progress, back, Escape, persistence, and focus restoration**

Persist completion only after a valid root is selected. Back never loses the selected root. Reduced motion uses cross-fade rather than spatial travel.

- [ ] **Step 5: Run onboarding tests**

Run: `bun run test -- src/features/onboarding/OnboardingFlow.test.tsx`

Expected: PASS for keyboard, back, root cancellation, invalid root, reduced motion, and completion.

- [ ] **Step 6: Commit**

```powershell
git add src/features/onboarding src/app/App.tsx
git commit -m "feat: add Lumen first-run onboarding"
```

### Task 2: Create the settings shell and reusable management components

**Files:**
- Create: `src/features/settings/SettingsShell.tsx`
- Create: `src/features/settings/SettingsNav.tsx`
- Create: `src/features/settings/components/SettingSection.tsx`
- Create: `src/features/settings/components/SettingRow.tsx`
- Create: `src/features/settings/components/StatusBadge.tsx`
- Create: `src/features/settings/components/ShortcutRecorder.tsx`
- Create: `src/features/settings/settings.store.ts`
- Create: `src/features/settings/settings.schema.ts`
- Create: `src/features/settings/SettingsShell.test.tsx`

**Interfaces:**
- Produces: `SettingsPageId`, schema-valid settings store, navigation shell, and shared labeled row components.

- [ ] **Step 1: Write failing navigation and focus tests**

```tsx
it('opens settings with Ctrl+Comma and restores search focus on Escape', async () => {
  render(<App />);
  await userEvent.keyboard('{Control>},{/Control}');
  expect(screen.getByRole('navigation', {name: 'Settings'})).toBeVisible();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('searchbox')).toHaveFocus();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/settings/SettingsShell.test.tsx`

Expected: FAIL because the shell is missing.

- [ ] **Step 3: Implement the rail and one scrolling content region**

Use React Aria tabs or listbox semantics for the nine pages. Keep the rail fixed, content independently scrollable, titles concise, and page transitions under the shared motion tokens.

- [ ] **Step 4: Implement Zod settings domains and reusable rows**

Represent startup, shortcut, monitor behavior, history, close behavior, appearance, roots, search priorities, activity policies, and privacy. Every row has label, optional description, one behavior owner, error slot, and status slot.

- [ ] **Step 5: Run shell tests**

Run: `bun run test -- src/features/settings/SettingsShell.test.tsx`

Expected: PASS for keyboard navigation, focus, scrolling, text scale, and route persistence.

- [ ] **Step 6: Commit**

```powershell
git add src/features/settings src/app/App.tsx
git commit -m "feat: establish Lumen settings shell"
```

### Task 3: Implement General, Appearance, Indexed Roots, and Search pages

**Files:**
- Create: `src/features/settings/pages/GeneralPage.tsx`
- Create: `src/features/settings/pages/AppearancePage.tsx`
- Create: `src/features/settings/pages/IndexedRootsPage.tsx`
- Create: `src/features/settings/pages/SearchPage.tsx`
- Create: `src/features/settings/components/IndexedRootRow.tsx`
- Create: `src/features/settings/pages/core-pages.test.tsx`

**Interfaces:**
- Consumes: settings and appearance stores, shortcut and root services.
- Produces: complete core settings controls and indexed-root management states.

- [ ] **Step 1: Write failing page coverage and persistence tests**

```tsx
it('switches to opaque mode immediately when transparency is disabled', async () => {
  render(<AppearancePage />);
  await userEvent.click(screen.getByRole('switch', {name: 'Use transparency'}));
  expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute('data-transparency', 'disabled');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/features/settings/pages/core-pages.test.tsx`

Expected: FAIL because pages are missing.

- [ ] **Step 3: Implement General and Appearance controls**

Include launch at startup, shortcut recorder, active monitor, history, close behavior, system/light/dark, glass intensity, transparency fallback, density, preview, motion, and reduced-motion synchronization.

- [ ] **Step 4: Implement Indexed Roots and Search controls**

Include add/remove/pause root, exclusions, hidden directories, size limit, indexing state, result scopes, filename priority, recency, pinned items, semantic state, and reranking state. Semantic and reranking controls display phase-one unavailable reasons.

- [ ] **Step 5: Run page tests**

Run: `bun run test -- src/features/settings/pages/core-pages.test.tsx`

Expected: PASS for every control, invalid exclusion input, root removal confirmation, and persistence errors.

- [ ] **Step 6: Commit**

```powershell
git add src/features/settings/pages src/features/settings/components/IndexedRootRow.tsx
git commit -m "feat: add core Lumen settings pages"
```

### Task 4: Implement Local AI and AgentGateway configuration states

**Files:**
- Create: `src/features/gateway/gateway.types.ts`
- Create: `src/features/gateway/gateway.store.ts`
- Create: `src/features/gateway/GatewayStatusPanel.tsx`
- Create: `src/features/gateway/ProviderRouteList.tsx`
- Create: `src/features/gateway/ToolPermissionList.tsx`
- Create: `src/features/settings/pages/LocalAiPage.tsx`
- Create: `src/features/settings/pages/AgentGatewayPage.tsx`
- Create: `src/features/gateway/gateway.test.tsx`

**Interfaces:**
- Produces: deterministic `HardwareState`, `ModelState`, `GatewayState`, `ProviderRoute`, `McpService`, and `ToolPermission` UI models.

- [ ] **Step 1: Write failing exhaustive state tests**

```ts
it.each(['npu', 'gpu', 'cpu', 'unavailable'] as const)('renders hardware state %s', (hardware) => {
  render(<LocalAiPage model={{hardware, state: 'ready'}} />);
  expect(screen.getByTestId(`hardware-${hardware}`)).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/features/gateway/gateway.test.tsx`

Expected: FAIL because gateway surfaces are missing.

- [ ] **Step 3: Implement Local AI states**

Cover NPU, GPU, CPU, unavailable, model missing/downloading/loading/ready, provider failure, and fallback active. Progress bars have labels and determinate values where applicable.

- [ ] **Step 4: Implement AgentGateway management UI**

Cover starting, ready, unavailable, routes, aliases, local status, MCP services, tool permissions, cloud consent, sanitized diagnostics, restart, provider test, and MCP test. Phase-one actions use deterministic service responses labeled preview.

- [ ] **Step 5: Run exhaustive state and keyboard tests**

Run: `bun run test -- src/features/gateway/gateway.test.tsx`

Expected: PASS for all state unions, route changes, consent dialog, errors, and keyboard operation.

- [ ] **Step 6: Commit**

```powershell
git add src/features/gateway src/features/settings/pages/LocalAiPage.tsx src/features/settings/pages/AgentGatewayPage.tsx
git commit -m "feat: add local AI and gateway management UI"
```

### Task 5: Implement Activity and Indexing classifications

**Files:**
- Create: `src/features/activity/activity.types.ts`
- Create: `src/features/activity/activity.store.ts`
- Create: `src/features/activity/ActivityStatus.tsx`
- Create: `src/features/activity/ApplicationOverrideRow.tsx`
- Create: `src/features/settings/pages/ActivityPage.tsx`
- Create: `src/features/activity/activity.test.tsx`

**Interfaces:**
- Produces: `ActivityMode` and configuration for automatic detection, battery policy, delays, overrides, games, and classifications.

- [ ] **Step 1: Write failing exhaustive activity tests**

```ts
it.each(['indexing', 'slow', 'gaming', 'fullscreen', 'cinema', 'idle', 'battery', 'user'] as const)(
  'renders activity mode %s without color-only meaning',
  (mode) => {
    render(<ActivityStatus mode={mode} />);
    expect(screen.getByTestId(`activity-${mode}`)).toHaveTextContent(/./);
  },
);
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/features/activity/activity.test.tsx`

Expected: FAIL because activity models are missing.

- [ ] **Step 3: Implement activity modes and quiet launcher contraction**

Create explicit icon, label, description, and recommended action for indexing, slow indexing, gaming pause, fullscreen pause, Cinema, waiting for idle, battery pause, and user pause. Launcher status contracts to a compact paused indicator.

- [ ] **Step 4: Implement activity policy controls and application overrides**

Include game/fullscreen detection, video policy, metadata-only Cinema, battery pause, resume delay, per-app override, user-defined games, and reset classifications.

- [ ] **Step 5: Run tests and commit**

Run: `bun run test -- src/features/activity/activity.test.tsx`

```powershell
git add src/features/activity src/features/settings/pages/ActivityPage.tsx
git commit -m "feat: add indexing and activity state UI"
```

### Task 6: Implement Privacy and Diagnostics pages plus overlay

**Files:**
- Create: `src/features/diagnostics/diagnostics.types.ts`
- Create: `src/features/diagnostics/diagnostics.store.ts`
- Create: `src/features/diagnostics/DiagnosticsOverlay.tsx`
- Create: `src/features/settings/pages/PrivacyPage.tsx`
- Create: `src/features/settings/pages/DiagnosticsPage.tsx`
- Create: `src/features/diagnostics/diagnostics.test.tsx`

**Interfaces:**
- Produces: sanitized diagnostics snapshot, performance overlay, privacy actions, and export payload.

- [ ] **Step 1: Write failing sanitation and overlay tests**

```ts
it('redacts paths and provider secrets from diagnostic exports', () => {
  const result = sanitizeDiagnostics({root: 'C:\\Users\\Kevin\\Secret', apiKey: 'token', version: '1.0.0'});
  expect(JSON.stringify(result)).not.toContain('Kevin');
  expect(JSON.stringify(result)).not.toContain('token');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/features/diagnostics/diagnostics.test.tsx`

Expected: FAIL because diagnostics are missing.

- [ ] **Step 3: Implement Privacy controls**

Include local-only status, root summary, clear history, delete index preview action, disable preview, OCR and image-analysis placeholders, and diagnostic export with confirmations.

- [ ] **Step 4: Implement Diagnostics page and development overlay**

Report app, WebView2, Tauri, monitor, DPI, refresh estimate, active animations, React commits, activity, gateway, routes, and logs. Use PerformanceObserver for long tasks and User Timing for launcher/input/selection samples; no per-frame React loop.

- [ ] **Step 5: Run diagnostics tests and commit**

Run: `bun run test -- src/features/diagnostics/diagnostics.test.tsx`

```powershell
git add src/features/diagnostics src/features/settings/pages/PrivacyPage.tsx src/features/settings/pages/DiagnosticsPage.tsx
git commit -m "feat: add privacy and diagnostics experiences"
```

### Task 7: Verify onboarding and every management page end to end

**Files:**
- Create: `tests/e2e/onboarding-settings.spec.ts`
- Create: `docs/architecture/management-surfaces.md`

**Interfaces:**
- Consumes: onboarding, settings, gateway, activity, privacy, diagnostics.
- Produces: page/state coverage evidence and behavior ownership documentation.

- [ ] **Step 1: Write keyboard-only Playwright flows**

```ts
test('visits every settings page without a pointer', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');
  await page.keyboard.press('Control+,');
  for (const name of ['General', 'Appearance', 'Indexed roots', 'Search', 'Local AI', 'AgentGateway', 'Activity', 'Privacy', 'Diagnostics']) {
    await page.getByRole('tab', {name}).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', {name})).toBeVisible();
  }
});
```

- [ ] **Step 2: Run Playwright and fix observed failures**

Run: `bun run test:e2e -- tests/e2e/onboarding-settings.spec.ts`

Expected: PASS in dark, light, opaque, reduced-motion, and 200-percent text-scale scenarios.

- [ ] **Step 3: Document behavior ownership and simulated phase-one actions**

List every React Aria-owned control, any Astryx-owned control, and every preview-only action so future backend work has an explicit connection point.

- [ ] **Step 4: Run the management gate**

Run:

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e -- tests/e2e/onboarding-settings.spec.ts
bun run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/onboarding-settings.spec.ts docs/architecture/management-surfaces.md
git commit -m "test: verify onboarding and management surfaces"
```
