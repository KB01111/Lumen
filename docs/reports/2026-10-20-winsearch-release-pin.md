# Verified WinSearch release pin — 2026-10-20

Lumen's owned engine runtime now pins the optimized CPU package from WinSearch
source `d4f1448068d93d51120f7ec1e2a17395f88089f7`, replacing the earlier debug
checkpoint. The Cargo client/protocol/model-manager references, native and JS
commit checks, and independent manifest lock advance together. Unrelated Cargo
dependency bindings remain unchanged.

The package has 62 files and manifest SHA-256
`d4da84bfcc0ed1ae709963614911a6a1051162589bf666f72d5177c0d6a7c9e9`.
Both the fixed staging directory and the build-copied development resource
directory independently match every declared byte and size.

## Verification

The strengthened actual two-profile native test first failed against the old
payload with `missing engine capability: index.identity`. After the pin/staging
refresh, it passes with the actual release daemon. Both processes expose
`index.identity`, `index.root_policies` and `search.limits`, and report distinct
32-character index IDs. Existing wrong-server PID refusal, paused/deferred
startup and independent shutdown assertions remain. This checks profile
separation; it does not establish identity persistence across consumer restart.

| Check | Result |
| --- | --- |
| `bun test scripts/stage-winsearch.test.mjs` | 21 pass |
| Actual two-profile owned native test, explicitly including the ignored gate | 1 pass |
| `cargo fmt --all -- --check` | Pass |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | Pass |
| `cargo test --locked --all-features -- --test-threads=1` | 413 pass; 27 ignored |
| `bun run typecheck` | Pass |
| `bun run lint` | Pass; zero warnings |

The full Rust count is 387 library, 16 answer-integration and 10 search-integration
passes. Four filtered tests executed by a nested test process are not added
again. The explicitly run owned-native gate is reported separately from the
default suite. Other ignored platform/provider gates remain unverified.

The first refreshed native build failed with resource compiler `RW1022` while
the drive had under 1 GB free. This failure is retained. Clearing this task's
generated WinSearch incremental cache restored build space; all four final Rust
commands then exited zero with the same frozen 111 native source/config files.
[Source and log hashes](2026-10-20-winsearch-release-pin-evidence.json) retain the
functional RED, environmental failure and final passing commands. Raw logs and
runtime binaries remain local.

Independent GPT-6.1 Sol read-only review found no scoped pin/security issue and
confirmed the new assertions preserve PID/Stop checks. The final lockfile retains
only the three matching WinSearch Git-source changes and validates with
`--locked`.

## Scope and remaining work

The [engine checkpoint](https://github.com/KB01111/WinSearch-lumen-engine/tree/codex/winsearch-v1/docs/validation/2026-10-20-release-runtime)
separately verifies actual model references, both engine-native profiles, five
frozen retrieval suites, copied-package CPU inference, PE dependencies and the
unchanged outside-checkout 1,000/1,100-result gate. Those are engine evidence;
this consumer test exercises owned startup/status and shutdown without admitting
user roots or downloading a model.

Normal SearchService still uses the existing backend. Root-policy forwarding,
streaming/cancellation through the adapter, data/pin/history/Recent/Related/answer
migration and one crawler/index/model lifecycle remain required. Frontend
Vitest/Edge/performance and the full Tauri release/installed gates were not rerun
for this pin refresh; they remain mandatory for the completed consumer change.
No installed Lumen or full v1.0 acceptance is claimed.
