# Lumen Search Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the collapsed launcher, expanded search workspace, premium result system, selection, preview, motion, and complete keyboard interaction against a typed search boundary.

**Architecture:** Search state is split into focused Zustand stores and coordinated by one controller hook. React Aria owns input, collection, tabs, buttons, and announcements; feature components consume only `SearchService`, never Tauri APIs.

**Tech Stack:** React 19, TypeScript, React Aria Components, StyleX, Motion for React, Phosphor Icons, custom SVG, TanStack Virtual, Zustand, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve the 700 by 66 logical-pixel collapsed baseline and 800 logical-pixel expanded baseline.
- Expanded width responds from 720 to 960 pixels and height never exceeds 600 pixels.
- Support All, Files, Folders, Documents, Code, Images, Recent, and Related scopes.
- Preserve selection by stable ID when asynchronous results change.
- Do not use fixtures in the normal launcher; browser tests inject a contract-compatible in-memory service.
- Support IME, Unicode, long queries, Narrator, rapid key repeat, reduced motion, and transparency fallback.
- Animate transforms and opacity; do not animate native window dimensions continuously.
- Implement every custom Lumen icon and neutral file glyph without trademark imitation.

---

## File Structure

- `src/services/search/search.types.ts`: all request, result, preview, status, and error schemas.
- `src/services/search/search-service.ts`: `SearchService` contract.
- `src/services/search/memory-search-service.ts`: deterministic test adapter only.
- `src/features/launcher/launcher.store.ts`: window mode and focus state.
- `src/features/launcher/query.store.ts`: query and composition state.
- `src/features/launcher/selection.store.ts`: selected ID and region.
- `src/features/launcher/scope.store.ts`: scope and active filters.
- `src/features/launcher/preview.store.ts`: preview request lifecycle.
- `src/features/launcher/useSearchController.ts`: request orchestration and reconciliation.
- `src/features/launcher/CollapsedLauncher.tsx`: compact entry surface.
- `src/features/launcher/ExpandedWorkspace.tsx`: cohesive expanded layout.
- `src/features/launcher/ScopeRail.tsx`: React Aria tabs.
- `src/features/results/*`: result grid, row, selection capsule, glyph, and virtualization.
- `src/features/preview/*`: preview shell and safe renderers.
- `src/features/keyboard/useLumenKeyboard.ts`: global launcher key map.
- `src/design-system/icons/lumen-icons.tsx`: custom product icon set.
- `src/design-system/file-glyphs/FileGlyph.tsx`: neutral file categories.

### Task 1: Define typed search contracts and request reconciliation

**Files:**
- Create: `src/services/search/search.types.ts`
- Create: `src/services/search/search-service.ts`
- Create: `src/services/search/memory-search-service.ts`
- Create: `src/features/launcher/useSearchController.ts`
- Create: `src/features/launcher/useSearchController.test.tsx`

**Interfaces:**
- Produces: `SearchService`, `SearchRequest`, `SearchResponse`, `SearchResult`, `FilePreview`, `SearchStatus`, `SearchError`, `useSearchController`.

- [ ] **Step 1: Write failing stale-response and stable-selection tests**

```tsx
it('ignores a stale search response and keeps selection by file id', async () => {
  const service = new MemorySearchService();
  const {result} = renderHook(() => useSearchController(service));
  act(() => result.current.setQuery('lum'));
  act(() => result.current.setQuery('lumen'));
  await service.resolve('lumen', [file('b'), file('a')]);
  act(() => result.current.select('a'));
  await service.resolve('lum', [file('stale')]);
  expect(result.current.results.map((item) => item.id)).toEqual(['b', 'a']);
  expect(result.current.selectedId).toBe('a');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/features/launcher/useSearchController.test.tsx`

Expected: FAIL because the contracts and controller do not exist.

- [ ] **Step 3: Implement Zod-backed contracts**

```ts
export interface SearchService {
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview>;
  openFile(fileId: string): Promise<void>;
  openContainingFolder(fileId: string): Promise<void>;
  subscribeToStatus(listener: (status: SearchStatus) => void): () => void;
}
```

Use these exact response containers:

```ts
export interface SearchGroup {
  id: string;
  label: string;
  items: readonly SearchResult[];
}

export interface SearchResponse {
  requestId: number;
  groups: readonly SearchGroup[];
  elapsedMs: number;
  total: number;
}
```

`SearchResult` includes stable `id`, `name`, `path`, `kind`, `match`, `metadata`, and optional `availability`.

- [ ] **Step 4: Implement abort and monotonically increasing request IDs**

Abort the prior request, accept only the latest request ID, and reconcile selected ID against enabled results without selecting loading or permission-denied rows.

- [ ] **Step 5: Run controller tests**

