/**
 * The language courses of a profile over this device's storage (the keys engine/loader.js and the course runtime write:
 * noema1:<acc>:a:langcourse:<id>, a:langpack:<course>:<code>, a:settings.studyLangs, s:lang:<course>:settings / prefs /
 * the learner records, meta:lastLang, meta:langsum). The choice of languages is written through the Settings port the
 * root hands over (it syncs and stamps a:settings: engine/themes.js putSettings today).
 */
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import {
  chosenLangs,
  courseFor,
  courseProgress,
  langDay,
  listCourses,
  offeredLangs,
  studiesAny,
  type AccountCourse,
  type CourseInfo,
  type CourseProgress,
  type LibraryCourse,
  type OfferedLang,
} from '../domain/courses.ts';

const P = 'noema1:';

export interface CoursesDeps {
  readonly kv: KeyValueStore;
  readonly clock: Clock;
  /** the library's courses (the registry) */
  readonly library: () => readonly LibraryCourse[];
  /** writes the learner's settings (a:settings) of a profile, merged: the sync-aware writer of the app */
  readonly putSettings: (acc: string, patch: Readonly<Record<string, unknown>>) => void;
}

export interface CoursesService {
  courses(acc: string): CourseInfo[];
  course(acc: string, id: string): CourseInfo | null;
  /** the languages the learner studies (null: not answered yet) */
  study(acc: string): string[] | null;
  setStudy(acc: string, codes: readonly string[]): string[];
  offered(acc: string): OfferedLang[];
  chosen(acc: string, course: CourseInfo): string[];
  studiesAny(acc: string, course: CourseInfo): boolean;
  progress(acc: string, course: CourseInfo): CourseProgress;
  /** the course the learner was last in (this device) */
  last(acc: string): string | null;
  setLast(acc: string, id: string): void;
  /** the course that opens for a language */
  courseFor(acc: string, code: string): CourseInfo | null;
  /** remembers the language a course opens on (its prefs.lang) */
  setCourseLang(acc: string, courseId: string, code: string): void;
  /**
   * Today's course: the one the learner was in (or the subject open now), else the first they study — with `lead`, only
   * the one they were in (it then stands for the big "continue" when no subject waits). null: no card.
   */
  today(acc: string, o?: { readonly lead?: boolean; readonly current?: string | null }): CourseInfo | null;
}

export function coursesService(d: CoursesDeps): CoursesService {
  const get = (k: string): unknown => {
    const r = d.kv.get(k);
    if (!r.ok || r.value == null) return null;
    try {
      return JSON.parse(r.value) as unknown;
    } catch {
      return null; // a value that is not JSON (hand-edited): as if it were not there
    }
  };
  const keys = (prefix: string): string[] => {
    const r = d.kv.keys(prefix);
    return r.ok ? r.value : [];
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const strings = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);

  const own = (acc: string): AccountCourse[] =>
    keys(`${P}${acc}:a:langcourse:`)
      .map(k => obj(get(k)))
      .filter(r => typeof r['id'] === 'string' && r['id'])
      .map(r => ({
        id: String(r['id']),
        title: typeof r['title'] === 'string' ? r['title'] : String(r['id']),
        languages: strings(r['languages']) ?? [],
        ...(typeof r['origin'] === 'string' ? { origin: r['origin'] } : {}),
      }));
  const added = (acc: string, cid: string): string[] =>
    keys(`${P}${acc}:a:langpack:${cid}:`)
      .map(k => obj(get(k))['code'])
      .filter((c): c is string => typeof c === 'string' && !!c);
  const courses = (acc: string): CourseInfo[] => listCourses(d.library(), own(acc), cid => added(acc, cid));
  const study = (acc: string): string[] | null => strings(obj(get(`${P}${acc}:a:settings`))['studyLangs']);
  const chosen = (acc: string, m: CourseInfo): string[] =>
    chosenLangs(m, study(acc), strings(obj(get(`${P}${acc}:s:lang:${m.courseId}:settings`))['languages']));
  const lastKey = (acc: string): string => `${P}${acc}:meta:lastLang`;
  const last = (acc: string): string | null => {
    const v = get(lastKey(acc));
    return typeof v === 'string' ? v : null;
  };
  return {
    courses,
    course: (acc, id) => courses(acc).find(m => m.courseId === id) ?? null,
    study,
    setStudy(acc, codes) {
      const v = [...new Set(codes)];
      d.putSettings(acc, { studyLangs: v });
      return v;
    },
    offered: acc => offeredLangs(courses(acc)),
    chosen,
    studiesAny: (acc, m) => studiesAny(m, study(acc)),
    progress(acc, m) {
      const pre = `${P}${acc}:s:lang:${m.courseId}:`;
      const records = keys(pre + 'lang:').map(k => [k.slice(pre.length), get(k)] as const);
      const now = d.clock.now();
      const sum = obj(get(`${P}${acc}:meta:langsum`))[m.courseId];
      return courseProgress(
        m,
        chosen(acc, m),
        records,
        langDay(now, new Date(now).getTimezoneOffset()),
        sum && typeof sum === 'object' ? sum : null,
      );
    },
    last,
    setLast(acc, id) {
      d.kv.set(lastKey(acc), JSON.stringify(id));
    },
    courseFor: (acc, code) => courseFor(code, courses(acc), m => chosen(acc, m), last(acc)),
    today(acc, o = {}) {
      const mine = courses(acc).filter(m => studiesAny(m, study(acc))),
        l = last(acc);
      return mine.find(m => m.courseId === l) ?? mine.find(m => 'lang:' + m.courseId === o.current) ?? (o.lead ? null : (mine[0] ?? null));
    },
    setCourseLang(acc, courseId, code) {
      const k = `${P}${acc}:s:lang:${courseId}:prefs`,
        pr = obj(get(k));
      d.kv.set(k, JSON.stringify({ ...pr, lang: code }));
    },
  };
}
