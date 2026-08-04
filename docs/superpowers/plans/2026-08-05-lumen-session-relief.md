# Lumen Session Relief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lumen's complete, on-demand Session Relief report so a user can understand current Windows resource pressure and retained process families without Lumen changing any process, file, service, or startup state.

**Architecture:** A bounded Rust collector samples only non-sensitive system and process fields, builds defensive process trees, classifies evidence, and returns one versioned Tauri DTO. A validated TypeScript service feeds a request-safe local React controller and a dedicated settings page; safe-summary export is constructed from aggregates and never serializes the local-only process tree.

**Tech Stack:** Rust 1.95, Tauri 2, `sysinfo` 0.39.6, `windows` 0.62, Serde, React 19, TypeScript 6, Zod 4, Zustand-free component-local state, React Aria Components, StyleX, Vitest, Testing Library.

## Global Constraints

- Collection runs only after **Analyze this session** or **Refresh report**; no interval, background monitor, or per-frame sampling loop is permitted.
- The report remains in frontend memory and is never written to settings, logs, SQLite, search history, activity history, or telemetry.
- Do not add terminate, suspend, restart, delete, cache-clear, service-control, or startup-management commands or controls.
- Do not collect command lines, arguments, environment variables, executable paths, current directories, window titles, file contents, or user document paths.
- Full local detail may contain executable basenames and PIDs; **Copy safe summary** must exclude every PID and the entire process-tree payload.
- A missing parent means `detached`, not “leaked”; protected and exited parents make the signal incomplete.
- `sysinfo = "0.39.6"` requires Rust 1.95 and process CPU usage requires two refreshes separated by `sysinfo::MINIMUM_CPU_UPDATE_INTERVAL`.
- Keep non-Windows builds valid by returning explicit warnings for unavailable Windows-only commit and system-drive measurements.
- Existing baseline verification is capacity-blocked: C: reached 0 bytes free and Vitest returned `ENOSPC`. Do not call the baseline clean until the listed suites rerun with sufficient disk space.

## File Structure

### Rust

- Create `src-tauri/src/session_relief/types.rs`: public serializable DTOs plus internal `ProcessSample`.
- Create `src-tauri/src/session_relief/tree.rs`: parent validation, cycle breaking, child lists, tree totals, detached status.
- Create `src-tauri/src/session_relief/classify.rs`: basename normalization, categories, family aggregation, thresholds, findings.
- Create `src-tauri/src/session_relief/collector.rs`: bounded `sysinfo` sample and platform-specific system measurements.
- Create `src-tauri/src/session_relief/mod.rs`: sanitized failure type and `session_relief_snapshot` command.
- Modify `src-tauri/src/lib.rs`: module declaration and Tauri command registration.
- Modify `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`: pin `sysinfo` and enable only the required Windows API features.

### Frontend

- Create `src/services/session-relief/session-relief.schema.ts`: Zod wire contract and inferred types.
- Create `src/services/session-relief/session-relief-service.ts`: service interface and typed public error.
- Create `src/services/session-relief/tauri-session-relief-service.ts`: Tauri invocation and Zod validation.
- Create `src/services/session-relief/unavailable-session-relief-service.ts`: deterministic non-native failure.
- Create `src/services/session-relief/default-session-relief-service.ts`: native-runtime selection with no Tauri call in browser mode.
- Create `src/services/session-relief/session-relief.fixture.ts`: one shared test report factory.
- Create `src/services/session-relief/session-relief-service.test.ts`: validation and safe-summary redaction tests.
- Create `src/features/session-relief/useSessionReliefController.ts`: local request lifecycle and stale-result protection.
- Create `src/features/session-relief/useSessionReliefController.test.tsx`: controller state tests.
- Create `src/features/session-relief/session-relief-format.ts`: units, dates, pressure labels, and safe-summary construction.
- Create `src/features/session-relief/SessionReliefSummary.tsx`: system evidence and findings.
- Create `src/features/session-relief/ProcessFamilyList.tsx`: ranked aggregate families.
- Create `src/features/session-relief/ProcessTreeList.tsx`: bounded accessible tree disclosure.
- Create `src/features/session-relief/SessionReliefPage.tsx`: idle, collecting, report, partial, copy, and failure states.
- Create `src/features/session-relief/SessionReliefPage.test.tsx`: page, accessibility, refresh, copy, and tree tests.
- Modify `src/features/settings/settings.schema.ts`, `SettingsNav.tsx`, `SettingsShell.tsx`, and `SettingsShell.test.tsx`: add the tenth settings route.

