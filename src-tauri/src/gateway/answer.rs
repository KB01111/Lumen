use std::{collections::HashMap, sync::Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{State, ipc::Channel};
use tokio_util::sync::CancellationToken;

use crate::search::IndexRuntime;

use super::{GatewaySupervisor, LocalRuntimeSupervisor, credentials};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRequest {
    request_id: u64,
    query: String,
    mode: RuntimeMode,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum RuntimeMode {
    Auto,
    Local,
    Cloud,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    file_id: String,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp_seconds: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    input_tokens: u64,
    output_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    remaining_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reset_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AnswerEvent {
    Started {
        provider: String,
        model: String,
        route: String,
    },
    Citation {
        citation: Citation,
    },
    Delta {
        text: String,
    },
    Usage {
        usage: Usage,
    },
    Completed {
        provider: String,
        model: String,
        route: String,
    },
    Cancelled,
    Failed {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
}

#[derive(Default)]
pub struct AnswerRuntime {
    active: Mutex<HashMap<u64, CancellationToken>>,
}

impl AnswerRuntime {
    fn begin(&self, request_id: u64) -> CancellationToken {
        let token = CancellationToken::new();
        let previous = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .insert(request_id, token.clone());
        if let Some(previous) = previous {
            previous.cancel();
        }
        token
    }

    fn cancel(&self, request_id: u64) {
        if let Some(token) = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&request_id)
        {
            token.cancel();
        }
    }
}

#[derive(Debug)]
struct RouteAttempt {
    alias: &'static str,
    provider: &'static str,
    model: &'static str,
}

fn routes(mode: RuntimeMode) -> Vec<RouteAttempt> {
    let local = || RouteAttempt {
        alias: "lumen.answer.local",
        provider: "local-openai-compatible",
        model: "qwen3.5:4b",
    };
    let cloud = || RouteAttempt {
        alias: "lumen.answer.cloud",
        provider: "openai",
        model: "gpt-5-mini",
    };
    match mode {
        RuntimeMode::Local => vec![local()],
        RuntimeMode::Cloud => vec![cloud()],
        RuntimeMode::Auto if credentials::get("openai").is_some() => vec![cloud(), local()],
        RuntimeMode::Auto => vec![local()],
    }
}

fn send(channel: &Channel<AnswerEvent>, event: AnswerEvent) {
    let _ = channel.send(event);
}

fn context_prompt(query: &str, hits: &[crate::search::IndexedHit]) -> String {
    let mut prompt = String::from(
        "Answer the user's question using only the supplied local-file context. Cite sources inline as [1], [2], and say when the context is insufficient.\n\n",
    );
    prompt.push_str("Question: ");
    prompt.push_str(query);
    prompt.push_str("\n\nContext:\n");
    for (index, hit) in hits.iter().enumerate() {
        use std::fmt::Write;
        let _ = writeln!(
            prompt,
            "[{}] {}{}\n{}",
            index + 1,
            hit.name,
            hit.page
                .map(|page| format!(" (page {page})"))
                .unwrap_or_default(),
            hit.snippet.chars().take(6_000).collect::<String>()
        );
    }
    prompt
}

async fn stream_attempt(
    supervisor: &GatewaySupervisor,
    route: &RouteAttempt,
    prompt: &str,
    channel: &Channel<AnswerEvent>,
    cancellation: &CancellationToken,
) -> Result<(), String> {
    let (base_url, bearer) = supervisor.endpoint(false);
    send(
        channel,
        AnswerEvent::Started {
            provider: route.provider.to_owned(),
            model: route.model.to_owned(),
            route: route.alias.to_owned(),
        },
    );
    let response = reqwest::Client::new()
        .post(format!("{base_url}/v1/responses"))
        .bearer_auth(bearer)
        .header("x-lumen-lane", "interactive")
        .json(&serde_json::json!({
            "model": route.alias,
            "input": prompt,
            "stream": true,
            "max_output_tokens": 1200
        }))
        .send()
        .await
        .map_err(|error| format!("Gateway connection failed: {error}"))?;
    let status = response.status();
    let remaining_tokens = response
        .headers()
        .get("x-ratelimit-remaining-tokens")
        .or_else(|| response.headers().get("ratelimit-remaining"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    let reset_at = response
        .headers()
        .get("x-ratelimit-reset-tokens")
        .or_else(|| response.headers().get("ratelimit-reset"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let code = if status.as_u16() == 429 {
            "rate_limited"
        } else {
            "provider_error"
        };
        return Err(format!(
            "{code}: HTTP {} {}",
            status.as_u16(),
            body.chars().take(240).collect::<String>()
        ));
    }

    let mut bytes = response.bytes_stream();
    let mut pending = String::new();
    let mut usage = None;
    loop {
        let next = tokio::select! {
            () = cancellation.cancelled() => return Err("cancelled".to_owned()),
            next = bytes.next() => next,
        };
        let Some(chunk) = next else { break };
        pending.push_str(&String::from_utf8_lossy(
            &chunk.map_err(|error| error.to_string())?,
        ));
        while let Some(boundary) = pending.find("\n\n") {
            let frame = pending[..boundary].to_owned();
            pending.drain(..boundary + 2);
            for line in frame.lines().filter_map(|line| line.strip_prefix("data: ")) {
                if line == "[DONE]" {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                match value.get("type").and_then(|value| value.as_str()) {
                    Some("response.output_text.delta") => {
                        if let Some(delta) = value.get("delta").and_then(|value| value.as_str()) {
                            send(
                                channel,
                                AnswerEvent::Delta {
                                    text: delta.to_owned(),
                                },
                            );
                        }
                    }
                    Some("response.completed") => {
                        let values = &value["response"]["usage"];
                        usage = Some(Usage {
                            input_tokens: values["input_tokens"].as_u64().unwrap_or(0),
                            output_tokens: values["output_tokens"].as_u64().unwrap_or(0),
                            remaining_tokens,
                            reset_at: reset_at.clone(),
                        });
                    }
                    Some("error") | Some("response.failed") => {
                        return Err(value["error"]["message"]
                            .as_str()
                            .unwrap_or("Provider failed")
                            .to_owned());
                    }
                    _ => {}
                }
            }
        }
    }
    if let Some(usage) = usage {
        send(channel, AnswerEvent::Usage { usage });
    }
    send(
        channel,
        AnswerEvent::Completed {
            provider: route.provider.to_owned(),
            model: route.model.to_owned(),
            route: route.alias.to_owned(),
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn start_answer(
    request: AnswerRequest,
    on_event: Channel<AnswerEvent>,
    runtime: State<'_, AnswerRuntime>,
    supervisor: State<'_, GatewaySupervisor>,
    local_runtime: State<'_, LocalRuntimeSupervisor>,
    index: State<'_, IndexRuntime>,
) -> Result<(), String> {
    let cancellation = runtime.begin(request.request_id);
    let hits = index.answer_context(&request.query, 6).unwrap_or_default();
    for hit in &hits {
        send(
            &on_event,
            AnswerEvent::Citation {
                citation: Citation {
                    file_id: hit.stable_id.clone(),
                    label: hit.name.clone(),
                    page: hit.page,
                    timestamp_seconds: hit.time_start_ms.map(|value| value as f64 / 1000.0),
                },
            },
        );
    }
    let prompt = context_prompt(&request.query, &hits);
    let attempts = routes(request.mode);
    let mut last_error = "No answer route is configured".to_owned();
    for (position, route) in attempts.iter().enumerate() {
        if route.alias == "lumen.answer.local"
            && let Err(error) = local_runtime.start()
        {
            last_error = format!("local_runtime_unavailable: {error}");
            if position + 1 < attempts.len() {
                continue;
            }
            break;
        }
        match stream_attempt(supervisor.inner(), route, &prompt, &on_event, &cancellation).await {
            Ok(()) => {
                runtime.cancel(request.request_id);
                return Ok(());
            }
            Err(error) if error == "cancelled" => {
                send(&on_event, AnswerEvent::Cancelled);
                runtime.cancel(request.request_id);
                return Ok(());
            }
            Err(error) => {
                last_error = error;
                if position + 1 < attempts.len() {
                    continue;
                }
            }
        }
    }
    let code = if last_error.starts_with("rate_limited:") {
        Some("rate_limited".to_owned())
    } else {
        Some("provider_error".to_owned())
    };
    send(
        &on_event,
        AnswerEvent::Failed {
            message: last_error,
            code,
        },
    );
    runtime.cancel(request.request_id);
    Ok(())
}

#[tauri::command]
pub fn cancel_answer(request_id: u64, runtime: State<'_, AnswerRuntime>) {
    runtime.cancel(request_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_mode_never_has_cloud_fallback() {
        let selected = routes(RuntimeMode::Local);
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].alias, "lumen.answer.local");
    }

    #[test]
    fn cloud_mode_never_has_local_fallback() {
        let selected = routes(RuntimeMode::Cloud);
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].alias, "lumen.answer.cloud");
    }
}
