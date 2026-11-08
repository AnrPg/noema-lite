/**
 * THE STUDY SCREENS' PORT: everything the screens of the open subject need from outside their area — the subject the
 * loader opened and the learner's progress in it, the frame (crumbs, ⋮, sheets, toasts), the character's reactions, and
 * the features of the other areas that live on these screens (a Roadmap's step, interactive activities, 文A language
 * help, the subject's sharing and export, the search's rounds, ⚑ problem reports). One adapter implements it per app:
 * today the older engine's (engine/src/40_views.js `studyHost()`), once the shell owns loading a pack the new root's.
 * The screens never reach a global: what is not here, they do not use.
 */
import type { Course } from '../domain/course.ts';
import type { Chapter, Exercise, Media, StudyState, SubjectInfo } from '../domain/pack.ts';
import type { SourceRegistry } from '../domain/course.ts';
import type { Widget, WidgetApi } from './exercise/widget.ts';

/** One entry of a ⋮ menu or a Practice ▾ list ('-': a line). */
export type MenuEntry =
  | '-'
  | {
      readonly label: string;
      readonly sub?: string;
      /** a line icon's name (src/ui/kit/icons.ts) or an emoji */
      readonly icon?: string;
      readonly href?: string;
      readonly run?: () => void;
      readonly danger?: boolean;
      readonly badge?: string | null;
      /** the badge's tone (1 accent · 3 to do · 4 due) */
      readonly tone?: number;
    };

/** The frame's top bar for a screen (docs/UI_MAP.md "The frame"). */
export interface Chrome {
  /** the crumbs after the subject's own (the subject's are the frame's) */
  readonly crumbs: readonly (readonly [label: string, href?: string])[];
  readonly back?: string;
  readonly menu?: () => readonly (MenuEntry | null)[];
  /** reading mode: the top bar hides while the learner scrolls down on a phone */
  readonly reading?: boolean;
  /** a page under the subject's own (the subject's crumb then leads to #/subject) */
  readonly sub?: boolean;
  /** the character's small face in the corner (pages where one reads or practises) */
  readonly corner?: boolean;
}

export interface FramePort {
  chrome(c: Chrome): void;
  /** a ▾ button with a list (Practice ▾): the frame's menu button */
  menuButton(items: readonly (MenuEntry | null)[], o: { readonly label: string; readonly cls?: string }): HTMLElement;
  /** a sheet from the bottom (phones) or the side; → close */
  sheet(title: string, build: (body: HTMLElement, close: () => void) => void, o?: { readonly cls?: string }): () => void;
  /** a small dialog of the page (the older screens' modal); → close */
  modal(build: (box: HTMLElement, close: () => void) => void): () => void;
  toast(text: string, ms?: number): void;
  confirm(text: string): Promise<boolean>;
  navigate(href: string): void;
  /** the page's own small items next to ⋮ (the focus sprint's clock) */
  setActs(nodes: readonly HTMLElement[]): void;
  /** remember where the learner reads (Today › Continue) */
  noteRecent(r: Readonly<Record<string, string | number | null>>): void;
  /** the subject's language and 文A tags after its title (other areas' marks) */
  subjectTags(): readonly Node[];
  /** the character on screen now: its face (safe SVG markup), its name, its name's plural form flag */
  character(): { readonly face: string; readonly name: string; readonly avatar: string; readonly plural: boolean };
  /** the frame's own words (i18n/shell: 'sh.<key>' with the character's name in it) */
  L(key: string, params?: Readonly<Record<string, string | number>>): string;
}

export interface FeedbackPort {
  beep(kind: 'ok' | 'bad' | 'win' | 'tap'): void;
  confetti(n?: number): void;
  /** a big reaction of the character (rare: engine/react.js decides): goal, level, chapter, boss, bosswin, node, perfect, gym, timer, timerwin */
  big(kind: string): void;
  /** the small reaction to an answer */
  answered(ok: boolean, o: { readonly hard: boolean }): void;
  /** the last seconds of a timed round */
  tick(secondsLeft: number): void;
  /** the floating "+n XP" at an element */
  xpFloat(n: number, at: Element | null): void;
  /** the frame reacts with its own character (no confetti then) */
  readonly reacts: boolean;
}

