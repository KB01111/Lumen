import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseDocument} from 'yaml';

interface Step {
  name: string;
  uses?: string;
  if?: string;
  shell?: string;
  run?: string;
  with?: Record<string, string | boolean>;
  'continue-on-error'?: boolean;
}

interface Workflow {
  on: Record<string, {branches?: string[]; cron?: string}[] | {branches: string[]} | null>;
  permissions: Record<string, string>;
  concurrency: {group: string; 'cancel-in-progress': boolean};
  jobs: {
    analyze: {
      'runs-on': string;
      'timeout-minutes': number;
      permissions: Record<string, string>;
      strategy: {
        'fail-fast': boolean;
        matrix: {include: {language: string; 'build-mode': string}[]};
      };
      steps: Step[];
      'continue-on-error'?: boolean;
    };
  };
}

// Exercise the checked-in workflow, rather than a copied fixture. YAML 1.2
// preserves GitHub's `on` key and parseDocument reports duplicate keys.
const projectRoot = resolve(import.meta.dirname, '..');
const document = parseDocument(readFileSync(resolve(projectRoot, '.github/workflows/codeql.yml'), 'utf8'));
const workflow = document.toJS() as Workflow;
const job = workflow.jobs.analyze;
const matrix = job.strategy.matrix.include;

function actionStep(action: string) {
  const step = job.steps.find(candidate => candidate.uses?.startsWith(`${action}@`));
  if (!step) throw new Error(`Missing workflow action: ${action}`);
  return step;
}

const checkout = actionStep('actions/checkout');
const setupDotnet = actionStep('actions/setup-dotnet');
const initialize = actionStep('github/codeql-action/init');
const analyze = actionStep('github/codeql-action/analyze');
const build = job.steps.find(step => /\bdotnet\s+build\b/.test(step.run ?? ''));
if (!build?.run) throw new Error('Missing C# build script');
const buildScript = build.run;
const buildLines = buildScript.split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));
const commands = buildLines.filter(line => line.startsWith('dotnet '));

describe('CodeQL workflow', () => {
  it('is valid YAML without duplicate keys', () => {
    expect(document.errors).toEqual([]);
  });

  it('scans main pull requests and pushes, with weekly and manual entry points', () => {
    expect(workflow.on.pull_request).toEqual({branches: ['main']});
    expect(workflow.on.push).toEqual({branches: ['main']});
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.on.schedule).toEqual([{cron: expect.stringMatching(/^([0-5]?\d) ([01]?\d|2[0-3]) \* \* [0-6]$/)}]);
    expect(workflow.on).not.toHaveProperty('pull_request_target');
  });

  it('cancels superseded scans without sharing a concurrency group across events or refs', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(true);
    for (const context of ['github.workflow', 'github.event_name', 'github.ref']) {
      expect(workflow.concurrency.group).toContain(`\${{ ${context} }}`);
    }
  });

  it('grants SARIF upload permissions to analysis and keeps checkout credentials out of git', () => {
    expect(workflow.permissions).toEqual({contents: 'read'});
    expect(job.permissions).toEqual({contents: 'read', 'security-events': 'write', actions: 'read'});
    expect(checkout.with?.['persist-credentials']).toBe(false);
  });

  it('retains every scan language exactly once', () => {
    expect(matrix.map(entry => entry.language).sort()).toEqual([
      'actions', 'csharp', 'javascript-typescript', 'python', 'rust',
    ]);
  });

  it.each([
    ['actions', 'none'],
    ['javascript-typescript', 'none'],
    ['python', 'none'],
    ['rust', 'none'],
    ['csharp', 'manual'],
  ])('uses %s analysis with build mode %s', (language, mode) => {
    expect(matrix.find(entry => entry.language === language)?.['build-mode']).toBe(mode);
  });

  it('initializes CodeQL from each matrix entry and separates its uploaded results by language', () => {
    expect(initialize.with?.languages).toBe('${{ matrix.language }}');
    expect(initialize.with?.['build-mode']).toBe('${{ matrix.build-mode }}');
    expect(analyze.with?.category).toBe('/language:${{ matrix.language }}');
    expect(initialize.if).toBeUndefined();
    expect(analyze.if).toBeUndefined();
  });

  it('uses Windows and the .NET SDK required by the helper', () => {
    expect(job['runs-on']).toMatch(/^windows-/);
    expect(setupDotnet.with?.['dotnet-version']).toBe('10.0.x');
    expect(build.shell).toBe('pwsh');
  });

  it('excludes .NET setup and compilation from every non-C# scan', () => {
    expect(setupDotnet.if).toBe("matrix.language == 'csharp'");
    expect(build.if).toBe("matrix.language == 'csharp'");
    expect(job.steps.filter(step => step.run)).toEqual([build]);
    expect(job.steps.some(step => step.uses?.startsWith('github/codeql-action/autobuild@'))).toBe(false);
  });

  it('checks out and installs the SDK before initialization, then compiles before analysis', () => {
    const positions = [checkout, setupDotnet, initialize, build, analyze].map(step => job.steps.indexOf(step));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('keeps language failures independent and does not suppress build or analysis errors', () => {
    expect(job.strategy['fail-fast']).toBe(false);
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(job['timeout-minutes']).toBeLessThanOrEqual(60);
    expect(job['continue-on-error'] ?? false).toBe(false);
    for (const step of job.steps) {
      expect(step['continue-on-error'] ?? false, step.name).toBe(false);
    }
  });
});

