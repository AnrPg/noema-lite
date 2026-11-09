/* The Roadmaps domain: the graph, claims and the queue, the inbox, translations, plans of two copies, levels and the way up,
   and a restructuring by level (plan, apply, packs cut and joined with nothing lost). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Roadmap } from './model.ts';
import { layout, order, packId, reach, topo } from './graph.ts';
import { CLAIM, LEASE, WAIT, claimExpired, claimKey, liveClaims, newClaim, waitingClaim } from './claims.ts';
import { findStep, planBatch, queueAll, settle, stepRefusal, work } from './work.ts';
import { extend, extendProblems, inboxKey, link, linkProblems, merged, pendingProposal, propose, proposeProblems } from './inbox.ts';
import { checkI18n, setI18n, shownNode, shownTitle, trLocale } from './i18n.ts';
import { mergePlans } from './plans.ts';
import { statuses } from './status.ts';
import {
  currentLevel,
  findLevel,
  ladderFrom,
  levelBrief,
  levelName,
  levelProblems,
  levelProgress,
  levelRefFrom,
  levelTestFrom,
  nextLevelStep,
  planLevels,
  presetLadder,
  presetOf,
  stepsAt,
} from './levels.ts';
import {
  applyRestructure,
  bundleCounts,
  changes,
  describe,
  mergeBundles,
  mergeStates,
  planFrom,
  splitBundle,
  splitState,
  type PackBundle,
} from './restructure.ts';
import { foldLevels, levelReached, levelTested } from './events.ts';

const NOW = Date.UTC(2026, 10, 8, 12);
const ISO = new Date(NOW).toISOString();

/** the value, asserted to be there */
const def = <T>(x: T | null | undefined): T => {
  assert.ok(x !== undefined && x !== null);
  return x;
};

/** a physics Roadmap: vectors → mechanics (prepared, 3 chapters) → optics; levels: two semesters */
function rm(): Roadmap {
  return {
    format: 'noema.curriculum/v1',
    id: 'cphys',
    title: 'Physics',
    goal: 'Physics',
    language: 'en',
    provider: 'claudeapp',
    stage: 'plan',
    levels: presetLadder('semester', 1, 2),
    nodes: {
      vectors: { id: 'vectors', title: 'Vectors', role: 'foundation', level: 's1', chapters: [{ ref: 'c1', title: 'Adding vectors' }] },
      mechanics: {
        id: 'mechanics',
        title: 'Mechanics',
        role: 'aspect',
        level: { from: 's1', to: 's2' },
        chapters: [
          { ref: 'c1', title: 'Kinematics' },
          { ref: 'c2', title: 'Forces' },
          { ref: 'c3', title: 'Rigid bodies' },
        ],
        pack: { id: 'cphys-mechanics', status: 'ready' },
      },
      optics: { id: 'optics', title: 'Optics', role: 'aspect', level: 's2', chapters: [] },
    },
    edges: [
      { from: 'vectors', to: 'mechanics' },
      { from: 'mechanics', to: 'optics' },
    ],
  };
}

