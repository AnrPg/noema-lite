/**
 * The treasures (medals) of the Progress page, from the learner's counts. Pure. (XP, the streak, the level and what is due
 * are the study domain's: src/features/study/domain/queries.ts, NoemaCore.study.)
 */
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
