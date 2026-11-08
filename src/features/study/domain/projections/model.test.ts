/// <reference types="node" />
/* The study read models: the same model from the whole log as from one event at a time, in any delivery order; an event
   seen twice counts once; cards follow FSRS (and an imported Leitner schedule); settings re-schedule; a reset empties. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, FSRS6_DEFAULT_PARAMETERS, GOOD, AGAIN, fromLeitner, newCard, scheduler } from '../fsrs.ts';
import type { LoggedEvent } from './input.ts';
import { applyEvent, emptyModel, memories, project, reviewLog } from './model.ts';

const T0 = Date.UTC(2026, 2, 1, 9);
let n = 0;
const ev = (type: string, at: number, fields: Record<string, unknown>): LoggedEvent => {
  n++;
  const id = 'e' + String(n).padStart(4, '0');
  return {
    id,
    type,
    hlc: String(at).padStart(15, '0') + '-00000-dev',
    device: 'dev',
    at,
    day: new Date(at).toISOString().slice(0, 10),
    ...fields,
  } as LoggedEvent;
};

const LOG: LoggedEvent[] = [
  ev('answer.given', T0, { subject: 'phys', item: 'ch01-e01', ok: false, conf: 'sure' }),
  ev('answer.given', T0 + 1000, { subject: 'phys', item: 'ch01-e01', ok: true }),
  ev('answer.given', T0 + 2000, { subject: 'phys', item: 'ch01-e02', ok: false }),
  ev('section.read', T0 + 3000, { subject: 'phys', item: 'ch01-s01' }),
  ev('section.read', T0 + 4000, { subject: 'phys', item: 'ch01-s01' }),
  ev('card.reviewed', T0 + 5000, { subject: 'phys', item: 'ch01-f001', kind: 'card', rating: GOOD }),
  ev('card.reviewed', T0 + DAY_MS, { subject: 'phys', item: 'ch01-f001', kind: 'card', rating: GOOD }),
  ev('card.imported', T0, { subject: 'phys', item: 'ch01-f002', kind: 'card', state: { box: 3, due: '2026-03-05' } }),
  ev('card.reviewed', T0 + 6000, { subject: 'phys', item: 'ch01-d01', kind: 'drill', rating: AGAIN }),
  ev('xp.earned', T0, { subject: 'phys', amount: 12 }),
  ev('xp.earned', T0 + DAY_MS, { subject: 'chem', amount: 5 }),
  ev('xp.earned', T0 + DAY_MS, { amount: -3 }),
  ev('setting.changed', T0, { key: 'goal', value: 200 }),
  ev('roadmap.level.reached', T0 + 7000, { roadmap: 'cur1', level: 'sem2' }),
  ev('streak.imported', T0, { days: 4, through: '2026-02-28' }),
  ev('something.new', T0, { whatever: 1 }),
];

test('the model of the log: answers, reading, cards, drills, XP, goal, levels, streak', () => {
  const m = project(LOG);
  const s = m.subjects.phys;
  assert.ok(s);
  assert.deepEqual(s.answers['ch01-e01'], { n: 2, ok: 1, last: true, t: T0 + 1000 });
  assert.deepEqual(s.answers['ch01-e02'], { n: 1, ok: 0, last: false, t: T0 + 2000 });
  assert.deepEqual(s.read, { 'ch01-s01': T0 + 3000 });
  const f = scheduler();
  let c = f.review(newCard(T0 + 5000), GOOD, T0 + 5000);
  c = f.review(c, GOOD, T0 + DAY_MS);
  assert.deepEqual(s.cards['ch01-f001']?.memory, c);
  assert.deepEqual(s.cards['ch01-f002']?.memory, fromLeitner(3, '2026-03-05'));
  assert.equal(s.drills['ch01-d01']?.memory.phase, 'learning');
  assert.equal(s.xp, 12);
  assert.equal(m.subjects.chem?.xp, 5);
  assert.deepEqual(m.xp, { total: 17, byDay: { '2026-03-01': 12, '2026-03-02': 5 } });
  assert.equal(m.goal, 200);
  assert.deepEqual(m.levels, { cur1: { level: 'sem2', at: T0 + 7000 } });
  assert.deepEqual(m.streak, { days: 4, through: '2026-02-28' });
  assert.equal(Object.keys(m.seen).length, LOG.length);
  assert.deepEqual(Object.keys(memories(s)).sort(), ['ch01-f001', 'ch01-f002']);
  assert.equal(reviewLog(m).length, 3);
});

test('one event at a time, shuffled, twice: the same model as the whole log', () => {
  const whole = project(LOG);
  let m = emptyModel();
  const order = [...LOG].reverse();
  for (const e of [...order, ...order]) m = applyEvent(m, e);
  // answers: an older answer arriving late counts but does not become the last; cards replay in time order
  assert.deepEqual(m.subjects.phys?.answers, whole.subjects.phys?.answers);
  assert.deepEqual(m.subjects.phys?.cards, whole.subjects.phys?.cards);
  assert.deepEqual(m.xp, whole.xp);
  assert.equal(project(LOG, whole), whole, 'a snapshot folds on: the events it holds are skipped');
});

test('new FSRS settings re-schedule every card from its reviews; bad settings are ignored', () => {
  const base = project(LOG);
  const w = [...FSRS6_DEFAULT_PARAMETERS];
  w[2] = 5;
  const m = applyEvent(base, ev('setting.changed', T0 + 9000, { key: 'fsrs', value: { parameters: w, retention: 0.85 } }));
  assert.deepEqual(m.fsrs.parameters, w);
  assert.equal(m.fsrs.retention, 0.85);
  assert.notDeepEqual(m.subjects.phys?.cards['ch01-f001']?.memory, base.subjects.phys?.cards['ch01-f001']?.memory);
  const same = applyEvent(base, ev('setting.changed', T0 + 9000, { key: 'fsrs', value: { parameters: [1, 2], retention: 2 } }));
  assert.deepEqual(same.fsrs, base.fsrs);
});

test('a reset empties the subject; the model is plain JSON', () => {
  const m = applyEvent(project(LOG), ev('progress.reset', T0 + 10_000, { subject: 'phys' }));
  assert.deepEqual(m.subjects.phys, { answers: {}, cards: {}, drills: {}, read: {}, xp: 0 });
  const p = project(LOG);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});
