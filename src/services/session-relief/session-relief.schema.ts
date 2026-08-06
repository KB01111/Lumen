import {z} from 'zod';

const count = z.number().int().nonnegative();
const cpu = z.number().finite().nonnegative();
const pressureLevel = z.enum(['normal', 'elevated', 'high']);
const boundedText = z.string().min(1).max(512);

export const processCategorySchema = z.enum(['aiAssistant', 'browser', 'container', 'editor', 'electron', 'network', 'node', 'rustBuild', 'other']);
export const signalKindSchema = z.enum(['memory', 'cpu', 'multiplicity', 'longevity', 'detachment']);
export const findingSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const findingConfidenceSchema = z.enum(['medium', 'high']);

export const sessionReliefReportSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: count,
  collectionDurationMs: count,
  system: z.object({
    memoryTotalBytes: count,
    memoryUsedBytes: count,
    memoryAvailableBytes: count,
    commitUsedBytes: count.nullable(),
    commitLimitBytes: count.nullable(),
    processCount: count,
    uptimeSeconds: count,
    sampledCpuPercent: cpu,
    systemDriveFreeBytes: count.nullable(),
    pressure: pressureLevel,
  }),
  families: z.array(z.object({
    name: boundedText,
    category: processCategorySchema,
    processCount: count,
    totalMemoryBytes: count,
    totalCpuPercent: cpu,
    oldestAgeSeconds: count,
    rootCount: count,
    detachedCount: count,
    signal: signalKindSchema,
    pressure: pressureLevel,
  })).max(4_096),
  trees: z.array(z.object({
    rootPid: count,
    nodeCount: count,
    totalMemoryBytes: count,
    totalCpuPercent: cpu,
    nodes: z.array(z.object({
      pid: count,
      parentPid: count.nullable(),
      name: boundedText,
      ageSeconds: count,
      cpuPercent: cpu,
      memoryBytes: count,
      childPids: z.array(count).max(10_000),
      detached: z.boolean(),
    })).max(10_000),
  })).max(4_096),
  findings: z.array(z.object({
    code: boundedText,
    severity: findingSeveritySchema,
    confidence: findingConfidenceSchema,
    title: boundedText,
    evidence: boundedText,
    guidance: boundedText,
  })).max(256),
  coverage: z.object({
    observedProcesses: count,
    skippedProcesses: count,
    transientProcesses: count,
  }),
  warnings: z.array(z.object({code: boundedText, message: boundedText})).max(256),
});

export type SessionReliefReport = z.infer<typeof sessionReliefReportSchema>;
