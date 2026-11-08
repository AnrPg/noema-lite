/// <reference types="node" />
/** The learning log's domain: the events against their contract, the fold, restores and resets, the migration of the
    old state (nothing lost, idempotent), settings LWW, compaction and the xAPI input. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compactable,
  contentId,
  EVENT_INFO,
  EVENT_TYPES,
  feedEvents,
  makeEvent,
  parseEvent,
  Projection,
  settingsEvents,
  statsEvents,
  subjectEvents,
  xapiInput,
  type EventDraft,
  type EventType,
  type LearningEvent,
} from './index.ts';
import { cardMemoryOf, FSRS6_DEFAULT_PARAMETERS, fromLeitner } from '../fsrs.ts';
import { DEFAULT_FSRS, replay } from '../projections/model.ts';

const schema = JSON.parse(readFileSync(new URL('../../../../contracts/schemas/noema.events.v1.schema.json', import.meta.url), 'utf8')) as {
  $defs: { event: { properties: { type: { enum: string[] } } } };
};
const at = (wall: number, count = 0, node = 'dev1'): string =>
  `${String(wall).padStart(15, '0')}-${String(count).padStart(5, '0')}-${node}`;
const T0 = Date.UTC(2026, 10, 1, 9);
let seq = 0;
function ev<T extends EventType>(draft: EventDraft<T>, wall: number, day = '2026-11-01', account = 'anr'): LearningEvent<T> {
  const id = draft.id ?? `evt-${String(++seq).padStart(6, '0')}`;
  const r = makeEvent(draft, { id, hlc: at(wall), day, device: 'dev1', account });
  if (!r.ok) throw r.error;
  return r.value;
}
const S = 'demo';

test("the event types are the contract's, and every type has a scope and a retention", () => {
  assert.deepEqual([...EVENT_TYPES], [...schema.$defs.event.properties.type.enum].sort());
  for (const t of EVENT_TYPES)
    assert.ok(
      ['item', 'subject', 'account', 'any'].includes(EVENT_INFO[t].scope) && ['history', 'latest'].includes(EVENT_INFO[t].retention),
    );
});

test('events are checked against noema.events/v1: data, scope (subject / item) and envelope', () => {
  assert.ok(
    makeEvent(
      { type: 'answer.given', subject: S, item: 'ch01-e001', data: { ok: true } },
      { id: 'evt-000001', hlc: at(T0), day: '2026-11-01', device: 'd1', account: 'anr' },
    ).ok,
  );
  const bad = [
    { type: 'answer.given', subject: S, data: { ok: true } }, // no item
    { type: 'answer.given', subject: S, item: 'x', data: { ok: 'yes' } },
    { type: 'stats.imported', subject: S, data: { xp: 1, xpDay: {}, streak: 0, bySubject: {} } }, // an account event with a subject
    { type: 'xp.earned', subject: S, item: 'x', data: { amount: 1 } },
    { type: 'card.reviewed', subject: S, item: 'c', data: { rating: 5 } },
    { type: 'nope', data: {} },
  ];
  for (const d of bad) {
    const r = makeEvent(d as unknown as EventDraft, { id: 'evt-000002', hlc: at(T0), day: '2026-11-01', device: 'd1', account: 'anr' });
    assert.ok(!r.ok && r.error.code === 'events.invalid', JSON.stringify(d));
  }
  assert.ok(!parseEvent({ v: 1, id: 'x', type: 'day.active' }).ok);
});

test('content ids: the same parts give the same id, any difference another', () => {
  const a = contentId('mig', ['anr', 'demo', { n: 1 }]);
  assert.equal(a, contentId('mig', ['anr', 'demo', { n: 1 }]));
  assert.notEqual(a, contentId('mig', ['anr', 'demo', { n: 2 }]));
  assert.match(a, /^mig\.[0-9a-f]{32}$/);
  assert.ok(parseEvent({ v: 1, id: a, type: 'day.active', hlc: at(T0), day: '2026-11-01', device: 'd', account: 'anr', data: {} }).ok);
});

test('answers: tries, right ones, the last one and how sure; an import counts as the copy with most tries', () => {
  const evs = [
    ev({ type: 'answers.imported', subject: S, item: 'e1', data: { n: 3, ok: 1, last: false, t: T0 - 1000 } }, T0),
    ev({ type: 'answers.imported', subject: S, item: 'e1', data: { n: 2, ok: 2, last: true, t: T0 - 500 } }, T0), // the other device's copy, fewer tries
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true, conf: 'sure' } }, T0 + 1000),
    ev({ type: 'answer.given', subject: S, item: 'e2', data: { ok: false, conf: 'guess' } }, T0 + 2000),
  ];
  const p = Projection.fold(evs).subjectProgress(S);
  assert.deepEqual(p.res['e1'], { n: 4, ok: 2, last: true, t: T0 + 1000, conf: 'sure' });
  assert.deepEqual(p.res['e2'], { n: 1, ok: 0, last: false, t: T0 + 2000, conf: 'guess' });
});

test('cards and drills: FSRS-6 memories replayed on the imports; the import reviewed last counts; new FSRS settings schedule again', () => {
  const later = { ...fromLeitner(4, '2026-11-20'), last: T0 + 3 }; // another copy, reviewed after the review here
  const evs = [
    ev({ type: 'card.imported', subject: S, item: 'ch01-f001', data: { state: { box: 2, due: '2026-11-03' } } }, T0),
    ev({ type: 'card.imported', subject: S, item: 'ch01-f001', data: { state: { box: 3, due: '2026-11-02' } } }, T0), // reviewed earlier: left out
    ev({ type: 'card.reviewed', subject: S, item: 'ch01-f001', data: { rating: 3 } }, T0 + 1, '2026-11-04'),
    ev({ type: 'card.reviewed', subject: S, item: 'ch01-f002', data: { rating: 4 } }, T0 + 2, '2026-11-04'),
    ev({ type: 'card.reviewed', subject: S, item: 'ch01-f003', data: { rating: 1 } }, T0 + 2, '2026-11-04'),
    ev({ type: 'card.imported', subject: S, item: 'ch01-f003', data: { state: later } }, T0 + 4),
    ev({ type: 'playbook.reviewed', subject: S, item: 'pb1', data: { rating: 4, score: 0.5 } }, T0 + 4, '2026-11-04'),
    ev({ type: 'card.imported', subject: S, item: 'ch01#4', data: { state: { box: 2, due: '2026-11-09' } } }, T0),
    ev({ type: 'card.imported', subject: S, item: 'ch01-f005', data: { state: { box: 2, due: '2026-11-09' }, from: 'ch01#4' } }, T0 + 6),
  ];
  const p = Projection.fold(evs).subjectProgress(S);
  assert.deepEqual(p.fc['ch01-f005'], fromLeitner(2, '2026-11-09'), "a card's positional progress moved to its id");
  assert.equal(p.fc['ch01#4'], undefined, 'and the old key is gone');
  assert.deepEqual(
    p.fc['ch01-f001'],
    replay(fromLeitner(2, '2026-11-03'), [[T0 + 1, 3]], DEFAULT_FSRS),
    'the import reviewed last, then good',
  );
  assert.deepEqual(p.fc['ch01-f002'], replay(null, [[T0 + 2, 4]], DEFAULT_FSRS), 'a new card, easy');
  assert.deepEqual(p.fc['ch01-f003'], cardMemoryOf(later), 'a copy reviewed after the review here takes over');
  assert.deepEqual(p.pb['pb1'], replay(null, [[T0 + 4, 4]], DEFAULT_FSRS), 'a drill: the same scheduler');
  // the learner's own parameters (fitted): every card scheduled again from its history
  const fsrs = { parameters: FSRS6_DEFAULT_PARAMETERS.map((w, i) => (i === 0 ? w * 2 : w)), retention: 0.85 };
  const q = Projection.fold([...evs, ev({ type: 'setting.changed', data: { key: 'fsrs', value: fsrs } }, T0 + 7)]).subjectProgress(S);
  assert.deepEqual(q.fc['ch01-f002'], replay(null, [[T0 + 2, 4]], fsrs));
  assert.notDeepEqual(q.fc['ch01-f002'], p.fc['ch01-f002']);
  assert.deepEqual(q.fc['ch01-f001'], replay(fromLeitner(2, '2026-11-03'), [[T0 + 1, 3]], fsrs));
});

test('XP and streak: per subject, across subjects, per day; the import merged as the old copies merged', () => {
  const evs = [
    ev(
      {
        type: 'stats.imported',
        data: { xp: 100, xpDay: { '2026-10-30': 40, '2026-10-31': 60 }, streak: 2, lastDay: '2026-10-31', bySubject: { demo: 100 } },
      },
      T0,
    ),
    ev(
      {
        type: 'stats.imported',
        data: { xp: 90, xpDay: { '2026-10-30': 50 }, streak: 1, lastDay: '2026-10-30', bySubject: { demo: 90, other: 5 } },
      },
      T0,
    ),
    ev({ type: 'xp.earned', subject: S, data: { amount: 100, reason: 'import' }, origin: 'migration' }, T0),
    ev({ type: 'xp.earned', subject: S, data: { amount: 5 } }, T0 + 1, '2026-11-01'),
    ev({ type: 'xp.earned', data: { amount: 3 } }, T0 + 2, '2026-11-01'),
  ];
  const p = Projection.fold(evs);
  assert.equal(p.subjectProgress(S).xp, 105, "the subject's XP: its imported XP and what it earned since");
  assert.deepEqual(p.stats, {
    xp: 108,
    xpDay: { '2026-10-30': 50, '2026-10-31': 60, '2026-11-01': 8 },
    streak: 3,
    lastDay: '2026-11-01',
    bySubject: { demo: 105, other: 5 },
  });
  const later = Projection.fold([...evs, ev({ type: 'day.active', data: {} }, T0 + 86400000 * 3, '2026-11-04')]);
  assert.equal(later.stats.streak, 1, 'a day missed: the streak starts again');
});

test('settings: the latest change wins per key (by stamp, in any order), removals too; a subject has its own', () => {
  const a = ev({ type: 'setting.changed', data: { key: 'theme', value: 'dark' } }, T0 + 2);
  const b = ev({ type: 'setting.changed', data: { key: 'theme', value: 'light' } }, T0 + 1);
  const c = ev({ type: 'setting.changed', data: { key: 'goal', value: 50 } }, T0 + 1);
  const d = ev({ type: 'setting.changed', data: { key: 'goal', removed: true } }, T0 + 3);
  const e = ev({ type: 'setting.changed', subject: S, data: { key: 'srcOn', value: ['s1'] } }, T0 + 4);
  for (const order of [
    [a, b, c, d, e],
    [e, d, c, b, a],
  ]) {
    const p = new Projection();
    for (const x of [...order].sort((m, n) => (m.hlc < n.hlc ? -1 : 1))) p.apply(x);
    assert.deepEqual(p.settings(), { theme: 'dark' });
    assert.deepEqual(Projection.fold(order).settings(), { theme: 'dark' });
    assert.deepEqual(Projection.fold(order).settings(S), { srcOn: ['s1'] });
  }
});

test('apply in place equals the fold of the whole log; an event before the latest asks for a fold again', () => {
  const evs = [
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: false } }, T0),
    ev({ type: 'section.read', subject: S, item: 's1', data: {} }, T0 + 1),
    ev({ type: 'section.opened', subject: S, item: 's1', data: {} }, T0 + 2),
    ev({ type: 'boss.won', subject: S, item: 'ch01', data: {} }, T0 + 3),
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true } }, T0 + 4),
  ];
  const p = new Projection();
  for (const e of evs) assert.equal(p.apply(e), true);
  assert.deepEqual(p.subjectProgress(S), Projection.fold(evs.slice().reverse()).subjectProgress(S));
  assert.equal(
    p.apply(ev({ type: 'section.read', subject: S, item: 's0', data: {} }, T0 - 5)),
    false,
    'earlier than the latest: fold again',
  );
  assert.equal(p.apply(ev({ type: 'log.restored', data: { upTo: at(T0) } }, T0 + 10)), false, 'a restore: fold again');
});

test('reset: the subject starts again (XP across subjects stays); a restore undoes what came after its point, and restores nest', () => {
  const base = [
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true } }, T0),
    ev({ type: 'xp.earned', subject: S, data: { amount: 10 } }, T0 + 1),
  ];
  const reset = ev({ type: 'subject.reset', subject: S, data: {} }, T0 + 2);
  const after = ev({ type: 'answer.given', subject: S, item: 'e2', data: { ok: false } }, T0 + 3);
  const p = Projection.fold([...base, reset, after]);
  assert.deepEqual(Object.keys(p.subjectProgress(S).res), ['e2']);
  assert.equal(p.subjectProgress(S).xp, 0);
  assert.equal(p.stats.xp, 10);
  const live = new Projection();
  for (const e of [...base, reset, after]) live.apply(e);
  assert.deepEqual(live.subjectProgress(S), p.subjectProgress(S), 'in place, the same');

  // restore to the point after `base` (T0+1): the reset and e2 no longer count
  const r1 = ev({ type: 'log.restored', data: { upTo: base[1]?.hlc ?? '' } }, T0 + 10);
  const q = Projection.fold([...base, reset, after, r1]);
  assert.deepEqual(Object.keys(q.subjectProgress(S).res), ['e1']);
  // a later restore to a point between the reset and e2 (T0+2): the first restore sits inside it, so it no longer counts
  const r2 = ev({ type: 'log.restored', data: { upTo: reset.hlc } }, T0 + 20);
  const q2 = Projection.fold([...base, reset, after, r1, r2]);
  assert.deepEqual(Object.keys(q2.subjectProgress(S).res), [], 'back to just after the reset');
  assert.equal(q2.stats.xp, 10);
});

test('a snapshot gives the same fold, and folds on', () => {
  const evs = [
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true } }, T0),
    ev({ type: 'answers.imported', subject: S, item: 'e1', data: { n: 5, ok: 1, last: false, t: T0 - 9 } }, T0 + 1),
    ev({ type: 'stats.imported', data: { xp: 9, xpDay: {}, streak: 0, bySubject: {} } }, T0 + 2),
    ev({ type: 'setting.changed', data: { key: 'theme', value: 'dark' } }, T0 + 3),
    ev({ type: 'roadmap.level.reached', data: { roadmap: 'phys', level: 'sem2', from: null, how: 'auto' } }, T0 + 4),
    ev({ type: 'card.reviewed', subject: S, item: 'ch01-f001', data: { rating: 3 } }, T0 + 4),
    ev({ type: 'setting.changed', data: { key: 'fsrs', value: { retention: 0.8 } } }, T0 + 4),
  ];
  const p = Projection.fold(evs);
  const q = Projection.fromSnapshot(JSON.parse(JSON.stringify(p.snapshot())));
  assert.ok(q);
  const more = ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: false } }, T0 + 5),
    again = ev({ type: 'card.reviewed', subject: S, item: 'ch01-f001', data: { rating: 2 } }, T0 + 6);
  assert.ok(q.apply(more) && q.apply(again));
  const whole = Projection.fold([...evs, more, again]);
  assert.deepEqual(q.subjectProgress(S), whole.subjectProgress(S));
  assert.deepEqual(q.stats, whole.stats);
  assert.deepEqual(q.settings(), whole.settings());
  assert.equal(Projection.fromSnapshot({ version: 0 }), null);
});

/* ---------- the migration: nothing of the old state is lost ---------- */
const OLD = {
  xp: 240,
  read: { 'ch01-s01': true, 'ch01-s02': true, 'ch02-s01': true },
  res: {
    'ch01-e001': { n: 3, ok: 2, last: true, t: T0 - 5000, conf: 'sure' },
    'ch01-e002': { n: 1, ok: 0, last: false, t: T0 - 4000 },
    'ch02-e001': { ok: 1 }, // an old copy without n
  },
  fc: { 'ch01-f001': { box: 2, due: '2026-11-03' }, 'ch01#4': { box: 5, due: '2026-12-01' } },
  pb: { 'ch01-d01': { box: 1, due: '2026-11-02' } },
  boss: { ch01: true },
  last: 'ch02-s01',
  att: {
    'ch01-e010': {
      id: 'att-1',
      seed: 7,
      t0: T0 - 3000,
      t: T0 - 2000,
      hints: 1,
      result: { score: 0.8, passed: true, t: T0 - 2000 },
      events: [{ t: T0 - 2500, name: 'set' }],
    },
  },
  act: { 'blk:ch01-s01:sim1': { v: 1, data: { values: { R: 2 } }, t: T0 - 1000 } },
  flags: { 'ch01-e002': { why: 'wrong', note: 'the key says B', t: T0 - 100 } },
  bestLightning: 17,
  nodeDone: T0 - 50,
  seenSrc: { src2: true },
  ext: { meletee: [{ kind: 'chapter', id: 'ch01', event: 'review', rating: 'good', date: '2026-10-30', at: '2026-10-30T10:00:00.000Z' }] },
  srcOn: ['src1', 'src2'],
  inboxDone: { 'a:inbox:meletee:001': T0 },
};
const stamp = { hlc: at(T0 + 100000), day: '2026-11-01', device: 'dev1', account: 'anr' };

