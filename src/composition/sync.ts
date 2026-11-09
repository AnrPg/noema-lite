/**
 * The sync feature in the browser root (docs/SYNC.md): its tokens, its registration and its name on the phase bridge,
 * NoemaCore.sync.
 *
 * Seams other features fill (each registers its token; until one is registered, the sync goes on without it):
 *   SYNC_EVENT_LOG   the learning log (src/features/study): the events channel runs when it is there, and the log's append
 *                    puts each local event into the outbox (OUTBOX.enqueueIn) in its own transaction, then OUTBOX.notify.
 *   LEGACY_PROGRESS  the log's one-time migration of the cloud's old progress rows; without it such a row is kept on the
 *                    device when the device has none (where the migration finds it at its first start).
 *
 * NoemaCore.sync (surface version 1; every method that fails rejects with a NoemaError, as the old code expects):
 *   start(account) · stop() · ready() → Promise · changed()
 *   now() → Promise<number> · pull() → Promise<number> · push({ keepalive }) → Promise<number>
 *   status() → { signedIn, state, syncing, lastSync, error, errorInfo, pending, lease } · onStatus(fn) → unsubscribe
 *   onRemote(fn(account, keys)) → unsubscribe       the device keys a pull changed (engine/cloud.js: the noema:remote event)
 *   channel({ name, pending(acc), pull(acc, { reason }), push(acc, { keepalive }), beforeLeave(acc) }) → unsubscribe
 *                                                   the key/value channel of engine/cloud.js (promises or plain values)
 *   settings.changed(acc) · settings.importLegacy(acc, text, version) → Promise<string[]>
 *   legacyProgress(acc, key, text) → Promise
 *   lease.state · lease.holder · lease.device · lease.check({ take }) → Promise<'mine'|'other'|'unknown'> · lease.release()
 *   lease.onChange(fn(state, holder)) → unsubscribe
 */
import { NoemaError } from '../kernel/errors.ts';
import { fromPromise, OK_VOID, type AsyncResult } from '../kernel/result.ts';
import type { Unsubscribe } from '../ports/common.ts';
import type { Storage } from '../ports/storage.ts';
import type { PullReason } from '../features/sync/domain/sync-machine.ts';
import type { LeaseHolder, LeaseStatus } from '../features/sync/domain/lease.ts';
import { deviceClock, type DeviceClock } from '../features/sync/application/device.ts';
import { eventsChannel } from '../features/sync/application/events-channel.ts';
import { createLeaseService } from '../features/sync/application/lease-service.ts';
import { createOutbox, type Outbox } from '../features/sync/application/outbox.ts';
import type { LegacyProgress, SyncChannel, SyncEventLog } from '../features/sync/application/ports.ts';
import { settingsChannel, type SettingsChannel } from '../features/sync/application/settings-channel.ts';
import { createSyncService, type SyncService, type SyncStatus } from '../features/sync/application/sync-service.ts';
import type { BridgeExtension } from './bridge.ts';
import { token, type Registration, type Resolver } from './container.ts';
import { CLOCK, CLOUD, ERRORS, LIFECYCLE, STORAGE } from './tokens.ts';

export const DEVICE_CLOCK = token<DeviceClock>('sync.device', "this device's id and hybrid logical clock");
export const OUTBOX = token<Outbox>('sync.outbox', 'the learning events that wait to be sent');
export const SYNC_EVENT_LOG = token<SyncEventLog>('sync.eventLog', 'the learning log the events of other devices go into');
export const LEGACY_PROGRESS = token<LegacyProgress>(
  'sync.legacyProgress',
  "the migration of the cloud's progress rows from before the log",
);
export const SETTINGS_SYNC = token<SettingsChannel | null>(
  'sync.settings',
  'the settings as last-writer-wins registers (null without a cloud)',
);
export const SYNC = token<SyncService | null>('sync.service', 'the sync loop and the lease (null without a cloud)');

/** A random id for this device (letters and digits). */
export const randomId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
};

