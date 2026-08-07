# EinUI glass command palette provenance

- Retrieved: 2026-08-07
- Registry source: https://ui.eindev.ir/r/glass-command-palette.json
- Registry SHA-256: `A09EE167C2C263DB4CC897EB2272193233771B49D799DABA168FF0DB104EFB79`
- Upstream repository: https://github.com/einui/einui
- Upstream `main` revision: `57cccbc4155ab1b54797dd07329b8097ee066029`
- License: MIT (https://github.com/einui/einui/blob/main/LICENCE)

## Retained recipe

The owned visual shell retains the upstream rounded glass surface, white
translucent border, high-blur material, cyan/blue/purple glow, inner
specular highlights, typography colour, and the source palette's vertical
composer/workspace/footer composition. Frozen literals are scoped to
`--einui-command-*` variables so the normal light and dark values stay
visually identical to the registry source.

## Deliberate boundary

Removed upstream demo behavior: default command groups, query state and
filtering, keyboard listeners and browser shortcut, focus effects, selection,
action callbacks, navigation URLs, positioning variants, fullscreen backdrop,
trigger, and portal-like page ownership. Lumen's native transparent host owns
positioning and its feature layer owns every interactive region.

The upstream Lucide icons are not copied. This visual-only primitive renders
no icons; callers supply any needed Apps SDK UI icon in their own slot.

Opaque and high-contrast modes intentionally replace the liquid material with
Lumen semantic/system colours and retain the global visible-focus contract.
