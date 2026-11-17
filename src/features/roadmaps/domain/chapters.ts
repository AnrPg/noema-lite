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
    const twin = have.find(ch => sameTitle(ch.title, title));
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
    const stamp = stampAfter(now, at);
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
export const chaptersEntry = (nid: string, add: readonly ChapterAdd[], now: number, why = ''): ChaptersEntry => ({
  v: 1,
  kind: 'chapters',
  nid,
  chapters: clone([...add]),
  at: new Date(now).toISOString(),
  via: 'claude-app',
  ...(why ? { why } : {}),
});
/** Can the entry still be applied to this copy? [] when it can, ['applied'] when every chapter is there, else the problems. */
export function chaptersProblems(c: Roadmap, e: Partial<ChaptersEntry>): string[] {
  if (typeof e.nid !== 'string' || !Array.isArray(e.chapters)) return ['not a list of chapters for a step'];
  const r = checkAddChapters(c, e.nid, e.chapters);
  if (r.errors.length) return r.errors;
  return r.fresh.length ? [] : ['applied'];
}

/** mergePlans for added chapters: the chapters `other` added to a step that this copy has not got (by ref) come over, each
    at the place it was added (after the chapter it followed), even on a prepared step. → true when c changed. */
export function mergeAddedChapters(n: Step, o: Step): boolean {
  if (ms(o.chaptersAt) <= 0 || !o.chapters?.length) return false;
  const mine = n.chapters ?? [],
    refs = new Set(mine.map(ch => ch.ref)),
    since = Math.max(ms(n.plannedAt), ms(n.replanAt)), // a plan made here later than the chapter was added replaces it
    extra = o.chapters.filter(
      ch => typeof ch.addedAt === 'string' && ms(ch.addedAt) > since && !refs.has(ch.ref) && !mine.some(m => sameTitle(m.title, ch.title)),
    );
  if (!extra.length) return false;
  const list = [...mine];
  for (const ch of extra) {
    const prev = typeof ch.addedAfter === 'string' ? ch.addedAfter : ch.addedAfter === null ? '' : undefined;
    const i = prev === '' ? 0 : prev ? list.findIndex(x => x.ref === prev) + 1 || list.length : list.length;
    list.splice(i, 0, clone(ch));
  }
  n.chapters = list;
  n.chaptersAt = stampAfter(0, n.chaptersAt, o.chaptersAt);
  return true;
}

/* ---------- 📑 the chapters of a pack that its step's plan lacks (an upload) ---------- */

/** A pack's chapters as an upload reads them. */
export interface UploadChapter {
  id?: string;
  title?: string;
  objectives?: unknown;
  sections?: { title?: unknown }[];
}
/** The pack's chapters that the step's plan does not have (matched by title, in order) → the chapters to add, each placed
    after the planned chapter the pack puts before it; null when the plan and the pack cannot be lined up (titles changed
    too much — then the caller warns instead of guessing). */
export function packExtras(n: Step, chapters: readonly UploadChapter[]): ChapterAdd[] | null {
  const plan = n.chapters ?? [];
  if (!plan.length || chapters.length <= plan.length) {
    const unmatched = chapters.filter(pc => !plan.some(ch => sameTitle(ch.title, pc.title)));
    return chapters.length <= plan.length || !unmatched.length ? [] : null;
  }
  const match = new Map<number, string>(); // pack index → plan ref
  let j = 0;
  chapters.forEach((pc, i) => {
    const k = plan.findIndex((ch, x) => x >= j && sameTitle(ch.title, pc.title));
    if (k >= 0) {
      match.set(i, plan[k]?.ref ?? '');
      j = k + 1;
    }
  });
  if (match.size !== plan.length) return null; // every planned chapter must be found in the pack, in order
  const refs = new Set(plan.map(ch => ch.ref)),
    out: ChapterAdd[] = [];
  let prev: string | null = null;
  chapters.forEach((pc, i) => {
    const m = match.get(i);
    if (m !== undefined) {
      prev = m;
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
    const coverage = (pc.sections ?? []).map(s => (typeof s.title === 'string' ? s.title.trim() : '')).filter(Boolean);
    out.push({
      ref,
      title,
      ...(goals.length ? { goals } : {}),
      ...(coverage.length ? { coverage } : {}),
      ...(prev ? { after: prev } : { position: 'start' as const }),
    });
    prev = ref;
  });
  return out;
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
/** Set a Roadmap's languages (mutates the draft; check first). */
export function setLanguages(c: Roadmap, v: RoadmapLanguages, now: number): void {
  c.languages = {
    translations: [...v.translations],
    ...(v.bridges ? { bridges: [...v.bridges] } : {}),
    at: stampAfter(now, languagesOf(c)?.at),
  };
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
