use super::types::*;
use reqwest::{Client, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// Connects only to an already-running user-configured loopback server.
/// Never installs Beacon, starts a process, reads its database or changes capture/forwarding.
pub struct BeaconMemoryProvider {
    client: Client,
    endpoint: String,
}
impl BeaconMemoryProvider {
    pub fn loopback(port: u16) -> Result<Self, MemoryError> {
        if port == 0 {
            return Err(MemoryError::Invalid);
        }
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(PROVIDER_TIMEOUT)
            .build()
            .map_err(|_| MemoryError::Unavailable)?;
        Ok(Self {
            client,
            endpoint: format!("http://127.0.0.1:{port}/mcp"),
        })
    }
    async fn rpc(&self, id: u32, method: &str, params: Value) -> Result<Value, MemoryError> {
        let mut response = self
            .client
            .post(&self.endpoint)
            .json(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .send()
            .await
            .map_err(|_| MemoryError::Unavailable)?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(MemoryError::Unavailable);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| MemoryError::Unavailable)?
        {
            if bytes.len() + chunk.len() > 65_536 {
                return Err(MemoryError::Invalid);
            }
            bytes.extend_from_slice(&chunk);
        }
        let response: RpcResponse =
            serde_json::from_slice(&bytes).map_err(|_| MemoryError::Invalid)?;
        if response.jsonrpc != "2.0" || response.id != id {
            return Err(MemoryError::Invalid);
        }
        Ok(response.result)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RpcResponse {
    jsonrpc: String,
    id: u32,
    result: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ToolResult {
    content: Vec<TextContent>,
    #[serde(default)]
    is_error: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TextContent {
    r#type: String,
    text: String,
}
// Pinned Beacon learning.v1 wire contract; unknown fields require adapter review.
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct BeaconRecord {
    schema_version: String,
    id: String,
    candidate_id: String,
    kind: String,
    title: String,
    body: String,
    project: BeaconProject,
    evidence: Vec<Value>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    applicability: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    superseded_by: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct BeaconProject {
    id: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    remote_url: String,
    #[serde(default)]
    branch: String,
}
impl MemoryProvider for BeaconMemoryProvider {
    fn id(&self) -> &str {
        BEACON_PROVIDER
    }
    fn retrieve(&self, request: ProviderRequest, cancel: CancellationToken) -> ProviderFuture<'_> {
        Box::pin(async move {
            request.scope.validate()?;
            // Beacon memory is project-scoped; never relabel it as session-only memory.
            if request.scope.session_id.is_some()
                || request.source_ids.len() > MAX_PROVIDER_RECORDS
                || request.source_ids.iter().any(|id| !safe_id(id))
            {
                return Err(MemoryError::Invalid);
            }
            let operation = async {
                let initialized = self.rpc(1, "initialize", json!({"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"lumen-memory-core","version":"0.1.0"}})).await?;
                if initialized["protocolVersion"] != "2024-11-05"
                    || initialized["serverInfo"]["name"] != "beacon"
                {
                    return Err(MemoryError::Invalid);
                }
                let notification = self
                    .client
                    .post(&self.endpoint)
                    .json(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
                    .send()
                    .await
                    .map_err(|_| MemoryError::Unavailable)?;
                if !notification.status().is_success() {
                    return Err(MemoryError::Unavailable);
                }
                let mut records = Vec::new();
                for (index, id) in request.source_ids.into_iter().enumerate() {
                    let value = self
                        .rpc(
                            index as u32 + 2,
                            "tools/call",
                            json!({"name":"get_memory","arguments":{"id":id}}),
                        )
                        .await?;
                    let result: ToolResult =
                        serde_json::from_value(value).map_err(|_| MemoryError::Invalid)?;
                    if result.content.len() != 1 || result.content[0].r#type != "text" {
                        return Err(MemoryError::Unavailable);
                    }
                    if result.is_error {
                        // Only the pinned get_memory missing-ID response is a skipped record.
                        if result.content[0].text == format!("memory not found: {id}") {
                            continue;
                        }
                        return Err(MemoryError::Unavailable);
                    }
                    let memory: BeaconRecord = serde_json::from_str(&result.content[0].text)
                        .map_err(|_| MemoryError::Invalid)?;
                    if memory.schema_version != "beacon.learning.v1"
                        || memory.id != id
                        || memory.project.id != request.scope.project_id
                        || !memory.superseded_by.is_empty()
                        || memory.tags.len() > 32
                        || memory.tags.iter().any(|tag| tag.len() > 128)
                    {
                        return Err(MemoryError::Invalid);
                    }
                    let canonical =
                        serde_json::to_vec(&memory).map_err(|_| MemoryError::Invalid)?;
                    let revision = Sha256::digest(canonical)
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect();
                    let record = MemoryRecord {
                        source_id: id.clone(),
                        scope: request.scope.clone(),
                        content: format!(
                            "{}\n{}\n{}",
                            memory.title, memory.body, memory.applicability
                        ),
                        provenance: Provenance {
                            source: format!("beacon.memory:{id}"),
                            revision,
                        },
                    };
                    record.validate()?;
                    records.push(record);
                }
                Ok(records)
            };
            tokio::select! { biased; _ = cancel.cancelled() => Err(MemoryError::Cancelled), result = operation => result }
        })
    }
}
