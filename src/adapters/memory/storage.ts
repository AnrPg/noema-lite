/**
 * In-memory Storage (tests, Node tools). Same rules as the browser's: a byte quota (optional) that raises the
 * storage-full signal, transactions that keep all or nothing.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../kernel/result.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { DocKey, DocListOptions, DocumentStore, DocumentTransaction, KeyValueStore, QuotaEstimate, Storage, StorageFullEvent, TransactionMode } from '../../ports/storage.ts';

export interface MemoryStorageOptions {
  /** The collections of the document store. */
  readonly collections?: readonly string[];
  /** Characters the key-value store may hold (keys + values), like a localStorage quota. */
  readonly kvQuota?: number;
  /** Documents the document store may hold. */
  readonly docsQuota?: number;
  readonly now?: () => number;
}

const clone = <T>(x: T): T => (x === undefined ? x : structuredClone(x));

export function memoryStorage(options: MemoryStorageOptions = {}): Storage & { readonly kvMap: Map<string, string> } {
  const now = options.now ?? Date.now;
  const kvMap = new Map<string, string>();
  const docs = new Map<string, Map<DocKey, unknown>>();
  for (const c of options.collections ?? ['packs', 'handles', 'restore', 'convos']) docs.set(c, new Map());
  const listeners = new Set<(e: StorageFullEvent) => void>();
  let persisted = false;

  const full = (store: 'kv' | 'docs', key: string): NoemaError => {
    const event: StorageFullEvent = { store, key, at: now() };
    for (const l of [...listeners]) l(event);
    return new NoemaError('storage.quota', 'the storage is full', { params: { key }, retryable: true });
  };
  const kvSize = (): number => { let n = 0; for (const [k, v] of kvMap) n += k.length + v.length; return n; };
  const docCount = (): number => { let n = 0; for (const m of docs.values()) n += m.size; return n; };
  const coll = (name: string): Result<Map<DocKey, unknown>> => {
    const m = docs.get(name);
    return m ? ok(m) : err(new NoemaError('storage.failed', 'no such collection: ' + name, { params: { collection: name } }));
  };

  const kv: KeyValueStore = {
    get: key => ok(kvMap.get(key) ?? null),
    set(key, value) {
      const before = kvMap.get(key);
      const size = kvSize() - (before === undefined ? 0 : key.length + before.length) + key.length + value.length;
      if (options.kvQuota !== undefined && size > options.kvQuota) return err(full('kv', key));
      kvMap.set(key, value);
      return OK_VOID;
    },
    delete(key) { kvMap.delete(key); return OK_VOID; },
    keys: (prefix = '') => ok([...kvMap.keys()].filter(k => k.startsWith(prefix))),
  };

  const listIn = <T>(m: Map<DocKey, unknown>, o: DocListOptions = {}): Array<readonly [DocKey, T]> => {
    const keys = [...m.keys()].filter(k => k.startsWith(o.prefix ?? '')).sort();
    return keys.slice(0, o.limit ?? keys.length).map(k => [k, clone(m.get(k)) as T] as const);
  };

  const store: DocumentStore = {
    collections: [...docs.keys()],
    async get<T>(collection: string, key: DocKey): AsyncResult<T | undefined> {
      const m = coll(collection);
      return m.ok ? ok(clone(m.value.get(key)) as T | undefined) : m;
    },
    async put(collection, key, doc) {
      return store.transaction([collection], 'readwrite', tx => tx.put(collection, key, doc));
    },
    async delete(collection, key) {
      const m = coll(collection);
      if (!m.ok) return m;
      m.value.delete(key);
      return OK_VOID;
    },
    async list<T>(collection: string, o?: DocListOptions): AsyncResult<Array<readonly [DocKey, T]>> {
      const m = coll(collection);
      return m.ok ? ok(listIn<T>(m.value, o)) : m;
    },
    async transaction<R>(collections: readonly string[], mode: TransactionMode, work: (tx: DocumentTransaction) => Promise<R>): AsyncResult<R> {
      for (const c of collections) { const m = coll(c); if (!m.ok) return m; }
      // writes go to a copy of each collection; the copies replace the originals only when `work` finishes
      const staged = new Map(collections.map(c => [c, new Map(docs.get(c))] as const));
      const inTx = (c: string): Map<DocKey, unknown> => {
        const m = staged.get(c);
        if (!m) throw new NoemaError('storage.failed', `collection ${c} is not part of this transaction`);
        return m;
      };
      const write = (): void => { if (mode !== 'readwrite') throw new NoemaError('storage.failed', 'a readonly transaction cannot write'); };
      let quota: NoemaError | null = null;
      const tx: DocumentTransaction = {
        get: async <T>(c: string, k: DocKey) => clone(inTx(c).get(k)) as T | undefined,
        put: async (c, k, d) => {
          write();
          const m = inTx(c);
          if (options.docsQuota !== undefined && !m.has(k) && docCount() + 1 > options.docsQuota) { quota = full('docs', c + '/' + k); throw quota; }
          m.set(k, clone(d));
        },
        delete: async (c, k) => { write(); inTx(c).delete(k); },
        list: async <T>(c: string, o?: DocListOptions) => listIn<T>(inTx(c), o),
      };
      try {
        const out = await work(tx);
        for (const [c, m] of staged) docs.set(c, m);
        return ok(out);
      } catch (e) {
        return err(quota ?? NoemaError.from(e, 'storage.failed'));
      }
    },
  };

  return {
    kvMap,
    kv,
    docs: store,
    async estimate(): AsyncResult<QuotaEstimate> {
      return ok({ usage: kvSize() * 2, quota: options.kvQuota === undefined ? null : options.kvQuota * 2, persisted });
    },
    async persist() { persisted = true; return ok(true); },
    onFull(listener): Unsubscribe {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
