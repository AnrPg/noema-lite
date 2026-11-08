/**
 * The study area's routes (area 2): the subject's pages, one table (routes.ts draws them). The first matching route wins,
 * so the longer patterns of a page come first. Light on purpose: the frame registers the segments before the pages' code
 * (build/study.js) is in (NoemaCore.studyUi.segments, engine/app/study.js).
 */
import { defineRoutes } from '../../../ui/router/routes.ts';

export const STUDY_ROUTES = defineRoutes({
  sources: '/subject/sources',
  subject: '/subject',
  chapterFocus: '/ch/:id/:tab/:focus',
  chapter: '/ch/:id/:tab?',
  section: '/s/:id/:block?',
  practice: '/practice/:id',
  run: '/run',
  srun: '/srun',
  boss: '/boss/:id',
  lightning: '/lightning/:id?',
  cards: '/cards/:key?',
  drills: '/drills',
  drill: '/drill/:id',
  mistakes: '/mistakes',
  whatsNew: '/new',
  exercise: '/ex/:id',
});
export type StudyRoutes = typeof STUDY_ROUTES.table;

/** the first segment of every study address (the frame sends these to the study area) */
export const STUDY_SEGMENTS: ReadonlySet<string> = new Set([
  'subject',
  'ch',
  's',
  'practice',
  'run',
  'srun',
  'boss',
  'lightning',
  'cards',
  'drills',
  'drill',
  'mistakes',
  'new',
  'ex',
]);
