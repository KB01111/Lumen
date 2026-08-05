# Lumen Session Relief Design

**Date:** 2026-08-05  
**Status:** Approved concept; awaiting written-spec review  
**Branch strategy:** Stack on `codex/lumen-ai-search` until pull request #2 merges

## Objective

Add an on-demand, read-only Session Relief report to Lumen that explains why a long AI-development session feels slow. The report must identify current system pressure, multi-process application families, long-lived or detached processes, and the heaviest process trees without terminating processes, deleting files, changing startup configuration, or running a background monitor.

Lumen produces the complete report locally. It does not depend on WinClean, a cloud service, or an external helper process.

## Product Boundary

Session Relief is a diagnostic and decision-support feature, not an automatic process cleaner.

- Collection begins only when the user selects **Analyze this session** or explicitly refreshes an existing report.
- The report exists only in frontend memory while the application is running. It is not added to search history, activity history, logs, SQLite, or settings persistence.
- Lumen does not expose terminate, suspend, restart, delete, cache-clear, service-control, or startup-management actions from this report.
- Lumen does not continuously poll processes or keep a per-frame sampling loop.
- The report describes current evidence. A short sampling window may show active churn, but Lumen does not claim to reconstruct historical spawn rates from a single snapshot.
- The full local view may show process names and PIDs. It never collects command lines, arguments, environment variables, executable paths, window titles, file contents, or user document paths.

## User Experience

Add **Session Relief** to the settings navigation between Activity and Privacy. The page follows the existing settings layout and uses the existing Lumen design primitives, semantic tokens, React Aria behavior, motion policy, and focus treatment.

The page has four states:

1. **Idle** — a concise explanation of what will be inspected, the privacy boundary, and an **Analyze this session** button.
2. **Collecting** — a stable progress region describing the bounded CPU-sampling step. The button is disabled and the region is announced politely.
3. **Report** — summary pressure indicators, ranked process families, noteworthy findings, and an expandable process-tree table.
4. **Partial or failed** — available sections remain visible, collection warnings explain omitted data, and a retry action is available. Raw OS errors are not rendered directly.

The report header shows the capture time, collection duration, and a **Refresh report** action. Refresh replaces the in-memory report only after a new collection succeeds so a transient error does not destroy a useful prior result.

### Summary

The first section answers “why does the laptop feel slow?” with evidence rather than a generic health score:

- physical memory used and available;
- committed memory used and limit when Windows supplies it;
- system process count and session uptime;
- total sampled CPU load, clearly labeled as a short sample;
- the largest process family by memory;
- the largest family by process count;
- the oldest noteworthy process or detached process group;
- any collection limitation that reduces confidence.

Pressure labels are `normal`, `elevated`, or `high`. Each label includes its triggering measurement so the user can understand the result. Thresholds live in a pure classification module and are tested at their boundaries. They are guidance, not a claim that an application is defective.

### Process Families

Processes are aggregated by a normalized executable basename. Each ranked family shows:

- process count;
- combined resident memory;
- combined sampled CPU percentage;
- oldest process age;
- root and detached-process counts;
- the strongest current signal: memory, CPU, multiplicity, longevity, or detachment.

The report may recognize common development-runtime categories such as browser, Electron, Node, Rust build, container/WSL, editor, AI assistant, and VPN/remote-access processes. Recognition affects the explanatory label only; unknown processes remain fully reportable and no category receives destructive behavior.

### Findings

Findings are deterministic statements derived from measurements. Examples include memory pressure, one family retaining many processes, one tree retaining substantial memory, a long-lived detached process, high CPU during the sample, or low system-drive free space. Every finding contains the evidence used, a confidence level, and a non-destructive next step such as closing the owning application normally or reviewing the process in Task Manager.

Lumen avoids claiming a leak solely because an application uses many processes. Browser and Electron multi-process architectures are described as such. A process is described as detached only when its recorded parent is absent from the collected process set; protected or exited parents can make this signal incomplete.

### Process Tree

The expandable tree is grouped by discovered roots and sorted by total descendant memory. Each row shows basename, PID, parent PID when available, age, sampled CPU, resident memory, child count, and detached status. Cycles and invalid parent references are broken defensively and surfaced as collection warnings rather than causing recursion failures.

The initial view remains bounded: it shows the highest-impact trees and allows the user to expand individual branches. Large sets use the existing list-performance patterns rather than mounting every row immediately.

### Safe Summary

A **Copy safe summary** action copies only system totals, pressure labels, aggregate family measurements, findings, capture time, and collection warnings. It excludes PIDs and any future field marked local-only. Clipboard failure produces an inline error and leaves the report intact.

## Architecture

### Rust Collection Boundary

Create `src-tauri/src/session_relief/` with focused modules:

- `types.rs` owns serializable report DTOs and stable enum values;
- `collector.rs` owns the bounded system/process samples;
- `tree.rs` builds defensive parent-child relationships and aggregates descendants;
- `classify.rs` derives family categories, pressure labels, and findings;
- `mod.rs` exposes the Tauri command.

