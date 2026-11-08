/// <reference types="node" />
/**
 * The people's server contract (src/ports/social.ts): every SocialServer adapter passes it. `make()` gives two people,
 * each signed in on their own server, who have not met.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoemaError } from '../../kernel/errors.ts';
import type { SocialServer } from '../social.ts';

export type SocialFactory = () => Promise<{ readonly a: SocialServer; readonly b: SocialServer }>;

/** what the app keeps as a name's search terms and sends as a search (src/features/social: nameSearch, peopleQuery) */
const terms = (name: string): string => (name === 'Νίκος Παπαδάκης' ? 'νικοσ παπαδακησ nikos papadakis' : name.toLowerCase());
const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

export function socialContract(name: string, make: SocialFactory): void {
  describe(`Social server contract: ${name}`, () => {
    test('my row: none, made, changed; found by others by name in Latin letters, never by myself', async () => {
      const { a, b } = await make();
      const ua = a.uid() ?? '';
      assert.equal(value(await a.me()), null);
      value(await a.putMe({ user_id: ua, display_name: 'Νίκος Παπαδάκης', emoji: null, search: terms('Νίκος Παπαδάκης') }));
      assert.equal(value(await a.me())?.display_name, 'Νίκος Παπαδάκης');
      value(await a.patchMe({ dm_from: 'everyone' }));
      assert.equal(value(await a.me())?.dm_from, 'everyone');
      assert.ok(value(await b.search(['nikos papad'])).some(p => p.user_id === ua));
      assert.equal(
        value(await a.search(['nikos'])).some(p => p.user_id === ua),
        false,
      );
      assert.equal(value(await b.people([ua, ua]))[0]?.display_name, 'Νίκος Παπαδάκης');
      assert.deepEqual(value(await b.people([])), []);
    });

    test('buddies: asked, answered, undone', async () => {
      const { a, b } = await make();
      const ua = a.uid() ?? '',
        ub = b.uid() ?? '';
      for (const [s, u, n] of [
        [a, ua, 'Ada'],
        [b, ub, 'Bo'],
      ] as const)
        value(await s.putMe({ user_id: u, display_name: n, search: terms(n) }));
      value(await a.ask(ub));
      assert.equal(value(await b.buddies())[0]?.status, 'pending');
      value(await b.answer(ua, true));
      assert.equal(value(await a.buddies())[0]?.status, 'buddies');
      const [x, y] = pairOf(ua, ub);
      value(await a.unbuddy(x, y));
      assert.deepEqual(value(await a.buddies()), []);
    });

    test('a conversation: opened once, a message sent, edited, read in the inbox, deleted; a block', async () => {
      const { a, b } = await make();
      const ua = a.uid() ?? '',
        ub = b.uid() ?? '';
      value(await a.putMe({ user_id: ua, display_name: 'Ada', search: terms('Ada') }));
      value(await b.putMe({ user_id: ub, display_name: 'Bo', search: terms('Bo') }));
      value(await b.patchMe({ dm_from: 'everyone' }));
      const room = value(await a.dm(ub));
      assert.equal(value(await a.dm(ub)), room, 'the one room of a pair');
      const m = value(await a.send(room, 'hello', null));
      assert.ok(m && typeof m['id'] === 'string');
      const id = typeof m['id'] === 'string' ? m['id'] : '';
      value(await a.edit(id, 'hello there'));
      assert.equal(value(await b.latest(room, 80))[0]?.['body'], 'hello there');
      assert.ok(value(await b.inbox()).some(r => r.room === room && r.kind === 'dm'));
      assert.ok(value(await a.members(room)).length === 2);
      value(await a.remove(id));
      assert.equal(value(await b.latest(room, 80))[0]?.['deleted'], true);
      value(await b.block(ua));
      assert.deepEqual(
        value(await b.blocks()).map(x => x.blocked),
        [ua],
      );
      value(await b.unblock(ua));
      assert.deepEqual(value(await b.blocks()), []);
    });

    test('a study group: made, found by its code, joined', async () => {
      const { a, b } = await make();
      const ua = a.uid() ?? '',
        ub = b.uid() ?? '';
      value(await a.putMe({ user_id: ua, display_name: 'Ada', search: terms('Ada') }));
      value(await b.putMe({ user_id: ub, display_name: 'Bo', search: terms('Bo') }));
      const room = value(await a.createGroup({ name: 'Genetics 2026', about: null, university: null, course: null, emoji: null }));
      assert.equal(value(await a.room(room))?.['name'], 'Genetics 2026');
      const code = 'JoinGenetics2026x';
      value(await a.setRoom(room, { join_code: code }));
      assert.equal(value(await b.peek(code))?.['name'], 'Genetics 2026');
      value(await b.join(code));
      assert.ok(value(await b.inbox()).some(x => x.room === room && x.kind === 'group'));
      assert.equal(typeof value(await a.usedBytes()), 'number');
    });
  });
}
