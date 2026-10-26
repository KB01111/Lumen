# Lumen design system

Lumen owns its authored visual language through Tailwind CSS v4's CSS-first semantic variables. Components consume semantic utilities backed by the global token contract; product code does not introduce page-local palettes or arbitrary motion timings.

## Ownership

- Tailwind CSS v4 owns authored layout, appearance, themes, and semantic tokens through `src/design-system/global.css`.
- React Aria Components owns behavior and accessibility for Lumen-authored controls.
- Motion for React owns meaningful spatial transitions and follows the resolved motion preference.
- `LumenUiIcon` is the typed bridge to OpenAI Apps SDK UI interface icons. Product-specific symbols use `LumenIcon`'s 24-unit, current-color SVG frame.
- The owned EinUI command palette is vendored source, not a runtime dependency. Its provenance ledger records the upstream revision, license, retained layer topology, and deliberate semantic-theme adaptations.

StyleX, Astryx, and Phosphor have no remaining Lumen runtime or authored-style path. Apps SDK UI supplies interface chrome only; it does not determine provider identity, routing, credentials, or product styling.

## Theme axes

The application resolves color mode, transparency, effects, contrast, and motion independently. System color and motion preferences remain live through `matchMedia`. Forced colors replaces authored color roles with system colors. Disabled transparency removes blur, luminosity, and noise; reduced effects lowers blur and shadow intensity. All variants preserve the same geometry and information hierarchy.

Appearance data is validated with Zod before entering the Zustand store or being written. Native Store failures leave the user's optimistic edit visible and expose a structured recoverable error.

System/Full/Reduced is the single authoritative motion preference: System follows the live OS media query, Full requests full motion, and Reduced requests immediate geometry with at most 80 ms opacity. Settings no longer persists a second synchronization switch. Glass intensity is a separate decorative setting, normalized as `glassIntensity / 72`; 72 preserves the existing material. It changes specular, luminosity and noise layers only, never foreground content opacity. Opaque, reduced-effects and forced-colors policies override these decorations.

## Midnight beam tokens

Lumen's visual identity follows its Windows app icon: midnight glass lit by an ice-cyan beam. Dark surfaces are navy-tinted ink (`#070b10` canvas, 90% glass, 94% raised) and light surfaces are cool paper (`#f2f5f8` canvas). Hairlines are 8% (light) and 7.5% (dark) navy- or ice-tinted foreground, and strong borders are 14%. Secondary and tertiary text form a hierarchy through a lighter tertiary base colour, with alphas tuned so small labels and placeholders stay at or above 4.5:1 on the glass and raised surfaces (light 76% / 72%, dark 76% / 66%). The surface radius is 20px and the control radius is 10px. Surface shadows are deep, negatively spread elevations. The exterior accent glow is 16% opacity at the default glass intensity (72) and scales with the glass-intensity setting. These values flow through the semantic tokens, so settings, onboarding and management surfaces inherit them without page-local overrides.

`--lumen-beam` (`#8fd3ff` dark, `#2f9be6` light) is decorative only. It draws the signature 1px beam across the top edge of the command palette and of every `LumenSurface`, plus a soft radial bloom beneath it. Because it lives in the decorative specular/luminosity layers, opaque, reduced-effects and forced-colors policies remove it with the rest of the material.

## Material and primitives

`LumenSurface` is the material boundary. It composes a semantic tint, a subtle inner edge, the beam/luminosity layer, low-opacity procedural noise and one elevation shadow, while keeping its three decorative nodes out of the accessibility tree. `mica`, `raised`, `inset`, and `flat` describe hierarchy rather than individual screens. Insets and flat surfaces use borders without additional elevation. `LumenAppMark` renders the app-icon tile (the beam mark on its midnight gradient) for the composer and the settings and onboarding headers. Forced colors reduce it to a system-colour outline.

The launcher consumes the same surface, text, and border roles as management surfaces. Neutral 4% and 5–6% foreground mixes distinguish quiet and hovered controls. Selection is an accent tint (15% dark, 11% light) with a hairline accent edge. Ice cyan is the focus and intentional-emphasis accent (`#0a6fbd` light, `#6cc6ff` dark, focus `#8fd3ff` dark). Primary actions fill with the accent under a soft top sheen and an accent glow, using the semantic inverse foreground for readable contrast. Semantic status colors remain independent. High-contrast selected and hovered result labels and glyphs resolve to `HighlightText` over `Highlight`.

`LumenButton`, `LumenIconButton`, and `LumenText` carry shared focus, keyboard, type, and density rules. Icon-only buttons require an accessible name. Focus remains a visible semantic outline in every theme, offset 2px from buttons so it never merges with their glow, including Windows forced-colors mode.

Control targets use stable 32/36/44px minimum heights and pixel gutters so enlarged text expands content without inflating all chrome. Form-control font and color resets live in Tailwind's base layer, allowing semantic text and typography utilities to override them. CSS timing variables in `global.css` mirror the TypeScript motion tokens. Content typography continues to use rem units.

The composer leads with the `LumenAppMark` tile and a bounded, chip-style mode switch. The switch is tinted with the accent while Computer Use is active. A hairline separates them from the query, which keeps priority at 19px. The launcher shows no global-shortcut hint; the shortcut lives in onboarding and General settings. The input has no boxed background or underline (an outline in forced colors), because the launcher's caret already marks its sole primary field. Scopes sit in the header beside the composer as borderless pills whose selected state shares the accent tint and edge. One hairline separates the header from the workspace. The selection capsule adds a 3px glowing accent bar on its leading edge, and each result's file glyph sits in a soft 32px tile that takes the accent tint when selected. The action bar and status footer share one tinted tray beneath a single hairline. Filenames carry their own extensions without duplicate extension badges. The normal result count appears once in the footer; active search, answer and activity messages take its place when needed. The list retains its small-caps heading and accessible row count. The footer's Escape hint describes clearing the query rather than asserting a local provider is ready. Open is the single accent-filled action; secondary result actions stay quiet. AI answers sit on a faint accent wash with a sparkle label. Settings/provider rows share the 16px padding and 24px section rhythm, and standalone actions keep their natural width. Onboarding uses a 76px glowing accent ornament, keycap-style shortcut keys and an elongating step indicator.

Each animated property has one owner: Motion for structural regions, native mini/WAAPI for the result capsule and bounded row entrances, CSS for controls and React Aria overlays, GSAP for the activity wrapper's brief entrance, and Lottie for its inner active-work SVG. Structural radius changes snap; blur, shadows and textures never animate. There is no shader, WebGPU, Canvas/WebGL background, new animation framework or added dependency in this refinement.

## Responsive content

Inline preview observes the actual result/preview content box. Automatic preview requires the normal 800px launcher width, always requires 760px, and both require 220px of usable content height; measurement allows for the launcher's two border pixels. The preference yields before either primary content region becomes unusable.

Result metadata uses a named result-column container: source labels appear at 560px and the selected-row ↵ keycap at 680px. Filename matches show their filename and path once. Answer text has a bounded scroll viewport derived from the inner workspace's available height. Enlarged text can scroll the combined inner workspace while result actions and status stay anchored.

