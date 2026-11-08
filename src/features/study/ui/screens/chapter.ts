/**
 * A chapter (#/ch/<id>[/<tab>[/<focus>]]): Theory (its sections as a path), Practice (every way to practise it, the
 * round's filters with "only my level", its cards and drills) and Traps. The old Cards and Debug-drill tabs live inside
 * Practice; their addresses still work.
 */
import type { Chapter, Exercise } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { h } from '../dom.ts';
import type { MenuEntry } from '../host.ts';
import { knowledgeMap } from '../kmap.ts';
import { F, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { typeLabel } from '../exercise/card.ts';
import { flashDeck, drillList } from './cards.ts';
import { newBadge, openSearch, sprintEntry } from './home.ts';
import { animateRings, backBtn, choiceList, lockNote, ring, showHit, view } from '../view.ts';

const chSocratic = (app: StudyApp, c: Chapter): void => {
  app.tutor.open({ kind: 'chapter', id: c.id, origin: { via: 'chapterSocratic', ch: c.id } }, 'socratic', null, {
    intent: app.tutor.intent('chSocratic'),
  });
};

function chapterMenu(app: StudyApp, c: Chapter): () => (MenuEntry | null)[] {
  const who = app.host.frame.character();
  return () => [
    {
      label: app.L('chSocratic'),
      sub: app.L('chSocraticSub'),
      icon: who.avatar,
      run: () => {
        chSocratic(app, c);
      },
    },
    {
      label: app.L('searchSubject'),
      icon: 'search',
      run: () => {
        openSearch(app);
      },
    },
    {
      label: app.L('sources'),
      sub: app.L('sourcesSub'),
      icon: 'book',
      run: () => {
        app.sourcesUi.toggleDeck();
      },
    },
    c.map?.learnables?.length
      ? {
          label: app.t('engine.kmap.title'),
          sub: app.t('engine.kmap.menuSub'),
          icon: 'map',
          run: () => {
            knowledgeMap(app, c.id);
          },
        }
      : null,
    sprintEntry(app),
    '-',
    { label: app.L('allChapters'), icon: 'list', href: '#/subject' },
  ];
}

/** → the next chapter; after the last one, the next step of the Roadmap this subject teaches (on its map) */
function nextAfterChapter(app: StudyApp, c: Chapter): HTMLElement | null {
  const all = app.course.chapters;
  const nx = all[all.findIndex(x => x.id === c.id) + 1];
  const btn = (title: string, label: string, href: string): HTMLElement =>
    h(
      'button',
      {
        class: 'btn nextch',
        type: 'button',
        title,
        onclick: () => {
          app.go(href);
        },
      },
      `${label} ${app.arrowOn}`,
    );
  if (nx) return btn(nx.title, app.L('nextChapterBtn', { title: nx.title }), `#/ch/${nx.id}`);
  const step = app.host.roadmap.nextStep();
  return step ? btn(step.title, app.L('nextStepBtn', { title: step.title }), step.href) : null;
}

export function chapterView(app: StudyApp, id: string, tab0?: string, focus?: string): void {
  const c = app.course.chapter(id);
  if (!c) {
    app.go('#/subject');
    return;
  }
  setAccent(document.body, c);
  app.tutor.setContext({ kind: 'chapter', id });
  const tab = tab0 ?? app.chapterTab.get(id) ?? 'learn';
  app.chapterTab.set(id, tab);
  const on = ['debug', 'cards', 'filters'].includes(tab) ? 'practice' : ['learn', 'practice', 'traps'].includes(tab) ? tab : 'learn';
  app.host.frame.chrome({
    sub: true,
    crumbs: [[`${c.emoji ?? ''} ${c.title}`]],
    back: '#/subject',
    corner: true,
    menu: chapterMenu(app, c),
  });
  app.host.frame.noteRecent({ chNum: c.num, chOf: app.course.chapters.length });
  const p = app.progress(c);
  const tabs = [
    ['learn', app.t('ch.learn'), c.sections.length],
    ['practice', app.t('ch.practice'), c.exercises.length],
    ['traps', app.t('ch.traps'), c.pitfalls.length],
  ] as const;
  const body = h('div');
  const full = app.course.full.find(x => x.id === c.id) ?? null;
  const v = view(
    app,
    backBtn(app, app.t('ch.all'), '#/subject'),
    h(
      'div',
      { class: 'chhead' },
      h('div', { class: 'emo' }, c.emoji ?? ''),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'num' }, app.L('chOf', { n: c.num, of: app.course.chapters.length })),
        h('h1', {}, c.title),
        c.subtitle ? h('p', { class: 'muted', style: { margin: '6px 0 0' } }, c.subtitle) : null,
        full ? app.sourcesUi.chips(full) : null,
        c.map?.learnables?.length
          ? h(
              'button',
              {
                class: 'kmapbtn',
                type: 'button',
                onclick: () => {
                  knowledgeMap(app, c.id);
                },
              },
              `ⓘ ${app.t('engine.kmap.chip', { n: c.map.learnables.length })}`,
            )
          : null,
      ),
      h(
        'div',
        { class: 'chring' },
        ring((p.sr + p.ex) / 2, 76, 9),
        h('div', { class: 'chringc' }, app.pct(Math.round((p.sr + p.ex) * 50))),
      ),
    ),
    c.mantra
      ? app.tutor.explainable(h('div', { class: 'mantrabox' }, h('span', {}, '🧭'), h('span', { html: fmt(c.mantra) })), () => ({
          label: c.mantra ?? '',
          text: `The mental model of chapter ${String(c.num)} "${c.title}": ${c.mantra ?? ''}`, // for the AI (English)
          ch: c,
          what: 'mental model',
        }))
      : null,
    h(
      'div',
      { class: 'tabs', role: 'tablist' },
      tabs.map(([k, l, n]) =>
        h(
          'button',
          {
            class: on === k ? 'on' : '',
            type: 'button',
            role: 'tab',
            'aria-selected': String(on === k),
            onclick: () => {
              app.go(`#/ch/${id}/${k}`);
            },
          },
          l,
          h('span', { class: 'n' }, app.nf(n)),
        ),
      ),
    ),
    body,
  );
  animateRings(v);
  const S = app.state;
  const go = (href: string) => () => {
    app.go(href);
  };
  if (on === 'learn') {
    const nextSec = c.sections.find(s => !S.read[s.id]);
    const who = app.host.frame.character();
    body.append(
      h(
        'details',
        { class: 'obj' },
        h('summary', {}, `🎯 ${app.L('objectives')} ▸`),
        h(
          'ul',
          {},
          c.objectives.map(o => h('li', { html: fmt(o) })),
        ),
      ),
      h(
        'div',
        { class: 'path' },
        c.sections.map((s, i) => {
          const nEx = c.exercises.filter(e => e.section === s.id),
            nOk = nEx.filter(e => app.solved(e.id)).length;
          return h(
            'button',
            {
              class: `node${S.read[s.id] ? ' done' : ''}`,
              type: 'button',
              style: { animationDelay: `${String(i * 35)}ms` },
              onclick: go(`#/s/${s.id}`),
            },
            h('div', { class: 'dot' }, S.read[s.id] ? '✓' : app.nf(i + 1)),
            h('div', { class: 'grow' }, h('b', {}, s.title), h('small', {}, s.hook ?? '')),
            h(
              'div',
              { class: 'meta' },
              newBadge(app, s, false),
              h('span', { class: `pill${nOk === nEx.length && nEx.length ? ' c' : ''}` }, `🎯 ${app.nf(nOk)}/${app.nf(nEx.length)}`),
            ),
          );
        }),
      ),
      h(
        'div',
        { class: 'row', style: { marginTop: '22px' } },
        nextSec
          ? h(
              'button',
              { class: 'btn primary', type: 'button', onclick: go(`#/s/${nextSec.id}`) },
              c.sections[0] && S.read[c.sections[0].id] ? app.L('continueSec', { title: nextSec.title }) : app.L('startReading'),
            )
          : h('button', { class: 'btn primary', type: 'button', onclick: go(`#/ch/${id}/practice`) }, `🎯 ${app.L('practiceChapter')}`),
        nextAfterChapter(app, c),
        h(
          'button',
          {
            class: 'btn ghost',
            type: 'button',
            onclick: () => {
              chSocratic(app, c);
            },
          },
          `${who.avatar} ${app.L('chSocratic')}`,
        ),
      ),
    );
  } else if (on === 'practice') {
    if (app.lock) body.append(lockNote(app));
    else if (tab === 'practice') body.append(chapterPractice(app, c));
    else {
      body.append(h('button', { class: 'linkish subback', type: 'button', onclick: go(`#/ch/${id}/practice`) }, `‹ ${app.L('allWays')}`));
      if (tab === 'debug') drillList(app, body, c.debug);
      else if (tab === 'cards') flashDeck(app, body, app.cards([c]));
      else practiceSetup(app, body, c);
    }
  } else {
    const traps = c.exercises.filter(e => e.tags.some(t => ['pitfall', 'exam'].includes(t))),
      tf = c.exercises.filter(e => e.type === 'tf');
    body.append(
      h('p', { class: 'muted' }, app.L('trapsIntro')),
      h(
        'div',
        { class: 'row', style: { marginBottom: '14px' } },
        traps.length
          ? h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  app.startRound(traps, { title: `⚠️ ${app.L('trapDrill')} · ${app.chShort(c.num)}`, count: 12, back: `#/ch/${id}/traps` });
                },
              },
              `⚠️ ${app.L('trapsNoTimer')}`,
            )
          : null,
        tf.length >= 3
          ? h('button', { class: 'btn', type: 'button', onclick: go(`#/lightning/${id}`) }, `⚡ ${app.L('trapsTimed')}`)
          : null,
      ),
      h(
        'div',
        { style: { display: 'grid', gap: '10px' } },
        c.pitfalls.map((p, i) =>
          app.tutor.explainable(
            h(
              'div',
              { class: 'callout pitfall', 'data-pid': app.host.trapId(p), style: { animation: `slideIn .4s ${String(i * 30)}ms both` } },
              h('span', { class: 'ci' }, '⚠️'),
              h('b', { class: 't', html: fmt(p.title) }),
              h('div', { html: fmt(p.text) }),
              p.fix ? h('div', { style: { marginTop: '6px' }, html: `✅ ${app.t('engine.ch.fixHtml', { fix: fmt(p.fix) })}` }) : null,
            ),
            () => ({ label: p.title, text: `${p.title}: ${p.text}${p.fix ? ` — Fix: ${p.fix}` : ''}`, ch: c, what: 'trap' }),
          ),
        ),
      ),
    );
    if (focus) showHit(body.querySelector(`[data-pid="${CSS.escape(focus)}"]`));
  }
}

