/**
 * 🌍 The Roadmaps other learners made public (docs/CURRICULUM.md §8): search them (title, description, who shares it),
 * read their titles in the interface language (🌐, the app's translator), join one (that needs a cloud account) or open
 * it (it is mine, or I joined it already). A dialog:
 *
 *   NoemaRoadmapPublic.open({ account })
 *
 * Fires roadmap-open { roadmap } for a Roadmap to show (joined, or on this device), roadmap-library for ← My Roadmaps;
 * then it closes.
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import type { PublicRoadmap } from './data.ts';
import { RoadmapElement } from './element.ts';
import { openDialog } from './open.ts';
import { screen } from './styles.ts';

/** what the field matches: the title, the description, who shares it */
export function publicMatches(items: readonly PublicRoadmap[], q: string): PublicRoadmap[] {
  const w = q.trim().toLowerCase();
  return w ? items.filter(x => [x.title, x.description ?? '', x.owner_name ?? ''].join(' ').toLowerCase().includes(w)) : [...items];
}

/** The machine translator's buttons and marks, drawn in this shadow root (the app's own styles stay outside it). */
export const mtStyles = css`
  .mt-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
  }
  .mt-bar[hidden] {
    display: none;
  }
  .mt-toggle,
  .mt-ask {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .mt-btn,
  .mt-all,
  .mt-go,
  .mt-no {
    min-height: 28px;
    padding: 2px 10px;
    border: 1px solid var(--u-line);
    border-radius: var(--u-br);
    background: var(--u-paper);
    color: var(--u-acc-text);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .mt-btn:focus-visible,
  .mt-all:focus-visible,
  .mt-go:focus-visible,
  .mt-no:focus-visible {
    outline: 2px solid var(--u-acc);
    outline-offset: 1px;
  }
  .mt-status {
    font-size: 0.875rem;
    color: var(--u-ink2);
  }
  .mt-status:empty {
    display: none;
  }
  .mt-badge {
    margin-inline-start: 0.4em;
    padding: 0 0.35em;
    border-radius: 6px;
    font-size: 0.75em;
    font-style: italic;
    color: var(--u-ink2);
    background: var(--u-bg);
  }
`;

export class NoemaRoadmapPublic extends RoadmapElement {
  static override properties = {
    account: { type: String },
    items: { state: true },
    error: { state: true },
    q: { state: true },
    busy: { state: true },
  };
  static override styles = [
    base,
    screen,
    mtStyles,
    css`
      :host {
        display: contents;
      }
      .cm-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
        gap: 10px;
        margin-top: 10px;
      }
      .cm-pubcard {
        display: grid;
        gap: 6px;
        align-content: start;
        min-width: 0;
        padding: 12px;
        border-radius: var(--u-r);
        border: 1px solid var(--u-line);
        background: var(--u-paper);
        color: var(--u-ink);
        overflow-wrap: anywhere;
      }
      .cm-cardtop {
        display: flex;
        gap: 8px;
        align-items: baseline;
      }
      /* the Roadmap's own words (its language, not the interface's) take the direction of their first letter */
      .cm-cardtop b,
      .cm-desc {
        unicode-bidi: plaintext;
      }
      .empty {
        text-align: center;
        padding: 24px 12px;
        color: var(--u-ink2);
      }
      .empty .e {
        font-size: 2rem;
      }
    `,
  ];
  declare account: string;
  declare items: PublicRoadmap[] | null;
  declare error: string;
  declare q: string;
  declare busy: string;
  /** each shared text one element kept across drawings (its translation, once shown, stays) */
  #texts = new Map<string, HTMLElement>();
  #toggles = new Map<string, HTMLElement | null>();
  #bar: HTMLElement | null = null;

  constructor() {
    super();
    this.account = '';
    this.items = null;
    this.error = '';
    this.q = '';
    this.busy = '';
  }

  /** Opens the public Roadmaps (the library's 🌍 Explore Roadmaps). */
  static open(p: { account: string }): NoemaRoadmapPublic {
    return openDialog(Object.assign(new NoemaRoadmapPublic(), p));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('cm-public');
  }

