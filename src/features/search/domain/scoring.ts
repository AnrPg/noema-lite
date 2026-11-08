/**
 * The query side of the search (docs/SEARCH.md §2): which records match the learner's words, how well, in which field,
 * and the piece of text shown around the match. Pure: records in, results out; the order of equal scores comes from the
 * caller's `compare` (the I18n port's collation in the app).
 *
 * Matching: every word of the query must appear in the record (in any field), folded (fold.ts) and in any of its forms
 * (translit.ts: original script, plain and scholarly Latin). A word found at the start of a word scores more; so does a
 * match in a title or in the first field; a title or an exact string equal to the query puts the record on top.
 */
import { fold, foldMap } from './fold.ts';
import { forms, hasNonLatin, latin, latinMap, type LatinScheme } from './translit.ts';
import { FIELD_WEIGHT, ORDER, type SearchRecord, type World } from './records.ts';

/** One searchable text of a record: its fields folded and joined (field i starts at o[i]). */
interface Text {
  readonly t: string;
  readonly o: readonly number[];
}
/** A record ready to be searched: its texts (0: folded; 1: plain Latin; 2: scholarly Latin, when they differ). */
interface Prepared {
  readonly texts: readonly Text[];
  readonly title: readonly string[];
  readonly exact: readonly string[];
}
/** Which text a match was found in: 0 the folded text, 1 / 2 its Latin forms. */
export type Via = 0 | 1 | 2;
const SCHEME: Readonly<Record<1 | 2, LatinScheme>> = { 1: 'plain', 2: 'scholarly' };

const SEP = '\u0001';
const PREPARED = new WeakMap<SearchRecord, Prepared>();

function textOf(fields: readonly string[]): Text {
  let t = '';
  const o: number[] = [];
  for (const f of fields) {
    o.push(t.length);
    t += f + SEP;
  }
  return { t, o };
}

/** The record made searchable, once (kept while the record lives). */
export function prepare(r: SearchRecord): Prepared {
  const had = PREPARED.get(r);
  if (had) return had;
  const folded = r.f.map(([, txt]) => fold(txt));
  const texts: Text[] = [textOf(folded)];
  if (folded.some(hasNonLatin)) {
    const plain = textOf(folded.map(f => latin(f, 'plain'))),
      scholarly = textOf(folded.map(f => latin(f, 'scholarly')));
    texts.push(plain);
    if (scholarly.t !== plain.t) texts.push(scholarly);
  }
  const p: Prepared = {
    texts,
    title: forms((r.ti || '').trim()).map(x => x.trim()),
    exact: (r.ex ?? []).flatMap(x => forms(x).map(y => y.trim())).filter(Boolean),
  };
  PREPARED.set(r, p);
  return p;
}

