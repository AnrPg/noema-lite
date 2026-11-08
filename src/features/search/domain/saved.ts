/**
 * Saved searches ("collections", synced with the account as a:searches) and the recent searches of this device
 * (docs/SEARCH.md §6). Lists in, lists out: where they are kept is the caller's.
 */
import { textOf } from '../../../kernel/text.ts';
import { sameQuery, savedParams, type SearchParams } from './params.ts';

export interface SavedSearch {
  readonly id: string;
  readonly name: string;
  readonly p: SearchParams;
  /** when it was saved (ISO) */
  readonly at: string;
}

export const NAME_MAX = 80;
export const RECENT_MAX = 8;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** The saved searches of a stored value (anything: what cannot be one is left out). */
export function savedSearches(stored: unknown): SavedSearch[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((c): c is SavedSearch => isObj(c) && typeof c['id'] === 'string' && !!c['id'] && isObj(c['p']) && !!c['p']['q']);
}
/** A name as kept: trimmed, at most 80 characters ('' = no name: nothing is saved). */
export const cleanName = (name: unknown): string => (name == null ? '' : textOf(name)).trim().slice(0, NAME_MAX);

/** A new saved search (the id and the time are given: the caller has the clock and the randomness). */
export function newSavedSearch(P: SearchParams, name: string, id: string, at: string): SavedSearch {
  return { id, name: cleanName(name), p: savedParams(P), at };
}
export const renameSaved = (list: readonly SavedSearch[], id: string, name: string): SavedSearch[] =>
  list.map(x => (x.id === id ? { ...x, name: cleanName(name) } : x));
export const removeSaved = (list: readonly SavedSearch[], id: string): SavedSearch[] => list.filter(x => x.id !== id);
/** The saved search that is this search, if any. */
export const savedFor = (list: readonly SavedSearch[], P: SearchParams): SavedSearch | null => list.find(x => sameQuery(x.p, P)) ?? null;

/** The recent searches of a stored value. */
export function recentSearches(stored: unknown): SearchParams[] {
  return Array.isArray(stored) ? stored.filter((p): p is SearchParams => isObj(p) && typeof p['q'] === 'string' && !!p['q']) : [];
}
/** The recent searches with this one first (once, at most 8); a search of fewer than 2 letters is not remembered. */
export function rememberSearch(list: readonly SearchParams[], P: SearchParams | null | undefined): SearchParams[] {
  if (!P?.q || P.q.length < 2) return [...list];
  const p = savedParams(P);
  return [p, ...list.filter(x => !sameQuery(x, p))].slice(0, RECENT_MAX);
}
