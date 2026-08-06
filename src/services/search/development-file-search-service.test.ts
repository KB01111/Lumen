import {describe, expect, it, vi} from 'vitest';

import {DevelopmentFileSearchService} from './development-file-search-service';
import {defaultSearchPreferences} from './search-preferences';

const request = {
  requestId: 7,
  query: 'read',
  scope: 'all' as const,
  filters: [],
  limit: 500,
  preferences: defaultSearchPreferences,
};

function rustResponse() {
  return {
    items: [{
      path: 'C:\\Projects\\Readme.md',
      relativePath: 'Readme.md',
      name: 'Readme.md',
      kind: 'document',
      extension: 'md',
      sizeBytes: 128,
      modifiedMs: 1_786_000_000_000,
      score: 0.94,
      ranges: [[0, 4]],
    }],
    total: 1,
    truncated: false,
    elapsedMs: 2,
    warnings: [],
  };
}

describe('DevelopmentFileSearchService', () => {
  it('merges indexed content hits with provenance without replacing filename search', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return {...rustResponse(), items: [], total: 0};
      if (command === 'search_indexed') return [{
        stableId: 'indexed:report',
        rootPath: 'C:\\Projects',
        path: 'C:\\Projects\\Report.pdf',
        name: 'Report.pdf',
        contentHash: 'abc123',
        indexRevision: 4,
        extractionKind: 'pdf-text',
        page: 7,
        timeStartMs: null,
        timeEndMs: null,
        rank: -3.2,
      }];
      return {phase: 'ready', indexedItems: 1, queuedEnrichment: 0, skippedItems: 0, message: 'ready'};
    });
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});

    await service.search(request);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const response = await service.search({...request, requestId: 8});

    expect(response.groups[0]?.items[0]).toMatchObject({
      id: 'indexed:report',
      kind: 'pdf',
      match: {source: 'content'},
      provenance: {
        extractionKind: 'pdf-text',
        fileHash: 'abc123',
        page: 7,
        indexRevision: 4,
      },
    });
  });

  it('returns filename results while root synchronization continues in the background', async () => {
    let finishSynchronization: (() => void) | undefined;
    const invoke = vi.fn((command: string) => {
      if (command === 'synchronize_index_roots') {
        return new Promise<void>((resolve) => { finishSynchronization = resolve; });
      }
      if (command === 'search_filenames') return Promise.resolve(rustResponse());
      if (command === 'search_indexed') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});

    const search = service.search(request);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('synchronize_index_roots', expect.anything()));
    expect(invoke).not.toHaveBeenCalledWith('search_indexed', expect.anything());

    await expect(search).resolves.toMatchObject({total: 1});
    expect(invoke).not.toHaveBeenCalledWith('search_indexed', expect.anything());

    finishSynchronization?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await service.search({...request, requestId: 8});
    expect(invoke).toHaveBeenCalledWith('search_indexed', {query: 'read', limit: 500});
  });

  it('skips synchronization while paused and keeps a matching built index searchable', async () => {
    let paused = true;
    const statuses: string[] = [];
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return rustResponse();
      if (command === 'search_indexed') return [];
      return undefined;
    });
    const service = new DevelopmentFileSearchService({
      getRoots: () => ['C:\\Projects'],
      isBackgroundWorkPaused: () => paused,
      invoke,
    });
    service.subscribeToStatus((status) => statuses.push(`${status.phase}:${status.message}`));

    await expect(service.search(request)).resolves.toMatchObject({total: 1});
    expect(invoke).not.toHaveBeenCalledWith('synchronize_index_roots', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('search_indexed', expect.anything());
    expect(statuses[statuses.length - 1]).toBe(
      'paused:Background index updates paused; existing search remains available',
    );

    paused = false;
    await service.search({...request, requestId: 8});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    paused = true;
    invoke.mockClear();

    await expect(service.search({...request, requestId: 9})).resolves.toMatchObject({total: 1});
    expect(invoke).not.toHaveBeenCalledWith('synchronize_index_roots', expect.anything());
    expect(invoke).toHaveBeenCalledWith('search_indexed', {query: 'read', limit: 500});
  });

  it('refreshes a matching index in the background without overlapping or blocking indexed reads', async () => {
    let now = 1_000;
    let paused = false;
    let synchronizeCalls = 0;
    let finishRefresh: (() => void) | undefined;
    const invoke = vi.fn((command: string) => {
      if (command === 'synchronize_index_roots') {
        synchronizeCalls += 1;
        if (synchronizeCalls === 2) {
          return new Promise<void>((resolve) => { finishRefresh = resolve; });
        }
        return Promise.resolve(undefined);
      }
      if (command === 'search_filenames') return Promise.resolve(rustResponse());
      if (command === 'search_indexed') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    const service = new DevelopmentFileSearchService({
      getRoots: () => ['C:\\Projects'],
      isBackgroundWorkPaused: () => paused,
      now: () => now,
      indexRefreshIntervalMs: 60_000,
      invoke,
    });

    await service.search(request);
    await vi.waitFor(() => expect(synchronizeCalls).toBe(1));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    now += 60_000;
    paused = true;
    invoke.mockClear();
    await service.search({...request, requestId: 8});
    expect(invoke).not.toHaveBeenCalledWith('synchronize_index_roots', expect.anything());
    expect(invoke).toHaveBeenCalledWith('search_indexed', {query: 'read', limit: 500});

    paused = false;
    invoke.mockClear();
    await service.search({...request, requestId: 9});
    await vi.waitFor(() => expect(synchronizeCalls).toBe(2));
    await service.search({...request, requestId: 10});

    expect(invoke.mock.calls.filter(([command]) => command === 'synchronize_index_roots')).toHaveLength(1);
    expect(invoke.mock.calls.filter(([command]) => command === 'search_indexed')).toHaveLength(2);

    finishRefresh?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('never queries an index built for a changed root policy', async () => {
    let exclusions: readonly string[] = [];
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return rustResponse();
      if (command === 'search_indexed') return [];
      return undefined;
    });
    const service = new DevelopmentFileSearchService({
      getRoots: () => ['C:\\Projects'],
      getRootConfigurations: () => [{
        id: 'projects',
        path: 'C:\\Projects',
        cloudEnrichment: false,
        exclusions,
        includeHidden: false,
        maxFileSizeMb: 64,
      }],
      invoke,
    });

    await service.search(request);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    exclusions = ['private/**'];
    invoke.mockClear();

    await service.search({...request, requestId: 8});

    expect(invoke).toHaveBeenCalledWith('synchronize_index_roots', expect.objectContaining({
      roots: [expect.objectContaining({exclusions: ['private/**']})],
    }));
    expect(invoke).not.toHaveBeenCalledWith('search_indexed', expect.anything());
  });

  it('maps Tauri filename matches into stable SearchResult values', async () => {
    const invoke = vi.fn(async () => rustResponse());
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});

    const first = await service.search(request);
    const second = await service.search({...request, requestId: 8});

    expect(invoke).toHaveBeenCalledWith('search_filenames', {root: 'C:\\Projects', query: 'read'});
    expect(first.groups[0]?.items[0]).toMatchObject({
      id: expect.stringMatching(/^local:/),
      name: 'Readme.md',
      kind: 'document',
      match: {source: 'filename', fragment: 'Readme.md', score: 0.94},
    });
    expect(second.groups[0]?.items[0]?.id).toBe(first.groups[0]?.items[0]?.id);
  });

  it('maps previews and opener commands through the known confined file', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return rustResponse();
      if (command === 'get_basic_preview') return {
        kind: 'markdown',
        title: 'Readme.md',
        subtitle: 'C:\\Projects\\Readme.md',
        text: '# Readme',
        sourceUrl: null,
        mimeType: null,
        children: [],
        metadata: {Type: 'MD'},
      };
      return undefined;
    });
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});
    const response = await service.search(request);
    const id = response.groups[0]?.items[0]?.id ?? '';

    await expect(service.getPreview(id)).resolves.toMatchObject({fileId: id, kind: 'markdown', text: '# Readme'});
    await service.openFile(id);
    await service.openContainingFolder(id);

    expect(invoke).toHaveBeenCalledWith('get_basic_preview', {root: 'C:\\Projects', path: 'C:\\Projects\\Readme.md'});
    expect(invoke).toHaveBeenCalledWith('open_file', {root: 'C:\\Projects', path: 'C:\\Projects\\Readme.md'});
    expect(invoke).toHaveBeenCalledWith('open_containing_folder', {root: 'C:\\Projects', path: 'C:\\Projects\\Readme.md'});
  });

  it('clears native capabilities and resynchronizes after index invalidation', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return rustResponse();
      if (command === 'search_indexed') return [];
      return undefined;
    });
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});
    const response = await service.search(request);
    const id = response.groups[0]?.items[0]?.id ?? '';
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    service.invalidateIndex();
    invoke.mockClear();

    await expect(service.openFile(id)).rejects.toMatchObject({code: 'unavailable'});
    await expect(service.search({...request, requestId: 8})).resolves.toMatchObject({total: 1});
    expect(invoke).toHaveBeenCalledWith('synchronize_index_roots', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('search_indexed', expect.anything());
  });

  it('keeps canonical paths for native commands while presenting friendly Windows values', async () => {
    const canonicalPath = '\\\\?\\C:\\Projects\\Readme.md';
    const response = rustResponse();
    response.items[0]!.path = canonicalPath;
    const invoke = vi.fn(async (command: string) => {
      if (command === 'search_filenames') return response;
      if (command === 'get_basic_preview') return {
        kind: 'markdown',
        title: 'Readme.md',
        subtitle: canonicalPath,
        text: '# Readme',
        sourceUrl: null,
        mimeType: null,
        children: [],
        metadata: {Modified: '1786000000000', Size: '128', Type: 'MD'},
      };
      return undefined;
    });
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});
    const search = await service.search(request);
    const result = search.groups[0]?.items[0];

    expect(result?.path).toBe('C:\\Projects\\Readme.md');
    const preview = await service.getPreview(result?.id ?? '');
    expect(preview.subtitle).toBe('C:\\Projects\\Readme.md');
    expect(preview.metadata).toMatchObject({Size: '128 B', Type: 'MD'});
    expect(preview.metadata?.Modified).not.toBe('1786000000000');

    await service.openFile(result?.id ?? '');
    expect(invoke).toHaveBeenCalledWith('open_file', {
      root: 'C:\\Projects',
      path: canonicalPath,
    });
  });

  it('returns the no-root state without invoking native traversal', async () => {
    const invoke = vi.fn();
    const service = new DevelopmentFileSearchService({getRoots: () => [], invoke});
    const statuses: string[] = [];
    service.subscribeToStatus((status) => statuses.push(status.message ?? ''));

    await expect(service.search(request)).resolves.toMatchObject({groups: [], total: 0});
    expect(invoke).not.toHaveBeenCalled();
    expect(statuses[statuses.length - 1]).toBe('No indexed roots');
  });

  it('preserves structured permission failures', async () => {
    const invoke = vi.fn(async () => Promise.reject({
      code: 'permission-denied',
      message: 'Root access was denied.',
      recoverable: true,
    }));
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Private'], invoke});

    await expect(service.search(request)).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Root access was denied.',
    });
  });

  it('honors aborts around non-cancellable invoke calls', async () => {
    let resolveInvoke: ((value: unknown) => void) | undefined;
    const invoke = vi.fn(() => new Promise((resolve) => { resolveInvoke = resolve; }));
    const service = new DevelopmentFileSearchService({getRoots: () => ['C:\\Projects'], invoke});
    const controller = new AbortController();
    const pending = service.search(request, controller.signal);
    controller.abort();
    resolveInvoke?.(rustResponse());

    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });
});