/** the Practice tab: every way to practise this chapter */
function chapterPractice(app: StudyApp, c: Chapter): HTMLElement {
  const id = c.id,
    ok = c.exercises.filter(e => app.solved(e.id)).length,
    wrong = c.exercises.filter(e => app.state.res[e.id]?.last === false);
  const dueC = app.dueCards([c]);
  const dueD = c.debug.filter(d => app.drillDue(d)).length;
  const who = app.host.frame.character();
  const S = app.state;
  return choiceList(app, [
    c.exercises.length
      ? {
          label: app.L('round10'),
          sub: app.L('solvedOf', { n: ok, of: c.exercises.length }),
          icon: '🎯',
          cls: 'main',
          run: () => {
            app.startRound(c.exercises, { title: `🎯 ${app.chTitle(c.num, c.title)}`, count: 10, back: `#/ch/${id}/practice` });
          },
        }
      : null,
    c.exercises.length ? { label: app.L('chooseRound'), sub: app.L('chooseRoundSub'), icon: '🎛️', href: `#/ch/${id}/filters` } : null,
    c.flashcards.length
      ? {
          label: app.t('home.cards'),
          sub: app.t('home.cardsSub'),
          icon: '🃏',
          href: `#/ch/${id}/cards`,
          badge: dueC ? app.t('home.due', { n: dueC }) : app.nf(c.flashcards.length),
        }
      : null,
    c.debug.length
      ? {
          label: app.t('home.drills'),
          sub: app.t('home.drillsSub'),
          icon: '🔧',
          href: `#/ch/${id}/debug`,
          badge: dueD ? app.t('home.due', { n: dueD }) : app.nf(c.debug.length),
        }
      : null,
    wrong.length
      ? {
          label: app.t('home.mistakes'),
          sub: app.t('home.mistakesSub'),
          icon: '🔁',
          badge: app.nf(wrong.length),
          run: () => {
            app.startRound(wrong, {
              title: `🔁 ${app.t('engine.run.chMistakes', { num: c.num })}`,
              count: wrong.length,
              back: `#/ch/${id}/practice`,
            });
          },
        }
      : null,
    c.exercises.length
      ? {
          label: S.boss[id] ? app.L('bossBeaten') : app.L('boss'),
          sub: app.L('bossSub'),
          icon: S.boss[id] ? '🏆' : '👾',
          href: `#/boss/${id}`,
        }
      : null,
    {
      label: app.L('chSocratic'),
      sub: app.L('chSocraticSub'),
      icon: who.avatar,
      run: () => {
        chSocratic(app, c);
      },
    },
  ]);
}

