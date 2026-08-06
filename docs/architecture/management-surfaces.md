# Management surfaces

Lumen's first-run and settings experiences are part of the same native React surface as the launcher. They use the shared StyleX tokens, material primitives, motion provider, and React Aria controls; no web-only settings shell or second component library is involved.

## Ownership

- `src/features/onboarding` owns the eight first-run scenes, folder selection, keyboard progression, and completion state.
- `src/features/settings/SettingsShell.tsx` owns the fixed navigation rail, independently scrolling page region, page routing, and focus restoration.
- `src/features/settings/pages` owns General, Appearance, Indexed roots, Search, Local AI, AgentGateway, Computer Use, Activity, Privacy, and Diagnostics; `src/features/session-relief` owns the eleventh settings page.
- `src/state/appearance.store.ts` owns live theme, transparency, density, preview, effects, and motion preferences.
- `src/features/settings/settings.store.ts` owns management preferences and the last active settings page.
- `src/features/activity/activity.store.ts`, `src/features/gateway/gateway.store.ts`, `src/features/gateway/native-gateway-health.store.ts`, and `src/features/diagnostics/diagnostics.store.ts` own bounded presentation and sampled-health state. Native runtime truth comes from parsed service contracts rather than simulated settings stores.

React Aria Components provides the tabs, switches, selects, sliders, dialogs, and focus semantics. Those controls are styled directly with Lumen primitives rather than wrapped by a second interaction abstraction. Overlay portals are mounted inside the themed application root so confirmation dialogs inherit the active appearance.

## Runtime boundaries

Native Local AI and AgentGateway pages call parsed Rust health and mutation commands. Gateway restart, provider credential save/delete, runtime-mode changes, enrichment pause/resume, root synchronization, and index deletion are real native actions with busy-state serialization and field-scoped rollback. Browser and gallery routes remain deterministic and explicitly unavailable for privileged actions. Reranking and MCP remain unavailable.

Manual Activity pause is connected transactionally: native enrichment pauses or resumes first, then the Activity store changes and gates new automatic index synchronization while existing search remains available. Automatic game, fullscreen, video, battery, override, and user-game policies have no Windows detector, so compatibility values are preserved but controls are disabled. The activity-state selector is development-only.

Session Relief performs a single-flight, on-demand Windows sample. It is read only, keeps the current report in memory, and exposes a deliberately reduced copy format. Indexed-root edits feed the native index policy; cloud enrichment requires device consent and an explicit per-root switch. Destructive actions require confirmation. Diagnostics actively refreshes native Gateway and enrichment health and exports a sanitized snapshot without secrets, authorization values, or file contents.

## Keyboard and focus

- `Ctrl+,` opens Settings from the launcher.
- Arrow keys move through the vertical settings tabs; `Enter` activates a page.
- `Escape` closes Settings and restores focus to the launcher search field.
- Onboarding exposes a single primary action per scene, supports `Enter`, and provides Back and `Escape` where navigation is reversible.
- Confirmation dialogs trap focus and return it to their trigger when dismissed.

## Appearance and accessibility

The application root selects one complete StyleX color/material theme at a time: light, dark, light opaque, dark opaque, or forced high contrast. This avoids partial theme contracts resetting one another. Reduced motion is enforced by the motion provider and a CSS duration override; reduced effects remove decorative noise and lower blur. Typography uses `rem` tokens so Windows/browser text scaling reaches management content. The navigation rail remains fixed while the page panel scrolls independently, including at 200 percent text size.

## Diagnostics sampling

Diagnostics uses bounded buffers populated by User Timing, `PerformanceObserver` long-task samples when supported, and the React Profiler callback. It does not run a permanent per-frame React render loop. The `Ctrl+Shift+D` overlay is an inspection surface only and can be closed without changing launcher focus or search state.
