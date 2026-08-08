import {expect, test} from '@playwright/test';

const viewports = [
  {name: '1080p logical', width: 720, height: 540},
  {name: '1440p logical', width: 960, height: 640},
  {name: '4K logical', width: 1280, height: 720},
  {name: 'ultrawide logical', width: 1440, height: 640},
] as const;
const scales = [100, 125, 150, 175, 200] as const;

for (const viewport of viewports) {
  test(`${viewport.name} remains bounded across the text-scale matrix`, async ({page}) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    for (const scale of scales) {
      await page.goto(`/?gallery=1&scenario=preview-complete&capture=1&scale=${scale}`);
      const launcher = page.getByLabel('Lumen launcher');
      await expect(launcher).toBeVisible();
      const bounds = await launcher.boundingBox();
      expect(bounds).not.toBeNull();
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 0.5);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
    }
  });
}

test('preview collapses before results at the narrow production breakpoint', async ({page}) => {
  await page.setViewportSize({width: 720, height: 540});
  await page.goto('/?gallery=1&scenario=preview-complete&capture=1');

  await expect(page.getByRole('grid', {name: 'Search results'})).toBeVisible();
  await expect(page.getByRole('region', {name: 'File preview'})).toBeHidden();
  await page.setViewportSize({width: 960, height: 640});
  await expect(page.getByRole('region', {name: 'File preview'})).toBeVisible();
});

test('settings remain usable at 200-percent text size', async ({page}) => {
  await page.setViewportSize({width: 880, height: 600});
  await page.goto('/?gallery=1&scenario=settings-agent-gateway&capture=1&scale=200&theme=light');

  await expect(page.getByRole('heading', {name: 'AgentGateway', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Restart AgentGateway'})).toBeVisible();
  await expect(page.getByRole('tab', {name: 'AgentGateway'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('the constrained work area keeps the composer and footer fixed around internal regions', async ({page}) => {
  await page.setViewportSize({width: 720, height: 540});
  for (const scale of scales) {
    await page.goto(`/?gallery=1&scenario=constrained-work-area&capture=1&scale=${scale}`);

    await expect(page.getByRole('region', {name: 'Lumen visual state gallery'})).toBeAttached();
    await expect(page.getByRole('searchbox', {name: 'Search files'})).toBeVisible();
    await expect(page.getByText('Local runtime', {exact: true})).toBeVisible();
    await expect(page.getByRole('grid', {name: 'Search results'})).toBeVisible();
    await expect(page.getByRole('region', {name: 'File preview'})).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    const resultViewport = page.getByRole('grid', {name: 'Search results'}).locator('..');
    const internalOverflow = await resultViewport.evaluate(
      (element) => getComputedStyle(element).overflowY,
    );
    expect(['auto', 'scroll']).toContain(internalOverflow);
  }

  const modeControl = page.getByRole('button', {name: 'Switch to Computer Use'});
  await expect(modeControl).toHaveCSS('max-width', '180px');
  await expect(page.getByLabel('Alt plus Space')).toBeHidden();
});
