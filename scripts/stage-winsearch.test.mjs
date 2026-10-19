import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {ENGINE_COMMIT, TARGET, REQUIRED_FILES, verifyPayload} from './lib/winsearch-payload.mjs';
import {stagePayload, verifyBuildPayload} from './stage-winsearch.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lumen-winsearch-fixture-'));
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
  const f = await fixture(); const other = await mkdtemp(join(tmpdir(), 'lumen-winsearch-outside-'));
  await symlink(other, join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyPayload(f.root), /link|reparse/i);
});

async function workspaceFixture(manifestSha256) {
  const root = await mkdtemp(join(tmpdir(), 'lumen-winsearch-stage-'));
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
  const outside = await mkdtemp(join(tmpdir(), 'lumen-winsearch-parent-'));
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
