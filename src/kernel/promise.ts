/** Promises for synchronous work behind an async port, and the reason of an aborted wait. */
import { textOf } from './text.ts';

/**
 * Runs `body` the way an `async` function without `await` runs: at once, its value (or the promise it returns) settles
 * the returned promise and a throw rejects it. For adapters that implement an async port with nothing to wait for (an
 * in-memory store, a test fake).
 */
export function promised<T>(body: () => T | PromiseLike<T>): Promise<T> {
  return new Promise<T>(resolve => {
    resolve(body());
  });
}

/**
 * Why `signal` was aborted, as an Error to reject with: its reason when that is one (the AbortError a bare `abort()`
 * gives, or the NoemaError a caller aborted with); any other reason wrapped in an AbortError that keeps it as its cause.
 */
export function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  return Object.assign(new Error(textOf(reason), { cause: reason }), { name: 'AbortError' });
}
