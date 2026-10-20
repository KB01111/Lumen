# Pinned WinSearch runtime

`winsearch-85a915d.tar.gz` contains the model-free Windows x64 NPU/CPU
package from WinSearch runtime source
`85a915d460b1fa751bbe86f289ff77c18c032c25`.
It is the exact payload covered by
[`2026-10-20-winsearch-npu-handoff.md`](../../docs/reports/2026-10-20-winsearch-npu-handoff.md),
compressed without changing any package bytes. This follows the existing
vendored Rivet dependency approach and allows fresh CI checkouts to package
the same independently pinned runtime without a mutable download or an
expiring CI artifact.

- Archive: 82,821,082 bytes; SHA-256
  `12da6a062df72b85f51398e8af7c25275d27cdee8cf62de6a7d4698744b14075`.
- Original manifest SHA-256:
  `171aedbb142c712520b768f524ca848a79aab519081cfc0209e8781e96d7390d`.
- Declared contents: 69 files / 221,486,715 bytes, plus `payload.json`.
- Licenses and source instructions remain inside the package's notices tree.
  Model weights, indexes, credentials and the system NPU driver are excluded.

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
