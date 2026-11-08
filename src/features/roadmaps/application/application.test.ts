/* The Roadmaps services over fakes of their ports: the way up the ladder (events in the learning log) and an approved
   restructuring (packs cut and joined, progress moved, nothing lost, nothing written when a check fails). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ok, err, type AsyncResult } from '../../../kernel/result.ts';
import { NoemaError } from '../../../kernel/errors.ts';
import type { Roadmap } from '../domain/model.ts';
import { presetLadder } from '../domain/levels.ts';
import { propose } from '../domain/inbox.ts';
import { planFrom, type PackBundle, type ProgressState } from '../domain/restructure.ts';
import type { RoadmapEvent } from '../domain/events.ts';
import type { RoadmapEventLog, RoadmapPacks } from './ports.ts';
import { createLevelService } from './levels.ts';
import { applyProposal, declineProposal } from './restructure.ts';

const NOW = Date.UTC(2026, 10, 8, 12);

/** the value, asserted to be there */
const def = <T>(x: T | null | undefined): T => {
  assert.ok(x !== undefined && x !== null);
  return x;
};

function memLog(): RoadmapEventLog & { all: RoadmapEvent[] } {
  const all: RoadmapEvent[] = [];
  return {
    all,
    append(_a, events) {
      const add = events.filter(e => !all.some(x => x.id === e.id));
      all.push(...add);
      return Promise.resolve(ok(add.length));
    },
    list(_a, roadmap) {
      return Promise.resolve(ok(all.filter(e => !roadmap || e.roadmap === roadmap)));
    },
  };
}

const rm = (): Roadmap => ({
  id: 'cx',
  title: 'Course',
  language: 'en',
  levels: presetLadder('semester', 1, 3),
  nodes: {
    a: { id: 'a', title: 'A', level: 's1', chapters: [] },
    b: {
      id: 'b',
      title: 'B',
      level: 's2',
      chapters: [
        { ref: 'c1', title: 'One' },
        { ref: 'c2', title: 'Two' },
      ],
      pack: { id: 'cx-b', status: 'ready' },
    },
    c: { id: 'c', title: 'C', level: 's3', chapters: [] },
  },
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ],
});

test('levels: moving up is automatic, one level after the other, recorded once', async () => {
  const log = memLog(),
    L = createLevelService(log),
    c = rm(),
    mastered = new Set(['a', 'b']);
  const r = await L.advance('u1', c, id => mastered.has(id), NOW);
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.reached.map(e => e.level),
    ['s1', 's2'],
  );
  const again = await L.advance('u1', c, id => mastered.has(id), NOW + 1);
  assert.ok(again.ok && again.value.reached.length === 0);
  assert.equal(log.all.length, 2);
  const v = await L.view('u1', c, id => mastered.has(id));
  assert.ok(v.ok);
  assert.equal(v.value.current?.id, 's3');
});

test('levels: with a level test, the test is due first; a passed one moves up', async () => {
  const log = memLog(),
    L = createLevelService(log),
    c = { ...rm(), levelTest: true },
    m = (id: string) => id === 'a';
  const r = await L.advance('u1', c, m, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.value, { reached: [], testDue: 's1' });
  const failed = await L.testTaken('u1', c, 's1', 0.5, { now: NOW, attempt: 't1', mastered: m });
  assert.ok(failed.ok && !failed.value.passed && failed.value.reached.length === 0);
  const passed = await L.testTaken('u1', c, 's1', 0.9, { now: NOW + 1, attempt: 't2', mastered: m });
  assert.ok(passed.ok && passed.value.passed);
  assert.deepEqual(
    passed.value.reached.map(e => [e.level, e.how]),
    [['s1', 'test']],
  );
});

function packsFake(bundles: Record<string, PackBundle>, states: Record<string, ProgressState> = {}, failSave = false) {
  const saved: string[] = [],
    removed: string[] = [];
  const packs: RoadmapPacks = {
    load(_a, id): AsyncResult<PackBundle> {
      const b = bundles[id];
      return Promise.resolve(b ? ok(structuredClone(b)) : err(new NoemaError('roadmap.restructure', id)));
    },
    save(_a, b) {
      if (failSave) return Promise.resolve(err(new NoemaError('roadmap.restructure', 'disk full')));
      saved.push(b.pack.subject.id);
      bundles[b.pack.subject.id] = structuredClone(b);
      return Promise.resolve(ok(undefined));
    },
    remove(_a, id) {
      removed.push(id);
      Reflect.deleteProperty(bundles, id);
      return Promise.resolve(ok(undefined));
    },
    state: (_a, id) => states[id] ?? null,
    setState(_a, id, st) {
      states[id] = st;
      return Promise.resolve(ok(undefined));
    },
  };
  return { packs, saved, removed, bundles, states };
}
const bundleB = (): PackBundle => ({
  pack: {
    subject: { id: 'cx-b', title: 'B' },
    chapters: [
      { id: 'ch01', title: 'One', sections: [{ id: 'ch01-s01' }], exercises: [{ id: 'ch01-e1' }] },
      { id: 'ch02', title: 'Two', sections: [{ id: 'ch02-s01' }], exercises: [{ id: 'ch02-e1' }] },
    ],
  },
  translations: { fr: { locale: 'fr', pack: 'cx-b', chapters: [{ id: 'ch01' }, { id: 'ch02' }] } },
  bridges: [],
});

