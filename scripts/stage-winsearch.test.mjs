import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import fs, {mkdtemp, mkdir, writeFile, readFile, symlink, readdir, stat, rm} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test, mock, after} from 'node:test';
import {ENGINE_COMMIT, TARGET, REQUIRED_FILES, verifyPayload} from './lib/winsearch-payload.mjs';
import {stagePayload, stageVendoredPayload, verifyBuildPayload} from './stage-winsearch.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const temporaryRoots = [];
async function temporary(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}
after(async () => { for (const root of temporaryRoots) await rm(root, {recursive: true, force: true}); });
async function fixture() {
  const root = await temporary('lumen-winsearch-fixture-');
  const files = [];
  for (const path of [...REQUIRED_FILES, 'notices/pdfium/licenses/test.txt']) {
    await mkdir(join(root, path, '..'), {recursive: true});
    await writeFile(join(root, path), path);
    files.push({path, sha256: digest(path), sizeBytes: Buffer.byteLength(path)});
  }
  const manifest = {schemaVersion: 1, engineCommit: ENGINE_COMMIT, target: TARGET, files};
  await writeFile(join(root, 'payload.json'), JSON.stringify(manifest));
  return {root, manifest};
}
async function save({root, manifest}) { await writeFile(join(root, 'payload.json'), JSON.stringify(manifest)); }

test('verifies every byte of a complete payload', async () => {
  const {root} = await fixture();
  assert.equal((await verifyPayload(root)).manifestSha256, digest(await readFile(join(root, 'payload.json'))));
});
test('rejects missing required worker even when removed from manifest', async () => {
  const f = await fixture();
  f.manifest.files = f.manifest.files.filter(file => file.path !== 'winsearch-extract.exe');
  await save(f);
  await assert.rejects(verifyPayload(f.root), /required/i);
});
test('requires the real NPU shim and its runtime notices', async () => {
  for (const path of ['iron_xrt_shim.dll', 'notices/taconite-LICENSE', 'notices/embeddinggemma2-LICENSE-PYTORCH', 'notices/XRT-LICENSE']) {
    const f = await fixture();
    f.manifest.files = f.manifest.files.filter(file => file.path !== path);
    await save(f);
    await assert.rejects(verifyPayload(f.root), /required/i);
  }
});
test('rejects corrupt file bytes', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'winsearchd.exe'), 'corrupt');
  await assert.rejects(verifyPayload(f.root), /hash|size/i);
});
for (const path of ['../escape.exe', '/absolute.exe', 'C:/drive.exe', 'dir\\escape.exe', 'dir/./file', 'CON.exe', 'file.']) {
  test(`rejects unsafe manifest path ${path}`, async () => {
    const f = await fixture(); f.manifest.files[0].path = path; await save(f);
    await assert.rejects(verifyPayload(f.root), /path/i);
  });
}
test('rejects duplicate case aliases', async () => {
  const f = await fixture(); f.manifest.files.push({...f.manifest.files[0], path: 'WINSEARCHD.EXE'}); await save(f);
  await assert.rejects(verifyPayload(f.root), /duplicate|alias/i);
});
test('rejects stale source commit', async () => {
  const f = await fixture(); f.manifest.engineCommit = '0'.repeat(40); await save(f);
  await assert.rejects(verifyPayload(f.root), /commit/i);
});
test('rejects a mutated manifest against independent lock hash', async () => {
  const f = await fixture();
  await assert.rejects(verifyPayload(f.root, '0'.repeat(64)), /manifest.*hash/i);
});
test('rejects unmanifested files including model weights', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'weights.gguf'), 'model');
  await assert.rejects(verifyPayload(f.root), /unmanifested|unexpected/i);
});
test('rejects a reparse directory inside a payload', async () => {
  const f = await fixture(); const other = await temporary('lumen-winsearch-outside-');
  await symlink(other, join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyPayload(f.root), /link|reparse/i);
});

async function workspaceFixture(manifestSha256) {
  const root = await temporary('lumen-winsearch-stage-');
  await mkdir(join(root, 'src-tauri'), {recursive: true});
  await writeFile(join(root, 'src-tauri', 'winsearch-payload.lock.json'), JSON.stringify({schemaVersion: 1, engineCommit: ENGINE_COMMIT, target: TARGET, manifestSha256}));
  return root;
}

