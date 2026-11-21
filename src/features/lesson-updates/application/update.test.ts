/* noema-lite — lesson updates from a chat (docs/LESSON_UPDATES.md): the shape, the additions in every language, the gate
   (only the errors the update brings count), the fixes it makes by itself (an addition placed after the section that
   teaches what it uses; the choice "keep it here with a short definition"), the learner's choices (a repetition, a
   section already full), the base that changed, the diff the review shows and the brief for Claude — with the app's own
   content checks (src/features/content) on a gradual chapter of the real case of Q0 (tests/gradual.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAll,
  briefFor,
  chapterDiff,
  chapterHash,
  chatFiles,
  chatMarkdown,
  newErrors,
  opsFor,
  prepare,
  shapeProblems,
  verify,
  type LessonRequest,
  type LessonUpdate,
} from '../domain/index.ts';
import type { Obj } from '../../content/domain/util.ts';
import { base, chapter, checks, copy, para, sec, trBlocks, update } from './lesson.fixture.ts';

test('the shape: every problem at once, every language, additions only', () => {
  const ids = { sections: ['ch01-s01', 'ch01-s02'], exercises: ['ch01-e001'] };
  const P = shapeProblems(
    update([
      { op: 'blocks', section: 'ch01-s09', blocks: [para('x')] },
      { op: 'replace', section: 'ch01-s01', at: 0, block: para('y'), i18n: { el: para('ψ') } },
      { op: 'exercises', items: [{ id: 'ch01-e001', type: 'tf', section: 'ch01-s01' }], i18n: { el: [{}], fr: [{}] } },
    ]),
    ids,
    ['el'],
  );
  assert.ok(P.some(p => /ops\[0\]: section must be a section of ch01/.test(p)));
  assert.ok(
    P.some(p => /ops\[0\]: no "el" translation/.test(p)),
    'every added text comes in each language of the pack',
  );
  assert.ok(
    P.some(p => /ops\[1\]: "replace" changes the lesson, so it may only be an option of a choice/.test(p)),
    'a replacement is never an addition',
  );
  assert.ok(P.some(p => /id "ch01-e001" is used already/.test(p)));
  assert.ok(P.some(p => /i18n\.fr — the pack has no "fr" translation/.test(p)));
  assert.deepEqual(shapeProblems('x', ids, []), ['the update is not a JSON object']);
});

test('newErrors: what the pack had before is not the update’s, positions aside', () => {
  assert.deepEqual(newErrors(['ch01-s01 (a paragraph, blocks[3]): uses x', 'a'], ['ch01-s01 (a paragraph, blocks[5]): uses x', 'b']), [
    'b',
  ]);
  assert.deepEqual(newErrors(['recall 30 % of 12'], ['recall 31 % of 13', 'recall 31 % of 13']), ['recall 31 % of 13']);
});

test('an addition in the right place: applied in both languages, the rest of the lesson untouched', () => {
  const b = base();
  const blocks = [
    para(
      'Picture the current as the number of people who pass a door each second: the more who pass, the larger the current, whatever the size of the crowd.',
    ),
  ];
  const r = prepare(
    checks,
    b,
    update([
      { op: 'blocks', section: 'ch01-s02', at: 1, blocks, i18n: trBlocks(blocks), why: 'You asked how current differs from charge.' },
    ]),
  );
  assert.deepEqual(r.problems, []);
  const u = r.update as LessonUpdate;
  assert.equal(u.base?.chapter, chapterHash(chapter), 'the base: the chapter it was made for');
  const a = applyAll(b, u);
  const s2 = (a.pack['chapters'] as Obj[])[0]?.['sections'] as Obj[];
  const blks = s2[1]?.['blocks'] as Obj[];
  assert.equal(blks.length, (chapter.sections[1]?.blocks.length ?? 0) + 1);
  assert.match(String(blks[1]?.['text']), /people who pass a door/, 'before block 1 of the lesson as it is');
  assert.deepEqual(s2[0], chapter.sections[0], 'the other sections as they were');
  const el = (a.translations['el']?.['chapters'] as Obj[])[0]?.['sections'] as Obj[];
  assert.equal((el[1]?.['blocks'] as Obj[]).length, blks.length, 'the translation gets the same block at the same place');
  assert.deepEqual(verify(checks, b, u, {}), { errors: [], changed: false }, 'the app checks it again before saving: nothing new');
  const d = chapterDiff((b.pack['chapters'] as Obj[])[0] as Obj, (a.pack['chapters'] as Obj[])[0] as Obj);
  assert.equal(d.added.blocks, 1);
  assert.deepEqual(
    d.sections.map(x => x.state),
    ['same', 'changed', 'same'],
  );
  assert.deepEqual(d.sections[1]?.blocks.map(x => x.mark).slice(0, 3), ['same', 'added', 'same']);
});

test('a term used before it is taught: the addition goes after the section that teaches it, and the review says so', () => {
  const b = base();
  const ex = {
    id: 'ch01-e003',
    type: 'calc',
    section: 'ch01-s01',
    difficulty: 2,
    tags: ['calc'],
    q: 'A power bank is labelled 5000 mAh. How many coulombs does it hold?',
    answer: 18000,
    unit: 'C',
    explain: '5000 mAh is 5 Ah and 1 Ah is 3600 C, so 18 000 C. The slip is to forget the 3600 seconds in an hour.',
    lr: 'L1',
    think: 'apply',
    cite: { src: 'chat:cv_1', loc: 'turn 4' },
  };
  const r = prepare(checks, b, update([{ op: 'exercises', items: [ex], i18n: { el: [copy(ex)] } }]));
  assert.deepEqual(r.problems, []);
  const u = r.update as LessonUpdate;
  assert.deepEqual(u.notes, [{ kind: 'placed', op: 0, from: 'ch01-s01', to: 'ch01-s03' }], 'placed after the section on ampere-hours');
  const op = u.ops[0] as unknown as { items: Obj[] };
  assert.equal(op.items[0]?.['section'], 'ch01-s03');
  const a = applyAll(b, u);
  const elEx = ((a.translations['el']?.['chapters'] as Obj[])[0]?.['exercises'] as Obj[]).find(x => x['id'] === 'ch01-e003');
  assert.equal(elEx?.['section'], 'ch01-s03', 'the translation follows the source’s place');

  // blocks that lean on a later concept: placed after the section that teaches it, in the translation too
  const blocks = [
    para('Your phone battery says 4000 mAh: that is how long a current could flow from it, hour by hour, before it is flat.'),
  ];
  const r2 = prepare(checks, b, update([{ op: 'blocks', section: 'ch01-s01', at: 2, blocks, i18n: trBlocks(blocks) }]));
  assert.deepEqual(r2.problems, []);
  assert.deepEqual(r2.update?.notes, [{ kind: 'placed', op: 0, from: 'ch01-s01', to: 'ch01-s03' }]);
  const a2 = applyAll(b, r2.update);
  const s3 = ((a2.translations['el']?.['chapters'] as Obj[])[0]?.['sections'] as Obj[])[2]?.['blocks'] as Obj[];
  assert.match(String(s3[s3.length - 1]?.['text']), /4000 mAh/, 'at the end of the section on ampere-hours');
});

test('a repetition of the lesson is the learner’s choice, never a plain addition', () => {
  const b = base();
  const again = [copy(chapter.sections[0]?.blocks[1])];
  const r = prepare(checks, b, update([{ op: 'blocks', section: 'ch01-s01', blocks: again, i18n: trBlocks(again) }]));
  assert.equal(r.update, null);
  assert.match(r.problems.join('\n'), /already in the lesson \(ch01-s01 block 1\) — make it a choice of kind "duplicate"/);
  const choice = {
    id: 'dup1',
    kind: 'duplicate',
    question: 'The chat explains this again. Keep it?',
    recommended: 'skip',
    options: [
      { id: 'skip', label: 'Skip it', ops: [] },
      {
        id: 'second',
        label: 'Keep it as a second explanation',
        ops: [{ op: 'blocks', section: 'ch01-s01', blocks: again, i18n: trBlocks(again) }],
      },
    ],
  };
  const extra = [
    para(
      'Think of charge as the amount of water in a tank: it is counted, not measured as a flow; the flow is a different quantity, taught next.',
    ),
  ];
  const r2 = prepare(
    checks,
    b,
    update([{ op: 'blocks', section: 'ch01-s01', blocks: extra, i18n: trBlocks(extra) }], { choices: [choice] }),
  );
  assert.deepEqual(r2.problems, []);
  const u = r2.update as LessonUpdate;
  assert.equal(opsFor(u).length, 1, 'recommended (skip): only the new text');
  assert.equal(opsFor(u, { dup1: 'second' }).length, 2, 'picked: the second explanation too');
});

test('every option is checked: one that brings an error is refused', () => {
  const b = base();
  const early = [para('This charge flows as a current of two amperes through the lamp, and the ampere-hour label tells how long.')];
  const deep = sec(
    'ch01-s04',
    'Counting charge',
    'Charge is counted like coins in a jar, and amounts of charge add up.',
    'Like coins in a jar, **charge** is counted: two jars together hold the sum of both.',
    'counting charge',
  );
  const r = prepare(
    checks,
    b,
    update([], {
      choices: [
        {
          id: 'full1',
          kind: 'full',
          question: 'Section 1 is full. Where?',
          recommended: 'new',
          options: [
            {
              id: 'new',
              label: 'A new section',
              ops: [
                {
                  op: 'section',
                  after: 'ch01-s01',
                  section: deep,
                  i18n: { el: { title: 'Μετρώντας', focus: 'Το φορτίο μετριέται.', hook: deep.hook, blocks: copy(deep.blocks) } },
                },
              ],
            },
            {
              id: 'replace',
              label: 'Replace the weaker text',
              ops: [{ op: 'replace', section: 'ch01-s01', at: 2, block: early[0], i18n: { el: copy(early[0]) } }],
            },
          ],
        },
      ],
    }),
  );
  assert.equal(r.update, null);
  assert.match(r.problems.join('\n'), /choice full1, option replace: .*current/, 'the replacement uses current in section 1: refused');
});

test('the base changed: the app does not apply an update made for another version of the chapter', () => {
  const b = base();
  const blocks = [para('A current is a flow, and a flow is always "so much per second", which is why the ampere is defined per second.')];
  const u = prepare(checks, b, update([{ op: 'blocks', section: 'ch01-s02', blocks, i18n: trBlocks(blocks) }])).update as LessonUpdate;
  const now = base();
  ((now.pack['chapters'] as Obj[])[0] as Record<string, unknown>)['title'] = 'Charge and current, again';
  assert.deepEqual(verify(checks, now, u, {}), { errors: [], changed: true });
});

test('the chat as a source: the active path, hidden turns left out, the newest kept, attachments once', () => {
  const rec = {
    id: 'cv_1',
    title: 'Current vs charge',
    messages: [
      { role: 'user', content: 'old question '.repeat(30) },
      { role: 'assistant', content: 'old answer '.repeat(30) },
      { role: 'user', content: 'tell me', meta: { hidden: true } },
      {
        role: 'user',
        content: 'What is the difference?',
        attachments: [{ id: 'a1', name: 'notes.pdf', mediaType: 'application/pdf', size: 2048 }],
      },
      {
        role: 'assistant',
        content: 'Charge is an amount; current is a rate.',
        attachments: [{ id: 'a1', name: 'notes.pdf', mediaType: 'application/pdf', size: 2048 }],
      },
    ],
  };
  const all = chatMarkdown(rec, { learner: 'Learner', tutor: 'Tutor' });
  assert.equal(all.turns, 4);
  assert.ok(!all.text.includes('tell me'));
  assert.match(all.text, /\*\*Learner:\*\* \(📎 notes\.pdf\)\nWhat is the difference\?/);
  const short = chatMarkdown(rec, { learner: 'Learner', tutor: 'Tutor' }, 200);
  assert.match(short.text, /^\(2 earlier turns left out/);
  assert.match(short.text, /Charge is an amount/);
  assert.deepEqual(
    chatFiles(rec).map(f => f.name),
    ['notes.pdf'],
  );
  const req: LessonRequest = {
    v: 1,
    id: 'lumfx3k2a1-abcd',
    at: '2026-11-21T17:00:00Z',
    subject: { id: 'circ-demo', title: 'Circuits', language: 'en' },
    chapter: { id: 'ch01', title: 'Charge and current' },
    conversation: { id: 'cv_1', title: 'Current vs charge', turns: 4 },
    locale: 'el',
    files: chatFiles(rec),
    state: 'open',
  };
  const t = briefFor({ req, chat: all.text, chapter: chapter, locales: ['el'], files: req.files, via: 'connector' });
  assert.match(t, /noema_lesson_update_submit with request_id "lumfx3k2a1-abcd"/);
  assert.match(t, /sections from ch01-s04 up, exercises from ch01-e003 up/);
  assert.match(t, /in their language \(el\)/);
  assert.match(t, /— el, under "i18n"|translated into — el/);
});
