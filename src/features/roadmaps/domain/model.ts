/* noema-lite — a Roadmap as the domain sees it (the record noema.curriculum/v1: src/contracts/schemas/noema.curriculum.v1.schema.json,
   docs/CURRICULUM.md). The record is the app's and the connector's shared format: every field the domain does not read is
   kept as it is (the index signatures), so a newer field written by another device or a newer connector never gets lost.

   Functions of this feature take `now` (ms since the epoch) wherever time matters: the domain never reads the clock. */
import type { Level, LevelRef } from '../../../contracts/rules/levels.ts';
import type { RestructurePlan } from './restructure.ts';

export type { Level, LevelKind, LevelRef, LevelRange } from '../../../contracts/rules/levels.ts';

export interface Edge {
  from: string;
  to: string;
  why?: string;
}

export interface PlannedChapter {
  ref: string;
  title: string;
  goals?: string[];
  coverage?: string[];
  material?: string;
  /** a chapter of a step may sit at its own level (default: the step's first level) */
  level?: string;
  [k: string]: unknown;
}

export interface MaterialFile {
  fileId?: string;
  srcId?: string;
  name: string;
  size?: number;
  type?: string;
  pages?: number | null;
  range?: [number, number] | null;
  sha256?: string | null;
  [k: string]: unknown;
}

export interface StepPack {
  id?: string;
  status?: string | null;
  version?: string | null;
  /** a subject the learner attached to the step (docs/CURRICULUM.md §9): never generated, never changed */
  assigned?: { from?: string; at?: string } | boolean;
  title?: string;
  queuedAt?: string | null;
  claimedAt?: string;
  by?: string;
  sections?: string[];
  exercises?: number;
  [k: string]: unknown;
}

export interface Step {
  id: string;
  title: string;
  summary?: string;
  role?: string;
  part?: string;
  domains?: string[];
  learningGoals?: string[];
  chapters?: PlannedChapter[];
  /** the step's place on the Roadmap's ladder (docs/CURRICULUM.md §11) — not `levels`, the processing levels of agent 1 */
  level?: LevelRef;
  material?: { files?: MaterialFile[] };
  pack?: StepPack | null;
  replan?: unknown;
  replanAt?: string;
  plannedAt?: string;
  planWish?: string;
  reviewed?: string;
  addedIn?: string;
  chatFiles?: string[];
  [k: string]: unknown;
}

export interface Part {
  id: string;
  title: string;
  summary?: string;
  at?: string;
  steps?: string[];
}

export interface SharedInfo {
  role?: string;
  ended?: boolean;
  ownerName?: string;
  [k: string]: unknown;
}

/** One participant's view of a shared step (rows of noema_curriculum_steps, engine/curshare.js remoteOf). */
export interface RemoteStep {
  status?: string;
  mine?: boolean;
  by?: string;
  at?: string;
  version?: string | null;
}

/** A plan of restructuring that waits for the learner's (in a shared Roadmap: the owner's) approval (restructure.ts). */
export interface Proposal {
  id: string;
  kind: 'restructure';
  at: string;
  via: string;
  plan: RestructurePlan;
  status: 'pending' | 'applied' | 'declined';
  decidedAt?: string;
}

export interface Roadmap {
  format?: string;
  id: string;
  title?: string;
  goal?: string;
  language?: string;
  provider?: string;
  stage?: string;
  status?: string;
  updated?: string;
  created?: string;
  attachFirst?: boolean;
  nodes: Record<string, Step>;
  edges: Edge[];
  parts?: Part[];
  paths?: { minimal?: string[]; deep?: string[] };
  shared?: SharedInfo | null;
  remote?: Record<string, RemoteStep>;
  i18n?: Record<string, RoadmapLocale>;
  linksApplied?: string[];
  /** the Roadmap's ladder (docs/CURRICULUM.md §11) */
  levels?: Level[];
  /** a final test closes each level before the next one opens (off: the next level opens when every step is mastered) */
  levelTest?: boolean;
  /** restructuring plans proposed by Claude (noema_restructure_levels), kept until the learner decides */
  proposals?: Proposal[];
  log?: { t: number; m: string; via?: string }[];
  [k: string]: unknown;
}

/** One locale of c.i18n (docs/CURRICULUM.md §10). */
export interface RoadmapLocale {
  title?: string;
  goal?: string;
  at?: string;
  nodes?: Record<string, StepLocale>;
  [k: string]: unknown;
}
export interface StepLocale {
  title?: string;
  summary?: string;
  learningGoals?: string[];
  domains?: string[];
  chapters?: Record<string, string | ChapterLocale>;
  [k: string]: unknown;
}
export interface ChapterLocale {
  title?: string;
  goals?: string[];
  coverage?: string[];
}

/** A KV row as the stores give it (the inbox, the claims, the packs' cards). */
export interface KvRow {
  key: string;
  value: unknown;
  updated_at?: string;
}

/** A deep copy of a JSON value (records are JSON: no dates, maps or functions). */
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
/** A time stamp's milliseconds (0 for none or an unreadable one). */
export const ms = (v: string | null | undefined): number => Date.parse(v ?? '') || 0;
/** A step's place: which of the three parts of the map a role belongs to. */
export const PART: Readonly<Record<string, string>> = {
  foundation: 'prereq',
  intro: 'core',
  aspect: 'core',
  subtopic: 'core',
  related: 'core',
  synthesis: 'core',
  application: 'apps',
  goal: 'core',
};
/** The roles a step may have. */
export const ROLES = ['foundation', 'intro', 'aspect', 'subtopic', 'related', 'synthesis', 'application'] as const;
export const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
