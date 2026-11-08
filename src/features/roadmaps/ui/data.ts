/**
 * What the Roadmap screens need from the app: one small data port (the screens never read a global). The root hands it to
 * them as the kit hands its services — a bubbling, composed `noema-roadmaps-data` request that the nearest provider
 * answers (src/composition/roadmaps-ui.ts implements it over the app's stores today; the lead swaps the implementation,
 * never the screens).
 */
import type { Unsubscribe } from '../../../ports/common.ts';
import type { LevelService } from '../application/levels.ts';
import type { TestQuestion } from '../domain/levels.ts';
import type { Roadmap } from '../domain/model.ts';
import type { StepStatus } from '../domain/status.ts';

export type { TestQuestion };

/** A pack as the level test reads it: its chapters' exercises. */
export interface PackExercises {
  readonly chapters?: readonly { readonly exercises?: readonly Record<string, unknown>[] }[];
}

export interface RoadmapsData {
  /** The learner's Roadmap with this id (null: not on this device). */
  roadmap(account: string, id: string): Roadmap | null;
  /** Is this step of the Roadmap mastered (the app's statuses)? */
  mastered(account: string, c: Roadmap): (stepId: string) => boolean;
  /** Someone shared this Roadmap with the learner: its owner decides on its arrangement. */
  isMember(c: Roadmap): boolean;
  /** The ladder: where the learner is, moving up, a level test taken (NoemaCore.roadmaps.levels). */
  readonly levels: LevelService;
  /** The prepared packs of these steps (a step without one is left out). */
  packs(account: string, c: Roadmap, stepIds: readonly string[]): Promise<PackExercises[]>;
  /** The questions of a step's placement test (from its pack when it is prepared, else written by the AI). */
  placementQuestions(account: string, c: Roadmap, stepId: string): Promise<TestQuestion[]>;
  /** A step's placement test was taken: → mastered now (score ≥ the pass mark). */
  passStep(account: string, c: Roadmap, stepId: string, score: number): boolean;
  /** The learner (the owner) decides on a restructuring proposal: → an error to show, or null. */
  decide(account: string, roadmapId: string, proposalId: string, approve: boolean): Promise<string | null>;
  /** A question's Markdown (bold, code, formulas) as safe inline HTML. */
  inline(markdown: string): string;
  /** A short message in the app's notices (🔔). */
  notify(text: string): void;

  /* ---- the library and the map ---- */
  /** The learner's Roadmaps, newest first. */
  list(account: string): Roadmap[];
  /** Every step's status from the learner's progress (mastered, open, its score …). */
  statuses(account: string, c: Roadmap): Record<string, StepStatus>;
  /** Something changed (a Roadmap, a preparation, a shared map, the Claude app): → stop listening. */
  onChange(listener: () => void): Unsubscribe;
  /** Text to the clipboard: → it is there. */
  copy(text: string): Promise<boolean>;
  /** 📚 how many subjects are on the Shelf (on no step of any Roadmap) */
  shelfCount(account: string): Promise<number>;
  /** A cloud account is signed in (sharing and joining need one). */
  cloudOn(account: string): boolean;
  /** The steps' preparation here and in the learner's Claude app. */
  readonly prep: PrepPort;
  /** 👥 sharing a Roadmap, invitations. */
  readonly share: SharePort;
  /** 💬 the learner's Claude app: what waits for it, by message or by hand. */
  readonly app: AppPort;
  /** 📚 From your sources: the material read once, a proposal, the build. */
  readonly sources: SourcesPort;
  /** the learner's character and its little pictures (trusted SVG of the app) */
  readonly art: ArtPort;
}

export interface ArtPort {
  /** the learner's character as SVG (null: none) */
  mascot(): string | null;
}

/** A step being prepared: the Roadmap's id + "/" + the step's id. */
export type StepKey = string;

export interface PrepPort {
  /** the step being prepared on this device now (null: none) */
  busy(): StepKey | null;
  /** its last progress line */
  live(key: StepKey): string;
  /** preparing is paused on this device */
  paused(): boolean;
  /** prepare a step here (with the Roadmap's AI); resume: go on where it stopped, raiseBudget: its new limit */
  request(account: string, c: Roadmap, stepId: string, o?: { resume?: boolean; raiseBudget?: number }): void;
  /** stop the preparation that runs */
  stop(): void;
  /** queue a step for the Claude app · take it out of the queue */
  toApp(c: Roadmap, stepId: string): void;
  fromApp(c: Roadmap, stepId: string): void;
  /** queue many steps ahead for the Claude app */
  queueMany(account: string, c: Roadmap, howMany: number | 'all', o: { review: boolean }): QueueResult;
  /** "I already know this" undone */
  unmaster(account: string, c: Roadmap, stepId: string): void;
}

export interface QueueResult {
  readonly queued: number;
  readonly needReview: number;
  readonly needPlan: number;
}

/** An invitation to a Roadmap someone shares. */
export interface Invite {
  readonly curriculum: string;
  readonly title: string;
  readonly owner_name?: string;
  readonly language?: string;
  readonly message?: string;
  readonly steps?: number;
}

/** A person a Roadmap is shared with. */
export interface Member {
  readonly email: string;
  readonly name?: string;
  /** pending · joined · rejected · left · revoked */
  readonly status: string;
}

