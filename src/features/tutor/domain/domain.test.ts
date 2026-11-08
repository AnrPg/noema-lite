/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, EN, fakeI18n, PERSONA, SUBJECT } from './test-fixtures.ts';
import {
  applyControl,
  newThreadState,
  noteLearnerTurn,
  openThreads,
  rebuildThreadState,
  splitControl,
  THREAD_BUDGET,
  tutorStateBlock,
} from './threads.ts';
import { contextText, intentText, modeSystem, turnSystem, type ReplyLanguage } from './prompts.ts';
import {
  cleanTitle,
  convoMarkdown,
  fallbackTitle,
  fromRecord,
  modeName,
  otherApp,
  slug,
  stripChapter,
  toRecord,
  visibleText,
  wantsTitle,
  type Conversation,
} from './conversation.ts';

test('the control line: hidden from the text, parsed when whole, tolerated while it streams', () => {
  const full = 'Think about it.\n<noema-state>{"opened":[{"id":"t1","question":"Why?"}],"focus":"t1"}</noema-state>';
  assert.deepEqual(splitControl(full), { clean: 'Think about it.', control: { opened: [{ id: 't1', question: 'Why?' }], focus: 't1' } });
  assert.deepEqual(splitControl('Think <noema-state>{"open'), { clean: 'Think', control: null });
  assert.deepEqual(splitControl('<noema-state>not json</noema-state>'), { clean: '', control: null });
  assert.equal(splitControl('plain').control, null);
});

test('threads: open, count attempts, ask for the answer, resolve with a lesson, nest and close with the parent', () => {
  const ts = newThreadState();
  applyControl(ts, { opened: [{ id: 't1', question: 'What happens?' }], focus: 't1' }, 1);
  assert.equal(ts.focus, 't1');
  assert.equal(noteLearnerTurn(ts, 'maybe it melts', null), null);
  assert.equal(ts.threads[0]?.attempts, 1);
  assert.equal(noteLearnerTurn(ts, 'No idea really', null), 'tellme', '“no idea” asks for the answer');
  assert.equal(noteLearnerTurn(ts, 'δεν ξέρω', null), 'tellme', 'in Greek too');
  assert.equal(ts.threads[0].attempts, 1, 'asking for the answer is not an attempt');
  applyControl(ts, { opened: [{ id: 't2', question: 'Sub?', parent: 't1' }] }, 2);
  const got = applyControl(ts, { resolved: [{ id: 't1', answer: 'It melts.', lesson: 'Heat melts ice.' }] }, 3);
  assert.deepEqual(
    got.map(l => l.text),
    ['Heat melts ice.'],
  );
  assert.equal(openThreads(ts).length, 0, 'the sub-thread closes with its parent');
  assert.equal(ts.threads.find(t => t.id === 't2')?.how, 'closed-with-parent');
  assert.equal(ts.focus, null);
  applyControl(ts, null, 4);
  assert.equal(ts.missingControl, 1);
  assert.match(tutorStateBlock(ts, null, ''), /lacked the <noema-state> line/);
  applyControl(ts, { summary: true }, 5);
  assert.equal(ts.wrapped, true);
});

test('the TUTOR STATE: attempts against the budget, the directives, the next id', () => {
  const ts = newThreadState();
  applyControl(ts, { opened: [{ id: 't1', question: 'Q1' }] }, 0);
  for (let i = 0; i < THREAD_BUDGET; i++) noteLearnerTurn(ts, 'guess', null);
  const s = tutorStateBlock(ts, null, ' Write it in Greek (Ελληνικά).');
  assert.match(s, /"Q1" — learner attempts 3\/3 {2}← FOCUS/);
  assert.match(s, /Thread t1 has used all its attempts/);
  assert.match(s, /Write it in Greek/);
  assert.match(s, /Next new thread id: t2\./);
  assert.match(tutorStateBlock(ts, 'wrapup', ''), /WRAP UP NOW/);
  // a hard cap on open threads even when the model ignores the rule
  applyControl(ts, { opened: [{ question: 'a' }, { question: 'b' }, { question: 'c' }, { question: 'd' }] }, 1);
  assert.ok(openThreads(ts).length <= 3);
});

test('a stored conversation without its state gets it rebuilt from the messages', () => {
  const ts = rebuildThreadState([
    { role: 'user', text: 'hi' },
    { role: 'model', text: 'Q?', meta: { noemaState: { opened: [{ id: 't1', question: 'Q?' }] } } },
    { role: 'user', text: 'a' },
    { role: 'model', text: 'ok', meta: { noemaState: { resolved: [{ id: 't1', lesson: 'L' }] } } },
  ]);
  assert.equal(ts.learnerTurns, 2);
  assert.deepEqual(
    ts.lessons.map(l => l.text),
    ['L'],
  );
});

