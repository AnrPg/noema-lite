/**
 * Lists and folds.
 *
 *   <noema-list label="Subjects">
 *     <noema-list-item heading="Physics" sub="3 chapters" icon="book" href="#/subject">
 *       <noema-menu slot="end" label="More">…</noema-menu>
 *     </noema-list-item>
 *   </noema-list>
 *   <noema-collapsible heading="Fairy tales" open>…</noema-collapsible>
 *
 * A list item with `href` is one link (its title; the hit area covers the row) and keeps its own buttons in the end slot.
 * A fold is a button (aria-expanded) that shows or hides its region; `heading-level` makes the button sit inside a
 * heading, so the folds of a page are in its outline (the Me › Character groups, the Roadmaps by domain).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { uid } from '../core/focus.ts';
import { base } from '../core/styles.ts';
import { icon, isIconName } from './icons.ts';

export class NoemaList extends NoemaElement {
  static override properties = { label: { type: String } };
  static override styles = [
    base,
    css`
      :host {
        display: block;
        border: 1px solid var(--u-line);
        border-radius: var(--u-r);
        background: var(--u-paper);
        overflow: hidden;
      }
      ::slotted(noema-list-item:not(:first-child)) {
        border-top: 1px solid var(--u-line);
      }
    `,
  ];
  declare label: string;

  constructor() {
    super();
    this.label = '';
  }

  protected override updated(): void {
    this.setAttribute('role', 'list');
    if (this.label) this.setAttribute('aria-label', this.label);
    else this.removeAttribute('aria-label');
  }

  override render(): TemplateResult {
    return html`<slot></slot>`;
  }
}

export class NoemaListItem extends NoemaElement {
  static override properties = {
    heading: { type: String },
    sub: { type: String },
    icon: { type: String },
    href: { type: String, reflect: true },
  };
  static override styles = [
    base,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: 12px;
        position: relative;
        min-height: 56px;
        padding: 10px 12px 10px 16px;
        padding-inline: 16px 12px;
      }
      :host([href]:hover) {
        background: var(--u-acc-soft);
      }
      .ic {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 36px;
        height: 36px;
        border-radius: var(--u-ir);
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      .txt {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .h {
        font-weight: 600;
        overflow-wrap: anywhere;
        color: var(--u-ink);
      }
      a.h {
        text-decoration: none;
        outline: none;
      }
      a.h::after {
        content: '';
        position: absolute;
        inset: 0;
      }
      a.h:focus-visible::after {
        outline: 2px solid var(--u-focus);
        outline-offset: -2px;
      }
      .sub {
        color: var(--u-ink2);
        font-size: 0.86rem;
        overflow-wrap: anywhere;
      }
      .end {
        position: relative;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .chev {
        color: var(--u-ink3);
      }
    `,
  ];
  declare heading: string;
  declare sub: string;
  declare icon: string | undefined;
  declare href: string | undefined;

  constructor() {
    super();
    this.heading = '';
    this.sub = '';
    this.icon = undefined;
    this.href = undefined;
  }

  protected override updated(): void {
    this.setAttribute('role', 'listitem');
  }

  override render(): TemplateResult {
    const title =
      this.href !== undefined ? html`<a class="h" href=${this.href}>${this.heading}</a>` : html`<span class="h">${this.heading}</span>`;
    return html`${isIconName(this.icon) ? html`<span class="ic">${icon(this.icon)}</span>` : nothing}
      <div class="txt">${title}${this.sub ? html`<span class="sub">${this.sub}</span>` : nothing}<slot></slot></div>
      <div class="end">
        <slot name="end"></slot>${this.href !== undefined ? html`<span class="chev">${icon('forward')}</span>` : nothing}
      </div>`;
  }
}

export class NoemaCollapsible extends NoemaElement {
  static override properties = {
    heading: { type: String },
    sub: { type: String },
    open: { type: Boolean, reflect: true },
    headingLevel: { type: Number, attribute: 'heading-level' },
  };
  static override styles = [
    base,
    css`
      :host {
        display: block;
        border-bottom: 1px solid var(--u-line);
      }
      .hd {
        margin: 0;
        font: inherit;
      }
      button {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 52px;
        padding: 10px 4px;
        border: 0;
        background: none;
        color: var(--u-ink);
        font: inherit;
        font-weight: 600;
        text-align: start;
        cursor: pointer;
      }
      button:hover .t {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .t {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow-wrap: anywhere;
      }
      .sub {
        color: var(--u-ink2);
        font-size: 0.86rem;
        font-weight: 400;
      }
      svg.i {
        color: var(--u-ink2);
        transition: transform var(--u-fast) var(--u-ease);
      }
      :host([open]) svg.i {
        transform: rotate(180deg);
      }
      .region {
        padding: 0 4px 16px;
      }
    `,
  ];
  declare heading: string;
  declare sub: string;
  declare open: boolean;
  /** 2–6: the button sits in a heading of that level; 0: no heading */
  declare headingLevel: number;
  readonly #id = uid('fold');

  constructor() {
    super();
    this.heading = '';
    this.sub = '';
    this.open = false;
    this.headingLevel = 0;
  }

  #flip = (): void => {
    this.open = !this.open;
    this.emit('noema-toggle', { open: this.open });
  };

  override render(): TemplateResult {
    const btn = html`<button
      type="button"
      id="${this.#id}-b"
      aria-expanded=${String(this.open)}
      aria-controls="${this.#id}-r"
      @click=${this.#flip}
    >
      <span class="t"><span>${this.heading}</span>${this.sub ? html`<span class="sub">${this.sub}</span>` : nothing}</span>${icon('down')}
    </button>`;
    const lvl = Math.round(this.headingLevel);
    return html`${lvl >= 2 && lvl <= 6 ? html`<div class="hd" role="heading" aria-level=${lvl}>${btn}</div>` : btn}
      <div class="region" id="${this.#id}-r" role="region" aria-labelledby="${this.#id}-b" ?hidden=${!this.open}><slot></slot></div>`;
  }
}
