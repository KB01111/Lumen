import {describe, expect, it} from 'vitest';

import {
  limitSearchQuery,
  SEARCH_QUERY_MAX_CHARACTERS,
} from './search-query';
import {searchRequestSchema} from './search.types';
import {defaultSearchPreferences} from './search-preferences';

describe('search query boundary', () => {
  it('uses Unicode code points for both limiting and request validation', () => {
    const valid = '😀'.repeat(SEARCH_QUERY_MAX_CHARACTERS);
    const overLimit = `${valid}x`;
    const baseRequest = {
      requestId: 1,
      scope: 'all' as const,
      filters: [],
      limit: 500,
      preferences: defaultSearchPreferences,
    };

    expect(searchRequestSchema.safeParse({...baseRequest, query: valid}).success).toBe(true);
    expect(searchRequestSchema.safeParse({...baseRequest, query: overLimit}).success).toBe(false);
    expect(limitSearchQuery(overLimit)).toBe(valid);
  });
});
