use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::Duration,
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, ipc::Channel};
use tokio_util::sync::CancellationToken;

use crate::{consent::PersistedConsent, search::IndexRuntime};

use super::{GatewaySupervisor, LocalRuntimeSupervisor, credentials};

const MAX_QUERY_CHARACTERS: usize = 4_000;
const GATEWAY_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const GATEWAY_HEADER_TIMEOUT: Duration = Duration::from_secs(15);
const GATEWAY_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const GATEWAY_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_SSE_FRAME_BYTES: usize = 1_048_576;
const MAX_ERROR_BODY_BYTES: usize = 16_384;
const MAX_PENDING_CANCELLATIONS: usize = 128;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRequest {
    request_id: u64,
    query: String,
    mode: RuntimeMode,
    #[serde(default)]
    cloud_consent: bool,
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

struct ActiveAnswer {
    generation: u64,
    cancellation: CancellationToken,
    cloud_capable: bool,
}

#[derive(Default)]
struct AnswerRuntimeState {
    active: HashMap<u64, ActiveAnswer>,
    pending_cancellations: VecDeque<u64>,
    next_generation: u64,
}

#[derive(Default)]
pub struct AnswerRuntime {
    state: Mutex<AnswerRuntimeState>,
}

impl AnswerRuntime {
    fn begin(&self, request_id: u64, cloud_capable: bool) -> (u64, CancellationToken) {
        let token = CancellationToken::new();
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.next_generation = state.next_generation.wrapping_add(1);
        let generation = state.next_generation;
        let cancelled_before_start = state
            .pending_cancellations
            .iter()
            .position(|pending| *pending == request_id)
            .map(|position| state.pending_cancellations.remove(position).is_some())
            .unwrap_or(false);
        let previous = state.active.insert(
            request_id,
            ActiveAnswer {
                generation,
                cancellation: token.clone(),
                cloud_capable,
            },
        );
        drop(state);
        if let Some(previous) = previous {
            previous.cancellation.cancel();
        }
        if cancelled_before_start {
            token.cancel();
        }
        (generation, token)
    }

    fn cancel(&self, request_id: u64) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(answer) = state.active.remove(&request_id) {
            drop(state);
            answer.cancellation.cancel();
            return;
        }
        if !state.pending_cancellations.contains(&request_id) {
            state.pending_cancellations.push_back(request_id);
            while state.pending_cancellations.len() > MAX_PENDING_CANCELLATIONS {
                state.pending_cancellations.pop_front();
            }
        }
    }

    fn cancel_cloud(&self) -> usize {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let request_ids = state
            .active
            .iter()
            .filter_map(|(request_id, answer)| answer.cloud_capable.then_some(*request_id))
            .collect::<Vec<_>>();
        let cancellation_count = request_ids.len();
        let cancellations = request_ids
            .into_iter()
            .filter_map(|request_id| state.active.remove(&request_id))
            .map(|answer| answer.cancellation)
            .collect::<Vec<_>>();
        drop(state);
        for cancellation in cancellations {
            cancellation.cancel();
        }
        cancellation_count
    }

    fn finish(&self, request_id: u64, generation: u64) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state
            .active
            .get(&request_id)
            .is_some_and(|answer| answer.generation == generation)
        {
            state.active.remove(&request_id);
        }
    }
}

#[derive(Debug)]
struct RouteAttempt {
    alias: &'static str,
    provider: &'static str,
    model: &'static str,
}

#[derive(Debug, PartialEq, Eq)]
struct RouteFailure {
    code: &'static str,
    message: &'static str,
}

fn routes(
    mode: RuntimeMode,
    cloud_consent: bool,
    cloud_credential_configured: bool,
) -> Result<Vec<RouteAttempt>, RouteFailure> {
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
    let selected = match mode {
        RuntimeMode::Local => vec![local()],
        RuntimeMode::Cloud if !cloud_consent => {
            return Err(RouteFailure {
                code: "cloud_consent_required",
                message: "Cloud answers require explicit consent in AgentGateway settings.",
            });
        }
        RuntimeMode::Cloud if !cloud_credential_configured => {
            return Err(RouteFailure {
                code: "cloud_credential_required",
                message: "Cloud answers require a configured provider credential.",
            });
        }
        RuntimeMode::Cloud => vec![cloud()],
        RuntimeMode::Auto if cloud_consent && cloud_credential_configured => {
            vec![cloud(), local()]
        }
        RuntimeMode::Auto => vec![local()],
    };
    Ok(selected)
}

