/**
 * The device's key/value store, sized like an app's (docs/ARCHITECTURE.md §4, the Storage port).
 *
 * localStorage is capped at about 5 MB in every browser (Safari on iPhone too), whatever the device's free space, so an
 * account's data — its Roadmaps with every step's chapter plans and translations, the sync's bookkeeping, the caches —
 * cannot live there: a learner with a few Roadmaps fills it and every later write fails ("storage is full").
 * So the account's keys (`noema1:<account>:…`, isAccountKey) live in IndexedDB (database `noema-kv`, store `kv`), which
 * grows with the free space, and the page reads them from an in-memory copy, so every read stays synchronous.
 *
 * Every write carries a revision (a hybrid logical clock: "<ms>-<count>-<tab>", sortable as text), and every copy keeps
 * the highest revision of a key — the memory of each tab, the database (a write never replaces a newer record), the
 * journal — so tabs that write at the same time all end on the same value, whatever order things arrive in. A delete is a
 * revision too (a tombstone), so an older copy can never bring the key back.
 *
 *  • `ready()` loads the database into memory once; the app awaits it before it reads an account (ui-root start). Before
 *    it, a read falls back to what localStorage holds; a write is kept and wins over older copies.
 *  • a write changes memory at once and goes to IndexedDB in the same task (one transaction per burst).
 *  • the journal (localStorage, `noema-device:kvj:<key>` = {v, r}): what is not committed yet when the page is hidden or
 *    closes (a closing page may abort its last transaction), and a write IndexedDB refused (full, failing). The next start
 *    replays it; an entry is removed only once a write at least as new is committed. When neither keeps a write, the
 *    storage-full signal is raised and memory keeps it for this session (tried again with the next write).
 *  • the keys an older version kept in localStorage are moved in on ready (removed only after their commit).
 *  • the other tabs hear every write (BroadcastChannel) and keep it when it is newer than theirs.
 *  • localStorage cleared on its own (a test's reset, a hand-cleared site: its mark is gone) drops the database's copy, as
 *    when everything lived there; a localStorage that cannot be read drops nothing.
 *  • without IndexedDB (blocked site data, old private modes) every key stays in localStorage, as before.
 * Every other key (`noema-device:…`, `noema1:current`, an account's `a:settings`, …: small, some read before ready) stays
 * in localStorage.
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
  /** Whether a key is the account's (kept in IndexedDB); default isAccountKey. */
  readonly isAccountKey?: (key: string) => boolean;
  /** A write nothing could keep: raises the storage-full signal and answers its error. */
  readonly onQuota: (key: string) => NoemaError;
  /** The other tabs (default: a BroadcastChannel when the page has one). */
  readonly channel?: (name: string) => ChannelLike | null;
  /** Problems worth a log line (default console.warn). */
  readonly warn?: (what: string, e: unknown) => void;
  /** The physical clock (default Date.now). */
  readonly now?: () => number;
}

export interface MirroredKv extends KeyValueStore {
  /** Loads the database into memory (once); resolves even when IndexedDB is unavailable (localStorage is used then). */
  ready(): Promise<void>;
  /** Where the account's keys are: IndexedDB, localStorage (no IndexedDB here), or not decided yet (before ready). */
  readonly backing: () => 'indexeddb' | 'localStorage' | 'loading';
  /** Keys another tab changed. */
  onChange(listener: (keys: readonly string[]) => void): () => void;
  /** Resolves when every write so far reached IndexedDB (or the journal). */
  flushed(): Promise<void>;
  /** The page is hidden or closing (pagehide): what is not committed yet goes to the journal. */
  journal(): void;
}

/** An account's key: `noema1:<account>:<kind>:…` — but not the device's own `noema1:` keys (`noema1:accounts`,
    `noema1:accounts:removed`, `noema1:migrated:<name>`, `noema1:cloud:session`, `noema1:current`: one word after the
    prefix, where an account's keys always have a kind and a name, so a profile called "cloud" is still an account) nor
    an account's `a:settings`, which the first screen reads before ready (its language, its character) and stays small. */
export function isAccountKey(key: string): boolean {
  const m = /^noema1:([^:]+):(.*)$/.exec(key);
  if (!m) return false;
  const rest = m[2] ?? '';
  return rest.includes(':') && rest !== 'a:settings';
}

