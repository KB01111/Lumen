use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};

use crate::search::{FileKind, IndexRuntime};

const TOOL_IDS: [&str; 3] = ["files.search", "files.metadata", "files.open"];

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolAccess {
    Ask,
    Allow,
    Deny,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPermission {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub access: ToolAccess,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServiceDescriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub status: &'static str,
    pub tools: &'static [&'static str],
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRegistrySnapshot {
    pub services: Vec<McpServiceDescriptor>,
    pub permissions: Vec<ToolPermission>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInvocation {
    pub tool_id: String,
    pub arguments: Value,
    pub approval_token: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInvocationResult {
    pub status: &'static str,
    pub approval_token: Option<String>,
    pub message: String,
    pub result: Option<Value>,
}

#[derive(Debug)]
struct PendingApproval {
    digest: String,
    expires: Instant,
}

pub struct Authorization {
    pub approved: bool,
    pub approval_token: Option<String>,
}

pub struct McpRuntime {
    path: Option<PathBuf>,
    permissions: Mutex<HashMap<String, ToolAccess>>,
    pending: Mutex<HashMap<String, PendingApproval>>,
}

fn default_permissions() -> HashMap<String, ToolAccess> {
    HashMap::from([
        ("files.search".to_owned(), ToolAccess::Allow),
        ("files.metadata".to_owned(), ToolAccess::Allow),
        ("files.open".to_owned(), ToolAccess::Ask),
    ])
}

fn permission_details(id: &str) -> Option<(&'static str, &'static str)> {
    match id {
        "files.search" => Some((
            "Search indexed files",
            "Search file names in the confined local index.",
        )),
        "files.metadata" => Some((
            "Read file metadata",
            "Read bounded metadata for a selected indexed file.",
        )),
        "files.open" => Some((
            "Open files",
            "Open a selected indexed file with its Windows default app.",
        )),
        _ => None,
    }
}

impl McpRuntime {
    pub fn load(path: PathBuf) -> Self {
        let permissions = fs::read_to_string(&path)
            .ok()
            .and_then(|contents| {
                serde_json::from_str::<HashMap<String, ToolAccess>>(&contents).ok()
            })
            .filter(|values| {
                values.len() == TOOL_IDS.len() && TOOL_IDS.iter().all(|id| values.contains_key(*id))
            })
            .unwrap_or_else(default_permissions);
        Self {
            path: Some(path),
            permissions: Mutex::new(permissions),
            pending: Mutex::new(HashMap::new()),
        }
    }

    #[cfg(test)]
    fn in_memory() -> Self {
        Self {
            path: None,
            permissions: Mutex::new(default_permissions()),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn snapshot(&self) -> McpRegistrySnapshot {
        let permissions = self
            .permissions
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        McpRegistrySnapshot {
            services: vec![McpServiceDescriptor {
                id: "lumen-local",
                name: "Lumen local tools",
                status: "connected",
                tools: &TOOL_IDS,
            }],
            permissions: TOOL_IDS
                .iter()
                .filter_map(|id| {
                    let (label, description) = permission_details(id)?;
                    Some(ToolPermission {
                        id,
                        label,
                        description,
                        access: *permissions.get(*id)?,
                    })
                })
                .collect(),
        }
    }

    pub fn set_permission(
        &self,
        tool_id: &str,
        access: ToolAccess,
    ) -> Result<ToolPermission, String> {
        let (label, description) =
            permission_details(tool_id).ok_or_else(|| "Unknown Lumen tool.".to_owned())?;
        let mut candidate = self
            .permissions
            .lock()
            .map_err(|_| "MCP permissions are unavailable.".to_owned())?
            .clone();
        candidate.insert(tool_id.to_owned(), access);
        if let Some(path) = &self.path {
            fs::write(
                path,
                serde_json::to_vec_pretty(&candidate)
                    .map_err(|_| "MCP permissions could not be saved.".to_owned())?,
            )
            .map_err(|_| "MCP permissions could not be saved.".to_owned())?;
        }
        *self
            .permissions
            .lock()
            .map_err(|_| "MCP permissions are unavailable.".to_owned())? = candidate;
        Ok(ToolPermission {
            id: TOOL_IDS
                .iter()
                .find(|id| **id == tool_id)
                .copied()
                .unwrap_or(""),
            label,
            description,
            access,
        })
    }

    pub fn authorize(
        &self,
        tool_id: &str,
        arguments: &Value,
        approval_token: Option<&str>,
    ) -> Result<Authorization, String> {
        permission_details(tool_id).ok_or_else(|| "Unknown Lumen tool.".to_owned())?;
        let access = self
            .permissions
            .lock()
            .map_err(|_| "MCP permissions are unavailable.".to_owned())?
            .get(tool_id)
            .copied()
            .ok_or_else(|| "Unknown Lumen tool.".to_owned())?;
        match access {
            ToolAccess::Allow => Ok(Authorization {
                approved: true,
                approval_token: None,
            }),
            ToolAccess::Deny => Err("This Lumen tool is denied by device policy.".to_owned()),
            ToolAccess::Ask => {
                let digest = invocation_digest(tool_id, arguments)?;
                let mut pending = self
                    .pending
                    .lock()
                    .map_err(|_| "MCP approval state is unavailable.".to_owned())?;
                pending.retain(|_, value| value.expires > Instant::now());
                if let Some(token) = approval_token {
                    let approval = pending
                        .remove(token)
                        .ok_or_else(|| "The one-time approval is invalid or expired.".to_owned())?;
                    if approval.digest != digest {
                        return Err(
                            "The one-time approval does not match this tool call.".to_owned()
                        );
                    }
                    return Ok(Authorization {
                        approved: true,
                        approval_token: None,
                    });
                }
                if pending.len() >= 64 {
                    return Err("Too many tool approvals are pending.".to_owned());
                }
                let token = uuid::Uuid::new_v4().simple().to_string();
                pending.insert(
                    token.clone(),
                    PendingApproval {
                        digest,
                        expires: Instant::now() + Duration::from_secs(60),
                    },
                );
                Ok(Authorization {
                    approved: false,
                    approval_token: Some(token),
                })
            }
        }
    }
}

fn invocation_digest(tool_id: &str, arguments: &Value) -> Result<String, String> {
    let encoded =
        serde_json::to_vec(arguments).map_err(|_| "Tool arguments are invalid.".to_owned())?;
    let mut digest = Sha256::new();
    digest.update(tool_id.as_bytes());
    digest.update([0]);
    digest.update(encoded);
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SearchArguments {
    query: String,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    10
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct FileArguments {
    file_id: String,
}

fn validate_file_id(value: &str) -> Result<(), String> {
    if value.len() != 72
        || !value.starts_with("indexed:")
        || !value[8..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("The indexed file identifier is invalid.".to_owned());
    }
    Ok(())
}

fn validate_tool_arguments(tool_id: &str, arguments: &Value) -> Result<(), String> {
    match tool_id {
        "files.search" => {
            let arguments: SearchArguments = serde_json::from_value(arguments.clone())
                .map_err(|_| "files.search arguments are invalid.".to_owned())?;
            let query = arguments.query.trim();
            if query.is_empty() || query.chars().count() > 256 || arguments.limit > 20 {
                return Err("The file search arguments are outside allowed limits.".to_owned());
            }
            Ok(())
        }
        "files.metadata" | "files.open" => {
            let arguments: FileArguments = serde_json::from_value(arguments.clone())
                .map_err(|_| format!("{tool_id} arguments are invalid."))?;
            validate_file_id(&arguments.file_id)
        }
        _ => Err("Unknown Lumen tool.".to_owned()),
    }
}

fn kind_label(kind: FileKind) -> &'static str {
    match kind {
        FileKind::Folder => "folder",
        FileKind::Pdf => "pdf",
        FileKind::Document => "document",
        FileKind::Spreadsheet => "spreadsheet",
        FileKind::Presentation => "presentation",
        FileKind::Source => "source",
        FileKind::Image => "image",
        FileKind::Video => "video",
        FileKind::Audio => "audio",
        FileKind::Archive => "archive",
        FileKind::Executable => "executable",
        FileKind::Model => "model",
        FileKind::Unknown => "unknown",
    }
}

fn execute_index_tool(
    index: &IndexRuntime,
    tool_id: &str,
    arguments: Value,
) -> Result<Value, String> {
    match tool_id {
        "files.search" => {
            let arguments: SearchArguments = serde_json::from_value(arguments)
                .map_err(|_| "files.search arguments are invalid.".to_owned())?;
            let query = arguments.query.trim();
            if query.is_empty() || query.chars().count() > 256 {
                return Err("The file search query must contain 1 to 256 characters.".to_owned());
            }
            let hits = index
                .answer_context(query, arguments.limit.min(20))
                .map_err(|_| "The local file index could not be searched.".to_owned())?;
            Ok(Value::Array(
                hits.into_iter()
                    .map(|hit| {
                        serde_json::json!({
                            "fileId": hit.stable_id,
                            "name": hit.name,
                            "kind": hit.extraction_kind,
                        })
                    })
                    .collect(),
            ))
        }
        "files.metadata" => {
            let arguments: FileArguments = serde_json::from_value(arguments)
                .map_err(|_| "files.metadata arguments are invalid.".to_owned())?;
            validate_file_id(&arguments.file_id)?;
            let record = crate::search::indexed_file_metadata(index, &arguments.file_id)
                .map_err(|_| "The indexed file metadata is unavailable.".to_owned())?;
            Ok(serde_json::json!({
                "fileId": arguments.file_id,
                "name": record.name,
                "kind": kind_label(record.kind),
                "extension": record.extension,
                "sizeBytes": record.size_bytes,
                "modifiedMs": record.modified_ms,
            }))
        }
        _ => Err("Unknown index tool.".to_owned()),
    }
}

fn execute_tool(
    app: &AppHandle,
    index: &IndexRuntime,
    tool_id: &str,
    arguments: Value,
) -> Result<Value, String> {
    match tool_id {
        "files.search" | "files.metadata" => execute_index_tool(index, tool_id, arguments),
        "files.open" => {
            let arguments: FileArguments = serde_json::from_value(arguments)
                .map_err(|_| "files.open arguments are invalid.".to_owned())?;
            validate_file_id(&arguments.file_id)?;
            crate::search::open_indexed_file(app, index, &arguments.file_id)
                .map_err(|_| "The indexed file could not be opened.".to_owned())?;
            Ok(serde_json::json!({"opened": true}))
        }
        _ => Err("Unknown Lumen tool.".to_owned()),
    }
}

#[tauri::command]
pub fn list_mcp_services(runtime: State<'_, McpRuntime>) -> McpRegistrySnapshot {
    runtime.snapshot()
}

#[tauri::command]
pub fn set_tool_permission(
    runtime: State<'_, McpRuntime>,
    tool_id: String,
    access: ToolAccess,
) -> Result<ToolPermission, String> {
    runtime.set_permission(&tool_id, access)
}

#[tauri::command]
pub fn invoke_lumen_tool(
    app: AppHandle,
    runtime: State<'_, McpRuntime>,
    index: State<'_, IndexRuntime>,
    invocation: ToolInvocation,
) -> Result<ToolInvocationResult, String> {
    validate_tool_arguments(&invocation.tool_id, &invocation.arguments)?;
    let authorization = runtime.authorize(
        &invocation.tool_id,
        &invocation.arguments,
        invocation.approval_token.as_deref(),
    )?;
    if !authorization.approved {
        return Ok(ToolInvocationResult {
            status: "approvalRequired",
            approval_token: authorization.approval_token,
            message: "This tool requires one-time approval.".to_owned(),
            result: None,
        });
    }
    Ok(ToolInvocationResult {
        status: "completed",
        approval_token: None,
        message: "Tool completed.".to_owned(),
        result: Some(execute_tool(
            &app,
            &index,
            &invocation.tool_id,
            invocation.arguments,
        )?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::{indexing::IndexRootRequest, test_support::SearchFixture};
    use std::path::Path;

    #[test]
    fn permissions_fail_closed_and_ask_requires_one_time_approval() {
        let runtime = McpRuntime::in_memory();
        assert!(
            runtime
                .authorize("unknown", &serde_json::json!({}), None)
                .is_err()
        );
        runtime
            .set_permission("files.search", ToolAccess::Deny)
            .unwrap();
        assert!(
            runtime
                .authorize(
                    "files.search",
                    &serde_json::json!({"query": "report"}),
                    None
                )
                .is_err()
        );
        runtime
            .set_permission("files.search", ToolAccess::Ask)
            .unwrap();
        let pending = runtime
            .authorize(
                "files.search",
                &serde_json::json!({"query": "report"}),
                None,
            )
            .unwrap();
        let token = pending.approval_token.expect("ask must issue a token");
        let approved = runtime
            .authorize(
                "files.search",
                &serde_json::json!({"query": "report"}),
                Some(&token),
            )
            .unwrap();
        assert!(approved.approved);
        assert!(
            runtime
                .authorize(
                    "files.search",
                    &serde_json::json!({"query": "report"}),
                    Some(&token)
                )
                .is_err()
        );
    }

    #[test]
    fn file_tools_accept_only_stable_ids_and_reject_path_arguments() {
        assert!(validate_file_id(&format!("indexed:{}", "a".repeat(64))).is_ok());
        assert!(validate_file_id("C:\\private\\report.txt").is_err());
        assert!(
            serde_json::from_value::<FileArguments>(serde_json::json!({
                "fileId": format!("indexed:{}", "a".repeat(64)),
                "path": "C:\\private\\report.txt"
            }))
            .is_err()
        );
        assert!(
            validate_tool_arguments(
                "files.search",
                &serde_json::json!({"query": "report", "path": "C:\\private"}),
            )
            .is_err()
        );
        assert!(
            validate_tool_arguments("files.search", &serde_json::json!({"query": ""})).is_err()
        );
    }

    #[test]
    fn allowed_search_and_metadata_execute_inside_the_index() {
        let fixture = SearchFixture::new("mcp-tools");
        fixture.file("report.txt", b"quarterly report");
        let database_path = fixture.root().join("index.sqlite");
        let extension = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/vector.dll");
        let index = IndexRuntime::open(&database_path, &extension, false).unwrap();
        index
            .synchronize_for_test(vec![IndexRootRequest {
                path: fixture.root().to_string_lossy().into_owned(),
                cloud_enrichment: false,
                exclusions: Vec::new(),
                include_hidden: false,
                max_file_size_mb: 256,
            }])
            .unwrap();

        let search = execute_index_tool(
            &index,
            "files.search",
            serde_json::json!({"query": "report", "limit": 3}),
        )
        .unwrap();
        let file_id = search[0]["fileId"].as_str().unwrap();
        let metadata = execute_index_tool(
            &index,
            "files.metadata",
            serde_json::json!({"fileId": file_id}),
        )
        .unwrap();
        assert_eq!(metadata["name"], "report.txt");
        assert!(metadata.get("path").is_none());
    }
}
