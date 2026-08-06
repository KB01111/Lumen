import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import path from 'node:path';

const host = '127.0.0.1';
const port = 1420;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = path.join(repositoryRoot, 'node_modules', 'playwright', 'cli.js');

function portIsListening() {
  return new Promise((resolve) => {
    const socket = net.createConnection({host, port});
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(300, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({code, signal}));
  });
}

async function waitForServer(server, serverExit) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await portIsListening()) return;
    const exited = await Promise.race([
      serverExit.then((result) => ({exited: true, result})),
      new Promise((resolve) => setTimeout(() => resolve({exited: false}), 100)),
    ]);
    if (exited.exited) {
      throw new Error(`The e2e Vite server exited before readiness (${exited.result.code ?? exited.result.signal}).`);
    }
  }
  server.kill();
  throw new Error(`The e2e Vite server did not listen on ${host}:${port} within 30 seconds.`);
}

async function main() {
  if (await portIsListening()) {
    throw new Error(`Port ${port} is already in use. Stop that exact listener before running e2e acceptance.`);
  }

  const server = spawn(process.execPath, [viteCli, '--host', host], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const serverExit = waitForExit(server);

  try {
    await waitForServer(server, serverExit);
    const tests = spawn('node', [playwrightCli, 'test', ...process.argv.slice(2)], {
      cwd: repositoryRoot,
      env: {...process.env, LUMEN_E2E_MANAGED_SERVER: '1'},
      stdio: 'inherit',
      windowsHide: true,
    });
    const result = await waitForExit(tests);
    if (result.signal) throw new Error(`Playwright was terminated by ${result.signal}.`);
    process.exitCode = result.code ?? 1;
  } finally {
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
}

await main();
