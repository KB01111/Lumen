# SQLite-Vector Backend Acceptance

Date: 2026-08-12

## Implemented backend foundation

- Lumen declares Apache-2.0 licensing and records sqlite-vector's upstream Elastic License 2.0 plus open-source grant.
- `@sqliteai/sqlite-vector-win32-x86_64` is pinned exactly to `1.0.0`.
- The official `vector.dll` SHA-256 is `58ac4a99ff6904fd709f01b366cf0477c405b5bda45b96cf00e13d500aa60c6a`.
- Staging verifies that digest before copying the DLL to the trusted native binaries directory.
- Tauri bundles the DLL as a resource, not an executable sidecar.
- Rust chooses only the packaged resource or the fixed development artifact. No IPC, setting, environment variable, or command argument selects an extension path.
- Each vector-capable connection enables extension loading only for the literal trusted load, disables it immediately afterward, and verifies runtime version/backend.
- Schema version 2 adds ordinary `vector_embeddings` rows and leaves the legacy `vec0` schema inert. Migration preserves files, chunks, and FTS rows without direct `sqlite_schema` writes; old vectors are ignored and rebuilt into the new table.
- Exact cosine retrieval validates dimension and finite values, stores little-endian FLOAT32 BLOBs, isolates model/dimension, and joins results back to confined chunk/file identities.
- A missing or unloadable vector runtime leaves lexical indexing and FTS search operational and returns a sanitized semantic-unavailable error.

## Focused evidence

- Expected RED: the loader smoke test failed to compile before `register_or_load_sqlite_vector` existed.
- Expected RED: migration initially failed with `no such module: vec0`; the safe distinct-table migration then passed while leaving the unavailable legacy module inert.
- Expected RED: the safety-review test initially found no `vector_embeddings` table; the revised migration now passes `PRAGMA integrity_check` without production `writable_schema` use.
- Expected RED: exact retrieval initially failed because the embedding methods did not exist and then passed.
- Expected RED: lexical fallback exposed an unsanitized loader error and then passed after sanitization.
- `bun scripts/stage-sqlite-vector.ts` — PASS, exact digest reported.
- `cargo test search::index::tests::sqlite_vector_runtime_is_pinned --all-features` — PASS.
- `cargo test search::index::tests::migrates_vec0_to_sqlite_vector_rows --all-features` — PASS.
- `cargo test search::index::tests::exact_vector_search --all-features -- --nocapture` — PASS.
- `cargo test search::index::tests::lexical_search_survives_an_unavailable_vector_runtime --all-features` — PASS.
- `cargo test search::index --all-features` — PASS, 10 tests.
- `cargo test search::indexing --all-features` — PASS, 1 test.
- `cargo metadata --no-deps --format-version 1` — PASS; Apache-2.0 and rusqlite `load_extension` are present and `sqlite-vec` is absent.

## Release acceptance completed

The focused backend slice was subsequently covered by the full repository verification and packaged NSIS acceptance recorded in `2026-08-12-production-completion.md`. After a clean-user-profile preflight, the installed application loaded its packaged sqlite-vector 1.0.0 resource, completed an exact vector query, preserved lexical search with an intentionally unavailable DLL, exercised the sanitized diagnostics write and production window placement/hide cores, then uninstalled and removed its registration. App data was isolated beneath Windows Temp. Lumen currently produces NSIS only; no current MSI artifact is claimed.
