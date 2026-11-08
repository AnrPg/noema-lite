/// <reference types="node" />
/** The learning log's use cases over the memory adapters (src/features/study/application/learning-log.ts) and its bridge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createErrorReporter } from '../adapters/local/error-reporter.ts';
import { documentEventStore, EVENT_COLLECTIONS, memoryTabHub } from '../adapters/local/event-store.ts';
import { manualClock } from '../adapters/memory/clock.ts';
import { catalogI18n } from '../adapters/memory/i18n.ts';
import { memoryEventStore } from '../adapters/memory/event-store.ts';
import { recordingNotifier } from '../adapters/memory/notifier.ts';
import { memoryStorage } from '../adapters/memory/storage.ts';
import { LearningLog, SNAPSHOT_EVERY, type LearningLogDeps } from '../features/study/application/learning-log.ts';
import { deviceClock } from '../features/sync/application/device.ts';
import { DEFAULT_FSRS, replay } from '../features/study/domain/projections/model.ts';
import { ok } from '../kernel/result.ts';
import type { EventStore } from '../ports/event-store.ts';
import { buildBridge } from './bridge.ts';
import { learningEventFeed, learningSeams, uuid } from './learning.ts';
import { memoryCloud, type MemoryCloud } from '../adapters/memory/remote.ts';
import { eventsChannel } from '../features/sync/application/events-channel.ts';
import { createOutbox, SYNC_COLLECTION } from '../features/sync/application/outbox.ts';
import { foldLevels, levelReached, levelTested } from '../features/roadmaps/domain/events.ts';
import { ROADMAP_EVENTS } from './roadmaps.ts';
import { STUDY, STUDY_REGISTRATIONS } from './study.ts';
import { LEGACY_PROGRESS, SYNC_EVENT_LOG } from './sync.ts';
import { createToolsContainer } from './tools.ts';
import { LEARNING } from './tokens.ts';

const T0 = Date.UTC(2026, 10, 8, 9);
interface Rig {
  log: LearningLog;
  store: EventStore;
  kv: ReturnType<typeof memoryStorage>['kv'];
  clock: ReturnType<typeof manualClock>;
  notifier: ReturnType<typeof recordingNotifier>;
  deps: LearningLogDeps;
}
function rig(o: { store?: EventStore; kv?: Rig['kv']; usage?: number; device?: string } = {}): Rig {
  const clock = manualClock(T0, 'Europe/Athens');
  const storage = memoryStorage();
  const kv = o.kv ?? storage.kv;
  const store = o.store ?? memoryEventStore();
  const notifier = recordingNotifier(() => clock.now());
  const i18n = catalogI18n({ en: { 'loader.storage.low': 'Space is {pct}% used' } }, 'en');
  let n = 0;
  const deps: LearningLogDeps = {
    store,
    clock,
    kv,
    stamps: deviceClock(
      kv,
      () => clock.now(),
      () => o.device ?? 'dev1',
    ),
    newId: () => `evt-${String(++n).padStart(8, '0')}-${o.device ?? 'dev1'}`,
    errors: createErrorReporter({ now: () => clock.now() }),
    notifier,
    i18n,
    quota: {
      estimate: () => Promise.resolve(ok({ usage: o.usage ?? 10, quota: 100, persisted: false })),
      persist: () => Promise.resolve(ok(true)),
    },
  };
  return { log: new LearningLog(deps), store, kv, clock, notifier, deps };
}
const value = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

test('record: folded at once, stored in order, and the same after a reopen (from the events and from the snapshot)', async () => {
  const a = rig();
  value(await a.log.open('anr'));
  assert.ok(a.log.record({ type: 'answer.given', subject: 'demo', item: 'ch01-e001', data: { ok: true } }).ok);
  assert.ok(a.log.record({ type: 'xp.earned', subject: 'demo', data: { amount: 10 } }).ok);
  assert.ok(a.log.record({ type: 'section.read', subject: 'demo', item: 'ch01-s01', data: {} }).ok);
  assert.deepEqual(a.log.progress('demo').res['ch01-e001'], { n: 1, ok: 1, last: true, t: T0 }, 'readable at once');
  assert.equal(a.log.stats().xp, 10);
  assert.equal(a.log.stats().xpDay['2026-11-08'], 10);
  assert.equal(a.log.stats().streak, 1);
  value(await a.log.flush());
  assert.equal(value(await a.store.read('anr')).length, 3);

  const b = rig({ store: a.store });
  const rep = value(await b.log.open('anr'));
  assert.equal(rep.events, 3);
  assert.deepEqual(b.log.progress('demo'), a.log.progress('demo'));
  // enough events for a snapshot: the next open reads it and only what came after
  for (let i = 0; i < SNAPSHOT_EVERY; i++)
    b.log.record({ type: 'answer.given', subject: 'demo', item: 'ch01-e002', data: { ok: i % 2 === 0 } });
  value(await b.log.flush());
  assert.ok(value(await b.store.getSnapshot('anr')), 'a snapshot was saved');
  b.log.record({ type: 'answer.given', subject: 'demo', item: 'ch01-e003', data: { ok: false } });
  value(await b.log.flush());
  const c = rig({ store: a.store });
  const rep2 = value(await c.log.open('anr'));
  assert.ok(rep2.fromSnapshot);
  assert.deepEqual(c.log.progress('demo'), b.log.progress('demo'));
  assert.deepEqual(c.log.stats(), b.log.stats());
});

test('the migration: the old KV state, a:stats and a:settings become events once; the old values are archived, then leave the KV', async () => {
  const r = rig();
  const blob = {
    xp: 30,
    read: { 'ch01-s01': true },
    res: { 'ch01-e001': { n: 2, ok: 1, last: true, t: T0 - 10 } },
    fc: { 'ch01-f001': { box: 3, due: '2026-11-20' } },
    srcOn: ['a'],
  };
  r.kv.set('noema1:anr:s:demo:state', JSON.stringify(blob));
  r.kv.set('noema1:anr:s:lang:es:node:n1', '{"items":{}}'); // a language course keeps its own
  r.kv.set(
    'noema1:anr:a:stats',
    JSON.stringify({ xp: 30, xpDay: { '2026-11-07': 30 }, streak: 1, lastDay: '2026-11-07', bySubject: { demo: 30 } }),
  );
  r.kv.set('noema1:anr:a:settings', JSON.stringify({ theme: 'dark', apiKey: 'device-only' }));
  r.kv.set('noema1:maria:s:demo:state', JSON.stringify({ xp: 5 }));
  const rep = value(await r.log.open('anr'));
  assert.ok(rep.migrated > 0);
  const p = r.log.progress('demo');
  assert.equal(p.xp, 30);
  assert.deepEqual(p.read, blob.read);
  assert.deepEqual(p.res, blob.res);
  assert.deepEqual(
    Object.fromEntries(Object.entries(p.fc).map(([k, m]) => [k, [m.phase, m.s]])),
    Object.fromEntries(Object.keys(blob.fc).map(k => [k, ['review', 7]])),
    'a Leitner box 3 is an FSRS memory of its interval (7 days)',
  );
  assert.deepEqual(r.log.settings('demo'), { srcOn: ['a'] });
  assert.deepEqual(r.log.stats(), { xp: 30, xpDay: { '2026-11-07': 30 }, streak: 1, lastDay: '2026-11-07', bySubject: { demo: 30 } });
  assert.deepEqual(r.log.settings(), { theme: 'dark' }, 'never the device key');
  assert.equal(value(r.kv.get('noema1:anr:s:demo:state')), null, 'the old copy left the KV');
  assert.equal(value(r.kv.get('noema1:anr:a:stats')), null);
  assert.ok(value(r.kv.get('noema1:anr:a:settings')), "a:settings stays: it is the old screens' copy");
  assert.ok(value(r.kv.get('noema1:anr:s:lang:es:node:n1')));
  assert.ok(value(r.kv.get('noema1:maria:s:demo:state')), "another account's is left for it");
  const arch = value(await r.log.archive());
  assert.deepEqual(JSON.parse(arch['s:demo:state']?.[0] ?? '{}'), blob, 'the old value, word for word, in the archive');
  const count = value(await r.store.read('anr')).length;

  // the same blob again (the old sync brings it back): nothing new; it leaves again
  r.kv.set('noema1:anr:s:demo:state', JSON.stringify(blob));
  assert.equal(value(await r.log.migrateLegacy()).added, 0);
  assert.equal(value(await r.store.read('anr')).length, count);
  assert.equal(value(r.kv.get('noema1:anr:s:demo:state')), null);
  // another device's copy with more: only what differs, merged the old way
  r.kv.set('noema1:anr:s:demo:state', JSON.stringify({ ...blob, res: { 'ch01-e001': { n: 4, ok: 2, last: false, t: T0 - 5 } } }));
  assert.equal(value(await r.log.migrateLegacy()).added, 1);
  assert.equal(r.log.progress('demo').res['ch01-e001']?.n, 4);
  // a reopen migrates nothing
  const again = rig({ store: r.store, kv: r.kv });
  assert.equal(value(await again.log.open('anr')).migrated, 0);
  assert.deepEqual(again.log.progress('demo'), r.log.progress('demo'));
});

test('settings: the old copy written → one event per changed key; onSettings tells the copy keeper; a reopen keeps them', async () => {
  const r = rig();
  value(await r.log.open('anr'));
  const heard: Array<Record<string, unknown>> = [];
  r.log.onSettings(s => heard.push({ ...s }));
  assert.equal(r.log.settingsWritten({ theme: 'dark', goal: 120 }), 2);
  assert.equal(r.log.settingsWritten({ theme: 'dark', goal: 120 }), 0, 'nothing changed');
  assert.equal(r.log.settingsWritten({ theme: 'light' }), 2, 'theme changed, goal removed');
  assert.deepEqual(r.log.settings(), { theme: 'light' });
  assert.deepEqual(heard.at(-1), { theme: 'light' });
  r.log.setSubjectSetting('demo', 'srcOn', ['s1']);
  value(await r.log.flush());
  const b = rig({ store: r.store });
  value(await b.log.open('anr'));
  assert.deepEqual(b.log.settings(), { theme: 'light' });
  assert.deepEqual(b.log.settings('demo'), { srcOn: ['s1'] });
});

test('another device: its events (older stamps) fold in, the whole log refolds, the held objects stay the same objects', async () => {
  const a = rig();
  value(await a.log.open('anr'));
  const held = a.log.progress('demo');
  a.log.record({ type: 'card.reviewed', subject: 'demo', item: 'c1', data: { rating: 3 } });
  value(await a.log.flush());
  const old = {
    v: 1,
    id: 'evt-remote-0001',
    type: 'card.reviewed',
    hlc: `${String(T0 - 86400000).padStart(15, '0')}-00000-dev9`,
    day: '2026-11-07',
    device: 'dev9',
    account: 'anr',
    subject: 'demo',
    item: 'c1',
    data: { rating: 4 },
  };
  assert.equal(value(await a.log.append([old])).length, 1);
  assert.equal(value(await a.log.append([old])).length, 0, 'twice: once');
  value(await a.log.flush());
  assert.equal(a.log.progress('demo'), held, 'the same object');
  assert.deepEqual(
    held.fc['c1'],
    replay(
      null,
      [
        [T0 - 86400000, 4],
        [T0, 3],
      ],
      DEFAULT_FSRS,
    ),
    'easy yesterday, good today: both reviews in time order',
  );
  const bad = await a.log.append([{ ...old, id: 'evt-remote-0002', account: 'maria' }]);
  assert.ok(!bad.ok && bad.error.code === 'events.invalid');
});

test("restore: a backup brought back undoes what came after it, by an event; another account's backup gets ids of its own", async () => {
  const r = rig();
  value(await r.log.open('anr'));
  r.log.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: true } });
  const backup = value(await r.log.exportLog());
  r.clock.advance(1000);
  r.log.record({ type: 'answer.given', subject: 'demo', item: 'e2', data: { ok: true } });
  value(await r.log.flush());
  assert.deepEqual(Object.keys(r.log.progress('demo').res).sort(), ['e1', 'e2']);
  r.clock.advance(1000);
  value(await r.log.restore(backup.events, { mode: 'replace', madeAt: T0 }));
  assert.deepEqual(Object.keys(r.log.progress('demo').res), ['e1'], 'e2 no longer counts');
  assert.equal(value(await r.store.read('anr')).filter(e => e.type === 'answer.given').length, 2, 'nothing was deleted');

  const m = rig();
  value(await m.log.open('maria'));
  value(await m.log.restore(backup.events, { mode: 'merge', madeAt: T0 }));
  value(await m.log.restore(backup.events, { mode: 'merge', madeAt: T0 }));
  assert.deepEqual(Object.keys(m.log.progress('demo').res), ['e1']);
  assert.equal(value(await m.store.read('maria')).length, 1, 'restored twice: once');

  // into a profile that is not open here (the copy to a cloud account): straight into its log, read by eventsOf
  value(await r.log.restore(backup.events, { mode: 'replace', madeAt: T0, account: 'cloud1' }));
  const there = value(await r.log.eventsOf('cloud1'));
  assert.deepEqual(there.map(e => e.type).sort(), ['answer.given', 'log.restored']);
  assert.ok(there.every(e => e.account === 'cloud1'));
  assert.equal(value(await r.log.eventsOf('anr')).length, value(await r.store.read('anr')).length);
  const c = rig({ store: r.store });
  value(await c.log.open('cloud1'));
  assert.deepEqual(Object.keys(c.log.progress('demo').res), ['e1'], 'the copy folds when that account opens');
});

test('two tabs: an event recorded in one is folded in the other', async () => {
  const hub = memoryTabHub();
  const docs = memoryStorage({ collections: EVENT_COLLECTIONS });
  const mk = (): EventStore => documentEventStore({ docs: docs.docs, onFull: l => docs.onFull(l), channel: hub() });
  const a = rig({ store: mk() }),
    b = rig({ store: mk(), device: 'dev2' });
  value(await a.log.open('anr'));
  value(await b.log.open('anr'));
  const seen: string[] = [];
  b.log.onChange((evs, why) => seen.push(`${why}:${evs.length}`));
  a.log.record({ type: 'boss.won', subject: 'demo', item: 'ch01', data: {} });
  value(await a.log.flush());
  assert.deepEqual(b.log.progress('demo').boss, { ch01: true });
  assert.deepEqual(seen, ['tab:1']);

  // an inbox row read by both tabs at once (ids from its content): counted once, also in the tab that lost the race
  const row = [
    { type: 'answer.given' as const, subject: 'demo', item: 'e1', data: { ok: true }, origin: 'inbox' as const, id: 'inbox.row1-0000' },
  ];
  assert.equal(value(await a.log.recordOnce(row)).length, 1);
  assert.equal(value(await a.log.recordOnce(row)).length, 0, 'the same row again: nothing');
  const late = rig({ store: memoryEventStore() });
  value(await late.log.open('anr'));
  assert.equal(value(await late.log.recordOnce(row)).length, 1);
  value(await late.log.append(value(await a.log.events()).filter(e => e.id === 'inbox.row1-0000')));
  value(await late.log.flush());
  assert.equal(late.log.progress('demo').res['e1']?.n, 1);
  const bad = await a.log.recordOnce([{ type: 'day.active', data: {} }]);
  assert.ok(!bad.ok && bad.error.code === 'events.invalid', 'a draft without its id');
});

test('recordOnce: an event stored by another tab between the check and the write is folded once', async () => {
  const hub = memoryTabHub();
  const docs = memoryStorage({ collections: EVENT_COLLECTIONS });
  const mk = (): EventStore => documentEventStore({ docs: docs.docs, onFull: l => docs.onFull(l), channel: hub() });
  const a = rig({ store: mk() }),
    b = rig({ store: mk(), device: 'dev2' });
  value(await a.log.open('anr'));
  value(await b.log.open('anr'));
  const d = { type: 'answer.given' as const, subject: 'demo', item: 'e7', data: { ok: true }, id: 'inbox.row7-0000' };
  a.log.record(d);
  b.log.record(d); // both recorded it before either was stored
  value(await a.log.flush());
  value(await b.log.flush());
  assert.equal(value(await a.store.read('anr')).length, 1);
  assert.equal(a.log.progress('demo').res['e7']?.n, 1);
  assert.equal(b.log.progress('demo').res['e7']?.n, 1, 'the tab whose copy was a duplicate folds again');
});

test('a full storage: the events wait in memory (still read), flush says so; the space warning; the account is closed before open', async () => {
  const r = rig({ store: memoryEventStore({ quota: 3 }), usage: 95 });
  assert.ok(!r.log.record({ type: 'day.active', data: {} }).ok, 'not open yet: events.closed');
  value(await r.log.open('anr'));
  await new Promise(res => setTimeout(res, 0));
  assert.match(r.notifier.toasts.map(t => t.text).join('|'), /Space is 95% used/);
  for (let i = 0; i < 4; i++) r.log.record({ type: 'answer.given', subject: 'demo', item: `e${i}`, data: { ok: true } });
  const f = await r.log.flush();
  assert.ok(!f.ok, 'not all stored');
  assert.equal(r.log.pending, 4);
  assert.equal(Object.keys(r.log.progress('demo').res).length, 4, 'the screens still see them');
  assert.equal(value(await r.log.events()).length, 4, 'and the log gives them');
});

test('compaction forgets superseded saved states and opened sections; the fold stays the same', async () => {
  const r = rig();
  value(await r.log.open('anr'));
  for (let i = 0; i < 5; i++) r.log.record({ type: 'activity.saved', subject: 'demo', item: 'blk:s1:a', data: { v: 1, state: { i } } });
  r.log.record({ type: 'section.opened', subject: 'demo', item: 's1', data: {} });
  r.log.record({ type: 'section.opened', subject: 'demo', item: 's1', data: {} });
  const before = structuredClone(r.log.progress('demo'));
  assert.equal(value(await r.log.compact()), 5);
  assert.equal(value(await r.store.read('anr')).length, 2);
  const b = rig({ store: r.store });
  value(await b.log.open('anr'));
  assert.deepEqual(b.log.progress('demo').act, before.act);
  assert.equal(b.log.progress('demo').last, 's1');
});

test('event ids are UUIDs; the stamps are the device clock of the sync (its id, later than every stamp seen)', async () => {
  assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const a = rig({ device: 'devA' });
  value(await a.log.open('anr'));
  const e = value(a.log.record({ type: 'day.active', data: {} }));
  assert.equal(e.device, 'devA');
  assert.match(e.hlc, /-devA$/);
  value(a.deps.stamps.receive(`${String(T0 + 60000).padStart(15, '0')}-00003-devZ`)); // a stamp from another device, ahead
  assert.ok(value(a.log.record({ type: 'day.active', data: {} })).hlc > `${String(T0 + 60000).padStart(15, '0')}-00003`);
});

test('NoemaCore.learning: plain values for the old code', async () => {
  const c = createToolsContainer({ clock: manualClock(T0) });
  const core = buildBridge(c, [(await import('./learning.ts')).learningBridge]);
  const L = core['learning'] as {
    open(a: string): Promise<{ account: string }>;
    record(d: unknown): unknown;
    progress(s: string): { res: Record<string, unknown> };
    cardRating(g: number): number;
    events(): Promise<unknown[]>;
    flush(): Promise<boolean>;
  };
  assert.equal((await L.open('anr')).account, 'anr');
  assert.ok(L.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: true } }));
  assert.equal(L.record({ type: 'answer.given', subject: 'demo', data: { ok: true } }), null, 'refused: null, and reported');
  assert.deepEqual(Object.keys(L.progress('demo').res), ['e1']);
  assert.deepEqual(
    [0, 1, 2].map(g => L.cardRating(g)),
    [1, 3, 4],
  );
  assert.equal(await L.flush(), true);
  assert.equal((await L.events()).length, 1);
});

test("the read models' feed: all() and the new events, and a restore asks them to build again", async () => {
  const c = createToolsContainer();
  const log = c.get(LEARNING);
  value(await log.open('anr'));
  const feed = learningEventFeed(c);
  const got: string[] = [];
  let rebuilds = 0;
  feed.subscribe(evs => got.push(...evs.map(e => e.type)));
  feed.onRebuild(() => rebuilds++);
  log.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: true } });
  log.record({ type: 'card.reviewed', subject: 'demo', item: 'c1', data: { rating: 3 } });
  assert.deepEqual(got, ['answer.given', 'card.reviewed']);
  assert.deepEqual(
    value(await feed.all()).map(e => e.type),
    ['answer.given', 'card.reviewed'],
  );
  const backup = value(await log.exportLog());
  value(await log.restore(backup.events, { mode: 'replace', madeAt: Date.now() }));
  assert.ok(rebuilds >= 1, 'a restore: build again');
});

/* ---------- the seams: the sync (outbox, events channel, old rows), the Roadmaps, the read models ---------- */

