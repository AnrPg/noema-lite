/**
 * Test double: a Worker in the same thread. Messages are structured-cloned and delivered on a later macrotask (like a
 * real Worker), the worker side runs `serveJobs` — the very code src/composition/worker.ts runs — and terminate() makes
 * it deaf, as a stopped Worker is.
 */
import type { JobRegistry } from '../../ports/compute.ts';
import type { WorkerLike } from '../browser/compute.ts';
import { serveJobs, type FromWorker, type ToWorker, type WorkerScopeLike } from '../browser/worker-protocol.ts';

export function fakeWorkerFactory(registry: JobRegistry): { create: () => WorkerLike; readonly started: () => number; readonly alive: () => number } {
  let started = 0, alive = 0;
  return {
    started: () => started,
    alive: () => alive,
    create() {
      started++;
      alive++;
      let dead = false;
      const inbox: Array<(ev: { data: ToWorker }) => void> = [];
      const scope: WorkerScopeLike = {
        postMessage(m: FromWorker) {
          const copy = structuredClone(m);
          setTimeout(() => { if (!dead) worker.onmessage?.({ data: copy }); }, 0);
        },
        addEventListener: (_t, l) => { inbox.push(l); },
      };
      const worker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(m: ToWorker) {
          const copy = structuredClone(m); // throws DataCloneError like a real Worker
          setTimeout(() => { if (!dead) for (const l of inbox) l({ data: copy }); }, 0);
        },
        terminate() { if (!dead) { dead = true; alive--; } },
      };
      serveJobs(registry, scope);
      return worker;
    },
  };
}
