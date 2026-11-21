/* noema-lite — the lesson-update use cases over memory ports (docs/LESSON_UPDATES.md §1): send records a request and its
   chat, a pasted answer is checked, the preview shows the chapter before and after, approve saves the new version after
   the gate on the lesson as it is now (and keeps a copy of it before), undo puts it back unless the lesson changed again,
   decline closes it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLessonUpdates, type LessonPorts, type OwnSubject } from './service.ts';
import {
  PROP_PREFIX,
  REQ_PREFIX,
  chatPath,
  type Base,
  type ChatRecord,
  type LessonRequest,
  type Result as Applied,
} from '../domain/index.ts';
import { base, checks, copy, para, trBlocks, update } from './lesson.fixture.ts';
import type { Obj } from '../../content/domain/util.ts';

function world(cloud = true) {
  const rows = new Map<string, unknown>(),
    files = new Map<string, unknown>(),
    kept = new Map<string, unknown>();
  let lesson: Base = base(),
    t = 1_800_000_000_000,
    n = 0;
  const saved: { version: string; pack: Obj }[] = [];
  const subject: OwnSubject = {
    id: 'circ-demo',
    title: 'Circuits',
    language: 'en',
    chapters: [{ id: 'ch01', title: '1. Charge and current' }],
  };
  const ports: LessonPorts = {
    account: () => ({ id: 'u_1', cloud }),
    now: () => (t += 1000),
    unique: () => 'x' + String(++n).padStart(5, '0'),
    read: name => (rows.has(name) ? JSON.stringify(rows.get(name)) : null),
    write: (name, v) => rows.set(name, v),
    keys: prefix => [...rows.keys()].filter(k => k.startsWith(prefix)),
    upload: async (path, body) => {
      files.set(path, typeof body === 'string' ? body : await body.text());
    },
    download: path => Promise.resolve(files.get(path) ?? null),
    subjects: () => Promise.resolve([subject]),
    lesson: id => Promise.resolve(id === subject.id ? copy(lesson) : null),
    save: (_id, r: Applied, version) => {
      lesson = { pack: { ...copy(r.pack), version }, translations: copy(r.translations), bridges: copy(r.bridges) };
      saved.push({ version, pack: lesson.pack });
      return Promise.resolve();
    },
    checks: () => Promise.resolve(checks),
    attachment: () => Promise.resolve(null),
    keep: (k, v) => {
      kept.set(k, v);
      return Promise.resolve();
    },
    kept: k => Promise.resolve(kept.get(k) ?? null),
  };
  return { ports, rows, files, kept, saved, subject, lesson: () => lesson, setLesson: (b: Base) => (lesson = b) };
}
const chat: ChatRecord = {
  id: 'cv1',
  title: 'Current vs charge',
  context: { type: 'section', chapterId: 'ch01', sectionId: 'ch01-s02' },
  messages: [
    { role: 'user', content: 'Is current the same as charge?' },
    { role: 'model', content: 'No: current is how much charge passes each second.' },
    { role: 'user', content: 'secret', meta: { hidden: true } },
  ],
};
const blocks = [
  para(
    'Picture the current as the number of people who pass a door each second: the more who pass, the larger the current, whatever the size of the crowd.',
  ),
];
const answer =
  '```json\n' + JSON.stringify(update([{ op: 'blocks', section: 'ch01-s02', at: 1, blocks, i18n: trBlocks(blocks) }])) + '\n```';

async function sent(w: ReturnType<typeof world>) {
  const svc = createLessonUpdates(w.ports);
  const r = await svc.send({
    record: chat,
    subject: w.subject,
    chapter: 'ch01',
    note: ' the door picture ',
    locale: 'el',
    names: { learner: 'Me', tutor: 'Owl' },
  });
  assert.ok(r.ok);
  return { svc, req: r.value };
}

test('send: the request row and the chat in the account, hidden turns left out', async () => {
  const w = world();
  const { req } = await sent(w);
  assert.match(req.id, /^lu[0-9a-z]+-x0000/);
  assert.equal((w.rows.get(REQ_PREFIX + req.id) as LessonRequest).state, 'open');
  assert.equal(req.note, 'the door picture');
  assert.equal(req.conversation.turns, 2);
  const c = JSON.parse(String(w.files.get(chatPath(req.id)))) as { text: string };
  assert.match(c.text, /\*\*Owl:\*\*/);
  assert.doesNotMatch(c.text, /secret/);
});

