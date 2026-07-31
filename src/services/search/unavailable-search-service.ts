import type {SearchService} from './search-service';
import type {
  FilePreview,
  SearchRequest,
  SearchResponse,
  SearchStatus,
} from './search.types';

export class UnavailableSearchService implements SearchService {
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    signal?.throwIfAborted();
    return {
      requestId: request.requestId,
      groups: [],
      elapsedMs: 0,
      total: 0,
    };
  }

  async getPreview(_fileId: string, signal?: AbortSignal): Promise<FilePreview> {
    signal?.throwIfAborted();
    throw {
      code: 'unavailable',
      message: 'Choose an indexed root to enable previews.',
      recoverable: true,
    };
  }

  async openFile(): Promise<void> {
    throw new Error('Choose an indexed root before opening files.');
  }

  async openContainingFolder(): Promise<void> {
    throw new Error('Choose an indexed root before opening folders.');
  }

  subscribeToStatus(listener: (status: SearchStatus) => void): () => void {
    listener({
      phase: 'degraded',
      message: 'No indexed roots',
      updatedAt: new Date(0).toISOString(),
    });
    return () => undefined;
  }
}
