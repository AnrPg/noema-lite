/**
 * 🪜 Claude's new arrangement of a Roadmap's levels (noema_restructure_levels), change by change, in the learner's words:
 * the owner applies it or keeps the Roadmap as it is. Nothing is lost either way. On a decision it fires
 * `roadmap-restructured` with { approved } and closes.
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import type { Level, LevelRef } from '../../../contracts/rules/levels.ts';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import { ladder } from '../domain/levels.ts';
import type { Proposal, Roadmap } from '../domain/model.ts';
import { changes, type Change } from '../domain/restructure.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapRestructure extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    proposal: { type: String },
    busy: { state: true },
    error: { state: true },
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
  declare proposal: string;
  declare busy: '' | 'approve' | 'decline';
  declare error: string;

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.proposal = '';
    this.busy = '';
    this.error = '';
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  show(): void {
    this.#dialog?.show();
  }

  #find(): { c: Roadmap; p: Proposal } | null {
    const c = this.data.roadmap(this.account, this.roadmapId),
      p = c?.proposals?.find(x => x.id === this.proposal);
    return c && p ? { c, p } : null;
  }

  async #decide(approve: boolean): Promise<void> {
    this.busy = approve ? 'approve' : 'decline';
    this.error = '';
    const e = await this.data.decide(this.account, this.roadmapId, this.proposal, approve);
    this.busy = '';
    if (e) {
      this.error = e;
      return;
    }
    this.data.notify(this.t(approve ? 'roadmap.jobs.restructured' : 'roadmap.levels.proposal.declined'));
    this.emit('roadmap-restructured', { approved: approve });
    this.#dialog?.close(approve ? 'approve' : 'decline');
  }

  /** One change, as a sentence (the levels by their names: the proposal's new ones too). */
  #line(c: Roadmap, x: Change, among: readonly Level[]): string {
    const lv = (r: LevelRef | null): string =>
      r == null
        ? this.t('roadmap.levels.none')
        : typeof r === 'string'
          ? this.levelLabel(c, r, among)
          : `${this.levelLabel(c, r.from, among)}–${this.levelLabel(c, r.to, among)}`;
    switch (x.kind) {
      case 'ladder':
        return this.t('roadmap.levels.change.ladder', { levels: this.i18n.format.list(x.levels.map(i => this.levelLabel(c, i, among))) });
      case 'level':
        return this.t('roadmap.levels.change.level', { step: x.title, from: lv(x.from), to: lv(x.to) });
      case 'chapter':
        return this.t('roadmap.levels.change.chapter', { step: x.title, chapter: x.chapter, level: lv(x.to) });
      case 'split':
        return this.t('roadmap.levels.change.split', { step: x.title, parts: this.i18n.format.list(x.parts) });
      case 'merge':
        return this.t('roadmap.levels.change.merge', { step: x.title, steps: this.i18n.format.list(x.from) });
      case 'link':
        return this.t('roadmap.levels.change.link', { from: x.from, to: x.to });
      case 'unlink':
        return this.t('roadmap.levels.change.unlink', { from: x.from, to: x.to });
    }
  }

  override render(): TemplateResult {
    const f = this.#find();
    const heading = this.t('roadmap.levels.proposal.title');
    if (!f) return html`<noema-dialog heading=${heading}><p>${this.t('roadmap.levels.proposal.gone')}</p></noema-dialog>`;
    const { c, p } = f,
      among = [...(p.plan.levels ?? []), ...ladder(c)];
    return html`<noema-dialog heading=${heading}>
      ${p.plan.why ? html`<p class="why">${p.plan.why}</p>` : nothing}
      <ul class="changes">
        ${changes(c, p.plan).map(x => html`<li>${this.#line(c, x, among)}</li>`)}
      </ul>
      <p class="tiny">${this.t('roadmap.levels.proposal.keep')}</p>
      ${this.error ? html`<p class="status bad" role="alert">${this.error}</p>` : nothing}
      <noema-button
        slot="actions"
        class="apply"
        variant="primary"
        ?busy=${this.busy === 'approve'}
        ?disabled=${!!this.busy}
        @click=${(): void => {
          void this.#decide(true);
        }}
        >${this.t('roadmap.levels.proposal.approve')}</noema-button
      >
      <noema-button
        slot="actions"
        class="decline"
        variant="secondary"
        ?busy=${this.busy === 'decline'}
        ?disabled=${!!this.busy}
        @click=${(): void => {
          void this.#decide(false);
        }}
        >${this.t('roadmap.levels.proposal.decline')}</noema-button
      >
    </noema-dialog>`;
  }
}
