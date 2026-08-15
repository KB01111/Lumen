# Lumen Focused Lottie and GSAP Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one restrained Lottie activity mark with a scoped GSAP settle transition for search, Computer Use, and AI-answer work while preserving Lumen's existing motion system and measured performance.

**Architecture:** `SearchExperience` derives one operational-activity boolean and compact label from existing phases. `LauncherStatus` remains the accessible live region and delegates only its decorative mark to `ActivityIndicator`, which owns one Lottie instance and one scoped GSAP context. Motion, WAAPI, CSS, React Aria, native geometry, and all business state remain unchanged.

**Tech Stack:** React 19, TypeScript 6, Tauri 2/WebView2, Tailwind CSS v4, lottie-web, GSAP 3, Vitest, Testing Library, Playwright with installed Microsoft Edge, Bun.

## Global Constraints

- Work only in `C:\Users\kevin\.codex\worktrees\e319\Lumen` and use `rtk`-prefixed shell commands.
- Use Bun and update `bun.lock`; do not use npm, Yarn, or pnpm.
- Add only `lottie-web` and `gsap`; do not add `lottie-react`, `@gsap/react`, another animation provider, or another component library.
- Keep existing Motion, WAAPI, CSS, React Aria, and native-window animation ownership unchanged.
- Continuous movement may change only opacity and transform; do not animate width, height, position, blur, shadow, border radius, or native bounds.
- Reduced motion starts no Lottie loop and no GSAP tween; it renders the active mark's resting frame.
- Lottie uses checked-in data, the SVG renderer, no expressions, no embedded raster assets, no CDN, and no CSP change.
- No animation state enters Zustand and no React state updates per animation frame.
- Do not add WebView2 browser arguments or GPU flags. In particular, do not add `--disable-gpu` or software-rendering flags.
- Preserve the existing `output aria-live="polite"`, status wording semantics, focus order, keyboard behavior, and forced-colors legibility.
- Leave zero running Web Animations and zero active activity-indicator instances after work settles.
- The refreshed performance report must retain: no repeated browser long tasks over 50 ms, idle CPU below 2 percent, heap below 100 MB, and all cadence-aware checks passing.

## File Structure

- `src/design-system/animations/activity-indicator.json` — the single local 48×24, 54-frame, monochrome three-dot Lottie asset.
- `src/design-system/animations/ActivityIndicator.tsx` — owns Lottie creation/destruction, GSAP context/revert, reduced motion, failure fallback, and forced-colors fallback markup.
- `src/design-system/animations/ActivityIndicator.test.tsx` — verifies the component boundary and lifecycle with lottie-web/GSAP replaced only at the external animation boundary.
- `src/design-system/global.css` — maps Lottie's generated SVG paths to `currentColor` and swaps to the static mark in forced colors.
- `src/design-system/global.test.ts` — protects that authored-color/forced-color contract.
- `src/features/launcher/LauncherStatus.tsx` — preserves live text and selects active/static/success/warning indicator state.
- `src/features/launcher/LauncherStatus.test.tsx` — verifies user-visible status semantics using the real indicator in reduced-motion mode.
- `src/features/launcher/SearchExperience.tsx` — includes answer waiting/streaming in the existing launcher activity derivation.
- `src/features/launcher/SearchExperience.test.tsx` — verifies answer-phase priority and settling through real stores/controllers and memory services.
- `tests/e2e/performance.spec.ts` — proves the ready launcher exposes a settled indicator with no running instance.
- `scripts/performance-profile.mjs` — records and gates active indicator instances after the interaction sequence settles.
- `docs/architecture/motion-system.md` — documents the narrow Lottie/GSAP ownership boundary.
- `package.json`, `bun.lock` — direct dependency and lockfile updates made by Bun.
- `artifacts/screenshots`, `artifacts/recordings`, `artifacts/performance` — regenerated visual and performance evidence.

---

