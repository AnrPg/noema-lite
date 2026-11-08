/**
 * The fields of study: one shared GRAPH, not a tree (docs/VAULT.md §1b). A field may sit under several parents (Medical
 * physics under Physics and under Medicine), a file carries 1–12 fields, and a folder of a field shows every file filed
 * under it or under a field below it. Finding a field works in any language and script, by initials (ml → Machine
 * learning) and with a typo or two; a title names its fields ("Σημειώσεις Γενετικής" → Genetics).
 */
import { fold } from '../../search/domain/fold.ts';
import { forms } from '../../search/domain/translit.ts';
import type { FieldRow } from '../../../ports/vault.ts';

export type { FieldRow, FieldStatus } from '../../../ports/vault.ts';

const WORDS = /[^\p{L}\p{N}]+/u;
const wordsOf = (s: string): string[] => s.split(WORDS).filter(Boolean);

/** Damerau–Levenshtein distance of a and b, or k + 1 as soon as it is more than k. */
function distance(a: string, b: string, k: number): number {
  if (Math.abs(a.length - b.length) > k) return k + 1;
  let p = Array.from({ length: b.length + 1 }, (_, j) => j),
    pp: number[] | null = null;
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    let lo = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min((p[j] ?? 0) + 1, (c[j - 1] ?? 0) + 1, (p[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (pp[j - 2] ?? 0) + 1); // swapped letters count once
      c[j] = v;
      lo = Math.min(lo, v);
    }
    if (lo > k) return k + 1;
    pp = p;
    p = c;
  }
  return p[b.length] ?? k + 1;
}
/** w is a word of v with at most one typo (two in long words), comparing w with v's start of about the same length. */
function near(w: string, v: string): boolean {
  const k = w.length >= 7 ? 2 : 1;
  if (v.length < w.length - k) return false;
  for (const t of new Set([v.slice(0, w.length), v.slice(0, w.length + 1), v.slice(0, Math.max(1, w.length - 1))]))
    if (distance(w, t, k) <= k) return true;
  return false;
}

export interface FieldGraph {
  readonly size: number;
  get(id: string): FieldRow | undefined;
  /** its name in this locale (else the same language of another country, else English, else any) */
  name(id: string, locale: string): string;
  /** every name and alias, in every language */
  allNames(id: string): string[];
  /** the field and every field above it, by any path */
  up(id: string): ReadonlySet<string>;
  /** the accepted or proposed fields right under it */
  children(id: string): string[];
  /** the accepted fields with no parent (the broad fields) */
  roots(): string[];
  /** fields whose names (any language) start with or contain the words; the closest first */
  find(q: string, locale: string, n?: number): string[];
  /** the fields a text names (a title, a course), the most specific first */
  fromText(text: string, locale: string, n?: number): string[];
  /** the graph with one more row (a field I just proposed: mine at once) */
  with(row: FieldRow): FieldGraph;
  rows(): FieldRow[];
}

