/* 📑 chapters added to a step after its plan, and 🌐 a Roadmap's languages (chapters.ts) — on steps 2 and 3 of the learner's
   electronics Roadmap (tests/fixtures/electronics_steps.js). */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import type { Roadmap, Step } from './model.ts';
import { addChapters, checkAddChapters, checkLanguages, mergeAddedChapters, packExtras } from './chapters.ts';
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
  assert.equal(
    packExtras(
      n,
      pack.map(p => ({ ...p, title: 'Renamed ' + p.title })),
    ),
    null,
    'titles that do not line up: no guess',
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
