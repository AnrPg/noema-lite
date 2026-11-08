/**
 * 🎓 "I already know this": a step's placement test. First what the test is (nothing is prepared and no AI is asked until
 * the learner goes on), then the questions (from the step's own pack when it is prepared, else written by the AI), then
 * the result: 8 of 10 right marks the step as mastered and fires `roadmap-step-tested` with { step, mastered }.
 */
import { css, html, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import type { TestQuestion } from './data.ts';
import { RoadmapElement } from './element.ts';
import { openDialog } from './open.ts';
import type { QuizDone } from './quiz.ts';
import { screen } from './styles.ts';

type Stage = 'intro' | 'preparing' | 'failed' | 'quiz' | 'result';

export class NoemaRoadmapStepTest extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    step: { type: String },
    stage: { state: true },
    message: { state: true },
    mastered: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: contents;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare step: string;
  declare stage: Stage;
  declare message: string;
  declare mastered: boolean;
  #questions: TestQuestion[] = [];

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.step = '';
    this.stage = 'intro';
    this.message = '';
    this.mastered = false;
  }

  /** Opens the test of a step (the map's "I already know this"). */
  static open(p: { account: string; roadmapId: string; step: string }): NoemaRoadmapStepTest {
    return openDialog(Object.assign(new NoemaRoadmapStepTest(), p));
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  show(): void {
    this.#dialog?.show();
  }

  async #prepare(): Promise<void> {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return;
    this.stage = 'preparing';
    try {
      this.#questions = await this.data.placementQuestions(this.account, c, this.step);
      this.stage = 'quiz';
    } catch (e) {
      this.message = this.i18n.err(e);
      this.stage = 'failed';
    }
  }

  #done(e: CustomEvent<QuizDone>): void {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return;
    const { right, total } = e.detail;
    this.mastered = this.data.passStep(this.account, c, this.step, right / total);
    this.message = this.t(this.mastered ? 'roadmap.map.test.passed' : 'roadmap.map.test.failed', { right, total });
    this.stage = 'result';
    this.emit('roadmap-step-tested', { step: this.step, mastered: this.mastered });
  }

  #button(label: string, variant: 'primary' | 'secondary', run: () => void, cls = ''): TemplateResult {
    return html`<noema-button slot="actions" class=${cls} variant=${variant} @click=${run}>${label}</noema-button>`;
  }

  #body(): TemplateResult {
    const close = (): void => {
      this.#dialog?.close('done');
    };
    switch (this.stage) {
      case 'intro':
        return html`<p>${this.t('roadmap.map.test.intro')}</p>
          ${this.#button(
            this.t('roadmap.map.test.proceed'),
            'primary',
            () => {
              void this.#prepare();
            },
            'start',
          )}
          ${this.#button(this.t('roadmap.map.test.back'), 'secondary', close)}`;
      case 'preparing':
        return html`<p class="tiny">${this.t('roadmap.map.test.sub')}</p>
          <noema-progress label=${this.t('roadmap.map.test.preparing')}></noema-progress>`;
      case 'failed':
        return html`<p class="status bad" role="alert">${this.message}</p>
          ${this.#button(this.t('roadmap.map.close'), 'secondary', close)}`;
      case 'quiz':
        return html`<p class="tiny">${this.t('roadmap.map.test.sub')}</p>
          <noema-roadmap-quiz
            class="quiz"
            .questions=${this.#questions}
            @roadmap-quiz-done=${(e: CustomEvent<QuizDone>): void => {
              this.#done(e);
            }}
          ></noema-roadmap-quiz>`;
      case 'result':
        return html`<p class="status result ${this.mastered ? 'ok' : 'bad'}" role="status">${this.message}</p>
          ${this.#button(this.t('roadmap.map.test.ok'), 'primary', close)}`;
    }
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    const title = c ? this.stepTitle(c, this.step) : this.step;
    return html`<noema-dialog heading=${title}>${this.#body()}</noema-dialog>`;
  }
}