/** A device of a cloud account: the log over a document store that also holds the sync's outbox, and the events channel. */
async function cloudDevice(cloud: MemoryCloud, name: string, clock: ReturnType<typeof manualClock>) {
  const storage = memoryStorage({ collections: [...EVENT_COLLECTIONS, SYNC_COLLECTION] });
  const { remote, auth } = cloud.device();
  value(await auth.signIn('ada@example.org', 'pw-123456'));
  const outbox = createOutbox(storage.docs);
  const told: string[] = [];
  outbox.onEnqueue(a => told.push(a));
  const store = documentEventStore({
    docs: storage.docs,
    onFull: l => storage.onFull(l),
    outbox: {
      collections: [SYNC_COLLECTION],
      enqueueIn: (tx, a, e) => outbox.enqueueIn(tx, a, e),
      notify: a => {
        outbox.notify(a);
      },
    },
  });
  const stamps = deviceClock(
    storage.kv,
    () => clock.now(),
    () => 'dev' + name,
  );
  const errors = createErrorReporter({ now: () => clock.now(), console: { debug() {}, info() {}, warn() {}, error() {} } });
  let n = 0;
  const log = new LearningLog({ store, clock, kv: storage.kv, stamps, newId: () => `evt-${name}-${String(++n).padStart(6, '0')}`, errors });
  const channel = eventsChannel({
    remote,
    docs: storage.docs,
    outbox,
    log: { receive: (a, e) => log.receive(a, e) },
    device: stamps,
    errors,
  });
  return { log, outbox, channel, told, storage };
}

