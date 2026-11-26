//! Unified in-process runtime facade composing every Lumen backend service.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
};

use tokio::sync::Mutex as AsyncMutex;

use crate::{
    EventChannel,
    activity::{ActivityPolicy, ActivityRuntime, ActivitySnapshot, BackgroundPolicy},
    agent_memory::AgentMemoryRuntime,
    apps::AppCatalog,
    clipboard::ClipboardHistory,
    computer_use::{
        ComputerUseEvent, ComputerUseHealth, ComputerUseRequest, ComputerUseSupervisor,
        StopReason, WindowTarget,
    },
    consent::PersistedConsent,
    gateway::{
        EnrichmentSupervisor, GatewaySupervisor, LocalRuntimeSupervisor,
        answer::{AnswerDelivery, AnswerEvent, AnswerRequest, AnswerRuntime},
        mcp::McpRuntime,
        provisioning::ProvisioningManager,
        registry::ProviderRegistry,
    },
    improvement::coordinator::{ImprovementDeps, ImprovementRuntime},
    privacy::PrivacyRuntime,
    provider_switcher::ProviderSwitcherSupervisor,
    search::{
        self, BasicPreview, DeletedIndexData, HistoryClearResult, HybridHit, HybridSearchResponse,
        IndexLifecycleDeps, IndexRootRequest, IndexRuntime, IndexStatus, IndexedHit,
        NativeDiagnostics, PinUpdateResult, SearchFailure, SearchFilterRequest,
        SemanticRetrievalStatus, SemanticSearchStatus,
        winsearch_engine::EngineRuntime,
    },
    settings::{APP_IDENTIFIER, LumenSettings, SettingsStore, ShortcutStatus},
    windows_ai::WindowsAiRuntime,
};

#[derive(Clone, Debug)]
pub struct LumenPaths {
    pub data_dir: PathBuf,
    pub sidecar_dir: PathBuf,
    pub resource_dir: PathBuf,
}

impl LumenPaths {
    pub fn discover() -> Self {
        let data_dir = directories::BaseDirs::new()
            .map(|dirs| dirs.data_dir().join(APP_IDENTIFIER))
            .unwrap_or_else(|| std::env::temp_dir().join("lumen-data"));
        let tauri_dir = PathBuf::from(env!("LUMEN_TAURI_DIR"));
        let sidecar_dir = tauri_dir.join("binaries");
        let resource_dir = tauri_dir.join("resources");
        Self {
            data_dir,
            sidecar_dir,
            resource_dir,
        }
    }
}

#[derive(Clone, Debug)]
pub struct FileSearchOutcome {
    pub hits: Vec<HybridHit>,
    pub ranges: Vec<Vec<[usize; 2]>>,
    pub semantic: SemanticRetrievalStatus,
    pub degradation: Option<String>,
}

pub struct LumenRuntime {
    pub paths: LumenPaths,
    pub settings: Arc<SettingsStore>,
    pub index: IndexRuntime,
    pub winsearch: Arc<EngineRuntime>,
    pub activity: Arc<ActivityRuntime>,
    pub privacy: Arc<PrivacyRuntime>,
    pub consent: Arc<PersistedConsent>,
    pub gateway: Arc<GatewaySupervisor>,
    pub local_runtime: Arc<LocalRuntimeSupervisor>,
    pub registry: Arc<ProviderRegistry>,
    pub mcp: Arc<McpRuntime>,
    pub enrichment: Arc<EnrichmentSupervisor>,
    pub provisioning: Arc<ProvisioningManager>,
    pub answer: Arc<AnswerRuntime>,
    pub computer_use: Arc<ComputerUseSupervisor>,
    pub improvement: Arc<ImprovementRuntime>,
    pub cliproxy: Arc<AsyncMutex<ProviderSwitcherSupervisor>>,
    pub windows_ai: Arc<WindowsAiRuntime>,
    pub agent_memory: Arc<AgentMemoryRuntime>,
    pub apps: Arc<AppCatalog>,
    pub clipboard: Arc<ClipboardHistory>,
}

