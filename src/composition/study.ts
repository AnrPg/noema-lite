/**
 * The study domain and its read models on the phase bridge (NoemaCore.study, NoemaCore.catalog): the browser root
 * registers STUDY (the read-model service), the bridge names below, and the Compute jobs (jobs.ts). The bridge speaks
 * the old UI's language: plain values, a day as "YYYY-MM-DD", the moment as epoch ms (now when left out), and a
 * NoemaError thrown where the domain returns an error.
 *
 *   NoemaCore.study.grade(ex, answer, { regions }) → { ok: true | false | null (incomplete), score, items?, typos?, missing?, parts? }
 *   NoemaCore.study.fsrs.review(state, rating 1–4, { at, parameters, retention }) → the card's FSRS memory after it
 *                   .memory(state) → memory | null · isDue(state, day?) · dueDay(state) → day | null
 *                   .retrievability(state, at?) · later(a, b) · defaults · optimize(reviews, parameters?) → Promise<result>
 *   NoemaCore.study.cards.queue(cards [{ key }], states, { day, newPerDay, all }) → { queue, due, fresh, resting }
 *                   .countDue(states, keys?, day?)
 *   NoemaCore.study.practice.mistakes(exercises, answers) · countMistakes(answers) · order(list, answers)
 *                   · sibling(ex, round, all) · spread(list) · solved(answers, id)
 *   NoemaCore.study.progress.chapter(chapter, read, answers) → { sr, ex } · chaptersDone(chapters, read, boss)
 *                   · levels(chapters, read, answers, { packLevels, ladder })
 *   NoemaCore.study.xp.today(byDay, day?) · goalReached(byDay, goal, day?) · streak(byDay, day?, carried?) · level(xp)
 *   NoemaCore.study.models.current() · apply(events) · start() · rebuild(events?) · optimize() · refit() · onChange(fn)
 *   NoemaCore.catalog.fromPack / fromCurriculum / fromLangCourse / fromConvos · blockIds · blockText · trapId
 *                   · hash36 · plain · toneNumbers · BLOCK_KIND · SCHEMA · index(account, sources) → the account's index
 */
import { browserStorage } from '../adapters/browser/storage.ts';
import { dayOf, parseDay, type LocalDay } from '../kernel/day.ts';
import { NoemaError } from '../kernel/errors.ts';
import type { Result } from '../kernel/result.ts';
import type { DocumentStore } from '../ports/storage.ts';
import { createCatalogIndex, INDEX_COLLECTION, type IndexSource } from '../features/catalog/application/index-store.ts';
import { JOB_RECORDS } from '../features/catalog/application/jobs.ts';
import * as records from '../features/catalog/domain/records.ts';
import { JOB_OPTIMIZE, type OptimizeInput } from '../features/study/application/jobs.ts';
import { createStudyReadModels, type EventFeed, type StudyReadModels } from '../features/study/application/read-models.ts';
import {
  FSRS6_DEFAULT_PARAMETERS,
  cardMemoryOf,
  checkParameters,
  dueDay,
  isRating,
  laterReview,
  newCard,
  scheduler,
  type CardMemory,
} from '../features/study/domain/fsrs.ts';
import { shouldRefit, type OptimizeResult, type ReviewRecord } from '../features/study/domain/fsrs-optimizer.ts';
import { gradeExercise, type Answer, type Exercise } from '../features/study/domain/grading/grade.ts';
import type { Region } from '../features/study/domain/grading/regions.ts';
import type { LoggedEvent } from '../features/study/domain/projections/input.ts';
import * as Q from '../features/study/domain/queries.ts';
import type { BridgeExtension } from './bridge.ts';
import { token, type Registration, type Resolver } from './container.ts';
import { CLOCK, COMPUTE, ERRORS } from './tokens.ts';

/** The learning log as the read models read it (registered by the learning log's event store). */
export const STUDY_EVENTS = token<EventFeed>('study.events', 'the learning log, read side (every event, and the new ones)');
export const STUDY = token<StudyReadModels>(
  'study.readModels',
  'the study read models (CQRS: projected in the Worker, followed on the page)',
);
/** The search index's store: its own IndexedDB "noema-lite-search", collection "src" (one entry per account and source). */
export const CATALOG_STORE = token<DocumentStore>('catalog.store', 'where the search index is kept on this device');

