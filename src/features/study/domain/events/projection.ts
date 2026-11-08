/**
 * The log's own fold: what the events add up to, in the shape the screens of phases 1–2 read (a subject's progress as the
 * old state blob had it, the XP and streak across subjects, the settings, the current level per Roadmap). Pure: no I/O.
 *
 * Folding is in log order (compareEvents). A new event that is the latest of the log is applied in place (apply → true);
 * one stamped before the latest already applied (another device's, arriving later), or a restore, changes what came
 * after it, so apply → false and the caller folds the whole log again (fold). The objects handed out stay the same
 * objects while events are applied in place, so a screen holding one sees every change.
 *
 * How the old copies merged is kept for the imported ones: several imports of an exercise's answers keep the most tries,
 * of a card's schedule the later due day (then the higher box), of the account's stats the larger counts per day.
 */
import { addDays, parseDay } from '../../../../kernel/day.ts';
import { compareEvents, type Attempt, type LearningEvent } from './types.ts';
import { counts, countsForSubject, exclusionsOf, NO_EXCLUSIONS, type Exclusions } from './windows.ts';

export type Confidence = 'sure' | 'think' | 'guess';
export interface AnswerRecord {
  n: number;
  ok: number;
  last: boolean;
  /** When the last answer was given (ms). */
  t: number;
  conf?: Confidence;
}
export interface ScheduleRecord {
  box: number;
  due?: string;
}
export interface SavedState {
  v: number;
  data: unknown;
  t: number;
}
export interface FlagRecord {
  why: string;
  note: string;
  t: number;
}
export interface ExternalRecord {
  kind: 'section' | 'chapter';
  id: string;
  event: 'review' | 'studied';
  rating?: string;
  date?: string;
  at: string;
}

/** One subject's progress (the fields the old state blob had, under the same names). */
export interface SubjectProgress {
  xp: number;
  read: Record<string, true>;
  res: Record<string, AnswerRecord>;
  fc: Record<string, ScheduleRecord>;
  pb: Record<string, ScheduleRecord>;
  boss: Record<string, true>;
  /** The section opened last. */
  last: string | null;
  /** The chapter opened last. */
  lastChapter: string | null;
  /** Chapters whose every section was read. */
  chapters: Record<string, true>;
  att: Record<string, Attempt>;
  act: Record<string, SavedState>;
  flags: Record<string, FlagRecord>;
  bestLightning: number;
  nodeDone: number | null;
  seenSrc: Record<string, true>;
  ext: Record<string, ExternalRecord[]>;
  /** When the subject was last reset (ms), or null. */
  resetAt: number | null;
}

/** XP and streak across subjects. */
export interface AccountStats {
  xp: number;
  xpDay: Record<string, number>;
  streak: number;
  lastDay: string | null;
  bySubject: Record<string, number>;
}

export interface LevelRecord {
  level: string;
  at: number;
}

/** The days of the old Leitner boxes 0–5 (the card scheduler until FSRS reads the log). */
export const BOX_DAYS: readonly number[] = Object.freeze([0, 1, 3, 7, 16, 35]);
/** How many entries of external study per app a subject keeps. */
export const EXTERNAL_KEEP = 200;

/** The wall time (ms) of an encoded HLC stamp. */
export const wallOf = (at: string): number => Number(at.slice(0, 15));

export function emptyProgress(): SubjectProgress {
  return {
    xp: 0,
    read: {},
    res: {},
    fc: {},
    pb: {},
    boss: {},
    last: null,
    lastChapter: null,
    chapters: {},
    att: {},
    act: {},
    flags: {},
    bestLightning: 0,
    nodeDone: null,
    seenSrc: {},
    ext: {},
    resetAt: null,
  };
}
export const emptyStats = (): AccountStats => ({ xp: 0, xpDay: {}, streak: 0, lastDay: null, bySubject: {} });

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The schedule after one review (rating 1 again → box 1; 4 easy → two boxes up, else one), due counted from `day`. */
function leitner(r: ScheduleRecord | undefined, rating: number, day: string, double: boolean): ScheduleRecord {
  const box = rating === 1 ? 1 : Math.min(5, (r?.box ?? 0) + (double ? 2 : 1));
  const d = parseDay(day);
  const out: ScheduleRecord = { box };
  if (d.ok) out.due = addDays(d.value, BOX_DAYS[rating === 1 ? 0 : box] ?? 0);
  return out;
}
/** Of two schedules, the one reviewed later (the later due day; on the same day the higher box). */
function laterReview(a: ScheduleRecord | undefined, b: ScheduleRecord): ScheduleRecord {
  if (!a) return b;
  const da = a.due ?? '',
    db = b.due ?? '';
  if (da !== db) return da > db ? a : b;
  return a.box >= b.box ? a : b;
}
const maxMap = (a: Record<string, number>, b: Readonly<Record<string, number | undefined>>): void => {
  for (const [k, v] of Object.entries(b)) a[k] = Math.max(a[k] ?? 0, v ?? 0);
};