/** Without the log's migration: a cloud progress row the device lacks is kept on the device (where the migration reads it). */
export function keepIfAbsent(storage: Storage): LegacyProgress {
  return {
    accept(account, key, value) {
      const full = `noema1:${account}:${key}`;
      const have = storage.kv.get(full);
      if (!have.ok) return Promise.resolve(have);
      if (have.value !== null) return Promise.resolve(OK_VOID);
      return Promise.resolve(storage.kv.set(full, value));
    },
  };
}

/**
 * When this device changed a record that the cloud does not have yet (engine/loader.js keeps the time of every change in
 * meta:mtime; the old key/value sync marked the ones it had not sent in meta:unsynced). Only such a change counts: a record
 * that was sent, or that this device made itself (its defaults at sign-in), starts as old as possible, so the choices the
 * other devices made win over it.
 */
export const unsentChangeAt =
  (storage: Storage) =>
  (account: string, name: string): number | null => {
    const read = (m: string): Record<string, unknown> | null => {
      const t = storage.kv.get(`noema1:${account}:meta:${m}`);
      if (!t.ok || !t.value) return null;
      try {
        const v: unknown = JSON.parse(t.value);
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
      } catch {
        // a meta map that is not JSON: no time known, the registers start as old as possible (they never win over newer ones)
        return null;
      }
    };
    if (!read('unsynced')?.['a:' + name]) return null;
    const v = read('mtime')?.['a:' + name];
    return typeof v === 'number' ? v : null;
  };

export const registerSync: Registration = c => {
  c.register(DEVICE_CLOCK, r => {
    const clock = r.get(CLOCK);
    return deviceClock(r.get(STORAGE).kv, () => clock.now(), randomId);
  });
  c.register(OUTBOX, r => createOutbox(r.get(STORAGE).docs));
  c.register(SETTINGS_SYNC, r => {
    const cloud = r.get(CLOUD);
    if (!cloud) return null;
    const storage = r.get(STORAGE);
    return settingsChannel({
      storage,
      remote: cloud.remote,
      device: r.get(DEVICE_CLOCK),
      errors: r.get(ERRORS),
      changedAt: unsentChangeAt(storage),
    });
  });
  c.register(SYNC, r => {
    const cloud = r.get(CLOUD);
    if (!cloud) return null;
    const clock = r.get(CLOCK),
      errors = r.get(ERRORS),
      lifecycle = r.get(LIFECYCLE),
      storage = r.get(STORAGE),
      device = r.get(DEVICE_CLOCK),
      outbox = r.get(OUTBOX);
    const channels: SyncChannel[] = [];
    const settings = r.get(SETTINGS_SYNC);
    if (settings) channels.push(settings);
    if (r.has(SYNC_EVENT_LOG))
      channels.push(eventsChannel({ remote: cloud.remote, docs: storage.docs, outbox, log: r.get(SYNC_EVENT_LOG), device, errors }));
    const lease = createLeaseService({ remote: cloud.remote, lifecycle, scheduler: clock, errors, deviceId: device.id });
    const service = createSyncService({ scheduler: clock, lifecycle, errors, lease, channels });
    outbox.onEnqueue(account => {
      if (account === service.account) service.changed();
    });
    return service;
  });
};

/* ---------- the phase bridge: NoemaCore.sync ---------- */

interface OldChannel {
  readonly name?: unknown;
  pending(account: string): number | Promise<number>;
  pull(account: string, options: { reason: PullReason }): readonly string[] | Promise<readonly string[]>;
  push(account: string, options: { keepalive: boolean }): number | Promise<number>;
  beforeLeave?(account: string): void;
}

const failure = (e: unknown): NoemaError => NoemaError.from(e, 'cloud.unknown');
const lift = <T>(f: () => T | Promise<T>): AsyncResult<T> => fromPromise(Promise.resolve().then(f), failure);
const value = async <T>(r: AsyncResult<T>): Promise<T> => {
  const x = await r;
  if (x.ok) return x.value;
  throw x.error;
};

export interface SyncStatusBridge extends Omit<SyncStatus, 'error'> {
  /** The words of the error (in the UI language) — the code and params are in errorInfo. */
  readonly error: NoemaError | null;
  readonly errorInfo: { readonly code: string; readonly params: Readonly<Record<string, unknown>>; readonly message: string } | null;
}

