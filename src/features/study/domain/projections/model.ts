/**
 * The study read models (CQRS): one fold of the learning log into what the screens read — per subject the answers,
 * the cards' and drills' FSRS memories and the sections read; across subjects the XP per day and per subject, the
 * streak carried over, the daily goal, the FSRS settings and the level reached per Roadmap.
 *
 * `project(events)` builds the model from the whole log (the Worker job study.project does it off the main thread);
 * `applyEvent(model, event)` adds one event (the main thread does it for the learner's own new events, so a screen
 * reads its answer at once). Both give the same model for the same events in the same order: events are applied in
 * HLC order, and an event id seen before is skipped (the log may hand an event twice). The model is plain JSON (a
 * snapshot: kept, sent to and from the Worker, folded on from).
 *
 * The cards' memories depend on the FSRS parameters in force: a `setting.changed` of `fsrs` re-schedules from the
 * reviews kept per card (the log's own order), so a newly optimised learner never has two schedulers' histories mixed.
 */
import type { LocalDay } from '../../../../kernel/day.ts';
import {
  FSRS6_DEFAULT_PARAMETERS,
  cardMemoryOf,
  checkParameters,
  isRating,
  newCard,
  scheduler,
  type CardMemory,
  type FsrsParameters,
  type Rating,
} from '../fsrs.ts';
import type { LoggedEvent } from './input.ts';

/** One exercise's answers (the shape engine/src keeps in S.res). */
export interface AnswerStats {
  /** answers given */
  readonly n: number;
  /** of them right */
  readonly ok: number;
  /** the last one right? */
  readonly last: boolean;
  /** when (epoch ms) */
  readonly t: number;
  readonly conf?: 'sure' | 'think' | 'guess';
}

export interface CardRecord {
  readonly memory: CardMemory;
  /** The schedule carried over from before the log (null: none). */
  readonly seed: CardMemory | null;
  /** Its reviews since then: [epoch ms, rating]. */
  readonly reviews: readonly (readonly [number, Rating])[];
}

export interface SubjectModel {
  readonly answers: Readonly<Record<string, AnswerStats>>;
  readonly cards: Readonly<Record<string, CardRecord>>;
  readonly drills: Readonly<Record<string, CardRecord>>;
  /** section id → when it was first read (epoch ms) */
  readonly read: Readonly<Record<string, number>>;
  /** its XP */
  readonly xp: number;
}

export interface FsrsSettings {
  readonly parameters: FsrsParameters;
  readonly retention: number;
}

export interface StudyModel {
  readonly version: 1;
  readonly subjects: Readonly<Record<string, SubjectModel>>;
  readonly xp: { readonly total: number; readonly byDay: Readonly<Record<string, number>> };
  readonly streak: { readonly days: number; readonly through: LocalDay } | null;
  readonly goal: number;
  readonly fsrs: FsrsSettings;
  /** Roadmap (or subject) id → the level reached and when. */
  readonly levels: Readonly<Record<string, { readonly level: string; readonly at: number }>>;
  /** The ids of the events folded in (an event seen twice counts once). */
  readonly seen: Readonly<Record<string, true>>;
  /** The HLC stamp of the latest event folded in ('' when none). */
  readonly through: string;
}

export const DEFAULT_GOAL = 120;

/** FSRS-6's own parameters and the default retention (until the learner's are fitted). */
export const DEFAULT_FSRS: FsrsSettings = Object.freeze({ parameters: FSRS6_DEFAULT_PARAMETERS, retention: 0.9 });

export const emptyModel = (): StudyModel => ({
  version: 1,
  subjects: {},
  xp: { total: 0, byDay: {} },
  streak: null,
  goal: DEFAULT_GOAL,
  fsrs: DEFAULT_FSRS,
  levels: {},
  seen: {},
  through: '',
});

const emptySubject = (): SubjectModel => ({ answers: {}, cards: {}, drills: {}, read: {}, xp: 0 });

const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** A card's memory from its seed and reviews under the given FSRS settings. */
export function replay(seed: CardMemory | null, reviews: readonly (readonly [number, Rating])[], fsrs: FsrsSettings): CardMemory {
  const f = scheduler({ parameters: fsrs.parameters, retention: fsrs.retention });
  let m = seed ?? newCard(reviews[0]?.[0] ?? 0);
  for (const [at, rating] of reviews) m = f.review(m, rating, at);
  return m;
}

function withSubject(m: StudyModel, id: string, f: (s: SubjectModel) => SubjectModel): StudyModel {
  return { ...m, subjects: { ...m.subjects, [id]: f(m.subjects[id] ?? emptySubject()) } };
}

/** The FSRS settings a setting value names (what it lacks, or gives out of range, stays as it was). */
export function fsrsOf(value: unknown, was: FsrsSettings): FsrsSettings {
  const v = (value && typeof value === 'object' ? value : {}) as { parameters?: unknown; retention?: unknown };
  const p = Array.isArray(v.parameters) ? checkParameters(v.parameters) : null;
  const r = num(v.retention);
  return { parameters: p?.ok ? p.value : was.parameters, retention: r !== null && r >= 0.7 && r <= 0.97 ? r : was.retention };
}

