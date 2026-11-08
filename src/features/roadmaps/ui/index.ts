/**
 * The Roadmap screens in Lit (phase 3, area 3): the levels on a map (the ladder, the level test, the level-reached moment,
 * Claude's proposed arrangement) and a step's placement test. Importing this module defines nothing: the root calls
 * defineRoadmapsUi() once (after the kit's defineUi()), and hands the screens their data port (data.ts).
 */
import { NoemaRoadmapLevels } from './level-bar.ts';
import { NoemaRoadmapLevelReached } from './level-reached.ts';
import { NoemaRoadmapLevelTest } from './level-test.ts';
import { NoemaRoadmapQuiz } from './quiz.ts';
import { NoemaRoadmapRestructure } from './restructure.ts';
import { NoemaRoadmapStepTest } from './step-test.ts';

export const ROADMAP_ELEMENTS = {
  'noema-roadmap-levels': NoemaRoadmapLevels,
  'noema-roadmap-level-reached': NoemaRoadmapLevelReached,
  'noema-roadmap-level-test': NoemaRoadmapLevelTest,
  'noema-roadmap-quiz': NoemaRoadmapQuiz,
  'noema-roadmap-restructure': NoemaRoadmapRestructure,
  'noema-roadmap-step-test': NoemaRoadmapStepTest,
} as const;

declare global {
  interface HTMLElementTagNameMap {
    'noema-roadmap-levels': NoemaRoadmapLevels;
    'noema-roadmap-level-reached': NoemaRoadmapLevelReached;
    'noema-roadmap-level-test': NoemaRoadmapLevelTest;
    'noema-roadmap-quiz': NoemaRoadmapQuiz;
    'noema-roadmap-restructure': NoemaRoadmapRestructure;
    'noema-roadmap-step-test': NoemaRoadmapStepTest;
  }
}

/** Defines every Roadmap element once (again: nothing happens). */
export function defineRoadmapsUi(registry: CustomElementRegistry = customElements): void {
  for (const [tag, ctor] of Object.entries(ROADMAP_ELEMENTS)) if (!registry.get(tag)) registry.define(tag, ctor);
}

export { openDialog } from './open.ts';
export { provideRoadmapsData, requestRoadmapsData, type RoadmapsData, type PackExercises } from './data.ts';
export {
  NoemaRoadmapLevels,
  NoemaRoadmapLevelReached,
  NoemaRoadmapLevelTest,
  NoemaRoadmapQuiz,
  NoemaRoadmapRestructure,
  NoemaRoadmapStepTest,
};
