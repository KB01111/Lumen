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
    let (root, _) = payload_fixture(&fixture);
    let resources = fixture.root().join("resources");
    std::fs::create_dir_all(resources.join("binaries")).unwrap();
    std::fs::rename(root, resources.join("binaries/winsearch")).unwrap();
    let runtime = EngineRuntime::new(resources, fixture.root().join("data"));
    assert!(tauri::async_runtime::block_on(runtime.status()).is_err());
}

#[test]
#[ignore = "Requires the real pinned staged WinSearch payload; run explicitly after staging"]
fn engine_native_owned_profiles_authenticate_and_stop_independently() {
    let fixture = SearchFixture::new("engine-owned-native");
    let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug");
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
