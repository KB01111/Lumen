mod beacon;
mod store;
mod types;
pub use beacon::BeaconMemoryProvider;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::Path,
    sync::{Arc, Mutex},
    time::Instant,
};
use store::MemoryStore;
use tokio_util::sync::CancellationToken;
pub use types::*;

struct PendingReview {
    review: MemoryReview,
    created: Instant,
}
pub struct MemoryCore {
    store: Arc<MemoryStore>,
    providers: BTreeMap<String, Arc<dyn MemoryProvider>>,
    reviews: Mutex<HashMap<String, PendingReview>>,
    // Serializes revocation/approval and final admission, never held across provider I/O.
    admission: Mutex<HashMap<String, u64>>,
}
struct NativeMemoryProvider(Arc<MemoryStore>);
impl MemoryProvider for NativeMemoryProvider {
    fn id(&self) -> &str {
        NATIVE_PROVIDER
    }
    fn retrieve(&self, request: ProviderRequest, cancel: CancellationToken) -> ProviderFuture<'_> {
        Box::pin(async move {
            let mut records = Vec::new();
            for id in request.source_ids {
                if cancel.is_cancelled() {
                    return Err(MemoryError::Cancelled);
                }
                if let Some(memory) = self.0.get(NATIVE_PROVIDER, &request.scope, &id)? {
                    records.push(memory.record);
                }
            }
            Ok(records)
        })
    }
}

