/* noema-lite — a Roadmap in several languages (docs/CURRICULUM.md §10): c.i18n[locale] = { title, goal, at, nodes: { <step>:
   { title, summary, learningGoals, domains, chapters: { <ref>: title | { title, goals, coverage } } } } }.
   Which locale a reader sees (their UI locale's chain, never English for someone else), the drawn copies, the check of a
   translation Claude sends (English diagnostics), merging, what is still to translate, and what an edit drops. */
import type { ChapterLocale, Roadmap, RoadmapLocale, Step, StepLocale } from './model.ts';
import { ms } from './model.ts';

export const I18N_FIELDS = ['title', 'summary', 'learningGoals', 'domains', 'chapters'] as const;
type Field = (typeof I18N_FIELDS)[number];

/** Now as an ISO stamp, but always later than every stamp it supersedes (clock drift between devices, the same millisecond):
    the merge of two copies orders plans, re-plan requests and translations by these stamps. */
export function stampAfter(now: number, ...prev: (string | null | undefined)[]): string {
  return new Date(Math.max(now, ...prev.map(v => ms(v) + 1))).toISOString();
}

/** One chapter's translation, as stored: a title alone ("…") or { title, goals, coverage } → always the object form. */
export const chT = (v: unknown): ChapterLocale =>
  typeof v === 'string' ? { title: v } : v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const sameLen = (t: unknown, own: readonly unknown[] | undefined): t is string[] =>
  Array.isArray(t) && Array.isArray(own) && t.length === own.length && t.every(x => typeof x === 'string' && !!x.trim());
const key = (t: string): string => (t || 'en').split('-')[0]?.toLowerCase() ?? 'en';

/** The locale of c.i18n to show to a reader whose UI locale is `ui` with the fallback chain `chain` (I18n port), or null: the
    own texts. English is a fallback only for an English reader. */
export function trLocale(c: Pick<Roadmap, 'i18n' | 'language'> | null | undefined, ui: string, chain: readonly string[]): string | null {
  const keys = Object.keys(c?.i18n ?? {});
  if (!c || !keys.length) return null;
  const want = (chain.length ? chain : [ui]).filter(t => t !== 'en' || key(ui) === 'en');
  for (const t of want) {
    if (t.toLowerCase() === (c.language ?? 'en').toLowerCase()) return null;
    const k = keys.find(x => x.toLowerCase() === t.toLowerCase());
    if (k) return k;
  }
  return null;
}

/** The Roadmap's title in a locale (null: its own). */
export function shownTitle(c: Pick<Roadmap, 'i18n' | 'title' | 'goal'> | null | undefined, loc: string | null): string {
  const T = loc ? c?.i18n?.[loc] : undefined;
  return (typeof T?.title === 'string' && T.title.trim() ? T.title : '') || c?.title || c?.goal || '';
}

/** A step as a locale reads it: a copy with what c.i18n translates of it (for drawing only — never stored). */
export function shownNode(c: Pick<Roadmap, 'i18n' | 'nodes'>, id: string, loc: string | null): Step | undefined {
  const n = c.nodes[id];
  if (!n || !loc) return n;
  const T = c.i18n?.[loc]?.nodes?.[id];
  if (!T) return n;
  const out: Step = { ...n };
  if (typeof T.title === 'string' && T.title.trim()) out.title = T.title;
  if (typeof T.summary === 'string' && T.summary.trim() && n.summary) out.summary = T.summary;
  if (Array.isArray(T.learningGoals) && T.learningGoals.length === (n.learningGoals ?? []).length) out.learningGoals = T.learningGoals;
  if (sameLen(T.domains, n.domains)) out.domains = T.domains;
  const tc = T.chapters;
  if (tc && Array.isArray(n.chapters))
    out.chapters = n.chapters.map(ch => {
      const t = chT(tc[ch.ref]),
        x = { ...ch };
      if (typeof t.title === 'string' && t.title.trim()) x.title = t.title;
      if (sameLen(t.goals, ch.goals)) x.goals = t.goals;
      if (sameLen(t.coverage, ch.coverage)) x.coverage = t.coverage;
      return x;
    });
  return out;
}

