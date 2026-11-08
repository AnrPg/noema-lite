/**
 * The study read models' Compute jobs (registered in src/composition/jobs.ts, so the Worker and the inline fallback run
 * the same code):
 *   study.project        { events, from? } → StudyModel                 the read models of a log (from a snapshot)
 *   study.fsrs.optimize  { reviews, parameters? } → OptimizeResult      FSRS-6 fitted to the learner's reviews
 */
import { unwrap } from '../../../kernel/result.ts';
import type { JobHandler } from '../../../ports/compute.ts';
import type { FsrsParameters } from '../domain/fsrs.ts';
import { optimize, type OptimizeResult, type ReviewRecord } from '../domain/fsrs-optimizer.ts';
import type { LoggedEvent } from '../domain/projections/input.ts';
import { project, type StudyModel } from '../domain/projections/model.ts';

export const JOB_PROJECT = 'study.project';
export const JOB_OPTIMIZE = 'study.fsrs.optimize';

export interface ProjectInput {
  readonly events: readonly LoggedEvent[];
  readonly from?: StudyModel;
}
export interface OptimizeInput {
  readonly reviews: readonly ReviewRecord[];
  readonly parameters?: FsrsParameters;
}

const projectJob: JobHandler<ProjectInput, StudyModel> = input => project(input.events, input.from);

const optimizeJob: JobHandler<OptimizeInput, OptimizeResult> = (input, ctx) =>
  unwrap(
    optimize(input.reviews, {
      ...(input.parameters ? { parameters: input.parameters } : {}),
      onStep: (done, total) => {
        if (done % 10 === 0 || done === total) ctx.progress({ done, total });
      },
    }),
  );

export const STUDY_JOBS: Readonly<Record<string, JobHandler>> = {
  [JOB_PROJECT]: projectJob as JobHandler,
  [JOB_OPTIMIZE]: optimizeJob as JobHandler,
};
