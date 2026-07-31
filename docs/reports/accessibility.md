# Accessibility validation report

**Date:** 2026-07-31  
**Environment:** Windows 11 build 26200, Microsoft Edge/WebView2 150.0.4078.105, English Lumen UI  
**Result:** Phase-one automated and native smoke checks passed, with the manual limits listed below.

## Covered behavior

The application exposes one named application root and semantic search, tablist, grid, row, preview region, dialog, navigation, status, progress, and action controls. React Aria Components owns interaction semantics for buttons, tabs, switches, selects, dialogs, and management controls. Live search/activity text uses polite announcements; blocking dialog state receives focus and restores it on close.

The 26-test browser acceptance run includes five dedicated accessibility flows:

- all visible launcher, result, preview, settings, and gallery controls have accessible names;
- keyboard-only search, selection, details, settings entry, dismissal, and focus restoration;
- IME composition does not commit a search before `compositionend`;
- forced high contrast, reduced motion, opaque materials, Unicode, and textual activity state;
- every visible product target is at least 32 logical pixels high and at least 32 logical pixels on one axis.

Additional flows cover `Alt+Enter`, `Ctrl+Enter`, `Ctrl+,`, `Ctrl+K`, Tab region movement, arrows, Enter, Escape, 10,000-result virtualization, narrow details, confirmation dialogs, and every settings page.

## Native Narrator and UI Automation smoke check

Narrator was enabled against the release Tauri binary. Windows UI Automation exposed the application, onboarding heading and progress, buttons, launcher search box, search scopes, result grid and rows, preview region, action buttons, and live result text. Focus traversal and activation were exercised through onboarding, real local-file search, details, and dismissal. The release app also retained keyboard focus after returning from the native folder picker.

This was an automation-tree and focus smoke check. Narrator speech audio and exact utterance order were not recorded, so this report does not claim a formal screen-reader user study.

## Visual accessibility states

- Forced colors switches authored roles to Windows system colors and explicit edges.
- Transparency disabled removes backdrop blur and retains an opaque hierarchy.
- Reduced effects removes decorative noise and lowers blur/shadow intensity.
- Reduced motion removes spatial transitions and persistent shimmer while preserving state changes.
- Statuses pair color with text and/or iconography.
- Focus uses a visible semantic outline across glass, opaque, light, dark, and high-contrast themes.
- Unicode filenames and paths preserve `Å`, CJK characters, punctuation, and long text without horizontal document overflow.
- Settings remain operable at 200 percent text scaling with a fixed rail and independently scrolling content.

## Evidence

- `tests/e2e/accessibility.spec.ts`
- `tests/e2e/onboarding-settings.spec.ts`
- `tests/e2e/search-experience.spec.ts`
- `artifacts/screenshots/theme-high-contrast.png`
- `artifacts/screenshots/theme-opaque.png`
- `artifacts/screenshots/theme-reduced-motion.png`
- `artifacts/screenshots/unicode-filename.png`

## Remaining manual limits

- Only one physical Windows host and one keyboard layout were available.
- A real IME candidate window was not manually exercised; composition event behavior is automated.
- Touch, switch control, voice access, magnifier, and 400 percent browser zoom were not part of this pass.
- Color-vision review used redundant text/icon states but did not include a participant study.
- Screen-reader testing should be repeated with NVDA and real users before public release.
