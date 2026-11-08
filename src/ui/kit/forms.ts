/**
 * Form controls. Each draws its own visible label, its hint and its error inside one shadow root, so the label, the
 * description and the error are tied to the control (a label outside a shadow root could not be). Each is
 * form-associated: it takes part in a <form> (name, value, required, validity) like a native control.
 *
 *   <noema-text-field label="Name" name="name" required hint="As others see it"></noema-text-field>
 *   <noema-text-field label="A few words" multiline></noema-text-field>
 *   <noema-select label="Daily goal" .options=${[{ value: '60', label: '60 XP' }]} value="60"></noema-select>
 *   <noema-switch label="Sound" checked></noema-switch>
 *   <noema-radio-group label="How much game" .options=${…} value="calm"></noema-radio-group>
 *
 * Every one tells `noema-change` (detail: { value } or { checked }) and lets the native `input` / `change` events through.
 * An error (`error="…"`) is shown under the control in the bad tint's ink and announced (aria-invalid + aria-describedby).
 */
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { live } from 'lit/directives/live.js';
import { NoemaElement } from '../core/element.ts';
import { uid } from '../core/focus.ts';
import { moveIndex } from '../core/keys.ts';
import { base } from '../core/styles.ts';
import { icon } from './icons.ts';

export interface FieldOption {
  readonly value: string;
  readonly label: string;
  /** a second line (radio groups) */
  readonly sub?: string;
  readonly disabled?: boolean;
}

const field = css`
  :host {
    display: block;
    min-width: 0;
  }
  .lab {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--u-ink);
  }
  .req {
    color: var(--u-ink2);
    font-weight: 400;
  }
  .hint {
    margin: 6px 0 0;
    color: var(--u-ink2);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .err {
    margin: 6px 0 0;
    color: var(--u-bad-ink);
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.4;
  }
  .box {
    display: block;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--u-line);
    border-radius: var(--u-br);
    background: var(--u-paper);
    color: var(--u-ink);
    font: inherit;
    font-size: 1rem;
    line-height: 1.4;
    transition: border-color var(--u-fast) var(--u-ease);
  }
  .box:hover {
    border-color: var(--u-ink3);
  }
  .box:focus-visible {
    outline: 2px solid var(--u-focus);
    outline-offset: 1px;
    border-color: transparent;
  }
  .box[aria-invalid='true'] {
    border-color: var(--u-bad-ink);
  }
  .box::placeholder {
    color: var(--u-ink3);
  }
  textarea.box {
    min-height: 96px;
    resize: vertical;
  }
`;

/** What every field shares: its name in the form, its label, hint, error and required flag; the form value and validity. */
class FieldBase extends NoemaElement {
  static formAssociated = true;
  static override shadowRootOptions = { ...NoemaElement.shadowRootOptions, delegatesFocus: true };
  static override properties = {
    label: { type: String },
    name: { type: String, reflect: true },
    hint: { type: String },
    error: { type: String },
    required: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
  };
  declare label: string;
  declare name: string;
  declare hint: string;
  declare error: string;
  declare required: boolean;
  declare disabled: boolean;
  /** the prefix of the ids inside the shadow root (label, hint, error, control) */
  protected readonly fid = uid('fld');
  protected readonly internals: ElementInternals | null;

  constructor() {
    super();
    this.label = '';
    this.name = '';
    this.hint = '';
    this.error = '';
    this.required = false;
    this.disabled = false;
    this.internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
  }

  /** the ids the control is described by: its hint and its error */
  protected describedBy(): string | undefined {
    const ids = [this.hint ? `${this.fid}-h` : '', this.error ? `${this.fid}-e` : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : undefined;
  }

  protected labelEl(forId: string | null): TemplateResult {
    const req = this.required ? html` <span class="req">${this.t('ui.field.required')}</span>` : nothing;
    return forId === null
      ? html`<span class="lab" id="${this.fid}-l">${this.label}${req}</span>`
      : html`<label class="lab" id="${this.fid}-l" for=${forId}>${this.label}${req}</label>`;
  }

  protected notes(): TemplateResult {
    return html`${this.hint ? html`<p class="hint" id="${this.fid}-h">${this.hint}</p>` : nothing}${
      this.error ? html`<p class="err" id="${this.fid}-e">${this.error}</p>` : nothing
    }`;
  }

  /** the form value and the validity: required and empty is "missing", an `error` is a custom error */
  protected sync(value: string | null, empty: boolean, anchor: HTMLElement | null): void {
    const i = this.internals;
    if (!i) return;
    i.setFormValue(value);
    if (this.error) i.setValidity({ customError: true }, this.error, anchor ?? undefined);
    else if (this.required && empty) i.setValidity({ valueMissing: true }, this.t('ui.field.missing'), anchor ?? undefined);
    else i.setValidity({});
  }

  get form(): HTMLFormElement | null {
    return this.internals?.form ?? null;
  }
  get validity(): ValidityState | null {
    return this.internals?.validity ?? null;
  }
  checkValidity(): boolean {
    return this.internals?.checkValidity() ?? true;
  }
}

export class NoemaTextField extends FieldBase {
  static override properties = {
    ...FieldBase.properties,
    value: { type: String },
    type: { type: String },
    placeholder: { type: String },
    autocomplete: { type: String },
    inputmode: { type: String },
    maxlength: { type: Number },
    multiline: { type: Boolean },
  };
  static override styles = [base, field];
  declare value: string;
  declare type: 'text' | 'email' | 'search' | 'password' | 'url' | 'tel' | 'number';
  declare placeholder: string;
  declare autocomplete: string | undefined;
  declare inputmode: string | undefined;
  declare maxlength: number | undefined;
  declare multiline: boolean;

