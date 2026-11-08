/**
 * The EventStore over a document store (src/ports/storage.ts DocumentStore): the browser gives it IndexedDB (its own
 * database "noema-learning", src/adapters/browser/event-store.ts), tests and Node tools the memory store. One
 * implementation, so both behave alike. Four collections:
 *   events     <account>|<at>|<id> → the event        (key order = log order: the stamp sorts as text)
 *   ids        <account>|<id>      → { hlc, gone? }     (every id ever appended: idempotency outlives compaction)
 *   snapshots  <account>           → { upTo, value }
 *   meta       <account>|<name>    → a small value
 * Appends are one transaction each: every new event and its id, and the snapshot dropped when an event lands at or
 * before what it folded. Tabs of one device hear of each other's appends through the channel (BroadcastChannel).
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../kernel/result.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { EventStore, Snapshot, StoredEvent } from '../../ports/event-store.ts';
import type { DocumentStore, StorageFullEvent } from '../../ports/storage.ts';

export const EVENT_COLLECTIONS = Object.freeze(['events', 'ids', 'snapshots', 'meta'] as const);

/** A message bus between the tabs of a device (the browser's BroadcastChannel, or an in-process one in tests). */
export interface TabChannel {
  post(message: unknown): void;
  listen(listener: (message: unknown) => void): Unsubscribe;
}

export interface DocumentEventStoreOptions {
  readonly docs: DocumentStore;
  /** The storage-full signal of the store under `docs`. */
  readonly onFull: (listener: (e: StorageFullEvent) => void) => Unsubscribe;
  readonly channel?: TabChannel | undefined;
}

interface IdEntry {
  readonly hlc: string;
  readonly gone?: true;
}

const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;
const badAccount = (a: string): NoemaError =>
  new NoemaError('events.invalid', 'not an account of the learning log: ' + JSON.stringify(a.slice(0, 80)));
const eventKey = (acc: string, e: { hlc: string; id: string }): string => `${acc}|${e.hlc}|${e.id}`;
const isEvent = (x: unknown): x is StoredEvent =>
  !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { hlc?: unknown }).hlc === 'string';

export function documentEventStore(o: DocumentEventStoreOptions): EventStore {
  const { docs } = o;
  const watchers = new Set<(account: string, events: readonly StoredEvent[]) => void>();
  o.channel?.listen(m => {
    if (!m || typeof m !== 'object') return;
    const { account, events } = m as { account?: unknown; events?: unknown };
    if (typeof account !== 'string' || !Array.isArray(events)) return;
    const list = events.filter(isEvent);
    for (const w of [...watchers]) w(account, list);
  });
  let channelClosed = false;
  const checked = (account: string): Result<string> => (ACCOUNT.test(account) ? ok(account) : err(badAccount(account)));

  async function append(account: string, events: readonly StoredEvent[]): AsyncResult<StoredEvent[]> {
    const a = checked(account);
    if (!a.ok) return a;
    for (const e of events) if (e.account !== account) return err(badAccount(e.account));
    if (!events.length) return ok([]);
    const r = await docs.transaction(['events', 'ids', 'snapshots'], 'readwrite', async tx => {
      const added: StoredEvent[] = [],
        seen = new Set<string>();
      for (const e of events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if ((await tx.get<IdEntry>('ids', `${account}|${e.id}`)) !== undefined) continue;
        await tx.put('events', eventKey(account, e), e);
        await tx.put('ids', `${account}|${e.id}`, { hlc: e.hlc } satisfies IdEntry);
        added.push(e);
      }
      if (added.length) {
        const snap = await tx.get<Snapshot>('snapshots', account);
        if (snap) {
          const upTo = eventKey(account, snap.upTo);
          if (added.some(e => eventKey(account, e) <= upTo)) await tx.delete('snapshots', account);
        }
      }
      return added.sort((x, y) => (x.hlc < y.hlc ? -1 : x.hlc > y.hlc ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    });
    if (r.ok && r.value.length && o.channel && !channelClosed) {
      try {
        o.channel.post({ account, events: r.value });
      } catch {
        // a closed channel: the append is committed, and the other tabs read it from the log on their next start
        channelClosed = true;
      }
    }
    return r;
  }

  return {
    append,
    async read(account, options = {}) {
      const a = checked(account);
      if (!a.ok) return a;
      const r = await docs.list<unknown>('events', {
        prefix: account + '|',
        ...(options.after !== undefined ? { after: `${account}|${options.after}|￿` } : {}),
      });
      if (!r.ok) return r;
      return ok(r.value.map(([, v]) => v).filter(isEvent));
    },
    async known(account, ids) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.transaction(['ids'], 'readonly', async tx => {
        const out = new Set<string>();
        for (const id of ids) if ((await tx.get('ids', `${account}|${id}`)) !== undefined) out.add(id);
        return out;
      });
    },
    async forget(account, ids) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.transaction(['events', 'ids'], 'readwrite', async tx => {
        let n = 0;
        for (const id of ids) {
          const k = `${account}|${id}`,
            entry = await tx.get<IdEntry>('ids', k);
          if (!entry || entry.gone) continue;
          await tx.delete('events', eventKey(account, { hlc: entry.hlc, id }));
          await tx.put('ids', k, { hlc: entry.hlc, gone: true } satisfies IdEntry);
          n++;
        }
        return n;
      });
    },
    async getSnapshot(account) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.get<Snapshot>('snapshots', account);
    },
    async putSnapshot(account, snapshot) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.put('snapshots', account, snapshot);
    },
    async getMeta<T>(account: string, name: string) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.get<T>('meta', `${account}|${name}`);
    },
    async putMeta(account, name, value) {
      const a = checked(account);
      if (!a.ok) return a;
      return docs.put('meta', `${account}|${name}`, value);
    },
    async clear(account) {
      const a = checked(account);
      if (!a.ok) return a;
      const r = await docs.transaction([...EVENT_COLLECTIONS], 'readwrite', async tx => {
        for (const c of ['events', 'ids', 'meta'] as const)
          for (const [k] of await tx.list(c, { prefix: account + '|' })) await tx.delete(c, k);
        await tx.delete('snapshots', account);
      });
      return r.ok ? OK_VOID : r;
    },
    watch(listener) {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
    onFull: listener => o.onFull(listener),
  };
}

/** Tabs in one process (tests): every store made with the same hub hears the others' posts, never its own. */
export function memoryTabHub(): () => TabChannel {
  const all = new Set<(m: unknown) => void>();
  return () => {
    const mine = new Set<(m: unknown) => void>();
    return {
      post(m) {
        const copy: unknown = structuredClone(m);
        for (const l of all) if (!mine.has(l)) l(copy);
      },
      listen(l) {
        all.add(l);
        mine.add(l);
        return () => {
          all.delete(l);
          mine.delete(l);
        };
      },
    };
  };
}
