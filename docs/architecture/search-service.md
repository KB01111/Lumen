# Search-service boundary

Lumen's React tree depends on one `SearchService` interface. It never imports a Tauri command directly. The native adapter can combine immediate filename traversal with a durable index without coupling launcher, preview, keyboard, or settings components to Rust IPC.

```ts
interface SearchService {
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview>;
  openFile(fileId: string): Promise<void>;
  openContainingFolder(fileId: string): Promise<void>;
  subscribeToStatus(listener: (status: SearchStatus) => void): () => void;
  invalidateIndex?(): void;
}
```

## Runtime adapters

| Adapter | Use | Data source |
| --- | --- | --- |
| `DevelopmentFileSearchService` | Normal Tauri composition and every production build | Typed Tauri filename, SQLite index, preview, and opener commands over selected local roots |
| `DevelopmentSearchService` | Development-only `?service=memory` acceptance and recordings | Deterministic in-memory results |
| Gallery service | Development-only gallery scenarios | Scenario fixtures |
| `MemorySearchService` | Unit/component tests | Controllable test state |
| `FutureProductionSearchService` | Explicit unavailable seam | Throws; it is not selected by application composition |

The application chooses the memory service only when Vite is in development mode and the URL explicitly contains `service=memory`. No production bundle route can select it. Roots come from unpaused Indexed Roots settings, then fall back to the onboarding root.

## Request flow

1. The uncontrolled search input paints its value immediately and commits query work after that paint.
   File-search queries are capped at 4,000 Unicode code points after IME composition completes;
   the controller and Zod request schema enforce the same boundary for programmatic callers.
2. `useSearchController` increments a request sequence, creates an `AbortController`, and calls `SearchService.search`.
   Each request carries the projected enabled scopes, filename priority, and recency preference.
3. Only a response with the latest request ID may update groups, results, selection, or lifecycle.
4. Selection is reconciled by stable file ID. Keyboard intent paints imperatively; React and preview work settle afterward.
5. Preview requests are abortable and stale responses cannot replace the current selection.
6. Open and containing-folder actions resolve only IDs returned by the current service instance.

Scope settings are projected into canonical order and always retain at least one scope. If the
active scope becomes disabled, the launcher falls back to the first enabled scope before issuing
another request. All current adapters use the same deterministic result ranker before applying the
request limit: filename priority boosts filename-source matches, balanced recency uses modified time
inside near-equal relevance bands, and high recency puts known newer timestamps first. Exact ties
retain adapter order. Pinning remains explicitly unavailable because current result metadata does
not expose a pin state.

Every Tauri response is parsed with Zod before entering UI state. Invalid payloads become structured recoverable errors.

## Index freshness and root policy

`DevelopmentFileSearchService` treats the root-policy signature and index freshness as separate
concerns. The signature includes each canonicalized root path plus cloud enrichment, exclusions,
hidden-file policy, and maximum file size. Indexed content is queried only when that complete
signature matches the current settings; any policy change starts a new synchronization and falls
back to confined filename search until it finishes.

A matching index remains readable while its periodic refresh runs in the background (60 seconds by
default). Refreshes for the same signature never overlap. Manual background-work pause prevents a
due or cold synchronization from starting, but does not disable reads from an already-built matching
index. Invalidation advances the service generation, clears cached file capabilities and freshness,
and prevents an older in-flight synchronization from becoming usable after the clear.

## Native local-file commands

The Rust boundary exposes:

- `list_files`
- `search_filenames`
- `get_file_metadata`
- `get_basic_preview`
- `open_file`
- `open_containing_folder`
- `get_index_status`
- `synchronize_index_roots`
- `search_indexed`
- `delete_index_data`

Traversal is blocking filesystem work moved to Tauri's async blocking pool. It is deterministic, case-insensitive for matching, Unicode-preserving, and capped at 250,000 traversed records and 10,000 returned records. Search ranks exact, prefix, substring, then fuzzy subsequence matches.

The SQLite index is authoritative for extracted content, file hashes, revisions, enrichment jobs, and derived artifacts. Synchronization is serialized and generation-safe: changed or deleted content invalidates derived rows, stale synchronizations cannot publish readiness, and clear/root replacement supersedes older work. Text, bounded Office XML, and bounded PDF pages are extracted locally into capped chunks. Filename search remains available before, during, and without a usable content index.

Cloud OCR and transcription jobs are inserted only for roots that opt in while persisted provider consent is active. SQLite owns leases, expiry, retry backoff, idempotency, and atomic insertion of searchable text. Before upload and completion, Rust rechecks the source hash, index generation, pause state, and consent. Images are capped at 4 MiB, audio at 25 MiB, provider responses and stored text at 1 MiB. Semantic/vector search and reranking remain unavailable.

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

## Extension rule

A future semantic or vector engine may implement the same service interface and add richer match sources, groups, and statuses, but it must preserve request IDs, abort behavior, stable IDs, structured errors, confinement, and the rule that exact local filename search remains available without AI. UI components should not change merely because another search lane is added.
