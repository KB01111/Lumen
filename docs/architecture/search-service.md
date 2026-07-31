# Search-service boundary

Lumen's React tree depends on one `SearchService` interface. It never imports a Tauri command directly. This keeps the phase-one local adapter replaceable without coupling launcher, preview, keyboard, or settings components to a future index.

```ts
interface SearchService {
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview>;
  openFile(fileId: string): Promise<void>;
  openContainingFolder(fileId: string): Promise<void>;
  subscribeToStatus(listener: (status: SearchStatus) => void): () => void;
}
```

## Runtime adapters

| Adapter | Use | Data source |
| --- | --- | --- |
| `DevelopmentFileSearchService` | Normal browser/Tauri composition and every production build | Typed Tauri commands over selected local roots |
| `DevelopmentSearchService` | Development-only `?service=memory` acceptance and recordings | Deterministic in-memory results |
| Gallery service | Development-only gallery scenarios | Scenario fixtures |
| `MemorySearchService` | Unit/component tests | Controllable test state |
| `FutureProductionSearchService` | Explicit future boundary | Throws an unavailable error in phase one |

The application chooses the memory service only when Vite is in development mode and the URL explicitly contains `service=memory`. No production bundle route can select it. Roots come from unpaused Indexed Roots settings, then fall back to the onboarding root.

## Request flow

1. The uncontrolled search input paints its value immediately and commits query work after that paint.
2. `useSearchController` increments a request sequence, creates an `AbortController`, and calls `SearchService.search`.
3. Only a response with the latest request ID may update groups, results, selection, or lifecycle.
4. Selection is reconciled by stable file ID. Keyboard intent paints imperatively; React and preview work settle afterward.
5. Preview requests are abortable and stale responses cannot replace the current selection.
6. Open and containing-folder actions resolve only IDs returned by the current service instance.

Every Tauri response is parsed with Zod before entering UI state. Invalid payloads become structured recoverable errors.

## Native local-file commands

The Rust boundary exposes:

- `list_files`
- `search_filenames`
- `get_file_metadata`
- `get_basic_preview`
- `open_file`
- `open_containing_folder`

Traversal is blocking filesystem work moved to Tauri's async blocking pool. It is deterministic, case-insensitive for matching, Unicode-preserving, and capped at 250,000 traversed records and 10,000 returned records. Search ranks exact, prefix, substring, then fuzzy subsequence matches.

Generated dependency and build directories are skipped by name: `.git`, `.next`, `.turbo`, `coverage`, `dist`, `node_modules`, `out`, `target`, and `vendor`. Unreadable entries are reported as bounded warnings rather than failing every usable root.

## Confinement and preview safety

- Roots must be absolute, canonical directories.
- Every metadata, preview, and opener path is canonicalized and must remain under its canonical root.
- Symlinks are not followed during traversal or folder preview.
- Visited canonical directories prevent cycles.
- Text/source/Markdown previews read at most 64 KiB and reject NUL-containing or invalid UTF-8 data.
- Raster image previews read at most 4 MiB and use passive data URLs.
- PDF, Office, archive, executable, model, audio, and video previews remain passive metadata states.
- Paths are displayed without the Windows canonical `\\?\` prefix, while filesystem operations retain canonical paths.
- Openers use Tauri's opener plugin only after confinement succeeds.

## Phase-two replacement rule

A production engine may implement the same service interface and add richer match sources, groups, and statuses, but it must preserve request IDs, abort behavior, stable IDs, structured errors, confinement, and the rule that exact local filename search remains available without AI. UI components should not change merely because the backend becomes indexed or semantic.
