/**
 * Data written by the app's earlier versions, carried into this one (never deleted): the ONLY place where the old names
 * appear. The start runs prefix() and idb() once on every device (src/composition/ui-root.ts); quest() waits until the
 * Databricks pack is opened (engine/app/library.js openEngine). A backup or a pack of the old formats is read by
 * src/composition/shell/core.ts (backup.validate) and engine/app/community.js (importPack) through OLD_FORMATS.
 */
import { P, jsonOf, type AccountKv, type DeviceKv } from './kv.ts';

/** the app's names before it was renamed noema-lite (learning-quest) */
export const OLD_FORMATS = Object.freeze({
  kvPrefix: 'lq1:',
  idbName: 'learning-quest',
  backupFormats: Object.freeze(['learning-quest-backup']),
  packFormats: Object.freeze(['lq-pack']),
});

interface Store {
  get<T = unknown>(store: string, key: string): Promise<T | undefined>;
  put(store: string, key: string, val: unknown): Promise<void>;
}
interface Deps {
  readonly kv: DeviceKv;
  readonly KV: AccountKv;
  /** the app's IndexedDB (core.ts IDB) */
  readonly idb: Store;
  readonly indexedDB: () => IDBFactory | undefined;
  /** the conversations' schema now (engine/convos.js) */
  readonly convoSchema: () => string;
  readonly learning: { account(): string | null; hasProgress(subject: string): boolean };
  /** told once the old progress is in */
  readonly carried: () => void;
  readonly warn: (where: string, e: unknown) => void;
}

type Row = [IDBValidKey, unknown];
type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x);

export function oldData(d: Deps) {
  const { kv, KV } = d;
  const now = (): number => Date.now();
  /** the old database, if this browser has one (opening it never creates it) */
  const openOld = (f: IDBFactory): Promise<IDBDatabase | null> =>
    new Promise(res => {
      let created = false;
      const r = f.open(OLD_FORMATS.idbName);
      r.onupgradeneeded = () => {
        created = true;
        r.transaction?.abort();
      };
      r.onsuccess = () => {
        res(created ? null : r.result);
      };
      r.onerror = () => {
        res(null);
      };
      r.onblocked = () => {
        res(null);
      };
    });
  const rowsOf = (db: IDBDatabase, store: string): Promise<Row[]> =>
    new Promise(res => {
      const out: Row[] = [];
      const c = db.transaction(store).objectStore(store).openCursor();
      c.onsuccess = () => {
        const x = c.result;
        if (!x) {
          res(out);
          return;
        }
        out.push([x.key, x.value]);
        x.continue();
      };
      c.onerror = () => {
        res(out);
      };
    });
  /** a conversation of the old app → the current schema (its engine state renamed lqState → noemaState) */
  const convo = (v: Json): Json => ({
    ...v,
    schema: d.convoSchema(),
    messages: (Array.isArray(v['messages']) ? (v['messages'] as unknown[]) : []).map((m: unknown) => {
      if (!isObj(m) || !isObj(m['meta']) || !m['meta']['lqState']) return m;
      return { ...m, meta: { ...m['meta'], noemaState: m['meta']['lqState'], lqState: undefined } };
    }),
  });
  /** a pack of the old format → the pack (its format renamed) */
  const pack = (p: unknown): unknown =>
    isObj(p) && OLD_FORMATS.packFormats.includes(String(p['format'])) ? { ...p, format: 'noema-pack' } : p;
  return {
    OLD_FORMATS,
    pack,
    /** the keys of the old prefix (lq1:), copied once when this device has none of its own */
    prefix(): void {
      if (kv.get(P + 'migrated:prefix')) return;
      const old = kv.keys(OLD_FORMATS.kvPrefix);
      if (old.length && !kv.keys(P).length)
        for (const k of old) {
          const v = kv.get(k);
          if (v != null) kv.set(P + k.slice(OLD_FORMATS.kvPrefix.length), v);
        }
      kv.set(P + 'migrated:prefix', JSON.stringify({ at: now(), keys: old.length }));
    },
    /** the old database's packs, folder handles, restore points and conversations, copied once (what is here wins) */
    async idb(): Promise<void> {
      const f = d.indexedDB();
      if (kv.get(P + 'migrated:idb') || !f) return;
      const db = await openOld(f);
      if (db) {
        for (const store of ['packs', 'handles', 'restore', 'convos']) {
          if (!db.objectStoreNames.contains(store)) continue;
          for (const [key, v0] of await rowsOf(db, store)) {
            const k = typeof key === 'string' ? key : JSON.stringify(key); // the app's keys are text ('<acc>|<id>', 'dir|<acc>')
            let v = v0;
            if (store === 'convos' && isObj(v)) v = convo(v);
            if (store === 'packs') v = pack(v);
            if (!(await d.idb.get(store, k))) await d.idb.put(store, k, v);
          }
        }
        db.close();
      }
      kv.set(P + 'migrated:idb', String(now()));
    },
    /** Databricks Quest (the single-file app, v1–v3): its progress is written the way this app kept it before the learning
        log (s:<subject>:state, a:stats), which the log then converts (NoemaCore.learning.migrate) → true when something
        was written */
    quest(acc: string, subj: string): boolean {
      if (kv.get(P + 'migrated:legacy')) return false;
      const old = kv.get('dbquest_v1'),
        oldC = kv.get('dbquest_convos_v1');
      if (!old && !oldC) {
        kv.set(P + 'migrated:legacy', 'none');
        return false;
      }
      if (subj !== 'databricks') return false; // wait until the Databricks pack is opened
      if (d.learning.account() === acc && d.learning.hasProgress(subj)) {
        kv.set(P + 'migrated:legacy', 'skipped');
        return false;
      }
      try {
        if (old) {
          const s = JSON.parse(old) as Json;
          const settings = isObj(s['settings']) ? s['settings'] : {};
          delete s['settings'];
          s['srcOn'] = settings['srcOn'] ?? null;
          delete settings['srcOn'];
          KV.set(KV.subjectKey('state', subj, acc), JSON.stringify(s));
          const cur = jsonOf<Json>(kv, KV.accountKey('settings', acc), {});
          KV.set(KV.accountKey('settings', acc), JSON.stringify({ ...settings, ...cur }));
          if (!jsonOf<unknown>(kv, KV.accountKey('stats', acc), null))
            KV.set(
              KV.accountKey('stats', acc),
              JSON.stringify({ xp: s['xp'] || 0, xpDay: s['xpDay'] || {}, streak: s['streak'] || 0, lastDay: s['lastDay'] || null }),
            );
        }
        if (oldC) KV.set(KV.subjectKey('convos', subj, acc), oldC);
        kv.set(P + 'migrated:legacy', JSON.stringify({ acc, at: now() }));
        setTimeout(d.carried, 1500);
        return true;
      } catch (e) {
        d.warn('loader.legacy', e);
        return false;
      }
    },
  };
}
export type OldData = ReturnType<typeof oldData>;