const LOCALE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Check one locale's translation of a Roadmap (all of it, or only some steps) → English diagnostics for Claude ([] = good). */
export function checkI18n(c: Pick<Roadmap, 'language' | 'nodes'>, loc: string, d: unknown): string[] {
  const E: string[] = [];
  if (!LOCALE.test(loc)) E.push('locale: a language code such as el, ru, en');
  else if (key(loc) === key(c.language ?? 'en')) E.push(`locale "${loc}" is the Roadmap's own language`);
  if (!isObj(d))
    return [
      ...E,
      'the translation must be a JSON object { title, goal, nodes: { <step id>: { title, summary, learningGoals, domains, chapters: { <chapter ref>: { title, goals, coverage } } } } }',
    ];
  for (const k of ['title', 'goal']) if (d[k] != null && typeof d[k] !== 'string') E.push(`${k} must be a string`);
  for (const [id, T] of Object.entries(isObj(d.nodes) ? d.nodes : {})) {
    const n = Object.prototype.hasOwnProperty.call(c.nodes, id) ? c.nodes[id] : undefined;
    if (!n) {
      E.push(`nodes.${id}: no such step (use the step ids of the Roadmap)`);
      continue;
    }
    if (!isObj(T)) {
      E.push(`nodes.${id} must be an object`);
      continue;
    }
    for (const k of Object.keys(T))
      if (!(I18N_FIELDS as readonly string[]).includes(k)) E.push(`nodes.${id}.${k}: unknown field (only ${I18N_FIELDS.join(', ')})`);
    if (T.title != null && !(typeof T.title === 'string' && T.title.trim())) E.push(`nodes.${id}.title must be a non-empty string`);
    if (T.summary != null && typeof T.summary !== 'string') E.push(`nodes.${id}.summary must be a string`);
    if (T.learningGoals != null && !sameLen(T.learningGoals, n.learningGoals ?? []))
      E.push(`nodes.${id}.learningGoals: ${(n.learningGoals ?? []).length} strings, one per learning goal of the step, in the same order`);
    if (T.domains != null && !sameLen(T.domains, n.domains ?? []))
      E.push(`nodes.${id}.domains: ${(n.domains ?? []).length} strings, one per domain of the step, in the same order`);
    if (T.chapters == null) continue;
    if (!isObj(T.chapters)) {
      E.push(`nodes.${id}.chapters must be { <chapter ref>: { title, goals, coverage } }`);
      continue;
    }
    const byRef = new Map((n.chapters ?? []).map(ch => [ch.ref, ch]));
    for (const [r, v] of Object.entries(T.chapters)) {
      const ch = byRef.get(r),
        at = `nodes.${id}.chapters.${r}`;
      if (!ch) {
        E.push(`${at}: no such chapter (refs: ${[...byRef.keys()].join(', ') || 'none planned yet'})`);
        continue;
      }
      if (typeof v === 'string') {
        if (!v.trim()) E.push(`${at} must be a non-empty string`);
        continue;
      }
      if (!isObj(v)) {
        E.push(`${at} must be { title, goals, coverage } (or the title alone)`);
        continue;
      }
      for (const k of Object.keys(v))
        if (!['title', 'goals', 'coverage'].includes(k)) E.push(`${at}.${k}: unknown field (only title, goals, coverage)`);
      if (v.title != null && !(typeof v.title === 'string' && v.title.trim())) E.push(`${at}.title must be a non-empty string`);
      for (const k of ['goals', 'coverage'] as const)
        if (v[k] != null && !sameLen(v[k], ch[k] ?? []))
          E.push(
            `${at}.${k}: ${(ch[k] ?? []).length} strings, one per ${k === 'goals' ? 'teaching goal' : 'coverage item'} of the chapter, in the same order`,
          );
    }
  }
  return E;
}

