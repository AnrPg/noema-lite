/**
 * What the study screens ask of the read models: the card queue, the Mistakes gym and the order of a practice round,
 * chapter and level progress, today's XP, the streak, the goal and the learner's XP level. Pure functions of a model's
 * parts (the answers, the cards' memories, the sections read, the XP per day) and of the pack; randomness comes from
 * the caller (`random`, a uniform number in [0, 1)).
 */
import { addDays, type LocalDay } from '../../../kernel/day.ts';
import { cardMemoryOf, isDueOn, type CardMemory } from './fsrs.ts';
import type { AnswerStats } from './projections/model.ts';

export type Random = () => number;

export function shuffled<T>(list: readonly T[], random: Random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/* ---------- cards and drills ---------- */
/** A stored state (an FSRS memory, or an old Leitner entry) due on `today`? A card never reviewed is not "due" (it is new). */
export const isDue = (raw: unknown, today: LocalDay): boolean => {
  const m = cardMemoryOf(raw);
  return m !== null && isDueOn(m, today);
};

/** How many of the states (all of them, or those of `keys`) are due on `today`. */
export function countDue(states: Readonly<Record<string, unknown>> | null | undefined, today: LocalDay, keys?: readonly string[]): number {
  if (!states) return 0;
  let n = 0;
  for (const k of keys ?? Object.keys(states)) if (isDue(states[k], today)) n++;
  return n;
}

export interface CardQueue<C> {
  /** The cards to go through, in order. */
  readonly queue: C[];
  readonly due: number;
  /** never reviewed */
  readonly fresh: number;
  /** reviewed, not due yet */
  readonly resting: number;
}

/**
 * Today's deck: the due cards (most overdue first, ties shuffled), then up to `newPerDay` new ones (shuffled); `all`:
 * every card given, shuffled (the cards a search found), due or not.
 */
export function cardQueue<C extends { readonly key: string }>(
  cards: readonly C[],
  states: Readonly<Record<string, unknown>>,
  today: LocalDay,
  o: { readonly random: Random; readonly newPerDay?: number; readonly all?: boolean },
): CardQueue<C> {
  const mem = new Map<string, CardMemory | null>(cards.map(c => [c.key, cardMemoryOf(states[c.key])]));
  const seen = cards.filter(c => mem.get(c.key)),
    due = seen.filter(c => isDueOn(mem.get(c.key) as CardMemory, today)),
    fresh = cards.filter(c => !mem.get(c.key));
  const dueAt = (c: C): number => (mem.get(c.key) as CardMemory).dueAt;
  const queue = o.all
    ? shuffled(cards, o.random)
    : [...shuffled(due, o.random).sort((a, b) => dueAt(a) - dueAt(b)), ...shuffled(fresh, o.random).slice(0, o.newPerDay ?? 15)];
  return { queue, due: due.length, fresh: fresh.length, resting: seen.length - due.length };
}

/* ---------- answers: the Mistakes gym, a round's order ---------- */
type Answers = Readonly<Record<string, Partial<AnswerStats> | undefined>> | null | undefined;

export const isSolved = (answers: Answers, id: string): boolean => (answers?.[id]?.ok ?? 0) > 0;
export const isMistake = (answers: Answers, id: string): boolean => answers?.[id]?.last === false;

/** The Mistakes gym: the exercises whose last answer was wrong (in the pack's order). */
export const mistakes = <E extends { readonly id: string }>(exercises: readonly E[], answers: Answers): E[] =>
  exercises.filter(e => isMistake(answers, e.id));

/** How many exercises' last answer was wrong. */
export const countMistakes = (answers: Answers): number => Object.values(answers ?? {}).filter(r => r?.last === false).length;

/** Facades of one learnable (the same `lr`, CONTENT_SPEC.md) never come one after the other: each is held back past the
    next exercise of another learnable. */
export function spreadFacades<E extends { readonly lr?: string | undefined }>(list: readonly E[]): E[] {
  const out: E[] = [],
    wait: E[] = [];
  for (const e of list) {
    const i = wait.findIndex(w => !w.lr || w.lr !== out[out.length - 1]?.lr);
    if (i >= 0) out.push(...wait.splice(i, 1));
    if (e.lr && e.lr === out[out.length - 1]?.lr) wait.push(e);
    else out.push(e);
  }
  return out.concat(wait);
}

/** A practice round's order: confident mistakes first, then the other mistakes and lucky guesses, then the unsolved,
    then the rest; shuffled inside each group, facades spread. */
export function roundOrder<E extends { readonly id: string; readonly lr?: string | undefined }>(
  list: readonly E[],
  answers: Answers,
  random: Random,
): E[] {
  const g0: E[] = [],
    g1: E[] = [],
    g2: E[] = [],
    g3: E[] = [];
  for (const e of list) {
    const r = answers?.[e.id];
    if (!r) g1.push(e);
    else if (r.last === false && r.conf === 'sure') g0.push(e);
    else if (r.last === false || r.conf === 'guess') g2.push(e);
    else g3.push(e);
  }
  return spreadFacades([...shuffled(g0, random), ...shuffled(g2, random), ...shuffled(g1, random), ...shuffled(g3, random)]);
}

/** After a wrong answer: one sibling of the same learnable, in another type, from the same chapter (`chapterOf`, by
    default the exercise's `chapter`), not in the round yet. */
export function siblingOf<
  E extends { readonly id: string; readonly type: string; readonly lr?: string | undefined; readonly chapter?: string | undefined },
>(
  ex: E,
  round: readonly { readonly id: string }[],
  all: readonly E[],
  random: Random,
  chapterOf: (e: E) => unknown = e => e.chapter,
): E | null {
  if (!ex.lr) return null;
  const inRound = new Set(round.map(e => e.id)),
    ch = chapterOf(ex);
  return (
    shuffled(
      all.filter(e => e.lr === ex.lr && chapterOf(e) === ch && e.type !== ex.type && !inRound.has(e.id)),
      random,
    )[0] ?? null
  );
}

/* ---------- progress ---------- */
export interface ChapterLike {
  readonly id: string;
  readonly level?: string | undefined;
  readonly sections: readonly { readonly id: string; readonly level?: string | undefined }[];
  readonly exercises: readonly { readonly id: string; readonly section?: string | undefined; readonly level?: string | undefined }[];
}
type Read = Readonly<Record<string, unknown>> | null | undefined;
const share = (done: number, of: number): number => (of ? done / of : 0);

/** A chapter's progress: the share of its sections read (sr) and of its exercises solved (ex). */
export function chapterProgress(c: ChapterLike, read: Read, answers: Answers): { sr: number; ex: number } {
  return {
    sr: share(c.sections.filter(s => read?.[s.id]).length, c.sections.length),
    ex: share(c.exercises.filter(e => isSolved(answers, e.id)).length, c.exercises.length),
  };
}

/**
 * How many chapters of a subject are done: every section read (section ids are chNN-sNN). From the registry's summary
 * of a subject (its chapters with their id or number and their sections, a count or a list); a subject that gives no
 * chapters counts the chapters whose test (boss) is beaten.
 */
export function chaptersDone(
  chapters: readonly { readonly id?: string; readonly num?: number | string; readonly sections?: number | readonly unknown[] }[],
  read: Read,
  boss?: Readonly<Record<string, unknown>> | null,
): number {
  if (!chapters.length) return Object.keys(boss ?? {}).filter(c => boss?.[c]).length;
  const per = new Map<string, number>();
  for (const id of Object.keys(read ?? {})) {
    const c = id.split('-s')[0] ?? id;
    per.set(c, (per.get(c) ?? 0) + 1);
  }
  return chapters.filter(c => {
    const id = c.id ?? 'ch' + String(c.num ?? '').padStart(2, '0'),
      n = typeof c.sections === 'number' ? c.sections : (c.sections ?? []).length;
    return n > 0 && (per.get(id) ?? 0) >= n;
  }).length;
}

export interface LevelProgress {
  readonly level: string | null;
  readonly sections: number;
  readonly read: number;
  readonly exercises: number;
  readonly solved: number;
}

/**
 * Progress per level of a pack: each section and exercise at its own level, else its section's, else its chapter's,
 * else the pack's when it teaches one level (src/contracts/rules/levels.ts); null: content without a level. In the
 * order of `ladder` (level ids), then any other level, then null.
 */
export function levelProgress(
  chapters: readonly ChapterLike[],
  read: Read,
  answers: Answers,
  o: { readonly packLevels?: readonly string[]; readonly ladder?: readonly string[] } = {},
): LevelProgress[] {
  const packLevel = o.packLevels?.length === 1 ? (o.packLevels[0] ?? null) : null;
  const by = new Map<string | null, { sections: number; read: number; exercises: number; solved: number }>();
  const at = (lv: string | null): { sections: number; read: number; exercises: number; solved: number } => {
    let x = by.get(lv);
    if (!x) by.set(lv, (x = { sections: 0, read: 0, exercises: 0, solved: 0 }));
    return x;
  };
  for (const c of chapters) {
    const secLevel = new Map(c.sections.map(s => [s.id, s.level]));
    for (const s of c.sections) {
      const x = at(s.level ?? c.level ?? packLevel);
      x.sections++;
      if (read?.[s.id]) x.read++;
    }
    for (const e of c.exercises) {
      const x = at(e.level ?? (e.section !== undefined ? secLevel.get(e.section) : undefined) ?? c.level ?? packLevel);
      x.exercises++;
      if (isSolved(answers, e.id)) x.solved++;
    }
  }
  const order = o.ladder ?? [];
  const rank = (lv: string | null): number => (lv === null ? Infinity : order.includes(lv) ? order.indexOf(lv) : order.length);
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
    .map(([level, x]) => ({ level, ...x }));
}

/* ---------- XP, goal, streak, the learner's XP level ---------- */
type ByDay = Readonly<Record<string, number | undefined>> | null | undefined;

export const xpOn = (byDay: ByDay, day: LocalDay): number => byDay?.[day] ?? 0;

/** Has today's XP reached the daily goal? */
export const goalReached = (byDay: ByDay, today: LocalDay, goal: number): boolean => xpOn(byDay, today) >= goal;

/**
 * The streak: days in a row with XP, up to today — or up to yesterday while today has none yet (it is not broken
 * before the day is over). `carried`: a run from before the log (`days` days, the last `through`), counted as days
 * with XP.
 */
export function streak(byDay: ByDay, today: LocalDay, carried?: { readonly days: number; readonly through: LocalDay } | null): number {
  const run = carried && carried.days > 0 ? { first: addDays(carried.through, 1 - Math.floor(carried.days)), last: carried.through } : null;
  const has = (d: LocalDay): boolean => xpOn(byDay, d) > 0 || (run !== null && d >= run.first && d <= run.last);
  let d = has(today) ? today : addDays(today, -1),
    n = 0;
  while (has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** The learner's XP level: level 1 needs 100 XP, each next one 18 % more (rounded to tens). */
export function xpLevel(xp: number): { lv: number; into: number; need: number } {
  let lv = 1,
    need = 100,
    left = Math.max(0, xp);
  while (left >= need) {
    left -= need;
    lv++;
    need = Math.round((need * 1.18) / 10) * 10;
  }
  return { lv, into: left, need };
}
