/**
 * #/srun: a round made from search results, step by step: this subject's exercises (a round, #/run), then its cards
 * (the deck on this page), then the next step or back to the results.
 */
import type { Exercise } from '../../domain/pack.ts';
import type { CardItem, StudyApp } from '../app.ts';
import { html, nothing, render, show, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { flashDeck } from './cards.ts';

export function searchRunView(app: StudyApp): void {
  const X = app.host.search;
  const st = X.step();
  if (!st) {
    app.go(X.page);
    return;
  }
  const after = X.after();
  const leave = (): void => {
    if (after) after.run();
    else app.go(st.back);
  };
  if (st.kind === 'ex') {
    const list = (st.ids ?? []).map(id => app.course.exercise(id)).filter((e): e is Exercise => !!e);
    if (list.length) app.startRound(list, { title: st.title, count: list.length, back: st.back, after, keepOrder: true });
    else leave();
    return;
  }
  const keys = new Set(st.keys ?? []),
    cards = app.cards().filter(c => keys.has(c.key));
  if (!cards.length) {
    leave();
    return;
  }
  app.host.frame.chrome({ sub: true, crumbs: [[st.title]], back: st.back, reading: true });
  show(app, new StudySearchCards(app, { title: st.title, back: st.back, after, cards }));
}

interface CardsStep {
  readonly title: string;
  readonly back: string;
  readonly after: { readonly label: string; run(): void } | null;
  readonly cards: readonly CardItem[];
}

/** the cards of a search round's step: the deck, then the next step or back to the results */
export class StudySearchCards extends StudyScreen {
  readonly #step: CardsStep;
  readonly #deck: HTMLDivElement;

  constructor(app: StudyApp, step: CardsStep) {
    super(app);
    this.#step = step;
    this.#deck = document.createElement('div');
    flashDeck(app, this.#deck, step.cards, { all: true, onDone: () => this.#end() });
  }

  /** the deck's last word: the next step, or back to the results */
  #end(): HTMLElement {
    const { after, back } = this.#step;
    const box = document.createElement('div');
    render(
      html`<div class="row" style="justify-content:center">
        ${
          after
            ? html`<button
                class="btn primary ns-srnext"
                type="button"
                @click=${() => {
                  after.run();
                }}
              >
                ${after.label}
              </button>`
            : nothing
        }
        <button
          class="btn"
          type="button"
          @click=${() => {
            this.app.go(back);
          }}
        >
          ${this.app.L('sr_backToResults')}
        </button>
      </div>`,
      box,
    );
    return box.firstElementChild as HTMLElement;
  }

  protected page(): TemplateResult {
    return html`<h1>${this.#step.title}</h1>
      ${this.#deck}`;
  }
}
tag('study-search-cards', StudySearchCards);
