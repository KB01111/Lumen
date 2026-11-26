use std::path::Path;

fn main() {
    println!("cargo:rerun-if-env-changed=LUMEN_GATEWAY_BINDING");
    println!("cargo:rerun-if-env-changed=LUMEN_WINSEARCH_MANIFEST_SHA256");

    let tauri_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri");
    println!(
        "cargo:rustc-env=LUMEN_TAURI_DIR={}",
        tauri_dir.display()
    );

    let binding = std::env::var("LUMEN_GATEWAY_BINDING")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "lumen-unsigned-v1".to_owned());
    println!("cargo:rustc-env=LUMEN_GATEWAY_BINDING={binding}");

    // Read pinned WinSearch manifest SHA-256 if the sidecar payload is staged.
    let lock_path = tauri_dir.join("winsearch-payload.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());
    let manifest_sha256 = std::env::var("LUMEN_WINSEARCH_MANIFEST_SHA256")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            let contents = std::fs::read_to_string(&lock_path).ok()?;
            // Simple lightweight extraction without extra build-dependency crates.
            let marker = "\"manifestSha256\"";
            let after = contents.split_once(marker)?.1;
            let colon = after.split_once(':')?.1.trim_start();
            let quoted = colon.strip_prefix('"')?;
            let hash = quoted.split_once('"')?.0;
            let staged_manifest = tauri_dir.join("binaries/winsearch/payload.json");
            if staged_manifest.is_file()
                && hash.len() == 64
                && hash
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            {
                Some(hash.to_owned())
            } else {
                None
            }
        })
        .unwrap_or_default();
    println!("cargo:rustc-env=LUMEN_WINSEARCH_MANIFEST_SHA256={manifest_sha256}");
}
