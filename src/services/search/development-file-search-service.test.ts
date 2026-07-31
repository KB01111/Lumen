import {describe, expect, it, vi} from 'vitest';

import {DevelopmentFileSearchService} from './development-file-search-service';

const request = {
  requestId: 7,
  query: 'read',
  scope: 'all' as const,
  filters: [],
  limit: 500,
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
