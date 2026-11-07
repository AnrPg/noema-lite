/**
 * The device's Clock: Date.now, the local calendar day (kernel LocalDay), the platform's timers. The day-change check
 * runs only while someone listens (every minute, and when the page becomes visible again after sleeping).
 */
import { dayOf, type LocalDay } from '../../kernel/day.ts';
import type { Clock, TimerHandle } from '../../ports/clock.ts';
import type { Unsubscribe } from '../../ports/common.ts';

export interface SystemClockOptions {
  readonly now?: () => number;
  /** How often the day-change check runs (ms). */
  readonly dayCheckMs?: number;
}

export function systemClock(o: SystemClockOptions = {}): Clock {
  const now = o.now ?? Date.now;
  const T = globalThis;
  const dayListeners = new Set<(d: LocalDay) => void>();
  let timer: ReturnType<typeof T.setInterval> | null = null;
  let last: LocalDay | null = null;
  const check = (): void => {
    const d = dayOf(now());
    if (last !== null && d !== last) for (const l of [...dayListeners]) l(d);
    last = d;
  };
  const doc = (T as { document?: Document }).document;
  const onVisible = (): void => { if (doc?.visibilityState === 'visible') check(); };

  const clock: Clock = {
    now,
    today: () => dayOf(now()),
    timeZone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        // a platform without the time-zone database (very old engines): days are still local, only the name is unknown
        return 'UTC';
      }
    },
    setTimeout: (f, ms) => T.setTimeout(f, ms) as unknown as TimerHandle,
    clearTimeout: h => T.clearTimeout(h as unknown as ReturnType<typeof T.setTimeout>),
    setInterval: (f, ms) => T.setInterval(f, ms) as unknown as TimerHandle,
    clearInterval: h => T.clearInterval(h as unknown as ReturnType<typeof T.setInterval>),
    sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const h = T.setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = (): void => { T.clearTimeout(h); reject(signal?.reason); };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    onDayChange(listener): Unsubscribe {
      dayListeners.add(listener);
      if (timer === null) {
        last = dayOf(now());
        timer = T.setInterval(check, o.dayCheckMs ?? 60_000);
        doc?.addEventListener('visibilitychange', onVisible);
      }
      return () => {
        dayListeners.delete(listener);
        if (!dayListeners.size && timer !== null) {
          T.clearInterval(timer);
          timer = null;
          doc?.removeEventListener('visibilitychange', onVisible);
        }
      };
    },
  };
  return clock;
}
