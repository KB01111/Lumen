//! Launcher searches served by the owned WinSearch engine.
//!
//! The local index remains the fallback: any `engine-unavailable` failure tells the
//! frontend to run the existing `search_hybrid` command instead.

use std::{collections::HashSet, path::PathBuf, time::Duration};

use futures_util::future::{Either, select};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State, ipc::Channel};
use ws_client::protocol::{
    FileKind as EngineFileKind, MatchLocation, ResultKind, SearchDisposition, SearchMode,
    SearchOutcome, SearchQuery, SearchResult, SemanticIssue, SemanticPhase as EnginePhase,
};

use super::{
    IndexedHit, SearchFailure,
    indexing::{
        HybridHit, HybridSearchResponse, IndexRuntime, SearchFilterRequest, SemanticPhase,
        SemanticRetrievalStatus, validate_search_options,
    },
    metadata,
    winsearch_engine::EngineRuntime,
};

const MAX_RESULTS: usize = 10_000;
const SNIPPET_CHARS: usize = 1000;
const STALE_POLL: Duration = Duration::from_millis(25);

fn unavailable() -> SearchFailure {
    SearchFailure::new(
        "engine-unavailable",
        "The local search engine is unavailable or could not be verified.",
        None,
    )
}

/// Translates a launcher request into an engine query, or `None` when only the local index can answer.
pub(super) fn engine_query(
    query: &str,
    scope: &str,
    filters: &[SearchFilterRequest],
    limit: usize,
    semantic: bool,
) -> Option<SearchQuery> {
    if query.trim().is_empty() {
        return None;
    }
    let categories = match scope {
        "all" => Vec::new(),
        "files" => vec![
            ResultKind::File,
            ResultKind::Document,
            ResultKind::Image,
            ResultKind::Screenshot,
            ResultKind::Audio,
            ResultKind::Video,
        ],
        "folders" => vec![ResultKind::Folder],
        "documents" => vec![ResultKind::Document],
        "images" => vec![ResultKind::Image, ResultKind::Screenshot],
        // Recent, Related and Code keep their local identities and ranking.
        _ => return None,
    };
    let mut extensions = Vec::new();
    let mut file_kinds = Vec::new();
    for filter in filters {
        match filter.id.as_str() {
            "extension" => extensions.push(filter.value.trim_start_matches('.').to_owned()),
            "kind" => file_kinds.push(
                serde_json::from_value::<EngineFileKind>(serde_json::Value::String(
                    filter.value.to_ascii_lowercase(),
                ))
                .ok()?,
            ),
            _ => return None,
        }
    }
    // Local filters intersect; the engine ORs within a list, so only single filters are equivalent.
    if extensions.len() > 1 || file_kinds.len() > 1 {
        return None;
    }
    Some(SearchQuery {
        text: query.to_owned(),
        mode: SearchMode::Files,
        limit: limit.clamp(1, MAX_RESULTS) as u32,
        include_semantic: semantic,
        categories,
        extensions,
        file_kinds,
    })
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Maps one engine hit onto the existing hit contract, re-confining it to the granted roots.
pub(super) fn map_result(roots: &[PathBuf], hit: &SearchResult) -> Option<HybridHit> {
    if matches!(
        hit.kind,
        ResultKind::Application
            | ResultKind::Calculator
            | ResultKind::Settings
            | ResultKind::Action
    ) {
        return None;
    }
    let reference = hit
        .entry_reference
        .as_ref()
        .filter(|value| value.is_bound())?;
    let revision = reference.source_revision.as_deref()?;
    let path = PathBuf::from(hit.path.as_deref()?);
    let (root, metadata) = roots.iter().find_map(|root| {
        metadata::get_file_metadata_impl(root, &path)
            .ok()
            .map(|record| (root, record))
    })?;
    if metadata.name.is_empty() {
        return None;
    }
    let snippet: String = hit
        .excerpt
        .as_deref()
        .or_else(|| {
            hit.matching_moments
                .iter()
                .map(|moment| moment.excerpt.as_str())
                .find(|excerpt| !excerpt.is_empty())
        })
        .unwrap_or_default()
        .chars()
        .take(SNIPPET_CHARS)
        .collect();
    let (page, time_start_ms, time_end_ms) = match hit.location {
        Some(MatchLocation::Page { page }) if page > 0 => (Some(page), None, None),
        Some(MatchLocation::Timestamp {
            seconds,
            end_seconds,
        }) if seconds.is_finite() && seconds >= 0.0 => {
            let start = (seconds * 1000.0) as u64;
            let end = (end_seconds.is_finite() && end_seconds >= seconds)
                .then(|| (end_seconds * 1000.0) as u64);
            (None, Some(start), end)
        }
        _ => (None, None, None),
    };
    let rank = if hit.score.is_finite() {
        1.0 - hit.score.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let match_source = if snippet.is_empty() {
        "filename"
    } else {
        "content"
    };
    Some(HybridHit {
        hit: IndexedHit {
            stable_id: format!("winsearch:{}", reference.result_id),
            root_path: root.clone(),
            path: PathBuf::from(&metadata.path),
            name: metadata.name.clone(),
            content_hash: hex(&Sha256::digest(revision.as_bytes())),
            index_revision: 1,
            extraction_kind: "winsearch".into(),
            snippet,
            page,
            time_start_ms,
            time_end_ms,
            rank,
        },
        metadata,
        match_source: match_source.into(),
        semantic_score: None,
        embedding_model: None,
        pinned: false,
    })
}

pub(super) fn semantic_status(outcome: Option<&SearchOutcome>) -> SemanticRetrievalStatus {
    let Some(semantic) = outcome.and_then(|value| value.semantic) else {
        return SemanticRetrievalStatus {
            phase: SemanticPhase::Disabled,
            reason: None,
        };
    };
    match semantic.phase {
        EnginePhase::Disabled => SemanticRetrievalStatus {
            phase: SemanticPhase::Disabled,
            reason: None,
        },
        EnginePhase::Ready => SemanticRetrievalStatus {
            phase: SemanticPhase::Ready,
            reason: None,
        },
        EnginePhase::Degraded => SemanticRetrievalStatus {
            phase: SemanticPhase::Degraded,
            reason: Some(
                match semantic.reason {
                    Some(SemanticIssue::ModelUnavailable) => {
                        "Semantic model unavailable; exact results remain available."
                    }
                    Some(SemanticIssue::NoVectors) => {
                        "Semantic index is not ready; exact results remain available."
                    }
                    Some(SemanticIssue::EmbeddingFailed) => {
                        "Query embedding failed; exact results remain available."
                    }
                    Some(SemanticIssue::RetrievalFailed) => {
                        "Semantic retrieval failed; exact results remain available."
                    }
                    Some(SemanticIssue::IndexChanged) => {
                        "Index changed during search; exact results remain available."
                    }
                    None => "Semantic search degraded; exact results remain available.",
                }
                .into(),
            ),
        },
    }
}

async fn wait_until_stale(runtime: IndexRuntime, request_id: u64) {
    while runtime.search_is_current(request_id) {
        tokio::time::sleep(STALE_POLL).await;
    }
}

fn merge(
    items: &mut Vec<HybridHit>,
    seen: &mut HashSet<String>,
    mapped: Vec<HybridHit>,
    limit: usize,
) {
    for hit in mapped {
        if seen.insert(hit.hit.path.to_string_lossy().to_lowercase()) {
            items.push(hit);
        }
    }
    items.sort_by(|left, right| left.hit.rank.total_cmp(&right.hit.rank));
    items.truncate(limit);
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn search_winsearch(
    app: AppHandle,
    state: State<'_, IndexRuntime>,
    engine: State<'_, EngineRuntime>,
    request_id: u64,
    query: String,
    scope: String,
    filters: Vec<SearchFilterRequest>,
    limit: usize,
    semantic_enabled: bool,
    on_update: Channel<HybridSearchResponse>,
) -> Result<HybridSearchResponse, SearchFailure> {
    validate_search_options(&scope, &filters, 0, "balanced")?;
    let limit = limit.min(MAX_RESULTS);
    let Some(engine_query) = engine_query(&query, &scope, &filters, limit, semantic_enabled) else {
        return Err(unavailable());
    };
    let runtime = state.inner().clone();
    runtime.begin_search(request_id);
    if !engine.is_live() {
        // Never wait for a cold start while the user types; the next query finds it running.
        tauri::async_runtime::spawn(async move {
            let _ = app.state::<EngineRuntime>().status().await;
        });
        return Err(unavailable());
    }
    let roots = engine.configured_roots();
    if roots.is_empty() {
        return Err(unavailable());
    }
    let mut stream = engine.search_stream(engine_query).await?;
    let mut items: Vec<HybridHit> = Vec::new();
    let mut seen = HashSet::new();
    loop {
        let pending = Box::pin(stream.next());
        let stale = Box::pin(wait_until_stale(runtime.clone(), request_id));
        let received = match select(pending, stale).await {
            Either::Left((received, _)) => received,
            Either::Right((_, pending)) => {
                drop(pending);
                let _ = stream.cancel().await;
                return Ok(HybridSearchResponse::lexical(Vec::new()));
            }
        };
        let Some(batch) = received.map_err(|_| unavailable())? else {
            return Err(unavailable());
        };
        let worker_roots = roots.clone();
        let results = batch.batch;
        let mapped = tauri::async_runtime::spawn_blocking(move || {
            results
                .iter()
                .filter_map(|hit| map_result(&worker_roots, hit))
                .collect::<Vec<_>>()
        })
        .await
        .map_err(|_| unavailable())?;
        merge(&mut items, &mut seen, mapped, limit);
        if !runtime.search_is_current(request_id) {
            let _ = stream.cancel().await;
            return Ok(HybridSearchResponse::lexical(Vec::new()));
        }
        if batch.done {
            return match batch.outcome.map(|outcome| outcome.disposition) {
                None | Some(SearchDisposition::Complete) => {
                    let _ = runtime.record_user_query(&query, !items.is_empty());
                    Ok(HybridSearchResponse {
                        items,
                        semantic: semantic_status(batch.outcome.as_ref()),
                    })
                }
                Some(SearchDisposition::Superseded | SearchDisposition::Canceled) => {
                    Ok(HybridSearchResponse::lexical(Vec::new()))
                }
                Some(SearchDisposition::Failed) => Err(unavailable()),
            };
        }
        let _ = on_update.send(HybridSearchResponse {
            items: items.clone(),
            semantic: semantic_status(None),
        });
    }
}

/// Marks a launcher search stale so its native engine stream is cancelled promptly.
#[tauri::command]
pub fn cancel_winsearch_search(state: State<'_, IndexRuntime>, request_id: u64) {
    state.cancel_search(request_id);
}

#[cfg(test)]
#[path = "winsearch_search_tests.rs"]
mod tests;
