/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePath, branchOff, ensureIds, pathAttachments, replayThreadState, switchTo, versions } from './branches.ts';
import { fromRecord, toRecord, type Turn } from './conversation.ts';
import { kindOf, overBudget, partOf, reads, refusal } from './attachments.ts';

const u = (id: string, text: string, t: number): Turn => ({ id, role: 'user', text, t });
const a = (id: string, text: string, t: number): Turn => ({ id, role: 'model', text, t });

test('an edit branches the conversation; ‹ › switches between the versions and what followed each', () => {
  const path: Turn[] = [u('u1', 'q1', 1), a('a1', 'r1', 2), u('u2', 'q2', 3), a('a2', 'r2', 4)];
  const br: Turn[] = [];
  const same = path;
  branchOff(path, br, 2); // edit q2
  assert.equal(path, same, 'the array is changed in place');
  assert.deepEqual(
    path.map(m => m.id),
    ['u1', 'a1'],
  );
  assert.deepEqual(
    br.map(m => [m.id, m.parent]),
    [
      ['u2', 'a1'],
      ['a2', 'u2'],
    ],
  );
  path.push(u('u2b', 'q2 better', 5), a('a2b', 'r2b', 6));
  assert.deepEqual(versions(path, br, 2), { list: [br[0], path[2]], index: 1 });
  assert.ok(switchTo(path, br, 'u2'));
  assert.deepEqual(
    path.map(m => m.id),
    ['u1', 'a1', 'u2', 'a2'],
    'the old version comes back with its answer',
  );
  assert.equal(path[3]?.parent, undefined, 'path turns carry no parent');
  assert.deepEqual(br.map(m => [m.id, m.parent]).sort(), [
    ['a2b', 'u2b'],
    ['u2b', 'a1'],
  ]);
  assert.deepEqual(versions(path, br, 2).index, 0);
  // another answer to q1: the newest answer is followed on a switch
  branchOff(path, br, 1);
  path.push(a('a1c', 'r1c', 7));
  assert.equal(versions(path, br, 1).list.length, 2);
  assert.ok(switchTo(path, br, 'a1'));
  assert.deepEqual(
    path.map(m => m.id),
    ['u1', 'a1', 'u2b', 'a2b'],
    'the newest branch under a1',
  );
  assert.equal(switchTo(path, br, 'nope'), false);
  assert.equal(new Set([...path, ...br].map(m => m.id)).size, 7, 'no turn is ever lost');
});

test('turns without ids get one; the record keeps the branches and an old record reads as one path', () => {
  const path: Turn[] = [{ role: 'user', text: 'x', t: 1 }];
  let n = 0;
  ensureIds(path, [], () => 'm' + String(++n));
  assert.equal(path[0]?.id, 'm1');
  const cv = fromRecord({
    id: 'cv_1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messages: [
      { id: 'u1', role: 'user', content: 'q', attachments: [{ id: 'h1', name: 'a.png', mediaType: 'image/png', size: 3, kind: 'image' }] },
      { id: 'a1', role: 'assistant', content: 'r' },
    ],
    branches: [{ id: 'u0', role: 'user', content: 'q old', parent: null }],
  });
  assert.equal(cv.msgs[0]?.attachments?.[0]?.id, 'h1');
  assert.equal(cv.branches?.[0]?.parent, null);
  const rec = toRecord(cv, () => null);
  assert.deepEqual(
    rec.branches?.map(m => [m.id, m.parent]),
    [['u0', null]],
  );
  assert.equal(rec.messages[0]?.attachments?.length, 1);
  assert.equal(rec.messages.at(0)?.parent, undefined);
  assert.deepEqual(
    activePath(rec).map(m => m.id),
    ['u1', 'a1'],
  );
  assert.deepEqual(
    pathAttachments(rec).map(x => x.id),
    ['h1'],
  );
  const old = fromRecord({
    id: 'cv_2',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messages: [{ role: 'user', content: 'q' }],
  });
  assert.equal(old.branches, undefined);
  assert.equal(toRecord(old, () => null).branches, undefined, 'a plain conversation stays as it was');
});

test('the Socratic tracker of a branch is worked out again from its own turns', () => {
  const path: Turn[] = [
    u('u1', 'why?', 1),
    { ...a('a1', 'what do you see?', 2), meta: { noemaState: { opened: [{ id: 't1', question: 'What do you see?' }], focus: 't1' } } },
    u('u2', 'a wave', 3),
    { ...a('a2', '✅ yes', 4), meta: { noemaState: { resolved: [{ id: 't1', lesson: 'Waves carry energy.' }] } } },
    u('u3', 'just tell me', 5),
  ];
  const r = replayThreadState(path);
  assert.deepEqual(
    r.state.lessons.map(l => l.text),
    ['Waves carry energy.'],
  );
  assert.equal(r.state.learnerTurns, 3);
  assert.equal(r.directive, 'tellme', 'the last message’s directive, for the answer it waits for');
  const early = replayThreadState(path.slice(0, 3));
  assert.equal(early.state.threads[0]?.attempts, 1);
  assert.equal(early.state.lessons.length, 0, 'a lesson of another branch is not here');
});

test('files: kinds, what each AI reads, the limits, the parts sent and the budget', () => {
  assert.equal(kindOf('image/png'), 'image');
  assert.equal(kindOf('application/pdf'), 'pdf');
  assert.equal(kindOf('', 'notes.md'), 'text');
  assert.equal(kindOf('application/zip', 'x.zip'), null);
  assert.equal(reads('claude', 'audio'), false);
  assert.equal(reads('gemini', 'video'), true);
  assert.equal(refusal({ mediaType: 'audio/mpeg', name: 'a.mp3', size: 10 }, 'claude', 0), 'reader');
  assert.equal(refusal({ mediaType: 'image/png', name: 'a.png', size: 1e9 }, 'gemini', 0), 'size');
  assert.equal(refusal({ mediaType: 'image/png', name: 'a.png', size: 10 }, 'gemini', 6), 'count');
  const img = { id: 'h', name: 'a.png', mediaType: 'image/png', size: 3, kind: 'image' as const };
  assert.deepEqual(partOf(img, new Uint8Array([1, 2, 3]), 'claude'), { type: 'image', mediaType: 'image/png', data: 'AQID' });
  assert.equal(partOf(img, null, 'claude').type, 'text', 'not on this device: a note');
  const txt = { id: 't', name: 'n.py', mediaType: 'text/x-python', size: 5, kind: 'text' as const };
  const p = partOf(txt, new TextEncoder().encode('x = 1'), 'copy');
  assert.ok(p.type === 'text' && p.text.includes('x = 1'));
  const big = (id: string): typeof img => ({ ...img, id, size: 8 * 1024 * 1024 });
  const left = overBudget([{ attachments: [big('old')] }, { attachments: [big('mid')] }, { attachments: [big('new')] }], 'gemini');
  assert.deepEqual([...left].sort(), ['mid', 'old'], 'the newest files go, the older ones are left out');
});