test('two devices of a cloud account: an event goes into the outbox in its own append, up once, into the other log once', async () => {
  const clock = manualClock(T0, 'Europe/Athens');
  const cloud = memoryCloud({ now: () => clock.now() });
  cloud.addUser('ada@example.org', 'pw-123456', 'Ada');
  const ACC = 'u_user1';
  const A = await cloudDevice(cloud, 'A', clock),
    B = await cloudDevice(cloud, 'B', clock);
  value(await A.log.open(ACC));
  value(await B.log.open(ACC));
  A.log.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: true } });
  A.log.record({ type: 'card.reviewed', subject: 'demo', item: 'c1', data: { rating: 3 } });
  value(await A.log.flush());
  assert.equal(value(await A.outbox.count(ACC)), 2, 'both queued with the append');
  assert.ok(A.told.includes(ACC), 'the loop was told');
  const [, queued] = value(await A.outbox.peek(ACC, 1))[0] ?? [];
  assert.deepEqual(
    Object.keys(queued ?? {}).sort(),
    ['data', 'day', 'device', 'hlc', 'id', 'item', 'subject', 'type', 'v'],
    'the whole event, not its account',
  );
  assert.equal(value(await A.channel.push(ACC, { keepalive: false })), 2);
  assert.equal(value(await A.outbox.count(ACC)), 0);
  value(await B.channel.pull(ACC, { reason: 'manual' }));
  assert.deepEqual(B.log.progress('demo').res['e1'], A.log.progress('demo').res['e1'], "A's answer folded on B");
  assert.deepEqual(B.log.progress('demo').fc['c1'], A.log.progress('demo').fc['c1'], "and A's review, the same FSRS memory");
  assert.equal(value(await B.outbox.count(ACC)), 0, 'what B received is never sent back');
  // B studies too; A takes it in; a second pull adds nothing
  clock.advance(60_000);
  B.log.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: false } });
  value(await B.log.flush());
  assert.equal(value(await B.channel.push(ACC, { keepalive: false })), 1);
  value(await A.channel.pull(ACC, { reason: 'manual' }));
  value(await A.channel.pull(ACC, { reason: 'manual' }));
  assert.equal(A.log.progress('demo').res['e1']?.n, 2);
  assert.deepEqual(A.log.progress('demo').res, B.log.progress('demo').res);
  assert.equal(value(await A.log.events()).length, 3);
  // a profile that is not a cloud account: nothing is queued
  value(await A.log.open('anr'));
  A.log.record({ type: 'day.active', data: {} });
  value(await A.log.flush());
  assert.equal(value(await A.outbox.count('anr')), 0);
});

