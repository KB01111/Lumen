import type {
  FilePreview,
  SearchRequest,
  SearchResponse,
  SearchStatus,
} from './search.types';

export interface SearchService {
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview>;
  openFile(fileId: string): Promise<void>;
  openContainingFolder(fileId: string): Promise<void>;
  setPinned(fileId: string, pinned: boolean): Promise<boolean>;
  subscribeToStatus(listener: (status: SearchStatus) => void): () => void;
}