impl LumenRuntime {
    /// Initializes every Lumen backend service in-process and starts background lifecycle workers.
    pub fn initialize(
        paths: LumenPaths,
        tokio_handle: &tokio::runtime::Handle,
    ) -> Result<Arc<Self>, String> {
        let _guard = tokio_handle.enter();
        std::fs::create_dir_all(&paths.data_dir)
            .map_err(|error| format!("Could not prepare Lumen data directory: {error}"))?;

        let settings_path = paths.data_dir.join("lumen.settings.json");
        let settings = Arc::new(SettingsStore::load(settings_path.clone()));
        let consent = Arc::new(PersistedConsent::new(settings_path.clone()));
        let privacy = Arc::new(PrivacyRuntime::load(&settings_path));
        let activity = Arc::new(ActivityRuntime::load(&settings_path));
        let mcp = Arc::new(McpRuntime::load(
            paths.data_dir.join("mcp-permissions.json"),
        ));
        let history_enabled = crate::privacy::load_history_enabled(&settings_path);

        let agent_memory = Arc::new(AgentMemoryRuntime::new(
            paths.data_dir.join("lumen-agent-memory.sqlite3"),
        ));

        let registry = Arc::new(ProviderRegistry::load(
            paths.data_dir.join("provider-routes.json"),
        ));
        let gateway_sidecar = paths
            .sidecar_dir
            .join("agentgateway-x86_64-pc-windows-msvc.exe");
        let gateway = Arc::new(GatewaySupervisor::new(
            gateway_sidecar,
            &paths.data_dir.join("runtime"),
            &registry.routes(),
        )?);
        let _ = gateway.start();

        let answer = Arc::new(AnswerRuntime::default());
        let provisioning = Arc::new(ProvisioningManager::new(paths.data_dir.clone()));
        let local_runtime = Arc::new(LocalRuntimeSupervisor::detect(Some(paths.data_dir.clone())));

        let staged_cu = paths
            .sidecar_dir
            .join("lumen-computer-use-x86_64-pc-windows-msvc.exe");
        let source_cu = paths
            .sidecar_dir
            .join("../../workers/computer-use-preview/worker.py");
        let computer_use = Arc::new(ComputerUseSupervisor::detect(
            paths.resource_dir.join("lumen-computer-use.exe"),
            staged_cu,
            source_cu,
            settings_path.clone(),
            paths.data_dir.clone(),
        ));

        let mut cliproxy = ProviderSwitcherSupervisor::new(
            &paths.resource_dir.join("cliproxy-sidecar.exe"),
            &paths
                .sidecar_dir
                .join("cliproxy-sidecar-x86_64-pc-windows-msvc.exe"),
            &paths.data_dir.join("cliproxy"),
        );
        let _ = cliproxy.start();
        let cliproxy = Arc::new(AsyncMutex::new(cliproxy));

        let enrichment = Arc::new(EnrichmentSupervisor::new(
            paths
                .sidecar_dir
                .join("lumen-enrichment-x86_64-pc-windows-msvc.exe"),
            paths
                .sidecar_dir
                .join("lumen-rivet-engine-x86_64-pc-windows-msvc.exe"),
            paths.data_dir.join("enrichment"),
        )?);
        let _ = enrichment.start();

        let improvement = Arc::new(ImprovementRuntime::open(
            &paths.data_dir.join("lumen-improvement.sqlite3"),
            paths.resource_dir.join("improvement"),
        )?);
        computer_use.set_improvement(Arc::clone(&improvement));

        let winsearch = Arc::new(EngineRuntime::new(
            paths.resource_dir.clone(),
            paths.data_dir.join("winsearch-engine"),
        ));
        winsearch.set_background_normal(
            activity.snapshot().background_policy == BackgroundPolicy::Normal,
        );

        let vector_ext = paths.sidecar_dir.join("vector.dll");
        let index = IndexRuntime::open(
            &paths.data_dir.join("lumen-index.sqlite3"),
            &vector_ext,
            history_enabled,
        )
        .map_err(|e| e.message)?;

        let windows_ai = Arc::new(WindowsAiRuntime::new(&paths.data_dir, &paths.resource_dir));
        let apps = Arc::new(AppCatalog::default());
        let clipboard = Arc::new(ClipboardHistory::default());

        let runtime = Arc::new(Self {
            paths,
            settings,
            index,
            winsearch,
            activity,
            privacy,
            consent,
            gateway,
            local_runtime,
            registry,
            mcp,
            enrichment,
            provisioning,
            answer,
            computer_use,
            improvement,
            cliproxy,
            windows_ai,
            agent_memory,
            apps,
            clipboard,
        });

        // Start background workers on the Tokio runtime.
        runtime.start_background_services(tokio_handle);
        Ok(runtime)
    }

