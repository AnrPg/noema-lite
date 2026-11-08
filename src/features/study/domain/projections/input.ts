/**
 * What the read models read: the learning events of the event log, as far as the projections need them.
 *
 * This is the consumer's view of the event contract (`src/contracts/schemas/noema.events.v1.schema.json`, owned by
 * the learning log, src/features/study/domain/events): every event has an id, an HLC stamp (text that sorts in time
 * order), the device, the moment (epoch ms) and the learner's day; the kinds below carry the fields named. Events of
 * other kinds pass through the projections untouched, so the log can grow new kinds without breaking a read model.
 */
import type { LocalDay } from '../../../../kernel/day.ts';
import type { Rating } from '../fsrs.ts';

export interface EventEnvelope {
  readonly id: string;
  readonly type: string;
  /** The hybrid logical clock stamp (src/kernel/hlc.ts, encoded): the order of the log. */
  readonly hlc: string;
  readonly device: string;
  /** epoch ms */
  readonly at: number;
  readonly day: LocalDay;
}

/** An exercise answered (first try or again). */
export interface AnswerGiven extends EventEnvelope {
  readonly type: 'answer.given';
  readonly subject: string;
  /** the exercise id */
  readonly item: string;
  readonly ok: boolean;
  /** how sure the learner said they were before answering */
  readonly conf?: 'sure' | 'think' | 'guess';
}

/** A flashcard or a debug drill rated. */
export interface CardReviewed extends EventEnvelope {
  readonly type: 'card.reviewed';
  readonly subject: string;
  /** the card id (or the drill id) */
  readonly item: string;
  readonly kind: 'card' | 'drill';
  readonly rating: Rating;
}

/** A card's schedule carried over from before the log (the one-time migration of the old state): a stored state in
    any shape fsrs.cardMemoryOf reads (an old Leitner {box, due} or an FSRS memory). Later reviews replay on top of it. */
export interface CardImported extends EventEnvelope {
  readonly type: 'card.imported';
  readonly subject: string;
  readonly item: string;
  readonly kind: 'card' | 'drill';
  readonly state: unknown;
}

/** A section of the theory read (the chapter's progress). */
export interface SectionRead extends EventEnvelope {
  readonly type: 'section.read';
  readonly subject: string;
  /** the section id */
  readonly item: string;
}

/** XP earned (an answer, a card, a round, a lightning game …). */
export interface XpEarned extends EventEnvelope {
  readonly type: 'xp.earned';
  readonly subject?: string;
  readonly amount: number;
}

/** A streak carried over from before the log: `days` days in a row, the last of them `through`. */
export interface StreakImported extends EventEnvelope {
  readonly type: 'streak.imported';
  readonly days: number;
  readonly through: LocalDay;
}

/** The learner reached a level of a Roadmap's ladder (or of a pack's own ladder: `roadmap` is then the subject id). */
export interface LevelReached extends EventEnvelope {
  readonly type: 'roadmap.level.reached';
  readonly roadmap: string;
  readonly level: string;
}

/** A learner setting changed; the read models use `goal` (daily XP) and `fsrs` ({ parameters, retention }). */
export interface SettingChanged extends EventEnvelope {
  readonly type: 'setting.changed';
  readonly key: string;
  readonly value: unknown;
}

/** A subject's progress reset (its answers, cards, drills and reading start again). */
export interface ProgressReset extends EventEnvelope {
  readonly type: 'progress.reset';
  readonly subject: string;
}

export type StudyEvent =
  AnswerGiven | CardReviewed | CardImported | SectionRead | XpEarned | StreakImported | LevelReached | SettingChanged | ProgressReset;

/** Any event of the log (kinds the read models do not know are passed over). */
export type LoggedEvent = EventEnvelope & Readonly<Record<string, unknown>>;
