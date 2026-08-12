import {invoke as tauriInvoke} from '@tauri-apps/api/core';
import {z} from 'zod';

import type {SearchService} from './search-service';
import {
  filePreviewSchema,
  previewKindSchema,
  searchResultKindSchema,
  type FilePreview,
  type SearchError,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchScope,
  type SearchStatus,
} from './search.types';

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const defaultInvoke: InvokeCommand = (command, args) => tauriInvoke(command, args);

const rustFileSchema = z.object({
  path: z.string().min(1),
  relativePath: z.string().min(1),
  name: z.string().min(1),
  kind: searchResultKindSchema,
  extension: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  modifiedMs: z.number().int().nonnegative().nullable().optional(),
});

const rustMatchSchema = rustFileSchema.extend({
  score: z.number().min(0).max(1),
  ranges: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().positive()])),
});

const rustSearchResponseSchema = z.object({
  items: z.array(rustMatchSchema),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  elapsedMs: z.number().int().nonnegative(),
  warnings: z.array(z.object({message: z.string(), path: z.string()})),
});

const rustIndexedHitSchema = z.object({
  stableId: z.string().min(1),
  rootPath: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  contentHash: z.string().min(1),
  indexRevision: z.number().int().positive(),
  extractionKind: z.string().min(1),
  page: z.number().int().positive().nullable().optional(),
  timeStartMs: z.number().int().nonnegative().nullable().optional(),
  timeEndMs: z.number().int().nonnegative().nullable().optional(),
  rank: z.number(),
});
const rustIndexedHitsSchema = z.array(rustIndexedHitSchema);

const rustPreviewSchema = z.object({
  kind: previewKindSchema,
  title: z.string().min(1),
  subtitle: z.string(),
  text: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  children: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: searchResultKindSchema,
  })),
  metadata: z.record(z.string(), z.string()),
});

interface KnownFile {
  path: string;
  root: string;
}

export interface DevelopmentFileSearchServiceOptions {
  getRoots(): readonly string[];
  getRootConfigurations?(): readonly {id: string; path: string; cloudEnrichment: boolean}[];
  getSearchPreferences?(): {filenamePriority: number; recency: 'low' | 'balanced' | 'high'};
  invoke?: InvokeCommand;
}

const defaultSearchPreferences = {filenamePriority: 82, recency: 'balanced'} as const;

function normalizedPath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
}

function displayPath(value: string) {
  return value.replace(/^\\\\\?\\/, '');
}

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function presentPreview(preview: z.infer<typeof rustPreviewSchema>) {
  const metadata = {...preview.metadata};
  const modifiedMs = Number(metadata.Modified);
  if (Number.isFinite(modifiedMs) && modifiedMs > 0) {
    metadata.Modified = new Date(modifiedMs).toLocaleString();
  }
  if (metadata.Size) {
    metadata.Size = formatBytes(metadata.Size);
  }
  return {
    ...preview,
    subtitle: displayPath(preview.subtitle),
    metadata,
  };
}

function stableFileId(root: string, relativePath: string) {
  return `local:${encodeURIComponent(`${normalizedPath(root)}\0${normalizedPath(relativePath)}`)}`;
}

