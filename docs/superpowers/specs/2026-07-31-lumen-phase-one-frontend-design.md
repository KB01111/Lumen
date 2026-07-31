# Lumen Phase One Frontend Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Product:** Lumen, a premium Windows 11 desktop search application

## Objective

Phase one delivers a complete, polished desktop product experience before the production search platform exists. Lumen must feel immediate, calm, tactile, and native when driven by a small local-file adapter. This phase includes the launcher, search workspace, previews, onboarding, settings, operational states, visual gallery, accessibility, DPI behavior, performance instrumentation, screenshots, and recordings.

The phase explicitly excludes the production indexing engine, NTFS MFT and USN pipelines, semantic/vector search, extraction and OCR pipelines, reranking, AgentGateway runtime, MCP server, NPU integration, and local-model inference. Those capabilities appear only as typed contracts and deterministic UI states.

## Delivery Strategy

The implementation follows a foundation-first vertical approach in the mandatory order from the product brief:

1. Tokens and themes establish the visual vocabulary.
2. The native window shell establishes the material and lifecycle.
3. The collapsed launcher establishes the first interaction.
4. The expanded workspace, results, selection, and preview form one complete search instrument.
5. Motion and keyboard behavior are applied to real state transitions.
6. Onboarding and settings reuse the same primitives.
7. Gateway, provider, indexing, and activity states complete the management experience.
8. The local-file adapter replaces launcher fixtures with real files.
9. The development gallery isolates deterministic visual fixtures.
10. Accessibility, DPI, and performance validation close the phase.

This remains one product delivery, implemented through independently verifiable slices. The normal launcher never uses static fake results.

## Technology Foundation

The repository begins from the current official Tauri 2 React, TypeScript, and Vite scaffold using Bun. React 19 renders the frontend. Tauri plugins provide global shortcut, single-instance, positioner, opener, store, and logging capabilities.

React Aria Components is the default behavior owner for Lumen-authored interactive controls. StyleX owns Lumen-authored styling and semantic tokens. Motion for React owns meaningful transitions and shared spatial continuity. Astryx is limited to secondary settings and management controls where it reduces implementation cost without imposing a visual identity on the launcher; when an Astryx control is used, it owns its behavior and is not wrapped in an equivalent React Aria primitive. Phosphor supplies general icons; Lumen SVG components supply product-specific symbols. TanStack Virtual is enabled only for measured large-list scenarios. Zustand uses focused slices and selectors. Zod validates persisted settings and Tauri command payloads.

## Product Architecture

Lumen uses one persistent borderless Tauri window. Closing the launcher hides the window rather than destroying the webview, preserving warm state and immediate reopening. The window has five internal modes:

- collapsed launcher;
- expanded search workspace;
- onboarding;
- settings;
- development-only visual gallery.

Native dimensions change only at controlled boundaries. Internal regions animate independently with compositor-safe transforms and opacity. The shell does not continuously animate native width or height.

The frontend is organized into bounded modules:

- `app`: composition root, mode routing, providers, and startup coordination;
- `design-system`: tokens, themes, materials, typography, icons, file glyphs, motion, and primitives;
- `launcher`: input, scopes, filters, results, selection, actions, preview, and status;
- `onboarding`: first-run narrative and root selection;
- `settings`: all management pages and reusable settings adapters;
- `services`: `SearchService`, settings persistence, diagnostics, and platform interfaces;
- `state`: focused Zustand slices for launcher, query, selection, scope, preview, appearance, settings, gateway, activity, and diagnostics;
- `gallery`: deterministic scenarios, fixture factories, and visual-state controls;
- `platform`: Tauri window lifecycle, shortcut registration, monitor placement, native material, and Rust commands.

Dependencies point inward toward contracts and the design system. React components never invoke Tauri commands directly; service adapters own that boundary.

## Visual Language

Lumen interprets Liquid Glass through Windows 11 rather than copying Apple assets. The window material contains nine restrained layers: native Acrylic or the best supported Windows effect, adaptive tint, luminosity, procedural noise, translucent border, top specular edge, lower inner edge, ambient shadow, and focused glow.

