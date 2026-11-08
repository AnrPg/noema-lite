/// <reference types="node" />
/**
 * The sync feature end to end over the memory adapters: two (or three) devices of one account share a memory cloud. The
 * outbox and the events channel (nothing lost, nothing doubled, offline and back), the settings registers (per field, the
 * later write wins, secrets stay, removals travel, the cloud's old row is taken in), the lease (one device at a time,
 * "Use here", a hidden tab lets go) and the loop (a change is pushed after its wait; a takeover pulls).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualClock, type ManualClock } from '../adapters/memory/clock.ts';
import { manualLifecycle, type ManualLifecycle } from '../adapters/memory/lifecycle.ts';
import { memoryCloud, type MemoryCloud } from '../adapters/memory/remote.ts';
import { memoryStorage } from '../adapters/memory/storage.ts';
import { createErrorReporter } from '../adapters/local/error-reporter.ts';
import { catalogI18n } from '../adapters/memory/i18n.ts';
import { recordingNotifier } from '../adapters/memory/notifier.ts';
import { ok, unwrap } from '../kernel/result.ts';
import type { Remote } from '../ports/remote.ts';
import type { Storage } from '../ports/storage.ts';
import { DEBOUNCE_MS } from '../features/sync/domain/sync-machine.ts';
import { LEASE_FRESH_MS } from '../features/sync/domain/lease.ts';
import { deviceClock, type DeviceClock } from '../features/sync/application/device.ts';
import { eventsChannel } from '../features/sync/application/events-channel.ts';
import { createLeaseService } from '../features/sync/application/lease-service.ts';
import { createOutbox, type Outbox } from '../features/sync/application/outbox.ts';
import type { SyncEvent, SyncEventLog } from '../features/sync/application/ports.ts';
import { recordKey, settingsChannel, type SettingsChannel } from '../features/sync/application/settings-channel.ts';
import { createSyncService, type SyncService } from '../features/sync/application/sync-service.ts';
import { keepIfAbsent, unsentChangeAt } from './sync.ts';

const ACC = 'u_user1';
const QUIET = { debug() {}, info() {}, warn() {}, error() {} };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
};

/** The learning log of a device, in memory: events by id. */
function memoryLog(): SyncEventLog & { readonly ids: () => string[] } {
  const kept = new Map<string, SyncEvent>();
  return {
    ids: () => [...kept.keys()].sort(),
    receive(_account, events) {
      let n = 0;
      for (const e of events)
        if (!kept.has(e.id)) {
          kept.set(e.id, e);
          n++;
        }
      return Promise.resolve(ok(n));
    },
  };
}

interface Device {
  readonly name: string;
  readonly storage: Storage & { readonly kvMap: Map<string, string> };
  readonly remote: Remote;
  readonly clock: ManualClock;
  readonly life: ManualLifecycle;
  readonly device: DeviceClock;
  readonly outbox: Outbox;
  readonly log: ReturnType<typeof memoryLog>;
  readonly settings: SettingsChannel;
  readonly sync: SyncService;
  /** Makes a local event (in the outbox, as the event store's append does). */
  event(id: string): Promise<void>;
  setSettings(v: Record<string, unknown>): void;
  readSettings(): Record<string, unknown>;
}

async function makeDevice(cloud: MemoryCloud, name: string, clock: ManualClock): Promise<Device> {
  const storage = memoryStorage();
  const { remote, auth } = cloud.device();
  unwrap(await auth.signIn('ada@example.org', 'pw-123456'));
  const life = manualLifecycle({ tab: 'tab-' + name, device: { os: name === 'A' ? 'iphone' : 'windows', browser: 'Safari' } });
  const errors = createErrorReporter({ notifier: recordingNotifier(), i18n: catalogI18n({}), console: QUIET });
  const device = deviceClock(
    storage.kv,
    () => clock.now(),
    () => 'dev' + name,
  );
  const outbox = createOutbox(storage.docs);
  const log = memoryLog();
  const settings = settingsChannel({ storage, remote, device, errors, changedAt: () => null });
  const lease = createLeaseService({ remote, lifecycle: life, scheduler: clock, errors, deviceId: device.id });
  const sync = createSyncService({
    scheduler: clock,
    lifecycle: life,
    errors,
    lease,
    channels: [settings, eventsChannel({ remote, docs: storage.docs, outbox, log, device, errors })],
  });
  outbox.onEnqueue(() => {
    sync.changed();
  });
  return {
    name,
    storage,
    remote,
    clock,
    life,
    device,
    outbox,
    log,
    settings,
    sync,
    async event(id) {
      const e: SyncEvent = { id, type: 'answer.given', hlc: unwrap(device.now()), device: device.id, item: id };
      unwrap(await log.receive(ACC, [e])); // the log keeps its own events too
      unwrap(await outbox.enqueue(ACC, [e]));
    },
    setSettings(v) {
      storage.kv.set(recordKey(ACC, 'settings'), JSON.stringify(v));
    },
    readSettings: () => JSON.parse(storage.kvMap.get(recordKey(ACC, 'settings')) ?? '{}') as Record<string, unknown>,
  };
}

