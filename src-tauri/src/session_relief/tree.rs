use std::collections::{BTreeMap, BTreeSet};

use super::types::{CollectionWarning, ProcessNode, ProcessSample, ProcessTree};

pub struct TreeBuildResult {
    pub trees: Vec<ProcessTree>,
    pub warnings: Vec<CollectionWarning>,
}

pub fn build_process_trees(samples: &[ProcessSample], now_seconds: u64) -> TreeBuildResult {
    let samples = samples
        .iter()
        .cloned()
        .map(|sample| (sample.pid, sample))
        .collect::<BTreeMap<_, _>>();
    let candidates = samples
        .iter()
        .filter_map(|(&pid, sample)| {
            let parent = sample.parent_pid?;
            (parent != 0 && parent != pid && samples.contains_key(&parent)).then_some((pid, parent))
        })
        .collect::<BTreeMap<_, _>>();

    let mut warnings = Vec::new();
    let mut parents = BTreeMap::new();
    for (&pid, &parent) in &candidates {
        if creates_cycle(pid, parent, &candidates) {
            if !warnings
                .iter()
                .any(|warning: &CollectionWarning| warning.code == "process-tree-cycle")
            {
                warnings.push(CollectionWarning {
                    code: "process-tree-cycle".to_owned(),
                    message:
                        "A process-parent cycle was ignored while building the local process tree."
                            .to_owned(),
                });
            }
        } else {
            parents.insert(pid, parent);
        }
    }

    let mut children = BTreeMap::<u32, Vec<u32>>::new();
    for (&pid, &parent) in &parents {
        children.entry(parent).or_default().push(pid);
    }
    for child_pids in children.values_mut() {
        child_pids.sort_unstable();
    }

    let roots = samples
        .keys()
        .copied()
        .filter(|pid| !parents.contains_key(pid))
        .collect::<Vec<_>>();
    let mut trees = roots
        .into_iter()
        .map(|root_pid| {
            let mut nodes = Vec::new();
            append_depth_first(
                root_pid,
                &samples,
                &parents,
                &children,
                now_seconds,
                &mut BTreeSet::new(),
                &mut nodes,
            );
            let total_memory_bytes = nodes
                .iter()
                .fold(0_u64, |total, node| total.saturating_add(node.memory_bytes));
            let total_cpu_percent = nodes
                .iter()
                .fold(0.0_f32, |total, node| total + safe_cpu(node.cpu_percent));
            ProcessTree {
                root_pid,
                node_count: nodes.len() as u32,
                total_memory_bytes,
                total_cpu_percent: safe_cpu(total_cpu_percent),
                nodes,
            }
        })
        .collect::<Vec<_>>();
    trees.sort_by(|left, right| {
        right
            .total_memory_bytes
            .cmp(&left.total_memory_bytes)
            .then(left.root_pid.cmp(&right.root_pid))
    });

    TreeBuildResult { trees, warnings }
}

fn creates_cycle(pid: u32, parent: u32, candidates: &BTreeMap<u32, u32>) -> bool {
    let mut current = parent;
    let mut visited = BTreeSet::new();
    while visited.insert(current) {
        if current == pid {
            return true;
        }
        let Some(next) = candidates.get(&current) else {
            return false;
        };
        current = *next;
    }
    true
}

fn append_depth_first(
    pid: u32,
    samples: &BTreeMap<u32, ProcessSample>,
    parents: &BTreeMap<u32, u32>,
    children: &BTreeMap<u32, Vec<u32>>,
    now_seconds: u64,
    visited: &mut BTreeSet<u32>,
    nodes: &mut Vec<ProcessNode>,
) {
    if !visited.insert(pid) {
        return;
    }
    let Some(sample) = samples.get(&pid) else {
        return;
    };
    let child_pids = children.get(&pid).cloned().unwrap_or_default();
    let detached = sample
        .parent_pid
        .is_some_and(|parent| parent != 0 && !samples.contains_key(&parent));
    nodes.push(ProcessNode {
        pid,
        parent_pid: parents
            .get(&pid)
            .copied()
            .or(sample.parent_pid.filter(|parent| *parent != 0)),
        name: sample.name.clone(),
        age_seconds: now_seconds.saturating_sub(sample.started_at_seconds),
        cpu_percent: safe_cpu(sample.cpu_percent),
        memory_bytes: sample.memory_bytes,
        child_pids: child_pids.clone(),
        detached,
    });
    for child_pid in child_pids {
        append_depth_first(
            child_pid,
            samples,
            parents,
            children,
            now_seconds,
            visited,
            nodes,
        );
    }
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

    fn sample(
        pid: u32,
        parent_pid: Option<u32>,
        name: &str,
        started_at_seconds: u64,
        memory_bytes: u64,
        cpu_percent: f32,
    ) -> ProcessSample {
        ProcessSample {
            pid,
            parent_pid,
            name: name.to_owned(),
            started_at_seconds,
            memory_bytes,
            cpu_percent,
        }
    }

    #[test]
    fn missing_parent_becomes_detached_root() {
        let result = build_process_trees(
            &[
                sample(41, Some(999), "node.exe", 100, 512, 25.0),
                sample(42, Some(41), "worker.exe", 110, 256, 10.0),
            ],
            200,
        );
        assert_eq!(result.trees[0].root_pid, 41);
        assert!(
            result.trees[0]
                .nodes
                .iter()
                .find(|node| node.pid == 41)
                .unwrap()
                .detached
        );
        assert_eq!(result.trees[0].total_memory_bytes, 768);
    }

    #[test]
    fn cycle_is_broken_and_reported_once() {
        let result = build_process_trees(
            &[
                sample(7, Some(8), "a.exe", 1, 10, 1.0),
                sample(8, Some(7), "b.exe", 1, 20, 2.0),
            ],
            20,
        );
        assert_eq!(
            result.trees.iter().map(|tree| tree.node_count).sum::<u32>(),
            2
        );
        assert_eq!(
            result
                .warnings
                .iter()
                .filter(|warning| warning.code == "process-tree-cycle")
                .count(),
            1
        );
    }

    #[test]
    fn clamps_age_and_saturates_totals() {
        let result = build_process_trees(
            &[
                sample(1, None, "a.exe", 300, u64::MAX, f32::NAN),
                sample(2, Some(1), "b.exe", 100, 1, -2.0),
            ],
            200,
        );
        assert_eq!(result.trees[0].nodes[0].age_seconds, 0);
        assert_eq!(result.trees[0].total_memory_bytes, u64::MAX);
        assert_eq!(result.trees[0].total_cpu_percent, 0.0);
    }

    #[test]
    fn sorts_by_memory_then_root_pid() {
        let result = build_process_trees(
            &[
                sample(9, None, "a.exe", 1, 2, 0.0),
                sample(2, None, "b.exe", 1, 2, 0.0),
                sample(3, None, "c.exe", 1, 3, 0.0),
            ],
            1,
        );
        assert_eq!(
            result
                .trees
                .iter()
                .map(|tree| tree.root_pid)
                .collect::<Vec<_>>(),
            vec![3, 2, 9]
        );
    }
}
