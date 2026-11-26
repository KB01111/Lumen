# WinSearch native adapter implementation ledger

Base: Lumen `a61ca3c6b890dbed765fb2ba6a4fd15dfa76d76a`, branch
`codex/winsearch-production-adapter`.

## Scope and admission

`EngineSearchService` implements the existing `SearchService` stream contract.
It is opt-in: `App.tsx`, the default composition root and the legacy ledger and
workers remain unchanged. Hydration must finish before native configuration.
An empty current root array is explicitly acknowledged, with no saved-policy or
onboarding fallback. Canonical roots, exclusions, hidden policy and byte limits
are applied before query admission.

Search is served by the launcher engine path main already owns
(`search::winsearch_search::search_winsearch`). The adapter does not run a
second engine session: it forwards the hydrated request to that command and maps
its `HybridSearchResponse` onto the existing `SearchService` groups. Result
confinement, pin/provenance reuse, policy re-checks and cancellation therefore
stay in one implementation. The adapter still owns:

- `configure_winsearch_engine`: canonicalizes the hydrated policy, records the
  same confinement roots the launcher uses, caches the engine configuration and
  pushes it through the host's ordered configuration lane. A restarted engine
  receives the cached indexing and semantic/backend configuration.
- `subscribe_winsearch_engine` / `unsubscribe_winsearch_engine`: bounded status
  streams over the same `EngineRuntime::status` the launcher reads.

Empty-query Recent delegates to the injected host ledger; catalogue composition
continues to wrap any `SearchService`. Related stays on the host/local index,
matching the launcher path; engine-only identities are not durable host
bindings. Preview/open/pin for engine IDs explicitly remain unavailable pending
Tasks 7–8; this adapter must not be selected by default yet.

## Verification log

- `bun install --frozen-lockfile`, `bun run typecheck` and `bun run lint`
  validated the branch before the rebase.
- Adapter frontend boundary: hydration, empty grants, abort, stale grant
  response rejection, Recent, terminal status and closure of stream delivery.
- Rust policy/status selection: hydration, canonical grants, duplicate/cloud
  rejection, backend validation and model readiness.
- `cargo check`/`cargo test` results for the rebased tree are recorded in the
  pull request checks.
- The staged payload pin is `accd7071fc5822e14df68877d0834ab2b83ae72c`
  (`winsearch-payload.lock.json`), with the 79 MB archive intentionally
  untracked.

These are source/fixture results. They do not certify installed behavior, live
semantic/model/backend quality, hosted checks, signing, resource limits or UI
performance. Task 11 owns final pins, staging and the mandatory
packaged/installed candidate matrix.

## Task 7 handoff: ledger and duplicate lifecycle

- `IndexRuntime::open` in `search/indexing.rs` starts `IndexWorker` directly.
  `lib.rs` separately calls `start_index_lifecycle`, which queues embedding and
  cloud enrichment. Both startup paths need metadata-only alternatives; merely
  deleting the latter still leaves inventory/content writes running.
- The `files` table currently requires `content_hash`, `extraction_version` and
  positive `index_revision`. Existing metadata upserts fabricate content-shaped
  rows/chunks, so they cannot implement the requested metadata-only pin ledger.
  Pins and access history reference numeric file rows; preserve their timestamps,
  stable IDs, history settings and counts through a backed-up atomic migration.
- Bindings need host profile, separate ordinary/code index incarnation and native
  entry identity in both directions. The engine's `winsearch:<result>` IDs are
  explicitly not durable host bindings. A matching path cannot establish
  identity after file replacement, reset, disconnected drives or index rebuild.
- Source consumers include `gateway/answer.rs` (`answer_context`),
  `gateway/mcp.rs` (search/context/metadata/open), `windows_ai/files.rs` (file
  resolution and answer context), `search/preview.rs`, and `search/mod.rs`
  opening helpers. Route them through current bindings and grant admission
  before selecting the adapter.
- Preserve the host Recent and pins paths as metadata-only operations. Require a
  fresh engine resolution before source reads/actions; unresolved metadata must
  remain visible as unavailable, with no fabricated hash or stale answer context.
- Backup/integrity verification, crash points around the migration transaction,
  repeat migration, rollback, ordinary/code namespace reset and zero legacy
  content/vector-write counters are required before default cutover.

Task 7 and Task 8 are not implemented in this adapter commit.
