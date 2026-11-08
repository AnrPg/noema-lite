/* The app's own code the connector runs (one copy, shared with the app): the parts of it the connector calls, typed.
   engine/legacy.ts loads the files; these interfaces are their contract as the connector uses it. */
import type { Json } from '../util.ts';
import type { RequestOptions } from '../services/supabase.ts';

export interface CheckResult {
  errors: string[];
  warnings: string[];
  counts?: Record<string, number>;
}
export interface PackCounts {
  chapters: number;
  sections: number;
  exercises: number;
  visual: number;
  media: number;
  [k: string]: number;
}
export interface PackCheckResult extends CheckResult {
  counts: PackCounts;
}

/** A pack as the connector reads it (the full format: src/contracts/schemas, tools/CONTENT_SPEC.md). */
export interface Pack {
  subject: {
    id: string;
    title: string;
    language?: string;
    description?: string;
    i18n?: Record<string, { title?: string } & Record<string, unknown>>;
    authoring?: { rules?: number } & Record<string, unknown>;
  } & Record<string, unknown>;
  chapters?: { sections?: { id: string }[]; exercises?: unknown[] }[];
  sources?: { sources?: PackSource[] } & Record<string, unknown>;
  translations?: Record<string, { file?: boolean; chapters?: unknown } & Record<string, unknown>>;
  activities?: { items?: PackActivity[] } & Record<string, unknown>;
  counts?: Record<string, number>;
  version?: string | null;
  [k: string]: unknown;
}
export interface PackSource {
  id: string;
  file?: string;
  fileName?: string;
  size: number;
  sha256?: string;
  mime?: string;
  [k: string]: unknown;
}
export interface PackActivity {
  id: string;
  runtime?: string;
  entry?: string;
  h5p?: unknown;
  bytes?: number;
  sha256?: string;
  [k: string]: unknown;
}
export interface Translation {
  format?: string;
  locale?: string;
  pack?: string;
  chapters: unknown[];
  subject?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface Bridge {
  format?: string;
  pack: string;
  source?: string;
  native: string;
  status?: string;
  coverage?: number;
  everyday?: number;
  chapters?: unknown[];
  of?: number;
  entries?: unknown[];
  sections?: Record<string, { preview?: string }>;
  anchors?: unknown[];
  [k: string]: unknown;
}

export interface NoemaPackCheck {
  checkPack(p: unknown, expectId: string | undefined, o: { requireQuality: boolean }): PackCheckResult;
  checkTranslation(f: unknown, p: Pack): CheckResult;
  checkActivityPackages(
    p: { activities: { items: PackActivity[] } },
    bytesOf: (a: PackActivity) => Uint8Array | null,
  ): Promise<{ errors: string[] }>;
  checkBridge(b: unknown, pack?: Pack): CheckResult;
  requiredLocales(own: string): { translations: string[]; bridgePairs: { source: string; native: string }[] };
  LANGS: { bridgeCoverage?: { all?: number; everyday?: number } };
}

/* ---------- curricula (engine/curriculum.js, curjobs.js, curshare.js, curimport.js, sourceplan.js) ---------- */
export interface CurNode {
  title: string;
  summary?: string;
  role?: string;
  addedIn?: string;
  learningGoals?: unknown;
  domains?: unknown;
  chapters?: { ref: string; title?: string; goals?: unknown[]; coverage?: unknown[] }[];
  pack?: { id?: string; status?: string; assigned?: boolean; title?: string; claimedAt?: string; [k: string]: unknown } | null;
  chatFiles?: unknown;
  reviewed?: string;
  [k: string]: unknown;
}
export interface Curriculum {
  format?: string;
  id: string;
  title?: string;
  goal?: string;
  language?: string;
  provider?: string;
  stage?: string;
  updated?: string;
  summary?: string;
  nodes: Record<string, CurNode>;
  edges: { from: string; to: string }[];
  parts?: { id: string; title: string; at?: string; steps?: string[] }[];
  shared?: { role?: string; ended?: boolean; ownerName?: string; files?: Record<string, SharedFile> } | null;
  files?: Record<string, { sha256?: string }>;
  fromSources?: unknown;
  [k: string]: unknown;
}
export interface SharedFile {
  path: string;
  chunks?: number;
  size?: number;
}
export interface KvRowLike {
  key: string;
  value: string;
  updated_at?: string;
}
export interface Work {
  graph: string | null | false | undefined;
  toPlan: string[];
  steps: string[];
  claimed: string[];
  done: boolean;
}
export interface Download {
  store: string;
  src: string;
  name: string;
  size?: number;
  pages?: number;
}
export interface Task {
  id: string;
  kind: string;
  title?: string;
  error?: string;
  nid: string;
  packId: string;
  stepTitle?: string;
  downloads?: Download[];
  [k: string]: unknown;
}
export interface NoemaCurJobs {
  IN: string;
  CLAIM: string;
  WAIT: number;
  inboxKey(cid: string, seq?: string): string;
  claimKey(cid: string, nid: string): string;
  claimExpired(row: KvRowLike): boolean;
  merged(c: Curriculum, inbox: KvRowLike[]): Curriculum;
  settle(c: Curriculum, o: { claims: KvRowLike[]; packs: KvRowLike[]; remote: unknown; me: string | null }): Curriculum;
  work(c: Curriculum): Work;
  next(c: Curriculum, o: { want: string; step: string; force: boolean }): Task | null;
  byId(c: Curriculum, id: string): Task | null;
  check(c: Curriculum, t: Task, data: unknown): string[];
  taskText(c: Curriculum, t: Task, mode: string, o: { fileLines: string[] }): string;
  stepText(c: Curriculum, t: Task, o: { mode: string; fileLines: string[] }): string;
  isApp(c: Curriculum): boolean;
}
export interface NoemaCurriculum {
  packId(c: Curriculum, nid: string): string;
  curStore(cid: string): string;
  Edit?: { cannotAssign?(c: Curriculum, n: CurNode): string | null };
  outlineOf(p: Pack): unknown;
  order(c: Curriculum): string[];
  i18nTodo(c: Curriculum, loc: string): { title: boolean; nodes: string[]; goals: string[]; domains?: string[]; chapters: string[] };
  checkI18n(c: Curriculum, loc: string, d: unknown): string[];
  setI18n(c: Curriculum, loc: string, d: unknown): void;
  LANG: Record<string, unknown>;
}
export type CurApi = (path: string, o?: RequestOptions) => Promise<unknown>;
export interface SharedStepRow {
  author?: string;
  author_name?: string;
  status?: string;
  claimed_until?: string;
}
export interface NoemaCurShare {
  BUCKET: string;
  core: {
    row(api: CurApi, cid: string, nid: string): Promise<SharedStepRow | null>;
    rows(api: CurApi, cid: string): Promise<unknown>;
    claim(
      api: CurApi,
      o: { cid: string; nid: string; me: string; name: string; packId: string; lease?: number },
    ): Promise<{ ok: boolean; row?: SharedStepRow }>;
    ready(
      api: CurApi,
      o: {
        cid: string;
        nid: string;
        me: string;
        name: string;
        packId: string;
        version: string | null;
        path: string;
        meta: Record<string, unknown>;
      },
    ): Promise<{ ok: boolean; row?: SharedStepRow }>;
    stepPath(cid: string, uid: string, nid: string): string;
  };
}
export interface InboxEntry {
  nodes: Record<string, CurNode>;
  edges: { from: string; to: string }[];
  part: { title: string };
  [k: string]: Json | Record<string, CurNode> | { from: string; to: string }[] | { title: string };
}
export interface LinkEntry {
  links: { from: string; to: string }[];
  remove: { from: string; to: string }[];
  [k: string]: unknown;
}
export interface NoemaSourcePlan {
  fromClaude(d: unknown): { errors?: string[]; parsed: unknown; chat: Record<string, unknown>; plan: { summary?: string } };
  extendFromClaude(c: Curriculum, d: unknown, o: { independent: boolean; prepare: boolean }): { errors?: string[]; entry: InboxEntry };
  linkFromClaude(c: Curriculum, d: unknown): { errors?: string[]; entry: LinkEntry | null; already: { from: string; to: string }[] };
}
export interface NoemaCurImport {
  record(parsed: unknown, o: { title: string; language: string; learner: string; provider: string }): Curriculum;
}
export interface NoemaLLM {
  parseJSON(raw: string): unknown;
}

/* ---------- pictures (engine/imglib.js) ---------- */
export interface Picture {
  bytes: Uint8Array;
  w: number;
  h: number;
  mime: string;
  url: string;
  page?: string;
}
export interface ImageHit {
  title?: string;
  w?: number;
  h?: number;
  source: string;
  license?: string;
  credit?: string;
  url: string;
  page?: string;
}
export interface NoemaImgLib {
  searchImages(q: string, o: { n: number; sources: string[] | null }): Promise<{ results: ImageHit[]; errors: Record<string, string> }>;
  fetchPicture(url: string): Promise<Picture>;
  previewUrl(url: string): string | null;
}

/* ---------- language courses (engine/langcore.js) ---------- */
export interface LangRecord {
  format?: string;
  id: string;
  title: string;
  origin?: string;
  languages: string[];
  updated?: string;
  [k: string]: unknown;
}
export interface LangTask {
  id: string;
  kind: string;
  error?: string;
  claimedAt?: string;
  [k: string]: unknown;
}
export interface LangCourseData {
  course: { id?: string; languages?: string[] };
  world?: { languages?: { code: string; name?: string; typology?: unknown }[] };
  [k: string]: unknown;
}
export interface LangPackage {
  code?: string;
  name?: string;
  built?: unknown;
  checks?: unknown;
  lexicon?: Record<string, { lexemes?: unknown[]; absent?: unknown[] }>;
  grammar?: Record<string, unknown>;
  bank?: unknown[];
  phenomena?: { phenomena?: unknown[] };
  [k: string]: unknown;
}
export interface NoemaLang {
  LANGJOBS: { FORMAT: string; IN: string; CLAIM: string; LEASE: number; KIND: { core: string } };
  langMerged(
    rec: LangRecord,
    data: LangCourseData,
    inbox: KvRowLike[],
    o?: { peers: LangCourseData[] },
  ): { rec: LangRecord; data: LangCourseData };
  langSettle(rec: LangRecord, o: { claims: KvRowLike[] }): LangRecord;
  langClaimKey(cid: string, tid: string): string;
  langInboxKey(cid: string, seq?: string): string;
  langWork(rec: LangRecord): { queued: LangTask[]; claimed: LangTask[]; done: number };
  langNext(rec: LangRecord, o: { want: string; task: string; force: boolean }): LangTask | null;
  langTaskById(rec: LangRecord, id: string): LangTask | null;
  langTaskText(
    rec: LangRecord,
    data: LangCourseData,
    t: LangTask,
    o: { mode: string; files: { url: string; name: string }[]; peers: LangCourseData[]; libraryUrl: string },
  ): string;
  checkLangAnswer(rec: LangRecord, data: LangCourseData, t: LangTask, answer: unknown, o: { peers: LangCourseData[] }): string[];
  langApplyPatch(d: LangCourseData, patch: unknown): LangCourseData;
  langPackageGuide(
    data: LangCourseData,
    code: string,
    o: { name: string; typ: unknown; toolkitUrl: string; files: { url: string; name: string }[] },
  ): string;
  langPackKey(cid: string, code: string): string;
  langPackPath(cid: string, code: string): string;
  checkLangPackage(data: LangCourseData, pkg: LangPackage, o: { peers: LangCourseData[] }): string[];
}

/* ---------- problem reports (engine/report.js) and engine requests (engine/enginereq.js, the catalogue) ---------- */
export interface ReportRow {
  id: string;
  status?: string;
  kind?: string;
  item?: string;
  subject?: string;
  route?: string;
  note?: string;
  created_at?: string;
  shot?: string;
  locator?: unknown;
  fixed_in?: string;
  [k: string]: unknown;
}
export interface NoemaReport {
  OPEN: string[];
  STATUSES: string[];
  brief(r: ReportRow): string;
}
export interface EngineRequestRow {
  id?: string;
  title?: string;
  status?: string;
  engine_id?: string;
  accuracy?: string;
  field?: string;
  requester_name?: string;
  suggested?: string[];
  answer?: string;
  fixed_in?: string;
  created_at?: string;
  [k: string]: unknown;
}
export interface NoemaEngineRequests {
  normalize(input: Record<string, unknown>): {
    row: EngineRequestRow & { suggested: string[] };
    problems: { field: string; code: string }[];
  };
  FIELDS: Record<string, { min?: number; max?: number }>;
  COLS: string;
  OPEN: string[];
  brief(r: EngineRequestRow): string;
  cleanPatch(args: Record<string, unknown>): Record<string, unknown> & { error?: string };
}
export interface NoemaEngineCatalog {
  byId(id: string): { layer?: string } | null | undefined;
}

export interface EngineApi {
  packCheck: NoemaPackCheck;
  curJobs: NoemaCurJobs;
  curriculum: NoemaCurriculum;
  curShare: NoemaCurShare | null;
  curImport: NoemaCurImport;
  sourcePlan: NoemaSourcePlan;
  llm: NoemaLLM;
  imgLib: NoemaImgLib;
  lang: NoemaLang;
  report: NoemaReport;
  engineRequests: NoemaEngineRequests;
  engineCatalog: NoemaEngineCatalog | null;
}