    fn start_background_services(self: &Arc<Self>, tokio_handle: &tokio::runtime::Handle) {
        let _guard = tokio_handle.enter();

        // 1. Discover installed Windows Start Menu apps off the UI thread.
        let apps = Arc::clone(&self.apps);
        tokio_handle.spawn_blocking(move || {
            let _ = apps.refresh();
        });

        // 2. Warm up verified WinSearch engine if staged.
        let warm_engine = Arc::clone(&self.winsearch);
        tokio_handle.spawn(async move {
            let _ = warm_engine.status().await;
        });

        // 3. Synchronize any persisted indexed roots immediately.
        let rt_for_roots = Arc::clone(self);
        tokio_handle.spawn(async move {
            let _ = rt_for_roots.synchronize_roots().await;
        });

        // 4. Start background SQLite/embedding/enrichment lifecycle.
        self.index.start_index_lifecycle(IndexLifecycleDeps {
            activity: Arc::clone(&self.activity),
            enrichment: Arc::clone(&self.enrichment),
            gateway: Arc::clone(&self.gateway),
            local_runtime: Arc::clone(&self.local_runtime),
            registry: Arc::clone(&self.registry),
        });

        // 5. Start background self-improvement scheduler (dormant unless explicitly enabled).
        self.improvement.clone().start_scheduler(ImprovementDeps {
            activity: Arc::clone(&self.activity),
            answer: Arc::clone(&self.answer),
            computer_use: Arc::clone(&self.computer_use),
            enrichment: Arc::clone(&self.enrichment),
            gateway: Arc::clone(&self.gateway),
            local_runtime: Arc::clone(&self.local_runtime),
            registry: Arc::clone(&self.registry),
            improvement: Arc::clone(&self.improvement),
        });
    }

    /// Synchronizes all active (non-paused) configured roots with both SQLite and WinSearch.
    pub async fn synchronize_roots(&self) -> Result<IndexStatus, SearchFailure> {
        let roots = self.settings.snapshot().active_index_roots();
        search::indexing::synchronize_index_roots(
            &self.index,
            Arc::clone(&self.winsearch),
            &self.activity,
            roots,
        )
        .await
    }

    pub fn index_status(&self) -> IndexStatus {
        self.index.snapshot()
    }

    pub fn semantic_status(&self) -> Result<SemanticSearchStatus, SearchFailure> {
        search::indexing::get_semantic_search_status(&self.index, &self.registry)
    }

    /// Unified local file search: prefers live WinSearch engine when configured, falls back to
    /// SQLite hybrid (FTS5 + vector + rerank), and finally to policy-aware filename traversal.
    pub async fn search_files(
        &self,
        request_id: u64,
        query: String,
        scope: String,
        filters: Vec<SearchFilterRequest>,
        limit: usize,
        on_update: Option<EventChannel<HybridSearchResponse>>,
    ) -> Result<FileSearchOutcome, SearchFailure> {
        let settings = self.settings.snapshot();
        let active_roots = settings.active_index_roots();
        if active_roots.is_empty() {
            return Ok(FileSearchOutcome {
                hits: Vec::new(),
                ranges: Vec::new(),
                semantic: SemanticRetrievalStatus {
                    phase: search::SemanticPhase::Disabled,
                    reason: None,
                },
                degradation: None,
            });
        }
        let prefs = &settings.management.search;

        // 1. Try WinSearch engine when default ranking weights are active and scope is supported.
        if scope != "recent"
            && scope != "related"
            && prefs.filename_priority == 82
            && prefs.recency == "balanced"
            && let Ok(resp) = search::winsearch_search::search_winsearch(
                &self.index,
                Arc::clone(&self.winsearch),
                request_id,
                query.clone(),
                scope.clone(),
                filters.clone(),
                limit,
                prefs.semantic_enabled,
                on_update,
            )
            .await
            && !resp.items.is_empty()
        {
            let ranges = compute_match_ranges(&resp.items, &query);
            return Ok(FileSearchOutcome {
                hits: resp.items,
                ranges,
                semantic: resp.semantic,
                degradation: None,
            });
        }

        // 2. Hybrid local SQLite + FTS5 + sqlite-vector search.
        match search::indexing::search_hybrid(
            &self.index,
            &self.gateway,
            &self.local_runtime,
            &self.registry,
            &self.improvement,
            request_id,
            query.clone(),
            scope.clone(),
            filters.clone(),
            limit,
            prefs.filename_priority,
            prefs.recency.clone(),
            prefs.show_pinned,
            prefs.semantic_enabled,
            prefs.reranking_enabled,
        )
        .await
        {
            Ok(resp) if !resp.items.is_empty() || scope == "recent" => {
                let degradation = if resp.semantic.phase == search::SemanticPhase::Degraded {
                    resp.semantic.reason.clone()
                } else {
                    None
                };
                let ranges = compute_match_ranges(&resp.items, &query);
                return Ok(FileSearchOutcome {
                    hits: resp.items,
                    ranges,
                    semantic: resp.semantic,
                    degradation,
                });
            }
            Ok(_) if query.trim().is_empty() => {
                return Ok(FileSearchOutcome {
                    hits: Vec::new(),
                    ranges: Vec::new(),
                    semantic: SemanticRetrievalStatus {
                        phase: search::SemanticPhase::Disabled,
                        reason: None,
                    },
                    degradation: None,
                });
            }
            _ => {}
        }

        // 3. Policy-aware filename traversal fallback (for newly added folders still indexing).
        let (hits, ranges) = self
            .fallback_filename_search(&active_roots, &query, &scope, &filters, limit)
            .await?;
        Ok(FileSearchOutcome {
            hits,
            ranges,
            semantic: SemanticRetrievalStatus {
                phase: search::SemanticPhase::Disabled,
                reason: None,
            },
            degradation: None,
        })
    }