export const STUDY_REGISTRATIONS: readonly Registration[] = [
  c =>
    c.register(STUDY, r =>
      createStudyReadModels({
        compute: r.get(COMPUTE),
        feed: r.has(STUDY_EVENTS) ? r.get(STUDY_EVENTS) : null,
        report: (e, where) => r.get(ERRORS).report(e, { where, severity: 'warning' }),
      }),
    ),
  c => c.register(CATALOG_STORE, () => browserStorage({ dbName: 'noema-lite-search', dbVersion: 1, collections: [INDEX_COLLECTION] }).docs),
];

const unwrapOr = <T>(r: Result<T>): T => {
  if (r.ok) return r.value;
  throw r.error;
};

/** The study surface of the bridge. */
export function studyBridge(r: Resolver): unknown {
  const clock = r.get(CLOCK);
  const day = (d?: string): LocalDay => {
    if (d === undefined) return clock.today();
    return unwrapOr(parseDay(d));
  };
  const run = async <O>(job: string, input: unknown): Promise<O> =>
    unwrapOr(await r.get(COMPUTE).run<O>(job, input, { timeoutMs: 120_000 }));
  const fsrs = Object.freeze({
    defaults: FSRS6_DEFAULT_PARAMETERS,
    memory: (raw: unknown): CardMemory | null => cardMemoryOf(raw),
    review(raw: unknown, rating: unknown, o: { at?: number; parameters?: readonly number[]; retention?: number } = {}): CardMemory {
      if (!isRating(rating)) throw new NoemaError('study.invalid', 'a rating is 1 (again), 2 (hard), 3 (good) or 4 (easy)');
      const at = o.at ?? clock.now();
      const p = o.parameters ? checkParameters(o.parameters) : null;
      const f = scheduler({ ...(p?.ok ? { parameters: p.value } : {}), ...(o.retention ? { retention: o.retention } : {}) });
      return f.review(cardMemoryOf(raw) ?? newCard(at), rating, at);
    },
    isDue: (raw: unknown, d?: string): boolean => Q.isDue(raw, day(d)),
    dueDay: (raw: unknown): string | null => {
      const m = cardMemoryOf(raw);
      return m ? dueDay(m) : null;
    },
    retrievability: (raw: unknown, at?: number): number => {
      const m = cardMemoryOf(raw);
      return m ? scheduler().retrievability(m, at ?? clock.now()) : 0;
    },
    later: laterReview,
    optimize: (reviews: readonly ReviewRecord[], parameters?: readonly number[]): Promise<OptimizeResult> =>
      run<OptimizeResult>(JOB_OPTIMIZE, { reviews, ...(parameters ? { parameters } : {}) } satisfies OptimizeInput),
  });
  const models = () => r.get(STUDY);
  return Object.freeze({
    grade(ex: Exercise, answer: Answer, ctx: { regions?: readonly Region[] } = {}) {
      const g = unwrapOr(gradeExercise(ex, answer, ctx.regions ? { regions: ctx.regions } : {}));
      return g.status === 'incomplete' ? { ok: null, score: 0 } : { ok: g.ok, score: g.score, ...g.detail };
    },
    fsrs,
    cards: Object.freeze({
      queue: <C extends { key: string }>(
        cards: readonly C[],
        states: Readonly<Record<string, unknown>> | null,
        o: { day?: string; newPerDay?: number; all?: boolean } = {},
      ) =>
        Q.cardQueue(cards, states ?? {}, day(o.day), {
          random: Math.random,
          ...(o.newPerDay !== undefined ? { newPerDay: o.newPerDay } : {}),
          ...(o.all ? { all: true } : {}),
        }),
      countDue: (states: Readonly<Record<string, unknown>> | null, keys?: readonly string[], d?: string): number =>
        Q.countDue(states, day(d), keys),
    }),
    practice: Object.freeze({
      mistakes: Q.mistakes,
      countMistakes: Q.countMistakes,
      solved: Q.isSolved,
      order: <E extends { id: string; lr?: string }>(list: readonly E[], answers: Parameters<typeof Q.roundOrder>[1]) =>
        Q.roundOrder(list, answers, Math.random),
      spread: Q.spreadFacades,
      sibling: <E extends { id: string; type: string; lr?: string; chapter?: string }>(
        ex: E,
        round: readonly { id: string }[],
        all: readonly E[],
      ) => Q.siblingOf(ex, round, all, Math.random),
    }),
    progress: Object.freeze({ chapter: Q.chapterProgress, chaptersDone: Q.chaptersDone, levels: Q.levelProgress }),
    xp: Object.freeze({
      today: (byDay: Parameters<typeof Q.xpOn>[0], d?: string): number => Q.xpOn(byDay, day(d)),
      goalReached: (byDay: Parameters<typeof Q.xpOn>[0], goal: number, d?: string): boolean => Q.goalReached(byDay, day(d), goal),
      streak: (byDay: Parameters<typeof Q.xpOn>[0], d?: string, carried?: { days: number; through: string } | null): number => {
        const through = carried ? parseDay(carried.through) : null;
        return Q.streak(byDay, day(d), carried && through?.ok ? { days: carried.days, through: through.value } : null);
      },
      level: Q.xpLevel,
      dayOf: (at: number): string => dayOf(at),
    }),
    models: Object.freeze({
      current: () => models().current(),
      apply: (events: readonly LoggedEvent[]) => models().apply(events),
      start: async () => unwrapOr(await models().start()),
      rebuild: async (events?: readonly LoggedEvent[]) => unwrapOr(await models().rebuild(events)),
      optimize: async () => unwrapOr(await models().optimize()),
      /** Fits the FSRS parameters again when the review log has grown enough since the last fit (`last`: { n } of
          that fit); resolves to the result and n (the reviews it saw, to keep with the parameters), or null when no fit is due or nothing better was found. */
      refit: async (last: { n?: number } | null = null): Promise<(OptimizeResult & { n: number }) | null> => {
        const m = models().current();
        const n = Object.values(m.subjects).reduce(
          (a, s) => a + [...Object.values(s.cards), ...Object.values(s.drills)].reduce((b, c) => b + c.reviews.length, 0),
          0,
        );
        if (!shouldRefit(n, last?.n ?? 0)) return null;
        const res = unwrapOr(await models().optimize());
        return res.optimized ? { ...res, n } : null;
      },
      onChange: (f: (m: unknown) => void) => models().onChange(f),
    }),
  });
}

