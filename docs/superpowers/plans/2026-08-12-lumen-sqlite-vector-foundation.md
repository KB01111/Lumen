# Lumen SQLite-Vector Search Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unused `sqlite-vec` virtual-table foundation with a licensed, pinned `sqlite-vector` 1.0.0 ordinary-table foundation while preserving exact and FTS5 search.

**Architecture:** SQLite remains the single embedded database. FTS5 continues to serve production lexical retrieval. `chunk_embeddings` becomes an ordinary rowid table with embedding BLOBs and explicit model/dimension/revision metadata. The extension is initialized on every vector-capable connection and loaded only from a trusted application artifact or compiled registration path.

**Tech Stack:** Rust 2024, rusqlite 0.40.1 with bundled SQLite, SQLite FTS5, sqlite-vector 1.0.0, Tauri 2, Bun staging scripts, Windows MSI/NSIS.

## Global Constraints

- Pin sqlite-vector exactly to 1.0.0 and verify SHA-256 before use.
- Lumen is licensed Apache-2.0 and records third-party notices.
- Do not accept extension paths from React, settings, environment variables, or command arguments.
- Preserve canonical-root confinement and exact/FTS search when vectors are unavailable.
- Do not add Tauri shell execute/spawn permissions.
- Use a rebuild migration; never reinterpret existing `sqlite-vec` bytes as sqlite-vector data.
- Every production change follows a failing Rust test first.

---

### Task 1: Establish licensing and artifact policy

**Files:**
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: root Apache-2.0 license declaration and an auditable sqlite-vector 1.0.0 provenance entry.

- [ ] **Step 1: Add the standard Apache License 2.0 text**

Create the root `LICENSE` from the unmodified Apache-2.0 license text.

- [ ] **Step 2: Declare package licensing**

Add `"license": "Apache-2.0"` to `package.json`, add the exact
`@sqliteai/sqlite-vector-win32-x86_64@1.0.0` package to `devDependencies`, and
add `license = "Apache-2.0"` to `[package]` in `src-tauri/Cargo.toml`.

- [ ] **Step 3: Add the notice ledger**

Record project name, version `1.0.0`, source URL, bundled artifact name, SHA-256, and the upstream licensing summary. Do not claim a checksum until it has been computed from the downloaded official asset.

- [ ] **Step 4: Verify metadata**

Run:

```powershell
bun run typecheck
Set-Location src-tauri
cargo metadata --no-deps --format-version 1
```

- [ ] **Step 5: Commit**

```powershell
git add LICENSE THIRD_PARTY_NOTICES.md package.json bun.lock src-tauri/Cargo.toml
git commit -m "docs: license lumen under apache 2"
```

### Task 2: Prove the Windows integration path

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `scripts/stage-sqlite-vector.ts`
- Modify: `scripts/stage-sidecars.ts`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/search/indexing.rs`
- Test: `src-tauri/src/search/index.rs`

**Interfaces:**
- Produces: a trusted `register_or_load_sqlite_vector(connection: &Connection) -> IndexResult<VectorRuntimeInfo>` path reporting version and SIMD backend.

- [ ] **Step 1: Resolve and hash the installed pinned artifact**

Resolve
`node_modules/@sqliteai/sqlite-vector-win32-x86_64/vector.dll`, compute its
SHA-256, and record the exact digest in `scripts/stage-sqlite-vector.ts` and
`THIRD_PARTY_NOTICES.md`. The Bun lockfile supplies the immutable package
integrity; the staging script supplies the binary-level check.

- [ ] **Step 2: Write a failing smoke test**

Stage the DLL, then open an in-memory bundled-rusqlite connection through the
production loading function and assert:

```rust
assert_eq!(info.version, "1.0.0");
assert!(!info.backend.is_empty());
```

Expected failure: the production function and `vector_version()` are absent.

- [ ] **Step 3: Implement the minimum trusted loader**

Change `IndexRuntime::open` to accept a trusted `&Path` for the extension. In
`lib.rs`, choose only between
`resource_dir()/vector.dll` and
`CARGO_MANIFEST_DIR/binaries/vector.dll`, then pass the chosen path into the
runtime. Enable extension loading immediately before `load_extension`, load that
literal path, and disable extension loading immediately afterward. Unit tests use
the staged `CARGO_MANIFEST_DIR/binaries/vector.dll`. Never expose the path through
IPC.

- [ ] **Step 4: Add checksum-pinned staging**

Use the existing sidecar staging conventions: read the exact dependency artifact,
verify SHA-256, fail on mismatch, and copy it to
`src-tauri/binaries/vector.dll`. Call this helper from `stage-sidecars.ts`. Add
the DLL as a Tauri resource, not an external executable.

- [ ] **Step 5: Verify the smoke test in the Windows MSVC environment**

Run from `src-tauri`:

```powershell
cargo test search::index::tests::sqlite_vector_runtime_is_pinned --all-features
```

Expected: PASS and report version 1.0.0.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/Cargo.toml scripts/stage-sqlite-vector.ts scripts/stage-sidecars.ts src-tauri/tauri.conf.json src-tauri/src/lib.rs src-tauri/src/search/index.rs src-tauri/src/search/indexing.rs THIRD_PARTY_NOTICES.md
git commit -m "build: stage pinned sqlite vector runtime"
```

