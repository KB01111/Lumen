import {execFileSync} from 'node:child_process';
import {mkdir, readdir, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {chromium} from 'playwright';

import {withLumenDevServer} from './lib/lumen-dev-server.mjs';

const outputDirectory = path.resolve('artifacts/recordings');
const viewport = {width: 1120, height: 760};

async function pause(page, milliseconds = 320) {
  await page.waitForTimeout(milliseconds);
}

async function saveRecordedFlow(browser, filename, run) {
  const context = await browser.newContext({
    viewport,
    recordVideo: {dir: outputDirectory, size: viewport},
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await run(page);
    await pause(page, 500);
  } finally {
    await page.close();
    if (video) await video.saveAs(path.join(outputDirectory, filename));
    await context.close();
  }
}

async function record(baseUrl) {
  await mkdir(outputDirectory, {recursive: true});
  for (const filename of await readdir(outputDirectory)) {
    if (filename.startsWith('page@') && filename.endsWith('.webm')) {
      await unlink(path.join(outputDirectory, filename));
    }
  }
  const browser = await chromium.launch({channel: 'msedge'});
  const recordings = [];
  const add = async (definition, run) => {
    await saveRecordedFlow(browser, definition.file, run);
    recordings.push(definition);
    process.stdout.write(`Recorded ${definition.file}.\n`);
  };

  try {
    await add({
      id: 'launcher-search',
      file: 'launcher-search.webm',
      title: 'Launcher search, selection, preview, scope, and open',
      flows: ['launcher open', 'typing expansion', 'rapid keyboard selection', 'preview details', 'scope change', 'folder open confirmation', 'file open confirmation'],
    }, async (page) => {
      await page.goto(`${baseUrl}/?onboarded=1&service=memory`);
      const search = page.getByRole('searchbox', {name: 'Search files'});
      await search.pressSequentially('report', {delay: 70});
      await page.getByRole('grid', {name: 'Search results'}).waitFor();
      await pause(page);
      await page.keyboard.press('ArrowDown');
      await pause(page, 180);
      await page.keyboard.press('ArrowDown');
      await pause(page, 180);
      await page.keyboard.press('ArrowUp');
      await pause(page);
      await page.keyboard.press('Alt+Enter');
      await page.getByRole('dialog', {name: 'File details'}).waitFor();
      await pause(page, 600);
      await page.keyboard.press('Escape');
      await pause(page);
      await page.keyboard.press('Control+Enter');
      await pause(page);
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight');
      await pause(page);
      await page.keyboard.press('Control+K');
      await pause(page);
      await page.keyboard.press('Enter');
    });

    await add({
      id: 'settings-routing',
      file: 'settings-routing.webm',
      title: 'Settings navigation and provider routes',
      flows: ['settings navigation', 'appearance', 'local AI route', 'AgentGateway route', 'Computer Use consent', 'activity policy', 'Session Relief analysis'],
    }, async (page) => {
      await page.goto(`${baseUrl}/?onboarded=1&service=memory`);
      await page.keyboard.press('Control+,');
      await page.getByRole('navigation', {name: 'Settings'}).waitFor();
      for (const pageName of ['Appearance', 'Local AI', 'AgentGateway', 'Computer Use', 'Activity', 'Session Relief']) {
        await page.getByRole('tab', {name: pageName, exact: true}).click();
        await page.getByRole('heading', {name: pageName, exact: true}).waitFor();
        if (pageName === 'Computer Use') {
          await page.getByText('Computer Use requires the native Windows app.', {exact: false}).waitFor();
        }
        if (pageName === 'Session Relief') {
          await page.getByRole('button', {name: 'Analyze this session'}).waitFor();
        }
        await pause(page, 520);
      }
      await page.getByRole('button', {name: 'Close settings'}).click();
    });

    await add({
      id: 'onboarding',
      file: 'onboarding.webm',
      title: 'Onboarding scene progression',
      flows: ['welcome', 'privacy', 'root selection', 'shortcut', 'indexing', 'local AI', 'exact search', 'activity', 'completion'],
    }, async (page) => {
      await page.goto(`${baseUrl}/?onboarding=1`);
      await page.getByRole('heading', {name: 'Everything, within reach'}).waitFor();
      await pause(page, 650);
      await page.getByRole('button', {name: 'Begin'}).click();
      await pause(page, 520);
      await page.getByRole('button', {name: 'Continue'}).click();
      await pause(page, 520);
      await page.getByRole('button', {name: 'Choose folder'}).click();
      await page.getByText('C:\\Projects\\Lumen Demo').waitFor();
      await pause(page, 520);
      for (let index = 0; index < 5; index += 1) {
        await page.getByRole('button', {name: 'Continue'}).click();
        await pause(page, 520);
      }
      await page.getByRole('button', {name: 'Start using Lumen'}).click();
    });

    await add({
      id: 'activity-provider-states',
      file: 'activity-provider-states.webm',
      title: 'Gaming contraction and provider state routes',
      flows: ['gaming pause contraction', 'fullscreen pause', 'Cinema mode', 'GPU provider', 'model ready', 'gateway ready'],
    }, async (page) => {
      await page.goto(`${baseUrl}/?gallery=1&scenario=activity-indexing`);
      for (const scenario of [
        'activity-gaming',
        'activity-fullscreen',
        'activity-cinema',
        'provider-gpu',
        'model-ready',
        'gateway-ready',
      ]) {
        await page.locator('select[aria-label="Gallery scenario"]').selectOption(scenario);
        await page.locator(`[data-gallery-scenario="${scenario}"]`).waitFor();
        await pause(page, 650);
      }
    });
  } finally {
    await browser.close();
  }

  for (const filename of await readdir(outputDirectory)) {
    if (filename.startsWith('page@') && filename.endsWith('.webm')) {
      await unlink(path.join(outputDirectory, filename));
    }
  }

  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const gitDirty = execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0;
  const manifest = {
    generatedAt: new Date().toISOString(),
    gitSha,
    gitDirty,
    browser: {name: 'Microsoft Edge'},
    viewport,
    count: recordings.length,
    recordings: recordings.map((item) => ({
      ...item,
      file: `artifacts/recordings/${item.file}`,
      deterministicAdapter: true,
      audio: false,
      gitSha,
      gitDirty,
    })),
  };
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

await withLumenDevServer(record);