### Task 1: Build the owned activity indicator

**Files:**
- Create: `src/design-system/animations/activity-indicator.json`
- Create: `src/design-system/animations/ActivityIndicator.tsx`
- Create: `src/design-system/animations/ActivityIndicator.test.tsx`
- Modify: `src/design-system/global.css`
- Modify: `src/design-system/global.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**
- Consumes: `ActivityIndicatorProps { active: boolean; reducedMotion: boolean; tone: 'success' | 'warning' }`.
- Produces: `ActivityIndicator`, `[data-activity-indicator]`, `data-activity-state="active|idle"`, and `data-activity-running="true"` only while a real Lottie loop is intended to be running.

- [ ] **Step 1: Install only the approved direct dependencies**

Run:

```powershell
rtk bun add gsap lottie-web
```

Expected: `package.json` contains `gsap` and `lottie-web` under `dependencies`; `bun.lock` changes; no wrapper package is added.

- [ ] **Step 2: Write the failing component lifecycle tests**

Create `src/design-system/animations/ActivityIndicator.test.tsx`:

```tsx
import {render, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const animation = vi.hoisted(() => ({
  context: vi.fn(),
  createEase: vi.fn(() => 'lumen-standard'),
  destroy: vi.fn(),
  fromTo: vi.fn(),
  loadAnimation: vi.fn(),
  registerPlugin: vi.fn(),
  revert: vi.fn(),
}));

vi.mock('lottie-web', () => ({
  default: {loadAnimation: animation.loadAnimation},
}));

vi.mock('gsap', () => ({
  gsap: {
    context: animation.context,
    fromTo: animation.fromTo,
    registerPlugin: animation.registerPlugin,
  },
}));

vi.mock('gsap/CustomEase', () => ({
  CustomEase: {create: animation.createEase},
}));

import {ActivityIndicator} from './ActivityIndicator';

beforeEach(() => {
  vi.clearAllMocks();
  animation.context.mockImplementation((callback: () => void) => {
    callback();
    return {revert: animation.revert};
  });
  animation.loadAnimation.mockReturnValue({destroy: animation.destroy});
});

describe('ActivityIndicator', () => {
  it('owns one local SVG animation and destroys it when activity settles', () => {
    const {container, rerender} = render(
      <ActivityIndicator active reducedMotion={false} tone="success" />,
    );

    const indicator = container.querySelector('[data-activity-indicator]');
    expect(indicator).toHaveAttribute('data-activity-state', 'active');
    expect(indicator).toHaveAttribute('data-activity-running', 'true');
    expect(container.querySelector('[data-lottie-host]')).toBeInTheDocument();
    expect(animation.loadAnimation).toHaveBeenCalledWith(expect.objectContaining({
      animationData: expect.objectContaining({fr: 60, h: 24, w: 48}),
      autoplay: true,
      loop: true,
      renderer: 'svg',
    }));

    rerender(<ActivityIndicator active={false} reducedMotion={false} tone="success" />);

    expect(animation.destroy).toHaveBeenCalledOnce();
    expect(indicator).toHaveAttribute('data-activity-state', 'idle');
    expect(indicator).not.toHaveAttribute('data-activity-running');
    expect(container.querySelector('[data-static-activity="single"]')).toBeVisible();
  });

  it('uses a static resting frame and no tween under reduced motion', () => {
    const {container} = render(
      <ActivityIndicator active reducedMotion tone="success" />,
    );

    expect(animation.loadAnimation).not.toHaveBeenCalled();
    expect(animation.fromTo).not.toHaveBeenCalled();
    expect(container.querySelector('[data-activity-running]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-static-activity="dot"]')).toHaveLength(3);
  });

  it('limits the GSAP settle to compositor-friendly properties and reverts it', () => {
    const {container, unmount} = render(
      <ActivityIndicator active reducedMotion={false} tone="success" />,
    );

    const indicator = container.querySelector('[data-activity-indicator]');
    expect(animation.context).toHaveBeenCalledWith(expect.any(Function), indicator);
    expect(animation.fromTo).toHaveBeenCalledWith(
      indicator,
      {autoAlpha: 0, y: 4, willChange: 'transform,opacity'},
      expect.objectContaining({
        autoAlpha: 1,
        clearProps: 'opacity,transform,visibility,willChange',
        duration: 0.14,
        ease: 'lumen-standard',
        force3D: true,
        y: 0,
      }),
    );

    unmount();
    expect(animation.revert).toHaveBeenCalled();
  });

  it('falls back to the static active mark if Lottie initialization fails', async () => {
    animation.loadAnimation.mockImplementation(() => {
      throw new Error('renderer unavailable');
    });
    const {container} = render(
      <ActivityIndicator active reducedMotion={false} tone="success" />,
    );

    await waitFor(() => expect(
      container.querySelector('[data-activity-running]'),
    ).not.toBeInTheDocument());
    expect(container.querySelectorAll('[data-static-activity="dot"]')).toHaveLength(3);
  });
});
```

These tests catch four concrete regressions: a leaked Lottie instance, a reduced-motion loop, a layout-triggering GSAP tween, and a decorative-renderer failure replacing the status mark with nothing.

- [ ] **Step 3: Run the focused test and verify the RED state**

Run:

```powershell
rtk bun run test -- src/design-system/animations/ActivityIndicator.test.tsx
```

Expected: FAIL because `./ActivityIndicator` does not exist. Do not proceed if it fails for a test syntax or mock-hoisting error.

- [ ] **Step 4: Add the exact local Lottie asset**

Create `src/design-system/animations/activity-indicator.json` with a 60 fps, 54-frame, 48×24 composition. Use three ellipse shape layers at x positions 8, 24, and 40; each ellipse is 6×6 and white in the source asset. Apply the following literal animation table to both opacity and vertical position:

```text
Dot 1: t0 55%/y13, t9 100%/y11, t18 55%/y13, t54 55%/y13
Dot 2: t0 55%/y13, t9 55%/y13, t18 100%/y11, t27 55%/y13, t54 55%/y13
Dot 3: t0 55%/y13, t18 55%/y13, t27 100%/y11, t36 55%/y13, t54 55%/y13
```

The JSON must contain only the standard Lottie keys needed for those three shape layers: `v`, `fr`, `ip`, `op`, `w`, `h`, `nm`, `ddd`, `assets`, and `layers`. Do not include expressions, images, fonts, masks, effects, text, audio, or external asset paths. Keyframe easing for every moving segment is the literal Lumen curve with outgoing handle `{x:[0.2],y:[0.8]}` and incoming handle `{x:[0.2],y:[1]}`.

- [ ] **Step 5: Implement the minimal owned component**

Create `src/design-system/animations/ActivityIndicator.tsx`:

```tsx
import {useEffect, useLayoutEffect, useRef, useState} from 'react';

import {gsap} from 'gsap';
import {CustomEase} from 'gsap/CustomEase';
import lottie, {type AnimationItem} from 'lottie-web';

import activityAnimation from './activity-indicator.json';

gsap.registerPlugin(CustomEase);
const lumenStandardEase = CustomEase.create('lumen-standard', '0.2,0.8,0.2,1');

export interface ActivityIndicatorProps {
  active: boolean;
  reducedMotion: boolean;
  tone: 'success' | 'warning';
}

function ThreeDotMark({forcedColorsOnly = false}: {forcedColorsOnly?: boolean}) {
  return (
    <span
      className={forcedColorsOnly
        ? 'lumen-activity-forced-fallback hidden items-center gap-0.5'
        : 'inline-flex items-center gap-0.5 opacity-55'}
      data-static-activity="three"
    >
      <span className="size-1 rounded-full bg-current" data-static-activity="dot" />
      <span className="size-1 rounded-full bg-current" data-static-activity="dot" />
      <span className="size-1 rounded-full bg-current" data-static-activity="dot" />
    </span>
  );
}

export function ActivityIndicator({
  active,
  reducedMotion,
  tone,
}: ActivityIndicatorProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const animationRunning = active && !reducedMotion && !loadFailed;
  const color = active ? 'text-accent' : tone === 'warning' ? 'text-warning' : 'text-success';

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || reducedMotion) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        wrapper,
        {autoAlpha: 0, y: 4, willChange: 'transform,opacity'},
        {
          autoAlpha: 1,
          clearProps: 'opacity,transform,visibility,willChange',
          duration: 0.14,
          ease: lumenStandardEase,
          force3D: true,
          y: 0,
        },
      );
    }, wrapper);
    return () => context.revert();
  }, [active, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!animationRunning || !host) return;
    let instance: AnimationItem;
    try {
      instance = lottie.loadAnimation({
        animationData: activityAnimation,
        autoplay: true,
        container: host,
        loop: true,
        renderer: 'svg',
        rendererSettings: {
          hideOnTransparent: true,
          progressiveLoad: false,
        },
      });
    } catch {
      setLoadFailed(true);
      return;
    }
    return () => instance.destroy();
  }, [animationRunning]);

  return (
    <span
      ref={wrapperRef}
      aria-hidden="true"
      className={`inline-grid h-2 w-4 shrink-0 place-items-center ${color}`}
      data-activity-indicator
      data-activity-running={animationRunning || undefined}
      data-activity-state={active ? 'active' : 'idle'}
    >
      {animationRunning ? (
        <>
          <span ref={hostRef} className="lumen-activity-lottie block h-2 w-4" data-lottie-host />
          <ThreeDotMark forcedColorsOnly />
        </>
      ) : active ? (
        <ThreeDotMark />
      ) : (
        <span
          className={`size-1.5 rounded-full bg-current ${tone === 'success' ? 'shadow-[0_0_9px_currentColor]' : ''}`}
          data-static-activity="single"
        />
      )}
    </span>
  );
}
```

If TypeScript reports that the JSON import is wider than lottie-web's `animationData` type, narrow only that argument with lottie-web's exported animation-data type. Do not introduce a local duplicate schema or use `any`.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
rtk bun run test -- src/design-system/animations/ActivityIndicator.test.tsx
```

