/**
 * THE WORKER ROOT (built to engine/core-worker.js): the Compute Worker of the browser root. It serves the same job
 * registry as the inline fallback (src/composition/jobs.ts), over the messages of src/adapters/browser/worker-protocol.ts.
 */
import { serveJobs, type WorkerScopeLike } from '../adapters/browser/worker-protocol.ts';
import { buildJobRegistry } from './jobs.ts';

serveJobs(buildJobRegistry(), globalThis as unknown as WorkerScopeLike);