function uniqueRoots(roots: readonly string[]) {
  const seen = new Set<string>();
  return roots.filter((root) => {
    const normalized = normalizedPath(root.trim());
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function isInScope(kind: SearchResult['kind'], scope: SearchScope) {
  switch (scope) {
    case 'files': return kind !== 'folder';
    case 'folders': return kind === 'folder';
    case 'documents': return ['pdf', 'document', 'spreadsheet', 'presentation'].includes(kind);
    case 'code': return kind === 'source';
    case 'images': return kind === 'image';
    case 'related': return false;
    default: return true;
  }
}

function rankingScore(
  result: SearchResult,
  query: string,
  preferences: ReturnType<NonNullable<DevelopmentFileSearchServiceOptions['getSearchPreferences']>>,
) {
  const filenameWeight = 0.5 + preferences.filenamePriority / 200;
  const contentWeight = 0.75 - preferences.filenamePriority / 400;
  const sourceScore = (result.match.score ?? 0) * (
    result.match.source === 'filename' ? filenameWeight : contentWeight
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedName = result.name.toLocaleLowerCase();
  const exactBonus = normalizedName === normalizedQuery || normalizedName.replace(/\.[^.]+$/, '') === normalizedQuery
    ? 2
    : 0;
  const modifiedAt = result.metadata.modifiedAt ? Date.parse(result.metadata.modifiedAt) : Number.NaN;
  const ageDays = Number.isFinite(modifiedAt)
    ? Math.max(0, (Date.now() - modifiedAt) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const recencyWeight = preferences.recency === 'high' ? 0.25 : preferences.recency === 'balanced' ? 0.08 : 0.02;
  const recencyBonus = Number.isFinite(ageDays) ? recencyWeight / (1 + ageDays / 30) : 0;
  return exactBonus + sourceScore + recencyBonus;
}

function indexedKind(path: string): SearchResult['kind'] {
  const extension = path.split('.').pop()?.toLocaleLowerCase() ?? '';
  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(extension)) return 'document';
  if (['csv', 'ods', 'xls', 'xlsx'].includes(extension)) return 'spreadsheet';
  if (['odp', 'ppt', 'pptx'].includes(extension)) return 'presentation';
  if (['c', 'cc', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'html', 'java', 'js', 'jsx', 'json', 'kt', 'kts', 'lua', 'php', 'py', 'rb', 'rs', 'scss', 'sh', 'sql', 'swift', 'toml', 'ts', 'tsx', 'vue', 'xml', 'yaml', 'yml'].includes(extension)) return 'source';
  if (['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)) return 'image';
  if (['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm', 'wmv'].includes(extension)) return 'video';
  if (['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav', 'wma'].includes(extension)) return 'audio';
  return 'unknown';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Request aborted.', 'AbortError');
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Request aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function commandFailure(error: unknown, fallbackMessage: string): SearchError {
  if (error && typeof error === 'object') {
    const candidate = error as {code?: unknown; message?: unknown; recoverable?: unknown};
    const code = candidate.code === 'permission-denied'
      ? 'permission-denied'
      : fallbackMessage.toLocaleLowerCase().includes('preview')
        ? 'preview-failed'
        : 'search-failed';
    return {
      code,
      message: typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
      recoverable: candidate.recoverable !== false,
    };
  }
  return {
    code: fallbackMessage.toLocaleLowerCase().includes('preview') ? 'preview-failed' : 'search-failed',
    message: error instanceof Error ? error.message : fallbackMessage,
    recoverable: true,
  };
}

export class DevelopmentFileSearchService implements SearchService {
  private readonly getRoots: () => readonly string[];
  private readonly getRootConfigurations?: DevelopmentFileSearchServiceOptions['getRootConfigurations'];
  private readonly getSearchPreferences: NonNullable<DevelopmentFileSearchServiceOptions['getSearchPreferences']>;
  private readonly invoke: InvokeCommand;
  private readonly knownFiles = new Map<string, KnownFile>();
  private readonly listeners = new Set<(status: SearchStatus) => void>();
  private synchronizedRootSignature = '';
  private pendingRootSignature = '';
  private rootSynchronization: Promise<void> = Promise.resolve();

  constructor({getRoots, getRootConfigurations, getSearchPreferences = () => defaultSearchPreferences, invoke = defaultInvoke}: DevelopmentFileSearchServiceOptions) {
    this.getRoots = getRoots;
    this.getRootConfigurations = getRootConfigurations;
    this.getSearchPreferences = getSearchPreferences;
    this.invoke = invoke;
  }

  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    throwIfAborted(signal);
    const roots = uniqueRoots(this.getRoots());
    if (roots.length === 0) {
      this.publishStatus(this.createStatus());
      return {requestId: request.requestId, groups: [], elapsedMs: 0, total: 0};
    }

    const startedAt = performance.now();
    await abortable(this.synchronizeRoots(roots), signal);
    throwIfAborted(signal);
    const indexedRequest = this.invoke('search_indexed', {query: request.query, limit: request.limit});
    const [settled, indexedSettled] = await abortable(Promise.all([
      Promise.allSettled(
        roots.map((root) => this.invoke('search_filenames', {root, query: request.query})),
      ),
      Promise.allSettled([indexedRequest]),
    ]), signal);
    throwIfAborted(signal);

    const responses: Array<{root: string; data: z.infer<typeof rustSearchResponseSchema>}> = [];
    let firstFailure: unknown;
    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        firstFailure ??= result.reason;
        return;
      }
      const parsed = rustSearchResponseSchema.safeParse(result.value);
      if (!parsed.success) {
        firstFailure ??= {
          code: 'invalid-response',
          message: 'The local filename adapter returned an invalid response.',
          recoverable: true,
        };
        return;
      }
      responses.push({root: roots[index] ?? '', data: parsed.data});
    });

    const filenameMatches = responses
      .flatMap(({root, data}) => data.items.map((item) => ({root, item})))
      .map(({root, item}) => {
        const id = stableFileId(root, item.relativePath);
        this.knownFiles.set(id, {root, path: item.path});
        return {
          id,
          name: item.name,
          path: displayPath(item.path),
          kind: item.kind,
          match: {
            source: 'filename' as const,
            fragment: item.relativePath,
            ranges: item.ranges,
            score: item.score,
          },
          metadata: {
            extension: item.extension ?? undefined,
            modifiedAt: item.modifiedMs == null ? undefined : new Date(item.modifiedMs).toISOString(),
            sizeBytes: item.sizeBytes,
          },
          availability: 'available' as const,
        } satisfies SearchResult;
      })
      .filter((item) => isInScope(item.kind, request.scope))
      .sort((left, right) =>
        (right.match.score ?? 0) - (left.match.score ?? 0) ||
        left.name.length - right.name.length ||
        left.path.localeCompare(right.path),
      );
    let indexedFailure: unknown;
    const indexedMatches = indexedSettled.flatMap((result) => {
      if (result.status === 'rejected') {
        indexedFailure = result.reason;
        return [];
      }
      const parsed = rustIndexedHitsSchema.safeParse(result.value);
      if (!parsed.success) {
        indexedFailure = {message: 'The local content index returned an invalid response.'};
        return [];
      }
      return parsed.data.map((item) => {
        this.knownFiles.set(item.stableId, {root: item.rootPath, path: item.path});
        return {
          id: item.stableId,
          name: item.name,
          path: displayPath(item.path),
          kind: indexedKind(item.path),
          match: {
            source: item.extractionKind === 'ocr' ? 'ocr' as const : 'content' as const,
            score: 1 / (1 + Math.abs(item.rank)),
          },
          metadata: {},
          provenance: {
            extractionKind: item.extractionKind,
            fileHash: item.contentHash,
            page: item.page ?? undefined,
            timeStartMs: item.timeStartMs ?? undefined,
            timeEndMs: item.timeEndMs ?? undefined,
            indexRevision: item.indexRevision,
          },
          availability: 'available' as const,
        } satisfies SearchResult;
      }).filter((item) => isInScope(item.kind, request.scope));
    });
    if (responses.length === 0 && firstFailure && indexedMatches.length === 0) {
      throw commandFailure(firstFailure ?? indexedFailure, 'Local filename search failed.');
    }
    const seenPaths = new Set(filenameMatches.map((item) => normalizedPath(item.path)));
    const preferences = this.getSearchPreferences();
    const mapped = [
      ...filenameMatches,
      ...indexedMatches.filter((item) => !seenPaths.has(normalizedPath(item.path))),
    ].sort((left, right) =>
      rankingScore(right, request.query, preferences) - rankingScore(left, request.query, preferences) ||
      left.name.localeCompare(right.name),
    );
    const total = mapped.length;
    const visible = mapped.slice(0, request.limit);
    const warningCount = responses.reduce((count, response) => count + response.data.warnings.length, 0);
    const failedCount = settled.length - responses.length;
    this.publishStatus({
      phase: failedCount > 0 || warningCount > 0 ? 'degraded' : 'ready',
      indexedItems: total,
      message: failedCount > 0
        ? `${roots.length - failedCount} of ${roots.length} local roots searched`
        : warningCount > 0
          ? `Local search ready with ${warningCount} skipped paths`
          : `${roots.length} local ${roots.length === 1 ? 'root' : 'roots'} ready`,
      updatedAt: new Date().toISOString(),
    });

    return {
      requestId: request.requestId,
      groups: visible.length ? [{id: 'local-files', label: 'Local files', items: visible}] : [],
      elapsedMs: Math.max(0, performance.now() - startedAt),
      total,
    };
  }

  async getPreview(fileId: string, signal?: AbortSignal): Promise<FilePreview> {
    throwIfAborted(signal);
    const known = this.requireKnownFile(fileId);
    try {
      const rawPreview = await this.invoke('get_basic_preview', {root: known.root, path: known.path});
      throwIfAborted(signal);
      const parsed = rustPreviewSchema.safeParse(rawPreview);
      if (!parsed.success) {
        throw {
          code: 'invalid-response',
          message: 'The local preview adapter returned an invalid response.',
          recoverable: true,
        } satisfies SearchError;
      }
      return filePreviewSchema.parse({
        fileId,
        ...presentPreview(parsed.data),
        text: parsed.data.text ?? undefined,
        sourceUrl: parsed.data.sourceUrl ?? undefined,
        mimeType: parsed.data.mimeType ?? undefined,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      throw commandFailure(error, 'The local preview could not be loaded.');
    }
  }

  async openFile(fileId: string): Promise<void> {
    const known = this.requireKnownFile(fileId);
    try {
      await this.invoke('open_file', {root: known.root, path: known.path});
    } catch (error) {
      const message = commandFailure(error, 'The selected file could not be opened.').message;
      throw Object.assign(new Error(message), {cause: error});
    }
  }

  async openContainingFolder(fileId: string): Promise<void> {
    const known = this.requireKnownFile(fileId);
    try {
      await this.invoke('open_containing_folder', {root: known.root, path: known.path});
    } catch (error) {
      const message = commandFailure(error, 'The containing folder could not be opened.').message;
      throw Object.assign(new Error(message), {cause: error});
    }
  }

  subscribeToStatus(listener: (status: SearchStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.createStatus());
    return () => this.listeners.delete(listener);
  }

  private createStatus(): SearchStatus {
    const roots = uniqueRoots(this.getRoots());
    return roots.length > 0
      ? {
          phase: 'ready',
          message: `${roots.length} local ${roots.length === 1 ? 'root' : 'roots'} configured`,
          updatedAt: new Date().toISOString(),
        }
      : {
          phase: 'degraded',
          message: 'No indexed roots',
          updatedAt: new Date().toISOString(),
        };
  }

  private publishStatus(status: SearchStatus) {
    this.listeners.forEach((listener) => listener(status));
  }

  private synchronizeRoots(roots: readonly string[]): Promise<void> {
    const configuredRoots = this.getRootConfigurations?.() ?? roots.map((path) => ({
      id: normalizedPath(path),
      path,
      cloudEnrichment: false,
    }));
    const signature = JSON.stringify(configuredRoots.map((root) => [
      normalizedPath(root.path),
      root.cloudEnrichment,
    ]));
    if (signature === this.synchronizedRootSignature && !this.pendingRootSignature) {
      return Promise.resolve();
    }
    if (signature === this.pendingRootSignature) {
      return this.rootSynchronization;
    }
    this.pendingRootSignature = signature;
    const previous = this.rootSynchronization.catch(() => undefined);
    const synchronization = previous.then(async () => {
      if (signature === this.synchronizedRootSignature) return;
      await this.invoke('synchronize_index_roots', {
        roots: configuredRoots.map((root) => ({
          path: root.path,
          cloudEnrichment: root.cloudEnrichment,
        })),
      });
      this.synchronizedRootSignature = signature;
    });
    this.rootSynchronization = synchronization;
    return synchronization.finally(() => {
      if (this.pendingRootSignature === signature) {
        this.pendingRootSignature = '';
      }
    });
  }

  private requireKnownFile(fileId: string) {
    const known = this.knownFiles.get(fileId);
    if (!known) {
      throw {
        code: 'unavailable',
        message: 'Search again before opening this local item.',
        recoverable: true,
      } satisfies SearchError;
    }
    return known;
  }
}