async function setup(n = 2): Promise<{ cloud: MemoryCloud; clock: ManualClock; devices: Device[] }> {
  const clock = manualClock(Date.UTC(2026, 10, 8, 10));
  const cloud = memoryCloud({ now: () => clock.now() });
  cloud.addUser('ada@example.org', 'pw-123456', 'Ada');
  const devices: Device[] = [];
  for (const name of ['A', 'B', 'C'].slice(0, n)) devices.push(await makeDevice(cloud, name, clock));
  return { cloud, clock, devices };
}

test('events: the outbox goes up once, the other device takes them in once; offline keeps them; a lost answer doubles nothing', async () => {
  const { cloud, devices } = await setup();
  const [A, B] = devices as [Device, Device];
  A.sync.start(ACC);
  B.sync.start(ACC);
  await flush();
  await A.event('e1');
  await A.event('e2');
  assert.equal(unwrap(await A.outbox.count(ACC)), 2);
  unwrap(await A.sync.push());
  assert.equal(unwrap(await A.outbox.count(ACC)), 0, 'sent: out of the outbox');
  assert.deepEqual(
    cloud.logOf('user1', 'events').map(e => e.id),
    ['e1', 'e2'],
  );
  unwrap(await B.sync.pull());
  assert.deepEqual(B.log.ids(), ['e1', 'e2']);
  // offline: the events wait in the outbox; nothing is lost
  cloud.setOffline(true);
  await A.event('e3');
  const failed = await A.sync.push();
  assert.ok(!failed.ok && failed.error.code === 'cloud.network');
  assert.equal(unwrap(await A.outbox.count(ACC)), 1);
  cloud.setOffline(false);
  unwrap(await A.sync.push());
  // the cloud took them but the answer was lost: the same events again are ignored there
  await A.outbox.enqueue(ACC, [{ id: 'e3', type: 'answer.given', hlc: unwrap(A.device.now()), device: 'devA' }]);
  unwrap(await A.sync.push());
  assert.deepEqual(
    cloud.logOf('user1', 'events').map(e => e.id),
    ['e1', 'e2', 'e3'],
  );
  unwrap(await B.sync.pull());
  unwrap(await B.sync.pull()); // from its cursor: nothing again
  assert.deepEqual(B.log.ids(), ['e1', 'e2', 'e3']);
  // both devices at once: a union by id
  await B.event('b1');
  await A.event('a4');
  unwrap(await B.sync.now());
  unwrap(await A.sync.now());
  unwrap(await B.sync.pull());
  assert.deepEqual(A.log.ids(), ['a4', 'b1', 'e1', 'e2', 'e3']);
  assert.deepEqual(B.log.ids(), ['a4', 'b1', 'e1', 'e2', 'e3']);
  // a local profile's events never reach the outbox
  await A.outbox.enqueue('anr', [{ id: 'x', type: 't', hlc: unwrap(A.device.now()), device: 'devA' }]);
  assert.equal(unwrap(await A.outbox.count('anr')), 0);
  A.sync.stop();
  B.sync.stop();
});

