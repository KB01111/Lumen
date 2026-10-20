# Accumulated search snapshots in the Lumen consumer

This change prepares the existing SearchService, catalogue wrapper and launcher
for WinSearch's progressive results. Previously the launcher consumed only the
resolved promise, and its empty-query guard also prevented empty Recent searches.
The base is `79460cc9d2d69dcdbe75b74115c17d3d41227984`; verified `origin/main`
remains `3b60ba43104ec7c450423c13db4bc5ee06662e68`.

SearchService now accepts an optional accumulated-snapshot callback. Each update
replaces the visible snapshot, preserves selection by stable ID and keeps the
search indicator active until the promise completes. Every delivery uses the
existing Zod response contract and current request/abort fences. Malformed or
mismatched snapshots close and abort the operation; callbacks after completion,
failure, replacement or cancellation cannot reopen it.

The catalogue wrapper merges public help separately into each snapshot within the
requested result limit, rechecks its current enablement and closes callback
delivery when the wrapped operation settles. It validates before reading groups,
so an asynchronously malformed shape reaches the launcher's `invalid-response`
path rather than escaping from the producer callback.

Recent permits an empty query in search mode. An explicit enabled flag preserves
the existing absence of search work in other launcher intents and aborts/clears
the search when that intent changes.

## Verification

The initial focused run reproduced seven failures: missing partial delivery,
malformed/mismatched snapshot handling, empty Recent and catalogue forwarding,
consent and abort handling. A composed catalogue/controller regression then
reproduced `response.groups is not iterable`; another reproduced empty Recent
being issued while search was disabled. Both passed after their fixes. The final
focused controller/catalogue/SearchExperience run passes 27 tests, and typecheck
passes.

The final run verified 327 unchanged frontend inputs before and after each
command. [Source/log fingerprints and results](2026-10-20-winsearch-stream-consumer-evidence.json)
record the current checkpoint:

| Check | Result |
| --- | --- |
| Full configured Vitest suite | 90 files, 787 tests pass |
| Edge functional suite | 131 pass; one worker, zero retries |
| Production Edge profiling suite | All four pass; unchanged budgets, no skips/flakes |
| Typecheck and frontend production build | Pass |
| Full lint | Pass, zero warnings |

The host is Windows 11 Pro build 26300 on Ryzen AI 9 HX 370 (12 cores / 24
logical processors), Node 24.15.0, Bun 1.3.14 and Edge 155.0.4283.62. Browser
profiling is separate from native WebView2 and strict 120/240 Hz qualification.
The build retains the existing lottie-web direct-eval warning. Native source,
dependency pins, test thresholds and configurations are unchanged from the base.

Independent GPT-6.1 Sol review
identified the composed malformed-shape issue; re-review found no remaining
scoped finding. This is not broad native or v1.0 approval.

## Remaining integration

Normal DevelopmentFileSearchService still queries the existing backend. This
change does not implement the native WinSearch query/configuration commands or
admit engine roots. The typed native result mapper, ordered current root/grant
forwarding, unique native operation cancellation, identity/pin/history/Recent/
Related/answer migration and one crawler/index/model lifecycle remain required.

The native client, verified release payload and process ownership are unchanged
from the [release-pin checkpoint](2026-10-20-winsearch-release-pin.md). No new
native process, model, provider, installed-app or full Tauri release acceptance
is claimed by these frontend checks. Raw local logs stay under `.superpowers/`.
