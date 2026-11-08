/**
 * The open subject as the study screens read it: the pack's chapters after the loader normalised them (every list is
 * there, maybe empty), the fields each exercise type uses, and the learner's progress in this subject (the state the
 * learning log projects; today the subject's state record). The pack's own contracts are src/contracts (chapter.v1);
 * these are the parts the screens rely on.
 */
/** a text of a pack: a string, sometimes a number */
export type Text = string | number;

export interface Region {
  readonly id: string;
  readonly shape?: 'rect' | 'circle' | 'poly';
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly rx?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly r?: number;
  readonly points?: readonly (readonly [number, number])[];
  readonly anchor?: readonly [number, number];
  readonly label?: string;
  readonly note?: string;
  readonly q?: string;
  readonly options?: readonly string[];
}

export interface Media {
  readonly w: number;
  readonly h: number;
  readonly data?: string;
  readonly url?: string;
  readonly mime?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly credit?: string;
  readonly license?: string;
  readonly regions?: readonly Region[];
}

export interface Block {
  readonly t: string;
  readonly src?: string;
  readonly text?: string;
  readonly items?: readonly unknown[];
  readonly ordered?: boolean;
  readonly code?: string;
  readonly lang?: string;
  readonly caption?: string;
  readonly head?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly kind?: string;
  readonly title?: string;
  readonly label?: string;
  readonly questions?: readonly string[];
  readonly media?: string;
  readonly regions?: readonly Region[];
  readonly explore?: boolean;
  readonly [k: string]: unknown;
}

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly hook?: string;
  readonly level?: string;
  readonly src?: string;
  readonly blocks: readonly Block[];
}

export interface Choice {
  readonly text: string;
  readonly ok?: boolean;
  readonly fb?: string;
  readonly to?: string;
}

export interface Exercise {
  readonly id: string;
  readonly type: string;
  readonly section: string;
  readonly difficulty: number;
  readonly tags: readonly string[];
  readonly q?: string;
  readonly code?: string;
  readonly lang?: string;
  readonly explain?: string;
  readonly quick?: boolean;
  readonly level?: string;
  readonly lr?: string;
  readonly src?: string;
  readonly cite?: { readonly src?: string; readonly loc?: string };
  readonly options?: readonly string[];
  readonly answer?: unknown;
  readonly multi?: boolean;
  readonly why?: Readonly<Record<string, string>> | readonly string[];
  readonly items?: readonly unknown[];
  readonly pairs?: readonly (readonly [string, string])[];
  readonly buckets?: readonly string[];
  readonly text?: string;
  readonly bank?: readonly string[];
  readonly asCode?: boolean;
  readonly lines?: readonly string[];
  readonly bugs?: readonly number[];
  readonly fix?: string;
  readonly unit?: string;
  readonly steps?: readonly { readonly prompt: string; readonly code?: string; readonly options: readonly Choice[] }[];
  readonly model?: string;
  readonly rubric?: readonly string[];
  readonly solution?: string;
  readonly flaws?: readonly number[];
  readonly reasons?: readonly string[];
  readonly reason?: number;
  readonly parts?: readonly (Exercise & { readonly q: string })[];
  readonly outcome?: string;
  readonly nodes?: Readonly<Record<string, { readonly q: string; readonly options: readonly Choice[] }>>;
  readonly start?: unknown;
  readonly scores?: readonly number[];
  readonly sides?: readonly {
    readonly position: string;
    readonly counters: readonly string[];
    readonly best: number;
    readonly why?: readonly string[];
  }[];
  readonly media?: string;
  readonly regions?: readonly Region[];
  readonly any?: boolean;
  readonly maskLabels?: boolean;
  readonly mask?: boolean;
  readonly distractors?: readonly string[];
  readonly grid?: readonly [number, number];
  readonly order?: string;
  /** made by the AI on the spot (not part of the pack: no answer record, no ⚑) */
  readonly _ai?: boolean;
  readonly [k: string]: unknown;
}

export interface Flashcard {
  readonly id?: string;
  readonly q: Text;
  readonly a: Text;
  readonly section?: string;
  readonly level?: string;
  readonly src?: string;
  /** the card's progress key (its id, or chNN#k for a pack without ids) */
  readonly _key?: string;
}

export interface Drill {
  readonly id: string;
  readonly title: string;
  readonly section?: string;
  readonly symptom: string;
  readonly askYourself: readonly string[];
  readonly steps: readonly { readonly do: string; readonly why?: string; readonly code?: string }[];
  readonly rootCauses: readonly string[];
  readonly fix: string;
  readonly mnemonic?: string;
  readonly level?: string;
  readonly src?: string;
}

export interface Pitfall {
  readonly title: string;
  readonly text: string;
  readonly fix?: string;
  readonly src?: string;
}

export interface Chapter {
  readonly id: string;
  readonly num: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly emoji?: string;
  readonly mantra?: string;
  readonly objectives: readonly string[];
  readonly level?: string;
  readonly src?: string;
  readonly sourcePages?: string;
  readonly sources?: readonly { readonly id?: string; readonly src?: string; readonly pages?: string; readonly label?: string }[];
  readonly sections: readonly Section[];
  readonly exercises: readonly Exercise[];
  readonly flashcards: readonly Flashcard[];
  readonly debug: readonly Drill[];
  readonly pitfalls: readonly Pitfall[];
  readonly map?: { readonly learnables?: readonly unknown[] };
  /** the chapter's colour number (its place in the whole pack) */
  readonly _ci?: number;
  readonly _i?: number;
}

export interface SubjectInfo {
  readonly id: string;
  readonly title: string;
  readonly emoji?: string;
  readonly language?: string;
  readonly description?: string;
  readonly hero?: { readonly mantra?: string };
  readonly searchExamples?: string;
  readonly features?: { readonly math?: boolean };
  readonly levels?: readonly unknown[];
}

/** One answer record (S.res): attempts, right ones, the last verdict and how sure the learner was. */
export interface AnswerRecord {
  n: number;
  ok: number;
  last?: boolean;
  t?: number;
  conf?: 'sure' | 'think' | 'guess';
}

export interface StudySettings {
  goal: number;
  chunk: boolean;
  sound: boolean;
  lang?: string;
  apiKey?: string;
  model?: string;
  models?: readonly string[];
  fsrs?: { parameters?: readonly number[]; retention?: number; n?: number } | null;
  srcOn?: readonly string[] | null;
  [k: string]: unknown;
}

/** The learner's progress in the open subject (the engine's state record of it). */
export interface StudyState {
  xp: number;
  read: Record<string, boolean>;
  res: Record<string, AnswerRecord>;
  pb: Record<string, unknown>;
  fc: Record<string, unknown>;
  boss: Record<string, boolean>;
  last: string | null;
  flags?: Record<string, { why: string; note: string; t: number }>;
  bestLightning?: number;
  seenSrc?: Record<string, boolean>;
  nodeDone?: number;
  settings: StudySettings;
  [k: string]: unknown;
}
