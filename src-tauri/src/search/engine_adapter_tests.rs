use super::*;
use crate::search::indexing::IndexRootRequest;
use crate::search::test_support::SearchFixture;

#[test]
fn engine_policy_requires_hydration_and_preserves_explicit_empty_grants() {
    let mut policy = EnginePolicy {
        hydrated: false,
        roots: vec![],
        paused: false,
        semantic_enabled: false,
        preferred_backend: "cpu".into(),
    };
    assert!(policy.indexing_config().is_err());
    policy.hydrated = true;
    let config = policy.indexing_config().unwrap();
    assert!(config.roots.is_empty());
    assert!(config.root_policies.is_empty());
    assert!(config.code_roots.is_empty());
    let fixture = SearchFixture::new("adapter-grants");
    policy.roots.push(IndexRootRequest {
        path: fixture.root().to_string_lossy().into_owned(),
        cloud_enrichment: false,
        exclusions: vec!["private".into()],
        include_hidden: false,
        max_file_size_mb: 7,
    });
    let config = policy.indexing_config().unwrap();
    assert_eq!(config.roots, config.code_roots);
    assert_eq!(config.root_policies[0].max_file_size_bytes, 7 * 1024 * 1024);
    assert_eq!(config.root_policies[0].exclusions, vec!["private"]);
    assert!(!config.root_policies[0].include_hidden);
    policy.paused = true;
    assert!(policy.indexing_config().unwrap().paused);
    // Grants are canonicalized once, so confinement roots and the engine agree.
    let granted = policy.granted_roots().unwrap();
    assert_eq!(granted.len(), 1);
    assert_eq!(granted[0].path, config.roots[0]);
    assert_eq!(
        granted[0].path.as_str(),
        std::fs::canonicalize(fixture.root())
            .unwrap()
            .to_string_lossy()
            .as_ref()
    );
}

#[test]
fn engine_policy_rejects_duplicate_grants_and_cloud_enrichment() {
    let fixture = SearchFixture::new("adapter-duplicates");
    let grant = IndexRootRequest {
        path: fixture.root().to_string_lossy().into_owned(),
        cloud_enrichment: false,
        exclusions: Vec::new(),
        include_hidden: false,
        max_file_size_mb: 1,
    };
    let mut policy = EnginePolicy {
        hydrated: true,
        roots: vec![grant.clone(), grant.clone()],
        paused: false,
        semantic_enabled: false,
        preferred_backend: "cpu".into(),
    };
    assert_eq!(policy.granted_roots().unwrap_err().code, "search-failed");
    policy.roots = vec![IndexRootRequest {
        cloud_enrichment: true,
        ..grant
    }];
    assert!(policy.granted_roots().is_err());
}

#[test]
fn engine_policy_rejects_unknown_backend_preferences() {
    let policy = EnginePolicy {
        hydrated: true,
        roots: vec![],
        paused: false,
        semantic_enabled: true,
        preferred_backend: "gpu".into(),
    };
    assert!(policy.engine_config().is_err());
    for backend in ["auto", "cpu", "npu", "cuda", "vulkan"] {
        let config = EnginePolicy {
            preferred_backend: backend.into(),
            ..policy.clone()
        }
        .engine_config()
        .unwrap();
        assert_eq!(config.preferred_backend, backend);
        assert!(config.semantic_enabled);
    }
}

#[test]
fn model_files_do_not_imply_inference_readiness() {
    let status = ws_client::protocol::EngineStatus {
        model_loaded: false,
        ..Default::default()
    };
    assert_eq!(map_status(&status, 3).phase, "ready");
    assert!(!map_status(&status, 3).message.contains("Semantic ready"));
}
