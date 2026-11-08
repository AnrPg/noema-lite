/**
 * The job registry (the Compute port's jobs by name) and the inline Compute that runs them on the calling thread.
 * The Worker root (src/composition/worker.ts) serves the same registry inside a Worker; the inline Compute is the
 * fallback where no Worker can start (file://, the one-file bundle without its worker source, Node tools and tests).
 * Inline, a time limit or a cancel ends the wait at once and aborts the job's signal; a job that ignores the signal
 * keeps running in the background (only a Worker can be stopped by force).
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult } from '../../kernel/result.ts';
import type { Compute, JobContext, JobHandler, JobRegistry, Progress, RunOptions } from '../../ports/compute.ts';

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface MutableJobRegistry extends JobRegistry {
  register<I, O>(name: string, handler: JobHandler<I, O>): void;
}

export function createJobRegistry(initial: { readonly [name: string]: JobHandler } = {}): MutableJobRegistry {
  const jobs = new Map<string, JobHandler>(Object.entries(initial));
  return {
    get: name => jobs.get(name),
    names: () => [...jobs.keys()].sort(),
    register(name, handler) {
      if (jobs.has(name)) throw new NoemaError('invariant.failed', 'a job is registered twice: ' + name);
      jobs.set(name, handler as JobHandler);
    },
  };
}

/** The jobs every Worker has: `core.ping` answers its input (a health check of the Worker path). */
export function coreJobs(): { readonly [name: string]: JobHandler } {
  return { 'core.ping': (input: unknown) => ({ pong: input }) };
}

export const timeoutError = (job: string, ms: number): NoemaError =>
  new NoemaError('compute.timeout', `the job ${job} took longer than ${ms} ms`, { params: { job, ms }, retryable: true });
export const cancelledError = (job: string): NoemaError =>
  new NoemaError('compute.cancelled', `the job ${job} was cancelled`, { params: { job } });
export const unknownJobError = (job: string): NoemaError =>
  new NoemaError('compute.unknown_job', 'no such job: ' + job, { params: { job } });
/** What a handler threw: a NoemaError keeps its code; anything else is compute.failed. */
export const failedError = (job: string, thrown: unknown): NoemaError =>
  thrown instanceof NoemaError
    ? thrown
    : new NoemaError('compute.failed', `the job ${job} failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`, {
        params: { job },
        cause: thrown,
      });

export interface InlineComputeOptions {
  readonly defaultTimeoutMs?: number;
  readonly setTimeout?: (f: () => void, ms: number) => unknown;
  readonly clearTimeout?: (h: unknown) => void;
}

export function inlineCompute(registry: JobRegistry, options: InlineComputeOptions = {}): Compute {
  const st = options.setTimeout ?? ((f: () => void, ms: number) => globalThis.setTimeout(f, ms));
  const ct =
    options.clearTimeout ??
    ((h: unknown) => {
      globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>);
    });
  const running = new Set<AbortController>();
  return {
    run<O>(job: string, input: unknown, o: RunOptions = {}): AsyncResult<O> {
      const handler = registry.get(job);
      if (!handler) return Promise.resolve(err(unknownJobError(job)));
      if (o.signal?.aborted) return Promise.resolve(err(cancelledError(job)));
      const ms = o.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      const ac = new AbortController();
      running.add(ac);
      return new Promise(resolve => {
        let settled = false;
        const finish = (r: Awaited<AsyncResult<O>>): void => {
          if (settled) return;
          settled = true;
          ct(timer);
          o.signal?.removeEventListener('abort', onCancel);
          running.delete(ac);
          resolve(r);
        };
        const onCancel = (): void => {
          ac.abort(cancelledError(job));
          finish(err(cancelledError(job)));
        };
        const timer = st(() => {
          ac.abort(timeoutError(job, ms));
          finish(err(timeoutError(job, ms)));
        }, ms);
        o.signal?.addEventListener('abort', onCancel, { once: true });
        ac.signal.addEventListener(
          'abort',
          () => {
            finish(err(ac.signal.reason instanceof NoemaError ? ac.signal.reason : cancelledError(job)));
          },
          { once: true },
        );
        const ctx: JobContext = {
          signal: ac.signal,
          progress: (p: Progress) => {
            if (!settled) o.onProgress?.(p);
          },
        };
        Promise.resolve()
          .then(() => handler(structuredClone(input), ctx))
          .then(
            v => {
              finish(ok(v as O));
            },
            (e: unknown) => {
              finish(err(failedError(job, e)));
            },
          );
      });
    },
    dispose() {
      for (const ac of [...running]) ac.abort(new NoemaError('compute.cancelled', 'the compute service was stopped'));
    },
  };
}