test('graph: order, cycles, reach, layout, pack ids', () => {
  const c = rm();
  assert.deepEqual(order(c), ['vectors', 'mechanics', 'optics']);
  const t = topo(
    ['a', 'b'],
    [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  );
  assert.equal(t.order, null);
  assert.deepEqual([...t.cycle].sort(), ['a', 'b']);
  assert.deepEqual([...reach('vectors', c.edges)].sort(), ['mechanics', 'optics']);
  assert.equal(Object.keys(layout(c).layer).length, 3);
  assert.equal(packId(c, 'optics'), packId(c, 'optics'));
});

test('claims: a lease, a longer one while the upload waits, live claims', () => {
  const row = (v: unknown, at: number) => ({
    key: claimKey('cphys', 'optics'),
    value: JSON.stringify(v),
    updated_at: new Date(at).toISOString(),
  });
  assert.ok(claimKey('cphys', 'optics').startsWith(CLAIM));
  const r = row(newClaim('optics', NOW, 'run1'), NOW);
  assert.equal(claimExpired(r, NOW + LEASE - 1), false);
  assert.equal(claimExpired(r, NOW + LEASE + 1), true);
  const w = row(waitingClaim('optics', 'p', NOW), NOW);
  assert.equal(claimExpired(w, NOW + LEASE + 1), false);
  assert.equal(claimExpired(w, NOW + WAIT + 1), true);
  assert.equal(liveClaims('cphys', [r], NOW).has('optics'), true);
});

test('work: the queue, a level filter, settle, refusals', () => {
  const c = rm();
  queueAll(c, NOW, new Set(['optics']));
  assert.equal(c.nodes.optics?.pack?.status, 'app');
  const w = work(c);
  assert.ok(w.toPlan.includes('optics'));
  assert.deepEqual(work(c, { level: 's1' }).toPlan, []);
  assert.deepEqual(planBatch(c, ['optics']), ['optics']);
  assert.equal(findStep(c, 'optics'), 'optics');
  assert.equal(findStep(c, 'Optics'), 'optics');
  assert.equal(stepRefusal(c, 'optics'), 'plan');
  const claims = [{ key: claimKey('cphys', 'optics'), value: JSON.stringify(newClaim('optics', NOW, 'r')), updated_at: ISO }];
  const s = settle(c, { claims, packs: [], remote: null, now: NOW, lease: LEASE, wait: WAIT });
  assert.ok(s.nodes.optics?.pack?.claimedAt);
});

test('inbox: a new part with levels, links, a proposal, the merged view', () => {
  const c = rm();
  const e = {
    v: 1 as const,
    kind: 'extend' as const,
    part: { id: 'p2', title: 'Waves', at: ISO },
    nodes: { waves: { id: 'waves', title: 'Waves', level: 's3', chapters: [] } },
    edges: [{ from: 'mechanics', to: 'waves' }],
    levels: [{ id: 's3', kind: 'semester' as const, order: 2, names: { en: 'Semester 3' } }],
  };
  assert.deepEqual(extendProblems(c, e), []);
  extend(c, e, NOW);
  assert.equal(c.levels?.length, 3);
  assert.equal(c.nodes.waves?.level, 's3');
  assert.deepEqual(extendProblems(c, e), ['applied']);
  // a prerequisite above its step is refused
  const L = { v: 1 as const, kind: 'link' as const, id: 'l1', links: [{ from: 'waves', to: 'vectors' }], remove: [] };
  assert.ok(linkProblems(c, L).length > 0);
  const ok1 = { v: 1 as const, kind: 'link' as const, id: 'l2', links: [{ from: 'vectors', to: 'optics' }], remove: [] };
  assert.deepEqual(linkProblems(c, ok1), []);
  assert.deepEqual(link(c, ok1), { added: 1, removed: 0 });
  const plan = planFrom(c, { why: 'Vectors later', steps: [{ step: '@vectors', level: 's2' }] });
  assert.ok(!plan.ok, 'a prerequisite would sit above its step');
  const p2 = planFrom(c, {
    why: 'Waves later',
    steps: [
      { step: '@waves', level: 's3' },
      { step: '@optics', level: { from: 's2', to: 's3' } },
    ],
  });
  assert.ok(p2.ok, JSON.stringify(!p2.ok && p2.error));
  const r = { v: 1 as const, kind: 'restructure' as const, id: 'rs1', plan: p2.value, at: ISO };
  assert.deepEqual(proposeProblems(c, r), []);
  propose(c, r);
  assert.equal(pendingProposal(c)?.id, 'rs1');
  assert.deepEqual(proposeProblems(c, r), ['applied']);
  const rows = [{ key: inboxKey('cphys', '1'), value: JSON.stringify({ ...r, id: 'rs2' }) }];
  const m = merged(c, rows, { now: NOW });
  assert.equal(pendingProposal(m)?.id, 'rs2');
  assert.equal(m.proposals?.filter(x => x.status === 'pending').length, 1);
  assert.equal(pendingProposal(c)?.id, 'rs1', 'the record itself never changes');
});

test('translations: the chain picks the locale, partial ones merge', () => {
  const c = rm();
  assert.deepEqual(checkI18n(c, 'el', { title: 'Φυσική', nodes: { vectors: { title: 'Διανύσματα' } } }), []);
  setI18n(c, 'el', { title: 'Φυσική', nodes: { vectors: { title: 'Διανύσματα' } } }, NOW);
  assert.equal(trLocale(c, 'el', ['el', 'en']), 'el');
  assert.equal(trLocale(c, 'fr', ['fr', 'en']), null);
  assert.equal(shownTitle(c, 'el'), 'Φυσική');
  assert.equal(shownNode(c, 'vectors', 'el')?.title, 'Διανύσματα');
  assert.equal(shownNode(c, 'optics', 'el')?.title, 'Optics');
});

test('plans of two copies: the newer plan, a proposal decided on the other copy', () => {
  const a = rm(),
    b = rm();
  const plan = planFrom(a, {
    why: 'x',
    steps: [
      { step: '@optics', level: 's2' },
      { step: '@vectors', level: null },
    ],
  });
  assert.ok(plan.ok);
  propose(a, { v: 1, kind: 'restructure', id: 'rs1', plan: plan.value, at: ISO });
  propose(b, { v: 1, kind: 'restructure', id: 'rs1', plan: plan.value, at: ISO });
  const applied = applyRestructure(b, plan.value, NOW);
  assert.ok(applied.ok);
  const bb = applied.value.roadmap;
  bb.proposals = (bb.proposals ?? []).map(p => ({ ...p, status: 'applied' as const, decidedAt: new Date(NOW).toISOString() }));
  assert.equal(mergePlans(a, bb), true);
  assert.equal(a.proposals?.[0]?.status, 'applied');
  assert.equal(a.nodes.vectors?.level, undefined);
});

test('levels: presets, a proposed ladder, the step levels of a plan', () => {
  assert.deepEqual(
    presetLadder('grade', 5, 7).map(l => l.id),
    ['g5', 'g6', 'g7'],
  );
  assert.deepEqual(presetOf(def(presetLadder('year', 1, 4)[1])), { key: 'kind.year', n: 2 });
  assert.deepEqual(presetOf(def(presetLadder('difficulty')[2])), { key: 'difficulty.advanced' });
  const g = ladderFrom('grade:5-9');
  assert.ok(g.ok && g.value.length === 5);
  assert.ok(ladderFrom('semester:6').ok);
  assert.ok(!ladderFrom('semesters').ok);
  const own = ladderFrom(
    [
      { id: 'basic', name: 'Grundlagen' },
      { id: 'pro', name: 'Profi' },
    ],
    'de',
  );
  assert.ok(own.ok);
  const l0 = def(own.value[0]);
  assert.equal(levelName(l0, ['de', 'en']), 'Grundlagen');
  assert.equal(levelName(l0, ['fr', 'en']), null);
  assert.equal(levelName(l0, ['fr', 'en'], { any: true }), 'Grundlagen');
  const L = presetLadder('semester', 1, 2);
  assert.deepEqual(levelRefFrom({ from: 's1', to: 's1' }, L, 'x'), { ok: true, value: 's1' });
  assert.ok(!levelRefFrom('s9', L, 'x').ok);
  const p = planLevels(
    { levels: 'semester:2', steps: [{ ref: 'a', level: 's1' }, { ref: 'b', level: { from: 's1', to: 's2' } }, { ref: 'c' }] },
    'en',
  );
  assert.ok(p.ok);
  assert.deepEqual(p.value.of, { a: 's1', b: { from: 's1', to: 's2' } });
  // a new part adds levels at the top; a ladder of another kind is refused
  const q = planLevels({ levels: 'semester:3', steps: [{ ref: 'n1', level: 's3' }] }, 'en', L);
  assert.ok(q.ok);
  assert.deepEqual(
    q.value.add.map(l => [l.id, l.order]),
    [['s3', 2]],
  );
  assert.ok(!planLevels({ levels: 'year:2' }, 'en', L).ok);
  assert.ok(!planLevels({ steps: [{ ref: 'x', level: 's1' }] }, 'en', []).ok);
  assert.deepEqual(planLevels({ levels: [] }, 'en', L), { ok: true, value: { add: [], ladder: L, of: {} } });
});

test('levels: the rules, where steps sit, progress and the way up', () => {
  const c = rm();
  assert.deepEqual(levelProblems(c), []);
  const bad = rm();
  def(bad.nodes.vectors).level = 's2';
  def(bad.nodes.mechanics).level = 's1';
  assert.ok(levelProblems(bad).length > 0, 'a prerequisite above its step');
  assert.deepEqual(stepsAt(c, 's1').sort(), ['mechanics', 'vectors']);
  assert.deepEqual(stepsAt(c, 's2').sort(), ['mechanics', 'optics']);
  assert.equal(findLevel(c, 'Semester 2')?.id, 's2');
  const mastered = new Set(['vectors']);
  const m = (id: string) => mastered.has(id);
  assert.deepEqual(
    levelProgress(c, m).map(x => [x.id, x.done]),
    [
      ['s1', true],
      ['s2', false],
    ],
  );
  assert.equal(currentLevel(c, []), c.levels?.[0]);
  assert.deepEqual(nextLevelStep(c, m, new Set(), new Set()), { kind: 'reach', level: 's1', next: 's2' });
  c.levelTest = true;
  assert.equal(nextLevelStep(c, m, new Set(), new Set())?.kind, 'test');
  assert.equal(nextLevelStep(c, m, new Set(), new Set(['s1']))?.kind, 'reach');
  const f = foldLevels([levelReached('cphys', 's1', null, 'auto', NOW), levelTested('cphys', 's2', 0.5, false, NOW, 'a1')], 'cphys');
  assert.deepEqual([...f.reached], ['s1']);
  assert.equal(currentLevel(c, f.reached)?.id, 's2');
  assert.match(levelBrief(c, 's2'), /"levels": \["s2"\]/);
});

test('the level test: questions taken in turn from every pack, none without enough', () => {
  const mcq = (i: number) => ({ id: `e${String(i)}`, type: 'mcq', q: `Q${String(i)}`, options: ['a', 'b', 'c'], answer: 1 });
  const tf = (i: number) => ({ id: `t${String(i)}`, type: 'tf', q: `T${String(i)}`, answer: true });
  const packs = [
    {
      chapters: [
        {
          exercises: [mcq(1), mcq(2), mcq(3), mcq(4), mcq(5), { id: 'x', type: 'mcq', q: 'multi', multi: true, options: ['a'], answer: 0 }],
        },
      ],
    },
    { chapters: [{ exercises: [tf(1), tf(2), tf(3), tf(4), tf(5)] }] },
  ];
  const qs = levelTestFrom(packs, { rand: () => 0, tf: ['yes', 'no'], count: 8 });
  assert.equal(qs.length, 8);
  assert.equal(qs.filter(q => q.q.startsWith('T')).length, 4, 'both packs are tested');
  assert.deepEqual(qs.find(q => q.q === 'T1')?.options, ['yes', 'no']);
  assert.ok(!qs.some(q => q.q === 'multi'));
  assert.deepEqual(levelTestFrom([def(packs[1])], { rand: () => 0, tf: ['yes', 'no'] }), []);
});

/** the mechanics pack: 3 chapters with sections, exercises, a translation and a bridge */
function bundle(id = 'cphys-mechanics', prefix = ''): PackBundle {
  const ch = (n: number) => ({
    id: `${prefix}ch0${String(n)}`,
    title: ['Kinematics', 'Forces', 'Rigid bodies'][n - 1] ?? 'x',
    sections: [{ id: `${prefix}ch0${String(n)}-s01` }],
    exercises: [{ id: `${prefix}ch0${String(n)}-e1` }, { id: `${prefix}ch0${String(n)}-e2` }],
    flashcards: [{ id: `${prefix}ch0${String(n)}-f1` }],
  });
  return {
    pack: { subject: { id, title: 'Mechanics' }, chapters: [ch(1), ch(2), ch(3)] },
    translations: { el: { locale: 'el', pack: id, chapters: [{ id: `${prefix}ch01` }, { id: `${prefix}ch02` }, { id: `${prefix}ch03` }] } },
    bridges: [
      {
        format: 'noema-bridge',
        pack: id,
        source: 'en',
        native: 'el',
        chapters: [`${prefix}ch01`, `${prefix}ch02`, `${prefix}ch03`],
        of: 3,
        sections: { [`${prefix}ch01-s01`]: { terms: ['velocity'] }, [`${prefix}ch03-s01`]: { terms: ['torque'] } },
        anchors: [{ at: `${prefix}ch03-s01/0` }],
        entries: [],
      },
    ],
  };
}

test('restructure: split a prepared step in two levels — ids kept, nothing lost', () => {
  const c = rm();
  const plan = planFrom(c, {
    why: 'Rigid bodies is second-semester material',
    split: [
      {
        step: '@mechanics',
        parts: [
          { title: 'Mechanics I', level: 's1', chapters: ['c1', 'c2'] },
          { title: 'Rigid bodies', level: 's2', chapters: ['c3'] },
        ],
      },
    ],
  });
  assert.ok(plan.ok, JSON.stringify(!plan.ok && plan.error));
  const part2 = plan.value.split?.[0]?.parts[1]?.id ?? '';
  assert.equal(plan.value.split?.[0]?.parts[0]?.id, 'mechanics', 'the first part keeps the step id');
  assert.equal(changes(c, plan.value)[0]?.kind, 'split');
  assert.match(describe(c, plan.value), /split into/);
  const r = applyRestructure(c, plan.value, NOW);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error));
  const out = r.value.roadmap;
  assert.deepEqual(
    out.nodes.mechanics?.chapters?.map(ch => ch.ref),
    ['c1', 'c2'],
  );
  assert.deepEqual(
    out.nodes[part2]?.chapters?.map(ch => ch.ref),
    ['c3'],
  );
  assert.ok(
    out.edges.some(e => e.from === 'vectors' && e.to === 'mechanics'),
    'incoming links go to the first part',
  );
  assert.ok(
    out.edges.some(e => e.from === 'mechanics' && e.to === part2),
    'the parts form a chain',
  );
  assert.ok(
    out.edges.some(e => e.from === part2 && e.to === 'optics'),
    'outgoing links leave from the last part',
  );
  assert.equal(r.value.packs.split[0]?.pack, 'cphys-mechanics');
  assert.equal(def(def(r.value.packs.split[0]).parts[0]).pack, 'cphys-mechanics', 'the first part keeps the pack id');
  // the pack side
  const b = bundle();
  const cut = splitBundle(b, [
    { pack: 'cphys-mechanics', title: 'Mechanics I', chapters: ['ch01', 'ch02'], levels: ['s1'] },
    { pack: 'cphys-rigid', title: 'Rigid bodies', chapters: ['ch03'], levels: ['s2'] },
  ]);
  assert.ok(cut.ok);
  assert.deepEqual(bundleCounts(cut.value), bundleCounts([b]));
  assert.deepEqual(
    cut.value[1]?.translations.el?.chapters.map(x => x.id),
    ['ch03'],
  );
  const part2b = def(cut.value[1]);
  assert.deepEqual(Object.keys(def(part2b.bridges[0]).sections ?? {}), ['ch03-s01']);
  assert.deepEqual(part2b.pack.subject.levels, ['s2']);
  assert.ok(!splitBundle(b, [{ pack: 'x', title: 'x', chapters: ['ch01'], levels: [] }]).ok, 'a chapter in no part is refused');
  const st = splitState(
    { read: { 'ch01-s01': 1, 'ch03-s01': 1 }, res: { 'ch03-e1': { ok: 1 } }, xp: 5 },
    cut.value.map(x => x.pack.chapters),
  );
  assert.deepEqual(st[0]?.read, { 'ch01-s01': 1 });
  assert.deepEqual(st[1]?.res, { 'ch03-e1': { ok: 1 } });
  assert.deepEqual(mergeStates(st).read, { 'ch01-s01': 1, 'ch03-s01': 1 });
});