The appearance is quiet and precise:

- neutral graphite and pearl surfaces with a cool luminous accent;
- high information density without cramped spacing;
- large, optically balanced search typography;
- soft geometry using 24 px launcher corners and smaller nested radii;
- depth created by light behavior rather than stacked cards;
- no decorative gradients, floating ornaments, or generic glass cards;
- no Apple fonts, copied icons, or trademarked file-brand artwork.

The expanded workspace reads as one continuous instrument. Dividers, tonal shifts, and selection treatment establish regions; separate card containers do not.

## Semantic Design System

StyleX variables define semantic tokens for material layers, text hierarchy, borders, highlights, inner and ambient shadows, focus glow, accents, status colors, spacing, typography, icons, radii, controls, result density, blur, noise, and motion.

Theme axes are independent so combinations remain valid:

- appearance: system, light, dark;
- transparency: native, reduced, disabled;
- contrast: standard, Windows high contrast;
- effects: full, reduced visual effects;
- motion: full, reduced;
- density: comfortable, compact.

The type stack is `Segoe UI Variable Text`, `Segoe UI Variable Display`, `Segoe UI`, and `sans-serif`. Display typography is reserved for onboarding and major empty states. Search, results, metadata, and settings use text optical sizing.

High contrast replaces translucent semantics with system colors and explicit borders. Transparency-disabled mode uses opaque layered surfaces while preserving hierarchy. Reduced-effects mode removes noise and expensive shadow/blur layers. Reduced motion changes spatial transitions to short fades or immediate state changes.

## Native Window Shell

The launcher baseline is 700 by 66 logical pixels, responsive from 620 to 760 pixels, positioned in the upper fifth of the active monitor. The expanded workspace begins at 800 logical pixels, responds from 720 to 960 pixels, and caps at 600 pixels high.

The Rust application creates a decoration-free, transparent-capable, always-on-top search window excluded from the taskbar where supported. Tauri window effects request Acrylic first and fall back safely. Monitor geometry and scale factor determine logical sizing and position. The window is re-positioned when invoked on a different active monitor.

`Alt+Space` opens and focuses Lumen. Single-instance handling redirects later launches to the existing window. Escape moves backward through preview/details/settings before hiding the launcher. A configurable shortcut is persisted and re-registered safely. Failure to register a shortcut produces an actionable settings message while the app remains usable from its executable.

## Launcher and Search Workspace

The collapsed launcher contains the custom Lumen mark, React Aria `SearchField`, contextual placeholder, optional microphone button, local-AI status, shortcut hint, and quiet activity indicator. Input accepts Unicode, long text, and IME composition without triggering searches mid-composition.

Entering a query transitions to the expanded workspace. The input remains spatially anchored while the shell grows downward at a controlled native boundary. The workspace contains:

- a compact horizontal scope rail for All, Files, Folders, Documents, Code, Images, Recent, and Related;
- active filter chips;
- a result region;
- an optional preview pane;
- a contextual action bar and status strip.

At narrow widths the preview closes first, secondary metadata contracts second, and the result list keeps priority. Keyboard navigation and target sizes remain intact.

## Results and Selection

React Aria `GridList` and `GridListItem` own collection semantics. Results use stable file IDs and a selection store independent of array position. When asynchronous groups arrive, the selected ID remains selected and new groups do not move it unexpectedly.

Rows show a `FileGlyph`, filename, abbreviated path, match fragment, compact metadata, match source, and contextually relevant action. Visual variants cover filename, path, fuzzy, content, semantic, recent, pinned, OCR, image-understanding, loading, unavailable-preview, and permission-denied states.

A shared selection capsule moves between mounted rows. For virtualized lists, the capsule resolves from the selected row's measured geometry; it does not force every row to subscribe to selection. TanStack Virtual activates above a measured threshold and uses stable keys, a fixed or tightly bounded row height, overscan, and React 19-compatible configuration.

