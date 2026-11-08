/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok } from '../../../kernel/result.ts';
import { NO_USAGE, type ChatRequest } from '../../../ports/ai.ts';
import type { ConversationStore, StoredConversation } from '../../../ports/conversations.ts';
import { COURSE, EN, fakeI18n, PERSONA, SUBJECT } from '../domain/test-fixtures.ts';
import { TutorJobs } from './jobs.ts';
import { TutorSession, type TutorAi, type TutorDeps } from './tutor.ts';

const tick = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function memoryStore(): ConversationStore & { rows: Map<string, StoredConversation> } {
  const rows = new Map<string, StoredConversation>();
  let n = 0;
  return {
    rows,
    newId: () => 'cv_' + String(++n).padStart(16, '0'),
    list: () => Promise.resolve([...rows.values()]),
    get: (_a, id) => Promise.resolve(rows.get(id) ?? null),
    put: (_a, r) => {
      rows.set(r.id, r);
      return Promise.resolve(r);
    },
    remove: (_a, id) => {
      rows.delete(id);
      return Promise.resolve();
    },
    onChange: () => () => undefined,
  };
}
/** an AI that answers from a script and remembers what it was told */
function scriptedAi(reply: (r: ChatRequest) => string | NoemaError): TutorAi & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    provider: 'gemini',
    model: 'gemini-test',
    calls,
    chat: r => {
      calls.push(r);
      const x = reply(r);
      if (x instanceof NoemaError) return Promise.resolve(err(x));
      for (const piece of [x.slice(0, 10), x.slice(10)]) r.onDelta?.({ type: 'text', text: piece });
      return Promise.resolve(
        ok({
          provider: 'gemini',
          model: 'gemini-test',
          content: [{ type: 'text', text: x }],
          text: x,
          toolCalls: [],
          stop: 'end',
          usage: NO_USAGE,
        }),
      );
    },
  };
}
function session(
  ai: TutorAi,
  store = memoryStore(),
  more: Partial<TutorDeps> = {},
): { s: TutorSession; store: ReturnType<typeof memoryStore>; notes: string[] } {
  const notes: string[] = [];
  const s = new TutorSession({
    i18n: fakeI18n({ 'engine.aimsg.exHint': 'Give me a hint', 'engine.tutor.lessonsLearned': '{n} lessons' }),
    store,
    course: COURSE,
    ai: () => Promise.resolve(ai),
    vendor: () => ({ provider: 'google', model: ai.model }),
    persona: () => PERSONA,
    subject: () => ({ ...SUBJECT, id: 'physics', packVersion: null }),
    account: () => ({ id: 'anr', kind: 'local', name: 'Anna' }),
    language: () => EN,
    now: () => 1_700_000_000_000,
    exerciseText: id => 'TEXT of ' + id,
    sectionOf: () => 'ch01-s01',
    filteredOut: () => false,
    showAll: () => undefined,
    notify: t => notes.push(t),
    touchStreak: () => undefined,
    report: () => undefined,
    preloaded: [],
    ...more,
  });
  return { s, store, notes };
}

test('a Socratic turn: the state goes to the AI, the control line opens a thread, the text is clean and saved', async () => {
  const ai = scriptedAi(r =>
    r.system && /What is speed/.test(JSON.stringify(r.messages.at(-1)))
      ? 'Before I answer: what do you measure?\n<noema-state>{"opened":[{"id":"t1","question":"What do you measure?"}],"focus":"t1"}</noema-state>'
      : 'Title Here',
  );
  const { s, store } = session(ai);
  const seen: (string | null)[] = [];
  s.subscribe(() => seen.push(s.stream));
  s.openTutor({ kind: 'section', id: 'ch01-s01' }, 'socratic');
  await s.send('What is speed?');
  const sys = ai.calls[0]?.system ?? '';
  assert.match(sys, /elicitation threads/);
  assert.match(sys, /COURSE NOTES — Chapter 1 "Motion", section "Speed"/);
  assert.match(sys, /TUTOR STATE/);
  assert.ok(
    seen.some(x => x && !x.includes('noema-state')),
    'the stream never shows the control line',
  );
  assert.equal(s.history().at(-1)?.text, 'Before I answer: what do you measure?');
  assert.equal(s.threads()?.focus, 't1');
  await tick();
  const rec = [...store.rows.values()][0] as unknown as {
    context: { type: string; id: string };
    messages: { content: string }[];
    tutorState: unknown;
  };
  assert.equal(rec.context.type, 'section');
  assert.equal(rec.messages.length, 2);
  assert.ok(rec.tutorState, 'the thread state is kept with it');
  assert.equal(s.current()?.title, 'Title Here', 'named after its first reply');
});

test('"Ask" on an exercise before answering is its own hint conversation that never reveals the answer', async () => {
  const ai = scriptedAi(() => 'A hint.');
  const { s } = session(ai);
  s.askAbout({ id: 'ch01-e001', section: 'ch01-s01' }, null, '', 'Q? Correct: B');
  await tick();
  assert.equal(s.mode, 'hint');
  assert.equal(s.key(), 'ch01-e001|hint');
  const sys = ai.calls[0]?.system ?? '';
  assert.match(sys, /NEVER reveal the answer/);
  assert.match(sys, /BEFORE answering it/);
  assert.doesNotMatch(sys, /TUTOR STATE/);
  assert.equal(s.history()[0]?.meta?.intent?.includes('BEFORE answering'), true, 'the task is kept with the first message');
  assert.equal(s.ctx?.origin?.['via'], 'askHint');
});

