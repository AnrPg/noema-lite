/**
 * This device's copies of the account's 文A bridges (docs/BRIDGE.md): the IndexedDB database `noema-bridges`, store `b`,
 * keyed `${account}|${pack}|${pair}` — the database the app has always kept them in, so every copy already on a device is
 * read as it is. Opened on first use; without IndexedDB every call fails (the caller falls back to the cloud or the library).
 */
export interface BridgeCacheStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export function browserBridgeCache(name = 'noema-bridges'): BridgeCacheStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise<IDBDatabase>((res, rej) => {
      const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      if (!idb) {
        rej(new Error('no IndexedDB'));
        return;
      }
      const r = idb.open(name, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('b')) r.result.createObjectStore('b');
      };
      r.onsuccess = () => {
        res(r.result);
      };
      r.onerror = () => {
        rej(r.error ?? new Error('IndexedDB open failed'));
      };
    }).catch((e: unknown) => {
      db = null; // a failed open may be tried again
      throw e;
    }));
  const tx = async (mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<unknown> => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('b', mode),
        q = f(t.objectStore('b'));
      if (mode === 'readonly') {
        q.onsuccess = () => {
          res(q.result);
        };
        q.onerror = () => {
          rej(q.error ?? new Error('IndexedDB read failed'));
        };
        return;
      }
      t.oncomplete = () => {
        res(undefined);
      };
      t.onerror = () => {
        rej(t.error ?? new Error('IndexedDB write failed'));
      };
    });
  };
  return Object.freeze({
    get: (key: string) => tx('readonly', s => s.get(key)),
    put: async (key: string, value: unknown) => {
      await tx('readwrite', s => s.put(value, key));
    },
    del: async (key: string) => {
      await tx('readwrite', s => s.delete(key));
    },
  });
}