const WORD_START = /[\s\u0001"'([{\-–—/.,;:!?·|→]/;
const isWordStart = (t: string, i: number): boolean => i === 0 || WORD_START.test(t.charAt(i - 1));
function fieldAt(o: readonly number[], pos: number): number {
  let f = 0;
  while (f + 1 < o.length && (o[f + 1] ?? Infinity) <= pos) f++;
  return f;
}
/** The first place w is found at the start of a word, else the first place at all (−1: nowhere). */
function bestAt(t: string, w: string): { readonly at: number; readonly start: boolean } {
  const i = t.indexOf(w);
  if (i < 0) return { at: -1, start: false };
  let j = i;
  while (j >= 0 && !isWordStart(t, j)) j = t.indexOf(w, j + 1);
  return j >= 0 ? { at: j, start: true } : { at: i, start: false };
}

/** The learner's words, folded: the whole query, and each word with its forms. */
export interface Query {
  readonly folded: string;
  readonly forms: readonly string[];
  readonly words: readonly (readonly string[])[];
}
export function queryOf(q: unknown): Query {
  const folded = fold(q).trim();
  return { folded, forms: forms(folded).map(x => x.trim()), words: folded.split(' ').filter(Boolean).map(forms) };
}

export interface Match {
  readonly score: number;
  /** the field of the first word's match, and where in it */
  readonly fi: number;
  readonly at: number;
  readonly via: Via;
  /** the form of the first word that matched */
  readonly form: string;
}

/** One record against the query → how well it matches, or null. */
export function matchRecord(r: SearchRecord, q: Query): Match | null {
  const p = prepare(r);
  let score = 0,
    fi = -1,
    at = -1,
    via: Via = 0,
    form = '';
  for (let k = 0; k < q.words.length; k++) {
    let found: { v: Via; w: string; at: number; start: boolean } | null = null;
    for (let v = 0; v < p.texts.length && !found?.start; v++) {
      const text = p.texts[v];
      if (!text) continue;
      for (const w of q.words[k] ?? []) {
        const b = bestAt(text.t, w);
        if (b.at < 0) continue;
        if (!found || (b.start && !found.start)) found = { v: v as Via, w, at: b.at, start: b.start };
        if (b.start) break;
      }
    }
    if (!found) return null;
    const text = p.texts[found.v] as Text,
      f = fieldAt(text.o, found.at),
      name = r.f[f]?.[0] ?? '';
    score += found.start ? 8 : 2;
    score += FIELD_WEIGHT[name] ?? (f === 0 ? 14 : 4);
    if (k === 0) {
      fi = f;
      at = found.at - (text.o[f] ?? 0);
      via = found.v;
      form = found.w;
    }
  }
  if (p.title.some(t => q.forms.includes(t))) score += 1000;
  else if (p.title.some(t => q.forms.some(x => t.startsWith(x)))) score += 60;
  if (p.exact.some(t => q.forms.includes(t))) score += 900;
  return { score, fi, at, via, form };
}

/** Is the record's title, or one of its exact strings, the query itself (in any form)? */
export function isExact(r: SearchRecord, q: Query): boolean {
  const p = prepare(r);
  return p.title.some(t => q.forms.includes(t)) || p.exact.some(t => q.forms.includes(t));
}

export interface SearchFilters {
  /** only this side ('' or absent: both) */
  readonly w?: World | '';
  /** only these kinds */
  readonly types?: readonly string[];
  /** only records in one of these languages */
  readonly langs?: readonly string[];
  /** any other test (the scope, the learner's status: filters.ts keeper) */
  readonly keep?: ((r: SearchRecord) => boolean) | null;
}

export interface SearchHit extends Match {
  readonly r: SearchRecord;
}
export interface SearchResults {
  /** the records equal to the query (words first), at most 6 */
  readonly exact: SearchHit[];
  /** [kind, hits] in the fixed order of ORDER, each list by score */
  readonly groups: [string, SearchHit[]][];
  readonly total: number;
  readonly q: string;
}

const byText = (a: string, b: string): number => a.localeCompare(b);

/** Search records with the learner's words (at least 2 letters). */
export function search(
  records: Iterable<SearchRecord>,
  q: unknown,
  filters: SearchFilters = {},
  compare: (a: string, b: string) => number = byText,
): SearchResults {
  const query = queryOf(q);
  if (!query.words.length || query.folded.length < 2) return { exact: [], groups: [], total: 0, q: query.folded };
  const types = filters.types?.length ? new Set(filters.types) : null,
    langs = filters.langs?.length ? filters.langs : null,
    byType = new Map<string, SearchHit[]>(),
    exact: SearchHit[] = [];
  let total = 0;
  for (const r of records) {
    if (filters.w && r.w !== filters.w) continue;
    if (types && !types.has(r.ty)) continue;
    if (langs && !(r.lg ?? []).some(l => langs.includes(l))) continue;
    const m = matchRecord(r, query);
    if (!m) continue;
    if (filters.keep && !filters.keep(r)) continue;
    const hit: SearchHit = { r, ...m };
    total++;
    if (isExact(r, query)) exact.push(hit);
    let list = byType.get(r.ty);
    if (!list) byType.set(r.ty, (list = []));
    list.push(hit);
  }
  for (const l of byType.values()) l.sort((a, b) => b.score - a.score || compare(a.r.ti, b.r.ti));
  exact.sort((a, b) => (a.r.ty === 'word' ? 0 : 1) - (b.r.ty === 'word' ? 0 : 1) || b.score - a.score);
  const groups = ORDER.filter(t => byType.has(t)).map((t): [string, SearchHit[]] => [t, byType.get(t) ?? []]);
  return { exact: exact.slice(0, 6), groups, total, q: query.folded };
}

/** A piece of a field around a match: the hit as written (accents and all), a little before and after. */
export interface Snippet {
  readonly field: string;
  readonly pre: string;
  readonly hit: string;
  readonly post: string;
}

/** [start, end) in the original text of `form` found in it near `at` (a position in the folded or Latin text). */
function spanOf(text: string, form: string, via: Via, at: number): readonly [number, number] | null {
  const fm = foldMap(text);
  let fs: number, fe: number;
  if (via === 0) {
    let p = at;
    if (fm.t.slice(p, p + form.length) !== form) p = fm.t.indexOf(form);
    if (p < 0) return null;
    fs = p;
    fe = p + form.length;
  } else {
    const lm = latinMap(fm.t, SCHEME[via]);
    let p = at;
    if (lm.t.slice(p, p + form.length) !== form) p = lm.t.indexOf(form);
    if (p < 0 || !form.length) return null;
    fs = lm.map[p] ?? 0;
    fe = (lm.map[p + form.length - 1] ?? fs) + 1;
  }
  const last = fm.map.length - 1;
  return [fm.map[Math.min(fs, last)] ?? 0, fm.map[Math.min(fe, last)] ?? text.length];
}

/** The snippet of a field: `room` characters before (fewer, to a word's start), 1.5 × after. */
export function snippet(field: string, text: string, form: string, via: Via, at: number, room = 60): Snippet {
  const span = spanOf(text, form, via, at);
  if (!span) return { field, pre: '', hit: '', post: text.slice(0, room * 2) };
  const [s, e] = span;
  let a = Math.max(0, s - room),
    b = Math.min(text.length, e + room * 1.5);
  if (a > 0) {
    const sp = text.lastIndexOf(' ', s - room * 0.6);
    if (sp > a - 20 && sp > 0) a = sp + 1;
  }
  if (b < text.length) {
    const sp = text.indexOf(' ', b);
    if (sp > 0 && sp - b < 20) b = sp;
  }
  return {
    field,
    pre: (a > 0 ? '…' : '') + text.slice(a, s),
    hit: text.slice(s, e),
    post: text.slice(e, b) + (b < text.length ? '…' : ''),
  };
}

/** The snippet of one result (made only for the results shown). */
export function snip(hit: SearchHit): Snippet {
  const [name, text] = hit.r.f[hit.fi] ?? hit.r.f[0] ?? ['', ''];
  return snippet(name, text, hit.form, hit.via, hit.at);
}

/** Is the text the record's title (folded)? A result found in its title shows no snippet: the title says it. */
export const sameText = (a: unknown, b: unknown): boolean => fold(a).trim() === fold(b).trim();
