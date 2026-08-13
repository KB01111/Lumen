# Lumen focused Lottie and GSAP motion design

## Summary

Lumen will add one compact activity indicator shared by file search, Computer Use, and AI-answer activity. A local Lottie asset will render the active state, while GSAP will provide the indicator's brief entrance and settle transition. Existing Motion, WAAPI, and CSS animations remain authoritative for layout, selection, preview, dialog, onboarding, and native-window coordination.

The change is intentionally narrow. It satisfies the request for Lottie and GSAP without introducing a second general-purpose motion system or replacing animation paths that already meet Lumen's accessibility and performance rules.

## Goals

- Provide a clean, quiet visual indication while Lumen is actively searching, running Computer Use, waiting for an AI answer, or streaming an AI answer.
- Use Lottie for the active vector mark and GSAP for its short state transition.
- Preserve the existing status text and `aria-live` behavior.
- Respect the resolved Windows and Lumen reduced-motion preference.
- Keep animation work compositor-friendly and leave no idle animation loop after work settles.
- Preserve Lumen's current launcher, input, selection, and idle performance budgets.

## Non-goals

- Rewriting existing Motion, WAAPI, React Aria, or CSS animation paths in GSAP.
- Adding animated onboarding art, empty-state illustrations, backgrounds, particles, scroll effects, or decorative idle motion.
- Animating native window geometry from React.
- Adding `lottie-react`, `@gsap/react`, a motion registry, a timeline factory, or a new global animation provider.
- Claiming that GPU compositing is available on every Windows installation regardless of WebView2, graphics-driver, remote-session, or enterprise-policy state.

## Considered approaches

### 1. Focused hybrid — selected

Add `lottie-web` and `gsap`, then use them only in one owned activity-indicator component. Existing motion tools remain unchanged elsewhere.

This is the smallest approach that satisfies the requested technologies, keeps one visual language, and limits bundle, lifecycle, and regression risk.

### 2. Replace Lumen's motion layer with GSAP

Move launcher, selection, preview, dialog, and onboarding motion to GSAP and use Lottie across multiple surfaces.

This would duplicate or discard working reduced-motion, presence, React Aria, and virtualized-layout behavior. It would also widen the performance and accessibility validation surface without a user-visible need, so it is rejected.

### 3. Keep the existing motion layer only

Refine the current Motion and WAAPI status pulse without new dependencies.

This is technically the leanest implementation, but it does not satisfy the explicit Lottie and GSAP requirement, so it is rejected.

## Visual behavior

The active mark is a 16-by-8-pixel, three-dot Lottie animation using the existing semantic accent color. The checked-in asset stays monochrome; a component-scoped CSS rule overrides the generated SVG paths to `currentColor`, so the mark follows Lumen's existing accent token without mutating animation data. The dots move vertically by at most one pixel while their opacity changes from 55 percent to 100 percent in a staggered 900-millisecond cycle. There is no rotation, bounce, glow expansion, blur animation, large scale change, or sound.

The component occupies the same compact status position as the current dot, so status text does not shift when activity starts or stops. The inactive state is the existing static status dot. Paused or constrained background-activity states retain their existing static warning treatment.

When the active state changes, GSAP gives the mark one 140-millisecond entrance-and-settle transition from 4 pixels below and zero opacity to its resting position and full opacity. The transition uses Lumen's standard easing curve. It does not repeat. Status text remains stable and is not animated.

## State ownership and data flow

`SearchExperience` already owns the relevant runtime phases. It will derive a single `activityRunning` value from:

- local search lifecycle `searching`;
- Computer Use phase `starting` or `running`;
- answer phase `waiting` or `streaming`.

It will also select the matching compact label with this priority:

1. Computer Use: `Working`;
2. AI answer: `Answering`;
3. local search: the existing searching label;
4. otherwise: the existing result or ready label.

`CollapsedLauncher` continues to pass the boolean and label to `LauncherStatus`. No animation state is added to Zustand and no frame-by-frame state enters React.

`LauncherStatus` keeps the existing `output` live region and visible status text. It delegates only the decorative mark to a new `ActivityIndicator` component. The mark is `aria-hidden`; the live text remains the accessible source of truth.

## Lottie lifecycle

The animation JSON is checked into the repository and imported as data. It does not fetch from a CDN, open a network route, use expressions, embed raster assets, or require a CSP change.

`ActivityIndicator` calls `lottie.loadAnimation` with the SVG renderer, the local animation data, `loop: true`, and autoplay only when active. The tiny SVG asset is preferred over canvas because it is resolution-independent and has a very small fixed element count.

Each mounted instance owns exactly one Lottie animation. On transition to inactive or on unmount, the instance is stopped and destroyed. Reduced motion renders the same three-dot resting frame without starting playback. No global `lottie.freeze`, global quality setting, or resize listener is introduced.

## GSAP lifecycle

