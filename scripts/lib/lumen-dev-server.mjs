import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const defaultUrl = 'http://127.0.0.1:1420';
const viteCli = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));

async function isReady(url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(800)});
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isReady(url)) return;
    if (child.exitCode !== null) {
      throw new Error(`Lumen development server exited with code ${child.exitCode}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Lumen development server did not become ready at ${url}.`);
}

async function stopDevelopmentServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  if (!child.kill()) throw new Error('Lumen development server could not be stopped.');
  await exited;
}

export async function withLumenDevServer(task, url = defaultUrl) {
  if (await isReady(url)) {
    return task(url);
  }

  const target = new URL(url);
  const child = spawn(
    process.execPath,
    [
      viteCli,
      '--host',
      target.hostname,
      '--port',
      target.port,
      '--strictPort',
    ],
    {
      cwd: process.cwd(),
      env: {...process.env, NO_COLOR: '1'},
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  let serverOutput = '';
  const rememberOutput = (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-4000);
  };
  child.stdout.on('data', rememberOutput);
  child.stderr.on('data', rememberOutput);

  try {
    await waitUntilReady(url, child);
    return await task(url);
  } catch (error) {
    if (serverOutput) process.stderr.write(serverOutput);
    throw error;
  } finally {
    await stopDevelopmentServer(child);
  }
}
