/* noema-lite — what may change on a step after it is planned or prepared (docs/CURRICULUM.md §2c, §10b):
     · 📑 chapters added to a step (noema_add_roadmap_chapters, and an upload whose pack has chapters the plan lacks): a pack
       may teach more than its plan because the learner asked for more while it was built. Added chapters go at a named place;
       nothing is removed or reordered, the pack, the prepared state, the links and the other steps never change. Each chapter
       added carries its stamp (addedAt), so two copies of the Roadmap agree: a chapter one copy has and the other does not
       comes over in mergePlans — even on a prepared step, whose plan is otherwise fixed.
     · 🌐 the languages of a Roadmap (noema_set_roadmap_languages): which full translations and which 文A pairs its packs and
       its own words get. Without it, the pack rules' default (every pack: en, el, ru, de, fr and every bridge pair). */
import type { PlannedChapter, Roadmap, Step } from './model.ts';
import { clone, ms, own } from './model.ts';
import { stampAfter } from './i18n.ts';

/* ---------- 📑 chapters added to a step ---------- */

/** One chapter to add, as Claude sends it: its ref, title, teaching goals, coverage and its place (after / before a ref, or
    "start" / "end"). */
export interface ChapterAdd {
  ref: string;
  title: string;
  goals?: string[];
  coverage?: string[];
  material?: string;
  level?: string;
  after?: string;
  before?: string;
  position?: 'start' | 'end';
}
export interface ChaptersEntry {
  v: 1;
  kind: 'chapters';
  nid: string;
  chapters: ChapterAdd[];
  /** the step's pack lined up with its plan (matchChapters) */
  match?: { ref: string; id: string; title: string }[];
  at: string;
  via?: string;
  why?: string;
}

const REF = /^[a-z][a-z0-9_]{0,63}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && !!x.trim());
/** Two titles name the same chapter: the same words, whatever the case, accents and punctuation. */
export const sameTitle = (a: unknown, b: unknown): boolean => {
  const f = (t: unknown): string =>
    (typeof t === 'string' ? t : '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return !!f(a) && f(a) === f(b);
};
/** The same chapter again (a repeated request): same ref and same title. */
const sameChapter = (have: PlannedChapter, x: ChapterAdd): boolean => have.ref === x.ref && sameTitle(have.title, x.title);

/** Check chapters to add to step `nid` → { errors, fresh: the chapters not there yet, already: refs already there (the same
    chapter: a repeated request does nothing) }. Places name a ref of the step or a chapter added before it in the same list. */
export function checkAddChapters(
  c: Pick<Roadmap, 'nodes'>,
  nid: string,
  list: unknown,
): { errors: string[]; fresh: ChapterAdd[]; already: string[] } {
  const errors: string[] = [],
    fresh: ChapterAdd[] = [],
    already: string[] = [];
  const n = own(c.nodes, nid) ? c.nodes[nid] : undefined;
  if (!n) return { errors: [`no step "${nid}" on this Roadmap (noema_roadmap_map lists the "@id"s)`], fresh, already };
  if (!Array.isArray(list) || !list.length) return { errors: ['chapters: a list of one or more chapters to add'], fresh, already };
  const have = n.chapters ?? [],
    refs = new Set(have.map(ch => ch.ref)),
    seen = new Set<string>();
  list.forEach((raw, i) => {
    const at = `chapters[${i}]`;
    if (!isObj(raw)) {
      errors.push(`${at} must be { ref, title, goals, coverage, after | before | position }`);
      return;
    }
    const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '',
      title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!REF.test(ref)) errors.push(`${at}.ref: a lowercase ref (letters, digits, underscores; starts with a letter), e.g. "transformers"`);
    if (!title) errors.push(`${at}.title: an empty title — every chapter needs its title`);
    for (const k of ['goals', 'coverage'] as const)
      if (raw[k] != null && !strs(raw[k])) errors.push(`${at}.${k}: a list of non-empty strings`);
    if (raw.material != null && typeof raw.material !== 'string') errors.push(`${at}.material must be a string (file + pages)`);
    if (raw.level != null && typeof raw.level !== 'string') errors.push(`${at}.level must be a level id`);
    const places = ['after', 'before', 'position'].filter(k => raw[k] != null);
    if (places.length > 1) errors.push(`${at}: give ONE place — after, before or position`);
    if (raw.position != null && raw.position !== 'start' && raw.position !== 'end')
      errors.push(`${at}.position: "start" or "end" (or use after / before with a chapter ref)`);
    for (const k of ['after', 'before'] as const) {
      const v = raw[k];
      if (v == null) continue;
      if (typeof v !== 'string' || !(refs.has(v) || seen.has(v)))
        errors.push(
          `${at}.${k}: unknown position "${typeof v === 'string' ? v : JSON.stringify(v)}" — a chapter ref of the step (${[...refs].join(', ') || 'none yet'}) or one added before it in this list`,
        );
    }
    if (!ref || !title) return;
    if (seen.has(ref)) {
      errors.push(`${at}.ref: "${ref}" is in the list twice`);
      return;
    }
    seen.add(ref);
    const old = have.find(ch => ch.ref === ref);
    const x: ChapterAdd = {
      ref,
      title,
      ...(strs(raw.goals) ? { goals: raw.goals.map(t => t.trim()) } : {}),
      ...(strs(raw.coverage) ? { coverage: raw.coverage.map(t => t.trim()) } : {}),
      ...(typeof raw.material === 'string' && raw.material.trim() ? { material: raw.material.trim() } : {}),
      ...(typeof raw.level === 'string' && raw.level ? { level: raw.level } : {}),
      ...(typeof raw.after === 'string' ? { after: raw.after } : {}),
      ...(typeof raw.before === 'string' ? { before: raw.before } : {}),
      ...(raw.position === 'start' || raw.position === 'end' ? { position: raw.position } : {}),
    };
    if (old) {
      if (sameChapter(old, x)) already.push(ref);
      else errors.push(`${at}.ref: the step already has a chapter "${ref}" (“${old.title}”) — choose another ref`);
      return;
    }
    const twin = [...have, ...fresh].find(ch => sameTitle(ch.title, title));
    if (twin) {
      errors.push(`${at}.title: the step already has “${twin.title}” (ref "${twin.ref}") — the same chapter is not added twice`);
      return;
    }
    fresh.push(x);
  });
  return { errors, fresh, already };
}