  constructor() {
    super();
    this.value = '';
    this.type = 'text';
    this.placeholder = '';
    this.autocomplete = undefined;
    this.inputmode = undefined;
    this.maxlength = undefined;
    this.multiline = false;
  }

  #input = (e: Event): void => {
    this.value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.emit('noema-change', { value: this.value });
  };

  protected override updated(): void {
    this.sync(this.value, this.value === '', this.renderRoot.querySelector('.box'));
  }

  formResetCallback(): void {
    this.value = '';
  }

  override render(): TemplateResult {
    const id = `${this.fid}-c`,
      common = {
        describedBy: this.describedBy(),
        invalid: this.error ? 'true' : undefined,
      };
    const control = this.multiline
      ? html`<textarea
          class="box"
          id=${id}
          name=${ifDefined(this.name || undefined)}
          .value=${live(this.value)}
          placeholder=${ifDefined(this.placeholder || undefined)}
          maxlength=${ifDefined(this.maxlength)}
          ?required=${this.required}
          ?disabled=${this.disabled}
          aria-describedby=${ifDefined(common.describedBy)}
          aria-invalid=${ifDefined(common.invalid)}
          @input=${this.#input}
        ></textarea>`
      : html`<input
          class="box"
          id=${id}
          type=${this.type}
          name=${ifDefined(this.name || undefined)}
          .value=${live(this.value)}
          placeholder=${ifDefined(this.placeholder || undefined)}
          autocomplete=${ifDefined(this.autocomplete)}
          inputmode=${ifDefined(this.inputmode)}
          maxlength=${ifDefined(this.maxlength)}
          ?required=${this.required}
          ?disabled=${this.disabled}
          aria-describedby=${ifDefined(common.describedBy)}
          aria-invalid=${ifDefined(common.invalid)}
          @input=${this.#input}
        />`;
    return html`${this.labelEl(id)}${control}${this.notes()}`;
  }
}

export class NoemaSelect extends FieldBase {
  static override properties = { ...FieldBase.properties, value: { type: String }, options: { attribute: false } };
  static override styles = [
    base,
    field,
    css`
      .sel {
        position: relative;
      }
      select.box {
        appearance: none;
        padding-inline-end: 40px;
        cursor: pointer;
      }
      .sel svg.i {
        position: absolute;
        inset-inline-end: 12px;
        top: 50%;
        width: 18px;
        height: 18px;
        margin-top: -9px;
        color: var(--u-ink2);
        pointer-events: none;
      }
    `,
  ];
  declare value: string;
  declare options: readonly FieldOption[];

  constructor() {
    super();
    this.value = '';
    this.options = [];
  }

  #change = (e: Event): void => {
    this.value = (e.target as HTMLSelectElement).value;
    this.emit('noema-change', { value: this.value });
  };

  protected override updated(): void {
    this.sync(this.value, this.value === '', this.renderRoot.querySelector('select'));
  }

  override render(): TemplateResult {
    const id = `${this.fid}-c`;
    return html`${this.labelEl(id)}
      <div class="sel">
        <select
          class="box"
          id=${id}
          name=${ifDefined(this.name || undefined)}
          ?required=${this.required}
          ?disabled=${this.disabled}
          aria-describedby=${ifDefined(this.describedBy())}
          aria-invalid=${ifDefined(this.error ? 'true' : undefined)}
          @change=${this.#change}
        >
          ${this.options.map(o => html`<option value=${o.value} ?selected=${o.value === this.value} ?disabled=${o.disabled === true}>${o.label}</option>`)}</select
        >${icon('down')}
      </div>
      ${this.notes()}`;
  }
}

export class NoemaSwitch extends FieldBase {
  static override properties = { ...FieldBase.properties, checked: { type: Boolean, reflect: true }, value: { type: String } };
  static override styles = [
    base,
    field,
    css`
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 44px;
      }
      .row .lab {
        margin: 0;
        font-weight: 500;
        cursor: pointer;
      }
      button {
        position: relative;
        flex: none;
        width: 48px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--u-ink3);
        border-radius: 14px;
        background: var(--u-bg);
        cursor: pointer;
        transition:
          background-color var(--u-fast) var(--u-ease),
          border-color var(--u-fast) var(--u-ease);
      }
      button::after {
        content: '';
        position: absolute;
        top: 3px;
        inset-inline-start: 3px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--u-ink2);
        transition: transform var(--u-fast) var(--u-ease);
      }
      button[aria-checked='true'] {
        background: var(--u-acc);
        border-color: var(--u-acc);
      }
      button[aria-checked='true']::after {
        background: var(--u-acc-ink);
        transform: translateX(calc(20px * var(--u-flip, 1)));
      }
      button[disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `,
  ];
  declare checked: boolean;
  /** the form value while it is on (default "on", as a checkbox) */
  declare value: string;

