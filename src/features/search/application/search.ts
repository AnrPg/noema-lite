/**
 * The search as the app runs it (docs/SEARCH.md): the query domain with the learner's collation (results of equal score
 * in the order of the interface language). The records come from whoever holds the index (NoemaCore.catalog: src/features/catalog,
 * its records built in the Worker); this side never builds or stores them.
 */
import type { I18n } from '../../../ports/i18n.ts';
import type { SearchRecord } from '../domain/records.ts';
import { search, type SearchFilters, type SearchResults } from '../domain/scoring.ts';

export interface SearchService {
  search(records: Iterable<SearchRecord>, q: unknown, filters?: SearchFilters): SearchResults;
}

export function searchService({ i18n }: { i18n: Pick<I18n, 'format'> }): SearchService {
  return {
    search: (records, q, filters = {}) => search(records, q, filters, (a, b) => i18n.format.compare(a, b)),
  };
}
