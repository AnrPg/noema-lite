/**
 * 🔎 The quick sheet (the top bar's magnifier, / or Ctrl K): type, see the first results of each kind, "Open in a
 * page" (or Enter) goes to #/search with every result and the filters. Opened from a subject, a Roadmap or a course it
 * can search only there.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { Unsubscribe } from '../../../ports/common.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { CommunityElement } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import type { Here } from '../domain/params.ts';
import type { SearchDeps, SearchUi } from './model.ts';
import { Results } from './results.ts';
import { SEARCH_CSS } from './styles.ts';

export interface SearchScreenDeps extends SearchDeps {
  readonly ui: SearchUi;
}

export class NoemaSearchQuick extends CommunityElement<SearchScreenDeps> {
  static override properties = { ...CommunityElement.properties, here: { attribute: false } };
  declare here: Here | null;
  /** closes the sheet (set by quickSearch) */
  close: () => void = () => undefined;
  #scope: 'all' | 'here' = 'all';
  #q = '';
  #timer: ReturnType<typeof setTimeout> | undefined;
  #off: Unsubscribe | null = null;
  #shownN = new Map<string, number>();

  constructor() {
    super();
    this.here = null;
  }
  #L(k: string, p?: Record<string, string | number>): string {
    return this.t('sh.sr_' + k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'search', COMMON, SEARCH_CSS);
    const I = this.deps.ui.warm();
    let last = -1;
    this.#off = I.on(st => {
      if (st.done !== last || !st.busy) {
        last = st.done;
        this.requestUpdate();
      }
    });
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
    clearTimeout(this.#timer);
  }
  protected override firstUpdated(): void {
    globalThis.setTimeout(() => this.querySelector<HTMLInputElement>('.ns-srin')?.focus(), 60);
  }

  #params(): Record<string, string> {
    const h = this.deps.ui.hereParams(this.here);
    return { q: this.#q, ...(h as Record<string, string>), ...(this.#scope === 'here' ? { in: '1' } : {}) };
  }
  #toPage(): void {
    this.close();
    this.host.go(this.deps.ui.pageHash(this.#params()));
  }

  #out(): TemplateResult {
    const q = this.#q;
    if (q.length < 2) return html`<p class="nc-tiny nc-muted">${this.#L('typeMore')}</p>`;
    const ui = this.deps.ui,
      res = ui.run(this.#params());
    if (!res.total)
      return html`<p class="nc-muted">${this.#L('none', { q })}</p>
        ${ui.index().state.busy ? nothing : html`<p class="nc-tiny nc-muted">${this.#L('noneTip')}</p>`}`;
    const R = new Results({
      i18n: this.i18n,
      ui,
      shownN: this.#shownN,
      redraw: () => {
        this.requestUpdate();
      },
      onOpen: () => {
        this.close();
      },
    });
    return html`<p class="nc-tiny nc-muted">${this.#L('results', { n: res.total })}</p>
      ${R.groups(res, q, { per: 3, compact: true })}`;
  }

  override render(): TemplateResult {
    const ui = this.deps.ui,
      hh = this.here,
      nCol = ui.collections().length;
    const R = new Results({
      i18n: this.i18n,
      ui,
      shownN: this.#shownN,
      redraw: () => {
        this.requestUpdate();
      },
    });
    return html`<div class="nc ns-srquickbody">
      <input
        class="nc-input ns-srin"
        type="search"
        placeholder=${this.#L('placeholder')}
        aria-label=${this.#L('search')}
        enterkeyhint="search"
        autocomplete="off"
        autofocus
        @input=${(e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          clearTimeout(this.#timer);
          this.#timer = setTimeout(() => {
            this.#q = v.trim();
            this.#shownN.clear();
            this.requestUpdate();
          }, 120);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          this.#q = (e.target as HTMLInputElement).value.trim();
          this.#toPage();
        }}
      />
      ${
        hh
          ? html`<div class="nc-seg ns-srscope" role="radiogroup" aria-label=${this.#L('scope')}>
              ${(
                [
                  ['all', this.#L('everywhere')],
                  ['here', this.#L('hereIs', { title: hh.title })],
                ] as const
              ).map(
                ([k, l]) =>
                  html`<button
                    type="button"
                    role="radio"
                    class=${this.#scope === k ? 'on' : ''}
                    aria-checked=${String(this.#scope === k)}
                    data-v=${k}
                    @click=${() => {
                      this.#scope = k;
                      this.requestUpdate();
                    }}
                  >
                    ${l}
                  </button>`,
              )}
            </div>`
          : nothing
      }
      ${R.progress(ui.index().state)}
      <div class="ns-srquick">${this.#out()}</div>
      <div class="nc-row end ns-srfoot">
        <noema-button
          class="ns-srpage"
          size="sm"
          @click=${() => {
            this.#toPage();
          }}
          >${this.#L('openPage')} →</noema-button
        >
        ${
          nCol
            ? html`<noema-button
                class="ns-srgosaved"
                size="sm"
                variant="quiet"
                @click=${() => {
                  this.close();
                  this.host.go('#/search');
                }}
                >${this.#L('collectionsN', { n: nCol })}</noema-button
              >`
            : nothing
        }
      </div>
    </div>`;
  }
}

/** Opens the quick sheet (here: where the learner is now, for "only here"). */
export function quickSearch(deps: SearchScreenDeps, here: Here | null, i18nT: (k: string) => string): void {
  const el = globalThis.document.createElement('noema-search-quick');
  if (!(el instanceof NoemaSearchQuick)) return;
  el.deps = deps;
  el.here = here;
  const d = openDialog(deps, { heading: i18nT('sh.sr_search'), cls: 'ns-srsheet', placement: 'sheet', content: el });
  el.close = () => {
    d.close();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-search-quick': NoemaSearchQuick;
  }
}
