/**
 * #/boss/<chapter>: the boss battle's door. The battle is a round of 15 exercises, mostly hard ones, with three lives
 * (the session's statechart, domain/session.ts); it is drawn by the round's page (round.ts).
 */
import { HOME, type StudyApp } from '../app.ts';
import { shuffle } from '../dom.ts';
import { html, show, StudyPage } from '../lit/base.ts';
import { setAccent } from '../parts.ts';

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
  const fight = (): void => {
    const pool = c.exercises.filter(e => e.type !== 'free');
    const hard = shuffle(pool.filter(e => e.difficulty >= 2)),
      easy = shuffle(pool.filter(e => e.difficulty < 2));
    app.startRound(shuffle([...hard.slice(0, 12), ...easy.slice(0, 3)]).slice(0, 15), {
      title: `👾 ${app.t('engine.boss.runTitle', { num: c.num })}`,
      count: 15,
      back: `#/ch/${id}`,
      boss: id,
      keepOrder: true,
    });
    app.host.feedback.big('boss');
  };
  show(
    app,
    new StudyPage(
      app,
      () =>
        html`<div class="card summary">
          <div class="big">👾</div>
          <h1>${app.t('engine.boss.title', { num: c.num })}</h1>
          <p class="muted">${app.t('engine.boss.intro')}</p>
          <button class="btn primary" type="button" style="margin-top:10px" @click=${fight}>⚔️ ${app.t('engine.boss.fight')}</button>
        </div>`,
    ),
  );
}
