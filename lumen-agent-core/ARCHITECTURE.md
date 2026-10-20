# Memory and improvement extension boundaries

## Memory ownership

`MemoryProvider` is a Rust-owned, read-only provider contract. The provider receives an exact `MemoryScope` and a bounded list of source IDs selected by Rust. `MemoryCore` owns all native records and approvals in `lumen-agent-memory.sqlite3`, independent of the search index, improvement database and Beacon storage. Provider registration is native code, never a model-generated executable path or tool name.

Projects and sessions use explicit opaque IDs, never path-prefix matching. A project-only grant does not include session-only records; a session grant does not implicitly include project records or other sessions. The trusted native session owner calls `bind_reader(scope, providers, route)` after admitting a session. Scope, allowed providers and the route cannot be supplied or expanded by a worker's retrieval request. Cloud-bound readers are rejected. Future cloud use requires a separately designed consent boundary; these interfaces do not forward memory to cloud models.

Management and consumption are separate APIs. User management can:

1. Review an explicitly entered native note or a selected external provider record.
2. Receive a five-minute, one-use review handle showing exact content and provenance.
3. Explicitly approve that handle with one to 365 days of retention, or explicit retention until deletion.
4. Disable a provider, delete a record/approval, or prune expired records.

A record is invisible to readers before approval. The approval digest includes provider, source ID, exact scope, content and provenance. Editing an external record or changing its provenance invalidates its approval. Retrieval rechecks the current approval identity, scope, expiry and provider configuration after provider I/O; deletion or disable during a request prevents publication. Duplicate, unrequested and malformed records are not admitted.

The local database retains approved snapshots for review and text filtering. An external snapshot is never returned as an offline fallback: the provider must return the same current record. Native deletion removes the local content and approval. External deletion removes Lumen's snapshot and approval, without writing to that provider. Deleting upstream Beacon data must be done through Beacon's own user controls.

SQLite schema v1 uses secure deletion and DELETE journaling, so normal writes do not leave a persistent WAL containing forgotten memory. Expired rows are pruned on open and retrieval; callers can invoke `prune_expired` explicitly. Retention while the memory subsystem is idle is enforced on its next access, with no idle polling worker. The provider enable switches persist in this database. Enabling a provider does not approve any record or start a process.

Requests are limited to 512 UTF-8 query bytes, 20 results, eight providers and a three-second deadline per provider. Individual content is capped at 16 KiB. Reviews are capped at 20 concurrent records. Provider errors become sanitized `unavailable` entries; other providers continue. Cancellation propagates and prevents publication. Memory storage failures are typed errors, and lazy initialization keeps them outside application startup and other Lumen services.

Memory is untrusted context, never permission, policy or executable configuration. Consumers must render it as data and retain native tool admission, approvals and Stop. A record's provenance or approval does not make its instructions authoritative over native policy.

## Beacon local MCP adapter

Beacon is independently disabled by default. The prepared native host adapter uses only `http://127.0.0.1:8766/mcp`; the standalone adapter can select a numeric loopback port. There is no remote hostname/URL or executable configuration. Proxies and redirects are disabled, frames are limited to 64 KiB, and the adapter validates the MCP protocol/server identity and the `beacon.learning.v1` project identity. Session-only Beacon requests are rejected because its approved-memory records are project-scoped.

The adapter initializes MCP, sends `notifications/initialized`, and invokes only the fixed `get_memory` tool for selected IDs. It never invokes activity queries, configures capture, installs hooks/skills, connects a cloud destination, accesses Beacon files or sends write/delete calls. A user may run an already installed local server independently. Lumen does not install or launch it. Existing Beacon capture/forwarding configuration remains the user's responsibility; Lumen neither enables it nor relies on it.

