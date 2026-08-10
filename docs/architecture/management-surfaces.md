# Management surfaces

Lumen's first-run and settings experiences are part of the same native React surface as the launcher. They use Tailwind CSS-first semantic tokens, material primitives, the motion provider, and React Aria controls; no web-only settings shell or second component library is involved.

## Ownership

- `src/features/onboarding` owns the eight first-run scenes, folder selection, keyboard progression, and completion state.
- `src/features/settings/SettingsShell.tsx` owns the fixed navigation rail, independently scrolling page region, page routing, and focus restoration.
- `src/features/settings/pages` owns General, Appearance, Indexed roots, Search, Local AI, AgentGateway, Activity, Privacy, and Diagnostics.
- `src/state/appearance.store.ts` owns live theme, transparency, density, preview, effects, and motion preferences.
- `src/features/settings/settings.store.ts` owns management preferences and the last active settings page.
- `src/features/activity/activity.store.ts`, `src/features/local-ai/local-ai.store.ts`, `src/features/gateway/gateway.store.ts`, and `src/features/diagnostics/diagnostics.store.ts` own their bounded phase-one state machines.

React Aria Components provides the tabs, switches, selects, sliders, dialogs, focus semantics, collection roles, and focus restoration. Those controls are styled directly with Lumen primitives rather than wrapped by a second interaction abstraction. Overlay portals are mounted inside the themed application root so confirmation dialogs inherit the active appearance.

## Phase-one boundaries

Local AI and AgentGateway controls deliberately expose deterministic management states without starting a model, sidecar, MCP server, or cloud request. Provider tests, route changes, permission choices, restart actions, and diagnostics previews are local simulations labelled as such. Reranking remains unavailable. Activity detection and per-game policies are user-configurable UI state; production process detection is outside this frontend phase.

Indexed-root edits are persisted settings and feed the development file adapter. Destructive actions require confirmation. Diagnostics exports are sanitized previews: configured secrets, authorization values, and file contents are excluded.

## Keyboard and focus

- `Ctrl+,` opens Settings from the launcher.
- Arrow keys move through the vertical settings tabs; `Enter` activates a page.
- `Escape` closes Settings and restores focus to the launcher search field.
- Onboarding exposes a single primary action per scene, supports `Enter`, and provides Back and `Escape` where navigation is reversible.
- Confirmation dialogs trap focus and return it to their trigger when dismissed.

## Appearance and accessibility

The application root selects one complete Tailwind CSS semantic color/material theme at a time: light, dark, light opaque, dark opaque, or forced high contrast. This avoids partial theme contracts resetting one another. Reduced motion is enforced by the motion provider and a CSS duration override; reduced effects remove decorative noise and lower blur. Typography uses `rem` tokens so Windows/browser text scaling reaches management content. The navigation rail remains fixed while the page panel scrolls independently, including at 200 percent text size.

## Diagnostics sampling

Diagnostics uses bounded buffers populated by User Timing, `PerformanceObserver` long-task samples when supported, and the React Profiler callback. It does not run a permanent per-frame React render loop. The `Ctrl+Shift+D` overlay is an inspection surface only and can be closed without changing launcher focus or search state.
