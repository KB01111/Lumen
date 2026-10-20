# Memory and generator addendum acceptance

Scope: the user selected addendum interfaces and shared clients first. Full Agent Core, Pi Durable and DeepAgents execution engines, native scheduling and MXC containment are separate work. New interfaces use native Rust/SQLite and add no Rivet dependency. Existing Rivet queues and Docker Prime execution have not been migrated.

## Requirement evidence

| Requirement | Implementation / evidence |
| --- | --- |
| Rust-owned extensible memory | `lumen-agent-core` standalone workspace exports `MemoryProvider`, `MemoryCore`, `MemoryReader` and strict versioned contracts. |
| Exact scoped retrieval | Project and session equality; no scope fields accepted from workers. Rust tests reject project/session crossover and worker-selected scope. |
| Provenance and explicit approval | Five-minute one-use review handles; approval digest covers provider, source, scope, content and provenance. Tests reject pending and changed records. |
| Retention and deletion | One to 365 days or explicit until-deleted retention; secure SQLite deletion, access-time pruning and explicit prune. Tests cover expiry, deletion, reopen and revocation during provider I/O. External deletion revokes Lumen's snapshot/approval only. |
| Independent provider configuration | Native settings persist per provider. Others default disabled; optional-provider failure leaves native memory available. Native host initializes lazily and reports storage failures through typed errors. |
| Optional, read-only local Beacon | Literal numeric loopback HTTP, no proxies/redirects, bounded MCP frames and fixed `get_memory` calls for selected IDs only. Local HTTP fixture verifies protocol, read-only behavior and cross-project/redirect rejection. No installer, hook/capture configuration, cloud destination or Beacon file access. |
| Independent native storage | Dedicated `lumen-agent-memory.sqlite3`; approved snapshots and local approvals do not access or modify Beacon storage. |
| Shared Pi/DeepAgents consumption | Both clients export the same retrieval implementation. Six cross-language tests invoke a real Rust reader fixture, return approved context and reject pending memory and worker scope overrides. No full engine execution claim. |
| Extensible generation | Standalone `ImprovementGenerator` trait with host-owned input/candidate types. Prime uses the adapter; deterministic fixtures exercise two generator identities. |
| Existing evaluation/promotion preserved | Both fixture generators enter existing `create_for_job`; fabricated approval cannot activate a proposed candidate and failing evaluation remains rejected. Existing evaluator, improvement store, rollback and native security files are unchanged. |
| Strict versioned candidate ingress | Schema version, generator, base and evidence binding checked before job-bound import. Tests reject unknown versions, hidden-case/report fields, permission/policy/script edits and inferred preference edits. |
| Prime remains supported | Existing Docker/ACP guest protocol and runtime retained; new generator adapter supplies the same host-built sanitized input. Cancellation awaits runtime cleanup. Live Prime/MXC acceptance is not established. |
| Harness2 disabled/uninstalled | Manifest decoder only; production generation returns an explicit disabled/uninstalled error. No runtime, executable registration, dependency, schedule, evaluator or database. |
| Future editable surfaces | Current prompt/tool-guidance/bounded workflow schema retained; future retrieval, skills and subagent configurations require declarative schema/evaluator/approval extensions. Native permissions and policy remain outside the candidate schema. |

## Verification recorded during implementation