test('restructure: merge two steps; ids that would clash and shared prepared steps are refused', () => {
  const c = rm();
  def(c.nodes.optics).chapters = [{ ref: 'c1', title: 'Lenses' }];
  def(c.nodes.optics).pack = { id: 'cphys-optics', status: 'ready' };
  const plan = planFrom(c, { why: 'One subject', merge: [{ into: '@mechanics', steps: ['@optics'], title: 'Mechanics and optics' }] });
  assert.ok(plan.ok, JSON.stringify(!plan.ok && plan.error));
  const r = applyRestructure(c, plan.value, NOW);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error));
  assert.equal(r.value.roadmap.nodes.optics, undefined);
  assert.equal(r.value.roadmap.nodes.mechanics?.chapters?.length, 4, 'the chapter refs are renamed on a clash, none lost');
  assert.equal(new Set(def(r.value.roadmap.nodes.mechanics).chapters?.map(ch => ch.ref)).size, 4);
  const a = bundle(),
    o = bundle('cphys-optics', 'o');
  const j = mergeBundles(a, [o], { levels: ['s1', 's2'] });
  assert.ok(j.ok);
  assert.deepEqual(bundleCounts([j.value]), bundleCounts([a, o]));
  assert.equal(j.value.translations.el?.chapters.length, 6);
  assert.ok(!mergeBundles(a, [bundle('again')], { levels: [] }).ok, 'clashing chapter ids');
  const sh = rm();
  sh.shared = { role: 'owner' };
  const p = planFrom(sh, { why: 'x', merge: [{ into: '@mechanics', steps: ['@optics'] }] });
  assert.ok(!p.ok || !applyRestructure(sh, p.value, NOW).ok, 'a prepared step of a shared Roadmap is not joined');
});

