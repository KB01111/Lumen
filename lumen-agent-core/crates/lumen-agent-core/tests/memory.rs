use lumen_agent_core::memory::*;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

fn scope(project: &str) -> MemoryScope {
    MemoryScope {
        project_id: project.into(),
        session_id: None,
    }
}
fn content(project: &str) -> MemoryRecord {
    MemoryRecord {
        source_id: "memory-1".into(),
        scope: scope(project),
        content: "Use approved file tools.".into(),
        provenance: Provenance {
            source: "explicit-user-note".into(),
            revision: "1".into(),
        },
    }
}
struct FixtureProvider(Arc<Mutex<MemoryRecord>>);
impl MemoryProvider for FixtureProvider {
    fn id(&self) -> &str {
        "fixture"
    }
    fn retrieve(
        &self,
        _request: ProviderRequest,
        _cancel: CancellationToken,
    ) -> ProviderFuture<'_> {
        let record = self.0.lock().unwrap().clone();
        Box::pin(async move { Ok(vec![record]) })
    }
}
fn reader(core: &Arc<MemoryCore>, project: &str, providers: Vec<String>) -> MemoryReader {
    core.bind_reader(scope(project), providers, MemoryRoute::Local)
        .unwrap()
}
async fn retrieve(reader: &MemoryReader) -> MemoryRetrieval {
    reader
        .retrieve(
            MemoryQuery {
                text: String::new(),
                limit: 20,
            },
            CancellationToken::new(),
        )
        .await
        .unwrap()
}

#[tokio::test]
async fn native_memory_requires_explicit_review_and_is_shared_by_harnesses() {
    let core = Arc::new(MemoryCore::in_memory().unwrap());
    let pi = reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]);
    let deep = reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]);
    let review = core.review_native(content("project-a")).unwrap();
    assert!(retrieve(&pi).await.memories.is_empty());
    core.approve(&review.review_id, RetentionPolicy::Days { days: 30 })
        .unwrap();
    assert_eq!(retrieve(&pi).await.memories, retrieve(&deep).await.memories);
    assert_eq!(retrieve(&pi).await.memories.len(), 1);
    assert!(
        retrieve(&reader(&core, "project-b", vec![NATIVE_PROVIDER.into()]))
            .await
            .memories
            .is_empty()
    );
    assert!(
        core.bind_reader(
            scope("project-a"),
            vec![NATIVE_PROVIDER.into()],
            MemoryRoute::Cloud
        )
        .is_err()
    );
}

#[tokio::test]
async fn external_records_are_disabled_by_default_and_approval_is_content_bound() {
    let mut core = MemoryCore::in_memory().unwrap();
    let record = Arc::new(Mutex::new(content("project-a")));
    core.register_provider(Arc::new(FixtureProvider(record.clone())))
        .unwrap();
    assert_eq!(
        core.provider_status()
            .unwrap()
            .iter()
            .find(|p| p.id == "fixture")
            .unwrap()
            .state,
        ProviderState::Disabled
    );
    core.set_provider_enabled("fixture", true).unwrap();
    let review = core
        .review_provider(
            "fixture",
            scope("project-a"),
            "memory-1",
            CancellationToken::new(),
        )
        .await
        .unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .unwrap();
    let core = Arc::new(core);
    let session = reader(&core, "project-a", vec!["fixture".into()]);
    assert_eq!(retrieve(&session).await.memories.len(), 1);
    record.lock().unwrap().content = "Changed after approval".into();
    assert!(retrieve(&session).await.memories.is_empty());
    record.lock().unwrap().content = content("project-a").content;
    record.lock().unwrap().scope = scope("project-b");
    assert!(retrieve(&session).await.memories.is_empty());
    record.lock().unwrap().scope = scope("project-a");
    core.forget("fixture", &scope("project-a"), "memory-1")
        .unwrap();
    assert!(retrieve(&session).await.memories.is_empty());
    // External deletion revokes Lumen's approval without mutating Beacon/provider storage.
    assert_eq!(record.lock().unwrap().source_id, "memory-1");
}

#[tokio::test]
async fn expiry_provider_failures_and_cancellation_do_not_grant_access() {
    let core = Arc::new(MemoryCore::in_memory().unwrap());
    let review = core.review_native(content("project-a")).unwrap();
    assert!(
        core.approve(&review.review_id, RetentionPolicy::Days { days: 0 })
            .is_err()
    );
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .unwrap();
    let session = reader(
        &core,
        "project-a",
        vec![NATIVE_PROVIDER.into(), "missing".into()],
    );
    let result = retrieve(&session).await;
    assert_eq!(result.memories.len(), 1);
    assert!(result.unavailable.iter().any(|p| p.id == "missing"));
    let cancelled = CancellationToken::new();
    cancelled.cancel();
    assert_eq!(
        session
            .retrieve(
                MemoryQuery {
                    text: String::new(),
                    limit: 20
                },
                cancelled
            )
            .await
            .unwrap_err(),
        MemoryError::Cancelled
    );
    core.forget(NATIVE_PROVIDER, &scope("project-a"), "memory-1")
        .unwrap();
    assert!(retrieve(&session).await.memories.is_empty());
}

#[test]
fn requests_cannot_override_scope_or_approve_memory() {
    for payload in [
        r#"{"version":1,"query":{"text":"","limit":5},"scope":{"projectId":"other"}}"#,
        r#"{"version":1,"query":{"text":"","limit":5},"approve":true}"#,
    ] {
        assert!(serde_json::from_str::<MemoryRequest>(payload).is_err());
    }
}

