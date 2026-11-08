/**
 * The sync service (docs/SYNC.md): runs the sync loop's statechart (src/features/sync/domain/sync-machine.ts) over the
 * channels (events, settings, and the key/value channel of engine/cloud.js), with the "one device at a time" lease
 * beside it. One pull or push runs at a time (the loop's own rounds and the ones asked for: 🔄 Sync now, tests); a page
 * being left sends at once, without waiting for a round that runs.
 *
 *  • A change made here (`changed()`: the outbox, the settings, a key) wakes the loop's wait (3 s, at most 10 s).
 *  • The page shown again or the device back on line wakes it (a pull, then a push).
 *  • The lease held elsewhere pauses it; taking the account over pulls everything at once and tells the open page.
 *  • `onRemote` hears the device keys a pull changed (the old UI folds them into what it holds in memory).
 */
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, type AsyncResult, type Result } from '../../../kernel/result.ts';
import { createActor, type Actor, type Scheduler } from '../../../kernel/statechart.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { Lifecycle } from '../../../ports/lifecycle.ts';
import type { LeaseStatus } from '../domain/lease.ts';
import {
  failureKind,
  isHeldByError,
  isSyncing,
  syncMachine,
  type PullReason,
  type SyncContext,
  type SyncEffect,
  type SyncEvent as LoopEvent,
  type SyncState,
} from '../domain/sync-machine.ts';
import type { LeaseService } from './lease-service.ts';
import type { SyncChannel } from './ports.ts';

export interface SyncStatus {
  /** A cloud account is being synced on this page. */
  readonly signedIn: boolean;
  readonly state: SyncState;
  readonly syncing: boolean;
  /** When the last round ended well (epoch ms). */
  readonly lastSync: number | null;
  /** What holds the loop (no network, the server, an old schema…), when something does. */
  readonly error: NoemaError | null;
  /** Changes that wait to be sent (all channels). */
  readonly pending: number;
  readonly lease: LeaseStatus;
}

export interface SyncService {
  readonly lease: LeaseService;
  /** Starts the loop and the lease for a signed-in cloud account (again for another account: the first one stops). */
  start(account: string): void;
  stop(): void;
  readonly account: string | null;
  /** Resolves once the first pull of this start has ended (well or not; at once when it is not started). */
  ready(): Promise<void>;
  /** Something waits to be sent. */
  changed(): void;
  /** Pull, then push, now (🔄 Sync now) → how many device keys the pull changed. */
  now(): AsyncResult<number>;
  pull(reason?: PullReason): AsyncResult<number>;
  push(options?: { readonly keepalive?: boolean }): AsyncResult<number>;
  status(): SyncStatus;
  onStatus(listener: (s: SyncStatus) => void): Unsubscribe;
  /** The device keys a pull changed (full storage keys). */
  onRemote(listener: (account: string, keys: readonly string[]) => void): Unsubscribe;
  /** Adds a channel (pulled and pushed after the ones there already). */
  addChannel(channel: SyncChannel): Unsubscribe;
}

export interface SyncServiceDeps<H> {
  readonly scheduler: Scheduler<H>;
  readonly lifecycle: Lifecycle;
  readonly errors: ErrorReporter;
  readonly lease: LeaseService;
  readonly channels: readonly SyncChannel[];
}

