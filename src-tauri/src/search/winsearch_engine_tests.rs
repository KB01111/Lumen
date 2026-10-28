use super::*;
use crate::search::test_support::SearchFixture;
use sha2::{Digest, Sha256};

fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn payload_fixture(fixture: &SearchFixture) -> (PathBuf, String) {
    let root = fixture.root().join("payload");
    std::fs::create_dir_all(&root).unwrap();
    let files = [
        "winsearchd.exe",
        "winsearch-embed.exe",
        "winsearch-extract.exe",
        "llama.dll",
    ]
    .map(|path| {
        let bytes = format!("synthetic verifier fixture: {path}").into_bytes();
        std::fs::write(root.join(path), &bytes).unwrap();
        serde_json::json!({"path":path,"sha256":digest(&bytes),"sizeBytes":bytes.len()})
    });
    let bytes = serde_json::to_vec(&serde_json::json!({
        "schemaVersion":1,"engineCommit":ENGINE_COMMIT,"target":"x86_64-pc-windows-msvc","files":files
    })).unwrap();
    std::fs::write(root.join("payload.json"), &bytes).unwrap();
    (root, digest(&bytes))
}

#[test]
fn engine_payload_verifies_every_byte_and_locks_files_until_owner_drops() {
    let fixture = SearchFixture::new("engine-native-verifier");
    let (root, expected) = payload_fixture(&fixture);
    no_links(&root).expect("plain fixture ancestors");
    let canonical = std::fs::canonicalize(&root).unwrap();
    no_links(&canonical).expect("canonical fixture ancestors");
    let _directory = locked_file(&canonical, true).expect("read-only directory guard");
    let _manifest = locked_file(&canonical.join("payload.json"), false).expect("manifest guard");
    let verified = verify_payload(&root, &expected).unwrap();
    assert_eq!(verified.root, std::fs::canonicalize(&root).unwrap());
    assert!(
        std::fs::OpenOptions::new()
            .write(true)
            .open(root.join("llama.dll"))
            .is_err()
    );
    drop(verified);
    std::fs::write(root.join("llama.dll"), b"changed after release").unwrap();
    assert!(verify_payload(&root, &expected).is_err());
}

#[test]
fn engine_payload_rejects_untrusted_manifest_and_unmanifested_dll() {
    let fixture = SearchFixture::new("engine-native-untrusted");
    let (root, expected) = payload_fixture(&fixture);
    assert!(verify_payload(&root, &"0".repeat(64)).is_err());
    std::fs::write(root.join("unexpected.dll"), b"not declared").unwrap();
    assert!(verify_payload(&root, &expected).is_err());
}

#[test]
fn engine_payload_rejects_missing_dependency_and_reparse_parent() {
    let fixture = SearchFixture::new("engine-native-missing");
    let (root, expected) = payload_fixture(&fixture);
    std::fs::remove_file(root.join("llama.dll")).unwrap();
    assert!(verify_payload(&root, &expected).is_err());
    #[cfg(windows)]
    {
        let alias = fixture.root().join("aliased");
        std::os::windows::fs::symlink_dir(&root, &alias).unwrap();
        assert!(verify_payload(&alias, &expected).is_err());
    }
}

#[test]
fn engine_runtime_cannot_admit_a_synthetic_package_against_compiled_anchor() {
    let fixture = SearchFixture::new("engine-native-anchor");
    let (root, synthetic_hash) = payload_fixture(&fixture);
    let lock: serde_json::Value =
        serde_json::from_str(include_str!("../../winsearch-payload.lock.json")).unwrap();
    let anchor = lock["manifestSha256"].as_str().unwrap();
    assert!(is_hash(anchor));
    assert_ne!(synthetic_hash, anchor);
    assert!(verify_payload(&root, anchor).is_err());
    let resources = fixture.root().join("resources");
    std::fs::create_dir_all(resources.join("binaries")).unwrap();
    std::fs::rename(root, resources.join("binaries/winsearch")).unwrap();
    let runtime = EngineRuntime::new(resources, fixture.root().join("data"));
    assert!(tauri::async_runtime::block_on(runtime.status()).is_err());
}

#[test]
#[cfg(windows)]
#[ignore = "Requires the real pinned staged release WinSearch payload; run explicitly after staging"]
fn engine_native_release_barrier_prevents_initialization_until_resume() {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::{Foundation::HANDLE, System::JobObjects::IsProcessInJob};
    use windows::core::BOOL;

    let fixture = SearchFixture::new("engine-release-barrier");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/winsearch");
    let payload = verify_payload(&root, env!("LUMEN_WINSEARCH_MANIFEST_SHA256")).unwrap();
    let data = fixture.root().join("owned-data");
    let process = spawn_gated(
        payload,
        data.clone(),
        format!("barrier-{}", uuid::Uuid::new_v4().simple()),
    )
    .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(200));
    assert!(
        !data.join("db").exists(),
        "release daemon initialized before ownership barrier was released"
    );
    let child = process.child.lock().unwrap();
    let mut owned = BOOL::default();
    unsafe {
        IsProcessInJob(
            HANDLE(child.as_raw_handle()),
            Some(HANDLE(process.job.0 as *mut _)),
            &mut owned,
        )
    }
    .unwrap();
    assert!(owned.as_bool());
    drop(child);
    process.release_gate().unwrap();
    tauri::async_runtime::block_on(process.client.info()).unwrap();
    assert!(data.join("db").is_dir());
}

