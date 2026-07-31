# Lumen Local Adapter, State Gallery, and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect normal search to real local files, add the deterministic visual state gallery, and produce rigorous accessibility, DPI, performance, screenshot, recording, and final-build evidence.

**Architecture:** A root-confined Rust adapter implements the frontend `SearchService` through typed Tauri commands. Fixtures remain isolated in a development-only gallery. Validation artifacts are generated from repeatable browser and native workflows, with manual Windows limitations reported honestly.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zod, Zustand, TanStack Virtual, Playwright, Vitest, Testing Library, Cargo test, Windows Narrator and display tooling.

## Global Constraints

- Normal launcher results come from the user-selected local development root.
- Rust operations are limited to `list_files`, `search_filenames`, `get_file_metadata`, `get_basic_preview`, `open_file`, and `open_containing_folder`.
- Do not add MFT, USN, Tantivy, embeddings, reranking, OCR, AgentGateway, MCP, extraction, or AI inference.
- Gallery fixtures never enter the normal launcher service path.
- Do not claim 240 FPS or manual Narrator/DPI success without measured evidence.
- Validate active placement and bounds across multiple monitors and mixed-DPI monitors.
- Final verification includes every command and manual scenario named in the product brief.

---

## File Structure

- `src-tauri/src/search/*`: root policy, traversal, matching, metadata, preview, opening, DTOs, and errors.
- `src/services/search/development-file-search-service.ts`: Tauri command adapter.
- `src/services/search/future-production-search-service.ts`: explicit unavailable contract implementation.
- `src/features/gallery/*`: scenario registry, fixture factories, controls, and matrix renderer.
- `tests/e2e/visual-gallery.spec.ts`: deterministic screenshot scenarios.
- `tests/e2e/accessibility.spec.ts`: automated accessibility and keyboard checks.
- `scripts/capture-gallery.mjs`: screenshot capture orchestration.
- `scripts/record-interactions.mjs`: Playwright video capture.
- `scripts/performance-profile.mjs`: timing and trace collection.
- `docs/reports/*`: accessibility, DPI, high-refresh performance, and validation reports.
- `artifacts/screenshots/*`: required screenshot set.
- `artifacts/recordings/*`: required interaction recordings.

### Task 1: Implement root-confined Rust directory traversal and filename search