/** Where a chapter goes in a list of chapters: its index. */
function placeOf(list: readonly PlannedChapter[], x: Pick<ChapterAdd, 'after' | 'before' | 'position'>): number {
  if (x.position === 'start') return 0;
  if (x.after) {
    const i = list.findIndex(ch => ch.ref === x.after);
    if (i >= 0) return i + 1;
  }
  if (x.before) {
    const i = list.findIndex(ch => ch.ref === x.before);
    if (i >= 0) return i;
  }
  return list.length;
}

/** Add checked chapters to a step (mutates the draft) → the refs added. The step's state, its pack, the links and the other
    steps do not change; a chapter already there (same ref) is left as it is. */
export function addChapters(c: Roadmap, nid: string, add: readonly ChapterAdd[], now: number): string[] {
  const n = c.nodes[nid];
  if (!n) return [];
  const list = [...(n.chapters ?? [])],
    done: string[] = [];
  let at: string | undefined = n.chaptersAt;
  for (const x of add) {
    if (list.some(ch => ch.ref === x.ref)) continue;
    const stamp = stampAfter(now, at, n.plannedAt, n.replanAt); // later than the plan it joins, whatever the clocks
    at = stamp;
    const i = placeOf(list, x);
    const ch: PlannedChapter = {
      ref: x.ref,
      title: x.title,
      ...(x.goals?.length ? { goals: [...x.goals] } : {}),
      ...(x.coverage?.length ? { coverage: [...x.coverage] } : {}),
      ...(x.material ? { material: x.material } : {}),
      ...(x.level ? { level: x.level } : {}),
      addedAt: stamp,
      addedAfter: i > 0 ? (list[i - 1]?.ref ?? null) : null,
    };
    list.splice(i, 0, ch);
    done.push(x.ref);
  }
  if (done.length) {
    n.chapters = list;
    if (at) n.chaptersAt = at;
  }
  return done;
}

/** The entry that carries chapters added to a step (the inbox, and the direct write into the Roadmap). */
export const chaptersEntry = (
  nid: string,
  add: readonly ChapterAdd[],
  now: number,
  why = '',
  match: readonly { ref: string; id: string; title: string }[] = [],
): ChaptersEntry => ({
  v: 1,
  kind: 'chapters',
  nid,
  chapters: clone([...add]),
  ...(match.length ? { match: clone([...match]) } : {}),
  at: new Date(now).toISOString(),
  via: 'claude-app',
  ...(why ? { why } : {}),
});
/** Can the entry still be applied to this copy? [] when it can, ['applied'] when every chapter is there, else the problems. */
export function chaptersProblems(c: Roadmap, e: Partial<ChaptersEntry>): string[] {
  if (typeof e.nid !== 'string' || !Array.isArray(e.chapters)) return ['not a list of chapters for a step'];
  if (!e.chapters.length && Array.isArray(e.match)) return c.nodes[e.nid]?.chapters?.length ? [] : ['no planned chapters to line up'];
  const r = checkAddChapters(c, e.nid, e.chapters);
  if (r.errors.length) return r.errors;
  return r.fresh.length ? [] : ['applied'];
}

