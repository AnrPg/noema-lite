/**
 * The study read models as a service (CQRS, the query side of the learning log): the model is rebuilt from the whole
 * log in the Worker (Compute job `study.project`) and then kept up to date on the main thread, event by event, as the
 * log reports new ones — so a screen reads the learner's last answer at once, and a rebuild of thousands of events
 * never blocks the page. The FSRS parameters are fitted to the learner's own reviews in the Worker too
 * (`study.fsrs.optimize`).
 *
 * The log is reached through EventFeed: the learning log's event store (src/features/study/domain/events and its
 * EventStore port) as the read models need it — every event, and the new ones as they are appended or synced.
 */
import { ok, type AsyncResult, type Result } from '../../../kernel/result.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { Compute, Progress } from '../../../ports/compute.ts';
import type { OptimizeResult } from '../domain/fsrs-optimizer.ts';
import type { LoggedEvent } from '../domain/projections/input.ts';
import { emptyModel, project, reviewLog, type StudyModel } from '../domain/projections/model.ts';
import { JOB_OPTIMIZE, JOB_PROJECT, type OptimizeInput, type ProjectInput } from './jobs.ts';

/** The learning log, read side. */
export interface EventFeed {
  /** Every event of the log (any order: the projections sort by HLC). */
  all(): AsyncResult<readonly LoggedEvent[]>;
  /** Called with the events appended (or synced from another device) after subscribing. */
  subscribe(listener: (events: readonly LoggedEvent[]) => void): Unsubscribe;
}

export interface StudyReadModels {
  /** The model as it is now. */
  current(): StudyModel;
  /** Folds events in at once (the main thread): the same model the Worker would build. */
  apply(events: readonly LoggedEvent[]): StudyModel;
  /** Builds the model from the log in the Worker and follows the log from then on. */
  start(): AsyncResult<StudyModel>;
  /** Builds the model of these events (or of the whole log) in the Worker and makes it current. */
  rebuild(events?: readonly LoggedEvent[]): AsyncResult<StudyModel>;
  /** Fits the FSRS parameters to the review log of the model (Worker); the caller records the result as a setting. */
  optimize(onProgress?: (p: Progress) => void): AsyncResult<OptimizeResult>;
  onChange(listener: (model: StudyModel) => void): Unsubscribe;
}

export interface StudyReadModelDeps {
  readonly compute: Compute;
  readonly feed: EventFeed | null;
  readonly report: (error: unknown, where: string) => void;
}

export function createStudyReadModels(d: StudyReadModelDeps): StudyReadModels {
  let model = emptyModel(),
    following: Unsubscribe | null = null,
    /** the events folded in on the main thread while a Worker rebuild runs (null: none runs) */
    during: LoggedEvent[] | null = null;
  const listeners = new Set<(m: StudyModel) => void>();
  const set = (m: StudyModel): StudyModel => {
    if (m === model) return m;
    model = m;
    for (const f of listeners) {
      try {
        f(m);
      } catch (e) {
        d.report(e, 'study.readmodels.listener');
      }
    }
    return m;
  };
  const apply = (events: readonly LoggedEvent[]): StudyModel => {
    during?.push(...events);
    return set(project(events, model));
  };

  async function rebuild(events?: readonly LoggedEvent[]): AsyncResult<StudyModel> {
    let list = events;
    if (!list) {
      if (!d.feed) return ok(model);
      const all = await d.feed.all();
      if (!all.ok) return all;
      list = all.value;
    }
    const mine: LoggedEvent[] = [];
    during = mine;
    const r = await d.compute.run<StudyModel>(JOB_PROJECT, { events: list } satisfies ProjectInput);
    if (during === mine) during = null;
    if (!r.ok) return r;
    // the events the page folded in while the Worker built (the learner went on answering) go on top
    return ok(set(project(mine, r.value)));
  }

  return {
    current: () => model,
    apply,
    async start() {
      if (d.feed && !following)
        following = d.feed.subscribe(events => {
          apply(events);
        });
      return rebuild();
    },
    rebuild,
    async optimize(onProgress) {
      const input: OptimizeInput = { reviews: reviewLog(model), parameters: model.fsrs.parameters };
      const r: Result<OptimizeResult> = await d.compute.run<OptimizeResult>(
        JOB_OPTIMIZE,
        input,
        onProgress ? { onProgress, timeoutMs: 120_000 } : { timeoutMs: 120_000 },
      );
      return r;
    },
    onChange(f) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
  };
}
