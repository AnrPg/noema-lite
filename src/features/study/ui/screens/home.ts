/**
 * The subject's page (#/subject): where the learner is (a Roadmap's step, the bar), Continue, Practice ▾, what is new,
 * and the chapters as cards or as a list; its ⋮ holds the search, the sources, the knowledge map, the reported
 * exercises, the focus sprint, what the other areas add, and the reset.
 */
import { sectionText } from '../../domain/as-text.ts';
import type { StudyApp } from '../app.ts';
import { h } from '../dom.ts';
import type { MenuEntry, MenuItem } from '../host.ts';
import { knowledgeMap, reportedView } from '../kmap.ts';
import { setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { animateRings, practiceButton, view } from '../view.ts';

/** 🎯 Practice ▾: every way to practise the whole subject */
export function practiceItems(app: StudyApp): (MenuEntry | null)[] {
  if (app.lock) {
    const list = app.lock.missing.join(', ') || '…';
    return [
      {
        label: app.L('exercisesWord'),
        sub: app.L('exLocked', { list }),
        icon: '🔒',
        run: () => {
          app.toast(`🔒 ${app.L('lockedPreview')}`, 4000);
        },
      },
    ];
  }
  const dueFc = app.dueCards(),
    duePb = app.dueDrills(),
    wrong = app.mistakes().length;
  const who = app.host.frame.character();
  return [
    { label: app.t('home.mixed'), sub: app.t('home.mixedSub'), icon: '🎲', href: '#/practice/all' },
    {
      label: app.t('home.cards'),
      sub: app.t('home.cardsSub'),
      icon: '🃏',
      href: '#/cards',
      badge: dueFc ? app.t('home.due', { n: dueFc }) : null,
      tone: 4,
    },
    app.course.chapters.some(c => c.debug.length)
      ? {
          label: app.t('home.drills'),
          sub: app.t('home.drillsSub'),
          icon: '🔧',
          href: '#/drills',
          badge: duePb ? app.t('home.due', { n: duePb }) : null,
          tone: 4,
        }
      : null,
    {
      label: app.t('home.mistakes'),
      sub: app.t('home.mistakesSub'),
      icon: '🔁',
      href: '#/mistakes',
      badge: wrong ? app.nf(wrong) : null,
      tone: 3,
    },
    { label: app.t('home.lightning'), sub: app.t('home.lightningSub'), icon: '⚡', href: '#/lightning' },
    '-',
    {
      label: app.L('askTutor'),
      sub: app.L(who.plural ? 'askTutorSubPl' : 'askTutorSub'),
      icon: who.avatar,
      run: () => {
        app.tutor.open(null, 'socratic', null, { intent: app.tutor.intent('course') });
      },
    },
  ];
}

/** ⋮ of the subject: everything that is not studying itself */
export function subjectMenu(app: StudyApp): () => (MenuEntry | null)[] {
  return () => [
    {
      label: app.L('searchSubject'),
      icon: 'search',
      run: () => {
        openSearch(app);
      },
    },
    app.newSources().length ? { label: app.t('view.whatsNew'), icon: 'spark', href: '#/new' } : null,
    {
      label: app.L('sources'),
      sub: app.L('sourcesSub'),
      icon: 'book',
      run: () => {
        app.sourcesUi.toggleDeck();
      },
    },
    app.course.chapters.some(c => c.map?.learnables?.length)
      ? {
          label: app.t('engine.kmap.title'),
          sub: app.t('engine.kmap.menuSub'),
          icon: 'map',
          run: () => {
            knowledgeMap(app);
          },
        }
      : null,
    Object.keys(app.state.flags ?? {}).length
      ? {
          label: app.t('engine.flags.menu', { n: Object.keys(app.state.flags ?? {}).length }),
          icon: 'help',
          run: () => {
            reportedView(app);
          },
        }
      : null,
    sprintEntry(app),
    '-',
    ...app.host.subjectActions.menu(),
    '-',
    {
      label: app.L('resetProgress', { title: app.host.subject.title }),
      icon: 'close',
      danger: true,
      run: () => {
        resetProgress(app);
      },
    },
  ];
}

/** ⏱️ the focus sprint's ⋮ entry */
export const sprintEntry = (app: StudyApp): MenuItem => ({
  label: app.sprintLeft !== null ? app.L('focusStop') : app.L('focusSprint'),
  sub: app.L('focusSprintSub'),
  icon: 'clock',
  run: () => {
    app.toggleSprint();
  },
});

/** Starts the subject again: a restore point first, then every answer, card and read mark is gone (its settings stay). */
export function resetProgress(app: StudyApp): void {
  const title = app.host.subject.title;
  void app.host.frame.confirm(app.t('engine.home.resetConfirm', { title })).then(async yes => {
    if (!yes) return;
    await app.host.restorePoint(app.t('engine.home.resetPoint', { title }));
    app.host.learn('subject.reset', null);
    app.host.flush();
    app.rerender();
  });
}

/** 🔎 jump to any concept of the subject */
export function openSearch(app: StudyApp): void {
  const results = h('div', { class: 'results' });
  const ex = app.host.subject.searchExamples;
  const inp = h('input', {
    class: 'noema-input',
    placeholder: `${app.L('searchConcept')}${ex ? ` (${ex})` : ''}`,
    'aria-label': app.L('searchSubject'),
    oninput: () => {
      searchSections(app, inp.value, results);
    },
  });
  const fill = (body: HTMLElement, close: () => void): void => {
    body.append(h('div', { class: 'search' }, h('span', { class: 'si' }, '🔎'), inp), results);
    results.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.closest('.result')) close();
    });
    setTimeout(() => {
      inp.focus();
    }, 50);
  };
  app.host.frame.sheet(app.L('searchSubject'), fill);
}

