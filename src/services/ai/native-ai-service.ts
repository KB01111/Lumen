import {invoke} from '@tauri-apps/api/core';

import type {RuntimeMode} from '../answer/answer.types';

export interface GatewayHealth {
  state: 'ready' | 'unavailable';
  version: string;
  interactivePort: number;
  enrichmentPort: number;
  adminPort: number;
  cloudCredentialConfigured: boolean;
  detail?: string;
}

export interface RuntimeComponent {
  installed: boolean;
  version?: string;
  requiredVersion: string;
  state: 'ready' | 'missing' | 'update-required';
}

export interface LocalRuntimeHealth {
  profile: 'laptop-amd-npu' | 'desktop-nvidia-cuda' | 'generic-local';
  state: 'ready' | 'stopped' | 'update-required';
  accelerator: string;
  answerModel: string;
  embeddingModel: string;
  transcriptionModel: string;
  baseUrl: string;
  lemonade: RuntimeComponent;
  flm: RuntimeComponent;
  mistralRs: RuntimeComponent;
  detail?: string;
}

export interface EnrichmentHealth {
  state: 'ready' | 'unavailable';
  paused: boolean;
  controlPort: number;
  actorPort: number;
  detail?: string;
}

export interface IndexStatus {
  phase: string;
  indexedItems: number;
  queuedEnrichment: number;
  skippedItems: number;
  message: string;
}

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
  gatewayHealth: () => invoke<GatewayHealth>('gateway_health'),
  restartGateway: () => invoke<void>('restart_gateway'),
  credentialStatus: (provider: string) => invoke<boolean>('provider_credential_status', {provider}),
  saveCredential: (provider: string, credential: string) => invoke<void>('set_provider_credential', {provider, credential}),
  deleteCredential: (provider: string) => invoke<void>('delete_provider_credential', {provider}),
  localRuntimeHealth: () => invoke<LocalRuntimeHealth>('local_runtime_health'),
  setLocalRuntimeMode: (mode: RuntimeMode, keepWarm: boolean) => invoke<void>('set_local_runtime_mode', {mode, keepWarm}),
  enrichmentHealth: () => invoke<EnrichmentHealth>('enrichment_health'),
  pauseEnrichment: () => invoke<void>('pause_enrichment'),
  resumeEnrichment: () => invoke<void>('resume_enrichment'),
  restartEnrichment: () => invoke<void>('restart_enrichment'),
  indexStatus: () => invoke<IndexStatus>('get_index_status'),
  synchronizeRoots: (roots: IndexRootInput[]) => invoke<IndexStatus>('synchronize_index_roots', {roots}),
};
