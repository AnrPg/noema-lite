/**
 * Practice: a round (#/run, the session's statechart: domain/session.ts) and its summary, a round made from search
 * results (#/srun), the Mistakes gym, a mixed round, the boss battle, the lightning round, one exercise (#/ex/<id>), and
 * the page of a Roadmap step still locked.
 */
import { roundResult } from '../../domain/session.ts';
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type StudyApp } from '../app.ts';
import { h, replay, shuffle } from '../dom.ts';
import { exerciseCard } from '../exercise/card.ts';
import { mistakesByCat } from '../kmap.ts';
import { askButton, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { backBtn, lockNote, view } from '../view.ts';
import { myLevelChip } from './chapter.ts';
import { flashDeck } from './cards.ts';

export function lockedView(app: StudyApp): void {
  app.host.frame.chrome({ sub: true, crumbs: [[app.L('exercisesWord')]], back: HOME, corner: true });
  view(
    app,
    lockNote(app),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            app.go(HOME);
          },
        },
        `📖 ${app.L('backToTheory')}`,
      ),
    ),
  );
}

const hearts = (lives: number): string => '❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(Math.max(0, 3 - lives));

/** #/run: the round in play, one exercise at a time */
export function runView(app: StudyApp): void {
  const R0 = app.round;
  if (!R0) {
    app.go(HOME);
    return;
  }
  app.host.frame.chrome({ sub: true, crumbs: [[R0.title]], back: R0.back, reading: true });
  const snap = R0.actor.snapshot;
  if (snap.state === 'summary') {
    runSummary(app);
    return;
  }
  const c0 = snap.context;
  const ex = c0.list[c0.i];
  if (!ex) {
    runSummary(app);
    return;
  }
  setAccent(document.body, app.course.chapterOf(ex));
  app.tutor.setContext({ kind: 'section', id: ex.section });
  const lastOne = (): boolean => R0.actor.snapshot.context.i + 1 >= R0.actor.snapshot.context.list.length;
  const nextBtn = h(
    'button',
    {
      class: 'btn primary',
      type: 'button',
      'data-next': '1',
      style: { display: 'none' },
      onclick: () => {
        R0.actor.send({ type: 'NEXT' });
        runView(app);
      },
    },
    lastOne() ? app.t('engine.run.finish') : app.t('engine.run.next'),
  );
  const heartsEl = c0.boss !== null ? h('span', { class: 'hearts' }, hearts(c0.lives)) : null;
  const count = h('b', { class: 'tiny' }, `${app.nf(c0.i + 1)}/${app.nf(c0.list.length)}`);
  const card = exerciseCard(app, ex, {
    showSection: true,
    onDone: ok => {
      R0.actor.send({ type: 'ANSWER', ok });
      const c = R0.actor.snapshot.context;
      if (heartsEl) heartsEl.textContent = hearts(c.lives);
      count.textContent = `${app.nf(c.i + 1)}/${app.nf(c.list.length)}`;
      nextBtn.textContent =
        c.boss !== null && c.lives <= 0 ? app.t('engine.run.seeResult') : lastOne() ? app.t('engine.run.finish') : app.t('engine.run.next');
      nextBtn.style.display = '';
      nextBtn.classList.add('pop');
      setTimeout(() => {
        nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    },
  });
  view(
    app,
    h(
      'div',
      { class: 'runner' },
      h(
        'div',
        { class: 'runtop' },
        h(
          'button',
          {
            class: 'iconbtn',
            type: 'button',
            title: app.t('engine.run.quit'),
            'aria-label': app.t('engine.run.quit'),
            onclick: () => {
              app.go(R0.back);
            },
          },
          '✕',
        ),
        h('div', { class: 'bar' }, h('i', { style: { width: `${String((c0.i / c0.list.length) * 100)}%` } })),
        heartsEl,
        count,
      ),
      h(
        'div',
        { class: 'tiny', style: { marginBottom: '8px', fontWeight: '700' } },
        R0.title,
        c0.siblings.includes(ex.id) ? h('span', { class: 'pill sibpill' }, `↻ ${app.t('engine.run.sibling')}`) : null,
      ),
      card,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, nextBtn),
    ),
  );
}

function runSummary(app: StudyApp): void {
  const R0 = app.round;
  if (!R0) return;
  const c = R0.actor.snapshot.context;
  const r = roundResult(c);
  const n = r.answered,
    pct = r.share,
    xp = app.state.xp - R0.xp0;
  let big = pct >= 0.9 ? '🏆' : pct >= 0.7 ? '🎉' : pct >= 0.5 ? '💪' : '🌱';
  let msg = app.t(
    pct >= 0.9 ? 'engine.run.outstanding' : pct >= 0.7 ? 'engine.run.great' : pct >= 0.5 ? 'engine.run.solid' : 'engine.run.goodStart',
  );
  const reacts = app.host.frame.framed && app.host.feedback.reacts;
  const big2 = (k: string): void => {
    if (reacts) app.host.feedback.big(k);
  };
  if (c.boss !== null) {
    if (r.bossWon) {
      app.state.boss[c.boss] = true;
      app.host.save();
      big = '🏆';
      msg = app.t('engine.run.bossWon');
      big2('bosswin');
    } else {
      big = '👾';
      msg = app.t('engine.run.bossLost');
    }
  } else if (R0.back === '#/mistakes' && r.ok && !app.mistakes().length)
    big2('gym'); // the gym is empty
  else if (n >= 5 && r.ok === n) big2('perfect');
  if (pct >= 0.7) {
    if (!reacts) app.host.feedback.confetti();
    app.host.feedback.beep('win');
  }
  const wrong = c.wrong;
  view(
    app,
    h(
      'div',
      { class: 'runner' },
      h(
        'div',
        { class: 'card summary' },
        h('div', { class: 'big' }, big),
        h('h2', {}, msg),
        h(
          'div',
          { class: 'statgrid' },
          h(
            'div',
            { class: 'stat' },
            h('b', {}, `${app.nf(r.ok)}/${app.nf(n)}`),
            h('span', { class: 'tiny' }, app.t('engine.run.correct')),
          ),
          h(
            'div',
            { class: 'stat' },
            h('b', {}, app.pct(Math.round(pct * 100))),
            h('span', { class: 'tiny' }, app.t('engine.run.accuracy')),
          ),
          h('div', { class: 'stat' }, h('b', {}, `+${app.nf(xp)}`), h('span', { class: 'tiny' }, app.t('engine.run.xp'))),
        ),
        wrong.length
          ? h(
              'div',
              { style: { textAlign: 'start', margin: '0 0 18px' } },
              h('b', {}, app.t('engine.run.reviewThese')),
              h(
                'ul',
                {},
                wrong.map(e => h('li', { html: fmt((e.q ?? '').slice(0, 140)) })),
              ),
            )
          : null,
        h(
          'div',
          { class: 'row', style: { justifyContent: 'center' } },
          wrong.length
            ? h(
                'button',
                {
                  class: 'btn primary',
                  type: 'button',
                  onclick: () => {
                    app.startRound(wrong, { title: `🔁 ${app.t('engine.run.retry')}`, count: wrong.length, back: R0.back });
                  },
                },
                `🔁 ${app.t('engine.run.retry')}`,
              )
            : null,
          R0.after
            ? h(
                'button',
                {
                  class: 'btn primary ns-srnext',
                  type: 'button',
                  onclick: () => {
                    R0.after?.run();
                  },
                },
                R0.after.label,
              )
            : null,
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: () => {
                app.go(R0.back);
              },
            },
            app.t('engine.run.done'),
          ),
        ),
      ),
    ),
  );
}