#[tokio::test]
async fn session_scope_is_exact_and_review_handles_are_one_time() {
    let core = Arc::new(MemoryCore::in_memory().unwrap());
    let mut record = content("project-a");
    record.scope.session_id = Some("session-1".into());
    let review = core.review_native(record.clone()).unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .unwrap();
    assert_eq!(
        core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
            .unwrap_err(),
        MemoryError::ApprovalRequired
    );
    assert!(
        retrieve(&reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]))
            .await
            .memories
            .is_empty()
    );
    let scoped = core
        .bind_reader(
            record.scope,
            vec![NATIVE_PROVIDER.into()],
            MemoryRoute::Local,
        )
        .unwrap();
    assert_eq!(retrieve(&scoped).await.memories.len(), 1);
}

#[tokio::test]
async fn approval_and_provider_configuration_survive_database_reopen() {
    let path = std::env::temp_dir().join(format!(
        "lumen-memory-test-{}.sqlite3",
        uuid::Uuid::new_v4()
    ));
    {
        let core = MemoryCore::open(&path).unwrap();
        let review = core.review_native(content("project-a")).unwrap();
        core.approve(&review.review_id, RetentionPolicy::Days { days: 30 })
            .unwrap();
        core.set_provider_enabled(NATIVE_PROVIDER, false).unwrap();
    }
    {
        let core = Arc::new(MemoryCore::open(&path).unwrap());
        let session = reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]);
        assert!(retrieve(&session).await.memories.is_empty());
        core.set_provider_enabled(NATIVE_PROVIDER, true).unwrap();
        assert_eq!(retrieve(&session).await.memories.len(), 1);
        core.forget(NATIVE_PROVIDER, &scope("project-a"), "memory-1")
            .unwrap();
    }
    {
        let core = Arc::new(MemoryCore::open(&path).unwrap());
        assert!(
            retrieve(&reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]))
                .await
                .memories
                .is_empty()
        );
    }
    std::fs::remove_file(path).unwrap();
}

struct PausingProvider {
    pause: std::sync::atomic::AtomicBool,
    entered: tokio::sync::Notify,
    release: tokio::sync::Notify,
}
impl MemoryProvider for PausingProvider {
    fn id(&self) -> &str {
        "pausing"
    }
    fn retrieve(
        &self,
        _request: ProviderRequest,
        _cancel: CancellationToken,
    ) -> ProviderFuture<'_> {
        Box::pin(async move {
            if self.pause.load(std::sync::atomic::Ordering::SeqCst) {
                self.entered.notify_one();
                self.release.notified().await;
            }
            Ok(vec![content("project-a")])
        })
    }
}

#[tokio::test]
async fn deletion_or_disable_during_provider_io_prevents_publication() {
    for disable in [false, true] {
        let provider = Arc::new(PausingProvider {
            pause: false.into(),
            entered: tokio::sync::Notify::new(),
            release: tokio::sync::Notify::new(),
        });
        let mut core = MemoryCore::in_memory().unwrap();
        core.register_provider(provider.clone()).unwrap();
        core.set_provider_enabled("pausing", true).unwrap();
        let review = core
            .review_provider(
                "pausing",
                scope("project-a"),
                "memory-1",
                CancellationToken::new(),
            )
            .await
            .unwrap();
        core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
            .unwrap();
        let core = Arc::new(core);
        let reader = reader(&core, "project-a", vec!["pausing".into()]);
        provider
            .pause
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let (result, ()) = tokio::join!(retrieve(&reader), async {
            provider.entered.notified().await;
            if disable {
                core.set_provider_enabled("pausing", false).unwrap();
            } else {
                core.forget("pausing", &scope("project-a"), "memory-1")
                    .unwrap();
            }
            provider.release.notify_one();
        });
        assert!(result.memories.is_empty());
    }
}

#[test]
fn invalid_utf8_size_controls_and_scope_cannot_be_approved() {
    let core = MemoryCore::in_memory().unwrap();
    for record in [
        MemoryRecord {
            content: "x".repeat(MAX_RECORD_BYTES + 1),
            ..content("project-a")
        },
        MemoryRecord {
            content: "private\0text".into(),
            ..content("project-a")
        },
        MemoryRecord {
            scope: scope("../other"),
            ..content("project-a")
        },
    ] {
        assert!(core.review_native(record).is_err());
    }
}

struct FailingProvider(std::sync::atomic::AtomicBool);
impl MemoryProvider for FailingProvider {
    fn id(&self) -> &str {
        "optional"
    }
    fn retrieve(
        &self,
        _request: ProviderRequest,
        _cancel: CancellationToken,
    ) -> ProviderFuture<'_> {
        Box::pin(async move {
            if self.0.load(std::sync::atomic::Ordering::SeqCst) {
                Err(MemoryError::Unavailable)
            } else {
                Ok(vec![content("project-a")])
            }
        })
    }
}
#[tokio::test]
async fn provider_failure_does_not_hide_approved_native_memory() {
    let mut core = MemoryCore::in_memory().unwrap();
    let provider = Arc::new(FailingProvider(false.into()));
    core.register_provider(provider.clone()).unwrap();
    core.set_provider_enabled("optional", true).unwrap();
    let review = core
        .review_provider(
            "optional",
            scope("project-a"),
            "memory-1",
            CancellationToken::new(),
        )
        .await
        .unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .unwrap();
    let review = core.review_native(content("project-a")).unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .unwrap();
    provider.0.store(true, std::sync::atomic::Ordering::SeqCst);
    let core = Arc::new(core);
    let result = retrieve(&reader(
        &core,
        "project-a",
        vec!["optional".into(), NATIVE_PROVIDER.into()],
    ))
    .await;
    assert_eq!(result.memories.len(), 1);
    assert_eq!(result.memories[0].provider_id, NATIVE_PROVIDER);
    assert_eq!(
        result.unavailable,
        vec![ProviderStatus {
            id: "optional".into(),
            state: ProviderState::Unavailable
        }]
    );
}
