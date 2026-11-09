/**
 * Tabs inside a page (a chapter's Theory · Practice · Traps). The tab list is drawn from `tabs`; each panel is a light-DOM
 * child whose slot is the tab's id, and only the selected one is shown:
 *
 *   <noema-tabs .tabs=${[{ id: 'theory', label: 'Theory' }, { id: 'practice', label: 'Practice', badge: 3 }]} selected="theory">
 *     <section slot="theory">…</section> <section slot="practice">…</section>
 *   </noema-tabs>
 *
 * Keyboard (WAI-ARIA tabs, automatic activation): ← → move and select (swapped right to left), Home End; Tab goes into the
 * panel. A strip that does not fit wraps onto a second line (no sideways scrolling on 320 px). `noema-change` tells the
 * new id; the selection may also follow the address (`selected` set by the page from the router).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { NoemaElement } from '../core/element.ts';
import { uid } from '../core/focus.ts';
import { moveIndex } from '../core/keys.ts';
import { base } from '../core/styles.ts';
import { icon, isIconName } from './icons.ts';

export interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  /** a count shown next to the words (due cards, mistakes) */
  readonly badge?: number;
  readonly disabled?: boolean;
}
export interface TabChangeDetail {
  readonly id: string;
}

export class NoemaTabs extends NoemaElement {
  static override properties = {
    tabs: { attribute: false },
    selected: { type: String, reflect: true },
    label: { type: String },
  };
  static override styles = [
    base,
    css`
      :host {
        display: block;
      }
      [role='tablist'] {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        border-bottom: 1px solid var(--u-line);
        margin-bottom: 16px;
      }
      [role='tab'] {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 14px;
        border: 0;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        background: none;
        color: var(--u-ink2);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        border-radius: var(--u-br) var(--u-br) 0 0;
        transition: color var(--u-fast) var(--u-ease);
      }
      [role='tab']:hover {
        color: var(--u-ink);
        background: var(--u-acc-soft);
      }
      [role='tab'][aria-selected='true'] {
        color: var(--u-ink);
        border-bottom-color: var(--u-acc);
      }
      [role='tab'][disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .n {
        min-width: 22px;
        padding: 1px 7px;
        border-radius: 11px;
        background: var(--u-acc-soft);
        color: var(--u-ink);
        font-size: 0.78rem;
      }
      [role='tabpanel']:focus-visible {
        outline-offset: 4px;
        border-radius: 4px;
      }
    `,
  ];
  declare tabs: readonly TabDef[];
  declare selected: string;
  /** the tab list's name (what the tabs are of) */
  declare label: string;
  readonly #id = uid('tabs');

  constructor() {
    super();
    this.tabs = [];
    this.selected = '';
    this.label = '';
  }

  #current(): string {
    return this.tabs.some(t => t.id === this.selected) ? this.selected : (this.tabs.find(t => !t.disabled)?.id ?? '');
  }

  #select(id: string, focus: boolean): void {
    if (id !== this.selected) {
      this.selected = id;
      this.emit('noema-change', { id });
    }
    if (focus)
      void this.updateComplete.then(() => {
        this.renderRoot.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
      });
  }

  #onKey = (e: KeyboardEvent): void => {
    const i = this.tabs.findIndex(t => t.id === this.#current());
    const n = moveIndex(e.key, i, this.tabs.length, {
      orientation: 'horizontal',
      dir: this.uiDir,
      skip: k => this.tabs[k]?.disabled === true,
    });
    const tab = n === null ? undefined : this.tabs[n];
    if (!tab) return;
    e.preventDefault();
    this.#select(tab.id, true);
  };

  override render(): TemplateResult {
    const cur = this.#current();
    const tabId = (id: string): string => `${this.#id}-t-${id}`;
    return html`<div role="tablist" aria-label=${this.label || nothing} @keydown=${this.#onKey}>
        ${repeat(
          this.tabs,
          t => t.id,
          t =>
            html`<button
              role="tab"
              type="button"
              id=${tabId(t.id)}
              data-id=${t.id}
              aria-selected=${String(t.id === cur)}
              aria-controls="${this.#id}-panel"
              tabindex=${t.id === cur ? '0' : '-1'}
              ?disabled=${t.disabled === true}
              @click=${() => {
                this.#select(t.id, false);
              }}
            >
              ${isIconName(t.icon) ? icon(t.icon) : nothing}<span>${t.label}</span>${
                t.badge
                  ? html`<span class="n" aria-hidden="true">${this.i18n.format.number(t.badge)}</span
                      ><span class="vh">${this.t('ui.tabs.count', { n: t.badge })}</span>`
                  : nothing
              }
            </button>`,
        )}
      </div>
      <div role="tabpanel" id="${this.#id}-panel" aria-labelledby=${tabId(cur)} tabindex="0"><slot name=${cur}></slot></div>`;
  }
}
