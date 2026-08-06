use std::{
    collections::BTreeSet,
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use sysinfo::{
    CpuRefreshKind, MINIMUM_CPU_UPDATE_INTERVAL, MemoryRefreshKind, ProcessRefreshKind,
    ProcessesToUpdate, RefreshKind, System,
};

use super::{
    SessionReliefFailure,
    classify::{aggregate_families, classify_system, derive_findings, partial_coverage_finding},
    tree::build_process_trees,
    types::{
        CollectionCoverage, CollectionWarning, PressureLevel, ProcessSample, SessionReliefReport,
        SystemSnapshot,
    },
};

pub fn collect_session_relief() -> Result<SessionReliefReport, SessionReliefFailure> {
    let started = Instant::now();
    let process_kind = ProcessRefreshKind::nothing().with_cpu().with_memory();
    let refresh_kind = RefreshKind::nothing()
        .with_memory(MemoryRefreshKind::everything())
        .with_cpu(CpuRefreshKind::everything())
        .with_processes(process_kind);
    let mut system = System::new_with_specifics(refresh_kind);
    let before = system.processes().keys().copied().collect::<BTreeSet<_>>();
    thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu_usage();
    system.refresh_memory_specifics(MemoryRefreshKind::everything());
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_kind);
    let after = system.processes().keys().copied().collect::<BTreeSet<_>>();

    let mut skipped_processes = 0_u32;
    let samples = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let pid = pid.as_u32();
            if pid == 0 {
                skipped_processes = skipped_processes.saturating_add(1);
                return None;
            }
            Some(ProcessSample {
                pid,
                parent_pid: process
                    .parent()
                    .map(|parent| parent.as_u32())
                    .filter(|parent| *parent != 0),
                name: process.name().to_string_lossy().into_owned(),
                started_at_seconds: process.start_time(),
                memory_bytes: process.memory(),
                cpu_percent: nonnegative_cpu(process.cpu_usage()),
            })
        })
        .collect::<Vec<_>>();
    let captured_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(SessionReliefFailure::from_internal)?
        .as_millis()
        .min(u64::MAX as u128) as u64;
    let now_seconds = captured_at / 1_000;
    let tree_result = build_process_trees(&samples, now_seconds);
    let logical_cpus = system.cpus().len().max(1) as f32;
    let sampled_cpu_percent = nonnegative_cpu(
        samples.iter().map(|sample| sample.cpu_percent).sum::<f32>() / logical_cpus,
    )
    .min(100.0);
    let platform = platform_memory(&system);
    let mut warnings = tree_result.warnings;
    warnings.extend(platform.warnings);
    if skipped_processes > 0 {
        warnings.push(CollectionWarning {
            code: "processes-skipped".to_owned(),
            message: "Some processes could not be represented in the local report.".to_owned(),
        });
    }
    let mut snapshot = SystemSnapshot {
        memory_total_bytes: platform.memory_total_bytes,
        memory_used_bytes: platform.memory_used_bytes,
        memory_available_bytes: platform.memory_available_bytes,
        commit_used_bytes: platform.commit_used_bytes,
        commit_limit_bytes: platform.commit_limit_bytes,
        process_count: samples.len() as u32,
        uptime_seconds: System::uptime(),
        sampled_cpu_percent,
        system_drive_free_bytes: platform.system_drive_free_bytes,
        pressure: PressureLevel::Normal,
    };
    snapshot.pressure = classify_system(&snapshot);
    let families = aggregate_families(&samples, &tree_result.trees);
    let mut findings = derive_findings(&snapshot, &families, &tree_result.trees);
    let transient_processes = before.difference(&after).count() as u32;
    if skipped_processes > 0 || transient_processes > 0 {
        findings.push(partial_coverage_finding());
    }
    Ok(SessionReliefReport {
        schema_version: 1,
        captured_at,
        collection_duration_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        system: snapshot,
        families,
        trees: tree_result.trees,
        findings,
        coverage: CollectionCoverage {
            observed_processes: samples.len() as u32,
            skipped_processes,
            transient_processes,
        },
        warnings,
    })
}

struct PlatformMemory {
    memory_total_bytes: u64,
    memory_used_bytes: u64,
    memory_available_bytes: u64,
    commit_used_bytes: Option<u64>,
    commit_limit_bytes: Option<u64>,
    system_drive_free_bytes: Option<u64>,
    warnings: Vec<CollectionWarning>,
}

#[cfg(windows)]
struct WindowsMemory {
    total_physical_bytes: u64,
    available_physical_bytes: u64,
    commit_used_bytes: u64,
    commit_limit_bytes: u64,
}

#[cfg(windows)]
fn read_windows_memory() -> Result<WindowsMemory, SessionReliefFailure> {
    use std::mem::size_of;
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    unsafe { GlobalMemoryStatusEx(&mut status) }.map_err(SessionReliefFailure::from_internal)?;
    Ok(WindowsMemory {
        total_physical_bytes: status.ullTotalPhys,
        available_physical_bytes: status.ullAvailPhys.min(status.ullTotalPhys),
        commit_used_bytes: status
            .ullTotalPageFile
            .saturating_sub(status.ullAvailPageFile),
        commit_limit_bytes: status.ullTotalPageFile,
    })
}

