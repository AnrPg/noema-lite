/**
 * The head of a lesson's page (the course's #/lesson/<id>; docs/LANGUAGES.md §6.7, D22, D23): its step and title, how far
 * the learner is in each language learned together, the lesson's four-step ladder over those languages (words to
 * recognise → words to produce → theory → the theory practised: a step is done when it is done in every language), the
 * one primary button (Continue · the next step), Deepen, and the Aa· switch for the line under foreign words.
 *
 *   <noema-lang-lesson-head .port=${coursePort} node="fd.01"></noema-lang-lesson-head>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort, LessonHead } from './course-port.ts';

export class NoemaLangLessonHead extends NoemaScreen {
  static override properties = { port: { attribute: false }, node: { type: String } };
  declare port: CoursePort | null;
  declare node: string;

  constructor() {
    super();
    this.port = null;
    this.node = '';
  }

  #ladder(m: LessonHead): TemplateResult | typeof nothing {
    const L = m.ladder;
    if (!L) return nothing;
    return html`<ol class="lx-ladder">
      ${L.steps.map(
        s =>
          html`<li class=${s.done ? 'done' : s.id === L.next ? 'now' : s.open ? 'open' : 'later'} data-step=${s.id}>
            ${s.done ? '✓ ' : ''}${this.t('lang.step.' + s.id)}
          </li>`,
      )}
    </ol>`;
  }

  override render(): TemplateResult {
    const P = this.port,
      m = P?.lessonHead(this.node);
    if (!P || !m) return html``;
    const next = m.ladder?.next ?? null,
      tr = m.frame ? null : m.translit,
      deepen = m.frame ? null : m.deepen,
      pic = (x: string): string => (m.frame ? '' : x + ' ');
    return html`<h1><span class="lx-step">${m.step}</span> ${m.title}</h1>
      ${
        m.frame
          ? nothing
          : html`<div class="row">
              ${m.langs.map(
                l =>
                  html`<span class=${'lx-ns ns-' + l.state} data-lang=${l.code}
                    >${l.flag} ${l.stateLabel}${l.pct != null ? ' · ' + this.t('lang.lesson.pct', { pct: l.pct }) : ''}</span
                  >`,
              )}
            </div>`
      }
      ${this.#ladder(m)}
      <div class="row lx-actions">
        ${
          m.can.length
            ? html`<button
                class="btn primary lx-continue"
                type="button"
                data-step=${next ?? 'done'}
                @click=${() => {
                  P.continueLesson(this.node, m.can);
                }}
              >
                ${pic('▶')}${next ? this.t('lang.step.continue', { step: this.t('lang.step.' + next) }) : this.t('lang.step.review')}
              </button>`
            : html`<span class="lx-note">${pic('🔒')}${this.t('lang.lesson.locked')}</span>`
        }
        ${
          deepen
            ? html`<button
                class="btn small lx-deepenbtn"
                type="button"
                data-icon="gym"
                @click=${() => {
                  P.go(deepen.href);
                }}
              >
                🏋️ ${this.t('lang.deep.deepenN', { n: deepen.n })}
              </button>`
            : nothing
        }
        ${
          tr
            ? html`<button
                class="btn ghost small lx-translit"
                type="button"
                aria-pressed=${tr.on ? 'true' : 'false'}
                title=${this.t(tr.on ? 'lang.translit.hide' : 'lang.translit.show')}
                @click=${() => {
                  P.setTranslit(!tr.on);
                  this.requestUpdate();
                }}
              >
                Aa·
              </button>`
            : nothing
        }
      </div>`;
  }
}