Reviewed upstream source: [Agent Beacon `99c709081ad49da1c5ade205929b61b19360ed9b`](https://github.com/asymptote-labs/agent-beacon/tree/99c709081ad49da1c5ade205929b61b19360ed9b), specifically `docs/cli/mcp-serve.mdx`, `cli/beacon/internal/mcpserver/server.go` and `pkg/asymptoteobserve/learning.go`. Context7 had no matching library; the official repository supplied the protocol. No Beacon code, package or runtime is bundled. Upstream protocol/schema changes fail closed pending adapter review.

## Shared harness protocol

Both `runtime/pi-durable/src/memory.ts` and `runtime/deepagents/src/memory.ts` export the same `createMemoryClient` implementation. Their only operation is `retrieve`. The version 1 request is:

```json
{"version":1,"query":{"text":"approved tool guidance","limit":5}}
```

Rust `MemoryReader.handle` and the TypeScript schemas reject unknown fields and unsupported versions. Results contain approved content, exact scope, provenance, approval identity/digest/expiry and optional provider unavailability. The transport is issued by the trusted host and bound to the session's admitted scope and local model route; it is not a general Tauri invocation function. The clients cannot review, approve, configure providers or delete memory.

The offline `memory_protocol` example seeds explicitly labeled fixture approval and pending content. Both real TypeScript clients retrieve through its Rust reader in integration tests. This proves the shared interface, not the absent Pi/DeepAgents execution runtimes. The example is not packaged or registered as a product harness.

Native management commands live in `src-tauri/src/agent_memory.rs`; strict frontend adapters live in `src/services/agent-memory`. No management capability is registered as an agent tool. No new UI or normal interactive agent execution is introduced by this addendum.

## Candidate generators

The standalone `ImprovementGenerator` trait defines generation without evaluator, storage, permissions or activation methods. The existing Tauri host supplies `GenerationInput` and `GeneratedCandidate` using its existing `HarnessVersion`, `ExecutionTrace` and `CandidateManifest` types. This dependency direction avoids copying the evaluator or introducing an improvement database.

The host constructs bounded sanitized failure metadata and the existing fixed development cases. Held-out cases are private to the evaluator and are never exported to generators. Prime's existing runtime now implements this interface; its guest protocol, budget, cancellation cleanup and generation fencing are preserved.

The version 1 candidate envelope has `schemaVersion`, `generator` and the existing strict `manifest`. The native admission function checks envelope version, generator identity, current base and evidence digest before job-bound insertion into the existing improvement store. Approval cannot supply a report or activate a proposed candidate. Existing gate recomputation, measured evaluation, skill/workflow approval policy, atomic promotion and immutable rollback remain authoritative.

Harness² has a bounded manifest decoder and an implementation that always returns `disabled and uninstalled`. There is no interactive registration, package installation, process launch, schedule, database, evaluator or promotion method for Harness². Its research runtime must remain deferred until the existing native improvement acceptance gates are verified. Tests substitute deterministic generators to exercise the common admission path; this is not evidence of real Harness² execution.

Version 1 accepts the current host's prompt, tool-guidance and bounded workflow changes. Future context-retrieval, skills and subagent-configuration optimization requires a versioned declarative manifest extension, corresponding evaluator coverage and native approval rules. Arbitrary scripts/plugins, permissions, security policies, foundational instructions, evaluator changes and hidden-case access are not editable manifest fields. Unknown fields fail deserialization. Natural-language guidance cannot alter the native policy engine.

Reviewed reference: [Harness² `1cfe254e8d25b15f37048c3730134686abe60335`](https://github.com/google-research/harness2/tree/1cfe254e8d25b15f37048c3730134686abe60335). Its research execution configuration is not adopted by Lumen.

## Native Windows and MXC direction

New memory storage and generator contracts are native Rust/SQLite on Windows. They add no Rivet, Docker, WSL, Python or research-runtime requirement. MXC is the intended execution-containment backend for the broader native Agent Core implementation. It does not replace durable scheduling or checkpoint storage: those functions need a native scheduler/SQLite design during the existing Rivet migration.

This addendum preserves the existing Prime evaluator and legacy opt-in runtime. It does not migrate the existing enrichment/Rivet workers or Docker Prime executor. Future Prime/MXC adapters must supply the same generation-only interface, validate real containment capabilities, fail closed on unsupported Windows hosts and retain all existing approval/evaluation/rollback gates. No MXC execution, containment, packaged Pi runtime or native scheduler acceptance is claimed here.
