import {describe, expect, it, vi} from 'vitest';

import {DevelopmentFileSearchService, type WinSearchChannel} from './development-file-search-service';

const readyStatus = {phase: 'ready', generation: 1, pendingItems: 0, indexedItems: 1, queuedEnrichment: 0, skippedItems: 0, message: 'Ready'};
const request = {requestId: 11, query: 'budget', scope: 'all' as const, filters: [], limit: 50};

function hit(prefix: 'winsearch' | 'indexed', name: string, rank = 0.2) {
  const path = `C:\\Docs\\${name}`;
  return {stableId: `${prefix}:${name}`, rootPath: 'C:\\Docs', path, name, contentHash: 'a'.repeat(64), indexRevision: 1,
    extractionKind: prefix, snippet: 'budget line', rank, matchSource: 'content', pinned: false,
    metadata: {path, relativePath: name, name, kind: 'document', extension: 'md', sizeBytes: 12, modifiedMs: 1_786_000_000_000}};
}

function response(...items: unknown[]) {
  return {items, semantic: {phase: 'disabled', reason: null}};
}

type Handler = (command: string, args?: Record<string, unknown>) => unknown | Promise<unknown>;

function setup(handler: Handler, options: {winSearch?: boolean} = {winSearch: true}) {
  const channels: WinSearchChannel[] = [];
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'synchronize_index_roots' || command === 'get_index_status') return readyStatus;
    return handler(command, args);
  });
  const service = new DevelopmentFileSearchService({
    getRoots: () => ['C:\\Docs'],
    invoke,
    winSearch: options.winSearch ? {createChannel: () => { const channel = {onmessage: () => undefined}; channels.push(channel); return channel; }} : undefined,
  });
  const commands = () => invoke.mock.calls.map(call => call[0]);
  return {service, invoke, channels, commands};
}

describe('DevelopmentFileSearchService with the WinSearch engine', () => {
  it('serves launcher searches from the engine without touching the local index', async () => {
    const {service, invoke, commands} = setup(command => command === 'search_winsearch' ? response(hit('winsearch', 'Budget.md')) : undefined);
    const result = await service.search(request);
    expect(result.groups[0]?.items.map(item => [item.id, item.path, item.pinned])).toEqual([['winsearch:Budget.md', 'C:\\Docs\\Budget.md', false]]);
    expect(commands()).not.toContain('search_hybrid');
    expect(invoke).toHaveBeenCalledWith('search_winsearch', expect.objectContaining({requestId: 11, query: 'budget', scope: 'all', limit: 50, onUpdate: expect.anything()}));
  });

  it('forwards streamed snapshots through onUpdate and stops after completion', async () => {
    let resolveSearch: (value: unknown) => void = () => undefined;
    const {service, channels} = setup(command => command === 'search_winsearch' ? new Promise(resolve => { resolveSearch = resolve; }) : undefined);
    const updates: string[][] = [];
    const pending = service.search(request, undefined, snapshot => updates.push(snapshot.groups.flatMap(group => group.items.map(item => item.id))));
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    channels[0]!.onmessage(response(hit('winsearch', 'A.md')));
    channels[0]!.onmessage({not: 'a response'});
    channels[0]!.onmessage(response(hit('winsearch', 'A.md'), hit('winsearch', 'B.md', 0.4)));
    resolveSearch(response(hit('winsearch', 'A.md'), hit('winsearch', 'B.md', 0.4)));
    const result = await pending;
    channels[0]!.onmessage(response(hit('winsearch', 'Late.md')));
    expect(updates).toEqual([['winsearch:A.md'], ['winsearch:A.md', 'winsearch:B.md']]);
    expect(result.total).toBe(2);
  });

  it.each([
    ['rejects as unavailable', () => Promise.reject({code: 'engine-unavailable', message: 'down', recoverable: true})],
    ['returns no results', () => response()],
    ['returns an invalid payload', () => ({items: 'nope'})],
  ])('falls back to the local index when the engine %s', async (_name, engine) => {
    const {service, commands} = setup(command => command === 'search_winsearch' ? engine() : command === 'search_hybrid' ? response(hit('indexed', 'Local.md')) : undefined);
    const result = await service.search(request);
    expect(result.groups[0]?.items.map(item => item.id)).toEqual(['indexed:Local.md']);
    expect(commands()).toEqual(expect.arrayContaining(['search_winsearch', 'search_hybrid']));
  });

  it.each(['recent', 'related'] as const)('keeps the %s scope on the local index', async scope => {
    const {service, commands} = setup(command => command === 'search_hybrid' ? response(hit('indexed', 'Local.md'))
      : command === 'search_related' ? [hit('indexed', 'Local.md')] : undefined);
    await service.search({...request, scope, relatedTo: 'indexed:Local.md'});
    expect(commands()).not.toContain('search_winsearch');
  });

  it('never calls the engine unless the native option is enabled', async () => {
    const {service, commands} = setup(command => command === 'search_hybrid' ? response(hit('indexed', 'Local.md')) : undefined, {});
    await service.search(request);
    expect(commands()).not.toContain('search_winsearch');
    expect(commands()).toContain('search_hybrid');
  });

  it('cancels the native stream when the request is aborted', async () => {
    const {service, invoke, channels} = setup(command => command === 'search_winsearch' ? new Promise(() => undefined) : undefined);
    const controller = new AbortController();
    const pending = service.search(request, controller.signal);
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(invoke).toHaveBeenCalledWith('cancel_winsearch_search', {requestId: 11});
  });

  it('previews and opens engine results through the confined native commands', async () => {
    const {service, invoke} = setup(command => command === 'search_winsearch' ? response(hit('winsearch', 'Budget.md'))
      : command === 'get_basic_preview' ? {kind: 'markdown', title: 'Budget.md', subtitle: 'C:\\Docs\\Budget.md', text: '# Budget', children: [], metadata: {}} : undefined);
    await service.search(request);
    await expect(service.getPreview('winsearch:Budget.md')).resolves.toMatchObject({title: 'Budget.md'});
    await service.openFile('winsearch:Budget.md');
    expect(invoke).toHaveBeenCalledWith('get_basic_preview', {root: 'C:\\Docs', path: 'C:\\Docs\\Budget.md'});
    expect(invoke).toHaveBeenCalledWith('open_file', {root: 'C:\\Docs', path: 'C:\\Docs\\Budget.md'});
    await expect(service.setPinned('winsearch:Budget.md', true)).resolves.toBe(false);
  });
});
