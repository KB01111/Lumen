use lumen_agent_core::memory::*;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tokio_util::sync::CancellationToken;

async fn server(
    project: &str,
    redirect: Option<u16>,
) -> (u16, Arc<Mutex<Vec<Value>>>, tokio::task::JoinHandle<()>) {
    server_with_tool_error(project, redirect, Arc::new(Mutex::new(None))).await
}
async fn server_with_tool_error(
    project: &str,
    redirect: Option<u16>,
    tool_error: Arc<Mutex<Option<Value>>>,
) -> (u16, Arc<Mutex<Vec<Value>>>, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let project = project.to_string();
    let job = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let body = loop {
                let mut chunk = [0; 2048];
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
                assert!(bytes.len() < 65_536);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]).to_ascii_lowercase();
                    let len: usize = header
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length:").map(str::trim))
                        .unwrap()
                        .parse()
                        .unwrap();
                    if bytes.len() >= end + 4 + len {
                        break bytes[end + 4..end + 4 + len].to_vec();
                    }
                }
            };
            let request: Value = serde_json::from_slice(&body).unwrap();
            captured.lock().unwrap().push(request.clone());
            if let Some(target) = redirect {
                stream.write_all(format!("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{target}/mcp\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
                continue;
            }
            let response = match request["method"].as_str().unwrap() {
                "initialize" => {
                    json!({"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"beacon","version":"fixture"}})
                }
                "notifications/initialized" => {
                    stream.write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
                    continue;
                }
                "tools/call" => {
                    assert_eq!(request["params"]["name"], "get_memory");
                    if let Some(error) = tool_error.lock().unwrap().clone() {
                        error
                    } else if request["params"]["arguments"]["id"] == "missing" {
                        json!({"isError":true,"content":[{"type":"text","text":"memory not found: missing"}]})
                    } else {
                        assert_eq!(request["params"]["arguments"], json!({"id":"memory-1"}));
                        let memory = json!({"schema_version":"beacon.learning.v1","id":"memory-1","candidate_id":"candidate-1","kind":"convention","title":"Tools","body":"Use approved file tools.","project":{"id":project},"evidence":[{"trace_id":"trace-1"}],"created_at":"2026-10-20","updated_at":"2026-10-20"});
                        json!({"content":[{"type":"text","text":memory.to_string()}]})
                    }
                }
                method => panic!("Unexpected MCP method {method}"),
            };
            let body = json!({"jsonrpc":"2.0","id":request["id"],"result":response}).to_string();
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(header.as_bytes()).await.unwrap();
            stream.write_all(body.as_bytes()).await.unwrap();
        }
    });
    (port, calls, job)
}
fn scope() -> MemoryScope {
    MemoryScope {
        project_id: "lumen".into(),
        session_id: None,
    }
}

#[tokio::test]
async fn beacon_tool_failures_are_reported_unavailable() {
    let tool_error = Arc::new(Mutex::new(None));
    let (port, _, server) = server_with_tool_error("lumen", None, tool_error.clone()).await;
    let mut core = MemoryCore::in_memory().unwrap();
    core.register_provider(Arc::new(BeaconMemoryProvider::loopback(port).unwrap()))
        .unwrap();
    core.set_provider_enabled(BEACON_PROVIDER, true).unwrap();
    let review = core
        .review_provider(
            BEACON_PROVIDER,
            scope(),
            "memory-1",
            CancellationToken::new(),
        )
        .await
        .unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .await
        .unwrap();
    let core = Arc::new(core);
    let reader = core
        .bind_reader(scope(), vec![BEACON_PROVIDER.into()], MemoryRoute::Local)
        .unwrap();
    for content in [
        json!([{"type":"text","text":"database unavailable"}]),
        json!([{"type":"text","text":"memory not found: another-id"}]),
        json!([{"type":"image","text":"memory not found: memory-1"}]),
        json!([]),
    ] {
        *tool_error.lock().unwrap() = Some(json!({"isError":true,"content":content}));
        let result = reader
            .retrieve(
                MemoryQuery {
                    text: String::new(),
                    limit: 20,
                },
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(
            result.unavailable,
            vec![ProviderStatus {
                id: BEACON_PROVIDER.into(),
                state: ProviderState::Unavailable
            }]
        );
        assert!(result.memories.is_empty());
    }
    *tool_error.lock().unwrap() = Some(
        json!({"isError":true,"content":[{"type":"text","text":"memory not found: memory-1"}]}),
    );
    let result = reader
        .retrieve(
            MemoryQuery {
                text: String::new(),
                limit: 20,
            },
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert!(result.memories.is_empty());
    assert!(result.unavailable.is_empty());
    server.abort();
}

#[tokio::test]
async fn beacon_missing_record_does_not_hide_later_selected_records() {
    let (port, _, server) = server("lumen", None).await;
    let adapter = BeaconMemoryProvider::loopback(port).unwrap();
    let records = adapter
        .retrieve(
            ProviderRequest {
                scope: scope(),
                source_ids: vec!["missing".into(), "memory-1".into()],
            },
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].source_id, "memory-1");
    server.abort();
}

#[tokio::test]
async fn beacon_is_optional_local_read_only_and_requires_lumen_approval() {
    let (port, calls, server) = server("lumen", None).await;
    let mut core = MemoryCore::in_memory().unwrap();
    core.register_provider(Arc::new(BeaconMemoryProvider::loopback(port).unwrap()))
        .unwrap();
    let core = Arc::new(core);
    let reader = core
        .bind_reader(scope(), vec![BEACON_PROVIDER.into()], MemoryRoute::Local)
        .unwrap();
    let request = br#"{"version":1,"query":{"text":"tools","limit":5}}"#;
    assert!(
        reader
            .handle(request, CancellationToken::new())
            .await
            .unwrap()
            .memories
            .is_empty()
    );
    assert!(calls.lock().unwrap().is_empty());
    core.set_provider_enabled(BEACON_PROVIDER, true).unwrap();
    let review = core
        .review_provider(
            BEACON_PROVIDER,
            scope(),
            "memory-1",
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert!(
        reader
            .handle(request, CancellationToken::new())
            .await
            .unwrap()
            .memories
            .is_empty()
    );
    core.approve(&review.review_id, RetentionPolicy::Days { days: 30 })
        .await
        .unwrap();
    let result = reader
        .handle(request, CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(result.memories.len(), 1);
    assert_eq!(
        result.memories[0].record.provenance.source,
        "beacon.memory:memory-1"
    );
    core.forget(BEACON_PROVIDER, &scope(), "memory-1").unwrap();
    let before = calls.lock().unwrap().len();
    assert!(
        reader
            .handle(request, CancellationToken::new())
            .await
            .unwrap()
            .memories
            .is_empty()
    );
    assert_eq!(calls.lock().unwrap().len(), before);
    server.abort();
}

#[tokio::test]
async fn beacon_rejects_cross_project_responses_and_redirects() {
    assert!(BeaconMemoryProvider::loopback(0).is_err());
    let target = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let target_port = target.local_addr().unwrap().port();
    for (project, redirect) in [("other-project", None), ("lumen", Some(target_port))] {
        let (port, _, server) = server(project, redirect).await;
        let adapter = BeaconMemoryProvider::loopback(port).unwrap();
        assert!(
            adapter
                .retrieve(
                    ProviderRequest {
                        scope: scope(),
                        source_ids: vec!["memory-1".into()]
                    },
                    CancellationToken::new()
                )
                .await
                .is_err()
        );
        server.abort();
    }
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), target.accept())
            .await
            .is_err(),
        "redirect target received a connection"
    );
}