/** The model with one more event (the same model when the event was seen before or is not a study event). */
export function applyEvent(model: StudyModel, e: LoggedEvent): StudyModel {
  if (typeof e.id !== 'string' || model.seen[e.id]) return model;
  const at = num(e.at) ?? 0,
    subject = str(e.subject),
    item = str(e.item);
  let m: StudyModel = { ...model, seen: { ...model.seen, [e.id]: true }, through: e.hlc > model.through ? e.hlc : model.through };
  switch (e.type) {
    case 'answer.given': {
      if (!subject || !item || typeof e.ok !== 'boolean') return m;
      const isOk = e.ok,
        conf = e.conf === 'sure' || e.conf === 'think' || e.conf === 'guess' ? e.conf : undefined;
      m = withSubject(m, subject, s => {
        const r = s.answers[item];
        // an answer older than the last one known (another device's, synced late) counts, but does not become the last
        const latest = !r || at >= r.t;
        const next: AnswerStats = latest
          ? { n: (r?.n ?? 0) + 1, ok: (r?.ok ?? 0) + (isOk ? 1 : 0), last: isOk, t: at, ...(conf ? { conf } : {}) }
          : { ...r, n: r.n + 1, ok: r.ok + (isOk ? 1 : 0) };
        return { ...s, answers: { ...s.answers, [item]: next } };
      });
      return m;
    }
    case 'card.reviewed':
    case 'card.imported': {
      if (!subject || !item) return m;
      const box = e.kind === 'drill' ? 'drills' : 'cards';
      const fsrs = m.fsrs;
      if (e.type === 'card.reviewed' && !isRating(e.rating)) return m;
      return withSubject(m, subject, s => {
        const was = s[box][item];
        const seed = e.type === 'card.imported' ? cardMemoryOf(e.state) : (was?.seed ?? null);
        const before = was?.reviews ?? [],
          inOrder = !before.length || at >= (before[before.length - 1]?.[0] ?? 0);
        const reviews = e.type === 'card.imported' ? [] : [...before, [at, e.rating as Rating] as const].sort((a, b) => a[0] - b[0]);
        // the next review of the card: one step; an import, or a review older than the last one known (another device's,
        // synced late): the card's whole history again, in time order
        const memory =
          e.type === 'card.reviewed' && was && inOrder
            ? scheduler({ parameters: fsrs.parameters, retention: fsrs.retention }).review(was.memory, e.rating as Rating, at)
            : replay(seed, reviews, fsrs);
        return { ...s, [box]: { ...s[box], [item]: { memory, seed, reviews } } };
      });
    }
    case 'section.read': {
      if (!subject || !item) return m;
      return withSubject(m, subject, s => (item in s.read ? s : { ...s, read: { ...s.read, [item]: at } }));
    }
    case 'xp.earned': {
      const n = num(e.amount);
      if (n === null || n <= 0) return m;
      const day = String(e.day);
      m = { ...m, xp: { total: m.xp.total + n, byDay: { ...m.xp.byDay, [day]: (m.xp.byDay[day] ?? 0) + n } } };
      return subject ? withSubject(m, subject, s => ({ ...s, xp: s.xp + n })) : m;
    }
    case 'streak.imported': {
      const days = num(e.days),
        through = str(e.through);
      if (days === null || !through) return m;
      return { ...m, streak: { days, through: through as LocalDay } };
    }
    case 'roadmap.level.reached': {
      const roadmap = str(e.roadmap),
        level = str(e.level);
      return roadmap && level ? { ...m, levels: { ...m.levels, [roadmap]: { level, at } } } : m;
    }
    case 'setting.changed': {
      if (e.key === 'goal') {
        const g = num(e.value);
        return g !== null && g > 0 ? { ...m, goal: g } : m;
      }
      if (e.key === 'fsrs') return rescheduled(m, fsrsOf(e.value, m.fsrs));
      return m;
    }
    case 'progress.reset':
      return subject ? { ...m, subjects: { ...m.subjects, [subject]: emptySubject() } } : m;
    default:
      return m;
  }
}

/** Every card's memory again under new FSRS settings. */
function rescheduled(m: StudyModel, fsrs: FsrsSettings): StudyModel {
  const again = (box: Readonly<Record<string, CardRecord>>): Record<string, CardRecord> =>
    Object.fromEntries(Object.entries(box).map(([id, c]) => [id, { ...c, memory: replay(c.seed, c.reviews, fsrs) }]));
  const subjects = Object.fromEntries(
    Object.entries(m.subjects).map(([id, s]) => [id, { ...s, cards: again(s.cards), drills: again(s.drills) }]),
  );
  return { ...m, fsrs, subjects };
}

/** The log in the order the read models fold it: by HLC stamp, then id. */
export const inLogOrder = (events: readonly LoggedEvent[]): LoggedEvent[] =>
  [...events].sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The model of a log, folded on from a snapshot (or from nothing). Events at or before the snapshot are skipped by id. */
export function project(events: readonly LoggedEvent[], from: StudyModel = emptyModel()): StudyModel {
  let m = from;
  for (const e of inLogOrder(events)) m = applyEvent(m, e);
  return m;
}

/** A subject's cards (or drills) as their memories: the shape the queues read. */
export const memories = (s: SubjectModel | undefined, kind: 'card' | 'drill' = 'card'): Record<string, CardMemory> =>
  Object.fromEntries(Object.entries((kind === 'drill' ? s?.drills : s?.cards) ?? {}).map(([id, c]) => [id, c.memory]));

/** The review log of every card and drill (the optimiser's input). */
export function reviewLog(m: StudyModel): { card: string; rating: Rating; at: number }[] {
  const out: { card: string; rating: Rating; at: number }[] = [];
  for (const [sid, s] of Object.entries(m.subjects))
    for (const [kind, box] of [
      ['card', s.cards],
      ['drill', s.drills],
    ] as const)
      for (const [id, c] of Object.entries(box))
        for (const [at, rating] of c.reviews) out.push({ card: `${sid}|${kind}|${id}`, rating, at });
  return out;
}
