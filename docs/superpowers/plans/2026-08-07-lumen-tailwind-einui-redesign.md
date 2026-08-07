# Lumen Tailwind and EinUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lumen's StyleX/Astryx/Phosphor presentation stack with Tailwind CSS v4, an owned EinUI Glass Command Palette surface, and OpenAI Apps SDK UI interface icons while preserving the real Tauri search, preview, streamed-answer, settings, and Computer Use integrations.

**Architecture:** Keep React as a presentation client over the existing typed services and Zustand stores. Tailwind's CSS-first semantic variables own authored styling, React Aria continues to own accessible behavior, Motion for React owns interruptible inner-surface animation, and the existing `WindowService`/Rust window module continues to own native bounds. The vendored EinUI palette is a slot-based visual shell around Lumen's live controllers; it contains no sample data, routing, global shortcut, search, or provider logic.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite 8, Bun, Tailwind CSS v4, `@tailwindcss/vite`, React Aria Components, Motion for React, `@openai/apps-sdk-ui`, selected owned EinUI source, Zustand, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Use Bun for every JavaScript dependency and script command. Do not run npm or yarn.
- Read `docs/architecture/search-service.md` before editing launcher, result-selection, or preview code.
- React must not call filesystem, provider, retrieval, or automation APIs directly. Preserve `SearchService`, `AnswerService`, `ComputerUseService`, `WindowService`, Zod validation, abort handling, stale-response rejection, root confinement, and secret isolation.
- The current native geometry remains authoritative: collapsed `700 x 66`, expanded `800 x 540`, onboarding `800 x 600`, settings `880 x 600`, and gallery `1120 x 760` logical pixels. Do not move geometry ownership into React.
- Use Tailwind CSS v4 as the only final Lumen-authored styling system. Temporary StyleX coexistence is allowed only through Task 9.
- Preserve the EinUI Glass Command Palette's inner visual recipe. Replace its Lucide icons, demo arrays, local filtering, `window.location.href`, modal backdrop, and browser shortcut listener.
- Use `@openai/apps-sdk-ui/components/Icon` for interface chrome. Keep `LumenMark`, `FileGlyph`, safe file thumbnails, and real Windows application icons for identity.
- Do not import the Apps SDK UI global stylesheet when using icons only. Lumen's semantic theme remains product- and provider-neutral.
- Retain React Aria Components for buttons, tabs, dialogs, switches, selects, focus management, and keyboard semantics. Do not replace accessible behavior with styled `div` elements.
- Reuse the installed `motion` package. Do not add `framer-motion`, Lucide, another animation runtime, or a general glass-effect dependency.
- Do not invent web retrieval, attachments, application indexing, MCP, conversation persistence, new model providers, or full desktop automation in this migration. Unsupported capabilities stay absent, honestly disabled, or development-gallery-only.
- Local search may react to typing. AI generation starts only after an explicit composer submission; it must never run on every keystroke.
- Preserve the existing browser-only Computer Use safety boundary. This UI project does not widen observation, process-launch, credential, UAC, secure-desktop, or shell permissions.
- Maintain system/light/dark appearance, opaque fallback, high contrast, reduced effects, reduced motion, IME composition, Unicode, 100-200 percent scaling, keyboard-only use, and Narrator-readable status.
- Continuous animation is limited to opacity and transform. Native geometry, blur, and large shadows change only at controlled state boundaries.
- Keep the existing `.serena/` directory untouched and untracked.
- Use Conventional Commits with lowercase subjects. Stage only the files named by the current task.

---

## Target File Structure

- `src/lib/cn.ts`: the single `clsx` plus `tailwind-merge` class composer.
- `src/design-system/theme.ts`: framework-independent appearance contract used by App, gallery, and providers.
- `src/design-system/global.css`: Tailwind import, semantic tokens, appearance axes, material fallback, focus fallback, and the frozen palette-only exceptions.
- `src/design-system/primitives/*`: React Aria-backed Tailwind primitives with their existing public APIs.
- `src/design-system/icons/LumenUiIcon.tsx`: typed semantic bridge to Apps SDK UI icons.
- `src/design-system/icons/LumenMark.tsx`, `src/design-system/icons/lumen-icons.tsx`: Lumen-owned product identity and domain glyphs.
- `src/design-system/file-glyphs/*`: result identity; not replaced by generic interface icons.
- `src/components/ui/GlassCommandPalette.tsx`: owned, behavior-free EinUI visual shell.
- `src/components/ui/einui-provenance.md`: source URL, upstream revision, retrieval date, license, dependencies, frozen regions, and local changes.
- `src/features/launcher/query.store.ts`: live local query plus explicit answer submission state.
- `src/features/launcher/useLauncherPresentation.ts`: race-safe coordination between native bounds and inner-surface reveal/dismissal.
- Existing `src/features`, `src/services`, `src/platform`, and `src-tauri` boundaries remain in place.

### Task 1: Add Tailwind v4 beside the still-working StyleX application

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Modify: `src/design-system/global.css`
- Create: `src/lib/cn.ts`
- Create: `src/lib/cn.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string`.
- Preserves: current StyleX extraction temporarily so every intermediate commit remains runnable.

- [ ] **Step 1: Write the failing class-composition test**

```ts
import {describe, expect, it} from 'vitest';

import {cn} from './cn';

describe('cn', () => {
  it('merges conditional classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2 text-sm', false && 'hidden', 'px-4')).toBe('text-sm px-4');
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module fails**

Run: `rtk bun run test -- src/lib/cn.test.ts`

Expected: FAIL because `src/lib/cn.ts` does not exist.

- [ ] **Step 3: Install only the approved migration dependencies**

Run:

```powershell
rtk bun add @openai/apps-sdk-ui clsx tailwind-merge class-variance-authority
rtk bun add -d tailwindcss@^4 @tailwindcss/vite@^4
```

Expected: `package.json` and `bun.lock` gain Tailwind v4, the Vite adapter, the Apps SDK UI package, and the three small class helpers. Do not add shadcn, Lucide, Radix packages, or another motion package.

- [ ] **Step 4: Implement `cn`**

```ts
import {clsx, type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Configure Tailwind without removing StyleX yet**

Use the Vite plugins in this order:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';
import {defineConfig} from 'vite';

export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    stylex.vite({devMode: 'full', useCSSLayers: true}),
    react(),
  ],
}));
```

Keep the existing server, build grouping, and Tauri settings around this plugin change. Add `tailwindcss()` to `vitest.config.ts` before the temporary StyleX test plugin so CSS imported by component tests uses the same Tailwind transform.

- [ ] **Step 6: Establish the CSS-first semantic token contract**

Start `src/design-system/global.css` with:

```css
@import "tailwindcss";

@custom-variant theme-dark (&:where([data-resolved-theme="dark"], [data-resolved-theme="dark"] *));
@custom-variant high-contrast (&:where([data-contrast="high"], [data-contrast="high"] *));
@custom-variant reduced-motion (&:where([data-reduced-motion="true"], [data-reduced-motion="true"] *));
@custom-variant opaque (&:where([data-transparency="disabled"], [data-transparency="disabled"] *));

