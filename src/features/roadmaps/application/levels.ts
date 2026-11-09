/* noema-lite — the learner on a Roadmap's ladder (docs/CURRICULUM.md §11): where they are, and moving up.
   Moving up is automatic: when every step up to a level is mastered, the level is reached (an event in the learning log);
   a Roadmap with `levelTest` asks for the level's final test first, and a passed test reaches it. Several levels done at once
   (steps mastered by "I already know this") are reached one after the other, in order. */
import { ok, type AsyncResult } from '../../../kernel/result.ts';
import type { Level } from '../../../contracts/rules/levels.ts';
import type { Roadmap } from '../domain/model.ts';
import { currentLevel, LEVEL_PASS, levelProgress, nextLevelStep, ladder, type LevelProgress } from '../domain/levels.ts';
import { foldLevels, levelReached, levelTested, type LevelReached, type RoadmapEvent } from '../domain/events.ts';
import type { RoadmapEventLog } from './ports.ts';

export interface LevelView {
  readonly ladder: Level[];
  readonly progress: LevelProgress[];
  readonly current: Level | null;
  readonly reached: string[];
  /** a level whose steps are done and whose test waits (levelTest), else null */
  readonly testDue: string | null;
}

export interface LevelService {
  /** Where the learner is. mastered: is this step mastered (the app's statuses). */
  view(account: string, c: Roadmap, mastered: (id: string) => boolean): AsyncResult<LevelView>;
  /** Reach every level that is done now (appends roadmap.level.reached) → the events appended, and the test now due. */
  advance(
    account: string,
    c: Roadmap,
    mastered: (id: string) => boolean,
    now: number,
  ): AsyncResult<{ reached: LevelReached[]; testDue: string | null }>;
  /** A final level test was taken: recorded; passed (≥ 80 %) → the level is reached. */
  testTaken(
    account: string,
    c: Roadmap,
    level: string,
    score: number,
    o: { now: number; attempt: string; mastered: (id: string) => boolean },
  ): AsyncResult<{ passed: boolean; reached: LevelReached[] }>;
}

export function createLevelService(log: RoadmapEventLog): LevelService {
  const events = async (account: string, c: Roadmap): AsyncResult<RoadmapEvent[]> => log.list(account, c.id);
  const service: LevelService = {
    async view(account, c, mastered) {
      const ev = await events(account, c);
      if (!ev.ok) return ev;
      const f = foldLevels(ev.value, c.id),
        step = nextLevelStep(c, mastered, f.reached, f.tested);
      return ok({
        ladder: ladder(c),
        progress: levelProgress(c, mastered),
        current: currentLevel(c, f.reached),
        reached: [...f.reached],
        testDue: step?.kind === 'test' ? step.level : null,
      });
    },
    async advance(account, c, mastered, now) {
      if (!c.levels?.length) return ok({ reached: [], testDue: null });
      const ev = await events(account, c);
      if (!ev.ok) return ev;
      const f = foldLevels(ev.value, c.id),
        reached = new Set(f.reached),
        out: LevelReached[] = [];
      let testDue: string | null = null;
      for (let guard = 0; guard < 64; guard++) {
        const step = nextLevelStep(c, mastered, reached, f.tested);
        if (!step) break;
        if (step.kind === 'test') {
          testDue = step.level;
          break;
        }
        out.push(levelReached(c.id, step.level, previous(c, step.level), f.tested.has(step.level) ? 'test' : 'auto', now));
        reached.add(step.level);
      }
      if (out.length) {
        const a = await log.append(account, out);
        if (!a.ok) return a;
      }
      return ok({ reached: out, testDue });
    },
    async testTaken(account, c, level, score, o) {
      const passed = score >= LEVEL_PASS;
      const a = await log.append(account, [levelTested(c.id, level, score, passed, o.now, o.attempt)]);
      if (!a.ok) return a;
      if (!passed) return ok({ passed, reached: [] });
      const r = await service.advance(account, c, o.mastered, o.now);
      return r.ok ? ok({ passed, reached: r.value.reached }) : r;
    },
  };
  return service;
}

/** The level below one on the ladder (null for the first). */
function previous(c: Roadmap, level: string): string | null {
  const L = ladder(c),
    i = L.findIndex(l => l.id === level);
  return i > 0 ? (L[i - 1]?.id ?? null) : null;
}
