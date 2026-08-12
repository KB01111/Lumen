# Lumen Production Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining native activity, provider/MCP, semantic-search, local-model, diagnostics, and packaged-Windows slices from the approved Lumen design without exposing simulated production controls.

**Architecture:** Rust remains the authority for Windows state, provider/model capabilities, credentials, tool permissions, artifact verification, embeddings, and native persistence. React consumes only Zod-validated DTOs through focused services; exact filename and FTS search remain independent fallback lanes. Each task is a vertical slice with a failing test, one typed IPC path, an honest production UI, and a focused acceptance gate.

**Tech Stack:** Tauri 2, Rust 2024, Windows APIs, React 19, TypeScript 6, Zod, Zustand, React Aria Components, AgentGateway v1.4.1, SQLite/FTS5, sqlite-vector 1.0.0, Bun, Vitest, Playwright.

## Global Constraints

- Use Bun for JavaScript dependencies and commands.
- Keep filesystem, process, credential, provider, and Windows API access in Rust.
- Never add Tauri shell execute/spawn permissions.
- Every production behavior starts with a failing focused test.
- Exact filename and FTS search must work when AI, AgentGateway, embeddings, or sqlite-vector are unavailable.
- Provider secrets, prompts, file contents, unrestricted paths, and raw native errors never enter React diagnostics.
- Computer Use remains the existing fixed browser-only worker and is not generalized.
- Keep native window geometry unchanged.

---

### Task 1: Native Windows activity classification

**Files:**
- Create: `src-tauri/src/activity.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Create: `src/services/activity/activity-service.ts`
- Modify: `src/features/activity/activity.store.ts`
- Modify: `src/features/settings/pages/ActivityPage.tsx`
- Modify: `src/features/settings/SettingsNav.tsx`
- Modify: `src/features/settings/SettingsShell.tsx`
- Test: `src-tauri/src/activity.rs`
- Test: `src/features/activity/activity.test.tsx`

**Interfaces:**
- Produces Rust `ActivitySnapshot { mode, foreground_identity, on_battery, fullscreen, background_policy }` with only a normalized executable identity exposed.
- Produces commands `get_activity_status`, `set_activity_policy`, and `set_user_pause`.
- Produces TypeScript `ActivityService.status(): Promise<ActivitySnapshot>` with Zod validation.

- [ ] **Step 1: Write failing pure-classifier tests**

Cover battery pause, configured-game pause, fullscreen pause, video metadata-only, user pause precedence, delayed resume, and exact-search availability. Feed pure `ObservedActivity` values; do not call Windows APIs in unit tests.

- [ ] **Step 2: Verify RED**

Run: `cargo test activity::tests --all-features`

Expected: compile failure because `ObservedActivity`, `ActivityPolicy`, and `classify_activity` do not exist.

- [ ] **Step 3: Implement the minimum Windows observer**

Use `GetForegroundWindow`, `GetWindowThreadProcessId`, `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`, `QueryFullProcessImageNameW`, `GetWindowRect`, `MonitorFromWindow`, `GetMonitorInfoW`, and `GetSystemPowerStatus`. Hash the canonical executable path with SHA-256 and expose only `{ fileName, identityHash }`. Classify known games only from persisted identity hashes; never enumerate arbitrary processes.

- [ ] **Step 4: Enforce background policy**

Before index synchronization and enrichment work, read the current snapshot. `paused` returns a typed paused status, `metadata-only` skips extraction/enrichment but retains filename inventory, and `normal` performs existing work. `search_indexed` remains callable in every mode.

- [ ] **Step 5: Wire typed UI**

Replace the development activity selector in native builds with live status, a transactional user pause, and validated executable selection for overrides. Add Activity back to production settings navigation only after all visible controls call native operations; retain deterministic gallery controls only in browser development.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
cargo test activity::tests --all-features
bun run test -- src/features/activity/activity.test.tsx
bun run typecheck
bun run lint
```

Commit: `feat: enforce windows activity policy`

### Task 2: Provider and model capability registry

**Files:**
- Create: `src-tauri/src/gateway/registry.rs`
- Modify: `src-tauri/src/gateway/config.rs`
- Modify: `src-tauri/src/gateway/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/ai/provider-registry-service.ts`
- Modify: `src/features/settings/pages/AgentGatewayPage.tsx`
- Test: `src-tauri/src/gateway/registry.rs`
- Test: `src/features/gateway/gateway.test.tsx`

