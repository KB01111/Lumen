import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {withLumenDevServer} from './lib/lumen-dev-server.mjs';

const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);

async function runPlaywright() {
  const child = spawn(
    process.execPath,
    [playwrightCli, 'test', ...process.argv.slice(2)],
    {cwd: process.cwd(), env: process.env, stdio: 'inherit', windowsHide: true},
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Playwright exited from signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

process.exitCode = await withLumenDevServer(runPlaywright);
