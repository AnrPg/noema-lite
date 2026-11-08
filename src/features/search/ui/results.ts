/**
 * The results of a search as the page and the quick sheet draw them (docs/SEARCH.md §5): grouped by kind in a fixed
 * order, the exact matches on top, each result with its kind (and the field it was found in), Knowledge or Languages, a
 * piece of text around the word with the word marked, where it began (a conversation) and where it sits.
 * On the page every group is folded with its count; open, it shows its first few and "+N more".
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';
import { pill } from '../../community/ui/format.ts';
import { TYPES, type SearchRecord } from '../domain/records.ts';
import { sameText, snip, type SearchHit } from '../domain/scoring.ts';
import { langNameOf, type SearchUi, type ShownResults } from './model.ts';

const cap = (s: string): string => (s ? (s[0] ?? '').toUpperCase() + s.slice(1) : s);
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const short = (t: unknown): string => {
  const s = str(t);
  return s.length > 60 ? s.slice(0, 58) + '…' : s;
};
const toneOf = (ty: string): number => (ty === 'convo' ? 4 : TYPES.lang.includes(ty) ? 3 : 2);

export interface ResultsView {
  readonly i18n: I18n;
  readonly ui: SearchUi;
  /** the groups opened on the page (kept while the results redraw for the same words) */
  readonly open?: Set<string>;
  /** how many of each group are shown now */
  readonly shownN: Map<string, number>;
  readonly redraw: () => void;
  /** a result was opened (the quick sheet closes) */
  readonly onOpen?: () => void;
}