/** #/srun: a round made from search results, this subject's exercises, then its cards */
export function searchRunView(app: StudyApp): void {
  const X = app.host.search;
  const st = X.step();
  if (!st) {
    app.go(X.page);
    return;
  }
  const after = X.after();
  if (st.kind === 'ex') {
    const list = (st.ids ?? []).map(id => app.course.exercise(id)).filter((e): e is Exercise => !!e);
    if (!list.length) {
      if (after) after.run();
      else app.go(st.back);
      return;
    }
    app.startRound(list, { title: st.title, count: list.length, back: st.back, after, keepOrder: true });
    return;
  }
  const keys = new Set(st.keys ?? []),
    cards = app.cards().filter(c => keys.has(c.key));
  if (!cards.length) {
    if (after) after.run();
    else app.go(st.back);
    return;
  }
  app.host.frame.chrome({ sub: true, crumbs: [[st.title]], back: st.back, reading: true });
  const body = h('div');
  view(app, h('h1', {}, st.title), body);
  flashDeck(app, body, cards, {
    all: true,
    onDone: () =>
      h(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        after
          ? h(
              'button',
              {
                class: 'btn primary ns-srnext',
                type: 'button',
                onclick: () => {
                  after.run();
                },
              },
              after.label,
            )
          : null,
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              app.go(st.back);
            },
          },
          app.L('sr_backToResults'),
        ),
      ),
  });
}