---

### Task 1: Rust report contract and defensive process trees

**Files:**
- Create: `src-tauri/src/session_relief/types.rs`
- Create: `src-tauri/src/session_relief/tree.rs`
- Create: `src-tauri/src/session_relief/mod.rs`

**Interfaces:**
- Consumes: raw `ProcessSample { pid, parent_pid, name, started_at_seconds, memory_bytes, cpu_percent }` values from Task 3.
- Produces: `build_process_trees(samples: &[ProcessSample], now_seconds: u64) -> TreeBuildResult` and all wire DTO types used by later tasks.

- [ ] **Step 1: Define the wire contract and internal sample**

Create the enums with `#[serde(rename_all = "camelCase")]`: `PressureLevel::{Normal, Elevated, High}`, `ProcessCategory::{AiAssistant, Browser, Container, Editor, Electron, Network, Node, RustBuild, Other}`, `SignalKind::{Memory, Cpu, Multiplicity, Longevity, Detachment}`, `FindingSeverity::{Info, Warning, Critical}`, and `FindingConfidence::{Medium, High}`.

Define these exact fields:

```rust
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReliefReport {
    pub schema_version: u16,
    pub captured_at: u64,
    pub collection_duration_ms: u64,
    pub system: SystemSnapshot,
    pub families: Vec<ProcessFamily>,
    pub trees: Vec<ProcessTree>,
    pub findings: Vec<Finding>,
    pub coverage: CollectionCoverage,
    pub warnings: Vec<CollectionWarning>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub memory_available_bytes: u64,
    pub commit_used_bytes: Option<u64>,
    pub commit_limit_bytes: Option<u64>,
    pub process_count: u32,
    pub uptime_seconds: u64,
    pub sampled_cpu_percent: f32,
    pub system_drive_free_bytes: Option<u64>,
    pub pressure: PressureLevel,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessNode {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub age_seconds: u64,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub child_pids: Vec<u32>,
    pub detached: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessTree {
    pub root_pid: u32,
    pub node_count: u32,
    pub total_memory_bytes: u64,
    pub total_cpu_percent: f32,
    pub nodes: Vec<ProcessNode>,
}
```

Also define `ProcessFamily`, `Finding`, `CollectionCoverage`, and `CollectionWarning` with the exact fields consumed in Tasks 2 and 4:

```rust
pub struct ProcessFamily {
    pub name: String,
    pub category: ProcessCategory,
    pub process_count: u32,
    pub total_memory_bytes: u64,
    pub total_cpu_percent: f32,
    pub oldest_age_seconds: u64,
    pub root_count: u32,
    pub detached_count: u32,
    pub signal: SignalKind,
    pub pressure: PressureLevel,
}

pub struct Finding {
    pub code: String,
    pub severity: FindingSeverity,
    pub confidence: FindingConfidence,
    pub title: String,
    pub evidence: String,
    pub guidance: String,
}

pub struct CollectionCoverage {
    pub observed_processes: u32,
    pub skipped_processes: u32,
    pub transient_processes: u32,
}

pub struct CollectionWarning {
    pub code: String,
    pub message: String,
}
```

- [ ] **Step 2: Write failing tree tests**

In `tree.rs`, add tests that construct samples without touching the live OS:

