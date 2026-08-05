import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

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

async function buildId() {
  const hash = createHash('sha256');
  for (const input of inputs) {
    hash.update(input);
    hash.update(await readFile(join(workerRoot, input)));
  }
  return hash.digest('hex');
}

async function ensureVirtualEnvironment() {
  if ((await stat(virtualPython).catch(() => undefined))?.isFile()) return;
  const configuredPython = process.env.LUMEN_PYTHON?.trim();
  if (configuredPython) {
    run([configuredPython, '-m', 'venv', virtualEnvironment], workerRoot);
    return;
  }
  const managedPython = Bun.spawnSync({
    cmd: ['uv', 'python', 'find', '3.11'],
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const managedPath = managedPython.success ? managedPython.stdout.toString().trim() : '';
  run([managedPath || 'python', '-m', 'venv', virtualEnvironment], workerRoot);
}

export async function stageComputerUse() {
  const expectedBuildId = await buildId();
  const existingBuildId = await readFile(buildIdPath, 'utf8').catch(() => '');
  if (
    existingBuildId === expectedBuildId
    && (await stat(output).catch(() => undefined))?.isFile()
  ) {
    console.log('Gemini Computer Use sidecar is already staged.');
    return;
  }

  await ensureVirtualEnvironment();
  run([
    virtualPython,
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '-r',
    join(workerRoot, 'requirements.lock'),
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
  await writeFile(buildIdPath, expectedBuildId);
  console.log('Staged the Gemini Computer Use worker for Microsoft Edge.');
}

if (import.meta.main) {
  await stageComputerUse();
}
