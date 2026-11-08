/* Area 5's Languages screens in a DOM (happy-dom), over fake ports: the question "Which languages do you want to study?"
   (D21), the Languages tab in its three states, Today's card, the rows of courses and their ⋮, and the routes. The layout
   at 320px, axe and RTL are checked in a real browser (tests/lang_select.js, tests/lang_home.js, tests/a11y.js). */
import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defineUi } from '../index.ts';
import { AREA5_ROUTES, defineArea5, mountArea5, mountArea5Part, type Area5Ports } from '../screens/languages-activities.ts';
import type { CourseRow, LanguagesPort } from '../screens/languages/languages-port.ts';
import { laneDots } from '../screens/languages/lang-lanes.ts';
import { langNames } from '../screens/languages/study-chooser.ts';
import { mount, settle } from './services.ts';

defineUi();
defineArea5();
afterEach(() => {
  document.body.replaceChildren();
});

const row = (courseId: string, languages: string[], o: Partial<CourseRow> = {}): CourseRow => ({
  courseId,
  title: courseId.toUpperCase(),
  languages,
  studied: languages,
  account: false,
  studies: true,
  last: false,
  words: 0,
  total: 10,
  due: 0,
  started: false,
  pct: 0,
  next: null,
  ...o,
});

interface Fake extends LanguagesPort {
  readonly log: string[];
  studyNow: string[] | null;
}

function fakePort(rows: CourseRow[], study: string[] | null = null): Fake {
  const log: string[] = [];
  const P: Fake = {
    log,
    studyNow: study,
    courses: () => rows.map(r => ({ ...r, studies: !P.studyNow || r.languages.some(c => P.studyNow?.includes(c)) })),
    study: () => P.studyNow,
    offered: () => {
      const out: { code: string; courses: string[]; titles: string[] }[] = [];
      for (const r of rows)
        for (const c of r.languages) {
          let x = out.find(o => o.code === c);
          if (!x) out.push((x = { code: c, courses: [], titles: [] }));
          x.courses.push(r.courseId);
          x.titles.push(r.title);
        }
      return out;
    },
    courseLanguages: id => rows.find(r => r.courseId === id)?.languages ?? [],
    setStudy: codes => {
      P.studyNow = [...codes];
      log.push('study ' + codes.join());
    },
    locale: () => 'en',
    openCourse: id => log.push('course ' + id),
    openLanguage: code => log.push('lang ' + code),
    createCourse: () => log.push('new'),
    courseHref: (id, page) => `#/lang/${id}${page ? '/' + page : ''}`,
  };
  return P;
}

const ports = (P: LanguagesPort): Area5Ports => ({
  languages: () => P,
  course: () => null,
  engines: () => {
    throw new Error('not in these tests');
  },
});

async function page(P: LanguagesPort): Promise<HTMLElement> {
  const host = mount();
  const m = AREA5_ROUTES.match('/lang');
  assert.ok(m);
  const r = mountArea5(m, host, ports(P), k => k);
  assert.equal(r.chrome.tab, 'lang');
  await settle(host);
  return host;
}

const click = async (root: HTMLElement, sel: string): Promise<void> => {
  const b = root.querySelector<HTMLElement>(sel);
  assert.ok(b, sel);
  b.click();
  await settle(root);
};

describe('the routes of area 5', () => {
  test('#/lang, #/lang/<code>, #/engines and #/engines/new', () => {
    assert.equal(AREA5_ROUTES.match('/lang')?.name, 'languages');
    assert.equal(AREA5_ROUTES.match('/nowhere'), null);
    const l = AREA5_ROUTES.match('/lang/de');
    assert.ok(l?.name === 'language');
    assert.equal(l.params.code, 'de');
    const e = AREA5_ROUTES.match('/engines/new');
    assert.equal(e?.name === 'engines' ? e.params.sub : '', 'new');
  });
});