test('receive: what another device made is kept once and folded; invalid ones are left out; an account not open here too', async () => {
  const a = rig({ device: 'devA' }),
    b = rig({ device: 'devB' });
  value(await a.log.open('anr'));
  value(await b.log.open('anr'));
  a.log.record({ type: 'section.read', subject: 'demo', item: 's1', data: {} });
  a.log.record({ type: 'xp.earned', subject: 'demo', data: { amount: 5 } });
  const sent = value(await a.log.events()).map(e => {
    const x: Record<string, unknown> = { ...e };
    Reflect.deleteProperty(x, 'account');
    return x;
  });
  assert.equal(value(await b.log.receive('anr', [...sent, { id: 'bad-0001', type: 'nope', hlc: 'x', device: 'z' }])), 2);
  assert.equal(value(await b.log.receive('anr', sent)), 0, 'the same events again: nothing new');
  assert.deepEqual(b.log.progress('demo').read, { s1: true });
  assert.equal(b.log.stats().xp, 5);
  assert.equal(value(await b.log.receive('other', sent)), 2, 'another account of this device: straight into its log');
  assert.equal(value(await b.log.eventsOf('other')).length, 2);
});

test("the cloud's old progress rows: converted once like this device's own (open here or not), the KV left alone", async () => {
  const r = rig();
  value(await r.log.open('anr'));
  const blob = JSON.stringify({ xp: 12, read: { s1: true }, res: { e1: { n: 2, ok: 1, last: true, t: T0 - 10 } } });
  const stats = JSON.stringify({ xp: 12, xpDay: { '2026-11-07': 12 }, streak: 1, lastDay: '2026-11-07', bySubject: { demo: 12 } });
  assert.ok(value(await r.log.importLegacy('anr', 's:demo:state', blob)) > 0);
  assert.ok(value(await r.log.importLegacy('anr', 'a:stats', stats)) > 0);
  assert.equal(
    value(await r.log.importLegacy('anr', 's:demo:state', blob)),
    0,
    'the same row again (another device, a second pull): nothing',
  );
  assert.deepEqual(r.log.progress('demo').res['e1'], { n: 2, ok: 1, last: true, t: T0 - 10 });
  assert.equal(r.log.stats().xp, 12);
  assert.deepEqual(value(await r.log.archive())['s:demo:state'], [blob], 'its text kept in the archive');
  assert.equal(value(r.kv.get('noema1:anr:s:demo:state')), null, 'never written to the KV');
  assert.ok(value(await r.log.importLegacy('closed', 's:demo:state', blob)) > 0);
  const b = rig({ store: r.store });
  value(await b.log.open('closed'));
  assert.deepEqual(b.log.progress('demo').read, { s1: true });
  for (const key of ['a:settings', 's:lang:es:state', 'x:other'])
    assert.equal((await r.log.importLegacy('anr', key, '{}')).ok, false, key + ' is not progress of the log');
});