test('migration: every field of the old state becomes events whose fold is the old state', () => {
  const r = subjectEvents(S, OLD, stamp);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.unknown, []);
  const p = Projection.fold(r.events);
  const g = p.subjectProgress(S);
  assert.equal(g.xp, 240);
  assert.deepEqual(g.read, OLD.read);
  assert.deepEqual(g.res, { ...OLD.res, 'ch02-e001': { n: 1, ok: 1, last: true, t: T0 + 100000 } });
  const memories = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cardMemoryOf(v)]));
  assert.deepEqual(g.fc, memories(OLD.fc), 'the Leitner boxes as the FSRS memories they stand for');
  assert.deepEqual(g.pb, memories(OLD.pb));
  assert.deepEqual(g.boss, OLD.boss);
  assert.equal(g.last, OLD.last);
  assert.deepEqual(g.att, OLD.att);
  assert.deepEqual(g.act['blk:ch01-s01:sim1']?.data, OLD.act['blk:ch01-s01:sim1'].data);
  assert.deepEqual(Object.keys(g.flags), ['ch01-e002']);
  assert.equal(g.flags['ch01-e002']?.note, 'the key says B');
  assert.equal(g.bestLightning, 17);
  assert.ok(g.nodeDone);
  assert.deepEqual(g.seenSrc, OLD.seenSrc);
  assert.equal(g.ext['meletee']?.length, 1);
  assert.deepEqual(p.settings(S), { srcOn: ['src1', 'src2'] });
  // counts before = after
  const n = (o: object): number => Object.keys(o).length;
  assert.equal(n(g.res), n(OLD.res));
  assert.equal(n(g.read), n(OLD.read));
  assert.equal(n(g.fc) + n(g.pb), n(OLD.fc) + n(OLD.pb));
  assert.equal(p.stats.xp, 0, 'the account XP comes from a:stats (statsEvents), never twice');
});