```rust
#[test]
fn missing_parent_becomes_detached_root() {
    let result = build_process_trees(&[
        sample(41, Some(999), "node.exe", 100, 512, 25.0),
        sample(42, Some(41), "worker.exe", 110, 256, 10.0),
    ], 200);
    assert_eq!(result.trees[0].root_pid, 41);
    assert!(result.trees[0].nodes.iter().find(|node| node.pid == 41).unwrap().detached);
    assert_eq!(result.trees[0].total_memory_bytes, 768);
}

#[test]
fn cycle_is_broken_and_reported_once() {
    let result = build_process_trees(&[
        sample(7, Some(8), "a.exe", 1, 10, 1.0),
        sample(8, Some(7), "b.exe", 1, 20, 2.0),
    ], 20);
    assert_eq!(result.trees.iter().map(|tree| tree.node_count).sum::<u32>(), 2);
    assert_eq!(result.warnings.iter().filter(|warning| warning.code == "process-tree-cycle").count(), 1);
}
```

Add tests for a normal three-level tree, nonexistent self-parent, saturated memory totals, age clamping when `started_at_seconds > now_seconds`, and sorting trees by descending memory then root PID.

- [ ] **Step 3: Run the focused tests and verify the intended failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief::tree -- --nocapture`

Expected: compilation fails because `build_process_trees` is not defined.

- [ ] **Step 4: Implement the minimal defensive tree builder**

Use a `BTreeMap<u32, ProcessSample>` for deterministic output. Accept a parent only when it exists, differs from the child PID, and following parent links does not revisit a PID. Treat PID 0 or a missing parent as a root; mark only a nonzero missing parent as detached. Build `child_pids` in ascending order, flatten each tree in depth-first order, and use `saturating_add` for totals. Clamp each `cpu_percent` to a finite non-negative value before summing.

- [ ] **Step 5: Rerun tree tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief::tree -- --nocapture`

Expected: all tree tests pass.

- [ ] **Step 6: Commit the contract and tree slice**

```powershell
rtk git add src-tauri/src/session_relief/types.rs src-tauri/src/session_relief/tree.rs src-tauri/src/session_relief/mod.rs
rtk git commit -m "feat: model session relief process trees"
```

### Task 2: Family aggregation, pressure thresholds, and findings

**Files:**
- Create: `src-tauri/src/session_relief/classify.rs`
- Modify: `src-tauri/src/session_relief/mod.rs`

**Interfaces:**
- Consumes: Task 1 `ProcessSample`, `ProcessTree`, and DTO enums.
- Produces: `classify_system(&SystemSnapshot) -> PressureLevel`, `aggregate_families(samples, trees) -> Vec<ProcessFamily>`, and `derive_findings(system, families, trees) -> Vec<Finding>`.

- [ ] **Step 1: Write failing normalization and category tests**

Cover case-folding, whitespace trimming, `.exe` preservation, and category precedence:

```rust
#[test]
fn recognizes_development_runtime_categories() {
    assert_eq!(category_for("ChatGPT.exe"), ProcessCategory::AiAssistant);
    assert_eq!(category_for("msedge.exe"), ProcessCategory::Browser);
    assert_eq!(category_for("node.exe"), ProcessCategory::Node);
    assert_eq!(category_for("rustc.exe"), ProcessCategory::RustBuild);
    assert_eq!(category_for("vmmemWSL"), ProcessCategory::Container);
    assert_eq!(category_for("custom-tool.exe"), ProcessCategory::Other);
}
```

Match exact normalized basenames first. AI assistant names are `chatgpt.exe`, `cline.exe`, `codex.exe`, `claude.exe`, and `goose.exe`; editors are `code.exe`, `cursor.exe`, `zed.exe`, and `devenv.exe`; browsers are `chrome.exe`, `msedge.exe`, `firefox.exe`, `helium.exe`, and `brave.exe`; Node runtimes are `node.exe`, `bun.exe`, and `deno.exe`; Rust build names are `cargo.exe`, `rustc.exe`, and `sccache.exe`; container names are `docker.exe`, `docker desktop.exe`, `com.docker.backend.exe`, `wsl.exe`, `wslhost.exe`, `vmmem`, and `vmmemwsl`; `electron.exe` is Electron; `nordvpn.exe` and `rustdesk.exe` are Network.

- [ ] **Step 2: Write failing threshold and evidence tests**

Use these exact thresholds:

- memory or commit ratio: `high >= 0.90`, `elevated >= 0.80`;
- normalized system CPU: `high >= 85`, `elevated >= 65`;
- system-drive free bytes: `high < 5 GiB`, `elevated < 15 GiB`;
- family resident memory: `high >= 4 GiB`, `elevated >= 2 GiB`;
- family process count: `high >= 40`, `elevated >= 16`;
- detached age: critical finding at `>= 12 hours`, warning finding at `>= 4 hours`.

Assert boundary values immediately below and at each threshold. Add one family test proving `Node.exe` and `node.exe` aggregate together but `bun.exe` remains a separate family. Add a finding test proving a 20-process browser family says multi-process architecture can be normal and never uses the word “leak”.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief::classify -- --nocapture`

Expected: compilation fails because the classification functions are not defined.

- [ ] **Step 4: Implement classification and deterministic ranking**

Derive family pressure as the maximum of memory, process-count, CPU, longevity, and detachment pressure. Select `signal` from the metric with the strongest pressure; break ties in this order: memory, CPU, multiplicity, detachment, longevity. Sort families by pressure descending, memory descending, process count descending, then normalized name.

Generate findings only for triggered evidence. Use stable codes: `memory-pressure`, `commit-pressure`, `system-drive-low`, `cpu-pressure`, `large-process-family`, `many-processes`, `long-lived-detached`, and `partial-coverage`. Guidance must use only “close the owning application normally”, “review in Task Manager”, or “free system-drive capacity”; it must never instruct termination or deletion.

- [ ] **Step 5: Rerun classification tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief::classify -- --nocapture`

Expected: all classification tests pass.

- [ ] **Step 6: Commit the classification slice**

```powershell
rtk git add src-tauri/src/session_relief/classify.rs src-tauri/src/session_relief/mod.rs
rtk git commit -m "feat: classify session pressure evidence"
```

### Task 3: Bounded native collector and Tauri command

**Files:**
- Create: `src-tauri/src/session_relief/collector.rs`
- Modify: `src-tauri/src/session_relief/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: Task 1 tree builder and Task 2 classification functions.
- Produces: `collect_session_relief() -> Result<SessionReliefReport, SessionReliefFailure>` and Tauri command `session_relief_snapshot`.

- [ ] **Step 1: Add the minimal native dependencies**

Add:

```toml
sysinfo = { version = "0.39.6", default-features = false, features = ["disk", "system"] }
```

Extend the existing Windows dependency features with `Win32_Storage_FileSystem`, `Win32_System_Memory`, and `Win32_System_SystemInformation`. Do not enable sysinfo component, network, or user features.

- [ ] **Step 2: Write failing collector tests**

Add a platform-neutral serialization test that collects or constructs a report, serializes it, and asserts the JSON contains `schemaVersion: 1` but none of `commandLine`, `arguments`, `environment`, `executablePath`, `currentDirectory`, or `windowTitle`.

Under `#[cfg(windows)]`, add:

```rust
#[test]
fn windows_memory_snapshot_is_internally_consistent() {
    let memory = read_windows_memory().unwrap();
    assert!(memory.total_physical_bytes > 0);
    assert!(memory.available_physical_bytes <= memory.total_physical_bytes);
    assert!(memory.commit_used_bytes <= memory.commit_limit_bytes);
}
```

Add a test for `SessionReliefFailure::from_internal` proving a raw message containing `C:\Users\Kevin\Secret` becomes the stable user message `Lumen could not complete the local session analysis.`.

- [ ] **Step 3: Run the collector tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief::collector -- --nocapture`

Expected: compilation fails because the collector functions are not defined.

- [ ] **Step 4: Implement the sanitized command failure type**

In `session_relief/mod.rs`, define:

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReliefFailure {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl SessionReliefFailure {
    fn collection_failed() -> Self {
        Self {
            code: "collection-failed".to_owned(),
            message: "Lumen could not complete the local session analysis.".to_owned(),
            recoverable: true,
        }
    }

    fn from_internal(_error: impl std::fmt::Display) -> Self {
        Self::collection_failed()
    }
}
```

Internal errors may be logged only as stable warning codes; never place their raw text in this DTO.

- [ ] **Step 5: Implement the privacy-limited two-refresh sample**