test('stages only a source matching the independent lock and verifies copied bytes', async () => {
  const source = await fixture();
  const sha = digest(await readFile(join(source.root, 'payload.json')));
  const workspace = await workspaceFixture(sha);
  await stagePayload(workspace, source.root);
  assert.equal(await verifyBuildPayload(workspace, true), sha);
  assert.equal(await readFile(join(workspace, 'src-tauri/binaries/winsearch/winsearchd.exe'), 'utf8'), 'winsearchd.exe');
});

test('rejects an unpinned source without replacing the retained staged package', async () => {
  const source = await fixture();
  const sha = digest(await readFile(join(source.root, 'payload.json')));
  const workspace = await workspaceFixture(sha);
  await stagePayload(workspace, source.root);
  source.manifest.files[0].sha256 = '0'.repeat(64);
  await save(source);
  await assert.rejects(stagePayload(workspace, source.root), /manifest.*hash/i);
  assert.equal(await verifyBuildPayload(workspace, true), sha);
});

test('missing dev package remains unavailable while release requires it', async () => {
  const workspace = await workspaceFixture('0'.repeat(64));
  assert.equal(await verifyBuildPayload(workspace, false), null);
  await assert.rejects(verifyBuildPayload(workspace, true), /missing|ENOENT/i);
});

test('an empty fixed resource directory is unavailable in dev and rejected in release', async () => {
  const workspace = await workspaceFixture('0'.repeat(64));
  await mkdir(join(workspace, 'src-tauri/binaries/winsearch'), {recursive: true});
  assert.equal(await verifyBuildPayload(workspace, false), null);
  await assert.rejects(verifyBuildPayload(workspace, true), /missing/i);
});

