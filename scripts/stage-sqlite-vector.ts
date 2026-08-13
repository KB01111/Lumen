import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const expectedSha256 = '58ac4a99ff6904fd709f01b366cf0477c405b5bda45b96cf00e13d500aa60c6a';
const source = join(
  import.meta.dirname,
  '..',
  'node_modules',
  '@sqliteai',
  'sqlite-vector-win32-x86_64',
  'vector.dll',
);
const destination = join(import.meta.dirname, '..', 'src-tauri', 'binaries', 'vector.dll');

export async function stageSqliteVector() {
  const actualSha256 = createHash('sha256').update(await readFile(source)).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`sqlite-vector checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }

  await mkdir(dirname(destination), {recursive: true});
  await copyFile(source, destination);
  console.log(`Staged sqlite-vector 1.0.0 (${actualSha256}).`);
}

if (import.meta.main) {
  await stageSqliteVector();
}
