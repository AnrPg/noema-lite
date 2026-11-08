/**
 * THE STUDY AREA'S ROUTES (area 2): the subject's pages, one table for the lead to merge into the app's (src/ui/router).
 * The table is route-table.ts (the frame reads its segments without the screens); `showStudyRoute` draws each route.
 */
import type { RouteMatch } from '../../../ui/router/routes.ts';
import type { StudyApp } from './app.ts';
import { cardsView, drillView, drillsView } from './screens/cards.ts';
import { chapterView } from './screens/chapter.ts';
import { homeView } from './screens/home.ts';
import {
  bossView,
  lightningView,
  lockedView,
  mistakesView,
  mixedView,
  oneExercise,
  playLightning,
  searchRunView,
} from './screens/practice.ts';
import { runView } from './screens/round.ts';
import { sectionView } from './screens/section.ts';
import { whatsNewView } from './sources.ts';
import { STUDY_ROUTES, type StudyRoutes } from './route-table.ts';

export type StudyRoute = RouteMatch<StudyRoutes>;
export type StudyRouteName = StudyRoute['name'];
export { STUDY_ROUTES, STUDY_SEGMENTS } from './route-table.ts';

/** the pages that wait while the Roadmap step is locked (its theory stays open) */
const LOCKED: ReadonlySet<StudyRouteName> = new Set([
  'practice',
  'run',
  'srun',
  'boss',
  'lightning',
  'cards',
  'drills',
  'drill',
  'mistakes',
  'exercise',
]);

/** Draws the page an address names; → false when the address is not the study area's. */
export function showStudyRoute(app: StudyApp, hash: string): boolean {
  const m = STUDY_ROUTES.match(hash || '#/');
  if (!m) return false;
  app.route = m.name;
  app.lock = app.host.roadmap.lock();
  if (app.lock && LOCKED.has(m.name)) {
    lockedView(app);
    return true;
  }
  switch (m.name) {
    case 'subject':
      homeView(app);
      break;
    case 'sources':
      homeView(app);
      setTimeout(() => {
        app.sourcesUi.toggleDeck(true);
      }, 200);
      break;
    case 'chapterFocus':
      chapterView(app, m.params.id, m.params.tab, m.params.focus);
      break;
    case 'chapter':
      chapterView(app, m.params.id, m.params.tab);
      break;
    case 'section':
      sectionView(app, m.params.id, m.params.block);
      break;
    case 'practice':
      if (m.params.id === 'all') mixedView(app);
      else {
        app.chapterTab.set(m.params.id, 'practice');
        chapterView(app, m.params.id, 'practice');
      }
      break;
    case 'run':
      runView(app);
      break;
    case 'srun':
      searchRunView(app);
      break;
    case 'boss':
      bossView(app, m.params.id);
      break;
    case 'lightning':
      if (m.params.id && app.course.chapter(m.params.id)) playLightning(app, m.params.id);
      else lightningView(app);
      break;
    case 'cards':
      cardsView(app, m.params.key);
      break;
    case 'drills':
      drillsView(app);
      break;
    case 'drill':
      drillView(app, m.params.id);
      break;
    case 'mistakes':
      mistakesView(app);
      break;
    case 'whatsNew':
      whatsNewView(app);
      break;
    case 'exercise':
      if (!oneExercise(app, m.params.id)) homeView(app);
      break;
  }
  return true;
}
