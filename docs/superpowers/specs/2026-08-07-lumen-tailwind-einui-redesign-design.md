# Lumen Tailwind and EinUI Redesign

**Date:** 2026-08-07
**Status:** Approved for implementation planning
**Product:** Lumen, a Windows 11 AI search and action launcher

## Objective

Redesign Lumen as a clean, keyboard-first Windows launcher that opens from a global hotkey, begins as a compact glass pill, and expands into one continuous search and AI workspace. The interaction should feel as immediate as a native system launcher while supporting local files, installed applications, Windows settings, web retrieval, grounded AI answers, attachments, follow-up questions, and permissioned actions through model-independent service boundaries.

This project replaces Lumen-authored StyleX styling and the unused Astryx packages with Tailwind CSS v4. It adopts selected EinUI components as owned source code, preserves the visual treatment of EinUI's Glass Command Palette, and uses the OpenAI Apps SDK UI icon set for interface symbols. It does not turn Lumen into an OpenAI-only product: model routing, capabilities, provider labels, and credentials remain vendor-neutral.

The redesign is not a static command-palette demo. Existing Lumen search, preview, answer, settings, Computer Use, persistence, and native-window services remain the behavior and data owners. New UI must consume typed services and validated state rather than filtering sample arrays or calling providers directly.

## Scope and Delivery Boundary

The redesign covers the frontend styling system, component primitives, launcher composition, responsive native-window presentation, motion, iconography, onboarding, settings, diagnostics, gallery states, and checked-in visual evidence. It also defines the presentation contracts required by the broader Windows 1.0 product plan.

The first implementation plan will migrate the current working product without inventing fake backend capability. Existing local search and streamed local/cloud answers must remain live throughout the migration. UI for a capability that is not implemented yet must either be omitted, disabled with an honest explanation, or backed by a deterministic development-only gallery scenario. Web retrieval, attachments, provider expansion, application indexing, conversation persistence, MCP, and full desktop automation remain separate feature slices behind their existing or planned service boundaries.

## Approved Technology Foundation

- React 19 and Tauri 2 remain the application and native-window foundations.
- Tailwind CSS v4 becomes the only Lumen-authored styling system.
- The official `@tailwindcss/vite` plugin replaces `@stylexjs/unplugin`.
- Tailwind's CSS-first `@theme` variables define Lumen's semantic design tokens.
- Selected EinUI registry components are copied into `src/components/ui` and become Lumen-owned source.
- The EinUI Glass Command Palette supplies the approved visual recipe for the launcher surface.
- `@openai/apps-sdk-ui/components/Icon` supplies navigation, action, status, settings, and AI glyphs.
- Real Windows application icons, file thumbnails, and Lumen file-category glyphs remain data-specific result imagery.
- React Aria Components remains available as a headless accessibility and interaction layer where it is stronger than the vendored component behavior.
- Motion for React remains the animation engine. Vendored components must use the existing `motion` dependency rather than introduce a second animation runtime.
- Zustand, Zod, and typed services retain their existing state and data responsibilities.

Astryx, `@stylexjs/stylex`, `@stylexjs/unplugin`, the StyleX development shim, and Phosphor interface-icon usage are removed by the final migration gate. Temporary coexistence is permitted only on the feature branch while independently testable surfaces are migrated; no final production path may depend on StyleX.

## Component Ownership and Upstream Policy

EinUI follows the shadcn registry model: components are copied into the repository instead of imported as an opaque runtime library. Lumen will vendor only components it actively uses, beginning with the Glass Command Palette and adding buttons, inputs, cards, dialogs, tabs, switches, tooltips, scroll areas, and progress controls only when a concrete screen requires them.

Each registry item must be reviewed before adoption. Its source URL, upstream revision or retrieval date, dependencies, and local changes are recorded in a short provenance comment or adjacent ledger. Registry updates are deliberate diffs, never automatic overwrites. Components are adapted to Lumen's accessibility, Tauri, lint, TypeScript, and testing requirements before use.

EinUI's demo behavior is not an application architecture. In particular, the command palette's sample groups, internal filtering, `window.location.href` navigation, browser-level shortcut listener, and modal backdrop are replaced by Lumen's query, selection, search, opening, and native-window services. The approved glass surface, glow layers, border, typography proportions, result-row treatment, shortcut hints, and footer treatment remain visually unchanged except for the approved icon substitution and accessibility corrections that do not alter appearance.