Run: `bun run test -- src/features/launcher/useSearchController.test.tsx`

Expected: PASS for stale responses, abort, stable selection, empty results, and nearest-neighbor fallback.

- [ ] **Step 6: Commit**

```powershell
git add src/services/search src/features/launcher/useSearchController*
git commit -m "feat: define resilient search contracts"
```

### Task 2: Create focused launcher stores and selectors

**Files:**
- Create: `src/features/launcher/launcher.store.ts`
- Create: `src/features/launcher/query.store.ts`
- Create: `src/features/launcher/selection.store.ts`
- Create: `src/features/launcher/scope.store.ts`
- Create: `src/features/launcher/preview.store.ts`
- Create: `src/features/launcher/stores.test.ts`

**Interfaces:**
- Produces: independent `useLauncherStore`, `useQueryStore`, `useSelectionStore`, `useScopeStore`, and `usePreviewStore` hooks.

- [ ] **Step 1: Write failing isolated-render and composition tests**

```ts
it('does not publish query changes while IME composition is active', () => {
  useQueryStore.getState().startComposition();
  useQueryStore.getState().setDraft('ルーメン');
  expect(useQueryStore.getState().committed).toBe('');
  useQueryStore.getState().endComposition();
  expect(useQueryStore.getState().committed).toBe('ルーメン');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/features/launcher/stores.test.ts`

Expected: FAIL because the stores are missing.

- [ ] **Step 3: Implement stores with action-specific selectors**

Keep draft query separate from committed search input, selected file separate from focused region, and preview lifecycle separate from result data. Export selectors such as `selectDraftQuery`, `selectSelectedId`, and `selectActiveScope`.

- [ ] **Step 4: Run tests and verify unrelated subscriptions remain stable**

Run: `bun run test -- src/features/launcher/stores.test.ts`

Expected: PASS and a query update does not notify the appearance or preview selector test subscribers.

- [ ] **Step 5: Commit**

```powershell
git add src/features/launcher/*.store.ts src/features/launcher/stores.test.ts
git commit -m "feat: add focused launcher state slices"
```

### Task 3: Build the collapsed launcher and scope rail