/** mergePlans for added chapters: the chapters either copy added to a step (each with its addedAt) that are newer than this
    copy's plan, rebuilt on the planned chapters in one order every copy agrees on — oldest addition first (then by ref), each
    after the chapter it was put after — even on a prepared step. `o` may be this step's own earlier state. → true when c changed. */
export function mergeAddedChapters(n: Step, o: Pick<Step, 'chapters' | 'chaptersAt'>): boolean {
  if (ms(o.chaptersAt) <= 0 || !o.chapters?.length) return false;
  const since = Math.max(ms(n.plannedAt), ms(n.replanAt)), // a plan made later than a chapter was added replaces it
    mine = n.chapters ?? [],
    added = new Map<string, PlannedChapter>();
  for (const ch of [...mine, ...o.chapters])
    if (typeof ch.addedAt === 'string' && ms(ch.addedAt) > since && !added.has(ch.ref)) added.set(ch.ref, clone(ch));
  const base = mine.filter(ch => !added.has(ch.ref));
  const list = [...base];
  const extra = [...added.values()]
    .filter(ch => !base.some(b => sameTitle(b.title, ch.title)))
    .sort((a, b) => ms(a.addedAt) - ms(b.addedAt) || a.ref.localeCompare(b.ref));
  for (const ch of extra) {
    const prev = ch.addedAfter;
    const k = typeof prev === 'string' ? list.findIndex(x => x.ref === prev) : -1;
    list.splice(prev === null ? 0 : k >= 0 ? k + 1 : list.length, 0, ch);
  }
  // the pack lined up with the plan on the other copy (matchChapters): the later lining up wins
  let lined = false;
  for (const x of o.chapters) {
    const p = x.pack as { at?: string } | undefined,
      ch = list.find(y => y.ref === x.ref);
    if (ch && p && ms(p.at) > ms((ch.pack as { at?: string } | undefined)?.at)) {
      ch.pack = clone(x.pack);
      lined = true;
    }
  }
  const same = list.length === mine.length && list.every((ch, i) => ch.ref === mine[i]?.ref);
  if (same) {
    if (lined) n.chapters = list;
    return lined;
  }
  n.chapters = list;
  n.chaptersAt = stampAfter(0, n.chaptersAt, o.chaptersAt);
  return true;
}

/* ---------- 📑 the chapters of a pack that its step's plan lacks (an upload) ---------- */

/** A pack's chapters as an upload reads them. */
export interface UploadChapter {
  id?: string;
  ref?: string;
  title?: string;
  objectives?: unknown;
  sections?: { title?: unknown }[];
}
/** How a pack's chapters line up with its step's planned chapters (an upload, or noema_add_roadmap_chapters from_pack):
    pairs — each planned chapter and the pack's chapter that teaches it (same: the same title); extra — the pack's chapters the
    plan lacks, each placed after the planned chapter the pack puts before it; unplanned — planned refs no chapter of the pack
    lines up with; unpaired — the pack's chapters left over when the plan cannot be lined up whole. Matched in order: first by
    ref (a pack chapter's ref or id that is a planned ref) or the same title, then by close titles (most of the words), then by
    place (the same number of chapters between two matches, or the same number of chapters in all) — so one changed title never
    drops the step's chapter list. */
