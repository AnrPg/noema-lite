/* Area 5's Languages screens in a DOM (happy-dom), over fake ports: the question "Which languages do you want to study?"
   (D21), the Languages tab in its three states, Today's card, the rows of courses and their ⋮, and the routes. The layout
   at 320px, axe and RTL are checked in a real browser (tests/lang_select.js, tests/lang_home.js, tests/a11y.js). */
import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defineUi } from '../index.ts';
import { AREA5_ROUTES, defineArea5, mountArea5, mountArea5Part, type Area5Ports } from '../screens/languages-activities.ts';
import type { CourseRow, LanguagesPort } from '../screens/languages/languages-port.ts';
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
    const l = AREA5_ROUTES.match('/lang/de');
    assert.equal(l?.name, 'language');
    assert.equal(l?.name === 'language' ? l.params.code : '', 'de');
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
