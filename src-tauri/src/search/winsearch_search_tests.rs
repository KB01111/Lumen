use super::*;
use crate::search::{
    indexing::IndexRootRequest,
    test_support::SearchFixture,
    traversal::TraversalPolicy,
    winsearch_engine::{self, EngineRuntime, GrantedRoot},
};
use ws_client::protocol::{
    EngineRunState, EngineStatus, EntryReference, MatchingMoment, SemanticOutcome,
};

fn granted(
    path: &std::path::Path,
    exclusions: &[&str],
    hidden: bool,
    max_bytes: u64,
) -> GrantedRoot {
    GrantedRoot {
        path: path.to_path_buf(),
        policy: TraversalPolicy::new(
            exclusions.iter().map(|value| value.to_string()).collect(),
            hidden,
            max_bytes,
        )
        .unwrap(),
    }
}

fn open_root(path: &std::path::Path) -> GrantedRoot {
    granted(path, &[], false, u64::MAX)
}

fn filter(id: &str, value: &str) -> SearchFilterRequest {
    serde_json::from_value(serde_json::json!({"id": id, "value": value})).unwrap()
}

fn hit(path: &std::path::Path, id: &str, revision: Option<&str>) -> SearchResult {
    SearchResult {
        id: "q1".into(),
        kind: ResultKind::Document,
        title: "title".into(),
        score: 0.75,
        path: Some(path.to_string_lossy().into_owned()),
        excerpt: Some("matching excerpt".into()),
        entry_reference: Some(EntryReference {
            result_id: id.into(),
            source_revision: revision.map(str::to_owned),
        }),
        ..Default::default()
    }
}

#[test]
fn query_maps_scope_filters_and_limit() {
    let query = engine_query(
        "report",
        "documents",
        &[filter("extension", ".PDF")],
        25,
        true,
    )
    .expect("supported request");
    assert_eq!(query.text, "report");
    assert_eq!(query.mode, SearchMode::Files);
    assert_eq!(query.limit, 25);
    assert!(query.include_semantic);
    assert_eq!(query.categories, vec![ResultKind::Document]);
    assert_eq!(query.extensions, vec!["PDF".to_owned()]);

    let kinds = engine_query("x", "all", &[filter("kind", "Pdf")], 10, false).unwrap();
    assert!(kinds.categories.is_empty());
    assert_eq!(kinds.file_kinds, vec![EngineFileKind::Pdf]);
    assert_eq!(
        engine_query("x", "all", &[], 50_000, false).unwrap().limit,
        10_000
    );
}

#[test]
fn query_leaves_local_only_requests_to_the_local_index() {
    for scope in ["recent", "related", "code", "unknown"] {
        assert!(
            engine_query("x", scope, &[], 10, false).is_none(),
            "{scope}"
        );
    }
    assert!(engine_query("   ", "all", &[], 10, false).is_none());
    assert!(engine_query("x", "all", &[filter("kind", "not-a-kind")], 10, false).is_none());
    assert!(engine_query("x", "all", &[filter("size", "1")], 10, false).is_none());
    // The engine ORs alternatives while the local filters intersect.
    assert!(
        engine_query(
            "x",
            "all",
            &[filter("extension", "a"), filter("extension", "b")],
            10,
            false
        )
        .is_none()
    );
}

#[test]
fn mapped_hits_keep_the_existing_contract() {
    let fixture = SearchFixture::new("winsearch-map");
    let path = fixture.file("notes/plan.md", b"hello");
    let roots = vec![open_root(fixture.root())];
    let mut result = hit(&path, "e42", Some("proof"));
    result.location = Some(MatchLocation::Page { page: 3 });
    let mapped = map_result(&roots, &result).expect("confined hit");
    assert_eq!(mapped.hit.stable_id, "winsearch:e42");
    assert_eq!(mapped.hit.root_path, roots[0].path);
    assert_eq!(mapped.hit.name, "plan.md");
    assert_eq!(mapped.hit.page, Some(3));
    assert_eq!(mapped.hit.snippet, "matching excerpt");
    assert_eq!(mapped.match_source, "content");
    assert_eq!(mapped.hit.content_hash.len(), 64);
    assert!((mapped.hit.rank - 0.25).abs() < 1e-9);
    assert!(mapped.hit.index_revision >= 1);
    assert!(!mapped.pinned);
}

