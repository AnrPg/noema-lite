/**
 * Buttons. One primary action per screen (filled with the accent), the rest secondary (a hairline) or quiet (text only):
 * the frame stays pale and uncluttered. `href` makes it a link that looks like a button (navigation is a link, an action
 * is a button). A submit button submits the form it is in (the element is form-associated).
 *
 *   <noema-button variant="primary" @click=…>Continue</noema-button>
 *   <noema-button href="#/subject" icon="forward">Open</noema-button>
 *   <noema-icon-button icon="more" label="More"></noema-icon-button>   (the label is its name and its tip)
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { NoemaElement } from '../core/element.ts';
import { base, control } from '../core/styles.ts';
import { icon, isIconName } from './icons.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const variants = css`
  .primary {
    background: var(--u-acc);
    color: var(--u-acc-ink);
  }
  .primary:hover:not([disabled]) {
    box-shadow: inset 0 0 0 100px color-mix(in srgb, var(--u-acc-ink) 10%, transparent);
  }
  .secondary {
    background: var(--u-paper);
    border-color: var(--u-line);
    color: var(--u-ink);
  }
  .secondary:hover:not([disabled]),
  .quiet:hover:not([disabled]) {
    background: var(--u-acc-soft);
  }
  .quiet {
    color: var(--u-ink);
    padding-inline: 10px;
  }
  .danger {
    background: var(--u-paper);
    border-color: var(--u-line);
    color: var(--u-bad-ink);
  }
  .danger:hover:not([disabled]) {
    background: var(--u-bad);
  }
  .sm {
    min-height: 32px;
    min-width: 32px;
    padding-inline: 12px;
    font-size: 0.875rem;
  }
`;

export class NoemaButton extends NoemaElement {
  static formAssociated = true;
  static override shadowRootOptions = { ...NoemaElement.shadowRootOptions, delegatesFocus: true };
  static override properties = {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    type: { type: String },
    href: { type: String },
    icon: { type: String },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    control,
    variants,
    css`
      :host {
        display: inline-flex;
        max-width: 100%;
      }
      .ctl {
        width: 100%;
      }
      .label {
        overflow-wrap: anywhere;
        text-align: center;
      }
      .spin {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid currentColor;
        border-inline-end-color: transparent;
        animation: u-spin calc(0.8s / max(var(--u-motion, 1), 0.01)) linear infinite;
      }
      @keyframes u-spin {
        to {
          transform: rotate(1turn);
        }
      }
    `,
  ];
  declare variant: ButtonVariant;
  declare size: 'md' | 'sm';
  declare type: 'button' | 'submit' | 'reset';
  declare href: string | undefined;
  declare icon: string | undefined;
  declare disabled: boolean;
  declare busy: boolean;
  readonly #internals: ElementInternals | null;

  constructor() {
    super();
    this.variant = 'secondary';
    this.size = 'md';
    this.type = 'button';
    this.href = undefined;
    this.icon = undefined;
    this.disabled = false;
    this.busy = false;
    this.#internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
  }

  #press = (e: Event): void => {
    if (this.disabled || this.busy) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const form = this.#internals?.form;
    if (!form) return;
    if (this.type === 'submit') form.requestSubmit();
    else if (this.type === 'reset') form.reset();
  };

  override render(): TemplateResult {
    const cls = `ctl ${this.variant} ${this.size === 'sm' ? 'sm' : ''}`;
    const inner = html`${this.busy ? html`<span class="spin" aria-hidden="true"></span>` : isIconName(this.icon) ? icon(this.icon) : nothing}
      <span class="label"><slot></slot></span>`;
    if (this.href !== undefined && !this.disabled) return html`<a class=${cls} href=${this.href} part="control">${inner}</a>`;
    return html`<button
      class=${cls}
      part="control"
      type="button"
      ?disabled=${this.disabled}
      aria-busy=${ifDefined(this.busy ? 'true' : undefined)}
      @click=${this.#press}
    >
      ${inner}
    </button>`;
  }
}

export class NoemaIconButton extends NoemaElement {
  static override shadowRootOptions = { ...NoemaElement.shadowRootOptions, delegatesFocus: true };
  static override properties = {
    icon: { type: String },
    label: { type: String },
    href: { type: String },
    pressed: { type: Boolean, reflect: true },
    toggle: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    badge: { type: Number },
    size: { type: String, reflect: true },
    expanded: { type: String },
    haspopup: { type: String },
  };
  static override styles = [
    base,
    control,
    css`
      :host {
        display: inline-flex;
        position: relative;
      }
      .ctl {
        padding: 0;
        width: 40px;
        color: var(--u-ink2);
        border-radius: var(--u-ir);
      }
      :host([size='sm']) .ctl {
        width: 32px;
        min-width: 32px;
        min-height: 32px;
      }
      .ctl:hover:not([disabled]) {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      :host([pressed]) .ctl {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      .badge {
        position: absolute;
        inset-block-start: 2px;
        inset-inline-end: 2px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--u-bad-ink);
        color: var(--u-paper);
        font-size: 0.7rem;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        pointer-events: none;
      }
    `,
  ];
  declare icon: string;
  declare label: string;
  declare href: string | undefined;
  declare pressed: boolean;
  declare toggle: boolean;
  declare disabled: boolean;
  declare badge: number;
  declare size: 'md' | 'sm';
  /** aria-expanded of the button that opens a menu or a panel ('true' | 'false'; unset otherwise) */
  declare expanded: string | undefined;
  /** aria-haspopup ('menu', 'dialog' …) */
  declare haspopup: string | undefined;

  constructor() {
    super();
    this.icon = 'info';
    this.label = '';
    this.href = undefined;
    this.pressed = false;
    this.toggle = false;
    this.disabled = false;
    this.badge = 0;
    this.size = 'md';
    this.expanded = undefined;
    this.haspopup = undefined;
  }

  #click = (): void => {
    if (this.toggle && !this.disabled) {
      this.pressed = !this.pressed;
      this.emit('noema-toggle', { pressed: this.pressed });
    }
  };

  override render(): TemplateResult {
    const glyph = isIconName(this.icon) ? icon(this.icon) : nothing;
    const badge =
      this.badge > 0 ? html`<span class="badge" aria-hidden="true">${this.i18n.format.number(Math.min(this.badge, 99))}</span>` : nothing;
    const name = this.badge > 0 ? this.t('ui.button.withCount', { label: this.label, n: this.badge }) : this.label;
    if (this.href !== undefined)
      return html`<a class="ctl" part="control" href=${this.href} aria-label=${name} title=${this.label}>${glyph}</a>${badge}`;
    return html`<button
        class="ctl"
        part="control"
        type="button"
        aria-label=${name}
        title=${this.label}
        ?disabled=${this.disabled}
        aria-pressed=${ifDefined(this.toggle ? String(this.pressed) : undefined)}
        aria-expanded=${ifDefined(this.expanded)}
        aria-haspopup=${ifDefined(this.haspopup)}
        @click=${this.#click}
      >
        ${glyph}</button
      >${badge}`;
  }
}
