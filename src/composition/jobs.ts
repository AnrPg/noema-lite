/**
 * The Compute jobs of the app, the same in the Worker (src/composition/worker.ts) and in the inline fallback
 * (src/composition/browser.ts): a job is added by appending its registration to JOB_REGISTRATIONS.
 */
import { coreJobs, createJobRegistry, type MutableJobRegistry } from '../adapters/local/jobs.ts';
import { CATALOG_JOBS } from '../features/catalog/application/jobs.ts';
import { STUDY_JOBS } from '../features/study/application/jobs.ts';

export type JobRegistration = (r: MutableJobRegistry) => void;

/** Helpers and later phases append here (e.g. phase 2's read models). */
export const JOB_REGISTRATIONS: readonly JobRegistration[] = [
  // the study read models (projections of the learning log) and FSRS-6 fitting; the search index's records
  r => {
    for (const [name, handler] of Object.entries({ ...STUDY_JOBS, ...CATALOG_JOBS })) r.register(name, handler);
  },
];

export function buildJobRegistry(extra: readonly JobRegistration[] = []): MutableJobRegistry {
  const r = createJobRegistry(coreJobs());
  for (const register of [...JOB_REGISTRATIONS, ...extra]) register(r);
  return r;
}