let searchIndex: { readonly course: unknown; readonly items: { id: string; title: string; body: string; text: string }[] } | null = null;
function searchSections(app: StudyApp, q0: string, box: HTMLElement): void {
  box.replaceChildren();
  const q = q0.trim().toLowerCase();
  if (q.length < 2) return;
  if (searchIndex?.course !== app.course)
    searchIndex = {
      course: app.course,
      items: app.course.chapters.flatMap(c =>
        c.sections.map(s => {
          const text = sectionText(s, app.host.media, b => app.host.activities.asText(b));
          return { id: s.id, title: s.title.toLowerCase(), body: text.toLowerCase(), text };
        }),
      ),
    };
  const words = q.split(/\s+/);
  const res = searchIndex.items
    .map(x => {
      let sc = 0;
      for (const w of words) {
        if (x.title.includes(w)) sc += 10;
        const n = x.body.split(w).length - 1;
        if (!n) return null;
        sc += Math.min(n, 8);
      }
      return { ...x, sc };
    })
    .filter(x => x !== null)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 7);
  if (!res.length) {
    const who = app.host.frame.character();
    box.append(h('div', { class: 'tiny' }, app.t('engine.search.none', { tutor: who.name, avatar: who.avatar })));
    return;
  }
  res.forEach((r, i) => {
    const s = app.course.section(r.id);
    const c = s && app.course.chapterOf(s);
    if (!s || !c) return;
    const pos = r.body.indexOf(words[0] ?? '');
    const snip = r.text.slice(Math.max(0, pos - 50), pos + 90).replace(/\s+/g, ' ');
    box.append(
      h(
        'button',
        {
          class: 'result',
          type: 'button',
          style: { animationDelay: `${String(i * 30)}ms` },
          onclick: () => {
            app.go(`#/s/${s.id}`);
          },
        },
        h('b', {}, `${c.emoji ?? ''} ${s.title}`),
        h('small', {}, app.chTitle(c.num, `…${snip}…`)),
      ),
    );
  });
}

