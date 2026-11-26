pub mod embedding;
pub mod enrichment;
pub mod extraction;
pub mod index;
pub mod index_worker;
pub mod indexing;
pub mod matching;
pub mod metadata;
pub mod opening;
pub mod preview;
pub mod ranking;
pub mod root_policy;
pub mod traversal;
pub mod types;
pub mod winsearch_engine;
pub mod winsearch_search;

use std::path::Path;

pub use index::{
    DeletedIndexData, EnrichmentJobRecord, HistoryClearResult, HistoryStatus, IndexedHit,
    VectorStatus,
};
pub use indexing::{
    HybridHit, HybridSearchResponse, IndexLifecycleDeps, IndexRootRequest, IndexRuntime,
    IndexStatus, NativeDiagnostics, PinUpdateResult, SearchFilterRequest, SemanticPhase,
    SemanticRetrievalStatus, SemanticSearchStatus,
};
pub use types::{
    BasicPreview, FileKind, FileListResponse, FileRecord, FilenameMatch, FilenamePolicyRequest,
    FilenameSearchResponse, PreviewChild, PreviewKind, SearchFailure, SearchWarning,
};

pub fn indexed_file_metadata(
    index: &IndexRuntime,
    stable_id: &str,
) -> Result<FileRecord, SearchFailure> {
    let (root, path) = index.file_location(stable_id)?.ok_or_else(|| {
        SearchFailure::new(
            "not-found",
            "The indexed file is no longer available.",
            None,
        )
    })?;
    metadata::get_file_metadata_impl(&root, &path)
}

pub fn open_indexed_file(index: &IndexRuntime, stable_id: &str) -> Result<(), SearchFailure> {
    let (root, path) = index.file_location(stable_id)?.ok_or_else(|| {
        SearchFailure::new(
            "not-found",
            "The indexed file is no longer available.",
            None,
        )
    })?;
    opening::open_file_impl(&root, &path)?;
    index.record_file_open(stable_id)?;
    Ok(())
}

pub async fn list_files(root: String) -> Result<FileListResponse, SearchFailure> {
    crate::async_runtime::spawn_blocking(move || traversal::list_files_impl(Path::new(&root)))
        .await
        .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
}

pub async fn search_filenames(
    root: String,
    query: String,
    policy: Option<types::FilenamePolicyRequest>,
    scope: Option<String>,
    filters: Option<Vec<indexing::SearchFilterRequest>>,
    improvement: Option<&crate::improvement::coordinator::ImprovementRuntime>,
    registry: Option<&crate::gateway::registry::ProviderRegistry>,
) -> Result<FilenameSearchResponse, SearchFailure> {
    let version = improvement.zip(registry).map(|(imp, reg)| imp.capture(reg));
    let began = std::time::Instant::now();
    let result = crate::async_runtime::spawn_blocking(move || {
        if let Some(policy) = policy {
            let max_bytes = policy
                .max_file_size_mb
                .checked_mul(1024 * 1024)
                .ok_or_else(|| {
                    SearchFailure::new("invalid-root", "The maximum file size is invalid.", None)
                })?;
            let policy = traversal::TraversalPolicy::new(
                policy.exclusions,
                policy.include_hidden,
                max_bytes,
            )?;
            matching::search_filenames_filtered(
                Path::new(&root),
                &query,
                &policy,
                scope.as_deref().unwrap_or("all"),
                filters.as_deref().unwrap_or_default(),
            )
        } else {
            matching::search_filenames_filtered(
                Path::new(&root),
                &query,
                &traversal::TraversalPolicy::default(),
                scope.as_deref().unwrap_or("all"),
                filters.as_deref().unwrap_or_default(),
            )
        }
    })
    .await
    .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))
    .and_then(|result| result);
    if let (Some(imp), Some(ver)) = (improvement, version.as_ref()) {
        record_search_trace(imp, ver, began, &result);
    }
    result
}

