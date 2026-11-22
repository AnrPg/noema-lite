/* 📑 chapters added to a step after its plan, and 🌐 a Roadmap's languages (chapters.ts) — on steps 2 and 3 of the learner's
   electronics Roadmap (tests/fixtures/electronics_steps.js). */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import type { Roadmap, Step } from './model.ts';
import {
  addChapters,
  alignPackChapters,
  checkAddChapters,
  checkLanguages,
  matchChapters,
  mergeAddedChapters,
  packExtras,
  setLanguages,
} from './chapters.ts';
import { mergePlans } from './plans.ts';
import { checkI18n, setI18n, shownNode } from './i18n.ts';
import { merged } from './inbox.ts';
import { chaptersEntry } from './chapters.ts';

const F = createRequire(import.meta.url)('../../../../tests/fixtures/electronics_steps.js') as {
  step2: Step;
  step3: Step;
  add2: { chapters: unknown[] };
  add3: { chapters: unknown[] };
  ORDER2: string[];
  ORDER3: string[];
};
const roadmap = (): Roadmap => ({
  id: 'cg4tmvvv8',
  language: 'en',
  provider: 'claudeapp',
  stage: 'done',
  nodes: { [F.step2.id]: structuredClone(F.step2), [F.step3.id]: structuredClone(F.step3) },
  edges: [{ from: F.step2.id, to: F.step3.id }],
});
const refs = (c: Roadmap, id: string): string[] => (c.nodes[id]?.chapters ?? []).map(ch => ch.ref);
const NOW = Date.parse('2026-11-17T14:00:00Z');

test('the transformers chapter goes into step 2, the two device chapters into step 3, in place, steps still prepared', () => {
  const c = roadmap();
  for (const [id, add] of [
    [F.step2.id, F.add2],
    [F.step3.id, F.add3],
  ] as const) {
    const r = checkAddChapters(c, id, add.chapters);
    assert.deepEqual(r.errors, []);
    addChapters(c, id, r.fresh, NOW);
  }
  assert.deepEqual(refs(c, F.step2.id), F.ORDER2);
  assert.deepEqual(refs(c, F.step3.id), F.ORDER3);
  assert.equal(c.nodes[F.step2.id]?.pack?.status, 'ready');
  assert.equal(c.nodes[F.step3.id]?.pack?.status, 'ready');
  assert.deepEqual(c.edges, [{ from: F.step2.id, to: F.step3.id }]);
  // the same request again: nothing changes
  const again = checkAddChapters(c, F.step3.id, F.add3.chapters);
  assert.deepEqual([again.errors, again.fresh, again.already], [[], [], ['semiconductor_physics', 'advanced_devices']]);
});

test('duplicate refs, an unknown place and an empty title are refused with the reason', () => {
  const c = roadmap();
  const e = checkAddChapters(c, F.step2.id, [
    { ref: 'inductor_ode', title: 'Something else', after: 'capacitor_ode' },
    { ref: 'x1', title: 'A', after: 'nowhere' },
    { ref: 'x2', title: '  ' },
    { ref: 'x3', title: 'B' },
    { ref: 'x3', title: 'C' },
  ]).errors;
  assert.ok(e.some(x => /already has a chapter "inductor_ode"/.test(x)));
  assert.ok(e.some(x => /unknown position "nowhere"/.test(x)));
  assert.ok(e.some(x => /empty title/.test(x)));
  assert.ok(e.some(x => /"x3" is in the list twice/.test(x)));
});

test('the Greek Roadmap translation accepts the added chapters and the step panel shows every one', () => {
  const c = roadmap();
  addChapters(c, F.step2.id, checkAddChapters(c, F.step2.id, F.add2.chapters).fresh, NOW);
  const chapters = Object.fromEntries(
    (c.nodes[F.step2.id]?.chapters ?? []).map(ch => [
      ch.ref,
      { title: 'ΕΛ ' + ch.title, goals: (ch.goals ?? []).map(g => 'ΕΛ ' + g), coverage: (ch.coverage ?? []).map(g => 'ΕΛ ' + g) },
    ]),
  );
  const d = { nodes: { [F.step2.id]: { chapters } } };
  assert.deepEqual(checkI18n(roadmap(), 'el', d).length > 0, true, 'before: "no such chapter"');
  assert.deepEqual(checkI18n(c, 'el', d), []);
  setI18n(c, 'el', d, NOW);
  const shown = shownNode(c, F.step2.id, 'el');
  const shownChapters = shown?.chapters ?? [];
  assert.equal(shownChapters.length, 10);
  assert.ok(shownChapters.every(ch => ch.title.startsWith('ΕΛ ')));
});