test('migration: idempotent (the same ids every run), and a second copy merges as the old sync merged', () => {
  const a = subjectEvents(S, OLD, stamp).events.map(e => e.id);
  const b = subjectEvents(S, OLD, { ...stamp, hlc: at(T0 + 999999) }).events.map(e => e.id);
  assert.deepEqual(a, b, 'another run, another time: the same ids');
  const other = { ...OLD, res: { ...OLD.res, 'ch01-e001': { n: 5, ok: 3, last: false, t: T0 - 10 } } };
  const both = [...subjectEvents(S, OLD, stamp).events, ...subjectEvents(S, other, stamp).events];
  const unique = new Map(both.map(e => [e.id, e]));
  const g = Projection.fold(unique.values()).subjectProgress(S);
  assert.deepEqual(g.res['ch01-e001'], { n: 5, ok: 3, last: false, t: T0 - 10 }, 'the copy with more tries');
  assert.equal(unique.size, a.length + 1, 'only what differs is new');
});

test('migration: unknown fields are named, bad entries skipped, never a throw', () => {
  const r = subjectEvents(S, { xp: 'many', res: { '': { n: 1 } }, mystery: 1 }, stamp);
  assert.deepEqual(r.unknown, ['mystery']);
  assert.deepEqual(r.skipped, ['res.']);
  assert.deepEqual(subjectEvents(S, 'not an object', stamp).skipped, ['s:demo:state']);
});

