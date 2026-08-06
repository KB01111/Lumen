import {invoke} from '@tauri-apps/api/core';
import {z} from 'zod';

import type {RuntimeMode} from '../answer/answer.types';

const portSchema = z.number().int().min(1).max(65_535);
const optionalNonemptyStringSchema = z.preprocess(
  (value) => value === null ? undefined : value,
  z.string().min(1).optional(),
);

export const gatewayHealthSchema = z.object({
  state: z.enum(['ready', 'unavailable']),
  version: z.string().min(1),
  interactivePort: portSchema,
  enrichmentPort: portSchema,
  adminPort: portSchema,
  cloudCredentialConfigured: z.boolean(),
  detail: optionalNonemptyStringSchema,
});
export type GatewayHealth = z.infer<typeof gatewayHealthSchema>;

export const runtimeComponentSchema = z.object({
  installed: z.boolean(),
  version: optionalNonemptyStringSchema,
  requiredVersion: z.string().min(1),
  state: z.enum(['ready', 'missing', 'update-required']),
});
export type RuntimeComponent = z.infer<typeof runtimeComponentSchema>;

export const localRuntimeHealthSchema = z.object({
  profile: z.enum(['laptop-amd-npu', 'desktop-nvidia-cuda', 'generic-local']),
  state: z.enum(['ready', 'stopped', 'update-required']),
  accelerator: z.string().min(1),
  answerModel: z.string().min(1),
  embeddingModel: z.string().min(1),
  transcriptionModel: z.string().min(1),
  baseUrl: z.string().url(),
  lemonade: runtimeComponentSchema,
  flm: runtimeComponentSchema,
  mistralRs: runtimeComponentSchema,
  detail: optionalNonemptyStringSchema,
});
export type LocalRuntimeHealth = z.infer<typeof localRuntimeHealthSchema>;

export const enrichmentHealthSchema = z.object({
  state: z.enum(['ready', 'unavailable']),
  processorState: z.enum(['ready', 'unavailable']),
  coordinatorState: z.enum(['ready', 'unavailable']),
  paused: z.boolean(),
  controlPort: portSchema,
  actorPort: portSchema,
  detail: optionalNonemptyStringSchema,
  processorDetail: optionalNonemptyStringSchema,
  coordinatorDetail: optionalNonemptyStringSchema,
});
export type EnrichmentHealth = z.infer<typeof enrichmentHealthSchema>;

export const indexStatusSchema = z.object({
  phase: z.enum(['ready', 'indexing', 'degraded']),
  indexedItems: z.number().int().nonnegative(),
  queuedEnrichment: z.number().int().nonnegative(),
  skippedItems: z.number().int().nonnegative(),
  message: z.string().min(1),
});
export type IndexStatus = z.infer<typeof indexStatusSchema>;

export interface IndexRootInput {
  path: string;
  cloudEnrichment: boolean;
  exclusions: string[];
  includeHidden: boolean;
  maxFileSizeMb: number;
}

export function isNativeRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const nativeAiService = {
  gatewayHealth: () => invoke<unknown>('gateway_health').then(gatewayHealthSchema.parse),
  restartGateway: () => invoke<void>('restart_gateway'),
  credentialStatus: (provider: string) => invoke<unknown>('provider_credential_status', {provider}).then(z.boolean().parse),
  saveCredential: (provider: string, credential: string) => invoke<void>('set_provider_credential', {provider, credential}),
  deleteCredential: (provider: string) => invoke<void>('delete_provider_credential', {provider}),
  cancelCloudAnswers: () => invoke<void>('cancel_cloud_answers'),
  localRuntimeHealth: () => invoke<unknown>('local_runtime_health').then(localRuntimeHealthSchema.parse),
  setLocalRuntimeMode: (mode: RuntimeMode, keepWarm: boolean) => invoke<void>('set_local_runtime_mode', {mode, keepWarm}),
  enrichmentHealth: () => invoke<unknown>('enrichment_health').then(enrichmentHealthSchema.parse),
  pauseEnrichment: () => invoke<void>('pause_enrichment'),
  resumeEnrichment: () => invoke<void>('resume_enrichment'),
  restartEnrichment: () => invoke<void>('restart_enrichment'),
  indexStatus: () => invoke<unknown>('get_index_status').then(indexStatusSchema.parse),
  synchronizeRoots: (roots: IndexRootInput[]) => invoke<unknown>('synchronize_index_roots', {roots}).then(indexStatusSchema.parse),
  deleteIndex: () => invoke<unknown>('delete_index_data').then(indexStatusSchema.parse),
};