/** Per exercise: the import with the most tries, and the answers given in the app since. */
interface AnswerParts {
  base?: AnswerRecord;
  n: number;
  ok: number;
  lastAt: number;
  last?: boolean;
  conf?: Confidence | undefined;
}

interface SettingCell {
  value: unknown;
  removed: boolean;
  at: string;
  id: string;
}

interface StatsParts {
  /** The imports merged (null: none). */
  imported: AccountStats | null;
  /** What was earned in the app. */
  live: { xp: number; xpDay: Record<string, number>; bySubject: Record<string, number> };
  /** The days with study (XP or a tutor conversation). */
  days: Record<string, true>;
}

export interface ProjectionSnapshot {
  readonly version: number;
  readonly lastAt: string;
  readonly lastId: string;
  readonly state: unknown;
}
/** Bumped whenever the fold changes: an older snapshot is then refolded from the events. */
export const PROJECTION_VERSION = 1;

export class Projection {
  readonly #subjects = new Map<string, SubjectProgress>();
  readonly #answers = new Map<string, Map<string, AnswerParts>>();
  #stats: AccountStats = emptyStats();
  #statsParts: StatsParts = { imported: null, live: { xp: 0, xpDay: {}, bySubject: {} }, days: {} };
  readonly #settings = new Map<string, Map<string, SettingCell>>();
  readonly #settingValues = new Map<string, Record<string, unknown>>();
  readonly #levels: Record<string, LevelRecord> = {};
  #x: Exclusions = NO_EXCLUSIONS;
  #lastAt = '';
  #lastId = '';
  #count = 0;

  /** The whole log folded (in any order: it is sorted here). */
  static fold(events: Iterable<LearningEvent>): Projection {
    const list = [...events].sort(compareEvents);
    const p = new Projection();
    p.#x = exclusionsOf(list);
    for (const e of list) p.#apply(e);
    return p;
  }

  /** How many events were folded in. */
  get count(): number {
    return this.#count;
  }
  /** The stamp of the latest event folded in ('' when none). */
  get lastAt(): string {
    return this.#lastAt;
  }