The component uses a React layout effect and `gsap.context` scoped to its own wrapper. The effect runs only when active state changes. Cleanup calls `context.revert`, so Strict Mode remounts and ordinary unmounts cannot leak tweens or inline styles.

The tween changes only opacity and `transform: translate3d(...)`. `force3D: true` makes the moving wrapper eligible for compositor promotion while it moves. Temporary `will-change` and transform styles are cleared on completion so the small indicator does not hold a permanent compositor layer.

Reduced motion bypasses the tween and sets the final visual state immediately.

## Hardware acceleration boundary

Tauri uses the installed Microsoft Edge WebView2 runtime on Windows. Lumen will keep its default GPU-enabled WebView2 configuration and will not add `--disable-gpu`, software-rendering flags, or broad browser arguments.

The implementation can ensure that Lumen does not opt out of acceleration and that its own continuous movement is compositor-friendly; it cannot override WebView2 fallback caused by a graphics driver, Windows policy, a remote desktop session, or unavailable hardware. Acceptance is therefore based on configuration inspection and measured rendering behavior rather than an unconditional hardware claim.

The moving DOM wrapper uses only transform and opacity. Lottie content is deliberately tiny, fixed-size, and active only while work is in progress. Native Acrylic, Mica, and Blur remain static material properties.

## Dependencies and files

New runtime dependencies:

- `lottie-web` for the owned vector animation;
- `gsap` for the scoped transition.

No wrapper dependency is added.

Expected file changes:

- create `src/design-system/animations/activity-indicator.json` for the local three-dot asset;
- create `src/design-system/animations/ActivityIndicator.tsx` and its focused test;
- add the component-scoped `currentColor` path rule to `src/design-system/global.css` and its existing CSS contract test;
- modify `src/features/launcher/LauncherStatus.tsx` and its test coverage;
- modify `src/features/launcher/SearchExperience.tsx` and existing tests to include answer activity;
- modify `scripts/performance-profile.mjs` so settled measurements also assert that no activity-indicator instance remains active;
- update `docs/architecture/motion-system.md` with the Lottie/GSAP ownership boundary;
- update `package.json` and `bun.lock` through Bun;
- regenerate the checked-in screenshot, recording, and performance evidence required for a UI/performance change.

No `src-tauri` source, capability, CSP, or window-geometry change is expected.

## Error handling

The status text must remain visible even if Lottie initialization fails. The component catches initialization failure, reports no user-facing error for this decorative enhancement, and leaves the static status dot in place. It does not retry in a loop.

An interrupted or superseded GSAP tween is reverted before the next state transition. Lottie teardown is idempotent so rapid search and answer phase changes cannot retain an old animation instance.

## Accessibility

- The decorative SVG container is `aria-hidden="true"`.
- Existing `output aria-live="polite"` text remains unchanged in purpose and continues to announce state.
- Color is not the only signal; the text identifies Searching, Working, Answering, Ready, or the applicable pause state.
- Reduced motion uses a static resting frame and an immediate GSAP state change.
- Focus order, keyboard behavior, control geometry, and action timing do not change.
- Forced-colors mode falls back to the current static system-color-compatible dot if the authored Lottie color would not remain legible.

## Testing and acceptance

Development follows test-first red-green-refactor cycles.

Focused unit and component tests must prove:

- active work creates one Lottie instance with local data and looping playback;
- inactive and reduced-motion states do not start a playback loop;
- changing to inactive and unmounting destroy the owned Lottie instance;
- GSAP is scoped, receives transform/opacity-only transition values, and is reverted during cleanup;
- search, Computer Use, waiting-answer, and streaming-answer phases select the active indicator and correct status label;
- completed, cancelled, error, ready, and paused states render a static mark;
- status text and live-region semantics remain present if animation initialization fails.

Existing functional gates remain mandatory:

- `bun run typecheck`;
- `bun run lint`;
- `bun run test`;
- `bun run test:e2e` using installed Edge;
- `bun run build`.

UI and performance evidence must be refreshed with:

- `bun run capture:gallery`;
- `bun run record:interactions`;
- `bun run profile`.

The performance profile must exercise an active-to-settled indicator transition, then continue to pass its cadence-aware budgets, show no repeated browser long tasks over 50 milliseconds, retain zero Web Animations and zero active activity-indicator instances after settling, remain below 2 percent measured idle CPU, and remain below 100 MB JavaScript heap in the recorded environment. The profile report must identify the browser, refresh estimate, measurement method, and whether strict 240 Hz cadence was actually observed.

Before completion, inspect Tauri and profiler launch configuration to confirm that Lumen adds no GPU-disabling argument. This is configuration evidence, not proof that every target machine's graphics stack will use hardware acceleration.

## Rollout and rollback

The feature has no persisted schema or migration. Rollback consists of restoring the previous `LauncherStatus` dot and removing the two runtime dependencies, the local animation asset, and the component. Search, Computer Use, and answer behavior remain unaffected because the animation consumes existing phases and owns no business state.