## Preview Experience

Preview is cancellable, non-blocking, and subordinate to selection speed. Selection changes create a new `AbortController`; stale responses are ignored even if a platform call cannot be interrupted.

The preview shell keeps stable geometry across loading, content, unsupported, failed, and permission states. Supported phase-one content includes safe folder metadata, plain text and source excerpts, Markdown rendered without active HTML, basic image display, and passive metadata for PDF, document, presentation, spreadsheet, audio, and video files. No active document or script content executes in the webview.

At narrow widths preview becomes a details overlay reachable by keyboard rather than reducing the usable result list below its minimum width.

## Icon System

Phosphor weight communicates state: light for passive, regular for controls, fill for selected, duotone for large categories, and bold only for rare emphasis. Custom Lumen SVG components share a 24-unit geometry, optical bounds, stroke language, corner treatment, and high-contrast fallback.

Custom symbols cover Lumen Search, semantic and hybrid search, related files, local AI, NPU, AgentGateway, MCP, indexed root, developer folder, match sources, OCR, image understanding, reranking, gaming pause, and Cinema mode.

`FileGlyph` supports folder, PDF, document, spreadsheet, presentation, source, image, video, audio, archive, executable, AI model, and unknown types. Glyphs use abstract category cues rather than imitating Office, Adobe, or Apple marks.

## Motion System

Motion communicates spatial continuity. Shared tokens define hover, press, selection, open, close, expansion, preview, and page transitions. The initial selection spring uses stiffness 520, damping 44, and mass 0.72, then is tuned from recordings.

The launcher fades and settles slightly upward on open. Focus raises luminosity and the specular edge. Results expand below the anchored input. The capsule moves between rows. Preview enters from the result region. Scope and settings indicators travel between destinations. Opening a file produces a brief tactile row confirmation before the launcher hides.

Continuous work uses transforms, opacity, and Motion values. The system avoids animated blur, changing large shadows, per-frame React state, layout-heavy animation, bouncing icons, long staggers, and persistent idle animation. All transitions are interruptible, reversible, deterministic, and reduced-motion aware.

## Keyboard and Accessibility

Every core flow is keyboard-complete. Required mappings are implemented exactly: Alt+Space, Escape, arrow navigation, Enter, Ctrl+Enter, Alt+Enter, Tab, Ctrl+K, and Ctrl+Comma. Arrow key repeat and rapid reversals update selection without queued animation lag. Focus returns to the prior region after dialogs and overlays.

React Aria supplies focus, keyboard, collection, dialog, menu, tooltip, tabs, switch, progress, slider, and select behavior. Status changes use polite live announcements; destructive or blocking errors use assertive announcements sparingly. Visual states never rely on color alone. Focus rings remain visible against glass and opaque fallbacks.

Validation covers Narrator, IME, Unicode, text scaling, high contrast, reduced motion, reduced effects, transparency disabled, and minimum target sizes.

## Onboarding and Settings

Onboarding is a concise spatial sequence: product promise, local-first privacy, development-root selection, global shortcut, future indexing explanation, future local-AI explanation, exact-search availability, and background pause behavior. It avoids a form-heavy wizard and keeps primary action placement stable.

Settings use a left navigation rail and a single scrollable content region. Pages include General, Appearance, Indexed Roots, Search, Local AI, AgentGateway, Activity and Indexing, Privacy, and Diagnostics. Astryx may supply secondary switches, selects, progress, and management forms through Lumen adapters, but each control has one behavior owner and adopts Lumen tokens.

All provider, gateway, indexing, gaming, fullscreen, Cinema, battery, and failure states from the brief are present. Actions that cannot operate without a future backend are visibly labeled as simulated phase-one controls in development builds and never imply a live service.

## State and Data Flow

`SearchService` is the only search dependency exposed to React:

```ts
interface SearchService {
  search(request: SearchRequest): Promise<SearchResponse>;
  getPreview(fileId: string): Promise<FilePreview>;
  openFile(fileId: string): Promise<void>;
  openContainingFolder(fileId: string): Promise<void>;
  subscribeToStatus(listener: (status: SearchStatus) => void): () => void;
}
```

`DevelopmentFileSearchService` invokes typed Tauri commands for directory traversal and filename matching. `FutureProductionSearchService` defines the same contract but throws a clear unavailable error if instantiated in phase one.

Query input is debounced only for service calls, never for visible typing. Each search owns a monotonically increasing request ID and abort signal. Results update only when the response matches the current request. Selection reconciliation prefers the existing file ID, then the nearest prior stable neighbor, then the first enabled result.

The Rust adapter exposes `list_files`, `search_filenames`, `get_file_metadata`, `get_basic_preview`, `open_file`, and `open_containing_folder`. It restricts operations to the user-selected development root, normalizes paths, avoids following unsafe cycles, and returns structured errors.

## Error Handling

Errors are categorized as recoverable empty state, permission problem, unavailable preview, invalid root, missing file, shortcut conflict, platform limitation, or unexpected failure. Each category maps to a stable visual treatment and a useful next action. Raw filesystem paths, provider secrets, and unsanitized diagnostics are not displayed in exported reports.

Search errors do not clear a previously usable result set unless the root is invalid. Preview errors remain within preview. Settings persistence failures keep the edited value visible while marking it unsaved. Native transparency or effect failures immediately select the opaque fallback.

## Visual State Gallery

The development gallery is a separate internal mode activated by a development-only command or route. It is the only surface allowed to use fixtures. Scenarios cover every requested launcher, result, preview, activity, provider, gateway, filename, dataset, theme, transparency, contrast, and motion state.

Each scenario has a stable identifier and deterministic data so Playwright screenshots can compare the same state across runs. The gallery can render a single scenario at production dimensions or a labeled matrix for review.

## Performance and Diagnostics

Performance work is measurement-led. The diagnostics overlay reports launcher-open timing, input-to-paint samples, selection response, React commit durations, long tasks, active animations, result count, mounted row count, monitor, DPI scale, refresh estimate, activity mode, gateway state, and provider route.

Profiling targets the brief's 60 through 240 Hz displays without claiming fixed frame rates. Idle UI has no persistent animation loop. Pointer movement never triggers global React renders. Virtualization is retained only when profiling shows a benefit over the non-virtual list at representative sizes.

## Responsive and DPI Behavior

All geometry uses logical pixels and adapts at 100, 125, 150, 175, and 200 percent scaling. Layout does not uniformly scale as a bitmap. Text, controls, gutters, metadata, preview, and density respond independently.

Validation covers 1080p, 1440p, 4K, ultrawide, multiple monitors, mixed DPI, and taskbars on different edges. The active monitor determines placement. Window bounds are clamped to available work area after every monitor or scale transition.

## Verification Strategy

Automated verification includes TypeScript type checking, linting, unit tests for stores and service reconciliation, component tests for keyboard and accessibility behavior, Rust unit tests for root confinement and filename matching, Playwright flows for launcher/search/settings/gallery, screenshot capture, `cargo fmt`, Clippy with warnings denied, Cargo tests, and a production Tauri build.

Manual Windows verification covers warm opening, rapid open and close, keyboard-only completion, IME and Unicode, long filenames, large result sets, rapid selection, Narrator, high contrast, reduced motion, transparency fallback, all DPI levels, mixed monitors, and motion recordings at available refresh rates.

Performance reports distinguish measured hardware and refresh rate from extrapolated targets. Accessibility and DPI reports list the exact environment, checks, results, and remaining external limitations.

## Completion Criteria

Phase one is complete only when the collapsed launcher and expanded workspace are polished; every requested settings and operational page exists; keyboard, icons, motion, fallbacks, and accessibility states work; the real local-file adapter drives normal search; the visual gallery covers all requested states; profiling and DPI validation are documented; screenshots and recordings exist; final commands pass; and no production search or AI backend has been implemented.
