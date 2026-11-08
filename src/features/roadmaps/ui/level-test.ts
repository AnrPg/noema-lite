/**
 * 🪜 A level's final test (a Roadmap with levelTest, docs/CURRICULUM.md §11): questions from the level's own prepared
 * subjects, no AI asked. First what the test is, then the questions, then the result; passed (≥ 80 %) → the level is
 * reached (NoemaCore.roadmaps.levels.testTaken) and the element fires `roadmap-levels-changed` with { passed, reached }.
 *
 *   openDialog(Object.assign(document.createElement('noema-roadmap-level-test'), { account, roadmapId, level }))
 */
import { css, html, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import { levelTestFrom, stepsAt, type TestQuestion } from '../domain/levels.ts';
import type { Roadmap } from '../domain/model.ts';
import { RoadmapElement } from './element.ts';
import type { QuizDone } from './quiz.ts';
import { screen } from './styles.ts';

type Stage = 'loading' | 'intro' | 'empty' | 'quiz' | 'result';

export interface LevelsChanged {
  readonly passed: boolean;
  readonly reached: readonly string[];
}

export class NoemaRoadmapLevelTest extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    level: { type: String },
    stage: { state: true },
    outcome: { state: true },
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
  declare level: string;
  declare stage: Stage;
  declare outcome: { passed: boolean; right: number; total: number; error: string } | null;
  #questions: TestQuestion[] = [];

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.level = '';
    this.stage = 'loading';
    this.outcome = null;
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  get #roadmap(): Roadmap | null {
    return this.data.roadmap(this.account, this.roadmapId);
  }

  /** Opens the test: its questions are gathered from the level's prepared subjects meanwhile. */
  show(): void {
    this.#dialog?.show();
    void this.#load();
  }

  async #load(): Promise<void> {
    const c = this.#roadmap;
    if (!c) return;
    const packs = await this.data.packs(this.account, c, stepsAt(c, this.level));
    this.#questions = levelTestFrom(packs, { rand: Math.random, tf: [this.t('roadmap.test.true'), this.t('roadmap.test.false')] });
    this.stage = this.#questions.length ? 'intro' : 'empty';
  }

  async #done(e: CustomEvent<QuizDone>): Promise<void> {
    const c = this.#roadmap;
    if (!c) return;
    const { right, total } = e.detail;
    const r = await this.data.levels.testTaken(this.account, c, this.level, right / total, {
      now: this.services.clock.now(),
      attempt: String(this.services.clock.now()),
      mastered: this.data.mastered(this.account, c),
    });
    const passed = r.ok && r.value.passed;
    this.outcome = { passed, right, total, error: r.ok ? '' : this.i18n.err(r.error) };
    this.stage = 'result';
    this.emit('roadmap-levels-changed', { passed, reached: r.ok ? r.value.reached.map(x => x.level) : [] } satisfies LevelsChanged);
  }

  #close(): void {
    this.#dialog?.close('done');
  }

  #body(): TemplateResult {
    const close = html`<noema-button
      slot="actions"
      variant="secondary"
      @click=${(): void => {
        this.#close();
      }}
      >${this.t('roadmap.map.close')}</noema-button
    >`;
    switch (this.stage) {
      case 'loading':
        return html`<noema-progress label=${this.t('roadmap.levels.test.loading')}></noema-progress>`;
      case 'empty':
        return html`<p>${this.t('roadmap.levels.test.notReady')}</p>
          ${close}`;
      case 'intro':
        return html`<p>${this.t('roadmap.levels.test.intro', { n: this.#questions.length })}</p>
          <noema-button
            slot="actions"
            variant="primary"
            class="start"
            @click=${(): void => {
              this.stage = 'quiz';
            }}
            >${this.t('roadmap.map.test.proceed')}</noema-button
          >
          <noema-button
            slot="actions"
            variant="secondary"
            @click=${(): void => {
              this.#close();
            }}
            >${this.t('roadmap.map.test.back')}</noema-button
          >`;
      case 'quiz':
        return html`<noema-roadmap-quiz
          class="quiz"
          .questions=${this.#questions}
          @roadmap-quiz-done=${(e: CustomEvent<QuizDone>): void => {
            void this.#done(e);
          }}
        ></noema-roadmap-quiz>`;
      case 'result': {
        const o = this.outcome ?? { passed: false, right: 0, total: 0, error: '' };
        return html`<p class="status result ${o.passed ? 'ok' : 'bad'}" role="status">
            ${o.error || this.t(o.passed ? 'roadmap.levels.test.passed' : 'roadmap.levels.test.failed', { right: o.right, total: o.total })}
          </p>
          <noema-button
            slot="actions"
            variant="primary"
            @click=${(): void => {
              this.#close();
            }}
            >${this.t('roadmap.map.test.ok')}</noema-button
          >`;
      }
    }
  }

  override render(): TemplateResult {
    const c = this.#roadmap;
    return html`<noema-dialog heading=${this.t('roadmap.levels.test.title', { level: c ? this.levelLabel(c, this.level) : this.level })}>
      ${this.#body()}
    </noema-dialog>`;
  }
}