#[test]
#[cfg(windows)]
#[ignore = "Requires the real pinned staged release WinSearch payload; run explicitly after staging"]
fn engine_native_release_barrier_stop_before_resume_creates_no_database() {
    let fixture = SearchFixture::new("engine-release-stop-before-resume");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/winsearch");
    let payload = verify_payload(&root, env!("LUMEN_WINSEARCH_MANIFEST_SHA256")).unwrap();
    let data = fixture.root().join("owned-data");
    let process = spawn_gated(
        payload,
        data.clone(),
        format!("stopped-{}", uuid::Uuid::new_v4().simple()),
    )
    .unwrap();
    process.kill();
    process.child.lock().unwrap().wait().unwrap();
    assert!(process.release_gate().is_err());
    assert!(!data.join("db").exists());
}

#[test]
#[ignore = "Requires the real pinned staged WinSearch payload; run explicitly after staging"]
fn engine_native_owned_profiles_authenticate_and_stop_independently() {
    let fixture = SearchFixture::new("engine-owned-native");
    let resources = Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf();
    let a = EngineRuntime::new(resources.clone(), fixture.root().join("profile-a"));
    let b = EngineRuntime::new(resources, fixture.root().join("profile-b"));
    tauri::async_runtime::block_on(async {
        assert_eq!(
            serde_json::to_value(a.status().await.unwrap()).unwrap()["state"],
            "paused"
        );
        assert_eq!(
            serde_json::to_value(b.status().await.unwrap()).unwrap()["state"],
            "paused"
        );
        let owner = a.process.lock().unwrap().as_ref().unwrap().clone();
        let other = b.process.lock().unwrap().as_ref().unwrap().clone();
        for process in [&owner, &other] {
            let info = process.client.info().await.unwrap();
            for capability in ["index.identity", "index.root_policies", "search.limits"] {
                assert!(
                    info.supports(capability),
                    "missing engine capability: {capability}"
                );
            }
        }
        let a_status = serde_json::to_value(owner.client.status().await.unwrap()).unwrap();
        let b_status = serde_json::to_value(other.client.status().await.unwrap()).unwrap();
        for status in [&a_status, &b_status] {
            let identity = status["index_id"].as_str().expect("durable index identity");
            assert_eq!(identity.len(), 32);
            assert!(
                identity
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            );
        }
        assert_ne!(a_status["index_id"], b_status["index_id"]);
        let owner_pid = owner.child.lock().unwrap().id();
        let other_pid = other.child.lock().unwrap().id();
        assert_ne!(owner_pid, other_pid);
        assert_ne!(a.instance, b.instance);
        let pipe = format!(
            r"\\.\pipe\winsearch-{}-{}",
            current_sid().unwrap(),
            a.instance
        );
        let wrong =
            ws_client::Client::for_process(pipe, std::num::NonZeroU32::new(other_pid).unwrap())
                .unwrap();
        assert!(matches!(
            wrong.info().await,
            Err(ws_client::Error::ServerIdentityMismatch)
        ));
        a.shutdown();
        assert!(a.status().await.is_err());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while owner.alive() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(!owner.alive(), "shutdown must terminate the owned process");
        assert!(b.status().await.is_ok());
        b.shutdown();
    });
}

#[test]
#[ignore = "Requires the real pinned staged WinSearch payload; run explicitly after staging"]
fn engine_native_search_streams_admitted_folder_and_maps_confined_hits() {
    use crate::search::{indexing::IndexRootRequest, winsearch_search};

    let fixture = SearchFixture::new("engine-native-search");
    let token = "lumennativesearchtoken";
    let file = fixture.file(
        &format!("docs/{token}-notes.txt"),
        format!("the {token} sentence lives in this admitted file").as_bytes(),
    );
    fixture.outside_file(&format!("{token}-outside.txt"), token.as_bytes());
    let engine = EngineRuntime::new(
        Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf(),
        fixture.root().join("engine-data"),
    );
    tauri::async_runtime::block_on(async {
        let roots = vec![IndexRootRequest {
            path: fixture.root().to_string_lossy().into_owned(),
            cloud_enrichment: false,
            exclusions: Vec::new(),
            include_hidden: false,
            max_file_size_mb: 16,
        }];
        engine.configure_roots(&roots, true).await.unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
        loop {
            let status = engine.status().await.unwrap();
            if engine_ready(&status) && status.queue_depth == 0 {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the admitted folder was not indexed: {status:?}"
            );
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        let query = winsearch_search::engine_query(token, "all", &[], 20, false).unwrap();
        let mut stream = engine.search_stream(query).await.unwrap();
        let mut mapped = Vec::new();
        while let Some(batch) = stream.next().await.unwrap() {
            let roots = engine.configured_roots();
            mapped.extend(
                batch
                    .batch
                    .iter()
                    .filter_map(|hit| winsearch_search::map_result(&roots, hit, &|_| None)),
            );
            if batch.done {
                break;
            }
        }
        assert!(
            mapped
                .iter()
                .any(|hit| hit.hit.name == file.file_name().unwrap().to_string_lossy()),
            "the admitted file was not returned: {mapped:?}"
        );
        assert!(
            mapped.iter().all(|hit| !hit.hit.name.contains("outside")),
            "an ungranted folder leaked into results"
        );
        assert!(
            mapped
                .iter()
                .all(|hit| hit.hit.stable_id.starts_with("winsearch:e"))
        );
        // Revoking every grant must pause the engine and leave nothing searchable by the host mapper.
        engine.configure_roots(&[], true).await.unwrap();
        assert!(engine.configured_roots().is_empty());
        engine.shutdown();
    });
}