Expected: all four tests PASS. If the external module's actual export shape differs, consult the installed declaration files and adjust the imports and mocks together; do not add a wrapper dependency.

- [ ] **Step 7: Write the failing authored-color and forced-colors CSS contract test**

Add to `src/design-system/global.test.ts`:

```ts
it('keeps the Lottie activity mark semantic and static in forced colors', () => {
  expect(normalizedCss).toContain(`
.lumen-activity-lottie path {
  fill: currentColor !important;
}`);
  expect(normalizedCss).toContain(`
  .lumen-activity-lottie {
    display: none;
  }

  .lumen-activity-forced-fallback {
    display: inline-flex;
  }`);
});
```

- [ ] **Step 8: Run the CSS contract test and verify RED**

Run:

```powershell
rtk bun run test -- src/design-system/global.test.ts
```

Expected: FAIL because the Lottie path and forced-color fallback rules are absent.

- [ ] **Step 9: Add the scoped CSS rules**

Add before the existing `@media (forced-colors: active)` block in `src/design-system/global.css`:

```css
.lumen-activity-lottie path {
  fill: currentColor !important;
}
```

Add inside the existing `@media (forced-colors: active)` block:

```css
  .lumen-activity-lottie {
    display: none;
  }

  .lumen-activity-forced-fallback {
    display: inline-flex;
  }
```

