/**
 * #/search — every result and the filters (docs/SEARCH.md §5). The page's settings live in its address
 * (#/search?q=…&w=…&t=…&h=…&it=…&in=1&lg=…&st=…&c=…): the kinds (chips with counts), the side, "only here", the
 * language, the learner's status, and the saved search shown. Quiet: the filters fold under "Filters ▾", every group of
 * results starts folded with its count. Without words it lists the saved searches and the recent ones.
 * "Practise these results" shows when the kinds kept can all be practised; "Keep this search" saves it.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { Unsubscribe } from '../../../ports/common.ts';
import { ask, askText } from '../../community/ui/dialogs.ts';
import { copyText } from '../../community/ui/format.ts';
import type { ChromeMenuItem, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { hereOf, listOf, sameQuery, type SearchParams } from '../domain/params.ts';
import { TYPES } from '../domain/records.ts';
import type { SavedSearch } from '../domain/saved.ts';
import { langNameOf, type ShownResults } from './model.ts';
import type { SearchScreenDeps } from './quick.ts';
import { Results } from './results.ts';
import { SEARCH_CSS } from './styles.ts';

export class NoemaSearchPage extends CommunityScreen<SearchScreenDeps> {
  #P: SearchParams = {};
  #filtersOpen = false;
  #open = { q: '', set: new Set<string>() };
  #shownN = new Map<string, number>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #off: Unsubscribe | null = null;

  #L(k: string, p?: Record<string, string | number>): string {
    return this.t('sh.sr_' + k, p);
  }
  get #ui(): SearchScreenDeps['ui'] {
    return this.deps.ui;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'search', COMMON, SEARCH_CSS);
    const P = this.#ui.parse();
    if (!P.q && !P.w && !P.c && /^#\/lang(\/|$)/.test(this.host.outside('#/search'))) P.w = 'lang'; // opened from the languages: searches there
    this.#P = P;
    const I = this.#ui.warm();
    let last = -1;
    this.#off = I.on(st => {
      if (st.done !== last || !st.busy) {
        last = st.done;
        this.requestUpdate();
      }
    });
    void I.load().then(() => {
      this.requestUpdate();
    });
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
    clearTimeout(this.#timer);
  }
  protected override firstUpdated(changed: Map<PropertyKey, unknown>): void {
    super.firstUpdated(changed);
    const inp = this.querySelector<HTMLInputElement>('.ns-srin');
    if (inp) inp.value = this.#P.q ?? '';
    if (!this.#P.q) globalThis.setTimeout(() => inp?.focus(), 60);
  }

  /* ---------- the chrome: Search › the saved search; ⋮ the saved searches and this one's actions ---------- */
  #coll(): SavedSearch | null {
    return this.#P.c ? (this.#ui.collections().find(x => x.id === this.#P.c) ?? null) : null;
  }
  protected override chrome(): ScreenChrome {
    const coll = this.#coll(),
      n = this.#ui.collections().length;
    const saved: ChromeMenuItem = {
      label: this.#L('collections') + (n ? ` (${n})` : ''),
      sub: this.#L('collectionsSub'),
      icon: 'star',
      run: () => {
        this.host.go('#/search');
      },
    };
    return {
      tab: null,
      crumbs: [{ label: this.#L('search') }, ...(coll ? [{ label: coll.name }] : [])],
      back: this.host.outside('#/search') || '#/',
      menu: [
        saved,
        ...(coll ? (['-', ...this.#collMenu(coll).filter(x => x !== '-' && x.cls !== 'open')] as (ChromeMenuItem | '-')[]) : []),
      ],
    };
  }

  /** the actions of a saved search (its ⋮ in the list, and the page's ⋮ while it is shown) */
  #collMenu(c: SavedSearch): (ChromeMenuItem | '-')[] {
    const ui = this.#ui;
    return [
      {
        label: this.#L('open'),
        icon: 'search',
        cls: 'open',
        run: () => {
          this.host.go(ui.pageHash({ ...c.p, c: c.id }));
        },
      },
      {
        label: this.#L('practise'),
        icon: 'play',
        run: () => {
          void ui
            .index()
            .load()
            .then(() => {
              ui.practise(ui.run(c.p), c.p);
            });
        },
      },
      { label: this.#L('rename'), icon: 'edit', run: () => void this.#rename(c) },
      { label: this.#L('copyLink'), icon: 'share', run: () => void this.#copyLink(c) },
      '-',
      { label: this.#L('del'), icon: 'trash', danger: true, run: () => void this.#delete(c) },
    ];
  }
  async #rename(c: SavedSearch): Promise<void> {
    const n = await askText(this.deps, {
      heading: this.#L('rename'),
      label: this.#L('nameIt'),
      value: c.name,
      ok: this.#L('rename'),
      cancel: this.#L('cancel'),
      maxlength: 80,
    });
    if (n && this.#ui.rename(c.id, n)) this.#changed();
  }
  async #copyLink(c: SavedSearch): Promise<void> {
    const u = this.host.link(this.#ui.pageHash({ ...c.p, c: c.id }));
    if (await copyText(u)) this.toast(this.#L('linkCopied'), 2500);
    else
      await askText(this.deps, {
        heading: this.#L('copyLink'),
        label: this.#L('copyLink'),
        value: u,
        ok: this.t('sh.close'),
        cancel: this.#L('cancel'),
      });
  }
  async #delete(c: SavedSearch): Promise<void> {
    const yes = await ask(this.deps, {
      text: this.#L('delSure', { name: c.name }),
      ok: this.#L('del'),
      cancel: this.#L('cancel'),
      danger: true,
    });
    if (!yes) return;
    this.#ui.remove(c.id);
    if (this.#P.c === c.id) this.#setP({ c: '' });
    else this.#changed();
  }
  async #save(): Promise<void> {
    const P = this.#P;
    const name = await askText(this.deps, {
      heading: this.#L('save'),
      label: this.#L('nameIt'),
      value: P.q ?? '',
      ok: this.#L('save'),
      cancel: this.#L('cancel'),
      maxlength: 80,
    });
    if (!name) return;
    const c = this.#ui.save(P, name);
    if (!c) return;
    this.toast(this.#L('saved', { name: c.name }), 3000);
    this.#P = { ...c.p, c: c.id };
    this.replaceHash(this.#ui.pageHash(this.#P));
    this.#changed();
  }
  #changed(): void {
    this.chromeChanged();
    this.requestUpdate();
  }

  /** a change of the settings: the address follows (replaced: the browser's back leaves the page) */
  #setP(patch: SearchParams): void {
    const P: SearchParams = { ...this.#P, ...patch };
    const cut = new Set((Object.keys(P) as (keyof SearchParams)[]).filter(k => !P[k]));
    if (P.c && !sameQuery(this.#ui.collections().find(x => x.id === P.c)?.p, P)) cut.add('c');
    for (const k of cut) Reflect.deleteProperty(P, k);
    const was = this.#P.c;
    this.#P = P;
    this.replaceHash(this.#ui.pageHash(P));
    if (was !== P.c) this.chromeChanged();
    this.requestUpdate();
  }

  /* ---------- the parts ---------- */
  #seg(label: string, cur: string, opts: readonly (readonly [string, string])[], pick: (k: string) => void): TemplateResult {
    return html`<div class="ns-srfrow">
      <span class="nc-label">${label}</span>
      <div class="nc-seg" role="radiogroup" aria-label=${label}>
        ${opts.map(
          ([k, l]) =>
            html`<button
              type="button"
              role="radio"
              class=${cur === k ? 'on' : ''}
              aria-checked=${String(cur === k)}
              data-v=${k}
              @click=${() => {
                pick(k);
              }}
            >
              ${l}
            </button>`,
        )}
      </div>
    </div>`;
  }
  #chips(res: ShownResults): TemplateResult {
    const types = listOf(this.#P.t);
    const chip = (k: string, label: string, n: number, on: boolean): TemplateResult =>
      html`<button
        type="button"
        class="ns-srchip ${on ? 'on' : ''}"
        aria-pressed=${String(on)}
        data-ty=${k || 'all'}
        @click=${() => {
          if (!k) {
            this.#setP({ t: '' });
            return;
          }
          const s = new Set(types);
          if (s.has(k)) s.delete(k);
          else s.add(k);
          this.#setP({ t: [...s].join(',') });
        }}
      >
        ${label}<span class="n">${n}</span>
      </button>`;
    const part = (label: string, tys: readonly string[]): TemplateResult | typeof nothing => {
      const g = res.groups.filter(([ty]) => tys.includes(ty));
      return g.length
        ? html`<div class="ns-srkgrp">
            ${label ? html`<small>${label}</small>` : nothing}
            <div class="ns-srchips">${g.map(([ty, l]) => chip(ty, this.#L('t_' + ty), l.length, types.includes(ty)))}</div>
          </div>`
        : nothing;
    };
    const two = res.groups.some(([ty]) => TYPES.know.includes(ty)) && res.groups.some(([ty]) => TYPES.lang.includes(ty));
    return html`<div class="ns-srkinds" role="group" aria-label=${this.#L('kinds')}>
      <div class="ns-srchips">${chip('', this.#L('all'), res.total, !types.length)}</div>
      ${part(two ? this.t('sh.knowledge') : '', TYPES.know)} ${part(two ? this.t('sh.languages') : '', TYPES.lang)} ${part('', TYPES.both)}
    </div>`;
  }
  #filters(res: ShownResults | null): { readonly button: TemplateResult | typeof nothing; readonly panel: TemplateResult } {
    const P = this.#P,
      w = this.host.world(),
      ui = this.#ui;
    const rows: TemplateResult[] = [];
    if (w === 'both')
      rows.push(
        this.#seg(
          this.#L('world'),
          P.w ?? '',
          [
            ['', this.#L('all')],
            ['know', this.t('sh.knowledge')],
            ['lang', this.t('sh.languages')],
          ],
          k => {
            this.#setP({ w: k, lg: k === 'know' ? '' : (P.lg ?? ''), st: k === 'lang' ? '' : (P.st ?? '') });
          },
        ),
      );
    const hh = hereOf(P);
    if (hh)
      rows.push(
        this.#seg(
          this.#L('scope'),
          P.in ? 'here' : '',
          [
            ['', this.#L('everywhere')],
            ['here', this.#L('hereIs', { title: hh.title })],
          ],
          k => {
            this.#setP({ in: k ? '1' : '' });
          },
        ),
      );
    if (P.w !== 'know' && w !== 'know') {
      const langs = [
        ...new Set(
          ui
            .index()
            .records()
            .filter(r => r.w === 'lang')
            .flatMap(r => r.lg ?? []),
        ),
      ];
      if (langs.length > 1)
        rows.push(
          this.#seg(this.#L('lang'), P.lg ?? '', [['', this.#L('all')], ...langs.map(c => [c, langNameOf(this.i18n, c)] as const)], k => {
            this.#setP({ lg: k });
          }),
        );
    }
    if (P.w !== 'lang' && w !== 'lang')
      rows.push(
        this.#seg(
          this.#L('status'),
          P.st ?? '',
          [
            ['', this.#L('all')],
            ['unread', this.#L('stUnread')],
            ['unsolved', this.#L('stUnsolved')],
            ['wrong', this.#L('stWrong')],
          ],
          k => {
            this.#setP({ st: k });
          },
        ),
      );
    const n = (['w', 'in', 'lg', 'st', 't'] as const).filter(k => P[k]).length;
    if (n)
      rows.push(
        html`<button
          type="button"
          class="nc-link"
          @click=${() => {
            this.#setP({ w: '', in: '', lg: '', st: '', t: '' });
          }}
        >
          ${this.#L('clear')}
        </button>`,
      );
    const total = res?.total ?? 0;
    const panel = html`<div class="nc-panel ns-srfilters" ?hidden=${!this.#filtersOpen}>
      ${total && res ? html`<div class="ns-srfrow"><span class="nc-label">${this.#L('kinds')}</span>${this.#chips(res)}</div>` : nothing}
      ${rows}
    </div>`;
    const button =
      rows.length || total
        ? html`<noema-button
            class="ns-srfilt"
            size="sm"
            variant="quiet"
            aria-expanded=${String(this.#filtersOpen)}
            @click=${() => {
              this.#filtersOpen = !this.#filtersOpen;
              this.requestUpdate();
            }}
            >${(n ? this.#L('filtersN', { n }) : this.#L('filters')) + ' ▾'}</noema-button
          >`
        : nothing;
    return { button, panel };
  }
  #actions(res: ShownResults): TemplateResult | typeof nothing {
    if (!res.shownTotal) return nothing;
    const P = this.#P,
      ui = this.#ui;
    const sv = ui.collections().find(x => sameQuery(x.p, P));
    return html`<div class="ns-sracts">
      ${
        ui.canPractise(P)
          ? html`<noema-button
              class="ns-srpractise"
              size="sm"
              variant="primary"
              @click=${() => {
                ui.practise(res, P);
              }}
              >${this.#L('practise')}</noema-button
            >`
          : nothing
      }
      ${
        sv
          ? html`<span class="nc-pill ns-srsaved">${this.#L('collection')}: ${sv.name}</span>`
          : html`<noema-button class="ns-srsave" size="sm" variant="quiet" @click=${() => void this.#save()}
              >${this.#L('save')}</noema-button
            >`
      }
    </div>`;
  }
  #round(): TemplateResult | typeof nothing {
    const ui = this.#ui,
      R = ui.round();
    if (!R?.steps.length) return nothing;
    const st = R.steps[R.i],
      nx = R.steps[R.i + 1];
    return html`<div class="nc-panel ns-srround">
      <span class="nc-grow">${this.#L('roundOf', { i: R.i + 1, n: R.steps.length, title: st?.title ?? '' })}</span>
      <noema-button
        size="sm"
        variant="primary"
        @click=${() => {
          ui.goStep(nx ? R.i + 1 : R.i);
        }}
        >${nx ? this.#L('next', { title: nx.title }) : st?.title || this.#L('open')}</noema-button
      >
      <noema-button
        size="sm"
        variant="quiet"
        @click=${() => {
          ui.endRound();
          this.requestUpdate();
        }}
        >${this.#L('roundEnd')}</noema-button
      >
    </div>`;
  }
  #empty(): TemplateResult {
    const P = this.#P,
      ui = this.#ui;
    const mine = (p: SearchParams): boolean => !P.w || (p.w ?? '') === P.w; // one side searched: only its saved and recent searches
    const cols = ui.collections().filter(c => mine(c.p)),
      rec = ui.recents().filter(mine);
    const item = (title: string, sub: string, go: string, menu?: TemplateResult): TemplateResult =>
      html`<div class="nc-item">
        <button
          type="button"
          class="nc-who"
          @click=${() => {
            this.host.go(go);
          }}
        >
          <span class="t"><b>${title}</b>${sub ? html`<small>${sub}</small>` : nothing}</span>
        </button>
        ${menu ?? html`<span class="chev" aria-hidden="true">›</span>`}
      </div>`;
    return html`${
      cols.length
        ? html`<section class="ns-srcols">
            <span class="nc-label">${this.#L('collections')}</span>
            <p class="nc-tiny nc-muted">${this.#L('collectionsSub')}</p>
            <div class="nc-list">
              ${cols.map(c =>
                item(
                  c.name,
                  [ui.describe(c.p), this.#L('nItems', { n: ui.run(c.p).shownTotal })].filter(Boolean).join(' · '),
                  ui.pageHash({ ...c.p, c: c.id }),
                  this.#menu(this.t('sh.moreFor', { title: c.name }), this.#collMenu(c)),
                ),
              )}
            </div>
          </section>`
        : nothing
    }
    ${
      rec.length
        ? html`<section class="ns-srrecent">
            <span class="nc-label">${this.#L('recent')}</span>
            <div class="nc-list">${rec.map(p => item(p.q ?? '', ui.describe(p), ui.pageHash(p)))}</div>
          </section>`
        : nothing
    }
    ${!cols.length && !rec.length ? html`<p class="nc-muted">${this.#L('typeMore')}</p>` : nothing}`;
  }
  /** a ⋮ of a row: the kit's menu with these items */
  #menu(label: string, items: readonly (ChromeMenuItem | '-')[]): TemplateResult {
    return html`<noema-menu
      class="ns-menubtn"
      label=${label}
      @noema-select=${(e: CustomEvent<{ value: string }>) => {
        const it = items[Number(e.detail.value)];
        if (it && it !== '-') {
          if (it.href) this.host.go(it.href);
          else it.run?.();
        }
      }}
    >
      ${items.map((it, i) =>
        it === '-'
          ? html`<noema-menu-separator></noema-menu-separator>`
          : html`<noema-menu-item value=${String(i)} icon=${it.icon ?? ''} sub=${it.sub ?? ''} ?danger=${!!it.danger}
              >${it.label}</noema-menu-item
            >`,
      )}
    </noema-menu>`;
  }

  override render(): TemplateResult {
    const ui = this.#ui,
      P = this.#P,
      q = P.q ?? '';
    if (this.#open.q !== q) this.#open = { q, set: new Set() };
    const R = new Results({
      i18n: this.i18n,
      ui,
      open: this.#open.set,
      shownN: this.#shownN,
      redraw: () => {
        this.requestUpdate();
      },
    });
    const res = q.length >= 2 ? ui.run(P) : null;
    const F = this.#filters(res);
    let out: TemplateResult;
    if (!res) out = this.#empty();
    else if (!res.total)
      out = html`<div class="nc-panel nc-empty">
        ${this.host.face('breathe')}
        <p>${this.#L('none', { q })}</p>
        <p class="nc-tiny nc-muted">${this.#L('noneTip')}</p>
      </div>`;
    else
      out = html`<p class="nc-tiny nc-muted ns-srcount">${this.#L('results', { n: res.shownTotal })}</p>
        ${R.groups(res, q, { per: 3, fold: true })}`;
    return html`<div class="nc ns-searchview">
      <div class="ns-srbar">
        <input
          class="nc-input ns-srin"
          type="search"
          placeholder=${this.#L('placeholder')}
          aria-label=${this.#L('search')}
          enterkeyhint="search"
          autocomplete="off"
          @input=${(e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => {
              this.#shownN.clear();
              this.#setP({ q: v.trim() });
            }, 140);
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;
            clearTimeout(this.#timer);
            this.#setP({ q: (e.target as HTMLInputElement).value.trim() });
            if (this.#P.q) ui.remember(this.#P);
          }}
        />
      </div>
      ${this.#round()} ${R.progress(ui.index().state)}
      <div class="ns-srrow">${F.button} ${res ? this.#actions(res) : nothing}</div>
      ${F.panel}
      <div class="ns-srout">${out}</div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-search-page': NoemaSearchPage;
  }
}