/** "Only my level": the learner's choice, offered when the subject has a level ladder with content at several levels */
export function myLevelChip(app: StudyApp, onChange: () => void): HTMLElement | null {
  const me = app.myLevel();
  if (!me || !app.offersLevelFilter()) return null;
  const b = h(
    'button',
    {
      class: `fchip mylevel${app.onlyMyLevel ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': String(app.onlyMyLevel),
      title: app.t('ui.study.myLevelTip'),
      onclick: () => {
        app.onlyMyLevel = !app.onlyMyLevel;
        b.classList.toggle('on', app.onlyMyLevel);
        b.setAttribute('aria-pressed', String(app.onlyMyLevel));
        onChange();
      },
    },
    `🎚️ ${app.t('ui.study.onlyMyLevel', { level: me.name })}`,
  );
  return h('div', { class: 'fchips' }, b);
}

/** the round's filters: section, types, focus, difficulty, size, and the learner's level */
function practiceSetup(app: StudyApp, body: HTMLElement, c: Chapter): void {
  const st = { sec: 'all', types: new Set<string>(), tags: new Set<string>(), diff: 0, count: 10 };
  const info = h('span', { class: 'tiny' });
  const pool = (): Exercise[] => {
    const p = c.exercises.filter(
      e =>
        (st.sec === 'all' || e.section === st.sec) &&
        (!st.types.size || st.types.has(e.type)) &&
        (!st.tags.size || e.tags.some(t => st.tags.has(t))) &&
        (!st.diff || e.difficulty === st.diff),
    );
    return app.onlyMyLevel ? app.atMyLevel(p) : p;
  };
  const upd = (): void => {
    const p = pool();
    info.textContent = app.t('engine.prac.match', { n: p.length, solved: p.filter(e => app.solved(e.id)).length });
  };
  const chipset = (items: readonly (readonly [string, string])[], set: Set<string>): HTMLElement =>
    h(
      'div',
      { class: 'fchips' },
      items.map(([k, l]) => {
        const b = h(
          'button',
          {
            class: 'fchip',
            type: 'button',
            'aria-pressed': 'false',
            onclick: () => {
              if (set.has(k)) set.delete(k);
              else set.add(k);
              b.classList.toggle('on', set.has(k));
              b.setAttribute('aria-pressed', String(set.has(k)));
              upd();
            },
          },
          l,
        );
        return b;
      }),
    );
  const one = <T>(items: readonly (readonly [T, string])[], start: T, set: (v: T) => void): HTMLElement => {
    const box = h('div', { class: 'fchips' });
    for (const [v, l] of items) {
      const b = h(
        'button',
        {
          class: `fchip${v === start ? ' on' : ''}`,
          type: 'button',
          onclick: () => {
            set(v);
            for (const x of box.querySelectorAll('.fchip')) x.classList.remove('on');
            b.classList.add('on');
            upd();
          },
        },
        l,
      );
      box.append(b);
    }
    return box;
  };
  const types = [...new Set(c.exercises.map(e => e.type))];
  const secSel = h(
    'select',
    {
      class: 'sel',
      'aria-label': app.t('engine.prac.section'),
      onchange: () => {
        st.sec = secSel.value;
        upd();
      },
    },
    h('option', { value: 'all' }, app.t('engine.prac.allSections')),
    c.sections.map(s => h('option', { value: s.id }, s.title)),
  );
  const FOCUS = [
    ['pitfall', '⚠️'],
    ['debug', '🔧'],
    ['exam', '🎓'],
    ['syntax', '⌨️'],
    ['calc', '🧮'],
    ['interview', '🎤'],
    ['compare', '⚖️'],
  ] as const;
  const level = myLevelChip(app, upd);
  body.append(
    h(
      'div',
      { class: 'card filters' },
      h('div', {}, h('div', { class: 'lbl' }, app.t('engine.prac.section')), secSel),
      h(
        'div',
        {},
        h('div', { class: 'lbl' }, app.t('engine.prac.types')),
        chipset(
          types.map(t => [t, typeLabel(app, t)] as const),
          st.types,
        ),
      ),
      h(
        'div',
        {},
        h('div', { class: 'lbl' }, app.t('engine.prac.focus')),
        chipset(
          FOCUS.map(([k, i]) => [k, `${i} ${app.t(`engine.prac.focus_${k}`)}`] as const),
          st.tags,
        ),
      ),
      h(
        'div',
        {},
        h('div', { class: 'lbl' }, app.t('engine.prac.difficulty')),
        one(
          [
            [0, app.t('engine.prac.any')],
            [1, `● ${app.t('engine.prac.easy')}`],
            [2, `●● ${app.t('engine.prac.medium')}`],
            [3, `●●● ${app.t('engine.prac.hard')}`],
          ],
          0,
          d => {
            st.diff = d;
          },
        ),
      ),
      h(
        'div',
        {},
        h('div', { class: 'lbl' }, app.t('engine.prac.roundSize')),
        one(
          [
            [5, app.nf(5)],
            [10, app.nf(10)],
            [20, app.nf(20)],
            [999, `∞ ${app.t('engine.prac.all')}`],
          ],
          10,
          n => {
            st.count = n;
          },
        ),
      ),
      level ? h('div', {}, h('div', { class: 'lbl' }, app.t('ui.study.level')), level) : null,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              const p = pool();
              if (!p.length) {
                app.toast(app.t('engine.prac.noMatch'));
                return;
              }
              app.startRound(p, {
                title: `🎯 ${app.t('engine.run.chPractice', { num: c.num })}`,
                count: st.count,
                back: `#/ch/${c.id}/practice`,
              });
            },
          },
          `▶ ${app.t('engine.prac.start')}`,
        ),
        info,
      ),
    ),
  );
  upd();
}

export { F };
