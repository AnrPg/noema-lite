/* noema-lite — the learning events of Roadmaps (the learning log, event sourcing: src/contracts/schemas/noema.events.v1).
   "The learner's current level per Roadmap" is not a stored value: it is folded from these events.

     roadmap.level.reached   a level is done (every step up to it mastered; its test passed when the Roadmap asks for one)
                             { roadmap, level, from (the level before, or null), how: 'auto' | 'test' | 'placement' }
     roadmap.level.tested    a final level test was taken { roadmap, level, score, passed }
     roadmap.restructured    a restructuring was approved and applied { roadmap, proposal, moves: [{ item, from, to }] } —
                             items (chapters, with their sections, exercises and cards) that changed subject: read models
                             that keep progress per (subject, item) re-key them; progress kept per item id needs nothing

   Ids are deterministic where the event can happen only once (a level is reached once per Roadmap): two devices that both
   notice it append the same id, and the log keeps one (idempotent by event id). */

export interface RoadmapEventBase {
  /** unique; the log is idempotent by it */
  readonly id: string;
  readonly type: string;
  /** when it happened (ms; the log adds its own hybrid-clock stamp and device) */
  readonly at: number;
  readonly roadmap: string;
}
export interface LevelReached extends RoadmapEventBase {
  readonly type: 'roadmap.level.reached';
  readonly level: string;
  readonly from: string | null;
  readonly how: 'auto' | 'test' | 'placement';
}
export interface LevelTested extends RoadmapEventBase {
  readonly type: 'roadmap.level.tested';
  readonly level: string;
  readonly score: number;
  readonly passed: boolean;
}
export interface Restructured extends RoadmapEventBase {
  readonly type: 'roadmap.restructured';
  readonly proposal: string;
  readonly moves: readonly { readonly item: string; readonly from: string; readonly to: string }[];
}
export type RoadmapEvent = LevelReached | LevelTested | Restructured;

export const ROADMAP_EVENT_TYPES = ['roadmap.level.reached', 'roadmap.level.tested', 'roadmap.restructured'] as const;
export const isRoadmapEvent = (e: { type?: unknown } | null | undefined): e is RoadmapEvent =>
  !!e && (ROADMAP_EVENT_TYPES as readonly unknown[]).includes(e.type);

export const levelReached = (roadmap: string, level: string, from: string | null, how: LevelReached['how'], at: number): LevelReached => ({
  id: `lvl:${roadmap}:${level}`,
  type: 'roadmap.level.reached',
  at,
  roadmap,
  level,
  from,
  how,
});
export const levelTested = (roadmap: string, level: string, score: number, passed: boolean, at: number, attempt: string): LevelTested => ({
  id: `lvt:${roadmap}:${level}:${attempt}`,
  type: 'roadmap.level.tested',
  at,
  roadmap,
  level,
  score,
  passed,
});
export const restructured = (roadmap: string, proposal: string, moves: Restructured['moves'], at: number): Restructured => ({
  id: `rst:${roadmap}:${proposal}`,
  type: 'roadmap.restructured',
  at,
  roadmap,
  proposal,
  moves,
});

export interface LevelLog {
  /** level ids reached on this Roadmap */
  readonly reached: Set<string>;
  /** level ids whose test was passed */
  readonly tested: Set<string>;
  /** when each level was reached (ms) */
  readonly when: Map<string, number>;
}
/** Fold a Roadmap's level events. */
export function foldLevels(events: readonly RoadmapEvent[], roadmap: string): LevelLog {
  const out: LevelLog = { reached: new Set(), tested: new Set(), when: new Map() };
  for (const e of events) {
    if (e.roadmap !== roadmap) continue;
    if (e.type === 'roadmap.level.reached') {
      out.reached.add(e.level);
      if (!out.when.has(e.level)) out.when.set(e.level, e.at);
    } else if (e.type === 'roadmap.level.tested' && e.passed) out.tested.add(e.level);
  }
  return out;
}