fn send(channel: &Channel<AnswerEvent>, event: AnswerEvent) {
    let _ = channel.send(event);
}

fn normalized_query(query: &str) -> Result<String, RouteFailure> {
    let query = query.trim();
    if query.is_empty() {
        return Err(RouteFailure {
            code: "invalid_query",
            message: "Enter a question before requesting an answer.",
        });
    }
    if query.chars().count() > MAX_QUERY_CHARACTERS {
        return Err(RouteFailure {
            code: "query_too_long",
            message: "Answer questions are limited to 4,000 characters.",
        });
    }
    Ok(query.to_owned())
}

#[derive(Debug)]
struct StreamFailure {
    code: &'static str,
    message: String,
}

impl StreamFailure {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn cancelled() -> Self {
        Self::new("cancelled", "Answer generation was cancelled")
    }
}

fn take_sse_frame(pending: &mut Vec<u8>) -> Option<Vec<u8>> {
    let lf = pending.windows(2).position(|window| window == b"\n\n");
    let crlf = pending.windows(4).position(|window| window == b"\r\n\r\n");
    let (boundary, delimiter_length) = match (lf, crlf) {
        (Some(lf), Some(crlf)) if lf < crlf => (lf, 2),
        (Some(_), Some(crlf)) => (crlf, 4),
        (Some(lf), None) => (lf, 2),
        (None, Some(crlf)) => (crlf, 4),
        (None, None) => return None,
    };
    let frame = pending[..boundary].to_vec();
    pending.drain(..boundary + delimiter_length);
    Some(frame)
}

fn sse_data(frame: &[u8]) -> Result<Option<String>, StreamFailure> {
    if frame.len() > MAX_SSE_FRAME_BYTES {
        return Err(StreamFailure::new(
            "invalid_stream",
            "Gateway returned an oversized streaming event",
        ));
    }
    let frame = std::str::from_utf8(frame)
        .map_err(|_| StreamFailure::new("invalid_stream", "Gateway returned invalid UTF-8"))?;
    let data = frame
        .split('\n')
        .filter_map(|line| {
            let line = line.trim_end_matches('\r');
            line.strip_prefix("data:")
                .map(|value| value.strip_prefix(' ').unwrap_or(value))
        })
        .collect::<Vec<_>>();
    Ok((!data.is_empty()).then(|| data.join("\n")))
}

enum FrameSignal {
    Continue,
    Completed(Usage),
    Done,
}

fn process_sse_frame(
    frame: &[u8],
    channel: &Channel<AnswerEvent>,
    remaining_tokens: Option<u64>,
    reset_at: &Option<String>,
) -> Result<FrameSignal, StreamFailure> {
    let Some(data) = sse_data(frame)? else {
        return Ok(FrameSignal::Continue);
    };
    if data == "[DONE]" {
        return Ok(FrameSignal::Done);
    }
    let value = serde_json::from_str::<serde_json::Value>(&data).map_err(|_| {
        StreamFailure::new(
            "invalid_stream",
            "Gateway returned malformed streaming JSON",
        )
    })?;
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
            Ok(FrameSignal::Continue)
        }
        Some("response.completed") => {
            let values = &value["response"]["usage"];
            Ok(FrameSignal::Completed(Usage {
                input_tokens: values["input_tokens"].as_u64().unwrap_or(0),
                output_tokens: values["output_tokens"].as_u64().unwrap_or(0),
                remaining_tokens,
                reset_at: reset_at.clone(),
            }))
        }
        Some("error") | Some("response.failed") => {
            let message = value["error"]["message"]
                .as_str()
                .or_else(|| value["response"]["error"]["message"].as_str())
                .unwrap_or("Provider failed");
            Err(StreamFailure::new("provider_error", message))
        }
        _ => Ok(FrameSignal::Continue),
    }
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

