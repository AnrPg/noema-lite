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

/** The look of the lanes: automatic (by the width), tiles or dots. */
export type LanesView = '' | 'tiles' | 'dots';

/** A step in one lane: its node, step label (S03; empty for a field), short title, compact code (S3, V2a), state. */
export interface LaneCell {
  readonly node: string;
  readonly step: string;
  readonly title: string;
  readonly short: string;
  readonly code: string;
  /** the learner state (passed, learning, open, locked …): the tile's tint */
  readonly state: string;
  /** that state in words, for a name or a tip */
  readonly stateLabel: string;
  /** ✓ ★ ◑ ○ 🔒 … or empty */
  readonly sign: string;
}

/** One level of the lanes: the section it starts (its label, or null), whether every lane has it, its cells by language. */
export interface LaneRow {
  readonly section: string | null;
  readonly common: boolean;
  readonly cells: Readonly<Record<string, LaneCell | null>>;
}

export interface LanesModel {
  readonly langs: readonly CourseLang[];
  readonly view: LanesView;
  readonly rows: readonly LaneRow[];
  /** the width the lanes have now (px) */
  width(): number;
}

/** A step's card in one language: what it teaches there, the words, how far the learner is, its other languages. */
export interface LaneInfo {
  readonly node: string;
  readonly title: string;
  readonly lang: CourseLang;
  readonly state: string;
  readonly functions: readonly { readonly title: string; readonly note: string | null }[];
  readonly words: number;
  readonly others: readonly { readonly code: string; readonly label: string; readonly state: string }[];
}

/** The head of a lesson's page: its step and title, each language's state, the ladder, what the buttons do. */
export interface LessonHead {
  readonly step: string;
  readonly title: string;
  readonly langs: readonly {
    readonly code: string;
    readonly flag: string;
    /** the node state (open, learning, passed …): the pill's tint */
    readonly state: string;
    /** that state in words (with its sign) */
    readonly stateLabel: string;
    /** the best lesson check, percent (null: not taken) */
    readonly pct: number | null;
  }[];
  /** D22: the four steps over the languages that can learn it now (null: none can) */
  readonly ladder: {
    readonly steps: readonly { readonly id: string; readonly done: boolean; readonly open: boolean }[];
    readonly next: string | null;
  } | null;
  /** the languages that can learn it now (Continue runs the ladder for them) */
  readonly can: readonly string[];
  /** words met with more to learn about them: Deepen */
  readonly deepen: { readonly n: number; readonly href: string } | null;
  /** D23: the line under foreign words, where a studied language has one (null: none has) */
  readonly translit: { readonly on: boolean } | null;
  /** inside the app's frame: one primary action and no pictographs; the states, Deepen and Aa· are in the frame's ⋮ */
  readonly frame: boolean;
}

/** One piece of a run of foreign text (lang-word.ts): plain text, a word of the course (it opens its card), or a word read by rule. */
export interface WordToken {
  readonly text: string;
  /** the word of the course it is (its card opens on tap) */
  readonly lex?: string;
  /** read by rule: not in the course, but its vowel marks give its reading (Hebrew, Arabic) */
  readonly ruled?: boolean;
  /** its reading in Latin letters (D24), when the run shows readings */
  readonly reading?: string | undefined;
  /** D23: not taught to this learner yet (the dotted underline) */
  readonly fresh?: boolean;
  /** what it means, in the explanation language (its title) */
  readonly gloss?: string;
}

/** A foreign word or run as the learner should see it. */
export interface WordView {
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
  /** the text with its vowel marks as far as the learner reads them */
  readonly shown: string;
  /** the reading under the word (a word of the course with sub): transliteration or pinyin */
  readonly help: { readonly text: string; readonly lang: string } | null;
  /** the words of the run, when they may open their cards (null: shown whole) */
  readonly run: { readonly title: string; readonly tokens: readonly WordToken[] } | null;
}

export interface WordOptions {
  readonly lex: string | null;
  readonly sub: boolean;
  readonly marks: string | null;
  /** the words may open their cards here */
  readonly link: boolean;
}

/** What a foreign word needs of the course (lang-word.ts). */
export interface WordPort {
  /** null: not a language of the course */
  word(code: string, text: string, o: WordOptions): WordView | null;
  /** the card of a word over the page */
  openWord(code: string, lex: string): void;
  /** D23: is there a line under foreign words, and is it shown */
  translit(): { readonly has: boolean; readonly on: boolean };
  /** D23: show or hide the transliteration / pinyin under foreign words */
  setTranslit(on: boolean): void;
}

/** A grammar point as a tile: its function id and title. */
export interface PointTile {
  readonly id: string;
  readonly title: string;
}

/** One entry of a profile part of an aspect page: the word, then what its profile says. */
export interface AspectEntry {
  readonly lex: string;
  readonly lemma: string;
  /** the word's card (an address of the page) */
  readonly href: string;
  /** what the filter searches, folded (the word in its script, its readings, the entry's text) */
  readonly hay: string;
  /** the entry's values per facet (reg, conn, status) */
  readonly meta: Readonly<Record<string, readonly string[]>>;
  readonly kind: 'use' | 'phrase' | 'etymology' | 'fact';
  readonly badges?: readonly { readonly cls: string; readonly text: string }[];
  readonly gloss?: string;
  readonly text?: string;
  readonly tr?: string;
  readonly meaning?: string;
  readonly source?: string;
  readonly src?: string;
  /** a fun fact as the course writes its notes (R2), drawn by the course */
  readonly note?: Node;
}

export interface AspectPart {
  /** idioms, registers, sayings, facts, etymology */
  readonly key: string;
  readonly entries: readonly AspectEntry[];
  /** the chips: each facet with two values or more */
  readonly facets: readonly { readonly facet: string; readonly values: readonly { readonly v: string; readonly label: string }[] }[];
}

/** The page of one study area of a language (D29). */
export interface AspectPage {
  readonly lang: CourseLang;
  readonly aspect: string;
  /** grammar: the word forms by the feature they inflect, the sentences by level (null: another aspect) */
  readonly grammar: {
    readonly forms: readonly { readonly tag: string; readonly fns: readonly PointTile[] }[];
    readonly sentences: readonly { readonly level: string; readonly fns: readonly PointTile[] }[];
  } | null;
  /** the aspect's grammar points (an aspect other than grammar) */
  readonly points: readonly PointTile[];
  /** what the word profiles hold for it (null: the profiles are still loading) */
  readonly parts: readonly AspectPart[] | null;
  /** the course's views of the aspect (writing: script, write) */
  readonly views: readonly string[];
}

export interface CoursePort extends WordPort {
  /** the page of one study area of a language (null: no such aspect) */
  aspect(code: string, aspect: string): AspectPage | null;
  /** folds a text as the search does: a word matches in its script, its scholarly transliteration and plain Latin */
  fold(text: string): string;
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
  /** ⫴ the parallel lanes of the learner's languages */
  lanes(): LanesModel;
  setLanesView(view: LanesView): void;
  laneInfo(code: string, node: string): LaneInfo;
  /** opens a step of the path in that language (its lesson or its page) */
  openStep(code: string, node: string): void;
  /** the head of a lesson's page (null: not a lesson of the languages shown) */
  lessonHead(node: string): LessonHead | null;
}
