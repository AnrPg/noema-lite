/**
 * What the shell uses of the older scripts still on the page (engine/*.js, engine/app/*.js), typed as far as the shell
 * calls them. They are globals of the page; each one may be missing (a page without the cloud, a test page), so every
 * use asks first. This is the only place the shell names them.
 */
import type { Account } from './kv.ts';

export type Fn<A extends unknown[] = unknown[], R = unknown> = (...a: A) => R;

/** a subject as the library lists it (engine/app/library.js subjectsFor) */
export interface SubjectMeta {
  readonly id: string;
  readonly title?: string;
  readonly emoji?: string;
  readonly kind?: string;
  readonly courseId?: string;
  readonly language?: string;
  readonly chapters?: readonly { id?: string; num?: number; sections?: number | readonly unknown[] }[];
  readonly meta?: { readonly chapters?: readonly { id?: string; num?: number; sections?: number | readonly unknown[] }[] };
  readonly counts?: { readonly exercises?: number };
}
/** a Roadmap (engine/curriculum.js) */
export interface Roadmap {
  readonly id: string;
  readonly title?: string;
  readonly goal?: string;
  readonly status?: string;
  readonly nodes?: Readonly<Record<string, { readonly title?: string }>>;
}
export interface Curriculum {
  get(acc: string | null, id: string): Roadmap | null;
  list(acc: string | null): Roadmap[];
  shownTitle(c: Roadmap): string;
  shownNode(c: Roadmap, id: string): { title?: string } | null;
  nextUp?(acc: string | null, c: Roadmap): string[];
  summary(acc: string | null, c: Roadmap): { mastered: number; pct: number };
  stepsOf?(acc: string | null, subj: string): unknown[];
}
export interface CurMap {
  create(acc: string | null, o: { onStudy: (sid: string) => void }): void;
}
/** the open subject's engine (engine/src/40_views.js attachEngine) */
export interface EngineApi {
  route(): void;
  openTutor?(): void;
  focus?(): void;
  retheme?(): void;
  accView?(view: string, body: HTMLElement, close: () => void, o?: { only?: string }): void;
}
export interface Notes {
  pending: readonly { id: string; kind: string; title?: string }[];
  on(f: (list: readonly { id: string; kind: string; title?: string }[]) => void): void;
}
export interface Cloud {
  session(): { user: { id: string; email: string; user_metadata?: { name?: string } } } | null;
  onStatus?(f: (s: CloudStatus) => void): void;
  status(): CloudStatus;
  push(acc: string): Promise<unknown>;
  signOut(): Promise<unknown>;
  signIn(email: string, pw: string): Promise<unknown>;
  signUp(email: string, pw: string, name: string): Promise<{ session?: unknown }>;
  recover(email: string): Promise<unknown>;
  init(cfg: unknown): Promise<unknown>;
  pull(acc: string): Promise<unknown>;
  pullConvos(acc: string): Promise<unknown>;
  startAutoSync(acc: string): void;
  lease: { check(o: { take: boolean }): Promise<string> };
}
export interface CloudStatus {
  readonly error?: string;
  readonly syncing?: boolean;
  readonly pending?: number | boolean;
}
export interface Social {
  start(): void;
  onChange(f: () => void): void;
  waiting(): number;
  page(k: string, args: readonly string[], ctx: unknown): void;
}
export interface Report {
  isAdmin?(): Promise<boolean>;
  newCount(): Promise<number>;
  open(): void;
  page(rest: readonly string[], ctx: unknown): void;
}
export interface Convos {
  readonly SCHEMA?: string;
  migrateLegacy(acc: string, subs: unknown): Promise<unknown>;
  list(acc: string, o: { subject?: string; includeDeleted: boolean }): Promise<unknown[]>;
  clear(acc: string): Promise<unknown>;
  put(acc: string, r: unknown, o: { keepUpdatedAt: boolean }): Promise<unknown>;
  onChange(f: (acc: string) => void): void;
  writeToFolder(acc: string, h: unknown, o?: { all: boolean }): Promise<unknown>;
}
/** the i18n runtime (engine/i18n.js) */
export interface I18nRuntime {
  readonly ready: Promise<unknown>;
  readonly LOCALES: readonly { tag: string; name: string; pseudo?: boolean; dir?: string }[];
  t(key: string, params?: Record<string, unknown> | null, pref?: unknown): string;
  has(key: string): boolean;
  err(e: unknown): string;
  lang(pref?: unknown): string;
  match(tag: string): string | null;
  browser(): string;
  available(): readonly { tag: string; name: string; dir?: string }[];
  use(pref: unknown, o?: unknown): Promise<string>;
  chain?(tag: string): string[];
  readonly fmt: {
    date(t: unknown, o?: Intl.DateTimeFormatOptions): string;
    lower(s: string): string;
    ago(t: number): string;
    compare(a: string, b: string): number;
    number(n: number, o?: Intl.NumberFormatOptions): string;
    percent(p: number): string;
  };
}
export interface ArtApi {
  svg(k: string, cls?: string): string;
  mascot(m: string, w?: number, h?: number): string;
  land(m: string): string;
  collection(m: string, n: number, fresh: number): string;
  readonly I: Readonly<Record<string, unknown>>;
  readonly MASCOTS: Readonly<Record<string, string>>;
}

