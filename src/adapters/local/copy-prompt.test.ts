/// <reference types="node" />
/** The copy fallback (no AI key on this device) and the conversation store over the page's engine/convos.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyPromptAI, promptText } from './copy-prompt.ts';
import { pageConversationStore, type PageConvos } from '../browser/conversations.ts';
import type { StoredConversation } from '../../ports/conversations.ts';

test('copy fallback: chat sends nothing, answers ai.no_key.any and keeps the whole prompt to copy', async () => {
  const ai = copyPromptAI();
  assert.equal(ai.prompt(), null);
  const r = await ai.chat({
    system: '  You are "Ada".  ',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'What is torque?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Think of a door.' }] },
      { role: 'user', content: [{ type: 'text', text: 'A lever?' }] },
    ],
  });
  assert.ok(!r.ok && r.error.code === 'ai.no_key.any');
  assert.equal(ai.prompt(), 'You are "Ada".\n\n---\n\nLearner: What is torque?\n\nTutor: Think of a door.\n\nLearner: A lever?');
  const m = await ai.models();
  assert.ok(m.ok && m.value.length === 0);
});

test('copy fallback: no instructions → only the turns, with the names given', () => {
  const t = promptText({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }, { user: 'Me', assistant: 'AI' });
  assert.equal(t, 'Me: hi');
});

test('conversation store: every call goes to engine/convos.js as it is then; without it, calls fail (nothing is lost silently)', async () => {
  const rows = new Map<string, StoredConversation>();
  let page: PageConvos | null = null;
  const store = pageConversationStore(() => page);
  await assert.rejects(store.list('anr'));
  assert.match(store.newId(0), /^cv_/);
  const heard: string[] = [];
  page = {
    newId: () => 'cv_page',
    list: (acc, o) =>
      Promise.resolve([...rows.values()].filter(r => !o?.subject || (r as { subject?: { id: string } }).subject?.id === o.subject)),
    get: (acc, id) => Promise.resolve(rows.get(id)),
    put: (acc, r) => {
      rows.set((r as { id: string }).id, r);
      return Promise.resolve(r);
    },
    remove: (acc, id) => Promise.resolve(rows.delete(id)),
    onChange: f => {
      f('anr', { id: 'x' });
    },
  };
  assert.equal(store.newId(), 'cv_page');
  await store.put('anr', { id: 'a', subject: { id: 's1' } });
  await store.put('anr', { id: 'b', subject: { id: 's2' } });
  assert.equal((await store.list('anr', { subject: 's1' })).length, 1);
  assert.equal(await store.get('anr', 'zz'), null);
  await store.remove('anr', 'a');
  assert.equal((await store.list('anr')).length, 1);
  const off = store.onChange(a => heard.push(a));
  off();
  assert.deepEqual(heard, ['anr']);
});
