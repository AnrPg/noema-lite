/**
 * Result<T, E>: the outcome of an operation that can fail, as a value instead of an exception (docs/adr/004).
 *
 * The domain, the ports and the adapters return Results; exceptions are kept for bugs (a broken invariant) and for the
 * phase bridge, whose old callers expect them. A Result is a plain frozen object, so it crosses a Worker boundary as is.
 *
 *   const r = parseDay(text);                         // Result<LocalDay, NoemaError>
 *   if (!r.ok) return r;                              // narrow, then r.value / r.error
 *   map(r, d => add(d, 1)) · andThen(r, next) · match(r, { ok, err }) · all([a, b]) · unwrapOr(r, fallback)
 */
import type { NoemaError } from './errors.ts';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
export type Result<T, E = NoemaError> = Ok<T> | Err<E>;
export type AsyncResult<T, E = NoemaError> = Promise<Result<T, E>>;

export const ok = <T>(value: T): Ok<T> => Object.freeze({ ok: true as const, value });
export const err = <E>(error: E): Err<E> => Object.freeze({ ok: false as const, error });
/** The success Result of an operation that has no value. */
export const OK_VOID: Ok<void> = ok(undefined);

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** The value transformed, an error passed through. */
export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}
/** The error transformed, a value passed through. */
export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}
/** The next step, run only on success (flatMap). */
export function andThen<T, U, E, F = E>(r: Result<T, E>, f: (value: T) => Result<U, F>): Result<U, E | F> {
  return r.ok ? f(r.value) : r;
}
/** One function per case; returns what the chosen one returns. */
export function match<T, E, A, B = A>(r: Result<T, E>, cases: { ok: (value: T) => A; err: (error: E) => B }): A | B {
  return r.ok ? cases.ok(r.value) : cases.err(r.error);
}
/** The value, or `fallback` on an error. */
export function unwrapOr<T, E, F>(r: Result<T, E>, fallback: F): T | F {
  return r.ok ? r.value : fallback;
}
/** The value, or the error thrown (for the phase bridge and tests: old callers expect exceptions). */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error;
}

type OkValues<R extends readonly Result<unknown, unknown>[]> = { -readonly [K in keyof R]: R[K] extends Result<infer T, unknown> ? T : never };
type ErrOf<R extends readonly Result<unknown, unknown>[]> = R[number] extends Result<unknown, infer E> ? E : never;
/** Every value (in order), or the first error. */
export function all<const R extends readonly Result<unknown, unknown>[]>(results: R): Result<OkValues<R>, ErrOf<R>> {
  const values: unknown[] = [];
  for (const r of results) {
    if (!r.ok) return r as Err<ErrOf<R>>;
    values.push(r.value);
  }
  return ok(values as OkValues<R>);
}

/** A function that may throw, as a Result: `onThrow` turns what it threw into the error. */
export function fromThrowable<T, E>(f: () => T, onThrow: (thrown: unknown) => E): Result<T, E> {
  try {
    return ok(f());
  } catch (thrown) {
    return err(onThrow(thrown));
  }
}
/** A promise that may reject, as a Result. */
export async function fromPromise<T, E>(p: PromiseLike<T>, onReject: (thrown: unknown) => E): AsyncResult<T, E> {
  try {
    return ok(await p);
  } catch (thrown) {
    return err(onReject(thrown));
  }
}
