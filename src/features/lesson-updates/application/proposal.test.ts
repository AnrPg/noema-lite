/* noema-lite — a proposal of several lessons (docs/LESSON_UPDATES.md §3): what a chat brings goes into each chapter whose
   topic it is, one part per chapter; the parts are checked, applied and shown in the order of the chapters, each on the
   lesson the parts before it left, so Q0 holds across the subject (a part never uses what a later chapter teaches). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProposal,
  asProposal,
  briefFor,
  chaptersOf,
  choicesOf,
  prepareProposal,
  proposalPicks,
  verifyProposal,
  type LessonRequest,
} from '../domain/index.ts';
import { base2, checks, copy, para, trBlocks } from './lesson.fixture.ts';
import type { Obj } from '../../content/domain/util.ts';

const blocks = (text: string) => [para(text)];
const door = blocks(
  'Picture the current as the people who pass a door each second: the more who pass, the larger the current, whatever the size of the crowd in the hall.',
);
const slide = blocks(
  'Picture the voltage as the height of a slide: each coulomb that goes down it gets the same push, however many coulombs go down together in a minute.',
);
const part = (chapter: string, section: string, b: unknown[], extra: Record<string, unknown> = {}) => ({
  chapter,
  ops: [{ op: 'blocks', section, blocks: b, i18n: trBlocks(b) }],
  ...extra,
});
const answer = (parts: unknown[], extra: Record<string, unknown> = {}) => ({
  format: 'noema-lesson-update',
  v: 1,
  pack: 'circ-demo',
  summary: 'A picture for current, and one for voltage in its own lesson.',
  parts,
  ...extra,
});
const textOf = (o: unknown): string => JSON.stringify(o);

test('several lessons: each part in its chapter, in the order of the chapters, every language', () => {
  const b = base2();
  const r = prepareProposal(checks, b, answer([part('ch02', 'ch02-s01', slide), part('ch01', 'ch01-s02', door)]));
  assert.deepEqual(r.problems, []);
  const p = r.proposal;
  assert.ok(p);
  assert.deepEqual(
    p.parts.map(x => x.chapter),
    ['ch01', 'ch02'],
    'sorted by the chapters',
  );
  assert.equal(p.summary, 'A picture for current, and one for voltage in its own lesson.');
  assert.ok(
    p.parts.every(x => x.base?.chapter),
    'each part knows the chapter it was made for',
  );
  assert.deepEqual(
    chaptersOf(b, p).map(c => c.title),
    ['Charge and current', 'Voltage'],
  );
  const a = applyProposal(b, p);
  const [c1, c2] = a.pack['chapters'] as Obj[];
  assert.match(textOf(c1), /people who pass a door/);
  assert.doesNotMatch(textOf(c1), /height of a slide/);
  assert.match(textOf(c2), /height of a slide/);
  assert.match(textOf(a.translations['el']), /height of a slide/, 'the Greek file has it too');
  assert.deepEqual(verifyProposal(checks, b, p, {}), { errors: [], changed: false });
});

test('Q0 across the subject: a part never uses what a later chapter teaches', () => {
  const b = base2();
  const early = blocks(
    'The current in a wire grows with the voltage across it, so a higher voltage pushes more charge each second through the same lamp in the room.',
  );
  const r = prepareProposal(checks, b, answer([part('ch01', 'ch01-s02', early), part('ch02', 'ch02-s01', slide)]));
  assert.equal(r.proposal, null);
  assert.ok(
    r.problems.some(e => e.startsWith('[part ch01]') && /voltage.*ch02 introduces later/.test(e)),
    r.problems.join('\n'),
  );
  assert.ok(!r.problems.some(e => e.startsWith('[part ch02]')), 'the other part is fine, and was checked too');
  assert.ok(
    r.problems.some(e => /this piece belongs in ch02: move it into a part for chapter ch02.*do not drop it/.test(e)),
    'the fix moves it to the lesson that teaches it',
  );
});

test('one part per chapter, choice ids unique across the parts, a summary for the learner', () => {
  const b = base2();
  const two = prepareProposal(checks, b, answer([part('ch01', 'ch01-s02', door), part('ch01', 'ch01-s01', slide)]));
  assert.ok(two.problems.some(e => /two parts for chapter "ch01"/.test(e)));
  const choice = (id: string, sec: string, bl: unknown[]) => ({
    id,
    kind: 'other',
    question: 'Where?',
    recommended: 'a',
    options: [
      { id: 'a', label: 'Here', ops: [{ op: 'blocks', section: sec, blocks: bl, i18n: trBlocks(bl) }] },
      { id: 'b', label: 'Not at all', ops: [] },
    ],
  });
  const dup = prepareProposal(
    checks,
    b,
    answer([
      { chapter: 'ch01', ops: [], choices: [choice('c1', 'ch01-s02', door)] },
      { chapter: 'ch02', ops: [], choices: [choice('c1', 'ch02-s01', slide)] },
    ]),
  );
  assert.ok(dup.problems.some(e => /choice ids must be unique across the parts: c1/.test(e)));
  const none = prepareProposal(checks, b, answer([], { summary: '' }));
  assert.ok(none.problems.some(e => /parts is empty/.test(e)));
  assert.ok(none.problems.some(e => /summary is missing/.test(e)));
  const fine = prepareProposal(
    checks,
    b,
    answer([
      { chapter: 'ch01', ops: [], choices: [choice('c1', 'ch01-s02', door)] },
      { chapter: 'ch02', ops: [], choices: [choice('c2', 'ch02-s01', slide)] },
    ]),
  );
  assert.ok(fine.proposal, fine.problems.join('\n'));
  assert.deepEqual(
    choicesOf(fine.proposal).map(c => c.id),
    ['c1', 'c2'],
  );
  assert.deepEqual(proposalPicks(fine.proposal, { c2: 'b' }), { c1: 'a', c2: 'b' }, 'the recommended one unless picked');
  const a = applyProposal(b, fine.proposal, { c2: 'b' });
  assert.match(textOf(a.pack), /people who pass a door/);
  assert.doesNotMatch(textOf(a.pack), /height of a slide/);
});

test('the older shape (one chapter, "ops") is a proposal of one part; a changed chapter stops it', () => {
  const b = base2();
  const one = {
    format: 'noema-lesson-update',
    v: 1,
    pack: 'circ-demo',
    chapter: 'ch02',
    summary: 's',
    ops: part('ch02', 'ch02-s01', slide).ops,
  };
  const r = prepareProposal(checks, b, one);
  assert.ok(r.proposal);
  assert.equal(r.proposal.parts.length, 1);
  assert.deepEqual(asProposal(r.proposal.parts[0])?.parts.length, 1, 'a stored single update reads as one part');
  const later = copy(b);
  ((later.pack['chapters'] as Obj[])[1] as Record<string, unknown>)['title'] = 'Voltage, again';
  assert.equal(verifyProposal(checks, later, r.proposal, {}).changed, true);
});

test('the brief: the chapter of the chat in full, the others too (or an outline), one part per chapter', () => {
  const b = base2();
  const req: LessonRequest = {
    v: 1,
    id: 'lumfx3k2a1-abcd',
    at: '2026-11-21T17:00:00Z',
    subject: { id: 'circ-demo', title: 'Circuits', language: 'en' },
    chapter: { id: 'ch01', title: 'Charge and current' },
    conversation: { id: 'cv_1', title: 'Current vs charge', turns: 4 },
    locale: 'el',
    files: [],
    state: 'open',
  };
  const t = briefFor({ req, chat: '**Learner:** hi', pack: b.pack, locales: ['el'], files: [], via: 'connector' });
  assert.match(t, /one part per chapter/);
  assert.match(t, /## The other chapters as they are/);
  assert.match(t, /"id":"ch02"/);
  const big = copy(b.pack) as Record<string, unknown>;
  const ch2 = (big['chapters'] as Record<string, unknown>[])[1] as Record<string, unknown>;
  ch2['filler'] = 'x'.repeat(260_000);
  const o = briefFor({ req, chat: '', pack: big, locales: ['el'], files: [], via: 'connector' });
  assert.match(o, /an outline/);
  assert.match(o, /- ch02 “Voltage” \(1 exercises; new ids from ch02-s03 and ch02-e002\)/);
  assert.match(o, /ch02-s01 “What voltage is”/);
  assert.match(o, /noema_get_pack_url with subject_id "circ-demo"/);
  assert.doesNotMatch(o, /xxxxxxxx/);
});
