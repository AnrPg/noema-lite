/// <reference types="node" />
/** People (docs/SOCIAL.md): the rules of the domain and the use cases over a recording server. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult } from '../../../kernel/result.ts';
import type { ErrorReporter } from '../../../ports/error-reporter.ts';
import type { PersonRow, SocialServer } from '../../../ports/social.ts';
import {
  bondWith,
  chatFilePath,
  cleanQuery,
  groupsOf,
  nameSearch,
  pairOf,
  peopleQuery,
  refusalKey,
  requestsFor,
  waitingFor,
  type BuddyRow,
} from '../domain/social.ts';
import { socialService } from './social.ts';

describe('the rules', () => {
  test('a name is searched as written and in Latin letters; a search loses what PostgREST would read', () => {
    assert.match(nameSearch('Νίκος Παπαδάκης'), /νικοσ.*nikos.*papadakis/);
    assert.equal(cleanQuery(' a,(b)"*\\:c  '), 'a b c');
    assert.deepEqual(peopleQuery('x'), []);
    assert.deepEqual(peopleQuery('Νίκος'), ['νικοσ', 'nikos']);
  });
  test('the server’s refusals as the keys of the learner’s words', () => {
    assert.equal(refusalKey('they do not take messages from you'), 'err.noMessages');
    assert.equal(refusalKey('storage quota: 1 of 52428800 bytes used'), 'err.quota');
    assert.equal(refusalKey('the group is full'), 'err.full');
    assert.equal(refusalKey('something else'), null);
    assert.equal(refusalKey(null), null);
  });
  test('buddies: the pair, the bond, the requests, what waits, my groups', () => {
    assert.deepEqual(pairOf('b', 'a'), ['a', 'b']);
    const B: BuddyRow[] = [
      { a: 'me', b: 'x', status: 'buddies' },
      { a: 'me', b: 'y', status: 'pending', asked_by: 'me' },
      { a: 'me', b: 'z', status: 'pending', asked_by: 'z' },
    ];
    assert.deepEqual(
      ['x', 'y', 'z', 'q'].map(p => bondWith(p, 'me', B, [])),
      ['buddies', 'asked', 'theyAsked', 'none'],
    );
    assert.equal(bondWith('x', 'me', B, ['x']), 'blocked');
    assert.deepEqual(
      requestsFor('me', B).map(b => b.b),
      ['z'],
    );
    const inbox = [
      { room: 'r1', kind: 'dm', status: 'joined', unread: 3 },
      { room: 'r2', kind: 'group', status: 'joined', unread: 5, muted: true, name: 'G' },
      { room: 'r3', kind: 'group', status: 'invited', name: 'H' },
    ];
    assert.equal(waitingFor('me', inbox, B), 3 + 0 + 1 + 1);
    assert.deepEqual(groupsOf(inbox), [{ id: 'r2', name: 'G' }]);
    assert.equal(chatFilePath('r1', 'Notes.PDF', 'id'), 'rooms/r1/id.pdf');
    assert.equal(chatFilePath('r1', 'roadmap', 'id'), 'rooms/r1/id.json');
  });
});

const done = (): AsyncResult<void> => Promise.resolve(OK_VOID);
const reporter = (seen: unknown[]): ErrorReporter =>
  ({
    report: (e: unknown) => {
      seen.push(e);
      return {} as never;
    },
  }) as unknown as ErrorReporter;
function server(over: Partial<SocialServer> = {}): SocialServer & { readonly calls: string[] } {
  const calls: string[] = [];
  const base: Partial<SocialServer> = {
    uid: () => 'me',
    me: () => Promise.resolve(ok(null)),
    putMe: done,
    patchMe: done,
    people: ids => Promise.resolve(ok(ids.map(id => ({ user_id: id, display_name: id.toUpperCase() })))),
    search: () =>
      Promise.resolve(
        ok([
          { user_id: 'x', display_name: 'X' },
          { user_id: 'blocked', display_name: 'B' },
        ]),
      ),
    inbox: () => Promise.resolve(ok([{ room: 'r', kind: 'group', status: 'joined', unread: 2, name: 'G' }])),
    buddies: () => Promise.resolve(ok([{ a: 'me', b: 'x', status: 'buddies' }])),
    blocks: () => Promise.resolve(ok([{ blocked: 'blocked' }])),
    unbuddy: done,
    insertFile: done,
    putObject: done,
    finishFile: done,
    removeObject: done,
    removeFileRow: done,
    ...over,
  };
  const out: Record<string, unknown> = { calls };
  for (const [k, v] of Object.entries(base))
    out[k] =
      k === 'uid'
        ? v
        : (...a: unknown[]) => {
            calls.push(k);
            return (v as (...x: unknown[]) => unknown)(...a);
          };
  return out as unknown as SocialServer & { calls: string[] };
}

describe('the use cases', () => {
  test('my row: made the first time, again when the name changed, not when it is the same', async () => {
    const put: PersonRow[] = [];
    const s = server({
      putMe: row => {
        put.push(row);
        return done();
      },
    });
    const svc = socialService({ server: s, errors: reporter([]), newId: () => 'id' });
    const mine = await svc.ensureMe({ name: null, email: 'nikos@example.org' });
    assert.ok(mine.ok);
    assert.equal(put[0]?.display_name, 'nikos', 'no name: the e-mail’s first part');
    assert.equal(svc.state.mine?.dm_from, 'buddies', 'buddies only, by default');
    assert.equal((await svc.ensureMe({ name: 'Other' })).ok && svc.state.mine.display_name, 'nikos', 'kept until forced');
    const same = server({ me: () => Promise.resolve(ok({ user_id: 'me', display_name: 'Ada', emoji: null, search: nameSearch('Ada') })) });
    const svc2 = socialService({ server: same, errors: reporter([]), newId: () => 'id' });
    await svc2.ensureMe({ name: 'Ada' });
    assert.ok(!same.calls.includes('putMe'), 'nothing changed: nothing written');
  });
  test('refresh: the inbox, the buddies, the blocks, the names; the listeners hear it', async () => {
    const svc = socialService({ server: server(), errors: reporter([]), newId: () => 'id' });
    let heard = 0;
    const off = svc.onChange(() => heard++);
    assert.ok((await svc.refresh()).ok);
    assert.equal(heard, 2, 'once at once, once after the refresh');
    assert.equal(svc.state.names['x']?.display_name, 'X');
    assert.equal(svc.waiting(), 2);
    assert.deepEqual(svc.groups(), [{ id: 'r', name: 'G' }]);
    assert.equal(svc.bond('x'), 'buddies');
    svc.changed();
    assert.equal(heard, 3);
    off();
    svc.reset();
    assert.equal(svc.state.loaded, false);
  });
  test('a listener that throws is reported, the others still hear', async () => {
    const seen: unknown[] = [];
    const svc = socialService({ server: server(), errors: reporter(seen), newId: () => 'id' });
    let heard = 0;
    svc.onChange(() => {
      if (heard++ > 0) throw new Error('boom');
    });
    svc.onChange(() => heard++);
    await svc.refresh();
    assert.equal(seen.length, 1);
  });
  test('finding people: not the ones I blocked; one letter finds no one', async () => {
    const s = server();
    const svc = socialService({ server: s, errors: reporter([]), newId: () => 'id' });
    await svc.refresh();
    const r = await svc.search('ni');
    assert.deepEqual(r.ok && r.value.map(p => p.user_id), ['x']);
    s.calls.length = 0;
    assert.deepEqual(await svc.search('n'), ok([]));
    assert.ok(!s.calls.includes('search'));
  });
  test('a file into a room: the row, the object, the check → its path; nothing left when a step fails', async () => {
    const s = server();
    const svc = socialService({ server: s, errors: reporter([]), newId: () => 'f1' });
    assert.deepEqual(await svc.putFile('r', { name: 'a.pdf', size: 3, blob: new Blob(['abc']) }, 'application/pdf'), ok('rooms/r/f1.pdf'));
    const bad = server({ finishFile: () => Promise.resolve(err(new NoemaError('cloud.server', 'size mismatch'))) });
    const svc2 = socialService({ server: bad, errors: reporter([]), newId: () => 'f2' });
    const r = await svc2.putFile('r', { name: 'a.pdf', size: 3, blob: new Blob(['abc']) }, 'application/pdf');
    assert.equal(r.ok, false);
    assert.deepEqual(bad.calls.slice(-2), ['removeObject', 'removeFileRow']);
  });
});
