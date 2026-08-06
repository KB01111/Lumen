use std::collections::{BTreeMap, BTreeSet};

use super::types::{
    Finding, FindingConfidence, FindingSeverity, PressureLevel, ProcessCategory, ProcessFamily,
    ProcessSample, ProcessTree, SignalKind, SystemSnapshot,
};

const GIB: u64 = 1024 * 1024 * 1024;

pub fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

pub fn category_for(name: &str) -> ProcessCategory {
    match normalize_name(name).as_str() {
        "chatgpt.exe" | "cline.exe" | "codex.exe" | "claude.exe" | "goose.exe" => {
            ProcessCategory::AiAssistant
        }
        "code.exe" | "cursor.exe" | "zed.exe" | "devenv.exe" => ProcessCategory::Editor,
        "chrome.exe" | "msedge.exe" | "firefox.exe" | "helium.exe" | "brave.exe" => {
            ProcessCategory::Browser
        }
        "node.exe" | "bun.exe" | "deno.exe" => ProcessCategory::Node,
        "cargo.exe" | "rustc.exe" | "sccache.exe" => ProcessCategory::RustBuild,
        "docker.exe"
        | "docker desktop.exe"
        | "com.docker.backend.exe"
        | "wsl.exe"
        | "wslhost.exe"
        | "vmmem"
        | "vmmemwsl" => ProcessCategory::Container,
        "electron.exe" => ProcessCategory::Electron,
        "nordvpn.exe" | "rustdesk.exe" => ProcessCategory::Network,
        _ => ProcessCategory::Other,
    }
}

pub fn classify_system(system: &SystemSnapshot) -> PressureLevel {
    let memory = ratio_pressure(system.memory_used_bytes, system.memory_total_bytes);
    let commit = match (system.commit_used_bytes, system.commit_limit_bytes) {
        (Some(used), Some(limit)) => ratio_pressure(used, limit),
        _ => PressureLevel::Normal,
    };
    let cpu = percentage_pressure(system.sampled_cpu_percent);
    let drive = system
        .system_drive_free_bytes
        .map(drive_pressure)
        .unwrap_or(PressureLevel::Normal);
    maximum_pressure([memory, commit, cpu, drive])
}

pub fn aggregate_families(samples: &[ProcessSample], trees: &[ProcessTree]) -> Vec<ProcessFamily> {
    let root_pids = trees
        .iter()
        .map(|tree| tree.root_pid)
        .collect::<BTreeSet<_>>();
    let detached_pids = trees
        .iter()
        .flat_map(|tree| tree.nodes.iter())
        .filter(|node| node.detached)
        .map(|node| node.pid)
        .collect::<BTreeSet<_>>();
    let mut families = BTreeMap::<String, FamilyTotals>::new();
    for sample in samples {
        let name = normalize_name(&sample.name);
        let totals = families
            .entry(name.clone())
            .or_insert_with(|| FamilyTotals::new(name));
        totals.process_count = totals.process_count.saturating_add(1);
        totals.total_memory_bytes = totals
            .total_memory_bytes
            .saturating_add(sample.memory_bytes);
        totals.total_cpu_percent =
            safe_cpu(totals.total_cpu_percent + safe_cpu(sample.cpu_percent));
        totals.oldest_age_seconds = totals.oldest_age_seconds.max(
            trees
                .iter()
                .flat_map(|tree| tree.nodes.iter())
                .find(|node| node.pid == sample.pid)
                .map_or(0, |node| node.age_seconds),
        );
        if root_pids.contains(&sample.pid) {
            totals.root_count = totals.root_count.saturating_add(1);
        }
        if detached_pids.contains(&sample.pid) {
            totals.detached_count = totals.detached_count.saturating_add(1);
        }
    }
    let mut result = families
        .into_values()
        .map(FamilyTotals::finish)
        .collect::<Vec<_>>();
    result.sort_by(|left, right| {
        pressure_rank(right.pressure)
            .cmp(&pressure_rank(left.pressure))
            .then(right.total_memory_bytes.cmp(&left.total_memory_bytes))
            .then(right.process_count.cmp(&left.process_count))
            .then(left.name.cmp(&right.name))
    });
    result
}

