/**
 * The study screens' shared state: the course seen through the source filter, the learner's progress (read through the
 * study domain's queries), the round in play (the practice session's statechart), the focus sprint, and the words. Every
 * screen gets the one StudyApp of the open subject; it holds no DOM of its own.
 */
import type { Clock } from '../../../ports/clock.ts';
import type { I18n, MessageParams } from '../../../ports/i18n.ts';
import {
  activeFilter,
  buildCourse,
  chapterRefs,
  fullCourse,
  isNewSource,
  newSources,
  sourceAliases,
  sourceList,
  type Course,
  type SourceRef,
} from '../domain/course.ts';
import { atLevel, currentLevel, levelOf, offersLevelFilter } from '../domain/my-level.ts';
import type { AnswerRecord, Chapter, Drill, Exercise, Flashcard } from '../domain/pack.ts';
import { cardMemoryOf, masteryBox } from '../domain/fsrs.ts';
import {
  cardQueue,
  chapterProgress,
  countDue,
  isDue,
  isSolved,
  mistakes,
  roundOrder,
  siblingOf,
  type CardQueue,
} from '../domain/queries.ts';
import { roundMachine, startRound, type RoundActor } from '../domain/session.ts';
import type { StudyHost } from './host.ts';
import type { AiPort, TutorPort, ViewerPort } from './parts.ts';
import { SourcesUi } from './sources.ts';

/** A round in play: its exercises' statechart and what the screen shows around it. */
export interface Round {
  readonly actor: RoundActor<Exercise>;
  readonly title: string;
  readonly back: string;
  /** the XP the learner had when it began (the summary's +XP) */
  readonly xp0: number;
  /** what comes after it (a round made from search results: the next part) */
  readonly after: { readonly label: string; run(): void } | null;
}

export interface RoundOptions {
  readonly title?: string;
  readonly back?: string;
  readonly count?: number;
  /** keep the list's order (a boss battle, one exercise) */
  readonly keepOrder?: boolean;
  readonly boss?: string | null;
  readonly after?: { readonly label: string; run(): void } | null;
}

export interface CardItem extends Flashcard {
  readonly key: string;
  readonly chapter: Chapter;
}

export const HOME = '#/subject';
const SPRINT_MS = 15 * 60e3;

export class StudyApp {
  readonly host: StudyHost;
  readonly i18n: I18n;
  readonly clock: Clock;
  course: Course;
  round: Round | null = null;
  /** the tutor and the AI's one-shot jobs (set by the root once tutor/ is made, before any screen is drawn) */
  tutor!: TutorPort;
  ai!: AiPort;
  /** the sources: chips, the filter's bar, the deck, opening a source */
  readonly sourcesUi: SourcesUi;
  readonly viewer: ViewerPort;
  /** the page on screen (its route's name) and the Roadmap step's lock while it lasts */
  route = '';
  lock: { readonly missing: readonly string[] } | null = null;
  /** draws the page of the address again (set by the root) */
  rerender: () => void = () => undefined;
  /** the tab each chapter was left on */
  readonly chapterTab = new Map<string, string>();
  /** chunks of a section already shown (bite-size reading) */
  readonly shownChunks = new Map<string, number>();
  #refs = new Map<string, SourceRef[]>();
  #aliases: ReturnType<typeof sourceAliases>;
  #sprint: { end: number; timer: ReturnType<typeof setInterval> } | null = null;
  #sprintListeners = new Set<() => void>();

  constructor(host: StudyHost, i18n: I18n, clock: Clock) {
    this.host = host;
    this.i18n = i18n;
    this.clock = clock;
    const sources = sourceList(host.sources, i18n.t('engine.src.course'));
    this.#aliases = sourceAliases(sources);
    this.full = fullCourse(host.chapters, sources, host.sources);
    this.course = this.#build();
    this.sourcesUi = new SourcesUi(this);
    this.viewer = this.sourcesUi;
  }
  readonly full: Course['full'];