Create a `ProcessRefreshKind::nothing().with_cpu().with_memory()` and a `RefreshKind` containing memory, CPU usage, and processes only. Construct the system, sleep exactly `sysinfo::MINIMUM_CPU_UPDATE_INTERVAL`, call `refresh_cpu_usage()`, then call `refresh_processes_specifics(ProcessesToUpdate::All, true, process_kind)`.

Map only `pid.as_u32()`, `parent().map(Pid::as_u32)`, `name().to_string_lossy()`, `start_time()`, `memory()`, and `cpu_usage()`. Do not call `cmd()`, `exe()`, `cwd()`, `environ()`, or user APIs. Count processes present before but absent after refresh as transient; count conversion failures as skipped.

Normalize total sampled CPU to `0..=100` by dividing summed process CPU by logical CPU count. Preserve per-process and per-family CPU as logical-core percentage, which may exceed 100 for multi-core work.

- [ ] **Step 6: Implement Windows and non-Windows system measurements**

On Windows, call `GlobalMemoryStatusEx` with a correctly sized `MEMORYSTATUSEX`. Calculate commit used with `ullTotalPageFile.saturating_sub(ullAvailPageFile)`. Read `%SystemDrive%`, append a trailing backslash, encode it as UTF-16, and call `GetDiskFreeSpaceExW`; return only the free-byte number.

On non-Windows, use sysinfo physical-memory totals and return `None` for commit and system-drive fields. Add warnings `commit-metrics-unavailable` and `system-drive-unavailable`; do not fail the whole report.

- [ ] **Step 7: Assemble the report and expose the command**

Use Unix epoch milliseconds for `captured_at`, `Instant` for collection duration, `System::uptime()` for uptime, and schema version `1`. Pass samples through Tasks 1 and 2, merge warnings, and return partial coverage where possible.

Expose:

```rust
#[tauri::command]
pub async fn session_relief_snapshot() -> Result<SessionReliefReport, SessionReliefFailure> {
    tauri::async_runtime::spawn_blocking(collector::collect_session_relief)
        .await
        .map_err(|_| SessionReliefFailure::collection_failed())?
}
```

Register `session_relief::session_relief_snapshot` in `tauri::generate_handler!`.

- [ ] **Step 8: Run focused Rust verification**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`

Run: `cargo test --manifest-path src-tauri/Cargo.toml session_relief -- --nocapture`

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --lib -- -D warnings`

Expected: formatting, Session Relief tests, and library Clippy pass.

- [ ] **Step 9: Commit the native collection slice**

```powershell
rtk git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/session_relief
rtk git commit -m "feat: collect local session relief reports"
```

### Task 4: Validated frontend service and redacted safe summary

**Files:**
- Create: `src/services/session-relief/session-relief.schema.ts`
- Create: `src/services/session-relief/session-relief-service.ts`
- Create: `src/services/session-relief/tauri-session-relief-service.ts`
- Create: `src/services/session-relief/unavailable-session-relief-service.ts`
- Create: `src/services/session-relief/default-session-relief-service.ts`
- Create: `src/services/session-relief/session-relief.fixture.ts`
- Create: `src/services/session-relief/session-relief-service.test.ts`
- Create: `src/features/session-relief/session-relief-format.ts`

**Interfaces:**
- Consumes: Task 3 camelCase JSON command response.
- Produces: `SessionReliefService.collect(): Promise<SessionReliefReport>`, `SessionReliefServiceError`, `defaultSessionReliefService`, formatting helpers, and `createSafeSummary(report): string`.

- [ ] **Step 1: Write the Zod schema and fixture**

Mirror every Task 1 field. Use `z.number().int().nonnegative()` for bytes, PIDs, counts, timestamps, and ages; `z.number().finite().nonnegative()` for CPU; `z.enum` for every Rust enum; `z.nullable` for optional native fields; and `z.literal(1)` for `schemaVersion`.

Create `makeSessionReliefReport(overrides = {})` with two process families and one two-node tree. Include PID `4100` so redaction tests can prove it never reaches the clipboard.

- [ ] **Step 2: Write failing service and safe-summary tests**

