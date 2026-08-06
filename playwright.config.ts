import {defineConfig} from '@playwright/test';
import path from 'node:path';

const bunExecutable = [process.env.npm_execpath, process.execPath].find(
  (candidate) => candidate && /^bun(?:\.exe)?$/i.test(path.basename(candidate)),
) ?? 'bun';
const bunCommand = bunExecutable === 'bun' ? bunExecutable : `"${bunExecutable}"`;
const managedServer = process.env.LUMEN_E2E_MANAGED_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  // Functional flows and the compositor benchmark share one desktop GPU.
  // Serial execution keeps the high-refresh evidence isolated and repeatable.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: managedServer ? undefined : {
    command: `${bunCommand} node_modules/vite/bin/vite.js --host 127.0.0.1`,
    url: 'http://127.0.0.1:1420',
    // A different Lumen worktree can expose the same strict port. Reusing it makes
    // a green run describe the wrong source tree, so acceptance always owns its server.
    reuseExistingServer: false,
  },
});