  /** Apply one more event in place → false when it cannot be (stamped before the latest one, or a restore): fold again. */
  apply(e: LearningEvent): boolean {
    if (this.#count && compareEvents(e, { at: this.#lastAt, id: this.#lastId } as LearningEvent) <= 0) return false;
    if (e.type === 'log.restored') return false;
    if (e.type === 'subject.reset' && e.subject !== undefined) {
      this.#x = { windows: this.#x.windows, resets: { ...this.#x.resets, [e.subject]: e.at } };
      // the subject starts again (the same object: screens hold it); the XP across subjects stays
      Object.assign(this.subjectProgress(e.subject), emptyProgress());
      this.#answers.delete(e.subject);
    }
    this.#apply(e);
    return true;
  }

  /** A subject's progress (an empty one, kept, when it has none yet). */
  subjectProgress(subject: string): SubjectProgress {
    let p = this.#subjects.get(subject);
    if (!p) {
      p = emptyProgress();
      this.#subjects.set(subject, p);
    }
    return p;
  }
  /** Whether a subject has any progress. */
  hasSubject(subject: string): boolean {
    return this.#subjects.has(subject);
  }
  /** The subjects that have progress. */
  subjects(): string[] {
    return [...this.#subjects.keys()];
  }
  get stats(): AccountStats {
    return this.#stats;
  }
  /** The settings in force: the account's (no subject) or a subject's own. The same object while events apply in place. */
  settings(subject = ''): Record<string, unknown> {
    let v = this.#settingValues.get(subject);
    if (!v) {
      v = {};
      this.#settingValues.set(subject, v);
    }
    return v;
  }
  /** The stamp at which a setting was last changed ('' when never). */
  settingStamp(key: string, subject = ''): string {
    return this.#settings.get(subject)?.get(key)?.at ?? '';
  }
  /** The scopes that have settings ('' the account's, else a subject's). */
  settingScopes(): string[] {
    return [...this.#settingValues.keys()];
  }
  /* A new fold handed to screens that hold the old one's objects: these put the held objects (filled with the new values)
     in place of the new fold's own, so both stay one object (the application's refold). */
  replaceProgress(subject: string, held: SubjectProgress): void {
    this.#subjects.set(subject, held);
  }
  replaceStats(held: AccountStats): void {
    this.#stats = held;
  }
  replaceSettings(scope: string, held: Record<string, unknown>): void {
    this.#settingValues.set(scope, held);
  }
  get levels(): Readonly<Record<string, LevelRecord>> {
    return this.#levels;
  }

  #apply(e: LearningEvent): void {
    this.#count++;
    this.#lastAt = e.at;
    this.#lastId = e.id;
    if (!counts(e.at, this.#x)) return;
    this.#account(e);
    if (e.subject !== undefined && countsForSubject(e, this.#x)) this.#subject(e.subject, e);
  }

  /** What an event changes across subjects: stats, settings, levels. */
  #account(e: LearningEvent): void {
    switch (e.type) {
      case 'xp.earned': {
        if (e.origin === 'migration') return; // a subject's XP from before the log: already inside stats.imported
        const live = this.#statsParts.live;
        live.xp += e.data.amount;
        live.xpDay[e.day] = (live.xpDay[e.day] ?? 0) + e.data.amount;
        if (e.subject !== undefined) live.bySubject[e.subject] = (live.bySubject[e.subject] ?? 0) + e.data.amount;
        this.#active(e.day);
        return;
      }
      case 'day.active':
        this.#active(e.day);
        return;
      case 'stats.imported':
        this.#importStats(e.data);
        return;
      case 'setting.changed':
        this.#setting(e);
        return;
      case 'level.reached':
        this.#levels[e.data.roadmap] = { level: e.data.level, at: wallOf(e.at) };
        return;
      default:
        return;
    }
  }

  #active(day: string): void {
    this.#statsParts.days[day] = true;
    this.#restat();
  }

  #importStats(d: LearningEvent<'stats.imported'>['data']): void {
    // the old a:stats, merged as the old sync merged two copies: the larger counts per day and subject, the later streak
    const imp = (this.#statsParts.imported ??= emptyStats());
    imp.xp = Math.max(imp.xp, d.xp);
    maxMap(imp.xpDay, d.xpDay);
    maxMap(imp.bySubject, d.bySubject);
    const la = imp.lastDay ?? '',
      lb = d.lastDay ?? '';
    if (lb > la || (lb === la && d.streak > imp.streak)) {
      imp.lastDay = d.lastDay ?? null;
      imp.streak = d.streak;
    }
    this.#restat();
  }

  /** The stats: the import plus what was earned in the app since (the same objects, changed in place). */
  #restat(): void {
    const imp = this.#statsParts.imported,
      live = this.#statsParts.live;
    this.#stats.xp = (imp?.xp ?? 0) + live.xp;
    replace(this.#stats.xpDay, sumMaps(imp?.xpDay, live.xpDay));
    replace(this.#stats.bySubject, sumMaps(imp?.bySubject, live.bySubject));
    this.#streak();
  }

  #streak(): void {
    const imp = this.#statsParts.imported,
      days = this.#statsParts.days;
    const run = new Set(Object.keys(days));
    if (imp?.lastDay && imp.streak > 0) {
      const d = parseDay(imp.lastDay);
      if (d.ok) for (let i = 0; i < Math.min(imp.streak, 3660); i++) run.add(addDays(d.value, -i));
    }
    if (!run.size) {
      this.#stats.streak = 0;
      this.#stats.lastDay = null;
      return;
    }
    const last = [...run].sort().pop() ?? '';
    const d = parseDay(last);
    let n = 0;
    if (d.ok) while (run.has(addDays(d.value, -n))) n++;
    this.#stats.lastDay = last;
    this.#stats.streak = n;
  }

  #setting(e: LearningEvent<'setting.changed'>): void {
    const scope = e.subject ?? '';
    let cells = this.#settings.get(scope);
    if (!cells) {
      cells = new Map();
      this.#settings.set(scope, cells);
    }
    const had = cells.get(e.data.key);
    if (had && (had.at > e.at || (had.at === e.at && had.id > e.id))) return; // the later one wins (LWW by HLC)
    const removed = e.data.removed === true;
    cells.set(e.data.key, { value: removed ? undefined : e.data.value, removed, at: e.at, id: e.id });
    const values = this.settings(scope);
    if (removed) Reflect.deleteProperty(values, e.data.key);
    else values[e.data.key] = e.data.value;
  }

  #subject(subject: string, e: LearningEvent): void {
    const p = this.subjectProgress(subject);
    const item = e.item ?? '';
    switch (e.type) {
      case 'answer.given': {
        const a = this.#answerParts(subject, item);
        a.n++;
        if (e.data.ok) a.ok++;
        a.lastAt = wallOf(e.at);
        a.last = e.data.ok;
        a.conf = e.data.conf;
        this.#answer(p, item, a);
        return;
      }
      case 'answers.imported': {
        const a = this.#answerParts(subject, item);
        const b: AnswerRecord = { n: e.data.n, ok: e.data.ok, last: e.data.last, t: e.data.t ?? wallOf(e.at) };
        if (e.data.conf) b.conf = e.data.conf;
        if (!a.base || b.n > a.base.n || (b.n === a.base.n && b.t > a.base.t)) a.base = b;
        this.#answer(p, item, a);
        return;
      }
      case 'card.reviewed':
        p.fc[item] = leitner(p.fc[item], e.data.rating, e.day, e.data.rating === 4);
        return;
      case 'card.imported':
        p.fc[item] = laterReview(p.fc[item], e.data.due ? { box: e.data.box, due: e.data.due } : { box: e.data.box });
        return;
      case 'playbook.reviewed':
        p.pb[item] = leitner(p.pb[item], e.data.rating, e.day, e.data.rating === 4 && e.data.score >= 0.7);
        return;
      case 'playbook.imported':
        p.pb[item] = laterReview(p.pb[item], e.data.due ? { box: e.data.box, due: e.data.due } : { box: e.data.box });
        return;
      case 'section.opened':
        p.last = item;
        return;
      case 'section.read':
        p.read[item] = true;
        return;
      case 'chapter.opened':
        p.lastChapter = item;
        return;
      case 'chapter.finished':
        p.chapters[item] = true;
        return;
      case 'boss.won':
        p.boss[item] = true;
        return;
      case 'subject.finished':
        p.nodeDone ??= wallOf(e.at);
        return;
      case 'subject.reset':
        p.resetAt = wallOf(e.at);
        return;
      case 'xp.earned':
        p.xp += e.data.amount;
        return;
      case 'activity.attempted': {
        const had = p.att[item];
        if (!had || (had.t0 ?? 0) <= (e.data.attempt.t0 ?? 0) || had.id === e.data.attempt.id) p.att[item] = e.data.attempt;
        return;
      }
      case 'activity.saved':
        if (e.data.state === null) Reflect.deleteProperty(p.act, item);
        else p.act[item] = { v: e.data.v, data: e.data.state, t: wallOf(e.at) };
        return;
      case 'exercise.flagged':
        p.flags[item] = { why: e.data.why, note: e.data.note ?? '', t: wallOf(e.at) };
        return;
      case 'exercise.unflagged':
        Reflect.deleteProperty(p.flags, item);
        return;
      case 'drill.scored':
        p.bestLightning = Math.max(p.bestLightning, e.data.score);
        return;
      case 'source.seen':
        if (e.data.seen) p.seenSrc[item] = true;
        else Reflect.deleteProperty(p.seenSrc, item);
        return;
      case 'external.studied': {
        const log = (p.ext[e.data.app] ??= []);
        const x: ExternalRecord = { kind: e.data.kind, id: item, event: e.data.event, at: new Date(wallOf(e.at)).toISOString() };
        if (e.data.rating !== undefined) x.rating = e.data.rating;
        if (e.data.date !== undefined) x.date = e.data.date;
        log.push(x);
        if (log.length > EXTERNAL_KEEP) log.splice(0, log.length - EXTERNAL_KEEP);
        return;
      }
      default:
        return;
    }
  }

  #answerParts(subject: string, item: string): AnswerParts {
    let m = this.#answers.get(subject);
    if (!m) {
      m = new Map();
      this.#answers.set(subject, m);
    }
    let a = m.get(item);
    if (!a) {
      a = { n: 0, ok: 0, lastAt: 0 };
      m.set(item, a);
    }
    return a;
  }

  /** An exercise's answers: the import with the most tries, plus every answer given since; the latest one decides last. */
  #answer(p: SubjectProgress, item: string, a: AnswerParts): void {
    const b = a.base;
    const liveLater = a.last !== undefined && (!b || a.lastAt >= b.t);
    const r: AnswerRecord = {
      n: (b?.n ?? 0) + a.n,
      ok: (b?.ok ?? 0) + a.ok,
      last: liveLater ? (a.last ?? false) : (b?.last ?? false),
      t: liveLater ? a.lastAt : (b?.t ?? a.lastAt),
    };
    const conf = liveLater ? a.conf : b?.conf;
    if (conf) r.conf = conf;
    p.res[item] = r;
  }