@theme inline {
  --font-sans: "Segoe UI Variable Text", "Segoe UI", sans-serif;
  --font-display: "Segoe UI Variable Display", "Segoe UI", sans-serif;
  --color-canvas: var(--lumen-canvas);
  --color-surface-glass: var(--lumen-surface-glass);
  --color-surface-raised: var(--lumen-surface-raised);
  --color-surface-inset: var(--lumen-surface-inset);
  --color-text-primary: var(--lumen-text-primary);
  --color-text-secondary: var(--lumen-text-secondary);
  --color-text-tertiary: var(--lumen-text-tertiary);
  --color-text-inverse: var(--lumen-text-inverse);
  --color-accent: var(--lumen-accent);
  --color-focus: var(--lumen-focus);
  --color-border-subtle: var(--lumen-border-subtle);
  --color-border-strong: var(--lumen-border-strong);
  --color-border-specular: var(--lumen-border-specular);
  --color-success: var(--lumen-success);
  --color-warning: var(--lumen-warning);
  --color-danger: var(--lumen-danger);
  --radius-pill: var(--lumen-radius-pill);
  --radius-surface: var(--lumen-radius-surface);
  --radius-control: var(--lumen-radius-control);
  --shadow-surface: var(--lumen-shadow-surface);
  --shadow-control: var(--lumen-shadow-control);
  --ease-standard: cubic-bezier(.2, .8, .2, 1);
  --ease-exit: cubic-bezier(.4, 0, 1, 1);
}
```

Define the complete light and dark variable values below this block, using the approved graphite/smoke/pearl palette. Preserve the current reset, transparent host, native-material fallback, forced-colors rules, reduced-motion rules, and existing diagnostic keyframes until their consumers migrate.

- [ ] **Step 7: Verify coexistence**

Run:

```powershell
rtk bun run test -- src/lib/cn.test.ts src/app/App.test.tsx
rtk bun run typecheck
rtk bun run build
```

Expected: all commands exit 0; the current application still renders while Tailwind utilities compile.

- [ ] **Step 8: Commit the foundation**

```powershell
rtk git add package.json bun.lock vite.config.ts vitest.config.ts src/design-system/global.css src/lib/cn.ts src/lib/cn.test.ts
rtk git commit -m "build: add tailwind ui foundation"
```

### Task 2: Move appearance and shared primitives off StyleX

**Files:**
- Create: `src/design-system/theme.ts`
- Replace: `src/design-system/themes.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppProviders.tsx`
- Modify: `src/features/gallery/gallery.types.ts`
- Modify: `src/design-system/primitives/LumenButton.tsx`
- Modify: `src/design-system/primitives/LumenIconButton.tsx`
- Modify: `src/design-system/primitives/LumenSurface.tsx`
- Modify: `src/design-system/primitives/LumenText.tsx`
- Modify: `src/design-system/primitives/primitives.test.tsx`
- Modify: `src/design-system/icons/LumenIcon.tsx`
- Modify: `src/design-system/icons/LumenMark.tsx`
- Modify: `src/design-system/file-glyphs/FileGlyph.tsx`
- Modify: `src/design-system/file-glyphs/FileGlyph.test.tsx`

**Interfaces:**
- Produces: `AppearancePreferences`, `defaultAppearance`, and `themeContracts` without a styling-runtime dependency.
- Preserves: all existing primitive prop types, React Aria render-prop behavior, `data-material`, and appearance data attributes.

- [ ] **Step 1: Change the theme test to require a framework-independent contract**

```ts
import {describe, expect, it} from 'vitest';

import {defaultAppearance, themeContracts} from './theme';

