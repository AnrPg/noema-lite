/**
 * The sync loop as a statechart (docs/SYNC.md §The loop). Local-first: everything is written on this device first; the
 * loop brings in what other devices did (pull) and sends what waits here (push: the outbox of events, the settings, the
 * key/value rows), and it is never stuck between the two:
 *
 *   stopped ──START──▶ pulling ──PULLED──▶ pushing ──PUSHED──▶ idle ──CHANGED──▶ waiting ──(3 s, at most 10 s)──▶ pushing
 *                         │                  │                   │  ▲                      (a steady stream of changes
 *                         └──FAILED──────────┴──▶ offline (no network: until on line, or a minute)        cannot starve it)
 *                                               backoff (retryable: 2 s · 2ⁿ up to 5 min)
 *                                               failed  (needs the learner or an update: 10 min, or when woken)
 *   idle pulls again every 5 minutes (the Claude connector writes too) and when woken (the page is shown again, the
 *   device is back on line, the learner asks); PAUSE (the account is in use on another device) holds everything in
 *   `paused` until RESUME; LEAVE (the page is hidden or closed) sends what waits at once (keepalive), in every state.
 */
import type { NoemaError } from '../../../kernel/errors.ts';
import type { MachineDef } from '../../../kernel/statechart.ts';

export type SyncState = 'stopped' | 'pulling' | 'pushing' | 'idle' | 'waiting' | 'backoff' | 'offline' | 'failed' | 'paused';
/** Why a pull runs: at start, the loop's own, woken, after taking the account over from another device, asked for. */
export type PullReason = 'start' | 'loop' | 'wake' | 'takeover' | 'manual';

export type SyncEvent =
  | { readonly type: 'START' }
  | { readonly type: 'STOP' }
  | { readonly type: 'CHANGED' }
  | { readonly type: 'WAKE'; readonly reason: PullReason }
  | { readonly type: 'LEAVE' }
  | { readonly type: 'PULLED' }
  | { readonly type: 'PUSHED'; readonly sent: number; readonly remaining: number }
  | { readonly type: 'FAILED'; readonly error: NoemaError }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' };

export type SyncEffect =
  | { readonly type: 'pull'; readonly reason: PullReason }
  | { readonly type: 'push' }
  /** Send what waits now, with requests that outlive the page. */
  | { readonly type: 'flush' };

export interface SyncContext {
  readonly reason: PullReason;
  /** Failed rounds in a row (the backoff grows with it). */
  readonly attempt: number;
  /** When the first change of the current wait was made (the wait never grows past MAX_WAIT_MS from it). */
  readonly firstPendingAt: number | null;
  readonly error: NoemaError | null;
  readonly lastSync: number | null;
}

export const DEBOUNCE_MS = 3_000;
export const MAX_WAIT_MS = 10_000;
export const POLL_MS = 5 * 60_000;
export const OFFLINE_RETRY_MS = 60_000;
export const FAILED_RETRY_MS = 10 * 60_000;
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** What a failure means for the loop: no network, try again soon, or wait for the learner (permissions, an old schema). */
export function failureKind(e: NoemaError): 'offline' | 'retry' | 'fatal' {
  if (e.code === 'cloud.network' || e.code === 'auth.network') return 'offline';
  if (e.retryable || e.code === 'cloud.server' || e.code === 'cloud.rate_limit' || e.code === 'cloud.keeps_changing') return 'retry';
  return 'fatal';
}

export const backoffMs = (attempt: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));

const wake = { target: 'pulling', assign: (c: SyncContext, e: { readonly reason: PullReason }) => ({ ...c, reason: e.reason }) } as const;
const failure = [
  {
    guard: (_: SyncContext, e: { readonly error: NoemaError }) => failureKind(e.error) === 'offline',
    target: 'offline',
    assign: (c: SyncContext, e: { readonly error: NoemaError }) => ({ ...c, error: e.error }),
  },
  {
    guard: (_: SyncContext, e: { readonly error: NoemaError }) => failureKind(e.error) === 'retry',
    target: 'backoff',
    assign: (c: SyncContext, e: { readonly error: NoemaError }) => ({ ...c, error: e.error, attempt: c.attempt + 1 }),
  },
  { target: 'failed', assign: (c: SyncContext, e: { readonly error: NoemaError }) => ({ ...c, error: e.error }) },
] as const;

