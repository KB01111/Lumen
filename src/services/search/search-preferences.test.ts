import {describe, expect, it} from 'vitest';

import {
  projectSearchPreferences,
  rankSearchResults,
  resolveSearchScope,
} from './search-preferences';
import type {SearchPreferences, SearchResult} from './search.types';

function result({
  id,
  modifiedAt,
  score,
  source = 'content',
}: {
  id: string;
  modifiedAt?: string;
  score: number;
  source?: SearchResult['match']['source'];
}): SearchResult {
  return {
    id,
    name: `${id}.txt`,
    path: `C:\\Lumen\\${id}.txt`,
    kind: 'document',
    match: {source, score},
    metadata: {modifiedAt},
    availability: 'available',
  };
}

function preferences(patch: Partial<SearchPreferences> = {}): SearchPreferences {
  return {
    enabledScopes: ['all', 'code'],
    filenamePriority: 0,
    recency: 'low',
    ...patch,
  };
}

describe('search preferences', () => {
  it('projects scopes into canonical order and falls back to all', () => {
    expect(projectSearchPreferences({
      enabledScopes: ['code', 'all', 'code'],
      filenamePriority: 82.4,
      recency: 'balanced',
    })).toEqual({
      enabledScopes: ['all', 'code'],
      filenamePriority: 82,
      recency: 'balanced',
    });

    expect(projectSearchPreferences({
      enabledScopes: [],
      filenamePriority: -10,
      recency: 'low',
    })).toEqual({
      enabledScopes: ['all'],
      filenamePriority: 0,
      recency: 'low',
    });
  });

  it('falls back to the first enabled scope', () => {
    expect(resolveSearchScope('documents', preferences({enabledScopes: ['code', 'images']})))
      .toBe('code');
  });

  it('applies filename priority without changing exact ties', () => {
    const content = result({id: 'content', score: 0.9});
    const filename = result({id: 'filename', score: 0.2, source: 'filename'});

    expect(rankSearchResults([content, filename], preferences()).map((item) => item.id))
      .toEqual(['content', 'filename']);
    expect(rankSearchResults(
      [content, filename],
      preferences({filenamePriority: 100}),
    ).map((item) => item.id)).toEqual(['filename', 'content']);
  });

  it('uses modified times according to the selected recency strength', () => {
    const olderRelevant = result({
      id: 'older-relevant',
      modifiedAt: '2025-01-01T00:00:00.000Z',
      score: 0.84,
    });
    const newerNearby = result({
      id: 'newer-nearby',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      score: 0.81,
    });
    const newestWeak = result({
      id: 'newest-weak',
      modifiedAt: '2026-07-01T00:00:00.000Z',
      score: 0.1,
    });

    expect(rankSearchResults(
      [olderRelevant, newerNearby],
      preferences({recency: 'low'}),
    ).map((item) => item.id)).toEqual(['older-relevant', 'newer-nearby']);
    expect(rankSearchResults(
      [olderRelevant, newerNearby],
      preferences({recency: 'balanced'}),
    ).map((item) => item.id)).toEqual(['newer-nearby', 'older-relevant']);
    expect(rankSearchResults(
      [olderRelevant, newestWeak],
      preferences({recency: 'high'}),
    ).map((item) => item.id)).toEqual(['newest-weak', 'older-relevant']);
  });

  it('does not invent recency for results without modified metadata', () => {
    const unknown = result({id: 'unknown', score: 0.99});
    const known = result({
      id: 'known',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      score: 0.1,
    });

    expect(rankSearchResults(
      [unknown, known],
      preferences({recency: 'high'}),
    ).map((item) => item.id)).toEqual(['known', 'unknown']);
  });
});