#[test]
fn mapped_hits_are_dropped_outside_grants_or_without_bound_proof() {
    let fixture = SearchFixture::new("winsearch-confine");
    let inside = fixture.file("a.txt", b"a");
    let outside = fixture.outside_file("b.txt", b"b");
    let roots = vec![open_root(fixture.root())];
    assert!(map_result(&roots, &hit(&outside, "e1", Some("proof"))).is_none());
    assert!(map_result(&roots, &hit(&inside, "e1", None)).is_none());
    assert!(map_result(&roots, &hit(&inside, "not-an-id", Some("proof"))).is_none());
    assert!(map_result(&[], &hit(&inside, "e1", Some("proof"))).is_none());
    let mut app = hit(&inside, "e1", Some("proof"));
    app.kind = ResultKind::Application;
    assert!(map_result(&roots, &app).is_none());
    let mut missing = hit(&inside, "e1", Some("proof"));
    missing.path = Some(
        fixture
            .root()
            .join("gone.txt")
            .to_string_lossy()
            .into_owned(),
    );
    assert!(map_result(&roots, &missing).is_none());
}

#[test]
fn mapped_hits_use_moments_timestamps_and_bounded_snippets() {
    let fixture = SearchFixture::new("winsearch-moment");
    let path = fixture.file("clip.mp3", b"x");
    let roots = vec![open_root(fixture.root())];
    let mut result = hit(&path, "e7", Some("proof"));
    result.excerpt = None;
    result.matching_moments = vec![MatchingMoment {
        excerpt: "é".repeat(1500),
        ..Default::default()
    }];
    result.location = Some(MatchLocation::Timestamp {
        seconds: 1.5,
        end_seconds: 2.0,
    });
    result.score = f64::NAN;
    let mapped = map_result(&roots, &result).unwrap();
    assert_eq!(mapped.hit.snippet.chars().count(), 1000);
    assert_eq!(mapped.hit.time_start_ms, Some(1500));
    assert_eq!(mapped.hit.time_end_ms, Some(2000));
    assert_eq!(mapped.hit.rank, 1.0);

    result.excerpt = None;
    result.matching_moments.clear();
    assert_eq!(
        map_result(&roots, &result).unwrap().match_source,
        "filename"
    );
}

#[test]
fn semantic_outcomes_map_to_closed_statuses() {
    assert_eq!(semantic_status(None).phase, SemanticPhase::Disabled);
    let ready = SearchOutcome::complete(SemanticOutcome::READY);
    let status = semantic_status(Some(&ready));
    assert_eq!((status.phase, status.reason), (SemanticPhase::Ready, None));
    let degraded = SearchOutcome::complete(SemanticOutcome::degraded(SemanticIssue::NoVectors));
    let status = semantic_status(Some(&degraded));
    assert_eq!(status.phase, SemanticPhase::Degraded);
    assert!(
        status
            .reason
            .is_some_and(|reason| !reason.is_empty() && reason.len() <= 256)
    );
    let disabled = SearchOutcome::complete(SemanticOutcome::DISABLED);
    assert_eq!(
        semantic_status(Some(&disabled)).phase,
        SemanticPhase::Disabled
    );
}

#[test]
fn folder_grants_become_an_unpaused_engine_policy() {
    let roots = vec![IndexRootRequest {
        path: "C:\\Users\\me\\Docs".into(),
        cloud_enrichment: false,
        exclusions: vec!["secret".into()],
        include_hidden: true,
        max_file_size_mb: 2,
    }];
    let config = winsearch_engine::indexing_config(&roots, true);
    assert_eq!(config.roots, vec!["C:\\Users\\me\\Docs".to_owned()]);
    assert_eq!(config.root_policies.len(), 1);
    let policy = &config.root_policies[0];
    assert_eq!(
        (policy.exclusions.clone(), policy.include_hidden),
        (vec!["secret".to_owned()], true)
    );
    assert_eq!(policy.max_file_size_bytes, 2 * 1024 * 1024);
    assert!(!config.paused);
    assert!(winsearch_engine::indexing_config(&roots, false).paused);
    // Revoked or empty grants must leave nothing indexable.
    let empty = winsearch_engine::indexing_config(&[], true);
    assert!(empty.roots.is_empty() && empty.root_policies.is_empty() && empty.paused);
}