    async fn fallback_filename_search(
        &self,
        roots: &[IndexRootRequest],
        query: &str,
        scope: &str,
        filters: &[SearchFilterRequest],
        limit: usize,
    ) -> Result<(Vec<HybridHit>, Vec<Vec<[usize; 2]>>), SearchFailure> {
        let mut combined: Vec<(HybridHit, Vec<[usize; 2]>, f64)> = Vec::new();
        let mut seen = HashSet::new();
        for root in roots {
            let policy = Some(search::FilenamePolicyRequest {
                exclusions: root.exclusions.clone(),
                include_hidden: root.include_hidden,
                max_file_size_mb: root.max_file_size_mb,
            });
            let Ok(resp) = search::search_filenames(
                root.path.clone(),
                query.to_owned(),
                policy,
                Some(scope.to_owned()),
                Some(filters.to_vec()),
                Some(&self.improvement),
                Some(&self.registry),
            )
            .await
            else {
                continue;
            };
            for item in resp.items {
                let key = item.file.path.to_lowercase();
                if !seen.insert(key) {
                    continue;
                }
                let hit = HybridHit {
                    hit: IndexedHit {
                        stable_id: format!("local:{}", item.file.path),
                        root_path: PathBuf::from(&root.path),
                        path: PathBuf::from(&item.file.path),
                        name: item.file.name.clone(),
                        content_hash: String::new(),
                        index_revision: 1,
                        extraction_kind: "filename".into(),
                        snippet: item.file.relative_path.clone(),
                        page: None,
                        time_start_ms: None,
                        time_end_ms: None,
                        rank: (1.0 - item.score).clamp(0.0, 1.0),
                    },
                    metadata: item.file,
                    match_source: "filename".into(),
                    semantic_score: None,
                    embedding_model: None,
                    pinned: false,
                };
                combined.push((hit, item.ranges, item.score));
            }
        }
        combined.sort_by(|a, b| b.2.total_cmp(&a.2).then_with(|| a.0.hit.name.cmp(&b.0.hit.name)));
        combined.truncate(limit);
        let mut hits = Vec::with_capacity(combined.len());
        let mut ranges = Vec::with_capacity(combined.len());
        for (h, r, _) in combined {
            hits.push(h);
            ranges.push(r);
        }
        Ok((hits, ranges))
    }

    pub fn cancel_search(&self, request_id: u64) {
        search::winsearch_search::cancel_winsearch_search(&self.index, request_id);
    }

    pub async fn get_preview(
        &self,
        root: String,
        path: String,
    ) -> Result<BasicPreview, SearchFailure> {
        search::get_basic_preview(&self.privacy, &self.index, root, path).await
    }

    pub fn open_file(&self, root: &Path, path: &Path) -> Result<(), SearchFailure> {
        search::open_file(&self.index, root, path)
    }

    pub fn open_containing_folder(&self, root: &Path, path: &Path) -> Result<(), SearchFailure> {
        search::open_containing_folder(root, path)
    }

    pub fn set_pinned(&self, stable_id: &str, pinned: bool) -> Result<PinUpdateResult, SearchFailure> {
        search::indexing::set_indexed_file_pinned(&self.index, stable_id, pinned)
    }

    pub async fn search_related(
        &self,
        stable_id: String,
        limit: usize,
    ) -> Result<Vec<HybridHit>, SearchFailure> {
        search::indexing::search_related(
            &self.index,
            &self.gateway,
            &self.local_runtime,
            &self.registry,
            stable_id,
            limit,
            Vec::new(),
        )
        .await
    }

