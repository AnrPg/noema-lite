/**
 * #/mistakes: the Mistakes gym, every exercise whose last answer was wrong: a round of them, the kinds of trap
 * (kmap.ts), and a round per chapter.
 */
import { HOME, type StudyApp } from '../app.ts';
import { mistakesByCat } from '../kmap.ts';
import { html, nothing, show, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { setAccent } from '../parts.ts';

const GYM = '#/mistakes';

export function mistakesView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.mistakes')]], back: HOME });
  show(app, new StudyMistakes(app));
}

export class StudyMistakes extends StudyScreen {
  protected page(): TemplateResult {
    const app = this.app;
    const list = app.mistakes();
    const body = list.length
      ? html`<div>
          <div class="row" style="margin:8px 0 18px">
            <button
              class="btn primary"
              type="button"
              @click=${() => {
                app.startRound(list, { title: app.t('view.mistakes'), count: 15, back: GYM });
              }}
            >
              ▶ ${app.t('engine.gym.train', { n: Math.min(15, list.length), of: list.length })}
            </button>
          </div>
          ${mistakesByCat(app, list) ?? nothing}
          <div style="display:grid;gap:8px">
            ${app.course.chapters.map(c => {
              const mine = list.filter(e => app.course.chapterOf(e)?.id === c.id);
              if (!mine.length) return nothing;
              return html`<button
                class="node"
                type="button"
                @click=${() => {
                  app.startRound(mine, { title: `🔁 ${app.t('engine.run.chMistakes', { num: c.num })}`, count: mine.length, back: GYM });
                }}
              >
                <div class="dot">${c.emoji ?? ''}</div>
                <div class="grow"><b>${c.title}</b></div>
                <span class="pill">${app.nf(mine.length)}</span>
              </button>`;
            })}
          </div>
        </div>`
      : html`<div class="empty">
          <div class="e">✨</div>
          <p>${app.t('engine.gym.empty')}</p>
        </div>`;
    return html`<h1>${app.t('view.mistakes')}</h1>
      <p class="muted">${app.t('engine.gym.intro')}</p>
      ${body}`;
  }
}
tag('study-mistakes', StudyMistakes);