test('the seams in the root: Roadmap events in the log (once by id, read back), the sync log, the read models follow the feed', async () => {
  const clock = manualClock(T0, 'Europe/Athens');
  const c = createToolsContainer({ clock }, [...STUDY_REGISTRATIONS, learningSeams]);
  const log = c.get(LEARNING);
  value(await log.open('anr'));
  const rm = c.get(ROADMAP_EVENTS);
  const reached = levelReached('cur1', 'sem1', null, 'auto', T0);
  assert.equal(value(await rm.append('anr', [reached, levelTested('cur1', 'sem2', 0.9, true, T0, 'att 1')])), 2);
  assert.equal(value(await rm.append('anr', [levelReached('cur1', 'sem1', null, 'auto', T0 + 5)])), 0, 'reached once per level');
  assert.equal(value(await rm.append('other', [reached])), 1, 'an account not open here');
  const got = value(await rm.list('anr', 'cur1'));
  assert.deepEqual(
    got.map(e => [e.type, e.id === reached.id || e.type !== 'roadmap.level.reached', e.at === T0]),
    [
      ['roadmap.level.reached', true, true],
      ['roadmap.level.tested', true, true],
    ],
  );
  assert.deepEqual(foldLevels(got, 'cur1').reached, new Set(['sem1']));
  assert.equal(value(await rm.list('anr', 'cur2')).length, 0);
  // the read models: built from the feed, then following it (the Roadmap level under one name for both)
  const study = c.get(STUDY);
  value(await study.start());
  assert.equal(study.current().levels['cur1']?.level, 'sem1');
  log.record({ type: 'answer.given', subject: 'demo', item: 'e1', data: { ok: true } });
  assert.equal(study.current().subjects['demo']?.answers['e1']?.n, 1, 'an answer reaches the read models at once');
  // the sync's log goes into the same log
  const sync = c.get(SYNC_EVENT_LOG);
  const other = {
    id: 'evt-remote-001',
    type: 'section.read',
    hlc: `${String(T0 + 1).padStart(15, '0')}-00000-devR`,
    device: 'devR',
    v: 1,
    day: '2026-11-08',
    subject: 'demo',
    item: 's9',
    data: {},
  };
  assert.equal(value(await sync.receive('anr', [other])), 1);
  assert.ok(log.progress('demo').read['s9']);
  // a restore: the read models build again from the log
  value(await log.flush());
  const backup = value(await log.exportLog());
  log.record({ type: 'answer.given', subject: 'demo', item: 'e2', data: { ok: true } });
  value(await log.restore(backup.events, { mode: 'replace', madeAt: T0 }));
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
  assert.equal(study.current().subjects['demo']?.answers['e2'], undefined, 'built again: the undone answer is gone');
  // the old rows: through LEGACY_PROGRESS
  value(await c.get(LEGACY_PROGRESS).accept('anr', 's:demo:state', JSON.stringify({ read: { s7: true } })));
  assert.ok(log.progress('demo').read['s7']);
});
