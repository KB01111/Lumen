# Lumen design system

Lumen owns its authored visual language through Tailwind CSS v4's CSS-first semantic variables. Components consume semantic utilities backed by the global token contract; product code does not introduce page-local palettes or arbitrary motion timings.

## Ownership

- Tailwind CSS v4 owns authored layout, appearance, themes, and semantic tokens through `src/design-system/global.css`.
- React Aria Components owns behavior and accessibility for Lumen-authored controls.
- Motion for React owns meaningful spatial transitions and follows the resolved motion preference.
- `LumenUiIcon` is the typed bridge to OpenAI Apps SDK UI interface icons. Product-specific symbols use `LumenIcon`'s 24-unit, current-color SVG frame.
- The owned EinUI command palette is vendored source, not a runtime dependency. Its provenance ledger records the upstream revision, license, frozen visual recipe, and deliberate update policy.

StyleX, Astryx, and Phosphor have no remaining Lumen runtime or authored-style path. Apps SDK UI supplies interface chrome only; it does not determine provider identity, routing, credentials, or product styling.

## Theme axes

The application resolves color mode, transparency, effects, contrast, and motion independently. System color and motion preferences remain live through `matchMedia`. Forced colors replaces authored color roles with system colors. Disabled transparency removes blur, luminosity, and noise; reduced effects lowers blur and shadow intensity. All variants preserve the same geometry and information hierarchy.

Appearance data is validated with Zod before entering the Zustand store or being written. Native Store failures leave the user's optimistic edit visible and expose a structured recoverable error.

## Material and primitives

`LumenSurface` is the material boundary. It composes tint, luminosity, procedural noise, border, specular and lower inner edges, and elevation shadow while keeping decorative nodes out of the accessibility tree. `mica`, `raised`, `inset`, and `flat` describe hierarchy rather than individual screens.

`LumenButton`, `LumenIconButton`, and `LumenText` carry shared focus, keyboard, type, and density rules. Icon-only buttons require an accessible name. Focus remains a visible semantic outline in every theme, including Windows forced-colors mode.

