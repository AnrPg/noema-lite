/**
 * The frame every screen lives in (docs/UI_MAP.md): on phones a top bar that slides away while reading and bottom tabs;
 * on wider screens a left rail with "Me" and ⚑ at its foot. The top bar: ← back, where you are (crumbs), the page's own
 * actions and its ⋮, 🔎, 🔔 and Me. The character's still landscape behind, its face as the brand, the tutor's button
 * (with its name) in the corner.
 *
 * The parts the older screens fill themselves stay stable nodes the root hands over (`parts`): the page's actions, the
 * share bar, <main id="ns-main">, the effects layer and the overlay layer. What the frame shows is its `model`; what
 * the learner does with it goes out as events (shell-go, shell-back, shell-bell, shell-me, shell-find, shell-fab,
 * shell-report).
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ShellElement } from './base.ts';

export interface FrameTab {
  readonly key: string;
  readonly href: string;
  /** a line icon's key, or text (文A) */
  readonly icon: string;
  readonly text?: boolean;
  readonly label: string;
  readonly title: string;
  /** waiting there (people) */
  readonly badge?: number;
}
export interface FrameCrumb {
  readonly label: string;
  readonly href?: string | null;
}
export interface FrameModel {
  readonly tabs: readonly FrameTab[];
  readonly tab: string | null;
  readonly crumbs: readonly FrameCrumb[];
  readonly back: boolean;
  readonly me: { readonly emoji: string; readonly name: string };
  readonly bell: number;
  /** the sync dot on Me (cloud accounts): its state and words */
  readonly sync: { readonly state: 'ok' | 'busy' | 'err'; readonly title: string } | null;
  readonly reportDot: boolean;
  readonly report: boolean;
  readonly fab: boolean;
  readonly reading: boolean;
}
export interface FrameParts {
  readonly acts: HTMLElement;
  readonly share: HTMLElement;
  readonly main: HTMLElement;
  readonly fx: HTMLElement;
  readonly layer: HTMLElement;
  /** the 5-minute try's bar */
  readonly preview: HTMLElement;
}

export const EMPTY_FRAME: FrameModel = {
  tabs: [],
  tab: null,
  crumbs: [],
  back: false,
  me: { emoji: '?', name: '' },
  bell: 0,
  sync: null,
  reportDot: false,
  report: false,
  fab: true,
  reading: false,
};

/** the width from which the frame is a rail (engine/src/95_shell.css) */
export const RAIL_PX = 760;

