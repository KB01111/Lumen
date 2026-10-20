# WinSearch NPU package handoff — 2026-10-20

The owned engine advances to WinSearch runtime source
`85a915d460b1fa751bbe86f289ff77c18c032c25`. Cargo's client/protocol/model-manager
revision and lockfile, compiled engine revision, staging verifier/allowlist and
independent payload manifest pin advance together. The lockfile changes only
the three WinSearch Git package sources; registry dependencies stay unchanged.

The model-free NPU/CPU package declares 69 files/221,486,715 bytes, excluding
its manifest. Manifest SHA-256:
`171aedbb142c712520b768f524ca848a79aab519081cfc0209e8781e96d7390d`.
It includes the real `iron_xrt_shim.dll` and six taconite/model-runtime/XRT
license files. AMD's installed Windows NPU driver is a system prerequisite;
weights are installed separately. Unexpected files, corruption, unsafe paths,
reparse points and replacement protections remain enforced.

## Native consumer evidence

The exact payload was staged with `bun run stage:winsearch --source <package>`.
The explicitly invoked
`engine_native_owned_profiles_authenticate_and_stop_independently` test passes
against this payload: two owned daemons, distinct PIDs/index identities,
wrong-PID connection rejection, paused startup, no admitted roots or embed
worker, and independent Stop. Status does not download models or admit roots.

| Check | Result |
| --- | --- |
| Staging/verifier tests | 22 pass |
| TypeScript typecheck and full ESLint | Pass, zero lint warnings |
| Vitest | 90 files / 787 tests pass |
| Edge functional tests | 131 pass, one worker, zero retries |
| Production Edge performance tests | 4 pass, existing budgets unchanged |
| Rust formatting and all-target/all-feature Clippy | Pass, `-D warnings` |
| Full serial all-feature Rust suite | 413 pass / 27 ignored |
| Explicit final owned two-profile native test | 1 pass, 13.09s |
| Final locked `bun run tauri build -- --locked` | Pass; application and NSIS installer produced |

The ordinary Rust count is 387 library + 16 answer integration + 10 search
integration; four tests invoked in a nested child are not double-counted.
Other ignored platform/provider tests remain unverified. The first separate
native invocation hit OS 1455 virtual-memory exhaustion while compiling
unrelated integration targets. The same native test passed using one build
job and `--lib`, retaining all assertions. Only generated debug symbols and
this checkout's incremental cache were cleared to restore build disk space.
Raw failure and passing logs are retained separately.

The frontend has no changes in this handoff. Edge evidence is browser evidence;
it does not establish installed WebView2 or strict 120/240 Hz acceptance.

[Final source/log/payload/binary hashes](2026-10-20-winsearch-npu-handoff-evidence.json)
record the final commands and exact resource copies. The final release build
retains the original Cargo registry bindings and passed with `--locked`.
The earlier cold Tauri build also passed; final-source release compilation
completed in 7m31s before standard NSIS compression. This is an unsigned local
build, without installation or release publication.

## Separate engine evidence

WinSearch's [NPU validation report](https://github.com/KB01111/WinSearch-lumen-engine/blob/codex/npu-embeddinggemma2-completion/docs/validation/2026-10-20-npu-completion/README.md)
binds source/binary hashes, the manifest and 37-file PE dependency audit. It
records actual HX370 NPU text and 140/280-token image references with cosine
at least .999, all 10 frozen NPU/mixed-index retrieval runs and zero negative
false positives. The two failed 70-token NPU cases remain documented;
70-token images use CPU/GPU fallback by explicit user approval. Audio remains
on llama.cpp. The vector recipe remains 768-dimensional, normalized, text 512,
pipeline 2; no acceptance threshold changed.

That report also records copied-package NPU/CPU/media inference outside both
checkouts with developer overrides removed, missing/corrupt component fallback,
deadline/recovery/quarantine tests, and a final 66.443 second idle-host no-model
package test retaining its 90 second watchdog and 1,000/1,100-result checks.
Contention timeouts during compilation/installer compression remain recorded;
this pass does not establish a latency guarantee under build load. Fixed short
text is faster on CPU (warm median 24.13 ms versus 107.29 ms NPU); timings separate
host processing from NPU dispatch waits and do not claim device utilization.

## Boundaries

Existing SearchService routing, root-admission gate and migration behavior are
unchanged. Live query/configuration forwarding, data migration and local answer
generation remain separate work. Signing, installed-app verification, native
restart/migration and broader v1 acceptance remain open. No binary release,
automatic merge or production-ready claim is made.
