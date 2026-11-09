/**
 * Dialogs and sheets: a native modal <dialog> (the browser makes the rest of the page inert and keeps Tab inside it), with
 * a title, a ✕, its content and its actions.
 *
 *   <noema-dialog heading="Rename" @noema-close=${e => e.detail.value}>
 *     <noema-text-field label="Name" autofocus></noema-text-field>
 *     <noema-button slot="actions" variant="primary" @click=${() => dlg.close('ok')}>Save</noema-button>
 *   </noema-dialog>
 *   dlg.show();
 *
 * placement="center" (default): in the middle of the screen. placement="sheet": from the bottom on phones, at the side
 * (the end of the line) from 760 px — the station panel, the 🔔 list. `dismissible=false`: a question that must be
 * answered (no ✕, no Escape, no press outside). Focus goes to the element with `autofocus` inside, else to the title, and
 * back to where it was when the dialog closes. Escape closes the top overlay only (overlays.ts).
 */
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { rememberFocus, uid } from '../core/focus.ts';
import { openOverlay } from '../core/overlays.ts';
import { base, control } from '../core/styles.ts';
import { icon } from './icons.ts';

export interface DialogCloseDetail {
  /** what closed it: the value given to close(), 'dismiss' for ✕ / Escape / a press outside */
  readonly value: string;
}

/** modal dialogs open on a document: the page under them does not scroll while there is one */
const MODALS = new WeakMap<Document, number>();
function lockScroll(doc: Document, by: 1 | -1): void {
  const n = Math.max(0, (MODALS.get(doc) ?? 0) + by);
  MODALS.set(doc, n);
  doc.documentElement.style.overflow = n > 0 ? 'hidden' : '';
}

export class NoemaDialog extends NoemaElement {
  static override properties = {
    heading: { type: String },
    open: { type: Boolean, reflect: true },
    placement: { type: String, reflect: true },
    dismissible: { type: Boolean },
    wide: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    control,
    css`
      :host {
        display: contents;
      }
      dialog {
        width: min(520px, calc(100vw - 32px));
        max-height: min(86dvh, 820px);
        padding: 0;
        border: 1px solid var(--u-line);
        border-radius: var(--u-r);
        background: var(--u-paper);
        color: var(--u-ink);
        box-shadow: var(--u-shadow);
        overflow: hidden;
        flex-direction: column;
      }
      :host([wide]) dialog {
        width: min(760px, calc(100vw - 32px));
      }
      dialog[open] {
        display: flex;
        animation: u-in var(--u-base) var(--u-ease);
      }
      dialog::backdrop {
        background: color-mix(in srgb, var(--ink, #1f2330) 28%, transparent);
      }
      @keyframes u-in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
      }
      @media (max-width: 759.98px) {
        :host([placement='sheet']) dialog {
          width: 100vw;
          max-width: 100vw;
          margin: auto 0 0;
          border-end-start-radius: 0;
          border-end-end-radius: 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      }
      @media (min-width: 760px) {
        :host([placement='sheet']) dialog {
          width: 440px;
          height: 100dvh;
          max-height: 100dvh;
          margin: 0 0 0 auto;
          margin-inline: auto 0;
          border-start-end-radius: 0;
          border-end-end-radius: 0;
        }
      }
      header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 10px 6px 20px;
        padding-inline: 20px 10px;
      }
      h2 {
        flex: 1;
        margin: 0;
        font-family: var(--u-display);
        font-weight: var(--dw, 700);
        font-style: var(--dsty, normal);
        font-size: 1.15rem;
        line-height: 1.3;
        overflow-wrap: anywhere;
        outline: none;
      }
      .x {
        padding: 0;
        width: 40px;
        color: var(--u-ink2);
        border-radius: var(--u-ir);
      }
      .x:hover {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      .body {
        padding: 6px 20px 16px;
        overflow: auto;
        flex: 1;
        line-height: 1.5;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--u-line);
      }
      .actions.empty {
        display: none;
      }
    `,
  ];
  declare heading: string;
  declare open: boolean;
  declare placement: 'center' | 'sheet';
  declare dismissible: boolean;
  declare wide: boolean;
  readonly #id = uid('dlg');
  #release: (() => void) | null = null;
  #refocus: (() => void) | null = null;
  #value = 'dismiss';
  #hasActions = false;

  constructor() {
    super();
    this.heading = '';
    this.open = false;
    this.placement = 'center';
    this.dismissible = true;
    this.wide = false;
  }

  show(): void {
    this.open = true;
  }

  /** Closes it; `value` is what the noema-close event reports (e.g. 'ok'). */
  close(value = 'dismiss'): void {
    if (!this.open) return;
    this.#value = value;
    this.open = false;
  }

  get #dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector('dialog');
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    const d = this.#dialog;
    if (!d) return;
    if (this.open && !d.open) {
      this.#refocus = rememberFocus(this.ownerDocument);
      d.showModal();
      lockScroll(this.ownerDocument, 1);
      this.#release = openOverlay({
        host: this,
        lightDismiss: false,
        escape: this.dismissible,
        close: () => {
          this.close('dismiss');
        },
      });
      const first = this.querySelector<HTMLElement>('[autofocus]');
      if (first) first.focus();
      else this.renderRoot.querySelector<HTMLElement>('h2')?.focus();
      this.emit('noema-open');
    } else if (!this.open && d.open) {
      d.close();
      lockScroll(this.ownerDocument, -1);
      this.#release?.();
      this.#release = null;
      const value = this.#value;
      this.#value = 'dismiss';
      this.#refocus?.();
      this.#refocus = null;
      this.emit('noema-close', { value });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#release) {
      this.#release();
      this.#release = null;
      lockScroll(this.ownerDocument, -1);
    }
  }

  /** the browser's own close request (Escape on some platforms): the overlay stack and `dismissible` decide */
  #onCancel = (e: Event): void => {
    e.preventDefault();
    if (this.dismissible) this.close('dismiss');
  };

  /** a press on the backdrop (the dialog element itself, outside its box) */
  #onClick = (e: MouseEvent): void => {
    const d = this.#dialog;
    if (!d || e.target !== d || !this.dismissible) return;
    const r = d.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) this.close('dismiss');
  };

  #onSlot = (e: Event): void => {
    const has = (e.target as HTMLSlotElement).assignedElements().length > 0;
    if (has !== this.#hasActions) {
      this.#hasActions = has;
      this.requestUpdate();
    }
  };

  override render(): TemplateResult {
    return html`<dialog aria-labelledby="${this.#id}-h" @cancel=${this.#onCancel} @click=${this.#onClick}>
      <header>
        <h2 id="${this.#id}-h" tabindex="-1">${this.heading}</h2>
        ${
          this.dismissible
            ? html`<button
                class="ctl x"
                type="button"
                aria-label=${this.t('ui.dialog.close')}
                title=${this.t('ui.dialog.close')}
                @click=${() => {
                  this.close('dismiss');
                }}
              >
                ${icon('close')}
              </button>`
            : nothing
        }
      </header>
      <div class="body"><slot></slot></div>
      <div class="actions ${this.#hasActions ? '' : 'empty'}"><slot name="actions" @slotchange=${this.#onSlot}></slot></div>
    </dialog>`;
  }
}
