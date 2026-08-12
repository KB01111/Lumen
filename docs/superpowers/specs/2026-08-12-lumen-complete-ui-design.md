# Lumen Complete UI and Runtime Design

**Date:** 2026-08-12  
**Status:** Approved; implementation requested  
**Product:** Lumen for Windows 11

## Objective

Finish Lumen as a minimal, keyboard-first Windows launcher with the immediacy of
Spotlight and PowerToys Run and the optional depth of Raycast. The default
experience is a compact single-column result list. Preview, answers, and
management detail appear only when the user asks for them or when the selected
appearance policy explicitly enables them.

Every control visible in a production build must perform real work. Persisting a
value in Zustand or showing a deterministic preview is not implementation.
Development-only scenarios remain available in the visual gallery, but they are
not exposed as production capabilities.

## Product Principles

- The composer is the product. Lumen has no conventional dashboard or title-bar
  shell.
- Search stays useful without AI. Exact filename, path, and lexical content
  search never depend on a model or network.
- Progressive disclosure beats permanent chrome. Results are primary; preview,
  answer, citations, and actions appear when relevant.
- One visible control maps to one real typed operation. The UI never gets ahead
  of native state.
- Rust owns Windows integration, filesystem trust boundaries, processes,
  credentials, and window geometry. React owns presentation and interaction.
- Fast is a feature. The warm launcher must stay responsive under rapid input,
  selection, large result sets, high DPI, and reduced-motion settings.

## Launcher Architecture

Lumen keeps the existing Rust-owned window modes and logical bounds:

- collapsed: 700 x 66;
- expanded: 800 x 540, resizable between 720-960 x 320-600;
- onboarding: 800 x 600;
- settings: 880 x 600.

The frontend must fit those bounds rather than enlarging the native window to
hide layout defects. Every surface uses a single height chain from `#root` to its
intended scroll owner. Material decoration cannot insert an anonymous full-height
wrapper between a CSS grid and its children.

The expanded launcher contains, in order:

1. an anchored composer;
2. a compact scope/filter row only when useful;
3. an answer region only after explicit submission;
4. a single-column result list as the default workspace;
5. a stable compact action/footer region.

Inline preview is adaptive:

- `automatic`: hidden at the default 800-pixel launcher width and shown only at
  a verified wide breakpoint;
- `always`: shown when the native window has enough width to preserve a usable
  result column;
- `never`: not mounted and no preview IPC is sent;
- `Alt+Enter` or Details opens the existing focused dialog in every mode.

The idle answer placeholder is removed. Retry is shown only for error,
cancelled, or completed answer states; Stop is shown only while waiting or
streaming; Copy is shown only when answer text exists.

## Interaction and Performance

The input remains uncontrolled for keystroke paint performance, but query state
uses one coalesced commit path. A rapid input burst may schedule at most one
pending query-state commit and one search request for the latest value. Search
responses remain request-ID guarded and abort stale native work.

Selection has one source of truth. Preview settling may debounce expensive
preview work, but the visible selection, actions, and accessibility announcement
must refer to the same result ID. No custom browser events are used as a second
selection store when a direct store subscription can express the same behavior.

Continuous motion is restricted to opacity and transform. No idle animation loop
is allowed. Target gates are:

- no browser long task during the existing 30-event rapid-input or rapid-selection
  bursts;
- warm launcher paint p95 below the measured frame budget;
- ordinary React commit p95 below 3 ms in the existing performance harness;
- no document-level horizontal or vertical scrolling in launcher modes.

## Settings and Onboarding

Settings keeps a fixed navigation rail and one independently scrolling content
panel. `LumenSurface` must preserve direct layout children. Pages use compact
rows, sentence-case labels, short descriptions, and inline status rather than
nested cards.

Onboarding is consolidated to four steps:

1. purpose and local-first promise;
2. indexed root selection and real synchronization readiness;
3. shortcut confirmation through the transactional native shortcut operation;
4. optional AI/cloud choices with explicit consent.

Completion is written only after a canonical root is accepted and initial index
synchronization has started successfully. Copy reflects live capability; it must
not describe the existing SQLite index, local runtime, or activity system as a
future feature after those capabilities ship.

## Typed Runtime Boundary

Production controls follow this path:

```text
React control -> typed service -> Zod-validated Tauri IPC -> Rust implementation
              <- typed result/status/event <- validated native payload
```

Optimistic presentation is allowed only when a failed native operation restores
the prior value and returns a specific recovery message. Secrets, unrestricted
paths, process arguments, provider payloads, and raw native errors never enter
React.

The complete work is delivered as independent vertical slices:

1. launcher layout, adaptive preview, answer states, and input performance;
2. index policy, search filters/ranking/history/pins, and SQLite-vector;
3. Windows startup, shortcut, monitor, and close behavior;
4. privacy enforcement and native diagnostics export;
5. Windows activity detection and background-work throttling;
6. provider/model registry, AgentGateway routes, MCP, and permission enforcement;
7. signed local-runtime/model provisioning, embeddings, reranking, and Related;
8. consolidated onboarding and packaged Windows acceptance.

Each slice must leave production UI honest and independently testable.

## Embedded Search Database

Lumen uses one local SQLite database as the durable source of truth:

- ordinary relational tables own files, chunks, roots, policies, history, pins,
  enrichment jobs, answer cache, and diagnostics-safe metadata;
