/**
 * #/ex/<id>: one exercise as a round of one (round.ts draws it). The other practice pages are round.ts, search-round.ts,
 * mixed.ts, mistakes.ts, boss.ts and lightning.ts.
 */
import type { StudyApp } from '../app.ts';

/** #/ex/<id>: one exercise (deep links from other apps), back to its section */
export function oneExercise(app: StudyApp, id: string): boolean {
  const e = app.course.exercise(id);
  if (!e) return false;
  const sec = app.course.section(e.section);
  app.startRound([e], {
    title: `🎯 ${sec?.title ?? app.course.chapterOf(e)?.title ?? ''}`,
    count: 1,
    keepOrder: true,
    back: `#/s/${e.section}`,
  });
  return true;
}
