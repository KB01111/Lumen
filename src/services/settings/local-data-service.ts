import {invoke} from '@tauri-apps/api/core';

export interface HistoryStatus {
  entryCount: number;
  enabled: boolean;
}

export interface IndexDeletionResult {
  deletedFiles: number;
  deletedChunks: number;
}

export interface LocalDataService {
  setPreviewsEnabled(enabled: boolean): Promise<void>;
  getHistoryStatus(): Promise<HistoryStatus>;
  clearSearchHistory(): Promise<{entryCount: number}>;
  deleteIndexData(): Promise<IndexDeletionResult>;
  getNativeDiagnostics(): Promise<unknown>;
}

class BrowserLocalDataService implements LocalDataService {
  async setPreviewsEnabled() {}
  async getHistoryStatus() { return {entryCount: 0, enabled: true}; }
  async clearSearchHistory() { return {entryCount: 0}; }
  async deleteIndexData() { return {deletedFiles: 0, deletedChunks: 0}; }
  async getNativeDiagnostics() { return {runtime: 'browser-preview'}; }
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

  getNativeDiagnostics() {
    return invoke<unknown>('get_native_diagnostics');
  }
}

export function createLocalDataService(): LocalDataService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriLocalDataService()
    : new BrowserLocalDataService();
}