The async `session_relief_snapshot` command runs blocking collection outside Tauri's async runtime worker. It returns one versioned `SessionReliefReport` DTO. The command is registered alongside the existing search, gateway, and window commands.

`sysinfo` supplies cross-platform process identity, parent relationship, start time, resident memory, CPU samples, and system uptime. CPU values are collected with two targeted refreshes separated by a short bounded interval because a single refresh cannot produce a meaningful sample. Windows `GlobalMemoryStatusEx` supplies physical and page-file/commit-style totals. System-drive free space uses the Windows volume API. Non-Windows builds return supported `sysinfo` fields and explicit warnings for unavailable Windows-only measurements so CI remains buildable.

The collector tolerates processes starting, exiting, or becoming inaccessible during collection. It records skipped counts and warnings rather than failing the whole report. Numeric totals use saturating arithmetic and are serialized as integer byte counts or seconds; percentages are finite, bounded floating-point values.

### Frontend Boundary

Create a `SessionReliefService` interface under `src/services/session-relief/`. The Tauri adapter owns `invoke('session_relief_snapshot')` and validates the response with Zod before returning it. A browser/unavailable adapter returns a clear platform-unavailable state for tests and non-Tauri development.

Create `src/features/session-relief/` for report types, pure presentation helpers, the in-memory controller/store, summary components, findings, family list, and process tree. React components never invoke Tauri directly. No collected data is added to the persisted settings schema; only the new settings page identifier is persisted through the existing active-page mechanism.

The page is routed by `SettingsShell`, and its navigation definition is added to `SettingsNav`. Existing Activity and Diagnostics data remain separately owned. Diagnostics may show only whether the last in-memory collection succeeded and its duration while the Session Relief page is mounted; it does not duplicate or persist the report.

## Data Contract

The report contains:

- `schemaVersion`, `capturedAt`, and `collectionDurationMs`;
- `system` totals for memory, commit/page-file availability, process count, uptime, sampled CPU, and system-drive free space;
- `families` with aggregate metrics and explanatory signals;
- `trees` containing local-only process nodes and descendant totals;
- `findings` with severity, confidence, evidence, and non-destructive guidance;
- `coverage` with observed, skipped, and transient-process counts;
- `warnings` as sanitized stable codes plus user-facing messages.

Rust is the source of truth for measurement and classification. TypeScript mirrors and validates the wire contract. The safe-summary formatter accepts the validated report and deliberately constructs a new redacted object rather than serializing the full DTO and deleting fields afterward.

## Error Handling and Privacy

- A total collector failure returns a typed, sanitized error code and retry guidance.
- A partial collector success returns a report plus warnings.
- Access-denied and process-exited races increment coverage counters.
- Unknown enum values or malformed native responses fail frontend validation and show a compatibility error.
- Collection does not write telemetry or logs containing the process list.
- The UI includes a visible statement that all analysis stays on the device.
- Copying a safe summary is always an explicit user action.

## Accessibility and Performance

- The analyze and refresh actions remain keyboard accessible and expose their busy state.
- Summary status is not communicated by color alone.
- Findings use headings and list semantics; the process tree exposes expandable row state and a stable accessible name.
- Reduced-motion mode removes spatial page/tree transitions while preserving state changes.
- Collection is bounded and on demand. Rendering initially limits tree depth and row count, with expansion controlled by the user.
- No timer survives page unmount, and stale collection results cannot overwrite a newer request.

## Verification Strategy

Rust tests cover normalization, family aggregation, detached-parent handling, cycle breaking, descendant totals, threshold boundaries, finding generation, safe arithmetic, and DTO serialization. Windows-gated tests cover memory and system-drive collection without asserting machine-specific values.

Frontend tests cover idle, collecting, report, partial, failure, refresh preservation, stale-response rejection, navigation, keyboard expansion, accessible status text, Zod validation, and safe-summary redaction. Existing settings tests are extended to include the new page.

Verification commands are:

- `bun run test`;
- `bun run typecheck`;
- `bun run lint`;
- `bun run build`;
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`;
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`;
- `cargo test --manifest-path src-tauri/Cargo.toml`.

Manual Windows acceptance verifies an actual report after a long development session, refresh behavior, large process sets, Task Manager cross-checks for representative processes, high contrast, reduced motion, keyboard-only use, safe-summary contents, and confirmation that no process or file state changes after analysis.

The pre-implementation baseline on 2026-08-05 was interrupted by the system drive reaching 0 bytes free while the fresh worktree ran frontend and Rust verification concurrently. The observed failure was `ENOSPC`, not an assertion failure. Baseline and final suites must be rerun after sufficient disk space is available.

## Completion Criteria

The feature is complete when Lumen can produce the full on-device Session Relief report from its settings surface; explain current resource pressure with traceable evidence; show family and tree detail without collecting sensitive process metadata; export only a deliberately redacted summary; handle partial collection safely; perform no cleanup or process mutation; pass the automated verification suite after disk capacity is restored; and pass manual Windows acceptance without changing process or file state.
