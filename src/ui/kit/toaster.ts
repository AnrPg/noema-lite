/**
 * Toasts, notices and alerts of the new frame: the drawing surface of the Notifier port. The rules (at most two notices
 * on screen, the rest to the 🔔 bell; an alert also in the assertive live region) are the notifier policy's
 * (src/adapters/local/notifier-policy.ts); the root wires it over this element:
 *
 *   policyNotifier(frame.layer.toaster)        // src/composition/ui.ts
 *
 * A toast is a status that fades (not announced); a notice is announced politely (role="status"); an alert stays longer
 * and is announced at once (role="alert" in a live region that exists before it is filled, so screen readers hear it,
 * and is emptied first, so the same words are heard again). The stack sits above the bottom tabs on phones
 * (--noema-bottom-inset, set by the frame), centred, and never wider than the screen.
 */
import { css, html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { TimerHandle } from '../../ports/clock.ts';
import { NoemaElement } from '../core/element.ts';
import { base, control } from '../core/styles.ts';
import { icon } from './icons.ts';

export type ToastKind = 'toast' | 'notice' | 'alert';

/** A drawn toast (the notifier policy's ShownToast). */
export interface ShownToast {
  remove(): void;
  isShown(): boolean;
}

interface Item {
  readonly id: number;
  readonly text: string;
  readonly kind: ToastKind;
  timer: TimerHandle | null;
}

export class NoemaToaster extends NoemaElement {
  static override styles = [
    base,
    control,
    css`
      :host {
        position: fixed;
        z-index: var(--z-toast, 90);
        inset-inline: 0;
        bottom: calc(16px + var(--noema-bottom-inset, 0px) + env(safe-area-inset-bottom, 0px));
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        pointer-events: none;
      }
      .toasts {
        display: contents;
      }
      .t {
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: min(520px, 100%);
        padding: 10px 8px 10px 16px;
        padding-inline: 16px 8px;
        border-radius: var(--u-br);
        background: var(--u-ink);
        color: var(--u-paper);
        box-shadow: var(--u-shadow);
        line-height: 1.4;
        overflow-wrap: anywhere;
        pointer-events: auto;
        animation: u-rise var(--u-base) var(--u-ease);
      }
      .t.alert {
        background: var(--u-bad);
        color: var(--u-bad-ink);
        border: 1px solid currentColor;
      }
      .t span {
        flex: 1;
      }
      .x {
        min-width: 32px;
        min-height: 32px;
        width: 32px;
        padding: 0;
        color: inherit;
        border-radius: var(--u-ir);
      }
      .x:hover {
        background: color-mix(in srgb, currentColor 14%, transparent);
      }
      .t .x:focus-visible {
        outline-color: currentColor;
      }
      @keyframes u-rise {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
      }
    `,
  ];
  #items: Item[] = [];
  #seq = 0;
  #live = '';

  /** Draws a toast that removes itself after ms (the notifier policy's surface). */
  show(text: string, kind: ToastKind, ms: number): ShownToast {
    const item: Item = { id: ++this.#seq, text, kind, timer: null };
    this.#items = [...this.#items, item];
    item.timer = this.services.clock.setTimeout(() => {
      this.#drop(item);
    }, ms);
    this.requestUpdate();
    return {
      remove: () => {
        this.#drop(item);
      },
      isShown: () => this.#items.includes(item),
    };
  }

  /** Announces the text in the assertive live region (emptied first, so the same text is announced again). */
  announce(text: string): void {
    this.#live = '';
    this.requestUpdate();
    this.services.clock.setTimeout(() => {
      this.#live = text;
      this.requestUpdate();
    }, 50);
  }

  /** The texts on screen, oldest first (tests, the 🔔 bell). */
  get shown(): readonly { readonly text: string; readonly kind: ToastKind }[] {
    return this.#items.map(({ text, kind }) => ({ text, kind }));
  }

  #drop(item: Item): void {
    if (!this.#items.includes(item)) return;
    if (item.timer) this.services.clock.clearTimeout(item.timer);
    this.#items = this.#items.filter(x => x !== item);
    this.requestUpdate();
  }

  override render(): TemplateResult {
    // .toasts and .toast: the names the app's toasts always had (the browser suites find them by these)
    return html`<div class="toasts">
        ${repeat(
          this.#items,
          x => x.id,
          x =>
            html`<div class="t toast ${x.kind}" role=${x.kind === 'notice' ? 'status' : 'none'}>
              ${x.kind === 'alert' ? icon('alert') : ''}<span>${x.text}</span>
              <button
                class="ctl x"
                type="button"
                aria-label=${this.t('ui.toast.dismiss')}
                title=${this.t('ui.toast.dismiss')}
                @click=${() => {
                  this.#drop(x);
                }}
              >
                ${icon('close')}
              </button>
            </div>`,
        )}
      </div>
      <div class="vh" role="alert" aria-live="assertive" aria-atomic="true">${this.#live}</div>`;
  }
}
