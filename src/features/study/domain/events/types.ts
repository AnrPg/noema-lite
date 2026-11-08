/**
 * The learning log's events (event sourcing): the types of noema.events/v1 (src/contracts/schemas/noema.events.v1.schema.json,
 * the ONE source of the format) as a discriminated union, and what the log knows about each type.
 *
 * Every event has: v 1 · id (unique for ever) · type · at (the hybrid logical clock stamp, src/kernel/hlc.ts, encoded: it
 * sorts as text in time order) · day (the learner's local day when it happened) · device · account · subject and item
 * (what it is about; which of them a type needs is in SCOPES) · origin (app | migration | inbox | restore) · data.
 */
import type * as G from '../../../../contracts/generated/events.v1.ts';

/** The data of each event type (the schema's $defs/data_<type>). */
export interface EventDataMap {
  'activity.attempted': G.DataActivityAttempted;
  'activity.saved': G.DataActivitySaved;
  'answer.given': G.DataAnswerGiven;
  'answers.imported': G.DataAnswersImported;
  'boss.won': G.DataBossWon;
  'card.imported': G.DataCardImported;
  'card.reviewed': G.DataCardReviewed;
  'chapter.finished': G.DataChapterFinished;
  'chapter.opened': G.DataChapterOpened;
  'day.active': G.DataDayActive;
  'drill.scored': G.DataDrillScored;
  'exercise.flagged': G.DataExerciseFlagged;
  'exercise.unflagged': G.DataExerciseUnflagged;
  'external.studied': G.DataExternalStudied;
  'level.reached': G.DataLevelReached;
  'log.restored': G.DataLogRestored;
  'playbook.imported': G.DataPlaybookImported;
  'playbook.reviewed': G.DataPlaybookReviewed;
  'section.opened': G.DataSectionOpened;
  'section.read': G.DataSectionRead;
  'setting.changed': G.DataSettingChanged;
  'source.seen': G.DataSourceSeen;
  'stats.imported': G.DataStatsImported;
  'subject.finished': G.DataSubjectFinished;
  'subject.reset': G.DataSubjectReset;
  'xp.earned': G.DataXpEarned;
}
export type EventType = keyof EventDataMap;
export type EventOrigin = NonNullable<G.Event['origin']>;
export type Attempt = G.Attempt;

/** The fields every event has. */
export interface EventEnvelope {
  readonly v: 1;
  readonly id: string;
  readonly hlc: string;
  readonly day: string;
  readonly device: string;
  readonly account: string;
  readonly subject?: string;
  readonly item?: string;
  readonly origin?: EventOrigin;
}

/** One event of the log: the envelope, its type and that type's data. */
export type LearningEvent<T extends EventType = EventType> = {
  [K in T]: EventEnvelope & { readonly type: K; readonly data: EventDataMap[K] };
}[T];

/** What an event names besides the account: a subject and an item ("item"), a subject only ("subject"), nothing ("account"),
    or a subject when it has one ("any": an XP or a setting of a subject, else of the account). Checked by the schema too. */
export type EventScope = 'item' | 'subject' | 'account' | 'any';

/** How long the log keeps an event: "history" for ever; "latest": only the latest of its key (keyOf) survives compaction. */
export type Retention = 'history' | 'latest';

interface TypeInfo {
  readonly scope: EventScope;
  readonly retention: Retention;
}

export const EVENT_INFO: Readonly<Record<EventType, TypeInfo>> = Object.freeze({
  'activity.attempted': { scope: 'item', retention: 'latest' },
  'activity.saved': { scope: 'item', retention: 'latest' },
  'answer.given': { scope: 'item', retention: 'history' },
  'answers.imported': { scope: 'item', retention: 'history' },
  'boss.won': { scope: 'item', retention: 'history' },
  'card.imported': { scope: 'item', retention: 'history' },
  'card.reviewed': { scope: 'item', retention: 'history' },
  'chapter.finished': { scope: 'item', retention: 'history' },
  'chapter.opened': { scope: 'item', retention: 'latest' },
  'day.active': { scope: 'account', retention: 'history' },
  'drill.scored': { scope: 'subject', retention: 'history' },
  'exercise.flagged': { scope: 'item', retention: 'history' },
  'exercise.unflagged': { scope: 'item', retention: 'history' },
  'external.studied': { scope: 'item', retention: 'history' },
  'level.reached': { scope: 'account', retention: 'history' },
  'log.restored': { scope: 'account', retention: 'history' },
  'playbook.imported': { scope: 'item', retention: 'history' },
  'playbook.reviewed': { scope: 'item', retention: 'history' },
  'section.opened': { scope: 'item', retention: 'latest' },
  'section.read': { scope: 'item', retention: 'history' },
  'setting.changed': { scope: 'any', retention: 'latest' },
  'source.seen': { scope: 'item', retention: 'latest' },
  'stats.imported': { scope: 'account', retention: 'history' },
  'subject.finished': { scope: 'subject', retention: 'history' },
  'subject.reset': { scope: 'subject', retention: 'history' },
  'xp.earned': { scope: 'any', retention: 'history' },
});

export const EVENT_TYPES: readonly EventType[] = Object.freeze(Object.keys(EVENT_INFO).sort() as EventType[]);

export const isEventType = (x: unknown): x is EventType => typeof x === 'string' && Object.prototype.hasOwnProperty.call(EVENT_INFO, x);

/** The key a "latest" event supersedes the older ones of: its type, subject and item (a setting: its key; an attempt: its
 * exercise and the attempt's own id, so every attempt is kept in its last version). */
export function keyOf(e: LearningEvent): string {
  const what =
    e.type === 'setting.changed'
      ? 'k:' + e.data.key
      : e.type === 'activity.attempted'
        ? 'a:' + (e.item ?? '') + '|' + (e.data.attempt.id ?? e.id)
        : 'i:' + (e.item ?? '');
  return `${e.type}|${e.subject ?? ''}|${what}`;
}

/** The order of the log: by stamp, then by id (two events never share both). */
export function compareEvents(a: EventEnvelope, b: EventEnvelope): -1 | 0 | 1 {
  if (a.hlc !== b.hlc) return a.hlc < b.hlc ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** The FSRS ratings (1 again · 2 hard · 3 good · 4 easy) of the old three buttons (0 again / blank · 1 good / partly · 2 easy / nailed). */
export const CARD_RATING_OF_GRADE: readonly [1, 3, 4] = [1, 3, 4];
export const PLAYBOOK_RATING_OF_GRADE: readonly [1, 2, 4] = [1, 2, 4];