**Files:**
- Create: `src-tauri/src/search/mod.rs`
- Create: `src-tauri/src/search/types.rs`
- Create: `src-tauri/src/search/root_policy.rs`
- Create: `src-tauri/src/search/traversal.rs`
- Create: `src-tauri/src/search/matching.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: Tauri commands `list_files(root)`, `search_filenames(root, query)` and serializable `FileRecord`, `SearchMatch`, `SearchFailure`.

- [ ] **Step 1: Write failing Rust tests for root confinement, Unicode, ordering, and symlink cycles**

```rust
#[test]
fn search_never_returns_paths_outside_the_selected_root() {
    let fixture = SearchFixture::new();
    fixture.file("inside/report.txt");
    fixture.symlink("inside/outside", fixture.outside_dir());
    let results = search_filenames(fixture.root(), "report").unwrap();
    assert!(results.iter().all(|item| item.path.starts_with(fixture.root())));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml search::`

Expected: FAIL because the search module is missing.

- [ ] **Step 3: Implement canonical root policy and bounded traversal**

Canonicalize the root once, reject missing/non-directory roots, do not follow directory symlinks or junction cycles, skip unreadable entries with structured warnings, and cap a single response at a documented development limit while retaining total count.

- [ ] **Step 4: Implement case-insensitive filename matching and stable ordering**

Rank exact name, prefix, substring, then ordered-character fuzzy matches. Break ties by filename length, then normalized path. Preserve original Unicode for display.

- [ ] **Step 5: Run Rust tests and static checks**

Run:

```powershell
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml search::
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src
git commit -m "feat: add confined local filename search"
```

### Task 2: Implement metadata, safe previews, and opener commands

**Files:**
- Create: `src-tauri/src/search/metadata.rs`
- Create: `src-tauri/src/search/preview.rs`
- Create: `src-tauri/src/search/opening.rs`
- Modify: `src-tauri/src/search/mod.rs`, `src-tauri/src/search/types.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/main.json`

**Interfaces:**
- Produces: `get_file_metadata(path)`, `get_basic_preview(path)`, `open_file(path)`, and `open_containing_folder(path)` commands.

- [ ] **Step 1: Write failing preview size, binary, and permission tests**

```rust
#[test]
fn text_preview_is_bounded_and_never_decodes_binary_as_active_content() {
    let fixture = SearchFixture::new();
    let path = fixture.bytes("payload.bin", &[0, 159, 146, 150]);
    let preview = get_basic_preview(fixture.root(), &path).unwrap();
    assert!(matches!(preview.kind, PreviewKind::Unsupported));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml preview`

Expected: FAIL because preview commands are missing.

- [ ] **Step 3: Implement safe metadata and preview categories**

Return size, timestamps, extension, kind, and root-relative path. Read only a bounded prefix for UTF-8 text/Markdown/source. Images return a file URL or bounded bytes through an approved Tauri asset path. Documents, media, archives, and executables return passive metadata only.

- [ ] **Step 4: Implement opening through the official opener plugin**

Revalidate every path against the active selected root immediately before opening. `open_containing_folder` opens the parent and selects the file where the platform supports it; otherwise it opens the parent.

- [ ] **Step 5: Run Rust checks and commit**

Run:

```powershell
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

```powershell
git add src-tauri
git commit -m "feat: add local metadata preview and open commands"
```

### Task 3: Connect DevelopmentFileSearchService to normal launcher search

**Files:**
- Create: `src/services/search/development-file-search-service.ts`
- Create: `src/services/search/future-production-search-service.ts`
- Create: `src/services/search/development-file-search-service.test.ts`
- Modify: `src/app/AppProviders.tsx`, `src/app/App.tsx`

**Interfaces:**
- Consumes: Tauri commands and selected root.
- Produces: production-default `DevelopmentFileSearchService` and explicit `FutureProductionSearchService` contract.

- [ ] **Step 1: Write failing command mapping and error tests**

```ts
it('maps Tauri filename matches into stable SearchResult values', async () => {
  invokeMock.mockResolvedValue([{path: 'C:\\Projects\\Readme.md', name: 'Readme.md', kind: 'document', score: 90}]);
  const response = await service.search({requestId: 7, root: 'C:\\Projects', query: 'read', scope: 'all'});
  expect(response.groups[0].items[0]).toMatchObject({id: expect.any(String), name: 'Readme.md', match: {source: 'filename'}});
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/services/search/development-file-search-service.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement command mapping and status subscription**

Generate stable IDs from normalized root-relative paths, map structured Rust errors to `SearchError`, expose exact development status, and keep abort handling on the frontend even where invoke cannot be cancelled.

- [ ] **Step 4: Make the real adapter the normal composition-root default**

Only `?service=memory` and the gallery may inject deterministic fixtures. If no root exists, render the no-indexed-root onboarding state rather than fake results.

- [ ] **Step 5: Run service and search tests**

Run: `bun run test -- src/services/search src/features/launcher src/features/preview`

Expected: PASS with real adapter selected by default.

- [ ] **Step 6: Commit**

```powershell
git add src/services/search src/app
git commit -m "feat: connect launcher to local file adapter"
```

### Task 4: Build the deterministic visual state gallery

**Files:**
- Create: `src/features/gallery/gallery.types.ts`
- Create: `src/features/gallery/scenarios.ts`
- Create: `src/features/gallery/fixtures.ts`
- Create: `src/features/gallery/VisualStateGallery.tsx`
- Create: `src/features/gallery/ScenarioControls.tsx`
- Create: `src/features/gallery/VisualStateGallery.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: stable `GalleryScenarioId`, scenario registry, single-state and matrix renderers.

- [ ] **Step 1: Write a failing exhaustive scenario registry test**

```ts
it('contains every required deterministic scenario', () => {
  expect(new Set(scenarios.map((item) => item.id))).toEqual(new Set(requiredScenarioIds));
});
```

`requiredScenarioIds` contains collapsed idle/focused/typing, expanded/grouped/selected, preview loading/complete/failed, empty, no root, all activity and provider states, gateway states, reranking, permission, long and Unicode names, large results, light/dark/opaque/high contrast/reduced motion.

- [ ] **Step 2: Run tests and verify they fail**

Run: `bun run test -- src/features/gallery/VisualStateGallery.test.tsx`

Expected: FAIL because gallery scenarios are missing.

- [ ] **Step 3: Implement deterministic fixtures and registry**

Use fixed timestamps, paths, scores, IDs, progress, and viewport dimensions. Prevent gallery imports from entering the normal app bundle in production through a development-only dynamic import and compile-time flag.

- [ ] **Step 4: Implement single and matrix gallery modes**

Single mode renders production geometry for capture. Matrix mode adds labels outside the product surface. Keyboard controls change scenario, theme, DPI simulation, and motion preference.

- [ ] **Step 5: Run gallery tests and commit**

Run: `bun run test -- src/features/gallery/VisualStateGallery.test.tsx`

```powershell
git add src/features/gallery src/app/App.tsx
git commit -m "feat: add deterministic Lumen state gallery"
```

### Task 5: Automate accessibility, DPI, and responsive validation

**Files:**
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/dpi-responsive.spec.ts`
- Create: `docs/reports/accessibility.md`
- Create: `docs/reports/dpi-validation.md`

**Interfaces:**
- Consumes: gallery and full application.
- Produces: automated evidence plus structured manual Windows checklists.

- [ ] **Step 1: Write automated keyboard, focus, name, contrast-mode, and text-scale tests**

```ts
test('core search flow exposes no unnamed interactive controls', async ({page}) => {
  await page.goto('/?service=memory&scenario=expanded-results');
  const controls = page.locator('button, input, [role="tab"], [role="row"]');
  await expect(controls).not.toHaveCount(0);
  for (const control of await controls.all()) {
    await expect(control).toHaveAccessibleName(/.+/);
  }
});
```

- [ ] **Step 2: Add viewport and scale matrices**

Exercise logical equivalents of 1080p, 1440p, 4K, and ultrawide at 100, 125, 150, 175, and 200 percent. Assert the app remains in bounds, preview collapses before results, no horizontal body overflow appears, and targets remain at least 32 logical pixels.

- [ ] **Step 3: Run automated checks**

Run: `bun run test:e2e -- tests/e2e/accessibility.spec.ts tests/e2e/dpi-responsive.spec.ts`

Expected: PASS for all automated matrices.

- [ ] **Step 4: Execute and document manual Windows checks**

Use the native Tauri build to test Narrator, high contrast, reduced motion, transparency disabled, mixed DPI monitors, active-monitor placement, taskbars on each available edge, Unicode, IME, and focus restoration. Record exact hardware and mark unavailable configurations as not tested rather than passed.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/accessibility.spec.ts tests/e2e/dpi-responsive.spec.ts docs/reports/accessibility.md docs/reports/dpi-validation.md
git commit -m "test: validate Lumen accessibility and DPI behavior"
```

### Task 6: Profile launcher, input, selection, rendering, and idle behavior

**Files:**
- Create: `scripts/performance-profile.mjs`
- Create: `tests/e2e/performance.spec.ts`
- Create: `docs/reports/high-refresh-performance.md`
- Modify: `src/features/diagnostics/diagnostics.store.ts`

**Interfaces:**
- Produces: reproducible timing samples, trace files, and hardware-qualified performance report.

- [ ] **Step 1: Write measurable performance assertions**

```ts
test('warm launcher and selection stay within phase-one browser budgets', async ({page}) => {
  const metrics = await measureLumen(page, {samples: 50});
  expect(metrics.warmOpenP95).toBeLessThan(20);
  expect(metrics.maxOrdinaryCommit).toBeLessThan(3);
  expect(metrics.idleAnimationFrames).toBe(0);
});
```

- [ ] **Step 2: Instrument User Timing and React Profiler samples**

Record global-shortcut receipt to visible paint, input event to next paint, selection keydown to capsule paint, hover response, React commit duration, long tasks, mounted rows, active animations, idle CPU approximation, and process memory where available.

- [ ] **Step 3: Run browser and native profiles**

Run:

```powershell
bun run test:e2e -- tests/e2e/performance.spec.ts
bun run scripts/performance-profile.mjs
```

Expected: trace and JSON summaries are generated. Any missed budget becomes a documented measured failure and a code-fix loop, never a waived assertion.

- [ ] **Step 4: Profile available 60, 120, 144, 165, and 240 Hz modes**

Record only modes supported by connected hardware. For unavailable modes, analyze compositor-safe code paths and state explicitly that live validation remains unavailable.

- [ ] **Step 5: Commit**

```powershell
git add scripts/performance-profile.mjs tests/e2e/performance.spec.ts docs/reports/high-refresh-performance.md src/features/diagnostics
git commit -m "perf: profile Lumen interaction pipeline"
```

### Task 7: Capture the required screenshot set and interaction recordings

**Files:**
- Create: `scripts/capture-gallery.mjs`
- Create: `scripts/record-interactions.mjs`
- Create: `artifacts/screenshots/manifest.json`
- Create: `artifacts/recordings/manifest.json`

**Interfaces:**
- Consumes: deterministic gallery scenario IDs.
- Produces: labeled PNG screenshots, WebM or MP4 interaction recordings, dimensions, theme, scenario, and source commit metadata.

- [ ] **Step 1: Implement screenshot capture from the gallery registry**

Capture collapsed, expanded, selected, preview, empty, no root, activity, provider, gateway, settings, onboarding, light, dark, opaque, high contrast, reduced motion, long filename, Unicode, and large-result states at defined production dimensions.

- [ ] **Step 2: Implement deterministic interaction recordings**

Record launcher open, typing and expansion, selection movement, preview open, scope change, file open confirmation, gaming pause contraction, provider route change, onboarding, and settings navigation.

- [ ] **Step 3: Run capture scripts**

Run:

```powershell
bun run scripts/capture-gallery.mjs
bun run scripts/record-interactions.mjs
```

Expected: every manifest entry points to a non-empty artifact and records scenario, viewport, theme, reduced-motion state, and Git SHA.

- [ ] **Step 4: Visually inspect every artifact**

Check clipping, transparent edges, selection alignment, glyph balance, text wrapping, contrast, motion discontinuities, stale content, and generic placeholder styling. Fix observed product defects and recapture affected artifacts.

- [ ] **Step 5: Commit**

```powershell
git add scripts/capture-gallery.mjs scripts/record-interactions.mjs artifacts
git commit -m "docs: capture Lumen visual and motion artifacts"
```

### Task 8: Complete the full requirement audit and production build

**Files:**
- Create: `docs/reports/phase-one-validation.md`
- Create: `README.md`
- Create: `docs/architecture/search-service.md`

**Interfaces:**
- Produces: run/test instructions, contract documentation, requirement-by-requirement evidence, and distributable Tauri artifact.

- [ ] **Step 1: Map every brief requirement and deliverable to authoritative evidence**

Create a table with requirement, source file, automated test, manual evidence, artifact, and status. A missing or indirect evidence cell is incomplete and triggers more implementation or validation.

- [ ] **Step 2: Document install, run, test, gallery, profiling, capture, and native build commands**

Include Bun, Rust, Windows prerequisites, root selection, global-shortcut conflict behavior, and where generated artifacts are located.

- [ ] **Step 3: Run the complete final command gate**

Run:

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace
bun run tauri build
```

Expected: all commands exit 0 and the installer/binary paths are recorded.

- [ ] **Step 4: Execute the manual final matrix**

Verify warm opening, keyboard navigation, available refresh modes, all DPI levels, light/dark/opaque/reduced/high-contrast themes, multiple/mixed-DPI monitors, Narrator, long and Unicode names, large sets, rapid selection, and rapid opening/closing. Record unavailable hardware cases honestly.

- [ ] **Step 5: Search for forbidden or incomplete implementation markers**

Run:

```powershell
rg -n -i "TODO|FIXME|placeholder-quality|fake results|tantivy|embedding|llama|mistral|ocr engine|usn journal|mft scanner" src src-tauri README.md docs
```

Expected: no incomplete markers; backend terms appear only in explicit scope documentation or phase-one unavailable labels.

- [ ] **Step 6: Commit final evidence**

```powershell
git add README.md docs
git commit -m "docs: complete Lumen phase one validation"
```