### Task 3: Replace the virtual-table schema

**Files:**
- Modify: `src-tauri/src/search/index.rs`
- Test: `src-tauri/src/search/index.rs`

**Interfaces:**
- Produces: schema version 2 and ordinary `chunk_embeddings` rows keyed by chunk ID.

- [ ] **Step 1: Write failing migration tests**

Create a version-1 database fixture containing files/chunks/FTS rows and the old `vec0` table. Reopen it through `IndexDatabase::open` and assert:

- schema version is 2;
- FTS/file/chunk rows remain;
- `chunk_embeddings` is an ordinary table;
- old vector rows are discarded for rebuild;
- opening the database twice is idempotent.

- [ ] **Step 2: Verify the tests fail on schema version 1**

Run: `cargo test search::index::tests::migrates_vec0_to_sqlite_vector_rows --all-features`

- [ ] **Step 3: Implement the transactional rebuild migration**

Create:

```sql
CREATE TABLE chunk_embeddings_v2 (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  embedding_model TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0),
  distance_metric TEXT NOT NULL CHECK (distance_metric = 'cosine'),
  content_hash TEXT NOT NULL,
  index_revision INTEGER NOT NULL
);
```

Drop the old virtual table only after the replacement schema exists. Rename the
new table, update `user_version`, commit, then call `vector_init` for the active
model/dimension on the connection.

- [ ] **Step 4: Update deletion and pruning paths**

Keep the current deletes by `chunk_id`; ordinary-table foreign keys and the
existing explicit deletes must produce the same externally visible behavior.

- [ ] **Step 5: Run all index tests**

Run: `cargo test search::index --all-features`

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/search/index.rs
git commit -m "refactor: store embeddings in ordinary sqlite rows"
```

### Task 4: Add exact cosine retrieval behind the index contract

**Files:**
- Modify: `src-tauri/src/search/index.rs`
- Modify: `src-tauri/src/search/indexing.rs`
- Test: `src-tauri/src/search/index.rs`

**Interfaces:**
- Produces: `upsert_embedding(chunk_id, model, dimension, content_hash, revision, values)` and `search_embeddings(model, dimension, query, limit)` returning confined chunk/file IDs plus distance.

- [ ] **Step 1: Write failing exact-search tests**

Insert three deterministic FLOAT32 vectors, search with cosine distance, and
assert stable nearest-neighbour ordering, model/dimension isolation, limit
handling, update visibility, delete visibility, and invalid-dimension rejection.

- [ ] **Step 2: Verify failure before implementation**

Run: `cargo test search::index::tests::exact_vector_search --all-features`

- [ ] **Step 3: Implement minimal BLOB encoding and SQL calls**

Encode finite `f32` values as native little-endian bytes after checking exact
dimension. Insert through `vector_as_f32(?1, ?2)`. Search with
`vector_full_scan('chunk_embeddings', 'embedding', ?query, ?limit)` and join on
`rowid = chunk_id`. Reject NaN, infinity, zero dimensions, and model/dimension
mismatches before SQL.

- [ ] **Step 4: Keep lexical search independent**

If sqlite-vector initialization or a vector query fails, return a typed semantic
status/error without preventing existing FTS and filename queries.

- [ ] **Step 5: Run Rust verification**

```powershell
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/search/index.rs src-tauri/src/search/indexing.rs
git commit -m "feat: add exact sqlite vector retrieval"
```

### Task 5: Package and verify the embedded database

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `docs/architecture/search-service.md`
- Create: `docs/reports/2026-08-12-sqlite-vector-acceptance.md`

**Interfaces:**
- Produces: packaged MSI/NSIS applications that load only the pinned vector runtime and retain lexical fallback.

- [ ] **Step 1: Add packaged-runtime diagnostics**

Expose only version, backend, availability, and last sanitized error through the existing native diagnostics DTO. Do not expose the DLL path.

- [ ] **Step 2: Run a clean staged build**

```powershell
bun run stage:sidecars
bun run tauri build
```

- [ ] **Step 3: Smoke-test both installers**

Install each bundle in an isolated Windows test profile, create a small index,
run FTS and exact vector queries, remove/rename the DLL to prove lexical fallback,
and confirm an arbitrary copied extension cannot be selected through UI or IPC.

- [ ] **Step 4: Record evidence and commit**

```powershell
git add src-tauri/tauri.conf.json docs/architecture/search-service.md docs/reports THIRD_PARTY_NOTICES.md
git commit -m "test: verify packaged sqlite vector search"
```
