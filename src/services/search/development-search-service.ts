import type {SearchService} from './search-service';
import type {
  FilePreview,
  SearchRequest,
  SearchResponse,
  SearchResult,
  SearchScope,
  SearchStatus,
} from './search.types';

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted.', 'AbortError'));
      return;
    }
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Request aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, {once: true});
  });
}

function result(
  id: string,
  name: string,
  path: string,
  kind: SearchResult['kind'],
  source: SearchResult['match']['source'],
  fragment: string,
  extension?: string,
): SearchResult {
  return {
    id,
    name,
    path,
    kind,
    match: {source, fragment, score: 0.96},
    metadata: {
      extension,
      modifiedAt: '2026-07-31T10:00:00.000Z',
      sizeBytes: 18_432,
    },
    availability: 'available',
  };
}

const reportResults: readonly SearchResult[] = [
  result(
    'report-quarterly',
    'Quarterly report.pdf',
    'C:\\Lumen Demo\\Reports\\Quarterly report.pdf',
    'pdf',
    'filename',
    'Exact filename match',
    'pdf',
  ),
  result(
    'report-summary',
    'report-summary.md',
    'C:\\Lumen Demo\\Notes\\report-summary.md',
    'document',
    'content',
    'Release summary and operating highlights',
    'md',
  ),
  result(
    'report-unicode',
    'Årsrapport 2026 – 東京 終.docx',
    'C:\\Lumen Demo\\International\\Årsrapport 2026 – 東京 終.docx',
    'document',
    'semantic',
    'Annual report, international edition',
    'docx',
  ),
];

const baseResults: readonly SearchResult[] = [
  ...reportResults,
  result(
    'lumen-source',
    'SearchExperience.tsx',
    'C:\\Projects\\Lumen\\src\\features\\launcher\\SearchExperience.tsx',
    'source',
    'content',
    'export function SearchExperience',
    'tsx',
  ),
  result(
    'lumen-assets',
    'Brand assets',
    'C:\\Projects\\Lumen\\assets',
    'folder',
    'filename',
    'Folder name match',
  ),
  result(
    'lumen-image',
    'Lumen concept.png',
    'C:\\Projects\\Lumen\\design\\Lumen concept.png',
    'image',
    'metadata',
    '2400 × 1600 image',
    'png',
  ),
];

let largeResults: readonly SearchResult[] | null = null;

function getLargeResults() {
  largeResults ??= Array.from({length: 10_000}, (_, index) =>
    result(
      `large-${index}`,
      `Indexed source ${String(index + 1).padStart(5, '0')}.tsx`,
      `C:\\Projects\\Lumen\\benchmark\\group-${Math.floor(index / 100)}\\source-${index}.tsx`,
      'source',
      index % 4 === 0 ? 'content' : 'filename',
      `Deterministic large result ${index + 1}`,
      'tsx',
    ));
  return largeResults;
}

function inScope(item: SearchResult, scope: SearchScope) {
  switch (scope) {
    case 'folders':
      return item.kind === 'folder';
    case 'documents':
      return ['pdf', 'document', 'spreadsheet', 'presentation'].includes(item.kind);
    case 'code':
      return item.kind === 'source';
    case 'images':
      return item.kind === 'image';
    case 'files':
      return item.kind !== 'folder';
    default:
      return true;
  }
}

function previewFor(item: SearchResult): FilePreview {
  if (item.id === 'report-summary') {
    return {
      fileId: item.id,
      kind: 'markdown',
      title: 'Release summary',
      subtitle: item.path,
      text: '# Release summary\n\n**Revenue** grew while local search stayed fast.\n\n- Private by default\n- Keyboard first',
      metadata: {Type: 'Markdown', Modified: 'Today, 10:00'},
    };
  }
  if (item.kind === 'source') {
    return {
      fileId: item.id,
      kind: 'source',
      title: item.name,
      subtitle: item.path,
      text: `export const resultId = '${item.id}';\n\n// Deterministic development preview`,
      metadata: {Type: 'TypeScript', Size: '18 KB'},
    };
  }
  if (item.kind === 'folder') {
    return {
      fileId: item.id,
      kind: 'folder',
      title: item.name,
      subtitle: item.path,
      children: [
        {id: `${item.id}-1`, name: 'Logo.svg', kind: 'image'},
        {id: `${item.id}-2`, name: 'Guidelines.pdf', kind: 'pdf'},
      ],
      metadata: {Items: '2'},
    };
  }
  return {
    fileId: item.id,
    kind: item.kind === 'pdf' ? 'pdf' : item.kind === 'image' ? 'image' : 'document',
    title: item.name,
    subtitle: item.path,
    metadata: {
      Type: item.metadata.extension?.toUpperCase() ?? item.kind,
      Modified: 'Today, 10:00',
      Size: '18 KB',
    },
  };
}

export class DevelopmentSearchService implements SearchService {
  readonly openedFiles: string[] = [];
  readonly openedFolders: string[] = [];
  private readonly knownResults = new Map<string, SearchResult>(
    baseResults.map((item) => [item.id, item]),
  );

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    await wait(24, signal);
    const query = request.query.toLocaleLowerCase();
    let matches: readonly SearchResult[];
    if (query === 'large-set') {
      matches = getLargeResults();
    } else if (query.startsWith('årsrapport-')) {
      matches = [
        result(
          'unicode-long',
          `${request.query}.docx`,
          `C:\\Lumen Demo\\International\\${request.query}.docx`,
          'document',
          'filename',
          'Unicode filename match',
          'docx',
        ),
      ];
    } else {
      matches = baseResults.filter((item) =>
        `${item.name} ${item.path} ${item.match.fragment ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
      );
    }
    const scoped = matches.filter((item) => inScope(item, request.scope));
    const visible = query === 'large-set' ? scoped : scoped.slice(0, request.limit);
    visible.forEach((item) => this.knownResults.set(item.id, item));
    return {
      requestId: request.requestId,
      groups: visible.length
        ? [{id: 'local', label: 'Local results', items: visible}]
        : [],
      elapsedMs: 24,
      total: visible.length,
    };
  }

  async getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview> {
    await wait(18, signal);
    const item = this.knownResults.get(fileId);
    if (!item) {
      throw {
        code: 'unavailable',
        message: 'This deterministic preview is unavailable.',
        recoverable: true,
      };
    }
    return previewFor(item);
  }

  async openFile(fileId: string): Promise<void> {
    this.openedFiles.push(fileId);
  }

  async openContainingFolder(fileId: string): Promise<void> {
    this.openedFolders.push(fileId);
  }

  async setPinned(): Promise<boolean> {
    return false;
  }

  subscribeToStatus(listener: (status: SearchStatus) => void): () => void {
    listener({
      phase: 'ready',
      indexedItems: 245_891,
      message: 'Development index ready',
      updatedAt: '2026-07-31T10:00:00.000Z',
    });
    return () => undefined;
  }
}
