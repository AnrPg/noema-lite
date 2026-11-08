/**
 * A test, one question after the other (a step's placement test, a level's final test): the learner picks an answer, sees
 * whether it was right and why, and goes on. At the end it fires `roadmap-quiz-done` with { right, total }.
 *
 *   <noema-roadmap-quiz .questions=${qs} @roadmap-quiz-done=${e => …}></noema-roadmap-quiz>
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { base } from '../../../ui/core/styles.ts';
import type { TestQuestion } from './data.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

export interface QuizDone {
  readonly right: number;
  readonly total: number;
}

export class NoemaRoadmapQuiz extends RoadmapElement {
  static override properties = {
    questions: { attribute: false },
    index: { state: true },
    picked: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
      }
      .q {
        margin: 4px 0 12px;
        font-size: 1.05rem;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .q:focus {
        outline: none;
      }
      .opts {
        display: grid;
        gap: 8px;
      }
      .opt {
        min-height: 44px;
        padding: 10px 14px;
        border: 1px solid var(--u-line);
        border-radius: var(--u-br);
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        text-align: start;
        cursor: pointer;
        overflow-wrap: anywhere;
        transition: background var(--u-fast) var(--u-ease);
      }
      .opt:hover:not(:disabled) {
        background: var(--u-acc-soft);
      }
      .opt:disabled {
        cursor: default;
      }
      .opt.ok {
        background: var(--u-ok);
        color: var(--u-ok-ink);
        border-color: currentColor;
      }
      .opt.bad {
        background: var(--u-bad);
        color: var(--u-bad-ink);
        border-color: currentColor;
      }
      .next {
        margin-top: 12px;
      }
    `,
  ];
  declare questions: readonly TestQuestion[];
  declare index: number;
  declare picked: number | null;
  #right = 0;

  constructor() {
    super();
    this.questions = [];
    this.index = 0;
    this.picked = null;
  }

  /** right answers so far */
  get right(): number {
    return this.#right;
  }

  #pick(k: number): void {
    const q = this.questions[this.index];
    if (!q || this.picked != null) return;
    this.picked = k;
    if (k === q.answer) this.#right++;
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>('.next')?.focus();
    });
  }

  #next(): void {
    this.picked = null;
    this.index++;
    if (this.index >= this.questions.length) {
      this.emit('roadmap-quiz-done', { right: this.#right, total: this.questions.length } satisfies QuizDone);
      return;
    }
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>('.q')?.focus();
    });
  }

  override render(): TemplateResult | typeof nothing {
    const q = this.questions[this.index],
      total = this.questions.length;
    if (!q) return nothing;
    const done = this.picked != null,
      ok = this.picked === q.answer,
      last = this.index + 1 >= total;
    const cls = (k: number): string => (done ? (k === q.answer ? 'opt ok' : k === this.picked ? 'opt bad' : 'opt') : 'opt');
    return html`<div class="tiny" aria-live="polite">${this.t('roadmap.map.test.question', { n: this.index + 1, total })}</div>
      <div class="q" tabindex="-1">${unsafeHTML(this.data.inline(q.q))}</div>
      <div class="opts" role="group" aria-label=${this.t('roadmap.quiz.answers')}>
        ${q.options.map(
          (o, k) =>
            html`<button
              type="button"
              class=${cls(k)}
              ?disabled=${done}
              aria-pressed=${done && k === this.picked ? 'true' : 'false'}
              @click=${(): void => {
                this.#pick(k);
              }}
            >
              ${o}
            </button>`,
        )}
      </div>
      ${
        done
          ? html`<p class="status ${ok ? 'ok' : 'bad'}" role="status">
                <b>${this.t(ok ? 'roadmap.quiz.right' : 'roadmap.quiz.wrong')}</b>${q.explain ? html` ${q.explain}` : nothing}
              </p>
              <noema-button
                class="next"
                variant="primary"
                @click=${(): void => {
                  this.#next();
                }}
                >${last ? this.t('roadmap.map.test.result') : this.t('roadmap.map.test.next')}</noema-button
              >`
          : nothing
      }`;
  }
}