/** The subject as a step of a Roadmap (area 3), when it is one. */
export interface StationInfo {
  readonly title: string;
  readonly mastered: boolean;
  /** the share of sections read and exercises solved that mastering needs */
  readonly pass: number;
}
export interface RoadmapPort {
  station(): StationInfo | null;
  openMap(): void;
  /** every step this subject teaches is still locked: the titles of the steps to master first (null: open) */
  lock(): { readonly missing: readonly string[] } | null;
  /** after the last chapter: the next step of the Roadmap ({ title, href }) */
  nextStep(): { readonly title: string; readonly href: string } | null;
  /** the level ladder over this subject (the Roadmap's, else the pack's own) and the level the learner reached on it */
  ladder(): readonly { readonly id: string; readonly order: number; readonly name: string }[];
  reachedLevel(): string | null;
}

/** Interactive activities (area 5): their blocks in the theory, their text for the tutor, whether they run here. */
export interface ActivitiesPort {
  block(b: Readonly<Record<string, unknown>>, sectionId: string): HTMLElement;
  asText(b: Readonly<Record<string, unknown>>): string;
  /** can this app run the exercise (a type or runtime it knows)? */
  runnable(ex: Exercise, chapter: Chapter): boolean;
  /** an activity exercise's answer area (the sim type) in the card's contract; null: not an activity's type */
  exercise(ex: Exercise, api: WidgetApi): Widget | null;
}

/** 文A language help (docs/BRIDGE.md): the words of a section in the learner's language. */
export interface BridgePort {
  section(o: { readonly sid: string; readonly body: HTMLElement; readonly head: HTMLElement }): void;
  menuItem(): MenuEntry | null;
}

/** What other areas add to the subject's ⋮ (Roadmap, edit, share, export, the activity author, the engines). */
export interface SubjectActionsPort {
  menu(): readonly (MenuEntry | null)[];
  /** the knowledge map, the reported exercises (⋮ entries of the subject and the chapter) */
}

/** A round made from search results (area 4, engine/search.js). */
export interface SearchRoundPort {
  step(): {
    readonly kind: 'ex' | 'cards';
    readonly ids?: readonly string[];
    readonly keys?: readonly string[];
    readonly title: string;
    readonly back: string;
  } | null;
  after(): { readonly label: string; run(): void } | null;
  /** the results page (when the round's step is not of this subject) */
  readonly page: string;
}

export interface StudyHost {
  readonly subject: SubjectInfo;
  readonly account: { readonly id: string; readonly name: string; readonly kind: string };
  readonly chapters: readonly Chapter[];
  readonly media: Readonly<Record<string, Media>>;
  readonly sources: SourceRegistry | null;
  /** the learner's progress in this subject (a live record: save() writes it) */
  readonly state: StudyState;
  save(): void;
  flush(): void;
  /** XP for the subject and the account (the day's goal and the XP level follow) → what it crossed */
  addXP(n: number): { readonly goal: boolean; readonly level: boolean };
  /** the day's XP goal (a:settings.goal) */
  readonly goal: number;
  /** the course changed (the source filter): the engine's other readers follow */
  courseChanged(course: Course): void;
  /** the learner's backup point before a reset (the account's restore points) */
  restorePoint(label: string): Promise<void>;
  readonly frame: FramePort;
  readonly feedback: FeedbackPort;
  readonly roadmap: RoadmapPort;
  readonly activities: ActivitiesPort;
  readonly bridge: BridgePort;
  readonly subjectActions: SubjectActionsPort;
  readonly search: SearchRoundPort;
  /** ⚑ the problem report of an item (area 4); null when reports are off */
  reportButton(item: { readonly kind: string; readonly id: string }): HTMLElement | null;
}
