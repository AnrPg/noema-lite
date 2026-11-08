/**
 * Reports port: what problem reports and engine requests need from the cloud (docs/REPORTS.md; cloud/supabase.sql §15,
 * §16): the rows, and whether the signed-in person is one of the app's admins (noema_admins). The database decides who
 * reads and changes what. Adapter: src/adapters/supabase/reports.ts; contract: src/ports/contract/reports.contract.ts.
 * The locator is what the app collects about the place of a report (engine/report.js collect); it comes back from the
 * database, so every part of it is optional.
 */
import type { AsyncResult } from '../kernel/result.ts';

/** The columns of the admins' list of reports (the locator and the screenshot are read one report at a time). */
export const REPORT_LIST_COLUMNS =
  'id,reporter_name,reporter_email,kind,note,route,subject,item,status,admin_note,fixed_in,app_version,created_at,updated_at';
/** The columns an engine request is read with. */
export const REQUEST_COLUMNS =
  'id,title,field,what,learner,measure,sources,examples,accuracy,subject,via,locale,suggested,status,engine_id,answer,fixed_in,requester_name,created_at,updated_at';

type Text = string | number | boolean | null | undefined;
export interface LocatorSubject {
  readonly id?: string;
  readonly title?: string;
  readonly origin?: string;
  readonly owner?: string;
  readonly version?: Text;
  readonly builtAt?: string;
  readonly shown?: string;
  readonly translation?: string;
  readonly packLanguage?: string;
  readonly bridge?: string;
}
export interface LocatorItem {
  readonly chapter?: { readonly id?: string; readonly num?: Text; readonly title?: string };
  readonly section?: { readonly id?: string; readonly title?: string };
  readonly block?: { readonly id?: string; readonly index?: Text; readonly t?: string; readonly text?: string; readonly textOwn?: string };
  readonly exercise?: {
    readonly id?: string;
    readonly type?: string;
    readonly notInPack?: boolean;
    readonly note?: string;
    readonly q?: string;
    readonly qOwn?: string;
    readonly cite?: unknown;
  };
  readonly card?: { readonly key?: string; readonly index?: Text; readonly q?: string; readonly a?: string };
  readonly drill?: { readonly id?: string; readonly title?: string };
  readonly trap?: { readonly id?: string; readonly index?: Text; readonly title?: string };
  readonly field?: { readonly path?: string; readonly shown?: string; readonly own?: string | null };
  readonly content?: { readonly shown?: string; readonly translation?: string; readonly packLanguage?: string };
}
export interface CatalogKey {
  readonly key: string;
  readonly locale?: string;
  readonly text?: string;
}
export interface LocatorTarget {
  readonly text?: string;
  readonly tag?: string;
  readonly selector?: string;
  readonly picked?: boolean;
  readonly i18n?: readonly CatalogKey[];
  readonly data?: readonly Readonly<Record<string, string>>[];
  readonly given?: string;
}
export interface Locator {
  readonly at?: string;
  readonly kind?: string;
  readonly itemRef?: string;
  readonly item?: LocatorItem;
  readonly subject?: LocatorSubject;
  readonly target?: LocatorTarget;
  readonly route?: { readonly hash?: string; readonly page?: string };
  readonly place?: { readonly chapter?: string; readonly [k: string]: unknown };
  readonly lang?: Readonly<Record<string, Text>>;
  readonly visible?: readonly { readonly ref?: string; readonly text?: string }[];
  readonly ui?: {
    readonly locale?: string;
    readonly dir?: string;
    readonly theme?: string;
    readonly character?: string;
    readonly viewport?: { readonly w?: number; readonly h?: number; readonly dpr?: number };
    readonly scroll?: { readonly y?: number };
    readonly ua?: string;
  };
  readonly app?: {
    readonly version?: string;
    readonly commit?: string;
    readonly builtAt?: string;
    readonly frame?: boolean;
    readonly bundle?: boolean;
    readonly url?: string;
  };
  readonly screen?: { readonly title?: string; readonly crumbs?: readonly string[] };
  readonly errors?: readonly { readonly level?: string; readonly at?: string; readonly msg?: unknown }[];
}
export interface ReportRow {
  readonly id?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly note?: string | null;
  readonly item?: string | null;
  readonly subject?: string | null;
  readonly route?: string | null;
  readonly created_at?: string;
  readonly reporter_name?: string | null;
  readonly reporter_email?: string | null;
  readonly locator?: Locator | null;
  readonly shot?: string | null;
  readonly app_version?: string | null;
  readonly admin_note?: string | null;
  readonly fixed_in?: string | null;
  readonly [more: string]: unknown;
}

export interface EngineRequestRow {
  readonly id?: string;
  readonly title?: string | null;
  readonly field?: string | null;
  readonly what?: string | null;
  readonly learner?: string | null;
  readonly measure?: string | null;
  readonly sources?: string | null;
  readonly examples?: string | null;
  readonly accuracy?: string;
  readonly subject?: string | null;
  readonly via?: string;
  readonly locale?: string | null;
  readonly suggested?: readonly string[];
  readonly status?: string;
  readonly engine_id?: string | null;
  readonly answer?: string | null;
  readonly fixed_in?: string | null;
  readonly requester_name?: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [more: string]: unknown;
}
/** What the requester sends (the row the database keeps). */
export interface NewEngineRequest {
  readonly title: string | null;
  readonly field: string | null;
  readonly what: string | null;
  readonly learner: string | null;
  readonly measure: string | null;
  readonly sources: string | null;
  readonly examples: string | null;
  readonly accuracy: string;
  readonly subject: string | null;
  readonly via: string;
  readonly locale: string | null;
  readonly suggested: string[];
}
/** What an admin may change of a request. */
export type RequestPatch = { status?: string; engine_id?: string | null; answer?: string | null; fixed_in?: string | null };
export interface AdminCheck {
  /** the signed-in person (null: nobody) */
  uid(): string | null;
  /** is the signed-in person one of the app's admins? */
  isAdmin(): AsyncResult<boolean>;
}

export interface ReportServer extends AdminCheck {
  send(row: ReportRow): AsyncResult<void>;
  /** the reports (the admins' list: every report; anyone else: their own), newest first; statuses null: all */
  list(statuses: readonly string[] | null): AsyncResult<ReportRow[]>;
  one(id: string): AsyncResult<ReportRow | null>;
  /** how many are new (≤ 500) */
  newCount(): AsyncResult<number>;
  save(id: string, patch: { status?: string; admin_note?: string | null; fixed_in?: string | null }): AsyncResult<void>;
  remove(id: string): AsyncResult<void>;
}

export interface EngineRequestServer extends AdminCheck {
  submit(row: NewEngineRequest): AsyncResult<EngineRequestRow>;
  /** my requests, newest first (≤ 200) */
  mine(): AsyncResult<EngineRequestRow[]>;
  /** every request an admin sees, newest first (≤ 300); statuses null: all */
  all(statuses: readonly string[] | null): AsyncResult<EngineRequestRow[]>;
  update(id: string, patch: RequestPatch): AsyncResult<void>;
}