export class NoemaShellFrame extends ShellElement {
  static override properties = { ...ShellElement.properties, model: { attribute: false }, parts: { attribute: false } };
  declare model: FrameModel;
  declare parts: FrameParts | undefined;
  #lastY = 0;
  #upRun = 0;
  #shownAt = 0;
  #onScroll = (): void => {
    this.#scrolled();
  };

  constructor() {
    super();
    this.model = EMPTY_FRAME;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents';
    addEventListener('scroll', this.#onScroll, { passive: true });
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    removeEventListener('scroll', this.#onScroll);
  }
  /** the top bar (shown again whenever the page changes) */
  get top(): HTMLElement | null {
    return this.querySelector('#ns-top');
  }
  showTop(): void {
    this.top?.classList.remove('hide');
  }
  /** phones: the top bar slides away while reading and comes back after a deliberate scroll up */
  #scrolled(): void {
    const top = this.top;
    if (!top || innerWidth >= RAIL_PX) return;
    const y = scrollY,
      d = y - this.#lastY;
    this.#lastY = y;
    if (d > 4 && y > 80) {
      this.#upRun = 0;
      top.classList.add('hide');
    } else if (d < 0) {
      this.#upRun -= d;
      if (this.#upRun > 60 && top.classList.contains('hide')) {
        top.classList.remove('hide');
        this.#shownAt = Date.now();
      }
    }
    if (y < 10) top.classList.remove('hide');
  }
  /** a tap on the bar just as it came back is not a tap on what it covers */
  #guard = (e: Event): void => {
    if (Date.now() - this.#shownAt < 300) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    document.body.classList.toggle('ns-reading', this.model.reading);
    const tabs = this.querySelector<HTMLElement>('.ns-tabs');
    tabs?.style.setProperty('--n', String(this.model.tabs.length));
  }

  #tab(t: FrameTab): TemplateResult {
    const people = t.key === 'people';
    const n = t.badge ?? 0;
    return html`<button
      class=${'ns-tab' + (people ? ' bell ns-peoplebtn' : '') + (people && n ? ' has' : '') + (this.model.tab === t.key ? ' on' : '')}
      id=${people ? 'ns-people' : nothing}
      title=${t.title}
      aria-label=${people && n ? this.L('peopleN', { n }) : nothing}
      data-tab=${t.key}
      @click=${() => this.emit('shell-go', t.href)}
    >
      <span class="i2">${t.text ? html`<span class="ns-tx">${t.icon}</span>` : this.icon(t.icon)}</span><span class="lb">${t.label}</span>${people
        ? html`<span class="bellbadge" style=${n ? '' : 'display:none'}>${n || ''}</span>`
        : nothing}
    </button>`;
  }

  override render(): TemplateResult {
    const m = this.model,
      p = this.parts,
      ch = this.ctx?.character() ?? 'hedge',
      art = this.ctx?.art;
    const crumbs = m.crumbs.flatMap((c, i) => [
      i ? html`<span class="sep" aria-hidden="true">›</span>` : nothing,
      c.href ? html`<button @click=${() => this.emit('shell-go', c.href)}>${c.label}</button>` : html`<b>${c.label}</b>`,
    ]);
    const tutor = this.ctx?.tutorVars().tutor ?? '';
    return html`
      <div class="ns-land" aria-hidden="true">${unsafeHTML(art?.land(ch) ?? '')}</div>
      ${p?.preview ?? nothing}
      <button class="ns-brand" aria-label=${this.L('today')} @click=${() => this.emit('shell-go', '#/')}>${unsafeHTML(art?.mascot(ch) ?? '')}</button>
      <header class="ns-top" id="ns-top" @click=${this.#guard}>
        <button class=${'ns-back' + (m.back ? ' on' : '')} aria-label=${this.L('back')} @click=${() => this.emit('shell-back')}>←</button>
        <nav class="ns-crumbs" aria-label=${this.L('where')}>${crumbs}</nav>
        ${p?.acts ?? nothing}
        <button
          class="ns-iconbtn ns-find"
          id="ns-find"
          title=${this.L('sr_search')}
          aria-label=${this.L('sr_search')}
          aria-keyshortcuts="/"
          @click=${() => this.emit('shell-find')}
        >
          ${this.icon('search')}
        </button>
        <button
          class=${'ns-iconbtn bell' + (m.bell ? ' has' : '')}
          id="bellbtn"
          title=${this.L('notifications')}
          aria-label=${m.bell ? this.L('notificationsN', { n: m.bell }) : this.L('notifications')}
          @click=${() => this.emit('shell-bell')}
        >
          ${this.icon('bell')}<span class="bellbadge" style=${m.bell ? '' : 'display:none'}>${m.bell || ''}</span>
        </button>
        <button
          class="ns-me acchip"
          id="ns-topme"
          title=${this.L('me')}
          aria-label=${this.L('meLong')}
          data-pop="1"
          aria-haspopup="menu"
          aria-expanded="false"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.emit('shell-me', { anchor: e.currentTarget, rail: false });
          }}
        >
          <span class="ns-meemo">${m.me.emoji}</span>${m.sync
            ? html`<i class=${'syncdot ' + m.sync.state} id="syncdot" title=${m.sync.title}></i>`
            : nothing}
        </button>
      </header>
      ${p?.share ?? nothing}
      <nav class="ns-tabs" aria-label=${this.L('mainNav')}>${m.tabs.map(t => this.#tab(t))}</nav>
      <button
        class=${'ns-railme' + (m.tab === 'me' ? ' on' : '')}
        data-pop="1"
        aria-haspopup="menu"
        aria-expanded="false"
        @click=${(e: Event) => {
          e.stopPropagation();
          this.emit('shell-me', { anchor: e.currentTarget, rail: true });
        }}
      >
        <span class="ns-me"><span class="ns-meemo">${m.me.emoji}</span></span><span class="ns-mename" title=${m.me.name}
          >${m.me.name || this.L('me')}</span
        >
      </button>
      ${m.report
        ? html`<button
            class=${'ns-railreport nr-skip' + (m.reportDot ? ' has-dot' : '')}
            id="ns-report"
            title=${this.t('report.buttonTip')}
            aria-label=${this.t('report.button')}
            @click=${(e: Event) => {
              e.stopPropagation();
              this.emit('shell-report');
            }}
          >
            ${this.icon('report')}<i class="ns-dot" aria-hidden="true"></i>
          </button>`
        : nothing}
      ${p?.main ?? nothing}
      <button
        class="ns-fab full"
        id="ns-fab"
        ?hidden=${!m.fab}
        aria-label=${this.L('askTutor')}
        title=${this.L('askTutor')}
        @click=${() => this.emit('shell-fab')}
      >
        <span class="ns-fabface breathe">${unsafeHTML(art?.mascot(ch) ?? '')}</span><span class="nm">${tutor}</span>
      </button>
      ${p?.fx ?? nothing} ${p?.layer ?? nothing}
    `;
  }
}
