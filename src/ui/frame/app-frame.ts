/**
 * The frame every screen lives in (docs/UI_MAP.md "The frame"): the top bar (← back · the crumbs of where you are · the
 * page's own buttons · the frame's end buttons: 🔎 🔔 Me), the main tabs (a bar at the bottom on phones, a rail at the
 * start of the line from 760 px), the page in <main>, and the overlay layer (toasts, dialogs).
 *
 *   <noema-app-frame .tabs=${tabs} current="today" .crumbs=${[{ label: 'Physics', href: '#/subject' }, { label: 'Chapter 2' }]}
 *                    back="#/subject" autohide>
 *     <noema-menu slot="actions" label="More">…</noema-menu>
 *     <noema-icon-button slot="end" icon="bell" label="Notifications"></noema-icon-button>
 *     <noema-button slot="rail-end">…</noema-button>         (the foot of the rail on wide screens)
 *     …the page…
 *   </noema-app-frame>
 *
 * Accessibility: one banner (the top bar), one navigation for the tabs (the current one aria-current="page") and one for
 * the crumbs, one main; "Skip to the content" is the first stop of the keyboard; the frame speaks the interface
 * language (lang, dir on the host: the crumbs, the tabs and the arrows follow it). Small screens: nothing scrolls
 * sideways at 320 px — crumbs shrink to the last one (← takes you back), tab names below 400 px show for the open tab
 * only (the others keep theirs as their name and tip). With `autohide` the top bar slides away while the learner scrolls
 * down on a phone and comes back on a deliberate scroll up (never while an overlay is open).
 */
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { NoemaElement } from '../core/element.ts';
import { openOverlays } from '../core/overlays.ts';
import { base, control } from '../core/styles.ts';
import { icon, isIconName } from '../kit/icons.ts';
import { NoemaLayer } from './layer.ts';

export interface FrameTab {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly href: string;
  /** what waits there (a count: shown as a dot with its number) */
  readonly badge?: number;
}
export interface Crumb {
  readonly label: string;
  /** where it leads (none: the page you are on) */
  readonly href?: string;
}

/** the phone/wide boundary of the frame (docs/UI_MAP.md: a rail from 760 px) */
export const WIDE_PX = 760;

