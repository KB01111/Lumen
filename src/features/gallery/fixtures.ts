import type {SearchService} from '../../services/search/search-service';
import type {
  FilePreview,
  SearchRequest,
  SearchResponse,
  SearchResult,
  SearchStatus,
} from '../../services/search/search.types';
import type {GalleryPreviewState, GalleryResultSet} from './gallery.types';

function result(
  id: string,
  name: string,
  path: string,
  kind: SearchResult['kind'],
  extension?: string,
  availability: SearchResult['availability'] = 'available',
): SearchResult {
  return {
    id,
    name,
    path,
    kind,
    availability,
    match: {source: 'filename', fragment: path.split('\\').slice(-2).join('\\'), score: 0.96},
    metadata: {extension, modifiedAt: '2026-07-31T10:00:00.000Z', sizeBytes: 18_432},
  };
}

const standardResults = [
  result('quarterly-report', 'Quarterly report.pdf', 'C:\\Lumen Demo\\Reports\\Quarterly report.pdf', 'pdf', 'pdf'),
  result('report-summary', 'report-summary.md', 'C:\\Lumen Demo\\Notes\\report-summary.md', 'document', 'md'),
  result('search-source', 'SearchExperience.tsx', 'C:\\Projects\\Lumen\\src\\features\\launcher\\SearchExperience.tsx', 'source', 'tsx'),
  result('brand-assets', 'Brand assets', 'C:\\Projects\\Lumen\\assets', 'folder'),
  result('lumen-concept', 'Lumen concept.png', 'C:\\Projects\\Lumen\\design\\Lumen concept.png', 'image', 'png'),
  result('financial-model', 'Forecast model.xlsx', 'C:\\Lumen Demo\\Finance\\Forecast model.xlsx', 'spreadsheet', 'xlsx'),
] as const;

let largeResults: readonly SearchResult[] | undefined;

export function galleryResults(set: GalleryResultSet = 'standard'): readonly SearchResult[] {
  switch (set) {
    case 'empty': return [];
    case 'permission': return [
      result('private-budget', 'Private budget.xlsx', 'C:\\Finance\\Private budget.xlsx', 'spreadsheet', 'xlsx', 'permissionDenied'),
      standardResults[0],
    ];
    case 'long': return [
      result(
        'long-architecture',
        'Lumen-phase-one-accessibility-performance-mixed-DPI-architecture-validation-notes-final-reviewed-copy-2026-07-31.md',
        'C:\\Projects\\Lumen\\docs\\architecture\\Lumen-phase-one-accessibility-performance-mixed-DPI-architecture-validation-notes-final-reviewed-copy-2026-07-31.md',
        'document',
        'md',
      ),
      ...standardResults,
    ];
    case 'unicode': return [
      result('unicode-report', 'Årsrapport 2026 – 東京 終 – مرحبا – é – 🚀.docx', 'C:\\Lumen Demo\\International\\Årsrapport 2026 – 東京 終 – مرحبا – é – 🚀.docx', 'document', 'docx'),
      result('unicode-code', 'Sökkomponent_日本語.tsx', 'C:\\Projects\\Lumen\\src\\Sökkomponent_日本語.tsx', 'source', 'tsx'),
    ];
    case 'large':
      largeResults ??= Array.from({length: 10_000}, (_, index) => result(
        `large-${index}`,
        `Indexed source ${String(index + 1).padStart(5, '0')}.tsx`,
        `C:\\Projects\\Lumen\\benchmark\\group-${Math.floor(index / 100)}\\source-${index}.tsx`,
        'source',
        'tsx',
      ));
      return largeResults;
    default: return standardResults;
  }
}

function previewFor(fileId: string): FilePreview {
  const item = [...standardResults, ...galleryResults('unicode'), ...galleryResults('long')]
    .find((candidate) => candidate.id === fileId) ?? standardResults[0];
  return {
    fileId,
    kind: item.kind === 'source' ? 'source' : item.metadata.extension === 'md' ? 'markdown' : item.kind === 'image' ? 'image' : 'document',
    title: item.name,
    subtitle: item.path,
    text: item.metadata.extension === 'md'
      ? '# Release summary\n\n**Private by default.** Exact local filename search stays available while optional providers remain disconnected.\n\n- Keyboard first\n- Root confined\n- Calm under load'
      : undefined,
    metadata: {Type: item.metadata.extension?.toUpperCase() ?? item.kind, Modified: 'Today, 10:00', Size: '18 KB'},
  };
}

export class GallerySearchService implements SearchService {
  constructor(
    private readonly results: readonly SearchResult[],
    private readonly previewState: GalleryPreviewState = 'complete',
  ) {}

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    signal?.throwIfAborted();
    return {
      requestId: request.requestId,
      groups: this.results.length ? [{id: 'local', label: 'Local files', items: this.results}] : [],
      elapsedMs: 4,
      total: this.results.length,
    };
  }

  getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview> {
    if (this.previewState === 'loading') {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Request aborted.', 'AbortError')), {once: true});
      });
    }
    signal?.throwIfAborted();
    if (this.previewState === 'failed') {
      return Promise.reject({code: 'preview-failed', message: 'Preview permission changed while reading this file.', recoverable: true});
    }
    return Promise.resolve(previewFor(fileId));
  }

  async openFile(): Promise<void> {}
  async openContainingFolder(): Promise<void> {}

  subscribeToStatus(listener: (status: SearchStatus) => void): () => void {
    listener({phase: 'ready', indexedItems: this.results.length, message: 'Deterministic gallery', updatedAt: '2026-07-31T10:00:00.000Z'});
    return () => undefined;
  }
}