test('an approved split: new pack first, progress and translations follow, the event lists what moved', async () => {
  const c = rm();
  const plan = planFrom(c, {
    why: 'Two is third-semester work',
    split: [
      {
        step: '@b',
        parts: [
          { title: 'B one', level: 's2', chapters: ['c1'] },
          { title: 'B two', level: 's3', chapters: ['c2'] },
        ],
      },
    ],
  });
  assert.ok(plan.ok, JSON.stringify(!plan.ok && plan.error));
  propose(c, { v: 1, kind: 'restructure', id: 'rs1', plan: plan.value, at: new Date(NOW).toISOString() });
  const log = memLog(),
    f = packsFake({ 'cx-b': bundleB() }, { 'cx-b': { read: { 'ch01-s01': 1, 'ch02-s01': 1 }, res: { 'ch02-e1': 1 } } });
  const r = await applyProposal('u1', c, 'rs1', { packs: f.packs, log, now: NOW });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error.message));
  assert.deepEqual(r.value.before, r.value.after);
  const second = f.saved.find(id => id !== 'cx-b') ?? '';
  assert.equal(f.saved[0], second, 'the new pack is written before the changed one');
  assert.deepEqual(f.states['cx-b']?.read, { 'ch01-s01': 1 });
  assert.deepEqual(f.states[second]?.res, { 'ch02-e1': 1 });
  assert.deepEqual(
    f.bundles[second]?.translations.fr?.chapters.map(x => x.id),
    ['ch02'],
  );
  assert.deepEqual(r.value.event.moves, [{ item: 'ch02', from: 'cx-b', to: second }]);
  assert.equal(log.all[0]?.type, 'roadmap.restructured');
  assert.equal(r.value.roadmap.proposals?.[0]?.status, 'applied');
  assert.equal(c.proposals?.[0]?.status, 'pending', 'the given Roadmap is not changed');
});

test('a restructuring that cannot be checked writes nothing; a declined one changes nothing else', async () => {
  const c = rm();
  const plan = planFrom(c, { why: 'x', steps: [{ step: '@c', level: 's2' }] });
  assert.ok(plan.ok);
  const p2 = planFrom(rm(), {
    why: 'x',
    split: [
      {
        step: '@b',
        parts: [
          { title: 'B one', chapters: ['c1'] },
          { title: 'B two', chapters: ['c2'] },
        ],
      },
    ],
  });
  assert.ok(p2.ok);
  const bad = rm();
  def(bad.nodes.b).chapters = [
    { ref: 'c1', title: 'Zero' },
    { ref: 'c2', title: 'Elsewhere' },
    { ref: 'c3', title: 'Extra' },
  ];
  propose(bad, {
    v: 1,
    kind: 'restructure',
    id: 'rs2',
    plan: {
      ...p2.value,
      split: [
        {
          step: 'b',
          parts: [
            { id: 'b', title: 'x', chapters: ['c1'] },
            { id: 'b2', title: 'y', chapters: ['c2', 'c3'] },
          ],
        },
      ],
    },
    at: '',
  });
  const f = packsFake({ 'cx-b': bundleB() });
  const r = await applyProposal('u1', bad, 'rs2', { packs: f.packs, log: memLog(), now: NOW });
  assert.ok(!r.ok);
  assert.equal(r.error.code, 'roadmap.restructure');
  assert.deepEqual(f.saved, []);
  assert.deepEqual(f.removed, []);
  const missing = await applyProposal('u1', rm(), 'nope', { packs: f.packs, log: memLog(), now: NOW });
  assert.ok(!missing.ok);
  propose(c, { v: 1, kind: 'restructure', id: 'rs3', plan: plan.value, at: '' });
  const d = declineProposal(c, 'rs3', NOW);
  assert.equal(d.proposals?.[0]?.status, 'declined');
  assert.equal(d.nodes.c?.level, 's3');
});