export class NoemaAppFrame extends NoemaElement {
  static override properties = {
    tabs: { attribute: false },
    current: { type: String, reflect: true },
    crumbs: { attribute: false },
    back: { type: String },
    autohide: { type: Boolean },
  };
  static override styles = [
    base,
    control,
    css`
      :host {
        display: block;
        min-height: 100dvh;
        background: var(--u-bg);
        color: var(--u-ink);
        --noema-bottom-inset: 64px;
      }
      :host([dir='rtl']) {
        --u-flip: -1;
      }
      .shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: 'top' 'main';
        min-height: 100dvh;
      }
      .skip {
        position: fixed;
        z-index: var(--z-overlay, 300);
        inset-inline-start: 8px;
        top: 8px;
        background: var(--u-paper);
        color: var(--u-ink);
        border-color: var(--u-line);
        transform: translateY(-200%);
      }
      .skip:focus {
        transform: none;
      }
      .top {
        grid-area: top;
        position: sticky;
        top: 0;
        z-index: var(--z-top, 40);
        display: flex;
        align-items: center;
        gap: 4px;
        height: 56px;
        min-width: 0;
        padding-inline: 8px 12px;
        padding-top: env(safe-area-inset-top, 0px);
        box-sizing: content-box;
        background: var(--u-bg);
        border-bottom: 1px solid var(--u-line);
        transition: transform var(--u-base) var(--u-ease);
      }
      .top.away {
        transform: translateY(-110%);
      }
      .back {
        padding: 0;
        width: 40px;
        flex: none;
        color: var(--u-ink2);
        border-radius: var(--u-ir);
      }
      .back:hover {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      nav.crumbs {
        flex: 1;
        min-width: 0;
      }
      nav.crumbs ol {
        display: flex;
        align-items: center;
        gap: 2px;
        margin: 0;
        padding: 0 4px;
        list-style: none;
        min-width: 0;
      }
      nav.crumbs li {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 2px;
      }
      nav.crumbs li:not(:last-child) {
        display: none;
      }
      nav.crumbs a,
      nav.crumbs span.here {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 10px 4px;
        border-radius: 8px;
        font-weight: 600;
        color: var(--u-ink);
        text-decoration: none;
      }
      nav.crumbs a {
        color: var(--u-ink2);
        font-weight: 500;
      }
      nav.crumbs a:hover {
        color: var(--u-ink);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      nav.crumbs .sep {
        color: var(--u-ink3);
        display: inline-flex;
      }
      nav.crumbs .sep svg.i {
        width: 14px;
        height: 14px;
      }
      .acts,
      .end {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: none;
      }
      nav.tabs {
        position: fixed;
        z-index: var(--z-tabs, 30);
        inset-inline: 0;
        bottom: 0;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        height: calc(var(--noema-bottom-inset) + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        background: var(--u-paper);
        border-top: 1px solid var(--u-line);
      }
      nav.tabs .railend {
        display: none;
      }
      .tab {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        padding: 6px 2px;
        color: var(--u-ink2);
        text-decoration: none;
        font-size: 0.74rem;
        font-weight: 600;
        line-height: 1.15;
        border-radius: var(--u-br);
      }
      .tab .w {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tab .ic {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 30px;
        border-radius: 15px;
        transition: background-color var(--u-fast) var(--u-ease);
      }
      .tab:hover .ic {
        background: var(--u-acc-soft);
      }
      .tab[aria-current='page'] {
        color: var(--u-ink);
      }
      .tab[aria-current='page'] .ic {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      .tab .dot {
        position: absolute;
        top: 4px;
        inset-inline-start: calc(50% + 10px);
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--u-bad-ink);
        color: var(--u-paper);
        font-size: 0.68rem;
        line-height: 18px;
        text-align: center;
      }
      main {
        grid-area: main;
        width: 100%;
        max-width: 760px;
        margin-inline: auto;
        padding: 20px 16px calc(var(--noema-bottom-inset) + 40px + env(safe-area-inset-bottom, 0px));
        min-width: 0;
        outline: none;
      }
      @media (max-width: 399.98px) {
        :host([many]) .tab:not([aria-current='page']) .w {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
        }
      }
      @media (min-width: 760px) {
        :host {
          --noema-bottom-inset: 0px;
        }
        .shell {
          grid-template-columns: 100px minmax(0, 1fr);
          grid-template-areas: 'rail top' 'rail main';
          grid-template-rows: auto 1fr;
        }
        .top {
          padding-inline: 16px 20px;
        }
        .top.away {
          transform: none;
        }
        nav.crumbs li:not(:last-child) {
          display: flex;
        }
        nav.tabs {
          grid-area: rail;
          position: sticky;
          top: 0;
          height: 100dvh;
          inset: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 72px 8px 16px;
          border-top: 0;
          border-inline-end: 1px solid var(--u-line);
        }
        nav.tabs .railend {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-top: auto;
        }
        .tab {
          padding: 8px 2px;
        }
        main {
          padding: 28px 28px 80px;
        }
      }
    `,
  ];
  declare tabs: readonly FrameTab[];
  declare current: string;
  declare crumbs: readonly Crumb[];
  declare back: string | undefined;
  declare autohide: boolean;
  #away = false;
  #lastY = 0;
  #upBy = 0;

  constructor() {
    super();
    this.tabs = [];
    this.current = '';
    this.crumbs = [];
    this.back = undefined;
    this.autohide = false;
  }