impl MemoryCore {
    pub fn open(path: &Path) -> Result<Self, MemoryError> {
        Self::new(MemoryStore::open(path)?)
    }
    pub fn in_memory() -> Result<Self, MemoryError> {
        Self::new(MemoryStore::in_memory()?)
    }
    fn new(store: MemoryStore) -> Result<Self, MemoryError> {
        let store = Arc::new(store);
        let mut core = Self {
            store: store.clone(),
            providers: BTreeMap::new(),
            reviews: Mutex::new(HashMap::new()),
            admission: Mutex::new(HashMap::new()),
        };
        core.register_provider(Arc::new(NativeMemoryProvider(store)))?;
        Ok(core)
    }
    pub fn register_provider(
        &mut self,
        provider: Arc<dyn MemoryProvider>,
    ) -> Result<(), MemoryError> {
        if !safe_id(provider.id())
            || self.providers.len() >= 8
            || self.providers.contains_key(provider.id())
        {
            return Err(MemoryError::Invalid);
        }
        self.providers.insert(provider.id().into(), provider);
        Ok(())
    }
    pub fn provider_status(&self) -> Result<Vec<ProviderStatus>, MemoryError> {
        self.providers
            .keys()
            .map(|id| {
                Ok(ProviderStatus {
                    id: id.clone(),
                    state: if self.store.enabled(id)? {
                        ProviderState::Enabled
                    } else {
                        ProviderState::Disabled
                    },
                })
            })
            .collect()
    }
    pub fn set_provider_enabled(&self, id: &str, enabled: bool) -> Result<(), MemoryError> {
        let mut generations = self
            .admission
            .lock()
            .map_err(|_| MemoryError::Unavailable)?;
        if !self.providers.contains_key(id) {
            return Err(MemoryError::Unavailable);
        }
        self.reviews
            .lock()
            .map_err(|_| MemoryError::Unavailable)?
            .retain(|_, p| p.review.provider_id != id);
        self.store.set_enabled(id, enabled)?;
        if !enabled {
            *generations.entry(id.into()).or_default() += 1;
        }
        Ok(())
    }
    fn stage(
        &self,
        provider: &str,
        record: MemoryRecord,
        generation: Option<u64>,
    ) -> Result<MemoryReview, MemoryError> {
        record.validate()?;
        let generations = self
            .admission
            .lock()
            .map_err(|_| MemoryError::Unavailable)?;
        if !self.store.enabled(provider)?
            || generation.is_some_and(|g| g != *generations.get(provider).unwrap_or(&0))
        {
            return Err(MemoryError::Unavailable);
        }
        let review = MemoryReview {
            review_id: uuid::Uuid::new_v4().to_string(),
            content_hash: record.hash(provider)?,
            provider_id: provider.into(),
            record,
        };
        let mut pending = self.reviews.lock().map_err(|_| MemoryError::Unavailable)?;
        pending.retain(|_, r| r.created.elapsed().as_secs() < 300);
        if pending.len() >= 20 {
            return Err(MemoryError::Unavailable);
        }
        pending.insert(
            review.review_id.clone(),
            PendingReview {
                review: review.clone(),
                created: Instant::now(),
            },
        );
        Ok(review)
    }
    /// Trusted user-management boundary only. Not part of a harness reader.
    pub fn review_native(&self, record: MemoryRecord) -> Result<MemoryReview, MemoryError> {
        self.stage(NATIVE_PROVIDER, record, None)
    }
    pub async fn review_provider(
        &self,
        provider: &str,
        scope: MemoryScope,
        id: &str,
        cancel: CancellationToken,
    ) -> Result<MemoryReview, MemoryError> {
        scope.validate()?;
        if !safe_id(id) {
            return Err(MemoryError::Invalid);
        }
        let adapter = self
            .providers
            .get(provider)
            .ok_or(MemoryError::Unavailable)?;
        let generation = {
            let generations = self
                .admission
                .lock()
                .map_err(|_| MemoryError::Unavailable)?;
            if !self.store.enabled(provider)? {
                return Err(MemoryError::Unavailable);
            }
            *generations.get(provider).unwrap_or(&0)
        };
        let request = ProviderRequest {
            scope: scope.clone(),
            source_ids: vec![id.into()],
        };
        let records = bounded_retrieve(
            adapter.as_ref(),
            request,
            cancel,
            tokio::time::Instant::now() + types::PROVIDER_TIMEOUT,
        )
        .await?;
        if records.len() != 1 || records[0].scope != scope || records[0].source_id != id {
            return Err(MemoryError::Invalid);
        }
        self.stage(
            provider,
            records.into_iter().next().ok_or(MemoryError::Invalid)?,
            Some(generation),
        )
    }
    pub async fn approve(
        &self,
        review_id: &str,
        retention: RetentionPolicy,
    ) -> Result<MemoryApproval, MemoryError> {
        retention.expiry(now_ms())?;
        let (review, generation) = {
            let generations = self
                .admission
                .lock()
                .map_err(|_| MemoryError::Unavailable)?;
            let reviews = self.reviews.lock().map_err(|_| MemoryError::Unavailable)?;
            let pending = reviews
                .get(review_id)
                .ok_or(MemoryError::ApprovalRequired)?;
            if pending.created.elapsed().as_secs() >= 300
                || !self.store.enabled(&pending.review.provider_id)?
            {
                return Err(MemoryError::ApprovalRequired);
            }
            (
                pending.review.clone(),
                *generations.get(&pending.review.provider_id).unwrap_or(&0),
            )
        };
        if review.provider_id != NATIVE_PROVIDER {
            let adapter = self
                .providers
                .get(&review.provider_id)
                .ok_or(MemoryError::Unavailable)?;
            let retrieved = bounded_retrieve(
                adapter.as_ref(),
                ProviderRequest {
                    scope: review.record.scope.clone(),
                    source_ids: vec![review.record.source_id.clone()],
                },
                CancellationToken::new(),
                tokio::time::Instant::now() + types::PROVIDER_TIMEOUT,
            )
            .await;
            let records = match retrieved {
                Ok(records) => records,
                Err(error) => {
                    self.reviews
                        .lock()
                        .map_err(|_| MemoryError::Unavailable)?
                        .remove(review_id);
                    return Err(error);
                }
            };
            if records != vec![review.record.clone()] {
                self.reviews
                    .lock()
                    .map_err(|_| MemoryError::Unavailable)?
                    .remove(review_id);
                return Err(MemoryError::ApprovalRequired);
            }
        }
        let now = now_ms();
        let expires_at = retention.expiry(now)?;
        let generations = self
            .admission
            .lock()
            .map_err(|_| MemoryError::Unavailable)?;
        let mut reviews = self.reviews.lock().map_err(|_| MemoryError::Unavailable)?;
        let pending = reviews
            .get(review_id)
            .ok_or(MemoryError::ApprovalRequired)?;
        if pending.created.elapsed().as_secs() >= 300
            || !self.store.enabled(&pending.review.provider_id)?
            || generation != *generations.get(&pending.review.provider_id).unwrap_or(&0)
        {
            return Err(MemoryError::ApprovalRequired);
        }
        let approval = MemoryApproval {
            id: uuid::Uuid::new_v4().to_string(),
            content_hash: pending.review.content_hash.clone(),
            approved_at: now,
            expires_at,
        };
        self.store.save(&ApprovedMemory {
            provider_id: pending.review.provider_id.clone(),
            record: pending.review.record.clone(),
            approval: approval.clone(),
        })?;
        reviews.remove(review_id);
        Ok(approval)
    }
    /// External providers remain read-only: forget removes Lumen's snapshot/approval only.
    pub fn forget(&self, provider: &str, scope: &MemoryScope, id: &str) -> Result<(), MemoryError> {
        scope.validate()?;
        if !safe_id(provider) || !safe_id(id) {
            return Err(MemoryError::Invalid);
        }
        let mut generations = self
            .admission
            .lock()
            .map_err(|_| MemoryError::Unavailable)?;
        self.reviews
            .lock()
            .map_err(|_| MemoryError::Unavailable)?
            .retain(|_, p| {
                !(p.review.provider_id == provider
                    && p.review.record.scope == *scope
                    && p.review.record.source_id == id)
            });
        self.store.forget(provider, scope, id)?;
        // Conservatively revoke all in-flight work for this provider.
        if self.providers.contains_key(provider) {
            *generations.entry(provider.into()).or_default() += 1;
        }
        Ok(())
    }
    pub fn prune_expired(&self) -> Result<(), MemoryError> {
        self.store.prune(now_ms())
    }
    /// Scope/provider/route are supplied by the native session owner, never a worker request.
    pub fn bind_reader(
        self: &Arc<Self>,
        scope: MemoryScope,
        providers: Vec<String>,
        route: MemoryRoute,
    ) -> Result<MemoryReader, MemoryError> {
        if matches!(route, MemoryRoute::Cloud) {
            return Err(MemoryError::CloudDenied);
        }
        scope.validate()?;
        let unique: HashSet<_> = providers.iter().collect();
        if providers.len() > 8
            || providers.len() != unique.len()
            || providers.iter().any(|id| !safe_id(id))
        {
            return Err(MemoryError::Invalid);
        }
        Ok(MemoryReader {
            core: self.clone(),
            scope,
            providers,
        })
    }
}

