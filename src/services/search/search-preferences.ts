import {
  searchScopeValues,
  type SearchGroup,
  type SearchPreferences,
  type SearchRecency,
  type SearchResult,
  type SearchScope,
} from './search.types';

export const defaultSearchPreferences: SearchPreferences = {
  enabledScopes: [...searchScopeValues],
  filenamePriority: 82,
  recency: 'balanced',
};

export interface SearchPreferenceSource {
  enabledScopes: readonly SearchScope[];
  filenamePriority: number;
  recency: SearchRecency;
}

export function projectSearchPreferences(source: SearchPreferenceSource): SearchPreferences {
  const selected = new Set(source.enabledScopes);
  const enabledScopes = searchScopeValues.filter((scope) => selected.has(scope));
  return {
    enabledScopes: enabledScopes.length > 0 ? enabledScopes : ['all'],
    filenamePriority: Math.max(0, Math.min(100, Math.round(source.filenamePriority))),
    recency: source.recency,
  };
}

export function resolveSearchScope(
  requested: SearchScope,
  preferences: SearchPreferences,
): SearchScope {
  return preferences.enabledScopes.includes(requested)
    ? requested
    : preferences.enabledScopes[0] ?? 'all';
}

function relevanceScore(result: SearchResult, preferences: SearchPreferences) {
  const baseScore = result.match.score ?? 0;
  const filenameBoost = result.match.source === 'filename'
    ? preferences.filenamePriority / 100
    : 0;
  return baseScore + filenameBoost;
}

function modifiedTime(result: SearchResult) {
  if (!result.metadata.modifiedAt) return undefined;
  const timestamp = Date.parse(result.metadata.modifiedAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function compareRecency(
  left: SearchResult,
  right: SearchResult,
) {
  const leftTime = modifiedTime(left);
  const rightTime = modifiedTime(right);
  if (leftTime === undefined && rightTime === undefined) return 0;
  if (leftTime === undefined) return 1;
  if (rightTime === undefined) return -1;
  return rightTime - leftTime;
}

function compareResults(
  left: SearchResult,
  right: SearchResult,
  preferences: SearchPreferences,
) {
  const leftScore = relevanceScore(left, preferences);
  const rightScore = relevanceScore(right, preferences);
  const scoreOrder = rightScore - leftScore;

  if (preferences.recency === 'high') {
    return compareRecency(left, right) || scoreOrder;
  }
  if (preferences.recency === 'balanced') {
    const relevanceBandOrder = Math.round(rightScore * 10) - Math.round(leftScore * 10);
    return relevanceBandOrder || compareRecency(left, right) || scoreOrder;
  }
  return scoreOrder;
}

/**
 * Applies adapter-independent ranking without inventing metadata.
 *
 * - Filename priority adds a 0..1 boost to filename-source matches.
 * - Low recency preserves relevance order.
 * - Balanced recency prefers newer known timestamps inside the same 0.1 relevance band.
 * - High recency prefers known, newer timestamps before relevance.
 * - Exact ties retain the adapter's stable order.
 */
export function rankSearchResults(
  results: readonly SearchResult[],
  preferences: SearchPreferences,
): readonly SearchResult[] {
  return results
    .map((result, index) => ({index, result}))
    .sort((left, right) =>
      compareResults(left.result, right.result, preferences) || left.index - right.index,
    )
    .map(({result}) => result);
}

export function rankSearchGroups(
  groups: readonly SearchGroup[],
  preferences: SearchPreferences,
): readonly SearchGroup[] {
  return groups.map((group) => ({
    ...group,
    items: rankSearchResults(group.items, preferences),
  }));
}