/** #/mistakes: every exercise whose last answer was wrong, by trap and by chapter */
export function mistakesView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.mistakes')]], back: HOME });
  const list = app.mistakes();
  view(
    app,
    backBtn(app, app.t('nav.home'), HOME),
    h('h1', {}, app.t('view.mistakes')),
    h('p', { class: 'muted' }, app.t('engine.gym.intro')),
    list.length
      ? h(
          'div',
          {},
          h(
            'div',
            { class: 'row', style: { margin: '8px 0 18px' } },
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  app.startRound(list, { title: app.t('view.mistakes'), count: 15, back: '#/mistakes' });
                },
              },
              `▶ ${app.t('engine.gym.train', { n: Math.min(15, list.length), of: list.length })}`,
            ),
          ),
          mistakesByCat(app, list),
          h(
            'div',
            { style: { display: 'grid', gap: '8px' } },
            app.course.chapters.map(c => {
              const mine = list.filter(e => app.course.chapterOf(e)?.id === c.id);
              if (!mine.length) return null;
              return h(
                'button',
                {
                  class: 'node',
                  type: 'button',
                  onclick: () => {
                    app.startRound(mine, {
                      title: `🔁 ${app.t('engine.run.chMistakes', { num: c.num })}`,
                      count: mine.length,
                      back: '#/mistakes',
                    });
                  },
                },
                h('div', { class: 'dot' }, c.emoji ?? ''),
                h('div', { class: 'grow' }, h('b', {}, c.title)),
                h('span', { class: 'pill' }, app.nf(mine.length)),
              );
            }),
          ),
        )
      : h('div', { class: 'empty' }, h('div', { class: 'e' }, '✨'), h('p', {}, app.t('engine.gym.empty'))),
  );
}

/** #/practice/all: a mixed round over what was read, over everything, debugging only, exam only */
export function mixedView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.mixed')]], back: HOME });
  const all = app.course.exercises;
  const pool = all.filter(e => app.state.read[e.section]);
  const back = '#/practice/all';
  const run = (list: readonly Exercise[], title: string) => () => {
    app.startRound(list, { title, count: 12, back });
  };
  const counts = h('div', { class: 'row', style: { marginTop: '14px' } });
  const draw = (): void => {
    const n = (l: readonly Exercise[]): number => (app.onlyMyLevel ? app.atMyLevel(l).length || l.length : l.length);
    counts.replaceChildren(
      h(
        'button',
        { class: 'btn primary', type: 'button', disabled: !pool.length, onclick: run(pool, `🎲 ${app.t('engine.mixed.readTitle')}`) },
        `▶ ${app.t('engine.mixed.fromRead', { n: n(pool) })}`,
      ),
      h(
        'button',
        { class: 'btn', type: 'button', onclick: run(all, `🎲 ${app.t('engine.mixed.allTitle')}`) },
        `▶ ${app.t('engine.mixed.fromAll', { n: n(all) })}`,
      ),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: run(
            all.filter(e => e.tags.includes('debug')),
            `🔧 ${app.t('engine.mixed.debugOnly')}`,
          ),
        },
        `🔧 ${app.t('engine.mixed.debugOnly')}`,
      ),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: run(
            all.filter(e => e.tags.includes('exam')),
            `🎓 ${app.t('engine.mixed.examOnly')}`,
          ),
        },
        `🎓 ${app.t('engine.mixed.examOnly')}`,
      ),
    );
  };
  draw();
  view(
    app,
    backBtn(app, app.t('nav.home'), HOME),
    h('h1', {}, app.t('view.mixed')),
    h('p', { class: 'muted' }, app.t('engine.mixed.intro')),
    myLevelChip(app, draw),
    counts,
  );
}

