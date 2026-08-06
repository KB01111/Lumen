import {spawn} from 'node:child_process';
import path from 'node:path';

const defaultUrl = 'http://127.0.0.1:1420';

async function isReady(url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(800)});
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(url, childExit) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isReady(url)) return;
    const exited = await Promise.race([
      childExit.then((result) => ({exited: true, result})),
      new Promise((resolve) => setTimeout(() => resolve({exited: false}), 150)),
    ]);
    if (exited.exited) {
      if (exited.result.error) throw exited.result.error;
      throw new Error(`Lumen development server exited with ${exited.result.code ?? exited.result.signal}.`);
    }
  }
  throw new Error(`Lumen development server did not become ready at ${url}.`);
}

export async function withLumenDevServer(task, url = defaultUrl) {
  if (await isReady(url)) {
    throw new Error(`A server is already using ${url}. Stop that exact listener before generating evidence.`);
  }

  const target = new URL(url);
  const viteCli = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
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
  const childExit = new Promise((resolve) => {
    child.once('error', (error) => resolve({error}));
    child.once('exit', (code, signal) => resolve({code, signal}));
  });

  let serverOutput = '';
  const rememberOutput = (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-4000);
  };
  child.stdout.on('data', rememberOutput);
  child.stderr.on('data', rememberOutput);

  try {
    await waitUntilReady(url, childExit);
    return await task(url);
  } catch (error) {
    if (serverOutput) process.stderr.write(serverOutput);
    throw error;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.race([childExit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
}
