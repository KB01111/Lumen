# Extensible memory and improvement implementation plan

**Goal:** Implement the approved addendum scope: native memory providers, shared Pi/DeepAgents clients, and candidate generator interfaces. The full Agent Core runtimes in the attachments are separate work.

**Architecture:** A standalone Rust workspace owns memory storage, scope, approval, retention and provider configuration. Tauri hosts it lazily. Read-only harness clients use a session-bound transport. Existing improvement storage, evaluator, approvals, activation and rollback remain authoritative.

**Constraints:** Windows-native Rust and SQLite; no new Rivet dependency; future executable isolation targets MXC. No Beacon installation, capture, cloud forwarding, Docker startup or Harness² runtime. The existing Prime runtime is retained for compatibility; migrating existing Rivet queues and Docker execution to native scheduling/MXC is separate from these interfaces.

## 1. Memory Core

- [x] Add `lumen-agent-core/crates/lumen-agent-core` with `MemoryProvider`, strict versioned contracts and bounded, exact project/session scopes.
- [x] Add security tests for explicit approval, scope isolation, provider failure, content changes, expiry, deletion, disabled providers and cloud denial.
- [x] Implement a dedicated `lumen-agent-memory.sqlite3` store, native provider, expiring review handles, content-bound approvals and persistent per-provider settings. Prune expired records on access; expose explicit pruning. Recheck approval/configuration after provider I/O.
- [x] Prepare a read-only Beacon loopback MCP adapter using only `get_memory`. Fetch only explicitly approved IDs during retrieval; review requires a user-selected ID. Validate the project, full content and provenance. Bound bytes, time and cancellation; disable redirects/proxies and reject remote endpoints.

## 2. Shared clients and native hosting

- [x] Add one strict TypeScript retrieval client and thin Pi Durable / DeepAgents exports. The trusted native host binds scope/providers/local route; the worker cannot select them in a request.
- [x] Test both clients with the same protocol fixture and Rust boundary, including unknown fields and malformed/unapproved results.
- [x] Add lazy native hosting and typed management commands behind `src/services/agent-memory`; provider or storage failure must not fail app startup. No new UI or privileged worker management commands.

## 3. Candidate generators

- [x] Add `ImprovementGenerator` using existing candidate types and sanitized development-only generation input.
- [x] Route Prime through the interface. Add a disabled Harness² manifest adapter with version, generator, base and evidence checks before the existing job-bound import/evaluation path.
- [x] Test multiple generators, unknown versions/fields, stale/evidence mismatches, prohibited changes, cancelled work, no activation without the existing gate and unchanged approval/rollback behavior.

## 4. Verification and delivery

- [x] Add standalone Rust/client checks to CI. Run formatting, typecheck, lint, unit tests, installed Edge tests, Rust Clippy/tests and Tauri build. Report unavailable prerequisites accurately.
- [x] Document adapter source revisions, privacy/recovery boundaries and the deferred native MXC migration.

Delivery: commit, push and create a PR without merging after the final local build gate.
