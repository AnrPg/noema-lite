/**
 * The open subject's course: its chapters seen through the learner's source filter ("only what this book says", "only
 * what is new"), with the indexes every screen looks things up in, and the sources each chapter really comes from.
 *
 * Data model (tools/CONTENT_SPEC.md "Sources"): every chapter has `src`; any section, block, exercise, drill, card or
 * trap may carry its own `src` (material patched in later), otherwise it inherits its chapter's. Filtering never changes
 * the content: it builds light views (shallow copies) of the full course. A source is "new" when it came with a later
 * version of the subject (a later `added` date than the first sources) and the learner has not marked it as seen.
 */
import type { Chapter, Drill, Exercise, Section } from './pack.ts';

export interface SourceInfo {
  readonly id: string;
  readonly title: string;
  readonly short?: string;
  readonly subtitle?: string;
  readonly url?: string;
  readonly emoji?: string;
  readonly pages?: string;
  readonly added?: string;
  /** its file: a path in the package, its name and checksum */
  readonly file?: string;
  readonly fileName?: string;
  readonly sha256?: string;
}
export interface SourceRegistry {
  readonly sources: readonly SourceInfo[];
  readonly chapters?: Readonly<Record<string, string>>;
}

/** A chapter seen through the filter: its visible parts, and whether something in it is new. */
export interface ChapterView extends Chapter {
  readonly src: string;
  readonly _ci: number;
  readonly _i: number;
  /** the whole chapter came with a new source */
  readonly newWhole: boolean;
  /** something in it is new */
  readonly isNew: boolean;
  readonly sections: readonly SectionView[];
}
export interface SectionView extends Section {
  readonly isNew: boolean;
  /** the section with every block (the filter may hide some) */
  readonly full: Section;
}

export interface Course {
  readonly sources: readonly SourceInfo[];
  readonly full: readonly (Chapter & { readonly src: string; readonly _ci: number })[];
  readonly chapters: readonly ChapterView[];
  readonly exercises: readonly Exercise[];
  chapter(id: string): ChapterView | undefined;
  section(id: string): SectionView | undefined;
  exercise(id: string): Exercise | undefined;
  drill(id: string): Drill | undefined;
  /** the chapter an exercise, a drill or a section is in */
  chapterOf(item: { readonly id: string }): ChapterView | undefined;
  /** a section's place in its chapter (0-based) */
  sectionIndex(s: Section): number;
  source(id: string): SourceInfo | undefined;
  /** the filter in force (null: everything) */
  readonly filter: ReadonlySet<string> | null;
}

/** The default source when a pack names none. */
export const BASE_SOURCE = 'base';

export function sourceList(reg: SourceRegistry | null | undefined, baseTitle: string): readonly SourceInfo[] {
  return reg?.sources.length ? reg.sources : [{ id: BASE_SOURCE, title: baseTitle, pages: '', emoji: '📘' }];
}

/** Every chapter with its own source (only ids that exist) and its colour number. */
export function fullCourse(chapters: readonly Chapter[], sources: readonly SourceInfo[], reg: SourceRegistry | null | undefined) {
  const ids = new Set(sources.map(s => s.id));
  const first = sources[0]?.id ?? BASE_SOURCE;
  return chapters.map((c, i) => ({
    ...c,
    _ci: i,
    src: [reg?.chapters?.[c.id], c.src].find((id): id is string => !!id && ids.has(id)) ?? first,
  }));
}

/** the source an item comes from: its own, else its parent's */
export const srcOf = (it: { readonly src?: string | undefined }, parent: { readonly src: string }): string => it.src ?? parent.src;

/** Is a source new for this learner (seen: the ids marked as seen)? */
export function isNewSource(
  sources: readonly SourceInfo[],
  id: string | undefined,
  seen: Readonly<Record<string, boolean>> | undefined,
): boolean {
  const s = sources.find(x => x.id === id);
  if (!id || !s || id === sources[0]?.id) return false;
  const firstAdded =
    sources
      .map(x => x.added)
      .filter((x): x is string => !!x)
      .sort()[0] ?? null;
  if (firstAdded && (!s.added || s.added <= firstAdded)) return false;
  return !seen?.[id];
}

