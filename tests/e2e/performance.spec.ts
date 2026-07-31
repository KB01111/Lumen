import {expect, test, type Page} from '@playwright/test';

test.describe.configure({mode: 'serial'});
test.use({
  trace: 'off',
  launchOptions: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  },
});

interface DiagnosticsMetrics {
  timings: Array<{name: string; durationMs: number}>;
  longTasks: number[];
  reactCommits: number[];
}

function percentile(values: readonly number[], quantile: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;
}

async function resetMetrics(page: Page) {
  await page.evaluate(() => {
    (window as unknown as {__LUMEN_DIAGNOSTICS__: {reset(): void}}).__LUMEN_DIAGNOSTICS__.reset();
  });
}

async function readMetrics(page: Page): Promise<DiagnosticsMetrics> {
  return page.evaluate(() => (
    window as unknown as {__LUMEN_DIAGNOSTICS__: {read(): DiagnosticsMetrics}}
  ).__LUMEN_DIAGNOSTICS__.read());
}

async function waitForSamples(page: Page, name: string, count: number) {
  await page.waitForFunction(
    ({sampleName, sampleCount}) => {
      const diagnostics = (window as unknown as {
        __LUMEN_DIAGNOSTICS__: {read(): DiagnosticsMetrics};
      }).__LUMEN_DIAGNOSTICS__.read();
      return diagnostics.timings.filter((sample) => sample.name === sampleName).length >= sampleCount;
    },
    {sampleName: name, sampleCount: count},
  );
}

async function measureFrameCadence(page: Page, sampleCount = 60) {
  return page.evaluate(async (count) => {
    const intervals: number[] = [];
    let previous = performance.now();
    await new Promise<void>((resolve) => {
      const sample = (now: number) => {
        intervals.push(now - previous);
        previous = now;
        if (intervals.length >= count) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    intervals.sort((left, right) => left - right);
    return {
      medianMs: intervals[Math.floor(intervals.length / 2)] ?? 16.67,
      p95Ms: intervals[Math.floor(intervals.length * 0.95)] ?? 16.67,
    };
  }, sampleCount);
}

test('warm launcher and ordinary interactions stay inside browser budgets', async ({page}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({width: 800, height: 540});
  await page.goto('/?onboarded=1&service=memory');
  const search = page.getByRole('searchbox', {name: 'Search files'});
  await expect(search).toBeFocused();

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('navigation', {name: 'Settings'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
  }
  await page.waitForTimeout(100);
  await resetMetrics(page);

  for (let index = 1; index <= 24; index += 1) {
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('navigation', {name: 'Settings'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
    await waitForSamples(page, 'launcher-visible', index);
  }
  const warmMetrics = await readMetrics(page);
  const warmOpenP95 = percentile(
    warmMetrics.timings.filter((sample) => sample.name === 'launcher-visible').map((sample) => sample.durationMs),
    0.95,
  );
  expect(warmOpenP95).toBeLessThan(20);

  await resetMetrics(page);
  for (let index = 1; index <= 30; index += 1) {
    await search.fill(`report-${index}`);
    await waitForSamples(page, 'input-paint', index);
    await page.waitForTimeout(40);
  }
  await search.fill('report');
  await expect(page.getByRole('grid', {name: 'Search results'})).toBeVisible();
  const frameCadence = await measureFrameCadence(page);
  const inputMetrics = await readMetrics(page);
  const observedFrameBudget = Math.max(frameCadence.p95Ms, 1000 / 240);
  const inputP95 = percentile(
    inputMetrics.timings.filter((sample) => sample.name === 'input-paint').map((sample) => sample.durationMs),
    0.95,
  );
  expect(inputP95).toBeLessThan(observedFrameBudget);

  await resetMetrics(page);
  for (let index = 1; index <= 30; index += 1) {
    await search.fill(`rapid-burst-${index}`);
  }
  await waitForSamples(page, 'input-paint', 30);
  await page.waitForTimeout(100);
  const rapidBurstMetrics = await readMetrics(page);
  await expect(search).toHaveValue('rapid-burst-30');
  expect(rapidBurstMetrics.longTasks.filter((duration) => duration > 16)).toHaveLength(0);
  await search.fill('report');
  await expect(page.getByRole('row').first()).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? 'ArrowDown' : 'ArrowUp');
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(100);

  await resetMetrics(page);
  for (let index = 1; index <= 120; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(100);
  const selectionMetrics = await readMetrics(page);
  expect(selectionMetrics.timings.filter((sample) => sample.name === 'selection-paint')).toHaveLength(120);
  const selectionP95 = percentile(
    selectionMetrics.timings.filter((sample) => sample.name === 'selection-paint').map((sample) => sample.durationMs),
    0.95,
  );
  const ordinaryCommitP95 = percentile(selectionMetrics.reactCommits, 0.95);
  expect(selectionP95).toBeLessThan(observedFrameBudget);
  expect(ordinaryCommitP95).toBeLessThan(3);
  expect(selectionMetrics.longTasks.filter((duration) => duration > 16)).toHaveLength(0);

  await resetMetrics(page);
  for (let index = 1; index <= 30; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
  }
  await waitForSamples(page, 'selection-paint', 30);
  await page.waitForTimeout(100);
  const rapidSelectionMetrics = await readMetrics(page);
  await expect(page.locator('[data-result-id][data-selected="true"]')).toHaveCount(1);
  expect(rapidSelectionMetrics.longTasks.filter((duration) => duration > 16)).toHaveLength(0);
});

test('hover, idle work, animation count, and browser heap remain bounded', async ({page, context}) => {
  await page.setViewportSize({width: 800, height: 540});
  await page.goto('/?gallery=1&scenario=expanded-results&capture=1&theme=reduced-motion');
  const row = page.getByRole('row').first();
  await expect(row).toBeVisible();

  const hoverSamples: number[] = [];
  for (let index = 0; index < 80; index += 1) {
    hoverSamples.push(await row.evaluate((element) => new Promise<number>((resolve) => {
      const startedAt = performance.now();
      element.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'}));
      requestAnimationFrame(() => resolve(performance.now() - startedAt));
    })));
    await page.waitForTimeout(12);
  }
  const frameCadence = await measureFrameCadence(page);
  expect(percentile(hoverSamples, 0.95)).toBeLessThan(Math.max(frameCadence.p95Ms, 1000 / 240));

  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);

  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  const before = await session.send('Performance.getMetrics');
  const startedAt = Date.now();
  await page.waitForTimeout(1000);
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const after = await session.send('Performance.getMetrics');
  await session.send('HeapProfiler.collectGarbage');
  const afterGarbageCollection = await session.send('Performance.getMetrics');
  const metric = (items: typeof before.metrics, name: string) => items.find((item) => item.name === name)?.value ?? 0;
  const idleCpuPercent = (metric(after.metrics, 'TaskDuration') - metric(before.metrics, 'TaskDuration')) / elapsedSeconds * 100;
  const heapMegabytes = metric(afterGarbageCollection.metrics, 'JSHeapUsedSize') / (1024 * 1024);

  expect(idleCpuPercent).toBeLessThan(2);
  expect(heapMegabytes).toBeLessThan(100);
});
