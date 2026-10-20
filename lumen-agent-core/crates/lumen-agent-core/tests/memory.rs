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
        .await
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
        .await
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
            .await
            .is_err()
    );
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .await
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
        .await
        .unwrap();
    assert_eq!(
        core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
            .await
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
            .await
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
    for action in ["delete", "disable", "disable-reenable"] {
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
            .await
            .unwrap();
        let core = Arc::new(core);
        let reader = reader(&core, "project-a", vec!["pausing".into()]);
        provider
            .pause
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let (result, ()) = tokio::join!(retrieve(&reader), async {
            provider.entered.notified().await;
            if action != "delete" {
                core.set_provider_enabled("pausing", false).unwrap();
                if action == "disable-reenable" {
                    core.set_provider_enabled("pausing", true).unwrap();
                }
            } else {
                core.forget("pausing", &scope("project-a"), "memory-1")
                    .unwrap();
            }
            provider.release.notify_one();
        });
        assert!(result.memories.is_empty());
    }
}

#[tokio::test]
async fn unicode_case_variants_match_approved_substrings() {
    let core = Arc::new(MemoryCore::in_memory().unwrap());
    let review = core
        .review_native(MemoryRecord {
            content: "Ångström CAFÉ Résumé".into(),
            ..content("project-a")
        })
        .unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .await
        .unwrap();
    let session = reader(&core, "project-a", vec![NATIVE_PROVIDER.into()]);
    for text in ["ångström", "café", "RÉSUMÉ"] {
        let result = session
            .retrieve(
                MemoryQuery {
                    text: text.into(),
                    limit: 1,
                },
                CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(result.memories.len(), 1, "query: {text}");
    }
}

struct RecordsProvider(Arc<Mutex<Vec<MemoryRecord>>>);
impl MemoryProvider for RecordsProvider {
    fn id(&self) -> &str {
        "records"
    }
    fn retrieve(&self, request: ProviderRequest, _cancel: CancellationToken) -> ProviderFuture<'_> {
        assert!(request.source_ids.len() <= 20);
        let records = self
            .0
            .lock()
            .unwrap()
            .iter()
            .filter(|record| request.source_ids.contains(&record.source_id))
            .cloned()
            .collect();
        Box::pin(async move { Ok(records) })
    }
}

#[tokio::test]
async fn external_approval_rejects_content_changed_since_review() {
    for malformed in [false, true] {
        let mut core = MemoryCore::in_memory().unwrap();
        let record = Arc::new(Mutex::new(content("project-a")));
        core.register_provider(Arc::new(FixtureProvider(record.clone())))
            .unwrap();
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
        if malformed {
            record.lock().unwrap().content = "invalid\0content".into();
        } else {
            record.lock().unwrap().provenance.revision = "changed".into();
        }
        assert_eq!(
            core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
                .await
                .unwrap_err(),
            if malformed {
                MemoryError::Invalid
            } else {
                MemoryError::ApprovalRequired
            }
        );
        *record.lock().unwrap() = content("project-a");
        assert_eq!(
            core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
                .await
                .unwrap_err(),
            MemoryError::ApprovalRequired
        );
    }
}

#[tokio::test]
async fn deletion_or_disable_reenable_revokes_in_flight_reviews_and_approvals() {
    for (approve, delete) in [(false, false), (true, false), (false, true), (true, true)] {
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
        provider
            .pause
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let (result, ()) = tokio::join!(
            async {
                if approve {
                    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
                        .await
                        .map(|_| ())
                } else {
                    core.review_provider(
                        "pausing",
                        scope("project-a"),
                        "memory-1",
                        CancellationToken::new(),
                    )
                    .await
                    .map(|_| ())
                }
            },
            async {
                provider.entered.notified().await;
                if delete {
                    core.forget("pausing", &scope("project-a"), "memory-1")
                        .unwrap();
                } else {
                    core.set_provider_enabled("pausing", false).unwrap();
                    core.set_provider_enabled("pausing", true).unwrap();
                }
                provider.release.notify_one();
            }
        );
        assert_eq!(
            result.unwrap_err(),
            if approve {
                MemoryError::ApprovalRequired
            } else {
                MemoryError::Unavailable
            }
        );
    }
}