export function fieldGraph(rows: readonly FieldRow[]): FieldGraph {
  const byId = new Map(rows.map(r => [r.id, r]));
  const kids = new Map<string, string[]>();
  for (const r of rows)
    for (const p of r.parents ?? []) {
      let l = kids.get(p);
      if (!l) kids.set(p, (l = []));
      l.push(r.id);
    }
  const ups = new Map<string, Set<string>>(),
    hay = new Map<string, string[]>(),
    indexes = new Map<string, { words: Map<string, Set<string>>; inits: Map<string, Set<string>> }>();

  const name = (id: string, locale: string): string => {
    const n = byId.get(id)?.names;
    if (!n) return id;
    const b = locale.split('-')[0] ?? locale;
    return n[locale] || n[b] || Object.entries(n).find(([k]) => k.split('-')[0] === b)?.[1] || n['en'] || Object.values(n)[0] || id;
  };
  const allNames = (id: string): string[] => {
    const r = byId.get(id);
    return r ? [...Object.values(r.names ?? {}), ...(r.aliases ?? [])] : [];
  };
  const up = (id: string): Set<string> => {
    let s = ups.get(id);
    if (s) return s;
    s = new Set();
    const st = [id];
    while (st.length) {
      const x = st.pop() as string;
      if (s.has(x)) continue;
      s.add(x);
      for (const p of byId.get(x)?.parents ?? []) st.push(p);
    }
    ups.set(id, s);
    return s;
  };
  const live = (id: string): boolean => {
    const st = byId.get(id)?.status;
    return st === 'accepted' || st === 'proposed';
  };
  const formsOf = (id: string): string[] => {
    let f = hay.get(id);
    if (!f) hay.set(id, (f = allNames(id).flatMap(forms)));
    return f;
  };
  /** every word of every name → its fields, and the initials of the English name and of the name here → its fields */
  const index = (locale: string): { words: Map<string, Set<string>>; inits: Map<string, Set<string>> } => {
    const had = indexes.get(locale);
    if (had) return had;
    const W = new Map<string, Set<string>>(),
      I = new Map<string, Set<string>>();
    const put = (m: Map<string, Set<string>>, k: string, id: string): void => {
      let x = m.get(k);
      if (!x) m.set(k, (x = new Set()));
      x.add(id);
    };
    for (const id of byId.keys()) for (const x of formsOf(id)) for (const w of wordsOf(x)) if (w.length >= 3) put(W, w, id);
    for (const id of byId.keys())
      for (const nm of new Set([byId.get(id)?.names?.['en'], name(id, locale)])) {
        const ws = wordsOf(fold(nm ?? '')).filter(w => w.length > 2);
        if (ws.length >= 2) put(I, ws.map(w => w[0]).join(''), id);
      }
    const ix = { words: W, inits: I };
    indexes.set(locale, ix);
    return ix;
  };

  function find(q: string, locale: string, n = 12): string[] {
    const W = forms((q || '').trim());
    if (!W[0]) return [];
    const out: [number, string][] = [];
    for (const id of byId.keys()) {
      let best = 0;
      for (const x of formsOf(id))
        for (const w of W) {
          const sc = x === w ? 4 : x.startsWith(w) ? 3 : x.includes(' ' + w) ? 2 : x.includes(w) ? 1 : 0;
          if (sc > best) best = sc;
        }
      if (best) out.push([best, id]);
    }
    // and the near misses: initials (ml → Machine learning), then a typo or two (genitcs → Genetics)
    const seen = new Map(out.map(x => [x[1], x]));
    const give = (id: string, sc: number): void => {
      const o = seen.get(id);
      if (o) o[0] = Math.max(o[0], sc);
      else {
        const r: [number, string] = [sc, id];
        seen.set(id, r);
        out.push(r);
      }
    };
    const ix = index(locale),
      q1 = W[0].replace(/\s+/g, ''),
      tw = W[0].split(/\s+/).filter(Boolean);
    if (/^\p{L}{2,5}$/u.test(q1))
      for (const id of ix.inits.get(q1) ?? []) give(id, (q1.length <= 3 ? 3.5 : 2.5) + Math.min(allNames(id).length, 30) / 1000); // the better known first
    if (out.length < n && tw.every(w => w.length >= 4)) {
      const each = tw.map(w => {
        const got = new Set<string>();
        for (const [v, s2] of ix.words) if ((v[0] === w[0] || v[1] === w[1]) && near(w, v)) for (const id of s2) got.add(id);
        return got;
      });
      const [head, ...rest] = each;
      for (const id of head ?? []) if (rest.every(g => g.has(id))) give(id, 0.5);
    }
    return out
      .sort((a, b) => b[0] - a[0] || name(a[1], locale).length - name(b[1], locale).length)
      .slice(0, n)
      .map(x => x[1]);
  }

  function fromText(text: string, locale: string, n = 8): string[] {
    const toks = wordsOf(fold(text));
    if (!toks.length) return [];
    const like = (t: string, w: string): boolean => (w.length >= 5 ? t.startsWith(w.slice(0, Math.max(4, w.length - 2))) : t === w); // endings differ (Γενετική, Γενετικής)
    const hits: [number, number, string][] = [];
    for (const id of byId.keys()) {
      if (byId.get(id)?.status !== 'accepted') continue;
      for (const nm of allNames(id)) {
        const ws = wordsOf(fold(nm));
        if (!ws.length || ws.join('').length < 4) continue;
        if (
          toks.some((_, i) =>
            ws.every((w, j) => {
              const t = toks[i + j];
              return t !== undefined && like(t, w);
            }),
          )
        ) {
          hits.push([ws.length, nm.length, id]);
          break;
        }
      }
    }
    // an abbreviation written in capitals: AI → Artificial intelligence, ML → Machine learning (the English name's initials)
    const caps = new Set((text.match(/\b[A-ZΑ-ΩА-Я]{2,5}\b/gu) ?? []).map(fold));
    if (caps.size)
      for (const id of byId.keys()) {
        if (byId.get(id)?.status !== 'accepted') continue;
        const nm = byId.get(id)?.names?.['en'] ?? '';
        const ws = wordsOf(fold(nm)).filter(w => w.length > 2);
        if (ws.length >= 2 && caps.has(ws.map(w => w[0]).join(''))) hits.push([ws.length, nm.length, id]);
      }
    const sorted = hits.sort((a, b) => b[0] - a[0] || b[1] - a[1]).map(x => x[2]);
    const ids = [...new Set(sorted)].filter(id => !sorted.some(o => o !== id && up(o).has(id))); // Medical physics, not also Physics
    // then the field that begins with a word of the text (systems → Systems engineering), one per word (only when the names
    // gave few: the words of matched names are left out, and so are the fields above a match)
    if (ids.length < 3) {
      const used = new Set(ids.flatMap(id => formsOf(id).join(' ').split(/\s+/)));
      for (const w of [...new Set(toks.filter(t => t.length >= 5 && !used.has(t)))])
        for (const id of find(w, locale, 1))
          if (
            !ids.includes(id) &&
            !ids.some(o => up(o).has(id)) &&
            formsOf(id).some(x => x.startsWith(w.slice(0, Math.max(5, w.length - 2))))
          )
            ids.push(id);
    }
    return ids.slice(0, n);
  }

  return {
    size: byId.size,
    get: id => byId.get(id),
    name,
    allNames,
    up,
    children: id => (kids.get(id) ?? []).filter(live),
    roots: () => [...byId.values()].filter(r => !(r.parents ?? []).length && r.status === 'accepted').map(r => r.id),
    find,
    fromText,
    with: row => fieldGraph([...byId.values(), row]),
    rows: () => [...byId.values()],
  };
}
