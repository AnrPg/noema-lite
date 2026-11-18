/**
 * The device's key/value store, sized like an app's (docs/ARCHITECTURE.md §6.3, "Where the device keeps what").
 *
 * localStorage is capped at about 5 MB in every browser (Safari on iPhone too), whatever the phone's free space, so an
 * account's data — its Roadmaps with every step's chapter plans and translations, the sync's bookkeeping, the caches —
 * cannot live there: a learner with a few Roadmaps fills it and every later write fails ("storage is full").
 * So the account's keys (`noema1:<account>:…`) live in IndexedDB (database `noema-kv`, store `kv`), which grows with
 * the device's free space, and the page reads them from an in-memory copy, so every read stays synchronous:
 *
 *  • `ready()` loads the database into memory once; the app awaits it before it reads an account (ui-root start).
 *    Before it, a read falls back to localStorage (where the keys were before) and a write is kept and wins.
 *  • a write changes the copy at once and is written to IndexedDB in the same task (one transaction per burst);
 *  • the keys an older version kept in localStorage are moved to IndexedDB on ready (removed from localStorage only
 *    after their transaction committed, and only if nothing changed them meanwhile);
 *  • a write IndexedDB refuses is never lost: it goes to localStorage instead (moved back on the next start) and, when
 *    that is full too, the storage-full signal is raised and the copy keeps the value for this session (retried later);
 *  • the other tabs hear every change (BroadcastChannel) and update their copies; `onChange` tells this page;
 *  • without IndexedDB (blocked site data, old private modes) every key stays in localStorage, as before.
 * Every other key (`noema-device:…`, `noema1:current`, an account's `a:settings`, …: small, some read before ready) stays
 * in localStorage (isAccountKey).
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type Result } from '../../kernel/result.ts';
import { isQuotaError, type KeyValueStore } from '../../ports/storage.ts';

/** The DOM's localStorage, as far as the store uses it. */
export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A broadcast channel, as far as the store uses it. */
export interface ChannelLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close?(): void;
}

export interface MirroredKvOptions {
  readonly localStorage: () => WebStorageLike | undefined;
  readonly indexedDB: () => IDBFactory | undefined;
  /** The database (default `noema-kv`). */
  readonly dbName?: string;
  /** Whether a key is the account's (kept in IndexedDB); default: `noema1:<account>:…`. */
  readonly isAccountKey?: (key: string) => boolean;
  /** A write nothing could keep: raises the storage-full signal and answers its error. */
  readonly onQuota: (key: string) => NoemaError;
  /** The other tabs (default: a BroadcastChannel when the page has one). */
  readonly channel?: (name: string) => ChannelLike | null;
  /** Problems worth a log line (default console.warn). */
  readonly warn?: (what: string, e: unknown) => void;
}

export interface MirroredKv extends KeyValueStore {
  /** Loads the database into memory (once); resolves even when IndexedDB is unavailable (localStorage is used then). */
  ready(): Promise<void>;
  /** Whether the account's keys are in IndexedDB (false: localStorage, as before). */
  readonly backing: () => 'indexeddb' | 'localStorage' | 'loading';
  /** Keys changed by another tab. */
  onChange(listener: (keys: readonly string[]) => void): () => void;
  /** Resolves when every write so far reached IndexedDB (or failed over to localStorage). */
  flushed(): Promise<void>;
  /** The page is hidden or closing (called on pagehide): what is not committed yet is written to localStorage too. */
  journal(): void;
}

/** An account's key: `noema1:<account>:…` — but not the device's own `noema1:` keys (the profiles, the migrations' marks,
    the cloud session) nor an account's `a:settings`, which the first screen reads before ready (its language, its
    character) and which stays small. */
export function isAccountKey(key: string): boolean {
  const m = /^noema1:([^:]+):(.*)$/.exec(key);
  if (!m) return false;
  return !['accounts', 'migrated', 'cloud', 'current'].includes(m[1] ?? '') && m[2] !== 'a:settings';
}
const STORE = 'kv';
/** the mark that ties the database to this localStorage (in both; not a key of the app) */
const MARK_LS = 'noema-device:kv-mark',
  MARK_DB = '\u0000mark';

const unavailable = (cause?: unknown): NoemaError =>
  new NoemaError('storage.unavailable', 'this browser gives no localStorage here', cause === undefined ? {} : { cause });