test('the modes: the persona and the subject in the instructions; hints never reveal; explain never quizzes', () => {
  assert.match(modeSystem('socratic', PERSONA, SUBJECT), /You are "Ada", a Socratic physics tutor/);
  assert.match(modeSystem('socratic', PERSONA, SUBJECT), /, formula if useful/);
  assert.match(modeSystem('hint', PERSONA, SUBJECT), /NEVER reveal the answer/);
  assert.match(modeSystem('explain', PERSONA, SUBJECT), /NOT a Socratic session/);
  assert.doesNotMatch(modeSystem('explain', PERSONA, SUBJECT), /max ~120 words/);
  assert.match(intentText('exHint', 'B. two', PERSONA), /pressed "Ask Ada" on an exercise BEFORE answering it.*not submitted\): B\. two/);
  assert.match(intentText('item', 'term', PERSONA), /on ONE term of the lesson/);
  assert.equal(intentText('nope', '', PERSONA), '');
});

test('the context: the section with its chapter, the chapter, a drill, an exercise, a part of the lesson, the whole course', () => {
  assert.match(
    contextText({ kind: 'section', id: 'ch01-s01' }, COURSE),
    /Chapter 1 "Motion", section "Speed":\nSpeed is distance over time\.\n\nChapter mantra: Measure first\./,
  );
  assert.equal(contextText({ kind: 'section', id: 'nope' }, COURSE), '');
  assert.match(contextText({ kind: 'chapter', id: 'ch01' }, COURSE), /^COURSE NOTES:\nMotion: speed/);
  assert.match(contextText({ kind: 'playbook', id: 'pb1' }, COURSE), /Steps: check \[x\]/);
  assert.equal(contextText({ kind: 'exercise', id: 'e1', text: 'Q + answer' }, COURSE), 'Q + answer');
  const item = contextText({ kind: 'item', id: 'x1', text: 'v = d/t', sec: 'ch01-s01' }, COURSE);
  assert.match(
    item,
    /^FOCUS — the part of the lesson the learner asks about:\nv = d\/t\n\nWIDER CONTEXT — Chapter 1 "Motion", section "Speed"/,
  );
  assert.match(item, /THE CHAPTER:\nMotion/);
  assert.match(contextText(null, COURSE), /^COURSE NOTES \(overview\):\nCh1 Motion\n\nCh2 Energy/);
});

test('a turn: the mode, the task, the notes, the language rule, then the state or the wrap-up', () => {
  const lang: ReplyLanguage = {
    code: 'el',
    name: 'Greek (Ελληνικά)',
    rule: 'LANGUAGE: always write in Greek.',
    fields: w => ` Write ${w} in Greek.`,
  };
  const ts = newThreadState();
  const s = turnSystem({
    mode: 'socratic',
    persona: PERSONA,
    subject: SUBJECT,
    intent: 'TASK',
    context: 'CTXNOTES',
    lang,
    threads: ts,
    directive: null,
  });
  assert.ok(
    s.indexOf('WHY THIS CONVERSATION WAS OPENED') < s.indexOf('CTXNOTES') &&
      s.indexOf('CTXNOTES') < s.indexOf('LANGUAGE:') &&
      s.indexOf('LANGUAGE:') < s.lastIndexOf('TUTOR STATE (authoritative'),
  );
  assert.match(s, /Write the "question", "answer" and "lesson" texts .* in Greek \(Ελληνικά\)/);
  const w = turnSystem({
    mode: 'quiz',
    persona: PERSONA,
    subject: SUBJECT,
    intent: null,
    context: '',
    lang: EN,
    threads: null,
    directive: 'wrapup',
  });
  assert.match(w, /WRAP UP NOW: answer any question still pending/);
  assert.doesNotMatch(w, /TUTOR STATE/);
});

