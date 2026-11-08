/**
 * EventStore port: the learning log on this device (event sourcing, docs/ARCHITECTURE.md §4). Append-only and idempotent
 * by event id: appending an event whose id the log already knows — even one compaction forgot — adds nothing, so a
 * migration run twice, an inbox row read twice or another device's events arriving again never count twice.
 *
 *  • append — all or nothing; returns the events that were new (in log order).
 *  • read — an account's events in log order (stamp, then id), optionally only those stamped after a stamp.
 *  • forget — compaction: the events go, their ids stay known.
 *  • snapshot — one saved fold per account. It is dropped, in the same transaction, by any append of an event stamped
 *    at or before the event the snapshot was made up to: a snapshot never hides an event from the fold.
 *  • meta — small values of the log (the migration's markers and archive of the old values, the device's clock).
 *  • watch — events appended by another tab or window of this device.
 *  • onFull — the storage-full signal (as Storage's): a write refused because the site's storage is full.
 * Every operation returns a Result (storage.quota, storage.unavailable, storage.failed, storage.corrupt). Nothing throws.
 */
import type { Event } from '../contracts/generated/events.v1.ts';
import type { AsyncResult } from '../kernel/result.ts';
import type { Unsubscribe } from './common.ts';
import type { StorageFullEvent } from './storage.ts';

/** One event as the log keeps it (noema.events/v1 $defs/event). */
export type StoredEvent = Event;

export interface ReadOptions {
  /** Only the events stamped after this HLC stamp (its own events excluded). */
  readonly after?: string;
}

export interface Snapshot {
  /** The stamp and id of the last event the snapshot folded. */
  readonly upTo: { readonly at: string; readonly id: string };
  readonly value: unknown;
}

export interface EventStore {
  append(account: string, events: readonly StoredEvent[]): AsyncResult<StoredEvent[]>;
  read(account: string, options?: ReadOptions): AsyncResult<StoredEvent[]>;
  /** Which of these ids the log knows (kept or forgotten). */
  known(account: string, ids: readonly string[]): AsyncResult<ReadonlySet<string>>;
  /** Forgets these events (their ids stay known) → how many were there. */
  forget(account: string, ids: readonly string[]): AsyncResult<number>;
  getSnapshot(account: string): AsyncResult<Snapshot | undefined>;
  putSnapshot(account: string, snapshot: Snapshot): AsyncResult<void>;
  getMeta<T>(account: string, name: string): AsyncResult<T | undefined>;
  putMeta(account: string, name: string, value: unknown): AsyncResult<void>;
  /** Every event, id, snapshot and meta value of the account goes (the profile is removed from this device). */
  clear(account: string): AsyncResult<void>;
  watch(listener: (account: string, events: readonly StoredEvent[]) => void): Unsubscribe;
  onFull(listener: (event: StorageFullEvent) => void): Unsubscribe;
}
