import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

import {
  testComputerUseWorker,
  verifyComputerUsePackagedHealth,
  verifyComputerUseSourceHealth,
} from './verify-computer-use';

const projectRoot = join(import.meta.dirname, '..');
const workerRoot = join(projectRoot, 'workers', 'computer-use-preview');
const virtualEnvironment = join(workerRoot, '.venv');
const virtualPython = join(virtualEnvironment, 'Scripts', 'python.exe');
const buildRoot = join(workerRoot, '.build');
const buildIdPath = join(workerRoot, '.build-id');
const output = join(
  projectRoot,
  'src-tauri',
  'binaries',
  'lumen-computer-use-x86_64-pc-windows-msvc.exe',
);

interface BuildMetadata {
  inputDigest: string;
  outputDigest: string;
}

const inputs = [
  'worker.py',
  'requirements.txt',
  'requirements-build.txt',
  'requirements.lock',
  'upstream/agent.py',
  'upstream/computers/__init__.py',
  'upstream/computers/computer.py',
  'upstream/computers/playwright/__init__.py',
  'upstream/computers/playwright/playwright.py',
] as const;

function run(command: string[], cwd = projectRoot) {
  const result = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (!result.success) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`);
  }
}

function pythonVersion(binary: string) {
  const result = Bun.spawnSync({
    cmd: [binary, '-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: 10_000,
  });
  return result.success ? result.stdout.toString().trim() : '';
}

async function digest(path: string) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function readBuildMetadata(): Promise<BuildMetadata | undefined> {
  try {
    const parsed = JSON.parse(await readFile(buildIdPath, 'utf8')) as Partial<BuildMetadata>;
    return typeof parsed.inputDigest === 'string' && typeof parsed.outputDigest === 'string'
      ? {inputDigest: parsed.inputDigest, outputDigest: parsed.outputDigest}
      : undefined;
  } catch {
    return undefined;
  }
}

function lockUsesArtifactHashes(lock: string) {
  const blocks: string[] = [];
  let current = '';
  for (const line of lock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(line) && !trimmed.startsWith('--hash=')) {
      if (current) blocks.push(current);
      current = line;
    } else {
      current += `\n${line}`;
    }
  }
  if (current) blocks.push(current);
  return blocks.length > 0
    && blocks.every((requirement) => requirement.includes('--hash=sha256:'));
}

async function buildId() {
  const hash = createHash('sha256');
  hash.update('python=3.11');
  for (const input of inputs) {
    hash.update(input);
    hash.update(await readFile(join(workerRoot, input)));
  }
  return hash.digest('hex');
}

async function ensureVirtualEnvironment() {
  if (
    (await stat(virtualPython).catch(() => undefined))?.isFile()
    && pythonVersion(virtualPython) === '3.11'
  ) return;
  await rm(virtualEnvironment, {recursive: true, force: true});
  const configuredPython = process.env.LUMEN_PYTHON?.trim();
  const managedPython = configuredPython ? undefined : Bun.spawnSync({
      cmd: ['uv', 'python', 'find', '3.11'],
      stdout: 'pipe',
      stderr: 'ignore',
    });
  const managedPath = managedPython?.success ? managedPython.stdout.toString().trim() : '';
  const interpreter = configuredPython || managedPath || 'python';
  if (pythonVersion(interpreter) !== '3.11') {
    throw new Error('Computer Use staging requires Python 3.11');
  }
  run([interpreter, '-m', 'venv', virtualEnvironment], workerRoot);
}

export async function stageComputerUse() {
  await ensureVirtualEnvironment();
  const expectedInputDigest = await buildId();
  const existingBuild = await readBuildMetadata();
  const outputExists = (await stat(output).catch(() => undefined))?.isFile() === true;
  const outputDigest = outputExists ? await digest(output) : '';
  if (existingBuild?.inputDigest === expectedInputDigest && existingBuild.outputDigest === outputDigest) {
    console.log('Gemini Computer Use sidecar is already staged.');
  } else {
    const lockPath = join(workerRoot, 'requirements.lock');
    const lock = await readFile(lockPath, 'utf8');
    const hashed = lockUsesArtifactHashes(lock);
    if (!hashed) {
      console.warn(
        'Computer Use dependencies are version-pinned but not artifact-hashed. '
        + 'With network access, regenerate the lock using '
        + '`uv pip compile --generate-hashes --output-file requirements.lock requirements-build.txt`; '
        + 'do not enable --require-hashes until every resolved artifact has a recorded hash.',
      );
    }
    run([
      virtualPython,
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      ...(hashed ? ['--require-hashes'] : []),
      '-r',
      lockPath,
    ], workerRoot);
    await rm(buildRoot, {recursive: true, force: true});
    await mkdir(buildRoot, {recursive: true});
    await mkdir(join(projectRoot, 'src-tauri', 'binaries'), {recursive: true});
    run([
      virtualPython,
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onefile',
      '--name',
      'lumen-computer-use-x86_64-pc-windows-msvc',
      '--paths',
      join(workerRoot, 'upstream'),
      '--hidden-import',
      'agent',
      '--collect-all',
      'google.genai',
      '--collect-all',
      'playwright',
      '--distpath',
      join(projectRoot, 'src-tauri', 'binaries'),
      '--workpath',
      join(buildRoot, 'work'),
      '--specpath',
      buildRoot,
      join(workerRoot, 'worker.py'),
    ], workerRoot);
    await writeFile(buildIdPath, JSON.stringify({
      inputDigest: expectedInputDigest,
      outputDigest: await digest(output),
    } satisfies BuildMetadata));
    console.log('Staged the Gemini Computer Use worker for Microsoft Edge.');
  }
  await testComputerUseWorker();
  await verifyComputerUseSourceHealth();
  await verifyComputerUsePackagedHealth();
}

if (import.meta.main) {
  await stageComputerUse();
}
