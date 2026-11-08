/**
 * What the Roadmap screens need from the app: one small data port (the screens never read a global). The root hands it to
 * them as the kit hands its services — a bubbling, composed `noema-roadmaps-data` request that the nearest provider
 * answers (src/composition/roadmaps-ui.ts implements it over the app's stores today; the lead swaps the implementation,
 * never the screens).
 */
import type { Unsubscribe } from '../../../ports/common.ts';
import type { LevelService } from '../application/levels.ts';
import type { TestQuestion } from '../domain/levels.ts';
import type { Roadmap } from '../domain/model.ts';

export type { TestQuestion };

/** A pack as the level test reads it: its chapters' exercises. */
export interface PackExercises {
  readonly chapters?: readonly { readonly exercises?: readonly Record<string, unknown>[] }[];
}

export interface RoadmapsData {
  /** The learner's Roadmap with this id (null: not on this device). */
  roadmap(account: string, id: string): Roadmap | null;
  /** Is this step of the Roadmap mastered (the app's statuses)? */
  mastered(account: string, c: Roadmap): (stepId: string) => boolean;
  /** Someone shared this Roadmap with the learner: its owner decides on its arrangement. */
  isMember(c: Roadmap): boolean;
  /** The ladder: where the learner is, moving up, a level test taken (NoemaCore.roadmaps.levels). */
  readonly levels: LevelService;
  /** The prepared packs of these steps (a step without one is left out). */
  packs(account: string, c: Roadmap, stepIds: readonly string[]): Promise<PackExercises[]>;
  /** The questions of a step's placement test (from its pack when it is prepared, else written by the AI). */
  placementQuestions(account: string, c: Roadmap, stepId: string): Promise<TestQuestion[]>;
  /** A step's placement test was taken: → mastered now (score ≥ the pass mark). */
  passStep(account: string, c: Roadmap, stepId: string, score: number): boolean;
  /** The learner (the owner) decides on a restructuring proposal: → an error to show, or null. */
  decide(account: string, roadmapId: string, proposalId: string, approve: boolean): Promise<string | null>;
  /** A question's Markdown (bold, code, formulas) as safe inline HTML. */
  inline(markdown: string): string;
  /** A short message in the app's notices (🔔). */
  notify(text: string): void;
}

export const DATA_EVENT = 'noema-roadmaps-data';

interface DataRequest {
  data: RoadmapsData | null;
}

/** Answers every data request that bubbles up to `host` (the nearest provider wins). */
export function provideRoadmapsData(host: EventTarget, data: RoadmapsData): Unsubscribe {
  const answer = (e: Event): void => {
    const d = (e as CustomEvent<DataRequest>).detail;
    if (d.data) return;
    d.data = data;
    e.stopPropagation();
  };
  host.addEventListener(DATA_EVENT, answer);
  return () => {
    host.removeEventListener(DATA_EVENT, answer);
  };
}

/** The data port of the nearest provider above `el` (null when there is none). */
export function requestRoadmapsData(el: EventTarget): RoadmapsData | null {
  const detail: DataRequest = { data: null };
  el.dispatchEvent(new CustomEvent<DataRequest>(DATA_EVENT, { detail, bubbles: true, composed: true }));
  return detail.data;
}