describe('the Languages tab', () => {
  test('no course: the empty state with + New language', async () => {
    const P = fakePort([]),
      host = await page(P);
    assert.ok(host.querySelector('.ns-empty'));
    await click(host, '.ns-empty .btn.primary');
    assert.deepEqual(P.log, ['new']);
  });
  test('not answered yet: the question first, the courses listed below; the answer is stored and the tab redraws', async () => {
    const P = fakePort([row('poly', ['de', 'el']), row('zh', ['zh'])]),
      host = await page(P);
    const langs = [...host.querySelectorAll<HTMLElement>('.ns-studyask .noema-study-lang')].map(b => b.dataset['lang']);
    assert.deepEqual(langs, ['de', 'el', 'zh']);
    assert.equal(host.querySelectorAll('.ns-langitem').length, 2);
    const ok = host.querySelector<HTMLButtonElement>('.noema-study-ok');
    assert.ok(ok?.disabled, 'nothing chosen: the button waits');
    await click(host, '.noema-study-lang[data-lang="el"]');
    assert.equal(host.querySelector('.noema-study-lang[data-lang="el"]')?.getAttribute('aria-pressed'), 'true');
    assert.ok(!host.querySelector<HTMLButtonElement>('.noema-study-ok')?.disabled);
    await click(host, '.noema-study-ok');
    assert.deepEqual(P.log, ['study el']);
    await settle(host);
    assert.deepEqual(
      [...host.querySelectorAll<HTMLElement>('.ns-studylang')].map(b => b.dataset['lang']),
      ['el'],
      'answered: the languages studied, each opening its home',
    );
    assert.ok(host.querySelector('details.ns-studyrest'), 'the courses without a language studied fold away');
    await click(host, '.ns-studylang[data-lang="el"]');
    assert.equal(P.log.at(-1), 'lang el');
  });
  test('“All” picks every language and then none; a row opens its course', async () => {
    const P = fakePort([row('poly', ['de', 'el'], { due: 3, started: true, last: true, words: 4, pct: 0.4 })]),
      host = await page(P);
    await click(host, '.noema-study-all');
    assert.equal(host.querySelectorAll('.noema-study-lang[aria-pressed="true"]').length, 2);
    await click(host, '.noema-study-all');
    assert.equal(host.querySelectorAll('.noema-study-lang[aria-pressed="true"]').length, 0);
    assert.ok(host.querySelector('.ns-langitem .ns-pill'), 'what is due shows as a pill');
    assert.ok(host.querySelector('.ns-langlast'), 'the course the learner was last in says so');
    await click(host, '.ns-langitem[data-course="poly"]');
    assert.deepEqual(P.log, ['course poly']);
  });
});

describe('parts', () => {
  test('the chooser of a course lists its languages first, says “in this course” and, with none, which ones it has', async () => {
    const P = fakePort([row('poly', ['de', 'el']), row('zh', ['zh'])], ['de']),
      host = mount();
    const done: string[][] = [];
    mountArea5Part('study-chooser', host, ports(P), { course: 'zh', none: true, onDone: c => done.push([...c]) });
    await settle(host);
    const langs = [...host.querySelectorAll<HTMLElement>('.noema-study-lang')].map(b => b.dataset['lang']);
    assert.deepEqual(langs, ['zh', 'de', 'el']);
    assert.ok(host.querySelector('.noema-study-lang[data-lang="zh"] .here'));
    assert.equal(host.querySelector('.noema-study-lang[data-lang="de"]')?.getAttribute('aria-pressed'), 'true', 'the answer so far');
    await click(host, '.noema-study-lang[data-lang="zh"]');
    await click(host, '.noema-study-ok');
    assert.deepEqual(done, [['zh', 'de']]);
  });
  test('Today’s card continues a course: what is due, the next lesson', async () => {
    const P = fakePort([row('poly', ['de'], { due: 2, started: true, next: { step: '3', title: 'Food' } })]),
      host = mount();
    mountArea5Part('lang-today', host, ports(P), { course: 'poly' });
    await settle(host);
    const b = host.querySelector<HTMLElement>('.ns-langgo[data-course="poly"]');
    assert.ok(b);
    assert.equal(b.querySelectorAll('.ns-pill').length, 3);
    await click(host, '.ns-langgo');
    assert.deepEqual(P.log, ['course poly']);
  });
  test('the rows of courses (Choose another course) call back with the course', async () => {
    const P = fakePort([row('a', ['de']), row('b', ['fr'])]),
      host = mount(),
      picked: string[] = [];
    mountArea5Part('lang-courses', host, ports(P), { onPick: id => picked.push(id) });
    await settle(host);
    await click(host, '.ns-langitem[data-course="b"]');
    assert.deepEqual(picked, ['b']);
  });
  test('a language’s names: its own (endonym) and the one in the interface language', () => {
    const n = langNames('de', 'en');
    assert.equal(n.ui, 'German');
    assert.equal(n.own, 'Deutsch');
  });
});

