/**
 * The browser's Storage: localStorage for the key-value store, IndexedDB for the documents, navigator.storage for the
 * quota. A write the browser refuses because the site's storage is full (QuotaExceededError and every engine's other
 * name for it) returns storage.quota AND raises the storage-full signal; no storage at all is storage.unavailable.
 * Every platform object is looked up when first used, so the adapter can be made before the page has them (and in a
 * test context without them).
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../kernel/result.ts';
import { textOf } from '../../kernel/text.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import {
  isQuotaError,
  type DocKey,
  type DocListOptions,
  type DocumentStore,
  type DocumentTransaction,
  type KeyValueStore,
  type QuotaEstimate,
  type Storage,
  type StorageFullEvent,
  type TransactionMode,
} from '../../ports/storage.ts';

/** The DOM's localStorage, as far as the adapter uses it. */
export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StorageManagerLike {
  estimate?(): Promise<{ usage?: number; quota?: number }>;
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
}

export interface BrowserStorageOptions {
  /** The IndexedDB database (default: the app's own, "noema-lite" version 1). */
  readonly dbName?: string;
  readonly dbVersion?: number;
  /** Its object stores (created when missing). */
  readonly collections?: readonly string[];
  readonly localStorage?: () => WebStorageLike | undefined;
  readonly indexedDB?: () => IDBFactory | undefined;
  readonly storageManager?: () => StorageManagerLike | undefined;
  readonly now?: () => number;
}

/** The app's IndexedDB as the UI root opens it (src/composition/shell/core.ts IDB) (same name, version and stores, so both can use it at once). */
export const APP_DB = Object.freeze({ name: 'noema-lite', version: 1, collections: ['packs', 'handles', 'restore', 'convos'] as const });

const unavailable = (what: string, cause?: unknown): NoemaError =>
  new NoemaError('storage.unavailable', `this browser gives no ${what} here`, cause === undefined ? {} : { cause });

export function browserStorage(o: BrowserStorageOptions = {}): Storage {
  const now = o.now ?? Date.now;
  const g = globalThis as { localStorage?: WebStorageLike; indexedDB?: IDBFactory; navigator?: { storage?: StorageManagerLike } };
  const getLS = o.localStorage ?? ((): WebStorageLike | undefined => g.localStorage);
  const getIDB = o.indexedDB ?? ((): IDBFactory | undefined => g.indexedDB);
  const getSM = o.storageManager ?? ((): StorageManagerLike | undefined => g.navigator?.storage);
  const listeners = new Set<(e: StorageFullEvent) => void>();
  const signal = (store: 'kv' | 'docs', key: string): NoemaError => {
    const event = Object.freeze({ store, key, at: now() });
    for (const l of [...listeners]) l(event);
    return new NoemaError('storage.quota', 'the browser storage for this site is full', { params: { key }, retryable: true });
  };

  /** localStorage itself: reading the property throws where site data is blocked. */
  const ls = (): Result<WebStorageLike> => {
    try {
      const s = getLS();
      return s ? ok(s) : err(unavailable('localStorage'));
    } catch (e) {
      return err(unavailable('localStorage', e));
    }
  };

  const kv: KeyValueStore = {
    get(key) {
      const s = ls();
      if (!s.ok) return s;
      try {
        return ok(s.value.getItem(key));
      } catch (e) {
        return err(unavailable('localStorage', e));
      }
    },
    set(key, value) {
      const s = ls();
      if (!s.ok) return s;
      try {
        s.value.setItem(key, value);
        return OK_VOID;
      } catch (e) {
        return err(
          isQuotaError(e)
            ? signal('kv', key)
            : new NoemaError('storage.failed', 'localStorage refused a write', { cause: e, params: { key } }),
        );
      }
    },
    delete(key) {
      const s = ls();
      if (!s.ok) return s;
      try {
        s.value.removeItem(key);
        return OK_VOID;
      } catch (e) {
        return err(unavailable('localStorage', e));
      }
    },
    keys(prefix = '') {
      const s = ls();
      if (!s.ok) return s;
      try {
        const out: string[] = [];
        for (let i = 0; i < s.value.length; i++) {
          const k = s.value.key(i);
          if (k !== null && k.startsWith(prefix)) out.push(k);
        }
        return ok(out);
      } catch (e) {
        return err(unavailable('localStorage', e));
      }
    },
  };

  const docs = idbDocuments({
    name: o.dbName ?? APP_DB.name,
    version: o.dbVersion ?? APP_DB.version,
    collections: o.collections ?? APP_DB.collections,
    indexedDB: getIDB,
    onQuota: key => signal('docs', key),
  });

  return {
    kv,
    docs,
    async estimate(): AsyncResult<QuotaEstimate> {
      const sm = getSM();
      if (!sm?.estimate) return ok({ usage: null, quota: null, persisted: false });
      try {
        const e = await sm.estimate();
        const persisted = sm.persisted ? await sm.persisted() : false;
        return ok({ usage: e.usage ?? null, quota: e.quota ?? null, persisted });
      } catch (e) {
        return err(new NoemaError('storage.failed', 'the storage estimate failed', { cause: e }));
      }
    },
    async persist() {
      const sm = getSM();
      if (!sm?.persist) return ok(false);
      try {
        return ok(await sm.persist());
      } catch (e) {
        return err(new NoemaError('storage.failed', 'the persist request failed', { cause: e }));
      }
    },
    onFull(listener): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

interface IdbOptions {
  readonly name: string;
  readonly version: number;
  readonly collections: readonly string[];
  readonly indexedDB: () => IDBFactory | undefined;
  readonly onQuota: (key: string) => NoemaError;
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(r.error ?? new DOMException('the IndexedDB request failed', 'UnknownError'));
    };
  });