/** The catalogue surface of the bridge (the record builders and the index; the query side is the search's). */
export function catalogBridge(r: Resolver): unknown {
  return Object.freeze({
    SCHEMA: records.SCHEMA,
    BLOCK_KIND: records.BLOCK_KIND,
    hash36: records.hash36,
    plain: records.plain,
    toneNumbers: records.toneNumbers,
    blockText: records.blockText,
    blockIds: records.blockIds,
    trapId: records.trapId,
    cardKey: records.cardKey,
    fromPack: records.fromPack,
    fromCurriculum: records.fromCurriculum,
    fromLangCourse: records.fromLangCourse,
    fromConvos: records.fromConvos,
    /** The index of one account: sources() → [{ key, label, sig, input: async () => { kind, data, meta }, store }]. */
    index: (account: string, sources: () => Promise<readonly IndexSource[]>) =>
      createCatalogIndex({
        account,
        sources,
        docs: r.get(CATALOG_STORE),
        build: input => r.get(COMPUTE).run<records.CatalogRecord[]>(JOB_RECORDS, input),
        report: (e, where) => r.get(ERRORS).report(e, { where, severity: 'warning' }),
      }),
  });
}

export const STUDY_BRIDGE: readonly BridgeExtension[] = [
  { name: 'study', build: studyBridge },
  { name: 'catalog', build: catalogBridge },
];
