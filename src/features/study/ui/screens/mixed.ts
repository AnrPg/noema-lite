/**
 * #/practice/all: a mixed round over what was read, over everything, debugging only or exam only ("Only my level"
 * narrows the counts and the round); and the page of a Roadmap step still locked (its exercises wait).
 */
import type { Exercise } from '../../domain/pack.ts';
import { HOME, type StudyApp } from '../app.ts';
import { html, show, StudyPage, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { setAccent } from '../parts.ts';
import { lockNoteT } from '../view.ts';
import { levelChip } from './chapter.ts';

export function mixedView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.mixed')]], back: HOME });
  show(app, new StudyMixed(app));
}

export class StudyMixed extends StudyScreen {
  protected page(): TemplateResult {
    const app = this.app;
    const all = app.course.exercises;
    const pool = all.filter(e => app.state.read[e.section]);
    const n = (l: readonly Exercise[]): number => (app.onlyMyLevel ? app.atMyLevel(l).length || l.length : l.length);
    const go = (list: readonly Exercise[], title: string) => () => {
      app.startRound(list, { title, count: 12, back: '#/practice/all' });
    };
    const debug = `🔧 ${app.t('engine.mixed.debugOnly')}`,
      exam = `🎓 ${app.t('engine.mixed.examOnly')}`;
    return html`<h1>${app.t('view.mixed')}</h1>
      <p class="muted">${app.t('engine.mixed.intro')}</p>
      ${levelChip(app, () => this.redraw())}
      <div class="row" style="margin-top:14px">
        <button class="btn primary" type="button" ?disabled=${!pool.length} @click=${go(pool, `🎲 ${app.t('engine.mixed.readTitle')}`)}>
          ▶ ${app.t('engine.mixed.fromRead', { n: n(pool) })}
        </button>
        <button class="btn" type="button" @click=${go(all, `🎲 ${app.t('engine.mixed.allTitle')}`)}>
          ▶ ${app.t('engine.mixed.fromAll', { n: n(all) })}
        </button>
        <button
          class="btn"
          type="button"
          @click=${go(
            all.filter(e => e.tags.includes('debug')),
            debug,
          )}
        >
          ${debug}
        </button>
        <button
          class="btn"
          type="button"
          @click=${go(
            all.filter(e => e.tags.includes('exam')),
            exam,
          )}
        >
          ${exam}
        </button>
      </div>`;
  }
}
tag('study-mixed', StudyMixed);

/** a Roadmap step still locked: its practice pages wait, its theory is open */
export function lockedView(app: StudyApp): void {
  app.host.frame.chrome({ sub: true, crumbs: [[app.L('exercisesWord')]], back: HOME, corner: true });
  const note = lockNoteT(app);
  show(
    app,
    new StudyPage(
      app,
      () =>
        html`${note}
          <div class="row">
            <button
              class="btn primary"
              type="button"
              @click=${() => {
                app.go(HOME);
              }}
            >
              📖 ${app.L('backToTheory')}
            </button>
          </div>`,
    ),
  );
}
