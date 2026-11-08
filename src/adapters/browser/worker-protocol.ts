/**
 * The messages between the app and its compute Worker (src/composition/worker.ts serves them):
 *   app → worker   { t: 'run', id, job, input }   { t: 'cancel', id }
 *   worker → app   { t: 'progress', id, progress }   { t: 'done', id, value }   { t: 'fail', id, error: { code, params, message } }
 * Everything is structured-clone data; an error crosses as its ErrorInfo and becomes a NoemaError again on the app's side.
 */
import type { NoemaError, ErrorInfo } from '../../kernel/errors.ts';
import type { JobContext, JobRegistry, Progress } from '../../ports/compute.ts';
import { cancelledError, failedError, unknownJobError } from '../local/jobs.ts';

export type ToWorker =
  { readonly t: 'run'; readonly id: number; readonly job: string; readonly input: unknown } | { readonly t: 'cancel'; readonly id: number };

export type FromWorker =
  | { readonly t: 'progress'; readonly id: number; readonly progress: Progress }
  | { readonly t: 'done'; readonly id: number; readonly value: unknown }
  | { readonly t: 'fail'; readonly id: number; readonly error: ErrorInfo };

/** The worker's side of a message channel (a DedicatedWorkerGlobalScope, or a fake in tests). */
export interface WorkerScopeLike {
  postMessage(message: FromWorker): void;
  addEventListener(type: 'message', listener: (ev: { data: ToWorker }) => void): void;
}

/** Serves the registry's jobs on a worker scope: one AbortController per running job. */
export function serveJobs(registry: JobRegistry, scope: WorkerScopeLike): void {
  const running = new Map<number, AbortController>();
  const fail = (id: number, e: NoemaError): void => {
    scope.postMessage({ t: 'fail', id, error: e.toJSON() });
  };
  scope.addEventListener('message', ({ data }) => {
    if (data.t === 'cancel') {
      running.get(data.id)?.abort(cancelledError(`#${data.id}`));
      return;
    }
    const { id, job, input } = data;
    const handler = registry.get(job);
    if (!handler) {
      fail(id, unknownJobError(job));
      return;
    }
    const ac = new AbortController();
    running.set(id, ac);
    const ctx: JobContext = {
      signal: ac.signal,
      progress: progress => {
        scope.postMessage({ t: 'progress', id, progress });
      },
    };
    Promise.resolve()
      .then(() => handler(input, ctx))
      .then(
        value => {
          // a value that cannot be cloned (a function, a DOM node) fails the job instead of leaving the caller waiting
          try {
            scope.postMessage({ t: 'done', id, value });
          } catch (e) {
            fail(id, failedError(job, e));
          }
        },
        (e: unknown) => {
          fail(id, failedError(job, e));
        },
      )
      .finally(() => running.delete(id));
  });
}
