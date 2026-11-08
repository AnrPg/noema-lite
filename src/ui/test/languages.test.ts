/* Area 5's Languages screens in a DOM (happy-dom), over fake ports: the question "Which languages do you want to study?"
   (D21), the Languages tab in its three states, Today's card, the rows of courses and their ⋮, and the routes. The layout
   at 320px, axe and RTL are checked in a real browser (tests/lang_select.js, tests/lang_home.js, tests/a11y.js). */
import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defineUi } from '../index.ts';
import { AREA5_ROUTES, defineArea5, mountArea5, mountArea5Part, type Area5Ports } from '../screens/languages-activities.ts';
import type { AspectPage, SortDrill, WordOptions, WordView } from '../screens/languages/course-port.ts';
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
  test('#/lang and #/lang/<code>; #/engines is not area 5 (Community has it)', () => {
    assert.equal(AREA5_ROUTES.match('/lang')?.name, 'languages');
    assert.equal(AREA5_ROUTES.match('/nowhere'), null);
    const l = AREA5_ROUTES.match('/lang/de');
    assert.ok(l?.name === 'language');
    assert.equal(l.params.code, 'de');
    assert.equal(AREA5_ROUTES.match('/engines'), null);
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
    let view: '' | 'tiles' | 'dots' = '',
      translit = true;
    const P = {
      log,
      frame: false,
      home: () => {
        throw new Error('no home here');
      },
      strip: () => ({ langs: [], current: null, explainName: 'English' }),
      go: (h: string) => log.push('go ' + h),
      pick: () => undefined,
      continueLesson: (id: string, langs: readonly string[]) => log.push(`continue ${id} ${langs.join()}`),
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
      lessonHead: (node: string) =>
        node === 'fd.01'
          ? {
              step: 'S01',
              title: 'Hello',
              langs: [
                { code: 'de', flag: 'DE', state: 'learning', stateLabel: '◑ learning', pct: 80 },
                { code: 'he', flag: 'HE', state: 'locked', stateLabel: '🔒 locked', pct: null },
              ],
              ladder: {
                steps: [
                  { id: 'wl', done: true, open: true },
                  { id: 'wp', done: false, open: true },
                  { id: 'tr', done: false, open: false },
                  { id: 'tp', done: false, open: false },
                ],
                next: 'wp',
              },
              can: ['de'],
              deepen: { n: 4, href: '#/deepen/fd.01/de' },
              translit: { on: translit },
              frame: P.frame,
            }
          : null,
      setTranslit: (on: boolean) => {
        translit = on;
        log.push('translit ' + String(on));
      },
      translit: () => ({ has: true, on: translit }),
      word: (code: string, text: string, o: WordOptions): WordView | null =>
        code === 'xx'
          ? null
          : {
              lang: code,
              dir: code === 'he' ? 'rtl' : 'ltr',
              shown: text,
              help: o.sub && o.lex ? { text: 'shalom', lang: 'und-Latn' } : null,
              run: o.link
                ? {
                    title: 'Hebrew',
                    tokens: [
                      { text: 'שָׁלוֹם', lex: 'he.shalom', reading: o.sub && o.lex ? undefined : 'shalom', gloss: 'peace', fresh: true },
                      { text: ' ' },
                      { text: 'עוֹלָם', ruled: true, reading: 'olam' },
                    ],
                  }
                : null,
            },
      openWord: (code: string, lex: string) => {
        log.push(`card ${code} ${lex}`);
      },
      sortDrill: (field: string): SortDrill | null =>
        field === 'veg'
          ? {
              field: { id: 'veg', title: 'Vegetables' },
              lang: lang('de'),
              rail: null,
              groups: [
                { id: 'root', title: 'Roots', emoji: '🥕' },
                { id: 'leafy', title: 'Leaves', emoji: '🥬' },
              ],
              pool: ['a', 'b', 'c', 'd'].map((x, i) => ({
                id: 'de.' + x,
                cid: 'c.' + x,
                group: i % 2 ? 'leafy' : 'root',
                lemma: x,
                gloss: x,
              })),
            }
          : null,
      sortRecord: (code: string, res: readonly { id: string; ok: boolean }[]) => {
        log.push(`sorted ${code} ${res.filter(x => x.ok).length}/${res.length}`);
      },
      partsDrill: () => null,
      partsRecord: () => undefined,
      setLang: () => undefined,
      peculiar: () => null,
      setPeculiarFilter: () => undefined,
      back: () => undefined,
      inFrame: () => false,
      hint: (t: string) => document.createTextNode(t),
      fold: (x: string) => x.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(),
      aspect: (code: string, aspect: string): AspectPage | null =>
        aspect === 'nope'
          ? null
          : {
              lang: lang(code),
              aspect,
              grammar:
                aspect === 'grammar'
                  ? {
                      forms: [{ tag: 'Number', fns: [{ id: 'fn.plural', title: 'Plural' }] }],
                      sentences: [{ level: 'A1', fns: [{ id: 'fn.order', title: 'Order' }] }],
                    }
                  : null,
              points: [],
              views: aspect === 'writing' ? ['script', 'write'] : [],
              parts:
                aspect === 'use'
                  ? [
                      {
                        key: 'registers',
                        facets: [
                          {
                            facet: 'reg',
                            values: [
                              { v: 'formal', label: 'formal' },
                              { v: 'slang', label: 'slang' },
                            ],
                          },
                        ],
                        entries: [
                          {
                            lex: 'he.a',
                            lemma: 'אֶרֶץ',
                            href: '#/w/he/he.a',
                            hay: 'ארץ erets ḥ',
                            meta: { reg: ['formal'] },
                            kind: 'use',
                            gloss: 'land',
                            badges: [{ cls: 'reg', text: 'formal' }],
                          },
                          {
                            lex: 'he.b',
                            lemma: 'סַבַּבָּה',
                            href: '#/w/he/he.b',
                            hay: 'סבבה sababa',
                            meta: { reg: ['slang'] },
                            kind: 'use',
                            gloss: 'cool',
                            badges: [],
                          },
                        ],
                      },
                    ]
                  : [],
            },
    };
    return P;
  }
  test('a foreign word: its reading under it, its words opening their cards, plain inside a control; Aa·', async () => {
    const C = coursePort(),
      host = mount();
    const w = document.createElement('noema-lang-word');
    Object.assign(w, { port: C, code: 'he', text: 'שָׁלוֹם עוֹלָם' });
    w.append('שָׁלוֹם עוֹלָם');
    host.append(w);
    await settle(host);
    const run = host.querySelector<HTMLElement>('.lx-w.lx-run');
    assert.ok(run && run.getAttribute('dir') === 'rtl' && run.lang === 'he', 'the run in its language and direction');
    assert.ok(
      w.children.length === 1 && ![...w.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim()),
      'the plain text it held is gone',
    );
    const tok = host.querySelector<HTMLElement>('ruby.lx-rw.lx-tok.lx-newword');
    assert.ok(tok && tok.getAttribute('role') === 'button' && tok.tabIndex === 0, 'a word of the course: a button, new to the learner');
    assert.equal(tok.querySelector('rt.lx-help')?.textContent, 'shalom');
    assert.ok(host.querySelector('ruby.lx-ru:not(.lx-tok)'), 'a word read by rule: its reading, no card');
    tok.click();
    tok.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(C.log, ['card he he.shalom', 'card he he.shalom']);
    // inside a button: shown whole; with its word: the reading under it
    const b = document.createElement('button'),
      w2 = document.createElement('noema-lang-word');
    Object.assign(w2, { port: C, code: 'he', text: 'שָׁלוֹם', lex: 'he.shalom' });
    b.append(w2);
    host.append(b);
    await settle(host);
    assert.ok(b.querySelector('.lx-wbox > .lx-w:not(.lx-run)') && b.querySelector('.lx-wbox > .lx-help')?.textContent === 'shalom');
    assert.equal(b.querySelectorAll('.lx-tok').length, 0);
    // inside prose: the reading in [brackets]
    const p = document.createElement('p'),
      w3 = document.createElement('noema-lang-word');
    Object.assign(w3, { port: C, code: 'he', text: 'שָׁלוֹם' });
    p.append('It means ', w3);
    host.append(p);
    await settle(host);
    assert.equal(p.querySelector('.lx-rw .lx-br')?.textContent, ' [shalom]');
    const aa = document.createElement('noema-lang-translit');
    aa.port = C;
    host.append(aa);
    await settle(host);
    await click(host, 'noema-lang-translit .lx-translit');
    assert.equal(host.querySelector('noema-lang-translit .lx-translit')?.getAttribute('aria-pressed'), 'false');
    assert.equal(C.log.at(-1), 'translit false');
  });
  test('an aspect page: grammar folded by feature and level, a profile part with its filter (plain Latin matches) and chips', async () => {
    const C = coursePort(),
      host = mount();
    const g = document.createElement('noema-lang-aspect');
    Object.assign(g, { port: C, code: 'he', aspect: 'grammar' });
    host.append(g);
    await settle(host);
    assert.ok(host.querySelector('[data-aspect="grammar"]'));
    assert.equal(host.querySelectorAll('.lx-aspfold').length, 2);
    await click(host, '.lx-lhtile');
    assert.equal(C.log.at(-1), 'go #/fn/fn.plural/he');
    host.replaceChildren();
    const u = document.createElement('noema-lang-aspect');
    Object.assign(u, { port: C, code: 'he', aspect: 'use' });
    host.append(u);
    await settle(host);
    const part = host.querySelector<HTMLDetailsElement>('.lx-aspart[data-part="registers"]');
    assert.ok(part?.open, 'one part: open');
    assert.equal(host.querySelectorAll('.lx-aspentry').length, 2);
    const inp = host.querySelector<HTMLInputElement>('.lx-aspart input');
    assert.ok(inp);
    inp.value = 'Erets';
    inp.dispatchEvent(new Event('input'));
    await settle(host);
    assert.equal(host.querySelectorAll('.lx-aspentry').length, 1, 'plain Latin finds the word');
    inp.value = '';
    inp.dispatchEvent(new Event('input'));
    await settle(host);
    await click(host, '.lx-facet .lx-chip[data-v="slang"]');
    assert.equal(host.querySelectorAll('.lx-aspentry').length, 1, 'a chip keeps its register');
    assert.equal(host.querySelector('.lx-chip[data-v="slang"]')?.getAttribute('aria-pressed'), 'true');
    assert.ok(host.querySelector('.lx-aspword noema-lang-word'), 'the word in its own element');
  });
  test('🧩 sorting: a word, then its group; a wrong group shakes and counts; the last one records the drill', async () => {
    const C = coursePort(),
      host = mount();
    const e = document.createElement('noema-lang-sort');
    Object.assign(e, { port: C, field: 'veg' });
    host.append(e);
    await settle(host);
    assert.equal(host.querySelectorAll('.lx-sortchip').length, 4);
    await click(host, '.lx-sortchip[data-id="de.a"]');
    await click(host, '.lx-sortbin[data-group="leafy"]');
    assert.ok(host.querySelector('.lx-sortbin.lx-shake'), 'a wrong group shakes');
    for (const [id, g] of [
      ['de.a', 'root'],
      ['de.b', 'leafy'],
      ['de.c', 'root'],
      ['de.d', 'leafy'],
    ] as const) {
      await click(host, `.lx-sortchip[data-id="${id}"]`);
      await click(host, `.lx-sortbin[data-group="${g}"]`);
    }
    assert.equal(host.querySelectorAll('.lx-sortchip').length, 0);
    assert.equal(host.querySelectorAll('.lx-sortin').length, 4);
    assert.ok(host.querySelector('.lx-sortdone'));
    assert.equal(C.log.at(-1), 'sorted de 3/4');
  });
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
  test('a lesson: the four-step ladder (done, now, later), Continue for the languages that can, Deepen, Aa·', async () => {
    const C = coursePort(),
      host = mount();
    mountArea5Part('lang-lesson', host, { ...ports(fakePort([])), course: () => C }, { node: 'fd.01' });
    await settle(host);
    assert.deepEqual(
      [...host.querySelectorAll<HTMLElement>('.lx-ladder li')].map(li => `${li.dataset['step'] ?? ''}:${li.className}`),
      ['wl:done', 'wp:now', 'tr:later', 'tp:later'],
    );
    assert.equal(host.querySelectorAll('.lx-ns').length, 2);
    assert.equal(host.querySelector<HTMLElement>('.lx-continue')?.dataset['step'], 'wp');
    await click(host, '.lx-continue');
    await click(host, '.lx-deepenbtn');
    assert.equal(host.querySelector('.lx-translit')?.getAttribute('aria-pressed'), 'true');
    await click(host, '.lx-translit');
    assert.equal(host.querySelector('.lx-translit')?.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(C.log, ['continue fd.01 de', 'go #/deepen/fd.01/de', 'translit false']);
    const none = mount();
    mountArea5Part('lang-lesson', none, { ...ports(fakePort([])), course: () => C }, { node: 'nope' });
    await settle(none);
    assert.equal(none.querySelector('h1'), null, 'not a lesson: nothing');
    C.frame = true;
    const fr = mount();
    mountArea5Part('lang-lesson', fr, { ...ports(fakePort([])), course: () => C }, { node: 'fd.01' });
    await settle(fr);
    assert.ok(fr.querySelector('.lx-continue') && fr.querySelector('.lx-ladder'), 'in the frame: the ladder and Continue');
    assert.equal(fr.querySelectorAll('.lx-ns, .lx-deepenbtn, .lx-translit').length, 0, 'the rest waits in the frame’s ⋮');
    assert.ok(!fr.querySelector('.lx-continue')?.textContent.includes('▶'), 'no pictographs in the frame');
  });
});
