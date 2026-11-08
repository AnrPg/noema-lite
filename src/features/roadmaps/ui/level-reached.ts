/**
 * 🎉 The moment a learner moves up a level: a short, quiet card with the level reached (its badge on the ladder) and what
 * comes next — once per move, then back to the map. The badge rises in softly (none with reduced motion: the kit's
 * --u-motion is 0 then).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import { ladder } from '../domain/levels.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapLevelReached extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    level: { type: String },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: contents;
      }
      .moment {
        display: grid;
        justify-items: center;
        gap: 12px;
        padding: 8px 0 4px;
        text-align: center;
      }
      .moment noema-level-badge {
        animation: rise calc(0.6s * var(--u-motion, 1)) var(--u-ease) both;
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      .big {
        margin: 0;
        font-family: var(--u-display);
        font-size: 1.25rem;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare level: string;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.level = '';
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  show(): void {
    this.#dialog?.show();
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    const L = c ? ladder(c) : [],
      i = L.findIndex(l => l.id === this.level),
      l = L[i],
      next = L[i + 1];
    const name = c ? this.levelLabel(c, this.level) : this.level;
    return html`<noema-dialog heading=${this.t('roadmap.levels.moment.title')}>
      <div class="moment">
        ${l ? html`<noema-level-badge .level=${l} of=${L.length} state="done"></noema-level-badge>` : nothing}
        <p class="big" role="status">${this.t('roadmap.levels.reached', { level: name })}</p>
        <p class="tiny">
          ${c && next ? this.t('roadmap.levels.moment.next', { level: this.levelLabel(c, next.id) }) : this.t('roadmap.levels.top')}
        </p>
      </div>
      <noema-button
        slot="actions"
        variant="primary"
        autofocus
        @click=${(): void => {
          this.#dialog?.close('ok');
        }}
        >${this.t('roadmap.levels.moment.go')}</noema-button
      >
    </noema-dialog>`;
  }
}