test('rejects a reparse staging parent even when the engine directory is absent', async () => {
  const workspace = await workspaceFixture('0'.repeat(64));
  const outside = await temporary('lumen-winsearch-parent-');
  await symlink(outside, join(workspace, 'src-tauri/binaries'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyBuildPayload(workspace, false), /link|reparse/i);
});

test('a corrupt staged worker fails both dev and release verification', async () => {
  const source = await fixture();
  const workspace = await workspaceFixture(digest(await readFile(join(source.root, 'payload.json'))));
  await stagePayload(workspace, source.root);
  await writeFile(join(workspace, 'src-tauri/binaries/winsearch/winsearch-extract.exe'), 'corrupt');
  await assert.rejects(verifyBuildPayload(workspace, false), /hash|size/i);
  await assert.rejects(verifyBuildPayload(workspace, true), /hash|size/i);
});

test('restores the previous package when verification after publication fails', async () => {
  const source = await fixture();
  const sha = digest(await readFile(join(source.root, 'payload.json')));
  const workspace = await workspaceFixture(sha);
  await stagePayload(workspace, source.root);
  const worker = join(workspace, 'src-tauri/binaries/winsearch/winsearchd.exe');
  const original = (await stat(worker)).ino;
  const originalRead = fs.readFile;
  let lockReads = 0;
  const fault = mock.method(fs, 'readFile', async (path, ...args) => {
    if (String(path).endsWith('winsearch-payload.lock.json') && ++lockReads === 2) throw new Error('publication verification failed');
    return originalRead(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(stagePayload(workspace, source.root), /publication verification failed/);
    assert.equal((await stat(worker)).ino, original);
  } finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await verifyBuildPayload(workspace, true), sha);
  assert.deepEqual(await readdir(join(workspace, 'src-tauri/binaries')), ['winsearch']);
});

test('handles an empty destination recreated by a concurrent development build', async () => {
  const source = await fixture();
  const sha = digest(await readFile(join(source.root, 'payload.json')));
  const workspace = await workspaceFixture(sha);
  await stagePayload(workspace, source.root);
  const destination = join(workspace, 'src-tauri/binaries/winsearch');
  const originalRename = fs.rename;
  const builder = mock.method(fs, 'rename', async (from, to) => {
    await originalRename(from, to);
    if (from === destination) await mkdir(destination);
  });
  syncBuiltinESMExports();
  try { await stagePayload(workspace, source.root); }
  finally { builder.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await verifyBuildPayload(workspace, true), sha);
});

test('recovers an abandoned previous package and removes only dead staging candidates', async () => {
  const source = await fixture();
  const sha = digest(await readFile(join(source.root, 'payload.json')));
  const workspace = await workspaceFixture(sha);
  await stagePayload(workspace, source.root);
  const parent = join(workspace, 'src-tauri/binaries');
  const deadPid = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout);
  const abandoned = join(parent, `.winsearch-${deadPid}-crashed`);
  await fs.rename(join(parent, 'winsearch'), `${abandoned}-previous`);
  await mkdir(abandoned);
  await writeFile(join(abandoned, 'partial.dll'), 'interrupted copy');
  const live = `.winsearch-${process.pid}-active`;
  await mkdir(join(parent, live));
  await stagePayload(workspace, source.root);
  assert.equal(await verifyBuildPayload(workspace, true), sha);
  assert.deepEqual((await readdir(parent)).sort(), [live, 'winsearch'].sort());
});

test('rejects a changed vendored archive before extraction', async () => {
  const workspace = await workspaceFixture('0'.repeat(64));
  const archive = join(workspace,'changed.tar.gz');
  await writeFile(archive,'untrusted archive');
  await assert.rejects(stageVendoredPayload(workspace,archive), /checksum|size/i);
  assert.deepEqual((await readdir(workspace)).sort(), ['changed.tar.gz','src-tauri']);
});

test('an interrupted upgrade retains the older backup until the new pinned package is published', async () => {
  const source = await fixture();
  const workspace = await workspaceFixture(digest(await readFile(join(source.root,'payload.json'))));
  await stagePayload(workspace,source.root);
  const parent = join(workspace,'src-tauri/binaries');
  const deadPid = Number(spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))']).stdout);
  const previous = join(parent,`.winsearch-${deadPid}-upgrade-previous`);
  await fs.rename(join(parent,'winsearch'),previous);
  const upgraded = 'verified upgraded worker';
  await writeFile(join(source.root,'winsearchd.exe'),upgraded);
  Object.assign(source.manifest.files.find(file => file.path === 'winsearchd.exe'),{sha256:digest(upgraded),sizeBytes:Buffer.byteLength(upgraded)});
  await save(source);
  const sha = digest(await readFile(join(source.root,'payload.json')));
  const lockPath = join(workspace,'src-tauri/winsearch-payload.lock.json');
  const lock = JSON.parse(await readFile(lockPath,'utf8'));
  await writeFile(lockPath,JSON.stringify({...lock,manifestSha256:sha}));
  assert.equal(await readFile(join(previous,'winsearchd.exe'),'utf8'),'winsearchd.exe');
  const originalRead = fs.readFile;
  let lockReads = 0;
  const fault = mock.method(fs,'readFile',async (path,...args) => {
    if (path === lockPath && ++lockReads === 2) throw new Error('new publication refused');
    return originalRead(path,...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(stagePayload(workspace,source.root),/new publication refused/); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await readFile(join(previous,'winsearchd.exe'),'utf8'),'winsearchd.exe');
  assert.equal(await stagePayload(workspace,source.root),sha);
  assert.equal(await verifyBuildPayload(workspace,true),sha);
  assert.equal(await readFile(join(parent,'winsearch/winsearchd.exe'),'utf8'),upgraded);
  assert.deepEqual(await readdir(parent),['winsearch']);
});

test('a fresh checkout stages the actual model-free vendored package against the independent lock', async () => {
  const lock = JSON.parse(await readFile(new URL('../src-tauri/winsearch-payload.lock.json',import.meta.url),'utf8'));
  const workspace = await workspaceFixture(lock.manifestSha256);
  assert.equal(await stageVendoredPayload(workspace),lock.manifestSha256);
  assert.equal(await verifyBuildPayload(workspace,true),lock.manifestSha256);
  assert.deepEqual(await readdir(join(workspace,'src-tauri/binaries')), ['winsearch']);
});

test('extracts the exact verified archive bytes even if its source path changes afterward', async () => {
  const lock = JSON.parse(await readFile(new URL('../src-tauri/winsearch-payload.lock.json',import.meta.url),'utf8'));
  const workspace = await workspaceFixture(lock.manifestSha256);
  const archive = join(workspace,'input.tar.gz');
  await fs.copyFile(new URL('../vendor/winsearch/winsearch-85a915d.tar.gz',import.meta.url),archive);
  const originalRead = fs.readFile;
  const replacement = mock.method(fs,'readFile',async (path,...args) => {
    const bytes = await originalRead(path,...args);
    if (path === archive) await writeFile(archive,'replaced after the verified read');
    return bytes;
  });
  syncBuiltinESMExports();
  try { assert.equal(await stageVendoredPayload(workspace,archive),lock.manifestSha256); }
  finally { replacement.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await verifyBuildPayload(workspace,true),lock.manifestSha256);
});
