# Lumen Foundation and Native Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the verified Tauri 2, React 19, TypeScript, Vite, Bun, StyleX, and native Windows shell foundation for every Lumen surface.

**Architecture:** A small React composition root consumes a semantic design system and platform adapters. Native Tauri window behavior is isolated behind Rust commands and a TypeScript window service; feature code remains independent of Tauri APIs.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vite, Bun, React Aria Components, StyleX, Motion for React, Zustand, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Use React 19 and Tauri 2 with the current official React, TypeScript, and Vite scaffold.
- Use Bun for JavaScript dependency and script execution.
- Use React Aria as the default behavior owner and StyleX for Lumen-authored styling.
- Use `Segoe UI Variable Text`, `Segoe UI Variable Display`, `Segoe UI`, `sans-serif`.
- Do not add Tailwind, Material UI, Chakra, Mantine, generic shadcn styling, or a glassmorphism library.
- Do not implement production indexing, semantic search, AgentGateway runtime, MCP, OCR, reranking, or model inference.
- Every theme must support light, dark, system, transparency disabled, high contrast, reduced effects, and reduced motion.
- Native size changes occur only at controlled launcher mode boundaries.

---

## File Structure

- `package.json`: Bun scripts and pinned frontend dependencies.
- `vite.config.ts`: React and current compatible StyleX extraction.
- `vitest.config.ts`: DOM unit and component test configuration.
- `playwright.config.ts`: browser-level state and screenshot configuration.
- `src/main.tsx`: React entry point only.
- `src/app/App.tsx`: top-level mode composition.
- `src/app/AppProviders.tsx`: React Aria, Motion, and theme providers.
- `src/design-system/tokens.stylex.ts`: semantic variables.
- `src/design-system/themes.stylex.ts`: theme overrides.
- `src/design-system/global.css`: reset, font stack, root sizing, high-contrast fallbacks.
- `src/design-system/materials.stylex.ts`: glass and opaque shell layers.
- `src/design-system/motion.ts`: durations, easing, and spring tokens.
- `src/design-system/primitives/*`: Lumen button, icon button, surface, text, divider, and focus ring.
- `src/design-system/icons/*`: Lumen mark and shared custom icon geometry.
- `src/state/appearance.store.ts`: focused appearance preferences.
- `src/services/settings/tauri-settings-service.ts`: validated Tauri Store persistence.
- `src/platform/window/window-service.ts`: frontend platform contract.
- `src/platform/window/tauri-window-service.ts`: Tauri implementation.
- `src/platform/window/browser-window-service.ts`: browser/test implementation.
- `src-tauri/src/lib.rs`: Tauri builder, plugins, window commands, and startup.
- `src-tauri/src/window.rs`: placement, mode sizing, visibility, and effects.
- `src-tauri/capabilities/main.json`: least-privilege app capability.

### Task 1: Scaffold the application and quality harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/test/setup.ts`, `src/app/App.test.tsx`
- Create: official Tauri scaffold under `src-tauri/`

**Interfaces:**
- Produces: `App(): JSX.Element`, scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `tauri`.

- [ ] **Step 1: Generate the official Tauri React/TypeScript scaffold in a temporary sibling and copy only scaffold files into the repository**

Run:

```powershell
$lumenWorkspace = (Get-Location).Path
$lumenScaffoldRoot = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("lumen-scaffold-" + [guid]::NewGuid().ToString('N')))
Push-Location $lumenScaffoldRoot.FullName
bunx create-tauri-app@latest lumen-scaffold --manager bun --template react-ts --identifier com.bridgehammer.lumen --tauri-version 2 --yes
Pop-Location
$lumenScaffold = Join-Path $lumenScaffoldRoot.FullName 'lumen-scaffold'
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'src') -Destination $lumenWorkspace -Recurse
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'src-tauri') -Destination $lumenWorkspace -Recurse
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'package.json') -Destination $lumenWorkspace
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'index.html') -Destination $lumenWorkspace
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'vite.config.ts') -Destination $lumenWorkspace
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'tsconfig.json') -Destination $lumenWorkspace
Copy-Item -LiteralPath (Join-Path $lumenScaffold 'tsconfig.node.json') -Destination $lumenWorkspace
```