#[cfg(windows)]
fn read_system_drive_free_bytes() -> Result<u64, SessionReliefFailure> {
    use windows::{Win32::Storage::FileSystem::GetDiskFreeSpaceExW, core::PCWSTR};

    let drive = std::env::var("SystemDrive").map_err(SessionReliefFailure::from_internal)?;
    let path = if drive.ends_with('\\') {
        drive
    } else {
        format!("{drive}\\")
    };
    let wide = path
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut free_bytes = 0_u64;
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free_bytes), None, None) }
        .map_err(SessionReliefFailure::from_internal)?;
    Ok(free_bytes)
}

#[cfg(windows)]
fn platform_memory(_system: &System) -> PlatformMemory {
    match (read_windows_memory(), read_system_drive_free_bytes()) {
        (Ok(memory), drive) => {
            let mut warnings = Vec::new();
            let system_drive_free_bytes = match drive {
                Ok(value) => Some(value),
                Err(_) => {
                    warnings.push(CollectionWarning {
                        code: "system-drive-unavailable".to_owned(),
                        message:
                            "System-drive free capacity was unavailable for this local report."
                                .to_owned(),
                    });
                    None
                }
            };
            PlatformMemory {
                memory_total_bytes: memory.total_physical_bytes,
                memory_used_bytes: memory
                    .total_physical_bytes
                    .saturating_sub(memory.available_physical_bytes),
                memory_available_bytes: memory.available_physical_bytes,
                commit_used_bytes: Some(memory.commit_used_bytes),
                commit_limit_bytes: Some(memory.commit_limit_bytes),
                system_drive_free_bytes,
                warnings,
            }
        }
        (Err(_), drive) => {
            let mut fallback = system_memory(_system);
            fallback.warnings.push(CollectionWarning {
                code: "commit-metrics-unavailable".to_owned(),
                message: "Committed-memory totals were unavailable for this local report."
                    .to_owned(),
            });
            fallback.system_drive_free_bytes = drive.ok();
            if fallback.system_drive_free_bytes.is_none() {
                fallback.warnings.push(CollectionWarning {
                    code: "system-drive-unavailable".to_owned(),
                    message: "System-drive free capacity was unavailable for this local report."
                        .to_owned(),
                });
            }
            fallback
        }
    }
}

#[cfg(not(windows))]
fn platform_memory(system: &System) -> PlatformMemory {
    let mut result = system_memory(system);
    result.warnings.push(CollectionWarning {
        code: "commit-metrics-unavailable".to_owned(),
        message: "Committed-memory totals are unavailable on this platform.".to_owned(),
    });
    result.warnings.push(CollectionWarning {
        code: "system-drive-unavailable".to_owned(),
        message: "System-drive free capacity is unavailable on this platform.".to_owned(),
    });
    result
}

fn system_memory(system: &System) -> PlatformMemory {
    let total = system.total_memory();
    let available = system.available_memory().min(total);
    PlatformMemory {
        memory_total_bytes: total,
        memory_used_bytes: total.saturating_sub(available),
        memory_available_bytes: available,
        commit_used_bytes: None,
        commit_limit_bytes: None,
        system_drive_free_bytes: None,
        warnings: Vec::new(),
    }
}

fn nonnegative_cpu(value: f32) -> f32 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_relief::types::{CollectionCoverage, PressureLevel};

    #[test]
    fn report_serialization_excludes_sensitive_process_fields() {
        let report = SessionReliefReport {
            schema_version: 1,
            captured_at: 1,
            collection_duration_ms: 1,
            system: SystemSnapshot {
                memory_total_bytes: 1,
                memory_used_bytes: 1,
                memory_available_bytes: 0,
                commit_used_bytes: None,
                commit_limit_bytes: None,
                process_count: 0,
                uptime_seconds: 0,
                sampled_cpu_percent: 0.0,
                system_drive_free_bytes: None,
                pressure: PressureLevel::Normal,
            },
            families: vec![],
            trees: vec![],
            findings: vec![],
            coverage: CollectionCoverage {
                observed_processes: 0,
                skipped_processes: 0,
                transient_processes: 0,
            },
            warnings: vec![],
        };
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("\"schemaVersion\":1"));
        for forbidden in [
            "commandLine",
            "arguments",
            "environment",
            "executablePath",
            "currentDirectory",
            "windowTitle",
        ] {
            assert!(!json.contains(forbidden));
        }
    }

    #[test]
    fn live_collection_returns_a_coherent_read_only_snapshot() {
        let report = collect_session_relief().unwrap();

        assert_eq!(report.schema_version, 1);
        assert!(report.captured_at > 0);
        assert!(report.system.memory_total_bytes >= report.system.memory_used_bytes);
        assert!(report.system.memory_total_bytes >= report.system.memory_available_bytes);
        assert_eq!(
            report.system.process_count,
            report.coverage.observed_processes,
        );
        assert_eq!(
            report.trees.iter().map(|tree| tree.node_count).sum::<u32>(),
            report.coverage.observed_processes,
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_memory_snapshot_is_internally_consistent() {
        let memory = read_windows_memory().unwrap();
        assert!(memory.total_physical_bytes > 0);
        assert!(memory.available_physical_bytes <= memory.total_physical_bytes);
        assert!(memory.commit_used_bytes <= memory.commit_limit_bytes);
    }
}