describe('Lumen theme contract', () => {
  it('exposes every required appearance axis', () => {
    expect(Object.keys(themeContracts)).toEqual([
      'light',
      'dark',
      'opaque',
      'highContrast',
      'reducedEffects',
      'reducedMotion',
    ]);
    expect(defaultAppearance).toEqual({
      mode: 'system',
      transparency: 'native',
      effects: 'full',
      motion: 'system',
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm the new module is missing**

Run: `rtk bun run test -- src/design-system/themes.test.ts`

Expected: FAIL because `src/design-system/theme.ts` does not exist.

- [ ] **Step 3: Implement the appearance contract**

```ts
import type {AppearanceSettings} from '../state/appearance.schema';

export type AppearancePreferences = Pick<
  AppearanceSettings,
  'mode' | 'transparency' | 'effects' | 'motion'
>;

export const defaultAppearance: AppearancePreferences = {
  mode: 'system',
  transparency: 'native',
  effects: 'full',
  motion: 'system',
};

export const themeContracts = {
  light: 'light',
  dark: 'dark',
  opaque: 'opaque',
  highContrast: 'highContrast',
  reducedEffects: 'reducedEffects',
  reducedMotion: 'reducedMotion',
} as const;
```

Update App, AppProviders, and gallery types to import this contract. `AppProviders` must continue resolving system theme, forced colors, contrast, reduced motion, and persistence, but its root becomes a Tailwind class string plus the existing `data-*` attributes instead of `stylex.props`.

- [ ] **Step 4: Write failing primitive state assertions**

Extend `primitives.test.tsx` to assert that a button receives visible state hooks from React Aria and that a surface retains material identity:

```tsx
expect(screen.getByRole('button', {name: 'Continue'})).toHaveAttribute('data-variant', 'primary');
expect(screen.getByTestId('surface')).toHaveAttribute('data-material', 'mica');
```

- [ ] **Step 5: Convert primitives internally while preserving their APIs**

Use `class-variance-authority` only for `LumenButton` and keep the other primitives as direct `cn` compositions. The button definition must preserve React Aria states:

```ts
const buttonStyles = cva(
  'inline-flex min-w-11 cursor-default select-none items-center justify-center gap-2 rounded-control border font-sans outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard data-[focus-visible]:ring-2 data-[focus-visible]:ring-focus/70 data-[pressed]:translate-y-px data-[pressed]:scale-[.985] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55',
  {
    variants: {
      variant: {
        primary: 'border-border-specular bg-accent text-text-inverse data-[hovered]:brightness-110',
        subtle: 'border-border-subtle bg-surface-raised text-text-primary data-[hovered]:border-border-strong',
        quiet: 'border-transparent bg-transparent text-text-secondary shadow-none data-[hovered]:bg-surface-inset data-[hovered]:text-text-primary',
        danger: 'border-danger/45 bg-danger/10 text-danger',
      },
      size: {
        small: 'min-h-8 px-3 text-xs',
        medium: 'min-h-9 px-4 text-sm',
        large: 'min-h-11 px-5 text-[15px]',
      },
    },
    defaultVariants: {size: 'medium', variant: 'subtle'},
  },
);
```

`LumenSurface` keeps its tint, luminosity, noise, and content layers, but assigns them Tailwind classes and semantic CSS variables. Opaque/high-contrast variants must disable backdrop blur and noise. Convert the custom SVG wrapper and Lumen mark sizing to `cn` without changing their path geometry.

- [ ] **Step 6: Verify theme and primitive compatibility**

Run:

```powershell
rtk bun run test -- src/design-system/themes.test.ts src/design-system/primitives/primitives.test.tsx src/app/App.test.tsx
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0 and the public primitive APIs remain source-compatible with unmigrated feature files.

- [ ] **Step 7: Commit the primitive migration**

```powershell
rtk git add src/design-system/theme.ts src/design-system/themes.test.ts src/app/App.tsx src/app/AppProviders.tsx src/features/gallery/gallery.types.ts src/design-system/primitives src/design-system/icons/LumenIcon.tsx src/design-system/icons/LumenMark.tsx src/design-system/file-glyphs/FileGlyph.tsx src/design-system/file-glyphs/FileGlyph.test.tsx
rtk git commit -m "refactor: migrate design primitives to tailwind"
```

### Task 3: Add the typed Apps SDK UI icon bridge and remove Phosphor use

**Files:**
- Create: `src/design-system/icons/LumenUiIcon.tsx`
- Create: `src/design-system/icons/LumenUiIcon.test.tsx`
- Modify: `src/features/answer/AnswerPanel.tsx`
- Modify: `src/features/computer-use/ComputerUsePanel.tsx`
- Modify: `src/features/activity/ActivityStatus.tsx`
- Modify: `src/features/activity/ApplicationOverrideRow.tsx`
- Modify: `src/features/diagnostics/DiagnosticsOverlay.tsx`
- Modify: `src/features/gallery/ScenarioControls.tsx`
- Modify: `src/features/gateway/GatewayStatusPanel.tsx`
- Modify: `src/features/launcher/CollapsedLauncher.tsx`
- Modify: `src/features/launcher/ContextActions.tsx`
- Modify: `src/features/launcher/FilterChips.tsx`
- Modify: `src/features/launcher/SearchInput.tsx`
- Modify: `src/features/onboarding/OnboardingFlow.tsx`
- Modify: `src/features/onboarding/RootSelectionScene.tsx`
- Modify: `src/features/onboarding/ShortcutScene.tsx`
- Modify: `src/features/preview/PreviewPane.tsx`
- Modify: `src/features/settings/SettingsNav.tsx`
- Modify: `src/features/settings/SettingsShell.tsx`
- Modify: `src/features/settings/components/IndexedRootRow.tsx`
- Modify: `src/features/settings/components/SettingsControls.tsx`
- Modify: `src/features/settings/components/ShortcutRecorder.tsx`
- Modify: `src/features/settings/pages/ActivityPage.tsx`
- Modify: `src/features/settings/pages/AgentGatewayPage.tsx`
- Modify: `src/features/settings/pages/ComputerUsePage.tsx`
- Modify: `src/features/settings/pages/DiagnosticsPage.tsx`
- Modify: `src/features/settings/pages/IndexedRootsPage.tsx`
- Modify: `src/features/settings/pages/LocalAiPage.tsx`
- Modify: `src/features/settings/pages/PrivacyPage.tsx`

**Interfaces:**
- Produces: `LumenUiIconName` and `LumenUiIcon`.
- Preserves: Lumen product icons, file glyphs, thumbnails, and native app icons.

- [ ] **Step 1: Write the icon contract test**

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {LumenUiIcon} from './LumenUiIcon';

describe('LumenUiIcon', () => {
  it('renders interface icons as decorative current-color SVGs', () => {
    render(<span data-testid="host"><LumenUiIcon name="search" size="medium" /></span>);
    const icon = screen.getByTestId('host').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
    expect(icon).toHaveClass('size-5');
  });
});
```

- [ ] **Step 2: Run the test and confirm the bridge is missing**

Run: `rtk bun run test -- src/design-system/icons/LumenUiIcon.test.tsx`

Expected: FAIL because `LumenUiIcon.tsx` does not exist.

- [ ] **Step 3: Implement the semantic mapping with verified exports**

```tsx
import type {ComponentType, SVGProps} from 'react';
import {
  ArrowRight,
  Bug,
  Camera,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Connect,
  Copy,
  DataControls,
  Desktop,
  Document,
  Download,
  FileImage,
  Folder,
  FolderOpen,
  Globe,
  Grid,
  Key,
  Keyboard,
  Paperclip,
  Pause,
  Play,
  Plus,
  Regenerate,
  Reload,
  Search,
  Settings,
  ShieldCheck,
  Sparkle,
  Stop,
  Tools,
  Trash,
  User,
  Voice,
  Warning,
  X,
} from '@openai/apps-sdk-ui/components/Icon';

import {cn} from '../../lib/cn';

const icons = {
  approval: Check,
  add: Plus,
  attachment: Paperclip,
  bug: Bug,
  camera: Camera,
  close: X,
  connect: Connect,
  computer: Desktop,
  copy: Copy,
  delete: Trash,
  document: Document,
  download: Download,
  error: Warning,
  folder: Folder,
  folderOpen: FolderOpen,
  forward: ArrowRight,
  grid: Grid,
  hardware: DataControls,
  image: FileImage,
  key: Key,
  keyboard: Keyboard,
  model: Sparkle,
  next: ChevronRight,
  pause: Pause,
  play: Play,
  previous: ChevronLeft,
  privacy: ShieldCheck,
  refresh: Reload,
  retry: Regenerate,
  search: Search,
  settings: Settings,
  stop: Stop,
  success: CheckCircle,
  tools: Tools,
  user: User,
  voice: Voice,
  web: Globe,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type LumenUiIconName = keyof typeof icons;

export interface LumenUiIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: LumenUiIconName;
  size?: 'small' | 'medium' | 'large';
}

export function LumenUiIcon({className, name, size = 'medium', ...props}: LumenUiIconProps) {
  const Icon = icons[name];
  return (
    <Icon
      {...props}
      aria-hidden="true"
      className={cn(size === 'small' && 'size-4', size === 'medium' && 'size-5', size === 'large' && 'size-6', className)}
      focusable="false"
    />
  );
}
```

- [ ] **Step 4: Replace Phosphor interface imports screen by screen**

Use semantic names from the bridge. Keep icons decorative inside labelled controls. Destructive actions must retain explicit text or an `aria-label`; do not depend on the `X` shape to communicate deletion. Keep product-specific `GatewayIcon`, `McpIcon`, `LocalAiIcon`, `NpuIcon`, and file glyphs where they identify a domain rather than an interface action.

- [ ] **Step 5: Verify the icon migration**

Run:

```powershell
rtk bun run test -- src/design-system/icons/LumenUiIcon.test.tsx src/features/answer/AnswerPanel.test.tsx src/features/settings/SettingsShell.test.tsx
rtk bun run typecheck
rtk rg -n "@phosphor-icons/react" src
```

Expected: tests and typecheck pass; the final `rg` command returns no matches and exit code 1.

- [ ] **Step 6: Commit the icon bridge**

```powershell
rtk git add src/design-system/icons/LumenUiIcon.tsx src/design-system/icons/LumenUiIcon.test.tsx src/features
rtk git commit -m "refactor: adopt apps sdk ui icons"
```

### Task 4: Vendor the EinUI palette as an owned visual-only component

**Files:**
- Create: `src/components/ui/GlassCommandPalette.tsx`
- Create: `src/components/ui/GlassCommandPalette.test.tsx`
- Create: `src/components/ui/einui-provenance.md`

**Interfaces:**
- Produces: `GlassCommandPalette` with `composer`, `scopes`, `body`, `footer`, and `expanded` slots.
- Forbids: command arrays, query state, result filtering, navigation URLs, global listeners, portals, and provider calls.

- [ ] **Step 1: Retrieve and review the registry source without writing it directly into the app**

Run:

```powershell
rtk powershell -NoProfile -Command "$target = Join-Path $env:TEMP 'lumen-einui-glass-command-palette.json'; Invoke-WebRequest -Uri 'https://ui.eindev.ir/r/glass-command-palette.json' -OutFile $target; Get-FileHash -Algorithm SHA256 -LiteralPath $target; Get-Content -LiteralPath $target"
rtk git ls-remote https://github.com/einui/einui.git refs/heads/main
```

Expected: the registry JSON, its SHA-256, and the upstream main revision are available for review. Record the exact values, retrieval date, MIT license, registry URL, retained visual regions, removed demo behavior, and icon substitutions in `einui-provenance.md`.

- [ ] **Step 2: Write failing presentation-boundary tests**

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {GlassCommandPalette} from './GlassCommandPalette';

describe('GlassCommandPalette', () => {
  it('renders caller-owned regions without installing a browser shortcut', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    render(
      <GlassCommandPalette
        body={<div>Live results</div>}
        composer={<input aria-label="Ask or search" />}
        expanded
        footer={<div>Private</div>}
      />,
    );
    expect(screen.getByRole('textbox', {name: 'Ask or search'})).toBeVisible();
    expect(screen.getByText('Live results')).toBeVisible();
    expect(addEventListener).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
```

- [ ] **Step 3: Run the test and confirm the component is missing**

Run: `rtk bun run test -- src/components/ui/GlassCommandPalette.test.tsx`

Expected: FAIL because the owned component does not exist.

- [ ] **Step 4: Implement the slot-only palette**

```tsx
import type {HTMLAttributes, ReactNode} from 'react';

import {cn} from '../../lib/cn';

export interface GlassCommandPaletteProps extends HTMLAttributes<HTMLDivElement> {
  body?: ReactNode;
  composer: ReactNode;
  expanded: boolean;
  footer?: ReactNode;
  scopes?: ReactNode;
}

export function GlassCommandPalette({
  body,
  className,
  composer,
  expanded,
  footer,
  scopes,
  ...props
}: GlassCommandPaletteProps) {
  return (
    <div
      {...props}
      className={cn('einui-command-palette relative isolate flex size-full min-w-0 flex-col overflow-hidden', className)}
      data-expanded={expanded}
      data-upstream="einui-glass-command-palette"
    >
      <span aria-hidden="true" className="einui-command-glow" />
      <span aria-hidden="true" className="einui-command-specular" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {composer}
        {expanded ? scopes : null}
        {expanded ? <div className="min-h-0 flex-1 overflow-hidden">{body}</div> : null}
        {expanded ? footer : null}
      </div>
    </div>
  );
}
```

Copy the upstream palette's surface, glow, border, typography proportions, row treatment, shortcut hint, and footer class recipe exactly into the component/global CSS. Map frozen palette literals to palette-specific CSS variables whose normal light/dark resolved values remain visually identical to upstream. The only visible substitutions are Apps SDK UI icons plus required opaque/high-contrast/focus accessibility corrections. Do not copy the fullscreen backdrop or positioning variants because Tauri is the host.

- [ ] **Step 5: Freeze the visual recipe and ownership boundary**

Add assertions for `data-upstream`, the palette/glow/specular layers, slot ordering, collapsed omission of body/footer, and absence of command/demo props. Freeze the upstream recipe markers in the component test; the full dark/light/opaque/high-contrast gallery coverage is added in Task 10 with the rest of the gallery migration.

- [ ] **Step 6: Verify and commit the owned component**

Run:

```powershell
rtk bun run test -- src/components/ui/GlassCommandPalette.test.tsx
rtk bun run typecheck
rtk bun run lint
rtk git add src/components/ui
rtk git commit -m "feat: vendor einui glass command surface"
```

### Task 5: Separate live local typing from explicit AI submission

**Files:**
- Modify: `src/features/launcher/query.store.ts`
- Modify: `src/features/launcher/stores.test.ts`
- Modify: `src/features/launcher/SearchInput.tsx`
- Modify: `src/features/launcher/CollapsedLauncher.test.tsx`
- Modify: `src/features/launcher/SearchExperience.tsx`
- Create: `src/features/launcher/SearchExperience.test.tsx`
- Modify: `src/features/keyboard/useLumenKeyboard.ts`
- Modify: `src/features/keyboard/useLumenKeyboard.test.tsx`
- Modify: `src/features/answer/useAnswerController.test.tsx`

**Interfaces:**
- Adds: `submitted`, `submissionRevision`, and `submit()` to `QueryStore`.
- Preserves: `draft` and `committed` as the IME-safe input/local-search pipeline.
- Behavior: plain Enter in the composer submits AI; Enter on a focused result opens it; Ctrl+Enter and Alt+Enter retain result actions; Computer Use keeps its explicit task submission path.

- [ ] **Step 1: Write the failing store contract**

```ts
it('updates local search while typing but submits AI only on demand', () => {
  const query = useQueryStore.getState();
  query.setDraft('Summarize the release notes');
  expect(useQueryStore.getState()).toMatchObject({
    committed: 'Summarize the release notes',
    submitted: '',
    submissionRevision: 0,
  });

  useQueryStore.getState().submit();
  expect(useQueryStore.getState()).toMatchObject({
    submitted: 'Summarize the release notes',
    submissionRevision: 1,
  });
});
```

- [ ] **Step 2: Run the store test and confirm the new fields fail**

Run: `rtk bun run test -- src/features/launcher/stores.test.ts`

Expected: FAIL because explicit submission state is absent.

- [ ] **Step 3: Implement explicit submission state**

```ts
interface QueryData {
  draft: string;
  committed: string;
  submitted: string;
  submissionRevision: number;
  isComposing: boolean;
}

submit: () => {
  const submitted = get().draft.trim();
  if (!submitted || get().isComposing) return;
  set((state) => ({submitted, submissionRevision: state.submissionRevision + 1}));
},
```

`clear()` and `reset()` clear both live and submitted values. Re-submitting the same text increments the revision so retrying from the composer is observable.

- [ ] **Step 4: Add failing interaction tests**

Cover all four cases:

- typing calls `SearchService.search` but does not call `AnswerService.stream`;
- plain Enter in the search composer submits one answer request;
- Enter while IME composition is active submits nothing;
- Enter on a focused result opens the selected file instead of starting an answer.

- [ ] **Step 5: Wire SearchInput and SearchExperience to the new contract**

Remove `useSettledAnswerQuery` and its 350 ms automatic answer timer. Read `submitted` and `submissionRevision` directly when constructing `useAnswerController` options. In `SearchInput`, flush the current DOM value to `setDraft` before calling `submit()`. In `useLumenKeyboard`, return early for an unmodified Enter whose event target is the search input so the input handler owns submission; retain result-region actions and modifiers.

- [ ] **Step 6: Verify cancellation, retry, IME, and stale behavior**

Run:

```powershell
rtk bun run test -- src/features/launcher/stores.test.ts src/features/launcher/CollapsedLauncher.test.tsx src/features/launcher/SearchExperience.test.tsx src/features/keyboard/useLumenKeyboard.test.tsx src/features/answer/useAnswerController.test.tsx
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0; local results still update while typing, answer streaming starts only on submission, and a newer submission cancels/invalidates the older stream.

- [ ] **Step 7: Commit the real submission flow**

```powershell
rtk git add src/features/launcher src/features/keyboard src/features/answer/useAnswerController.test.tsx
rtk git commit -m "feat: submit ai answers explicitly"
```

### Task 6: Build the borderless pill and expanding live workspace

**Files:**
- Create: `src/features/launcher/useLauncherPresentation.ts`
- Create: `src/features/launcher/useLauncherPresentation.test.tsx`
- Modify: `src/features/launcher/CollapsedLauncher.tsx`
- Modify: `src/features/launcher/CollapsedLauncher.test.tsx`
- Modify: `src/features/launcher/SearchInput.tsx`
- Modify: `src/features/launcher/LauncherStatus.tsx`
- Modify: `src/features/launcher/ScopeRail.tsx`
- Modify: `src/features/launcher/FilterChips.tsx`
- Modify: `src/features/launcher/ContextActions.tsx`
- Modify: `src/features/launcher/SearchExperience.tsx`
- Modify: `src/design-system/motion.ts`
- Modify: `tests/e2e/foundation-shell.spec.ts`

**Interfaces:**
- Produces: `useLauncherPresentation({hasContent, reducedMotion, windowService})` returning `{expanded, presentationError}`.
- Preserves: existing `WindowService`, launcher stores, hotkey, focus, close-to-hide, and native geometry values.

- [ ] **Step 1: Write failing native/inner transition-order tests**

Use a deferred fake `WindowService` and assert:

```ts
expect(result.current.expanded).toBe(false);
resolveNativeExpanded();
await waitFor(() => expect(result.current.expanded).toBe(true));
```

For collapse, assert the visible workspace becomes false immediately, while `windowService.show('collapsed')` is called only after `motionTokens.duration.launcherClose`; reduced motion uses zero delay. Add a rapid type-clear-type case and assert the stale collapse timer cannot shrink the newly expanded window.

- [ ] **Step 2: Run the hook test and confirm it fails**

Run: `rtk bun run test -- src/features/launcher/useLauncherPresentation.test.tsx`

Expected: FAIL because the coordination hook does not exist.

- [ ] **Step 3: Implement race-safe boundary coordination**

Use a monotonically increasing transition sequence and clear timers during cleanup. Expansion order is native expanded bounds, launcher mode, then visible body. Collapse order is visible body hidden, close duration, launcher mode, then native collapsed bounds. Treat rejected window operations as local launcher status errors without leaving an invisible expanded hit area.

- [ ] **Step 4: Compose the owned palette around existing live regions**

`CollapsedLauncher` becomes the only `GlassCommandPalette` owner:

```tsx
<GlassCommandPalette
  aria-label="Lumen launcher"
  composer={<LauncherComposer />}
  expanded={expanded}
  scopes={intent === 'search' ? <ScopeRail /> : null}
  body={expandedContent}
  footer={<LauncherFooter statusLabel={statusLabel} searching={searching} />}
/>
```

Implement `LauncherComposer` and `LauncherFooter` as local presentation functions in `CollapsedLauncher.tsx`; they receive existing callbacks/state and introduce no store or service ownership.

Keep the Lumen mark, a single anchored composer, a quiet privacy/runtime indicator only when relevant, and the minimal actions available before a query. Remove the persistent Search/Agent-style visual weight; Computer Use remains an explicit, labelled action rather than a decorative mode dashboard. The Tauri host remains fully transparent outside the rendered pill/surface.

- [ ] **Step 5: Apply the approved motion contract**

Use 160 ms open, 120 ms close, and 190-210 ms expansion with the existing standard/exit curves. Reveal the body with opacity and a small vertical transform inside an overflow-clipped surface; do not animate backdrop blur, ambient shadow, or native bounds per frame. Radius changes from pill to surface once per presentation state. Reduced motion uses the existing 80 ms opacity fallback or immediate state where focus would otherwise lag.

- [ ] **Step 6: Preserve keyboard and focus behavior**

Verify initial input focus, Escape clear then hide, Ctrl+K focus return, Ctrl+Comma settings, Tab/Shift+Tab region order, arrow selection, result Enter, composer Enter, Ctrl+Enter, Alt+Enter, and focus restoration after preview/settings. Ensure the palette itself registers no Cmd/Ctrl+K listener.

- [ ] **Step 7: Run focused unit and shell tests**

Run:

```powershell
rtk bun run test -- src/components/ui/GlassCommandPalette.test.tsx src/features/launcher/CollapsedLauncher.test.tsx src/features/launcher/useLauncherPresentation.test.tsx src/features/keyboard/useLumenKeyboard.test.tsx
rtk bun run test:e2e -- tests/e2e/foundation-shell.spec.ts
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0 and the same DOM surface owns collapsed and expanded presentation.

- [ ] **Step 8: Commit the launcher shell**

```powershell
rtk git add src/features/launcher src/features/keyboard src/design-system/motion.ts tests/e2e/foundation-shell.spec.ts
rtk git commit -m "feat: build expanding glass launcher"
```

### Task 7: Migrate live results, streamed answers, and preview to the new surface

**Files:**
- Modify: `src/features/launcher/ExpandedWorkspace.tsx`
- Modify: `src/features/results/ResultGrid.tsx`
- Modify: `src/features/results/ResultRow.tsx`
- Modify: `src/features/results/SelectionCapsule.tsx`
- Modify: `src/features/results/ResultGrid.test.tsx`
- Modify: `src/features/answer/AnswerPanel.tsx`
- Modify: `src/features/answer/RuntimeModeSwitch.tsx`
- Modify: `src/features/answer/AnswerPanel.test.tsx`
- Modify: `src/features/preview/LazyPreviewPane.tsx`
- Modify: `src/features/preview/PreviewContent.tsx`
- Modify: `src/features/preview/PreviewPane.tsx`
- Modify: `src/features/preview/PreviewSkeleton.tsx`
- Modify: `src/features/preview/SafeMarkdown.tsx`
- Modify: `src/features/preview/PreviewPane.test.tsx`
- Modify: `tests/e2e/search-experience.spec.ts`

**Interfaces:**
- Preserves: `ExpandedWorkspaceProps`, `ResultGrid` virtualization, `AnswerController`, `SearchService` preview/open methods, result IDs, and citation callbacks.

- [ ] **Step 1: Add failing coexistence and stability tests**

Extend tests to prove that:

- a local search error does not remove a streamed or completed answer;
- an answer error does not remove usable local results;
- answer deltas update the same `[data-testid="answer-region"]` node;
- stop remains available during waiting/streaming;
- citations remain buttons backed by `onOpenCitation`;
- empty and disabled result collections never create an invalid selection.

- [ ] **Step 2: Run the focused tests and capture the expected failures**

Run:

```powershell
rtk bun run test -- src/features/results/ResultGrid.test.tsx src/features/answer/AnswerPanel.test.tsx src/features/preview/PreviewPane.test.tsx
```

Expected: the new stability/coexistence assertions fail before the presentation is reorganized.

- [ ] **Step 3: Convert results without changing identity or virtualization**

Replace StyleX class generation with semantic Tailwind classes. Keep row IDs, roles, `aria-selected`, availability rules, selection capsule layout ID, `@tanstack/react-virtual`, and opening callbacks. Use `FileGlyph`/thumbnail/native icon identity; use Apps SDK icons only for row actions. Rows use one quiet selection layer and no independent bounce or colored halo.

- [ ] **Step 4: Convert the answer region as clean content inside glass**

Keep provider-neutral runtime labels, streamed text, source buttons, retry, stop, and copy. Use a neutral divider/spacing hierarchy instead of another glass card. Reserve a stable minimum answer area during waiting so geometry does not jump. Show raw provider/model identifiers only in the existing explicit runtime detail affordance; never expose keys or raw provider errors.

- [ ] **Step 5: Convert preview and modal details**

Keep lazy loading, abort behavior, safe markdown, preview caps, dialog semantics, and focus restoration. Collapse the side preview below the existing width breakpoint before reducing composer or primary-result space. Use opaque fallbacks for images/text over transparent hosts.

- [ ] **Step 6: Verify live search and AI behavior**

Run:

```powershell
rtk bun run test -- src/features/launcher/useSearchController.test.tsx src/features/results/ResultGrid.test.tsx src/features/answer/AnswerPanel.test.tsx src/features/answer/useAnswerController.test.tsx src/features/preview/PreviewPane.test.tsx
rtk bun run test:e2e -- tests/e2e/search-experience.spec.ts
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0; search abort/stale behavior, answer cancellation, source opening, safe preview, and keyboard selection remain intact.

- [ ] **Step 7: Commit the core workspace**

```powershell
rtk git add src/features/launcher/ExpandedWorkspace.tsx src/features/results src/features/answer src/features/preview tests/e2e/search-experience.spec.ts
rtk git commit -m "refactor: restyle search and answer workspace"
```

### Task 8: Migrate onboarding and settings to the quieter Lumen theme

**Files:**
- Modify: `src/features/onboarding/OnboardingFlow.tsx`
- Modify: `src/features/onboarding/OnboardingScene.tsx`
- Modify: `src/features/onboarding/RootSelectionScene.tsx`
- Modify: `src/features/onboarding/ShortcutScene.tsx`
- Modify: `src/features/onboarding/OnboardingFlow.test.tsx`
- Modify: `src/features/settings/SettingsShell.tsx`
- Modify: `src/features/settings/SettingsNav.tsx`
- Modify: `src/features/settings/components/ConfirmationDialog.tsx`
- Modify: `src/features/settings/components/IndexedRootRow.tsx`
- Modify: `src/features/settings/components/PersistenceNotice.tsx`
- Modify: `src/features/settings/components/SettingRow.tsx`
- Modify: `src/features/settings/components/SettingsControls.tsx`
- Modify: `src/features/settings/components/SettingSection.tsx`
- Modify: `src/features/settings/components/SettingsPage.tsx`
- Modify: `src/features/settings/components/ShortcutRecorder.tsx`
- Modify: `src/features/settings/components/StatusBadge.tsx`
- Modify: `src/features/settings/pages/ActivityPage.tsx`
- Modify: `src/features/settings/pages/AgentGatewayPage.tsx`
- Modify: `src/features/settings/pages/AppearancePage.tsx`
- Modify: `src/features/settings/pages/ComputerUsePage.tsx`
- Modify: `src/features/settings/pages/DiagnosticsPage.tsx`
- Modify: `src/features/settings/pages/GeneralPage.tsx`
- Modify: `src/features/settings/pages/IndexedRootsPage.tsx`
- Modify: `src/features/settings/pages/LocalAiPage.tsx`
- Modify: `src/features/settings/pages/PrivacyPage.tsx`
- Modify: `src/features/settings/pages/SearchPage.tsx`
- Modify: `src/features/settings/SettingsShell.test.tsx`
- Modify: `src/features/settings/pages/core-pages.test.tsx`
- Modify: `src/features/settings/pages/LocalAiPage.test.tsx`
- Modify: `tests/e2e/onboarding-settings.spec.ts`

**Interfaces:**
- Preserves: onboarding/settings stores, hydration order, root selection service, shortcut registration, confirmation dialogs, settings routing, AI consent, and Computer Use consent.

- [ ] **Step 1: Add failing visual-contract assertions**

Assert that settings exposes one `main` content region, one navigation region, visible selected-page state, labelled controls, a focus-visible close action, and no nested material wrapper for every `SettingSection`. Assert onboarding preserves one primary action and one back action per scene.

- [ ] **Step 2: Run focused tests and confirm the new contracts fail**

Run:

```powershell
rtk bun run test -- src/features/onboarding/OnboardingFlow.test.tsx src/features/settings/SettingsShell.test.tsx src/features/settings/pages/core-pages.test.tsx src/features/settings/pages/LocalAiPage.test.tsx
```

- [ ] **Step 3: Restyle onboarding**

Use one raised neutral surface within the native onboarding bounds, generous whitespace, the custom Lumen mark, short sentence-case copy, and Apps SDK UI icons. Keep directory selection, shortcut validation, persistence, back/continue behavior, errors, and focus movement unchanged.

- [ ] **Step 4: Restyle the settings shell and shared controls**

Use a quiet opaque/glass-adaptive settings surface, a compact navigation rail, spacing and dividers for grouping, and React Aria controls. Apply the cool accent only to selection/focus/on states. Confirmation and destructive actions retain explicit wording and do not depend on color alone.

- [ ] **Step 5: Restyle every settings page without changing services**

Cover General, Search, Indexed Roots, Appearance, Privacy, Local AI, AgentGateway, Computer Use, Activity, and Diagnostics. Do not add provider credentials, retrieval, MCP, or automation controls that lack a typed service and persisted schema.

- [ ] **Step 6: Verify management behavior and accessibility**

Run:

```powershell
rtk bun run test -- src/features/onboarding/OnboardingFlow.test.tsx src/features/settings/SettingsShell.test.tsx src/features/settings/pages/core-pages.test.tsx src/features/settings/pages/LocalAiPage.test.tsx src/features/settings/settings.ai.test.ts
rtk bun run test:e2e -- tests/e2e/onboarding-settings.spec.ts tests/e2e/accessibility.spec.ts
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0 with persistence, consent, shortcut, dialog, theme, and focus contracts intact.

- [ ] **Step 7: Commit management surfaces**

```powershell
rtk git add src/features/onboarding src/features/settings tests/e2e/onboarding-settings.spec.ts tests/e2e/accessibility.spec.ts
rtk git commit -m "refactor: restyle onboarding and settings"
```

### Task 9: Migrate operational and diagnostic surfaces

**Files:**
- Modify: `src/features/computer-use/ComputerUsePanel.tsx`
- Modify: `src/features/computer-use/useComputerUseController.test.tsx`
- Modify: `src/features/activity/ActivityStatus.tsx`
- Modify: `src/features/activity/ApplicationOverrideRow.tsx`
- Modify: `src/features/activity/activity.test.tsx`
- Modify: `src/features/gateway/GatewayStatusPanel.tsx`
- Modify: `src/features/gateway/ProviderRouteList.tsx`
- Modify: `src/features/gateway/ToolPermissionList.tsx`
- Modify: `src/features/gateway/gateway.test.tsx`
- Modify: `src/features/diagnostics/DiagnosticItem.tsx`
- Modify: `src/features/diagnostics/DiagnosticsOverlay.tsx`
- Modify: `src/features/diagnostics/diagnostics.test.tsx`

**Interfaces:**
- Preserves: current store/controller/service APIs, approval flow, cancellation, health state, provider-route data, tool permission data, and metrics instrumentation.

- [ ] **Step 1: Add failing state-isolation tests**

Assert that Computer Use approval, denial, cancellation, and errors stay inside its panel; gateway/activity failures do not replace the launcher; diagnostics remains development-only and dismissible; all status indicators expose text in addition to color/icon.

- [ ] **Step 2: Run the focused tests and record failures**

Run:

```powershell
rtk bun run test -- src/features/computer-use/useComputerUseController.test.tsx src/features/activity/activity.test.tsx src/features/gateway/gateway.test.tsx src/features/diagnostics/diagnostics.test.tsx
```

- [ ] **Step 3: Convert the operational surfaces to semantic Tailwind classes**

Use neutral lists, dividers, compact badges, and one accent. Use glass only for the owning launcher/settings surface, not for every row. Preserve every approval boundary and the browser-only worker contract; do not add generic process arguments or webview-side provider calls.

- [ ] **Step 4: Verify operational behavior**

Run:

```powershell
rtk bun run test -- src/features/computer-use/useComputerUseController.test.tsx src/features/activity/activity.test.tsx src/features/gateway/gateway.test.tsx src/features/diagnostics/diagnostics.test.tsx
rtk bun run typecheck
rtk bun run lint
```

Expected: all commands exit 0 and the new presentation introduces no service or capability changes.

- [ ] **Step 5: Commit operational surfaces**

```powershell
rtk git add src/features/computer-use src/features/activity src/features/gateway src/features/diagnostics
rtk git commit -m "refactor: restyle operational surfaces"
```

### Task 10: Migrate App/gallery and remove the old UI stack

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/AppProviders.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/features/gallery/VisualStateGallery.tsx`
- Modify: `src/features/gallery/ScenarioControls.tsx`
- Modify: `src/features/gallery/VisualStateGallery.test.tsx`
- Modify: `src/features/gallery/fixtures.ts`
- Modify: `src/features/gallery/scenarios.ts`
- Modify: `src/design-system/icons/lumen-icons.tsx`
- Modify: `src/design-system/global.css`
- Modify: `src/main.tsx`
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Delete: `src/stylex-dev.ts`
- Delete: `src/design-system/tokens.stylex.ts`
- Delete: `src/design-system/themes.stylex.ts`
- Delete: `src/design-system/materials.stylex.ts`

**Interfaces:**
- Preserves: dev-only foundation/gallery/onboarding URL modes, lazy loading, diagnostics profiler, gallery scenario IDs where behavior is unchanged, and appearance data attributes.
- Removes: Astryx, StyleX, and Phosphor package/runtime/configuration paths.

- [ ] **Step 1: Add final-stack guard tests**

Update App/gallery tests to import the framework-independent theme contract and assert the application root still carries `data-theme`, `data-resolved-theme`, `data-transparency`, `data-contrast`, `data-effects`, `data-motion`, and `data-reduced-motion`.

- [ ] **Step 2: Convert App and gallery styling**

Replace the remaining StyleX calls with Tailwind classes. Keep gallery fixtures deterministic and add explicit states for AI waiting, AI streaming, AI complete, AI failure with local results, empty local results with an answer, approval, dark, light, opaque, high contrast, reduced motion, and constrained width/height.

- [ ] **Step 3: Remove obsolete packages with Bun**

Run:

```powershell
rtk bun remove @astryxdesign/core @astryxdesign/theme-neutral @phosphor-icons/react @stylexjs/stylex
rtk bun remove -d @astryxdesign/cli @stylexjs/unplugin
```

- [ ] **Step 4: Remove StyleX configuration and files**

The final Vite plugin list is:

```ts
plugins: [tailwindcss(), react()]
```

The final Vitest plugin list contains `tailwindcss()` only. Remove the `stylex-dev` import from `src/main.tsx`, delete the three `.stylex.ts` files and shim, and move every remaining semantic value into `global.css`/`theme.ts` or a local Tailwind class.

- [ ] **Step 5: Prove the old stack is absent**

Run:

```powershell
rtk rg -n "@stylexjs|stylex\.create|stylex\.props|@astryxdesign|@phosphor-icons/react" src package.json vite.config.ts vitest.config.ts
rtk rg --files src | rtk rg "stylex-dev|\.stylex\."
```

Expected: both searches return no matches and exit code 1.

- [ ] **Step 6: Verify the final frontend stack**

Run:

```powershell
rtk bun run test -- src/app/App.test.tsx src/features/gallery/VisualStateGallery.test.tsx src/design-system/themes.test.ts src/design-system/primitives/primitives.test.tsx src/design-system/icons/LumenUiIcon.test.tsx
rtk bun run typecheck
rtk bun run lint
rtk bun run build
```

Expected: all commands exit 0 and the production CSS is generated by Tailwind v4.

- [ ] **Step 7: Inspect icon-only bundle impact**

Run: `rtk powershell -NoProfile -Command "Get-ChildItem -LiteralPath 'dist/assets' -File | Sort-Object Length -Descending | Select-Object Name,Length"`

Expected: no Apps SDK UI global stylesheet or unrelated React component bundle is emitted. Record the measured icon-barrel contribution in the validation report instead of assuming it is free; production and test startup must remain within the existing budgets.

- [ ] **Step 8: Commit old-stack removal**

```powershell
rtk git add package.json bun.lock vite.config.ts vitest.config.ts src
rtk git commit -m "refactor: remove legacy ui stack"
```

### Task 11: Lock responsive, accessibility, and native-host acceptance

**Files:**
- Modify: `src/platform/window/window-service.test.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `tests/e2e/dpi-responsive.spec.ts`
- Modify: `tests/e2e/foundation-shell.spec.ts`
- Modify: `tests/e2e/performance.spec.ts`
- Modify: `tests/e2e/search-experience.spec.ts`
- Modify: `tests/e2e/visual-gallery.spec.ts`
- Modify: `docs/architecture/design-system.md`
- Modify: `docs/architecture/motion-system.md`
- Modify: `docs/architecture/native-shell.md`
- Modify: `docs/architecture/management-surfaces.md`
- Create: `docs/reports/tailwind-einui-redesign-validation.md`

**Interfaces:**
- Locks: existing native geometry, transparent borderless host, inner-surface ordering, appearance axes, keyboard map, DPI breakpoints, and performance budgets.

- [ ] **Step 1: Add window geometry invariants**

Assert exact collapsed/expanded values, a fixed collapsed height, no collapsed resizing, expanded internal scrolling at constrained height, and preservation of onboarding/settings/gallery geometry. No Rust change is required because the existing geometry already matches the approved surface model.

- [ ] **Step 2: Expand accessibility and keyboard E2E coverage**

Test initial focus, composer Enter, focused-result Enter, Ctrl+Enter, Alt+Enter, Escape clear/hide, Ctrl+K, Ctrl+Comma, Tab order, live result announcements, answer progress, cancellation, focus return, high contrast, text scaling, and reduced motion. Use stable roles and labels, not Tailwind classes, as selectors.

- [ ] **Step 3: Expand DPI and constrained-work-area coverage**

Exercise 100, 125, 150, 175, and 200 percent emulated scale contracts plus narrow/short expanded bounds. Assert that the composer/footer remain visible, result/answer regions scroll internally, preview collapses first, and no page-level horizontal scrollbar appears.

- [ ] **Step 4: Lock performance behavior**

Keep the existing 240 Hz diagnostics and assert no idle animation loop, one answer region during streaming, bounded React commit durations, input-to-paint instrumentation, selection response, and expansion metrics. The palette glow is static after entry.

- [ ] **Step 5: Update architecture documents**

Document Tailwind CSS-first tokens, owned EinUI provenance/update policy, Apps SDK UI icon bridge, explicit AI submission, native/inner transition order, React Aria ownership, and the final absence of StyleX/Astryx/Phosphor. Keep search and security docs unchanged except for cross-links because their contracts do not change.

- [ ] **Step 6: Run the complete browser verification matrix**

Run:

```powershell
rtk bun run typecheck
rtk bun run lint
rtk bun run test
rtk bun run test:e2e
rtk bun run build
```

Expected: every command exits 0. If the full Vitest run stalls, use `rtk bun run test -- --maxWorkers=1` and focused files to diagnose the responsible test, correct it, then rerun the exact `rtk bun run test` gate. If a stale Vite process owns port 1420, identify that exact process, stop only that process, and rerun the affected command; do not weaken `strictPort` or Playwright's serial worker setting.

- [ ] **Step 7: Run the native release build**

Run: `rtk bun run tauri build`

Expected: the Windows release bundle builds successfully with the existing least-privilege capabilities and no shell plugin.

- [ ] **Step 8: Write and commit the acceptance report**

Record command, exit code, date, relevant artifact path, bundle sizes, and any measured performance values in `docs/reports/tailwind-einui-redesign-validation.md`. Do not mark an unrun or hung command as passed.

```powershell
rtk git add src/platform/window/window-service.test.ts tests/e2e docs/architecture docs/reports/tailwind-einui-redesign-validation.md
rtk git commit -m "test: lock redesigned launcher acceptance"
```

### Task 12: Regenerate checked-in visual and interaction evidence

**Files:**
- Modify: `scripts/capture-gallery.mjs`
- Modify: `scripts/record-interactions.mjs`
- Modify: `scripts/performance-profile.mjs`
- Modify: `artifacts/screenshots/*.png`
- Modify: `artifacts/screenshots/manifest.json`
- Modify: `artifacts/recordings/*.webm`
- Modify: `artifacts/recordings/manifest.json`
- Modify: `artifacts/performance/profile-summary.json`
- Modify: `artifacts/performance/interaction-trace.zip`
- Modify: `docs/reports/tailwind-einui-redesign-validation.md`

**Interfaces:**
- Proves: collapsed pill, expansion, local search, explicit AI submission/streaming, completion, errors, approvals, settings, themes, fallbacks, and reduced motion.

- [ ] **Step 1: Capture the complete gallery**

Run: `rtk bun run capture:gallery`

Expected: every manifest scenario has a fresh screenshot and the contact sheet shows no title bar, shell frame, fullscreen backdrop, clipped glow, transparent click-blocking area, or nested-card clutter.

- [ ] **Step 2: Record the interaction flows**

Run: `rtk bun run record:interactions`

Expected: recordings cover hotkey appearance, typing with local results, Enter-to-answer, streaming/stop, result navigation/open, preview/details, settings, approval, interruption, collapse, and dismissal.

- [ ] **Step 3: Regenerate the performance profile**

Run: `rtk bun run profile`

Expected: `profile-summary.json` contains current warm invocation, input-paint, selection-paint, expansion, React commit, and idle activity measurements, with no persistent animation after settling.

- [ ] **Step 4: Inspect evidence before accepting it**

Open the contact sheet and representative dark, light, opaque, high-contrast, streaming, completed-answer, and error screenshots. Scrub each recording through its key transitions. Compare profile values against `docs/reports/high-refresh-performance.md`. Correct the implementation and rerun affected evidence when any acceptance criterion fails.

- [ ] **Step 5: Perform the final source and worktree audit**

Run:

```powershell
rtk rg -n "@stylexjs|stylex\.create|stylex\.props|@astryxdesign|@phosphor-icons/react|window\.location\.href|sampleCommands|mockCommands" src package.json vite.config.ts vitest.config.ts
rtk git status --short
rtk git diff --check
```

Expected: the forbidden-source search returns no matches; `git diff --check` exits 0; only regenerated evidence/report files and the pre-existing untracked `.serena/` are present before the evidence commit.

- [ ] **Step 6: Commit checked-in evidence**

```powershell
rtk git add artifacts/screenshots artifacts/recordings artifacts/performance docs/reports/tailwind-einui-redesign-validation.md
rtk git commit -m "docs: refresh redesigned launcher evidence"
```

- [ ] **Step 7: Run the final post-commit verification**

Run:

```powershell
rtk bun run typecheck
rtk bun run lint
rtk bun run test
rtk bun run test:e2e
rtk bun run tauri build
rtk git status --short --branch
```

Expected: all verification commands exit 0 and the worktree contains no task-owned changes; `.serena/` remains untouched and untracked.

---

## Completion Checklist

- [ ] Alt+Space opens a centered, borderless, transparent-hosted pill on the active monitor.
- [ ] The same visible surface expands downward after native bounds are ready and collapses before native bounds shrink.
- [ ] Local search updates while typing; AI generation starts only on explicit submission.
- [ ] The live `SearchService`, `AnswerService`, `ComputerUseService`, and `WindowService` remain the behavior owners.
- [ ] EinUI's command palette visual recipe is present without its demo data, routing, backdrop, or browser shortcut.
- [ ] Other surfaces use the quieter neutral liquid-glass/clean-content Lumen theme.
- [ ] Interface chrome uses Apps SDK UI icons; app/file/product identity remains native or Lumen-owned.
- [ ] Keyboard, Narrator, IME, Unicode, light/dark, high contrast, opaque fallback, reduced effects, reduced motion, DPI, and constrained-height checks pass.
- [ ] Search failures and answer failures remain isolated; stop, retry, citations, preview, opening, settings, and approvals still work.
- [ ] No production source or dependency references StyleX, Astryx, Phosphor, Lucide, sample command data, or fake provider behavior.
- [ ] Screenshots, contact sheet, recordings, performance evidence, architecture docs, and validation report reflect the shipped UI.
- [ ] Typecheck, lint, unit/component tests, Playwright, Vite build, and Tauri release build all pass from the final commit.

## Deliberately Deferred Product Slices

This migration leaves the UI ready for, but does not claim to implement, web retrieval, attachments/screenshots, application and Windows Settings indexing, conversation persistence, expanded provider routing, MCP, and broader Windows automation. Each requires its own typed service, validated native/worker payloads, consent policy, tests, and implementation plan. Until those slices exist, Lumen must present only the capabilities supplied by the current services.