describe('⫴ parallel lanes', () => {
  const lang = (code: string) => ({ code, flag: code.toUpperCase(), label: code + '-name', name: code, known: 0, total: 0 });
  const cell = (node: string, state = 'open') => ({
    node,
    step: 'S1',
    title: 'Hello',
    short: 'Hello',
    code: 'S1',
    state,
    stateLabel: state,
    sign: '○',
  });
  function coursePort(width = 1200) {
    const log: string[] = [];
    let view: '' | 'tiles' | 'dots' = '';
    const P = {
      log,
      home: () => {
        throw new Error('no home here');
      },
      strip: () => ({ langs: [], current: null, explainName: 'English' }),
      go: (h: string) => log.push('go ' + h),
      pick: () => undefined,
      continueLesson: () => undefined,
      session: () => undefined,
      lanes: () => ({
        langs: [lang('de'), lang('he')],
        view,
        rows: [
          { section: 'Foundations', common: true, cells: { de: cell('S01'), he: cell('S01', 'passed') } },
          { section: null, common: false, cells: { de: cell('S02'), he: null } },
        ],
        width: () => width,
      }),
      setLanesView: (k: '' | 'tiles' | 'dots') => {
        view = k;
        log.push('view ' + k);
      },
      laneInfo: (code: string, node: string) => ({
        node,
        title: 'S1 Hello',
        lang: lang(code),
        state: 'open',
        functions: [{ title: 'Greetings', note: null }],
        words: 3,
        others: code === 'de' ? [{ code: 'he', label: 'he-name', state: 'passed' }] : [],
      }),
      openStep: (code: string, node: string) => log.push(`open ${code} ${node}`),
    };
    return P;
  }
  test('tiles or dots: as chosen, else by the width', () => {
    assert.equal(laneDots('', 352, 4), false);
    assert.equal(laneDots('', 320, 4), true);
    assert.equal(laneDots('tiles', 100, 9), false);
    assert.equal(laneDots('dots', 2000, 1), true);
  });
  test('one column per language, a level per row, a gap where a language has no step; a step opens its card', async () => {
    const C = coursePort(),
      host = mount();
    mountArea5Part('lang-lanes', host, { ...ports(fakePort([])), course: () => C }, {});
    await settle(host);
    assert.deepEqual(
      [...host.querySelectorAll<HTMLElement>('.lx-lflag')].map(x => x.dataset['lang']),
      ['de', 'he'],
    );
    assert.equal(host.querySelectorAll('.lx-lrow').length, 2);
    assert.equal(host.querySelectorAll('.lx-lsec').length, 1);
    assert.equal(host.querySelectorAll('.lx-lgap').length, 1);
    assert.equal(host.querySelectorAll('.lx-lnode').length, 3);
    await click(host, '.lx-lviewpick button:nth-child(3)');
    assert.deepEqual(C.log, ['view dots']);
    assert.equal(host.querySelectorAll('.lx-ldot').length, 3);
    assert.equal(host.querySelectorAll('.lx-lnode').length, 0);
    await click(host, '.lx-ldot[data-lang="de"][data-node="S01"]');
    const box = document.querySelector<HTMLElement>('noema-dialog .lx-linfo');
    assert.ok(box, 'the card of the step');
    assert.ok(box.querySelector('.lx-linfo-oth [data-lang="he"]'), 'the same step in the other languages');
    box.querySelector<HTMLElement>('.lx-linfo-oth [data-lang="he"]')?.click();
    const again = document.querySelector<HTMLElement>('noema-dialog .lx-linfo');
    assert.ok(again && !again.querySelector('.lx-linfo-oth'), 'its other language replaces it in place');
    again.querySelector<HTMLElement>('.btn.primary')?.click();
    assert.equal(C.log.at(-1), 'open he S01');
  });
});