test('records: the origin, the section of an exercise and the title state survive both ways; other apps keep their mode', () => {
  const cv: Conversation = {
    id: 'cv_1',
    kind: 'tutor',
    mode: 'explain',
    created: 1000,
    updated: 2000,
    ctx: { kind: 'exercise', id: 'ch01-e001', label: 'Exercise', origin: { via: 'explainDifferently', ex: 'ch01-e001' } },
    model: 'm',
    provider: 'google',
    title: 'Why squared',
    titledLen: 2,
    msgs: [
      { role: 'user', text: 'why?', t: 1000 },
      { role: 'model', text: 'because', t: 1500, meta: { noemaState: { focus: null } } },
      { role: 'user', text: 'hidden', t: 1600, hidden: true },
    ],
  };
  const r = toRecord(cv, () => 'ch01-s02');
  assert.deepEqual(r.context, {
    type: 'exercise',
    id: 'ch01-e001',
    label: 'Exercise',
    sectionId: 'ch01-s02',
    chapterId: 'ch01',
    origin: { via: 'explainDifferently', ex: 'ch01-e001' },
  });
  assert.equal(r.messages.length, 2, 'a hidden message is not kept');
  assert.equal(r.meta?.['titledAtMessage'], 2);
  const back = fromRecord({ ...r, messages: r.messages.map(m => ({ ...m, role: m.role === 'model' ? 'assistant' : m.role })) });
  assert.equal(back.ctx?.origin?.['via'], 'explainDifferently');
  assert.equal(back.msgs[1]?.role, 'model');
  assert.equal(back.titledLen, 2);
  assert.equal(fromRecord({ ...r, titleSource: 'user' }).titledLen, 1e9);
  assert.equal(toRecord({ ...cv, ctx: null }, () => null).context?.type, 'course');
  assert.equal(otherApp({ meta: { app: 'meletee' } }), 'Meletee');
  assert.equal(otherApp({ meta: { app: 'noema-lite' } }), null);
  const i18n = fakeI18n({ 'engine.cv.mode_explain': 'Explanation', 'loader.convo.mode.teachBack': 'Teach-back' });
  assert.equal(modeName('explain', i18n), 'Explanation');
  assert.equal(modeName('teach-back', i18n), 'Teach-back');
  assert.equal(modeName('odd', i18n), 'odd');
});

test('titles: cleaned, a fallback from the context or the first question, renamed every 8 messages', () => {
  assert.equal(cleanTitle('Title: **Deletion Vectors** 🚀.\nmore'), 'Deletion Vectors');
  const i18n = fakeI18n({ 'engine.common.chTitle': 'Ch{num} · {title}', 'engine.cv.fallbackTitle': 'Chat on {title}' });
  assert.equal(stripChapter('Ch3 · Delta Lake', i18n), 'Delta Lake');
  const cv: Conversation = {
    id: 'c',
    kind: 'tutor',
    mode: 'quiz',
    created: 0,
    updated: 0,
    ctx: { kind: 'chapter', id: 'ch03', label: 'Ch3 · Delta Lake' },
    model: '',
    provider: 'google',
    title: null,
    titledLen: 0,
    msgs: [],
  };
  assert.equal(fallbackTitle(cv, 'Databricks', i18n), 'Delta Lake');
  assert.equal(
    fallbackTitle(
      { ...cv, ctx: null, msgs: [{ role: 'user', text: 'what is a deletion vector in delta lake today please', t: 1 }] },
      'X',
      i18n,
    ),
    'what is a deletion vector in delta',
  );
  assert.equal(wantsTitle(cv), false, 'nothing to name before a reply');
  cv.msgs.push({ role: 'user', text: 'a', t: 1 }, { role: 'model', text: 'b', t: 2 });
  assert.equal(wantsTitle(cv), true);
  cv.title = 'T';
  cv.titledLen = 2;
  assert.equal(wantsTitle(cv), false);
  assert.equal(slug('Δέλτα: Ωραίο!'), 'conversation');
  assert.equal(slug('Delta Lake: Why'), 'delta-lake-why');
});

test('the Markdown export starts with the lessons and never shows the hidden state', () => {
  const i18n = fakeI18n({ 'engine.cv.md.lessons': 'Lessons learned', 'engine.cv.md.you': 'You' });
  const cv: Conversation = {
    id: 'c',
    kind: 'tutor',
    mode: 'socratic',
    created: 0,
    updated: 0,
    ctx: null,
    model: 'g',
    provider: 'google',
    title: 'DVs',
    titledLen: 2,
    msgs: [
      { role: 'user', text: 'q', t: 1 },
      { role: 'model', text: '# Heading\nanswer', t: 2 },
    ],
    tutorState: { ...newThreadState(), lessons: [{ text: 'DVs are cheap.', thread: null, question: null, at: 1 }] },
  };
  const md = convoMarkdown(cv, {
    i18n,
    subjectTitle: 'S',
    tutorName: 'Ada',
    tutorAvatar: '🦉',
    profile: 'P',
    source: 'noema-lite',
    modeName: m => m ?? '',
  });
  assert.ok(md.indexOf('📌 Lessons learned') < md.indexOf('🧑 You'));
  assert.match(md, /1\. DVs are cheap\./);
  assert.match(md, /^### Heading$/m, 'a message heading goes below the speakers');
  assert.equal(visibleText('Hi<noema-state>{"x":1}</noema-state>'), 'Hi');
});
