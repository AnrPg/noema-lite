/**
 * 🔔 What waits for the learner: news that arrived here (what the notifier moved off the screen: a third notice at once),
 * shares and invitations, and updates of what they took from others. News is a row with its time and ✕; "Clear all"
 * when news waits; the other kinds are drawn by the area they belong to (`row`). And the cover shown while the account is
 * in use on another device: nothing is saved here meanwhile, so the two can never undo each other's progress.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaElement } from '../../core/element.ts';

export interface BellItem {
  readonly id: string;
  readonly kind: string;
  readonly text?: string;
  readonly at?: number;
}
export interface BellData {
  /** a share, an invitation or an update, as its area draws it */
  row(item: BellItem): Node;
  dismiss(id: string): void;
  clear(): void;
  ago(at: number): string;
  /** the words when nothing waits (they depend on the kind of account) */
  readonly empty: string;
}

export class NoemaBellList extends NoemaElement {
  static override properties = { items: { attribute: false }, data: { attribute: false } };
  declare items: readonly BellItem[];
  declare data: BellData | undefined;
  constructor() {
    super();
    this.items = [];
  }
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    if (!this.items.length) return html`<p class="ns-muted">${d.empty}</p>`;
    const news = this.items.some(x => x.kind === 'notice');
    return html`${this.items.map(x =>
      x.kind === 'notice'
        ? html`<div class="nx-req nx-notice">
            <div class="grow">${x.text}${x.at ? html`<div class="tiny">${d.ago(x.at)}</div>` : nothing}</div>
            <button
              class="btn small ghost"
              title=${this.t('loader.note.dismiss')}
              aria-label=${this.t('loader.note.dismiss')}
              @click=${() => {
                d.dismiss(x.id);
              }}
            >
              ✕
            </button>
          </div>`
        : d.row(x),
    )}
    ${
      news
        ? html`<div class="row nx-noticeclear" style="justify-content:flex-end">
            <button
              class="btn small ghost"
              @click=${() => {
                d.clear();
              }}
            >
              ${this.t('loader.note.clearAll')}
            </button>
          </div>`
        : nothing
    }`;
  }
}

export interface InUseData {
  /** where the account is in use: the other tab, the other device's system and browser, or its name */
  readonly where: string;
  /** this device did some work offline that has not reached the cloud */
  readonly unsynced: boolean;
  /** "Use here": pauses the other one and brings in what it did; false: offline */
  take(): Promise<boolean>;
}

export class NoemaInUse extends NoemaElement {
  static override properties = { data: { attribute: false }, busy: { state: true } };
  declare data: InUseData | undefined;
  declare busy: boolean;
  constructor() {
    super();
    this.busy = false;
  }
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  override firstUpdated(): void {
    this.querySelector('button')?.focus();
  }
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const where = d.where;
    return html`<div class="noema-inuse-dot"></div>
      <h2>${this.t('inuse.title', { where })}</h2>
      <p>${this.t('inuse.why')}</p>
      <button
        class="btn primary"
        ?disabled=${this.busy}
        @click=${async () => {
          this.busy = true;
          if (!(await d.take())) this.busy = false;
        }}
      >
        ${this.t('inuse.use')}
      </button>
      <p class="muted small">${this.t('inuse.useNote', { where })}</p>
      <p class="muted small">${this.t('inuse.stay', { where })}</p>
      ${d.unsynced ? html`<p class="muted small">${this.t('inuse.offlineWork')}</p>` : nothing}`;
  }
}