  /* ---------- snapshots: the fold kept, so a start reads only the events after it ---------- */
  snapshot(): ProjectionSnapshot {
    const answers: Record<string, Record<string, AnswerParts>> = {};
    for (const [s, m] of this.#answers) answers[s] = Object.fromEntries(m);
    const settings: Record<string, Record<string, SettingCell>> = {};
    for (const [s, m] of this.#settings) settings[s] = Object.fromEntries(m);
    const state = {
      subjects: Object.fromEntries(this.#subjects),
      answers,
      stats: this.#stats,
      statsParts: this.#statsParts,
      settings,
      levels: this.#levels,
      x: this.#x,
      count: this.#count,
    };
    return { version: PROJECTION_VERSION, lastAt: this.#lastAt, lastId: this.#lastId, state: JSON.parse(JSON.stringify(state)) as unknown };
  }

  /** A projection from its snapshot, or null when the snapshot is of another version or unreadable. */
  static fromSnapshot(snap: unknown): Projection | null {
    if (!snap || typeof snap !== 'object') return null;
    const s = snap as Partial<ProjectionSnapshot>;
    if (s.version !== PROJECTION_VERSION || typeof s.lastAt !== 'string' || typeof s.lastId !== 'string') return null;
    const st = s.state as Partial<SnapshotState> | undefined;
    if (!st || typeof st !== 'object' || !st.subjects || !st.stats || !st.statsParts?.live || !st.settings || !st.x) return null;
    const p = new Projection();
    for (const [k, v] of Object.entries(st.subjects)) p.#subjects.set(k, { ...emptyProgress(), ...v });
    for (const [k, v] of Object.entries(st.answers ?? {})) p.#answers.set(k, new Map(Object.entries(v)));
    p.#stats = { ...emptyStats(), ...st.stats };
    p.#statsParts = st.statsParts;
    for (const [scope, cells] of Object.entries(st.settings)) {
      const m = new Map(Object.entries(cells));
      p.#settings.set(scope, m);
      const values = p.settings(scope);
      for (const [k, c] of m) if (!c.removed) values[k] = c.value;
    }
    Object.assign(p.#levels, st.levels ?? {});
    p.#x = st.x;
    p.#count = typeof st.count === 'number' ? st.count : 0;
    p.#lastAt = s.lastAt;
    p.#lastId = s.lastId;
    return p;
  }
}

interface SnapshotState {
  subjects: Record<string, SubjectProgress>;
  answers: Record<string, Record<string, AnswerParts>>;
  stats: AccountStats;
  statsParts: StatsParts;
  settings: Record<string, Record<string, SettingCell>>;
  levels: Record<string, LevelRecord>;
  x: Exclusions;
  count: number;
}

function sumMaps(a: Readonly<Record<string, number>> | undefined, b: Readonly<Record<string, number>>): Record<string, number> {
  const o: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v;
  return o;
}

/** Replace an object's own entries in place (screens hold the object). */
function replace(target: Record<string, number>, next: Readonly<Record<string, number>>): void {
  for (const k of Object.keys(target)) if (!has(next, k)) Reflect.deleteProperty(target, k);
  Object.assign(target, next);
}