- [ ] **Step 10: Re-run Task 1 tests and static gates**

Run:

```powershell
rtk bun run test -- src/design-system/animations/ActivityIndicator.test.tsx src/design-system/global.test.ts
rtk bun run typecheck
rtk bun run lint
```

Expected: focused tests, typecheck, and lint PASS with no warnings.

- [ ] **Step 11: Commit the independently working indicator**

```powershell
rtk git add -- package.json bun.lock src/design-system/animations/activity-indicator.json src/design-system/animations/ActivityIndicator.tsx src/design-system/animations/ActivityIndicator.test.tsx src/design-system/global.css src/design-system/global.test.ts
rtk git commit -m "feat: add focused activity animation"
```

---

### Task 2: Integrate the indicator without changing status semantics

**Files:**
- Create: `src/features/launcher/LauncherStatus.test.tsx`
- Modify: `src/features/launcher/LauncherStatus.tsx`
- Modify: `src/features/activity/activity.test.tsx`
- Modify: `tests/e2e/performance.spec.ts`

**Interfaces:**
- Consumes: `ActivityIndicator` from Task 1 and the existing `searching`, activity-store, and reduced-motion values.
- Produces: the same `LauncherStatusProps`, the same `output aria-live="polite"`, and a stable 16×8 decorative indicator slot.

