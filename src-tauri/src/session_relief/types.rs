use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PressureLevel {
    Normal,
    Elevated,
    High,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessCategory {
    AiAssistant,
    Browser,
    Container,
    Editor,
    Electron,
    Network,
    Node,
    RustBuild,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignalKind {
    Memory,
    Cpu,
    Multiplicity,
    Longevity,
    Detachment,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingSeverity {
    Info,
    Warning,
    Critical,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FindingConfidence {
    Medium,
    High,
}

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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub code: String,
    pub severity: FindingSeverity,
    pub confidence: FindingConfidence,
    pub title: String,
    pub evidence: String,
    pub guidance: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionCoverage {
    pub observed_processes: u32,
    pub skipped_processes: u32,
    pub transient_processes: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionWarning {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug)]
pub struct ProcessSample {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub started_at_seconds: u64,
    pub memory_bytes: u64,
    pub cpu_percent: f32,
}