  get #dialog(): NoemaDialog | null {
    return this.renderRoot.querySelector('noema-dialog');
  }

  show(): void {
    this.#dialog?.show();
    void this.#load();
  }

  async #load(): Promise<void> {
    try {
      this.items = await this.data.share.explore(this.account);
    } catch (e) {
      this.error = '⚠️ ' + this.i18n.err(e);
    }
  }

  /** says what to show (the page that opened it answers), then closes (a closed dialog leaves the page) */
  #leave(type: string, detail?: unknown): void {
    this.emit(type, detail);
    this.#dialog?.close('done');
  }

  async #join(x: PublicRoadmap): Promise<void> {
    if (!this.data.cloudOn(this.account)) {
      this.data.notify('☁️ ' + this.t('roadmap.map.pub.joinNeedsCloud'));
      return;
    }
    this.busy = x.id;
    try {
      const c = await this.data.share.join(this.account, x.id);
      this.data.notify('👥 ' + this.t('roadmap.map.inv.joined', { title: c.title ?? c.goal ?? '' }));
      this.#leave('roadmap-open', { roadmap: x.id });
    } catch (e) {
      this.data.notify('⚠️ ' + this.i18n.err(e));
    }
    this.busy = '';
  }

  /** a shared text, translatable on request */
  #shared(x: PublicRoadmap, part: 'title' | 'desc', text: string): HTMLElement {
    const key = x.id + '\u0000' + part,
      had = this.#texts.get(key);
    if (had) return had;
    const el = this.ownerDocument.createElement(part === 'title' ? 'b' : 'div');
    if (part === 'desc') el.className = 'tiny cm-desc';
    el.textContent = text;
    this.data.translate.mark(el, { language: x.language ?? null, kind: 'explore.roadmap' });
    this.#texts.set(key, el);
    return el;
  }

  #toggle(x: PublicRoadmap, els: HTMLElement[]): HTMLElement | null {
    if (!this.#toggles.has(x.id)) this.#toggles.set(x.id, this.data.translate.toggle(this.account, els));
    return this.#toggles.get(x.id) ?? null;
  }

  #card(x: PublicRoadmap): TemplateResult {
    const tN = this.#shared(x, 'title', x.title),
      dN = x.description ? this.#shared(x, 'desc', x.description) : null;
    const meta = [
      '👤 ' + (x.owner_name ?? this.t('roadmap.map.pub.someone')),
      x.steps ? this.t('roadmap.map.inv.steps', { n: x.steps }) : this.t('roadmap.map.inv.stepsUnknown'),
      '⚡ ' + this.t('roadmap.map.pub.prepared', { n: x.prepared }),
      x.language ? '🗣️ ' + x.language : '',
      x.updated_at ? '🕒 ' + this.i18n.format.date(x.updated_at, { year: 'numeric', month: 'numeric', day: 'numeric' }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return html`<div class="cm-pubcard" data-id=${x.id}>
      <div class="cm-cardtop"><span aria-hidden="true">🧭</span>${tN}</div>
      ${dN ?? nothing} ${this.#toggle(x, dN ? [tN, dN] : [tN]) ?? nothing}
      <div class="tiny">${meta}</div>
      <div class="row">
        ${
          x.have
            ? html`<noema-button
                size="sm"
                class="cm-openpub"
                @click=${(): void => {
                  this.#leave('roadmap-open', { roadmap: x.id });
                }}
                >🗺️ ${this.t(x.own ? 'roadmap.map.pub.openYours' : 'roadmap.map.pub.openJoined')}</noema-button
              >`
            : html`<noema-button size="sm" class="cm-joinbtn" ?disabled=${this.busy === x.id} @click=${(): void => void this.#join(x)}
                >➕ ${this.t('roadmap.map.inv.join')}</noema-button
              >`
        }
      </div>
    </div>`;
  }

  #list(): TemplateResult {
    if (this.error) return html`<p class="status bad">${this.error}</p>`;
    const all = this.items;
    if (!all) return html`<p class="tiny">⏳ …</p>`;
    const list = publicMatches(all, this.q);
    if (!list.length)
      return html`<div class="empty">
        <div class="e" aria-hidden="true">🌍</div>
        <p>${this.t(all.length ? 'roadmap.map.pub.noMatch' : 'roadmap.map.pub.none')}</p>
      </div>`;
    return html`${list.map(x => this.#card(x))}`;
  }

  protected override updated(): void {
    const slot = this.renderRoot.querySelector('.cm-mtbar'),
      grid = this.renderRoot.querySelector<HTMLElement>('.cm-cards');
    if (slot && grid && !this.#bar) {
      this.#bar = this.data.translate.bar(this.account, grid);
      if (this.#bar) slot.append(this.#bar);
    }
  }

  override render(): TemplateResult {
    const ph = this.t('roadmap.map.pub.search');
    return html`<noema-dialog class="cm-pubdlg" heading=${'🌍 ' + this.t('roadmap.map.lib.explore')}>
      <p class="tiny">${this.t('roadmap.map.pub.lead')} ${this.t('roadmap.map.share.rules')}</p>
      <noema-text-field
        class="cm-pubsearch"
        type="search"
        label=${ph}
        placeholder=${'🔎 ' + ph}
        @noema-change=${(e: CustomEvent<{ value: string }>): void => {
          this.q = e.detail.value;
        }}
      ></noema-text-field>
      <div class="cm-mtbar"></div>
      <div class="cm-cards">${this.#list()}</div>
      <noema-button
        slot="actions"
        variant="quiet"
        class="cm-pubmine"
        @click=${(): void => {
          this.#leave('roadmap-library');
        }}
        >${this.uiDir === 'rtl' ? '→' : '←'} ${this.t('roadmap.map.pub.mine')}</noema-button
      >
    </noema-dialog>`;
  }
}
