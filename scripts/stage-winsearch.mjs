import {copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm} from 'node:fs/promises';
import {log} from 'node:console';
import {dirname, join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {ENGINE_COMMIT, TARGET, assertNoLinks, inventory, verifyPayload} from './lib/winsearch-payload.mjs';

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function readLock(workspace) {
  const path = join(workspace, 'src-tauri/winsearch-payload.lock.json');
  await assertNoLinks(path);
  if ((await lstat(path)).size > 4096) throw new Error('WinSearch lock exceeds bound');
  const lock = JSON.parse(await readFile(path, 'utf8'));
  if (Object.keys(lock).sort().join(',') !== 'engineCommit,manifestSha256,schemaVersion,target' ||
      lock.schemaVersion !== 1 || lock.engineCommit !== ENGINE_COMMIT || lock.target !== TARGET ||
      !/^[0-9a-f]{64}$/.test(lock.manifestSha256)) throw new Error('Invalid WinSearch payload lock');
  return lock;
}

export async function verifyBuildPayload(workspace, required) {
  const directory = join(resolve(workspace), 'src-tauri/binaries/winsearch');
  await assertNoLinks(join(resolve(workspace), 'src-tauri'));
  if (await exists(dirname(directory))) await assertNoLinks(dirname(directory));
  if (!await exists(directory)) {
    if (required) throw new Error('Missing WinSearch payload; run bun run stage:winsearch --source <verified-package>');
    return null;
  }
  await assertNoLinks(directory);
  if ((await readdir(directory)).length === 0) {
    if (required) throw new Error('Missing WinSearch payload in empty resource directory');
    return null;
  }
  const lock = await readLock(workspace);
  return (await verifyPayload(directory, lock.manifestSha256)).manifestSha256;
}

async function move(source, target) {
  for (let attempt = 0; ; attempt++) {
    if (await exists(target)) throw new Error('WinSearch staging destination already exists');
    try { await rename(source, target); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 5) throw error;
      await delay(100 * 2 ** attempt);
    }
  }
}

async function removeCandidate(parent, candidate) {
  if (dirname(resolve(candidate)) !== resolve(parent) || !candidate.startsWith(join(parent, '.winsearch-'))) throw new Error('Unsafe WinSearch cleanup path');
  if (await exists(candidate)) {
    await assertNoLinks(candidate);
    await inventory(candidate);
    await rm(candidate, {recursive: true});
  }
}

export async function stagePayload(workspace, source) {
  workspace = resolve(workspace);
  const lock = await readLock(workspace);
  const verified = await verifyPayload(source, lock.manifestSha256);
  const parent = join(workspace, 'src-tauri/binaries');
  await assertNoLinks(join(workspace, 'src-tauri'));
  await mkdir(parent, {recursive: true});
  await assertNoLinks(parent);
  const candidate = await mkdtemp(join(parent, '.winsearch-'));
  const previous = candidate + '-previous';
  const destination = join(parent, 'winsearch');
  let retained = false;
  try {
    for (const path of ['payload.json', ...verified.manifest.files.map(file => file.path)]) {
      const target = join(candidate, path);
      await mkdir(dirname(target), {recursive: true});
      await copyFile(join(source, path), target);
    }
    await verifyPayload(candidate, lock.manifestSha256);
    if (await exists(destination)) {
      await assertNoLinks(destination);
      await inventory(destination);
      await move(destination, previous);
      retained = true;
    }
    try { await move(candidate, destination); }
    catch (error) { if (retained) await move(previous, destination); throw error; }
    const sha = await verifyBuildPayload(workspace, true);
    if (retained) await removeCandidate(parent, previous);
    return sha;
  } finally { await removeCandidate(parent, candidate); }
}

if (import.meta.main) {
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [command, ...args] = process.argv.slice(2);
  if (command === 'verify-build' && args.every(arg => arg === '--release')) {
    const sha = await verifyBuildPayload(workspace, args.includes('--release') || process.env.PROFILE === 'release' || process.env.LUMEN_RELEASE_BUILD === '1');
    if (sha !== null) log(sha);
  } else if (command === 'stage' && args.length === 2 && args[0] === '--source') {
    log(`Staged verified WinSearch payload ${await stagePayload(workspace, resolve(args[1]))}`);
  } else throw new Error('Expected stage --source <verified-package> or verify-build [--release]');
}