Expected: a Tauri 2 React/Vite project is generated without modifying the design specification. Set the package name to `lumen`, Tauri `productName` to `Lumen`, window title to `Lumen`, and retain `com.bridgehammer.lumen` as the identifier.

- [ ] **Step 2: Install the required runtime and test dependencies**

Run:

```powershell
bun add react-aria-components @stylexjs/stylex motion @phosphor-icons/react @tanstack/react-virtual zustand zod sonner @astryxdesign/core @astryxdesign/theme-neutral
bun add -d @stylexjs/unplugin @astryxdesign/cli @vitejs/plugin-react vite typescript eslint @eslint/js typescript-eslint vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test
```

Expected: `package.json` and `bun.lock` contain the complete phase-one frontend toolchain.

- [ ] **Step 3: Write the first failing application smoke test**

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {App} from './App';

describe('App', () => {
  it('renders the Lumen application landmark', () => {
    render(<App />);
    expect(screen.getByRole('application', {name: 'Lumen'})).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the test and verify the missing application fails**

Run: `bun run test -- src/app/App.test.tsx`

Expected: FAIL because `App` does not yet expose the Lumen application landmark.

- [ ] **Step 5: Implement the minimal composition root and scripts**

```tsx
export function App() {
  return <main role="application" aria-label="Lumen" />;
}
```

Add scripts that run Vite, TypeScript without emit, ESLint, Vitest, Playwright, and the Tauri CLI.

- [ ] **Step 6: Verify the clean scaffold**

Run:

```powershell
bun run typecheck
bun run lint
bun run test -- src/app/App.test.tsx
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add package.json bun.lock vite.config.ts vitest.config.ts playwright.config.ts index.html tsconfig*.json eslint.config.js src src-tauri
git commit -m "build: scaffold Lumen desktop application"
```

### Task 2: Establish semantic tokens, themes, and global behavior

**Files:**
- Create: `src/design-system/tokens.stylex.ts`
- Create: `src/design-system/themes.stylex.ts`
- Create: `src/design-system/global.css`
- Create: `src/design-system/motion.ts`
- Create: `src/design-system/themes.test.ts`
- Modify: `vite.config.ts`, `src/main.tsx`, `src/app/AppProviders.tsx`, `src/app/App.tsx`

**Interfaces:**
- Produces: `tokens`, `darkTheme`, `lightTheme`, `opaqueTheme`, `highContrastTheme`, `reducedEffectsTheme`, `motionTokens`, and `AppProviders`.

- [ ] **Step 1: Write failing token coverage tests**

```ts
import {describe, expect, it} from 'vitest';
import {themeContracts} from './themes.stylex';

describe('Lumen themes', () => {
  it('defines every required theme axis', () => {
    expect(Object.keys(themeContracts)).toEqual([
      'light', 'dark', 'opaque', 'highContrast', 'reducedEffects', 'reducedMotion',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/design-system/themes.test.ts`

Expected: FAIL because `themes.stylex.ts` does not exist.

- [ ] **Step 3: Configure StyleX extraction and implement the semantic contract**

Configure the current official `@stylexjs/unplugin` Vite adapter before React:

```ts
import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [stylex.vite({devMode: 'full', useCSSLayers: true}), react()],
});
```

Load `/virtual:stylex.css` and `virtual:stylex:runtime` in development as documented by the installed plugin. Define variables for canvas, material tints, luminosity, text levels, borders, specular edges, inner and ambient shadows, focus glow, status colors, spacing, typography, icon sizes, radii, controls, result density, blur, noise, duration, easing, and spring parameters. Use theme overrides rather than component-level color literals.

```ts
import * as stylex from '@stylexjs/stylex';

export const tokens = stylex.defineVars({
  colorTextPrimary: 'rgba(250, 252, 255, 0.96)',
  colorTextSecondary: 'rgba(226, 232, 240, 0.72)',
  colorSurfaceTint: 'rgba(16, 22, 31, 0.74)',
  colorBorder: 'rgba(255, 255, 255, 0.16)',
  colorSpecular: 'rgba(255, 255, 255, 0.34)',
  colorFocus: '#8ecbff',
  radiusLauncher: '24px',
  durationOpen: '160ms',
  easingStandard: 'cubic-bezier(.2,.8,.2,1)',
});
```

- [ ] **Step 4: Implement provider-derived theme attributes**

`AppProviders` reads system color scheme, `prefers-reduced-motion`, `prefers-contrast`, and persisted appearance state. It applies one base appearance theme and independent fallback attributes to the application root.

- [ ] **Step 5: Run token and application tests**

Run: `bun run test -- src/design-system/themes.test.ts src/app/App.test.tsx`

Expected: PASS with all required axes present.

- [ ] **Step 6: Commit**

```powershell
git add vite.config.ts src/design-system src/app src/main.tsx
git commit -m "feat: establish Lumen design tokens and themes"
```

### Task 3: Build Lumen primitives, material layers, and icon geometry

**Files:**
- Create: `src/design-system/materials.stylex.ts`
- Create: `src/design-system/primitives/LumenSurface.tsx`
- Create: `src/design-system/primitives/LumenButton.tsx`
- Create: `src/design-system/primitives/LumenIconButton.tsx`
- Create: `src/design-system/primitives/LumenText.tsx`
- Create: `src/design-system/icons/LumenMark.tsx`
- Create: `src/design-system/icons/LumenIcon.tsx`
- Create: `src/design-system/primitives/primitives.test.tsx`

**Interfaces:**
- Produces: `LumenSurface`, `LumenButton`, `LumenIconButton`, `LumenText`, `LumenMark`, and the shared 24-unit custom SVG frame.

- [ ] **Step 1: Write failing accessibility tests for primitives**

```tsx
it('exposes an accessible icon-only button', async () => {
  render(<LumenIconButton aria-label="Open settings"><GearIcon /></LumenIconButton>);
  expect(screen.getByRole('button', {name: 'Open settings'})).toBeVisible();
});
```

- [ ] **Step 2: Run the primitive test and verify it fails**

Run: `bun run test -- src/design-system/primitives/primitives.test.tsx`

Expected: FAIL because the primitives are missing.

- [ ] **Step 3: Implement React Aria primitives with StyleX appearance**

`LumenButton` and `LumenIconButton` compose React Aria `Button`. `LumenSurface` renders the tint, luminosity, noise, border, specular, lower inner edge, shadow, and focus-glow layers through pseudo-elements and nested non-interactive spans. Opaque and high-contrast attributes disable translucent layers.

- [ ] **Step 4: Implement the Lumen mark and shared SVG rules**

Use a 24 by 24 view box, `currentColor`, round joins, and non-scaling strokes. The mark combines a search orbit and narrow lumen beam without resembling Spotlight artwork.

- [ ] **Step 5: Run tests, type checking, and a production frontend build**

Run:

```powershell
bun run test -- src/design-system/primitives/primitives.test.tsx
bun run typecheck
bun run build
```

Expected: all commands exit 0 and the generated CSS contains StyleX output.

- [ ] **Step 6: Commit**

```powershell
git add src/design-system
git commit -m "feat: add Lumen material and primitive system"
```

### Task 4: Add focused appearance state and persisted preferences

**Files:**
- Create: `src/state/appearance.store.ts`
- Create: `src/state/appearance.schema.ts`
- Create: `src/state/appearance.store.test.ts`
- Create: `src/services/settings/settings-service.ts`
- Create: `src/services/settings/browser-settings-service.ts`
- Create: `src/services/settings/tauri-settings-service.ts`
- Modify: `src/app/AppProviders.tsx`

**Interfaces:**
- Produces: `AppearanceState`, `AppearanceActions`, `appearanceSchema`, browser and Tauri `SettingsService` adapters, and `useAppearanceStore(selector)`.

- [ ] **Step 1: Write failing persistence and invalid-data tests**

```ts
it('falls back safely when persisted appearance is invalid', async () => {
  const service = new BrowserSettingsService(new Map([['appearance', '{"mode":"neon"}']]));
  expect(await service.readAppearance()).toMatchObject({mode: 'system'});
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/state/appearance.store.test.ts`

Expected: FAIL because the schema and service do not exist.

- [ ] **Step 3: Implement Zod schemas and a selector-friendly Zustand store**

```ts
export const appearanceSchema = z.object({
  mode: z.enum(['system', 'light', 'dark']).default('system'),
  transparency: z.enum(['native', 'reduced', 'disabled']).default('native'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  preview: z.enum(['automatic', 'always', 'never']).default('automatic'),
  motion: z.enum(['system', 'full', 'reduced']).default('system'),
});
```

Persist only schema-valid values and expose one action per preference. The browser adapter uses its injected map for tests; the Tauri adapter uses the official Store plugin and returns structured read/write failures without discarding the visible edit.

- [ ] **Step 4: Run store tests and verify provider rendering**

Run: `bun run test -- src/state/appearance.store.test.ts src/app/App.test.tsx`

Expected: PASS; invalid data resolves to documented defaults.

- [ ] **Step 5: Commit**

```powershell
git add src/state src/services/settings src/app/AppProviders.tsx
git commit -m "feat: persist focused appearance preferences"
```

### Task 5: Implement the native Windows window service and controlled shell modes

**Files:**
- Create: `src/platform/window/window-service.ts`
- Create: `src/platform/window/tauri-window-service.ts`
- Create: `src/platform/window/browser-window-service.ts`
- Create: `src/platform/window/window-service.test.ts`
- Create: `src-tauri/src/window.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/main.json`

**Interfaces:**
- Produces: `WindowMode = 'collapsed' | 'expanded' | 'onboarding' | 'settings' | 'gallery'` and `WindowService.show(mode)`, `hide()`, `focusInput()`, `setShortcut(accelerator)`.

- [ ] **Step 1: Write failing frontend contract tests**

```ts
it('uses controlled logical sizes for each window mode', async () => {
  const service = new BrowserWindowService();
  await service.show('collapsed');
  expect(service.snapshot()).toMatchObject({visible: true, width: 700, height: 66});
  await service.show('expanded');
  expect(service.snapshot()).toMatchObject({width: 800, maxHeight: 600});
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun run test -- src/platform/window/window-service.test.ts`

Expected: FAIL because the window implementations are missing.

- [ ] **Step 3: Implement TypeScript adapters and typed mode geometry**

Use one constant geometry map. The Tauri adapter invokes Rust commands and the browser adapter records state for tests and Vite-only development.

- [ ] **Step 4: Add official Tauri plugins and least-privilege capability entries**

Run:

```powershell
bun tauri add global-shortcut
bun tauri add single-instance
bun tauri add positioner
bun tauri add opener
bun tauri add store
bun tauri add log
bun tauri add dialog
bun tauri add autostart
```

Register plugins in Rust, grant only required window and plugin commands, and keep shell execution disabled.

- [ ] **Step 5: Implement Rust window placement and effect fallback tests**

```rust
#[test]
fn collapsed_geometry_matches_product_contract() {
    let geometry = geometry_for(WindowMode::Collapsed);
    assert_eq!((geometry.width, geometry.height), (700.0, 66.0));
}
```

The production path requests Acrylic, then Mica or Blur where supported, then an opaque web surface. Position uses active-monitor work area and logical scale.

- [ ] **Step 6: Verify frontend and Rust layers**

Run:

```powershell
bun run test -- src/platform/window/window-service.test.ts
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml window
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add package.json bun.lock src/platform src-tauri
git commit -m "feat: add native Lumen window shell"
```

### Task 6: Verify the foundation as a visible desktop shell

**Files:**
- Create: `tests/e2e/foundation-shell.spec.ts`
- Create: `docs/architecture/design-system.md`
- Create: `docs/architecture/native-shell.md`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: themes, primitives, `WindowService`.
- Produces: a visible material shell and documentation used by later plans.

- [ ] **Step 1: Write a failing browser shell test**

```ts
test('renders dark, light, and opaque shell variants', async ({page}) => {
  await page.goto('/?mode=foundation');
  await expect(page.getByRole('application', {name: 'Lumen'})).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Control+Shift+L');
  await expect(page.getByRole('application', {name: 'Lumen'})).toHaveAttribute('data-theme', 'light');
});
```

- [ ] **Step 2: Run the test and verify the theme shortcut fails**

Run: `bun run test:e2e -- tests/e2e/foundation-shell.spec.ts`

Expected: FAIL because the foundation preview shortcut is not connected.

- [ ] **Step 3: Render the shell and document token and native fallback rules**

Use `LumenSurface` as the only visible region. Add a development-only theme cycling shortcut and write exact token/theme ownership and native fallback behavior into the two architecture documents.

- [ ] **Step 4: Run the foundation gate**

Run:

```powershell
bun run typecheck
bun run lint
bun run test
bun run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/app tests/e2e docs/architecture
git commit -m "test: verify Lumen foundation shell"
```
