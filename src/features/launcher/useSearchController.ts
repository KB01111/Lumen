import {useCallback, useEffect, useRef, useState} from 'react';

import type {SearchService} from '../../services/search/search-service';
import {limitSearchQuery} from '../../services/search/search-query';
import {
  defaultSearchPreferences,
  resolveSearchScope,
} from '../../services/search/search-preferences';
import {
  flattenSearchGroups,
  isSelectableResult,
  searchErrorSchema,
  searchResponseSchema,
  type SearchError,
  type SearchGroup,
  type SearchPreferences,
  type SearchResult,
  type SearchScope,
  type SearchStatus,
} from '../../services/search/search.types';

export type SearchLifecycle = 'idle' | 'searching' | 'ready' | 'empty' | 'error';

export interface SearchController {
  query: string;
  scope: SearchScope;
  groups: readonly SearchGroup[];
  results: readonly SearchResult[];
  selectedId: string | null;
  lifecycle: SearchLifecycle;
  error: SearchError | null;
  providerStatus: SearchStatus | null;
  setQuery(query: string): void;
  setScope(scope: SearchScope): void;
  select(fileId: string | null): void;
  rememberSelection(fileId: string | null): void;
  refresh(): void;
}

function invalidResponseError(): SearchError {
  return {
    code: 'invalid-response',
    message: 'The search provider returned an invalid response.',
    recoverable: true,
  };
}

function searchFailure(error: unknown): SearchError {
  const parsed = searchErrorSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    code: 'search-failed',
    message: error instanceof Error ? error.message : 'Search could not be completed.',
    recoverable: true,
  };
}

function nextSelection(
  currentId: string | null,
  previousResults: readonly SearchResult[],
  nextResults: readonly SearchResult[],
): string | null {
  const enabled = nextResults.filter(isSelectableResult);
  if (currentId && enabled.some((result) => result.id === currentId)) {
    return currentId;
  }
  if (enabled.length === 0) {
    return null;
  }
  if (!currentId) {
    return enabled[0]?.id ?? null;
  }

  const previousIndex = previousResults.findIndex((result) => result.id === currentId);
  if (previousIndex < 0) {
    return enabled[0]?.id ?? null;
  }

  return nextResults.find(
    (result, index) => index >= previousIndex && isSelectableResult(result),
  )?.id ?? [...nextResults].reverse().find(isSelectableResult)?.id ?? null;
}

export function useSearchController(
  service: SearchService,
  preferences: SearchPreferences = defaultSearchPreferences,
): SearchController {
  const [query, setQuery] = useState('');
  const [scope, setScopeState] = useState<SearchScope>(() =>
    resolveSearchScope('all', preferences),
  );
  const [groups, setGroups] = useState<readonly SearchGroup[]>([]);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<SearchLifecycle>('idle');
  const [error, setError] = useState<SearchError | null>(null);
  const [providerStatus, setProviderStatus] = useState<SearchStatus | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const requestSequence = useRef(0);
  const latestRequest = useRef(0);
  const resultsRef = useRef<readonly SearchResult[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const effectiveScope = resolveSearchScope(scope, preferences);

  useEffect(() => service.subscribeToStatus(setProviderStatus), [service]);

  useEffect(() => {
    if (scope !== effectiveScope) {
      setScopeState(effectiveScope);
    }
  }, [effectiveScope, scope]);

  useEffect(() => {
    const normalizedQuery = limitSearchQuery(query.trim());
    if (!normalizedQuery) {
      latestRequest.current = ++requestSequence.current;
      setGroups([]);
      setResults([]);
      resultsRef.current = [];
      setSelectedId(null);
      selectedIdRef.current = null;
      setLifecycle('idle');
      setError(null);
      return;
    }

    const requestId = ++requestSequence.current;
    latestRequest.current = requestId;
    const abortController = new AbortController();
    setLifecycle('searching');
    setError(null);

    void service
      .search(
        {
          requestId,
          query: normalizedQuery,
          scope: effectiveScope,
          filters: [],
          limit: 500,
          preferences,
        },
        abortController.signal,
      )
      .then((response) => {
        if (requestId !== latestRequest.current) {
          return;
        }

        const parsed = searchResponseSchema.safeParse(response);
        if (!parsed.success || parsed.data.requestId !== requestId) {
          setLifecycle('error');
          setError(invalidResponseError());
          return;
        }

        const nextGroups = parsed.data.groups;
        const nextResults = flattenSearchGroups(nextGroups);
        const selection = nextSelection(
          selectedIdRef.current,
          resultsRef.current,
          nextResults,
        );
        setGroups(nextGroups);
        setResults(nextResults);
        resultsRef.current = nextResults;
        setSelectedId(selection);
        selectedIdRef.current = selection;
        setLifecycle(nextResults.length > 0 ? 'ready' : 'empty');
      })
      .catch((caughtError: unknown) => {
        if (requestId !== latestRequest.current || abortController.signal.aborted) {
          return;
        }
        setLifecycle('error');
        setError(searchFailure(caughtError));
      });

    return () => abortController.abort();
  }, [effectiveScope, preferences, query, refreshRevision, service]);

  const setScope = useCallback((nextScope: SearchScope) => {
    setScopeState(resolveSearchScope(nextScope, preferences));
  }, [preferences]);

  const select = useCallback((fileId: string | null) => {
    if (fileId === null) {
      selectedIdRef.current = null;
      setSelectedId(null);
      return;
    }
    const result = resultsRef.current.find((item) => item.id === fileId);
    if (!result || !isSelectableResult(result)) {
      return;
    }
    selectedIdRef.current = fileId;
    setSelectedId(fileId);
  }, []);

  const rememberSelection = useCallback((fileId: string | null) => {
    if (fileId === null) {
      selectedIdRef.current = null;
      return;
    }
    const result = resultsRef.current.find((item) => item.id === fileId);
    if (result && isSelectableResult(result)) {
      selectedIdRef.current = fileId;
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshRevision((revision) => revision + 1);
  }, []);

  return {
    query,
    scope: effectiveScope,
    groups,
    results,
    selectedId,
    lifecycle,
    error,
    providerStatus,
    setQuery,
    setScope,
    select,
    rememberSelection,
    refresh,
  };
}