#[test]
fn engine_is_ready_only_after_it_has_indexed_without_failing() {
    let mut status = EngineStatus::default();
    assert!(!winsearch_engine::engine_ready(&status));
    status.files_indexed = 3;
    assert!(winsearch_engine::engine_ready(&status));
    status.state = EngineRunState::Error;
    assert!(!winsearch_engine::engine_ready(&status));
}

#[test]
fn merging_deduplicates_paths_orders_by_rank_and_truncates() {
    let fixture = SearchFixture::new("winsearch-merge");
    let roots = vec![open_root(fixture.root())];
    let mapped = |name: &str, score: f64| {
        let path = fixture.file(name, b"x");
        let mut result = hit(&path, "e1", Some("proof"));
        result.score = score;
        map_result(&roots, &result).unwrap()
    };
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    merge(
        &mut items,
        &mut seen,
        vec![mapped("a.txt", 0.2), mapped("b.txt", 0.9)],
        2,
    );
    merge(
        &mut items,
        &mut seen,
        vec![mapped("a.txt", 0.99), mapped("c.txt", 0.5)],
        2,
    );
    let names: Vec<_> = items.iter().map(|item| item.hit.name.as_str()).collect();
    assert_eq!(names, ["b.txt", "c.txt"]);
}

#[test]
fn hits_indexed_before_a_policy_change_are_not_shown() {
    let fixture = SearchFixture::new("winsearch-policy");
    let secret = fixture.file("private/plan.txt", b"x");
    let scratch = fixture.file("scratch.tmp", b"x");
    let hidden = fixture.file(".hidden/notes.txt", b"x");
    let big = fixture.file("big.bin", &[0u8; 64]);
    let kept = fixture.file("docs/ok.txt", b"x");
    let restricted = vec![granted(fixture.root(), &["private", "*.tmp"], false, 32)];
    for path in [&secret, &scratch, &hidden, &big] {
        assert!(
            map_result(&restricted, &hit(path, "e1", Some("proof"))).is_none(),
            "{path:?}"
        );
    }
    assert!(map_result(&restricted, &hit(&kept, "e1", Some("proof"))).is_some());
    // The same entries are admitted once the stricter policy is relaxed.
    let relaxed = vec![granted(fixture.root(), &[], true, u64::MAX)];
    for path in [&secret, &scratch, &hidden, &big] {
        assert!(
            map_result(&relaxed, &hit(path, "e1", Some("proof"))).is_some(),
            "{path:?}"
        );
    }
}

#[test]
fn background_pause_reaches_the_cached_engine_policy_once_per_transition() {
    let engine = EngineRuntime::new(std::path::PathBuf::new(), std::path::PathBuf::new());
    let root = IndexRootRequest {
        path: "C:\\Docs".into(),
        cloud_enrichment: false,
        exclusions: Vec::new(),
        include_hidden: false,
        max_file_size_mb: 1,
    };
    assert!(!engine.set_background_normal(false) || engine.cached_config().is_none());
    engine.remember_roots(&[root], true).unwrap();
    assert!(!engine.cached_config().unwrap().paused);
    assert!(engine.set_background_normal(false));
    assert!(engine.cached_config().unwrap().paused);
    assert!(
        !engine.set_background_normal(false),
        "no change, nothing to re-send"
    );
    assert!(engine.set_background_normal(true));
    assert!(!engine.cached_config().unwrap().paused);
    // Revoking every grant keeps the engine paused whatever the activity policy says.
    engine.remember_roots(&[], true).unwrap();
    assert!(engine.cached_config().unwrap().paused);
    assert!(engine.configured_roots().is_empty());
}
