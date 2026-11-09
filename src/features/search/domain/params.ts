/**
 * The search as an address (docs/SEARCH.md §1): everything the page shows lives in `#/search?…`, so a search can be
 * bookmarked, shared and saved. Keys: q the words · w know/lang · t kinds (comma list) · h + it the place it was opened
 * from (subj:<id>, cur:<id>, course:<id>) and its title · in=1 only there · lg a language · st unread/unsolved/wrong ·
 * c the saved search shown.
 */
import { textOf } from '../../../kernel/text.ts';
export const PARAM_KEYS = Object.freeze(['q', 'w', 't', 'h', 'it', 'in', 'lg', 'st', 'c'] as const);
export type ParamKey = (typeof PARAM_KEYS)[number];
export type SearchParams = Partial<Record<ParamKey, string>>;
/** The keys that make two searches the same search (the title of the place and the collection shown aside). */
const SAME_KEYS: readonly ParamKey[] = ['q', 'w', 't', 'h', 'in', 'lg', 'st'];

/** The search of an address ("#/search?q=…"). */
export function parseParams(hash: string): SearchParams {
  const qs = hash.split('?')[1] ?? '';
  const u = new URLSearchParams(qs),
    P: SearchParams = {};
  for (const k of PARAM_KEYS) {
    const v = u.get(k);
    if (v) P[k] = v;
  }
  return P;
}
/** "?q=…&t=…" of a search ('' when it has nothing). */
export function queryString(P: SearchParams): string {
  const u = new URLSearchParams();
  for (const k of PARAM_KEYS) {
    const v = P[k];
    if (v) u.set(k, v);
  }
  const s = u.toString();
  return s ? '?' + s : '';
}
export const pageHash = (P: SearchParams): string => '#/search' + queryString(P);
/** A comma list ("exercise,card") as its items. */
export const listOf = (s: unknown): string[] => (s == null ? '' : textOf(s)).split(',').filter(Boolean);
/** Are two searches the same (words, side, kinds, place, scope, language, status)? */
export function sameQuery(a: SearchParams | null | undefined, b: SearchParams | null | undefined): boolean {
  return !!a && !!b && SAME_KEYS.every(k => (a[k] ?? '') === (b[k] ?? ''));
}
/** The search without the collection shown (what a saved or a recent search keeps). */
export function savedParams(P: SearchParams): SearchParams {
  const out: SearchParams = {};
  for (const k of PARAM_KEYS) {
    const v = P[k];
    if (v && k !== 'c') out[k] = v;
  }
  return out;
}

/** The place a search was opened from. */
export interface Here {
  readonly kind: 'subj' | 'cur' | 'course';
  readonly id: string;
  readonly title: string;
}
export function hereOf(P: SearchParams): Here | null {
  const m = /^(subj|cur|course):(.+)$/.exec(P.h ?? '');
  if (!m) return null;
  const kind = m[1] as Here['kind'],
    id = m[2] ?? '';
  return { kind, id, title: P.it || id };
}
export const hereParams = (hh: Here | null | undefined): SearchParams => (hh ? { h: `${hh.kind}:${hh.id}`, it: hh.title || '' } : {});