- [ ] **Step 1: Write the failing launcher semantics tests**

Create `src/features/launcher/LauncherStatus.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {useActivityStore} from '../activity/activity.store';
import {LauncherStatus} from './LauncherStatus';

function renderStatus(status: React.ReactNode) {
  return render(
    <AppProviders appearance={{
      mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced',
    }}>
      {status}
    </AppProviders>,
  );
}

afterEach(() => useActivityStore.getState().reset());

describe('LauncherStatus', () => {
  it('keeps searching text live while reduced motion uses a static active mark', () => {
    const {container} = renderStatus(<LauncherStatus label="Searching" searching />);

    expect(screen.getByText('Searching').closest('output')).toHaveAttribute('aria-live', 'polite');
    expect(container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'active',
    );
    expect(container.querySelector('[data-activity-running]')).not.toBeInTheDocument();
  });

  it('keeps ready and paused states static with explicit text', () => {
    const ready = renderStatus(<LauncherStatus label="8 results" />);
    expect(ready.container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'idle',
    );
    ready.unmount();

    useActivityStore.setState({active: true, mode: 'gaming'});
    const paused = renderStatus(<LauncherStatus label="8 results" searching />);
    expect(screen.getByText('Gaming pause')).toBeVisible();
    expect(paused.container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'idle',
    );
  });
});
```

Also extend the existing `contracts the launcher status into a quiet paused indicator` test in `src/features/activity/activity.test.tsx` with:

```tsx
expect(document.querySelector('[data-activity-indicator]')).toHaveAttribute(
  'data-activity-state',
  'idle',
);
```

- [ ] **Step 2: Add the failing browser-level settled-state assertion**

Add to `tests/e2e/performance.spec.ts`:

```ts
test('keeps the ready activity indicator settled', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');

  const indicator = page.locator('[data-activity-indicator]');
  await expect(indicator).toHaveAttribute('data-activity-state', 'idle');
  await expect(page.locator('[data-activity-running="true"]')).toHaveCount(0);
});
```

- [ ] **Step 3: Run the focused unit test and verify RED**

Run:

```powershell
rtk bun run test -- src/features/launcher/LauncherStatus.test.tsx src/features/activity/activity.test.tsx
```

Expected: FAIL because `LauncherStatus` does not render `[data-activity-indicator]`.

- [ ] **Step 4: Replace only the decorative dot branch**

Modify `src/features/launcher/LauncherStatus.tsx`:

```tsx
import {ActivityIndicator} from '../../design-system/animations/ActivityIndicator';
import {useLumenMotion} from '../../design-system/MotionProvider';
```

Remove the `motion/react` import. Keep the store reads and live-region markup. Replace the current pulse/static conditional with:

```tsx
const active = searching && !activityActive;

<ActivityIndicator
  active={active}
  reducedMotion={reducedMotion}
  tone={activityActive ? 'warning' : 'success'}
/>
```

Do not change how `activityLabel`, `data-activity-compact`, `data-testid`, or visible text are selected.

- [ ] **Step 5: Verify unit and Edge behavior**

Run:

```powershell
rtk bun run test -- src/features/launcher/LauncherStatus.test.tsx src/features/activity/activity.test.tsx src/features/gateway/gateway.test.tsx
rtk bun run test:e2e -- tests/e2e/performance.spec.ts -g "ready activity indicator"
```

Expected: all focused tests PASS. The E2E test uses installed Edge through the repository Playwright configuration.

- [ ] **Step 6: Commit the launcher integration**

```powershell
rtk git add -- src/features/launcher/LauncherStatus.tsx src/features/launcher/LauncherStatus.test.tsx src/features/activity/activity.test.tsx tests/e2e/performance.spec.ts
rtk git commit -m "feat: animate active launcher status"
```

---

### Task 3: Include AI-answer phases in the existing activity signal

**Files:**
- Modify: `src/features/launcher/SearchExperience.tsx`
- Modify: `src/features/launcher/SearchExperience.test.tsx`

**Interfaces:**
- Consumes: `answer.phase`, `controller.lifecycle`, `computerUse.phase`, and existing compact status labels.
- Produces: no new exported API; `CollapsedLauncher.searching` becomes true for answer `waiting|streaming`, and `statusLabel` becomes `Answering` while those phases have priority over local-search result text.

- [ ] **Step 1: Write the failing answer-activity integration test**

Add to `src/features/launcher/SearchExperience.test.tsx`:

```tsx
it('keeps the single launcher indicator active while an answer waits and streams', async () => {
  const user = userEvent.setup();
  const service = new MemorySearchService();
  const answers = new MemoryAnswerService();
  const {container} = render(
    <SearchExperience
      answerService={answers}
      service={service}
      windowService={new BrowserWindowService()}
    />,
  );

  const input = screen.getByRole('searchbox', {name: 'Search files'});
  await user.type(input, 'release');
  await waitFor(() => expect(
    service.requests.some(({request}) => request.query === 'release'),
  ).toBe(true));
  await act(() => service.resolve('release', []));
  await user.keyboard('{Enter}');

  expect(await screen.findByText('Answering')).toBeVisible();
  expect(container.querySelector('[data-activity-indicator]')).toHaveAttribute(
    'data-activity-state',
    'active',
  );

  await waitFor(() => expect(answers.requests).toHaveLength(1));
  await act(() => answers.emit('release', {
    type: 'started', provider: 'memory', model: 'memory', route: 'local',
  }));
  expect(screen.getByText('Answering')).toBeVisible();

  await act(() => answers.emit('release', {
    type: 'completed', provider: 'memory', model: 'memory', route: 'local',
  }));
  await waitFor(() => expect(screen.queryByText('Answering')).not.toBeInTheDocument());
  expect(container.querySelector('[data-activity-indicator]')).toHaveAttribute(
    'data-activity-state',
    'idle',
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
rtk bun run test -- src/features/launcher/SearchExperience.test.tsx -t "single launcher indicator"
```

Expected: FAIL because the answer waiting/streaming phases do not currently drive the footer indicator or `Answering` label.

- [ ] **Step 3: Add the minimal derived value and label priority**

In `src/features/launcher/SearchExperience.tsx`, derive once before the JSX return:

```tsx
const answerRunning = answer.phase === 'waiting' || answer.phase === 'streaming';
```

Change only the search-intent branches passed to `CollapsedLauncher`:

```tsx
searching={intent === 'computer'
  ? computerUse.phase === 'starting' || computerUse.phase === 'running'
  : controller.lifecycle === 'searching' || answerRunning}
statusLabel={intent === 'computer'
  ? computerUse.phase === 'approval' ? 'Approval'
    : computerUse.phase === 'completed' ? 'Done'
      : computerUse.phase === 'error' ? 'Unavailable'
        : computerUse.phase === 'running' || computerUse.phase === 'starting' ? 'Working'
          : 'Browser agent'
  : answerRunning ? 'Answering'
    : statusLabel(controller.lifecycle, controller.results.length)}
```

Do not store `answerRunning`, do not animate `AnswerPanel`, and do not create a second Lottie instance.

- [ ] **Step 4: Verify the integration and surrounding behavior**

Run:

```powershell
rtk bun run test -- src/features/launcher/SearchExperience.test.tsx src/features/answer/AnswerPanel.test.tsx src/features/computer-use/useComputerUseController.test.tsx
rtk bun run typecheck
rtk bun run lint
```

Expected: all focused tests, typecheck, and lint PASS.

- [ ] **Step 5: Commit the answer-phase wiring**

```powershell
rtk git add -- src/features/launcher/SearchExperience.tsx src/features/launcher/SearchExperience.test.tsx
rtk git commit -m "feat: show answer activity in launcher"
```

---

### Task 4: Measure settling and refresh checked-in UI evidence

**Files:**
- Modify: `scripts/performance-profile.mjs`
- Modify: `docs/architecture/motion-system.md`
- Regenerate: `artifacts/screenshots/**`
- Regenerate: `artifacts/recordings/**`
- Regenerate: `artifacts/performance/profile-summary.json`
- Regenerate: `artifacts/performance/interaction-trace.zip`

**Interfaces:**
- Consumes: `[data-activity-running="true"]` from Task 1 and the existing performance metrics object.
- Produces: `measured.activeActivityIndicatorsAfterSettle`, a zero budget, a `settledActivityIndicator` release check, and refreshed visual/performance manifests.

- [ ] **Step 1: Extend the performance profile's settled measurement**

Immediately after the existing `activeAnimations` measurement in `scripts/performance-profile.mjs`, add:

```js
const activeActivityIndicators = await page
  .locator('[data-activity-running="true"]')
  .count();
```

Add to `measured`:

```js
activeActivityIndicatorsAfterSettle: activeActivityIndicators,
```

Add to `budgets`:

```js
activeActivityIndicatorsAfterSettle: 0,
```

Add to `checks`:

```js
settledActivityIndicator: measured.activeActivityIndicatorsAfterSettle ===
  budgets.activeActivityIndicatorsAfterSettle,
```

Extend the `profile` description with `activity-indicator settle verification`. Do not relax an existing budget.

- [ ] **Step 2: Document the ownership boundary**

Add this paragraph after the spatial rules in `docs/architecture/motion-system.md`:

```markdown
The compact launcher activity mark is the only Lottie/GSAP-owned motion path. A local, monochrome three-dot Lottie SVG loops only while file search, Computer Use, or an AI answer is active; GSAP scopes one transform/opacity settle transition to that mark and reverts it on state changes and unmount. Reduced motion uses the resting frame, forced colors use the static mark, and every other Lumen transition remains owned by Motion, WAAPI, React Aria, or CSS as described above.
```

Extend the performance section with:

```markdown
WebView2 keeps its default GPU-enabled configuration. Lumen adds no browser flag that disables GPU rendering; transform/opacity movement is compositor-eligible, but reports do not claim that hardware compositing is available when Windows, WebView2, a graphics driver, policy, or a remote session selects software fallback.
```

- [ ] **Step 3: Run functional gates before expensive evidence capture**

Run in order:

```powershell
rtk bun run typecheck
rtk bun run lint
rtk bun run test
rtk bun run test:e2e
rtk bun run build
```

Expected: every command exits 0. Stop and fix regressions before regenerating evidence. If Playwright reuses a stale port-1420 server, identify the exact listener, stop only that listener, and rerun against the fresh server.

