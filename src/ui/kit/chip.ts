/**
 * Chips: short words in a pill. Three kinds:
 *   <noema-chip>Physics</noema-chip>                               a label (tone: plain | ok | warn | bad | info | accent)
 *   <noema-chip toggle ?selected=${on}>Only due</noema-chip>       a filter that is on or off (aria-pressed; noema-change)
 *   <noema-chip removable>Chapter 3</noema-chip>                    with ✕ "Remove …" (noema-remove)
 * A row of them is a <noema-chips label="Filters">: it wraps onto more lines, never scrolls sideways.
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';
import { icon, isIconName } from './icons.ts';

export type ChipTone = 'plain' | 'ok' | 'warn' | 'bad' | 'info' | 'accent';

export class NoemaChip extends NoemaElement {
  static override properties = {
    toggle: { type: Boolean },
    selected: { type: Boolean, reflect: true },
    removable: { type: Boolean },
    tone: { type: String, reflect: true },
    icon: { type: String },
    disabled: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    css`
      :host {
        display: inline-flex;
        max-width: 100%;
        vertical-align: middle;
      }
      .c {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 32px;
        max-width: 100%;
        padding: 0 12px;
        border: 1px solid var(--u-line);
        border-radius: 999px;
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.2;
      }
      .c > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button.c {
        cursor: pointer;
      }
      button.c:hover {
        background: var(--u-acc-soft);
      }
      button.c[aria-pressed='true'] {
        background: var(--u-acc-soft);
        border-color: var(--u-acc);
      }
      button.c[disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }
      :host([tone='ok']) .c {
        background: var(--u-ok);
        color: var(--u-ok-ink);
        border-color: transparent;
      }
      :host([tone='warn']) .c {
        background: var(--u-warn);
        color: var(--u-warn-ink);
        border-color: transparent;
      }
      :host([tone='bad']) .c {
        background: var(--u-bad);
        color: var(--u-bad-ink);
        border-color: transparent;
      }
      :host([tone='info']) .c {
        background: var(--u-info);
        color: var(--u-info-ink);
        border-color: transparent;
      }
      :host([tone='accent']) .c {
        background: var(--u-acc-soft);
        color: var(--u-ink);
        border-color: transparent;
      }
      svg.i {
        width: 16px;
        height: 16px;
      }
      .rm {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-inline-end: -6px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: inherit;
        cursor: pointer;
      }
      .rm:hover {
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
    `,
  ];
  declare toggle: boolean;
  declare selected: boolean;
  declare removable: boolean;
  declare tone: ChipTone;
  declare icon: string | undefined;
  declare disabled: boolean;

  constructor() {
    super();
    this.toggle = false;
    this.selected = false;
    this.removable = false;
    this.tone = 'plain';
    this.icon = undefined;
    this.disabled = false;
  }

  get label(): string {
    return this.textContent.trim();
  }

  #flip = (): void => {
    if (this.disabled) return;
    this.selected = !this.selected;
    this.emit('noema-change', { selected: this.selected });
  };

  override render(): TemplateResult {
    const glyph = isIconName(this.icon) ? icon(this.icon) : nothing;
    if (this.toggle)
      return html`<button class="c" type="button" aria-pressed=${String(this.selected)} ?disabled=${this.disabled} @click=${this.#flip}>
        ${this.selected ? icon('check') : glyph}<span><slot></slot></span>
      </button>`;
    return html`<span class="c">
      ${glyph}<span><slot></slot></span>${
        this.removable
          ? html`<button
              class="rm"
              type="button"
              aria-label=${this.t('ui.chip.remove', { label: this.label })}
              title=${this.t('ui.chip.remove', { label: this.label })}
              @click=${() => this.emit('noema-remove')}
            >
              ${icon('close')}
            </button>`
          : nothing
      }
    </span>`;
  }
}

export class NoemaChips extends NoemaElement {
  static override properties = { label: { type: String } };
  static override styles = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
  `;
  declare label: string;

  constructor() {
    super();
    this.label = '';
  }

  protected override updated(): void {
    this.setAttribute('role', 'group');
    if (this.label) this.setAttribute('aria-label', this.label);
    else this.removeAttribute('aria-label');
  }

  override render(): TemplateResult {
    return html`<slot></slot>`;
  }
}
