/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../../kernel/errors.ts';
import {
  LEASE_BEAT_MS,
  LEASE_FRESH_MS,
  LEASE_POLL_MS,
  isLive,
  leaseMachine,
  parseLease,
  type LeaseEvent,
  type LeaseHolder,
  type LeaseValue,
} from './lease.ts';
import { record } from './testing.ts';

test('the lease row: parsed or nothing; live while renewed and not released', () => {
  const now = 1_000_000;
  const v = parseLease(JSON.stringify({ sid: 't1', dev: 'd1', os: 'iphone', br: 'Safari', at: now - 1000 }));
  assert.deepEqual(v, { sid: 't1', dev: 'd1', os: 'iphone', br: 'Safari', at: now - 1000 });
  assert.equal(parseLease(JSON.stringify({ sid: 't1', at: 1, os: 'toaster' }))?.os, 'other');
  assert.deepEqual([parseLease(null), parseLease('{nope'), parseLease('[1]'), parseLease('{"sid":1,"at":2}')], [null, null, null, null]);
  assert.ok(isLive(v, now));
  assert.ok(!isLive(v, now + LEASE_FRESH_MS));
  assert.ok(!isLive({ ...v, released: true }, now));
  assert.ok(!isLive(null, now));
});

test('one device at a time: every state and every transition', () => {
  const r = record(leaseMachine);
  const { actor, clock } = r;
  const st = (): string => actor.snapshot.state;
  const status = (): string => actor.snapshot.context.settled;
  const other: LeaseHolder = { os: 'iphone', br: 'Safari', sameDevice: false, at: 0 };
  const row = (at: number, extra: Partial<LeaseValue> = {}): LeaseValue => ({
    sid: 'tabB',
    dev: 'devB',
    os: 'iphone',
    br: 'Safari',
    at,
    ...extra,
  });
  const read = (value: LeaseValue | null, version: string | null, mine = false): LeaseEvent => ({
    type: 'READ',
    value,
    version,
    mine,
    holder: value && !mine ? { ...other, at: value.at } : null,
  });
  const offline: LeaseEvent = { type: 'FAILED', error: new NoemaError('cloud.network', 'offline', { retryable: true }) };

  // off: not signed in
  actor.send({ type: 'CHECK', take: false });
  assert.deepEqual(r.take(), [{ type: 'settled', status: 'unknown', holder: null }]);
  actor.send({ type: 'STOP' });
  actor.send({ type: 'START', visible: true });
  assert.deepEqual([st(), r.take()], ['checking', [{ type: 'read' }]]);
  // checking: a fresh row of another device → wait
  actor.send({ type: 'CHECK', take: false });
  actor.send({ type: 'TOUCH' });
  actor.send({ type: 'VISIBLE', visible: true });
  actor.send(read(row(clock.now()), 'v1'));
  assert.deepEqual(
    [st(), status(), r.take()],
    ['other', 'other', [{ type: 'settled', status: 'other', holder: { ...other, at: clock.now() } }]],
  );
  actor.send({ type: 'TOUCH' });
  actor.send({ type: 'RELEASE' }); // nothing held here
  actor.send({ type: 'VISIBLE', visible: false });
  clock.advance(LEASE_POLL_MS); // hidden: it does not look
  assert.equal(st(), 'other');
  actor.send({ type: 'VISIBLE', visible: true });
  assert.equal(st(), 'checking');
  actor.send(offline); // offline: still waiting
  assert.deepEqual([st(), status()], ['other', 'other']);
  clock.advance(LEASE_POLL_MS); // shown: looks again every 10 s
  assert.equal(st(), 'checking');
  actor.send(read(row(clock.now()), 'v1'));
  // "Use here": take it anyway, and bring in what the other device did
  actor.send({ type: 'CHECK', take: true });
  r.take();
  actor.send(read(row(clock.now()), 'v2'));
  assert.deepEqual([st(), r.take()], ['claiming', [{ type: 'write', expected: 'v2' }]]);
  actor.send(offline); // the write failed: still waiting
  assert.equal(st(), 'other');
  actor.send({ type: 'CHECK', take: true });
  actor.send(read(row(clock.now()), 'v2'));
  actor.send({ type: 'CHECK', take: true });
  actor.send({ type: 'TOUCH' });
  actor.send({ type: 'VISIBLE', visible: true });
  actor.send({ type: 'RACE' }); // someone wrote it in between: look again
  assert.equal(st(), 'checking');
  actor.send(read(row(clock.now()), 'v3'));
  actor.send({ type: 'WRITTEN', version: 'v4' });
  assert.deepEqual(r.take().slice(-2), [{ type: 'settled', status: 'mine', holder: null }, { type: 'broughtIn' }]);
  assert.deepEqual([st(), actor.snapshot.context.version], ['mine', 'v4']);
  // mine: renewed every 30 s while used; a touch renews it at most every 30 s
  actor.send({ type: 'TOUCH' });
  assert.equal(st(), 'mine', 'just renewed');
  clock.advance(LEASE_BEAT_MS);
  assert.equal(st(), 'checking');
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v4', true));
  actor.send({ type: 'WRITTEN', version: 'v5' });
  assert.deepEqual(r.take().slice(-1), [{ type: 'settled', status: 'mine', holder: null }], 'renewing its own lease brings nothing in');
  clock.advance(LEASE_BEAT_MS + 1);
  r.take();
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v5', true));
  actor.send({ type: 'WRITTEN', version: 'v6' });
  clock.advance(LEASE_BEAT_MS + 1);
  actor.send({ type: 'TOUCH' }); // checking already
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v6', true));
  actor.send({ type: 'WRITTEN', version: 'v7' });
  actor.send({ type: 'VISIBLE', visible: false }); // hidden (the release comes separately): the next beat does not renew
  clock.advance(LEASE_BEAT_MS + 1);
  assert.equal(st(), 'mine');
  actor.send({ type: 'TOUCH' }); // touched, a beat is due: renew now
  assert.equal(st(), 'checking');
  actor.send({ type: 'WRITTEN', version: 'stray' }); // not an answer checking waits for
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v7', true));
  actor.send({ type: 'WRITTEN', version: 'v8' });
  actor.send({ type: 'VISIBLE', visible: true }); // shown again: renew
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v8', true));
  actor.send({ type: 'WRITTEN', version: 'v9' });
  actor.send({ type: 'CHECK', take: false });
  actor.send(offline); // offline: still mine
  assert.deepEqual([st(), status()], ['mine', 'mine']);
  actor.send({ type: 'CHECK', take: false });
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'v9', true));
  actor.send(offline); // the renewal failed: still mine
  assert.deepEqual([st(), status()], ['mine', 'mine']);
  // hidden: let it go
  r.take();
  actor.send({ type: 'RELEASE' });
  assert.deepEqual(
    [st(), r.take()],
    [
      'idle',
      [
        { type: 'release', expected: 'v9' },
        { type: 'settled', status: 'unknown', holder: null },
      ],
    ],
  );
  // idle: late answers are ignored, a late write is let go again
  for (const e of [read(null, null), { type: 'RACE' }, offline, { type: 'RELEASE' }] as LeaseEvent[]) actor.send(e);
  actor.send({ type: 'WRITTEN', version: 'late' });
  assert.deepEqual(r.take(), [{ type: 'release', expected: 'late' }]);
  clock.advance(LEASE_BEAT_MS + 1); // hidden: the idle timer does not look
  actor.send({ type: 'TOUCH' }); // a beat is due: look
  assert.equal(st(), 'checking');
  actor.send({ type: 'VISIBLE', visible: false });
  actor.send(read(null, null)); // nobody is using this tab: nothing taken
  assert.deepEqual([st(), status()], ['idle', 'unknown']);
  actor.send({ type: 'VISIBLE', visible: false });
  actor.send({ type: 'TOUCH' }); // just looked
  clock.advance(LEASE_POLL_MS); // hidden: does not look
  actor.send({ type: 'VISIBLE', visible: true });
  actor.send(read(row(clock.now(), { sid: 'tabA' }), 'w1', true));
  actor.send({ type: 'WRITTEN', version: 'w2' });
  // the page hides while a check runs: let go at once
  actor.send({ type: 'CHECK', take: false });
  actor.send({ type: 'RELEASE' });
  assert.deepEqual(r.take().slice(-2), [
    { type: 'release', expected: 'w2' },
    { type: 'settled', status: 'unknown', holder: null },
  ]);
  // idle and shown and used: looks every 10 s; a stale row of another device is taken silently
  actor.send({ type: 'VISIBLE', visible: true });
  actor.send(offline); // back to idle
  clock.advance(LEASE_POLL_MS);
  assert.equal(st(), 'idle', 'a beat is not due yet');
  clock.advance(LEASE_BEAT_MS);
  assert.equal(st(), 'checking');
  actor.send(read(row(clock.now() - LEASE_FRESH_MS), 'x1'));
  actor.send({ type: 'RACE' });
  actor.send(read(row(clock.now() - LEASE_FRESH_MS), 'x2'));
  actor.send({ type: 'RACE' });
  actor.send(read(row(clock.now() - LEASE_FRESH_MS), 'x3'));
  actor.send({ type: 'RACE' }); // the third race: give up for now
  assert.deepEqual([st(), status()], ['idle', 'unknown']);
  actor.send({ type: 'CHECK', take: false });
  actor.send(read(null, null));
  actor.send(offline); // the write failed
  assert.equal(st(), 'idle');
  actor.send({ type: 'CHECK', take: false });
  actor.send(read(null, null));
  actor.send({ type: 'RELEASE' }); // hidden while the write is under way
  actor.send({ type: 'WRITTEN', version: 'y1' });
  assert.deepEqual(r.take().slice(-1), [{ type: 'release', expected: 'y1' }]);
  actor.send({ type: 'CHECK', take: false });
  actor.send(read(null, null));
  actor.send({ type: 'WRITTEN', version: 'y2' });
  r.take();
  actor.send({ type: 'STOP' });
  assert.deepEqual([st(), r.take()], ['off', [{ type: 'settled', status: 'unknown', holder: null }]]);
  assert.deepEqual(r.untaken(), [], 'every transition was taken');
});