- [ ] **Step 4: Regenerate screenshots and inspect the contact sheet**

Run:

```powershell
rtk bun run capture:gallery
```

Verify `artifacts/screenshots/manifest.json` reports `count: 53`, then inspect `artifacts/screenshots/contact-sheet.png` for status alignment, forced/reduced-motion states, clipping, color mismatch, and distracting motion residue. A screenshot cannot prove animation timing; it proves resting layout and styling only.

- [ ] **Step 5: Regenerate and inspect interaction recordings**

Run:

```powershell
rtk bun run record:interactions
```

Verify `artifacts/recordings/manifest.json` reports `count: 6`. Inspect the launcher-search recording for a stable text baseline, no status-slot layout shift, a quiet three-dot loop only during work, and a clean return to the static dot.

- [ ] **Step 6: Regenerate and read the performance evidence**

Run:

```powershell
rtk bun run profile
```

Read `artifacts/performance/profile-summary.json` and require all of these literal outcomes before proceeding:

```text
passed = true
checks.settledAnimations = true
checks.settledActivityIndicator = true
measured.activeAnimationsAfterSettle = 0
measured.activeActivityIndicatorsAfterSettle = 0
measured.repeatedBrowserLongTasksOver50Ms.length = 0
measured.idleCpuPercent < 2
measured.jsHeapMegabytes < 100
```

Report `strict240Hz.passed` separately from the cadence-aware `passed` result; do not turn environmental cadence variance into a hardware-acceleration claim.

- [ ] **Step 7: Confirm no GPU-disabling configuration was introduced**

Run:

```powershell
rtk rg -n -i "disable-gpu|swiftshader|software-render|additionalBrowserArgs" src-tauri src scripts vite.config.ts package.json
```

Expected: no Lumen runtime configuration introduces a GPU-disabling or software-rendering flag. Existing test-only/headless launch arguments must be reported accurately rather than treated as native WebView2 configuration.

- [ ] **Step 8: Commit documentation and refreshed evidence**

```powershell
rtk git add -- scripts/performance-profile.mjs docs/architecture/motion-system.md artifacts/screenshots artifacts/recordings artifacts/performance
rtk git commit -m "perf: verify focused motion evidence"
```

---

### Task 5: Run final clean-tree verification

**Files:**
- Verify only; modify a file only to fix a demonstrated failure, then rerun the affected and full gates.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: fresh completion evidence and a clean working tree.

- [ ] **Step 1: Run the complete frontend verification suite from the final commit**

```powershell
rtk bun run typecheck
rtk bun run lint
rtk bun run test
rtk bun run test:e2e
rtk bun run build
```

Expected: every command exits 0; ESLint has zero warnings; Vitest and Playwright report zero failures.

- [ ] **Step 2: Re-read the final performance summary**

Confirm the summary was generated from the final implementation commit or rerun `rtk bun run profile` after any post-profile code change. Require `passed: true`, zero settled indicators, zero settled Web Animations, and the unchanged idle CPU/heap/long-task budgets.

- [ ] **Step 3: Verify repository integrity and scope**

```powershell
rtk git diff --check
rtk git status --short --branch
rtk git log -5 --oneline
```

Expected: no whitespace errors, no uncommitted files, and only the approved design, plan, implementation, tests, docs, dependency lockfile, and regenerated evidence commits. The checkout remains detached unless the Codex app creates a `codex/` branch.

- [ ] **Step 4: Report the hardware boundary accurately**

The handoff must say that Lumen retains WebView2's GPU-enabled default and uses compositor-eligible transform/opacity motion. It must not claim that hardware acceleration was forced or proven on all machines. Include the measured Edge version, refresh estimate, cadence-aware profile result, strict-240-Hz result, idle CPU, heap, long-task count, and settled-animation counts from the final summary.