test('a local profile: the chat stays on this device and the message is the whole brief', async () => {
  const w = world(false);
  const { svc, req } = await sent(w);
  assert.equal(w.files.size, 0);
  const m = await svc.message(req.id, false);
  assert.ok(m.ok);
  assert.match(m.value, /noema-lesson-update/);
  assert.match(m.value, /current is how much charge passes/);
  const short = await svc.message(req.id, true);
  assert.ok(short.ok && /noema_lesson_update_task/.test(short.value) && short.value.includes(req.id));
});

test('paste → preview → approve → undo: the lesson changes only on approve, and comes back', async () => {
  const w = world();
  const { svc, req } = await sent(w);
  const bad = await svc.paste(req.id, 'Sure! here it is');
  assert.ok(!bad.ok && bad.error.code === 'invalid');
  const p = await svc.paste(req.id, answer);
  assert.ok(p.ok, p.ok ? '' : p.error.detail);
  assert.equal(w.saved.length, 0, 'nothing saved before approve');
  const pv = await svc.preview(p.value.update, {}, 'el');
  assert.ok(pv.ok);
  assert.equal(pv.value.locale, 'el', 'in the language the learner reads');
  assert.deepEqual(pv.value.errors, []);
  assert.equal(pv.value.diff.added.blocks, 1);
  const a = await svc.approve(req.id, p.value.update, {});
  assert.ok(a.ok, a.ok ? '' : a.error.detail);
  assert.equal(a.value.state, 'applied');
  assert.equal(w.saved.length, 1);
  assert.match(w.saved[0]?.version ?? '', /^v1\+lu\./);
  const secs = ((w.lesson().pack['chapters'] as Obj[])[0]?.['sections'] as Obj[])[1]?.['blocks'] as Obj[];
  assert.match(String(secs[1]?.['text']), /people who pass a door/);
  assert.ok(w.kept.has('before:' + req.id), 'a copy of the lesson before, on this device');
  const again = await svc.approve(req.id, p.value.update, {});
  assert.ok(!again.ok && again.error.code === 'closed');
  const u = await svc.undo(req.id);
  assert.ok(u.ok);
  assert.equal(u.value.state, 'undone');
  assert.equal(((w.lesson().pack['chapters'] as Obj[])[0]?.['sections'] as Obj[])[1]?.['blocks'] instanceof Array, true);
  assert.doesNotMatch(JSON.stringify(w.lesson().pack), /people who pass a door/, 'the lesson as it was');
});

test('approve checks the lesson as it is now; undo refuses when the lesson changed again since', async () => {
  const w = world();
  const { svc, req } = await sent(w);
  const p = await svc.paste(req.id, answer);
  assert.ok(p.ok);
  const changed = copy(w.lesson());
  ((changed.pack['chapters'] as Obj[])[0] as Record<string, unknown>)['title'] = 'Charge, current and more';
  w.setLesson(changed);
  const a = await svc.approve(req.id, p.value.update, {});
  assert.ok(!a.ok && a.error.code === 'changed', 'made for another version of the chapter');
  w.setLesson(base());
  const ok2 = await svc.approve(req.id, p.value.update, {});
  assert.ok(ok2.ok);
  const later = copy(w.lesson());
  w.setLesson({ ...later, pack: { ...later.pack, version: 'v2' } });
  const u = await svc.undo(req.id);
  assert.ok(!u.ok && u.error.code === 'changed', 'never puts back a lesson over a newer one');
});

test('pending lists the proposals with a card; decline closes the request', async () => {
  const w = world();
  const { svc, req } = await sent(w);
  assert.deepEqual(svc.pending(), [], 'no card yet: Claude has not answered');
  w.rows.set(PROP_PREFIX + req.id, {
    v: 1,
    id: req.id,
    at: '2027-01-01T00:00:00Z',
    pack: 'circ-demo',
    chapter: 'ch01',
    summary: 's',
    counts: { additions: 1, choices: 0, notes: 0 },
    rev: 1,
  });
  assert.equal(svc.pending().length, 1);
  const d = svc.decline(req.id);
  assert.ok(d.ok && d.value.state === 'declined');
  assert.deepEqual(svc.pending(), []);
});