## Product Form

Lumen has no visible traditional window shell, title bar, sidebar frame, or application chrome. Tauri provides a transparent, borderless technical host. The rendered launcher surface is the product.

When invoked by the configured global hotkey, the app appears near the upper center of the active monitor as a compact pill. The pill contains the Lumen mark, search/ask input, a quiet mode or privacy indicator when necessary, and only the actions relevant before a query. It does not show a dashboard, welcome page, decorative header, or persistent navigation.

Typing or submitting a query expands the same surface downward into a rounded workspace. The input stays visually anchored. Results, AI output, sources, actions, and follow-up controls reveal below it inside the same material. Lumen does not open a detached tray, stack glass cards, or transition into a conventional full application window.

The native window changes between controlled collapsed and expanded bounds. React does not continuously resize the OS window every animation frame. On expansion, Rust first provides sufficient transparent bounds and the inner surface performs the visible morph. On collapse, the inner surface finishes or reaches a safe interruption point before Rust returns to pill-sized bounds. This avoids a persistent invisible click-blocking rectangle while keeping the transition smooth.

## Visual Direction

The launcher keeps EinUI's Glass Command Palette appearance as the hero surface. Other product surfaces use a quieter Lumen theme that combines the material depth and specular behavior associated with liquid glass with the neutral typography, restraint, whitespace, and content clarity associated with ChatGPT.

The theme is intentionally cleaner than EinUI's default component set:

- neutral graphite, smoke, pearl, and near-white surfaces;
- one restrained cool accent for focus, selection, and active AI state;
- translucent material only where it communicates hierarchy;
- thin neutral borders and a single white specular edge instead of multiple glowing outlines;
- soft ambient shadows without large colored halos;
- no persistent animated gradients, neon cyan-purple decoration, or ornamental blobs outside the approved command palette;
- minimal nested cards, with spacing and dividers preferred for grouping;
- `Segoe UI Variable Text`, `Segoe UI Variable Display`, `Segoe UI`, and system sans-serif fallbacks;
- sentence-case labels, short copy, and calm status language;
- compact information density with comfortable touch and keyboard targets.

The command palette's chromatic glow is a deliberate exception and remains the recognizable invocation moment. As the user moves into answer, settings, and management content, the visual language becomes progressively more neutral so information remains dominant.

## Tailwind Theme Architecture

The global stylesheet imports Tailwind CSS v4 and defines semantic CSS variables through `@theme`. Tokens describe intent rather than specific screens:

- canvas and transparent host colors;
- glass, raised, inset, and opaque-fallback surfaces;
- primary, secondary, tertiary, inverse, and disabled text;
- subtle, default, strong, specular, focus, success, warning, and danger borders;
- primary accent and subdued accent states;
- control, row, overlay, and ambient shadows;
- pill, surface, control, row, and compact radii;
- collapsed and expanded launcher dimensions;
- typography, icon, control, row, and target sizes;
- standard, enter, exit, and spring-like easing curves;
- motion durations for hover, press, reveal, expansion, and dismissal.

Dark and light palettes use the same semantic utilities. System appearance is the default. High contrast, transparency disabled, reduced visual effects, and reduced motion are first-class variants, not afterthought overrides. Arbitrary values are allowed only for the frozen command-palette recipe or platform geometry that cannot be expressed by a semantic token.

Shared components use a small `cn` utility backed by `clsx` and `tailwind-merge`. Variant-heavy controls use `class-variance-authority` only where it materially reduces duplication. Feature components should compose semantic utilities and owned primitives rather than repeat long glass recipes.

## Icon System

OpenAI Apps SDK UI icons replace Lucide and Phosphor for interface chrome. Imports come from `@openai/apps-sdk-ui/components/Icon`. A typed `LumenIcon` mapping isolates semantic names such as search, settings, web, attachment, microphone, screenshot, model, privacy, copy, retry, stop, close, and approval from library export names.

