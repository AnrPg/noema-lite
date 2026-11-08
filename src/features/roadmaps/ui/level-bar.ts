/**
 * 🪜 The levels of a Roadmap on its map (docs/CURRICULUM.md §11): the ladder (each level done, current or ahead), how far
 * the current level is, the level test when one is due, and a new arrangement Claude proposed (only the owner decides).
 * Moving up is automatic: each refresh reaches every level that is done (NoemaCore.roadmaps.levels.advance) and shows the
 * level-reached moment. It fires `roadmap-levels-changed` after a level test or a decision (the map draws again).
 *
 *   <noema-roadmap-levels account=… roadmap-id=…></noema-roadmap-levels>   bar.refresh() after the statuses change
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { LevelView } from '../application/levels.ts';
import { pendingProposal } from '../domain/inbox.ts';
import type { Roadmap } from '../domain/model.ts';
import { RoadmapElement } from './element.ts';
import { NoemaRoadmapLevelReached } from './level-reached.ts';
import { NoemaRoadmapLevelTest, type LevelsChanged } from './level-test.ts';
import { openDialog } from './open.ts';
import { NoemaRoadmapRestructure } from './restructure.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapLevels extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    view: { state: true },
    proposal: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
      }
      :host([hidden]) {
        display: none;
      }
      .box {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid var(--u-line);
        border-radius: var(--u-r);
        background: var(--u-paper);
      }
      .ladder {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .prop {
        padding: 8px 10px;
        border-radius: var(--u-br);
        background: var(--u-info);
        color: var(--u-info-ink);
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare view: LevelView | null;
  declare proposal: string;
  #run: Promise<void> | null = null;
  #again = false;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.view = null;
    this.proposal = '';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.refresh();
  }

  /** Reads the Roadmap again: moves up where a level is done, then shows where the learner is. One run at a time. */
  refresh(): void {
    if (this.#run) {
      this.#again = true;
      return;
    }
    this.#run = this.#advance().finally(() => {
      this.#run = null;
      if (this.#again && this.isConnected) {
        this.#again = false;
        this.refresh();
      }
    });
  }

  /** the current run (tests wait for it) */
  get settled(): Promise<void> {
    return this.#run ?? Promise.resolve();
  }

  async #advance(): Promise<void> {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) {
      this.view = null;
      this.proposal = '';
      return;
    }
    this.proposal = this.data.isMember(c) ? '' : (pendingProposal(c)?.id ?? '');
    if (!c.levels?.length) {
      this.view = null;
      return;
    }
    const mastered = this.data.mastered(this.account, c);
    const moved = await this.data.levels.advance(this.account, c, mastered, this.services.clock.now());
    if (moved.ok && moved.value.reached.length) {
      const top = moved.value.reached[moved.value.reached.length - 1];
      if (top) this.#moment(top.level);
    }
    const v = await this.data.levels.view(this.account, c, mastered);
    this.view = v.ok ? v.value : null;
  }

  #moment(level: string): void {
    openDialog(Object.assign(new NoemaRoadmapLevelReached(), { account: this.account, roadmapId: this.roadmapId, level }));
  }

  #test(level: string): void {
    const d = openDialog(Object.assign(new NoemaRoadmapLevelTest(), { account: this.account, roadmapId: this.roadmapId, level }));
    let passed = false;
    d.addEventListener('roadmap-levels-changed', e => {
      e.stopPropagation();
      const detail = (e as CustomEvent<LevelsChanged>).detail;
      passed = detail.passed;
      this.refresh();
      this.emit('roadmap-levels-changed', detail);
    });
    // passed: the level-reached moment once the test's result is read and closed
    d.addEventListener('noema-close', () => {
      if (passed) this.#moment(level);
    });
  }

  #review(): void {
    const d = openDialog(
      Object.assign(new NoemaRoadmapRestructure(), { account: this.account, roadmapId: this.roadmapId, proposal: this.proposal }),
    );
    d.addEventListener('roadmap-restructured', () => {
      this.refresh();
      this.emit('roadmap-levels-changed', { passed: false, reached: [] });
    });
  }

  #ladder(c: Roadmap, v: LevelView): TemplateResult {
    const cur = v.current?.id,
      got = new Set(v.reached),
      top = !!cur && got.has(cur);
    return html`<ol class="ladder" aria-label=${this.t('roadmap.levels.ladder')}>
      ${v.ladder.map(
        l =>
          html`<li>
            <noema-level-badge
              .level=${{ ...l, names: { ...l.names, [this.i18n.locale()]: this.levelLabel(c, l.id) } }}
              of=${v.ladder.length}
              state=${got.has(l.id) ? 'done' : l.id === cur && !top ? 'current' : 'ahead'}
            ></noema-level-badge>
          </li>`,
      )}
    </ol>`;
  }

  override render(): TemplateResult | typeof nothing {
    const c = this.data.roadmap(this.account, this.roadmapId),
      v = this.view;
    if (!c || (!v && !this.proposal)) return nothing;
    const cur = v?.current ?? null,
      top = !!cur && !!v?.reached.includes(cur.id),
      p = cur && v ? v.progress.find(x => x.id === cur.id) : undefined;
    return html`<div class="box" role="group" aria-label=${this.t('roadmap.levels.title')}>
      ${
        this.proposal
          ? html`<div class="row prop">
              <span class="grow">${this.t('roadmap.levels.proposal.banner')}</span>
              <noema-button
                class="review"
                size="sm"
                variant="primary"
                @click=${(): void => {
                  this.#review();
                }}
                >${this.t('roadmap.levels.proposal.review')}</noema-button
              >
            </div>`
          : nothing
      }
      ${
        v && cur
          ? html`${this.#ladder(c, v)}
              <div class="row now">
                <span class="grow tiny">
                  ${top ? this.t('roadmap.levels.top') : this.t('roadmap.levels.current', { level: this.levelLabel(c, cur.id) })}
                </span>
              </div>
              ${
                p && !top && p.steps.length
                  ? html`<noema-progress
                      label=${this.t('roadmap.levels.progress', { level: this.levelLabel(c, cur.id) })}
                      value=${p.mastered}
                      max=${p.steps.length}
                      show="count"
                    ></noema-progress>`
                  : nothing
              }
              ${
                v.testDue
                  ? html`<div class="row due">
                      <span class="grow tiny">${this.t('roadmap.levels.test.due', { level: this.levelLabel(c, v.testDue) })}</span>
                      <noema-button
                        class="take"
                        size="sm"
                        variant="primary"
                        @click=${(): void => {
                          if (v.testDue) this.#test(v.testDue);
                        }}
                        >${this.t('roadmap.levels.test.take')}</noema-button
                      >
                    </div>`
                  : nothing
              }`
          : nothing
      }
    </div>`;
  }
}