test('settings: per field the later write wins, secrets stay on the device, removals travel, an old copy never wins', async () => {
  const { cloud, clock, devices } = await setup(3);
  const [A, B, C] = devices as [Device, Device, Device];
  A.sync.start(ACC); // C stays away (it was never synced since the registers came)
  B.sync.start(ACC);
  await flush();
  A.setSettings({ goal: 150, lang: 'el', apiKey: 'SECRET' });
  assert.ok(unwrap(await A.settings.noteLocal(ACC)));
  unwrap(await A.sync.push());
  assert.ok(!JSON.stringify(cloud.registersOf('user1', 'settings')).includes('SECRET'), 'the key never leaves the device');
  unwrap(await B.sync.pull());
  assert.deepEqual(B.readSettings(), { goal: 150, lang: 'el' });
  // two devices change different fields: both kept; the same field: the later write
  clock.advance(1000);
  B.setSettings({ ...B.readSettings(), sound: false, goal: 120 });
  unwrap(await B.settings.noteLocal(ACC));
  clock.advance(1000);
  A.setSettings({ ...A.readSettings(), character: 'robot', goal: 200 });
  unwrap(await A.settings.noteLocal(ACC));
  unwrap(await B.sync.now());
  unwrap(await A.sync.now());
  unwrap(await B.sync.pull());
  for (const d of [A, B])
    assert.deepEqual(
      { ...d.readSettings(), apiKey: undefined },
      { goal: 200, lang: 'el', sound: false, character: 'robot', apiKey: undefined },
      d.name,
    );
  assert.equal(A.readSettings()['apiKey'], 'SECRET');
  // a removal travels like a change
  clock.advance(1000);
  B.setSettings(Object.fromEntries(Object.entries(B.readSettings()).filter(([k]) => k !== 'sound')));
  unwrap(await B.settings.noteLocal(ACC));
  unwrap(await B.sync.push());
  unwrap(await A.sync.pull());
  assert.ok(!('sound' in A.readSettings()));
  // a device that comes back with an old copy (written before the registers): its fields are as old as its last change
  C.setSettings({ goal: 10, lang: 'fr', mt: { on: true } });
  const cSettings = settingsChannel({
    storage: C.storage,
    remote: C.remote,
    device: C.device,
    errors: createErrorReporter({ notifier: recordingNotifier(), i18n: catalogI18n({}), console: QUIET }),
    changedAt: () => Date.UTC(2026, 0, 1),
  });
  unwrap(await cSettings.pull(ACC, { reason: 'start' }));
  unwrap(await cSettings.push(ACC, { keepalive: false }));
  unwrap(await cSettings.pull(ACC, { reason: 'loop' }));
  assert.deepEqual(
    C.readSettings(),
    { goal: 200, lang: 'el', character: 'robot', mt: { on: true } },
    'the newer choices win; what only C had is kept',
  );
  unwrap(await A.sync.pull());
  assert.deepEqual(A.readSettings()['mt'], { on: true });
  for (const d of devices) d.sync.stop();
});

test("settings: the cloud's old key/value copy is taken in with its own time; a clock far ahead cannot win for ever", async () => {
  const { cloud, clock, devices } = await setup();
  const [A, B] = devices as [Device, Device];
  A.sync.start(ACC);
  B.sync.start(ACC);
  await flush();
  const keys = unwrap(
    await A.settings.importLegacy(
      ACC,
      'settings',
      JSON.stringify({ goal: 90, apiKey: 'OLD', native: { code: 'el' } }),
      new Date(clock.now() - 86_400_000).toISOString(),
    ),
  );
  assert.deepEqual(keys, [recordKey(ACC, 'settings')]);
  assert.deepEqual(
    A.readSettings(),
    { goal: 90, native: { code: 'el' } },
    'the key of an old copy is not taken in here (engine/cloud.js moves it to the device)',
  );
  unwrap(await A.sync.push());
  unwrap(await B.sync.pull());
  assert.deepEqual(B.readSettings(), { goal: 90, native: { code: 'el' } });
  // B's clock runs a year ahead: its write is stored as the cloud's time, so A's later write still wins
  const ahead = deviceClock(
    memoryStorage().kv,
    () => clock.now() + 365 * 86_400_000,
    () => 'devFuture',
  );
  const fast = settingsChannel({
    storage: B.storage,
    remote: B.remote,
    device: ahead,
    errors: createErrorReporter({ notifier: recordingNotifier(), i18n: catalogI18n({}), console: QUIET }),
    changedAt: () => null,
  });
  B.setSettings({ ...B.readSettings(), goal: 1 });
  unwrap(await fast.noteLocal(ACC));
  unwrap(await fast.push(ACC, { keepalive: false }));
  clock.advance(10_000);
  A.setSettings({ ...A.readSettings(), goal: 300 });
  unwrap(await A.settings.noteLocal(ACC));
  unwrap(await A.sync.push());
  unwrap(await fast.pull(ACC, { reason: 'loop' }));
  assert.equal(B.readSettings()['goal'], 300);
  assert.equal(cloud.registersOf('user1', 'settings').find(e => e.key === 'settings.goal')?.value, 300);
  A.sync.stop();
  B.sync.stop();
});

