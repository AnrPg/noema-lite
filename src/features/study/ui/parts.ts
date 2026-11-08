/**
 * Small pieces every study screen draws: a pack text as safe markup, a code block, a pill, the chapter colour of an
 * element, the character's "Ask" button, and the AI and tutor services the screens call (implemented by tutor/).
 */
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { Chapter, Drill, Exercise, Section } from '../domain/pack.ts';
import { h } from './dom.ts';
import { codeBlockHtml, fmt, guessLang, type Text } from './text.ts';

/** a pack's inline text as markup in a Lit template */
export const F = (s: Text): unknown => unsafeHTML(fmt(s));
/** a pack's inline text as an element */
export const fEl = (s: Text): HTMLSpanElement => h('span', { html: fmt(s) });

/** a code block element (its ⧉ is handled for the page: text.ts wireCopy) */
export function codeEl(code: string, lang: string | undefined, copyLabel: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = codeBlockHtml(code, lang ?? guessLang(code), copyLabel);
  return box.firstElementChild as HTMLElement;
}

/** The chapter colours an element takes (tokens.css [data-ci], src/ui/tokens/chapters.ts). */
export const CHAPTER_COLOURS = 13;
export function accentOf(c: Chapter | null | undefined): string {
  return String(c ? (c._ci ?? c._i ?? 0) % CHAPTER_COLOURS : 7);
}
export function setAccent(el: HTMLElement, c: Chapter | null | undefined): void {
  el.dataset['ci'] = accentOf(c);
}

/** What the tutor is asked about (a part of the course) and where the question began. */
export interface TutorContext {
  readonly kind: 'section' | 'chapter' | 'exercise' | 'playbook' | 'item';
  readonly id: string;
  readonly text?: string;
  readonly label?: string;
  readonly sec?: string | null;
  readonly ch?: string | null;
  readonly origin?: Readonly<Record<string, string>>;
}

/** The tutor (tutor/tutor.ts): its drawer, its modes, the 💡 on a part of the lesson. */
export interface TutorPort {
  open(ctx?: TutorContext | null, mode?: string, firstMessage?: string | null, o?: { readonly intent?: string }): void;
  close(): void;
  /** the part of the course the learner is on (the tutor's default context) */
  setContext(ctx: TutorContext | null): void;
  /** "Ask <character>" about an exercise: hints before, Socratic or another angle after a wrong answer */
  askAbout(ex: Exercise, mode: 'hint' | 'socratic' | 'explain' | null, given?: string): void;
  /** the 💡 of a part of the lesson: explain this */
  explainable(el: HTMLElement, what: () => ExplainWhat): HTMLElement;
  /** the tasks for the AI by name (intent texts, English) */
  intent(name: string, given?: string): string;
}
export interface ExplainWhat {
  readonly label: string;
  readonly text: string;
  readonly sec?: Section;
  readonly ch?: Chapter;
  readonly what: string;
  readonly bid?: string;
}

/** The AI's one-shot jobs (grading a free answer, reviewing code, a new question, a drill's checklist). */
export interface AiPort {
  grade(
    ex: Exercise,
    answer: string,
  ): Promise<{ score: number; verdict: string; covered?: string[]; missing?: string[]; mistakes?: string[]; feedback: string }>;
  question(s: Section): Promise<Exercise>;
  drillGrade(d: Drill, answer: string): Promise<{ score: number; hit: number[]; feedback: string }>;
  /** the tutor's markdown as safe markup */
  md(text: string): HTMLElement;
}

/** the frame's quiet "Ask <character>" on a card: the face alone, its name on hover or focus */
export function askButton(face: string, avatar: string, label: string, onclick: (e: Event) => void): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'exask',
      type: 'button',
      title: label,
      'aria-label': label,
      onclick: (e: Event) => {
        e.stopPropagation();
        onclick(e);
      },
    },
    face ? h('span', { class: 'exface', html: face, 'aria-hidden': 'true' }) : h('span', { 'aria-hidden': 'true' }, avatar),
    h('span', { class: 'lbl' }, label),
  );
}
