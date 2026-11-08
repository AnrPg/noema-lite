/**
 * The browser's EventStore: the learning log in the app's IndexedDB ("noema-lite", src/adapters/browser/storage.ts APP_DB,
 * whose stores include the log's collections), so an append and the sync's outbox are one transaction; its tabs told of
 * each other's appends by a BroadcastChannel. A write the browser refuses because the site's storage is full returns
 * storage.quota and raises the storage's own full signal (the learner's warning). The channel is made on first use (the
 * root loads in a bare vm and in a Worker).
 */
import type { Unsubscribe } from '../../ports/common.ts';
import type { EventOutbox, EventStore } from '../../ports/event-store.ts';
import type { Storage } from '../../ports/storage.ts';
import { documentEventStore, type TabChannel } from '../local/event-store.ts';

/** The channel the tabs of a device tell each other of their appends on. */
export const LEARNING_CHANNEL = 'noema-learning';

/** The DOM's BroadcastChannel, as far as the adapter uses it. */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface BrowserEventStoreOptions {
  /** The app's storage: its documents hold the log (and the outbox), its full signal is the log's. */
  readonly storage: Pick<Storage, 'docs' | 'onFull'>;
  /** The sync's outbox (none: nothing is queued, e.g. without a cloud). */
  readonly outbox?: EventOutbox | undefined;
  /** Makes the channel between tabs (default: BroadcastChannel; none where the browser has none). */
  readonly broadcast?: (name: string) => BroadcastChannelLike | undefined;
}

export function browserEventStore(o: BrowserEventStoreOptions): EventStore {
  const g = globalThis as { BroadcastChannel?: new (name: string) => BroadcastChannelLike };
  const make =
    o.broadcast ?? ((name: string): BroadcastChannelLike | undefined => (g.BroadcastChannel ? new g.BroadcastChannel(name) : undefined));
  let bc: BroadcastChannelLike | undefined | null = null;
  const listenersOfTabs = new Set<(m: unknown) => void>();
  const open = (): BroadcastChannelLike | undefined => {
    if (bc !== null) return bc;
    try {
      bc = make(LEARNING_CHANNEL);
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
  return documentEventStore({ docs: o.storage.docs, onFull: l => o.storage.onFull(l), channel, outbox: o.outbox });
}