Mock `@tauri-apps/api/core` and assert `TauriSessionReliefService.collect()` invokes `session_relief_snapshot` with no payload. Return `schemaVersion: 2` and assert a `SessionReliefServiceError` with code `incompatible-report`.

Set `window.__TAURI_INTERNALS__` for one factory test and assert the default factory returns `TauriSessionReliefService`; remove it and assert the factory returns `UnavailableSessionReliefService`.

Assert the safe summary contains `capturedAt`, `system`, `families`, `findings`, `coverage`, and `warnings`, but not `trees`, `rootPid`, `pid`, `parentPid`, or the fixture value `4100`.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `bun run test -- src/services/session-relief/session-relief-service.test.ts --maxWorkers=1`

Expected: the suite fails because the service and formatter do not exist.

- [ ] **Step 4: Implement the service boundary**

Define:

```ts
export interface SessionReliefService {
  collect(): Promise<SessionReliefReport>;
}

export class SessionReliefServiceError extends Error {
  constructor(readonly code: 'unavailable' | 'collection-failed' | 'incompatible-report', message: string) {
    super(message);
    this.name = 'SessionReliefServiceError';
  }
}
```

The Tauri adapter calls `invoke<unknown>('session_relief_snapshot')`, parses with `sessionReliefReportSchema.safeParse`, and maps invalid data to `incompatible-report`. Map native rejections to `collection-failed` with `Lumen could not complete the local session analysis.` without rendering the raw rejection. The unavailable adapter always throws code `unavailable` with `Session Relief is available in the Lumen desktop app.`.

In `default-session-relief-service.ts`, select the adapter without invoking either one:

```ts
export function createSessionReliefService(): SessionReliefService {
  const native = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return native ? new TauriSessionReliefService() : new UnavailableSessionReliefService();
}

export const defaultSessionReliefService = createSessionReliefService();
```

- [ ] **Step 5: Implement formatting and safe summary construction**

Use `Intl.NumberFormat` for bytes, percentages, counts, and age; use `Intl.DateTimeFormat` for `capturedAt`. `createSafeSummary` must construct this new object:

```ts
const safe = {
  schemaVersion: report.schemaVersion,
  capturedAt: report.capturedAt,
  collectionDurationMs: report.collectionDurationMs,
  system: report.system,
  families: report.families,
  findings: report.findings,
  coverage: report.coverage,
  warnings: report.warnings,
};
return JSON.stringify(safe, null, 2);
```

Do not spread `report` into the safe object.

- [ ] **Step 6: Rerun focused tests**

Run: `bun run test -- src/services/session-relief/session-relief-service.test.ts --maxWorkers=1`

Expected: all service and redaction tests pass.

- [ ] **Step 7: Commit the frontend service slice**

```powershell
rtk git add src/services/session-relief src/features/session-relief/session-relief-format.ts
rtk git commit -m "feat: validate session relief reports"
```

### Task 5: Request-safe in-memory controller

**Files:**
- Create: `src/features/session-relief/useSessionReliefController.ts`
- Create: `src/features/session-relief/useSessionReliefController.test.tsx`

**Interfaces:**
- Consumes: Task 4 `SessionReliefService`.
- Produces: `{ status, report, error, analyze }`, where `status` is `idle | collecting | ready | partial | error`.

- [ ] **Step 1: Write failing controller tests**

Use deferred promises to assert:

- initial state is idle with no report;
- analyze immediately becomes collecting;
- success becomes ready, or partial when `warnings.length > 0` or `coverage.skippedProcesses > 0`;
- a refresh failure preserves the prior report and exposes a sanitized error;
- resolving request one after request two cannot overwrite request two;
- resolving after unmount produces no state update.

