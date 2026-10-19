import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, readdir, readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {TextDecoder} from 'node:util';

export const ENGINE_COMMIT = 'de3d18645dca3a47e4e5bbb6167c3165b7678093';
export const TARGET = 'x86_64-pc-windows-msvc';
export const REQUIRED_FILES = [
  'winsearchd.exe', 'winsearch-embed.exe', 'winsearch-extract.exe',
  'ggml-base.dll', 'ggml.dll', 'llama.dll', 'mtmd.dll', 'pdfium.dll',
  ...['alderlake', 'cannonlake', 'cascadelake', 'haswell', 'icelake', 'sandybridge', 'skylakex', 'sse42', 'x64'].map(cpu => `ggml-cpu-${cpu}.dll`),
  'ffmpeg.exe', 'ffprobe.exe', 'avcodec-63.dll', 'avdevice-63.dll', 'avfilter-12.dll',
  'avformat-63.dll', 'avutil-61.dll', 'swresample-7.dll', 'swscale-10.dll',
  'concrt140.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll',
  'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'vccorlib140.dll',
  'vcruntime140.dll', 'vcruntime140_1.dll', 'vcruntime140_threads.dll',
  'THIRD-PARTY-NOTICES.txt', 'notices/pdfium/LICENSE', 'notices/ffmpeg/LICENSE.txt',
  'notices/ffmpeg/COPYING.GPLv3', 'notices/ffmpeg/SOURCE-INSTRUCTIONS.md', 'notices/llama.cpp-LICENSE',
  'notices/code-grammars-LICENSES.txt', 'notices/DigUp-LICENSE.txt', 'notices/msvc/REDISTRIBUTION.md',
];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function assertNoLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Link/reparse path rejected: ${current}`);
    if (dirname(current) === current) break;
  }
}
export function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 ||
      path.split('/').some(part => !/^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe payload path: ${path}`);
  }
  return path;
}
export async function inventory(root, prefix = '', state = {count: 0}) {
  const paths = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    if (++state.count > 1024 || prefix.split('/').length > 32) throw new Error('Payload tree exceeds bound');
    const path = safePath(prefix + entry.name);
    const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw new Error(`Link/reparse rejected: ${path}`);
    if (info.isDirectory()) paths.push(...await inventory(root, path + '/', state));
    else if (info.isFile()) paths.push(path);
    else throw new Error(`Unexpected payload file: ${path}`);
  }
  return paths;
}
export async function verifyPayload(directory, expectedManifestSha256) {
  const root = resolve(directory);
  await assertNoLinks(root);
  const paths = await inventory(root);
  if ((await lstat(join(root, 'payload.json'))).size > 1024 * 1024) throw new Error('Payload manifest exceeds bound');
  const bytes = await readFile(join(root, 'payload.json'));
  if (bytes.byteLength > 1024 * 1024) throw new Error('Payload manifest exceeds bound');
  const manifestSha256 = digest(bytes);
  if (expectedManifestSha256 !== undefined && manifestSha256 !== expectedManifestSha256) throw new Error('Payload manifest hash mismatch');
  const manifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (manifest.schemaVersion !== 1 || manifest.target !== TARGET || !Array.isArray(manifest.files) || manifest.files.length > 512) throw new Error('Unsupported payload manifest schema/target');
  if (manifest.engineCommit !== ENGINE_COMMIT) throw new Error('Payload engine commit mismatch');
  const seen = new Set();
  for (const file of manifest.files) {
    safePath(file.path);
    const folded = file.path.toLowerCase();
    if (seen.has(folded)) throw new Error(`Duplicate/case alias payload path: ${file.path}`);
    seen.add(folded);
    if ((!REQUIRED_FILES.includes(file.path) && !file.path.startsWith('notices/pdfium/licenses/')) || /\.(gguf|db|sqlite|onnx|safetensors)$/i.test(file.path)) throw new Error(`Unexpected payload path: ${file.path}`);
    if (!/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 256 * 1024 * 1024) throw new Error('Invalid file hash/size');
  }
  for (const required of REQUIRED_FILES) if (!seen.has(required.toLowerCase())) throw new Error(`Missing required payload file: ${required}`);
  if (!manifest.files.some(file => file.path.startsWith('notices/pdfium/licenses/'))) throw new Error('Missing required PDFium dependency licenses');
  const declared = new Set(['payload.json', ...manifest.files.map(file => file.path)]);
  for (const path of paths) if (!declared.has(path)) throw new Error(`Unmanifested payload file: ${path}`);
  for (const file of manifest.files) {
    const path = join(root, file.path);
    if ((await lstat(path)).size !== file.sizeBytes) throw new Error(`Payload file size mismatch: ${file.path}`);
    const hash = createHash('sha256');
    let size = 0;
    for await (const bytes of createReadStream(path)) {
      size += bytes.byteLength;
      if (size > file.sizeBytes) throw new Error(`Payload file size mismatch: ${file.path}`);
      hash.update(bytes);
    }
    if (size !== file.sizeBytes || hash.digest('hex') !== file.sha256) throw new Error(`Payload file hash/size mismatch: ${file.path}`);
  }
  return {manifest, manifestSha256};
}
