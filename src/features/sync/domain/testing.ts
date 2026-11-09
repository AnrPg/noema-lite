/**
 * Test helpers of the sync domain: a manual scheduler and a recorder that runs a machine, keeps the effects it asked for
 * and the transitions it took (to prove every one was exercised).
 */
import { createActor, transitionIds, type Actor, type MachineDef, type MachineEvent, type Scheduler } from '../../../kernel/statechart.ts';

export interface ManualScheduler extends Scheduler<number> {
  advance(ms: number): void;
}

export function manualScheduler(start = Date.UTC(2026, 10, 8, 10)): ManualScheduler {
  let now = start,
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
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].f();
      }
      now = end;
    },
  };
}

export interface Recorder<S extends string, C, E extends MachineEvent, F> {
  readonly actor: Actor<S, C, E, F>;
  readonly clock: ManualScheduler;
  /** The effects asked for since the last call (and forgets them). */
  take(): F[];
  /** The transitions of the machine never taken. */
  untaken(): string[];
}

export function record<S extends string, C, E extends MachineEvent, F>(def: MachineDef<S, C, E, F>): Recorder<S, C, E, F> {
  const clock = manualScheduler();
  let effects: F[] = [];
  const taken = new Set<string>();
  const actor = createActor(def, {
    scheduler: clock,
    run: f => {
      effects.push(f);
    },
    onError: e => {
      throw e;
    },
  });
  actor.subscribe((_, step) => {
    if (step.taken) taken.add(step.taken);
  });
  return {
    actor,
    clock,
    take() {
      const out = effects;
      effects = [];
      return out;
    },
    untaken: () => transitionIds(def).filter(id => !taken.has(id)),
  };
}
