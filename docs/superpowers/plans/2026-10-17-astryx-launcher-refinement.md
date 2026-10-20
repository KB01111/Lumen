# Astryx context and launcher refinement

Approved implementation plan, 2026-10-17. Base: latest GitHub main `8ab5a6fdde39013c867d2caca314a738de23de00`; branch `codex/astryx-launcher-refinement`.

The owner's later [unified UI objective](2026-10-17-unified-ui-integration.md) extends the library integration scope to selected management and agent/AI presentation surfaces. It authorizes the scoped runtime Astryx adapter. The launcher interaction, security and unchanged performance requirements below remain in force.

## Intent and boundaries

Make the launcher compact and search-first, with restrained motion and strict 120/240 Hz acceptance. Astryx supplies development-only reference context. The owner subsequently selected Fluent UI React v9 controls and theming for the launcher, following its developer quick start. Keep the owned EinUI shell, virtualized React Aria results, semantic tokens, Motion/WAAPI, typed services and Rust-owned geometry/security. No whole-app control migration, provider behavior, persisted setting or native contract change is requested.

## Implementation

- Install exactly `@astryxdesign/cli@0.7.1` using Bun; run `bun x @astryxdesign/cli init --features agents`, read every generated agent file, preserve project guidance and verify idempotence. Scope the generated instructions as reference outside their managed block.
- Install Fluent UI React v9 as a runtime dependency. Add its provider using the resolved Lumen theme and semantic colors, typography and motion durations. Use Fluent input, buttons and scope tabs in the launcher and its answer/Computer Use panels; preserve input/caret/composition, keyboard order, safety eligibility, immediate Stop, forced colors and 200% text scaling. Settings controls and the result grid retain their existing implementation.
- Remove the brand tile and composer shortcut chrome. Keep a quiet, explicitly named Computer Use control after the search field in both visual and keyboard order.
- Compose status and selection-bound result actions in the palette footer through optional `footerActions?: ReactNode`. Keep Open/Enter visible and secondary labels responsive. Preserve latest selection, pin/kind eligibility, errors and action callbacks.
- Quiet result metadata and replace source pills with plain text. Retain availability text, virtual row geometry and responsive preview policy; align preview typography and padding.
- Replace row staggering with one 120 ms collection opacity reveal, or at most 80 ms under reduced motion. Keep the selection spring, interruptible expansion/collapse, input/caret/composition identity and hidden-surface cancellation.
- Profile the unchanged baseline first. Diagnose separately from timing; retain only evidence-supported performance changes. Do not alter thresholds, sample admission, workloads or renderer instrumentation to obtain passes.

## Verification and acceptance

Run focused regressions, then typecheck, zero-warning lint, full units, functional installed-Edge e2e, production performance tests and frontend build. Build and inspect the native app; run Rust checks if native source changes. Keep timed captures serial and separate from screenshots, traces and builds.

Check dark/light/opaque/reduced-effects/forced-colors, text scaling through 200%, minimum dimensions and 10,000-result virtualization. Exercise keyboard navigation, IME/caret/reversal, streaming, preview, errors, approval and Stop. Regenerate all 86 gallery states, six interaction studies and performance evidence after final source changes.

Completion requires the unchanged strict 120/240 Hz checks, ordinary React p95 <3 ms, no workload Long Tasks >=50 ms, aligned selection and zero settled/hidden animation or measurement work. Preserve raw results, hardware/display/runtime context and source provenance. Browser callbacks are not native presentation/FPS evidence; unavailable physical display modes remain unverified. A failed or pending gate leaves performance acceptance incomplete.