**Files:**
- Create: `src/features/launcher/CollapsedLauncher.tsx`
- Create: `src/features/launcher/SearchInput.tsx`
- Create: `src/features/launcher/ScopeRail.tsx`
- Create: `src/features/launcher/LauncherStatus.tsx`
- Create: `src/features/launcher/CollapsedLauncher.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: query, launcher, and scope stores; `WindowService`.
- Produces: accessible collapsed launcher and scope selection.

- [ ] **Step 1: Write failing input, IME, Escape, and scope tests**

```tsx
it('commits an IME query only after composition ends', async () => {
  render(<CollapsedLauncher />);
  const input = screen.getByRole('searchbox', {name: 'Search files'});
  fireEvent.compositionStart(input);
  await userEvent.type(input, 'ルーメン');
  expect(useQueryStore.getState().committed).toBe('');
  fireEvent.compositionEnd(input);
  expect(useQueryStore.getState().committed).toBe('ルーメン');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/launcher/CollapsedLauncher.test.tsx`

Expected: FAIL because launcher components are missing.

- [ ] **Step 3: Implement React Aria SearchField and controls**

Render the Lumen mark, large input, clear button, optional microphone, local-AI indicator, `Alt Space` hint, and quiet activity status. The root geometry is 700 by 66 with responsive inline sizing and 24-pixel radius.

- [ ] **Step 4: Implement React Aria Tabs for the eight scopes**

The rail is visually hidden in collapsed idle mode and enters beneath the anchored field when expanded. Left and right arrows move scope only while the rail owns focus.

- [ ] **Step 5: Run launcher tests and accessibility assertions**

Run: `bun run test -- src/features/launcher/CollapsedLauncher.test.tsx`

Expected: PASS with an accessible searchbox, named controls, composition safety, long-query scrolling, Unicode, and Escape behavior.

- [ ] **Step 6: Commit**

```powershell
git add src/features/launcher src/app/App.tsx
git commit -m "feat: build collapsed Lumen launcher"
```

### Task 4: Implement custom Lumen icons and premium file glyphs

**Files:**
- Create: `src/design-system/icons/lumen-icons.tsx`
- Create: `src/design-system/file-glyphs/file-kind.ts`
- Create: `src/design-system/file-glyphs/FileGlyph.tsx`
- Create: `src/design-system/file-glyphs/FileGlyph.test.tsx`

**Interfaces:**
- Produces: named custom icons and `FileGlyph({kind, size, selected})` for 13 file categories.

- [ ] **Step 1: Write failing icon coverage and accessible-title tests**

```tsx
it.each(['folder', 'pdf', 'document', 'spreadsheet', 'presentation', 'source', 'image', 'video', 'audio', 'archive', 'executable', 'model', 'unknown'] as const)(
  'renders a neutral %s glyph',
  (kind) => {
    render(<FileGlyph kind={kind} title={`${kind} file`} />);
    expect(screen.getByTitle(`${kind} file`)).toBeInTheDocument();
  },
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/design-system/file-glyphs/FileGlyph.test.tsx`

Expected: FAIL because glyphs are missing.

- [ ] **Step 3: Implement custom product symbols and file categories**

Use the shared 24-unit geometry for semantic, hybrid, related, local AI, NPU, gateway, MCP, indexed root, developer folder, filename/content/OCR/image matches, reranking, gaming pause, and Cinema symbols. File glyphs use abstract folded sheets, bands, and category marks with no third-party logos.

- [ ] **Step 4: Run tests and render the icon sheet in development**

Run: `bun run test -- src/design-system/file-glyphs/FileGlyph.test.tsx`

Expected: PASS for all categories, `currentColor`, high-contrast, selected, and decorative/meaningful accessibility modes.

- [ ] **Step 5: Commit**

```powershell
git add src/design-system/icons src/design-system/file-glyphs
git commit -m "feat: create Lumen icon and file glyph system"
```

### Task 5: Build results, stable selection capsule, and measured virtualization

**Files:**
- Create: `src/features/results/ResultGrid.tsx`
- Create: `src/features/results/ResultRow.tsx`
- Create: `src/features/results/SelectionCapsule.tsx`
- Create: `src/features/results/useResultVirtualizer.ts`
- Create: `src/features/results/ResultGrid.test.tsx`

**Interfaces:**
- Consumes: `SearchResult[]`, selected ID, selection action.
- Produces: React Aria grid list with optional TanStack virtualization and shared capsule geometry.

- [ ] **Step 1: Write failing collection and stable-selection tests**

```tsx
it('keeps the selected file when a result group is inserted above it', async () => {
  const {rerender} = render(<ResultGrid results={[file('a'), file('b')]} selectedId="b" />);
  rerender(<ResultGrid results={[file('new'), file('a'), file('b')]} selectedId="b" />);
  expect(screen.getByRole('row', {name: /b/})).toHaveAttribute('data-selected', 'true');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/results/ResultGrid.test.tsx`

Expected: FAIL because the grid is missing.

- [ ] **Step 3: Implement result rows and match-state variants**

Rows render file glyph, filename, abbreviated path, match fragment, metadata, match source, secondary action, and shortcut. Loading, unavailable, and permission states use stable row geometry and non-color labels.

- [ ] **Step 4: Implement shared capsule and virtualization threshold**

Measure the selected mounted row with `ResizeObserver`, animate capsule `y` and height, and disable motion when reduced. Enable TanStack Virtual only beyond 120 rows, with stable `getItemKey`, bounded row height, overscan 5, `useFlushSync: false`, and compositor transform positioning.

- [ ] **Step 5: Run result tests and a 10,000-row render benchmark**

Run: `bun run test -- src/features/results/ResultGrid.test.tsx`

Expected: PASS; large-list test mounts fewer than 40 row elements and selection remains stable.

- [ ] **Step 6: Commit**

```powershell
git add src/features/results
git commit -m "feat: add premium stable result system"
```

### Task 6: Build cancellable safe previews

**Files:**
- Create: `src/features/preview/PreviewPane.tsx`
- Create: `src/features/preview/PreviewSkeleton.tsx`
- Create: `src/features/preview/PreviewContent.tsx`
- Create: `src/features/preview/SafeMarkdown.tsx`
- Create: `src/features/preview/usePreviewController.ts`
- Create: `src/features/preview/PreviewPane.test.tsx`

**Interfaces:**
- Consumes: `SearchService.getPreview`, selected ID.
- Produces: safe preview states for folder, text, source, Markdown, PDF, document, presentation, spreadsheet, image, audio, video, unsupported, loading, failed, and permission denied.

- [ ] **Step 1: Write failing cancellation and safety tests**

```tsx
it('ignores a slow preview after selection changes', async () => {
  const service = new MemorySearchService();
  const {rerender} = render(<PreviewPane fileId="a" service={service} />);
  rerender(<PreviewPane fileId="b" service={service} />);
  await service.resolvePreview('b', textPreview('current'));
  await service.resolvePreview('a', textPreview('stale'));
  expect(screen.getByText('current')).toBeVisible();
  expect(screen.queryByText('stale')).toBeNull();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/preview/PreviewPane.test.tsx`

Expected: FAIL because preview components are missing.

- [ ] **Step 3: Implement abortable controller and stable shell**

Abort on ID change, ignore stale resolutions, retain fixed header and body geometry, and keep errors inside preview. Markdown escapes raw HTML and supports only text, headings, emphasis, lists, links, and fenced code.

- [ ] **Step 4: Implement narrow-width details overlay**

Below the preview breakpoint, keep the list full width and open preview as a React Aria dialog/details surface with focus restoration.

- [ ] **Step 5: Run preview tests**

Run: `bun run test -- src/features/preview/PreviewPane.test.tsx`

Expected: PASS for cancellation, loading, every content category, unsafe markup, failure, permission, and keyboard close.

- [ ] **Step 6: Commit**

```powershell
git add src/features/preview
git commit -m "feat: add cancellable safe preview experience"
```

### Task 7: Compose expanded workspace, motion, and complete keyboard navigation

**Files:**
- Create: `src/features/launcher/ExpandedWorkspace.tsx`
- Create: `src/features/launcher/FilterChips.tsx`
- Create: `src/features/launcher/ContextActions.tsx`
- Create: `src/features/keyboard/useLumenKeyboard.ts`
- Create: `src/features/keyboard/useLumenKeyboard.test.tsx`
- Create: `src/design-system/MotionProvider.tsx`
- Modify: `src/app/App.tsx`, `src/design-system/motion.ts`

**Interfaces:**
- Produces: cohesive expanded workspace and mappings for Escape, arrows, Enter, Ctrl+Enter, Alt+Enter, Tab, Ctrl+K, and Ctrl+Comma.

- [ ] **Step 1: Write failing keyboard flow tests**

```tsx
it('opens the selected file and hides after tactile confirmation', async () => {
  render(<SearchExperience service={serviceWith(file('a'))} />);
  await userEvent.type(screen.getByRole('searchbox'), 'a');
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(service.openedFiles).toEqual(['a']);
  expect(windowService.snapshot().visible).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test -- src/features/keyboard/useLumenKeyboard.test.tsx`

Expected: FAIL because workspace coordination is missing.

- [ ] **Step 3: Compose the expanded instrument**

Keep the input anchored, scope rail compact, result list primary, preview optional, and status/actions subordinate. Narrow layouts hide preview before removing metadata. Expansion asks `WindowService` for one controlled resize and animates only internal regions.

- [ ] **Step 4: Implement interruptible motion tokens**

Use shared layout IDs for the selection capsule and scope indicator, the approved spring `{type: 'spring', stiffness: 520, damping: 44, mass: 0.72}`, and short opacity/transform transitions for open, close, preview, and page movement. Reduced motion switches to immediate layout and 80-millisecond opacity.

- [ ] **Step 5: Implement regional keyboard ownership and announcements**

Arrow up/down changes results, left/right changes region or scope, Enter opens, Ctrl+Enter opens container, Alt+Enter shows details, Ctrl+K focuses input, Ctrl+Comma opens settings, and Escape backs out before hiding. Announce result count, loading, and selection context politely.

- [ ] **Step 6: Run keyboard, search, and reduced-motion tests**

Run:

```powershell
bun run test -- src/features/keyboard src/features/launcher src/features/results src/features/preview
bun run typecheck
bun run lint
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add src/features src/design-system src/app/App.tsx
git commit -m "feat: complete Lumen search workspace interactions"
```

### Task 8: Verify the complete browser-driven search experience

**Files:**
- Create: `tests/e2e/search-experience.spec.ts`
- Create: `docs/architecture/motion-system.md`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: full search experience with injected memory service.
- Produces: automated interaction evidence and motion documentation.

- [ ] **Step 1: Write end-to-end flows for collapsed, typing, expanded, selection, preview, and open**

```ts
test('completes search without a pointer', async ({page}) => {
  await page.goto('/?service=memory');
  await page.getByRole('searchbox').fill('report');
  await expect(page.getByRole('row')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Alt+Enter');
  await expect(page.getByRole('dialog', {name: /details/i})).toBeVisible();
});
```

- [ ] **Step 2: Run Playwright and fix only observed failures**

Run: `bun run test:e2e -- tests/e2e/search-experience.spec.ts`

Expected: PASS for dark, light, opaque, high-contrast emulation, reduced motion, long filename, Unicode, and 10,000-result scenarios.

- [ ] **Step 3: Document exact motion tokens and performance rules**

Record every transition duration, easing, spring, reduced-motion alternative, and the rule that native window size changes only at mode boundaries.

- [ ] **Step 4: Run the search-experience gate**

Run:

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e -- tests/e2e/search-experience.spec.ts
bun run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/search-experience.spec.ts docs/architecture/motion-system.md
git commit -m "test: verify complete search experience"
```
