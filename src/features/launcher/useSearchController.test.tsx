import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {MemorySearchService} from '../../services/search/memory-search-service';
import {SEARCH_QUERY_MAX_CHARACTERS} from '../../services/search/search-query';
import type {SearchPreferences} from '../../services/search/search.types';
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

  it('limits programmatic search requests without splitting Unicode characters', () => {
    const service = new MemorySearchService();
    const {result} = renderHook(() => useSearchController(service));
    const query = `${'😀'.repeat(SEARCH_QUERY_MAX_CHARACTERS)}tail`;

    act(() => result.current.setQuery(query));

    const submitted = service.requests[0]?.request.query ?? '';
    expect(Array.from(submitted)).toHaveLength(SEARCH_QUERY_MAX_CHARACTERS);
    expect(submitted).toBe('😀'.repeat(SEARCH_QUERY_MAX_CHARACTERS));
  });

  it('falls back to an enabled scope and sends the effective preferences', () => {
    const service = new MemorySearchService();
    const preferences: SearchPreferences = {
      enabledScopes: ['code', 'images'],
      filenamePriority: 35,
      recency: 'high',
    };
    const {result} = renderHook(() => useSearchController(service, preferences));

    expect(result.current.scope).toBe('code');
    act(() => result.current.setScope('documents'));
    expect(result.current.scope).toBe('code');
    act(() => result.current.setQuery('lumen'));

    expect(service.requests[0]?.request).toMatchObject({
      scope: 'code',
      preferences,
    });
  });
});