  /** The overlay layer (toasts, dialogs). */
  get layer(): NoemaLayer {
    const l = this.renderRoot.querySelector('noema-layer');
    if (!(l instanceof NoemaLayer)) throw new Error('noema-app-frame: not rendered yet (await frame.updateComplete)');
    return l;
  }

  /** The page's own element (<main>): focus goes there after a navigation and from "Skip to the content". */
  get main(): HTMLElement | null {
    return this.renderRoot.querySelector('main');
  }

  /** Puts the focus at the start of the page (after a navigation, so a screen reader starts reading the new page). */
  focusMain(): void {
    this.main?.focus({ preventScroll: true });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.defaultView?.addEventListener('scroll', this.#onScroll, { passive: true });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.defaultView?.removeEventListener('scroll', this.#onScroll);
  }

  #onScroll = (): void => {
    const w = this.ownerDocument.defaultView;
    if (!w) return;
    const y = w.scrollY,
      dy = y - this.#lastY;
    this.#lastY = y;
    const phone = w.innerWidth < WIDE_PX;
    let away = this.#away;
    if (!this.autohide || !phone || y < 80 || openOverlays(this.ownerDocument) > 0) away = false;
    else if (dy > 4) {
      away = true;
      this.#upBy = 0;
    } else if (dy < 0) {
      this.#upBy -= dy;
      if (this.#upBy > 48) away = false; // a deliberate scroll up, not a bounce
    }
    if (away !== this.#away) {
      this.#away = away;
      this.renderRoot.querySelector('.top')?.classList.toggle('away', away);
    }
  };

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    // the frame speaks the interface language, whatever the page's content is in
    this.lang = this.i18n.locale();
    this.dir = this.i18n.dir();
    this.toggleAttribute('many', this.tabs.length > 4);
  }

  override render(): TemplateResult {
    const crumbs = this.crumbs;
    return html`<button
        class="ctl skip"
        type="button"
        @click=${() => {
          this.focusMain();
        }}
      >
        ${this.t('ui.frame.skip')}
      </button>
      <div class="shell">
        <header class="top ${this.#away ? 'away' : ''}">
          ${
            this.back !== undefined
              ? html`<a class="ctl back" href=${this.back} aria-label=${this.t('ui.frame.back')} title=${this.t('ui.frame.back')}
                  >${icon('back')}</a
                >`
              : nothing
          }
          <nav class="crumbs" aria-label=${this.t('ui.frame.where')}>
            <ol>
              ${crumbs.map(
                (c, i) =>
                  html`<li>
                    ${
                      c.href !== undefined && i < crumbs.length - 1
                        ? html`<a href=${c.href}>${c.label}</a><span class="sep" aria-hidden="true">${icon('forward')}</span>`
                        : html`<span class="here" aria-current=${i === crumbs.length - 1 ? 'page' : nothing}>${c.label}</span>`
                    }
                  </li>`,
              )}
            </ol>
          </nav>
          <div class="acts"><slot name="actions"></slot></div>
          <div class="end"><slot name="end"></slot></div>
        </header>
        <nav class="tabs" aria-label=${this.t('ui.frame.mainNav')}>
          ${repeat(
            this.tabs,
            t => t.id,
            t =>
              html`<a class="tab" href=${t.href} aria-current=${t.id === this.current ? 'page' : nothing} title=${t.label}>
                <span class="ic">${isIconName(t.icon) ? icon(t.icon) : nothing}</span><span class="w">${t.label}</span>${
                  t.badge
                    ? html`<span class="dot" aria-hidden="true">${this.i18n.format.number(Math.min(t.badge, 99))}</span
                        ><span class="vh">${this.t('ui.tabs.count', { n: t.badge })}</span>`
                    : nothing
                }
              </a>`,
          )}
          <div class="railend"><slot name="rail-end"></slot></div>
        </nav>
        <main id="main" tabindex="-1"><slot></slot></main>
      </div>
      <noema-layer></noema-layer>`;
  }
}
