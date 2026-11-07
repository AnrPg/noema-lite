/**
 * Compute in Web Workers: a small pool (one job per Worker at a time). A job past its time limit, or cancelled, has its
 * Worker terminated — an endless loop stops for real — and the pool starts a fresh one when needed. A Worker that cannot
 * start (file://, a blocked script) makes the adapter fall back to the inline Compute for that and every later job.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult, type Result } from '../../kernel/result.ts';
import type { Compute, RunOptions } from '../../ports/compute.ts';
import { DEFAULT_TIMEOUT_MS, cancelledError, timeoutError } from '../local/jobs.ts';
import type { FromWorker, ToWorker } from './worker-protocol.ts';

/** The Worker as the pool uses it (the DOM's Worker, or a fake in tests). */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((ev: { data: FromWorker }) => void) | null;
  onerror: ((ev: { message?: string }) => void) | null;
}

export interface WorkerComputeOptions {
  /** Makes a Worker (throws when none can start). */
  readonly createWorker: () => WorkerLike;
  /** Runs jobs when no Worker can start. */
  readonly fallback: Compute;
  readonly maxWorkers?: number;
  readonly defaultTimeoutMs?: number;
  /** Told once when the Workers are given up for the fallback. */
  readonly onUnavailable?: (error: NoemaError) => void;
}

interface Slot { worker: WorkerLike; busy: boolean }

export function workerCompute(o: WorkerComputeOptions): Compute {
  const max = Math.max(1, o.maxWorkers ?? 2);
  const slots: Slot[] = [];
  const waiting: Array<() => void> = [];
  const active = new Set<() => void>(); // cancels every running job (dispose)
  let nextId = 1, broken = false;

  const spawn = (): Result<Slot> => {
    try {
      const s: Slot = { worker: o.createWorker(), busy: false };
      slots.push(s);
      return ok(s);
    } catch (e) {
      broken = true;
      const ne = new NoemaError('compute.unavailable', 'no Worker can start here: jobs run on the main thread', { cause: e });
      o.onUnavailable?.(ne);
      return err(ne);
    }
  };
  const drop = (s: Slot): void => {
    s.worker.terminate();
    const i = slots.indexOf(s);
    if (i >= 0) slots.splice(i, 1);
    waiting.shift()?.();
  };
  const release = (s: Slot): void => { s.busy = false; s.worker.onmessage = null; s.worker.onerror = null; waiting.shift()?.(); };
  /** A free Worker: an idle one, a new one while the pool is not full, else the next one to be released. */
  const acquire = async (): Promise<Result<Slot>> => {
    for (;;) {
      const idle = slots.find(s => !s.busy);
      if (idle) { idle.busy = true; return ok(idle); }
      if (slots.length < max) { const s = spawn(); if (s.ok) s.value.busy = true; return s; }
      await new Promise<void>(r => waiting.push(r));
    }
  };

  return {
    async run<I, O>(job: string, input: I, ro: RunOptions = {}): AsyncResult<O> {
      if (broken) return o.fallback.run<I, O>(job, input, ro);
      if (ro.signal?.aborted) return err(cancelledError(job));
      const got = await acquire();
      if (!got.ok) return o.fallback.run<I, O>(job, input, ro);
      const slot = got.value, id = nextId++;
      const ms = ro.timeoutMs ?? o.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      return new Promise(resolve => {
        let done = false;
        const finish = (r: Result<O>, kill: boolean): void => {
          if (done) return;
          done = true;
          active.delete(onAbort);
          clearTimeout(timer);
          ro.signal?.removeEventListener('abort', onAbort);
          if (kill) drop(slot); else release(slot);
          resolve(r);
        };
        const onAbort = (): void => finish(err(cancelledError(job)), true);
        const timer = setTimeout(() => finish(err(timeoutError(job, ms)), true), ms);
        ro.signal?.addEventListener('abort', onAbort, { once: true });
        active.add(onAbort);
        slot.worker.onmessage = ({ data }) => {
          if (data.id !== id) return;
          if (data.t === 'progress') ro.onProgress?.(data.progress);
          else if (data.t === 'done') finish(ok(data.value as O), false);
          else finish(err(NoemaError.fromInfo(data.error, 'compute.failed')), false);
        };
        slot.worker.onerror = ev => finish(err(new NoemaError('compute.failed', `the Worker of ${job} stopped: ${ev.message ?? 'error'}`, { params: { job } })), true);
        try {
          slot.worker.postMessage({ t: 'run', id, job, input });
        } catch (e) {
          finish(err(new NoemaError('compute.failed', `the input of ${job} cannot be sent to a Worker`, { cause: e, params: { job } })), false);
        }
      });
    },
    dispose() {
      for (const cancel of [...active]) cancel();
      for (const s of [...slots]) drop(s);
      o.fallback.dispose();
    },
  };
}