test('restructure: an attached subject never changes, only its level', () => {
  const c = rm();
  def(c.nodes.mechanics).pack = { id: 'my-mech', status: 'ready', assigned: { from: 'me' } };
  const s = planFrom(c, {
    why: 'x',
    split: [
      {
        step: '@mechanics',
        parts: [
          { title: 'A', chapters: ['c1'] },
          { title: 'B', chapters: ['c2', 'c3'] },
        ],
      },
    ],
  });
  assert.ok(!s.ok);
  const l = planFrom(c, { why: 'x', steps: [{ step: '@mechanics', level: 's1' }] });
  assert.ok(l.ok);
  const r = applyRestructure(c, l.value, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.value.packs.levels, [], "the learner's own subject is not rewritten");
});

test('statuses never loop on a cycle', () => {
  const c = rm();
  c.edges.push({ from: 'optics', to: 'vectors' });
  const st = statuses(c, () => ({ mastered: false, pct: 0, score: 0, read: 0 }), {});
  assert.equal(Object.keys(st).length, 3);
});

test('inbox rows are data: a link without "remove", a part without links, a broken plan', () => {
  const c = rm();
  const l = { v: 1 as const, kind: 'link' as const, links: [{ from: 'vectors', to: 'optics' }] };
  assert.deepEqual(linkProblems(c, l), []);
  assert.deepEqual(link(c, l), { added: 1, removed: 0 });
  const e = {
    v: 1 as const,
    kind: 'extend' as const,
    part: { id: 'p9', title: 'More' },
    nodes: { extra: { id: 'extra', title: 'Extra' } },
  };
  assert.deepEqual(extendProblems(c, e), []);
  assert.deepEqual(extend(c, e, NOW), ['extra']);
  assert.deepEqual(extendProblems(c, { v: 1, kind: 'extend' }), ['an empty part']);
  assert.deepEqual(proposeProblems(c, JSON.parse('{"v":1,"kind":"restructure","id":"x"}') as Parameters<typeof proposeProblems>[1]), [
    'not a restructuring plan',
  ]);
});
