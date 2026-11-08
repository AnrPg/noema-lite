/**
 * ⫴ Parallel lanes (docs/LANGUAGES.md §9.2, D13; the course's #/lanes): the paths of the learner's languages side by side,
 * one quiet column per language, the same subject on the same level in every lane. Each step is a small button (a tile,
 * or a round dot with its code when the lanes are too narrow for tiles, or as chosen); pointing at a dot tells what it is,
 * a tap opens its card — what it teaches there, how far the learner is, the same step in the other languages, Open.
 *
 *   <noema-lang-lanes .port=${coursePort}></noema-lang-lanes>
 */
import { html, nothing, render, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { NoemaDialog } from '../../kit/dialog.ts';
import { NoemaScreen } from '../screen.ts';
import type { CoursePort, LaneCell, LaneInfo, LanesView } from './course-port.ts';

/** px a tile needs: four languages still fit as tiles on a phone, five do not */
export const LANE_MIN_TILE = 80;
/** dots or tiles: as chosen, else by the width the lanes have */
export const laneDots = (view: LanesView, width: number, n: number): boolean =>
  view === 'dots' ? true : view === 'tiles' ? false : n > 0 && (width - 32) / n < LANE_MIN_TILE;

interface Hover {
  readonly cell: LaneCell;
  readonly code: string;
  readonly x: number;
  readonly y: number;
  readonly above: boolean;
}

export class NoemaLangLanes extends NoemaScreen {
  static override properties = { port: { attribute: false }, hover: { state: true } };
  declare port: CoursePort | null;
  declare hover: Hover | null;
  readonly #resize = (): void => {
    this.requestUpdate();
  };

  constructor() {
    super();
    this.port = null;
    this.hover = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.defaultView?.addEventListener('resize', this.#resize);
  }

  override disconnectedCallback(): void {
    this.ownerDocument.defaultView?.removeEventListener('resize', this.#resize);
    super.disconnectedCallback();
  }

  #show(e: Event, code: string, cell: LaneCell): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(),
      vw = this.ownerDocument.documentElement.clientWidth;
    const above = r.top > 90;
    this.hover = { cell, code, x: Math.min(Math.max(128, r.left + r.width / 2), vw - 128), y: above ? r.top - 8 : r.bottom + 8, above };
  }

  #hide = (): void => {
    this.hover = null;
  };

  /** A step's card in a dialog; its other languages replace it in place. */
  open(code: string, node: string): void {
    const P = this.port;
    if (!P) return;
    this.hover = null;
    const dlg = this.ownerDocument.createElement('noema-dialog');
    if (!(dlg instanceof NoemaDialog)) return;
    dlg.classList.add('lx-linfodlg');
    dlg.placement = 'sheet';
    const fill = (c: string): void => {
      const i = P.laneInfo(c, node);
      dlg.heading = i.title;
      const box = this.ownerDocument.createElement('div');
      box.className = 'lx-linfo';
      dlg.replaceChildren(box);
      render(this.#info(i, c, dlg, fill), box);
      box.querySelector<HTMLElement>('.btn.primary')?.focus();
    };
    fill(code);
    this.openDialog(dlg, () => dlg.querySelector<HTMLElement>('.btn.primary')?.focus());
  }

  #info(i: LaneInfo, code: string, dlg: NoemaDialog, fill: (c: string) => void): TemplateResult {
    const P = this.port;
    return html`<p class="lx-linfo-st">${i.lang.flag} ${i.lang.label} · ${i.state}</p>
      ${
        i.functions.length
          ? html`<ul class="lx-linfo-fns">
              ${i.functions.map(f => html`<li>${f.title}${f.note ? html`<span class="tiny"> · ${f.note}</span>` : nothing}</li>`)}
            </ul>`
          : nothing
      }
      ${i.words ? html`<p class="tiny">${this.t('lang.lanes.words', { n: i.words, lang: i.lang.name })}</p>` : nothing}
      ${
        i.others.length
          ? html`<p class="tiny lx-linfo-oth">
              ${this.t('lang.lanes.alsoIn')}
              ${i.others.map(
                (o, k) =>
                  html`${k ? ' · ' : ''}<button
                      class="btn ghost small"
                      type="button"
                      data-lang=${o.code}
                      @click=${() => {
                        fill(o.code);
                      }}
                    >
                      ${o.label} · ${o.state}
                    </button>`,
              )}
            </p>`
          : nothing
      }
      <div class="row">
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            dlg.close('open');
            P?.openStep(code, i.node);
          }}
        >
          ${this.t('lang.home.open')}
        </button>
      </div>`;
  }

  #cell(code: string, label: string, c: LaneCell | null, dots: boolean): TemplateResult {
    if (!c) return html`<div class="lx-lcell lx-lgap" role="cell" data-lang=${code}></div>`;
    const name = `${label} · ${c.title} · ${c.stateLabel}`;
    return html`<div class="lx-lcell" role="cell" data-lang=${code}>
      ${
        dots
          ? html`<button
              class=${'lx-ldot s-' + c.state}
              type="button"
              data-node=${c.node}
              data-lang=${code}
              aria-label=${name}
              @click=${() => {
                this.open(code, c.node);
              }}
              @mouseenter=${(e: Event) => {
                this.#show(e, code, c);
              }}
              @mouseleave=${this.#hide}
              @focus=${(e: Event) => {
                this.#show(e, code, c);
              }}
              @blur=${this.#hide}
            >
              ${c.code}
            </button>`
          : html`<button
              class=${'lx-lnode s-' + c.state}
              type="button"
              data-node=${c.node}
              data-lang=${code}
              title=${name}
              @click=${() => {
                this.open(code, c.node);
              }}
            >
              <span class="lx-lstep">${c.step}</span><span class="lx-ltitle">${c.short}</span>${
                c.sign ? html`<span class="lx-lsign" aria-hidden="true">${c.sign}</span>` : nothing
              }
            </button>`
      }
    </div>`;
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const m = P.lanes(),
      n = m.langs.length,
      dots = laneDots(m.view, m.width(), n);
    const looks: [LanesView, string][] = [
      ['', this.t('lang.lanes.auto')],
      ['tiles', this.t('lang.lanes.tiles')],
      ['dots', this.t('lang.lanes.dots')],
    ];
    const hv = this.hover,
      hl = hv ? m.langs.find(l => l.code === hv.code) : null;
    return html`<div class="lx-lanesview">
      <div class="lx-lanestop">
        <h1>${this.t('lang.view.lanes')}</h1>
        <div class="lx-seg lx-lviewpick" role="group" aria-label=${this.t('lang.lanes.lookLabel')}>
          ${looks.map(
            ([k, t]) =>
              html`<button
                type="button"
                class=${m.view === k ? 'on' : ''}
                aria-pressed=${m.view === k ? 'true' : 'false'}
                @click=${() => {
                  P.setLanesView(k);
                  this.requestUpdate();
                }}
              >
                ${t}
              </button>`,
          )}
        </div>
      </div>
      <p class="tiny lx-lanesnote">${this.t('lang.lanes.note')}</p>
      <div
        class=${'lx-lanes2' + (dots ? ' lx-ldots' : '')}
        data-n=${n}
        style=${styleMap({ '--n': String(n) })}
        role="table"
        aria-label=${this.t('lang.lanes.tableLabel')}
      >
        <div class="lx-lhead" role="row">
          ${m.langs.map(
            l =>
              html`<div class="lx-lflag" role="columnheader" data-lang=${l.code} title=${l.label}>
                ${l.flag}<span class="lx-lname">${l.label}</span>
              </div>`,
          )}
        </div>
        ${m.rows.map(
          (row, i) =>
            html`${row.section ? html`<div class="lx-lsec" role="row"><span>${row.section}</span></div>` : nothing}
              <div class=${'lx-lrow' + (row.common ? ' lx-lcommon' : '')} role="row" data-row=${i}>
                ${m.langs.map(l => this.#cell(l.code, l.label, row.cells[l.code] ?? null, dots))}
              </div>`,
        )}
      </div>
      ${
        hv && hl
          ? html`<div
              class="lx-lhover"
              role="tooltip"
              style=${styleMap({
                left: `${hv.x}px`,
                top: `${hv.y}px`,
                transform: `translate(-50%, ${hv.above ? '-100%' : '0'})`,
              })}
            >
              <b>${hv.cell.step ? hv.cell.step + ' ' : ''}${hv.cell.title}</b>
              <div class="tiny">${hl.flag} ${hl.label} · ${hv.cell.stateLabel}</div>
            </div>`
          : nothing
      }
    </div>`;
  }
}