test('copies of the Roadmap agree: added chapters come over in mergePlans even on a prepared step; the inbox applies them once', () => {
  const a = roadmap(),
    b = roadmap();
  addChapters(a, F.step3.id, checkAddChapters(a, F.step3.id, F.add3.chapters).fresh, NOW);
  assert.ok(mergePlans(b, a));
  assert.deepEqual(refs(b, F.step3.id), F.ORDER3);
  assert.ok(!mergeAddedChapters(b.nodes[F.step3.id] as Step, a.nodes[F.step3.id] as Step), 'nothing new the second time');
  const e = chaptersEntry(F.step3.id, checkAddChapters(roadmap(), F.step3.id, F.add3.chapters).fresh, NOW);
  const rows = [
    { key: 'a:curin:cg4tmvvv8:1', value: JSON.stringify(e) },
    { key: 'a:curin:cg4tmvvv8:2', value: JSON.stringify(e) },
  ];
  assert.deepEqual(refs(merged(roadmap(), rows, { now: NOW }), F.step3.id), F.ORDER3);
});

test('an upload with more chapters than the plan: the extras, placed after the chapter the pack puts before them', () => {
  const n = roadmap().nodes[F.step3.id] as Step;
  const pack = [
    'Non-idealities of resistors, capacitors and inductors',
    'Semiconductor physics: bands, doping and the pn junction',
    'Diodes, LEDs and Zener diodes',
    'The BJT as a switch and amplifier',
    'The MOSFET as a switch: low-side, high-side, gate drive',
    'Advanced device behaviour: BJT, MOSFET physics, breakdown, SOA and wide-bandgap',
    'Inductive loads and flyback protection',
    'Op-amps: ideal rules and real limits',
    'Relays, SSRs and optocouplers',
    'Reading datasheets and schematics',
  ].map((title, i) => ({ id: `ch${i + 1}`, title, sections: [{ title: 'Section of ' + title }] }));
  const x = packExtras(n, pack);
  assert.deepEqual(
    x?.map(a => [a.title.slice(0, 20), a.after]),
    [
      ['Semiconductor physic', 'real_r_c_l'],
      ['Advanced device beha', 'mosfet_switching'],
    ],
  );
  assert.deepEqual(
    packExtras(
      n,
      pack.map(p => ({ ...p, title: 'Renamed ' + p.title })),
    )?.map(a => a.after),
    ['real_r_c_l', 'mosfet_switching'],
    'titles that changed a little: lined up by their words',
  );
  assert.equal(
    packExtras(
      n,
      pack.map((p, i) => ({ ...p, title: `Part ${String(i + 1)}` })),
    ),
    null,
    'more chapters than the plan and no title in common: no guess',
  );
  assert.deepEqual(
    packExtras(
      n,
      pack.slice(0, 8).map((p, i) => ({ ...p, title: n.chapters?.[i]?.title ?? '' })),
    ),
    [],
    'same chapters: nothing to add',
  );
});

test('the languages of a Roadmap are checked', () => {
  assert.deepEqual(checkLanguages({ language: 'en' }, { translations: ['el'], bridges: ['en>el', 'el→en'] }), {
    errors: [],
    value: { translations: ['el'], bridges: ['en>el', 'el>en'] },
  });
  const bad = checkLanguages({ language: 'en' }, { translations: ['en', 'x'], bridges: ['ru>el', 'el>el'] }).errors;
  assert.equal(bad.length, 4);
});

