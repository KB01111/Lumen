import {stat} from 'node:fs/promises';
import {join} from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const workerRoot = join(projectRoot, 'workers', 'computer-use-preview');
const virtualPython = join(workerRoot, '.venv', 'Scripts', 'python.exe');
const packagedWorker = join(
  projectRoot,
  'src-tauri',
  'binaries',
  'lumen-computer-use-x86_64-pc-windows-msvc.exe',
);
const PROBE_TIMEOUT_MS = 20_000;

async function requireFile(path: string, instruction: string) {
  if (!(await stat(path).catch(() => undefined))?.isFile()) {
    throw new Error(`${instruction} Missing file: ${path}`);
  }
}

function run(label: string, command: string[], cwd = projectRoot) {
  const result = Bun.spawnSync({
    cmd: command,
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
    timeout: PROBE_TIMEOUT_MS,
  });
  if (!result.success) {
    throw new Error(
      `${label} failed or exceeded ${PROBE_TIMEOUT_MS / 1_000} seconds `
      + `(exit ${result.exitCode ?? 'unknown'}, signal ${result.signalCode ?? 'none'}).`,
    );
  }
}

export async function testComputerUseWorker() {
  await requireFile(virtualPython, 'Run `bun run stage:computer-use` first.');
  run(
    'Computer Use Python tests',
    [virtualPython, '-m', 'unittest', 'test_worker.py'],
    workerRoot,
  );
}

export async function verifyComputerUseSourceHealth() {
  await requireFile(virtualPython, 'Run `bun run stage:computer-use` first.');
  run('Computer Use source health probe', [virtualPython, 'worker.py', '--health'], workerRoot);
}

export async function verifyComputerUsePackagedHealth() {
  await requireFile(packagedWorker, 'Run `bun run stage:computer-use` first.');
  run('Computer Use packaged health probe', [packagedWorker, '--health']);
}

if (import.meta.main) {
  const gate = process.argv[2] ?? 'all';
  if (gate === 'tests' || gate === 'all') await testComputerUseWorker();
  if (gate === 'source-health' || gate === 'all') await verifyComputerUseSourceHealth();
  if (gate === 'packaged-health' || gate === 'all') await verifyComputerUsePackagedHealth();
  if (!['all', 'tests', 'source-health', 'packaged-health'].includes(gate)) {
    throw new Error(`Unknown Computer Use verification gate: ${gate}`);
  }
}