    pub async fn start_answer(
        &self,
        request: AnswerRequest,
        on_event: EventChannel<AnswerEvent>,
    ) -> Result<AnswerDelivery, String> {
        crate::gateway::answer::start_answer(
            request,
            on_event,
            &self.answer,
            &self.gateway,
            &self.local_runtime,
            &self.index,
            &self.consent,
            &self.registry,
            &self.improvement,
        )
        .await
    }

    pub fn cancel_answer(&self, request_id: u64) {
        self.answer.cancel(request_id);
    }

    pub async fn computer_use_health(&self) -> ComputerUseHealth {
        self.computer_use.health().await
    }

    pub fn computer_use_targets(&self) -> Result<Vec<WindowTarget>, String> {
        self.computer_use.targets()
    }

    pub fn start_computer_use(
        &self,
        request: ComputerUseRequest,
        on_event: EventChannel<ComputerUseEvent>,
    ) -> Result<(), String> {
        let harness = self.improvement.computer_use_harness(
            &self.registry,
            request.provider.id(),
            &request.model,
        );
        self.improvement.cancel(true);
        self.computer_use
            .start_with_harness(request, on_event, harness)
    }

    pub fn respond_computer_use_approval(
        &self,
        task_id: u64,
        approval_id: &str,
        approved: bool,
    ) -> Result<(), String> {
        self.computer_use.respond(task_id, approval_id, approved)
    }

    pub fn stop_computer_use(&self, task_id: u64, reason: StopReason) -> Result<(), String> {
        self.computer_use.stop(task_id, reason)
    }

    pub fn activity_snapshot(&self) -> ActivitySnapshot {
        let snapshot = self.activity.snapshot();
        crate::activity::apply_snapshot_to_runtimes(
            &snapshot,
            &self.index,
            &self.enrichment,
            &self.winsearch,
        );
        snapshot
    }

    pub fn set_user_pause(&self, paused: bool) -> Result<ActivitySnapshot, String> {
        let snapshot = self.activity.set_user_paused(paused)?;
        crate::activity::apply_snapshot_to_runtimes(
            &snapshot,
            &self.index,
            &self.enrichment,
            &self.winsearch,
        );
        Ok(snapshot)
    }

    pub fn set_activity_policy(&self, policy: ActivityPolicy) -> Result<ActivitySnapshot, String> {
        let snapshot = self.activity.set_policy(policy)?;
        crate::activity::apply_snapshot_to_runtimes(
            &snapshot,
            &self.index,
            &self.enrichment,
            &self.winsearch,
        );
        Ok(snapshot)
    }

    pub fn native_diagnostics(
        &self,
        shortcut: ShortcutStatus,
    ) -> Result<NativeDiagnostics, SearchFailure> {
        search::indexing::get_native_diagnostics(
            &self.index,
            &self.activity,
            &self.gateway,
            &self.mcp,
            &self.local_runtime,
            &self.provisioning,
            &self.registry,
            shortcut,
        )
    }

    pub fn export_sanitized_diagnostics(
        &self,
        dest: &Path,
        shortcut: ShortcutStatus,
    ) -> Result<(), String> {
        let diag = self
            .native_diagnostics(shortcut)
            .map_err(|e| e.message)?;
        let json = serde_json::to_string(&diag)
            .map_err(|_| "Could not serialize diagnostics snapshot.".to_owned())?;
        crate::privacy::write_sanitized_diagnostics(dest, &json)
    }

    pub fn clear_search_history(&self) -> Result<HistoryClearResult, SearchFailure> {
        search::indexing::clear_search_history(&self.index)
    }

    pub async fn delete_index_data(&self) -> Result<DeletedIndexData, SearchFailure> {
        search::indexing::delete_index_data(&self.index).await
    }

    pub fn update_settings<F>(&self, mutate: F) -> Result<LumenSettings, String>
    where
        F: FnOnce(&mut LumenSettings),
    {
        let updated = self.settings.update(mutate)?;
        self.privacy
            .set_previews_enabled(updated.management.privacy.previews_enabled);
        search::indexing::set_history_enabled(
            &self.index,
            updated.management.general.history_enabled,
        );
        Ok(updated)
    }

    pub fn shutdown(&self) {
        self.winsearch.shutdown();
        self.answer.cancel_all();
        self.index.stop_index_worker();
    }
}

fn compute_match_ranges(hits: &[HybridHit], query: &str) -> Vec<Vec<[usize; 2]>> {
    hits.iter()
        .map(|h| {
            crate::catalogue::fuzzy_match_ranges(&h.hit.name, query)
                .map(|(_, ranges)| ranges)
                .unwrap_or_default()
        })
        .collect()
}