- FTS5 owns exact and lexical content retrieval;
- ordinary `chunk_embeddings` rows store embedding BLOBs plus model, dimension,
  distance metric, content hash, and index revision;
- `sqlite-vector` 1.0.0 provides exact and optional quantized nearest-neighbour
  scans;
- all result IDs resolve back through confined canonical file records.

`vector_init` runs for every connection that performs vector operations. The
initial production path uses FLOAT32 embeddings and cosine distance. Exact vector
search ships before approximate search. TurboQuant 4-bit can be enabled only
after target-hardware recall, latency, memory, update, and cancellation evidence
meets the acceptance thresholds recorded in the implementation plan.

The current `sqlite-vec` `vec0` table is replaced through a versioned rebuild
migration. FTS and source metadata remain available while vectors rebuild.
Dimension or model changes invalidate only affected embedding rows. Deleting an
index removes FTS, vector, artifact, history-derived cache, and answer-cache data
without deleting source files.

The extension is never loaded from a user-controlled path. Lumen installs the
exact `@sqliteai/sqlite-vector-win32-x86_64@1.0.0` build dependency, verifies the
packaged `vector.dll` against a repository-owned SHA-256, and stages it as a
Tauri application resource. Rust loads only the resolved development staging
path or packaged resource path while extension loading is enabled for that
operation, then disables extension loading immediately afterward.

## Licensing and Supply Chain

Lumen adopts Apache License 2.0 at the repository root. Package metadata declares
`Apache-2.0`, and a third-party notices ledger records `sqlite-vector`, its pinned
version, source URL, checksum, license terms, and any bundled binary.

The vector extension and other native artifacts are staged from immutable release
coordinates with SHA-256 verification. A version mismatch between the staged
binary, expected version, and `vector_version()` fails closed. MSI and NSIS tests
must prove the installed application can open the database and execute a vector
smoke query on supported Windows architectures.

## Complete Functional Slices

### Search and index

Root policies for exclusions, hidden files, maximum size, pause, and cloud
enrichment are validated and enforced natively. Rebuild is a real forced rebuild
with per-root progress and errors. Enabled scopes, filters, filename priority,
recency, pins, and durable history affect native results. `Recent` uses real local
history. `Related` is enabled only after embeddings and hybrid retrieval pass.

Hybrid ranking combines independently normalized lexical, vector, filename,
recency, and pin signals. Exact filename matches remain deterministic and cannot
be displaced below weaker semantic matches by default.

### Windows lifecycle

Launch-at-startup uses the existing Tauri autostart plugin. Shortcut changes are
transactional. Monitor policy selects active or primary monitor in Rust. Close
policy actually hides or quits. Startup hydration applies persisted native
settings before the launcher becomes interactive.

### Privacy and diagnostics

Preview-disabled blocks preview work before IPC and again in Rust. History and
index deletion operate on durable data. Diagnostics aggregates real versions,
index status, gateway/runtime status, activity status, and bounded timing/log
samples. Export uses a native save dialog and a sanitizer that removes secrets,
prompts, file contents, drive/UNC paths, authorization values, and credentials.

### Activity

Rust observes only the minimum Windows state needed to classify foreground,
fullscreen, game, video, and power conditions. Policies pause or throttle
background indexing and enrichment; exact search remains available. Overrides
bind to validated executable identity rather than process name alone. Lumen never
becomes a generic process manager.

### Providers, MCP, and local AI

Rust owns a provider/model capability registry, credentials, routes, health
tests, fallback behavior, and secret-free DTOs. MCP services and tool counts are
live; permission decisions are enforced where tools execute. Local runtime and
model provisioning uses signed/checksummed artifacts, bounded storage, progress,
cancellation, and supervised lifecycle. No arbitrary executable or argument is
accepted from React.

Computer Use retains its existing browser-only, fresh Edge, fixed-worker,
explicit-consent, approval, cancellation, length, and step limits. This slice is
hardened and tested, not generalized into desktop-wide automation.

## Error Handling

- Layout overflow is a test failure, never handled by growing native bounds.
- Search, answer, preview, activity, gateway, and Computer Use failures stay in
  their own regions and do not erase usable local results.
- Native settings return the applied value; failed updates restore the last
  applied state.
- Index migrations are transactional where possible and resumable when vector
  generation is external work.
- Missing or invalid `sqlite-vector` artifacts disable semantic features while
  preserving FTS and exact search, with a specific diagnostic state.
- Security-sensitive validation fails closed.

## Verification

Every behavior change follows a failing-test-first cycle. Required gates include:

- focused Vitest tests for components, stores, service contracts, and Zod parsing;
- Rust unit/integration tests for path policy, migrations, vector queries,
  settings, activity classification, permission enforcement, and sanitization;
- Playwright keyboard, accessibility, bounded-layout, DPI, theme, preview-policy,
  and performance coverage;
- packaged MSI/NSIS smoke tests for native resources and `sqlite-vector`;
- regenerated screenshots, interaction recordings, and performance evidence;
- `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:e2e`, and
  `bun run tauri build`, plus Rust fmt, Clippy, and tests for native changes.

## Completion Criteria

The work is complete when the default launcher is a bounded, minimal,
single-column experience; optional detail is progressively disclosed; rapid input
and selection pass the performance harness; every production control drives real
typed behavior; SQLite-vector-backed hybrid retrieval works locally without
weakening exact search or confinement; Apache-2.0 and third-party notices are
present; and the complete local and packaged Windows verification matrix passes.