The stale-result assertion must use distinguishable `capturedAt` values and expect the newer value.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun run test -- src/features/session-relief/useSessionReliefController.test.tsx --maxWorkers=1`

Expected: the suite fails because the hook is not defined.

- [ ] **Step 3: Implement the controller without persistence**

Use component-local `useState`, a monotonically increasing `requestIdRef`, and an `aliveRef`. `analyze` increments the request ID, sets `collecting` while preserving the prior report, awaits `service.collect()`, and applies success or error only when both refs still match. The unmount cleanup sets `aliveRef.current = false` and increments the request ID. Do not create a Zustand store, timer, subscription, or localStorage key.

- [ ] **Step 4: Rerun controller tests**

Run: `bun run test -- src/features/session-relief/useSessionReliefController.test.tsx --maxWorkers=1`

Expected: all controller tests pass without React state-update warnings.

- [ ] **Step 5: Commit the controller slice**

```powershell
rtk git add src/features/session-relief/useSessionReliefController.ts src/features/session-relief/useSessionReliefController.test.tsx
rtk git commit -m "feat: manage on-demand session analysis"
```

### Task 6: Accessible Session Relief report page

**Files:**
- Create: `src/features/session-relief/SessionReliefSummary.tsx`
- Create: `src/features/session-relief/ProcessFamilyList.tsx`
- Create: `src/features/session-relief/ProcessTreeList.tsx`
- Create: `src/features/session-relief/SessionReliefPage.tsx`
- Create: `src/features/session-relief/SessionReliefPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 service, types, fixture, formatting helpers; Task 5 controller.
- Produces: `SessionReliefPage({ service?, copyText? })` for Task 7 settings routing.

- [ ] **Step 1: Write failing page-state tests**

Render with an injected fake service and assert:

- idle shows privacy copy and **Analyze this session**;
- click shows a `role="status"` message containing `Sampling current CPU and memory use` and disables the action;
- success shows Memory available, Commit used when present, Processes, Session uptime, Sampled CPU, System drive free, family rankings, capture time, and collection duration;
- partial success keeps report sections visible and announces warning messages;
- refresh retains the old report until the new report resolves;
- failure shows a sanitized `role="alert"` and **Try again**;
- copy invokes the injected function with a string that excludes PID `4100`;
- rejected clipboard write shows an inline alert and does not remove the report.

- [ ] **Step 2: Write failing process-tree accessibility tests**

Assert the initial tree renders at most 10 roots and only root rows. Activating a button named `Expand process tree for cline.exe` must set `aria-expanded="true"` and reveal its child row. Activating it again collapses the child. Verify each visible row includes its PID, age, CPU, memory, child count, and detached text when applicable.

- [ ] **Step 3: Run page tests and verify failure**

Run: `bun run test -- src/features/session-relief/SessionReliefPage.test.tsx --maxWorkers=1`

Expected: the suite fails because the page components do not exist.

- [ ] **Step 4: Implement the summary and findings**

Use `SettingsPage`, `SettingsCallout`, `SettingSection`, `LumenText`, `LumenButton`, and existing semantic tokens. Render measurements as labeled definition-list rows. Render finding severity in text as well as color. The explanatory copy for a high process count must say `Multi-process applications can retain many workers without indicating a leak.`.

- [ ] **Step 5: Implement family and process-tree views**

Render families in Rust-provided order with name, category, process count, resident memory, sampled CPU, oldest age, root count, detached count, primary signal, and pressure label.

For trees, keep a `Set<number>` of expanded PIDs local to `ProcessTreeList`. Derive child nodes from each tree's flat `nodes` array, render only the first 10 roots initially, and add **Show more trees** in increments of 10. Use native buttons with visible focus styles and `aria-expanded`; indent children with a token-based left inset. Do not add a polling or animation loop.

- [ ] **Step 6: Implement page actions and live regions**

Default `service` to Task 4's `defaultSessionReliefService` and default `copyText` to `navigator.clipboard.writeText`. Keep collection and copy errors separate. Label the full tree as local-only and show `All analysis stays on this device.` before collection. Refresh must use Task 5's same `analyze` function.

- [ ] **Step 7: Rerun page tests**

Run: `bun run test -- src/features/session-relief/SessionReliefPage.test.tsx --maxWorkers=1`

Expected: all Session Relief page tests pass.

- [ ] **Step 8: Commit the report UI slice**

```powershell
rtk git add src/features/session-relief
rtk git commit -m "feat: present session relief evidence"
```

### Task 7: Settings integration and release verification