test('review cases: one title twice in a request, insertion order across copies, a newer plan, a pack that does not line up', () => {
  const c = roadmap();
  assert.ok(
    checkAddChapters(c, F.step2.id, [
      { ref: 'tr1', title: 'Transformers' },
      { ref: 'tr2', title: 'transformers' },
    ]).errors.some(e => /already has “Transformers”/.test(e)),
  );
  // x after inductor_ode, then y before x: [.., inductor_ode, y, x, ..] on every copy
  const a = roadmap();
  addChapters(a, F.step2.id, checkAddChapters(a, F.step2.id, [{ ref: 'x', title: 'X', after: 'inductor_ode' }]).fresh, NOW);
  addChapters(a, F.step2.id, checkAddChapters(a, F.step2.id, [{ ref: 'y', title: 'Y', before: 'x' }]).fresh, NOW + 1000);
  const b = roadmap();
  mergePlans(b, a);
  assert.deepEqual(refs(b, F.step2.id).slice(1, 4), ['inductor_ode', 'y', 'x']);
  assert.deepEqual(refs(b, F.step2.id), refs(a, F.step2.id));
  // an unprepared step: a chapter added here after the other copy's newer plan survives that plan
  const u = roadmap(),
    v = roadmap();
  for (const r of [u, v]) Reflect.deleteProperty(r.nodes[F.step3.id] as Step, 'pack');
  addChapters(u, F.step3.id, checkAddChapters(u, F.step3.id, [{ ref: 'late', title: 'Late chapter' }]).fresh, NOW + 5000);
  const vn = v.nodes[F.step3.id] as Step;
  vn.chapters = [{ ref: 'p1', title: 'New plan chapter' }];
  vn.plannedAt = new Date(NOW).toISOString();
  mergePlans(u, v);
  assert.deepEqual(refs(u, F.step3.id), ['p1', 'late']);
  // a pack with as many chapters, one title changed (the R3 case): lined up by place, nothing to add, the changed one reported
  const n = roadmap().nodes[F.step3.id] as Step;
  const titles = (n.chapters ?? []).map(ch => ch.title);
  titles[2] = 'Something else entirely';
  assert.deepEqual(
    packExtras(
      n,
      titles.map(title => ({ title })),
    ),
    [],
  );
  const al = alignPackChapters(
    n.chapters ?? [],
    titles.map((title, i) => ({ id: `ch${String(i + 1).padStart(2, '0')}`, title })),
  );
  assert.equal(al.pairs.length, titles.length, 'every planned chapter lined up');
  assert.deepEqual(
    al.pairs.filter(x => !x.same).map(x => [x.ref, x.id, x.title]),
    [[n.chapters?.[2]?.ref, 'ch03', 'Something else entirely']],
  );
});

test('lining a pack up with its plan: ref, title, close title, then place', () => {
  const plan = ['Leading strand', 'Lagging strand and Okazaki fragments', 'Helicase', 'Primase', 'Review questions R3'].map((title, i) => ({
    ref: `r${String(i + 1)}`,
    title,
  }));
  // R6: no title matches, the same number of chapters → each by its place
  const r6 = alignPackChapters(
    plan,
    ['Α', 'Β', 'Γ', 'Δ', 'Ε'].map((title, i) => ({ id: `ch0${String(i + 1)}`, title })),
  );
  assert.deepEqual(
    r6.pairs.map(x => [x.ref, x.id]),
    plan.map((ch, i) => [ch.ref, `ch0${String(i + 1)}`]),
  );
  assert.deepEqual([r6.unplanned, r6.extra], [[], []]);
  // a ref wins over the order of titles; a chapter the plan lacks between two matches is an extra placed after the first
  const x = alignPackChapters(plan, [
    { id: 'ch01', title: 'Leading strand' },
    { id: 'ch02', title: 'Lagging strand, Okazaki fragments' },
    { id: 'ch03', title: 'Topoisomerases' },
    { id: 'ch04', title: 'DNA helicase', ref: 'r3' },
    { id: 'ch05', title: 'Primase' },
    { id: 'ch06', title: 'Final test R3' },
  ]);
  assert.deepEqual(
    x.pairs.map(p => [p.ref, p.id, p.same]),
    [
      ['r1', 'ch01', true],
      ['r2', 'ch02', false],
      ['r3', 'ch04', false],
      ['r4', 'ch05', true],
      ['r5', 'ch06', false],
    ],
  );
  assert.deepEqual(
    x.extra.map(e => [e.title, e.after]),
    [['Topoisomerases', 'r2']],
  );
  // the line-up is recorded on the planned chapters; a later one wins, an older one changes nothing
  const c = { nodes: { s: { id: 's', title: 'S', chapters: plan.map(ch => ({ ...ch })) } }, edges: [] } as unknown as Roadmap;
  const m = x.pairs.map(p => ({ ref: p.ref, id: p.id, title: p.title }));
  assert.equal(matchChapters(c, 's', m, '2026-11-22T10:00:00.000Z').length, 5);
  assert.deepEqual(c.nodes.s?.chapters?.[1]?.pack, {
    id: 'ch02',
    title: 'Lagging strand, Okazaki fragments',
    at: '2026-11-22T10:00:00.000Z',
  });
  assert.equal(matchChapters(c, 's', m, '2026-11-22T09:00:00.000Z').length, 0);
});

test('a delayed languages entry never overrides newer languages', () => {
  const c = roadmap();
  assert.ok(setLanguages(c, { translations: ['fr'] }, '2026-11-17T14:00:00.000Z'));
  assert.ok(!setLanguages(c, { translations: ['el'] }, '2026-11-17T13:00:00.000Z'));
  assert.deepEqual(c.languages?.translations, ['fr']);
});
