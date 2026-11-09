/**
 * THE WORKER ROOT (built to build/worker.js): the Compute Worker of the browser root. It serves the same job
 * registry as the inline fallback (src/composition/jobs.ts), over the messages of src/adapters/browser/worker-protocol.ts.
 */
import { serveJobs } from '../adapters/browser/worker-protocol.ts';
import { buildJobRegistry } from './jobs.ts';

serveJobs(buildJobRegistry(), globalThis);
