# Lumen design system

Lumen owns its authored visual language through Tailwind CSS v4's CSS-first semantic variables. Components consume semantic utilities backed by the global token contract; product code does not introduce page-local palettes or arbitrary motion timings.

## Ownership

- Tailwind CSS v4 owns authored layout, appearance, themes, and semantic tokens through `src/design-system/global.css`.
- Fluent UI React v9 owns launcher buttons, tabs and choice controls, plus selected provider-management fields, model selection and form actions. The core search input remains Lumen-owned: Fluent Input's per-keystroke commits regressed the unchanged rapid-input workload. One `FluentProvider` reuses the existing application root, portal boundary and hydrated appearance; it does not add another surface or persisted preference.
- React Aria Components owns the virtualized result grid, existing settings navigation and controls, and modal focus/trigger contracts. Provider dialogs retain React Aria overlays and opening triggers while their fields and interior actions use Fluent.
- Motion for React owns meaningful spatial transitions and follows the resolved motion preference.
- `LumenUiIcon` is the typed bridge to OpenAI Apps SDK UI interface icons. `AiStatusBadge` uses its passive Badge for answer lifecycle presentation with a local semantic-variable bridge. Product-specific symbols use `LumenIcon`'s 24-unit, current-color SVG frame.
- Astryx's precompiled `ChatMessage` and `ChatToolCalls` provide one session-level agent progress presentation. Existing native phases and the bounded activity history remain authoritative. Approval, consent, Stop and Take Over remain outside its lazy presentation boundary.
- The owned EinUI command palette is vendored source, not a runtime dependency. Its provenance ledger records the upstream revision, license, retained layer topology, and deliberate semantic-theme adaptations.

Lumen uses no StyleX compiler or Phosphor package. Astryx's published distribution includes its small StyleX runtime and precompiled CSS; no authored StyleX configuration is added. No design library determines provider identity, routing, credentials, policy or native geometry.

## Integration boundaries

`fluent-theme.ts` starts with Fluent's complete `webLightTheme`/`webDarkTheme` contracts and maps semantic text, surfaces, brand, borders, focus, control states, typography, radii and durations to Lumen. Resolved appearance updates the same provider. Its root background stays transparent, preserving the borderless native window. Griffel styles remain on Fluent components; Lumen's explicit component classes handle minimum targets and responsive sizing. No Fluent v8 packages are used.

The stylesheet declares `reset, astryx, theme, base, astryx-theme, components, utilities` before Tailwind's existing CSS-first import and explicit sources. The lazy Astryx stylesheet imports the published CSS inside the early `astryx` layer so its root defaults cannot outrank Lumen. Its generated local theme uses the public `defineTheme`/`generateThemeCSS` APIs and inherited `--lumen-*` values, under `data-astryx-theme="lumen-agent"`. There is no Astryx Theme provider: that provider synchronizes document-root attributes and has no public scoped-only option. Lumen imports neither Astryx reset nor its Tailwind alias bridge. The activity subtree is static, including pending/running glyphs, and introduces no animation loop or focusable disclosure. Hidden workspaces use the lightweight history instead.

Apps SDK UI Badge imports its component CSS module in the components layer. Its small token bridge is local to `.lumen-ai-status`; the aggregate SDK CSS, global reset, document theme helpers and router provider are unnecessary. Fluent and Astryx receive the same live Lumen appearance, including forced colors, without independent settings.

Keep the compact AI answer as escaped React text. The existing safe Markdown renderer remains owned by file previews. SDK Markdown would add eager syntax-highlighting modules, remote-image policy and full-string reparsing without an incremental streaming contract. SDK ShimmerText's infinite background-position animation and SegmentedControl's separate measurements/timings are not adopted. Fluent Nav, Tree and Drawer documentation currently warns that they are not production-ready; retain established settings navigation and overlays. Table/DataGrid are appropriate for genuinely tabular management data, not the launcher result collection or simple profile groups. Native Select suits the fixed registry model IDs; freeform upstream model configuration remains an Input.

See [the integration plan and inspected history](../superpowers/plans/2026-10-17-unified-ui-integration.md), [Astryx adapter details](../../src/design-system/integrations/astryx/README.md) and [measured verification report](../reports/2026-10-17-astryx-launcher-refinement.md).

## Theme axes

The application resolves color mode, transparency, effects, contrast, and motion independently. System color and motion preferences remain live through `matchMedia`. Forced colors replaces authored color roles with system colors. Disabled transparency removes blur, luminosity, and noise; reduced effects lowers blur and shadow intensity. All variants preserve the same geometry and information hierarchy.

Appearance data is validated with Zod before entering the Zustand store or being written. Native Store failures leave the user's optimistic edit visible and expose a structured recoverable error.

System/Full/Reduced is the single authoritative motion preference: System follows the live OS media query, Full requests full motion, and Reduced requests immediate geometry with at most 80 ms opacity. Settings no longer persists a second synchronization switch. Glass intensity is a separate decorative setting, normalized as `glassIntensity / 72`; 72 preserves the existing material. It changes specular, luminosity and noise layers only, never foreground content opacity. Opaque, reduced-effects and forced-colors policies override these decorations.

## Material and primitives

`LumenSurface` is the material boundary. It composes a semantic tint, a subtle inner edge, low-opacity procedural noise, and one elevation shadow while keeping its three decorative nodes out of the accessibility tree. `mica`, `raised`, `inset`, and `flat` describe hierarchy rather than individual screens. Insets and flat surfaces use borders without additional elevation.

The launcher consumes the same graphite/off-white surface, text, and border roles as management surfaces. Neutral 3%, 6%, and 10% foreground mixes distinguish quiet, hovered, and selected controls. Blue remains the focus and intentional-emphasis accent (`#0066cc` light, `#5aa2ff` dark), with theme-adjusted focus shades (`#005fcc` light, `#80baff` dark). Primary actions use the semantic inverse foreground for readable contrast. Semantic status colors remain independent. High-contrast selected and hovered result labels and glyphs resolve to `HighlightText` over `Highlight`.

`LumenButton`, `LumenIconButton`, and `LumenText` carry shared focus, keyboard, type, and density rules. Icon-only buttons require an accessible name. Focus remains a visible semantic outline in every theme, including Windows forced-colors mode.

Control targets use stable 32/36/44px minimum heights and pixel gutters so enlarged text expands content without inflating all chrome. Form-control font and color resets live in Tailwind's base layer, allowing semantic text and typography utilities to override them. CSS timing variables in `global.css` mirror the TypeScript motion tokens. Content typography continues to use rem units.

Each animated property has one owner: Motion for structural regions, native mini/WAAPI for the result capsule and bounded collection reveal, CSS for controls and React Aria overlays, GSAP for the activity wrapper's brief entrance, and Lottie for its inner active-work SVG. Structural radius changes snap; blur, shadows and textures never animate. The integration adds no animation framework, shader, WebGPU or Canvas/WebGL background.

## Responsive content

Inline preview observes the actual result/preview content box. Automatic preview requires the normal 800px launcher width, always requires 760px, and both require 220px of usable content height; measurement allows for the launcher's two border pixels. The preference yields before either primary content region becomes unusable.

Result metadata uses a named result-column container: source labels appear at 560px and the selected-row Enter hint at 680px. Filename matches show their filename and path once. Answer text has a bounded scroll viewport derived from the inner workspace's available height. Enlarged text can scroll the combined inner workspace while result actions and status stay anchored.

