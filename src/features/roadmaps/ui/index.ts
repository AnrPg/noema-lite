/**
 * The Roadmap screens in Lit (phase 3, area 3): the library and its invitations, the map (classic, treasure, list; level
 * bands) with the selected step and its preparation, the levels on a map (the ladder, the level test, the level-reached
 * moment, Claude's proposed arrangement), a step's placement test, sharing, the public Roadmaps, a member's review of the
 * owner's changes, the Claude app's inbox, preparing ahead and From your sources. Importing this module defines nothing: the root calls
 * defineRoadmapsUi() once (after the kit's defineUi()), and hands the screens their data port (data.ts).
 */
import { NoemaRoadmapFromSources } from './from-sources.ts';
import { NoemaRoadmapInbox } from './inbox.ts';
import { NoemaRoadmapLevels } from './level-bar.ts';
import { NoemaRoadmapLevelReached } from './level-reached.ts';
import { NoemaRoadmapLevelTest } from './level-test.ts';
import { NoemaRoadmapInvite, NoemaRoadmapLibrary } from './library.ts';
import { NoemaRoadmapMap } from './map.ts';
import { NoemaRoadmapPrepareAhead } from './prepare-ahead.ts';
import { NoemaRoadmapPublic } from './public.ts';
import { NoemaRoadmapQuiz } from './quiz.ts';
import { NoemaRoadmapRestructure } from './restructure.ts';
import { NoemaRoadmapReview } from './review.ts';
import { NoemaRoadmapShare } from './share.ts';
import { NoemaRoadmapStep } from './step.ts';
import { NoemaRoadmapStepTest } from './step-test.ts';

export const ROADMAP_ELEMENTS = {
  'noema-roadmap-library': NoemaRoadmapLibrary,
  'noema-roadmap-invite': NoemaRoadmapInvite,
  'noema-roadmap-map': NoemaRoadmapMap,
  'noema-roadmap-step': NoemaRoadmapStep,
  'noema-roadmap-share': NoemaRoadmapShare,
  'noema-roadmap-public': NoemaRoadmapPublic,
  'noema-roadmap-review': NoemaRoadmapReview,
  'noema-roadmap-inbox': NoemaRoadmapInbox,
  'noema-roadmap-prepare-ahead': NoemaRoadmapPrepareAhead,
  'noema-roadmap-from-sources': NoemaRoadmapFromSources,
  'noema-roadmap-levels': NoemaRoadmapLevels,
  'noema-roadmap-level-reached': NoemaRoadmapLevelReached,
  'noema-roadmap-level-test': NoemaRoadmapLevelTest,
  'noema-roadmap-quiz': NoemaRoadmapQuiz,
  'noema-roadmap-restructure': NoemaRoadmapRestructure,
  'noema-roadmap-step-test': NoemaRoadmapStepTest,
} as const;

declare global {
  interface HTMLElementTagNameMap {
    'noema-roadmap-library': NoemaRoadmapLibrary;
    'noema-roadmap-invite': NoemaRoadmapInvite;
    'noema-roadmap-map': NoemaRoadmapMap;
    'noema-roadmap-step': NoemaRoadmapStep;
    'noema-roadmap-share': NoemaRoadmapShare;
    'noema-roadmap-public': NoemaRoadmapPublic;
    'noema-roadmap-review': NoemaRoadmapReview;
    'noema-roadmap-inbox': NoemaRoadmapInbox;
    'noema-roadmap-prepare-ahead': NoemaRoadmapPrepareAhead;
    'noema-roadmap-from-sources': NoemaRoadmapFromSources;
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
export { provideRoadmapsData, requestRoadmapsData } from './data.ts';
export type * from './data.ts';
export { mapColumns, treasureLayout } from './layout.ts';
export { publicMatches } from './public.ts';
export {
  NoemaRoadmapLibrary,
  NoemaRoadmapInvite,
  NoemaRoadmapMap,
  NoemaRoadmapStep,
  NoemaRoadmapShare,
  NoemaRoadmapPublic,
  NoemaRoadmapReview,
  NoemaRoadmapInbox,
  NoemaRoadmapPrepareAhead,
  NoemaRoadmapFromSources,
  NoemaRoadmapLevels,
  NoemaRoadmapLevelReached,
  NoemaRoadmapLevelTest,
  NoemaRoadmapQuiz,
  NoemaRoadmapRestructure,
  NoemaRoadmapStepTest,
};
