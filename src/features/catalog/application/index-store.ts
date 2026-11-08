/**
 * The search index of one account (docs/SEARCH.md): the records of every source (a subject's pack, a Roadmap, a
 * language course, the conversations), kept on this device and brought up to date in the background.
 *
 * Each source has a signature; when it changes, that source's records are built again — in the Worker (the Compute
 * job `catalog.records`), so a large pack never blocks the page — and stored (the document store, one entry per account
 * and source: { schema, sig, at, recs }). What is stored is read at once on load; a stored entry of another SCHEMA is
 * ignored (rebuilt). The query side reads `records()` as they are.
 */
import type { NoemaError } from '../../../kernel/errors.ts';
import type { AsyncResult } from '../../../kernel/result.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { DocumentStore } from '../../../ports/storage.ts';
import { SCHEMA, type CatalogRecord, type SourceInput } from '../domain/records.ts';

export const INDEX_COLLECTION = 'src';

export interface IndexSource {
  readonly key: string;
  readonly label?: string;
  /** Changes when the source changes. */
  readonly sig: string;
  /** What to build the records from (the pack, the Roadmap …), or null when it cannot be read now. */
  input(): Promise<SourceInput | null>;
  /** false: keep in memory only (default: stored). */
  readonly store?: boolean;
}

export interface IndexState {
  done: number;
  total: number;
  busy: boolean;
  label: string;
}

export interface CatalogIndex {
  /** Reads what is stored (once). */
  load(): Promise<void>;
  /** Brings every source up to date: the changed ones are rebuilt one by one, the results grow as they come. */
  refresh(): Promise<void>;
  records(): CatalogRecord[];
  byKey(key: string): CatalogRecord | null;
  readonly state: Readonly<IndexState>;
  on(listener: (state: Readonly<IndexState>) => void): Unsubscribe;
  /** Drops one source (it is built again on the next refresh). */
  forget(key: string): Promise<void>;
}

export interface CatalogIndexDeps {
  readonly account: string;
  readonly sources: () => Promise<readonly IndexSource[]>;
  readonly docs: DocumentStore;
  /** Builds one source's records (the Worker job). */
  readonly build: (input: SourceInput) => AsyncResult<CatalogRecord[]>;
  readonly report: (error: unknown, where: string) => void;
}

interface Stored {
  readonly schema: number;
  readonly sig: string;
  readonly at?: number;
  readonly recs: CatalogRecord[];
}

/** A record as stored: without the keys the query side adds in memory (_t, _o, …). */
const strip = (recs: readonly CatalogRecord[]): CatalogRecord[] =>
  recs.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_'))) as unknown as CatalogRecord);

export function createCatalogIndex(d: CatalogIndexDeps): CatalogIndex {
  const prefix = d.account + '|';
  const mem = new Map<string, { sig: string; recs: CatalogRecord[] }>();
  const listeners = new Set<(s: Readonly<IndexState>) => void>();
  const state: IndexState = { done: 0, total: 0, busy: false, label: '' };
  let loaded: Promise<void> | null = null,
    running: Promise<void> | null = null,
    all: CatalogRecord[] | null = null,
    keys: Map<string, CatalogRecord> | null = null;
  const changed = (): void => {
    all = null;
    keys = null;
  };
  const emit = (): void => {
    for (const f of listeners) {
      try {
        f(state);
      } catch (e) {
        d.report(e, 'catalog.index.listener');
      }
    }
  };
  const failed = (where: string) => (e: NoemaError) => {
    d.report(e, where);
  };

  function load(): Promise<void> {
    loaded ??= d.docs.list<Stored>(INDEX_COLLECTION, { prefix }).then(r => {
      if (!r.ok) {
        failed('catalog.index.load')(r.error);
        return;
      }
      for (const [k, v] of r.value) if (v.schema === SCHEMA) mem.set(k.slice(prefix.length), { sig: v.sig, recs: v.recs });
      changed();
    });
    return loaded;
  }

  async function run(): Promise<void> {
    await load();
    let list: readonly IndexSource[] = [];
    try {
      list = await d.sources();
    } catch (e) {
      d.report(e, 'catalog.index.sources');
    }
    const want = new Set(list.map(s => s.key));
    for (const k of [...mem.keys()])
      if (!want.has(k)) {
        mem.delete(k);
        changed();
        void d.docs.delete(INDEX_COLLECTION, prefix + k).then(r => {
          if (!r.ok) failed('catalog.index.delete')(r.error);
        });
      }
    const stale = list.filter(s => mem.get(s.key)?.sig !== s.sig);
    Object.assign(state, { done: 0, total: stale.length, busy: stale.length > 0, label: '' });
    emit();
    for (const s of stale) {
      state.label = s.label ?? s.key;
      emit();
      try {
        const input = await s.input();
        if (input) {
          const built = await d.build(input);
          if (!built.ok) failed('catalog.index.build')(built.error);
          else {
            mem.set(s.key, { sig: s.sig, recs: built.value });
            changed();
            if (s.store !== false) {
              const put = await d.docs.put(INDEX_COLLECTION, prefix + s.key, {
                schema: SCHEMA,
                sig: s.sig,
                recs: strip(built.value),
              } satisfies Stored);
              if (!put.ok) failed('catalog.index.store')(put.error);
            }
          }
        }
      } catch (e) {
        d.report(e, 'catalog.index.source');
      }
      state.done++;
      emit();
    }
    state.busy = false;
    state.label = '';
    emit();
  }

  return {
    load,
    refresh() {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
    records() {
      if (!all) {
        all = [];
        for (const v of mem.values()) for (const r of v.recs) all.push(r);
      }
      return all;
    },
    byKey(k) {
      if (!keys) {
        keys = new Map();
        for (const r of this.records()) keys.set(r.k, r);
      }
      return keys.get(k) ?? null;
    },
    state,
    on(f) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    async forget(key) {
      mem.delete(key);
      changed();
      const r = await d.docs.delete(INDEX_COLLECTION, prefix + key);
      if (!r.ok) failed('catalog.index.delete')(r.error);
    },
  };
}