/** The sources that are new now. */
export const newSources = (sources: readonly SourceInfo[], seen: Readonly<Record<string, boolean>> | undefined): string[] =>
  sources.filter(s => isNewSource(sources, s.id, seen)).map(s => s.id);

/** The filter in force: a set of source ids, or null (none, or every source on). */
export function activeFilter(sources: readonly SourceInfo[], on: readonly string[] | null | undefined): ReadonlySet<string> | null {
  return Array.isArray(on) && on.length && on.length < sources.length ? new Set(on) : null;
}

/**
 * The course through a filter. `keep` decides which exercises the app can run (an activity whose runtime is off, a type
 * from a newer app: they leave the round, never the pack). An empty result is never returned: a filter that hides
 * everything is dropped (`filter` is then null).
 */
export function buildCourse(
  full: readonly (Chapter & { readonly src: string; readonly _ci: number })[],
  sources: readonly SourceInfo[],
  o: {
    readonly filter: ReadonlySet<string> | null;
    readonly seen?: Readonly<Record<string, boolean>> | undefined;
    readonly keep?: (ex: Exercise, chapter: Chapter) => boolean;
  },
): Course {
  const vis = (id: string): boolean => !o.filter || o.filter.has(id);
  const isNew = (id: string | undefined): boolean => isNewSource(sources, id, o.seen);
  const chapters: ChapterView[] = [];
  for (const c0 of full) {
    const exAll = c0.exercises.filter(e => vis(srcOf(e, c0)) && (o.keep?.(e, c0) ?? true));
    const pbAll = c0.debug.filter(d => vis(srcOf(d, c0)));
    const secs: SectionView[] = c0.sections
      .map(s0 => {
        const parent = s0.src ? { src: s0.src } : c0;
        return {
          ...s0,
          blocks: s0.blocks.filter(b => vis(srcOf(b, parent))),
          full: s0,
          isNew:
            isNew(srcOf(s0, c0)) ||
            s0.blocks.some(b => !!b.src && b.src !== c0.src && isNew(b.src)) ||
            c0.exercises.some(e => e.section === s0.id && !!e.src && e.src !== c0.src && isNew(e.src)),
        };
      })
      .filter(s => vis(srcOf(s.full, c0)) || s.blocks.length || exAll.some(e => e.section === s.id) || pbAll.some(d => d.section === s.id));
    if (!secs.length) continue;
    const ids = new Set(secs.map(s => s.id));
    const newWhole = isNew(c0.src);
    chapters.push({
      ...c0,
      _i: chapters.length,
      sections: secs,
      exercises: exAll.filter(e => ids.has(e.section)),
      debug: pbAll.filter(d => !d.section || ids.has(d.section)),
      flashcards: c0.flashcards.filter(f => vis(srcOf(f, c0)) && (!f.section || ids.has(f.section))),
      pitfalls: c0.pitfalls.filter(p => vis(srcOf(p, c0))),
      newWhole,
      isNew: newWhole || secs.some(s => s.isNew),
    });
  }
  if (!chapters.length && o.filter) return buildCourse(full, sources, { ...o, filter: null });
  return indexCourse(full, chapters, sources, o.filter);
}

function indexCourse(
  full: Course['full'],
  chapters: readonly ChapterView[],
  sources: readonly SourceInfo[],
  filter: ReadonlySet<string> | null,
): Course {
  const ch = new Map<string, ChapterView>(),
    sec = new Map<string, SectionView>(),
    ex = new Map<string, Exercise>(),
    pb = new Map<string, Drill>(),
    parent = new Map<string, ChapterView>(),
    at = new Map<string, number>();
  for (const c of chapters) {
    ch.set(c.id, c);
    c.sections.forEach((s, j) => {
      sec.set(s.id, s);
      parent.set(s.id, c);
      at.set(s.id, j);
    });
    for (const e of c.exercises) {
      ex.set(e.id, e);
      parent.set(e.id, c);
    }
    for (const d of c.debug) {
      pb.set(d.id, d);
      parent.set(d.id, c);
    }
  }
  const src = new Map(sources.map(s => [s.id, s]));
  return {
    sources,
    full,
    chapters,
    exercises: chapters.flatMap(c => c.exercises),
    filter,
    chapter: id => ch.get(id),
    section: id => sec.get(id),
    exercise: id => ex.get(id),
    drill: id => pb.get(id),
    // an item made on the spot (a new question of the AI) is in its section's chapter
    chapterOf: item => parent.get(item.id) ?? ('section' in item && typeof item.section === 'string' ? parent.get(item.section) : undefined),
    sectionIndex: s => at.get(s.id) ?? -1,
    source: id => src.get(id),
  };
}