/** what the old screens of other areas add to window.Noema (engine/app/*.js) */
export interface NoemaAreas {
  subjectsFor?(acc: string): Promise<SubjectMeta[]>;
  pickSubject?(acc: string, o?: { closable?: boolean }): Promise<SubjectMeta | null>;
  importedPacks?(acc: string): Promise<{ subject: { id: string } }[]>;
  notes?: Notes;
  shareRow?(sh: unknown, o: { onAccepted: (s: { kind?: string; curriculum?: string; id?: string; title?: string }) => void }): HTMLElement;
  boot?: AreaBoot;
}
/** the library's part of the start (engine/app/library.js, engine/app/languages.js, engine/app/roadmaps.js) */
export interface AreaBoot {
  /** the OAuth consent of the Claude connector (?authorization_id=) */
  connectClaude?(id: string): Promise<unknown>;
  /** the subject (or language course) a link or the last session wants */
  wanted?(acc: Account, subs: readonly SubjectMeta[], wanted: string | null): SubjectMeta | null;
  /** a language course in the frame */
  langBoot?(acc: Account, course: SubjectMeta, fromLink: boolean): void;
  /** a language course with the classic page (shell: false) */
  startLanguage?(acc: Account, meta: SubjectMeta): unknown;
  /** opens the engine on a subject */
  openEngine?(acc: Account, subs: readonly SubjectMeta[], meta: SubjectMeta, o?: { background?: boolean }): Promise<void>;
  /** the start of a session: shares, the curriculum generator, Claude app jobs */
  started?(acc: Account): void;
}

export interface LegacyWindow {
  NOEMA_CONFIG?: Record<string, unknown>;
  NOEMA_CONFIG_LOCAL?: Record<string, unknown>;
  NOEMA_REGISTRY?: { accounts?: { id: string; name: string; emoji?: string; pin?: string | null }[]; subjects?: { id: string }[] };
  DEFAULT_GEMINI_KEY?: string;
  NoemaI18n?: I18nRuntime;
  NoemaArt?: ArtApi;
  NoemaCurriculum?: Curriculum;
  NoemaCurMap?: CurMap;
  NoemaCloud?: Cloud;
  NoemaSocial?: Social;
  NoemaReport?: Report;
  NoemaConvos?: Convos;
  NoemaReact?: { big(k: string, text?: string): unknown; dayStart(acc: string): void };
  NoemaSearch?: { quick(here: unknown): void; page(ctx: unknown): void; hereNow?(): unknown };
  NoemaMT?: { panel(acc: string | null): HTMLElement };
  NoemaLang?: { SUPPORTED_NATIVES?: readonly string[] };
  NoemaLangUI?: { titleOf?(id: string): string };
  S?: { settings?: Record<string, unknown> };
  flushSave?(): void;
  showDirectoryPicker?(o: unknown): Promise<unknown>;
}

export const legacy = (): LegacyWindow => globalThis as unknown as LegacyWindow;