**Interfaces:**
- Produces secret-free `ProviderDescriptor`, `ModelDescriptor`, and `RouteDescriptor` DTOs.
- Produces commands `list_provider_registry`, `set_provider_route`, and `test_provider_route`.
- Provider IDs are a closed enum: `local`, `openai`, `anthropic`, `google`, and `openai-compatible`; custom compatible endpoints accept HTTPS URLs only, with loopback HTTP allowed for local providers.

- [ ] **Step 1: Write failing registry tests**

Assert stable aliases, capability matching, provider/model validation, cloud-consent gating, secret-free serialization, and rejection of file/UNC/plain-HTTP remote URLs.

- [ ] **Step 2: Verify RED**

Run: `cargo test gateway::registry::tests --all-features`

- [ ] **Step 3: Implement registry and generated configuration**

Keep the seven existing aliases. Render AgentGateway models from validated persisted routes, inject secrets only from Windows Credential Manager, and restart transactionally: validate generated config, start the replacement process, then swap only after health succeeds.

- [ ] **Step 4: Add typed UI**

Render registry-provided providers/models rather than the hard-coded alias list. Route changes, credential state, health tests, and consent failures return applied state or a rollback message. Never return credentials to React.

- [ ] **Step 5: Verify and commit**

Run focused Rust/UI tests, typecheck, lint, and the ignored checksum-pinned AgentGateway validation test after staging.

Commit: `feat: add provider capability registry`

### Task 3: Live MCP registry and permission enforcement

**Files:**
- Create: `src-tauri/src/gateway/mcp.rs`
- Modify: `src-tauri/src/gateway/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/ai/mcp-service.ts`
- Modify: `src/features/settings/pages/AgentGatewayPage.tsx`
- Test: `src-tauri/src/gateway/mcp.rs`
- Test: `src/features/gateway/gateway.test.tsx`

**Interfaces:**
- Produces `McpServiceDescriptor { id, name, status, tools }` and `ToolPermission { tool_id, access }`.
- Produces commands `list_mcp_services`, `set_tool_permission`, and `invoke_lumen_tool`.
- Initial tools are closed and local: `files.search`, `files.metadata`, and `files.open`; arguments are typed and reuse existing confinement/opening functions.

- [ ] **Step 1: Write failing enforcement tests**

Assert allow executes, deny fails closed, ask returns an approval requirement, unknown tools/arguments fail, and all file paths remain confined to an indexed root.

- [ ] **Step 2: Implement one executor boundary**

Store policies in the native settings file, validate every invocation at the executor, and return bounded secret-free results. Do not accept command names, binaries, or generic argument arrays from React.

- [ ] **Step 3: Replace preview-only UI**

Show live service/tool counts and permission selects in native settings. Remove the browser-only wording from production DTOs; browser development continues to use deterministic fixtures.

- [ ] **Step 4: Verify and commit**

Run focused Rust/UI tests plus typecheck and lint.

Commit: `feat: enforce lumen mcp permissions`

### Task 4: Embedding production and hybrid retrieval

**Files:**
- Create: `src-tauri/src/search/embedding.rs`
- Create: `src-tauri/src/search/ranking.rs`
- Modify: `src-tauri/src/search/indexing.rs`
- Modify: `src-tauri/src/search/index.rs`
- Modify: `src-tauri/src/gateway/supervisor.rs`
- Modify: `src/services/search/development-file-search-service.ts`
- Modify: `src/features/settings/pages/SearchPage.tsx`
- Test: `src-tauri/src/search/embedding.rs`
- Test: `src-tauri/src/search/ranking.rs`
- Test: `src/services/search/development-file-search-service.test.ts`

**Interfaces:**
- Produces queued embedding jobs keyed by `(chunk_id, content_hash, model, dimension, index_revision)`.
- Produces native `search_hybrid(query, scope, filters, limit)` and `search_related(stable_id, limit)` commands.
- Hybrid score normalizes lexical, vector, filename, recency, and pin lanes independently; exact filename matches receive a deterministic top-priority tier.

- [ ] **Step 1: Write failing ranking tests**

Cover exact filename precedence, semantic recovery when lexical misses, stale embedding exclusion, model/dimension isolation, pin/recency effects, cancellation, vector-unavailable fallback, and Related results excluding the source file.

- [ ] **Step 2: Implement bounded embedding client**

