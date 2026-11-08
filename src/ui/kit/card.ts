/**
 * A card: a surface of paper with the character's corner radius, for one thing (a subject, a Roadmap, a chapter).
 *
 *   <noema-card heading="Physics" href="#/subject">…</noema-card>     the whole card opens the place (the title is the link)
 *   <noema-card heading="Today">…<noema-button slot="actions">…</noema-button></noema-card>
 *
 * With `href` the title is a real link and its hit area covers the card, so the card is one target that a screen reader
 * names by its title; buttons in the actions slot stay pressable on their own. `level` is the heading level (default 3).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';

export class NoemaCard extends NoemaElement {
  static override properties = {
    heading: { type: String },
    href: { type: String, reflect: true },
    level: { type: Number },
    tone: { type: String, reflect: true },
  };
  static override styles = [
    base,
    css`
      :host {
        display: block;
        position: relative;
        min-width: 0;
        border: 1px solid var(--u-line);
        border-radius: var(--u-r);
        background: var(--u-paper);
        padding: 16px 18px;
        transition: box-shadow var(--u-fast) var(--u-ease);
      }
      :host([tone='soft']) {
        background: var(--u-bg);
      }
      :host(:hover) .link {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      :host([href]:hover),
      :host([href]:focus-within) {
        box-shadow: var(--u-shadow);
      }
      .h {
        margin: 0 0 6px;
        font-family: var(--u-display);
        font-weight: var(--dw, 700);
        font-style: var(--dsty, normal);
        font-size: 1.05rem;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }
      .link {
        color: inherit;
        text-decoration: none;
        outline: none;
      }
      .link::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
      }
      .link:focus-visible::after {
        outline: 2px solid var(--u-focus);
        outline-offset: 2px;
      }
      .body {
        color: var(--u-ink2);
        line-height: 1.5;
      }
      .actions {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .actions:not(.has) {
        display: none;
      }
    `,
  ];
  declare heading: string;
  declare href: string | undefined;
  declare level: number;
  declare tone: 'plain' | 'soft';
  #hasActions = false;

  constructor() {
    super();
    this.heading = '';
    this.href = undefined;
    this.level = 3;
    this.tone = 'plain';
  }

  #onSlot = (e: Event): void => {
    const has = (e.target as HTMLSlotElement).assignedElements().length > 0;
    if (has !== this.#hasActions) {
      this.#hasActions = has;
      this.requestUpdate();
    }
  };

  override render(): TemplateResult {
    const title = this.href !== undefined ? html`<a class="link" href=${this.href}>${this.heading}</a>` : this.heading;
    const lvl = Math.min(6, Math.max(2, Math.round(this.level)));
    return html`${this.heading ? html`<div class="h" role="heading" aria-level=${lvl}>${title}</div>` : nothing}
      <div class="body"><slot></slot></div>
      <div class="actions ${this.#hasActions ? 'has' : ''}"><slot name="actions" @slotchange=${this.#onSlot}></slot></div>`;
  }
}
