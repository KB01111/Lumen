# Unified UI integration

This extends the approved launcher refinement in the same worktree. Preserve its uncommitted changes, typed services, native admission and geometry, input identity, virtualization and performance contracts. The owner supplied `goal-objective.md` and authorized direct implementation and independent investigations.

## Findings before implementation

- Branch `codex/astryx-launcher-refinement` starts at fetched main `8ab5a6f`. The worktree already contains Astryx CLI context, launcher composition/motion changes and Fluent React v9 launcher controls. These changes are retained.
- Astryx core and neutral theme dependencies existed before `741c049` (`refactor: remove legacy ui stack`, 2026-08-08). The parent revision has no source imports of Astryx; the redesign described them as unused. Current runtime source has no Astryx adapter to restore. The CLI `0.7.1` and managed agent block remain. Reuse the context and Lumen tokens, rather than restoring obsolete dependencies wholesale.
- Apps SDK UI `0.2.2` already supplies `LumenUiIcon`. Answers stream as escaped React text; file previews use the existing safe Markdown renderer. There is no reason to add a second Markdown renderer for this integration.
- Fluent `9.74.9` and its complete light/dark theme adapter are already installed. Settings and provider management still use React Aria controls. Their modals have established async ownership, credential clearing, focus restoration and native services; preserve these contracts.
- Fluent's current Nav package documentation warns that it is not production-ready. Keep the existing settings navigation and overlay owner. Evaluate stable controls for profile forms and model routes first.
- Tailwind uses `source(none)` with explicit application source declarations. It owns the only reset and semantic variables. A third-party aggregate CSS/reset import must not replace this pipeline. Fluent uses Griffel; Astryx uses precompiled StyleX; Apps SDK UI components include component CSS.
- Windows currently reports 2560×1600 at 240 Hz. Clean-main performance evidence already fails ordinary React p95 and strict refresh acceptance. Preserve that evidence and every threshold; final integration results must be measured separately.

## Ownership and implementation sequence

| Category | Owner / decision |
| --- | --- |
| Theme, material, typography, contrast, reduced effects and motion | Lumen semantic tokens and existing hydrated appearance store |
| Launcher shell, native resize/show/hide | Owned EinUI composition and Rust/window service |
| Core result collection and selection | Existing React Aria + TanStack virtualization and Motion/WAAPI |
| Launcher controls and suitable provider/model management controls | Fluent React v9, through the existing shared semantic theme adapter |
| Settings navigation, modal focus/triggers, existing mature controls | React Aria; no competing overlay/focus owner |
| Specialized agent execution presentation | Evaluate published Astryx Chat tool calls with local, supported styling/theming; approval and Stop remain existing controls |
| AI status presentation and interface icons | Apps SDK UI through small Lumen semantic adapters; no global reset or duplicate renderer |

1. Finish official documentation/source review for each selected component and CSS/theme API. Record public component exports, version differences, rejected alternatives and license notices.
2. Integrate Fluent profile form controls and gateway model selection first. Preserve all service calls, consent, async generation fences and secret lifecycle. Run focused provider/route/overlay regressions before moving on.
3. Integrate Apps SDK UI AI status presentation. Keep answer streaming, copy, citations, Retry and Stop behavior; retain safe text rendering.
4. Integrate an Astryx specialized agent presentation only where it adds structured tool/task history. Bound it by existing activity data. Keep consent, approvals and Stop outside lazy presentation. Isolate styling without another global reset or persisted appearance state.
5. Document supported CSS layer order, provider/portal boundaries, ownership and dependency impact. Add computed-style, theme/contrast/reduced-motion and loading/isolation checks to the existing tests.
6. Run ordered typecheck, zero-warning lint, full unit and installed-Edge functional gates, production performance and profile, frontend/native builds, final native fixture inspection, 86-state gallery and six recordings. Timed captures run serially without concurrent builds/tracing/screenshots. Preserve failures and distinguish callbacks from presented frames.
7. Record exact source provenance, hardware/versions, before/after bundle sizes and performance, test results and remaining limitations. Do not label historical checks as final-source acceptance.

## Official references

- [Fluent React v9 quick start](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-quick-start--docs) and [source](https://github.com/microsoft/fluentui).
- [Astryx documentation](https://astryx.atmeta.com/) and [source](https://github.com/facebook/astryx).
- [Apps SDK UI documentation](https://openai.github.io/apps-sdk-ui/?path=/docs/overview-introduction--docs) and [source](https://github.com/openai/apps-sdk-ui).

This plan is implemented incrementally. Runtime Astryx evaluation is newly authorized by the unified objective and supersedes the earlier launcher-only reference-tooling limit.