pub struct MemoryReader {
    core: Arc<MemoryCore>,
    scope: MemoryScope,
    providers: Vec<String>,
}
impl MemoryReader {
    pub async fn handle(
        &self,
        request: &[u8],
        cancel: CancellationToken,
    ) -> Result<MemoryRetrieval, MemoryError> {
        if request.len() > 2048 {
            return Err(MemoryError::Invalid);
        }
        let request: MemoryRequest =
            serde_json::from_slice(request).map_err(|_| MemoryError::Invalid)?;
        if request.version != 1 {
            return Err(MemoryError::Invalid);
        }
        self.retrieve(request.query, cancel).await
    }
    pub async fn retrieve(
        &self,
        query: MemoryQuery,
        cancel: CancellationToken,
    ) -> Result<MemoryRetrieval, MemoryError> {
        query.validate()?;
        if cancel.is_cancelled() {
            return Err(MemoryError::Cancelled);
        }
        self.core.prune_expired()?;
        let mut read_generations = HashMap::new();
        let mut result = MemoryRetrieval {
            version: 1,
            memories: vec![],
            unavailable: vec![],
        };
        for id in &self.providers {
            if cancel.is_cancelled() {
                return Err(MemoryError::Cancelled);
            }
            let Some(provider) = self.core.providers.get(id) else {
                result.unavailable.push(ProviderStatus {
                    id: id.clone(),
                    state: ProviderState::Unavailable,
                });
                continue;
            };
            let generation = {
                let generations = self
                    .core
                    .admission
                    .lock()
                    .map_err(|_| MemoryError::Unavailable)?;
                self.core
                    .store
                    .enabled(id)?
                    .then(|| *generations.get(id).unwrap_or(&0))
            };
            let Some(generation) = generation else {
                result.unavailable.push(ProviderStatus {
                    id: id.clone(),
                    state: ProviderState::Disabled,
                });
                continue;
            };
            read_generations.insert(id.clone(), generation);
            let deadline = tokio::time::Instant::now() + types::PROVIDER_TIMEOUT;
            let mut after = None;
            let mut provider_count = 0;
            loop {
                if cancel.is_cancelled() {
                    return Err(MemoryError::Cancelled);
                }
                let approved = self
                    .core
                    .store
                    .search(id, &self.scope, &query, after.as_deref())?;
                if approved.is_empty() {
                    break;
                }
                after = approved.last().map(|m| m.record.source_id.clone());
                let request = ProviderRequest {
                    scope: self.scope.clone(),
                    source_ids: approved
                        .iter()
                        .map(|m| m.record.source_id.clone())
                        .collect(),
                };
                let records =
                    match bounded_retrieve(provider.as_ref(), request, cancel.clone(), deadline)
                        .await
                    {
                        Ok(records) => records,
                        Err(MemoryError::Cancelled) => return Err(MemoryError::Cancelled),
                        _ => {
                            result.unavailable.push(ProviderStatus {
                                id: id.clone(),
                                state: ProviderState::Unavailable,
                            });
                            break;
                        }
                    };
                let mut seen = HashSet::new();
                for record in records {
                    if record.scope != self.scope || !seen.insert(record.source_id.clone()) {
                        continue;
                    }
                    if let Some(memory) = approved.iter().find(|m| m.record == record) {
                        result.memories.push(memory.clone());
                        provider_count += 1;
                    }
                }
                if provider_count >= query.limit || approved.len() < types::MAX_PROVIDER_RECORDS {
                    break;
                }
            }
        }
        let generations = self
            .core
            .admission
            .lock()
            .map_err(|_| MemoryError::Unavailable)?;
        if cancel.is_cancelled() {
            return Err(MemoryError::Cancelled);
        }
        let mut admitted = Vec::new();
        for memory in result.memories {
            if self.core.store.enabled(&memory.provider_id)?
                && read_generations.get(&memory.provider_id)
                    == Some(generations.get(&memory.provider_id).unwrap_or(&0))
                && self
                    .core
                    .store
                    .get(&memory.provider_id, &self.scope, &memory.record.source_id)?
                    .is_some_and(|current| current == memory)
                && memory.record.hash(&memory.provider_id)? == memory.approval.content_hash
            {
                admitted.push(memory);
            }
        }
        admitted.truncate(query.limit);
        result.memories = admitted;
        Ok(result)
    }
}