/** An IndexedDB document store: one object store per collection (out-of-line keys). */
export function idbDocuments(o: IdbOptions): DocumentStore {
  let opening: Promise<Result<IDBDatabase>> | null = null;
  const open = (): Promise<Result<IDBDatabase>> => {
    if (opening) return opening;
    opening = new Promise(resolve => {
      let factory: IDBFactory | undefined;
      try {
        factory = o.indexedDB();
      } catch (e) {
        resolve(err(unavailable('IndexedDB', e)));
        return;
      }
      if (!factory) {
        resolve(err(unavailable('IndexedDB')));
        return;
      }
      let r: IDBOpenDBRequest;
      try {
        r = factory.open(o.name, o.version);
      } catch (e) {
        resolve(err(unavailable('IndexedDB', e)));
        return;
      }
      r.onupgradeneeded = () => {
        for (const c of o.collections) if (!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c);
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => {
          db.close();
          opening = null;
        }; // another tab upgrades: let it, reopen on next use
        resolve(ok(db));
      };
      r.onerror = () => {
        opening = null;
        resolve(err(unavailable('IndexedDB', r.error)));
      };
    });
    return opening;
  };

  async function transaction<R>(
    collections: readonly string[],
    mode: TransactionMode,
    work: (tx: DocumentTransaction) => Promise<R>,
  ): AsyncResult<R> {
    const db = await open();
    if (!db.ok) return db;
    let t: IDBTransaction;
    try {
      t = db.value.transaction([...collections], mode);
    } catch (e) {
      return err(new NoemaError('storage.failed', 'could not start a transaction on ' + collections.join(', '), { cause: e }));
    }
    let lastKey = collections.join(',');
    const store = (c: string): IDBObjectStore => t.objectStore(c);
    const tx: DocumentTransaction = {
      get: <T>(c: string, k: DocKey) => req(store(c).get(k)) as Promise<T | undefined>,
      put: async (c, k, d) => {
        lastKey = c + '/' + k;
        await req(store(c).put(d, k));
      },
      delete: async (c, k) => {
        await req(store(c).delete(k));
      },
      list: <T>(c: string, lo: DocListOptions = {}) =>
        new Promise<Array<readonly [DocKey, T]>>((resolve, reject) => {
          const range = lo.prefix ? IDBKeyRange.bound(lo.prefix, lo.prefix + '￿') : undefined;
          const out: Array<readonly [DocKey, T]> = [];
          const cur = store(c).openCursor(range);
          cur.onsuccess = () => {
            const x = cur.result;
            if (!x || (lo.limit !== undefined && out.length >= lo.limit)) {
              resolve(out);
              return;
            }
            out.push([textOf(x.key), x.value as T]);
            x.continue();
          };
          cur.onerror = () => {
            reject(cur.error ?? new DOMException('the IndexedDB cursor failed', 'UnknownError'));
          };
        }),
    };
    return new Promise(resolve => {
      let value: { v: R } | null = null,
        failed: unknown = null;
      t.oncomplete = () => {
        resolve(value ? ok(value.v) : err(new NoemaError('storage.failed', 'the transaction ended without its work')));
      };
      const fail = (): void => {
        const e = failed ?? t.error;
        resolve(err(isQuotaError(e) ? o.onQuota(lastKey) : NoemaError.from(e, 'storage.failed')));
      };
      t.onabort = fail;
      t.onerror = ev => {
        failed = failed ?? t.error ?? (ev.target as IDBRequest | null)?.error;
      };
      work(tx).then(
        v => {
          value = { v };
        },
        (e: unknown) => {
          failed = failed ?? e;
          // the work failed: undo everything it wrote (abort throws only when the transaction has already ended)
          try {
            t.abort();
          } catch {
            fail();
          }
        },
      );
    });
  }

  return {
    collections: [...o.collections],
    get: <T>(c: string, k: DocKey) => transaction([c], 'readonly', tx => tx.get<T>(c, k)),
    put: (c, k, d) => transaction([c], 'readwrite', tx => tx.put(c, k, d)),
    delete: (c, k) => transaction([c], 'readwrite', tx => tx.delete(c, k)),
    list: <T>(c: string, lo?: DocListOptions) => transaction([c], 'readonly', tx => tx.list<T>(c, lo)),
    transaction,
  };
}
