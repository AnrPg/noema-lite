/**
 * Runs the "one device at a time" statechart (src/features/sync/domain/lease.ts) against the cloud: the lease is the kv
 * row a:inuse, read and written by compare-and-swap (Remote rows), so two tabs or devices can never both believe they
 * hold it. It hears the page (Lifecycle: shown, hidden, touched, left) and tells the app what is settled.
 */
import type { NoemaError } from '../../../kernel/errors.ts';
import { createActor, type Actor, type Scheduler } from '../../../kernel/statechart.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { DeviceDescription, Lifecycle } from '../../../ports/lifecycle.ts';
import type { Remote } from '../../../ports/remote.ts';
import {
  LEASE_KEY,
  leaseMachine,
  parseLease,
  type LeaseContext,
  type LeaseEffect,
  type LeaseEvent,
  type LeaseHolder,
  type LeaseState,
  type LeaseStatus,
  type LeaseValue,
} from '../domain/lease.ts';

export interface LeaseService {
  status(): LeaseStatus;
  /** Who holds it while the status is 'other'. */
  holder(): LeaseHolder | null;
  /** This device and tab, as its lease row names them. */
  readonly me: { readonly dev: string; readonly sid: string } & DeviceDescription;
  start(): void;
  stop(): void;
  /** Looks at the lease and takes it when nobody else is using the account right now; take: anyway ("Use here"). */
  check(take: boolean): Promise<LeaseStatus>;
  /** Lets it go (the page is hidden or closed). */
  release(): void;
  onChange(listener: (status: LeaseStatus, holder: LeaseHolder | null) => void): Unsubscribe;
  /** This tab took the account from another tab or device: what that one did must be brought in. */
  onTakeover(listener: () => void): Unsubscribe;
}

export interface LeaseServiceDeps<H> {
  readonly remote: Remote;
  readonly lifecycle: Lifecycle;
  readonly scheduler: Scheduler<H>;
  readonly errors: ErrorReporter;
  readonly deviceId: string;
}

export function createLeaseService<H>(d: LeaseServiceDeps<H>): LeaseService {
  const desc = d.lifecycle.device();
  const me = Object.freeze({ dev: d.deviceId, sid: d.lifecycle.tabId(), ...desc });
  const changes = new Set<(s: LeaseStatus, h: LeaseHolder | null) => void>(),
    takeovers = new Set<() => void>();
  let waiting: Array<(s: LeaseStatus) => void> = [];
  let offPage: Unsubscribe[] = [];
  let current: { status: LeaseStatus; holder: LeaseHolder | null } = { status: 'unknown', holder: null };

  const row = (extra: Partial<LeaseValue> = {}): string =>
    JSON.stringify({ sid: me.sid, dev: me.dev, os: me.os, br: me.browser, at: d.scheduler.now(), ...extra } satisfies LeaseValue);
  const failed = (e: NoemaError, send: (ev: LeaseEvent) => void): void => {
    d.errors.report(e, { where: 'sync.lease', severity: 'info' }); // offline: this device keeps working, the changes are combined later
    send({ type: 'FAILED', error: e });
  };

  const run = (f: LeaseEffect, send: (e: LeaseEvent) => void): void => {
    switch (f.type) {
      case 'read':
        void d.remote.rows.get('kv', LEASE_KEY).then(r => {
          if (!r.ok) {
            failed(r.error, send);
            return;
          }
          const value = parseLease(r.value?.value ?? null),
            mine = value?.sid === me.sid;
          const holder: LeaseHolder | null =
            value && !mine ? { os: value.os, br: value.br, sameDevice: value.dev === me.dev, at: value.at } : null;
          send({ type: 'READ', value, version: r.value?.version ?? null, mine, holder });
        });
        return;
      case 'write':
        void d.remote.rows.put('kv', LEASE_KEY, row(), { expected: f.expected }).then(r => {
          if (r.ok) send({ type: 'WRITTEN', version: r.value.version });
          else if (r.error.code === 'remote.conflict') send({ type: 'RACE' });
          else failed(r.error, send);
        });
        return;
      case 'release':
        void d.remote.rows.put('kv', LEASE_KEY, row({ released: true }), { expected: f.expected, keepalive: true }).then(r => {
          // refused: someone else wrote it since (then it is theirs anyway); offline: it goes stale in two minutes
          if (!r.ok && r.error.code !== 'remote.conflict') d.errors.report(r.error, { where: 'sync.lease.release', severity: 'info' });
        });
        return;
      case 'settled': {
        current = { status: f.status, holder: f.holder };
        const w = waiting;
        waiting = [];
        for (const res of w) res(f.status);
        for (const l of [...changes]) l(f.status, f.holder);
        return;
      }
      case 'broughtIn':
        for (const l of [...takeovers]) l();
        return;
    }
  };

  let actor: Actor<LeaseState, LeaseContext, LeaseEvent, LeaseEffect> | null = null;
  const make = (): Actor<LeaseState, LeaseContext, LeaseEvent, LeaseEffect> =>
    createActor(leaseMachine, {
      scheduler: d.scheduler,
      run,
      onError: e => d.errors.report(e, { where: 'sync.lease.effect', severity: 'error' }),
    });

  return {
    me,
    status: () => current.status,
    holder: () => current.holder,
    start() {
      if (actor) return;
      const a = (actor = make());
      offPage = [
        d.lifecycle.onVisibility(v => {
          a.send({ type: 'VISIBLE', visible: v });
        }),
        d.lifecycle.onInput(() => {
          a.send({ type: 'TOUCH' });
        }),
        d.lifecycle.onLeave(() => {
          a.send({ type: 'RELEASE' });
        }),
      ];
      a.send({ type: 'START', visible: d.lifecycle.visible() });
    },
    stop() {
      for (const off of offPage) off();
      offPage = [];
      actor?.send({ type: 'STOP' });
      actor?.stop();
      actor = null;
      const w = waiting;
      waiting = [];
      for (const res of w) res('unknown');
    },
    check(take) {
      const a = actor;
      if (!a) return Promise.resolve(current.status);
      return new Promise(res => {
        waiting.push(res);
        a.send({ type: 'CHECK', take });
      });
    },
    release() {
      actor?.send({ type: 'RELEASE' });
    },
    onChange(l) {
      changes.add(l);
      return () => {
        changes.delete(l);
      };
    },
    onTakeover(l) {
      takeovers.add(l);
      return () => {
        takeovers.delete(l);
      };
    },
  };
}
