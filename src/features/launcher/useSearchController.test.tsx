import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {MemorySearchService} from '../../services/search/memory-search-service';
import {CatalogueSearchService} from '../../services/search/catalogue-search-service';
import type {SearchResponse, SearchResult} from '../../services/search/search.types';
import {UnavailableWindowsAiService} from '../../services/windows-ai/unavailable-windows-ai-service';
import {defaultWindowsAiPreferences} from '../../services/windows-ai/windows-ai.types';
import {StreamingSearchService} from '../../test/streaming-search-service';
import {useSearchController} from './useSearchController';

function file(
  id: string,
  availability: SearchResult['availability'] = 'available',
): SearchResult {
  return {
    id,
    name: `${id}.txt`,
    path: `C:\\Lumen\\${id}.txt`,
    kind: 'document',
    match: {source: 'filename', fragment: id},
    metadata: {extension: 'txt', modifiedAt: '2026-07-31T10:00:00.000Z'},
    availability,
  };
}

describe('useSearchController', () => {
  it('shows accumulated snapshots before completion and preserves selection across reordering', async () => {
    const service = new StreamingSearchService();
    const {result} = renderHook(() => useSearchController(service));
    act(() => result.current.setQuery('report'));
    const stream = service.streams[0]!;
    const snapshot = (ids: string[]): SearchResponse => ({requestId: stream.request.requestId,
      groups: [{id: 'files', label: 'Files', items: ids.map(id => file(id))}], total: ids.length, elapsedMs: 1});

    act(() => stream.update?.(snapshot(['a', 'b'])));
    expect(result.current.results.map(item => item.id)).toEqual(['a', 'b']);
    expect(result.current.lifecycle).toBe('searching');
    act(() => result.current.select('b'));
    act(() => stream.update?.(snapshot(['c', 'b', 'a'])));
    expect(result.current.selectedId).toBe('b');
    await act(async () => stream.resolve(snapshot(['c', 'b', 'a'])));
    expect(result.current.lifecycle).toBe('ready');
    expect(result.current.selectedId).toBe('b');
  });

  it('ignores old streams and callbacks delivered after the final response', async () => {
    const service = new StreamingSearchService();
    const {result} = renderHook(() => useSearchController(service));
    act(() => result.current.setQuery('old'));
    const old = service.streams[0]!;
    act(() => result.current.setQuery('current'));
    const current = service.streams[1]!;
    const response = (requestId: number, id: string): SearchResponse => ({requestId,
      groups: [{id: 'files', label: 'Files', items: [file(id)]}], total: 1, elapsedMs: 1});
    act(() => old.update?.(response(old.request.requestId, 'stale')));
    expect(result.current.results).toEqual([]);
    await act(async () => current.resolve(response(current.request.requestId, 'current')));
    act(() => current.update?.(response(current.request.requestId, 'late')));
    await act(async () => old.resolve(response(old.request.requestId, 'stale')));
    expect(result.current.results.map(item => item.id)).toEqual(['current']);
    expect(old.signal?.aborted).toBe(true);
  });

  it.each(['malformed', 'wrong request'] as const)('closes a stream on a %s snapshot', async failure => {
    const service = new StreamingSearchService();
    const {result} = renderHook(() => useSearchController(service));
    act(() => result.current.setQuery('report'));
    const stream = service.streams[0]!;
    const valid: SearchResponse = {requestId: stream.request.requestId, groups: [], total: 0, elapsedMs: 1};
    act(() => stream.update?.(failure === 'malformed'
      ? {...valid, groups: [{id: 'files', label: 'Files', items: [{...file('bad'), match: {source: 'filename', score: 2}}]}]}
      : {...valid, requestId: stream.request.requestId + 1}));
    expect(result.current.error?.code).toBe('invalid-response');
    expect(result.current.lifecycle).toBe('error');
    expect(stream.signal?.aborted).toBe(true);
    await act(async () => stream.resolve(valid));
    expect(result.current.lifecycle).toBe('error');
  });

  it('searches Recent with an empty query', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));
    act(() => result.current.setScope('recent'));
    expect(service.requests[0]?.request).toMatchObject({query: '', scope: 'recent'});
    await act(() => service.resolve('', [file('recent')]));
    expect(result.current.results.map(item => item.id)).toEqual(['recent']);
  });

  it('rejects malformed asynchronous snapshots through the real catalogue wrapper', async () => {
    const files = new StreamingSearchService();
    const service = new CatalogueSearchService(files, new UnavailableWindowsAiService(), () => ({...defaultWindowsAiPreferences, appContentEnabled: true}), () => {});
    const {result} = renderHook(() => useSearchController(service));
    act(() => result.current.setQuery('privacy'));
    const stream = files.streams[0]!;
    const malformed = {requestId: stream.request.requestId, groups: null, total: 0, elapsedMs: 1} as unknown as SearchResponse;
    expect(() => act(() => stream.update?.(malformed))).not.toThrow();
    expect(result.current.error?.code).toBe('invalid-response');
    expect(stream.signal?.aborted).toBe(true);
    await act(async () => stream.resolve({requestId: stream.request.requestId, groups: [], total: 0, elapsedMs: 1}));
    expect(result.current.lifecycle).toBe('error');
  });

  it('keeps empty Recent inactive outside search mode and aborts it when disabled', async () => {
    const service = new MemorySearchService();
    const {result, rerender} = renderHook(({enabled}) => useSearchController(service, undefined, enabled), {initialProps: {enabled: false}});
    act(() => result.current.setScope('recent'));
    expect(service.requests).toHaveLength(0);
    rerender({enabled: true});
    expect(service.requests[0]?.request).toMatchObject({query: '', scope: 'recent'});
    await act(() => service.resolve('', [file('recent')]));
    rerender({enabled: false});
    expect(service.requests[0]?.signal?.aborted).toBe(true);
    expect(result.current.results).toEqual([]);
    expect(result.current.lifecycle).toBe('idle');
  });

  it('ignores a stale search response and keeps selection by file id', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));

    act(() => result.current.setQuery('lum'));
    act(() => result.current.setQuery('lumen'));
    await act(() => service.resolve('lumen', [file('b'), file('a')]));
    act(() => result.current.select('a'));
    await act(() => service.resolve('lum', [file('stale')]));

    expect(result.current.results.map((item) => item.id)).toEqual(['b', 'a']);
    expect(result.current.selectedId).toBe('a');
  });

  it('aborts the previous request and skips disabled results for selection', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));

    act(() => result.current.setQuery('first'));
    act(() => result.current.setQuery('second'));

    expect(service.requests[0]?.signal?.aborted).toBe(true);
    await act(() =>
      service.resolve('second', [
        file('loading', 'loading'),
        file('denied', 'permissionDenied'),
        file('ready'),
      ]),
    );

    expect(result.current.selectedId).toBe('ready');
  });

  it('uses the nearest enabled neighbor when the selected result disappears', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));

    act(() => result.current.setQuery('files'));
    await act(() => service.resolve('files', [file('a'), file('b'), file('c')]));
    act(() => result.current.select('b'));

    act(() => result.current.refresh());
    await act(() => service.resolve('files', [file('a'), file('c')]));

    expect(result.current.selectedId).toBe('c');
  });

  it('clears results without issuing a request for an empty query', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));

    act(() => result.current.setQuery('lumen'));
    await act(() => service.resolve('lumen', [file('a')]));
    act(() => result.current.setQuery(''));

    expect(result.current.results).toEqual([]);
    expect(result.current.selectedId).toBeNull();
    expect(service.requests).toHaveLength(1);
  });

  it('sends active filters with the request', () => {
    const service = new MemorySearchService();
    const filters = [{id: 'extension-md', label: 'Markdown', value: 'md'}];
    const {result} = renderHook(() => useSearchController(service, filters));

    act(() => result.current.setQuery('release'));

    expect(service.requests[0]?.request.filters).toEqual(filters);
  });

  it('uses the active selection as the Related source', async () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));

    act(() => result.current.setQuery('harbor'));
    await act(() => service.resolve('harbor', [file('indexed:source')]));
    act(() => result.current.setScope('related'));

    expect(service.requests[service.requests.length - 1]?.request).toMatchObject({
      scope: 'related',
      relatedTo: 'indexed:source',
    });
  });
});

