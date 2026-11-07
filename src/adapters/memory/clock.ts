/**
 * A manual Clock for tests: time moves only when the test says (`advance`, `set`); timers fire in time order as it moves.
 * The day is computed in the process's time zone, like the browser clock's.
 */
import { dayOf, type LocalDay } from '../../kernel/day.ts';
import type { Clock, TimerHandle } from '../../ports/clock.ts';
import type { Unsubscribe } from '../../ports/common.ts';

interface Timer { id: number; at: number; every: number | null; f: () => void }

export interface ManualClock extends Clock {
  /** Moves time forward by ms, firing every timer that falls due on the way (in order). */
  advance(ms: number): void;
  /** Jumps to an epoch time (forward fires timers; backward fires nothing, as a changed system clock). */
  set(epochMs: number): void;
  /** Timers still waiting. */
  pending(): number;
}

export function manualClock(start: number | Date = Date.UTC(2026, 10, 7, 10), timeZone = 'UTC'): ManualClock {
  let now = start instanceof Date ? start.getTime() : start;
  let nextId = 1;
  const timers = new Map<number, Timer>();
  const dayListeners = new Set<(d: LocalDay) => void>();
  let lastDay = dayOf(now);

  const checkDay = (): void => {
    const d = dayOf(now);
    if (d !== lastDay) { lastDay = d; for (const l of [...dayListeners]) l(d); }
  };
  const add = (f: () => void, ms: number, every: number | null): TimerHandle => {
    const id = nextId++;
    timers.set(id, { id, at: now + Math.max(0, ms), every, f });
    return id as unknown as TimerHandle;
  };
  const clear = (h: TimerHandle): void => { timers.delete(h as unknown as number); };

  const clock: ManualClock = {
    now: () => now,
    today: () => dayOf(now),
    timeZone: () => timeZone,
    setTimeout: (f, ms) => add(f, ms, null),
    clearTimeout: clear,
    setInterval: (f, ms) => add(f, ms, Math.max(1, ms)),
    clearInterval: clear,
    sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const h = add(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms, null);
        const onAbort = (): void => { clear(h); reject(signal?.reason); };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    onDayChange(listener): Unsubscribe {
      dayListeners.add(listener);
      return () => { dayListeners.delete(listener); };
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.values()].filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = Math.max(now, due.at);
        if (due.every === null) timers.delete(due.id); else due.at += due.every;
        checkDay();
        due.f();
      }
      now = end;
      checkDay();
    },
    set(epochMs) {
      if (epochMs > now) clock.advance(epochMs - now);
      else { now = epochMs; checkDay(); }
    },
    pending: () => timers.size,
  };
  return clock;
}
