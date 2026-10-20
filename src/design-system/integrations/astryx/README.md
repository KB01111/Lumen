# Astryx agent activity

Lumen owns appearance, native session state, consent, approvals and Stop. This adapter uses the published, precompiled Astryx **0.7.1** distribution for one assistant progress message and one session-level tool-call row. `ChatMessage`, `ChatToolCalls` and `ChatToolCallStatus` come from the public `@astryxdesign/core/Chat` entry point. There is no public `@astryxdesign/core/ChatToolCalls` entry point. React 19 and the small `@stylexjs/stylex` runtime satisfy its peer requirements; no StyleX compiler, Vite plugin, neutral theme package or new icon package is needed.

## Ownership and truthful status

`LumenAgentActivity` takes only `phase` and the existing readonly activity entries. It makes no service calls. Starting, approval and stopping map to pending; running maps to running; only the native completed phase maps to complete. Error maps to error. Stopped and idle use Lumen text because Astryx has no cancelled/stopped status. The original history remains a visible, labelled semantic list. Its labels and tones are preserved; action requests never become successful tool calls, and no durations are invented.

The one-row `ChatToolCalls` receives no `resultDetail`, so it adds no disclosure, tab stop, shortcut, overlay or focus trap. This preserves the safety controls' Approve → Deny → Stop → Take Over order. The native approval UI and immediate Stop remain outside the lazy boundary.

`AgentActivityHistory.tsx` imports no Astryx code or CSS. Use its `AgentActivityHistory` export with the same entries and optional phase for both Suspense and failed-import fallbacks. Load the enhanced adapter only while its workspace/document is visible. The parent feature owns that loading policy.

## Theme and cascade

`LumenAgentActivity` imports only local `styles.css`, which imports:

```css
@import '@astryxdesign/core/astryx.css' layer(astryx);
@import './theme.css';
```

The application must predeclare the outer `astryx` layer before its existing Tailwind layers, and `astryx-theme` after Tailwind base. Keep Lumen's `@import "tailwindcss" source(none)` and explicit `@source` declarations. Do not import Astryx `reset.css` or `tailwind-theme.css`: Lumen already owns the reset and its utility/token names.

Installed `astryx.css` declares `reset, astryx-base, astryx-theme`; its component rules **and root token defaults** are all inside `astryx-base`. The outer vendor layer demotes those root defaults. Because it also demotes component rules below Tailwind Preflight, verify actual icon/SVG display, font, geometry and focus styles in development and production. The package has no separate `astryx-components` or `astryx-utilities` layer to reorder independently. Its full CSS asset is 193,767 bytes raw and 31,570 bytes gzip; these are package-asset measurements, not the measured application bundle delta.

`scripts/generate-astryx-theme.mjs` uses the public `defineTheme` and `generateThemeCSS` APIs to generate checked-in `theme.css`. It maps documented token names to live `--lumen-*` properties, so the same inherited light/dark, opaque, high-contrast and reduced-effects appearance applies without another preference or hydration lifecycle. The generated component/token rules are scoped by the supported `data-astryx-theme="lumen-agent"` attribute on this region. Lumen continues to own history typography. Prose defaults are deliberately omitted.

Regenerate with:

```powershell
rtk proxy bun scripts/generate-astryx-theme.mjs
```

No Astryx `Theme` provider is mounted: the first provider unconditionally synchronizes `data-theme` and `data-astryx-theme` to `<html>` and exposes no public opt-out. No root attribute mutation, observer workaround, private class override or internal React context is used. Astryx's own semantic icons use built-in defaults. The local unlayered motion rule disables animations and transitions throughout this small region, including pending/running spinner SVGs, so it stays static under normal, hidden and reduced-motion conditions.

## Earlier Lumen integration

Reachable Git history shows `@astryxdesign/core`, `@astryxdesign/theme-neutral` and CLI `^0.2.0` in the old dependency set. `git grep '@astryxdesign' 741c049^ -- src package.json` finds those package entries and no source imports; `git log --all -G astryx -- src` finds no component adoption. The 2026-08-07 redesign spec describes the packages as unused. Commit `741c049354b256fd81ed2ad208dcb156483eed74` (2026-08-08, `refactor: remove legacy ui stack`) removes them alongside authored StyleX themes/plugins and Phosphor. The current worktree reintroduced CLI 0.7.1 as development reference tooling only. No removed runtime Astryx adapter was found to reuse.

Power Search remains deferred: it is a controlled field/operator/value filter builder and does not justify replacing Lumen's IME, core input, palette, result selection or virtualization. Tree List is appropriate for real hierarchy, not the current flat history. Fluent remains the owner of Windows management controls and any future management tree. Chat Composer would compete with the existing task/search input; Chat Message plus Tool Calls adds the differentiated execution presentation with substantially less interaction scope.

## Verification and remaining acceptance

Focused unit coverage exercises real published components, truthful completion versus approval/stopping/stopped states, visible history without a new tab stop, local-only appearance attributes, idle rendering and the lightweight fallback. It does not establish computed CSS, screen-reader speech, native execution, DPI behavior, production chunk loading or performance acceptance. Those remain part of the integrating feature's existing browser/native and production validation.

## Official sources

- [Distribution and precompiled imports](https://github.com/facebook/astryx/wiki/Distribution)
- [Published 0.7.1 metadata](https://registry.npmjs.org/@astryxdesign%2fcore/0.7.1)
- [0.7.1 Chat public exports](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/Chat/index.ts)
- [0.7.1 Tool Calls API and accessibility behavior](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/Chat/ChatToolCalls.tsx)
- [0.7.1 Tool Calls usage guidance](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/Chat/ChatToolCalls.doc.mjs)
- [0.7.1 supported theme inputs](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/theme/defineTheme.ts)
- [0.7.1 scoped CSS generation](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/theme/generateThemeRules.ts)
- [0.7.1 Theme root synchronization](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/theme/Theme.tsx)
- [0.7.1 Power Search contract](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/PowerSearch/PowerSearch.doc.mjs)
- [0.7.1 Tree List contract](https://github.com/facebook/astryx/blob/v0.7.1/packages/core/src/TreeList/TreeList.doc.mjs)

The official Context7 `/facebook/astryx` documentation was resolved and queried before checking the release source and package. Main-branch examples can differ from the published version; this integration follows the installed 0.7.1 API.