Call only the loopback AgentGateway embedding alias. Batch bounded chunk inputs, abort stale generations, validate finite vectors and exact dimensions, and persist through the existing sqlite-vector API. Missing runtime/credentials leave jobs pending and FTS usable.

- [ ] **Step 3: Implement hybrid commands**

Keep SQL/file confinement in Rust. Return one ranked DTO with provenance and sanitized semantic availability. Move scope/filter/ranking behavior out of the React adapter.

- [ ] **Step 4: Enable Related honestly**

Expose Recent from durable query/file-open history and Related only when the active embedding model has usable rows. Otherwise omit the scopes and show the diagnostic reason in Search settings.

- [ ] **Step 5: Verify and commit**

Run full search Rust tests, focused adapter tests, typecheck, lint, and performance E2E.

Commit: `feat: add local hybrid search`

### Task 5: Signed local runtime and model provisioning

**Files:**
- Create: `src-tauri/src/gateway/provisioning.rs`
- Modify: `src-tauri/src/gateway/local_runtime.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/ai/provisioning-service.ts`
- Modify: `src/features/settings/pages/LocalAiPage.tsx`
- Test: `src-tauri/src/gateway/provisioning.rs`
- Test: `src/features/settings/pages/LocalAiPage.test.tsx`

**Interfaces:**
- Produces manifest-driven `ProvisioningArtifact { id, version, url, sha256, size_bytes, install_scope }` compiled into Rust.
- Produces commands `get_provisioning_status`, `start_provisioning`, and `cancel_provisioning`, plus `lumen://provisioning-progress` events.
- React selects only closed artifact/profile IDs; it never supplies URLs, paths, hashes, executables, or arguments.

- [ ] **Step 1: Write failing manifest/security tests**

Assert exact checksum/version matching, size/free-space limits, HTTPS-only immutable URLs, cancellation cleanup, atomic promotion, rollback on health failure, and rejection of unknown IDs.

- [ ] **Step 2: Implement downloader and verifier**

Download to the app-data staging directory with a byte cap and cancellation token, verify SHA-256 before extraction, validate the expected file inventory, then atomically promote. Keep the last healthy version until the replacement passes a loopback health check.

- [ ] **Step 3: Wire native UI**

Show Download/Update/Cancel only for manifest-backed artifacts, stream progress, report required disk space, and refresh runtime health after promotion. Remove native states that have no executable action.

- [ ] **Step 4: Verify and commit**

Run focused Rust/UI tests and a staged offline manifest smoke.

Commit: `feat: provision verified local models`

### Task 6: Native diagnostics aggregation and packaged acceptance

**Files:**
- Modify: `src-tauri/src/privacy.rs`
- Modify: `src-tauri/src/search/indexing.rs`
- Modify: `src/features/settings/pages/DiagnosticsPage.tsx`
- Modify: `scripts/stage-sidecars.ts`
- Create: `scripts/smoke-packaged.ps1`
- Create: `docs/reports/2026-08-12-production-completion.md`
- Modify: `docs/architecture/management-surfaces.md`
- Modify: `docs/architecture/search-service.md`

**Interfaces:**
- Produces one native diagnostic snapshot with versions/status for index, sqlite-vector, activity, AgentGateway, MCP, runtime, provisioning, and bounded sanitized logs/timings.
- Produces a packaged smoke that launches the installed NSIS app, validates vector loading and lexical fallback, and records hashes/results without deleting user data.

- [ ] **Step 1: Add failing aggregation/sanitization tests**

Assert no prompt, file content, drive/UNC path, authorization value, credential, runtime directory, or raw provider error survives the Rust sanitizer.

- [ ] **Step 2: Aggregate native status**

Return only typed counts, versions, booleans, enums, and bounded sanitized messages. Diagnostics UI fetches this service on demand and uses the native save command already implemented.

- [ ] **Step 3: Run full local verification**

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
Set-Location src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
Set-Location ..
bun run capture:gallery
bun run record:interactions
bun run profile
bun run tauri build
```

- [ ] **Step 4: Run packaged smoke and inspect evidence**

Run `scripts/smoke-packaged.ps1` in an isolated test profile. Verify FTS, exact vector query, disabled-vector lexical fallback, window lifecycle, diagnostics export, and uninstall. Record installer SHA-256 and signing status.

- [ ] **Step 5: Self-review and commit**

Search production source for preview/simulated/future wording, inspect all visual artifacts for clipping/overlap, and compare every approved-spec completion criterion with the report.

Commit: `test: verify complete windows app`