async fn error_response_excerpt(
    response: reqwest::Response,
    cancellation: &CancellationToken,
) -> Result<String, StreamFailure> {
    let mut bytes = response.bytes_stream();
    let mut body = Vec::with_capacity(MAX_ERROR_BODY_BYTES.min(4_096));
    while body.len() < MAX_ERROR_BODY_BYTES {
        let next = tokio::select! {
            () = cancellation.cancelled() => return Err(StreamFailure::cancelled()),
            next = tokio::time::timeout(GATEWAY_IDLE_TIMEOUT, bytes.next()) => {
                next.map_err(|_| StreamFailure::new("gateway_timeout", "Gateway error response was idle for too long"))?
            },
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|error| {
            StreamFailure::new(
                "invalid_stream",
                format!("Gateway error response failed: {error}"),
            )
        })?;
        let remaining = MAX_ERROR_BODY_BYTES - body.len();
        body.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

async fn stream_attempt(
    supervisor: &GatewaySupervisor,
    route: &RouteAttempt,
    prompt: &str,
    channel: &Channel<AnswerEvent>,
    cancellation: &CancellationToken,
) -> Result<(), StreamFailure> {
    let (base_url, bearer) = supervisor.endpoint(false);
    send(
        channel,
        AnswerEvent::Started {
            provider: route.provider.to_owned(),
            model: route.model.to_owned(),
            route: route.alias.to_owned(),
        },
    );
    let client = reqwest::Client::builder()
        .connect_timeout(GATEWAY_CONNECT_TIMEOUT)
        .timeout(GATEWAY_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| {
            StreamFailure::new(
                "gateway_unavailable",
                format!("Could not configure the gateway client: {error}"),
            )
        })?;
    let request = client
        .post(format!("{base_url}/v1/responses"))
        .bearer_auth(bearer)
        .header("x-lumen-lane", "interactive")
        .json(&serde_json::json!({
            "model": route.alias,
            "input": prompt,
            "stream": true,
            "max_output_tokens": 1200
        }));
    let response = tokio::select! {
        () = cancellation.cancelled() => return Err(StreamFailure::cancelled()),
        response = tokio::time::timeout(GATEWAY_HEADER_TIMEOUT, request.send()) => {
            response
                .map_err(|_| StreamFailure::new("gateway_timeout", "Gateway response headers timed out"))?
                .map_err(|error| StreamFailure::new("gateway_unavailable", format!("Gateway connection failed: {error}")))?
        }
    };
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
        let body = error_response_excerpt(response, cancellation).await?;
        let code = if status.as_u16() == 429 {
            "rate_limited"
        } else {
            "provider_error"
        };
        return Err(StreamFailure::new(
            code,
            format!(
                "HTTP {} {}",
                status.as_u16(),
                body.chars().take(240).collect::<String>()
            ),
        ));
    }

    let mut bytes = response.bytes_stream();
    let mut pending = Vec::new();
    let mut usage = None;
    let mut completed = false;
    'stream: loop {
        let next = tokio::select! {
            () = cancellation.cancelled() => return Err(StreamFailure::cancelled()),
            next = tokio::time::timeout(GATEWAY_IDLE_TIMEOUT, bytes.next()) => {
                next.map_err(|_| StreamFailure::new("gateway_timeout", "Gateway stream was idle for too long"))?
            },
        };
        let Some(chunk) = next else { break };
        pending.extend_from_slice(&chunk.map_err(|error| {
            StreamFailure::new("invalid_stream", format!("Gateway stream failed: {error}"))
        })?);
        while let Some(frame) = take_sse_frame(&mut pending) {
            match process_sse_frame(&frame, channel, remaining_tokens, &reset_at)? {
                FrameSignal::Continue => {}
                FrameSignal::Completed(value) => {
                    usage = Some(value);
                    completed = true;
                    pending.clear();
                    break 'stream;
                }
                FrameSignal::Done => {
                    pending.clear();
                    break 'stream;
                }
            }
        }
        if pending.len() > MAX_SSE_FRAME_BYTES {
            return Err(StreamFailure::new(
                "invalid_stream",
                "Gateway returned an oversized streaming event",
            ));
        }
    }
    if !pending.is_empty() {
        match process_sse_frame(&pending, channel, remaining_tokens, &reset_at)? {
            FrameSignal::Continue => {}
            FrameSignal::Completed(value) => {
                usage = Some(value);
                completed = true;
            }
            FrameSignal::Done => {}
        }
    }
    if !completed {
        return Err(StreamFailure::new(
            "stream_incomplete",
            "Gateway stream ended before a validated completion event",
        ));
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
    app: AppHandle,
    runtime: State<'_, AnswerRuntime>,
    supervisor: State<'_, GatewaySupervisor>,
    index: State<'_, IndexRuntime>,
    consent: State<'_, PersistedConsent>,
) -> Result<(), String> {
    let query = match normalized_query(&request.query) {
        Ok(query) => query,
        Err(error) => {
            send(
                &on_event,
                AnswerEvent::Failed {
                    message: error.message.to_owned(),
                    code: Some(error.code.to_owned()),
                },
            );
            return Ok(());
        }
    };
    let mode = request.mode;
    let cloud_consent = request.cloud_consent && consent.answer_granted();
    let cloud_capable = cloud_consent && matches!(mode, RuntimeMode::Auto | RuntimeMode::Cloud);
    let (generation, cancellation) = runtime.begin(request.request_id, cloud_capable);
    let route_selection = match tauri::async_runtime::spawn_blocking(move || {
        routes(mode, cloud_consent, credentials::get("openai").is_some())
    })
    .await
    {
        Ok(selection) => selection,
        Err(error) => {
            runtime.finish(request.request_id, generation);
            return Err(format!(
                "Could not join the answer-route selection: {error}"
            ));
        }
    };
    if cancellation.is_cancelled() {
        send(&on_event, AnswerEvent::Cancelled);
        runtime.finish(request.request_id, generation);
        return Ok(());
    }
    let attempts = match route_selection {
        Ok(attempts) => attempts,
        Err(error) => {
            send(
                &on_event,
                AnswerEvent::Failed {
                    message: error.message.to_owned(),
                    code: Some(error.code.to_owned()),
                },
            );
            runtime.finish(request.request_id, generation);
            return Ok(());
        }
    };
    let index_runtime = index.inner().clone();
    let context_query = query.clone();
    let hits = match tauri::async_runtime::spawn_blocking(move || {
        index_runtime.answer_context(&context_query, 6)
    })
    .await
    {
        Ok(Ok(hits)) => hits,
        Ok(Err(error)) => {
            send(
                &on_event,
                AnswerEvent::Failed {
                    message: error.message,
                    code: Some("context_unavailable".to_owned()),
                },
            );
            runtime.finish(request.request_id, generation);
            return Ok(());
        }
        Err(error) => {
            send(
                &on_event,
                AnswerEvent::Failed {
                    message: format!("Could not join the answer-context search: {error}"),
                    code: Some("context_unavailable".to_owned()),
                },
            );
            runtime.finish(request.request_id, generation);
            return Ok(());
        }
    };
    if cancellation.is_cancelled() {
        send(&on_event, AnswerEvent::Cancelled);
        runtime.finish(request.request_id, generation);
        return Ok(());
    }
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
    let prompt = context_prompt(&query, &hits);
    let mut last_failure = StreamFailure::new("provider_error", "No answer route is configured");
    for (position, route) in attempts.iter().enumerate() {
        if route.alias == "lumen.answer.local" {
            let startup_app = app.clone();
            let startup = tauri::async_runtime::spawn_blocking(move || {
                startup_app
                    .state::<LocalRuntimeSupervisor>()
                    .inner()
                    .start()
            });
            let startup_result = tokio::select! {
                () = cancellation.cancelled() => {
                    send(&on_event, AnswerEvent::Cancelled);
                    runtime.finish(request.request_id, generation);
                    return Ok(());
                }
                result = startup => result,
            };
            let startup_result = match startup_result {
                Ok(result) => result,
                Err(error) => Err(format!("Could not join local runtime startup: {error}")),
            };
            if let Err(error) = startup_result {
                last_failure = StreamFailure::new("local_runtime_unavailable", error);
                if position + 1 < attempts.len() {
                    continue;
                }
                break;
            }
        }
        match stream_attempt(supervisor.inner(), route, &prompt, &on_event, &cancellation).await {
            Ok(()) => {
                runtime.finish(request.request_id, generation);
                return Ok(());
            }
            Err(error) if error.code == "cancelled" => {
                send(&on_event, AnswerEvent::Cancelled);
                runtime.finish(request.request_id, generation);
                return Ok(());
            }
            Err(error) => {
                last_failure = error;
                if position + 1 < attempts.len() {
                    continue;
                }
            }
        }
    }
    send(
        &on_event,
        AnswerEvent::Failed {
            message: last_failure.message,
            code: Some(last_failure.code.to_owned()),
        },
    );
    runtime.finish(request.request_id, generation);
    Ok(())
}

#[tauri::command]
pub fn cancel_answer(request_id: u64, runtime: State<'_, AnswerRuntime>) {
    runtime.cancel(request_id);
}

#[tauri::command]
pub fn cancel_cloud_answers(runtime: State<'_, AnswerRuntime>) {
    runtime.cancel_cloud();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_mode_never_has_cloud_fallback() {
        let selected = routes(RuntimeMode::Local, true, true).unwrap();
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].alias, "lumen.answer.local");
    }

    #[test]
    fn cloud_mode_requires_consent_and_a_credential() {
        assert_eq!(
            routes(RuntimeMode::Cloud, false, true).unwrap_err().code,
            "cloud_consent_required"
        );
        assert_eq!(
            routes(RuntimeMode::Cloud, true, false).unwrap_err().code,
            "cloud_credential_required"
        );

        let selected = routes(RuntimeMode::Cloud, true, true).unwrap();
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].alias, "lumen.answer.cloud");
    }

    #[test]
    fn auto_mode_uses_cloud_only_after_explicit_consent() {
        let without_consent = routes(RuntimeMode::Auto, false, true).unwrap();
        assert_eq!(without_consent.len(), 1);
        assert_eq!(without_consent[0].alias, "lumen.answer.local");

        let with_consent = routes(RuntimeMode::Auto, true, true).unwrap();
        assert_eq!(with_consent.len(), 2);
        assert_eq!(with_consent[0].alias, "lumen.answer.cloud");
        assert_eq!(with_consent[1].alias, "lumen.answer.local");
    }

    #[test]
    fn answer_queries_are_trimmed_and_bounded() {
        assert_eq!(normalized_query("  question  ").unwrap(), "question");
        assert_eq!(normalized_query("  ").unwrap_err().code, "invalid_query");
        assert_eq!(
            normalized_query(&"x".repeat(MAX_QUERY_CHARACTERS + 1))
                .unwrap_err()
                .code,
            "query_too_long"
        );
    }

    #[test]
    fn sse_frames_support_fragmented_crlf_and_multiline_data() {
        let mut pending =
            b"event: response\r\ndata: {\"type\":\"response.output_text.delta\",".to_vec();
        assert!(take_sse_frame(&mut pending).is_none());
        pending.extend_from_slice(b"\r\ndata: \"delta\":\"hello\"}\r\n\r\n");
        let frame = take_sse_frame(&mut pending).unwrap();
        assert_eq!(
            sse_data(&frame).unwrap().unwrap(),
            "{\"type\":\"response.output_text.delta\",\n\"delta\":\"hello\"}"
        );
        assert!(pending.is_empty());
    }

    #[test]
    fn sse_parser_rejects_malformed_utf8_and_json() {
        assert_eq!(sse_data(&[0xff]).unwrap_err().code, "invalid_stream");
        assert_eq!(
            sse_data(&vec![b'x'; MAX_SSE_FRAME_BYTES + 1])
                .unwrap_err()
                .code,
            "invalid_stream"
        );
        assert!(
            serde_json::from_str::<serde_json::Value>(
                &sse_data(b"data: not-json").unwrap().unwrap()
            )
            .is_err()
        );
    }

    #[test]
    fn cancellation_before_registration_is_honored() {
        let runtime = AnswerRuntime::default();
        runtime.cancel(41);

        let (generation, cancellation) = runtime.begin(41, false);

        assert!(cancellation.is_cancelled());
        runtime.finish(41, generation);
        assert!(runtime.state.lock().unwrap().active.is_empty());
    }

    #[test]
    fn stale_completion_cannot_remove_a_replacement_request() {
        let runtime = AnswerRuntime::default();
        let (first_generation, first) = runtime.begin(7, false);
        let (second_generation, second) = runtime.begin(7, false);

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
        runtime.finish(7, first_generation);
        assert_eq!(runtime.state.lock().unwrap().active.len(), 1);
        runtime.finish(7, second_generation);
        assert!(runtime.state.lock().unwrap().active.is_empty());
    }

    #[test]
    fn cloud_revocation_cancels_only_cloud_capable_answers() {
        let runtime = AnswerRuntime::default();
        let (local_generation, local) = runtime.begin(1, false);
        let (_cloud_generation, cloud) = runtime.begin(2, true);

        assert_eq!(runtime.cancel_cloud(), 1);
        assert!(!local.is_cancelled());
        assert!(cloud.is_cancelled());
        runtime.finish(1, local_generation);
    }
}
