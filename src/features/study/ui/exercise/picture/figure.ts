/**
 * The figure block of the theory: an explorable picture. Hovering (or the keyboard's crosshair) names the part under it;
 * a tap pins the name; the parts' names start covered (test yourself first) and 👀 shows them all, a tap peeks under one.
 */
import { classMap } from 'lit/directives/class-map.js';
import type { Block, Media, Region } from '../../../domain/pack.ts';
import type { StudyApp } from '../../app.ts';
import { F, html, nothing, ref, StudyElement, tag } from '../../lit/base.ts';
import { rCenter } from './geometry.ts';
import { pictured } from './stage.ts';

export class StudyFigure extends pictured(StudyElement) {
  protected readonly app: StudyApp;
  readonly #caption: string | undefined;
  readonly #explore: boolean;
  readonly #named: readonly Region[];
  #hidden = true;
  #pinned: Region | null = null;
  /** the part the label names, and whether it shows */
  #tip: Region | null = null;
  #tipOn = false;
  #tipEl: HTMLDivElement | null = null;

  constructor(app: StudyApp, media: Readonly<Record<string, Media>>, b: Block) {
    super();
    this.app = app;
    this.picture(app, media, b);
    this.#caption = b.caption ?? this.m?.caption;
    this.#explore = !!this.regs.length && b.explore !== false;
    this.#named = this.#explore ? this.regs.filter(r => r.label && !r.id.endsWith('-area')) : [];
    if (!this.#explore) return;
    this.hover(this.regs);
    for (const r of this.#named) this.cover(r.id, true);
    // keyboard exploring: arrows move, the part under the crosshair is shown and said; Enter peeks under a cover
    this.keyHooks = {
      tap: (x, y) => {
        const r = this.hits(x, y)[0];
        if (r && this.covered(r)) {
          this.#peek(r);
          return app.t('engine.vx.uncovered', { label: r.label ?? r.id });
        }
        return r ? (r.label ?? r.id) + (r.note ? `. ${r.note}` : '') : app.t('engine.vx.nothing');
      },
      undo: () => '',
      describe: (x, y) => {
        const r = this.hits(x, y)[0];
        if (r && this.covered(r)) {
          this.#hideTip();
          return app.t('engine.vx.hiddenLabel');
        }
        if (r) this.#showTip(r);
        else this.#hideTip();
        return r ? (r.label ?? r.id) : app.t('engine.vx.nothing');
      },
    };
  }

  #peek(r: Region): void {
    const c = this.covers.get(r.id);
    if (c) c.off = true;
    this.redraw();
  }
  #showTip(r: Region): void {
    if (this.#tip === r && this.#tipOn) return;
    this.#tip = r;
    this.#tipOn = true;
    this.redraw();
    this.#placeTip();
  }
  #hideTip(): void {
    if (!this.#tipOn) return;
    this.#tipOn = false;
    this.redraw();
  }
  // The label sits on the frame, not inside the picture (which clips at its edges): it may run past the picture, never
  // past the screen; it is moved sideways (and above or below) until it fits.
  #placeTip(): void {
    const tip = this.#tipEl,
      st = this.stageEl,
      wrap = this.wrapEl;
    if (!this.#tipOn || !this.#tip || !tip || !st || !wrap) return;
    const [x, y] = rCenter(this.#tip),
      sb = st.getBoundingClientRect(),
      wb = wrap.getBoundingClientRect();
    const px = sb.left - wb.left + (x / this.W) * sb.width,
      py = sb.top - wb.top + (y / this.H) * sb.height;
    const w = tip.offsetWidth,
      ht = tip.offsetHeight,
      gap = 14,
      edge = 8,
      vw = document.documentElement.clientWidth || innerWidth;
    const left = Math.max(edge, Math.min(wb.left + px - w / 2, vw - edge - w)) - wb.left;
    const roomAbove = wb.top + py - gap - ht >= edge,
      roomBelow = wb.top + py + gap + ht <= innerHeight - edge;
    const below = (y < this.H * 0.3 || !roomAbove) && (roomBelow || !roomAbove);
    tip.classList.toggle('below', below);
    Object.assign(tip.style, { left: `${String(left)}px`, top: `${String(below ? py + gap : py - gap - ht)}px` });
  }
  protected override laidOut(): void {
    this.#placeTip();
  }
  protected override moved(x: number, y: number): void {
    if (!this.#explore || this.#pinned) return;
    const r = this.hits(x, y)[0];
    if (r && !this.covered(r)) this.#showTip(r);
    else this.#hideTip(); // a hidden label stays hidden until peeked at
  }
  protected override left(): void {
    if (this.#explore && !this.#pinned) this.#hideTip();
  }
  protected override tap(x: number, y: number): void {
    if (!this.#explore) return;
    const r = this.hits(x, y)[0];
    if (r && this.covered(r)) {
      this.#peek(r);
      return;
    }
    this.#pinned = r && this.#pinned !== r ? r : null;
    if (this.#pinned) this.#showTip(this.#pinned);
    else this.#hideTip();
  }
  #toggleLabels = (): void => {
    this.#hidden = !this.#hidden;
    for (const r of this.#named) this.cover(r.id, this.#hidden);
    this.redraw();
  };

  protected override toolsLead(): unknown {
    if (!this.#named.length) return this.credit();
    // the switch and its line sit on top of the picture (the credit goes under it)
    const { app } = this;
    return html`<div class="vx-labelbar">
      <button class="btn small vx-lblbtn" type="button" @click=${this.#toggleLabels}>
        ${this.#hidden ? `👀 ${app.t('engine.vx.showLabels')}` : `🙈 ${app.t('engine.vx.hideLabels')}`}</button
      ><span class="vx-lbltext">${this.#hidden ? app.t('engine.vx.labelsHidden') : app.t('engine.vx.hoverPart')}</span>
    </div>`;
  }
  protected override below(): unknown {
    if (!this.#explore) return nothing;
    if (!this.#named.length)
      return html`<div class="row vx-figbar"><span class="tiny grow">👆 ${this.app.t('engine.vx.hoverPart')}</span></div>`;
    const credit = this.credit();
    return credit === nothing ? nothing : html`<div class="vx-figbar">${credit}</div>`;
  }
  protected override extra(): unknown {
    if (!this.#explore) return nothing;
    const r = this.#tip;
    return html`<div class=${classMap({ 'vx-tip': true, on: this.#tipOn })} ${ref(this.#tipRef)}>
      ${r ? html`<b>${F(r.label ?? r.id)}</b>${r.note ? html`<div>${F(r.note)}</div>` : nothing}` : nothing}
    </div>`;
  }
  #tipRef = (e?: Element): void => {
    if (e instanceof HTMLDivElement) this.#tipEl = e;
  };

  override render(): unknown {
    if (!this.m) return this.stage();
    return html`<figure class="vx-fig">
      ${this.stage()}${this.#caption ? html`<figcaption class="caption">${F(this.#caption)}</figcaption>` : nothing}
    </figure>`;
  }
}
tag('study-figure', StudyFigure);

/** a figure block of the pack, drawn */
export function figureBlock(app: StudyApp, media: Readonly<Record<string, Media>>, b: Block): HTMLElement {
  return new StudyFigure(app, media, b).redraw();
}
