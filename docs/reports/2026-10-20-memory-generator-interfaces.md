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