#[tokio::test]
async fn retrieval_prunes_expired_rows_without_an_enabled_provider() {
    for providers in [vec![], vec![NATIVE_PROVIDER.into()]] {
        let path =
            std::env::temp_dir().join(format!("lumen-prune-{}.sqlite3", uuid::Uuid::new_v4()));
        {
            let core = Arc::new(MemoryCore::open(&path).unwrap());
            let review = core.review_native(content("project-a")).unwrap();
            core.approve(&review.review_id, RetentionPolicy::Days { days: 1 })
                .await
                .unwrap();
            core.set_provider_enabled(NATIVE_PROVIDER, false).unwrap();
            let connection = rusqlite::Connection::open(&path).unwrap();
            connection
                .execute("UPDATE memory_records SET expires_at=0", [])
                .unwrap();
            assert!(
                retrieve(&reader(&core, "project-a", providers))
                    .await
                    .memories
                    .is_empty()
            );
            let count: u32 = connection
                .query_row("SELECT count(*) FROM memory_records", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 0);
        }
        std::fs::remove_file(path).unwrap();
    }
}

#[tokio::test]
async fn stale_or_missing_records_do_not_consume_the_result_limit() {
    let records = Arc::new(Mutex::new(
        (0..22)
            .map(|i| MemoryRecord {
                source_id: format!("note-{i:02}"),
                ..content("project-a")
            })
            .collect::<Vec<_>>(),
    ));
    let mut core = MemoryCore::in_memory().unwrap();
    core.register_provider(Arc::new(RecordsProvider(records.clone())))
        .unwrap();
    core.set_provider_enabled("records", true).unwrap();
    for i in 0..22 {
        let review = core
            .review_provider(
                "records",
                scope("project-a"),
                &format!("note-{i:02}"),
                CancellationToken::new(),
            )
            .await
            .unwrap();
        core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
            .await
            .unwrap();
    }
    records.lock().unwrap().drain(..10);
    for record in records.lock().unwrap().iter_mut().take(11) {
        record.provenance.revision = "changed".into();
    }
    let core = Arc::new(core);
    let session = reader(&core, "project-a", vec!["records".into()]);
    let result = session
        .retrieve(
            MemoryQuery {
                text: "file tools".into(),
                limit: 1,
            },
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(result.memories.len(), 1);
    assert_eq!(result.memories[0].record.source_id, "note-21");
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

struct LaterPageFailure {
    records: RecordsProvider,
    fail: std::sync::atomic::AtomicBool,
}
impl MemoryProvider for LaterPageFailure {
    fn id(&self) -> &str {
        "records"
    }
    fn retrieve(&self, request: ProviderRequest, cancel: CancellationToken) -> ProviderFuture<'_> {
        if self.fail.load(std::sync::atomic::Ordering::SeqCst)
            && request.source_ids.iter().any(|id| id == "note-20")
        {
            return Box::pin(async { Err(MemoryError::Unavailable) });
        }
        self.records.retrieve(request, cancel)
    }
}

#[tokio::test]
async fn later_page_failure_discards_only_that_providers_partial_results() {
    let records = Arc::new(Mutex::new(
        (0..21)
            .map(|i| MemoryRecord {
                source_id: format!("note-{i:02}"),
                ..content("project-a")
            })
            .collect(),
    ));
    let provider = Arc::new(LaterPageFailure {
        records: RecordsProvider(records.clone()),
        fail: false.into(),
    });
    let mut core = MemoryCore::in_memory().unwrap();
    core.register_provider(provider.clone()).unwrap();
    core.set_provider_enabled("records", true).unwrap();
    for i in 0..21 {
        let review = core
            .review_provider(
                "records",
                scope("project-a"),
                &format!("note-{i:02}"),
                CancellationToken::new(),
            )
            .await
            .unwrap();
        core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
            .await
            .unwrap();
    }
    let review = core.review_native(content("project-a")).unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .await
        .unwrap();
    records.lock().unwrap().drain(1..20);
    provider
        .fail
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let core = Arc::new(core);
    for providers in [
        vec!["records".into(), NATIVE_PROVIDER.into()],
        vec![NATIVE_PROVIDER.into(), "records".into()],
    ] {
        let result = retrieve(&reader(&core, "project-a", providers)).await;
        assert_eq!(
            result.unavailable,
            vec![ProviderStatus {
                id: "records".into(),
                state: ProviderState::Unavailable
            }]
        );
        assert_eq!(result.memories.len(), 1);
        assert_eq!(result.memories[0].provider_id, NATIVE_PROVIDER);
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
        .await
        .unwrap();
    let review = core.review_native(content("project-a")).unwrap();
    core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
        .await
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