Icons inherit `currentColor`, use Tailwind size utilities, remain decorative when an adjacent label names the action, and receive an accessible name only when they are the sole visible control content. Icon-only controls retain at least the Windows minimum target size and a visible focus treatment.

The icon library does not replace data identity. Installed applications use their extracted Windows icons. Images use thumbnails when safe. Files use recognizable Lumen category glyphs or native associations. The Lumen product mark remains custom artwork.

Using an OpenAI-maintained icon library does not brand the assistant as OpenAI-only. Provider and model identity appears only in explicit model-routing UI and uses text or provider-owned marks where licensing permits.

## Launcher Interaction Model

The launcher accepts search, question, and action language in one input. The UI does not force the user to choose a mode before typing.

While typing, Lumen immediately shows local results from files, applications, and allowlisted Windows settings. Expensive or network-backed work does not start on every keystroke. Enter commits the intent:

- a clear local target opens or exposes its available actions;
- a question starts a grounded AI answer using the selected Auto profile;
- explicit web intent invokes the configured retrieval adapter before generation;
- an automation request enters a separately identified action flow with risk-based approval.

The expanded surface may contain these regions, only when relevant:

1. anchored composer and scope affordances;
2. local and web results;
3. streamed answer or action progress;
4. citations and source controls;
5. attachment chips and screenshot context;
6. follow-up composer;
7. compact footer for model profile, privacy boundary, keyboard hints, and settings.

The UI must distinguish unknown model capability from unsupported capability. Auto profiles provide Fast, Best, Private, Vision, and Browser choices with ordered fallbacks. A per-conversation override is available without turning the launcher into a provider dashboard. Local-to-cloud boundary crossings require visible consent and never happen silently.

## AI Integration Boundary

React never calls model providers, search APIs, the filesystem, or desktop automation directly. It depends on typed services for search, answers, attachments, retrieval, models, actions, and platform operations. Native and worker payloads are Zod-validated before entering state.

The current `SearchService`, answer service, and Computer Use service remain live during the UI migration. The command palette becomes a presentation adapter over those services. It must preserve cancellation, stale-request rejection, source attribution, root confinement, and provider-secret isolation.

Streaming output updates a stable answer region rather than rebuilding the entire palette. Cancellation is always available. Sources remain inspectable. Errors stay within the region that failed: local search failure does not erase a usable answer, and answer failure does not erase local results.

Desktop automation is a deliberate action, not an accidental interpretation of normal search. Observation starts with the foreground application. Lumen asks before observing or switching to another app. Sending, deleting, purchasing, installing, changing account or security state, entering credentials, and expanding scope require one-time approval. Secure desktop, UAC prompts, lock screen, elevated-window control, and password or secret access remain outside the Windows 1.0 boundary.

## Motion and Native Geometry

Motion communicates one surface changing purpose. It must be fast, interruptible, and quiet.

- Hotkey appearance uses a short opacity and vertical-settle transition.
- The pill-to-workspace transition keeps the input anchored and reveals content downward through clipping and opacity.
- Corner radius changes from pill geometry to a rounded workspace without overshoot.
- Results use a restrained selection transition; rows do not bounce or independently fly in.
- AI streaming uses content appearance, not a persistent shimmer or pulsing glow.
- Opening details or settings preserves spatial context and focus return.
- Dismissal is faster than opening and responds immediately to Escape.

Target timings are approximately 120-160 ms for hover and press feedback, 180-220 ms for open and expansion, and 120-160 ms for close. Exact values are tuned from captured Windows recordings. Blur, large shadows, and native geometry are not animated per frame. Reduced motion replaces spatial movement with immediate state changes or a brief opacity transition.

## Accessibility and Keyboard Contract

The visual redesign must not regress Lumen's keyboard-first behavior. Required mappings include the configurable global hotkey, Escape, arrow navigation, Enter, Ctrl+Enter, Alt+Enter, Tab and Shift+Tab, Ctrl+K where it does not conflict with the global invocation model, and Ctrl+Comma for settings.

The imported EinUI command palette requires adaptation before production use. Selection is ID-based, not array-index based. Empty collections cannot produce invalid modulo navigation. Collection roles, active descendant state, groups, focus restoration, dismissal, and live announcements use React Aria or equivalent tested semantics. Native app and file opening remains typed and confined.

