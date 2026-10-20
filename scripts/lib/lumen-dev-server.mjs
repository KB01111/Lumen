import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultUrl = 'http://127.0.0.1:1420';
const viteCli = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const ownedVite = fileURLToPath(new URL('./lumen-owned-vite.mjs', import.meta.url));

async function isReady(url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(800)});
    return response.ok;
  } catch {
    return false;
  }
}

export function isOwnedServerReceipt(receipt, expected) {
  return typeof receipt === 'object' && receipt !== null &&
    receipt.type === 'lumen-owned-vite-ready' && receipt.pid === expected.pid &&
    receipt.token === expected.token && receipt.root === expected.root &&
    receipt.host === expected.host && receipt.address === expected.host &&
    receipt.port === expected.port && receipt.listening === true;
}

export function isDevServerRunning(child, owned) {
  return child.exitCode === null && child.signalCode === null && (!owned || child.connected);
}

async function waitUntilReady(url, child, reuseExistingServer, hasStarted) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (!reuseExistingServer && !isDevServerRunning(child, true)) {
      throw new Error(`Lumen development server stopped (${child.exitCode ?? child.signalCode ?? 'lost its IPC channel'}).`);
    }
    if (await isReady(url)) {
      if (reuseExistingServer) return;
      // HTTP readiness alone can come from a competing checkout before Vite binds.
      if (hasStarted()) {
        if (!isDevServerRunning(child, true) || Date.now() >= deadline) throw new Error('Lumen development server listener is not owned by the spawned child within the startup deadline.');
        return;
      }
    }
    if (!isDevServerRunning(child, !reuseExistingServer)) {
      throw new Error(`Lumen development server stopped (${child.exitCode ?? child.signalCode ?? 'lost its IPC channel'}).`);
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

export async function withLumenDevServer(task, url = defaultUrl, {reuseExistingServer = true} = {}) {
  if (!reuseExistingServer && process.platform !== 'win32') throw new Error('Owned Lumen server verification requires Windows.');
  const target = new URL(url);
  if (!reuseExistingServer && (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port)) throw new Error('Owned Lumen server requires an explicit loopback HTTP port.');
  if (await isReady(url)) {
    if (!reuseExistingServer) throw new Error('Lumen development server is already ready; owned startup required.');
    return task(url);
  }

  const token = randomUUID();
  const root = resolve(process.cwd());
  const child = spawn(
    process.execPath,
    reuseExistingServer ? [
      viteCli,
      '--host',
      target.hostname,
      '--port',
      target.port,
      '--strictPort',
    ] : [ownedVite, target.hostname, target.port, token],
    {
      cwd: process.cwd(),
      env: {...process.env, NO_COLOR: '1'},
      stdio: reuseExistingServer ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    },
  );

  let ownership;
  if (!reuseExistingServer) child.on('message', (receipt) => {
    if (isOwnedServerReceipt(receipt, {pid: child.pid, root, host: target.hostname, port: Number(target.port), token})) ownership = receipt;
  });
  child.on('exit', () => { ownership = undefined; });
  child.on('disconnect', () => { ownership = undefined; });

  let serverOutput = '';
  const rememberOutput = (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-4000);
  };
  child.stdout.on('data', rememberOutput);
  child.stderr.on('data', rememberOutput);

  try {
    await waitUntilReady(url, child, reuseExistingServer, () => ownership !== undefined);
    return await task(url, ownership);
  } catch (error) {
    if (serverOutput) process.stderr.write(serverOutput);
    throw error;
  } finally {
    await stopDevelopmentServer(child);
  }
}
