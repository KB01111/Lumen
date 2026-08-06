import type {SessionReliefReport} from './session-relief.schema';

export function makeSessionReliefReport(overrides: Partial<SessionReliefReport> = {}): SessionReliefReport {
  return {
    schemaVersion: 1,
    capturedAt: 1_786_000_000_000,
    collectionDurationMs: 350,
    system: {
      memoryTotalBytes: 16 * 1024 ** 3,
      memoryUsedBytes: 12 * 1024 ** 3,
      memoryAvailableBytes: 4 * 1024 ** 3,
      commitUsedBytes: 13 * 1024 ** 3,
      commitLimitBytes: 20 * 1024 ** 3,
      processCount: 4,
      uptimeSeconds: 7_200,
      sampledCpuPercent: 42,
      systemDriveFreeBytes: 60 * 1024 ** 3,
      pressure: 'elevated',
    },
    families: [{name: 'cline.exe', category: 'aiAssistant', processCount: 2, totalMemoryBytes: 2 * 1024 ** 3, totalCpuPercent: 25, oldestAgeSeconds: 7_200, rootCount: 1, detachedCount: 0, signal: 'memory', pressure: 'elevated'}, {name: 'node.exe', category: 'node', processCount: 2, totalMemoryBytes: 512 * 1024 ** 2, totalCpuPercent: 15, oldestAgeSeconds: 3_600, rootCount: 1, detachedCount: 1, signal: 'detachment', pressure: 'normal'}],
    trees: [{rootPid: 4100, nodeCount: 2, totalMemoryBytes: 2 * 1024 ** 3, totalCpuPercent: 25, nodes: [{pid: 4100, parentPid: null, name: 'cline.exe', ageSeconds: 7_200, cpuPercent: 20, memoryBytes: 1536 * 1024 ** 2, childPids: [4101], detached: false}, {pid: 4101, parentPid: 4100, name: 'node.exe', ageSeconds: 3_600, cpuPercent: 5, memoryBytes: 512 * 1024 ** 2, childPids: [], detached: false}]}],
    findings: [{code: 'memory-pressure', severity: 'warning', confidence: 'high', title: 'Memory pressure', evidence: 'Physical memory use is elevated.', guidance: 'Review in Task Manager.'}],
    coverage: {observedProcesses: 4, skippedProcesses: 0, transientProcesses: 0},
    warnings: [{code: 'processes-skipped', message: 'Some processes were unavailable.'}],
    ...overrides,
  };
}
