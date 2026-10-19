# WinSearch owned startup checkpoint

Lumen now owns a lazy, verified WinSearch process behind its Rust boundary. The
native `get_winsearch_engine_status` command starts that process and reads actual
engine status. Normal search still uses Lumen's existing SQLite adapter. This is
an integration checkpoint; it does not establish the search-backend cutover or
full v1.0 acceptance.

## Inputs and resulting behavior

- Rust client and development payload: WinSearch commit
  `de3d18645dca3a47e4e5bbb6167c3165b7678093`.
- Independent payload manifest SHA-256:
  `6865b4bf80fd97b761d71affe186104ec6c2e150b942ab5532c12da9a1ec7fc6`.
- The real staged model-free payload contains 62 declared files. Runtime startup
  verifies the independent manifest anchor, each file's size and SHA-256, and the
  absence of unexpected files. Synthetic verifier fixtures are separate tests.
- Reparse ancestors and opened reparse/offline/recall resources are rejected.
  Payload handles exclude write/delete sharing and remain owned until process
  teardown. An invalid packaged payload cannot select a development fallback.
- Rust supplies the fixed executable and arguments, a narrow environment and
  System32-only PATH. The existing stdin barrier holds initialization until the
  process is attached to a kill-on-close Job Object.
- Each runtime has its own pipe namespace and data directory. Every connection
  authenticates the actual server PID before Hello against the retained owned
  child handle. No process paths or low-level IPC are exposed to React.
- Deferred root admission keeps this engine from crawling while the existing
  search adapter remains active. Status startup admits no folders and downloads
  no model. Application exit shuts down the engine before joining the legacy
  index worker.

## Verification

Commands ran from `src-tauri` unless stated otherwise. Existing assertions,
resource limits and acceptance thresholds were not relaxed.

| Scope | Result |
| --- | --- |
| `cargo test --locked --all-features -- --test-threads=1` | 387 library and 26 integration tests passed; 27 library cases ignored by the default run |
| Explicit real staged-payload test below | One additional test passed; zero failures or ignored cases in that invocation |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | Passed |
| `bun run typecheck` and `bun run lint` from the repository root | Passed; zero ESLint warnings |

The explicit native command was:

```text
cargo test --locked --all-features --lib engine_native_owned_profiles_authenticate_and_stop_independently -- --ignored --test-threads=1
```

That test starts two real Windows daemon profiles, observes deferred/paused
status, rejects a connection authenticated against the other owned PID, shuts
down one profile and verifies its process terminates while the other remains
usable. It then shuts down the second profile. The four default verifier tests
cover byte/manifest corruption, unexpected and missing dependencies, reparse
parents, write-lock lifetime and rejection of a synthetic package against the
compiled manifest anchor.

## Remaining acceptance

This checkpoint does not route search, root admission, actions, previews, answers
or model management through WinSearch. Root-policy parity, index incarnation and
stable identity migration, pins/history/Recent/Related, consented enrichment and
the single crawler/index/model lifecycle remain required. Runtime crash/restart,
streaming cancellation and native Stop/input/selection acceptance need their
consumer tests. The host metadata ledger and frontend streaming work are not
part of this checkpoint.

The 26 other ignored Rust cases remain separate acceptance work. Browser-only
fixtures, this model-free native process test and packaging checks do not prove
installed Lumen, actual packaged model/GPU inference, full release builds,
signing, updates, large-index performance or broad final security/accessibility
acceptance. No release was uploaded or merged.

The author reviewed this scoped change. An attempted independent reviewer could
not start because the agent thread limit was reached; independent branch review
remains open.
