/**
 * The learner's progress across subjects (account-level stats, a:stats): XP, XP per day, the streak, the level and the
 * treasures (medals) of the Progress page. Pure: the day comes in (src/kernel/day.ts).
 */
import { daysBetween, isLocalDay, type LocalDay } from '../../../kernel/day.ts';

export interface Stats {
  xp: number;
  xpDay: Record<string, number>;
  streak: number;
  lastDay: string | null;
  bySubject: Record<string, number>;
}
/** at most this many days of XP are kept */
export const XP_DAYS_KEPT = 400;

const record = (x: unknown): Record<string, number> => (x && typeof x === 'object' ? { ...(x as Record<string, number>) } : {});

/** Stored stats (any shape) → Stats, the missing parts empty. */
export function statsOf(raw: unknown): Stats {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof Stats, unknown>>) : {};
  return {
    xp: typeof r.xp === 'number' ? r.xp : 0,
    xpDay: record(r.xpDay),
    streak: typeof r.streak === 'number' ? r.streak : 0,
    lastDay: typeof r.lastDay === 'string' ? r.lastDay : null,
    bySubject: record(r.bySubject),
  };
}

/** The stats after a day of study: the streak goes on after yesterday, starts again after a gap. */
export function touchStreak(s: Stats, today: LocalDay): Stats {
  if (s.lastDay === today) return s;
  const gap = isLocalDay(s.lastDay) ? daysBetween(s.lastDay, today) : 99;
  return { ...s, streak: gap === 1 ? s.streak + 1 : 1, lastDay: today };
}

/** The stats after n XP earned today in a subject (the oldest days beyond XP_DAYS_KEPT dropped). */
export function addXp(s0: Stats, n: number, today: LocalDay, subject: string | null): Stats {
  const s = touchStreak(s0, today);
  const all = { ...s.xpDay, [today]: (s.xpDay[today] || 0) + n };
  const kept = new Set(Object.keys(all).sort().slice(-XP_DAYS_KEPT));
  const xpDay = Object.fromEntries(Object.entries(all).filter(([k]) => kept.has(k)));
  const bySubject = subject ? { ...s.bySubject, [subject]: (s.bySubject[subject] || 0) + n } : s.bySubject;
  return { ...s, xp: s.xp + n, xpDay, bySubject };
}

/** The streak as it stands today: it lasts while the last day of study is today or yesterday. */
export const streakNow = (s: Stats, today: LocalDay): number =>
  isLocalDay(s.lastDay) && daysBetween(s.lastDay, today) <= 1 ? s.streak : 0;

export const todayXp = (s: Stats, today: LocalDay): number => s.xpDay[today] || 0;

export interface Level {
  /** the level, from 1 */
  readonly lv: number;
  /** XP into this level */
  readonly into: number;
  /** XP this level needs */
  readonly need: number;
}
/** The level of an XP total: level 1 needs 100, every next one 18% more (rounded to tens). */
export function levelOf(xp: number): Level {
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

/** The counts the treasures are earned from. */
export interface MedalCounts {
  /** Roadmap steps mastered */
  readonly mastered?: number;
  /** flashcards made */
  readonly fcN?: number;
  /** the streak now */
  readonly sn?: number;
  /** chapter tests beaten */
  readonly boss?: number;
  readonly xp?: number;
}
export type MedalId = 'step' | 'cards' | 'week' | 'boss' | 'xp' | 'month';
export interface Medal {
  readonly id: MedalId;
  readonly found: boolean;
  /** how far along (shown in the words: "7 of 7 days") */
  readonly n: number;
  /** the colour family (1–4) */
  readonly tone: 1 | 2 | 3 | 4;
}
/** The treasures in the page's order (the page others see shows only the ids of the found ones). */
export function medals({ mastered = 0, fcN = 0, sn = 0, boss = 0, xp = 0 }: MedalCounts): readonly Medal[] {
  return [
    { id: 'step', found: mastered >= 1, n: mastered, tone: 1 },
    { id: 'cards', found: fcN >= 100, n: Math.min(fcN, 100), tone: 4 },
    { id: 'week', found: sn >= 7, n: Math.min(sn, 7), tone: 2 },
    { id: 'boss', found: boss >= 1, n: boss, tone: 3 },
    { id: 'xp', found: xp >= 1000, n: xp, tone: 1 },
    { id: 'month', found: sn >= 30, n: Math.min(sn, 30), tone: 2 },
  ];
}

/** A subject's chapters as its metadata lists them. */
export interface ChapterMeta {
  readonly id?: string;
  readonly num?: number;
  readonly sections?: number | readonly unknown[];
}
/** A subject's saved state as far as progress reads it (the engine writes it: s:<subject>:state). */
export interface SubjectProgress {
  readonly read?: Record<string, unknown>;
  readonly boss?: Record<string, unknown>;
  readonly fc?: Record<string, { due?: string } | null>;
  readonly pb?: Record<string, { due?: string } | null>;
  readonly res?: Record<string, { last?: boolean } | null>;
}
/** Chapters with every section read (section ids are chNN-sNN); without section counts a beaten chapter test counts. */
export function chaptersDone(chs: readonly ChapterMeta[], x: SubjectProgress): number {
  const read: Record<string, number> = {};
  for (const id of Object.keys(x.read || {})) {
    const c = id.split('-s')[0] as string;
    read[c] = (read[c] || 0) + 1;
  }
  if (!chs.length) return Object.keys(x.boss || {}).filter(c => x.boss?.[c]).length;
  return chs.filter(c => {
    const id = c.id || 'ch' + String(c.num).padStart(2, '0');
    const n = typeof c.sections === 'number' ? c.sections : (c.sections || []).length;
    return n > 0 && (read[id] || 0) >= n;
  }).length;
}

/** Cards and problems due by today. */
export function dueCount(st: SubjectProgress | null, today: LocalDay): { fc: number; pb: number } {
  let fc = 0,
    pb = 0;
  for (const r of Object.values(st?.fc || {})) if (r?.due && r.due <= today) fc++;
  for (const r of Object.values(st?.pb || {})) if (r?.due && r.due <= today) pb++;
  return { fc, pb };
}
/** Exercises whose last answer was wrong (the Mistakes gym). */
export const wrongCount = (st: SubjectProgress | null): number => Object.values(st?.res || {}).filter(r => r && r.last === false).length;