  constructor() {
    super();
    this.checked = false;
    this.value = 'on';
  }

  #flip = (): void => {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit('noema-change', { checked: this.checked });
  };

  protected override updated(): void {
    this.sync(this.checked ? this.value : null, !this.checked, this.renderRoot.querySelector('button'));
  }

  formResetCallback(): void {
    this.checked = false;
  }

  override render(): TemplateResult {
    const id = `${this.fid}-c`;
    return html`<div class="row">
        ${this.labelEl(id)}
        <button
          id=${id}
          type="button"
          role="switch"
          aria-checked=${String(this.checked)}
          ?disabled=${this.disabled}
          aria-describedby=${ifDefined(this.describedBy())}
          @click=${this.#flip}
        ></button>
      </div>
      ${this.notes()}`;
  }
}

export class NoemaRadioGroup extends FieldBase {
  static override properties = { ...FieldBase.properties, value: { type: String }, options: { attribute: false } };
  static override styles = [
    base,
    field,
    css`
      [role='radiogroup'] {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      [role='radio'] {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 8px 12px;
        border: 1px solid var(--u-line);
        border-radius: var(--u-br);
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      [role='radio']:hover {
        background: var(--u-acc-soft);
      }
      [role='radio'][aria-checked='true'] {
        border-color: var(--u-acc);
        background: var(--u-acc-soft);
      }
      [role='radio'][aria-disabled='true'] {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .dot {
        flex: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid var(--u-ink3);
      }
      [aria-checked='true'] .dot {
        border: 6px solid var(--u-acc-text);
      }
      .t {
        display: flex;
        flex-direction: column;
      }
      .s {
        color: var(--u-ink2);
        font-size: 0.85rem;
      }
    `,
  ];
  declare value: string;
  declare options: readonly FieldOption[];

  constructor() {
    super();
    this.value = '';
    this.options = [];
  }

  #pick(o: FieldOption, focus: boolean): void {
    if (o.disabled) return;
    if (o.value !== this.value) {
      this.value = o.value;
      this.emit('noema-change', { value: this.value });
    }
    if (focus)
      void this.updateComplete.then(() => {
        this.renderRoot.querySelector<HTMLElement>(`[data-v="${CSS.escape(o.value)}"]`)?.focus();
      });
  }

  #onKey = (e: KeyboardEvent): void => {
    const opts = this.options;
    const i = Math.max(
      0,
      opts.findIndex(o => o.value === this.value),
    );
    // radios move with both arrow axes; Home and End are not part of the pattern
    if (e.key === 'Home' || e.key === 'End') return;
    const skip = (k: number): boolean => opts[k]?.disabled === true;
    const n =
      moveIndex(e.key, i, opts.length, { orientation: 'vertical', dir: this.uiDir, skip }) ??
      moveIndex(e.key, i, opts.length, { orientation: 'horizontal', dir: this.uiDir, skip });
    const o = n === null ? undefined : opts[n];
    if (o) {
      e.preventDefault();
      this.#pick(o, true);
    } else if (e.key === ' ') {
      const cur = opts[i];
      if (cur) {
        e.preventDefault();
        this.#pick(cur, false);
      }
    }
  };

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('value') || changed.has('required') || changed.has('error'))
      this.sync(this.value || null, this.value === '', this.renderRoot.querySelector('[role="radio"]'));
  }

  override render(): TemplateResult {
    const selected = this.options.some(o => o.value === this.value) ? this.value : (this.options.find(o => !o.disabled)?.value ?? '');
    return html`${this.labelEl(null)}
      <div
        role="radiogroup"
        aria-labelledby="${this.fid}-l"
        aria-describedby=${ifDefined(this.describedBy())}
        aria-required=${ifDefined(this.required ? 'true' : undefined)}
        aria-invalid=${ifDefined(this.error ? 'true' : undefined)}
        @keydown=${this.#onKey}
      >
        ${this.options.map(
          o =>
            html`<button
              type="button"
              role="radio"
              data-v=${o.value}
              aria-checked=${String(o.value === this.value)}
              aria-disabled=${ifDefined(o.disabled ? 'true' : undefined)}
              tabindex=${o.value === selected ? '0' : '-1'}
              @click=${() => {
                this.#pick(o, false);
              }}
            >
              <span class="dot" aria-hidden="true"></span
              ><span class="t"><span>${o.label}</span>${o.sub ? html`<span class="s">${o.sub}</span>` : nothing}</span>
            </button>`,
        )}
      </div>
      ${this.notes()}`;
  }
}