**Files:**
- Modify: `src/features/settings/settings.schema.ts`
- Modify: `src/features/settings/SettingsNav.tsx`
- Modify: `src/features/settings/SettingsShell.tsx`
- Modify: `src/features/settings/SettingsShell.test.tsx`
- Modify: `docs/reports/phase-one-validation.md`

**Interfaces:**
- Consumes: Task 6 `SessionReliefPage`.
- Produces: a reachable tenth settings page and recorded validation boundary.

- [ ] **Step 1: Write the failing settings integration test**

Change the page-count assertion from nine to ten. Add:

```ts
it('opens Session Relief from the settings rail', async () => {
  const user = userEvent.setup();
  renderShell();
  await user.click(screen.getByRole('tab', {name: 'Session Relief'}));
  expect(await screen.findByRole('heading', {name: 'Session Relief'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Analyze this session'})).toBeVisible();
  expect(useSettingsStore.getState().activePage).toBe('session-relief');
});
```

- [ ] **Step 2: Run the settings test and verify failure**

Run: `bun run test -- src/features/settings/SettingsShell.test.tsx --maxWorkers=1`

Expected: page-count and missing-tab assertions fail.

- [ ] **Step 3: Add the settings route**

Insert `'session-relief'` after `'activity'` in `settingsPageIds`. Add a `LightningIcon` navigation entry with label `Session Relief` and description `Current resource pressure and retained processes`. Import `SessionReliefPage` in `SettingsShell` and return it from the `session-relief` switch case. Do not add a settings data section or persistence key.

- [ ] **Step 4: Run focused frontend verification**

Run: `bun run test -- src/features/settings/SettingsShell.test.tsx src/features/session-relief src/services/session-relief --maxWorkers=1`

Run: `bun run typecheck`

Run: `bun run lint`

Expected: focused tests, type checking, and lint pass.

- [ ] **Step 5: Record the validation boundary**

Add a dated Session Relief section to `docs/reports/phase-one-validation.md` listing the exact automated commands and results. State that live-process values are machine-dependent, that a single report cannot prove historical spawning, and that manual Windows acceptance remains open until the report is cross-checked against Task Manager. If disk capacity still blocks a command, record the exact `ENOSPC` command as blocked rather than passed.

- [ ] **Step 6: Run the full release gate after capacity is restored**

Run sequentially to avoid repeating the original disk-pressure failure:

```powershell
rtk bun run test -- --maxWorkers=1
rtk bun run typecheck
rtk bun run lint
rtk bun run build
rtk cargo fmt --manifest-path src-tauri/Cargo.toml --check
rtk cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
rtk cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits 0. If C: lacks working space, stop and report capacity rather than altering or deleting user data.

- [ ] **Step 7: Perform manual Windows acceptance**

Open Lumen, navigate to Settings > Session Relief, run one analysis, and verify representative process counts/memory against Task Manager. Refresh once, expand a multi-process tree, copy the safe summary, and confirm the clipboard contains no `pid`, `parentPid`, or `trees` keys. Confirm Task Manager process count and filesystem state do not change because of the analysis itself.

- [ ] **Step 8: Commit the integrated feature**

```powershell
rtk git add src/features/settings docs/reports/phase-one-validation.md
rtk git commit -m "feat: add Session Relief to Lumen settings"
```

- [ ] **Step 9: Review the final feature-only diff**

Run: `rtk git diff --check origin/codex/lumen-ai-search...HEAD`

Run: `rtk git diff --stat origin/codex/lumen-ai-search...HEAD`

Run: `rtk git log --oneline origin/codex/lumen-ai-search..HEAD`

Expected: only the design, plan, Session Relief implementation, settings routing, dependency lock changes, tests, and validation report appear.

- [ ] **Step 10: Push and open the stacked pull request**

Push `codex/lumen-session-relief` and open a pull request targeting `codex/lumen-ai-search`. In the PR body, state that it is stacked on PR #2 and should be retargeted to `main` after PR #2 merges. Include automated results, the manual Windows result, privacy exclusions, non-destructive guarantees, and any capacity-blocked check without overstating it.