export class Results {
  readonly #v: ResultsView;
  constructor(v: ResultsView) {
    this.#v = v;
  }
  #L(k: string, p?: Record<string, string | number>): string {
    return this.#v.i18n.t('sh.sr_' + k, p);
  }
  #has(k: string): boolean {
    return this.#v.i18n.has('sh.sr_' + k);
  }

  /** "Word", "Exercise · Question", "Meaning · Translation (Greek)", a theory block by its kind */
  kindLabel(r: SearchRecord, field: string | undefined): string {
    if (r.ty === 'theory') return this.#L('b_' + (str(r.x?.['bt']) || 'paragraph'));
    const one = this.#L('1_' + r.ty);
    if (r.ty === 'convo' || !field) return one;
    const [f = '', code] = field.split(':');
    if (f === r.ty || !this.#has('f_' + f)) return one;
    return `${one} · ${this.#L('f_' + f)}${code ? ' (' + langNameOf(this.#v.i18n, code) + ')' : ''}`;
  }

  /** where a conversation began, in words: its style, the button and the exact part */
  convoWhere(r: SearchRecord): string {
    const i18n = this.#v.i18n,
      x = r.x ?? {},
      o = (x['origin'] ?? {}) as Record<string, unknown>,
      sj = r.sj ?? '',
      bits: string[] = [];
    const rec = (k: string): SearchRecord | null => this.#v.ui.record(k);
    const mode = str(x['mode']);
    if (mode && i18n.has('sh.mode' + cap(mode))) bits.push(i18n.t('sh.mode' + cap(mode)));
    const viaK = str(o['via']) ? 'via_' + str(o['via']) : r.w === 'lang' ? 'via_lang' : '';
    if (viaK && this.#has(viaK)) bits.push(this.#L(viaK));
    const chN = (id: unknown): string => str(rec(`s:${sj}:ch:${str(id)}`)?.x?.['n']) || '?';
    const ctx = str(x['ctx']),
      ctxId = str(x['ctxId']);
    let where = '';
    if (str(o['ex']) || (ctx === 'exercise' && ctxId && !ctxId.startsWith('fc:'))) {
      const e = rec(`s:${sj}:ex:${str(o['ex']) || ctxId}`);
      if (e) where = this.#L('whereEx', { n: str(e.x?.['n']) || '?', c: chN(e.x?.['ch']) }) + ' ' + this.#L('quoted', { t: short(e.ti) });
    } else if (str(o['card']) || ctxId.startsWith('fc:')) {
      const cd = rec(`s:${sj}:fc:${str(o['card']) || ctxId.slice(3)}`);
      if (cd) where = this.#L('whereCard', { c: chN(cd.x?.['ch']) }) + ' ' + this.#L('quoted', { t: short(cd.ti) });
    } else if (str(o['bid']) && (str(o['sec']) || str(x['sec']))) {
      const b = rec(`s:${sj}:b:${str(o['sec']) || str(x['sec'])}:${str(o['bid'])}`);
      if (b) where = this.#L('whereBlock', { kind: this.#L('b_' + (str(b.x?.['bt']) || 'paragraph')), sec: b.pa?.[b.pa.length - 1] ?? '' });
    } else if (str(o['drill']) || ctx === 'playbook') {
      const d = rec(`s:${sj}:dr:${str(o['drill']) || ctxId}`);
      if (d) where = this.#L('whereDrill', { t: short(d.ti) });
    }
    if (!where && (str(o['sec']) || str(x['sec']) || ctx === 'section')) {
      const s = rec(`s:${sj}:s:${str(o['sec']) || str(x['sec']) || ctxId}`);
      if (s) where = this.#L('whereSec', { sec: short(s.ti) });
    }
    if (!where && (str(o['ch']) || str(x['ch']) || ctx === 'chapter')) {
      const c = rec(`s:${sj}:ch:${str(o['ch']) || str(x['ch']) || ctxId}`);
      if (c) where = this.#L('whereCh', { c: str(c.x?.['n']) || '?' }) + ' ' + this.#L('quoted', { t: short(c.ti) });
    }
    if (!where && str(x['label'])) where = short(x['label']);
    if (where) bits.push(where);
    return bits.join(' · ');
  }

  result(hit: SearchHit, q: string): TemplateResult {
    const r = hit.r,
      sn = snip(hit),
      i18n = this.#v.i18n;
    const tag = r.w === 'lang' ? pill(i18n.t('sh.languages'), 3, 'ns-srw') : pill(i18n.t('sh.knowledge'), 1, 'ns-srw');
    const langs = r.w === 'lang' && r.lg?.length && r.lg.length <= 2 ? r.lg.map(c => langNameOf(i18n, c)).join(', ') : '';
    const where = r.ty === 'convo' ? this.convoWhere(r) : '';
    const path = (r.pa ?? []).filter(Boolean).join(' › ');
    const inTitle = hit.fi === 0 && sameText(r.f[0]?.[1] ?? '', r.ti);
    return html`<button
      type="button"
      class="ns-sr"
      data-k=${r.k}
      data-ty=${r.ty}
      @click=${() => {
        this.#v.onOpen?.();
        this.#v.ui.open(r, q);
      }}
    >
      <span class="ns-srtop"><span class="ns-srk">${this.kindLabel(r, sn.field)}</span>${tag}</span>
      <b class="ns-srt">${r.ti}</b>
      ${
        (sn.hit || sn.post) && !inTitle
          ? html`<span class="ns-srsn">${sn.pre}${sn.hit ? html`<mark>${sn.hit}</mark>` : nothing}${sn.post}</span>`
          : nothing
      }
      ${where ? html`<span class="ns-srvia">${where}</span>` : nothing}
      ${path || langs ? html`<span class="ns-srpath">${[path, langs].filter(Boolean).join(' · ')}</span>` : nothing}
    </button>`;
  }

  /** the groups: per (how many at first), compact (the sheet), fold (the page: each group folded) */
  groups(res: ShownResults, q: string, { per = 5, compact = false, fold = false } = {}): TemplateResult {
    const v = this.#v,
      nTop = compact ? 2 : 4;
    const exact = res.exact.slice(0, nTop),
      top = new Set(exact.map(x => x.r.k));
    const step = compact ? 10 : 20;
    return html`<div class="ns-srgroups ${compact ? 'compact' : ''}">
      ${
        exact.length
          ? html`<section class="ns-srgrp ns-srexact">
              <div class="ns-srh"><span class="nc-label">${this.#L('exact')}</span></div>
              ${exact.map(x => this.result(x, q))}
            </section>`
          : nothing
      }
      ${res.shown.map(([ty, all]) => {
        const list = all.filter(x => !top.has(x.r.k));
        if (!list.length) return nothing;
        const n = Math.min(v.shownN.get(ty) ?? per, list.length);
        const head = html`<span class="nc-label">${this.#L('t_' + ty)}</span>${pill(String(all.length), toneOf(ty))}`;
        const isOpen = !fold || (v.open?.has(ty) ?? false);
        const more =
          isOpen && n < list.length
            ? html`<button
                type="button"
                class="nc-link ns-srmore"
                @click=${() => {
                  v.shownN.set(ty, Math.min(list.length, n + step));
                  v.redraw();
                }}
              >
                ${this.#L('more', { n: list.length - n })}
              </button>`
            : nothing;
        const body = html`<div class="ns-srlist" ?hidden=${!isOpen}>
          ${isOpen ? list.slice(0, n).map(x => this.result(x, q)) : nothing}
        </div>`;
        return html`<section class="ns-srgrp ${fold && isOpen ? 'open' : ''}" data-ty=${ty}>
          ${
            fold
              ? html`<button
                  type="button"
                  class="ns-srh ns-srfold"
                  aria-expanded=${String(isOpen)}
                  @click=${() => {
                    if (isOpen) v.open?.delete(ty);
                    else v.open?.add(ty);
                    v.redraw();
                  }}
                >
                  ${head}<span class="ns-chev" aria-hidden="true">›</span>
                </button>`
              : html`<div class="ns-srh">${head}</div>`
          }
          ${body} ${more}
        </section>`;
      })}
    </div>`;
  }

  /** one quiet line while the sources are read (the first time: the whole app) */
  progress(st: { readonly busy: boolean; readonly done: number; readonly total: number }): TemplateResult {
    return html`<div class="ns-srprog" role="status" aria-live="polite" ?hidden=${!st.busy}>
      ${
        st.busy
          ? html`<b>${this.#L('indexing', { done: Math.min(st.done + 1, st.total), total: st.total })}</b>
              <span class="nc-tiny nc-muted">${this.#L('indexingWhat')}</span>
              <i class="ns-srprogbar" style="width: ${Math.round((st.done / Math.max(1, st.total)) * 100)}%"></i>`
          : nothing
      }
    </div>`;
  }
}
