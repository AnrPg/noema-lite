/* The study area's pages in a DOM (happy-dom) over a fake host: the routes it draws and the ones it leaves to the app,
   a one-exercise round answered with the keyboard and mouse (recorded, XP, the summary), a locked Roadmap step, the
   "only my level" filter, the source filter (the engine's indexes follow), and the words for the engine. */
import '../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { testServices } from '../ui/test/services.ts';
import type { Course } from '../features/study/domain/course.ts';
import type { Chapter, Exercise, StudyState } from '../features/study/domain/pack.ts';
import type { StudyHost } from '../features/study/ui/host.ts';
import type { AiPort, TutorPort } from '../features/study/ui/parts.ts';
import { createStudyUi, type StudyUi } from '../features/study/ui/root.ts';

const ex = (id: string, section: string, level?: string): Exercise => ({
  id,
  type: 'mcq',
  section,
  difficulty: 1,
  tags: ['concept'],
  q: `Question ${id}`,
  options: ['right', 'wrong', 'also wrong'],
  answer: 0,
  explain: 'Because.',
  ...(level ? { level } : {}),
});
const chapter = (n: number): Chapter => ({
  id: `c${String(n)}`,
  num: n,
  title: `Chapter ${String(n)}`,
  objectives: [],
  src: n === 2 ? 'b' : 'a',
  sections: [{ id: `c${String(n)}-s1`, title: `Section ${String(n)}.1`, blocks: [{ t: 'p', text: `Theory of chapter ${String(n)}` }] }],
  exercises: [ex(`c${String(n)}-e1`, `c${String(n)}-s1`, 'l1'), ex(`c${String(n)}-e2`, `c${String(n)}-s1`, 'l2')],
  flashcards: [{ q: 'Front', a: 'Back', id: `c${String(n)}-f1` }],
  debug: [],
  pitfalls: [],
});

interface Fake {
  host: StudyHost & { readonly tutor: TutorPort; readonly ai: AiPort };
  state: StudyState;
  /** the events the pages recorded (type and item) */
  events: string[];
  xp: number[];
  followed: Course[];
  lock: { missing: readonly string[] } | null;
  level: string | null;
}

function fake(): Fake {
  const main = document.createElement('main');
  document.body.append(main);
  // a small fold of the events the tests look at (the real one: src/features/study/domain/events/projection.ts)
  const res: Record<string, { n: number; ok: number }> = {},
    read: Record<string, boolean> = {},
    fc: Record<string, unknown> = {};
  const state: StudyState = { xp: 0, read, res, pb: {}, fc, boss: {}, last: null, settings: { goal: 50, chunk: false, sound: false } };
  const f: Fake = { state, events: [], xp: [], followed: [], lock: null, level: null, host: null as never };
  const learn: StudyHost['learn'] = (type, item, data = {}) => {
    f.events.push(`${type}:${item ?? ''}`);
    if (type === 'answer.given' && item) {
      const r = (res[item] ??= { n: 0, ok: 0 });
      r.n++;
      if (data['ok']) r.ok++;
    }
    if (type === 'section.read' && item) read[item] = true;
    if (type === 'card.reviewed' && item) fc[item] = { rating: data['rating'] };
  };
  const noop = (): void => undefined;
  f.host = {
    subject: { id: 'subj', title: 'Physics' },
    account: { id: 'acc', name: 'Ada', kind: 'local' },
    chapters: [chapter(1), chapter(2)],
    media: {},
    sources: {
      sources: [
        { id: 'a', title: 'Book A' },
        { id: 'b', title: 'Book B' },
      ],
      chapters: {},
    },
    state,
    learn,
    save: noop,
    flush: noop,
    addXP: n => {
      f.xp.push(n);
      return { goal: false, level: false };
    },
    goal: 50,
    courseChanged: c => {
      f.followed.push(c);
    },
    restorePoint: () => Promise.resolve(),
    frame: {
      framed: false,
      main: () => main,
      setupBanner: () => null,
      chrome: noop,
      menuButton: (_items, o) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        return b;
      },
      sheet: () => noop,
      modal: build => {
        const box = document.createElement('div');
        build(box, noop);
        return noop;
      },
      toast: noop,
      confirm: () => Promise.resolve(true),
      navigate: href => {
        location.hash = href;
      },
      setActs: noop,
      noteRecent: noop,
      subjectTags: () => [],
      character: () => ({ face: '', name: 'Brick', avatar: '🦉', plural: false }),
      L: k => k,
    },
    feedback: { beep: noop, confetti: noop, big: noop, answered: noop, tick: noop, xpFloat: noop, reacts: false },
    roadmap: {
      station: () => null,
      openMap: noop,
      lock: () => f.lock,
      nextStep: () => null,
      ladder: () => [
        { id: 'l1', order: 0, name: 'Beginner' },
        { id: 'l2', order: 1, name: 'Advanced' },
      ],
      reachedLevel: () => f.level,
    },
    activities: { block: () => document.createElement('div'), asText: () => '', runnable: () => true, exercise: () => null },
    bridge: { section: noop, menuItem: () => null },
    subjectActions: { menu: () => [] },
    search: { step: () => null, after: () => null, page: '#/subject' },
    sourceFiles: {
      available: () => null,
      index: () => ({}),
      webUrl: () => null,
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      filePage: (_s, p) => p,
    },
    openFile: noop,
    refitFsrs: () => Promise.resolve(null),
    blockIds: blocks => blocks.map((_, i) => `b${String(i)}`),
    trapId: () => 'trap',
    tutor: { open: noop, close: noop, setContext: noop, askAbout: noop, explainable: el => el, intent: () => '' },
    ai: {
      grade: () => Promise.reject(new Error('offline')),
      question: () => Promise.reject(new Error('offline')),
      drillGrade: () => Promise.reject(new Error('offline')),
      md: s => {
        const d = document.createElement('div');
        d.textContent = s;
        return d;
      },
    },
  };
  return f;
}

