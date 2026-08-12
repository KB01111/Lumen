import {invoke} from '@tauri-apps/api/core';

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
  getNativeDiagnostics(): Promise<unknown>;
  exportDiagnostics(contents: string): Promise<DiagnosticsExportResult>;
}

class BrowserLocalDataService implements LocalDataService {
  async setPreviewsEnabled() {}
  async getHistoryStatus() { return {entryCount: 0, enabled: true}; }
  async clearSearchHistory() { return {entryCount: 0}; }
  async deleteIndexData() { return {deletedFiles: 0, deletedChunks: 0}; }
  async getNativeDiagnostics() { return {runtime: 'browser-preview'}; }
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

  getNativeDiagnostics() {
    return invoke<unknown>('get_native_diagnostics');
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
