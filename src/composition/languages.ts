/**
 * NoemaCore.languages — the language courses of this device before any course is loaded (src/features/languages): the
 * courses (the library's and the learner's own, with the languages packages added), the languages the learner studies
 * (D21, a:settings.studyLangs, written through engine/themes.js putSettings so it syncs), the languages the app offers,
 * a course's progress from its stored learner state, the course of a language, Today's course.
 *
 *   NoemaCore.languages.courses(acc) · course(acc, id) · study(acc) · setStudy(acc, codes) · offered(acc) · chosen(acc, course)
 *   · studiesAny(acc, course) · progress(acc, course) · last(acc) · setLast(acc, id) · courseFor(acc, code)
 *   · setCourseLang(acc, courseId, code) · today(acc, { lead, current })
 */
import { coursesService, type CoursesService } from '../features/languages/application/courses.ts';
import type { LibraryCourse } from '../features/languages/domain/courses.ts';
import type { BridgeExtension } from './bridge.ts';
import type { Resolver } from './container.ts';
import { CLOCK, STORAGE } from './tokens.ts';

interface LangGlobals {
  readonly NOEMA_REGISTRY?: { readonly languages?: readonly LibraryCourse[] };
  readonly NoemaThemes?: { putSettings?(patch: Readonly<Record<string, unknown>>, acc: string): void };
}

/** The courses service over the root's storage and clock, the registry and the settings writer of the page. */
export function pageCourses(r: Resolver, g: LangGlobals = globalThis as LangGlobals): CoursesService {
  const kv = r.get(STORAGE).kv;
  return coursesService({
    kv,
    clock: r.get(CLOCK),
    library: () => g.NOEMA_REGISTRY?.languages ?? [],
    putSettings: (acc, patch) => {
      if (g.NoemaThemes?.putSettings) {
        g.NoemaThemes.putSettings(patch, acc);
        return;
      }
      const k = `noema1:${acc}:a:settings`,
        cur = kv.get(k);
      let s: Record<string, unknown> = {};
      try {
        s = cur.ok && cur.value ? (JSON.parse(cur.value) as Record<string, unknown>) : {};
      } catch {
        s = {}; // a value that is not JSON (hand-edited): written anew
      }
      kv.set(k, JSON.stringify({ ...s, ...patch }));
    },
  });
}

export const languagesBridge: BridgeExtension = { name: 'languages', build: r => Object.freeze({ ...pageCourses(r) }) };