const CHVIEW_KEY = 'noema-chview';
/** the learner's choice of list or cards (a device preference; a private window keeps it for this page only) */
function rememberView(k: 'list' | 'cards'): boolean {
  try {
    localStorage.setItem(CHVIEW_KEY, k);
    return true;
  } catch {
    return false;
  }
}
function chapterViewStyle(): 'list' | 'cards' {
  try {
    return localStorage.getItem(CHVIEW_KEY) === 'list' ? 'list' : 'cards'; // cards unless the learner chose the list
  } catch {
    return 'cards';
  }
}

/** a chapter's "new" corner (a new source's chapter, or new content in it) */
export function newBadge(
  app: StudyApp,
  x: { readonly isNew?: boolean; readonly newWhole?: boolean },
  chapter: boolean,
): HTMLElement | null {
  if (!x.isNew) return null;
  if (chapter)
    return h('span', { class: 'newpill corner' }, `✨ ${x.newWhole ? app.t('engine.src.newChapter') : app.t('engine.src.newContent')}`);
  return h('span', { class: 'newpill' }, `✨ ${app.t('engine.src.new')}`);
}

export function homeView(app: StudyApp): void {
  app.tutor.setContext(null);
  setAccent(document.body, null);
  app.host.frame.chrome({ crumbs: [], corner: true, menu: subjectMenu(app) });
  app.host.frame.noteRecent({});
  const S = app.state,
    subj = app.host.subject;
  const p = app.courseProgress();
  const last = S.last ? app.course.section(S.last) : undefined;
  const first = app.course.chapters[0]?.sections[0];
  const nSec = app.course.chapters.reduce((a, c) => a + c.sections.length, 0);
  const body = h('div', { class: 'chbox' });
  let style = chapterViewStyle();
  const segBtns = (['list', 'cards'] as const).map(k =>
    h(
      'button',
      {
        type: 'button',
        'data-v': k,
        class: style === k ? 'on' : '',
        role: 'radio',
        'aria-checked': String(style === k),
        onclick: () => {
          style = k;
          rememberView(k);
          for (const b of segBtns) {
            b.classList.toggle('on', b.dataset['v'] === k);
            b.setAttribute('aria-checked', String(b.dataset['v'] === k));
          }
          draw();
        },
      },
      k === 'list' ? app.L('viewList') : app.L('viewCards'),
    ),
  );
  const seg = h('div', { class: 'ns-seg small chviewseg', role: 'radiogroup', 'aria-label': app.L('chView') }, segBtns);
  const st = app.station();
  const pr = { r: Math.round(p.sr * 100), e: Math.round(p.ex * 100) };
  const mantra = subj.hero?.mantra ?? subj.description;
  const titleEl = h('h1', { class: 'herohead' }, subj.title, ...app.host.frame.subjectTags());
  const mantraEl = mantra ? h('p', { class: 'mantra', html: fmt(mantra) }) : null;
  // one plain header (a step of which Roadmap · the title · one line · one bar)
  const top = [
    st
      ? h(
          'button',
          {
            class: 'ns-kicker subjkicker',
            type: 'button',
            title: app.L('openMap'),
            onclick: () => {
              app.host.roadmap.openMap();
            },
          },
          app.L('stationOf', { title: st.title }),
          ' ›',
        )
      : null,
    titleEl,
    mantraEl,
  ];
  const barW = st ? Math.round(Math.min(st.read, st.solved / st.pass) * 100) : Math.round((p.sr + p.ex) * 50);
  const barTip = st
    ? st.done
      ? app.L('stationDone')
      : app.L('stationMastery', { ...pr, p: Math.round(st.pass * 100) })
    : app.L('subjProgress', pr);
  const go = (href: string) => () => {
    app.go(href);
  };
  const v = view(
    app,
    h(
      'section',
      { class: `subjhead${st ? ' station' : ''}` },
      ...top,
      h(
        'div',
        { class: 'subjbar', title: barTip },
        h('div', { class: 'bar' }, h('i', { style: { width: `${String(barW)}%` } })),
        h('span', { class: 'tiny' }, st?.done ? `✓ ${app.L('stationMastered')}` : app.L('subjProgress', pr)),
      ),
      h(
        'div',
        { class: 'row subjgo' },
        last
          ? h(
              'button',
              { class: 'btn primary', type: 'button', onclick: go(`#/s/${last.id}`) },
              app.L('continueSec', { title: last.title }),
            )
          : first
            ? h('button', { class: 'btn primary', type: 'button', onclick: go(`#/s/${first.id}`) }, app.L('startCh1'))
            : null,
        practiceButton(app, practiceItems(app)),
        app.sourcesUi.whatsNewButton(),
      ),
    ),
    h(
      'div',
      { class: 'row chlisthead' },
      h('h2', { class: 'grow' }, app.t('home.chapters')),
      h('span', { class: 'tiny hide-s' }, app.L('subjCounts', { c: app.course.chapters.length, s: nSec, e: app.course.exercises.length })),
      seg,
    ),
    body,
  );
  function draw(): void {
    body.replaceChildren();
    if (style === 'cards') {
      body.append(
        h(
          'div',
          { class: 'chapters' },
          app.course.chapters.map((c, i) => {
            const cp = app.progress(c);
            const card = h(
              'button',
              { class: 'chcard', type: 'button', style: { animationDelay: `${String(i * 40)}ms` }, onclick: go(`#/ch/${c.id}`) },
              newBadge(app, c, true),
              h('div', { class: 'emo' }, c.emoji ?? ''),
              h('div', { class: 'num' }, `${app.L('chapterN', { n: c.num })}${S.boss[c.id] ? ' · 🏆' : ''}`),
              h('h3', {}, c.title),
              h('p', {}, c.subtitle ?? ''),
              h(
                'div',
                { class: 'bars' },
                h('div', { class: 'barlbl' }, h('span', {}, `📖 ${app.L('theory')}`), h('span', {}, app.pct(Math.round(cp.sr * 100)))),
                h('div', { class: 'bar' }, h('i', { style: { width: '0%' }, 'data-w': `${String(cp.sr * 100)}%` })),
                h('div', { class: 'barlbl' }, h('span', {}, `🎯 ${app.L('practice')}`), h('span', {}, app.pct(Math.round(cp.ex * 100)))),
                h('div', { class: 'bar alt' }, h('i', { style: { width: '0%' }, 'data-w': `${String(cp.ex * 100)}%` })),
              ),
            );
            setAccent(card, c);
            return card;
          }),
        ),
      );
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          for (const i of body.querySelectorAll<HTMLElement>('.bar>i[data-w]')) i.style.width = i.dataset['w'] ?? '';
        }),
      );
    } else {
      body.append(
        h(
          'div',
          { class: 'chlist' },
          app.course.chapters.map((c, i) => {
            const cp = app.progress(c),
              pct = Math.round((cp.sr + cp.ex) * 50);
            const row = h(
              'button',
              {
                class: `chrow${pct >= 100 ? ' done' : ''}`,
                type: 'button',
                style: { animationDelay: `${String(i * 25)}ms` },
                onclick: go(`#/ch/${c.id}`),
              },
              h('span', { class: 'emo' }, c.emoji ?? ''),
              h(
                'span',
                { class: 'grow' },
                h('small', {}, app.L('chapterN', { n: c.num }), S.boss[c.id] ? ' · 🏆' : ''),
                h('b', {}, c.title),
                c.subtitle ? h('small', { class: 'sub' }, c.subtitle) : null,
              ),
              newBadge(app, c, true),
              h(
                'span',
                { class: 'chpct' },
                h('span', { class: 'minibar' }, h('i', { style: { width: `${String(pct)}%` } })),
                h('small', {}, app.pct(pct)),
              ),
            );
            setAccent(row, c);
            return row;
          }),
        ),
      );
    }
  }
  draw();
  animateRings(v);
}