describe('CodeQL C# manual build', () => {
  it('targets the checked-in helper, test project and NuGet configuration', () => {
    expect(buildScript).toMatch(/\$worker\s*=\s*'workers\/windows-ai'/);
    expect(buildScript).toMatch(/\$project\s*=\s*"\$worker\/Lumen\.WindowsAi\.csproj"/);
    for (const path of ['Lumen.WindowsAi.csproj', 'Tests/Lumen.WindowsAi.Tests.csproj', 'nuget.config', 'packages.win-x64.lock.json']) {
      expect(readFileSync(resolve(projectRoot, 'workers/windows-ai', path), 'utf8').length).toBeGreaterThan(0);
    }
  });

  it('restores locked Windows x64 dependencies before building either project', () => {
    expect(commands.map(command => command.split(/\s+/)[1])).toEqual(['restore', 'build', 'build']);
    expect(commands[0].split(/\s+/)).toEqual(expect.arrayContaining([
      '$project', '-r', 'win-x64', '-p:RuntimeIdentifier=win-x64',
      '--configfile', '"$worker/nuget.config"', '--locked-mode',
    ]));
  });

  it('reuses the locked restore and forces a fresh Release compilation of the helper', () => {
    const args = commands[1].split(/\s+/);
    expect(args).toEqual(expect.arrayContaining([
      '$project', '-c', 'Release', '-r', 'win-x64', '--no-restore',
      '--no-incremental', '-p:UseSharedCompilation=false',
    ]));
  });

  it('compiles the linked Core sources in the test project with its own restore', () => {
    const args = commands[2].split(/\s+/);
    expect(args).toEqual(expect.arrayContaining([
      '"$worker/Tests/Lumen.WindowsAi.Tests.csproj"', '-c', 'Release',
      '--no-incremental', '-p:UseSharedCompilation=false',
    ]));
    // The helper restore does not restore the separate test project.
    expect(args).not.toContain('--no-restore');
  });

  it.each([0, 1, 2])('propagates a native failure from dotnet command %i before continuing', index => {
    expect(buildLines[0]).toMatch(/^\$ErrorActionPreference\s*=\s*'Stop'$/);
    const commandIndex = buildLines.indexOf(commands[index]);
    // PowerShell ErrorActionPreference alone does not propagate native exit codes.
    expect(buildLines[commandIndex + 1]).toMatch(/^if\s*\(\$LASTEXITCODE\)\s*\{\s*exit\s+\$LASTEXITCODE\s*\}$/);
  });
});
