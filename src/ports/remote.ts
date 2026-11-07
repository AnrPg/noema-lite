/**
 * Remote port: the cloud, in the app's own words (docs/ARCHITECTURE.md §4, docs/adr/006).
 *
 *  • Rows: a collection of text values per signed-in user, keyed by text, each with a `version`. Writes are
 *    compare-and-swap (docs/SYNC.md rule 1): `put` names the version the writer read (`expected`, or null for "must not
 *    exist yet") and is refused with `remote.conflict` when the row changed meanwhile. The version an accepted write gets
 *    is always strictly later than the one it replaced — two writers in the same millisecond can never both win.
 *    Versions are opaque text that sorts in time order; callers compare them only for equality.
 *  • Objects: files in named buckets (private files, public packs, shared items).
 *  • RPC: a server function by name, with JSON arguments and a JSON answer.
 *
 * Collections and buckets are the app's names ('kv', 'private'…); which table or bucket they are is the adapter's
 * business (the Supabase adapter maps them). No vendor shape (PostgREST filters, `updated_at`, HTTP) crosses this port.
 * Errors are the contract codes: cloud.network, cloud.permission, cloud.schema_old, cloud.too_large, cloud.rate_limit,
 * cloud.server, cloud.unknown, auth.not_signed_in, auth.session_expired — plus remote.conflict and remote.unknown_collection.
 */
import type { AsyncResult } from '../kernel/result.ts';
import type { Json } from './common.ts';

export interface RemoteRow {
  readonly key: string;
  readonly value: string;
  /** Opaque, strictly increasing per row; the `expected` of the next write. */
  readonly version: string;
}

export interface RowListOptions {
  /** Only keys that start with it. */
  readonly prefix?: string;
  /** Only rows written after this version (a version of any row of the collection). */
  readonly after?: string;
  readonly limit?: number;
}

export interface PutOptions {
  /** The version the writer read, or null: the row must not exist yet. */
  readonly expected: string | null;
}

export interface DeleteOptions {
  /** Delete only if the row is still at this version (omit: delete whatever is there). */
  readonly expected?: string;
}

export interface RemoteRows {
  get(collection: string, key: string): AsyncResult<RemoteRow | null>;
  list(collection: string, options?: RowListOptions): AsyncResult<RemoteRow[]>;
  /** Compare-and-swap; a refused write is remote.conflict (retryable) and leaves the row as it was. */
  put(collection: string, key: string, value: string, options: PutOptions): AsyncResult<RemoteRow>;
  /** A missing row is fine; with `expected`, a changed row is remote.conflict. */
  delete(collection: string, key: string, options?: DeleteOptions): AsyncResult<void>;
}

export type ObjectBody = Blob | string | Uint8Array;

export interface ObjectInfo {
  readonly path: string;
  readonly size: number | null;
  readonly updatedAt: string | null;
}

export interface PutObjectOptions {
  readonly contentType?: string;
  /** Replace an object that is there already (default: true). */
  readonly upsert?: boolean;
}

export interface RemoteObjects {
  put(bucket: string, path: string, body: ObjectBody, options?: PutObjectOptions): AsyncResult<void>;
  /** The object, or null when it is not there. */
  get(bucket: string, path: string): AsyncResult<Blob | null>;
  list(bucket: string, prefix: string): AsyncResult<ObjectInfo[]>;
  /** Missing paths are fine. */
  remove(bucket: string, paths: readonly string[]): AsyncResult<void>;
}

export interface Remote {
  readonly rows: RemoteRows;
  readonly objects: RemoteObjects;
  rpc(name: string, args: { readonly [key: string]: Json }): AsyncResult<Json>;
}
