# Lumen Agent Core extensions

This workspace implements the memory and candidate-generator addendum. It is usable without Tauri. The full Pi Durable and DeepAgents execution engines, native scheduler, Windows capability broker and MXC execution adapter are separate work; the TypeScript directories here contain retrieval clients only.

Rust owns scoped memory, provider configuration, review, approval, retention and deletion. No dependency on Beacon installation, Rivet, Docker or Harness² is required by this workspace. Tauri depends on the Rust crate and opens memory storage lazily, after a memory command is requested.

```powershell
bun run test:agent-core
cargo fmt --manifest-path lumen-agent-core/Cargo.toml --all -- --check
cargo clippy --manifest-path lumen-agent-core/Cargo.toml --locked --all-targets -- -D warnings
```

`test:agent-core` runs native memory tests and both TypeScript clients against a real Rust `MemoryReader` offline fixture. It does not run the Pi or DeepAgents engines, a live Beacon installation, MXC containment or Harness² research.

See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, privacy, protocol and extension constraints. The existing improvement evaluator remains in `src-tauri/src/improvement`; no copy is present in this workspace.