/** Merge one locale's checked translation into the draft's c.i18n (only the fields given; the rest stays). */
export function setI18n(c: Roadmap, loc: string, d: Record<string, unknown>, now: number): Roadmap {
  const all = (c.i18n ??= {}),
    cur: RoadmapLocale = (all[loc] ??= {});
  cur.at = stampAfter(now, cur.at);
  for (const k of ['title', 'goal'] as const) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) cur[k] = v.trim();
  }
  for (const [id, raw] of Object.entries(isObj(d.nodes) ? d.nodes : {})) {
    if (!Object.prototype.hasOwnProperty.call(c.nodes, id) || !isObj(raw)) continue;
    const T = raw as StepLocale,
      nodes = (cur.nodes ??= {}),
      x: StepLocale = { ...(nodes[id] ?? {}) };
    nodes[id] = x;
    for (const k of I18N_FIELDS) {
      if (T[k] == null) continue;
      if (k === 'chapters') {
        const given = T.chapters ?? {},
          merged = { ...(x.chapters ?? {}), ...given };
        x.chapters = Object.fromEntries(
          Object.entries(merged).map(([r, v]) => [r, given[r] != null ? { ...chT(x.chapters?.[r]), ...chT(v) } : chT(v)]),
        );
      } else (x as Record<Field, unknown>)[k] = T[k];
    }
  }
  return c;
}

export interface I18nTodo {
  title: boolean;
  nodes: string[];
  goals: string[];
  domains: string[];
  chapters: string[];
}
/** What is still untranslated in a locale (a chapter counts as translated with its title, teaching goals and coverage). */
export function i18nTodo(c: Pick<Roadmap, 'i18n' | 'nodes'>, loc: string): I18nTodo {
  const T = c.i18n?.[loc] ?? {},
    N = T.nodes ?? {},
    ids = Object.keys(c.nodes);
  const chDone = (id: string, ch: NonNullable<Step['chapters']>[number]): boolean => {
    const t = chT(N[id]?.chapters?.[ch.ref]);
    return !!t.title && (['goals', 'coverage'] as const).every(k => !(ch[k] ?? []).length || sameLen(t[k], ch[k]));
  };
  const node = (id: string): Step => c.nodes[id] as Step;
  return {
    title: !T.title,
    nodes: ids.filter(id => !N[id]?.title),
    goals: ids.filter(
      id => (node(id).learningGoals ?? []).length && (N[id]?.learningGoals ?? []).length !== (node(id).learningGoals ?? []).length,
    ),
    domains: ids.filter(id => (node(id).domains ?? []).length && !sameLen(N[id]?.domains, node(id).domains)),
    chapters: ids.filter(id => (node(id).chapters ?? []).some(ch => !chDone(id, ch))),
  };
}

/** A step's own texts changed: its translations of those fields no longer fit (mutates the draft). */
export function dropI18n(c: Roadmap, id: string, fields: readonly string[], now: number): void {
  for (const L of Object.values(c.i18n ?? {})) {
    const x = L.nodes?.[id];
    if (!x || !fields.some(k => k in x)) continue;
    for (const k of fields) Reflect.deleteProperty(x, k);
    if (!Object.keys(x).length && L.nodes) Reflect.deleteProperty(L.nodes, id);
    L.at = stampAfter(now, L.at);
  }
}

/** A step's translations move with it to another id (a split or a merge keeps every word already translated). */
export function moveI18n(c: Roadmap, from: string, to: string, { chapters }: { chapters?: readonly string[] } = {}): void {
  for (const L of Object.values(c.i18n ?? {})) {
    const x = L.nodes?.[from];
    if (!x || !L.nodes) continue;
    if (!chapters) {
      L.nodes[to] = { ...(L.nodes[to] ?? {}), ...x };
      continue;
    }
    const moved = Object.fromEntries(Object.entries(x.chapters ?? {}).filter(([r]) => chapters.includes(r)));
    if (Object.keys(moved).length) L.nodes[to] = { ...(L.nodes[to] ?? {}), chapters: { ...(L.nodes[to]?.chapters ?? {}), ...moved } };
  }
}
