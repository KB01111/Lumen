# Lumen design system

Lumen owns its authored visual language through semantic StyleX variables. Components consume roles such as `colorTextSecondary`, `colorMaterialRaised`, `radiusLauncher`, and `durationOpen`; product code does not introduce page-local palettes or arbitrary motion timings.

## Ownership

- StyleX owns authored layout, appearance, themes, and semantic tokens.
- React Aria Components owns behavior and accessibility for Lumen-authored controls.
- Motion for React owns meaningful spatial transitions and follows the resolved motion preference.
- Phosphor supplies general interface symbols. Product-specific symbols use `LumenIcon`'s 24-unit, current-color SVG frame.
- Astryx is reserved for secondary management controls where it does not impose launcher styling.

## Theme axes

The application resolves color mode, transparency, effects, contrast, and motion independently. System color and motion preferences remain live through `matchMedia`. Forced colors replaces authored color roles with system colors. Disabled transparency removes blur, luminosity, and noise; reduced effects lowers blur and shadow intensity. All variants preserve the same geometry and information hierarchy.

Appearance data is validated with Zod before entering the Zustand store or being written. Native Store failures leave the user's optimistic edit visible and expose a structured recoverable error.

## Material and primitives

`LumenSurface` is the material boundary. It composes tint, luminosity, procedural noise, border, specular and lower inner edges, and elevation shadow while keeping decorative nodes out of the accessibility tree. `mica`, `raised`, `inset`, and `flat` describe hierarchy rather than individual screens.

`LumenButton`, `LumenIconButton`, and `LumenText` carry shared focus, keyboard, type, and density rules. Icon-only buttons require an accessible name. Focus remains a visible semantic outline in every theme, including Windows forced-colors mode.