export function createSyncService<H>(d: SyncServiceDeps<H>): SyncService {
  const channels: SyncChannel[] = [...d.channels];
  const statusListeners = new Set<(s: SyncStatus) => void>(),
    remoteListeners = new Set<(a: string, k: readonly string[]) => void>();
  let account: string | null = null,
    pending = 0,
    running = 0,
    actor: Actor<SyncState, SyncContext, LoopEvent, SyncEffect> | null = null,
    offPage: Unsubscribe[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  /** The first pull of a start: ready() waits for it (also when the lease pauses the loop meanwhile). */
  let firstPull: { done: boolean; readonly wait: Promise<void>; readonly resolve: () => void } | null = null;
  const newFirstPull = (): typeof firstPull => {
    let resolve = (): void => undefined;
    const wait = new Promise<void>(r => (resolve = r));
    const f = {
      done: false,
      wait,
      resolve: () => {
        f.done = true;
        resolve();
      },
    };
    return f;
  };
  const pulledOnce = (): void => {
    if (firstPull && !firstPull.done) firstPull.resolve();
  };
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const run = chain.then(f, f);
    chain = run.catch(() => undefined); // its caller has the Result; the next round runs anyway
    return run;
  };

  const status = (): SyncStatus => {
    const snap = actor?.snapshot;
    const state = snap?.state ?? 'stopped';
    return {
      signedIn: account !== null,
      state,
      syncing: running > 0 || isSyncing(state),
      lastSync: snap?.context.lastSync ?? null,
      error: snap && isHeldByError(state) ? snap.context.error : null,
      pending,
      lease: d.lease.status(),
    };
  };
  const emit = (): void => {
    const s = status();
    for (const l of [...statusListeners]) {
      try {
        l(s);
      } catch (e) {
        d.errors.report(e, { where: 'sync.status.listener', severity: 'error' });
      }
    }
  };
  const refreshPending = async (): Promise<void> => {
    const acc = account;
    if (!acc) return;
    let n = 0;
    for (const ch of channels) {
      const r = await ch.pending(acc);
      if (r.ok) n += r.value;
      else d.errors.report(r.error, { where: `sync.${ch.name}.pending`, severity: 'warning' });
    }
    if (acc === account && n !== pending) {
      pending = n;
      emit();
    }
  };

  const tracked = async <T>(f: () => Promise<T>): Promise<T> => {
    running++;
    emit();
    try {
      return await f();
    } finally {
      running--;
      emit();
    }
  };

  async function pullAll(acc: string, reason: PullReason): AsyncResult<number> {
    let first: NoemaError | null = null;
    const keys = new Set<string>();
    for (const ch of [...channels]) {
      const r = await ch.pull(acc, { reason });
      if (r.ok) for (const k of r.value) keys.add(k);
      else {
        first ??= r.error;
        d.errors.report(r.error, { where: `sync.${ch.name}.pull`, severity: failureKind(r.error) === 'fatal' ? 'warning' : 'info' });
      }
    }
    if (keys.size && acc === account) for (const l of [...remoteListeners]) l(acc, [...keys]);
    return first ? err(first) : ok(keys.size);
  }
  async function pushAll(acc: string, keepalive: boolean): AsyncResult<{ sent: number; remaining: number }> {
    let first: NoemaError | null = null,
      sent = 0,
      remaining = 0;
    for (const ch of [...channels]) {
      const r = await ch.push(acc, { keepalive });
      if (r.ok) sent += r.value;
      else {
        first ??= r.error;
        d.errors.report(r.error, { where: `sync.${ch.name}.push`, severity: failureKind(r.error) === 'fatal' ? 'warning' : 'info' });
      }
      const p = await ch.pending(acc);
      if (p.ok) remaining += p.value;
    }
    if (acc === account) {
      pending = remaining;
      emit();
    }
    return first ? err(first) : ok({ sent, remaining });
  }

  const loopRun = (f: SyncEffect, send: (e: LoopEvent) => void): void => {
    const acc = account;
    if (!acc) return;
    if (f.type === 'pull')
      void tracked(() => serial(() => pullAll(acc, f.reason))).then(r => {
        pulledOnce();
        send(r.ok ? { type: 'PULLED' } : { type: 'FAILED', error: r.error });
      });
    else if (f.type === 'push')
      void tracked(() => serial(() => pushAll(acc, false))).then(r => {
        send(r.ok ? { type: 'PUSHED', ...r.value } : { type: 'FAILED', error: r.error });
      });
    else {
      for (const ch of channels)
        try {
          ch.beforeLeave?.(acc);
        } catch (e) {
          d.errors.report(e, { where: `sync.${ch.name}.leave`, severity: 'error' });
        }
      void pushAll(acc, true).then(r => {
        if (!r.ok) d.errors.report(r.error, { where: 'sync.flush', severity: 'info' }); // what did not go waits for the next page
      });
    }
  };

  const service: SyncService = {
    lease: d.lease,
    get account() {
      return account;
    },
    start(acc) {
      if (account === acc && actor) return;
      if (actor) service.stop();
      account = acc;
      firstPull = newFirstPull();
      const a = (actor = createActor(syncMachine, {
        scheduler: d.scheduler,
        run: loopRun,
        onError: e => d.errors.report(e, { where: 'sync.loop.effect', severity: 'error' }),
      }));
      a.subscribe(() => {
        emit();
      });
      offPage = [
        d.lifecycle.onVisibility(v => {
          if (v) a.send({ type: 'WAKE', reason: 'wake' });
        }),
        d.lifecycle.onOnline(() => {
          a.send({ type: 'WAKE', reason: 'wake' });
        }),
        d.lifecycle.onLeave(() => {
          a.send({ type: 'LEAVE' });
        }),
        d.lease.onChange(s => {
          a.send(s === 'other' ? { type: 'PAUSE' } : { type: 'RESUME' });
        }),
        d.lease.onTakeover(() => {
          a.send({ type: 'WAKE', reason: 'takeover' });
        }),
      ];
      d.lease.start();
      a.send({ type: 'START' });
      void refreshPending();
    },
    stop() {
      for (const off of offPage) off();
      offPage = [];
      d.lease.stop();
      actor?.send({ type: 'STOP' });
      actor?.stop();
      actor = null;
      account = null;
      pulledOnce();
      pending = 0;
      emit();
    },
    ready() {
      return !actor || !firstPull ? Promise.resolve() : firstPull.wait;
    },
    changed() {
      actor?.send({ type: 'CHANGED' });
      void refreshPending();
    },
    async now() {
      const acc = account;
      if (!acc) return err(new NoemaError('auth.not_signed_in', 'Not signed in'));
      const pulled = await tracked(() => serial(() => pullAll(acc, 'manual')));
      if (!pulled.ok) return pulled;
      const pushed = await tracked(() => serial(() => pushAll(acc, false)));
      return pushed.ok ? pulled : pushed;
    },
    async pull(reason = 'manual') {
      const acc = account;
      if (!acc) return err(new NoemaError('auth.not_signed_in', 'Not signed in'));
      return tracked(() => serial(() => pullAll(acc, reason)));
    },
    async push(o = {}) {
      const acc = account;
      if (!acc) return err(new NoemaError('auth.not_signed_in', 'Not signed in'));
      const r: Result<{ sent: number; remaining: number }> = o.keepalive
        ? await pushAll(acc, true) // the page is going away: now, without waiting for a round that runs
        : await tracked(() => serial(() => pushAll(acc, false)));
      return r.ok ? ok(r.value.sent) : r;
    },
    status,
    onStatus(l) {
      statusListeners.add(l);
      return () => {
        statusListeners.delete(l);
      };
    },
    onRemote(l) {
      remoteListeners.add(l);
      return () => {
        remoteListeners.delete(l);
      };
    },
    addChannel(ch) {
      channels.push(ch);
      void refreshPending();
      return () => {
        const i = channels.indexOf(ch);
        if (i >= 0) channels.splice(i, 1);
      };
    },
  };
  return service;
}