/** #/boss/<chapter>: 15 exercises, mostly hard ones, three lives */
export function bossView(app: StudyApp, id: string): void {
  const c = app.course.chapter(id);
  if (!c) {
    app.go(HOME);
    return;
  }
  setAccent(document.body, c);
  app.host.frame.chrome({
    sub: true,
    crumbs: [[`${c.emoji ?? ''} ${c.title}`, `#/ch/${id}`], [app.L('boss')]],
    back: `#/ch/${id}/practice`,
  });
  view(
    app,
    backBtn(app, `${app.arrowBack} ${c.title}`, `#/ch/${id}`),
    h(
      'div',
      { class: 'card summary' },
      h('div', { class: 'big' }, '👾'),
      h('h1', {}, app.t('engine.boss.title', { num: c.num })),
      h('p', { class: 'muted' }, app.t('engine.boss.intro')),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          style: { marginTop: '10px' },
          onclick: () => {
            const pool = c.exercises.filter(e => e.type !== 'free');
            const hard = shuffle(pool.filter(e => e.difficulty >= 2)),
              easy = shuffle(pool.filter(e => e.difficulty < 2));
            const pick = [...hard.slice(0, 12), ...easy.slice(0, 3)];
            app.startRound(shuffle(pick).slice(0, 15), {
              title: `👾 ${app.t('engine.boss.runTitle', { num: c.num })}`,
              count: 15,
              back: `#/ch/${id}`,
              boss: id,
              keepOrder: true,
            });
            app.host.feedback.big('boss');
          },
        },
        `⚔️ ${app.t('engine.boss.fight')}`,
      ),
    ),
  );
}

/** #/lightning: true or false against the clock (60 seconds) */
export function lightningView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.lightning')]], back: HOME });
  const chSel = h(
    'select',
    { class: 'sel', 'aria-label': app.t('engine.light.allChapters') },
    h('option', { value: 'all' }, app.t('engine.light.allChapters')),
    app.course.chapters.map(c => h('option', { value: c.id }, `${c.emoji ?? ''} ${app.chShort(c.num)} ${c.title}`)),
  );
  view(
    app,
    backBtn(app, app.t('nav.home'), HOME),
    h(
      'div',
      { class: 'card lightning' },
      h('div', { style: { fontSize: '56px' } }, '⚡'),
      h('h1', {}, app.t('view.lightning')),
      h('p', { class: 'muted' }, app.t('engine.light.intro')),
      h('div', { class: 'row', style: { justifyContent: 'center', margin: '14px 0' } }, chSel),
      h('p', { class: 'tiny' }, app.t('engine.light.best', { n: app.state.bestLightning ?? 0 })),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            playLightning(app, chSel.value);
          },
        },
        `▶ ${app.t('engine.light.go')}`,
      ),
    ),
  );
}

