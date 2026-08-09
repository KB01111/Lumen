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

test('the constrained work area keeps controls contained while results and answers scroll internally', async ({page}) => {
  await page.setViewportSize({width: 720, height: 540});
  for (const scale of scales) {
    await page.goto(`/?gallery=1&scenario=constrained-work-area&capture=1&scale=${scale}`);

    const gallery = page.getByRole('region', {name: 'Lumen visual state gallery'});
    const launcher = page.getByLabel('Lumen launcher');
    const search = page.getByRole('searchbox', {name: 'Search files'});
    const composer = search.locator('..');
    const footer = page.getByText('Local runtime', {exact: true}).locator('..');
    const grid = page.getByRole('grid', {name: 'Search results'});
    const resultViewport = grid.locator('..');
    const answer = page.getByTestId('answer-region');

    await expect(gallery).toBeAttached();
    await expect(search).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(answer).toBeVisible();
    await expect(answer).toHaveCount(1);
    await expect(page.getByRole('region', {name: 'File preview'})).toBeHidden();

    const [galleryBounds, launcherBounds, composerBounds, footerBounds, searchBounds, modeBounds] = await Promise.all([
      gallery.boundingBox(),
      launcher.boundingBox(),
      composer.boundingBox(),
      footer.boundingBox(),
      search.boundingBox(),
      page.getByRole('button', {name: 'Switch to Computer Use'}).boundingBox(),
    ]);
    expect(galleryBounds).not.toBeNull();
    expect(launcherBounds).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect(footerBounds).not.toBeNull();
    expect(searchBounds).not.toBeNull();
    expect(modeBounds).not.toBeNull();

    for (const bounds of [launcherBounds, composerBounds, footerBounds]) {
      expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(-0.5);
      expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(-0.5);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(720.5);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(540.5);
    }
    expect(composerBounds?.y ?? 0).toBeGreaterThanOrEqual(launcherBounds?.y ?? 0);
    expect((footerBounds?.y ?? 0) + (footerBounds?.height ?? 0)).toBeLessThanOrEqual(
      (launcherBounds?.y ?? 0) + (launcherBounds?.height ?? 0) + 0.5,
    );
    expect(searchBounds?.width ?? 0).toBeGreaterThan(24);
    expect((modeBounds?.x ?? 0) + (modeBounds?.width ?? 0)).toBeLessThanOrEqual(
      (composerBounds?.x ?? 0) + (composerBounds?.width ?? 0) + 0.5,
    );

    const resultScroll = await resultViewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop};
    });
    const answerScroll = await answer.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop};
    });
    expect(resultScroll.scrollHeight).toBeGreaterThan(resultScroll.clientHeight);
    expect(resultScroll.scrollTop).toBeGreaterThan(0);
    expect(answerScroll.scrollHeight).toBeGreaterThan(answerScroll.clientHeight);
    expect(answerScroll.scrollTop).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
