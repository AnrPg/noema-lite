/* noema-lite — 文A language help on a section (docs/BRIDGE.md): the rules of what a bridge shows. Pure.

   Three levels: open (glosses under most harder words) · balanced (key terms and rare words) · tap (nothing shown; every
   word opens its card). Help fades: a word glossed in many sections without a look-up loses its gloss; “I know it” removes
   it for good. The first time a subject with help is opened, the learner says their native language (when unknown) and a
   level (A2 → open, B1 → balanced, B2 → tap). */
import { base } from './lookup.ts';

export type HelpLevel = 'open' | 'balanced' | 'tap';
export const LEVELS: readonly HelpLevel[] = Object.freeze(['open', 'balanced', 'tap']);
/** the first-time card's answers: a CEFR level → the help level */
export const CEFR: Readonly<Record<'a2' | 'b1' | 'b2', HelpLevel>> = Object.freeze({ a2: 'open', b1: 'balanced', b2: 'tap' });
/** sections in which a word was glossed without being looked up → its gloss fades */
export const FADE = 8;
/** a look-up keeps a word's gloss this long */
export const LOOK_KEEPS_MS = 14 * 864e5;
/** the parts of speech a card names (bridge.pos.<POS>) */
export const POS: readonly string[] = Object.freeze(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'NUM', 'X', 'SYM', 'INTJ', 'PHRASE']);

/** a:settings.bridge */
export interface BridgeSettings {
  readonly on: boolean;
  readonly level: HelpLevel;
  readonly cefr?: string;
  /** when the first-time card was answered (ms), or 0 */
  readonly asked?: number;
}
export const BRIDGE_DEFAULTS: BridgeSettings = Object.freeze({ on: true, level: 'balanced' });
export function bridgeSettings(stored: unknown): BridgeSettings {
  const s = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const level = LEVELS.includes(s['level'] as HelpLevel) ? (s['level'] as HelpLevel) : BRIDGE_DEFAULTS.level;
  return { ...s, on: typeof s['on'] === 'boolean' ? s['on'] : BRIDGE_DEFAULTS.on, level };
}

/** The learner's state of one word (per source language): known (ms), sections it was glossed in, look-ups, last change. */
export interface WordState {
  known?: number;
  seen?: number;
  look?: number;
  lookAt?: number;
  at?: number;
}
/** a change of a word: a value, undefined (removed) or a function of the old value */
export type WordPatch = { readonly [K in keyof WordState]?: WordState[K] | undefined | ((old: WordState[K]) => WordState[K]) };
export function patchWord(w: WordState | undefined, patch: WordPatch, now: number): WordState {
  const out: Record<string, unknown> = { ...(w ?? {}) };
  for (const [f, v] of Object.entries(patch)) out[f] = typeof v === 'function' ? (v as (o: unknown) => unknown)(out[f]) : v;
  out['at'] = now;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)); // a field set to undefined is removed
}

/* ---------- a bridge's parts ---------- */

export interface Sense {
  readonly id: string | number;
  readonly t?: string;
  readonly note?: string;
  readonly gloss?: string;
  readonly pos?: string;
  readonly st?: string;
  readonly forms?: readonly string[];
}
export interface Entry {
  readonly k: string;
  readonly pos?: string;
  readonly band?: number;
  readonly key?: boolean;
  readonly forms?: readonly string[];
  readonly senses?: readonly Sense[];
}
export interface Anchor {
  readonly at: string;
  readonly k?: string;
  readonly sense?: string | number;
  readonly quote: string;
  readonly prefix?: string;
  readonly suffix?: string;
}
export interface Bridge {
  readonly format?: string;
  readonly pack: string;
  readonly source?: string;
  readonly native: string;
  readonly status?: string;
  readonly coverage?: number;
  readonly everyday?: number;
  readonly chapters?: readonly string[];
  readonly of?: number;
  readonly entries?: readonly Entry[];
  readonly sections?: Readonly<Record<string, { readonly terms?: readonly string[]; readonly preview?: string } | undefined>>;
  readonly anchors?: readonly Anchor[];
}

/** The lookups a page needs of a bridge, built once. */
export interface Prepared {
  readonly bridge: Bridge;
  readonly byK: ReadonlyMap<string, Entry>;
  readonly anchors: Readonly<Record<string, readonly Anchor[]>>;
}
export function prepare(b: Bridge): Prepared {
  const anchors: Record<string, Anchor[]> = {};
  for (const a of b.anchors ?? []) (anchors[a.at.split('/')[0] ?? ''] ??= []).push(a);
  return { bridge: b, byK: new Map((b.entries ?? []).map(e => [e.k, e])), anchors };
}

/** The account index's entry of a bridge (a:bridges): its version stamp and what it covers. hash: a short content hash. */
export interface BridgeSummary {
  readonly v: string;
  readonly status: string | undefined;
  readonly coverage: number | null;
  readonly everyday: number | null;
  readonly chapters: number | null;
  readonly of: number | null;
  readonly previews: number;
  readonly entries: number;
  readonly at: number;
}
export function summary(b: Bridge, hash: (s: string) => string, now: number): BridgeSummary {
  return {
    v: hash(JSON.stringify(b.entries ?? []) + JSON.stringify(b.sections ?? {}) + JSON.stringify(b.anchors ?? [])),
    status: b.status,
    coverage: typeof b.coverage === 'number' ? b.coverage : null,
    everyday: typeof b.everyday === 'number' ? b.everyday : null,
    chapters: (b.chapters ?? []).length || null,
    of: b.of ?? null,
    previews: Object.values(b.sections ?? {}).filter(s => s?.preview).length,
    entries: (b.entries ?? []).length,
    at: now,
  };
}

/* ---------- the languages ---------- */

