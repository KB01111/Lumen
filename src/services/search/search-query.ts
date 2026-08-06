export const SEARCH_QUERY_MAX_CHARACTERS = 4_000;

export function searchQueryCharacterCount(value: string) {
  return Array.from(value).length;
}

export function isSearchQueryWithinLimit(value: string) {
  return searchQueryCharacterCount(value) <= SEARCH_QUERY_MAX_CHARACTERS;
}

export function limitSearchQuery(value: string) {
  if (value.length <= SEARCH_QUERY_MAX_CHARACTERS) {
    return value;
  }
  return Array.from(value).slice(0, SEARCH_QUERY_MAX_CHARACTERS).join('');
}
