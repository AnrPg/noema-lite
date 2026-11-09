/**
 * Compute port: run a named job off the main thread (docs/ARCHITECTURE.md §4).
 *
 * A job is a function registered by name in the Worker's composition root (src/composition/worker.ts) — e.g. phase 2's
 * CQRS read models. The caller sends JSON-like input (structured-clone data), gets progress, and may cancel or set a time
 * limit. A job that runs past its limit or is cancelled has its Worker stopped (an endless loop cannot freeze the app):
 * compute.timeout / compute.cancelled. A handler that throws is compute.failed (a NoemaError it threw keeps its code).
 * Where no Worker can start (file://, a test), the inline adapter runs the same jobs on the main thread.
 */
import type { AsyncResult } from '../kernel/result.ts';

export interface Progress {
  readonly done: number;
  readonly total?: number;
  readonly note?: string;
}

export interface RunOptions {
  /** Stop the job after this many milliseconds (default: the adapter's, 60 s). */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: Progress) => void;
}

export interface Compute {
  run<O>(job: string, input: unknown, options?: RunOptions): AsyncResult<O>;
  /** Stops every Worker (running jobs end as compute.cancelled). */
  dispose(): void;
}

/** What a job handler gets besides its input. */
export interface JobContext {
  /** Aborted when the caller cancels (a cooperative job checks it; a Worker is stopped anyway). */
  readonly signal: AbortSignal;
  progress(progress: Progress): void;
}

export type JobHandler<I = unknown, O = unknown> = (input: I, context: JobContext) => O | Promise<O>;

/** The registry a compute adapter runs jobs from. */
export interface JobRegistry {
  get(name: string): JobHandler | undefined;
  names(): string[];
}