/** A key's value (null: deleted) and its revision. */
interface Rec {
  readonly v: string | null;
  readonly r: string;
}
const isRec = (x: unknown): x is Rec =>
  !!x && typeof x === 'object' && typeof (x as Rec).r === 'string' && ((x as Rec).v === null || typeof (x as Rec).v === 'string');
const newer = (a: Rec | undefined, b: Rec | undefined): boolean => !!a && (!b || a.r > b.r);

const STORE = 'kv';
/** the mark that ties the database to this localStorage (in both; not a key of the app) */
const MARK_LS = 'noema-device:kv-mark',
  MARK_DB = '\u0000mark';
/** the journal's keys in localStorage */
export const JOURNAL_PREFIX = 'noema-device:kvj:';

const unavailable = (cause?: unknown): NoemaError =>
  new NoemaError('storage.unavailable', 'this browser gives no localStorage here', cause === undefined ? {} : { cause });

export function mirroredKv(o: MirroredKvOptions): MirroredKv {
  const dbName = o.dbName ?? 'noema-kv';
  const isAcc = o.isAccountKey ?? isAccountKey;
  const now = o.now ?? Date.now;
  const warn =
    o.warn ??
    ((what: string, e: unknown): void => {
      console.warn('[noema kv] ' + what, e); // i18n-ignore (a log)
    });
  /** the account's keys (deleted ones as tombstones, v null) */
  const mem = new Map<string, Rec>();
  /** writes not yet sent to IndexedDB */
  let pending = new Map<string, Rec>();
  /** this tab's writes not yet committed (their revision): what the journal keeps when the page closes */
  const unsettled = new Map<string, string>();
  /** keys an older version left in localStorage, moved to the database but not committed yet (their value there) */
  const legacy = new Map<string, string>();
  let mode: 'indexeddb' | 'localStorage' | 'loading' = 'loading';
  let db: IDBDatabase | null = null;
  let loading: Promise<void> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  const listeners = new Set<(keys: readonly string[]) => void>();

  /* ---------- revisions: a hybrid logical clock per tab ---------- */
  const tab = Math.random().toString(36).slice(2, 10);
  let lastWall = 0,
    count = 0;
  const pad = (n: number, w: number): string => String(n).padStart(w, '0');
  function revision(): string {
    const t = now();
    if (t > lastWall) {
      lastWall = t;
      count = 0;
    } else count++;
    return `${pad(lastWall, 15)}-${pad(count, 6)}-${tab}`;
  }
  /** a revision seen from elsewhere: this tab's next one is later — even when it came from a clock that ran ahead and was
      set back since (the database keeps the highest revision, so a lower one would never be written) */
  function seen(r: string): void {
    const wall = Number(r.slice(0, 15)),
      c = Number(r.slice(16, 22));
    if (!Number.isFinite(wall)) return;
    if (wall > lastWall) {
      lastWall = wall;
      count = Number.isFinite(c) ? c : 0;
    } else if (wall === lastWall && Number.isFinite(c) && c > count) count = c;
  }
  /** keep `rec` in memory if it is newer → whether it was */
  function take(k: string, rec: Rec): boolean {
    if (!newer(rec, mem.get(k))) return false;
    mem.set(k, rec);
    seen(rec.r);
    return true;
  }

  /* ---------- localStorage ---------- */
  const ls = (): Result<WebStorageLike> => {
    try {
      const s = o.localStorage();
      return s ? ok(s) : err(unavailable());
    } catch (e) {
      return err(unavailable(e));
    }
  };
  /** a read that tells a missing key (ok null) from a localStorage that cannot be read (not ok) */
  const lsRead = (k: string): Result<string | null> => {
    const s = ls();
    if (!s.ok) return s;
    try {
      return ok(s.value.getItem(k));
    } catch (e) {
      return err(unavailable(e));
    }
  };
  const lsGet = (k: string): string | null => {
    const r = lsRead(k);
    return r.ok ? r.value : null;
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
  /** a write that raises no signal (the journal, the mark): false when it was not kept */
  const lsQuiet = (k: string, v: string): boolean => {
    const s = ls();
    if (!s.ok) return false;
    try {
      s.value.setItem(k, v);
      return true;
    } catch {
      return false; // full or blocked: the caller has another way
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

  /* ---------- the journal ---------- */
  const journalGet = (k: string): Rec | undefined => {
    const raw = lsGet(JOURNAL_PREFIX + k);
    if (raw === null) return undefined;
    try {
      const x: unknown = JSON.parse(raw);
      return isRec(x) ? x : undefined;
    } catch {
      return undefined; // not ours: as if missing
    }
  };
  /** keep `rec` in the journal unless an entry as new is there → false when localStorage did not keep it */
  function journalPut(k: string, rec: Rec): boolean {
    const j = journalGet(k);
    if (j && j.r >= rec.r) return true;
    return lsQuiet(JOURNAL_PREFIX + k, JSON.stringify(rec));
  }
  /** a write at least as new as `r` is committed: the journal's older entry goes, and this tab's older write is settled */
  function settled(k: string, r: string): void {
    const j = journalGet(k);
    if (j && j.r <= r) lsDel(JOURNAL_PREFIX + k);
    const u = unsettled.get(k);
    if (u !== undefined && u <= r) unsettled.delete(k);
    // an older version's copy of it, superseded by what was just committed: it leaves localStorage
    const old = legacy.get(k);
    if (old !== undefined) {
      if (lsGet(k) === old) lsDel(k);
      legacy.delete(k);
    }
  }

  /* ---------- the other tabs ---------- */
  let chan: ChannelLike | null = null;
  try {
    const BC = (globalThis as { BroadcastChannel?: new (n: string) => ChannelLike }).BroadcastChannel;
    chan = o.channel ? o.channel('noema-kv:' + dbName) : BC ? new BC('noema-kv:' + dbName) : null;
  } catch (e) {
    warn('no BroadcastChannel: the other tabs see a change on their next start', e);
    chan = null;
  }
  if (chan)
    chan.onmessage = e => {
      const d = e.data as { k?: unknown; v?: unknown; r?: unknown } | null;
      if (!d || typeof d.k !== 'string' || typeof d.r !== 'string' || !isAcc(d.k)) return;
      const rec = { v: typeof d.v === 'string' ? d.v : null, r: d.r };
      if (!take(d.k, rec)) return;
      // the other tab's write is newer: it commits (or journals) it; this tab's older one need not come back
      const u = unsettled.get(d.k);
      if (u !== undefined && u < rec.r) unsettled.delete(d.k);
      for (const l of [...listeners]) l([d.k]);
    };
  const tell = (k: string, rec: Rec): void => {
    try {
      chan?.postMessage({ k, v: rec.v, r: rec.r });
    } catch (e) {
      warn('a change was not told to the other tabs', e);
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

  function readAll(d: IDBDatabase): Promise<Map<string, Rec>> {
    return new Promise((res, rej) => {
      const out = new Map<string, Rec>();
      const t = d.transaction([STORE], 'readonly');
      const c = t.objectStore(STORE).openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return;
        if (typeof cur.key === 'string' && isRec(cur.value)) out.set(cur.key, cur.value);
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

  /** Writes the batch; a record never replaces a newer one already there (another tab's). */
  function writeBatch(d: IDBDatabase, batch: ReadonlyMap<string, Rec>): Promise<void> {
    return new Promise((res, rej) => {
      const t = d.transaction([STORE], 'readwrite');
      const s = t.objectStore(STORE);
      for (const [k, rec] of batch) {
        const g = s.get(k);
        g.onsuccess = () => {
          const cur: unknown = g.result;
          if (!isRec(cur) || cur.r < rec.r) s.put(rec, k);
        };
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

  /** A batch IndexedDB did not keep: into the journal (replayed on the next start); else the signal, and memory keeps it. */
  function failOver(batch: ReadonlyMap<string, Rec>, e: unknown): void {
    warn('IndexedDB refused a write: kept in the journal until the next start', e);
    for (const [k, rec] of batch) {
      if (legacy.get(k) === rec.v && !unsettled.has(k)) {
        // the move of an older version's key: still safe in localStorage, moved again with the next write
        if (mem.get(k)?.r === rec.r && !pending.has(k)) pending.set(k, rec);
        continue;
      }
      if (k !== MARK_DB && unsettled.get(k) !== rec.r) continue; // a newer write of this key (here or in another tab) takes care of it
      if (k !== MARK_DB && journalPut(k, rec)) continue;
      if (rec.v !== null && k !== MARK_DB) o.onQuota(k); // nowhere to keep it now: the learner is told
      if (!pending.has(k)) pending.set(k, rec); // tried again with the next write
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
    const done = (): void => {
      for (const [k, rec] of batch) settled(k, rec.r);
    };
    const run = async (): Promise<void> => {
      try {
        db ??= await openDb();
        await writeBatch(db, batch);
        done();
      } catch (e) {
        // Safari drops the connection when the app was in the background: once more on a fresh one
        if (!isQuotaError(e)) {
          try {
            db = await openDb();
            await writeBatch(db, batch);
            done();
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
    if (mode === 'localStorage') return;
    let stored: Map<string, Rec>;
    try {
      db = await openDb();
      stored = await readAll(db);
    } catch (e) {
      warn('IndexedDB unavailable: the account stays in localStorage', e);
      toLocalStorage();
      return;
    }
    const markRec = stored.get(MARK_DB);
    stored.delete(MARK_DB);
    // this tab's revisions come after everything persisted (a clock set back since included), before any is made here
    if (markRec) seen(markRec.r);
    for (const rec of stored.values()) seen(rec.r);
    // The database belongs to this localStorage (its mark in both): localStorage cleared on its own (a test's reset, a
    // hand-cleared site) drops the database's copy with it, as when everything lived there. A localStorage that cannot
    // be read drops nothing, and the mark is written only where localStorage keeps it.
    const lsMark = lsRead(MARK_LS);
    if (lsMark.ok && markRec?.v && lsMark.value !== markRec.v) {
      warn('localStorage was cleared: the account copy in IndexedDB goes with it', lsMark.value);
      for (const [k, rec] of stored) {
        const gone = { v: null, r: revision() };
        if (rec.v !== null && take(k, gone)) pending.set(k, gone);
      }
      stored.clear();
    }
    if (lsMark.ok && (lsMark.value === null || lsMark.value !== markRec?.v)) {
      const mark = lsMark.value ?? `${now().toString(36)}-${tab}`;
      if (lsMark.value === null) lsQuiet(MARK_LS, mark);
      if (lsGet(MARK_LS) === mark) pending.set(MARK_DB, { v: mark, r: revision() });
    }
    for (const [k, rec] of stored) take(k, rec);
    // the journal: writes a closed page or a refused transaction left
    const journaled = new Set<string>();
    for (const jk of lsKeys(JOURNAL_PREFIX)) {
      const k = jk.slice(JOURNAL_PREFIX.length),
        rec = journalGet(k);
      if (!rec || !isAcc(k)) continue;
      journaled.add(k);
      if (newer(rec, stored.get(k))) {
        if (take(k, rec)) pending.set(k, rec);
      } else lsDel(jk); // the database has it (or newer)
    }
    // the keys an older version kept in localStorage: newer than anything here (that version wrote nowhere else). They
    // leave localStorage once a write at least as new is committed (settled), so a copy left by a failed move never
    // comes back over a later edit.
    for (const k of lsKeys('noema1:')) {
      if (!isAcc(k)) continue;
      const v = lsGet(k);
      if (v === null) continue;
      legacy.set(k, v);
      if (unsettled.has(k)) continue; // this page wrote it since: that write wins, the old copy only leaves
      if (journaled.has(k)) {
        // a later edit of it, journaled after a failed move, wins; when the database already has it (committed), the old
        // copy leaves now, else once that edit commits (settled)
        if (!pending.has(k)) {
          lsDel(k);
          legacy.delete(k);
        }
        continue;
      }
      const rec = { v, r: revision() };
      take(k, rec);
      pending.set(k, rec);
    }
    // what this page wrote before ready (in memory already, newer than all of the above)
    for (const [k, r] of unsettled) {
      const rec = mem.get(k);
      if (rec?.r === r) pending.set(k, rec);
    }
    mode = 'indexeddb';
    if (!pending.size) return;
    const batch = pending;
    pending = new Map();
    try {
      await writeBatch(db, batch);
      for (const [k, rec] of batch) settled(k, rec.r);
    } catch (e) {
      // the database is full or failing: an older version's keys stay where they are; the rest goes to the journal
      warn('the first write to IndexedDB failed: the keys stay in localStorage', e);
      failOver(batch, e);
    }
  }

  /** whether IndexedDB may hold an account copy (this device used it: its mark is in localStorage) */
  const dbMayHold = (): boolean => lsGet(MARK_LS) !== null;

  /** No IndexedDB here (now or since this start): the account lives in localStorage. The journal (writes a page closed
      before committing, refused writes) is put there first, then what this page wrote before ready; a journal entry
      leaves only once localStorage kept it. */
  function toLocalStorage(): void {
    mode = 'localStorage';
    const apply = (k: string, rec: Rec): boolean => {
      if (rec.v === null) {
        lsDel(k);
        return true;
      }
      return lsSet(k, rec.v).ok;
    };
    const recs = new Map<string, Rec>();
    for (const jk of lsKeys(JOURNAL_PREFIX)) {
      const k = jk.slice(JOURNAL_PREFIX.length),
        rec = journalGet(k);
      if (rec && isAcc(k)) recs.set(k, rec);
    }
    for (const [k, rec] of mem) if (newer(rec, recs.get(k))) recs.set(k, rec);
    // a delete stays journaled while a database copy may exist (this device used IndexedDB: its mark), so a later start
    // with IndexedDB back does not bring the key back; a value is in localStorage now and moves in from there
    for (const [k, rec] of recs) if (apply(k, rec) && (rec.v !== null || !dbMayHold())) lsDel(JOURNAL_PREFIX + k);
    mem.clear();
    pending.clear();
    unsettled.clear();
    legacy.clear();
  }

  /** a write of this tab: memory, the batch, the other tabs */
  function write(key: string, v: string | null): void {
    const rec = { v, r: revision() };
    mem.set(key, rec);
    unsettled.set(key, rec.r);
    pending.set(key, rec);
    schedule();
    tell(key, rec);
  }

  const store: MirroredKv = {
    ready() {
      loading ??= load();
      return loading;
    },
    backing: () => mode,
    get(key) {
      if (!isAcc(key) || mode === 'localStorage') return lsRead(key);
      const rec = mem.get(key);
      if (rec) return ok(rec.v);
      if (mode === 'loading') return ok(lsGet(key)); // before ready: where it was
      return ok(null);
    },
    set(key, value) {
      if (!isAcc(key)) return lsSet(key, value);
      if (mode === 'localStorage') {
        const r = lsSet(key, value);
        if (r.ok) lsDel(JOURNAL_PREFIX + key); // newer than any journal entry of it
        return r;
      }
      write(key, value);
      return OK_VOID;
    },
    delete(key) {
      if (!isAcc(key) || mode === 'localStorage') {
        const s = ls();
        if (!s.ok) return s;
        try {
          s.value.removeItem(key);
          if (isAcc(key)) {
            if (dbMayHold())
              journalPut(key, { v: null, r: revision() }); // IndexedDB may still have it: the delete waits for it
            else s.value.removeItem(JOURNAL_PREFIX + key);
          }
          return OK_VOID;
        } catch (e) {
          return err(unavailable(e));
        }
      }
      write(key, null);
      return OK_VOID;
    },
    keys(prefix = '') {
      const s = ls();
      if (!s.ok && mode !== 'indexeddb') return s;
      const out = new Set<string>();
      for (const k of lsKeys(prefix)) {
        if (k === MARK_LS || k.startsWith(JOURNAL_PREFIX)) continue; // the store's own bookkeeping
        if (!isAcc(k) || mode !== 'indexeddb') out.add(k);
      }
      if (mode !== 'localStorage')
        for (const [k, rec] of mem) {
          if (!k.startsWith(prefix)) continue;
          if (rec.v === null) out.delete(k);
          else out.add(k);
        }
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
    journal() {
      if (mode !== 'indexeddb') return;
      flush();
      for (const [k, r] of unsettled) {
        const rec = mem.get(k);
        if (rec?.r === r && !journalPut(k, rec)) continue; // too big for what is left: the transaction still has its chance, the smaller ones may fit
      }
    },
  };

  // no IndexedDB at all here (a test context, blocked site data): localStorage from the start, as before
  try {
    if (!o.indexedDB()) toLocalStorage();
  } catch (e) {
    warn('IndexedDB unavailable: the account stays in localStorage', e);
    toLocalStorage();
  }
  try {
    const g = globalThis as { addEventListener?: (t: string, f: () => void) => void; document?: { visibilityState?: string } };
    g.addEventListener?.('pagehide', () => {
      store.journal();
    });
    g.addEventListener?.('visibilitychange', () => {
      if (g.document?.visibilityState === 'hidden') store.journal();
    });
  } catch (e) {
    warn('no page events: nothing is journaled when the page closes', e);
  }
  return store;
}
