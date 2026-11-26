//! Opt-in engine policy and status mapping for the `EngineSearchService`.
//!
//! Search itself is served by `search::winsearch_search`, the launcher path main landed.
//! This module only translates the adapter's hydrated policy into the host's existing
//! canonical grant contract and maps engine status onto the adapter's typed status.

use super::{SearchFailure, indexing::IndexRootRequest, root_policy, traversal};
use serde::{Deserialize, Serialize};
use std::path::Path;
use ws_client::protocol;

fn invalid(message: &str) -> SearchFailure {
    SearchFailure::new("search-failed", message, None)
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EnginePolicy {
    pub hydrated: bool,
    pub roots: Vec<IndexRootRequest>,
    pub paused: bool,
    pub semantic_enabled: bool,
    pub preferred_backend: String,
}

impl EnginePolicy {
    /// Canonicalizes and validates the current grants once, so both the engine configuration
    /// and the host's result-confinement roots describe the same folders.
    pub(super) fn granted_roots(&self) -> Result<Vec<IndexRootRequest>, SearchFailure> {
        if !self.hydrated {
            return Err(invalid("Search settings are still loading."));
        }
        let mut roots: Vec<IndexRootRequest> = Vec::with_capacity(self.roots.len());
        for grant in &self.roots {
            if grant.cloud_enrichment {
                return Err(invalid(
                    "Cloud enrichment is unavailable in the engine adapter until consent migration is complete.",
                ));
            }
            let path = root_policy::canonicalize_root(Path::new(&grant.path))?
                .to_string_lossy()
                .into_owned();
            if roots.iter().any(|root| root.path == path) {
                return Err(invalid("Duplicate engine root grant."));
            }
            roots.push(IndexRootRequest {
                path,
                ..grant.clone()
            });
        }
        Ok(roots)
    }

    pub(super) fn indexing_config(&self) -> Result<protocol::IndexingConfig, SearchFailure> {
        let mut config = protocol::IndexingConfig {
            paused: self.paused,
            code_enabled: true,
            ..Default::default()
        };
        for grant in self.granted_roots()? {
            let size = grant
                .max_file_size_mb
                .checked_mul(1024 * 1024)
                .ok_or_else(|| invalid("Invalid maximum file size."))?;
            let policy = traversal::TraversalPolicy::new(
                grant.exclusions.clone(),
                grant.include_hidden,
                size,
            )?;
            config.roots.push(grant.path.clone());
            config.code_roots.push(grant.path.clone());
            config.root_policies.push(protocol::RootPolicy {
                root: grant.path,
                exclusions: policy.exclusions,
                include_hidden: policy.include_hidden,
                max_file_size_bytes: size,
            });
        }
        Ok(config)
    }

    pub(super) fn engine_config(&self) -> Result<protocol::EngineConfig, SearchFailure> {
        if !matches!(
            self.preferred_backend.as_str(),
            "auto" | "cpu" | "npu" | "cuda" | "vulkan"
        ) {
            return Err(invalid("Invalid engine backend preference."));
        }
        Ok(protocol::EngineConfig {
            semantic_enabled: self.semantic_enabled,
            preferred_backend: self.preferred_backend.clone(),
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EngineSearchStatus {
    pub phase: &'static str,
    pub generation: u64,
    pub indexed_items: u64,
    pub pending_items: u64,
    pub message: String,
    pub updated_at_ms: u64,
}

pub(super) fn map_status(status: &protocol::EngineStatus, generation: u64) -> EngineSearchStatus {
    let phase = match status.state {
        protocol::EngineRunState::Idle => "ready",
        protocol::EngineRunState::Indexing => "indexing",
        protocol::EngineRunState::Paused => "paused",
        protocol::EngineRunState::Error => "degraded",
    };
    EngineSearchStatus {
        phase,
        generation,
        indexed_items: status.files_indexed,
        pending_items: status.queue_depth,
        message: format!(
            "{}; {}",
            status.current_activity,
            if status.model_loaded {
                "Semantic model loaded"
            } else {
                "Semantic model is not loaded; exact search remains available"
            }
        ),
        updated_at_ms: crate::improvement::types::now_ms(),
    }
}

#[cfg(test)]
#[path = "engine_adapter_tests.rs"]
mod tests;
