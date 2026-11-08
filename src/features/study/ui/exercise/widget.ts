/**
 * The contract of an exercise type's answer area (a widget): it shows the exercise's own interaction, collects what the
 * learner did as an Answer in the exercise's own indices (the shapes in domain/grading/grade.ts), and marks right and
 * wrong once checked. Whether an answer is right is always the study domain's verdict, never the widget's.
 */
import { gradeExercise, type Answer } from '../../domain/grading/grade.ts';
import type { Region as GradeRegion } from '../../domain/grading/regions.ts';
import type { Exercise, Media } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';

export interface WidgetApi {
  locked(): boolean;
  /** the card's Check (one-tap types check at once) */
  check(): void;
  /** a type that grades itself (a scenario, a tree, a self check) is done */
  done(ok: boolean): void;
}

export interface Widget {
  readonly el: HTMLElement;
  readonly answer?: () => Answer;
  /** the verdict now: true, false, or null when the answer is not finished */
  readonly check?: () => boolean | null;
  /** marks right and wrong after the check */
  readonly reveal?: () => void;
  /** what the learner entered, as text for the tutor */
  readonly given?: () => string;
  /** the 1–6 keys choose option k */
  readonly keys?: (k: number) => void;
  readonly focus?: () => void;
  /** answering is the check (no Check button) */
  readonly auto?: boolean;
  /** the widget reports its own verdict (api.done) */
  readonly selfDone?: boolean;
  /** extra XP (answering early in a reveal) */
  readonly bonus?: () => number;
}

export interface WidgetCtx {
  readonly app: StudyApp;
  readonly ex: Exercise;
  readonly api: WidgetApi;
  readonly media: Readonly<Record<string, Media>>;
}

export type Renderer = (c: WidgetCtx) => Widget;

export interface Verdict {
  readonly ok: boolean | null;
  readonly score: number;
  readonly items?: readonly boolean[];
  readonly typos?: readonly boolean[];
  readonly missing?: readonly string[];
}

/** The study domain's verdict on an answer (null: not finished, or a type this app cannot grade). */
export function verdictOf(ex: Exercise, answer: Answer, regions?: readonly GradeRegion[]): Verdict {
  const r = gradeExercise(ex, answer, regions ? { regions } : {});
  if (!r.ok || r.value.status === 'incomplete') return { ok: null, score: 0 };
  const d = r.value.detail;
  return {
    ok: r.value.ok,
    score: r.value.score,
    ...(d.items ? { items: d.items } : {}),
    ...(d.typos ? { typos: d.typos } : {}),
    ...(d.missing ? { missing: d.missing } : {}),
  };
}

/** an exercise's list field as strings (the pack's loose shapes) */
export const strings = (x: unknown): string[] => (Array.isArray(x) ? x.map(v => (typeof v === 'string' ? v : JSON.stringify(v))) : []);
export const indices = (x: unknown): number[] =>
  Array.isArray(x) ? x.filter((v): v is number => typeof v === 'number') : typeof x === 'number' ? [x] : [];
