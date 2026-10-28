# WinSearch search cutover (primary with local fallback)

Date: 2026-10-27. Engine pin: WinSearch `85a915d460b1fa751bbe86f289ff77c18c032c25`
(now reachable from the engine repository's `main` after its PR #4 merge).

## What changed

- **Root admission.** `synchronize_index_roots` records the host's folder grants
  synchronously (`EngineRuntime::remember_roots`) and forwards them to the engine in the
  background (`configure_roots`): per-folder exclusions, hidden-file and size policy,
  `paused` while there are no grants or background work is not allowed. The last policy
  is cached and re-sent after every engine (re)start, because a new engine comes back
  with deferred admission. Revoking every folder forwards an empty, paused policy.
- **Search.** `search_winsearch` (Rust, `search/winsearch_search.rs`) validates the
  request, translates scope and filters to an engine `SearchQuery`, and streams
  accumulated snapshots over a Tauri `Channel`. It never waits for a cold engine start,
  checks the engine has indexed something, supersedes through the existing request-id
  fence and cancels the native stream promptly (`cancel_winsearch_search` for aborts).
- **Policy at display time.** Each hit is re-checked against its root's *current*
  exclusion, hidden-file and size policy (`traversal::record_matches_policy`), so entries
  the engine indexed before a policy tightened are never shown. Roots whose policy cannot
  be enforced locally are not served from the engine.
- **Pause and background policy.** Every activity-policy transition (user pause, game,
  fullscreen, battery) is applied to the cached engine policy and re-sent through one
  ordered configuration lane (`EngineRuntime::set_background_normal` / `push_config`), so
  the engine pauses with the local index.
- **Mapping.** Every hit is re-confined to a granted root and must carry a bound
  `EntryReference`; it is mapped onto the existing `HybridHit` contract with
  `stableId = winsearch:<result id>`, so the Zod schema, previews and actions are
  unchanged. Terminal outcomes map to complete / superseded / canceled / failed and the
  semantic disabled / ready / degraded state.
- **Frontend.** `DevelopmentFileSearchService` tries the engine first in the native
  build (`winSearch` option, `App.tsx`) and forwards snapshots through `onUpdate`.
  It falls back to `search_hybrid` when the engine is unavailable, invalid, empty, or
  the scope is Recent, Related or Code, or more than one extension/kind filter is used
  (the engine ORs alternatives; the local filters intersect). When the user has tuned
  filename priority or recency away from the defaults, the local ranker stays authoritative
  because the engine cannot honor those weights.
- **Startup.** The verified engine is warmed in the background when the app starts.

## Evidence

- Pure query/mapping/outcome/merge logic compiled and tested against the real pinned
  `ws-client`/`ws-protocol` types in a standalone crate; the Tauri crate itself builds
  only on Windows. Unit tests: `winsearch_search_tests.rs`, 10 vitest cases in
  `winsearch-file-search-service.test.ts`.
- The native `engine_native_search_*` test (run by the existing
  `engine_native_ -- --ignored` CI step) admits a real folder, waits for the pinned
  engine to index it, streams a search and checks confinement.

## Remaining boundaries

- Both crawlers still run while the engine is healthy. Pins, history, Recent, Related,
  `indexed:` identities and answer-context admission remain on the local index.
- Pinning an engine result is a no-op until engine identities are migrated, and engine
  results are not reranked locally or pinned-first; both apply only to local results.
- No installed-app, controlled-performance or signed-package acceptance is claimed.