test('one device at a time: the first takes it, the second waits; "Use here" takes it over; a hidden tab lets it go', async () => {
  const { clock, devices } = await setup();
  const [A, B] = devices as [Device, Device];
  A.sync.start(ACC);
  await flush();
  assert.equal(A.sync.lease.status(), 'mine');
  B.sync.start(ACC);
  await flush();
  assert.equal(B.sync.lease.status(), 'other');
  assert.deepEqual(B.sync.lease.holder()?.os, 'iphone');
  assert.equal(B.sync.status().state, 'paused', 'the waiting device holds its loop');
  assert.equal(await B.sync.lease.check(true), 'mine');
  assert.equal(await A.sync.lease.check(false), 'other');
  assert.equal(A.sync.status().state, 'paused');
  // B is hidden: it lets go; A, shown and used again, takes it back silently (and pulls what B did)
  B.life.setVisible(false);
  await flush();
  assert.equal(B.sync.lease.status(), 'unknown');
  A.life.touch();
  A.life.setVisible(false);
  A.life.setVisible(true);
  await flush();
  assert.equal(A.sync.lease.status(), 'mine');
  assert.notEqual(A.sync.status().state, 'paused');
  // a device that closed without letting go: stale after two minutes, taken without asking
  A.life.touch();
  clock.advance(LEASE_FRESH_MS + 1000); // A's page stops renewing once it is not touched
  await flush();
  B.life.setVisible(true);
  await flush();
  assert.equal(B.sync.lease.status(), 'mine');
  A.sync.stop();
  B.sync.stop();
});

test('the loop: a change is pushed after its wait; a takeover pulls and tells the page what changed', async () => {
  const { clock, devices } = await setup();
  const [A, B] = devices as [Device, Device];
  A.sync.start(ACC);
  await flush();
  const states: string[] = [];
  A.sync.onStatus(s => states.push(s.state));
  await A.event('e1');
  await flush();
  assert.equal(A.sync.status().state, 'waiting');
  assert.equal(A.sync.status().pending, 1);
  clock.advance(DEBOUNCE_MS);
  await flush();
  assert.equal(unwrap(await A.outbox.count(ACC)), 0, 'pushed by the loop');
  assert.equal(A.sync.status().pending, 0);
  assert.ok(states.includes('pushing') && A.sync.status().state === 'idle');
  // B takes the account over: it pulls at once and tells the page which keys changed
  A.setSettings({ goal: 70 });
  unwrap(await A.settings.noteLocal(ACC));
  unwrap(await A.sync.push());
  const changed: string[] = [];
  B.sync.onRemote((_a, keys) => changed.push(...keys));
  B.sync.start(ACC);
  await flush();
  assert.equal(await B.sync.lease.check(true), 'mine');
  await flush();
  assert.deepEqual(B.log.ids(), ['e1']);
  assert.ok(changed.includes(recordKey(ACC, 'settings')));
  // leaving sends at once (keepalive), whatever the loop does
  await B.event('b1');
  B.life.leave();
  await flush();
  assert.equal(unwrap(await B.outbox.count(ACC)), 0);
  A.sync.stop();
  B.sync.stop();
  assert.equal(B.sync.status().signedIn, false);
});

test('without the log’s migration a cloud progress row is kept on a device that has none (never over one it has)', async () => {
  const s = memoryStorage();
  const keep = keepIfAbsent(s);
  unwrap(await keep.accept('u_1', 's:phys:state', '{"res":{}}'));
  unwrap(await keep.accept('u_1', 's:phys:state', '{"other":1}'));
  assert.equal(s.kvMap.get('noema1:u_1:s:phys:state'), '{"res":{}}');
});

test('a first registration counts a change only when the old sync had not sent it (defaults made at sign-in never win)', () => {
  const s = memoryStorage();
  const at = unsentChangeAt(s);
  s.kv.set('noema1:u_1:meta:mtime', JSON.stringify({ 'a:settings': 1234 }));
  assert.equal(at('u_1', 'settings'), null, 'sent (or never marked): as old as possible');
  s.kv.set('noema1:u_1:meta:unsynced', JSON.stringify({ 'a:settings': 99 }));
  assert.equal(at('u_1', 'settings'), 1234);
  s.kv.set('noema1:u_1:meta:mtime', '{nope');
  assert.equal(at('u_1', 'settings'), null);
});
