/**
 * What the engines page (#/engines, docs/INTERACTIVE_LIBRARY.md §2–§3) reads and does: the catalogue of the engines this app
 * can run, the suggestions for a request's text, and the requests for new engines (the learner's own, or every request for
 * the app's admins). The root hands the page an implementation (src/composition/lang-activities-root.ts).
 */

/** One engine or runtime of the catalogue (src/engines/catalog.js). */
export interface EngineEntry {
  readonly id: string;
  readonly slug: string;
  /** 'library' | 'free' | 'plugin' … (the catalogue's layer) */
  readonly layer: string;
}

/** A request for a new engine as it is stored (noema_engine_requests, or this device for a local profile). */
export interface EngineRequestRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly created_at?: string | null;
  readonly what?: string | null;
  readonly engine_id?: string | null;
  readonly answer?: string | null;
  readonly fixed_in?: string | null;
}

/** A problem of a request's fields (normalize): the field, the code (missing, short, long, value). */
export interface RequestProblem {
  readonly field: string;
  readonly code: string;
}

export interface RequestStore {
  /** 'local' (this device) or 'cloud' */
  readonly kind: string;
  isAdmin(): Promise<boolean>;
  mine(): Promise<readonly EngineRequestRow[]>;
  all(): Promise<readonly EngineRequestRow[]>;
  submit(row: unknown): Promise<unknown>;
  update(id: string, patch: unknown): Promise<unknown>;
}

export interface EnginesPort {
  /** false when the app has no engine library or no requests (an old build): the page says so */
  available(): boolean;
  /** every engine this app can run, in the catalogue's order */
  engines(): readonly EngineEntry[];
  /** the engines that may already do what a text describes (only those this app has), best first */
  suggest(text: string): readonly EngineEntry[];
  /** the request store of the signed-in profile */
  store(): RequestStore;
  readonly statuses: readonly string[];
  readonly accuracy: readonly string[];
  /** the fields of a request and their length limits, in the order of the form */
  readonly fields: Readonly<Record<string, { readonly min?: number; readonly max: number }>>;
  normalize(input: Readonly<Record<string, string>>): { readonly row: unknown; readonly problems: readonly RequestProblem[] };
  /** an admin's answer, checked: the patch, or the reason it is refused */
  cleanPatch(p: Readonly<Record<string, string>>): { readonly error: string } | Readonly<Record<string, unknown>>;
  /** a request as a brief for an engineer (Markdown) */
  brief(r: EngineRequestRow): string;
  /** a message for the learner (a short toast) */
  toast(text: string, ms?: number): void;
  /** the message of an error, in the interface language */
  errorText(e: unknown): string;
  /** puts text on the clipboard; → false when the browser refuses */
  copy(text: string): Promise<boolean>;
  /** offers a file to save */
  download(name: string, text: string, type: string): void;
}