pub fn derive_findings(
    system: &SystemSnapshot,
    families: &[ProcessFamily],
    _trees: &[ProcessTree],
) -> Vec<Finding> {
    let mut findings = Vec::new();
    if ratio_pressure(system.memory_used_bytes, system.memory_total_bytes) != PressureLevel::Normal
    {
        findings.push(finding(
            "memory-pressure",
            severity_for(ratio_pressure(
                system.memory_used_bytes,
                system.memory_total_bytes,
            )),
            "Memory pressure",
            "Physical memory use is elevated for this short local snapshot.",
            "Review in Task Manager.",
        ));
    }
    if let (Some(used), Some(limit)) = (system.commit_used_bytes, system.commit_limit_bytes) {
        let pressure = ratio_pressure(used, limit);
        if pressure != PressureLevel::Normal {
            findings.push(finding(
                "commit-pressure",
                severity_for(pressure),
                "Committed memory pressure",
                "Committed memory use is elevated for this short local snapshot.",
                "Review in Task Manager.",
            ));
        }
    }
    if let Some(free) = system.system_drive_free_bytes {
        let pressure = drive_pressure(free);
        if pressure != PressureLevel::Normal {
            findings.push(finding(
                "system-drive-low",
                severity_for(pressure),
                "Low system-drive capacity",
                "The system drive has limited free capacity.",
                "Free system-drive capacity.",
            ));
        }
    }
    let cpu = percentage_pressure(system.sampled_cpu_percent);
    if cpu != PressureLevel::Normal {
        findings.push(finding(
            "cpu-pressure",
            severity_for(cpu),
            "High sampled CPU",
            "CPU use was elevated during the bounded local sample.",
            "Review in Task Manager.",
        ));
    }
    for family in families {
        let memory = family_memory_pressure(family.total_memory_bytes);
        if memory != PressureLevel::Normal {
            findings.push(finding(
                "large-process-family",
                severity_for(memory),
                "Large process family",
                &format!("{} is retaining substantial resident memory.", family.name),
                "Close the owning application normally.",
            ));
        }
        let multiplicity = family_count_pressure(family.process_count);
        if multiplicity != PressureLevel::Normal {
            let evidence = if family.category == ProcessCategory::Browser
                || family.category == ProcessCategory::Electron
            {
                format!(
                    "{} has {} processes. Multi-process applications can retain many workers as part of their normal architecture.",
                    family.name, family.process_count
                )
            } else {
                format!(
                    "{} has {} observed processes.",
                    family.name, family.process_count
                )
            };
            findings.push(finding(
                "many-processes",
                severity_for(multiplicity),
                "Many related processes",
                &evidence,
                "Review in Task Manager.",
            ));
        }
        if family.detached_count > 0 && family.oldest_age_seconds >= 4 * 60 * 60 {
            let severity = if family.oldest_age_seconds >= 12 * 60 * 60 {
                FindingSeverity::Critical
            } else {
                FindingSeverity::Warning
            };
            findings.push(finding(
                "long-lived-detached",
                severity,
                "Long-lived detached process",
                &format!(
                    "{} includes a process whose recorded parent was unavailable in this snapshot.",
                    family.name
                ),
                "Close the owning application normally.",
            ));
        }
    }
    findings
}

pub fn partial_coverage_finding() -> Finding {
    let mut finding = finding(
        "partial-coverage",
        FindingSeverity::Info,
        "Partial process coverage",
        "Some processes changed or were unavailable during local collection.",
        "Review in Task Manager.",
    );
    finding.confidence = FindingConfidence::Medium;
    finding
}

struct FamilyTotals {
    name: String,
    process_count: u32,
    total_memory_bytes: u64,
    total_cpu_percent: f32,
    oldest_age_seconds: u64,
    root_count: u32,
    detached_count: u32,
}