| Check | Result |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run lint` | Passed, zero warnings |
| `bun run test` | 789 passed across 92 files |
| Focused shared-client and native-service Vitest tests | 12 passed after final client validation changes |
| `bun run test:agent-core` | 12 Rust tests and six real TypeScript-to-Rust reader tests passed |
| Standalone Rust formatting and Clippy, all targets, warnings denied | Passed |
| Tauri Rust formatting and Clippy, all targets/features, warnings denied | Passed |
| Focused native improvement tests | 34 passed; three existing runtime-dependent tests ignored |
| Complete native Rust suite, all features, locked dependencies, serial test runner | 417 passed; 26 existing tests ignored (RTK summary) |
| `bun run test:e2e`, installed Edge, one worker, no retries | 131 passed |
| Existing sidecar staging | Passed, including existing Windows AI staging/protocol checks; no research runtime installed |
| Read-only security review | No actionable defects found; source review only |
| `bun run tauri build` | Passed; optimized Windows application and `src-tauri/target/release/bundle/nsis/Lumen_0.1.0_x64-setup.exe` produced. Existing `lottie-web` direct-eval bundler warning remains; lint and Clippy passed with warnings denied. |

No UI/performance behavior changed, so gallery/recording/performance evidence was not regenerated. The existing nominal 240 Hz gate is not reclassified by this work.

## External and deferred acceptance

Beacon wire compatibility was checked against the pinned official source and a local protocol fixture, not a live installed Beacon server. No user memory or agent history was captured or forwarded for verification. Harness2, full Pi/DeepAgents engines, native MXC containment, live Prime evaluation, signed distribution and the existing ignored native runtime gates remain unverified. These are not prerequisites for the addendum interfaces; enabling research optimization remains deferred behind the existing improvement acceptance gates.

The native Windows/MXC direction is recorded in `lumen-agent-core/ARCHITECTURE.md`. MXC containment does not replace durable queue persistence; the existing Rivet and Docker migration requires its own native scheduling, recovery and containment acceptance.

## PR #29 review follow-up

Reviewed all 12 inline comments, the submitted reviews and the conversation comments. The duplicate findings and two conversation suggestions reduce to ten valid issues:

| Finding | Change and verification |
| --- | --- |
| Stale/missing snapshots consume the SQL result limit | Page approved candidates in batches of at most 20 source IDs, with one shared three-second provider deadline. Apply the final limit after live validation. A regression skips 21 missing/changed records and retrieves the valid record on the next page. Beacon per-record tool errors omit that record and continue with later selected IDs; transport and malformed-response errors still fail closed. |
| SQLite ASCII-only lowercase hides international text | Compare Unicode lowercase substrings in Rust while retaining exact SQL provider/scope filtering. Tests cover Ångström, CAFÉ and Résumé case variants. |
| External approval can use a stale review | Re-read the exact external record before approval, reject changed/missing content or provenance, and consume the stale handle. Native approval remains local. The native command now awaits this check. |
| Disable/re-enable can admit earlier in-flight work | Capture a per-provider revocation generation and compare it at admission. Tests cover retrieval, review and approval across disable/re-enable, alongside existing deletion and disable coverage. |
| Redirect test cannot distinguish rejection from a failed connection | Redirect to a reachable listener and assert that no connection arrives. Temporarily enabling redirect following made this test fail at that assertion; restoring the policy made it pass. |
| Shared fixture hardcodes the Windows executable suffix | Select the suffix from `process.platform` and honor `CARGO_TARGET_DIR`. Both clients passed against the current Windows fixture; Linux/macOS execution was not available locally. |
| Retrieval skips physical expiry cleanup without enabled providers | Prune before inspecting the bound provider list. Disk-backed tests verify deletion with no providers and with the native provider disabled. |
| Generator IPC lacks a typed frontend service contract | Remove the unused command and its handler registration. Generator descriptors remain internal test fixtures; no new frontend capability is exposed. |
| Deletion during external review can stage a new review afterward | Advance the provider generation on deletion. Paused review and approval tests verify that deletion revokes the delayed operation. |
| Fixture stdin can allocate an unbounded line before validation | Bound framing to 2,050 bytes, allowing the 2 KiB request plus CRLF. Reject and close oversized frames. Tests cover oversized input followed by another request and the exact CRLF size boundary. |

The initial five memory regressions, delayed deletion, malformed stale-review reuse, Beacon missing-record behavior and oversized framing were observed failing before their fixes. The shared deadline test also verifies cancellation of provider work and rejects further pages after expiry. The Qlty notice reports structural complexity metrics without an additional correctness finding; the scope remains the concrete review defects.

Fresh review verification:

| Check | Result |
| --- | --- |
| Typecheck and lint | Passed, zero lint warnings |
| Full Vitest suite | 789 passed across 92 files using one worker. The initial parallel run had one existing provider-page test hit its five-second timeout; its eight-test file passed unchanged, then the full suite passed with unchanged assertions and timeouts. |
| `bun run test:agent-core` | 19 Rust tests and eight real client/fixture tests passed |
| Standalone and Tauri formatting and Clippy, all targets/features as applicable | Passed, warnings denied |
| Full native suite, locked dependencies, one test thread | 387 library tests, 26 integration tests and four isolated proxy regression tests passed; 26 existing tests ignored |
| Installed-Edge functional suite, one worker, no retries | 131 passed |
| Production profiling bundle, installed-Edge performance tests | Four passed with unchanged budgets. This qualifies the browser workload only; it does not establish strict native 240 Hz or reference-hardware acceptance. |
| `bun run tauri build` against final sources | Passed; optimized Windows application and NSIS installer produced. Existing `lottie-web` bundler warning remains. This is a local unsigned build, not signed distribution acceptance. |
| Independent review of the fixes and final additions | No actionable defects found; read-only source review |

Both Cargo workspaces reused existing target caches through `CARGO_TARGET_DIR` and compiled the current checkout's sources. One attempted final native relink encountered a Windows lock from the earlier test executable; the final source run passed after serializing the runs. Existing live-provider, signing, hardware and ignored runtime acceptance limits above still apply.

## Merge-readiness follow-up (2026-10-21)

Merged `main` at `a40c958f8b7db4be7211bb1dcc50f557c9de2957`, retaining both Agent Core verification and the new owned WinSearch startup/Stop/profile CI checks.

Two subsequent review findings were reproduced before correction:

- A later provider page failure retained earlier results from that provider. Retrieval now stages provider results and discards them on failure. The regression checks both provider orders and preserves healthy native results.
- Beacon tool errors were silently skipped. Only the pinned upstream single-text `memory not found: <requested ID>` response is skipped now; other errors report the provider unavailable. Coverage includes backend failure, the wrong missing ID, malformed error content, and the exact missing-record response. The older missing-ID fixture was corrected to match upstream's ID-bearing message.

At the publication checkpoint, typecheck, lint, all 803 Vitest tests, 21 standalone Rust tests, eight cross-language fixture tests, standalone Clippy with warnings denied, both formatting checks, and sidecar staging passed. The two new regressions failed on the old implementation and passed after the fixes. Native application tests, Clippy, installer packaging and the full Edge suite run separately; their final status is recorded on the PR.

The initial concurrent browser performance run missed the unchanged React commit p95 budget (3.6 ms against 3 ms); it requires a quiet rerun. Local tooling passed 35 of 36 tests; the owned dev-server test failed again in isolation because this host reports PID 0 for its listening socket. Its ownership admission and assertions are unchanged. Hosted CI remains required, and these local limitations must remain explicit.