Validation covers keyboard-only completion, Narrator, IME composition, Unicode, text scaling, Windows high contrast, system light and dark themes, reduced motion, reduced visual effects, transparency disabled, and visible focus against both glass and opaque fallbacks.

## Responsive, DPI, and Multi-Monitor Behavior

The pill and expanded workspace use logical pixels and are positioned relative to the active monitor work area. They remain usable from 100 through 200 percent scaling and on 1080p, 1440p, 4K, ultrawide, and mixed-DPI setups.

The result and answer regions adapt before the composer does. At constrained height, content scrolls inside the surface while the input and compact footer remain stable. At constrained width, secondary metadata and preview content collapse before primary labels or actions. The launcher never becomes a mobile layout or full-screen overlay on Windows.

## Migration Strategy

The implementation proceeds in reversible vertical slices:

1. Add Tailwind CSS v4, semantic tokens, the Apps SDK UI icon dependency, and a minimal owned-component foundation while the current UI still builds.
2. Vendor and review the Glass Command Palette source, freeze its visual recipe, and adapt its behavior to Lumen contracts.
3. Build the borderless pill and expanded workspace around current live local search and answer services.
4. Replace interface icons through the typed icon mapping while preserving app and file identity.
5. Migrate result, preview, answer, onboarding, settings, diagnostics, and gallery surfaces from StyleX to Tailwind.
6. Replace or adapt remaining primitives and remove unused EinUI or Radix dependencies.
7. Remove Astryx, StyleX, the StyleX Vite plugin and development shim, Phosphor interface usage, and obsolete theme files.
8. Regenerate screenshots, interaction recordings, and performance evidence, then run the complete verification matrix.

Every slice must leave the app type-checkable and keep service boundaries intact. Migration commits should separate mechanical styling conversion from behavior changes where practical.

## Error Handling and Fallbacks

If native transparency or Acrylic is unavailable, the same semantic theme renders an opaque neutral surface with a clear border and shadow. If the global hotkey cannot register, Lumen remains launchable and presents a specific recovery action in settings. If an icon export is unavailable, the typed icon mapping fails at build time rather than silently rendering a mismatched glyph.

Missing AI credentials, offline providers, unsupported model capabilities, search index failures, and denied permissions receive distinct messages and recovery actions. Raw provider errors and secrets never appear in the UI. Loading states preserve geometry to avoid distracting jumps.

Vendored component failures are owned by Lumen. The app does not depend on EinUI's documentation site or registry at runtime.

## Testing and Evidence

Automated verification includes:

- Tailwind build output and zero authored StyleX imports;
- TypeScript type checking and linting with zero warnings;
- primitive and icon-mapping tests;
- launcher keyboard, focus, IME, selection, empty-state, cancellation, and stale-response tests;
- answer streaming, source, retry, stop, and error-state tests;
- theme, high-contrast, transparency, reduced-effects, and reduced-motion tests;
- Playwright launcher, search, answer, settings, and gallery flows;
- Rust formatting, Clippy, tests, and full Tauri build when native window geometry changes.

Visual acceptance includes regenerated gallery screenshots and a contact sheet covering collapsed, typing, local results, AI streaming, completed answer, failure, approval, light, dark, opaque, high contrast, and reduced motion. Interaction recordings prove hotkey open, pill expansion, result navigation, answer streaming, details, settings, interruption, and dismissal. Performance evidence measures warm invocation, input-to-paint, selection response, expansion, and idle animation activity.

## Completion Criteria

The redesign is complete when:

- the global hotkey opens a centered borderless pill on the active Windows monitor;
- the same surface expands cleanly into live search and AI content;
- the approved Glass Command Palette visual recipe is preserved;
- other components follow the quieter Lumen liquid-glass and clean-content theme;
- interface icons use OpenAI Apps SDK UI while app and file identity remains native;
- current local search, preview, opening, settings, and streamed answers remain functional;
- keyboard, accessibility, DPI, theme, fallback, and reduced-motion behavior pass;
- no production path uses sample command groups or fake provider behavior;
- no Lumen-authored StyleX, Astryx, or Phosphor interface dependency remains;
- screenshots, recordings, performance evidence, and the required local verification commands are current and successful.