export interface PackAlignment {
  pairs: { ref: string; index: number; id: string; title: string; same: boolean }[];
  extra: ChapterAdd[];
  unplanned: string[];
  unpaired: number[];
}
const words = (t: unknown): Set<string> =>
  new Set(
    (typeof t === 'string' ? t : '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 3),
  );
/** two titles share most of their words (Jaccard >= 0.5) */
export const closeTitle = (a: unknown, b: unknown): boolean => {
  const A = words(a),
    B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both) >= 0.5;
};
export function alignPackChapters(plan: readonly PlannedChapter[], chapters: readonly UploadChapter[]): PackAlignment {
  const m = new Array<number>(chapters.length).fill(-1); // pack index → plan index
  const refOf = (pc: UploadChapter): string => (typeof pc.ref === 'string' ? pc.ref : typeof pc.id === 'string' ? pc.id : '');
  // a monotone pass over the gaps that are still open: each pack chapter to the first open plan chapter after the last match
  const pass = (ok: (ch: PlannedChapter, pc: UploadChapter) => boolean): void => {
    let j = 0;
    chapters.forEach((pc, i) => {
      if (m[i] !== -1) {
        j = (m[i] ?? 0) + 1;
        return;
      }
      const next = m.slice(i + 1).find(x => x !== -1) ?? plan.length; // never past the next match: the order holds
      for (let k = j; k < next; k++)
        if (!m.includes(k) && ok(plan[k] as PlannedChapter, pc)) {
          m[i] = k;
          j = k + 1;
          return;
        }
    });
  };
  pass((ch, pc) => !!refOf(pc) && refOf(pc) === ch.ref);
  pass((ch, pc) => sameTitle(ch.title, pc.title));
  pass((ch, pc) => closeTitle(ch.title, pc.title));
  // by place: between two matches (and before the first, after the last) the same number of chapters on both sides
  let pi = -1,
    ki = -1;
  for (let i = 0; i <= chapters.length; i++) {
    if (i < chapters.length && m[i] === -1) continue;
    const k = i < chapters.length ? (m[i] as number) : plan.length;
    const packGap = Array.from({ length: i - pi - 1 }, (_, x) => pi + 1 + x),
      planGap = Array.from({ length: k - ki - 1 }, (_, x) => ki + 1 + x);
    if (packGap.length && packGap.length === planGap.length) packGap.forEach((x, y) => (m[x] = planGap[y] as number));
    pi = i;
    ki = k;
  }
  const pairs = chapters
    .map((pc, i) => ({ pc, i, k: m[i] as number }))
    .filter(x => x.k >= 0)
    .map(({ pc, i, k }) => ({
      ref: plan[k]?.ref ?? '',
      index: i,
      id: typeof pc.id === 'string' ? pc.id : `chapter ${i + 1}`,
      title: typeof pc.title === 'string' ? pc.title.trim() : '',
      same: sameTitle(plan[k]?.title, pc.title),
    }));
  const paired = new Set(pairs.map(x => x.ref));
  const unplanned = plan.filter(ch => !paired.has(ch.ref)).map(ch => ch.ref);
  const unpaired = chapters.map((_, i) => i).filter(i => m[i] === -1);
  const extra: ChapterAdd[] = [];
  if (!unplanned.length && unpaired.length) {
    const refs = new Set(plan.map(ch => ch.ref));
    let prev: string | null = null;
    chapters.forEach((pc, i) => {
      if (m[i] !== -1) {
        prev = plan[m[i] as number]?.ref ?? prev;
        return;
      }
      const title = (typeof pc.title === 'string' ? pc.title.trim() : '') || (pc.id ?? `chapter ${i + 1}`);
      let ref =
        title
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40) || `ch${i + 1}`;
      if (!/^[a-z]/.test(ref)) ref = 'ch_' + ref;
      for (let k = 2; refs.has(ref); k++) ref = `${ref.replace(/_\d+$/, '')}_${k}`;
      refs.add(ref);
      const goals = Array.isArray(pc.objectives) ? pc.objectives.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
      const coverage = (pc.sections ?? []).map(x => (typeof x.title === 'string' ? x.title.trim() : '')).filter(Boolean);
      extra.push({
        ref,
        title,
        ...(goals.length ? { goals } : {}),
        ...(coverage.length ? { coverage } : {}),
        ...(prev ? { after: prev } : { position: 'start' as const }),
      });
      prev = ref;
    });
  }
  return { pairs, extra, unplanned, unpaired };
}
/** The pack's chapters that the step's plan does not have → the chapters to add (alignPackChapters); null when the plan and
    the pack cannot be lined up whole (then the caller warns instead of guessing). */
export function packExtras(n: Step, chapters: readonly UploadChapter[]): ChapterAdd[] | null {
  const plan = n.chapters ?? [];
  if (!plan.length) return [];
  const a = alignPackChapters(plan, chapters);
  return a.unplanned.length ? null : a.extra;
}

/** 📑 which chapter of the step's pack teaches each planned chapter (ch.pack: its id and title as the pack has them; at: when it
    was lined up — the later wins in mergePlans). The panel shows the pack's title where the plan's own words are shown. */
