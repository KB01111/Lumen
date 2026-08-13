import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {MemorySearchService} from '../../services/search/memory-search-service';
import type {SearchResult} from '../../services/search/search.types';
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

