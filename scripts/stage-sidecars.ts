import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

import {stageComputerUse} from './stage-computer-use';
import {stageSqliteVector} from './stage-sqlite-vector';

const version = 'v1.4.1';
const asset = 'agentgateway-windows-amd64.exe';
const expectedSha256 = '7fcdc2a51cb7ab7f5c4b5a21f9066b3704f30ec6895c386332871381fab84ab6';
const output = join(import.meta.dirname, '..', 'src-tauri', 'binaries', 'agentgateway-x86_64-pc-windows-msvc.exe');
const workerOutput = join(import.meta.dirname, '..', 'src-tauri', 'binaries', 'lumen-enrichment-x86_64-pc-windows-msvc.exe');
const rivetEngineOutput = join(import.meta.dirname, '..', 'src-tauri', 'binaries', 'lumen-rivet-engine-x86_64-pc-windows-msvc.exe');
const mingwRuntimeNames = ['libstdc++-6.dll', 'libgcc_s_seh-1.dll', 'libwinpthread-1.dll'] as const;
const debianRuntime = {
  file: 'gcc-mingw-w64-x86-64-posix-runtime_12.2.0-14+deb12u1+25.2+b1_amd64.deb',
  sha256: '27ecea7578d44dc4fdd34765e0b61d3d4e299b367ff16d41ddfdbacd92fb3568',
} as const;
const debianPthreadRuntime = {
  file: 'mingw-w64-x86-64-dev_10.0.0-3_all.deb',
  sha256: '6dc1360a4e643670c59b6056647af4ff9a3c254def43fc80e7922a25297fe7a1',
} as const;

async function digest(path: string) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function verifiedDownload(url: string, destination: string, expected: string) {
  if ((await stat(destination).catch(() => undefined))?.isFile() && await digest(destination) === expected) {
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Runtime download failed: HTTP ${response.status}`);
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
  const actual = await digest(destination);
  if (actual !== expected) {
    await rm(destination, {force: true});
    throw new Error(`Runtime checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  await mkdir(dirname(output), {recursive: true});
  try {
    if ((await stat(output)).isFile() && await digest(output) === expectedSha256) {
      console.log(`AgentGateway ${version} already staged and verified.`);
    } else {
      throw new Error('replace');
    }
  } catch {
    const temporary = `${output}.download`;
    await rm(temporary, {force: true});
    const response = await fetch(`https://github.com/agentgateway/agentgateway/releases/download/${version}/${asset}`);
    if (!response.ok) throw new Error(`AgentGateway download failed: HTTP ${response.status}`);
    await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
    const actualSha256 = await digest(temporary);
    if (actualSha256 !== expectedSha256) {
      await rm(temporary, {force: true});
      throw new Error(`AgentGateway checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`);
    }
    await rename(temporary, output);
    console.log(`Staged AgentGateway ${version} (${actualSha256}).`);
  }

  const build = await Bun.build({
    entrypoints: [join(import.meta.dirname, '..', 'workers', 'enrichment-worker.ts')],
    compile: {target: 'bun-windows-x64', outfile: workerOutput},
    minify: true,
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Could not compile the Rivet enrichment worker');
  }
  console.log('Staged the compiled Rivet enrichment worker.');
  await copyFile(
    join(import.meta.dirname, '..', 'node_modules', '@rivetkit', 'engine-cli-win32-x64', 'rivet-engine.exe'),
    rivetEngineOutput,
  );
  const runtimeStage = join(dirname(rivetEngineOutput), '.stage-mingw');
  await rm(runtimeStage, {recursive: true, force: true});
  await mkdir(runtimeStage, {recursive: true});
  const debianArchive = join(dirname(rivetEngineOutput), debianRuntime.file);
  await verifiedDownload(
    `https://deb.debian.org/debian/pool/main/g/gcc-mingw-w64/${debianRuntime.file.replaceAll('+', '%2B')}`,
    debianArchive,
    debianRuntime.sha256,
  );
  let extract = Bun.spawnSync(['tar', '-xf', debianArchive, '-C', runtimeStage]);
  if (!extract.success) throw new Error(`Could not extract ${debianRuntime.file}: ${extract.stderr.toString()}`);
  extract = Bun.spawnSync(['tar', '-xf', join(runtimeStage, 'data.tar.xz'), '-C', runtimeStage]);
  if (!extract.success) throw new Error(`Could not extract Debian runtime data: ${extract.stderr.toString()}`);

  const pthreadArchive = join(dirname(rivetEngineOutput), debianPthreadRuntime.file);
  await verifiedDownload(
    `https://deb.debian.org/debian/pool/main/m/mingw-w64/${debianPthreadRuntime.file}`,
    pthreadArchive,
    debianPthreadRuntime.sha256,
  );
  extract = Bun.spawnSync(['tar', '-xf', pthreadArchive, '-C', runtimeStage]);
  if (!extract.success) throw new Error(`Could not extract ${debianPthreadRuntime.file}: ${extract.stderr.toString()}`);
  extract = Bun.spawnSync(['tar', '-xf', join(runtimeStage, 'data.tar.xz'), '-C', runtimeStage]);
  if (!extract.success) throw new Error(`Could not extract Debian pthread data: ${extract.stderr.toString()}`);

  const runtimeSources = {
    'libstdc++-6.dll': join(runtimeStage, 'usr', 'lib', 'gcc', 'x86_64-w64-mingw32', '12-posix', 'libstdc++-6.dll'),
    'libgcc_s_seh-1.dll': join(runtimeStage, 'usr', 'lib', 'gcc', 'x86_64-w64-mingw32', '12-posix', 'libgcc_s_seh-1.dll'),
    'libwinpthread-1.dll': join(runtimeStage, 'usr', 'x86_64-w64-mingw32', 'lib', 'libwinpthread-1.dll'),
  } satisfies Record<(typeof mingwRuntimeNames)[number], string>;
  for (const name of mingwRuntimeNames) {
    const source = runtimeSources[name];
    if (!(await stat(source).catch(() => undefined))?.isFile()) {
      throw new Error(`Rivet's Windows engine runtime is missing ${name}`);
    }
    await copyFile(source, join(dirname(rivetEngineOutput), name));
  }
  await rm(runtimeStage, {recursive: true, force: true});
  console.log('Staged the Rivet 2.3.10 Windows engine.');
  await stageComputerUse();
  await stageSqliteVector();
  const requiredOutputs = [
    output,
    workerOutput,
    rivetEngineOutput,
    join(dirname(output), 'lumen-computer-use-x86_64-pc-windows-msvc.exe'),
    join(dirname(output), 'vector.dll'),
    ...mingwRuntimeNames.map((name) => join(dirname(output), name)),
  ];
  for (const required of requiredOutputs) {
    if (!(await stat(required).catch(() => undefined))?.isFile()) {
      throw new Error(`Required packaged runtime is missing: ${required}`);
    }
  }
  console.log(`Verified ${requiredOutputs.length} packaged runtime files.`);
}

await main();
