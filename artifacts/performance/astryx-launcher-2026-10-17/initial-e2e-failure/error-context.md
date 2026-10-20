# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-refinement.spec.ts >> settings retain scroll viewports and contained controls across the constrained text-scale matrix
- Location: tests\e2e\settings-refinement.spec.ts:140:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('main', { name: 'Settings content' })

```

# Page snapshot

```yaml
- application "Lumen" [ref=f4e3]:
  - main [ref=f4e4]
```

# Test source

```ts
  46  | }
  47  | 
  48  | for (const viewport of [{width: 800, height: 600}, {width: 720, height: 560}, {width: 960, height: 720}, {width: 520, height: 340}]) {
  49  |   for (const theme of ['dark', 'light', 'opaque', 'reduced-effects', 'reduced-motion', 'forced-colors']) {
  50  |     test(`all onboarding scenes remain reachable at ${viewport.width}x${viewport.height} in ${theme}`, async ({page}) => {
  51  |       test.setTimeout(120_000);
  52  |       await page.setViewportSize(viewport);
  53  |       await configurePresentation(page, theme);
  54  |       for (const scale of [100, 125, 150, 175, 200]) {
  55  |         await page.goto('/?onboarding=1');
  56  |         await expect(page.getByRole('heading', {name: 'Everything, within reach'})).toBeVisible();
  57  |         await assignResizedHost(page, scale);
  58  |         for (const [heading, action] of [['Everything, within reach', 'Begin'], ['Choose one place to start', 'Continue'], ['Make search a reflex', 'Continue'], ['Choose how answers run', 'Start using Lumen']]) {
  59  |           await expect(page.getByRole('heading', {name: heading})).toBeVisible();
  60  |           const scene = page.getByTestId('onboarding-scene').locator('..');
  61  |           await expect.poll(() => scene.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  62  |           await expectControlsContained(scene, `${heading} ${theme} ${scale}% ${viewport.width}x${viewport.height}`);
  63  |           if (heading === 'Choose one place to start') await page.getByRole('button', {name: 'Choose folder'}).click();
  64  |           const button = page.getByRole('button', {name: action, exact: true});
  65  |           await button.focus();
  66  |           await expect(button).toBeFocused();
  67  |           await expect(button).toBeInViewport();
  68  |           if (heading !== 'Choose how answers run') await page.keyboard.press('Enter');
  69  |         }
  70  |       }
  71  |     });
  72  |   }
  73  | }
  74  | 
  75  | // Browser layout evidence at Rust's settings default/minimum, plus the requested constrained presentation.
  76  | for (const viewport of [{width: 880, height: 600}, {width: 760, height: 520}, {width: 1080, height: 760}, {width: 520, height: 340}]) {
  77  |   for (const theme of ['dark', 'light', 'opaque', 'reduced-effects', 'reduced-motion', 'forced-colors']) {
  78  |     test(`all settings remain reachable at ${viewport.width}x${viewport.height} in ${theme}`, async ({page}) => {
  79  |       test.setTimeout(180_000);
  80  |       await page.setViewportSize(viewport);
  81  |       await configurePresentation(page, theme);
  82  |       for (const scale of [100, 125, 150, 175, 200]) {
  83  |         await page.goto('/?onboarded=1&service=memory');
  84  |         await expect(page.getByRole('searchbox', {name: 'Search files'})).toBeVisible();
  85  |         await page.keyboard.press('Control+,');
  86  |         await expect(page.getByRole('main', {name: 'Settings content'})).toBeVisible();
  87  |         await assignResizedHost(page, scale);
  88  |         if (theme === 'reduced-effects') await expect(page.getByRole('application', {name: 'Lumen'})).toHaveAttribute('data-effects', 'reduced');
  89  |         const content = page.getByRole('main', {name: 'Settings content'});
  90  |         for (const label of settingsNames) {
  91  |           const tab = page.getByRole('tab', {name: label, exact: true});
  92  |           await tab.focus();
  93  |           await page.keyboard.press('Enter');
  94  |           await expect(page.getByRole('heading', {name: label, exact: true})).toBeVisible();
  95  |           await expect(tab).toBeFocused();
  96  |           await expect.poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  97  |           await expectControlsContained(content, `${label} ${theme} ${scale}% ${viewport.width}x${viewport.height}`);
  98  |           const action = content.locator('button:not([disabled]), input:not([disabled]):not([type="range"]):not([type="checkbox"]), [role="switch"]:not([disabled]):not([aria-disabled="true"])').last();
  99  |           if (await action.count()) {
  100 |             await action.focus();
  101 |             await expect(action).toBeFocused();
  102 |             // React Aria's switch input is deliberately clipped; check the visible label that owns its focus ring.
  103 |             const target = await action.getAttribute('role') === 'switch' ? action.locator('xpath=ancestor::label') : action;
  104 |             await expect(target).toBeInViewport();
  105 |           }
  106 |         }
  107 |         await expect(page.getByRole('button', {name: 'Close settings'})).toBeInViewport();
  108 |       }
  109 |     });
  110 |   }
  111 | }
  112 | 
  113 | test('settings navigation wraps enlarged labels without horizontal overflow', async ({page}) => {
  114 |   await page.setViewportSize({width: 880, height: 600});
  115 |   await page.goto('/?gallery=1&scenario=settings-general&capture=1&scale=200');
  116 | 
  117 |   const nav = page.getByRole('navigation', {name: 'Settings'});
  118 |   await expect(nav).toBeVisible();
  119 |   await expect.poll(() => nav.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  120 |   const content = page.getByRole('main', {name: 'Settings content'});
  121 |   await expect.poll(() => content.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(100);
  122 |   await expect.poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  123 | });
  124 | 
  125 | test('settings controls stay within their content viewport at large text sizes', async ({page}) => {
  126 |   await page.setViewportSize({width: 720, height: 540});
  127 |   await page.goto('/?gallery=1&scenario=settings-general&capture=1&scale=200');
  128 | 
  129 |   const content = page.getByRole('main', {name: 'Settings content'});
  130 |   for (const name of ['General', 'Appearance', 'Indexed roots', 'Search', 'Local AI', 'AgentGateway', 'Providers', 'Computer Use', 'Activity', 'Privacy', 'Diagnostics']) {
  131 |     const tab = page.getByRole('tab', {name, exact: true});
  132 |     await tab.focus();
  133 |     await page.keyboard.press('Enter');
  134 |     await expect(page.getByRole('heading', {name, exact: true})).toBeVisible();
  135 |     await expect.poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  136 |     await expectControlsContained(content, `${name} at 200% text in 720x540`);
  137 |   }
  138 | });
  139 | 
  140 | test('settings retain scroll viewports and contained controls across the constrained text-scale matrix', async ({page}) => {
  141 |   await page.setViewportSize({width: 520, height: 340});
  142 |   for (const scale of [100, 125, 150, 175, 200]) {
  143 |     await page.goto(`/?gallery=1&scenario=settings-general&capture=1&scale=${scale}`);
  144 |     const content = page.getByRole('main', {name: 'Settings content'});
  145 |     const nav = page.getByRole('navigation', {name: 'Settings'});
> 146 |     await expect.poll(() => content.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(72);
      |                                     ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
  147 |     await expect.poll(() => nav.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  148 |     for (const name of ['General', 'Appearance', 'Indexed roots', 'Search', 'Local AI', 'AgentGateway', 'Providers', 'Computer Use', 'Activity', 'Privacy', 'Diagnostics']) {
  149 |       await page.getByRole('tab', {name, exact: true}).focus();
  150 |       await page.keyboard.press('Enter');
  151 |       await expect(page.getByRole('tabpanel', {name, exact: true})).toBeVisible();
  152 |       await expect.poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  153 |       await expectControlsContained(content, `${name} at ${scale}% text in 520x340`);
  154 |     }
  155 |     await expect(page.getByRole('button', {name: 'Close settings'})).toBeInViewport();
  156 |   }
  157 | });
  158 | 
  159 | test('keyboard page selection resets content scroll and keeps navigation focus', async ({page}) => {
  160 |   await page.setViewportSize({width: 880, height: 600});
  161 |   await page.goto('/?gallery=1&scenario=settings-general&capture=1&scale=200');
  162 | 
  163 |   const content = page.getByRole('main', {name: 'Settings content'});
  164 |   await content.evaluate((element) => { element.scrollTop = 240; });
  165 |   await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  166 |   await page.getByRole('tab', {name: 'General', exact: true}).focus();
  167 |   await page.keyboard.press('ArrowDown');
  168 | 
  169 |   await expect(page.getByRole('tab', {name: 'Appearance', exact: true})).toBeFocused();
  170 |   await expect(page.getByRole('tabpanel', {name: 'Appearance', exact: true})).toBeVisible();
  171 |   await expect(page.getByRole('tabpanel')).toHaveCount(1);
  172 |   await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBe(0);
  173 | });
  174 | 
  175 | test('onboarding scrolls enlarged scenes while keeping its primary action available', async ({page}) => {
  176 |   test.setTimeout(90_000);
  177 |   for (const viewport of [{width: 720, height: 560}, {width: 520, height: 340}]) {
  178 |     await page.setViewportSize(viewport);
  179 |     for (const scale of [100, 125, 150, 175, 200]) {
  180 |       await page.goto('/?onboarding=1');
  181 |       await expect(page.getByRole('heading', {name: 'Everything, within reach'})).toBeVisible();
  182 |       await page.evaluate((textScale) => {
  183 |         document.documentElement.style.fontSize = `${16 * textScale / 100}px`;
  184 |       }, scale);
  185 | 
  186 |       const sceneViewport = page.getByTestId('onboarding-scene').locator('..');
  187 |       const scroll = await sceneViewport.evaluate((element) => {
  188 |         element.scrollTop = element.scrollHeight;
  189 |         return {
  190 |           clientHeight: element.clientHeight,
  191 |           overflowY: getComputedStyle(element).overflowY,
  192 |           scrollHeight: element.scrollHeight,
  193 |           scrollTop: element.scrollTop,
  194 |         };
  195 |       });
  196 |       expect(scroll.clientHeight).toBeGreaterThanOrEqual(72);
  197 |       expect(scroll.overflowY).toMatch(/auto|scroll/);
  198 |       if (scroll.scrollHeight > scroll.clientHeight) expect(scroll.scrollTop).toBeGreaterThan(0);
  199 |       await expect(page.getByRole('button', {name: 'Begin'})).toBeInViewport();
  200 |       await page.getByRole('button', {name: 'Begin'}).click();
  201 |       await page.getByRole('button', {name: 'Choose folder'}).click();
  202 |       await page.getByRole('button', {name: 'Continue'}).click();
  203 |       await expect(page.getByRole('heading', {name: 'Make search a reflex'})).toBeVisible();
  204 |       await page.getByRole('button', {name: 'Continue'}).click();
  205 |       await expect(page.getByRole('heading', {name: 'Choose how answers run'})).toBeAttached();
  206 |       await expect.poll(() => sceneViewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  207 |       await expectControlsContained(sceneViewport, `Onboarding choices at ${scale}% text in ${viewport.width}x${viewport.height}`);
  208 |       await expect(page.getByRole('button', {name: 'Start using Lumen'})).toBeInViewport();
  209 |     }
  210 |   }
  211 | });
  212 | 
```