/**
 * The outbox (docs/SYNC.md §Outbox): the learning events of a cloud account that this device made and the cloud has not
 * confirmed yet. Local-first: an event is written on the device first, and it enters the outbox in the SAME transaction
 * (enqueueIn, called by the event store's append), so an event is never kept without being queued, nor queued without
 * being kept. The loop sends the outbox oldest first; an event leaves it only after the cloud took it, and a second send
 * of an event the cloud has already is ignored there (unique id), so a lost answer or a crash never loses or doubles one.
 *
 * The outbox lives in the document store's collection `sync` (IndexedDB): `outbox|<account>|<hlc>|<id>` → the event, in
 * time order. Events of a local profile (not a cloud account) are never queued.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, OK_VOID, ok, type AsyncResult } from '../../../kernel/result.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { DocumentStore, DocumentTransaction } from '../../../ports/storage.ts';
import type { SyncEvent } from './ports.ts';

/** The document collection of the sync feature (the outbox, the registers, the cursors). */
export const SYNC_COLLECTION = 'sync';
/** A cloud account's id ("u_" + the cloud user's id): only these are synced. */
export const isCloudAccount = (account: string): boolean => /^u_[A-Za-z0-9-]+$/.test(account);
const prefixOf = (account: string): string => `outbox|${account}|`;
export const outboxKey = (account: string, e: SyncEvent): string => `${prefixOf(account)}${e.hlc}|${e.id}`;

export interface Outbox {
  /** Inside the transaction that appends local events (its collections include SYNC_COLLECTION): queues them. */
  enqueueIn(tx: DocumentTransaction, account: string, events: readonly SyncEvent[]): Promise<void>;
  /** After that transaction committed: tells the loop something waits. */
  notify(account: string): void;
  /** Queues events in a transaction of its own (and notifies). */
  enqueue(account: string, events: readonly SyncEvent[]): AsyncResult<void>;
  /** The oldest queued events of an account: [their outbox keys, the events]. */
  peek(account: string, limit: number): AsyncResult<ReadonlyArray<readonly [string, SyncEvent]>>;
  /** Takes events out once the cloud has them. */
  remove(keys: readonly string[]): AsyncResult<void>;
  count(account: string): AsyncResult<number>;
  onEnqueue(listener: (account: string) => void): Unsubscribe;
}

export function createOutbox(docs: DocumentStore): Outbox {
  const listeners = new Set<(account: string) => void>();
  const notify = (account: string): void => {
    for (const l of [...listeners]) l(account);
  };
  const enqueueIn = async (tx: DocumentTransaction, account: string, events: readonly SyncEvent[]): Promise<void> => {
    if (!isCloudAccount(account)) return;
    for (const e of events) await tx.put(SYNC_COLLECTION, outboxKey(account, e), e);
  };
  return {
    enqueueIn,
    notify(account) {
      if (isCloudAccount(account)) notify(account);
    },
    async enqueue(account, events) {
      if (!isCloudAccount(account) || !events.length) return OK_VOID;
      const r = await docs.transaction([SYNC_COLLECTION], 'readwrite', tx => enqueueIn(tx, account, events));
      if (!r.ok) return r;
      notify(account);
      return OK_VOID;
    },
    async peek(account, limit) {
      const r = await docs.list<SyncEvent>(SYNC_COLLECTION, { prefix: prefixOf(account), limit });
      return r.ok ? ok(r.value) : r;
    },
    async remove(keys) {
      if (!keys.length) return OK_VOID;
      const r = await docs.transaction([SYNC_COLLECTION], 'readwrite', async tx => {
        for (const k of keys) {
          if (!k.startsWith('outbox|')) throw new NoemaError('invariant.failed', 'invariant failed: not an outbox key ' + k);
          await tx.delete(SYNC_COLLECTION, k);
        }
      });
      return r.ok ? OK_VOID : err(r.error);
    },
    async count(account) {
      const r = await docs.list(SYNC_COLLECTION, { prefix: prefixOf(account) });
      return r.ok ? ok(r.value.length) : r;
    },
    onEnqueue(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
