/**
 * Clock port: the time, the learner's day, and timers (docs/ARCHITECTURE.md §4, docs/adr/005).
 *
 * The only way the domain and the engines learn the time. `today()` is the learner's LOCAL calendar day (LocalDay), the
 * one "today" for streaks, daily XP, due cards and daily caps. Tests use a manual clock and move time by hand.
 */
import type { LocalDay } from '../kernel/day.ts';
import type { Unsubscribe } from './common.ts';

/** An opaque timer id (each adapter casts its own kind to it). */
export interface TimerHandle {
  readonly __timerHandle: never;
}

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
  /** The learner's calendar day now, in the device's time zone. */
  today(): LocalDay;
  /** The device's IANA time zone ("Europe/Athens"), or "UTC" when the platform does not say. */
  timeZone(): string;
  /** Calls `f` once after `ms`. */
  setTimeout(f: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  /** Calls `f` every `ms`. */
  setInterval(f: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  /** A promise that resolves after `ms` (rejects with the signal's reason when it is aborted first). */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Called when the learner's day changes while the app is open (checked every minute and when timers fire). */
  onDayChange(listener: (today: LocalDay) => void): Unsubscribe;
}