test('a failed turn takes the learner’s message back and says what helps; without a key the prompt can be copied', async () => {
  const ai = { ...scriptedAi(() => new NoemaError('ai.no_key.any', 'Add a key.')), fallbackPrompt: () => 'SYSTEM + chat' };
  const { s } = session(ai);
  s.openTutor(null, 'explain');
  await s.send('hello');
  assert.equal(s.history().length, 0);
  assert.equal(s.error?.needsKey, true);
  assert.equal(s.error.prompt, 'SYSTEM + chat');
  assert.equal(s.busy, false);
});

test('reopening a stored conversation restores its mode (another app’s mode as Explain) and rebuilds its threads', () => {
  const ai = scriptedAi(() => 'x');
  const { s } = session(ai, memoryStore(), {
    preloaded: [
      {
        id: 'cv_a',
        kind: 'tutor',
        mode: 'socratic',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        context: { type: 'section', id: 'ch01-s01', label: 'Speed' },
        messages: [
          { role: 'user', content: 'q' },
          { role: 'assistant', content: 'a', meta: { noemaState: { resolved: [{ id: 't1', lesson: 'L1' }] } } },
        ],
      },
      {
        id: 'cv_m',
        kind: 'tutor',
        mode: 'feynman',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
        meta: { app: 'meletee' },
        messages: [{ role: 'user', content: 'x' }],
      },
    ],
  });
  assert.equal(s.resume('cv_a'), true);
  assert.equal(s.mode, 'socratic');
  assert.deepEqual(
    s.threads()?.lessons.map(l => l.text),
    ['L1'],
  );
  const m = s.list.find(c => c.id === 'cv_m');
  assert.ok(m);
  s.openConversation(m);
  assert.equal(s.mode, 'explain');
  assert.equal(m.mode, 'feynman', 'the record keeps its own mode');
  assert.equal(s.resume('nope'), false);
});

test('rename, delete elsewhere, wrap up without threads, the export', async () => {
  const ai = scriptedAi(() => 'Done. 🎓');
  const { s, store } = session(ai);
  s.openTutor({ kind: 'chapter', id: 'ch01' }, 'quiz');
  await s.send('quiz me');
  await s.send('wrap', { directive: 'wrapup' });
  assert.match(ai.calls.at(-1)?.system ?? '', /WRAP UP NOW: answer any question still pending/);
  const cv = s.current();
  assert.ok(cv);
  s.rename(cv, '  **Motion quiz**  ');
  assert.equal(cv.title, 'Motion quiz');
  assert.equal(cv.titleSource, 'user');
  const file = await s.exportOne(cv, { tutorName: 'Ada', tutorAvatar: '🦉', source: 'noema-lite' });
  assert.match(file?.name ?? '', /_quiz_motion-quiz\.md$/);
  s.changedElsewhere(cv.id, null);
  assert.equal(s.current(), null);
  assert.equal(s.conversations().length, 0);
  s.remove(cv);
  await tick();
  assert.equal(store.rows.has(cv.id), false);
});

test('the one-shot jobs ask for JSON in the learner’s language and are kept as their own kind', async () => {
  const ai = scriptedAi(r =>
    /exam questions/.test(r.system ?? '')
      ? '{"q":"Q?","options":["a","b","c","d"],"answer":7,"why":["1","2","3","4"],"explain":"E"}'
      : '```json\n{"score":80,"verdict":"Solid","feedback":"Nice.","hit":[0]}\n```',
  );
  const { s, store } = session(ai);
  const jobs = new TutorJobs(
    {
      i18n: fakeI18n(),
      ai: () => Promise.resolve(ai),
      persona: () => PERSONA,
      language: () => ({ ...EN, fields: w => ` Write ${w} in Greek.` }),
    },
    s,
  );
  const g = await jobs.grade({ id: 'e1', type: 'free', q: 'Why?', model: 'Because', rubric: ['r'] }, 'mine', {
    notes: 'N',
    label: 'Ch1 · Speed',
  });
  assert.equal(g.score, 80);
  assert.match(ai.calls[0]?.system ?? '', /Write the verdict, covered, missing and mistakes texts in Greek/);
  assert.equal(ai.calls[0]?.json, true);
  const q = await jobs.question({ id: 'ch01-s01', title: 'Speed', notes: 'N', label: 'Ch1 · Speed', seen: ['old?'] });
  assert.equal(q.answer, 3, 'the right option is clamped to the four');
  const d = await jobs.drillGrade({ id: 'pb1', title: 'Sign', symptom: 's', askYourself: ['a', 'b'] }, 'a');
  assert.deepEqual(d.hit, [0]);
  await tick();
  assert.deepEqual([...store.rows.values()].map(r => r['kind']).sort(), ['drill-grading', 'grading', 'question']);
});