/* ---------- chapter ↔ sources: every source a chapter really uses ----------
   Signals (strongest first): chapter.sources [{id, pages}] · the chapter's main source · items with their own src · the
   free-text sourcePages ("ECB σ. 23–42 · Karp 9.2 · lecture (37:00–63:00)"), split into parts, each part matched to a source
   by its id, short name, acronym or a word only its title has. */
export interface SourceRef {
  readonly src: string;
  label: string;
  page: number | null;
  start: number | null;
  main: boolean;
}

const NORM = (x: string | undefined): string =>
  (x ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9α-ωа-я]+/g, ' ')
    .trim();
/* words of titles that name nothing in particular (code: no words of the interface) */
const STOP = new Set([
  'part',
  'chapter',
  'with',
  'from',
  'the',
  'and',
  'for',
  'των',
  'στην',
  'στον',
  'για',
  'απο',
  'και',
  'μαθημα',
  'course',
  'notes',
]);

/** The names a source is written by in a chapter's free text. */
export function sourceAliases(sources: readonly SourceInfo[]): ReadonlyMap<string, readonly string[]> {
  const words = (s: SourceInfo): string[] =>
    NORM(s.title)
      .split(' ')
      .filter(w => w.length >= 4 && !/^\d+$/.test(w));
  const count = new Map<string, number>();
  for (const s of sources) for (const w of new Set(words(s))) count.set(w, (count.get(w) ?? 0) + 1);
  return new Map(
    sources.map(s => {
      const a = new Set<string>();
      if (s.id.length >= 2 && !/^(part|src|source|s)\d*$/i.test(s.id)) a.add(NORM(s.id));
      if (s.short) a.add(NORM(s.short));
      const latin = (s.title.match(/[A-Z][A-Za-z']+/g) ?? []).filter(w => !/^(The|And|Of|For|In|On|A|An)$/.test(w));
      if (latin.length >= 2)
        a.add(
          latin
            .map(w => w[0])
            .join('')
            .toLowerCase(),
        );
      for (const m of s.title.matchAll(/(κεφ|κεφαλαιο|ch|chapter|kap|chap)\.?\s*(\d+)/gi))
        a.add(`${NORM((m[1] ?? '').replace(/αλαιο|apter|ap/i, ''))} ${m[2] ?? ''}`);
      for (const w of words(s)) if (count.get(w) === 1 && !STOP.has(w)) a.add(w);
      const u = /https?:\/\/(?:www\.)?([a-z0-9-]+)/i.exec(s.url ?? s.subtitle ?? '')?.[1];
      if (u) a.add(u.toLowerCase());
      return [s.id, [...a].filter(x => x.length >= 2)];
    }),
  );
}
const hasAlias = (seg: string, al: readonly string[]): number => {
  const t = ` ${NORM(seg)} `;
  return al.filter(a => t.includes(` ${a} `) || (a.length >= 5 && t.includes(` ${a}`))).length;
};
const PAGE_RE = /(?<![\p{L}])(?:σελ|σ|pp?|pages?|page|seite|s|pg)\.?\s*(\d{1,4})/iu,
  TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;

const timeOf = (label: string): number | null => {
  const tm = TIME_RE.exec(label);
  if (!tm) return null;
  const [a, b, c] = [Number(tm[1]), Number(tm[2]), tm[3] === undefined ? null : Number(tm[3])];
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
};

/** [{ src, label, page, start, main }] of a chapter, its main source first. */
export function chapterRefs(
  c: Chapter & { readonly src: string },
  sources: readonly SourceInfo[],
  aliases = sourceAliases(sources),
): SourceRef[] {
  const ids = new Set(sources.map(s => s.id));
  const out: SourceRef[] = [];
  const add = (src: string | undefined, label: string, main: boolean): void => {
    if (!src || !ids.has(src)) return;
    const pm = PAGE_RE.exec(label);
    const known = out.find(r => r.src === src);
    if (known) {
      if (label && !known.label.includes(label))
        known.label = !known.label || label.includes(known.label) ? label : `${known.label} · ${label}`;
      known.page ??= pm ? Number(pm[1]) : null;
      known.start ??= timeOf(label);
      known.main ||= main;
      return;
    }
    out.push({ src, label, page: pm ? Number(pm[1]) : null, start: timeOf(label), main });
  };
  for (const r of c.sources ?? []) add(r.id ?? r.src, r.pages ?? r.label ?? '', r.id === c.src);
  const segs = (c.sourcePages ?? '')
    .split(/\s+[·|;]\s+|\n|\s+\+\s+/)
    .map(x => x.trim())
    .filter(Boolean);
  for (const seg of segs) {
    let best: string | null = null,
      bestN = 0;
    for (const s of sources) {
      const n = hasAlias(seg, aliases.get(s.id) ?? []);
      if (n > bestN) {
        best = s.id;
        bestN = n;
      }
    }
    add(best ?? c.src, seg, (best ?? c.src) === c.src);
  }
  const main = out.find(r => r.src === c.src);
  if (!main) add(c.src, '', true);
  else main.main = true;
  const items = [...c.sections, ...c.exercises, ...c.debug, ...c.flashcards, ...c.pitfalls, ...c.sections.flatMap(s => s.blocks)];
  for (const src of new Set(items.map(it => it.src).filter((x): x is string => !!x))) add(src, '', false);
  return out.sort((a, b) => Number(b.main) - Number(a.main));
}

/** For a source: the chapters that use it, those it is the main source of first. */
export function sourceChapters<C extends Chapter & { readonly src: string; readonly _ci: number }>(
  full: readonly C[],
  srcId: string,
  refsOf: (c: C) => readonly SourceRef[],
): { readonly c: C; readonly ref: SourceRef }[] {
  return full
    .map(c => ({ c, ref: refsOf(c).find(r => r.src === srcId) }))
    .filter((x): x is { c: C; ref: SourceRef } => !!x.ref)
    .sort((a, b) => Number(b.ref.main) - Number(a.ref.main) || a.c._ci - b.c._ci);
}

export interface SourceStats {
  readonly chapters: Set<string>;
  readonly newChapters: string[];
  readonly sections: Set<string>;
  readonly enriched: Set<string>;
  blocks: number;
  exercises: number;
  playbooks: number;
  cards: number;
  pitfalls: number;
}

/** What each source brings, over the full course. */
export function sourceStats(full: Course['full'], sources: readonly SourceInfo[]): ReadonlyMap<string, SourceStats> {
  const st = new Map<string, SourceStats>(
    sources.map(s => [
      s.id,
      {
        chapters: new Set(),
        newChapters: [],
        sections: new Set(),
        enriched: new Set(),
        blocks: 0,
        exercises: 0,
        playbooks: 0,
        cards: 0,
        pitfalls: 0,
      },
    ]),
  );
  for (const c of full) {
    st.get(c.src)?.newChapters.push(c.id);
    for (const s of c.sections) {
      const ss = srcOf(s, c),
        sx = st.get(ss);
      if (sx) {
        sx.sections.add(s.id);
        sx.chapters.add(c.id);
      }
      for (const b of s.blocks) {
        const bx = st.get(srcOf(b, c));
        if (!bx) continue;
        bx.blocks++;
        if (srcOf(b, c) !== ss) {
          bx.enriched.add(s.id);
          bx.chapters.add(c.id);
        }
      }
    }
    for (const e of c.exercises) {
      const ex = st.get(srcOf(e, c));
      if (!ex) continue;
      ex.exercises++;
      if (srcOf(e, c) !== c.src) {
        ex.enriched.add(e.section);
        ex.chapters.add(c.id);
      }
    }
    for (const d of c.debug) {
      const x = st.get(srcOf(d, c));
      if (x) x.playbooks++;
    }
    for (const f of c.flashcards) {
      const x = st.get(srcOf(f, c));
      if (x) x.cards++;
    }
    for (const p of c.pitfalls) {
      const x = st.get(srcOf(p, c));
      if (x) x.pitfalls++;
    }
  }
  return st;
}
