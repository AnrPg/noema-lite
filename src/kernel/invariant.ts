/**
 * Invariants: conditions that hold unless the code has a bug. A broken one throws NoemaError('invariant.failed') — the
 * one place where the kernel throws instead of returning a Result, because no caller can handle a bug.
 */
import { NoemaError, type ErrorParams } from './errors.ts';

/** cond must hold; afterwards the compiler knows it does. */
export function invariant(cond: unknown, message: string, params?: ErrorParams): asserts cond {
  if (!cond) throw new NoemaError('invariant.failed', 'invariant failed: ' + message, params ? { params } : {});
}

/** A value that must be there (not null or undefined). */
export function defined<T>(value: T | null | undefined, what: string): T {
  invariant(value !== null && value !== undefined, what + ' is missing');
  return value;
}

/** The end of an exhaustive switch: the compiler proves it unreachable, and at run time it reports the stray value. */
export function assertNever(value: never, what = 'value'): never {
  throw new NoemaError('invariant.failed', `invariant failed: unexpected ${what}: ${JSON.stringify(value)}`);
}
