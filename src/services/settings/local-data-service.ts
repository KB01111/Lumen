import {invoke} from '@tauri-apps/api/core';
import {z} from 'zod';

export const nativeDiagnosticsSchema = z.object({
  appVersion: z.string().min(1).max(64),
  index: z.object({
    phase: z.string().min(1).max(32),
    schemaVersion: z.number().int().nonnegative(),
    indexedFiles: z.number().int().nonnegative(),
    indexedChunks: z.number().int().nonnegative(),
    historyEntries: z.number().int().nonnegative(),
    historyEnabled: z.boolean(),
  }),
  vector: z.object({
    available: z.boolean(),
    version: z.string().max(64).nullable(),
    backend: z.string().max(64).nullable(),
    lastError: z.string().max(256).nullable(),
  }),
  activity: z.object({
    mode: z.enum(['indexing', 'gaming', 'fullscreen', 'cinema', 'battery', 'user']),
    backgroundPolicy: z.enum(['normal', 'metadataOnly', 'paused']),
    fullscreen: z.boolean(),
    onBattery: z.boolean(),
  }),
  gateway: z.object({
    state: z.enum(['ready', 'unavailable']),
    version: z.string().min(1).max(64),
    cloudCredentialConfigured: z.boolean(),
  }),
  mcp: z.object({
    services: z.number().int().nonnegative(),
    tools: z.number().int().nonnegative(),
    allowed: z.number().int().nonnegative(),
    ask: z.number().int().nonnegative(),
    denied: z.number().int().nonnegative(),
  }),
  runtime: z.object({
    state: z.enum(['ready', 'stopped', 'update-required']),
    profile: z.enum(['laptop-amd-npu', 'desktop-nvidia-cuda', 'generic-local']),
    lemonadeVersion: z.string().max(64).nullable(),
    requiredLemonadeVersion: z.string().min(1).max(64),
    answerModel: z.string().min(1).max(256),
    embeddingModel: z.string().min(1).max(256),
  }),
  provisioning: z.object({
    state: z.enum(['missing', 'working', 'ready', 'updateAvailable', 'failed', 'cancelled']),
    version: z.string().min(1).max(128),
    installedVersion: z.string().max(128).nullable(),
    progress: z.number().int().min(0).max(100),
  }),
  providers: z.object({
    routes: z.number().int().nonnegative(),
    localRoutes: z.number().int().nonnegative(),
    cloudRoutes: z.number().int().nonnegative(),
  }),
  shortcut: z.object({
    registered: z.boolean(),
    accelerator: z.string().max(64).nullable(),
    errorCode: z.string().max(64).nullable(),
  }),
  timings: z.array(z.object({
    name: z.string().min(1).max(64),
    durationMs: z.number().int().nonnegative(),
  })).max(16),
  logs: z.array(z.object({
    component: z.string().min(1).max(32),
    state: z.string().min(1).max(64),
  })).max(16),
});

export type NativeDiagnostics = z.infer<typeof nativeDiagnosticsSchema>;

export interface HistoryStatus {
  entryCount: number;
  enabled: boolean;
}

export interface IndexDeletionResult {
  deletedFiles: number;
  deletedChunks: number;
}

export interface DiagnosticsExportResult {
  saved: boolean;
  fileName?: string;
}

export interface LocalDataService {
  setPreviewsEnabled(enabled: boolean): Promise<void>;
  getHistoryStatus(): Promise<HistoryStatus>;
  clearSearchHistory(): Promise<{entryCount: number}>;
  deleteIndexData(): Promise<IndexDeletionResult>;
  getNativeDiagnostics(): Promise<NativeDiagnostics>;
  exportDiagnostics(contents: string): Promise<DiagnosticsExportResult>;
}

class BrowserLocalDataService implements LocalDataService {
  async setPreviewsEnabled() {}
  async getHistoryStatus() { return {entryCount: 0, enabled: true}; }
  async clearSearchHistory() { return {entryCount: 0}; }
  async deleteIndexData() { return {deletedFiles: 0, deletedChunks: 0}; }
  async getNativeDiagnostics() {
    return nativeDiagnosticsSchema.parse({
      appVersion: 'browser-preview',
      index: {phase: 'ready', schemaVersion: 3, indexedFiles: 0, indexedChunks: 0, historyEntries: 0, historyEnabled: true},
      vector: {available: false, version: null, backend: null, lastError: null},
      activity: {mode: 'indexing', backgroundPolicy: 'normal', fullscreen: false, onBattery: false},
      gateway: {state: 'unavailable', version: 'browser-preview', cloudCredentialConfigured: false},
      mcp: {services: 0, tools: 0, allowed: 0, ask: 0, denied: 0},
      runtime: {state: 'update-required', profile: 'generic-local', lemonadeVersion: null, requiredLemonadeVersion: '11.5.2', answerModel: 'Qwen 3.5 4B', embeddingModel: 'Nomic Embed Text v1'},
      provisioning: {state: 'missing', version: '11.5.2', installedVersion: null, progress: 0},
      providers: {routes: 0, localRoutes: 0, cloudRoutes: 0},
      shortcut: {registered: false, accelerator: null, errorCode: 'browser-runtime'},
      timings: [{name: 'native-diagnostics', durationMs: 0}],
      logs: [{component: 'runtime', state: 'browser'}],
    });
  }
  async exportDiagnostics(contents: string) {
    const blob = new Blob([contents], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'lumen-diagnostics.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    return {saved: true, fileName: link.download};
  }
}

class TauriLocalDataService implements LocalDataService {
  async setPreviewsEnabled(enabled: boolean) {
    await invoke('set_previews_enabled', {enabled});
  }

  getHistoryStatus() {
    return invoke<HistoryStatus>('get_search_history_status');
  }

  clearSearchHistory() {
    return invoke<{entryCount: number}>('clear_search_history');
  }

  deleteIndexData() {
    return invoke<IndexDeletionResult>('delete_index_data');
  }

  async getNativeDiagnostics() {
    return nativeDiagnosticsSchema.parse(await invoke<unknown>('get_native_diagnostics'));
  }

  exportDiagnostics(contents: string) {
    return invoke<DiagnosticsExportResult>('export_diagnostics', {contents});
  }
}

export function createLocalDataService(): LocalDataService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriLocalDataService()
    : new BrowserLocalDataService();
}
