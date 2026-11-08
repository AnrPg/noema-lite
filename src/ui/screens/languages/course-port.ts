/**
 * What the screens of an open language course read and do (docs/LANGUAGES.md §8, docs/LANGUAGE_RULES.md D21–D29): plain
 * models of the course as the learner has it now, and the commands its pages start. The course's runtime (engine/langcore.js
 * and the course state of engine/lang/*: the learner, the languages studied, the explanation locale) answers them today
 * (engine/lang/14_screens.js); the screens never see that state itself.
 */

/** A language of the course as the screens name it: its code, flag, name in the interface language, how far the learner is. */
export interface CourseLang {
  readonly code: string;
  readonly flag: string;
  /** its name in the interface language: as a label (Hebrew) and inside a sentence (Hebrew, hebreo …) */
  readonly label: string;
  readonly name: string;
  /** words known (recognised, produced or mastered) of all the words of the language in the course */
  readonly known: number;
  readonly total: number;
}

/** A lesson on the path (the common order, D13): its step label (S03, C12), its title, done for this language. */
export interface PathStep {
  readonly id: string;
  readonly step: string;
  readonly title: string;
  readonly done: boolean;
}

/** One study area (aspect, D29) of a language: its key (sounds, grammar …), the page it opens, its grammar points. */
export interface AspectTile {
  readonly aspect: string;
  readonly href: string;
  readonly points: number;
}

/** The home of one language (#/lang/<code>, D29). */
export interface LangHomeModel {
  readonly lang: CourseLang;
  /** the language's own name for itself when it differs from the label (עברית) */
  readonly nativeName: string | null;
  /** the lesson to continue (the next step of its ladder, D22), or null when every lesson is done */
  readonly next: { readonly id: string; readonly step: string; readonly title: string; readonly ladderStep: string | null } | null;
  /** what a session holds today: reviews due, new words */
  readonly due: { readonly reviews: number; readonly newWords: number };
  /** the course has several languages: the parallel lanes (D13, §9.2) */
  readonly lanes: boolean;
  readonly path: readonly PathStep[];
  readonly aspects: readonly AspectTile[];
  /** the vocabulary's topics (the shelf of books) */
  readonly topics: readonly { readonly field: string; readonly title: string }[];
  /** the tools that are not aspects: principal parts, name-them-all, peculiarities */
  readonly tools: readonly { readonly name: string; readonly href: string }[];
}

/** The strip of the learner's languages (D29: the only language picker): All · a chip per language. */
export interface LangStripModel {
  readonly langs: readonly CourseLang[];
  /** the chip that is on: a language code, or null for All */
  readonly current: string | null;
  /** the name of the language the course explains in (D19), shown at the end of the strip */
  readonly explainName: string;
}

export interface CoursePort {
  /** the home of one language of the course */
  home(code: string): LangHomeModel;
  strip(): LangStripModel;
  /** opens an address of the course (#/lesson/S03, #/aspects/he/grammar …: the course's own addresses) */
  go(hash: string): void;
  /** the strip's chip: the same page for that language (null: All, the combined course) */
  pick(code: string | null): void;
  /** runs the next step of a lesson's ladder for these languages (D22) */
  continueLesson(id: string, langs: readonly string[]): void;
  /** today's session of one language: reviews and new words */
  session(code: string): void;
}
