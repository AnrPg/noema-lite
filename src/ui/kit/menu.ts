/**
 * Menus: the ⋮ of a page, the ▾ next to the button it belongs to (docs/UI_MAP.md). The menu draws its own button (an icon
 * button with its name, or a text button with ▾), and its items are the light-DOM children:
 *
 *   <noema-menu label="More" @noema-select=${e => …e.detail.value}>
 *     <noema-menu-item value="edit" icon="edit" sub="Change the steps">Edit</noema-menu-item>
 *     <noema-menu-separator></noema-menu-separator>
 *     <noema-menu-item value="delete" icon="trash" danger>Delete</noema-menu-item>
 *   </noema-menu>
 *   <noema-menu kind="button" label="Practice"> …                  (a text button "Practice ▾")
 *
 * Keyboard (WAI-ARIA menu button): Enter, Space or ↓ opens on the first item, ↑ on the last; ↑ ↓ Home End move; typing
 * jumps to the next item that starts with it; Enter or Space chooses; Escape closes (focus back on the button); Tab closes.
 * A press outside closes it. The panel stays inside the viewport (place.ts), above the button when there is no room below.
 */
import { css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { NoemaElement } from '../core/element.ts';
import { uid } from '../core/focus.ts';
import { isPrintable, moveIndex, typeahead } from '../core/keys.ts';
import { openOverlay } from '../core/overlays.ts';
import { place } from '../core/place.ts';
import { base, control, panel } from '../core/styles.ts';
import { icon, isIconName } from './icons.ts';

export interface MenuSelectDetail {
  readonly value: string;
}

export class NoemaMenuItem extends NoemaElement {
  static override properties = {
    value: { type: String, reflect: true },
    icon: { type: String },
    sub: { type: String },
    href: { type: String },
    disabled: { type: Boolean, reflect: true },
    danger: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 8px 14px;
        cursor: pointer;
        outline: none;
        color: var(--u-ink);
        line-height: 1.3;
      }
      :host(:hover),
      :host(:focus) {
        background: var(--u-acc-soft);
      }
      :host(:focus-visible) {
        box-shadow: inset 0 0 0 2px var(--u-focus);
      }
      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
      }
      :host([danger]) {
        color: var(--u-bad-ink);
      }
      :host([danger]:hover),
      :host([danger]:focus) {
        background: var(--u-bad);
      }
      svg.i {
        color: var(--u-ink2);
      }
      :host([danger]) svg.i {
        color: inherit;
      }
      .txt {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .sub {
        color: var(--u-ink2);
        font-size: 0.82rem;
      }
      :host([danger]) .sub {
        color: inherit;
      }
    `,
  ];
  declare value: string;
  declare icon: string | undefined;
  declare sub: string | undefined;
  declare href: string | undefined;
  declare disabled: boolean;
  declare danger: boolean;

  constructor() {
    super();
    this.value = '';
    this.icon = undefined;
    this.sub = undefined;
    this.href = undefined;
    this.disabled = false;
    this.danger = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'menuitem');
    this.tabIndex = -1;
  }

  /** The item's words (for type-ahead). */
  get label(): string {
    return this.textContent.trim();
  }

  protected override updated(): void {
    if (this.disabled) this.setAttribute('aria-disabled', 'true');
    else this.removeAttribute('aria-disabled');
  }

  override render(): TemplateResult {
    return html`${isIconName(this.icon) ? icon(this.icon) : nothing}
      <span class="txt"><slot></slot>${this.sub ? html`<span class="sub">${this.sub}</span>` : nothing}</span>`;
  }
}

export class NoemaMenuSeparator extends NoemaElement {
  static override styles = css`
    :host {
      display: block;
      height: 1px;
      margin: 4px 0;
      background: var(--line, #ebe7dd);
    }
  `;
  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'separator');
  }
}

export class NoemaMenu extends NoemaElement {
  static override properties = {
    label: { type: String },
    kind: { type: String },
    icon: { type: String },
    align: { type: String },
    open: { type: Boolean, reflect: true },
  };
  static override styles = [
    base,
    control,
    panel,
    css`
      :host {
        display: inline-flex;
        position: relative;
      }
      .trigger {
        color: var(--u-ink2);
      }
      .trigger.icon {
        padding: 0;
        width: 40px;
        border-radius: var(--u-ir);
      }
      .trigger.button {
        background: var(--u-paper);
        border-color: var(--u-line);
        color: var(--u-ink);
        padding-inline: 14px 10px;
      }
      .trigger:hover,
      .trigger[aria-expanded='true'] {
        background: var(--u-acc-soft);
        color: var(--u-ink);
      }
      .panel {
        padding: 4px 0;
      }
    `,
  ];
  /** the menu's name: the icon button's label, or the text button's words */
  declare label: string;
  declare kind: 'icon' | 'button';
  declare icon: string;
  /** which edge of the button the panel lines up with (default: the end, as a ⋮ at the end of a bar) */
  declare align: 'start' | 'end';
  declare open: boolean;
  readonly #id = uid('menu');
  #active = -1;
  #typed = '';
  #typedAt = 0;
  #release: (() => void) | null = null;
  #restore = false;

  constructor() {
    super();
    this.label = '';
    this.kind = 'icon';
    this.icon = 'more';
    this.align = 'end';
    this.open = false;
    // clicks and hovers on the items (light children) are caught on the host: the item is in their path either way
    this.addEventListener('click', this.#onItemClick);
    this.addEventListener('mouseover', this.#onItemOver);
  }

  /** The items that can be chosen, in order. */
  get items(): NoemaMenuItem[] {
    return [...this.children].filter((c): c is NoemaMenuItem => c instanceof NoemaMenuItem);
  }

  /** Opens the menu with focus on an item ('first' | 'last'). */
  show(focus: 'first' | 'last' = 'first'): void {
    if (this.open) return;
    this.open = true;
    const items = this.items,
      skip = (i: number): boolean => items[i]?.disabled ?? true;
    this.#active =
      focus === 'first'
        ? (moveIndex('Home', 0, items.length, { orientation: 'vertical', dir: 'ltr', skip }) ?? -1)
        : (moveIndex('End', 0, items.length, { orientation: 'vertical', dir: 'ltr', skip }) ?? -1);
    this.#release = openOverlay({
      host: this,
      lightDismiss: true,
      close: reason => {
        this.hide(reason === 'escape');
      },
    });
    this.emit('noema-open');
  }

  /** Closes the menu; `refocus`: focus goes back to its button. */
  hide(refocus = true): void {
    if (!this.open) return;
    this.open = false;
    this.#restore = refocus;
    this.#release?.();
    this.#release = null;
    this.emit('noema-close');
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#release?.();
    this.#release = null;
    this.open = false;
  }

  #trigger(): HTMLButtonElement | null {
    return this.renderRoot.querySelector('button.trigger');
  }

  #focusActive(): void {
    this.items[this.#active]?.focus();
  }

  #onTriggerKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.show('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.show('last');
    }
  };

  #onTriggerClick = (e: MouseEvent): void => {
    // a click from the keyboard (detail 0) was handled by keydown already
    if (e.detail === 0 && this.open) return;
    if (this.open) this.hide();
    else this.show('first');
  };

  #onPanelKey = (e: KeyboardEvent): void => {
    const items = this.items;
    const moved = moveIndex(e.key, this.#active, items.length, {
      orientation: 'vertical',
      dir: this.uiDir,
      skip: i => items[i]?.disabled ?? true,
    });
    if (moved !== null) {
      e.preventDefault();
      this.#active = moved;
      this.#focusActive();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = items[this.#active];
      if (item) this.#choose(item);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.hide(true);
      return;
    }
    if (isPrintable(e)) {
      const now = this.services.clock.now();
      this.#typed = now - this.#typedAt < 700 ? this.#typed + e.key : e.key;
      this.#typedAt = now;
      const hit = typeahead(
        items.map(x => (x.disabled ? '' : x.label)),
        this.#typed,
        this.#typed.length > 1 ? this.#active - 1 : this.#active,
      );
      if (hit !== null) {
        this.#active = hit;
        this.#focusActive();
      }
    }
  };

  #onItemClick = (e: MouseEvent): void => {
    if (!this.open) return;
    const item = e.composedPath().find((n): n is NoemaMenuItem => n instanceof NoemaMenuItem);
    if (item) this.#choose(item);
  };

  #onItemOver = (e: MouseEvent): void => {
    if (!this.open) return;
    const item = e.composedPath().find((n): n is NoemaMenuItem => n instanceof NoemaMenuItem);
    const i = item ? this.items.indexOf(item) : -1;
    if (i >= 0 && !item?.disabled && i !== this.#active) {
      this.#active = i;
      this.#focusActive();
    }
  };

  #choose(item: NoemaMenuItem): void {
    if (item.disabled) return;
    this.hide(true);
    const go = this.emit('noema-select', { value: item.value }, true);
    if (go && item.href !== undefined) this.ownerDocument.defaultView?.location.assign(item.href);
  }

  #position = (): void => {
    const p = this.renderRoot.querySelector<HTMLElement>('.panel'),
      t = this.#trigger(),
      w = this.ownerDocument.defaultView;
    if (!p || !t || !w) return;
    p.style.maxHeight = '';
    const a = t.getBoundingClientRect(),
      r = p.getBoundingClientRect();
    const at = place(
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { width: r.width, height: r.height },
      { width: w.innerWidth, height: w.innerHeight },
      { dir: this.uiDir, align: this.align },
    );
    Object.assign(p.style, { left: `${at.left}px`, top: `${at.top}px`, maxHeight: `${at.maxHeight}px`, maxWidth: `${at.maxWidth}px` });
  };

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    const w = this.ownerDocument.defaultView;
    if (this.open) {
      this.#position();
      w?.addEventListener('resize', this.#position);
      w?.addEventListener('scroll', this.#position, true);
      this.#focusActive();
    } else {
      w?.removeEventListener('resize', this.#position);
      w?.removeEventListener('scroll', this.#position, true);
      if (this.#restore) this.#trigger()?.focus();
      this.#restore = false;
    }
  }

  override render(): TemplateResult {
    const isIcon = this.kind !== 'button';
    return html`<button
        class="ctl trigger ${isIcon ? 'icon' : 'button'}"
        id="${this.#id}-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded=${String(this.open)}
        aria-controls="${this.#id}-list"
        aria-label=${isIcon ? this.label : nothing}
        title=${isIcon ? this.label : nothing}
        @keydown=${this.#onTriggerKey}
        @click=${this.#onTriggerClick}
      >
        ${isIcon ? (isIconName(this.icon) ? icon(this.icon) : nothing) : html`<span>${this.label}</span>${icon('down')}`}
      </button>
      <div
        class="panel"
        id="${this.#id}-list"
        role="menu"
        aria-labelledby="${this.#id}-btn"
        ?hidden=${!this.open}
        @keydown=${this.#onPanelKey}
      >
        <slot></slot>
      </div>`;
  }
}