test("migration of a:stats, or of the subjects' XP when there is none", () => {
  const r = statsEvents(
    { xp: 300, xpDay: { '2026-10-31': 20, bad: 1 }, streak: 4, lastDay: '2026-10-31', bySubject: { demo: 240 } },
    {},
    stamp,
  );
  assert.equal(r.events.length, 1);
  const p = Projection.fold(r.events);
  assert.deepEqual(p.stats, { xp: 300, xpDay: { '2026-10-31': 20 }, streak: 4, lastDay: '2026-10-31', bySubject: { demo: 240 } });
  const s = statsEvents(undefined, { demo: 240, phys: 10 }, stamp);
  assert.equal(Projection.fold(s.events).stats.xp, 250);
  assert.equal(statsEvents(undefined, {}, stamp).events.length, 0);
});

test('settings from the old copy: changed and removed keys only; the same change twice is one event; back again is new', () => {
  const r = settingsEvents({ theme: 'dark', goal: 120, apiKey: 'secret' }, {}, () => '', stamp, 'migration');
  assert.deepEqual(r.events.map(e => e.type === 'setting.changed' && e.data.key).sort(), ['goal', 'theme'], 'never the device key');
  const p = Projection.fold(r.events);
  assert.equal(settingsEvents({ theme: 'dark', goal: 120 }, p.settings(), k => p.settingStamp(k), stamp, 'app').events.length, 0);
  const ch = settingsEvents({ theme: 'light' }, p.settings(), k => p.settingStamp(k), stamp, 'app');
  assert.deepEqual(
    ch.events.map(e => (e.type === 'setting.changed' ? [e.data.key, e.data.value ?? null, e.data.removed ?? false] : [])),
    [
      ['theme', 'light', false],
      ['goal', null, true],
    ],
  );
  const again = settingsEvents({ theme: 'light' }, p.settings(), k => p.settingStamp(k), stamp, 'app');
  assert.deepEqual(
    again.events.map(e => e.id),
    ch.events.map(e => e.id),
    'the same difference seen twice: the same ids',
  );
});

