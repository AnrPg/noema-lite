/**
 * Remote port: the cloud, in the app's own words (docs/ARCHITECTURE.md §4, docs/adr/006).
 *
 *  • Rows: a collection of text values per signed-in user, keyed by text, each with a `version`. Writes are
 *    compare-and-swap (docs/SYNC.md rule 1): `put` names the version the writer read (`expected`, or null for "must not
 *    exist yet") and is refused with `remote.conflict` when the row changed meanwhile. The version an accepted write gets
 *    is always strictly later than the one it replaced — two writers in the same millisecond can never both win.
 *    Versions are opaque text that sorts in time order; callers compare them only for equality.
 *  • Objects: files in named buckets (private files, public packs, shared items).
 *  • Logs: append-only streams of entries with unique ids (the learning events). An append of an id that is there already is
 *    ignored, so sending again after a failure never doubles anything. A read goes on from a cursor: every entry is read
 *    once, in the order it became visible, also when two devices append at the same time (docs/SYNC.md §Cursors).
 *  • Registers: last-writer-wins values by key (the account's settings). A write is kept only when its stamp (a hybrid
 *    logical clock text, src/kernel/hlc.ts) is later than the stored one; a stamp from a device whose clock runs ahead of the
 *    cloud's is stored as the cloud's time instead, so a wrong clock can never win for ever. Reads go on from a cursor.
 *  • RPC: a server function by name, with JSON arguments and a JSON answer.
 *
 * Collections and buckets are the app's names ('kv', 'private'…); which table or bucket they are is the adapter's
 * business (the Supabase adapter maps them). No vendor shape (PostgREST filters, `updated_at`, HTTP) crosses this port.
 * Errors are the contract codes: cloud.network, cloud.permission, cloud.schema_old, cloud.too_large, cloud.rate_limit,
 * cloud.server, cloud.unknown, auth.not_signed_in, auth.session_expired — plus remote.conflict and remote.unknown_collection.
 */
import { decodeHlc, encodeHlc } from '../kernel/hlc.ts';
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
  /** The page is going away: the request must outlive it. */
  readonly keepalive?: boolean;
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

export interface SendOptions {
  /** The page is going away: the request must outlive it (small bodies only). */
  readonly keepalive?: boolean;
}

export interface ReadFrom {
  /** The cursor of the last page read, or null: from the start. */
  readonly after: string | null;
  /** At most this many entries (the adapter's own maximum applies too). */
  readonly limit?: number;
}

export interface Page<T> {
  readonly entries: readonly T[];
  /** Where the next read goes on from (the `after` given when nothing new was there). */
  readonly cursor: string | null;
  /** More entries wait after this page. */
  readonly more: boolean;
}

export interface LogEntry {
  /** Unique in the stream; a second append of it is ignored. */
  readonly id: string;
  /** What kind of entry (an event's type). */
  readonly kind: string;
  /** Its hybrid-clock stamp (text form). */
  readonly stamp: string;
  /** The device that made it. */
  readonly device: string;
  readonly body: Json;
}

export interface RemoteLog {
  append(stream: string, entries: readonly LogEntry[], options?: SendOptions): AsyncResult<void>;
  read(stream: string, from: ReadFrom): AsyncResult<Page<LogEntry>>;
}

export interface RegisterEntry {
  readonly key: string;
  /** null: the value was removed. */
  readonly value: Json;
  readonly stamp: string;
  readonly device: string;
}

export interface RemoteRegisters {
  /** Keeps each entry whose stamp is later than the stored one; answers the entries kept, with the stamps as stored. */
  put(collection: string, entries: readonly RegisterEntry[], options?: SendOptions): AsyncResult<readonly RegisterEntry[]>;
  read(collection: string, from: ReadFrom): AsyncResult<Page<RegisterEntry>>;
}

/** A register stamp may be at most this far ahead of the cloud's clock (later ones are stored as the cloud's time). */
export const REGISTER_MAX_AHEAD_MS = 5 * 60_000;

/** A register stamp as the cloud stores it (null: not a stamp): one from a clock far ahead of the cloud's is the cloud's time. */
export function storedStamp(stamp: string, cloudNow: number): string | null {
  const d = decodeHlc(stamp);
  if (!d.ok) return null;
  return d.value.wall - cloudNow > REGISTER_MAX_AHEAD_MS ? encodeHlc({ wall: Math.floor(cloudNow), count: 0, node: d.value.node }) : stamp;
}

export interface Remote {
  readonly rows: RemoteRows;
  readonly objects: RemoteObjects;
  readonly log: RemoteLog;
  readonly registers: RemoteRegisters;
  rpc(name: string, args: { readonly [key: string]: Json }): AsyncResult<Json>;
}
