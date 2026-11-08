/**
 * Practice: a mixed round, the boss battle, the lightning round, one exercise (#/ex/<id>), and
 * the page of a Roadmap step still locked.
 */
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type StudyApp } from '../app.ts';
import { h, replay, shuffle } from '../dom.ts';
import { askButton, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { lockNote, view } from '../view.ts';
import { myLevelChip } from './chapter.ts';

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
  view(app, h('h1', {}, app.t('view.mixed')), h('p', { class: 'muted' }, app.t('engine.mixed.intro')), myLevelChip(app, draw), counts);
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
    app.host.learn('drill.scored', null, { kind: 'lightning', score });
    if (!wrong.length && score >= 5 && app.host.feedback.reacts) app.host.feedback.big('timerwin');
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
