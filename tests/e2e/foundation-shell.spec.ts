import {expect, test} from '@playwright/test';

test('renders dark, light, and opaque shell variants', async ({page}) => {
  await page.goto('/?mode=foundation');

  const application = page.getByRole('application', {name: 'Lumen'});
  const launcher = page.getByLabel('Lumen launcher');

  await expect(application).toHaveAttribute('data-theme', 'dark');
  await expect(application).toHaveAttribute('data-transparency', 'native');
  await expect(launcher).toHaveAttribute('data-material', 'mica');
  await expect(page.getByText('Search apps, files, and settings')).toBeVisible();

  await page.keyboard.press('Control+Shift+L');
  await expect(application).toHaveAttribute('data-theme', 'light');

  await page.keyboard.press('Control+Shift+L');
  await expect(application).toHaveAttribute('data-theme', 'dark');
  await expect(application).toHaveAttribute('data-transparency', 'disabled');

  await page.goto('/?service=memory');
  const commandPalette = page.getByLabel('Lumen launcher');
  await expect(commandPalette).toHaveAttribute('data-upstream', 'einui-glass-command-palette');
  await expect(commandPalette).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('searchbox', {name: 'Search files'}).fill('release');
  await expect(commandPalette).toHaveAttribute('data-expanded', 'true');
  await expect(commandPalette.locator('[data-einui-slot="workspace"]')).toBeVisible();
});

test('keeps the transparent host bounded while the inner surface expands', async ({page}) => {
  await page.goto('/?onboarded=1&service=memory');
  const launcher = page.getByLabel('Lumen launcher');
  const search = page.getByRole('searchbox', {name: 'Search files'});
  const before = await search.boundingBox();

  await search.fill('report');
  await expect(launcher).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByRole('region', {name: 'Search workspace'})).toBeVisible();
  const after = await search.boundingBox();

  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

