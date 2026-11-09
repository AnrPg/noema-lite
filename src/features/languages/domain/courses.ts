/**
 * The language courses as the app lists them, before any course is loaded (docs/LANGUAGES.md §5.6, §8, §10;
 * docs/LANGUAGE_RULES.md D21, D25, D29): the courses of the library and the learner's own, the languages a package added,
 * which languages the learner studies (one answer for the whole app, a:settings.studyLangs), the languages the app offers,
 * and the progress of a course read from its stored learner state (words met, reviews due) without loading the course.
 * Pure: the stored records come in as values (application/courses.ts reads them).
 */

/** A course of the library (window.NOEMA_REGISTRY.languages, written by tools/build.py). */
export interface LibraryCourse {
  readonly id: string;
  readonly title: string;
  readonly languages: readonly string[];
  /** words per language (the progress bar of the list) */
  readonly words?: Readonly<Record<string, number>>;
}

/** A course the learner made through Claude (a:langcourse:<id>, docs/LANGUAGES.md §10.1). */
export interface AccountCourse {
  readonly id: string;
  readonly title: string;
  readonly languages: readonly string[];
  readonly origin?: string;
}

/** A course as the lists show it: its id, title, languages (with those a package added), whether it is the learner's own. */
export interface CourseInfo {
  readonly courseId: string;
  readonly title: string;
  readonly languages: readonly string[];
  readonly account: boolean;
  readonly words: Readonly<Record<string, number>>;
}

/** Every course: the library's first, then the learner's own (a course id once), each with the languages packages added. */
export function listCourses(
  library: readonly LibraryCourse[],
  own: readonly AccountCourse[],
  added: (courseId: string) => readonly string[],
): CourseInfo[] {
  const out: CourseInfo[] = [],
    seen = new Set<string>();
  const withAdded = (langs: readonly string[], id: string): string[] => [...langs, ...added(id).filter(c => !langs.includes(c))];
  for (const m of library) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ courseId: m.id, title: m.title, languages: withAdded(m.languages, m.id), account: false, words: m.words ?? {} });
  }
  for (const r of own) {
    if (r.origin !== 'account' || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ courseId: r.id, title: r.title, languages: withAdded(r.languages, r.id), account: true, words: {} });
  }
  return out;
}

/** One language the app offers and the courses that teach it, in the order of the courses. */
export interface OfferedLang {
  readonly code: string;
  readonly courses: readonly string[];
}

export function offeredLangs(courses: readonly CourseInfo[]): OfferedLang[] {
  const out: { code: string; courses: string[] }[] = [];
  for (const m of courses)
    for (const c of m.languages) {
      let x = out.find(o => o.code === c);
      if (!x) out.push((x = { code: c, courses: [] }));
      if (!x.courses.includes(m.courseId)) x.courses.push(m.courseId);
    }
  return out;
}

/**
 * The languages of a course the learner studies (D21; the twin of NoemaLang.studyLangs, without loading the course): the
 * chosen ones it has; before the first answer, or when it has none of them, what the course taught before (its own
 * settings.languages), else all.
 */
export function chosenLangs(
  course: Pick<CourseInfo, 'languages'>,
  study: readonly string[] | null,
  ownSetting: readonly string[] | null,
): string[] {
  const all = [...new Set(course.languages)];
  const own = ownSetting ? all.filter(c => ownSetting.includes(c)) : [];
  if (study) {
    const x = all.filter(c => study.includes(c));
    if (x.length) return x;
  }
  return own.length ? own : all;
}

/** Does the learner study a language of this course? (before the first answer: every course counts) */
export const studiesAny = (course: Pick<CourseInfo, 'languages'>, study: readonly string[] | null): boolean =>
  !study || course.languages.some(c => study.includes(c));

/** A stored item of the learner state of a course (s:lang:<course>:lang:<code>:node:<id> | script): its two tracks' due days. */
interface StoredItem {
  readonly r?: { readonly due?: unknown };
  readonly p?: { readonly due?: unknown };
}

/** The progress of a course in one language. */
export interface LangProgress {
  readonly words: number;
  readonly due: number;
  readonly total: number;
}

/** The next lesson the open course last showed (device-local, meta:langsum): its step label and title. */
export interface CourseSummary {
  readonly next?: { readonly node?: string; readonly step?: string; readonly title: string } | null;
}

export interface CourseProgress {
  readonly langs: readonly string[];
  readonly per: Readonly<Record<string, LangProgress>>;
  readonly due: number;
  readonly words: number;
  readonly total: number;
  /** words met / words of the course in the languages studied (0 … 1) */
  readonly pct: number;
  readonly started: boolean;
  readonly sum: CourseSummary | null;
}

/**
 * The progress of a course from its stored learner state: per language the words met and the reviews due today.
 * `records` are the stored learner records as [their key after `s:lang:<course>:`, the parsed value].
 */
export function courseProgress(
  course: CourseInfo,
  langs: readonly string[],
  records: readonly (readonly [string, unknown])[],
  day: number,
  sum: CourseSummary | null,
): CourseProgress {
  const per: Record<string, { words: number; due: number; total: number }> = {};
  for (const c of langs) per[c] = { words: 0, due: 0, total: course.words[c] ?? 0 };
  let started = false;
  for (const [k, v] of records) {
    const m = /^lang:([^:]+):(node:.+|script)$/.exec(k),
      x = m?.[1] !== undefined ? per[m[1]] : undefined;
    if (!m || !x || !v || typeof v !== 'object') continue;
    const items = (v as { items?: unknown }).items;
    if (!items || typeof items !== 'object') continue;
    for (const it of Object.values(items as Record<string, unknown>)) {
      if (!it || typeof it !== 'object') continue;
      started = true;
      if (m[2] !== 'script') x.words++;
      const s = it as StoredItem;
      for (const t of [s.r, s.p]) if (t && typeof t.due === 'number' && t.due <= day) x.due++;
    }
  }
  const sumOf = (f: 'words' | 'due' | 'total'): number => Object.values(per).reduce((a, p) => a + p[f], 0);
  const words = sumOf('words'),
    total = sumOf('total');
  return { langs, per, due: sumOf('due'), words, total, pct: total ? Math.min(1, words / total) : 0, started, sum };
}

/** The day number the course runtime counts in (NoemaLang.dayNumber: whole local days since 1970). */
export const langDay = (now: number, tzOffsetMinutes: number): number => Math.floor((now - tzOffsetMinutes * 60000) / 864e5);

/** The course that opens for a language: the one the learner was last in that teaches it to them, else the first. */
export function courseFor(
  code: string,
  courses: readonly CourseInfo[],
  chosen: (c: CourseInfo) => readonly string[],
  last: string | null,
): CourseInfo | null {
  const cs = courses.filter(m => m.languages.includes(code) && chosen(m).includes(code));
  return cs.find(x => x.courseId === last) ?? cs[0] ?? null;
}
