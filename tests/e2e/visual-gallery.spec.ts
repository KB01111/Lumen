import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.setViewportSize({width: 1120, height: 760});
});

test('renders deterministic launcher and preview states in production geometry', async ({page}) => {
  await page.goto('/?gallery=1&scenario=preview-complete&capture=1');

  await expect(page.getByRole('region', {name: 'Lumen visual state gallery'})).toHaveAttribute('data-gallery-scenario', 'preview-complete');
  await expect(page.getByRole('grid', {name: 'Search results'})).toBeVisible();
  await expect(page.getByRole('region', {name: 'File preview'})).toContainText('Private by default');
  await expect(page.getByRole('searchbox', {name: 'Search files'})).toBeFocused();
});

test('keeps the 10,000-result scenario virtualized', async ({page}) => {
  await page.goto('/?gallery=1&scenario=large-results&capture=1');
  const grid = page.getByRole('grid', {name: 'Search results'});

  await expect(grid).toHaveAttribute('aria-rowcount', '10000');
  expect(await page.locator('[data-result-id]').count()).toBeLessThan(40);
});

test('exposes every appearance axis through stable gallery URLs', async ({page}) => {
  for (const [scenario, attribute, value] of [
    ['theme-light', 'data-resolved-theme', 'light'],
    ['theme-opaque', 'data-transparency', 'disabled'],
    ['theme-high-contrast', 'data-contrast', 'high'],
    ['theme-reduced-motion', 'data-reduced-motion', 'true'],
  ] as const) {
    await page.goto(`/?gallery=1&scenario=${scenario}&capture=1`);
    await expect(page.getByRole('application', {name: 'Lumen'})).toHaveAttribute(attribute, value);
  }
});

test('renders management and activity surfaces from the same scenario registry', async ({page}) => {
  await page.goto('/?gallery=1&scenario=activity-gaming');
  await expect(page.getByTestId('activity-gaming')).toBeVisible();
  await page.goto('/?gallery=1&scenario=settings-agent-gateway&capture=1');
  await expect(page.getByRole('heading', {name: 'AgentGateway', exact: true})).toBeVisible();
  await page.goto('/?gallery=1&scenario=onboarding-welcome&capture=1');
  await expect(page.getByRole('heading', {name: 'Everything, within reach'})).toBeVisible();
});
