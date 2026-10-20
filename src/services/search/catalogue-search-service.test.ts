import {describe, expect, it, vi} from 'vitest';
import {CatalogueSearchService} from './catalogue-search-service';
import {DevelopmentSearchService} from './development-search-service';
import {UnavailableWindowsAiService} from '../windows-ai/unavailable-windows-ai-service';
import {defaultWindowsAiPreferences} from '../windows-ai/windows-ai.types';
import {StreamingSearchService} from '../../test/streaming-search-service';
import type {SearchResponse} from './search.types';

describe('public app content search', () => {
  it('merges help independently into each accumulated snapshot within the requested limit', async () => {
    const files = new StreamingSearchService();
    const service = new CatalogueSearchService(files, new UnavailableWindowsAiService(), () => ({...defaultWindowsAiPreferences, appContentEnabled: true}), vi.fn());
    const updates: SearchResponse[] = [];
    const request = {requestId: 1, query: 'privacy', scope: 'all' as const, filters: [], limit: 1};
    const pending = service.search(request, undefined, snapshot => updates.push(snapshot));
    const stream = files.streams[0]!;
    const empty: SearchResponse = {requestId: 1, groups: [], total: 0, elapsedMs: 1};
    stream.update?.(empty);
    expect(updates[0]?.groups[0]?.items[0]?.kind).toBe('app-content');
    expect(updates[0]?.total).toBe(1);
    const file: SearchResponse = {...empty, total: 1, groups: [{id: 'files', label: 'Files', items: [{id: 'file', name: 'privacy.txt', path: 'C:\\privacy.txt', kind: 'document', match: {source: 'filename'}, metadata: {}, availability: 'available'}]}]};
    stream.update?.(file);
    stream.resolve(file);
    expect((await pending).groups.map(group => group.id)).toEqual(['files']);
    expect(updates[1]?.groups.map(group => group.id)).toEqual(['files']);
    expect(updates[1]?.total).toBe(1);
  });

  it('rechecks help consent and closes callbacks when the wrapped operation completes', async () => {
    const files = new StreamingSearchService();
    let enabled = true;
    const service = new CatalogueSearchService(files, new UnavailableWindowsAiService(), () => ({...defaultWindowsAiPreferences, appContentEnabled: enabled}), vi.fn());
    const updates: SearchResponse[] = [];
    const pending = service.search({requestId: 1, query: 'privacy', scope: 'all', filters: [], limit: 1}, undefined, snapshot => updates.push(snapshot));
    const stream = files.streams[0]!;
    const empty: SearchResponse = {requestId: 1, groups: [], total: 0, elapsedMs: 1};
    stream.update?.(empty);
    enabled = false;
    stream.update?.(empty);
    stream.resolve(empty);
    expect((await pending).total).toBe(0);
    expect(updates.map(snapshot => snapshot.total)).toEqual([1, 0]);
    stream.update?.(empty);
    expect(updates).toHaveLength(2);
  });

  it('does not deliver callbacks or a final response after abort', async () => {
    const files = new StreamingSearchService();
    const service = new CatalogueSearchService(files, new UnavailableWindowsAiService(), () => ({...defaultWindowsAiPreferences, appContentEnabled: true}), vi.fn());
    const updates: SearchResponse[] = [];
    const abort = new AbortController();
    const pending = service.search({requestId: 1, query: 'privacy', scope: 'all', filters: [], limit: 1}, abort.signal, snapshot => updates.push(snapshot));
    abort.abort();
    const empty: SearchResponse = {requestId: 1, groups: [], total: 0, elapsedMs: 1};
    files.streams[0]!.update?.(empty);
    files.streams[0]!.resolve(empty);
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    expect(updates).toEqual([]);
  });

  it('opens only a trusted settings target without passing it to the file opener', async () => {
    const files = new DevelopmentSearchService();
    const navigate = vi.fn();
    const service = new CatalogueSearchService(files, new UnavailableWindowsAiService(), () => ({...defaultWindowsAiPreferences, appContentEnabled: true}), navigate);
    const results = await service.search({requestId: 1, query: 'privacy', scope: 'all', filters: [], limit: 10});
    const item = results.groups.flatMap((group) => group.items).find((item) => item.kind === 'app-content');
    expect(item).toBeDefined();
    await service.openFile(item!.id);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('privacy');
    expect(files.openedFiles).toEqual([]);
    await expect(service.openFile('app-content:untrusted')).rejects.toThrow();
    expect(files.openedFiles).toEqual([]);
  });
  it('does not ask the semantic index to participate in ordinary all-scope file search', async () => {
    const windows = new UnavailableWindowsAiService();
    const semantic = vi.spyOn(windows, 'searchContent');
    const service = new CatalogueSearchService(new DevelopmentSearchService(), windows, () => ({...defaultWindowsAiPreferences, appContentEnabled: true}), vi.fn());
    await service.search({requestId: 1, query: 'report', scope: 'all', filters: [], limit: 10});
    expect(semantic).not.toHaveBeenCalled();
  });
});