let ui: StudyUi;
let f: Fake;
const { i18n, clock } = testServices();
const main = (): HTMLElement => f.host.frame.main();
const text = (): string => main().textContent;

beforeEach(() => {
  location.hash = '#/subject';
  f = fake();
  ui = createStudyUi(f.host, i18n, clock);
});
afterEach(() => {
  document.body.replaceChildren();
});

test('the subject page lists its chapters; an address that is not the study area’s is left to the app', () => {
  assert.equal(ui.show('#/subject'), true);
  assert.match(text(), /Chapter 1/);
  assert.match(text(), /Chapter 2/);
  assert.equal(main().dataset['page'], '@engine');
  assert.equal(ui.show('#/roadmaps'), false);
  assert.ok(ui.segments.has('ch') && ui.segments.has('ex') && !ui.segments.has('roadmaps'));
});

test('a section draws its theory; the engine’s indexes follow the course', () => {
  ui.show('#/s/c1-s1');
  assert.match(text(), /Theory of chapter 1/);
  const last = f.followed.at(-1);
  assert.deepEqual(
    last?.chapters.map(c => c.id),
    ['c1', 'c2'],
  );
});

test('one exercise (#/ex/<id>): answered right, it is recorded, gives XP, and the round ends in its summary', () => {
  ui.show('#/ex/c1-e1');
  assert.equal(location.hash, '#/run');
  ui.show('#/run');
  const right = [...main().querySelectorAll<HTMLButtonElement>('.ex .opt')].find(
    b => b.textContent.includes('right') && !b.textContent.includes('wrong'),
  );
  assert.ok(right, 'the options are drawn');
  right.click();
  assert.equal(f.state.res['c1-e1']?.ok, 1);
  assert.ok(f.xp.reduce((a, b) => a + b, 0) > 0, 'XP for a right answer');
  const ctx = ui.app.round?.actor.snapshot;
  assert.equal(ctx?.state, 'answered');
  const next = main().querySelector<HTMLButtonElement>('.btn.primary[data-next]');
  assert.ok(next, 'Next is the page’s primary button (Enter presses it)');
  next.click();
  assert.equal(ui.app.round?.actor.snapshot.state, 'summary');
});

test('the 1–6 keys choose an option of the open exercise', () => {
  ui.show('#/ex/c1-e2');
  ui.show('#/run');
  const opts = [...main().querySelectorAll<HTMLButtonElement>('.ex .opt')];
  const k = opts.findIndex(b => b.textContent.includes('right') && !b.textContent.includes('wrong'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: String(k + 1), bubbles: true }));
  assert.equal(f.state.res['c1-e2']?.ok, 1);
});

test('a locked Roadmap step: its theory opens, its exercises wait', () => {
  f.lock = { missing: ['Algebra'] };
  ui.show('#/practice/c1');
  assert.ok(main().querySelector('.locknote'));
  assert.equal(main().querySelector('.ex'), null);
  ui.show('#/s/c1-s1');
  assert.ok(main().querySelector('.lockbar'));
  assert.match(text(), /Theory of chapter 1/);
});

test('“Only my level” keeps a round at the learner’s level', () => {
  f.level = 'l1';
  ui = createStudyUi(f.host, i18n, clock);
  assert.equal(ui.app.offersLevelFilter(), true);
  ui.app.onlyMyLevel = true;
  ui.app.startRound([...ui.app.course.exercises]);
  const list = ui.app.round?.actor.snapshot.context.list ?? [];
  assert.ok(list.length > 0 && list.every(e => e.level === 'l1'));
  ui.app.onlyMyLevel = false;
  ui.app.startRound([...ui.app.course.exercises]);
  assert.ok((ui.app.round?.actor.snapshot.context.list ?? []).some(e => e.level === 'l2'));
});

test('the source filter: only one book’s chapters, the engine follows, and back to all', () => {
  ui.app.setFilter(['b']);
  assert.deepEqual(
    ui.app.course.chapters.map(c => c.id),
    ['c2'],
  );
  assert.deepEqual(
    f.followed.at(-1)?.chapters.map(c => c.id),
    ['c2'],
  );
  ui.app.setFilter(null);
  assert.equal(ui.app.course.chapters.length, 2);
});

test('the words for the engine: an exercise and a section as text for the AI; progress is recorded as events', () => {
  const e = f.host.chapters[0]?.exercises[0];
  assert.ok(e);
  assert.match(ui.exerciseText(e), /Exercise \(mcq\): Question c1-e1/);
  const sec = f.host.chapters[0]?.sections[0];
  assert.ok(sec);
  assert.match(ui.sectionText(sec), /## Section 1\.1\n[\s\S]*Theory of chapter 1/);
  ui.show('#/s/c1-s1');
  assert.ok(
    f.events.includes('section.opened:c1-s1') && f.events.includes('section.read:c1-s1'),
    'opening and reading a section are events',
  );
});