impl FamilyTotals {
    fn new(name: String) -> Self {
        Self {
            name,
            process_count: 0,
            total_memory_bytes: 0,
            total_cpu_percent: 0.0,
            oldest_age_seconds: 0,
            root_count: 0,
            detached_count: 0,
        }
    }

    fn finish(self) -> ProcessFamily {
        let memory = family_memory_pressure(self.total_memory_bytes);
        let cpu = percentage_pressure(self.total_cpu_percent);
        let multiplicity = family_count_pressure(self.process_count);
        let detachment = if self.detached_count > 0 && self.oldest_age_seconds >= 12 * 60 * 60 {
            PressureLevel::High
        } else if self.detached_count > 0 && self.oldest_age_seconds >= 4 * 60 * 60 {
            PressureLevel::Elevated
        } else {
            PressureLevel::Normal
        };
        let longevity = if self.oldest_age_seconds >= 12 * 60 * 60 {
            PressureLevel::Elevated
        } else {
            PressureLevel::Normal
        };
        let signals = [
            (memory, SignalKind::Memory),
            (cpu, SignalKind::Cpu),
            (multiplicity, SignalKind::Multiplicity),
            (detachment, SignalKind::Detachment),
            (longevity, SignalKind::Longevity),
        ];
        let (pressure, signal) = signals
            .into_iter()
            .max_by_key(|(pressure, signal)| (pressure_rank(*pressure), signal_tie_rank(*signal)))
            .unwrap_or((PressureLevel::Normal, SignalKind::Memory));
        ProcessFamily {
            name: self.name.clone(),
            category: category_for(&self.name),
            process_count: self.process_count,
            total_memory_bytes: self.total_memory_bytes,
            total_cpu_percent: self.total_cpu_percent,
            oldest_age_seconds: self.oldest_age_seconds,
            root_count: self.root_count,
            detached_count: self.detached_count,
            signal,
            pressure,
        }
    }
}

fn finding(
    code: &str,
    severity: FindingSeverity,
    title: &str,
    evidence: &str,
    guidance: &str,
) -> Finding {
    Finding {
        code: code.to_owned(),
        severity,
        confidence: FindingConfidence::High,
        title: title.to_owned(),
        evidence: evidence.to_owned(),
        guidance: guidance.to_owned(),
    }
}

