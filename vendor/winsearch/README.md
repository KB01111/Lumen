# Pinned WinSearch runtime

`winsearch-accd707.tar.gz` contains the model-free Windows x64 NPU/CPU
package from WinSearch runtime source
`accd7071fc5822e14df68877d0834ab2b83ae72c`.
It is the unsigned integration candidate recorded in
[`2026-10-22-winsearch-adapter.md`](../../docs/reports/2026-10-22-winsearch-adapter.md),
compressed without changing any package bytes. This follows the existing
vendored Rivet dependency approach. The archive is hash-pinned below; this
commit does not add the 79 MB archive to the tracked tree, so staging requires
the pinned bytes from the release pipeline or an explicit `--source` copy.

- Archive: 82,903,388 bytes; SHA-256
  `f1f6a7a63d5d7d2f700464fd722157b3d459f3199205ede7a1cd45b9f9edbc4c`.
- Original manifest SHA-256:
  `630813959c03e58c55a7f3f290bfdc99c017ba270617b3adee89a85543411323`.
- Declared contents: 69 files / 221,925,489 bytes, plus `payload.json`.
- Licenses and source instructions remain inside the package's notices tree.
  Model weights, indexes, credentials and the system NPU driver are excluded.

Copied-package no-model acceptance passed the unchanged 90-second watchdog,
including 1,000/1,100-result checks. CPU/NPU references and frozen retrieval passed;
the separate warm top-20 latency gate still fails. Corresponding-source delivery,
signing, installed acceptance and default Lumen cutover remain open.

`bun run stage:winsearch` checks the archive before extraction, then verifies
the original manifest against `src-tauri/winsearch-payload.lock.json` and
every extracted/copied file before publication. `stage:sidecars` invokes it
for ordinary CI and tagged releases. `--source <verified-package>` remains
available for explicit local staging and enforces the same manifest pin.

Signed releases retain pinned originals in release provenance. Only validated
Authenticode changes may alter executable bytes. The final payload manifest
records those signed bytes, is included in the release seal, and supplies the
compiled native runtime anchor after seal, signature and upstream verification.
The independent original pin is never rewritten. A real owner certificate and
timestamp service remain required for signed-release acceptance.