test('compaction forgets only superseded "latest" events', () => {
  const evs = [
    ev({ type: 'section.opened', subject: S, item: 's1', data: {} }, T0),
    ev({ type: 'section.opened', subject: S, item: 's1', data: {} }, T0 + 1),
    ev({ type: 'section.opened', subject: S, item: 's2', data: {} }, T0 + 2),
    ev({ type: 'setting.changed', data: { key: 'theme', value: 'dark' } }, T0 + 3),
    ev({ type: 'setting.changed', data: { key: 'theme', value: 'light' } }, T0 + 4),
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true } }, T0 + 5),
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true } }, T0 + 6),
  ];
  const gone = compactable(evs);
  assert.deepEqual(gone, [evs[0]?.id, evs[3]?.id]);
  assert.deepEqual(
    compactable(evs, e => e.id === evs[0]?.id),
    [evs[3]?.id],
    'one held back',
  );
  const kept = evs.filter(e => !gone.includes(e.id));
  assert.deepEqual(Projection.fold(kept).subjectProgress(S), Projection.fold(evs).subjectProgress(S), 'the fold is the same');
  assert.deepEqual(Projection.fold(kept).settings(), Projection.fold(evs).settings());
});

test('the xAPI input: every attempt (latest version per attempt id) and every answer at its own time, only what counts', () => {
  const a1 = { id: 'att-1', t0: T0, t: T0 + 10, hints: 0, result: null };
  const evs = [
    ev({ type: 'activity.attempted', subject: S, item: 'e9', data: { attempt: a1 } }, T0 + 10),
    ev(
      { type: 'activity.attempted', subject: S, item: 'e9', data: { attempt: { ...a1, t: T0 + 20, result: { score: 1, passed: true } } } },
      T0 + 20,
    ),
    ev({ type: 'answers.imported', subject: S, item: 'e1', data: { n: 2, ok: 1, last: true, t: T0 - 5 } }, T0 + 21),
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: false, conf: 'think' } }, T0 + 30),
    ev({ type: 'answer.given', subject: 'other', item: 'e1', data: { ok: true } }, T0 + 31),
  ];
  const x = xapiInput(S, evs);
  assert.equal(x.attempts.length, 1);
  assert.deepEqual(compactable(evs), [evs[0]?.id], 'an attempt saved again: its earlier version can go');
  assert.deepEqual(xapiInput(S, evs.slice(1)), x, 'and the export is the same without it');
  assert.equal(x.attempts[0]?.t, T0 + 20);
  assert.deepEqual(
    x.answers.map(a => [a.exercise, a.ok, a.t, a.n ?? 1]),
    [
      ['e1', true, T0 - 5, 2],
      ['e1', false, T0 + 30, 1],
    ],
  );
  const reset = ev({ type: 'subject.reset', subject: S, data: {} }, T0 + 25);
  assert.equal(xapiInput(S, [...evs, reset]).answers.length, 1, 'a reset leaves the earlier ones out');
});

