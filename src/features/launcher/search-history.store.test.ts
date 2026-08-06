import {afterEach, describe, expect, it, vi} from 'vitest';

import {MAX_SEARCH_HISTORY_ENTRIES, MAX_SEARCH_HISTORY_QUERY_LENGTH, searchHistoryPersistence, type SearchHistoryEntry, useSearchHistoryStore} from './search-history.store';

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return {promise, resolve: resolve!, reject: reject!};
}

afterEach(() => {
  vi.restoreAllMocks();
  useSearchHistoryStore.getState().reset();
  localStorage.clear();
});

describe('search history persistence', () => {
  it('hydrates validated local entries and discards malformed data', async () => {
    localStorage.setItem('lumen-search-history-v1', JSON.stringify({entries: [{query: '  report  ', openedAt: 4}]}));
    await useSearchHistoryStore.getState().hydrate();
    expect(useSearchHistoryStore.getState().entries).toEqual([{query: 'report', openedAt: 4}]);

    useSearchHistoryStore.getState().reset();
    localStorage.setItem('lumen-search-history-v1', JSON.stringify({entries: [{query: '', openedAt: 'bad'}]}));
    await useSearchHistoryStore.getState().hydrate();
    expect(useSearchHistoryStore.getState().entries).toEqual([]);
  });

  it('deduplicates, bounds entries, and rejects oversized or empty queries', async () => {
    await useSearchHistoryStore.getState().hydrate();
    await useSearchHistoryStore.getState().record('Report');
    await useSearchHistoryStore.getState().record('report');
    for (let index = 0; index < MAX_SEARCH_HISTORY_ENTRIES + 3; index += 1) {
      await useSearchHistoryStore.getState().record(`query ${index}`);
    }
    expect(useSearchHistoryStore.getState().entries).toHaveLength(MAX_SEARCH_HISTORY_ENTRIES);
    expect(await useSearchHistoryStore.getState().record('')).toBe(false);
    expect(await useSearchHistoryStore.getState().record('x'.repeat(MAX_SEARCH_HISTORY_QUERY_LENGTH + 1))).toBe(false);
  });

  it('leaves visible entries intact when a transactional clear cannot persist', async () => {
    await useSearchHistoryStore.getState().hydrate();
    await useSearchHistoryStore.getState().record('report');
    vi.spyOn(searchHistoryPersistence, 'clear').mockRejectedValue(new Error('store locked'));

    await expect(useSearchHistoryStore.getState().clear()).resolves.toBe(false);
    expect(useSearchHistoryStore.getState().entries).toHaveLength(1);
  });

  it('serializes hydration before a new recorded entry', async () => {
    const pendingRead = deferred<SearchHistoryEntry[]>();
    vi.spyOn(searchHistoryPersistence, 'read').mockReturnValue(pendingRead.promise);

    const hydration = useSearchHistoryStore.getState().hydrate();
    const recording = useSearchHistoryStore.getState().record('new query');
    pendingRead.resolve([{query: 'from disk', openedAt: 1}]);

    await hydration;
    await expect(recording).resolves.toBe(true);
    expect(useSearchHistoryStore.getState().entries.map((entry) => entry.query)).toEqual(['new query', 'from disk']);
  });
});
