/**
 * ⓘ: a small explanation beside a setting or a word, shown when the learner asks for it (a toggletip: works with a
 * mouse, a finger, the keyboard and a screen reader alike; a hover-only tooltip would not).
 *
 *   <noema-tip topic="External activities">Outside activities that open without asking …</noema-tip>
 *
 * The button is named "About: <topic>"; pressing it shows the bubble and announces its words (a polite live region);
 * pressing again, Escape or a press elsewhere hides it. The bubble stays inside the viewport (place.ts).
 */
import { css, html, type PropertyValues, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { uid } from '../core/focus.ts';
import { openOverlay } from '../core/overlays.ts';
import { place } from '../core/place.ts';
import { base, panel } from '../core/styles.ts';
import { icon } from './icons.ts';

export class NoemaTip extends NoemaElement {
  static override properties = {
    topic: { type: String },
    open: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    panel,
    css`
      :host {
        display: inline-flex;
        vertical-align: middle;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: var(--u-ink2);
        cursor: pointer;
      }
      button:hover,
      button[aria-expanded='true'] {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      svg.i {
        width: 18px;
        height: 18px;
      }
      .panel {
        min-width: 0;
        max-width: min(300px, calc(100vw - 16px));
        padding: 10px 14px;
        font-size: 0.9rem;
        line-height: 1.45;
        color: var(--u-ink);
        z-index: var(--z-tip, 95);
      }
    `,
  ];
  /** what the tip explains (the button's name: "About: <topic>") */
  declare topic: string;
  declare open: boolean;
  readonly #id = uid('tip');
  #release: (() => void) | null = null;
  #refocus = false;

  constructor() {
    super();
    this.topic = '';
    this.open = false;
  }

  #toggle = (): void => {
    if (this.open) this.hide(false);
    else this.show();
  };

  show(): void {
    if (this.open) return;
    this.open = true;
    this.#release = openOverlay({
      host: this,
      lightDismiss: true,
      close: reason => {
        this.hide(reason === 'escape');
      },
    });
  }

  hide(refocus = true): void {
    if (!this.open) return;
    this.open = false;
    this.#refocus = refocus;
    this.#release?.();
    this.#release = null;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#release?.();
    this.#release = null;
    this.open = false;
  }

  #position = (): void => {
    const p = this.renderRoot.querySelector<HTMLElement>('.panel'),
      b = this.renderRoot.querySelector('button'),
      w = this.ownerDocument.defaultView;
    if (!p || !b || !w) return;
    const a = b.getBoundingClientRect(),
      r = p.getBoundingClientRect();
    const at = place(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { width: r.width, height: r.height },
      { width: w.innerWidth, height: w.innerHeight },
      { dir: this.uiDir, align: 'center' },
    );
    Object.assign(p.style, { left: `${at.left}px`, top: `${at.top}px`, maxWidth: `${at.maxWidth}px` });
  };

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    const w = this.ownerDocument.defaultView;
    if (this.open) {
      this.#position();
      w?.addEventListener('resize', this.#position);
      w?.addEventListener('scroll', this.#position, true);
    } else {
      w?.removeEventListener('resize', this.#position);
      w?.removeEventListener('scroll', this.#position, true);
      if (this.#refocus) this.renderRoot.querySelector('button')?.focus();
      this.#refocus = false;
    }
  }

  override render(): TemplateResult {
    const name = this.t('ui.tip.about', { topic: this.topic });
    return html`<button
        type="button"
        aria-label=${name}
        title=${name}
        aria-expanded=${String(this.open)}
        aria-controls="${this.#id}-b"
        @click=${this.#toggle}
      >
        ${icon('info')}
      </button>
      <div class="panel" id="${this.#id}-b" role="status" ?hidden=${!this.open}>${this.open ? html`<slot></slot>` : ''}</div>`;
  }
}
