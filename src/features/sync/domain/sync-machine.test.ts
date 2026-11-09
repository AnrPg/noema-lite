/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../../kernel/errors.ts';
import {
  BACKOFF_MAX_MS,
  DEBOUNCE_MS,
  FAILED_RETRY_MS,
  OFFLINE_RETRY_MS,
  POLL_MS,
  backoffMs,
  failureKind,
  syncMachine,
} from './sync-machine.ts';
import { record } from './testing.ts';

const net = new NoemaError('cloud.network', 'offline', { retryable: true });
const server = new NoemaError('cloud.server', 'HTTP 503', { params: { status: 503 }, retryable: true });
const schema = new NoemaError('cloud.schema_old', 'no table');

test('failures: no network, try again, or wait for the learner; the backoff doubles up to five minutes', () => {
  assert.deepEqual(
    [
      failureKind(net),
      failureKind(new NoemaError('auth.network', 'x')),
      failureKind(server),
      failureKind(new NoemaError('remote.conflict', 'x', { retryable: true })),
    ],
    ['offline', 'offline', 'retry', 'retry'],
  );
  assert.deepEqual([failureKind(schema), failureKind(new NoemaError('cloud.permission', 'x'))], ['fatal', 'fatal']);
  assert.deepEqual([backoffMs(1), backoffMs(2), backoffMs(3), backoffMs(30)], [2000, 4000, 8000, BACKOFF_MAX_MS]);
});

test('the sync loop: every state and every transition', () => {
  const r = record(syncMachine);
  const { actor, clock } = r;
  const state = (): string => actor.snapshot.state;
  // stopped: nothing runs, leaving sends nothing
  actor.send({ type: 'LEAVE' });
  actor.send({ type: 'PAUSE' });
  actor.send({ type: 'CHANGED' });
  assert.deepEqual([state(), r.take()], ['stopped', []]);
  // start: pull, then push
  actor.send({ type: 'START' });
  assert.deepEqual(r.take(), [{ type: 'pull', reason: 'start' }]);
  actor.send({ type: 'CHANGED' }); // counted in what remains
  actor.send({ type: 'WAKE', reason: 'wake' }); // a round runs already
  actor.send({ type: 'PULLED' });
  assert.deepEqual([state(), r.take()], ['pushing', [{ type: 'push' }]]);
  actor.send({ type: 'PUSHED', sent: 100, remaining: 50 }); // a big outbox: the next batch at once
  assert.deepEqual([state(), r.take()], ['pushing', [{ type: 'push' }]]);
  actor.send({ type: 'PUSHED', sent: 0, remaining: 1 }); // nothing moved: after the usual wait
  assert.equal(state(), 'waiting');
  clock.advance(DEBOUNCE_MS);
  assert.deepEqual([state(), r.take()], ['pushing', [{ type: 'push' }]]);
  actor.send({ type: 'PUSHED', sent: 1, remaining: 0 });
  assert.equal(state(), 'idle');
  assert.equal(actor.snapshot.context.lastSync, clock.now());
  // a change waits 3 s; steady changes cannot hold it past 10 s
  actor.send({ type: 'CHANGED' });
  assert.equal(state(), 'waiting');
  for (let i = 0; i < 6; i++) {
    clock.advance(2000);
    actor.send({ type: 'CHANGED' });
  }
  assert.equal(state(), 'pushing', 'pushed at 10 s although the changes never stopped');
  actor.send({ type: 'LEAVE' }); // in any running state: send at once
  assert.deepEqual(r.take(), [{ type: 'push' }, { type: 'flush' }]);
  actor.send({ type: 'PUSHED', sent: 3, remaining: 0 });
  // idle pulls by itself every five minutes, and when woken
  clock.advance(POLL_MS);
  assert.deepEqual([state(), r.take()], ['pulling', [{ type: 'pull', reason: 'loop' }]]);
  actor.send({ type: 'PULLED' });
  actor.send({ type: 'PUSHED', sent: 0, remaining: 0 });
  actor.send({ type: 'WAKE', reason: 'wake' });
  assert.deepEqual(r.take().at(-1), { type: 'pull', reason: 'wake' });
  // no network: wait until on line (or a minute)
  actor.send({ type: 'FAILED', error: net });
  assert.equal(state(), 'offline');
  actor.send({ type: 'CHANGED' });
  clock.advance(OFFLINE_RETRY_MS);
  assert.equal(state(), 'pulling');
  actor.send({ type: 'PULLED' });
  actor.send({ type: 'FAILED', error: net }); // the push fails the same way
  assert.equal(state(), 'offline');
  actor.send({ type: 'WAKE', reason: 'wake' });
  assert.equal(state(), 'pulling');
  // the server failed: back off, longer each time
  actor.send({ type: 'FAILED', error: server });
  assert.deepEqual([state(), actor.snapshot.context.attempt], ['backoff', 1]);
  clock.advance(backoffMs(1));
  assert.equal(state(), 'pulling');
  actor.send({ type: 'PULLED' });
  actor.send({ type: 'FAILED', error: server });
  assert.deepEqual([state(), actor.snapshot.context.attempt], ['backoff', 2]);
  actor.send({ type: 'WAKE', reason: 'manual' });
  assert.deepEqual(r.take().at(-1), { type: 'pull', reason: 'manual' });
  // an old schema: wait for the learner (or ten minutes)
  actor.send({ type: 'FAILED', error: schema });
  assert.deepEqual([state(), actor.snapshot.context.error?.code], ['failed', 'cloud.schema_old']);
  clock.advance(FAILED_RETRY_MS);
  assert.equal(state(), 'pulling');
  actor.send({ type: 'PULLED' });
  actor.send({ type: 'FAILED', error: schema });
  actor.send({ type: 'WAKE', reason: 'wake' });
  actor.send({ type: 'PULLED' });
  actor.send({ type: 'PUSHED', sent: 0, remaining: 0 });
  actor.send({ type: 'CHANGED' });
  actor.send({ type: 'WAKE', reason: 'wake' }); // waiting, woken: pull first
  assert.equal(state(), 'pulling');
  // in use on another device: everything holds until it is free again, then this one brings in what happened
  actor.send({ type: 'PAUSE' });
  actor.send({ type: 'PAUSE' });
  actor.send({ type: 'CHANGED' });
  assert.equal(state(), 'paused');
  r.take();
  actor.send({ type: 'RESUME' });
  assert.deepEqual([state(), r.take()], ['pulling', [{ type: 'pull', reason: 'takeover' }]]);
  actor.send({ type: 'STOP' });
  assert.equal(state(), 'stopped');
  assert.deepEqual(r.untaken(), [], 'every transition was taken');
});
