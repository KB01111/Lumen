import type {SearchService} from './search-service';
import {rankSearchGroups} from './search-preferences';
import {
  type FilePreview,
  type SearchGroup,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchStatus,
} from './search.types';

interface PendingSearch {
  request: SearchRequest;
  signal?: AbortSignal;
  settled: boolean;
  resolve(response: SearchResponse): void;
  reject(error: unknown): void;
}

interface PendingPreview {
  fileId: string;
  signal?: AbortSignal;
  settled: boolean;
  resolve(preview: FilePreview): void;
  reject(error: unknown): void;
}

export interface RecordedSearchRequest {
  request: SearchRequest;
  signal?: AbortSignal;
}

export class MemorySearchService implements SearchService {
  readonly requests: RecordedSearchRequest[] = [];
  readonly openedFiles: string[] = [];
  readonly openedFolders: string[] = [];

  private readonly pendingSearches: PendingSearch[] = [];
  private readonly pendingPreviews: PendingPreview[] = [];
  private readonly statusListeners = new Set<(status: SearchStatus) => void>();

  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    this.requests.push({request, signal});

    return new Promise((resolve, reject) => {
      this.pendingSearches.push({request, signal, settled: false, resolve, reject});
    });
  }

  async resolve(
    query: string,
    resultsOrGroups: readonly SearchResult[] | readonly SearchGroup[],
    elapsedMs = 4,
  ): Promise<void> {
    const pending = [...this.pendingSearches]
      .reverse()
      .find((item) => !item.settled && item.request.query === query);
    if (!pending) {
      throw new Error(`No pending search for "${query}".`);
    }

    pending.settled = true;
    const groups = rankSearchGroups(
      this.asGroups(resultsOrGroups),
      pending.request.preferences,
    );
    pending.resolve({
      requestId: pending.request.requestId,
      groups,
      elapsedMs,
      total: groups.reduce((total, group) => total + group.items.length, 0),
    });
    await Promise.resolve();
  }

  async reject(query: string, error: unknown): Promise<void> {
    const pending = [...this.pendingSearches]
      .reverse()
      .find((item) => !item.settled && item.request.query === query);
    if (!pending) {
      throw new Error(`No pending search for "${query}".`);
    }
    pending.settled = true;
    pending.reject(error);
    await Promise.resolve();
  }

  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview> {
    return new Promise((resolve, reject) => {
      this.pendingPreviews.push({fileId, signal, settled: false, resolve, reject});
    });
  }

  async resolvePreview(fileId: string, preview: FilePreview): Promise<void> {
    const pending = [...this.pendingPreviews]
      .reverse()
      .find((item) => !item.settled && item.fileId === fileId);
    if (!pending) {
      throw new Error(`No pending preview for "${fileId}".`);
    }
    pending.settled = true;
    pending.resolve(preview);
    await Promise.resolve();
  }

  async rejectPreview(fileId: string, error: unknown): Promise<void> {
    const pending = [...this.pendingPreviews]
      .reverse()
      .find((item) => !item.settled && item.fileId === fileId);
    if (!pending) {
      throw new Error(`No pending preview for "${fileId}".`);
    }
    pending.settled = true;
    pending.reject(error);
    await Promise.resolve();
  }

  async openFile(fileId: string): Promise<void> {
    this.openedFiles.push(fileId);
  }

  async openContainingFolder(fileId: string): Promise<void> {
    this.openedFolders.push(fileId);
  }

  subscribeToStatus(listener: (status: SearchStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  publishStatus(status: SearchStatus): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  previewSignal(fileId: string): AbortSignal | undefined {
    return [...this.pendingPreviews]
      .reverse()
      .find((item) => item.fileId === fileId)?.signal;
  }

  private asGroups(
    resultsOrGroups: readonly SearchResult[] | readonly SearchGroup[],
  ): readonly SearchGroup[] {
    const first = resultsOrGroups[0];
    if (first && 'items' in first) {
      return resultsOrGroups as readonly SearchGroup[];
    }
    return [
      {
        id: 'results',
        label: 'Results',
        items: resultsOrGroups as readonly SearchResult[],
      },
    ];
  }
}

