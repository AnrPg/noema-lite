/**
 * The overlay layer of the frame: where what floats over every page lives — the toasts (the Notifier's surface), and
 * the dialogs a screen opens without having a place for them in its own markup (a question, a sheet of details).
 *
 *   const layer = frame.layer;
 *   policyNotifier(layer.toaster)                                         (the root)
 *   const yes = await confirmDialog(layer, { heading, text, ok, cancel })  (a screen)
 *   const remove = layer.mount(dialogElement)                              (anything else; remove() when done)
 */
import { css, html, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { NoemaButton } from '../kit/button.ts';
import { NoemaDialog, type DialogCloseDetail } from '../kit/dialog.ts';
import { NoemaToaster } from '../kit/toaster.ts';

export class NoemaLayer extends NoemaElement {
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  /** The toasts' surface (wired to the Notifier port by the root). */
  get toaster(): NoemaToaster {
    const t = this.renderRoot.querySelector('noema-toaster');
    if (!(t instanceof NoemaToaster)) throw new Error('noema-layer: not rendered yet (await layer.updateComplete)');
    return t;
  }

  /** Puts an element in the layer; → takes it out again. */
  mount(el: HTMLElement): () => void {
    this.append(el);
    return () => {
      el.remove();
    };
  }

  override render(): TemplateResult {
    return html`<slot></slot><noema-toaster></noema-toaster>`;
  }
}

export interface ConfirmOptions {
  readonly heading: string;
  readonly text: string;
  readonly ok: string;
  readonly cancel: string;
  /** the action cannot be undone (the ok button in the bad tint) */
  readonly danger?: boolean;
}

/** Asks a yes / no question in a dialog of the layer; → true for ok (false for cancel, ✕, Escape). */
export function confirmDialog(layer: NoemaLayer, o: ConfirmOptions): Promise<boolean> {
  const doc = layer.ownerDocument;
  const dlg = doc.createElement('noema-dialog');
  if (!(dlg instanceof NoemaDialog)) return Promise.reject(new Error('the UI kit is not defined (defineUi)'));
  dlg.heading = o.heading;
  const p = doc.createElement('p');
  p.textContent = o.text;
  p.style.margin = '0';
  const mk = (label: string, value: string, variant: NoemaButton['variant']): HTMLElement => {
    const b = doc.createElement('noema-button');
    if (b instanceof NoemaButton) b.variant = variant;
    b.slot = 'actions';
    b.textContent = label;
    b.addEventListener('click', () => {
      dlg.close(value);
    });
    return b;
  };
  const okBtn = mk(o.ok, 'ok', o.danger ? 'danger' : 'primary');
  const cancelBtn = mk(o.cancel, 'cancel', 'secondary');
  cancelBtn.setAttribute('autofocus', ''); // the safe answer has focus first
  dlg.append(p, cancelBtn, okBtn);
  const remove = layer.mount(dlg);
  return new Promise(resolve => {
    dlg.addEventListener(
      'noema-close',
      e => {
        remove();
        resolve((e as CustomEvent<DialogCloseDetail>).detail.value === 'ok');
      },
      { once: true },
    );
    void dlg.updateComplete.then(() => {
      dlg.show();
    });
  });
}
