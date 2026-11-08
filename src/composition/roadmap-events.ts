/**
 * The Roadmap events of an account (src/features/roadmaps/application/ports.ts RoadmapEventLog) in the device's key-value
 * store, under the account's key `noema1:<account>:a:roadmapEvents` (an append-only list, idempotent by event id, oldest
 * first). Writes go through the store the composition root gives, which in the app is the account store the cloud sync
 * follows (engine/loader.js Noema.kv), so every device of the account gets the same log.
 *
 * This is the Roadmaps feature's binding of its event port; the learning log (helper 1's EventStore over IndexedDB, with
 * the outbox of the sync) takes its place in the composition root once it is there — the events and their ids are the ones
 * of src/features/roadmaps/domain/events.ts either way.
 */
import { ok, err } from '../kernel/result.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { KeyValueStore } from '../ports/storage.ts';
import type { RoadmapEventLog } from '../features/roadmaps/application/ports.ts';
import { isRoadmapEvent, type RoadmapEvent } from '../features/roadmaps/domain/events.ts';

export const roadmapEventsKey = (account: string): string => `noema1:${account}:a:roadmapEvents`;
/** At most this many events are kept (levels and restructurings are rare: a ladder has tens of levels). */
const MAX = 2000;

export function kvRoadmapEventLog(store: () => KeyValueStore): RoadmapEventLog {
  const read = (account: string): RoadmapEvent[] | NoemaError => {
    const raw = store().get(roadmapEventsKey(account));
    if (!raw.ok) return raw.error;
    if (!raw.value) return [];
    try {
      const v = JSON.parse(raw.value) as unknown;
      return Array.isArray(v) ? v.filter((e): e is RoadmapEvent => isRoadmapEvent(e as { type?: unknown })) : [];
    } catch (e) {
      return new NoemaError('storage.corrupt', 'the Roadmap events are not JSON', { cause: e });
    }
  };
  return {
    append(account, events) {
      const cur = read(account);
      if (cur instanceof NoemaError) return Promise.resolve(err(cur));
      const ids = new Set(cur.map(e => e.id)),
        add = events.filter(e => !ids.has(e.id) && (ids.add(e.id), true));
      if (!add.length) return Promise.resolve(ok(0));
      const w = store().set(roadmapEventsKey(account), JSON.stringify([...cur, ...add].slice(-MAX)));
      return Promise.resolve(w.ok ? ok(add.length) : w);
    },
    list(account, roadmap) {
      const cur = read(account);
      if (cur instanceof NoemaError) return Promise.resolve(err(cur));
      return Promise.resolve(ok(roadmap ? cur.filter(e => e.roadmap === roadmap) : cur));
    },
  };
}

/** The app's account store (engine/loader.js Noema.kv: its writes are followed by the cloud sync), else the device's. */
export function accountKvStore(fallback: () => KeyValueStore): () => KeyValueStore {
  interface NoemaKv {
    get(k: string): string | null;
    set(k: string, v: string): unknown;
    del(k: string): unknown;
  }
  return () => {
    const kv = (globalThis as { Noema?: { kv?: NoemaKv } }).Noema?.kv;
    if (!kv) return fallback();
    const base = fallback();
    return {
      get: k => ok(kv.get(k)),
      set: (k, v) => {
        kv.set(k, v);
        return ok(undefined);
      },
      delete: k => {
        kv.del(k);
        return ok(undefined);
      },
      keys: p => base.keys(p),
    };
  };
}