export interface SharePort {
  invites(account: string): Promise<Invite[]>;
  join(account: string, roadmapId: string): Promise<Roadmap>;
  decline(roadmapId: string): Promise<void>;
  publish(account: string, roadmapId: string, o: { isPublic: boolean; steps: boolean; onLog: (line: string) => void }): Promise<void>;
  setPublic(account: string, roadmapId: string, on: boolean): Promise<void>;
  invite(account: string, roadmapId: string, email: string, message: string): Promise<void>;
  members(roadmapId: string): Promise<Member[]>;
  removeMember(roadmapId: string, email: string, o: { pending: boolean }): Promise<void>;
  unpublish(account: string, roadmapId: string): Promise<void>;
  /** a step another member prepared, to this device: → its subject's id */
  download(account: string, roadmapId: string, stepId: string): Promise<string>;
  /** keep my own version of a step (not the author's newer one) */
  keepStep(account: string, roadmapId: string, stepId: string): void;
}

/** The next task for the Claude app, to copy by hand. */
export interface AppTask {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly files?: readonly string[];
  readonly steps: readonly string[];
}

export interface AppPort {
  /** start watching the Claude app's answers for this account */
  start(account: string): void;
  /** the message for a Claude chat: it does the next `count` steps */
  message(c: Roadmap, count: number): string;
  /** when the answers were last looked for (ms) · the last problem */
  lastCheck(): number | null;
  error(): string | null;
  /** look for answers now: → how many arrived */
  poll(account: string): Promise<number>;
  copyTask(account: string, roadmapId: string): AppTask | null;
  /** an answer pasted by hand: → its problems, or the line that says what it did */
  paste(account: string, roadmapId: string, taskId: string, text: string): { errors?: string[]; line?: string };
  /** a task's files to this device */
  downloadFiles(account: string, roadmapId: string, task: AppTask): Promise<void>;
  /** a step's material as one package for a Claude chat: → its name and the files not on this device */
  bundle(account: string, roadmapId: string, stepId: string): Promise<{ name: string; missing: string[] }>;
  /** the package Claude made for a step (.noema.zip / .json): → its title */
  importPackage(account: string, roadmapId: string, stepId: string, file: File): Promise<{ title: string }>;
}

/** One file of the material, read once on this device. */
export interface SourceItem {
  readonly name: string;
  readonly [k: string]: unknown;
}

/** A proposal for the material: both shapes, the recommended one first. */
export interface SourcePlan {
  readonly via: string;
  readonly recommend: 'course' | 'roadmap';
  readonly reasons: readonly string[];
  readonly title: string;
  readonly course: { readonly chapters: readonly PlanItem[] };
  readonly roadmap: { readonly steps: readonly PlanItem[] };
}
export interface PlanItem {
  readonly title: string;
  readonly summary?: string;
  readonly files: readonly string[];
}

export interface SourceOptions {
  readonly title: string;
  readonly goal: string;
  readonly language: string;
  readonly notes: string;
}

export interface SourcesPort {
  /** the AI keys on this device */
  keys(account: string): { claude: boolean; gemini: boolean };
  /** a Claude key: a subject can be made here */
  canMakeHere(account: string): boolean;
  /** the languages a Roadmap may have: code → its name */
  languages(): Readonly<Record<string, string>>;
  /** a provider the Roadmap's planning can use ('claudeapp' always) */
  providerReady(account: string, provider: string): boolean;
  /** the learner's default AI for a new Roadmap */
  defaultProvider(account: string): string;
  unzip(file: File): Promise<File[]>;
  inventory(files: readonly File[], onLog: (file: string) => void): Promise<SourceItem[]>;
  estimate(inv: readonly SourceItem[], o: SourceOptions): SourcePlan;
  propose(
    account: string,
    inv: readonly SourceItem[],
    o: SourceOptions & { signal: AbortSignal; onLog: (line: string) => void },
  ): Promise<SourcePlan>;
  task(inv: readonly SourceItem[], o: SourceOptions): string;
  fromAnswer(text: string, inv: readonly SourceItem[]): { errors?: string[]; plan?: SourcePlan };
  /** the Roadmap built (📥 Import with every file on its steps): → its id, and how it goes on */
  makeRoadmap(
    account: string,
    plan: SourcePlan,
    inv: readonly SourceItem[],
    o: { title: string; language: string; provider: string; onLog: (line: string) => void },
  ): Promise<{ id: string; next: 'map' | 'progress' | 'app' }>;
  /** one subject, by the Claude app: the message to paste */
  courseMessage(plan: SourcePlan, inv: readonly SourceItem[], o: { language: string; goal: string }): string;
  /** one subject, here: its brief for ✨ Create with Claude */
  courseBrief(plan: SourcePlan): string;
}

export const DATA_EVENT = 'noema-roadmaps-data';

interface DataRequest {
  data: RoadmapsData | null;
}

/** Answers every data request that bubbles up to `host` (the nearest provider wins). */
export function provideRoadmapsData(host: EventTarget, data: RoadmapsData): Unsubscribe {
  const answer = (e: Event): void => {
    const d = (e as CustomEvent<DataRequest>).detail;
    if (d.data) return;
    d.data = data;
    e.stopPropagation();
  };
  host.addEventListener(DATA_EVENT, answer);
  return () => {
    host.removeEventListener(DATA_EVENT, answer);
  };
}

/** The data port of the nearest provider above `el` (null when there is none). */
export function requestRoadmapsData(el: EventTarget): RoadmapsData | null {
  const detail: DataRequest = { data: null };
  el.dispatchEvent(new CustomEvent<DataRequest>(DATA_EVENT, { detail, bubbles: true, composed: true }));
  return detail.data;
}
