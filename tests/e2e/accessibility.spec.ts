import {expect, test} from '@playwright/test';

async function expectNamedInteractiveControls(page: import('@playwright/test').Page) {
  const controls = page.locator('button, input, select:not([tabindex="-1"]), [role="tab"], [role="row"]');
  const visible = [];
  for (let index = 0; index < await controls.count(); index += 1) {
    if (await controls.nth(index).isVisible()) visible.push(controls.nth(index));
  }
  expect(visible.length).toBeGreaterThan(0);
  for (const control of visible) {
    await expect(control).toHaveAccessibleName(/\S+/);
  }
}

test('core launcher and preview controls have accessible names and live status', async ({page}) => {
  await page.goto('/?gallery=1&scenario=preview-loading&capture=1');

  await expect(page.getByRole('region', {name: 'Lumen visual state gallery'})).toBeVisible();
  await expectNamedInteractiveControls(page);
  await expect(page.getByRole('region', {name: 'File preview'})).toContainText(/Loading preview|Preparing preview/);
  await expect(page.getByTestId('search-announcement')).toHaveAttribute('aria-live', 'polite');
});

test('keyboard-only search, selection, details, and focus restoration remain complete', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');
  const search = page.getByRole('searchbox', {name: 'Search files'});
  await expect(search).toBeFocused();
  await search.fill('report');
  await expect(page.getByRole('grid', {name: 'Search results'})).toBeVisible();

  await page.keyboard.press('ArrowDown');
  const selected = page.locator('[role="row"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  await page.keyboard.press('Alt+Enter');
  await expect(page.getByRole('dialog', {name: 'File details'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();

  await page.keyboard.press('Control+,');
  await expect(page.getByRole('navigation', {name: 'Settings'})).toBeVisible();
  await expectNamedInteractiveControls(page);
  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
});

test('the keyboard map keeps one labelled composer and answer region available', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');
  const search = page.getByRole('searchbox', {name: 'Search files'});
  await expect(search).toBeFocused();

  await search.fill('report');
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', {name: 'AI answer'})).toBeVisible();
  await expect(page.getByTestId('answer-region')).toHaveCount(1);

  await page.goto('/?gallery=1&scenario=ai-streaming&capture=1');
  await expect(page.getByRole('button', {name: 'Stop answer'})).toBeEnabled();
  await expect(page.getByTestId('answer-region')).toHaveCount(1);
});

test('IME composition does not commit or expand until composition ends', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');
  const search = page.getByRole('searchbox', {name: 'Search files'});

  await search.dispatchEvent('compositionstart', {data: ''});
  await search.fill('Årsrapport');
  await expect(page.getByRole('region', {name: 'Search workspace'})).toHaveCount(0);
  await search.dispatchEvent('compositionend', {data: 'Årsrapport'});
  await expect(page.getByRole('region', {name: 'Search workspace'})).toBeVisible();
});

test('high contrast, reduced motion, opaque materials, Unicode, and status text are explicit', async ({page}) => {
  await page.goto('/?gallery=1&scenario=theme-high-contrast&capture=1');
  const application = page.getByRole('application', {name: 'Lumen'});
  await expect(application).toHaveAttribute('data-contrast', 'high');

  await page.goto('/?gallery=1&scenario=theme-reduced-motion&capture=1');
  await expect(application).toHaveAttribute('data-reduced-motion', 'true');
  const duration = await page.getByRole('tab', {name: 'All'}).evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);

  await page.goto('/?gallery=1&scenario=theme-opaque&capture=1');
  await expect(application).toHaveAttribute('data-transparency', 'disabled');
  await expect(page.getByLabel('Lumen launcher')).toHaveCSS('backdrop-filter', 'none');

  await page.goto('/?gallery=1&scenario=unicode-filename&capture=1');
  await expect(page.getByRole('row', {name: /Årsrapport 2026/})).toContainText('東京');

  await page.goto('/?gallery=1&scenario=activity-battery&capture=1');
  await expect(page.getByTestId('activity-battery')).toContainText('Paused on battery');
});

test('all visible product targets are at least 32 logical pixels on one axis', async ({page}) => {
  await page.goto('/?gallery=1&scenario=preview-complete&capture=1');
  const targets = page.locator('button:visible, [role="tab"]:visible, [role="row"]:visible');
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.max(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(32);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
  }
});