async fn bounded_retrieve(
    provider: &dyn MemoryProvider,
    request: ProviderRequest,
    cancel: CancellationToken,
    deadline: tokio::time::Instant,
) -> Result<Vec<MemoryRecord>, MemoryError> {
    if tokio::time::Instant::now() >= deadline {
        return Err(MemoryError::Unavailable);
    }
    let child = cancel.child_token();
    let result = tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MemoryError::Cancelled),
        result = tokio::time::timeout_at(deadline, provider.retrieve(request, child.clone())) => result.unwrap_or(Err(MemoryError::Unavailable)),
    };
    child.cancel();
    let records = result?;
    if records.len() > types::MAX_PROVIDER_RECORDS {
        return Err(MemoryError::Invalid);
    }
    for record in &records {
        record.validate()?;
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct StalledProvider(Mutex<Option<CancellationToken>>);
    impl MemoryProvider for StalledProvider {
        fn id(&self) -> &str {
            "stalled"
        }
        fn retrieve(
            &self,
            _request: ProviderRequest,
            cancel: CancellationToken,
        ) -> ProviderFuture<'_> {
            *self.0.lock().unwrap() = Some(cancel);
            Box::pin(std::future::pending())
        }
    }

    #[tokio::test]
    async fn shared_deadline_cancels_provider_work_and_rejects_later_pages() {
        let provider = StalledProvider(Mutex::new(None));
        let request = || ProviderRequest {
            scope: MemoryScope {
                project_id: "project".into(),
                session_id: None,
            },
            source_ids: vec!["one".into()],
        };
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(10);
        assert_eq!(
            bounded_retrieve(&provider, request(), CancellationToken::new(), deadline)
                .await
                .unwrap_err(),
            MemoryError::Unavailable
        );
        assert!(provider.0.lock().unwrap().take().unwrap().is_cancelled());
        assert_eq!(
            bounded_retrieve(&provider, request(), CancellationToken::new(), deadline)
                .await
                .unwrap_err(),
            MemoryError::Unavailable
        );
        assert!(provider.0.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn retention_prunes_content_and_approval_and_expired_reviews_cannot_activate() {
        let core = Arc::new(MemoryCore::in_memory().unwrap());
        let scope = MemoryScope {
            project_id: "project".into(),
            session_id: None,
        };
        let record = MemoryRecord {
            source_id: "one".into(),
            scope: scope.clone(),
            content: "short lived note".into(),
            provenance: Provenance {
                source: "user".into(),
                revision: "1".into(),
            },
        };
        let review = core.review_native(record.clone()).unwrap();
        let approval = core
            .approve(&review.review_id, RetentionPolicy::Days { days: 1 })
            .await
            .unwrap();
        core.store.prune(approval.expires_at.unwrap()).unwrap();
        assert!(
            core.store
                .get(NATIVE_PROVIDER, &scope, "one")
                .unwrap()
                .is_none()
        );
        let reader = core
            .bind_reader(scope, vec![NATIVE_PROVIDER.into()], MemoryRoute::Local)
            .unwrap();
        assert!(
            reader
                .retrieve(
                    MemoryQuery {
                        text: String::new(),
                        limit: 1
                    },
                    CancellationToken::new()
                )
                .await
                .unwrap()
                .memories
                .is_empty()
        );
        let review = core.review_native(record).unwrap();
        core.reviews
            .lock()
            .unwrap()
            .get_mut(&review.review_id)
            .unwrap()
            .created = Instant::now() - std::time::Duration::from_secs(301);
        assert_eq!(
            core.approve(&review.review_id, RetentionPolicy::UntilDeleted)
                .await
                .unwrap_err(),
            MemoryError::ApprovalRequired
        );
    }
}
