/**
 * Storage port: what this device keeps (docs/ARCHITECTURE.md §4).
 *
 * Two stores and two signals:
 *  • `kv` — a small, synchronous key → text store (localStorage in the browser). Keys are the app's namespaced keys
 *    (`noema1:<account>:a:…`, `noema1:<account>:s:<subject>:…`, `noema-device:…`); values are text (JSON is the caller's).
 *  • `docs` — an asynchronous document store with named collections and transactions (IndexedDB in the browser): packs,
 *    restore points, folder handles, conversations, and — in phase 2 — the event log and the outbox.
 *  • `onFull` — the storage-full signal: raised whenever a write fails because the browser's storage for this site is
 *    full (every engine's name for it). The composition root reports it (ErrorReporter → the learner's warning).
 *  • `estimate` / `persist` — how much is used and allowed, and the request that the browser never evicts the data.
 *
 * Every operation returns a Result: a full storage is `storage.quota`, no storage at all (private mode, blocked site
 * data) `storage.unavailable`, a failed transaction `storage.failed`. Nothing throws.
 */
import type { AsyncResult, Result } from '../kernel/result.ts';
import type { Unsubscribe } from './common.ts';

export interface KeyValueStore {
  /** The value, or null when the key is not there. */
  get(key: string): Result<string | null>;
  /** Writes the value; a full storage is storage.quota (and raises the storage-full signal). */
  set(key: string, value: string): Result<void>;
  /** Removes the key (a missing key is fine). */
  delete(key: string): Result<void>;
  /** Every key that starts with `prefix`, in no particular order. */
  keys(prefix?: string): Result<string[]>;
}

/** A document's key in its collection. IndexedDB accepts strings and numbers; the app uses strings. */
export type DocKey = string;

export interface DocListOptions {
  /** Only keys that start with it. */
  readonly prefix?: string;
  /** At most this many entries, in key order. */
  readonly limit?: number;
}

/** What one transaction can do. Its promises resolve while the transaction is open; await nothing else inside it. */
export interface DocumentTransaction {
  get<T>(collection: string, key: DocKey): Promise<T | undefined>;
  put(collection: string, key: DocKey, doc: unknown): Promise<void>;
  delete(collection: string, key: DocKey): Promise<void>;
  list<T>(collection: string, options?: DocListOptions): Promise<Array<readonly [DocKey, T]>>;
}

export type TransactionMode = 'readonly' | 'readwrite';

export interface DocumentStore {
  /** The collections this store has (fixed when the store opens). */
  readonly collections: readonly string[];
  get<T>(collection: string, key: DocKey): AsyncResult<T | undefined>;
  put(collection: string, key: DocKey, doc: unknown): AsyncResult<void>;
  delete(collection: string, key: DocKey): AsyncResult<void>;
  /** Entries in key order. */
  list<T>(collection: string, options?: DocListOptions): AsyncResult<Array<readonly [DocKey, T]>>;
  /** All or nothing: every write of `work` is kept, or — when `work` throws or the store fails — none is. */
  transaction<R>(collections: readonly string[], mode: TransactionMode, work: (tx: DocumentTransaction) => Promise<R>): AsyncResult<R>;
}

export interface QuotaEstimate {
  /** Bytes used by this site (all stores), when the browser says. */
  readonly usage: number | null;
  /** Bytes this site may use, when the browser says. */
  readonly quota: number | null;
  /** Whether the browser promised not to evict the data (persist()). */
  readonly persisted: boolean;
}

export interface StorageFullEvent {
  /** Which store was full. */
  readonly store: 'kv' | 'docs';
  /** The key (kv) or `<collection>/<key>` (docs) that could not be written. */
  readonly key: string;
  readonly at: number;
}

export interface Storage {
  readonly kv: KeyValueStore;
  readonly docs: DocumentStore;
  estimate(): AsyncResult<QuotaEstimate>;
  /** Asks the browser to keep the data (no eviction under storage pressure); true when granted. */
  persist(): AsyncResult<boolean>;
  /** The storage-full signal. */
  onFull(listener: (event: StorageFullEvent) => void): Unsubscribe;
}

/** The names browsers give a full storage (Chrome, Firefox, Safari, old WebKit codes). */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: unknown; code?: unknown };
  return x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014;
}
