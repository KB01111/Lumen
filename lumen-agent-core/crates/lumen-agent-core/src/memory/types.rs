use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    future::Future,
    pin::Pin,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;

pub const NATIVE_PROVIDER: &str = "lumen.native";
pub const BEACON_PROVIDER: &str = "beacon.local";
pub const MAX_RECORD_BYTES: usize = 16_384;
pub(crate) const MAX_PROVIDER_RECORDS: usize = 20;
pub(crate) const PROVIDER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

#[derive(Clone, Copy, Debug, thiserror::Error, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryError {
    #[error("Invalid memory request or provider response.")]
    Invalid,
    #[error("Memory storage is unavailable.")]
    Storage,
    #[error("Memory provider is disabled or unavailable.")]
    Unavailable,
    #[error("Memory requires fresh explicit approval.")]
    ApprovalRequired,
    #[error("Memory retrieval was cancelled.")]
    Cancelled,
    #[error("This memory interface permits local consumption only.")]
    CloudDenied,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryScope {
    pub project_id: String,
    pub session_id: Option<String>,
}
impl MemoryScope {
    pub(crate) fn validate(&self) -> Result<(), MemoryError> {
        if !safe_id(&self.project_id) || self.session_id.as_ref().is_some_and(|id| !safe_id(id)) {
            return Err(MemoryError::Invalid);
        }
        Ok(())
    }
    pub(crate) fn key(&self) -> Result<String, MemoryError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|_| MemoryError::Invalid)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    pub source: String,
    pub revision: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryRecord {
    pub source_id: String,
    pub scope: MemoryScope,
    pub content: String,
    pub provenance: Provenance,
}
impl MemoryRecord {
    pub(crate) fn validate(&self) -> Result<(), MemoryError> {
        self.scope.validate()?;
        if !safe_id(&self.source_id)
            || !bounded_text(&self.content, MAX_RECORD_BYTES)
            || !bounded_text(&self.provenance.source, 256)
            || !bounded_text(&self.provenance.revision, 256)
        {
            return Err(MemoryError::Invalid);
        }
        Ok(())
    }
    pub(crate) fn hash(&self, provider: &str) -> Result<String, MemoryError> {
        self.validate()?;
        let bytes = serde_json::to_vec(&(provider, self)).map_err(|_| MemoryError::Invalid)?;
        Ok(Sha256::digest(bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum RetentionPolicy {
    Days { days: u16 },
    UntilDeleted,
}
impl RetentionPolicy {
    pub(crate) fn expiry(&self, now: u64) -> Result<Option<u64>, MemoryError> {
        match self {
            Self::Days { days: 1..=365 } => {
                let Self::Days { days } = self else {
                    unreachable!()
                };
                Ok(Some(now + u64::from(*days) * 86_400_000))
            }
            Self::UntilDeleted => Ok(None),
            _ => Err(MemoryError::Invalid),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReview {
    pub review_id: String,
    pub provider_id: String,
    pub record: MemoryRecord,
    pub content_hash: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryApproval {
    pub id: String,
    pub content_hash: String,
    pub approved_at: u64,
    pub expires_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApprovedMemory {
    pub provider_id: String,
    pub record: MemoryRecord,
    pub approval: MemoryApproval,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderState {
    Enabled,
    Disabled,
    Unavailable,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderStatus {
    pub id: String,
    pub state: ProviderState,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryQuery {
    pub text: String,
    pub limit: usize,
}
impl MemoryQuery {
    pub(crate) fn validate(&self) -> Result<(), MemoryError> {
        if self.text.len() > 512
            || self.text.chars().any(char::is_control)
            || !(1..=20).contains(&self.limit)
        {
            return Err(MemoryError::Invalid);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryRequest {
    pub version: u32,
    pub query: MemoryQuery,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryRetrieval {
    pub version: u32,
    pub memories: Vec<ApprovedMemory>,
    pub unavailable: Vec<ProviderStatus>,
}

#[derive(Clone, Copy, Debug)]
pub enum MemoryRoute {
    Local,
    Cloud,
}

/// Constructed by Rust from approved references, never from worker-supplied IDs.
pub struct ProviderRequest {
    pub scope: MemoryScope,
    pub source_ids: Vec<String>,
}
pub type ProviderFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Vec<MemoryRecord>, MemoryError>> + Send + 'a>>;
/// Providers only read. Lumen owns approval, retention and deletion of its own records.
pub trait MemoryProvider: Send + Sync {
    fn id(&self) -> &str;
    fn retrieve(&self, request: ProviderRequest, cancel: CancellationToken) -> ProviderFuture<'_>;
}

pub(crate) fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.:".contains(&b))
}
fn bounded_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty()
        && value.len() <= max
        && !value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
}
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