test("the read models' feed: flat records, the kinds they name, only what counts", () => {
  const evs = [
    ev({ type: 'answer.given', subject: S, item: 'e1', data: { ok: true, conf: 'sure' } }, T0),
    ev({ type: 'playbook.reviewed', subject: S, item: 'pb1', data: { rating: 4, score: 0.8 } }, T0 + 1),
    ev({ type: 'card.imported', subject: S, item: 'ch01-f001', data: { state: { box: 2, due: '2026-11-03' }, from: 'ch01#0' } }, T0 + 2),
    ev({ type: 'stats.imported', data: { xp: 50, xpDay: {}, streak: 3, lastDay: '2026-10-31', bySubject: { demo: 30 } } }, T0 + 3),
    ev({ type: 'subject.reset', subject: S, data: {} }, T0 + 4),
    ev({ type: 'answer.given', subject: S, item: 'e2', data: { ok: false } }, T0 + 10),
    ev({ type: 'log.restored', data: { upTo: at(T0 + 5) } }, T0 + 20),
  ];
  const f = feedEvents(evs);
  assert.deepEqual(
    f.map(e => e.type),
    ['answer.given', 'card.reviewed', 'card.imported', 'streak.imported', 'xp.earned', 'progress.reset'],
    'the answer inside the restore window and the restore itself are left out',
  );
  assert.deepEqual(f[0], {
    id: evs[0]?.id,
    type: 'answer.given',
    hlc: at(T0),
    device: 'dev1',
    at: T0,
    day: '2026-11-01',
    subject: S,
    item: 'e1',
    ok: true,
    conf: 'sure',
  });
  assert.equal(f[1]?.['kind'], 'drill');
  assert.deepEqual([f[2]?.['kind'], f[2]?.['state'], f[2]?.['from']], ['card', { box: 2, due: '2026-11-03' }, 'ch01#0']);
  assert.deepEqual([f[3]?.['days'], f[3]?.['through'], f[4]?.['amount']], [3, '2026-10-31', 20], 'the XP no subject held');
});

