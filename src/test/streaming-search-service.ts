import {MemorySearchService} from '../services/search/memory-search-service';
import type {SearchRequest, SearchResponse} from '../services/search/search.types';

export class StreamingSearchService extends MemorySearchService {
  readonly streams: Array<{
    request: SearchRequest;
    signal?: AbortSignal;
    update?: (snapshot: SearchResponse) => void;
    resolve(response: SearchResponse): void;
    reject(error: unknown): void;
  }> = [];

  override search(request: SearchRequest, signal?: AbortSignal, update?: (snapshot: SearchResponse) => void): Promise<SearchResponse> {
    return new Promise((resolve, reject) => {
      this.streams.push({request, signal, update, resolve, reject});
    });
  }
}
