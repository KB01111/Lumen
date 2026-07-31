import {execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {chromium} from 'playwright';

import {withLumenDevServer} from './lib/lumen-dev-server.mjs';

const outputDirectory = path.resolve('artifacts/screenshots');
const viewport = {width: 1120, height: 760};

function categoryFor(id) {
  if (id.startsWith('activity-')) return 'Activity';
  if (id.startsWith('provider-') || id.startsWith('model-')) return 'Local AI';
  if (id.startsWith('gateway-')) return 'Gateway';
  if (id.startsWith('theme-')) return 'Theme';
  if (id.startsWith('settings-') || id.startsWith('onboarding-')) return 'Management';
  if (['permission-required', 'long-filename', 'unicode-filename', 'large-results', 'reranking-unavailable'].includes(id)) return 'Resilience';
  if (id.startsWith('preview-')) return 'Preview';
  return 'Launcher';
}

async function createContactSheet(browser, entries) {
  const page = await browser.newPage({viewport: {width: 1680, height: 1000}});
  const cards = await Promise.all(entries.map(async (entry) => {
    const image = await readFile(entry.absolutePath, 'base64');
    return `
      <figure>
        <img src="data:image/png;base64,${image}" alt="${entry.label}">
        <figcaption><strong>${entry.label}</strong><span>${entry.scenario}</span></figcaption>
      </figure>`;
  }));
  await page.setContent(`<!doctype html>
    <html><head><style>
      *{box-sizing:border-box} body{margin:0;padding:28px;background:#070b12;color:#eaf2ff;font:14px/1.4 "Segoe UI",sans-serif}
      h1{margin:0 0 20px;font-size:26px} main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
      figure{margin:0;padding:10px;background:#101824;border:1px solid #26354a;border-radius:14px;box-shadow:0 12px 30px #0006}
      img{display:block;width:100%;aspect-ratio:28/19;object-fit:cover;border-radius:9px;background:#05070b}
      figcaption{display:grid;gap:2px;padding:9px 3px 2px} strong{font-weight:600} span{color:#8fa2bb;font-size:12px}
    </style></head><body><h1>Lumen Phase 1 visual state gallery</h1><main>${cards.join('')}</main></body></html>`);
  await page.screenshot({path: path.join(outputDirectory, 'contact-sheet.png'), fullPage: true});
  await page.close();
}

async function capture(baseUrl) {
  await mkdir(outputDirectory, {recursive: true});
  const browser = await chromium.launch({channel: 'msedge'});
  const context = await browser.newContext({viewport, reducedMotion: 'reduce'});
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/?gallery=1&scenario=collapsed-idle`);
    const scenarioSelect = page.locator('select[aria-label="Gallery scenario"]');
    await scenarioSelect.waitFor();
    const scenarios = await scenarioSelect.locator('option')
      .evaluateAll((options) => options.map((option) => ({
        id: option.value,
        label: option.textContent?.trim() || option.value,
      })));
    if (scenarios.length === 0) {
      throw new Error('The visual state gallery did not expose any scenarios.');
    }
    const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const entries = [];
    for (const scenario of scenarios) {
      await page.goto(`${baseUrl}/?gallery=1&scenario=${encodeURIComponent(scenario.id)}&capture=1`);
      await page.locator(`[data-gallery-scenario="${scenario.id}"]`).waitFor();
      await page.evaluate(async (useLightBackdrop) => {
        document.documentElement.style.background = useLightBackdrop
          ? 'linear-gradient(145deg, #f7fbff, #dce8f3)'
          : 'radial-gradient(circle at 28% 8%, #20334f, #090d14 58%, #05070b)';
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, scenario.id === 'theme-light' || scenario.id === 'theme-high-contrast');
      const filename = `${scenario.id}.png`;
      const absolutePath = path.join(outputDirectory, filename);
      await page.screenshot({path: absolutePath, animations: 'disabled'});
      entries.push({
        scenario: scenario.id,
        label: scenario.label,
        category: categoryFor(scenario.id),
        file: `artifacts/screenshots/${filename}`,
        absolutePath,
        viewport,
        colorScheme: scenario.id === 'theme-light' ? 'light' : 'dark',
        reducedMotion: true,
        gitSha,
      });
    }
    await createContactSheet(browser, entries);
    const manifest = {
      generatedAt: new Date().toISOString(),
      gitSha,
      browser: {name: 'Microsoft Edge', version: browser.version()},
      viewport,
      count: entries.length,
      contactSheet: 'artifacts/screenshots/contact-sheet.png',
      captures: entries.map((entry) => ({
        scenario: entry.scenario,
        label: entry.label,
        category: entry.category,
        file: entry.file,
        viewport: entry.viewport,
        colorScheme: entry.colorScheme,
        reducedMotion: entry.reducedMotion,
        gitSha: entry.gitSha,
      })),
    };
    await writeFile(
      path.join(outputDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`Captured ${entries.length} gallery states in ${outputDirectory}.\n`);
  } finally {
    await context.close();
    await browser.close();
  }
}

await withLumenDevServer(capture);
