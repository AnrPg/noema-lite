/**
 * 🧭 The learner's Roadmaps: a card per Roadmap (its progress, shared or not, what waits for the Claude app), the
 * invitations to Roadmaps other people share (📬 Join / No thanks), and the ways to a new one.
 *
 *   <noema-roadmap-library account=… heading=1|2></noema-roadmap-library>   (heading 2: on a page that has its own title)
 *
 * Where to go is asked by an event (bubbling, composed): roadmap-open { roadmap, status } · roadmap-new ·
 * roadmap-from-sources · roadmap-import · roadmap-explore · roadmap-shelf. 👥 on a card opens the sharing dialog here.
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import { summary } from '../domain/status.ts';
import { work } from '../domain/work.ts';
import type { Roadmap } from '../domain/model.ts';
import type { Invite } from './data.ts';
import { RoadmapElement } from './element.ts';
import { NoemaRoadmapShare } from './share.ts';
import { screen } from './styles.ts';

export class NoemaRoadmapInvite extends RoadmapElement {
  static override properties = { account: { type: String }, invite: { attribute: false }, busy: { state: true } };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
      }
      .cm-invite {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        padding: 10px 12px;
        border-radius: var(--u-br);
        background: var(--u-acc-soft);
      }
    `,
  ];
  declare account: string;
  declare invite: Invite | null;
  declare busy: boolean;

  constructor() {
    super();
    this.account = '';
    this.invite = null;
    this.busy = false;
  }

  async #join(i: Invite): Promise<void> {
    this.busy = true;
    try {
      const c = await this.data.share.join(this.account, i.curriculum);
      this.data.notify('👥 ' + this.t('roadmap.map.inv.joined', { title: c.title ?? c.goal ?? '' }));
      this.emit('roadmap-joined', { roadmap: c.id });
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
      this.busy = false;
    }
  }

  async #decline(i: Invite): Promise<void> {
    this.busy = true;
    try {
      await this.data.share.decline(i.curriculum);
      this.data.notify(this.t('roadmap.map.inv.declined'));
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
    }
    this.emit('roadmap-invite-done', { roadmap: i.curriculum });
  }

  override render(): TemplateResult {
    const i = this.invite;
    if (!i) return html``;
    const meta = [
      i.steps ? this.t('roadmap.map.inv.steps', { n: i.steps }) : this.t('roadmap.map.inv.stepsUnknown'),
      i.language ? '🗣️ ' + i.language : '',
      i.message ? `“${i.message}”` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const [before = '', mid = '', after = ''] = this.t('roadmap.map.inv.invites', { who: '\u0001', title: '\u0002' }).split(
      /[\u0001\u0002]/,
    );
    return html`<div class="cm-invite">
      <div class="grow">
        ${before}<strong>${i.owner_name ?? this.t('roadmap.map.inv.someone')}</strong>${mid}<strong>“${i.title}”</strong>${after}
        <div class="tiny">${meta}</div>
      </div>
      <noema-button size="sm" class="cm-join" ?disabled=${this.busy} @click=${(): void => void this.#join(i)}
        >✓ ${this.t('roadmap.map.inv.join')}</noema-button
      >
      <noema-button size="sm" variant="secondary" class="cm-decline" ?disabled=${this.busy} @click=${(): void => void this.#decline(i)}
        >✕ ${this.t('roadmap.map.inv.noThanks')}</noema-button
      >
    </div>`;
  }
}

export class NoemaRoadmapLibrary extends RoadmapElement {
  static override properties = {
    account: { type: String },
    heading: { type: Number, reflect: true },
    invites: { state: true },
    shelf: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
        padding: 16px;
      }
      h1,
      h2 {
        margin: 0 0 4px;
        font-family: var(--u-display);
        font-size: 1.4rem;
      }
      :host([heading='2']) {
        padding: 0;
      }
      h2 {
        font-size: 1.15rem;
      }
      .ways {
        margin: 14px 0;
      }
      .cm-invites {
        display: grid;
        gap: 8px;
        margin: 0 0 14px;
      }
      .cm-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
        gap: 12px;
      }
      .cm-cardwrap {
        position: relative;
      }
      /* the Roadmap's own words (its language, not the interface's) take the direction of their first letter */
      .cm-cardtop strong {
        unicode-bidi: plaintext;
      }
      .cm-card {
        display: grid;
        gap: 6px;
        width: 100%;
        min-height: 96px;
        padding: 14px;
        padding-inline-end: 48px;
        border-radius: var(--u-r);
        border: 1px solid var(--u-line);
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        text-align: start;
        cursor: pointer;
        overflow-wrap: anywhere;
        transition: box-shadow var(--u-fast) ease;
      }
      .cm-card:hover,
      .cm-card:focus-visible {
        box-shadow: var(--u-shadow);
      }
      .cm-card:focus-visible {
        outline: 2px solid var(--u-acc);
      }
      .cm-cardtop {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .cm-bar {
        height: 6px;
        border-radius: 999px;
        background: var(--u-line);
        overflow: hidden;
      }
      .cm-bar i {
        display: block;
        height: 100%;
        background: var(--u-acc);
      }
      .cm-sharebtn {
        position: absolute;
        inset-inline-end: 8px;
        top: 8px;
      }
      .empty {
        text-align: center;
        padding: 32px 12px;
        color: var(--u-ink2);
      }
      .empty .e {
        font-size: 2rem;
      }
      .foot {
        margin-top: 18px;
        justify-content: space-between;
      }
    `,
  ];
  declare account: string;
  /** 1: the page's title; 2: under the title of a page that has its own */
  declare heading: number;
  declare invites: Invite[];
  declare shelf: number | null;
  #off: (() => void) | null = null;

  constructor() {
    super();
    this.account = '';
    this.heading = 1;
    this.invites = [];
    this.shelf = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#off = this.data.onChange(() => {
      this.requestUpdate();
    });
    this.data.app.start(this.account);
    void this.#loadInvites();
    void this.data.shelfCount(this.account).then(n => (this.shelf = n));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
  }

  async #loadInvites(): Promise<void> {
    if (!this.data.cloudOn(this.account)) {
      this.invites = [];
      return;
    }
    this.invites = await this.data.share.invites(this.account).catch(() => []);
  }

  #stats(c: Roadmap): string {
    if (c.status === 'ready') {
      const s = summary(c, this.data.statuses(this.account, c)),
        sh = c.shared && !c.shared.ended;
      return (
        this.t('roadmap.map.lib.cardStats', { m: s.mastered, total: s.total, open: s.open, ready: s.ready }) +
        (sh
          ? ' · ' + this.t('roadmap.map.lib.sharedN', { n: Object.values(c.remote ?? {}).filter(x => x.status === 'ready').length })
          : '') +
        (work(c).done ? '' : ' · 💬 ' + this.t('roadmap.map.lib.waitingClaude'))
      );
    }
    return c.status === 'attach'
      ? '📦 ' + this.t('roadmap.map.lib.attachTap')
      : c.status === 'waiting'
        ? '💬 ' + this.t('roadmap.map.lib.waitingClaudeTap')
        : c.status === 'building'
          ? '⏳ ' + this.t('roadmap.map.lib.building')
          : c.status === 'paused'
            ? '⏸️ ' + this.t('roadmap.map.lib.pausedTap')
            : '⚠️ ' + this.t('roadmap.map.lib.stoppedTap');
  }

  #card(c: Roadmap): TemplateResult {
    const sh = c.shared && !c.shared.ended ? c.shared : null,
      title = this.roadmapTitle(c);
    const pct = c.status === 'ready' ? summary(c, this.data.statuses(this.account, c)).pct : null;
    const canShare = sh?.role !== 'member' && Object.keys(c.nodes).length > 0;
    return html`<div class="cm-cardwrap">
      <button
        class="cm-card"
        data-id=${c.id}
        @click=${(): void => {
          this.emit('roadmap-open', { roadmap: c.id, status: c.status ?? '' });
        }}
      >
        <span class="cm-cardtop"><span aria-hidden="true">${sh ? '👥' : '🧭'}</span><strong>${title}</strong></span>
        ${
          sh
            ? html`<span class="tiny cm-sharedby"
                >👥
                ${
                  sh.role === 'member'
                    ? this.t('roadmap.map.lib.sharedBy', { who: sh.ownerName ?? this.t('roadmap.map.lib.itsOwner') })
                    : this.t('roadmap.map.lib.youShare', { pub: sh['public'] ? 'yes' : 'no' })
                }</span
              >`
            : nothing
        }
        ${pct !== null ? html`<span class="cm-bar"><i style="width:${Math.round(pct * 100)}%"></i></span>` : nothing}
        <span class="tiny">${this.#stats(c)}</span>
      </button>
      ${
        canShare
          ? html`<noema-icon-button
              class="cm-sharebtn"
              icon="share"
              size="sm"
              label=${this.t('roadmap.map.lib.shareAria', { title: c.title ?? c.goal ?? '' })}
              title=${this.t(sh ? 'roadmap.map.lib.sharingTip' : 'roadmap.map.lib.shareTip')}
              @click=${(): void => {
                NoemaRoadmapShare.open({ account: this.account, roadmapId: c.id });
              }}
            ></noema-icon-button>`
          : nothing
      }
    </div>`;
  }

  override render(): TemplateResult {
    const list = this.data.list(this.account);
    const go = (type: string) => (): void => {
      this.emit(type);
    };
    return html`
      ${this.heading === 2 ? html`<h2>🧭 ${this.t('roadmap.map.lib.title')}</h2>` : html`<h1>🧭 ${this.t('roadmap.map.lib.title')}</h1>`}
      <p class="tiny">${this.t('roadmap.map.lib.lead')}</p>
      <div class="row ways">
        <noema-button class="cm-new" @click=${go('roadmap-new')}>➕ ${this.t('roadmap.map.lib.new')}</noema-button>
        <noema-button class="cm-srcbtn" variant="secondary" title=${this.t('roadmap.map.src.lead')} @click=${go('roadmap-from-sources')}
          >📚 ${this.t('roadmap.map.src.title')}</noema-button
        >
        <noema-button class="cm-importbtn" variant="secondary" @click=${go('roadmap-import')}
          >📥 ${this.t('roadmap.map.lib.import')}</noema-button
        >
        <noema-button
          class="cm-explorebtn"
          variant="secondary"
          title=${this.t('roadmap.map.lib.exploreTip')}
          @click=${go('roadmap-explore')}
          >🌍 ${this.t('roadmap.map.lib.explore')}</noema-button
        >
      </div>
      <p class="tiny">${this.t('roadmap.map.lib.eachStep')}</p>
      ${
        this.invites.length
          ? html`<div class="cm-invites">
              <strong>📬 ${this.t('roadmap.map.lib.invitesN', { n: this.invites.length })}</strong>
              ${this.invites.map(
                i =>
                  html`<noema-roadmap-invite
                    account=${this.account}
                    .invite=${i}
                    @roadmap-joined=${(e: CustomEvent<{ roadmap: string }>): void => {
                      this.emit('roadmap-open', { roadmap: e.detail.roadmap, status: 'ready' });
                    }}
                    @roadmap-invite-done=${(): void => void this.#loadInvites()}
                  ></noema-roadmap-invite>`,
              )}
            </div>`
          : nothing
      }
      ${
        list.length
          ? html`<div class="cm-cards">${list.map(c => this.#card(c))}</div>`
          : html`<div class="empty">
              <div class="e" aria-hidden="true">🧭</div>
              <p>${this.t('roadmap.map.lib.empty')}</p>
            </div>`
      }
      <div class="row foot">
        <noema-button
          size="sm"
          variant="quiet"
          class="cm-shelflink"
          title=${this.t('roadmap.map.lib.shelfTip')}
          @click=${go('roadmap-shelf')}
          >📚 ${this.shelf === null ? this.t('roadmap.map.lib.shelf') : this.t('roadmap.map.lib.shelfN', { n: this.shelf })}</noema-button
        >
      </div>
    `;
  }
}
