/**
 * What the Languages tab (#/lang) and the question "Which languages do you want to study?" (D21) read and do, before any
 * course is loaded: the courses with their progress, the languages the app offers, the learner's choice, and the commands
 * that open a course or a language. The root answers it over src/features/languages (the courses of this device).
 */

/** A course as a row of the list. */
export interface CourseRow {
  readonly courseId: string;
  readonly title: string;
  /** every language of the course, and the ones the learner studies in it (D21) */
  readonly languages: readonly string[];
  readonly studied: readonly string[];
  /** the learner's own course (made through Claude) */
  readonly account: boolean;
  /** does the learner study a language of it */
  readonly studies: boolean;
  /** the course the learner was last in */
  readonly last: boolean;
  readonly words: number;
  readonly total: number;
  readonly due: number;
  readonly started: boolean;
  /** 0 … 1: words met of the words of the languages studied */
  readonly pct: number;
  /** the next lesson as the course last showed it */
  readonly next: { readonly step?: string; readonly title: string } | null;
}

/** A language the app offers: its code and the courses that teach it (their ids and titles). */
export interface OfferedLanguage {
  readonly code: string;
  readonly courses: readonly string[];
  readonly titles: readonly string[];
}

export interface LanguagesPort {
  courses(): readonly CourseRow[];
  /** the languages the learner studies (null: not answered yet) */
  study(): readonly string[] | null;
  /** the languages the app offers, in the order of the courses */
  offered(): readonly OfferedLanguage[];
  /** the languages of one course (its chooser lists them first) */
  courseLanguages(courseId: string): readonly string[];
  setStudy(codes: readonly string[]): void;
  /** the interface language's tag (the languages' names are written in it) */
  locale(): string;
  openCourse(courseId: string): void;
  /** a language's own home (#/lang/<code>) in the course that teaches it */
  openLanguage(code: string): void;
  /** + New language course (through Claude) */
  createCourse(): void;
  /** the address of a page of a course: its settings, its Claude tasks */
  courseHref(courseId: string, page: 'settings' | 'claude' | null): string;
}
