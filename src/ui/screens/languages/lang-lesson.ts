/**
 * A lesson of the foundations (docs/LANGUAGES.md §6.7, D9–D11, D22): its page and its run.
 *
 *   <noema-lang-lesson .port=${coursePort} node="fd.01"></noema-lang-lesson>
 *      the page: its head (lang-lesson-head.ts: the ladder, Continue), the theory once the words are done (the overview,
 *      its grammar points, each with its aspect), the points the other languages learn at the same step (D10), its words
 *   <noema-lang-run .port=${coursePort} node="fd.01" heading="S01 Hello · Words"></noema-lang-run>
 *      a running lesson: ✕ stop, its title, Aa·, the progress bar and the stage the course's exercises are drawn on
 *      (`.stage`); the course fills the stage itself, the run keeps it across draws
 *   <noema-lang-result .model=${result}></noema-lang-result>
 *      the end of a run: the counts, each language's check, the words met before they were taught (D20), what next
 *
 * The grammar cards, the overview, the tiles of words and the exercises are the course's own parts, handed over as nodes.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import { rail } from './lang-drills.ts';
import type { CoursePort, LessonPage, RunResult } from './course-port.ts';

export class NoemaLangLesson extends NoemaScreen {
  static override properties = { port: { attribute: false }, node: { type: String } };
  declare port: CoursePort | null;
  declare node: string;

  constructor() {
    super();
    this.port = null;
    this.node = '';
  }

  override render(): TemplateResult {
    const P = this.port,
      m: LessonPage | null = P?.lessonPage(this.node) ?? null;
    if (!P || !m) return html``;
    return html`${
        P.inFrame()
          ? nothing
          : html`<div class="lx-back">
              <button
                class="btn ghost small"
                type="button"
                @click=${() => {
                  P.go('#/');
                }}
              >
                ${this.uiDir === 'rtl' ? '→' : '←'} ${this.t('lang.card.map')}
              </button>
            </div>`
      }
      ${rail(m.rail, x => {
        P.setLang(x);
      })}
      <div class="lx-screen lx-lessonhead"><noema-lang-lesson-head .port=${P} node=${this.node}></noema-lang-lesson-head></div>
      ${m.tutor ?? nothing}
      ${
        m.theory
          ? html`${m.theory.overview ?? nothing}
              <h2 class="lx-h2">📖 ${this.t('lang.lesson.grammarIn', { lang: m.lang.name })}</h2>
              ${
                P.inFrame() && m.theory.cards.length > 1
                  ? m.theory.cards.map(
                      (card, i) =>
                        html`<details class="lx-ffold" ?open=${i === 0}>
                          <summary>
                            ${(card instanceof Element ? card.querySelector('h3')?.textContent : null) ?? this.t('lang.view.grammar')}
                          </summary>
                          ${card}
                        </details>`,
                    )
                  : m.theory.cards
              }`
          : nothing
      }
      ${
        m.extra.length
          ? html`<div class="lx-callout k-key">
              <b>🔗 ${this.t('lang.lesson.othersLearn')} </b>
              <ul class="lx-list">
                ${m.extra.map(
                  x =>
                    html`<li>
                      ${x.flag}
                      ${x.fns.map(
                        f =>
                          html`<button
                            class="btn ghost small"
                            type="button"
                            @click=${() => {
                              P.go(`#/fn/${encodeURIComponent(f.id)}/${x.code}`);
                            }}
                          >
                            ${f.title}
                          </button>`,
                      )}
                    </li>`,
                )}
              </ul>
            </div>`
          : nothing
      }
      ${
        m.words
          ? html`<h2 class="lx-h2">🔤 ${this.t('lang.lanes.sec.words')} <span class="tiny">${m.words.n}</span></h2>
              <div class="lx-cgrid">${m.words.tiles}</div>`
          : nothing
      }`;
  }
}

export class NoemaLangRun extends NoemaScreen {
  static override properties = { port: { attribute: false }, node: { type: String }, heading: { type: String }, pct: { type: Number } };
  declare port: CoursePort | null;
  declare node: string;
  declare heading: string;
  /** how far the run is, percent */
  declare pct: number;
  /** where the course draws the exercises: the same element on every draw */
  readonly stage: HTMLDivElement;

  constructor() {
    super();
    this.port = null;
    this.node = '';
    this.heading = '';
    this.pct = 0;
    this.stage = document.createElement('div');
    this.stage.className = 'lx-stage';
  }

  /** Draw at once (the course reads the page right after it starts a run). */
  drawNow(): void {
    this.performUpdate();
  }

  override render(): TemplateResult {
    const P = this.port;
    return html`<div class="view lx-view lx-session lx-lessonrun" data-node=${this.node}>
      <div class="row">
        <button
          class="btn ghost small"
          type="button"
          @click=${() => {
            P?.stopRun(this.node);
          }}
        >
          ✕ ${this.t('lang.sess.stop')}
        </button>
        <b class="tiny">${this.heading}</b>
        <noema-lang-translit .port=${P}></noema-lang-translit>
        <div
          class="lx-progress"
          role="progressbar"
          aria-label=${this.heading}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(this.pct)}
        >
          <i style=${'width:' + String(Math.round(this.pct)) + '%'}></i>
        </div>
      </div>
      ${this.stage}
    </div>`;
  }
}

export class NoemaLangResult extends NoemaScreen {
  static override properties = { model: { attribute: false } };
  declare model: RunResult | null;

  constructor() {
    super();
    this.model = null;
  }

  override render(): TemplateResult {
    const m = this.model;
    if (!m) return html``;
    return html`<div class="lx-result">
      <h2>${m.checked ? '🏁 ' + this.t('lang.lesson.checkDone') : '🎉 ' + this.t('lang.lesson.wellDone')}</h2>
      <p>${this.t('lang.lesson.stats', { nNew: m.introduced, right: m.right, wrong: m.wrong })}</p>
      ${
        m.rows.length
          ? html`<ul>
              ${m.rows.map(r => html`<li data-lang=${r.code}>${r.flag} ${r.label}: ${r.text}</li>`)}
            </ul>`
          : nothing
      }
      ${m.moreWaiting ? html`<p class="tiny">${this.t('lang.lesson.moreWaiting')}</p>` : nothing} ${m.newWords ?? nothing}
      <div class="row">
        ${m.actions.map(
          a =>
            html`<button
              class=${'btn' + (a.primary ? ' primary' : '') + (a.cls ? ' ' + a.cls : '')}
              type="button"
              data-step=${a.step ?? nothing}
              @click=${a.run}
            >
              ${a.label}
            </button>`,
        )}
      </div>
    </div>`;
  }
}
