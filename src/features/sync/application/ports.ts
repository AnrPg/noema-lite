/**
 * What the sync feature needs from the rest of the app (docs/SYNC.md §Seams), besides the ports of src/ports:
 *
 *  • SyncEventLog — the learning log (src/features/study, the event store): takes in the events another device made, each
 *    once by its id. Local events reach the outbox in the same transaction that appends them (Outbox.enqueueIn).
 *  • LegacyProgress — what the cloud's key/value rows of progress from before the event log (s:<subject>:state, a:stats)
 *    become on this device: the one-time migration of the log turns them into events.
 *  • SyncChannel — one kind of data the loop pulls and pushes: the events, the settings, and the key/value rows, entry
 *    tables and conversations of engine/cloud.js (registered through the bridge until phase 3 moves them here).
 */
import type { AsyncResult } from '../../../kernel/result.ts';
import type { Json } from '../../../ports/common.ts';
import type { PullReason } from '../domain/sync-machine.ts';

/** A learning event as the sync sees it: the envelope of noema.events/v1 (its body is the log's business). */
export interface SyncEvent {
  /** Unique for ever (the same event sent twice is kept once). */
  readonly id: string;
  readonly type: string;
  /** The hybrid-clock stamp of when it happened (text form, src/kernel/hlc.ts). */
  readonly hlc: string;
  /** The device that made it. */
  readonly device: string;
  readonly [field: string]: Json;
}

export interface SyncEventLog {
  /** Keeps the events another device made (each once, by id) → how many were new here. */
  receive(account: string, events: readonly SyncEvent[]): AsyncResult<number>;
}

export interface LegacyProgress {
  /** A progress row of the cloud's key/value table (`key` without the account: s:<subject>:state, a:stats) and its text. */
  accept(account: string, key: string, value: string): AsyncResult<void>;
}

export interface PullOptions {
  readonly reason: PullReason;
}
export interface PushOptions {
  /** The page is going away: small requests that outlive it, sent at once. */
  readonly keepalive: boolean;
}

export interface SyncChannel {
  readonly name: string;
  /** How many changes wait here to be sent. */
  pending(account: string): AsyncResult<number>;
  /** Brings in what changed elsewhere → the device keys (full storage keys) it changed here, for the open page. */
  pull(account: string, options: PullOptions): AsyncResult<readonly string[]>;
  /** Sends what waits → how many changes were sent. */
  push(account: string, options: PushOptions): AsyncResult<number>;
  /** Right before the page is left: write what the open page holds (it is then pushed with keepalive). */
  beforeLeave?(account: string): void;
}
