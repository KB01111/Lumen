use std::{env, fs::File, io::Read, path::PathBuf};

use sha2::{Digest, Sha256};

const COMPUTER_USE_BINARY: &str = "binaries/lumen-computer-use-x86_64-pc-windows-msvc.exe";
const MAX_COMPUTER_USE_BINARY_BYTES: u64 = 128 * 1024 * 1024;

fn computer_use_sha256(binary: &PathBuf) -> Result<String, String> {
    let metadata = binary
        .metadata()
        .map_err(|error| format!("could not inspect {}: {error}", binary.display()))?;
    if !metadata.is_file() {
        return Err(format!("{} is not a file", binary.display()));
    }
    if metadata.len() > MAX_COMPUTER_USE_BINARY_BYTES {
        return Err(format!(
            "{} exceeds the {} MiB integrity limit",
            binary.display(),
            MAX_COMPUTER_USE_BINARY_BYTES / (1024 * 1024)
        ));
    }

    let mut file = File::open(binary)
        .map_err(|error| format!("could not open {}: {error}", binary.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut total = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("could not read {}: {error}", binary.display()))?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read as u64);
        if total > MAX_COMPUTER_USE_BINARY_BYTES {
            return Err(format!(
                "{} exceeds the {} MiB integrity limit",
                binary.display(),
                MAX_COMPUTER_USE_BINARY_BYTES / (1024 * 1024)
            ));
        }
        digest.update(&buffer[..read]);
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn main() {
    let binary = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join(COMPUTER_USE_BINARY);
    println!("cargo:rerun-if-changed={}", binary.display());
    let expected_digest = match computer_use_sha256(&binary) {
        Ok(digest) => digest,
        Err(error) if env::var("PROFILE").as_deref() == Ok("release") => {
            panic!("A release build requires an integrity-pinned Computer Use worker: {error}");
        }
        Err(error) => {
            println!(
                "cargo:warning=Computer Use worker is unavailable for this non-release build: {error}"
            );
            String::new()
        }
    };
    println!("cargo:rustc-env=LUMEN_COMPUTER_USE_SHA256={expected_digest}");
    tauri_build::build()
}