export function mirroredKv(o: MirroredKvOptions): MirroredKv {
  const dbName = o.dbName ?? 'noema-kv';
  const isAcc = o.isAccountKey ?? isAccountKey;
  const warn =
    o.warn ??
    ((what: string, e: unknown): void => {
      console.warn('[noema kv] ' + what, e); // i18n-ignore (a log)
    });
  /** the account's keys; a missing key is not in it */
  const mem = new Map<string, string>();
  /** keys written (or deleted) on this page before ready: the database's older copy must not replace them */
  const early = new Set<string>();
  /** writes not yet in IndexedDB: value, or null = delete */
  let pending = new Map<string, string | null>();
  /** every write not yet committed (pending or in a running transaction): what the page writes to localStorage when it is
      hidden or closed, since a closing page may abort its last transaction (moved back on the next start) */
  const unsettled = new Map<string, string | null>();
  let mode: 'indexeddb' | 'localStorage' | 'loading' = 'loading';
  let db: IDBDatabase | null = null;
  let loading: Promise<void> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  const listeners = new Set<(keys: readonly string[]) => void>();

  const ls = (): Result<WebStorageLike> => {
    try {
      const s = o.localStorage();
      return s ? ok(s) : err(unavailable());
    } catch (e) {
      return err(unavailable(e));
    }
  };
  const lsGet = (k: string): string | null => {
    const s = ls();
    if (!s.ok) return null;
    try {
      return s.value.getItem(k);
    } catch {
      return null;
    }
  };
  const lsSet = (k: string, v: string): Result<void> => {
    const s = ls();
    if (!s.ok) return s;
    try {
      s.value.setItem(k, v);
      return OK_VOID;
    } catch (e) {
      return err(
        isQuotaError(e) ? o.onQuota(k) : new NoemaError('storage.failed', 'localStorage refused a write', { cause: e, params: { key: k } }),
      );
    }
  };
  const lsDel = (k: string): void => {
    const s = ls();
    if (!s.ok) return;
    try {
      s.value.removeItem(k);
    } catch {
      return; // blocked: nothing to remove
    }
  };
  const lsKeys = (prefix: string): string[] => {
    const s = ls();
    if (!s.ok) return [];
    const out: string[] = [];
    try {
      for (let i = 0; i < s.value.length; i++) {
        const k = s.value.key(i);
        if (k !== null && k.startsWith(prefix)) out.push(k);
      }
    } catch {
      return out;
    }
    return out;
  };

  /* ---------- the other tabs ---------- */
  let chan: ChannelLike | null = null;
  try {
    const BC = (globalThis as { BroadcastChannel?: new (n: string) => ChannelLike }).BroadcastChannel;
    chan = o.channel ? o.channel('noema-kv:' + dbName) : BC ? new BC('noema-kv:' + dbName) : null;
  } catch {
    chan = null; // no channel: the other tabs see the change on their next start
  }
  if (chan)
    chan.onmessage = e => {
      const d = e.data as { k?: unknown; v?: unknown } | null;
      if (!d || typeof d.k !== 'string' || !isAcc(d.k)) return;
      if (typeof d.v === 'string') mem.set(d.k, d.v);
      else mem.delete(d.k);
      for (const l of [...listeners]) l([d.k]);
    };
  const tell = (k: string, v: string | null): void => {
    try {
      chan?.postMessage({ k, v });
    } catch {
      return; // a closed channel: the other tabs read it on their next start
    }
  };

  /* ---------- IndexedDB ---------- */
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((res, rej) => {
      const idb = o.indexedDB();
      if (!idb) {
        rej(new Error('no IndexedDB'));
        return;
      }
      const r = idb.open(dbName, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => {
        const d = r.result;
        d.onversionchange = () => {
          d.close();
          db = null;
        };
        d.onclose = () => {
          db = null; // Safari closes it when the app is suspended: reopened on the next write
        };
        res(d);
      };
      r.onerror = () => {
        rej(r.error ?? new Error('IndexedDB open failed'));
      };
      r.onblocked = () => {
        rej(new Error('IndexedDB open blocked'));
      };
    });

  function readAll(d: IDBDatabase): Promise<Map<string, string>> {
    return new Promise((res, rej) => {
      const out = new Map<string, string>();
      const t = d.transaction([STORE], 'readonly');
      const c = t.objectStore(STORE).openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return;
        if (typeof cur.key === 'string' && typeof cur.value === 'string') out.set(cur.key, cur.value);
        cur.continue();
      };
      t.oncomplete = () => {
        res(out);
      };
      t.onerror = () => {
        rej(t.error ?? new Error('IndexedDB read failed'));
      };
      t.onabort = () => {
        rej(t.error ?? new Error('IndexedDB read aborted'));
      };
    });
  }

  function writeBatch(d: IDBDatabase, batch: ReadonlyMap<string, string | null>): Promise<void> {
    return new Promise((res, rej) => {
      const t = d.transaction([STORE], 'readwrite');
      const s = t.objectStore(STORE);
      for (const [k, v] of batch) {
        if (v === null) s.delete(k);
        else s.put(v, k);
      }
      t.oncomplete = () => {
        res();
      };
      t.onerror = () => {
        rej(t.error ?? new Error('IndexedDB write failed'));
      };
      // a full device aborts the transaction (QuotaExceededError), sometimes without an error on a request
      t.onabort = () => {
        rej(t.error ?? new Error('IndexedDB write aborted'));
      };
    });
  }

  /** A batch IndexedDB did not keep: into localStorage (moved back on the next start), else the signal; the copy keeps it. */
  function failOver(batch: ReadonlyMap<string, string | null>, e: unknown): void {
    warn('IndexedDB refused a write: kept in localStorage until the next start', e);
    for (const [k, v] of batch) {
      if (v === null) {
        if (!pending.has(k)) pending.set(k, null); // a delete: tried again with the next write
        continue;
      }
      const w = lsSet(k, v); // a full localStorage raises the signal itself
      if (w.ok) continue;
      if (w.error.code !== 'storage.quota') o.onQuota(k);
      if (!pending.has(k)) pending.set(k, v); // nowhere to keep it now: the copy has it, tried again with the next write
    }
  }

  let scheduled = false;
  function schedule(): void {
    if (scheduled || mode !== 'indexeddb') return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      flush();
    });
  }
  function flush(): void {
    if (!pending.size || mode !== 'indexeddb') return;
    const batch = pending;
    pending = new Map();
    /** a failed-over copy in localStorage is older now: it must not come back on the next start */
    const dropOld = (): void => {
      for (const [k, v] of batch) {
        if (unsettled.get(k) === v) unsettled.delete(k);
        const c = lsGet(k);
        // a copy in localStorage is older now (a failed-over write), unless it is the newer value this page journaled
        if (c !== null && !(unsettled.has(k) && unsettled.get(k) === c)) lsDel(k);
      }
    };
    const run = async (): Promise<void> => {
      try {
        db ??= await openDb();
        await writeBatch(db, batch);
        dropOld();
      } catch (e) {
        // Safari drops the connection when the app was in the background: once more on a fresh one
        if (!isQuotaError(e)) {
          try {
            db = await openDb();
            await writeBatch(db, batch);
            dropOld();
            return;
          } catch (e2) {
            failOver(batch, e2);
            return;
          }
        }
        failOver(batch, e);
      }
    };
    inFlight = inFlight.then(run, run);
  }

  async function load(): Promise<void> {
    let stored: Map<string, string>;
    try {
      db = await openDb();
      stored = await readAll(db);
    } catch (e) {
      warn('IndexedDB unavailable: the account stays in localStorage', e);
      mode = 'localStorage';
      // what was written before ready goes where the keys are now
      for (const [k, v] of pending) {
        if (v === null) lsDel(k);
        else lsSet(k, v);
      }
      pending.clear();
      return;
    }
    // The database belongs to this localStorage (its mark in both): when localStorage was cleared on its own (a test's
    // reset, a hand-cleared site) the database's account is dropped with it, as it was when everything lived there.
    // The mark is only written once localStorage keeps it, so a blocked localStorage never drops anything.
    const lsMark = lsGet(MARK_LS),
      dbMark = stored.get(MARK_DB) ?? null;
    stored.delete(MARK_DB);
    let reset = false;
    if (dbMark !== null && lsMark !== dbMark) {
      warn('localStorage was cleared: the account copy in IndexedDB goes with it', lsMark);
      reset = true;
      for (const k of stored.keys()) if (!early.has(k)) pending.set(k, null);
      stored.clear();
    }
    if (dbMark === null || reset) {
      const mark = lsMark ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      if (lsMark === null) {
        const st = ls();
        try {
          if (st.ok) st.value.setItem(MARK_LS, mark); // quietly: a full localStorage only means no mark this time
        } catch (e) {
          warn('no mark in localStorage this time: the database is never dropped', e);
        }
      }
      if (lsGet(MARK_LS) === mark) pending.set(MARK_DB, mark);
    }
    for (const [k, v] of stored) if (!early.has(k)) mem.set(k, v);
    // the keys an older version (or a failed-over write) left in localStorage: they are newer than the database's
    const moved = new Map<string, string>();
    for (const k of lsKeys('')) {
      if (!isAcc(k) || early.has(k)) continue;
      const v = lsGet(k);
      if (v === null) continue;
      mem.set(k, v);
      pending.set(k, v);
      moved.set(k, v);
    }
    mode = 'indexeddb';
    if (!pending.size) return;
    const batch = pending;
    pending = new Map();
    try {
      await writeBatch(db, batch);
      for (const k of batch.keys()) {
        const m = moved.get(k);
        // only once it is safely in the database; a key written before ready: its older localStorage copy goes too
        if (m === undefined || lsGet(k) === m) lsDel(k);
      }
    } catch (e) {
      // the database is full or failing: everything stays in localStorage as it was, the copy has it all
      warn('the move to IndexedDB failed: the keys stay in localStorage', e);
      for (const [k, v] of batch) if (!moved.has(k) && v !== null) lsSet(k, v);
    }
  }

  const store: MirroredKv = {
    ready() {
      loading ??= load();
      return loading;
    },
    backing: () => mode,
    get(key) {
      if (!isAcc(key) || mode === 'localStorage') {
        const s = ls();
        if (!s.ok) return s;
        try {
          return ok(s.value.getItem(key));
        } catch (e) {
          return err(unavailable(e));
        }
      }
      if (mem.has(key)) return ok(mem.get(key) ?? null);
      if (mode === 'loading' && !early.has(key)) return ok(lsGet(key)); // before ready: where it was
      return ok(null);
    },
    set(key, value) {
      if (!isAcc(key) || mode === 'localStorage') return lsSet(key, value);
      mem.set(key, value);
      if (mode === 'loading') early.add(key);
      pending.set(key, value);
      unsettled.set(key, value);
      schedule();
      tell(key, value);
      return OK_VOID;
    },
    delete(key) {
      if (!isAcc(key) || mode === 'localStorage') {
        const s = ls();
        if (!s.ok) return s;
        try {
          s.value.removeItem(key);
          return OK_VOID;
        } catch (e) {
          return err(unavailable(e));
        }
      }
      mem.delete(key);
      if (mode === 'loading') early.add(key);
      pending.set(key, null);
      unsettled.set(key, null);
      lsDel(key); // a failed-over or older copy must not come back on the next start
      schedule();
      tell(key, null);
      return OK_VOID;
    },
    keys(prefix = '') {
      const s = ls();
      if (!s.ok && mode !== 'indexeddb') return s;
      const out = new Set<string>();
      for (const k of lsKeys(prefix)) if (!isAcc(k) || mode !== 'indexeddb') out.add(k);
      if (mode !== 'localStorage') for (const k of mem.keys()) if (k.startsWith(prefix)) out.add(k);
      if (mode === 'loading') for (const k of early) if (!mem.has(k)) out.delete(k);
      return ok([...out]);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async flushed() {
      flush();
      await inFlight;
    },
    journal: () => undefined, // set below
  };
  /** The page is hidden or closing: what is not committed yet goes to localStorage too, quietly (moved back on the next start). */
  const journal = (store.journal = (): void => {
    if (mode !== 'indexeddb') return;
    flush();
    const st = ls();
    if (!st.ok) return;
    for (const [k, v] of unsettled) {
      if (v === null) continue; // a delete removed the localStorage copy already
      try {
        st.value.setItem(k, v);
      } catch {
        return; // a full localStorage: the transaction still has its chance
      }
    }
  });
  try {
    const g = globalThis as { addEventListener?: (t: string, f: () => void) => void; document?: { visibilityState?: string } };
    g.addEventListener?.('pagehide', journal);
    g.addEventListener?.('visibilitychange', () => {
      if (g.document?.visibilityState === 'hidden') journal();
    });
  } catch (e) {
    warn('no page events: nothing is journaled when the page closes', e);
  }
  return store;
}