fn ratio_pressure(used: u64, total: u64) -> PressureLevel {
    if total == 0 {
        return PressureLevel::Normal;
    }
    let ratio = used as f64 / total as f64;
    if ratio >= 0.90 {
        PressureLevel::High
    } else if ratio >= 0.80 {
        PressureLevel::Elevated
    } else {
        PressureLevel::Normal
    }
}
fn percentage_pressure(value: f32) -> PressureLevel {
    if value >= 85.0 {
        PressureLevel::High
    } else if value >= 65.0 {
        PressureLevel::Elevated
    } else {
        PressureLevel::Normal
    }
}
fn drive_pressure(value: u64) -> PressureLevel {
    if value < 5 * GIB {
        PressureLevel::High
    } else if value < 15 * GIB {
        PressureLevel::Elevated
    } else {
        PressureLevel::Normal
    }
}
fn family_memory_pressure(value: u64) -> PressureLevel {
    if value >= 4 * GIB {
        PressureLevel::High
    } else if value >= 2 * GIB {
        PressureLevel::Elevated
    } else {
        PressureLevel::Normal
    }
}
fn family_count_pressure(value: u32) -> PressureLevel {
    if value >= 40 {
        PressureLevel::High
    } else if value >= 16 {
        PressureLevel::Elevated
    } else {
        PressureLevel::Normal
    }
}
fn severity_for(pressure: PressureLevel) -> FindingSeverity {
    if pressure == PressureLevel::High {
        FindingSeverity::Critical
    } else {
        FindingSeverity::Warning
    }
}
fn pressure_rank(pressure: PressureLevel) -> u8 {
    match pressure {
        PressureLevel::Normal => 0,
        PressureLevel::Elevated => 1,
        PressureLevel::High => 2,
    }
}
fn signal_tie_rank(signal: SignalKind) -> u8 {
    match signal {
        SignalKind::Memory => 5,
        SignalKind::Cpu => 4,
        SignalKind::Multiplicity => 3,
        SignalKind::Detachment => 2,
        SignalKind::Longevity => 1,
    }
}
fn maximum_pressure(levels: impl IntoIterator<Item = PressureLevel>) -> PressureLevel {
    levels
        .into_iter()
        .max_by_key(|level| pressure_rank(*level))
        .unwrap_or(PressureLevel::Normal)
}
fn safe_cpu(value: f32) -> f32 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_relief::{
        tree::build_process_trees,
        types::{PressureLevel, ProcessSample},
    };

    fn sample(pid: u32, name: &str, memory_bytes: u64) -> ProcessSample {
        ProcessSample {
            pid,
            parent_pid: None,
            name: name.to_owned(),
            started_at_seconds: 1,
            memory_bytes,
            cpu_percent: 0.0,
        }
    }

    #[test]
    fn recognizes_development_runtime_categories() {
        assert_eq!(category_for("ChatGPT.exe"), ProcessCategory::AiAssistant);
        assert_eq!(category_for("msedge.exe"), ProcessCategory::Browser);
        assert_eq!(category_for("node.exe"), ProcessCategory::Node);
        assert_eq!(category_for("rustc.exe"), ProcessCategory::RustBuild);
        assert_eq!(category_for("vmmemWSL"), ProcessCategory::Container);
        assert_eq!(category_for("custom-tool.exe"), ProcessCategory::Other);
    }

    #[test]
    fn aggregates_normalized_basenames_only() {
        let samples = [
            sample(1, "Node.exe", 10),
            sample(2, "node.exe", 20),
            sample(3, "bun.exe", 30),
        ];
        let trees = build_process_trees(&samples, 10).trees;
        let families = aggregate_families(&samples, &trees);
        assert_eq!(
            families
                .iter()
                .find(|family| family.name == "node.exe")
                .unwrap()
                .process_count,
            2
        );
        assert_eq!(families.len(), 2);
    }

    #[test]
    fn pressure_boundaries_are_inclusive() {
        assert_eq!(ratio_pressure(89, 100), PressureLevel::Elevated);
        assert_eq!(ratio_pressure(90, 100), PressureLevel::High);
        assert_eq!(percentage_pressure(65.0), PressureLevel::Elevated);
        assert_eq!(percentage_pressure(85.0), PressureLevel::High);
        assert_eq!(family_count_pressure(16), PressureLevel::Elevated);
        assert_eq!(family_count_pressure(40), PressureLevel::High);
    }

    #[test]
    fn browser_multiplicity_does_not_claim_a_leak() {
        let family = ProcessFamily {
            name: "chrome.exe".to_owned(),
            category: ProcessCategory::Browser,
            process_count: 20,
            total_memory_bytes: 0,
            total_cpu_percent: 0.0,
            oldest_age_seconds: 0,
            root_count: 1,
            detached_count: 0,
            signal: SignalKind::Multiplicity,
            pressure: PressureLevel::Elevated,
        };
        let system = SystemSnapshot {
            memory_total_bytes: 1,
            memory_used_bytes: 0,
            memory_available_bytes: 1,
            commit_used_bytes: None,
            commit_limit_bytes: None,
            process_count: 20,
            uptime_seconds: 0,
            sampled_cpu_percent: 0.0,
            system_drive_free_bytes: None,
            pressure: PressureLevel::Normal,
        };
        let finding = derive_findings(&system, &[family], &[])
            .into_iter()
            .find(|finding| finding.code == "many-processes")
            .unwrap();
        assert!(
            finding
                .evidence
                .contains("Multi-process applications can retain many workers")
        );
        assert!(!finding.evidence.to_lowercase().contains("leak"));
    }

    #[test]
    fn partial_coverage_is_reported_with_medium_confidence() {
        let finding = partial_coverage_finding();
        assert_eq!(finding.confidence, FindingConfidence::Medium);
    }
}
