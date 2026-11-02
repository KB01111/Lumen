# Current status — 2026-11-02

Source: `907bc625ad8b39ee562618bde2d7bbce74845628` (`main`, "feat: serve launcher search from the
WinSearch engine and ship an MSI (#35)", 2026-10-28).

This report supersedes the 2026-10-15 gate checkpoint as the current description of the project.
It separates **verified** evidence from **open** work so the repository no longer describes an
older failed run as the present state.

## Verified

### Hosted pipeline

The `Verify and package` job is green on `907bc62`
([run 40633188800](https://github.com/KB01111/Lumen/actions/runs/40633188800), Windows 2025). Every
step passed:

| Step | Result |
| --- | --- |
| Typecheck, zero-warning lint, unit tests | pass |
| Native answer bridge tests (`test:answer-bridge`) | pass |
| Native performance, dev-server and WinSearch tooling tests (`test:tooling`) | pass |
| Production profiling in Edge (`test:performance`) | pass |
| Full installed-Edge functional suite (`test:e2e`) | pass |
| Stage sidecars and independently pinned WinSearch runtime | pass |
| Vendor signature and sparse-identity metadata checks | pass |
| Pinned Gateway digest vs compiled admission | pass |
| Compiled enrichment recovery | **pass** (this is the gate that failed on 2026-10-15) |
| Rust fmt, strict Clippy, `cargo test --all-features` | pass |
| Agent Core fmt, Clippy, Memory Core and both shared harness clients | pass |
| WinSearch startup/Stop/profile isolation, compiled enrichment consumer, worker ownership/restart, improvement crash fencing | pass |
| Native answers in Edge | pass |
| Build installers (NSIS + MSI) | pass |
| MSI install/uninstall smoke with pinned WinSearch manifest | pass |

### Local (non-Windows) frontend gates

Re-run on the same commit in a Linux container with Bun 1.3.14:

- `bun run typecheck` — pass.
- `bun run lint` (`--max-warnings 0`) — pass.
- `bun run test` — 823 passed, 9 skipped, 0 failed.
- `bun run test:tooling` — 33 passed, 3 skipped, 0 failed.

The 9 skipped Vitest cases and 3 skipped tooling cases are Windows-only by design (see
[Platform-scoped tests](#platform-scoped-tests)).

## Platform-scoped tests

Two suites stage **Windows x64** artifacts and cannot execute on a POSIX host. They now skip with an
explicit reason instead of failing, so `bun run test` and `bun run test:tooling` are meaningful on
every platform while retaining full coverage in Windows CI:

| Suite | Why it is Windows-only |
| --- | --- |
| `scripts/stage-clipproxy.test.ts` | The fixture archive is a zip unpacked with `tar` (which cannot read zip on POSIX) and the staged artifact is `cli-proxy-api.exe`. |
| `scripts/stage-computer-use.test.ts` | The fixture uses the venv's `Scripts/python.exe` and the `SystemRoot`/`APPDATA` layout. |
| `scripts/lib/lumen-dev-server.test.mjs` (owned-startup cases) | `withLumenDevServer` verifies the listening process with `Get-NetTCPConnection`; it throws `Owned Lumen server verification requires Windows` in owned mode elsewhere. |

No assertion, deadline or budget was changed; only the platform guard was added.

## Open work

1. **Dependency security.** A fresh audit of the resolved dependency graphs finds materially more than
   the single `glib` alert the README previously recorded. Evidence is checked in under
   [`artifacts/verification/dependency-audit/`](../../artifacts/verification/dependency-audit/):
   `2026-11-02-bun-audit.txt` / `.json` (authoritative, from `bun audit`) and
   `2026-11-02-cargo-osv.json` (OSV.dev querybatch over the resolved `Cargo.lock` versions).
   This audit is **local and platform-independent**; it is not part of the hosted CI job, which does
   not currently run an advisory scan.

   **Fixed in this change.** Three direct dependencies with available non-breaking fixes were updated
   (`bun update zod vite vitest`), which also pulled safe transitive updates (`nanoid` 3.3.16→3.3.20,
   `source-map-js` 1.2.1→1.2.2, `postcss`, `rolldown`, `picomatch`). Typecheck, zero-warning lint,
   build, unit tests (823 passed / 9 skipped) and tooling tests (33 passed / 3 skipped) all pass on the
   updated lockfile, and `bun install --frozen-lockfile` is clean.

   **npm — 40 advisories remain (12 high, 22 moderate, 6 low) across 13 packages, all transitive.**
   Each is reachable only through a third-party dependency tree:

   | Package | Advisories | Pulled in by | Notes |
   | --- | --- | --- | --- |
   | `undici` 8.9.0 | 18 | `jsdom` (dev/test) | Test-only; several are high. |
   | `hono` 4.13.0 | 5 | `rivetkit` → `@hono/zod-openapi` | Runtime. |
   | `qs` 6.15.3 | 3 | `rivetkit` → … → `node-stdlib-browser` | Runtime. |
   | `lodash` 4.17.21 | 3 | `@openai/apps-sdk-ui` | Runtime. |
   | `brace-expansion` 5.0.9 | 3 | `eslint`, `typescript-eslint` | Dev/build. |
   | `zod` 4.4.3 | 1 | `rivetkit` → `@hono/zod-openapi` | The direct `zod` is already 4.6.7; this is the nested copy. |
   | `drizzle-orm`, `katex`, `minimatch`, `pbkdf2`, `esbuild`, `elliptic`, `source-map-js` | 1 each | mixed | `esbuild`/`minimatch` are dev/build; `elliptic`/`pbkdf2` are `rivetkit` transitive. |

   These are not fixed here because the owning parents (`rivetkit` 2.3.10 is pinned exactly, and
   `@openai/apps-sdk-ui`, `jsdom`, `eslint` are outside the three direct ranges) must move first;
   forcing them would be a separate, reviewable dependency migration.

   **Rust — 39 advisories across 15 crates** in `src-tauri/Cargo.lock` and
   `lumen-agent-core/Cargo.lock`. The previously documented `glib 0.18.5` (GHSA-wrw7-89jp-8q8g,
   RUSTSEC-2024-0429) is one of them and is still not fixable by a lockfile bump: the chain is
   `tauri 2.11.5` → `gtk = "0.18"` (declared only under `cfg(any(target_os = "linux", target_os =
   "dragonfly", target_os = "freebsd", target_os = "openbsd", target_os = "netbsd"))`) → `gtk 0.18.2`
   → `glib ^0.18`. The fix lives in `glib 0.20.0`/gtk-rs 0.20, which `tauri 2.11.5` does not accept.
   `glib`, `zbus_names`, `zvariant`, `zvariant_derive` and the `unic-*` set are Linux/BSD-only and are
   never compiled by the Windows MSVC build. The remainder (`rustls` 0.23.45, `rustls-webpki`,
   `webpki-roots`, `quinn-proto`, `tokio`, `zip`, `ttf-parser`, `proc-macro-error`) sit on the
   Windows-relevant tree and warrant a dedicated `cargo update`/`cargo audit` pass on a Windows host.

   **There is no committed Dependabot configuration in this repository** (`.github/` contains only
   `workflows/ci.yml` and `workflows/codeql.yml`), so the Dependabot update schedule is configured in
   repository settings; PR #36 only bumps `tokio` and `rustls` and does not address `glib`. No
   advisory scan runs in CI, so this local audit is the current record.
2. **Performance budgets.** The ordinary-query `reactCommit p95 < 3 ms` check and the strict-240 Hz
   target remain unmet (last measured 3.4–4.2 ms). The deterministic `?service=memory` workload does
   not measure the real native search path. See
   [performance continuation](2026-10-15-performance-continuation.md).
3. **Native capacity.** `search::indexing::capacity_tests::native_filesystem_capacity` still
   deliberately panics (`Task13 attribution sample deliberately incomplete; no capacity pass`). The
   1,000-file workload completed; the 50,000-file and 250,000-record workloads remain
   `PENDING_HOST_RESOURCES`. See [capacity evidence](2026-10-15-native-search-capacity.md).
4. **Ignored Rust tests.** 26 entries, tracked individually in
   [`ignored-tests.json`](../../artifacts/verification/final-windows-gates/ignored-tests.json):
   11 owned/child fixture passes, 6 child entrypoints exercised by parent tests, 2 excluded because
   they read ordinary credential slots (Windows AI status, Gateway start), 3 awaiting a desktop-privacy
   prerequisite, 2 owner-deferred Docker cases, 1 live-provider case and the open 50k-capacity case.
5. **Live providers, signed install and physical hardware.** Live local/cloud provider workflows,
   signed-installer install/upgrade/uninstall and Narrator/IME/text-scale/high-contrast/mixed-DPI/
   sleep-resume acceptance all remain unperformed; they require owner credentials, a signing
   certificate and real hardware. See the Computer Use, provider, release and physical acceptance
   reports listed below.
6. **Search architecture.** Both crawlers still run while the WinSearch engine is healthy; engine-only
   `winsearch:` results cannot be pinned, return no Related results, and are not locally reranked or
   pinned-first. See the [WinSearch cutover report](2026-10-27-winsearch-search-cutover.md).
7. **Evidence freshness.** `artifacts/performance/profile-summary.json`, the 86-state gallery and the
   six recordings still carry a 2026-10-21 source SHA and predate the WinSearch cutover.
8. **No release published.** The repository has no tags and no GitHub releases; the installer pipeline
   works but has not been exercised for a published release.

## Superseded reports

The following reports describe the 2026-10-15 checkpoint on `8a337eb` and are retained as history.
Where they conflict with this report or the hosted pipeline, this report is authoritative:

- [Final Windows gate checkpoint](2026-10-15-final-windows-gates.md) — its failed compiled-enrichment
  recovery gate now passes in CI; its failed Edge performance gate is superseded by the passing
  `test:performance` step, though the stricter `profile` budgets in item 2 remain open.
- [Performance continuation](2026-10-15-performance-continuation.md)
- [Native search capacity](2026-10-15-native-search-capacity.md)
- [Computer Use acceptance](2026-10-15-computer-use-acceptance.md)
- [Provider workflow source validation](2026-10-15-provider-workflow-source-validation.md)
- [Signed release and upgrade acceptance](signed-release-and-upgrade-acceptance.md)
- [Windows physical acceptance](2026-10-15-windows-physical-acceptance.md)
