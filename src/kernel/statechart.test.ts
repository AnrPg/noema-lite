/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActor, initialStep, transition, transitionIds, type MachineDef, type Scheduler } from './statechart.ts';

type S = 'idle' | 'busy' | 'done';
type E = { type: 'GO'; n: number } | { type: 'TICK' } | { type: 'STOP' } | { type: 'RESET' };
type F = 'work' | 'leftIdle' | 'enteredBusy' | 'finished' | 'boom';
interface C {
  readonly n: number;
  readonly ticks: number;
}

const def: MachineDef<S, C, E, F> = {
  id: 'test',
  initial: 'idle',
  context: { n: 0, ticks: 0 },
  states: {
    idle: {
      exit: ['leftIdle'],
      on: {
        GO: [
          { guard: (_, e) => e.n < 0, effects: ['boom'] },
          { target: 'busy', assign: (c, e) => ({ ...c, n: e.n }), effects: ['work'] },
        ],
      },
    },
    busy: {
      entry: ['enteredBusy'],
      on: { TICK: { assign: c => ({ ...c, ticks: c.ticks + 1 }) }, GO: { target: 'busy', assign: (c, e) => ({ ...c, n: e.n }) } },
      after: [
        {
          delay: c => c.n * 100,
          then: [
            { guard: c => c.ticks > 5, target: 'idle' },
            { target: 'done', effects: ['finished'] },
          ],
        },
      ],
    },
    done: { on: { RESET: { target: 'idle', assign: () => ({ n: 0, ticks: 0 }) } } },
  },
  on: { STOP: { target: 'done' } },
};

/** A manual scheduler: time moves when the test says. */
function manual(): Scheduler<number> & { advance(ms: number): void } {
  let now = 0,
    id = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  return {
    now: () => now,
    setTimeout(f, ms) {
      timers.set(++id, { at: now + ms, f });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].f();
      }
      now = end;
    },
  };
}

test('transition is pure: guards pick the first that holds; exit → transition → entry effects; internal transitions stay', () => {
  const meta = { now: 0 };
  const s0 = initialStep(def, meta);
  assert.deepEqual([s0.snapshot.state, s0.effects, s0.entered], ['idle', [], true]);
  const neg = transition(def, s0.snapshot, { type: 'GO', n: -1 }, meta);
  assert.deepEqual([neg.snapshot.state, neg.effects, neg.taken, neg.entered], ['idle', ['boom'], 'idle.on.GO.0', false]);
  const go = transition(def, s0.snapshot, { type: 'GO', n: 3 }, meta);
  assert.deepEqual(
    [go.snapshot.state, go.snapshot.context.n, go.effects, go.taken],
    ['busy', 3, ['leftIdle', 'work', 'enteredBusy'], 'idle.on.GO.1'],
  );
  assert.deepEqual(go.timers, [{ index: 0, delay: 300 }]);
  const tick = transition(def, go.snapshot, { type: 'TICK' }, meta);
  assert.deepEqual([tick.snapshot.state, tick.snapshot.context.ticks, tick.entered, tick.timers], ['busy', 1, false, []]);
  assert.equal(transition(def, s0.snapshot, { type: 'TICK' }, meta).taken, null, 'an event nobody answers changes nothing');
  assert.equal(transition(def, go.snapshot, { type: 'STOP' }, meta).taken, '*.on.STOP.0', 'the machine-wide answer');
  assert.equal(transition(def, go.snapshot, { type: '@after', index: 7 }, meta).taken, null, 'an unknown timer');
  const many = { ...go.snapshot, context: { n: 3, ticks: 6 } };
  assert.deepEqual(
    [
      transition(def, many, { type: '@after', index: 0 }, meta).taken,
      transition(def, go.snapshot, { type: '@after', index: 0 }, meta).taken,
    ],
    ['busy.after.0.0', 'busy.after.0.1'],
    'a timer takes the first of its transitions whose guard holds',
  );
  assert.equal(go.snapshot.context.ticks, 0, 'the old snapshot is untouched');
});

test('the actor runs events one at a time, fires timers, ignores the timers of a state it left, and covers every transition', () => {
  const clock = manual();
  const ran: F[] = [],
    taken = new Set<string>();
  const actor = createActor(def, {
    scheduler: clock,
    run: (f, send) => {
      ran.push(f);
      if (f === 'work') send({ type: 'TICK' }); // an effect that sends: handled after the current event
    },
    onError: () => assert.fail('no effect throws'),
  });
  actor.subscribe((_, step) => {
    if (step.taken) taken.add(step.taken);
  });
  actor.send({ type: 'GO', n: -1 });
  actor.send({ type: 'GO', n: 2 });
  assert.deepEqual([actor.snapshot.state, actor.snapshot.context.ticks], ['busy', 1]);
  clock.advance(150);
  actor.send({ type: 'GO', n: 1 }); // re-enter: the 200 ms timer stops, a 100 ms one starts
  clock.advance(60);
  assert.equal(actor.snapshot.state, 'busy', 'the first timer (200 ms after the first entry) was dropped');
  clock.advance(50);
  assert.equal(actor.snapshot.state, 'done');
  actor.send({ type: 'RESET' });
  actor.send({ type: 'STOP' });
  assert.deepEqual(ran, ['boom', 'leftIdle', 'work', 'enteredBusy', 'enteredBusy', 'finished', 'leftIdle']);
  taken.add('busy.after.0.0'); // its guard (more than five ticks) is the pure test's above
  assert.deepEqual([...taken].sort(), transitionIds(def).sort(), 'every transition of the machine was taken');
  actor.stop();
  actor.send({ type: 'RESET' });
  assert.equal(actor.snapshot.state, 'done', 'a stopped actor ignores events');
});

test('an effect that throws is reported and the machine goes on', () => {
  const errors: unknown[] = [];
  const actor = createActor(def, {
    scheduler: manual(),
    run: f => {
      if (f === 'work') throw new Error('broken effect');
    },
    onError: e => errors.push(e),
  });
  actor.send({ type: 'GO', n: 1 });
  assert.equal(actor.snapshot.state, 'busy');
  assert.equal(errors.length, 1);
});