export const syncMachine: MachineDef<SyncState, SyncContext, SyncEvent, SyncEffect> = {
  id: 'sync',
  initial: 'stopped',
  context: { reason: 'start', attempt: 0, firstPendingAt: null, error: null, lastSync: null },
  states: {
    stopped: {
      on: {
        START: { target: 'pulling', assign: c => ({ ...c, reason: 'start', attempt: 0, error: null, firstPendingAt: null }) },
        LEAVE: {}, // nothing runs: nothing to send
        PAUSE: {},
      },
    },
    pulling: {
      entry: c => [{ type: 'pull', reason: c.reason }],
      on: {
        PULLED: { target: 'pushing', assign: c => ({ ...c, error: null }) },
        FAILED: failure,
      },
    },
    pushing: {
      entry: [{ type: 'push' }],
      on: {
        PUSHED: [
          // more waits and the last round moved some: on at once (a big outbox goes in batches)
          { guard: (_, e) => e.remaining > 0 && e.sent > 0, target: 'pushing' },
          // more waits but nothing moved (it was refused, or came in during the round): after the usual wait
          {
            guard: (_, e) => e.remaining > 0,
            target: 'waiting',
            assign: (c, _e, m) => ({ ...c, attempt: 0, error: null, lastSync: m.now, firstPendingAt: m.now }),
          },
          { target: 'idle', assign: (c, _e, m) => ({ ...c, attempt: 0, error: null, lastSync: m.now, firstPendingAt: null }) },
        ],
        FAILED: failure,
      },
    },
    idle: {
      after: [{ delay: POLL_MS, then: { target: 'pulling', assign: c => ({ ...c, reason: 'loop' }) } }],
      on: {
        CHANGED: { target: 'waiting', assign: (c, _e, m) => ({ ...c, firstPendingAt: m.now }) },
        WAKE: wake,
      },
    },
    waiting: {
      after: [
        {
          delay: (c, m) => Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (m.now - (c.firstPendingAt ?? m.now)))),
          then: { target: 'pushing', assign: c => ({ ...c, firstPendingAt: null }) },
        },
      ],
      on: {
        CHANGED: { target: 'waiting' }, // the wait starts again, never past MAX_WAIT_MS from the first change
        WAKE: wake,
      },
    },
    backoff: {
      after: [{ delay: c => backoffMs(c.attempt), then: { target: 'pulling', assign: c => ({ ...c, reason: 'loop' }) } }],
      on: { WAKE: wake },
    },
    offline: {
      after: [{ delay: OFFLINE_RETRY_MS, then: { target: 'pulling', assign: c => ({ ...c, reason: 'loop' }) } }],
      on: { WAKE: wake },
    },
    failed: {
      after: [{ delay: FAILED_RETRY_MS, then: { target: 'pulling', assign: c => ({ ...c, reason: 'loop' }) } }],
      on: { WAKE: wake },
    },
    paused: {
      on: {
        RESUME: { target: 'pulling', assign: c => ({ ...c, reason: 'takeover', attempt: 0, error: null }) },
        PAUSE: {},
      },
    },
  },
  on: {
    STOP: { target: 'stopped', assign: c => ({ ...c, error: null, firstPendingAt: null }) },
    PAUSE: { target: 'paused', assign: c => ({ ...c, error: null }) },
    LEAVE: { effects: [{ type: 'flush' }] },
    CHANGED: {}, // a round is running or the loop waits anyway: the change is counted in what remains
    WAKE: {},
  },
};

/** The learner's view of a state: syncing now, or the error that holds it. */
export const isSyncing = (s: SyncState): boolean => s === 'pulling' || s === 'pushing';
export const isHeldByError = (s: SyncState): boolean => s === 'offline' || s === 'backoff' || s === 'failed';
