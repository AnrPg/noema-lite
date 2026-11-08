/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpret, machine } from './statechart.ts';

type Ev = { type: 'START' } | { type: 'STOP'; force?: boolean } | { type: 'TICK' };
const m = machine<{ n: number; log: string[] }, Ev, 'idle' | 'busy' | 'over'>({
  initial: 'idle',
  context: { n: 0, log: [] },
  states: {
    idle: { entry: c => ({ ...c, log: [...c.log, 'idle'] }), on: { START: { target: 'busy', action: c => ({ ...c, n: c.n + 1 }) } } },
    busy: {
      on: {
        TICK: { action: c => ({ ...c, n: c.n + 10 }) },
        STOP: [
          { target: 'over', guard: (_c, e) => e.force === true },
          { target: 'idle', guard: c => c.n < 30 },
        ],
      },
      always: [{ target: 'over', guard: c => c.n >= 100 }],
    },
    over: { final: true },
  },
});

test('transitions, guards in order, actions, entry, staying', () => {
  const s0 = m.initial();
  assert.deepEqual([s0.value, s0.context.log], ['idle', ['idle']]);
  const r1 = m.transition(s0, { type: 'START' });
  assert.equal(r1.snapshot.value, 'busy');
  assert.equal(r1.snapshot.context.n, 1);
  const r2 = m.transition(r1.snapshot, { type: 'TICK' });
  assert.deepEqual([r2.changed, r2.snapshot.value, r2.snapshot.context.n], [true, 'busy', 11]);
  assert.equal(m.transition(r2.snapshot, { type: 'STOP' }).snapshot.value, 'idle');
  assert.equal(m.transition(r2.snapshot, { type: 'STOP', force: true }).snapshot.value, 'over');
});

test('an event the state does not accept, a guard that holds for none, a final state: nothing changes', () => {
  const s0 = m.initial();
  const r = m.transition(s0, { type: 'TICK' });
  assert.equal(r.changed, false);
  assert.equal(r.snapshot, s0);
  const busy = m.initial({ n: 40, log: [] });
  const b = m.transition(m.transition(busy, { type: 'START' }).snapshot, { type: 'STOP' });
  assert.equal(b.changed, false);
  const over = m.transition(m.transition(busy, { type: 'START' }).snapshot, { type: 'STOP', force: true }).snapshot;
  assert.equal(over.done, true);
  assert.deepEqual(m.accepts(over), []);
  assert.equal(m.transition(over, { type: 'START' }).changed, false);
});

test('eventless transitions run after entry', () => {
  const r = m.transition(m.initial({ n: 99, log: [] }), { type: 'START' });
  assert.equal(r.snapshot.value, 'over');
});

test('interpret: listeners, queued sends, unsubscribe', () => {
  const s = interpret(m);
  const seen: string[] = [];
  const stop = s.subscribe((snap, e) => {
    seen.push(`${e.type}>${snap.value}`);
    if (e.type === 'START') s.send({ type: 'TICK' });
  });
  assert.equal(s.send({ type: 'START' }), true);
  assert.deepEqual(seen, ['START>busy', 'TICK>busy']);
  assert.equal(s.state.context.n, 11);
  stop();
  s.send({ type: 'STOP' });
  assert.equal(seen.length, 2);
  assert.equal(s.state.value, 'idle');
  assert.equal(s.send({ type: 'TICK' }), false);
});
