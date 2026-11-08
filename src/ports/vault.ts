/**
 * Vault port: what the vault needs from the cloud (docs/VAULT.md; cloud/supabase.sql §13, §13b). The server decides
 * everything that matters — row-level security, the formats, the sizes, the counters, the quota, the reports that hide
 * a file — so this port only carries the rows and the files. Adapter: src/adapters/supabase/vault.ts; contract:
 * src/ports/contract/vault.contract.ts.
 */
import type { AsyncResult } from '../kernel/result.ts';

export type FieldStatus = 'accepted' | 'proposed' | 'rejected' | 'merged';
export interface FieldRow {
  readonly id: string;
  /** locale → name */
  readonly names?: Readonly<Record<string, string>> | null;
  readonly aliases?: readonly string[] | null;
  readonly parents?: readonly string[] | null;
  readonly status?: FieldStatus;
}

/** A file as the view noema_vault shows it (no uploader: docs/VAULT.md §2). */
export interface VaultFile {
  readonly id: string;
  readonly title: string;
  readonly description?: string | null;
  readonly kind: string;
  readonly fields?: readonly string[] | null;
  /** "el,ru" */
  readonly language?: string | null;
  readonly university?: string | null;
  readonly department?: string | null;
  readonly course?: string | null;
  readonly professor?: string | null;
  readonly year?: number | null;
  readonly semester?: number | null;
  readonly has_exercises?: boolean | null;
  readonly has_solutions?: boolean | null;
  readonly handwritten?: boolean | null;
  readonly file_name: string;
  readonly mime?: string;
  readonly size?: number;
  readonly path?: string;
  readonly pages?: number | null;
  readonly room?: string | null;
  readonly mine?: boolean;
  readonly status?: string;
  readonly uploader_name?: string | null;
  readonly rating_n?: number;
  readonly rating_sum?: number;
  readonly downloads?: number;
  readonly used?: number;
  readonly created_at?: string;
  readonly [more: string]: unknown;
}

/** What the uploader gives (the server keeps the counters, the status and the uploader). */
export interface VaultFileMeta {
  readonly title: string;
  readonly kind: string;
  readonly fields: readonly string[];
  readonly language: string;
  readonly university?: string | null;
  readonly department?: string | null;
  readonly course?: string | null;
  readonly professor?: string | null;
  readonly year?: number | null;
  readonly semester?: number | null;
  readonly description?: string | null;
  readonly has_exercises?: boolean;
  readonly has_solutions?: boolean;
  readonly handwritten?: boolean;
  readonly show_name?: boolean;
  readonly pages?: number | null;
  readonly room?: string | null;
  readonly [more: string]: unknown;
}
/** A new file's row as it is inserted (status pending until finish). */
export interface VaultFileRow extends VaultFileMeta {
  readonly id: string;
  readonly file_name: string;
  readonly mime: string;
  readonly size: number;
  readonly path: string;
}
export type ReportReason = string; // 'copyright' | 'exam' | 'labels' | 'abuse' | 'spam' | 'other'
export type CountWhat = 'download' | 'used';

export interface VaultServer {
  /** the signed-in person (null: nobody) */
  uid(): string | null;
  /** every file I may see (≤ 5000, newest first) */
  list(): AsyncResult<VaultFile[]>;
  myRatings(): AsyncResult<{ file_id: string; stars: number }[]>;
  myReports(): AsyncResult<{ file_id: string; reason: string }[]>;
  insert(row: VaultFileRow): AsyncResult<void>;
  putObject(path: string, body: Blob, mime: string): AsyncResult<void>;
  /** the server checks the object (its size) and makes the file visible */
  finish(id: string): AsyncResult<void>;
  removeObject(path: string): AsyncResult<void>;
  removeRow(id: string): AsyncResult<void>;
  edit(id: string, patch: Readonly<Record<string, unknown>>): AsyncResult<void>;
  rate(id: string, stars: number): AsyncResult<void>;
  report(id: string, reason: ReportReason, note: string | null): AsyncResult<void>;
  count(id: string, what: CountWhat): AsyncResult<void>;
  download(path: string, mime: string): AsyncResult<Blob>;
  /** the field graph, a page at a time (accepted fields and my proposals) */
  fields(offset: number, limit: number): AsyncResult<FieldRow[]>;
  /** when a field last changed ('' when none) */
  fieldsStamp(): AsyncResult<string>;
  /** propose a field: its id (the same name in any language gives the known field) */
  propose(name: string, lang: string, parents: readonly string[]): AsyncResult<string>;
  /** the fields others chose for similar titles or courses */
  suggest(title: string, course: string | null): AsyncResult<{ field: string }[]>;
}