export const syncBridge: BridgeExtension = {
  name: 'sync',
  build(r: Resolver) {
    let made: { service: SyncService | null; settings: SettingsChannel | null; legacy: LegacyProgress } | null = null;
    /** Made on first use: loading the page opens no database and asks the cloud nothing. */
    const get = (): { service: SyncService | null; settings: SettingsChannel | null; legacy: LegacyProgress } =>
      (made ??= {
        service: r.get(SYNC),
        settings: r.get(SETTINGS_SYNC),
        legacy: r.has(LEGACY_PROGRESS) ? r.get(LEGACY_PROGRESS) : keepIfAbsent(r.get(STORAGE)),
      });
    const svc = (): SyncService => {
      const s = get().service;
      if (!s) throw new NoemaError('auth.not_signed_in', 'Not signed in: no cloud is set up');
      return s;
    };
    const idle: SyncStatusBridge = {
      signedIn: false,
      state: 'stopped',
      syncing: false,
      lastSync: null,
      error: null,
      errorInfo: null,
      pending: 0,
      lease: 'unknown',
    };
    const statusOf = (s: SyncStatus): SyncStatusBridge => ({
      ...s,
      errorInfo: s.error ? { code: s.error.code, params: s.error.params, message: s.error.message } : null,
    });
    const none: Unsubscribe = () => undefined;
    return Object.freeze({
      start: (account: string) => {
        svc().start(account);
      },
      stop: () => get().service?.stop(),
      ready: () => get().service?.ready() ?? Promise.resolve(),
      changed: () => get().service?.changed(),
      now: () => value(svc().now()),
      pull: () => value(svc().pull('manual')),
      push: (o: { keepalive?: boolean } = {}) => value(svc().push({ keepalive: !!o.keepalive })),
      status: () => {
        const s = get().service;
        return s ? statusOf(s.status()) : idle;
      },
      onStatus: (f: (s: SyncStatusBridge) => void) =>
        get().service?.onStatus(s => {
          f(statusOf(s));
        }) ?? none,
      onRemote: (f: (account: string, keys: readonly string[]) => void) => get().service?.onRemote(f) ?? none,
      channel(old: OldChannel): Unsubscribe {
        const s = get().service;
        if (!s) return none;
        const name = typeof old.name === 'string' ? old.name : 'kv';
        const ch: SyncChannel = {
          name,
          pending: account => lift(() => old.pending(account)),
          pull: (account, o) => lift(() => old.pull(account, { reason: o.reason })),
          push: (account, o) => lift(() => old.push(account, { keepalive: o.keepalive })),
          ...(old.beforeLeave ? { beforeLeave: (account: string) => old.beforeLeave?.(account) } : {}),
        };
        return s.addChannel(ch);
      },
      settings: Object.freeze({
        changed(account: string) {
          const ch = get().settings;
          if (!ch) return;
          void ch.noteLocal(account).then(x => {
            if (!x.ok) r.get(ERRORS).report(x.error, { where: 'sync.settings.note', severity: 'warning' });
            else if (x.value) get().service?.changed();
          });
        },
        importLegacy: async (account: string, text: string, version: string): Promise<readonly string[]> => {
          const ch = get().settings;
          if (!ch) return [];
          const keys = await value(ch.importLegacy(account, 'settings', text, version));
          get().service?.changed();
          return keys;
        },
      }),
      legacyProgress: (account: string, key: string, text: string) => value(get().legacy.accept(account, key, text)),
      lease: Object.freeze({
        get state(): LeaseStatus {
          return get().service?.lease.status() ?? 'unknown';
        },
        get holder(): LeaseHolder | null {
          return get().service?.lease.holder() ?? null;
        },
        get device() {
          return get().service?.lease.me ?? null;
        },
        check: (o: { take?: boolean } = {}) => get().service?.lease.check(!!o.take) ?? Promise.resolve<LeaseStatus>('unknown'),
        release: () => get().service?.lease.release(),
        onChange: (f: (state: LeaseStatus, holder: LeaseHolder | null) => void) => get().service?.lease.onChange(f) ?? none,
      }),
    });
  },
};