export interface SubjectLangs {
  readonly language?: string | undefined;
  readonly sourceLanguage?: string | undefined;
  readonly contentLang?: string | undefined;
}
/** The language a subject is written in (own) and the one the learner reads (src): the open subject (with its pack) shows a
    translation when it has sourceLanguage; a card in a list (no pack) will show its contentLang. */
export function langsOf(
  subj: SubjectLangs | null | undefined,
  pack?: { subject?: { language?: string } } | null,
): { own: string; src: string } {
  const own = base(pack?.subject?.language || subj?.sourceLanguage || subj?.language || 'en');
  return { own, src: base(pack ? (subj?.sourceLanguage ? subj.language : own) : subj?.contentLang || own) };
}

/* ---------- a word in a section ---------- */

/** The gloss under a word: the first sense, without what is in brackets (the card has the rest). */
export function gloss(t: string | null | undefined): string {
  const all = t ?? '';
  const s =
    all
      .replace(/\s*[(（][^)）]*[)）]/g, '')
      .split(/\s*[;,/]\s*/)[0]
      ?.trim() || all;
  return s.length > 26 ? s.slice(0, 25) + '…' : s;
}

/** where a match is: the text of its block, the block's id, the match's offset in it and the form found */
export interface MatchPlace {
  readonly blockText: string | null;
  readonly bid: string | undefined;
  readonly offset: number;
  readonly form: string;
}
const squash = (s: string): string => s.replace(/\s+/g, ' ');
/** The sense of a match: an anchor of this block (its quote at this place), else a sense whose own forms hold this form, else
    the first. fold: the word-linking core's folding. */
export function senseAt(p: Prepared, e: Entry, at: MatchPlace, sid: string, fold: (s: string) => string): Sense | null {
  const list = (p.anchors[sid] ?? []).filter(a => a.k === e.k);
  let s: string | null = null;
  if (list.length && at.blockText != null) {
    const text = at.blockText,
      bid = at.bid;
    for (const a of list) {
      const inBlock = a.at.split('/')[1] === bid;
      for (let i = text.indexOf(a.quote); i >= 0; i = text.indexOf(a.quote, i + 1)) {
        if (a.prefix && !squash(text.slice(0, i)).endsWith(squash(a.prefix))) continue;
        if (a.suffix && !squash(text.slice(i + a.quote.length)).startsWith(squash(a.suffix))) continue;
        if (at.offset >= i && at.offset < i + a.quote.length && (inBlock || !list.some(x => x.at.split('/')[1] === bid))) {
          s = String(a.sense);
          break;
        }
      }
      if (s) break;
    }
  }
  const ss = e.senses ?? [],
    f = fold(at.form);
  return ss.find(x => String(x.id) === s) ?? ss.find(x => (x.forms ?? []).some(y => fold(y) === f)) ?? ss[0] ?? null;
}

/** what a match shows: its sense, a gloss (in the learner's language) or none, a class (a known word) */
export interface Pick {
  readonly sense: string;
  readonly gloss?: string;
  readonly glossLang?: string;
  readonly cls: string | null;
}
/** Whether a word gets a gloss here: never when known, at the tap level or after its first time in the section; the open
    level glosses key terms and the harder words (band ≥ 2), balanced only key terms and rare words (band 3); a gloss fades
    after FADE sections without a look-up; a gloss that is the word itself helps nobody. */
export function pickGloss(o: {
  readonly entry: Entry;
  readonly sense: Sense;
  readonly word: WordState | undefined;
  readonly level: HelpLevel;
  readonly first: boolean;
  readonly keyTerm: boolean;
  readonly native: string;
  readonly form: string;
  readonly now: number;
  readonly fold: (s: string) => string;
}): Pick {
  const w = o.word ?? {},
    e = o.entry,
    sense = String(o.sense.id);
  const cls = w.known ? 'nw-known' : null;
  if (w.known || o.level === 'tap' || !o.first) return { sense, cls };
  const faded = (w.seen ?? 0) >= FADE && !((w.look ?? 0) > 0 && o.now - (w.lookAt ?? 0) < LOOK_KEEPS_MS);
  const want = o.level === 'open' ? o.keyTerm || !!e.key || (e.band ?? 2) >= 2 : o.keyTerm || !!e.key || e.band === 3;
  if (!want || faded) return { sense, cls };
  const g = gloss(o.sense.t);
  if (o.fold(g) === o.fold(o.form)) return { sense, cls };
  return { sense, gloss: g, glossLang: o.native, cls };
}

/* ---------- the badge ---------- */

export interface AvailableLike {
  readonly status?: string | undefined;
  readonly coverage?: number | null | undefined;
}
export const partial = (m: AvailableLike): boolean => typeof m.coverage === 'number' && m.coverage < 0.9;
/** The badge of a subject's help: its languages (the learner's first, then by code), whether all are weak (drafts or partial),
    and each as reviewed, a draft or partial (with its coverage). */
export function badge(
  av: Readonly<Record<string, AvailableLike>>,
  mine: string,
): { codes: string[]; weak: boolean; langs: { code: string; kind: 'reviewed' | 'draft' | 'partial'; coverage: number | null }[] } | null {
  const codes = Object.keys(av);
  if (!codes.length) return null;
  codes.sort((a, b) => Number(b === mine) - Number(a === mine) || a.localeCompare(b));
  const weak = codes.every(c => av[c]?.status !== 'reviewed' || partial(av[c] ?? {}));
  return {
    codes,
    weak,
    langs: codes.map(code => {
      const m = av[code] ?? {};
      return { code, kind: partial(m) ? 'partial' : m.status === 'reviewed' ? 'reviewed' : 'draft', coverage: m.coverage ?? null };
    }),
  };
}
