/**
 * 💬 Prepare many steps ahead in the learner's Claude app (even locked ones, in study order), with or without their
 * review — and how to let Claude Desktop do it overnight with a scheduled task. After queueing: how many were queued,
 * how many wait for a review or a chapter plan, and the message to copy.
 *
 *   <noema-roadmap-prepare-ahead account=… roadmap-id=…></noema-roadmap-prepare-ahead>
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaSelect, NoemaSwitch } from '../../../ui/index.ts';
import type { QueueResult } from './data.ts';
import { RoadmapElement } from './element.ts';
import { autoApprove } from './marks.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapPrepareAhead extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    howMany: { state: true },
    done: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: grid;
        gap: 10px;
      }
      summary {
        cursor: pointer;
        min-height: 24px;
        color: var(--u-acc-text);
      }
      ol {
        margin: 6px 0 0;
        padding-inline-start: 1.4em;
        line-height: 1.5;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare howMany: string;
  declare done: QueueResult | null;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.howMany = '';
    this.done = null;
  }

  #queue(): void {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return;
    const review = !(this.renderRoot.querySelector<NoemaSwitch>('.cm-noreview')?.checked ?? false);
    const n = this.renderRoot.querySelector<NoemaSelect>('.cm-qmany')?.value ?? 'all';
    this.done = this.data.prep.queueMany(this.account, c, n === 'all' ? 'all' : Number(n), { review });
    this.emit('roadmap-queued', { roadmap: c.id, ...this.done });
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return html``;
    const nodes = Object.values(c.nodes),
      left = nodes.filter(n => !['ready', 'generating', 'app'].includes(n.pack?.status ?? '')).length,
      inQueue = nodes.filter(n => n.pack?.status === 'app').length;
    const options = [
      ...[5, 10, 20].filter(k => k < left).map(k => ({ value: String(k), label: this.t('roadmap.map.q.next', { n: k }) })),
      { value: 'all', label: this.t('roadmap.map.q.all', { n: left }) },
    ];
    const d = this.done;
    return html`
      <p class="tiny">${this.t('roadmap.map.q.lead')}${inQueue ? ' ' + this.t('roadmap.map.q.inQueue', { n: inQueue }) : ''}</p>
      <noema-select
        class="cm-qmany"
        label=${this.t('roadmap.map.q.howMany')}
        .options=${options}
        .value=${options[0]?.value ?? 'all'}
      ></noema-select>
      <noema-switch class="cm-noreview" label=${this.t('roadmap.map.q.noReview')} ?checked=${autoApprove(c)}></noema-switch>
      <div class="row">
        <noema-button
          class="cm-queuemany"
          ?disabled=${!left}
          @click=${(): void => {
            this.#queue();
          }}
          >💬 ${this.t('roadmap.map.q.go')}</noema-button
        >
      </div>
      ${
        d
          ? html`<div class="status cm-qlog" role="status">
              💬
              ${this.t('roadmap.map.q.queued', { n: d.queued })}${d.needReview ? ' ' + this.t('roadmap.map.q.needReview', { n: d.needReview }) : ''}${
                d.needPlan ? ' ' + this.t('roadmap.map.q.needPlan', { n: d.needPlan, app: c.provider === 'claudeapp' ? 'yes' : 'no' }) : ''
              }
              ${
                d.queued
                  ? html`<div class="row">
                      <noema-button
                        size="sm"
                        class="cm-qcopy"
                        @click=${(): void => {
                          const latest = this.data.roadmap(this.account, this.roadmapId) ?? c;
                          void this.data.copy(this.data.app.message(latest, 1)).then(ok => {
                            if (ok) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
                          });
                        }}
                        >📋 ${this.t('roadmap.map.q.copy')}</noema-button
                      >
                    </div>`
                  : nothing
              }
            </div>`
          : nothing
      }
      <details>
        <summary>${this.t('roadmap.map.q.night')}</summary>
        <ol class="tiny">
          <li>${this.t('roadmap.map.q.n1')}</li>
          <li>${this.t('roadmap.map.q.n2')}</li>
          <li>${this.t('roadmap.map.q.n3')}</li>
          <li>${this.t('roadmap.map.q.n4')}</li>
        </ol>
      </details>
    `;
  }
}