test('the feed hands on of the imports only what the ones before did not hold (two devices migrated the same progress)', () => {
  const stats = (xp: number, demo: number, streak: number, lastDay: string): LearningEvent =>
    ev({ type: 'stats.imported', data: { xp, xpDay: {}, streak, lastDay, bySubject: { demo } } }, T0);
  const evs = [
    stats(50, 30, 3, '2026-10-31'),
    stats(60, 30, 2, '2026-10-30'), // the other device's copy: 10 XP more, an older streak
    ev({ type: 'xp.earned', subject: S, data: { amount: 30, reason: 'import' }, origin: 'migration' }, T0),
    ev({ type: 'xp.earned', subject: S, data: { amount: 25, reason: 'import' }, origin: 'migration' }, T0 + 1), // less: nothing
    ev({ type: 'card.imported', subject: S, item: 'ch01-f001', data: { state: { box: 2 } } }, T0 + 1),
    ev({ type: 'card.reviewed', subject: S, item: 'ch01-f001', data: { rating: 3 } }, T0 + 2),
    ev({ type: 'card.imported', subject: S, item: 'ch01-f001', data: { state: { box: 1 } } }, T0 + 3), // given already
    ev({ type: 'roadmap.level.reached', data: { roadmap: 'cur1', level: 'sem2', from: 'sem1', how: 'test' } }, T0 + 4),
  ];
  const f = feedEvents(evs);
  assert.deepEqual(
    f.map(e => [e.type, e['amount'] ?? e['days'] ?? e['level'] ?? e['kind']]),
    [
      ['streak.imported', 3],
      ['xp.earned', 20],
      ['xp.earned', 10],
      ['xp.earned', 30],
      ['card.imported', 'card'],
      ['card.reviewed', 'card'],
      ['roadmap.level.reached', 'sem2'],
    ],
  );
  const xp = f.filter(e => e.type === 'xp.earned').reduce((a, e) => a + Number(e['amount']), 0);
  assert.equal(xp, 60, 'the read models count the merged total once');
});
