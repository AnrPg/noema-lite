/**
 * Practice: the lightning round, one exercise (#/ex/<id>).
 */
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type StudyApp } from '../app.ts';
import { h, replay, shuffle } from '../dom.ts';
import { askButton, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { view } from '../view.ts';

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
