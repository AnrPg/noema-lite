/**
 * The search index's Compute job (registered in src/composition/jobs.ts):
 *   catalog.records  SourceInput → CatalogRecord[]   the records of one source (a pack, a Roadmap, a course, the conversations)
 */
import type { JobHandler } from '../../../ports/compute.ts';
import { recordsOf, type CatalogRecord, type SourceInput } from '../domain/records.ts';

export const JOB_RECORDS = 'catalog.records';

const recordsJob: JobHandler<SourceInput, CatalogRecord[]> = input => recordsOf(input);

export const CATALOG_JOBS: Readonly<Record<string, JobHandler>> = { [JOB_RECORDS]: recordsJob as JobHandler };
