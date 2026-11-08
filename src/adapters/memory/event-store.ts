/**
 * The in-memory EventStore (tests, Node tools): the same store as the browser's over the memory document store, with an
 * optional quota (documents) and an optional channel shared with other memory stores (tabs, src/adapters/local).
 */
import type { EventStore } from '../../ports/event-store.ts';
import { documentEventStore, EVENT_COLLECTIONS, type TabChannel } from '../local/event-store.ts';
import { memoryStorage } from './storage.ts';

export interface MemoryEventStoreOptions {
  /** Documents (events, ids, snapshot, meta) the store may hold. */
  readonly quota?: number;
  readonly channel?: TabChannel;
}

export function memoryEventStore(o: MemoryEventStoreOptions = {}): EventStore {
  const s = memoryStorage({ collections: EVENT_COLLECTIONS, ...(o.quota !== undefined ? { docsQuota: o.quota } : {}) });
  return documentEventStore({ docs: s.docs, onFull: l => s.onFull(l), channel: o.channel });
}
