/**
 * Test double: the part of IndexedDB the browser storage adapter uses — open with upgrade, object stores with
 * out-of-line keys, transactions that commit when their last request is done (or abort), cursors over a key range,
 * structured clones, and a quota (documents) whose overflow fails the request with QuotaExceededError.
 */

type Listener = ((ev: { target: unknown }) => void) | null;

class Req<T> {
  result: T = undefined as T;
  error: unknown = null;
  onsuccess: Listener = null;
  onerror: Listener = null;
}

class KeyRange {
  readonly lower: string;
  readonly upper: string;
  constructor(lower: string, upper: string) { this.lower = lower; this.upper = upper; }
  static bound(l: string, u: string): KeyRange { return new KeyRange(l, u); }
  includes(k: string): boolean { return k >= this.lower && k <= this.upper; }
}

interface Db { version: number; stores: Map<string, Map<string, unknown>> }

export interface FakeIndexedDB {
  readonly factory: IDBFactory;
  readonly KeyRange: typeof KeyRange;
  /** Documents the whole database may hold. */
  quota: number;
}

export function fakeIndexedDB(): FakeIndexedDB {
  const dbs = new Map<string, Db>();
  const state = { quota: Infinity };

  function connection(name: string, db: Db) {
    return {
      name,
      get version() { return db.version; },
      objectStoreNames: { contains: (s: string) => db.stores.has(s) },
      createObjectStore(s: string) { db.stores.set(s, new Map()); return {}; },
      onversionchange: null as unknown,
      close() {},
      transaction(names: string[], mode: 'readonly' | 'readwrite' = 'readonly') {
        for (const n of names) if (!db.stores.has(n)) throw Object.assign(new Error(`No objectStore named ${n}`), { name: 'NotFoundError' });
        const staged = new Map(names.map(n => [n, new Map(db.stores.get(n))] as const));
        let pending = 0, finished = false;
        const t = {
          error: null as unknown,
          oncomplete: null as (() => void) | null,
          onerror: null as Listener,
          onabort: null as (() => void) | null,
          abort() {
            if (finished) throw Object.assign(new Error('The transaction has finished.'), { name: 'InvalidStateError' });
            finished = true;
            setTimeout(() => t.onabort?.(), 0);
          },
          objectStore(n: string) {
            const s = staged.get(n);
            if (!s) throw Object.assign(new Error('not in this transaction: ' + n), { name: 'NotFoundError' });
            const run = <T>(f: () => T): Req<T> => {
              const r = new Req<T>();
              if (finished) throw Object.assign(new Error('The transaction is not active.'), { name: 'TransactionInactiveError' });
              pending++;
              queueMicrotask(() => {
                pending--;
                if (finished) return;
                try { r.result = f(); r.onsuccess?.({ target: r }); }
                catch (e) {
                  r.error = e;
                  t.error = e;
                  r.onerror?.({ target: r });
                  t.onerror?.({ target: r });
                  finished = true;
                  setTimeout(() => t.onabort?.(), 0);
                  return;
                }
                check();
              });
              return r;
            };
            const write = (): void => { if (mode !== 'readwrite') throw Object.assign(new Error('The transaction is read-only.'), { name: 'ReadOnlyError' }); };
            return {
              get: (k: string) => run(() => structuredClone(s.get(k))),
              put: (v: unknown, k: string) => run(() => {
                write();
                let total = 0;
                for (const [name, m] of db.stores) total += (staged.get(name) ?? m).size;
                if (!s.has(k) && total + 1 > state.quota) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
                s.set(k, structuredClone(v));
                return k;
              }),
              delete: (k: string) => run(() => { write(); s.delete(k); }),
              openCursor(range?: KeyRange) {
                const keys = [...s.keys()].filter(k => !range || range.includes(k)).sort();
                const r = new Req<unknown>();
                let i = 0;
                const step = (): void => {
                  pending++;
                  queueMicrotask(() => {
                    pending--;
                    if (finished) return;
                    const k = keys[i++];
                    r.result = k === undefined ? null : { key: k, value: structuredClone(s.get(k)), continue: step };
                    r.onsuccess?.({ target: r });
                    check();
                  });
                };
                step();
                return r;
              },
            };
          },
        };
        // commit when nothing is pending after the work's microtasks have run (a macrotask later)
        const check = (): void => {
          setTimeout(() => {
            if (finished || pending > 0) return;
            finished = true;
            for (const [n, m] of staged) db.stores.set(n, m);
            t.oncomplete?.();
          }, 0);
        };
        check();
        return t;
      },
    };
  }

  const factory = {
    open(name: string, version = 1) {
      const r = new Req<unknown>() as Req<unknown> & { onupgradeneeded: (() => void) | null; onblocked: (() => void) | null };
      r.onupgradeneeded = null;
      r.onblocked = null;
      setTimeout(() => {
        let db = dbs.get(name);
        const isNew = !db || db.version < version;
        if (!db) { db = { version, stores: new Map() }; dbs.set(name, db); }
        const c = connection(name, db);
        r.result = c;
        if (isNew) { db.version = version; r.onupgradeneeded?.(); }
        r.onsuccess?.({ target: r });
      }, 0);
      return r;
    },
  };
  return {
    factory: factory as unknown as IDBFactory,
    KeyRange,
    get quota() { return state.quota; },
    set quota(q: number) { state.quota = q; },
  };
}
