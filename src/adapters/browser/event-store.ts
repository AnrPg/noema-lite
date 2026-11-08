/**
 * The browser's EventStore: the learning log in IndexedDB, in a database of its own ("noema-learning", so it never has
 * to share version upgrades with the loader's "noema-lite"), its tabs told of each other's appends by a BroadcastChannel.
 * A write the browser refuses because the site's storage is full returns storage.quota and raises the storage-full
 * signal. Platform objects are looked up on first use (the root loads in a bare vm and in a Worker).
 */
import { NoemaError } from '../../kernel/errors.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { EventStore } from '../../ports/event-store.ts';
import type { StorageFullEvent } from '../../ports/storage.ts';
import { documentEventStore, EVENT_COLLECTIONS, type TabChannel } from '../local/event-store.ts';
import { idbDocuments } from './storage.ts';

export const LEARNING_DB = Object.freeze({ name: 'noema-learning', version: 1, channel: 'noema-learning' });

/** The DOM's BroadcastChannel, as far as the adapter uses it. */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface BrowserEventStoreOptions {
  readonly dbName?: string;
  readonly indexedDB?: () => IDBFactory | undefined;
  /** Makes the channel between tabs (default: BroadcastChannel; none where the browser has none). */
  readonly broadcast?: (name: string) => BroadcastChannelLike | undefined;
  readonly now?: () => number;
}

export function browserEventStore(o: BrowserEventStoreOptions = {}): EventStore {
  const now = o.now ?? Date.now;
  const g = globalThis as { indexedDB?: IDBFactory; BroadcastChannel?: new (name: string) => BroadcastChannelLike };
  const listeners = new Set<(e: StorageFullEvent) => void>();
  const docs = idbDocuments({
    name: o.dbName ?? LEARNING_DB.name,
    version: LEARNING_DB.version,
    collections: EVENT_COLLECTIONS,
    indexedDB: o.indexedDB ?? ((): IDBFactory | undefined => g.indexedDB),
    onQuota: key => {
      const event = Object.freeze({ store: 'docs' as const, key, at: now() });
      for (const l of [...listeners]) l(event);
      return new NoemaError('storage.quota', 'the browser storage for this site is full', { params: { key }, retryable: true });
    },
  });
  const make =
    o.broadcast ?? ((name: string): BroadcastChannelLike | undefined => (g.BroadcastChannel ? new g.BroadcastChannel(name) : undefined));
  let bc: BroadcastChannelLike | undefined | null = null;
  const listenersOfTabs = new Set<(m: unknown) => void>();
  const open = (): BroadcastChannelLike | undefined => {
    if (bc !== null) return bc;
    try {
      bc = make(LEARNING_DB.channel);
    } catch {
      // no channel here (an old browser, a sandboxed frame): each tab reads the log itself on its next start
      bc = undefined;
    }
    if (bc)
      bc.onmessage = ev => {
        for (const l of [...listenersOfTabs]) l(ev.data);
      };
    return bc;
  };
  const channel: TabChannel = {
    post: m => open()?.postMessage(m),
    listen(l): Unsubscribe {
      listenersOfTabs.add(l);
      open();
      return () => {
        listenersOfTabs.delete(l);
      };
    },
  };
  return documentEventStore({
    docs,
    channel,
    onFull: l => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  });
}