  #build(): Course {
    const sources = this.full.length ? sourceList(this.host.sources, this.i18n.t('engine.src.course')) : [];
    const course = buildCourse(this.full, sources, {
      filter: activeFilter(sources, this.host.state.settings.srcOn),
      seen: this.host.state.seenSrc,
      keep: (e, c) => this.host.activities.runnable(e, c),
    });
    if (!course.filter && this.host.state.settings.srcOn) {
      this.host.state.settings.srcOn = null;
      this.host.save();
    }
    this.host.courseChanged(course);
    return course;
  }

  /* ---------- words ---------- */
  t(key: string, params?: MessageParams): string {
    return this.i18n.t(key, params);
  }
  /** the frame's words (sh.*) */
  L(key: string, params?: Readonly<Record<string, string | number>>): string {
    return this.host.frame.L(key, params);
  }
  nf(n: number): string {
    return this.i18n.format.number(n);
  }
  pct(p: number): string {
    return this.i18n.format.percent(p / 100);
  }
  chTitle(num: number, title: string): string {
    return this.t('engine.common.chTitle', { num, title });
  }
  chShort(num: number): string {
    return this.t('engine.common.chShort', { num });
  }
  errText(e: unknown): string {
    return this.i18n.err(e);
  }
  /** an arrow along the reading direction */
  get arrowOn(): string {
    return this.i18n.dir() === 'rtl' ? '←' : '→';
  }
  get arrowBack(): string {
    return this.i18n.dir() === 'rtl' ? '→' : '←';
  }
  go(href: string): void {
    this.host.frame.navigate(href);
  }
  toast(text: string, ms?: number): void {
    this.host.frame.toast(text, ms);
  }

  /* ---------- the course and its sources ---------- */
  get state() {
    return this.host.state;
  }
  get sources() {
    return this.course.sources;
  }
  refs(c: Chapter & { readonly src: string }): SourceRef[] {
    let r = this.#refs.get(c.id);
    if (!r) {
      r = chapterRefs(c, this.course.sources, this.#aliases);
      this.#refs.set(c.id, r);
    }
    return r;
  }
  isNewSource(id: string | undefined): boolean {
    return isNewSource(this.course.sources, id, this.state.seenSrc);
  }
  newSources(): string[] {
    return newSources(this.course.sources, this.state.seenSrc);
  }
  markSeen(ids?: readonly string[]): void {
    for (const id of ids ?? this.course.sources.map(s => s.id))
      if (!this.state.seenSrc?.[id]) this.host.learn('source.seen', id, { seen: true });
    this.course = this.#build();
  }
  /** a source shown as new again */
  markUnseen(id: string): void {
    this.host.learn('source.seen', id, { seen: false });
    this.course = this.#build();
  }
  /** the source filter: the ids to show (null: everything) */
  setFilter(ids: readonly string[] | null): void {
    this.state.settings.srcOn = ids?.length && ids.length < this.course.sources.length ? [...ids] : null;
    this.host.save();
    this.course = this.#build();
  }
  get filter(): ReadonlySet<string> | null {
    return this.course.filter;
  }

  /* ---------- progress ---------- */
  /** The subject as a step of a Roadmap: its mastery so far (the 🎉 once mastered); null when it is not a step. */
  station(): {
    readonly title: string;
    readonly read: number;
    readonly solved: number;
    readonly pass: number;
    readonly done: boolean;
  } | null {
    const st = this.host.roadmap.station();
    if (!st) return null;
    const { sr: read, ex: solved } = this.courseProgress();
    const done = st.mastered || (read >= 0.999 && solved >= st.pass);
    if (done && !this.state.nodeDone) {
      this.host.learn('subject.finished', null);
      setTimeout(() => {
        this.host.feedback.big('node');
      }, 600);
    }
    return { title: st.title, read, solved, pass: st.pass, done };
  }
  progress(c: Chapter): { readonly sr: number; readonly ex: number } {
    return chapterProgress(c, this.state.read, this.state.res);
  }
  courseProgress(): { readonly sr: number; readonly ex: number } {
    return chapterProgress(
      { id: '', sections: this.course.chapters.flatMap(c => c.sections), exercises: this.course.exercises },
      this.state.read,
      this.state.res,
    );
  }
  solved(id: string): boolean {
    return isSolved(this.state.res, id);
  }
  mistakes(list: readonly Exercise[] = this.course.exercises): Exercise[] {
    return mistakes(list, this.state.res);
  }
  cards(chapters: readonly Chapter[] = this.course.chapters): CardItem[] {
    return chapters.flatMap(c => c.flashcards.map((f, i) => ({ ...f, key: f._key ?? f.id ?? `${c.id}#${String(i)}`, chapter: c })));
  }
  /** one answer, kept with how sure the learner was (an answer.given event: the log folds state.res) */
  record(ex: Exercise, ok: boolean, conf: AnswerRecord['conf'] | null = null, firstTry = true): void {
    this.host.learn('answer.given', ex.id, { ok, firstTry, ...(conf ? { conf } : {}) });
  }
  /** XP for something the learner did, with the character's reaction to a goal or a new level */
  xp(n: number, at: Element | null = null): void {
    if (n <= 0) return;
    const crossed = this.host.addXP(n);
    this.host.feedback.xpFloat(n, at);
    if (crossed.goal) {
      if (this.host.feedback.reacts) this.host.feedback.big('goal');
      else this.host.feedback.confetti(160);
      this.toast(`🎯 ${this.t('engine.core.goalSmashed')}`);
    } else if (crossed.level && this.host.feedback.reacts) this.host.feedback.big('level');
  }

  /* ---------- cards and drills: FSRS-6 (domain/fsrs.ts) ---------- */
  deck<C extends { readonly key: string }>(cards: readonly C[], o: { readonly all?: boolean } = {}): CardQueue<C> {
    return cardQueue(cards, this.state.fc, this.clock.today(), { random: Math.random, ...(o.all ? { all: true } : {}) });
  }
  dueCards(chapters?: readonly Chapter[]): number {
    return countDue(
      this.state.fc,
      this.clock.today(),
      this.cards(chapters).map(c => c.key),
    );
  }
  dueDrills(): number {
    return countDue(
      this.state.pb,
      this.clock.today(),
      this.course.chapters.flatMap(c => c.debug.map(d => d.id)),
    );
  }
  /** a drill to do: never done, or due again */
  drillDue(d: Drill): boolean {
    const raw = this.state.pb[d.id];
    return !raw || isDue(raw, this.clock.today());
  }
  /** a drill's mastery 0–5 (its five dots) */
  drillBox(d: Drill): number {
    return masteryBox(cardMemoryOf(this.state.pb[d.id]));
  }

  /* ---------- only my level ---------- */
  /** the ladder over this subject, and the learner's level on it (null: no ladder) */
  myLevel(): { readonly id: string; readonly name: string } | null {
    const ladder = this.host.roadmap.ladder();
    const id = currentLevel(ladder, this.host.roadmap.reachedLevel());
    const l = ladder.find(x => x.id === id);
    return l ? { id: l.id, name: l.name } : null;
  }
  levelOf(item: { readonly level?: string; readonly section?: string; readonly id: string }, chapter?: Chapter): string | null {
    const packLevels = (this.host.subject.levels ?? []).map(l => (typeof l === 'string' ? l : ((l as { id?: string }).id ?? '')));
    return levelOf(item, chapter ?? this.course.chapterOf(item), packLevels);
  }
  /** "Only my level" is offered: the subject has a ladder and content at more than one of its levels */
  offersLevelFilter(): boolean {
    const ladder = this.host.roadmap.ladder();
    if (ladder.length < 2) return false;
    return offersLevelFilter(
      ladder,
      this.course.exercises.map(e => this.levelOf(e)),
    );
  }
  /** the items at the learner's level */
  atMyLevel<T extends { readonly level?: string; readonly section?: string; readonly id: string }>(
    items: readonly T[],
    chapter?: (x: T) => Chapter | undefined,
  ): T[] {
    const me = this.myLevel();
    return atLevel(items, me?.id ?? null, x => this.levelOf(x, chapter?.(x)));
  }
  /** the learner's choice "only my level" (a device preference of this subject) */
  get onlyMyLevel(): boolean {
    return this.state.settings['onlyMyLevel'] === true && this.offersLevelFilter();
  }
  set onlyMyLevel(on: boolean) {
    this.state.settings['onlyMyLevel'] = on;
    this.host.save();
  }

  /* ---------- a round ---------- */
  /** Starts a round: mistakes first (unless keepOrder), cut to its size; the learner's level only when chosen. */
  startRound(list: readonly Exercise[], o: RoundOptions = {}): void {
    const pool = this.onlyMyLevel && !o.keepOrder ? this.atMyLevel(list) : list;
    const ordered = (o.keepOrder ? [...pool] : roundOrder(pool.length ? pool : list, this.state.res, Math.random)).slice(0, o.count ?? 10);
    const m = roundMachine<Exercise>(
      ordered,
      { boss: o.boss ?? null },
      {
        sibling: (ex, round) => siblingOf(ex, round, this.course.exercises, Math.random, e => this.course.chapterOf(e)),
      },
    );
    this.round = {
      actor: startRound(m, () => this.clock.now()),
      title: o.title ?? this.t('engine.run.practice'),
      back: o.back ?? HOME,
      xp0: this.state.xp,
      after: o.after ?? null,
    };
    if (location.hash === '#/run') this.rerender();
    else this.go('#/run');
  }

  /* ---------- ⏱️ the focus sprint (15 minutes) ---------- */
  get sprintLeft(): number | null {
    return this.#sprint ? Math.max(0, this.#sprint.end - this.clock.now()) : null;
  }
  onSprint(f: () => void): () => void {
    this.#sprintListeners.add(f);
    return () => {
      this.#sprintListeners.delete(f);
    };
  }
  toggleSprint(): void {
    const tell = (): void => {
      for (const f of [...this.#sprintListeners]) f();
    };
    if (this.#sprint) {
      clearInterval(this.#sprint.timer);
      this.#sprint = null;
      tell();
      return;
    }
    const end = this.clock.now() + SPRINT_MS;
    this.#sprint = {
      end,
      timer: setInterval(() => {
        if (this.clock.now() < end) {
          tell();
          return;
        }
        if (this.#sprint) clearInterval(this.#sprint.timer);
        this.#sprint = null;
        tell();
        this.host.feedback.confetti(120);
        this.host.feedback.beep('win');
        this.toast(`🎉 ${this.t('engine.top.sprintDone')}`, 5000);
      }, 1000),
    };
    tell();
  }
}

/** mm:ss of a duration */
export const clockText = (ms: number): string =>
  `${String(Math.floor(ms / 60e3)).padStart(2, '0')}:${String(Math.floor(ms / 1e3) % 60).padStart(2, '0')}`;