pub(crate) fn record_search_trace<T>(
    runtime: &crate::improvement::coordinator::ImprovementRuntime,
    version: &crate::improvement::types::HarnessVersion,
    began: std::time::Instant,
    result: &Result<T, SearchFailure>,
) {
    use crate::improvement::types::*;
    let _ = runtime.store.append_trace(&ExecutionTrace {
        id: uuid::Uuid::new_v4().to_string(),
        at: now_ms(),
        tool_id: ToolId::FilesSearch,
        model: digest(b"lumen-native-search-v1"),
        route: "lumen.search".into(),
        error_code: match result.as_ref().err().map(|error| error.code.as_str()) {
            None => TraceError::None,
            Some("permission-denied" | "outside-root" | "invalid-root") => {
                TraceError::PermissionDenied
            }
            _ => TraceError::UnknownFailure,
        },
        outcome: if result.is_ok() {
            TraceOutcome::Completed
        } else {
            TraceOutcome::Failed
        },
        verified: false,
        duration_ms: began.elapsed().as_millis() as u64,
        input_tokens: None,
        output_tokens: None,
        harness_version: version.id,
    });
}

pub async fn get_file_metadata(root: String, path: String) -> Result<FileRecord, SearchFailure> {
    crate::async_runtime::spawn_blocking(move || {
        metadata::get_file_metadata_impl(Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|error| SearchFailure::new("search-failed", error.to_string(), None))?
}

pub async fn get_basic_preview(
    privacy: &crate::privacy::PrivacyRuntime,
    index: &IndexRuntime,
    root: String,
    path: String,
) -> Result<BasicPreview, SearchFailure> {
    privacy.ensure_previews_enabled()?;
    let privacy = privacy.clone();
    let index = index.clone();
    crate::async_runtime::spawn_blocking(move || {
        privacy.ensure_previews_enabled()?;
        preview::get_indexed_preview(&index, &privacy, Path::new(&root), Path::new(&path))
    })
    .await
    .map_err(|error| SearchFailure::new("preview-failed", error.to_string(), None))?
}

pub fn open_file(index: &IndexRuntime, root: &Path, path: &Path) -> Result<(), SearchFailure> {
    opening::open_file_impl(root, path)?;
    let canonical = root_policy::canonicalize_confined(root, path)?;
    if let Some(stable_id) = index.stable_id_for_path(&canonical)? {
        index.record_file_open(&stable_id)?;
    }
    Ok(())
}

pub fn open_containing_folder(root: &Path, path: &Path) -> Result<(), SearchFailure> {
    opening::open_containing_folder_impl(root, path)
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn small_pdf(text: Option<&str>) -> Vec<u8> {
        use std::fmt::Write as _;
        let content = text
            .map(|text| format!("BT /F1 12 Tf 40 700 Td ({text}) Tj ET"))
            .unwrap_or_default();
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_owned(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_owned(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_owned(),
            format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
        ];
        let mut pdf = "%PDF-1.4\n".to_owned();
        let mut offsets = Vec::new();
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            write!(pdf, "{} 0 obj\n{object}\nendobj\n", index + 1).unwrap();
        }
        let xref = pdf.len();
        pdf.push_str("xref\n0 6\n0000000000 65535 f \n");
        for offset in offsets {
            writeln!(pdf, "{offset:010} 00000 n ").unwrap();
        }
        write!(
            pdf,
            "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
        )
        .unwrap();
        pdf.into_bytes()
    }

    pub struct SearchFixture {
        base: PathBuf,
        root: PathBuf,
        outside: PathBuf,
    }

    impl SearchFixture {
        pub fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = std::env::temp_dir().join(format!(
                "lumen-search-{label}-{}-{nonce}",
                std::process::id()
            ));
            let root = base.join("root");
            let outside = base.join("outside");
            fs::create_dir_all(&root).unwrap();
            fs::create_dir_all(&outside).unwrap();
            Self {
                base,
                root,
                outside,
            }
        }

        pub fn root(&self) -> &Path {
            &self.root
        }

        pub fn file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.root.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, bytes).unwrap();
            path
        }

        pub fn outside_file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.outside.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, bytes).unwrap();
            path
        }
    }

    impl Drop for SearchFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }
}