export function matchChapters(c: Roadmap, nid: string, match: readonly { ref: string; id: string; title: string }[], at: string): string[] {
  const n = c.nodes[nid],
    done: string[] = [];
  if (!n?.chapters) return done;
  for (const x of match) {
    const ch = n.chapters.find(y => y.ref === x.ref),
      was = ch?.pack as { id?: string; title?: string; at?: string } | undefined;
    if (!ch || (was && ms(was.at) >= ms(at)) || (was?.id === x.id && was.title === x.title)) continue;
    ch.pack = { id: x.id, title: x.title, at };
    done.push(x.ref);
  }
  if (done.length) n.chaptersAt = stampAfter(ms(at), n.chaptersAt);
  return done;
}

/* ---------- 🌐 the languages of a Roadmap ---------- */

/** c.languages: the full translations its packs and its own words get, and the 文A pairs ("en>el"); bridges left out = every
    pair among the Roadmap's language and its translations. at: when it was set (the later copy wins in mergePlans). */
export interface RoadmapLanguages {
  translations: string[];
  bridges?: string[];
  at?: string;
}
const LOC = /^[a-z]{2,3}$/;
const PAIR = /^\s*([a-zA-Z]{2,3})(?:-[A-Za-z0-9]+)*\s*(?:>|→|->|=>)\s*([a-zA-Z]{2,3})(?:-[A-Za-z0-9]+)*\s*$/;

/** Check the languages Claude sends for a Roadmap → { errors, value } (value: normalised, without its stamp). */
export function checkLanguages(c: Pick<Roadmap, 'language'>, d: unknown): { errors: string[]; value: RoadmapLanguages | null } {
  const E: string[] = [],
    o = (c.language ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  if (!isObj(d) || !Array.isArray(d.translations))
    return {
      errors: ['languages must be { "translations": ["el", …], "bridges": ["en>el", "el>en", …] } (bridges optional)'],
      value: null,
    };
  const tr: string[] = [];
  d.translations.forEach((l, i) => {
    const k = typeof l === 'string' ? l.trim().split('-')[0]?.toLowerCase() : '';
    if (!k || !LOC.test(k)) E.push(`translations[${i}]: a language code such as el, ru, en`);
    else if (k === o) E.push(`translations[${i}]: "${k}" is the Roadmap's own language (it needs no translation)`);
    else if (!tr.includes(k)) tr.push(k);
  });
  const langs = [o, ...tr];
  let bridges: string[] | undefined;
  if (d.bridges != null) {
    if (!Array.isArray(d.bridges)) E.push('bridges: a list of pairs "source>native", e.g. ["en>el", "el>en"]');
    else {
      bridges = [];
      d.bridges.forEach((b, i) => {
        const m = typeof b === 'string' ? PAIR.exec(b) : null,
          src = m?.[1]?.toLowerCase() ?? '',
          nat = m?.[2]?.toLowerCase() ?? '';
        if (!m) E.push(`bridges[${i}]: a pair "source>native" such as "en>el" (the language read → the learner's own)`);
        else if (src === nat) E.push(`bridges[${i}]: "${String(b)}" goes from a language to itself`);
        else if (!langs.includes(src))
          E.push(
            `bridges[${i}]: "${src}" is neither the Roadmap's language (${o}) nor one of its translations (${tr.join(', ') || 'none'})`,
          );
        else if (!bridges?.includes(`${src}>${nat}`)) bridges?.push(`${src}>${nat}`);
      });
    }
  }
  return { errors: E, value: E.length ? null : { translations: tr, ...(bridges ? { bridges } : {}) } };
}
/** Set a Roadmap's languages (mutates the draft; check first) as of `at` (the operation's own time: the direct write and the
    inbox entry carry the same one) → false when the Roadmap has these or newer ones already (a replay changes nothing). */
export function setLanguages(c: Roadmap, v: RoadmapLanguages, at: string): boolean {
  if (ms(at) <= ms(languagesOf(c)?.at)) return false;
  c.languages = { translations: [...v.translations], ...(v.bridges ? { bridges: [...v.bridges] } : {}), at };
  return true;
}
/** The Roadmap's languages, or null: the pack rules' default. */
export function languagesOf(c: Pick<Roadmap, 'languages'> | null | undefined): RoadmapLanguages | null {
  const v = c?.languages;
  return isObj(v) && Array.isArray(v.translations) ? v : null;
}
/** mergePlans for the languages: the copy that set them later wins. */
export function mergeLanguages(c: Roadmap, other: Roadmap): boolean {
  const o = languagesOf(other);
  if (!o || ms(o.at) <= ms(languagesOf(c)?.at)) return false;
  c.languages = clone(o);
  return true;
}