export function playLightning(app: StudyApp, chid: string): void {
  const pool = shuffle(app.course.exercises.filter(e => e.type === 'tf' && (chid === 'all' || app.course.chapterOf(e)?.id === chid)));
  if (!pool.length) {
    app.toast(app.t('engine.light.noTf'));
    app.go(HOME);
    return;
  }
  const c0 = app.course.chapter(chid),
    back = c0 ? `#/ch/${chid}/traps` : '#/lightning',
    here = location.hash;
  app.host.frame.chrome({
    sub: true,
    crumbs: c0 ? [[`${c0.emoji ?? ''} ${c0.title}`, `#/ch/${chid}`], [app.t('home.lightning')]] : [[app.t('home.lightning')]],
    back,
    reading: true,
  });
  let i = 0,
    score = 0,
    over = false,
    warned = false;
  const end = app.clock.now() + 60e3,
    wrong: Exercise[] = [];
  const at = (): Exercise => pool[i % pool.length] as Exercise;
  const clock = h('div', { class: 'clock', role: 'timer' }, app.nf(60)),
    stmt = h('div', { class: 'stmt', 'aria-live': 'polite' }),
    sc = h('div', { class: 'tiny' });
  const draw = (): void => {
    const ex = at();
    stmt.replaceChildren(h('div', { html: fmt(ex.q) }));
    setAccent(stmt, app.course.chapterOf(ex));
    sc.textContent = app.t('engine.light.score', { n: score });
  };
  const ans = (v: boolean): void => {
    if (over) return;
    const ex = at();
    const ok = v === ex.answer;
    if (ok) {
      score++;
      app.host.feedback.beep('ok');
      replay(stmt, 'pop');
    } else {
      wrong.push(ex);
      app.host.feedback.beep('bad');
      replay(stmt, 'shake');
    }
    app.record(ex, ok);
    i++;
    draw();
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') ans(true);
    if (e.key === 'ArrowRight') ans(false);
  };
  document.addEventListener('keydown', key);
  const who = app.host.frame.character();
  view(
    app,
    h(
      'div',
      { class: 'runner lightning has-ask' },
      askButton(who.face, who.avatar, app.L('askTutor'), () => {
        app.tutor.askAbout(at(), null);
      }),
      clock,
      stmt,
      h(
        'div',
        { class: 'tfrow' },
        h(
          'button',
          {
            class: 'tfbtn t',
            type: 'button',
            onclick: () => {
              ans(true);
            },
          },
          `👍 ${app.t('engine.ex.true')}  ←`,
        ),
        h(
          'button',
          {
            class: 'tfbtn f',
            type: 'button',
            onclick: () => {
              ans(false);
            },
          },
          `→  👎 ${app.t('engine.ex.false')}`,
        ),
      ),
      h('div', { style: { marginTop: '12px' } }, sc),
    ),
  );
  draw();
  const tmr = setInterval(() => {
    if (location.hash !== here) {
      clearInterval(tmr);
      document.removeEventListener('keydown', key);
      over = true;
      return;
    }
    const left = Math.max(0, Math.ceil((end - app.clock.now()) / 1000));
    clock.textContent = app.nf(left);
    if (left <= 5 && left > 0) {
      if (!warned) {
        warned = true;
        app.host.feedback.big('timer');
      } else app.host.feedback.tick(left);
    }
    if (left) return;
    clearInterval(tmr);
    document.removeEventListener('keydown', key);
    over = true;
    app.xp(score * 3, clock);
    const pb = score > (app.state.bestLightning ?? 0);
    if (pb) {
      app.state.bestLightning = score;
      app.host.save();
    }
    if (!wrong.length && score >= 5 && app.host.frame.framed && app.host.feedback.reacts) app.host.feedback.big('timerwin');
    else if (score >= 8 || pb) app.host.feedback.confetti();
    app.host.feedback.beep('win');
    view(
      app,
      h(
        'div',
        { class: 'runner' },
        h(
          'div',
          { class: 'card summary' },
          h('div', { class: 'big' }, pb ? '🏅' : '⚡'),
          h('h2', {}, app.t(pb ? 'engine.light.resultBest' : 'engine.light.result', { n: score })),
          wrong.length
            ? h(
                'div',
                { style: { textAlign: 'start', marginTop: '16px', display: 'grid', gap: '10px' } },
                h('b', {}, app.t('engine.light.fooled')),
                wrong.map(ex =>
                  h(
                    'div',
                    { class: 'explain bad' },
                    h('div', { class: 'hd' }, ex.answer ? app.t('engine.light.TRUE') : app.t('engine.light.FALSE')),
                    h('div', { html: `<b>${fmt(ex.q)}</b>` }),
                    h('div', { style: { marginTop: '4px' }, html: fmt(ex.explain) }),
                  ),
                ),
              )
            : h('p', {}, app.t('engine.light.flawless')),
          h(
            'div',
            { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } },
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  playLightning(app, chid);
                },
              },
              `⚡ ${app.t('engine.light.again')}`,
            ),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => {
                  app.go(c0 ? back : HOME);
                },
              },
              c0 ? app.L('back') : app.t('engine.light.home'),
            ),
          ),
        ),
      ),
    );
  }, 200);
}

/** #/ex/<id>: one exercise (deep links from other apps), back to its section */
export function oneExercise(app: StudyApp, id: string): boolean {
  const e = app.course.exercise(id);
  if (!e) return false;
  const sec = app.course.section(e.section);
  app.startRound([e], {
    title: `🎯 ${sec?.title ?? app.course.chapterOf(e)?.title ?? ''}`,
    count: 1,
    keepOrder: true,
    back: `#/s/${e.section}`,
  });
  return true;
}
