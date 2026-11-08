/**
 * The picture's stage (docs/VISUAL.md, noema.visual/v1) as the base of every picture element: the picture, an SVG overlay
 * (outlines, covers, the part under the pointer), a layer of markers and controls placed on it in % of the picture, the
 * tools above it (credit, ⤢ full screen) and what goes under it. A picture element keeps its state in fields and draws it
 * again with redraw(); it only shows and collects, the study domain grades.
 *
 * Narrow pictures (and crowded ones) list their controls under the picture with numbered markers on it (`.vx.compact`);
 * the keyboard moves a crosshair over the picture and taps with Enter (TD-3).
 */
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { Media, Region } from '../../../domain/pack.ts';
import type { StudyApp } from '../../app.ts';
import { F, html, nothing, StudyElement, svg, ref, type TemplateResult } from '../../lit/base.ts';
import { hitsAt, n0, rArea, rCenter, vRegions } from './geometry.ts';

/** what a picture is drawn from: an exercise or a figure block */
export interface PictureSource {
  readonly media?: string;
  readonly regions?: readonly Region[];
}

/** a cover over a part */
export interface Cover {
  readonly cls: string;
  off: boolean;
  /** the part asked about now (occlusion) */
  cur?: boolean;
  /** a cover the learner opens by tapping it (and, when focusable, with Enter or Space) */
  open?: (() => void) | undefined;
  focusable?: boolean;
}

/** keyboard answering: Enter taps at the crosshair, Backspace undoes, moving says what is under it */
export interface KeyHooks {
  tap(x: number, y: number): string;
  undo(): string;
  describe?(x: number, y: number): string;
}

type Pos = Readonly<Record<'left' | 'top', string>>;

/** the pictures in full screen (Escape and a new page close them) */
const fullExits = new Set<() => void>();
let exitsWired = false;
function wireExits(): void {
  if (exitsWired) return;
  exitsWired = true;
  const all = (): void => {
    for (const f of [...fullExits]) f();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') all();
  });
  addEventListener('hashchange', all);
}

/** a part's outline on the overlay (pad: picture units around it) */
function shape(r: Region, cls: string, pad: number, o: { rid?: string; tab?: boolean; open?: (() => void) | undefined } = {}): unknown {
  const open = o.open;
  const click = open
    ? (): void => {
        open();
      }
    : nothing;
  const key = open
    ? (e: KeyboardEvent): void => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        open();
      }
    : nothing;
  const rid = o.rid ?? nothing,
    tab = o.tab ? '0' : nothing;
  if (r.shape === 'circle')
    return svg`<circle cx=${n0(r.cx)} cy=${n0(r.cy)} r=${n0(r.r) + pad} class=${cls} data-rid=${rid} tabindex=${tab} @click=${click} @keydown=${key}></circle>`;
  if (r.shape === 'poly')
    return svg`<polygon points=${(r.points ?? []).map(p => p.join(',')).join(' ')} class=${cls} data-rid=${rid} tabindex=${tab} @click=${click} @keydown=${key}></polygon>`;
  return svg`<rect x=${n0(r.x) - pad} y=${n0(r.y) - pad} width=${n0(r.w) + 2 * pad} height=${n0(r.h) + 2 * pad} rx=${r.rx ?? 8} class=${cls} data-rid=${rid} tabindex=${tab} @click=${click} @keydown=${key}></rect>`;
}

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export abstract class PictureElement extends StudyElement {
  protected readonly app: StudyApp;
  /** the picture (undefined: the pack lacks it, and the element says so) */
  readonly m: Media | undefined;
  readonly #mediaId: string;
  readonly W: number;
  readonly H: number;
  readonly regs: readonly Region[];
  readonly RG: ReadonlyMap<string, Region>;
  protected readonly covers = new Map<string, Cover>();
  protected readonly outlines: { readonly id: string; readonly cls: string }[] = [];
  protected readonly tags: { readonly id: string; readonly text: string; readonly cls: string }[] = [];
  /** a crosshair cursor (the picture is tapped) */
  protected aim = false;
  /** keyboard answering on the stage (null: the stage is not focusable) */
  protected keys: KeyHooks | null = null;
  /** the parts lit as picked (sequence) */
  protected picked: ReadonlySet<string> = new Set();
  protected wrapEl: HTMLDivElement | null = null;
  protected stageEl: HTMLDivElement | null = null;
  #hover: readonly Region[] | null = null;
  #hl: string | null = null;
  #cross = { x: 0, y: 0, on: false };
  #live = '';
  #full = false;
  #narrow = false;
  #crowded = false;
  #ro: ResizeObserver | null = null;
  #holder: Comment | null = null;

  constructor(app: StudyApp, media: Readonly<Record<string, Media>>, src: PictureSource, regions?: readonly Region[]) {
    super();
    this.app = app;
    this.#mediaId = src.media ?? '';
    this.m = src.media ? media[src.media] : undefined;
    this.W = this.m?.w ?? 1;
    this.H = this.m?.h ?? 1;
    this.regs = this.m ? (regions ?? vRegions(src, this.m)) : [];
    this.RG = new Map(this.regs.map(r => [r.id, r]));
    this.#cross.x = this.W / 2;
    this.#cross.y = this.H / 2;
    if (this.m) wireExits();
  }

  /* ---------- what a picture element changes ---------- */
  /** covers a part (once; later calls only cover or uncover it) */
  protected cover(id: string, on = true, cls = ''): Cover | undefined {
    if (!this.RG.has(id)) return undefined;
    let c = this.covers.get(id);
    if (!c) {
      c = { cls, off: !on };
      this.covers.set(id, c);
    } else c.off = !on;
    return c;
  }
  protected uncoverAll(): void {
    for (const c of this.covers.values()) c.off = true;
  }
  protected covered(r: Region | undefined): boolean {
    const c = r && this.covers.get(r.id);
    return !!c && !c.off;
  }
  protected outline(id: string, cls: string): void {
    if (this.RG.has(id)) this.outlines.push({ id, cls });
  }
  protected tag(id: string, text: string, cls = ''): void {
    if (this.RG.has(id)) this.tags.push({ id, text, cls });
  }
  /** lights the part under the pointer, among these */
  protected hover(among: readonly Region[]): void {
    this.#hover = [...among].sort((a, b) => rArea(b) - rArea(a));
  }
  protected highlight(rid: string | null | undefined): void {
    if ((rid ?? null) === this.#hl) return;
    this.#hl = rid ?? null;
    this.redraw();
  }
  /** the parts holding the point, smallest first */
  protected hits(x: number, y: number, among: readonly Region[] = this.regs): Region[] {
    return hitsAt(among, x, y);
  }
  protected pos(x: number, y: number): Pos {
    return { left: `${String((x / this.W) * 100)}%`, top: `${String((y / this.H) * 100)}%` };
  }
  protected at(r: Region): Pos {
    const [x, y] = rCenter(r);
    return this.pos(x, y);
  }
  protected toImg(ev: MouseEvent): [number, number] {
    const b = this.stageEl?.getBoundingClientRect();
    if (!b?.width || !b.height) return [0, 0];
    return [((ev.clientX - b.left) / b.width) * this.W, ((ev.clientY - b.top) / b.height) * this.H];
  }
  /** tells a screen reader (the stage's live region) */
  protected say(t: string): void {
    this.#live = '';
    this.redraw();
    setTimeout(() => {
      this.#live = t;
      this.redraw();
    }, 20);
  }
  /** the controls are listed under the picture */
  compact(): boolean {
    return this.#narrow || this.#crowded;
  }

  /* ---------- what a picture element draws ---------- */
  /** the start of the tools' row (default: the credit) */
  protected toolsLead(): unknown {
    return this.credit();
  }
  /** markers, pins and controls on the picture */
  protected layer(): unknown {
    return nothing;
  }
  /** what goes under the picture */
  protected below(): unknown {
    return nothing;
  }
  /** what goes after it inside the frame (a figure's label) */
  protected extra(): unknown {
    return nothing;
  }
  /** a tap (a click) on the picture, in picture units */
  protected tap?(x: number, y: number): void;
  /** the pointer moved over the picture (picture units) */
  protected moved?(x: number, y: number): void;
  protected left(): void {
    /* nothing follows the pointer */
  }
  /** the controls on the picture overlap or stick out (they are listed under it then) */
  protected crowdedNow(): boolean {
    return false;
  }
  /** after a new layout (a resize, full screen) */
  protected laidOut(): void {
    /* nothing to place */
  }

  /** the attribution line: author · licence · link to the original (required by CC BY / Apache-2.0) */
  protected credit(): unknown {
    const m = this.m;
    if (!m?.credit) return nothing;
    const txt = m.credit + (m.license && m.license !== 'own' ? ` · ${m.license}` : '');
    return /^https?:\/\//.test(m.url ?? '')
      ? html`<a class="tiny vx-credit" href=${m.url ?? ''} target="_blank" rel="noopener" title=${this.app.t('engine.vx.creditTip')}
          >${txt} ↗</a
        >`
      : html`<span class="tiny vx-credit">${txt}</span>`;
  }

  override render(): unknown {
    return this.stage();
  }

  protected stage(): TemplateResult {
    const m = this.m;
    if (!m) return html`<div class="fb bad">🖼️ ${this.app.t('engine.vx.missing', { media: this.#mediaId })}</div>`;
    const { W, H } = this;
    const k = this.keys;
    // tall pictures fit on the screen; ⤢ for more
    const stageStyle = {
      aspectRatio: `${String(W)} / ${String(H)}`,
      maxWidth: `min(${m.mime === 'image/svg+xml' ? '100%' : `${String(W)}px`}, calc(76vh * ${(W / H).toFixed(4)}))`,
      '--ar': String(W / H),
    };
    const rg = (id: string): Region => this.RG.get(id) as Region;
    const outs = this.outlines.map(o => shape(rg(o.id), `vx-out ${o.cls}`, 3));
    const covers = [...this.covers].map(([id, c]) =>
      shape(rg(id), ['vx-mask', c.cls, c.off ? 'off' : '', c.cur ? 'cur' : ''].filter(Boolean).join(' '), 2, {
        rid: id,
        tab: !!c.focusable,
        open: c.open,
      }),
    );
    const hov = (this.#hover ?? []).map(r =>
      shape(r, ['vx-hov', r.id === this.#hl ? 'hl' : '', this.picked.has(r.id) ? 'on' : ''].filter(Boolean).join(' '), 0, { rid: r.id }),
    );
    const cross = this.#cross;
    return html`<div class=${classMap({ vx: true, full: this.#full, compact: this.compact() })} ${ref(this.#wrapRef)}>
      <div class="vx-tools">
        ${this.toolsLead()}<span class="grow"></span
        ><button
          class="iconbtn vx-zoom"
          type="button"
          title=${this.app.t('engine.vx.zoomTip')}
          aria-label=${this.app.t('engine.vx.zoomAria')}
          @click=${this.#zoom}
        >
          ${this.#full ? '✕' : '⤢'}
        </button>
      </div>
      <div
        class=${classMap({ 'vx-stage': true, 'vx-aim': this.aim })}
        style=${styleMap(stageStyle)}
        tabindex=${k ? '0' : nothing}
        role=${k ? 'application' : nothing}
        aria-label=${k ? this.app.t('engine.vx.stageAria') : nothing}
        @click=${this.#click}
        @mousemove=${this.#move}
        @mouseleave=${this.#leave}
        @keydown=${this.#key}
        @blur=${this.#hide}
        @mousedown=${this.#hide}
        ${ref(this.#stageRef)}
      >
        <img class="vx-img" src=${m.data ?? m.url ?? ''} referrerpolicy="no-referrer" alt=${m.alt ?? ''} draggable="false" /><svg
          class="vx-svg"
          viewBox=${`0 0 ${String(W)} ${String(H)}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g>${outs}</g>
          <g>${covers}</g>
          <g>${hov}</g>
        </svg>
        <div class="vx-layer">
          ${k ? html`<span class=${classMap({ 'vx-cross': true, on: cross.on })} aria-hidden="true" style=${styleMap(this.pos(cross.x, cross.y))}></span>` : nothing}${this.layer()}${this.tags.map(t => html`<span class=${`vx-tag ${t.cls}`} style=${styleMap(this.at(rg(t.id)))}>${t.text}</span>`)}
        </div>
      </div>
      <div class="vx-below">${this.below()}</div>
      ${this.extra()}${k ? html`<span class="vx-sr" aria-live="polite">${this.#live}</span>` : nothing}
    </div>`;
  }

  /* ---------- layout, full screen, pointer and keys ---------- */
  // (kept while the element is off the page: the frame may sit in <body> in full screen)
  #wrapRef = (e?: Element): void => {
    if (e instanceof HTMLDivElement) this.wrapEl = e;
  };
  #stageRef = (e?: Element): void => {
    if (e instanceof HTMLDivElement) this.stageEl = e;
  };
  #observe(): void {
    if (this.#ro || !this.stageEl || !this.isConnected) return;
    this.#ro = new ResizeObserver(() => {
      this.#layout();
    });
    this.#ro.observe(this.stageEl);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.#observe();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#ro?.disconnect();
    this.#ro = null;
    this.toggleFull(false); // the page went on: the picture leaves full screen with it
  }
  protected override updated(): void {
    this.#observe();
  }
  #layout(): void {
    const s = this.stageEl;
    if (!s) return;
    this.#narrow = !this.#full && s.clientWidth > 0 && s.clientWidth < 540;
    this.#crowded = false;
    this.redraw();
    if (!this.#narrow && this.crowdedNow()) {
      this.#crowded = true;
      this.redraw();
    }
    this.laidOut();
  }
  #exit = (): void => {
    this.toggleFull(false);
  };
  #zoom = (): void => {
    this.toggleFull();
  };
  /** Full screen: the picture moves to <body> (an animated ancestor would trap position:fixed) and comes back to its
   *  placeholder afterwards; its chapter's colours (data-ci) travel with it. */
  toggleFull(on = !this.#full): void {
    const w = this.wrapEl;
    if (!w || on === this.#full) return;
    if (on) {
      const ci = w.parentElement?.closest<HTMLElement>('[data-ci]')?.dataset['ci'];
      if (ci) w.dataset['ci'] = ci;
      this.#holder = document.createComment('vx');
      w.replaceWith(this.#holder);
      document.body.append(w);
      fullExits.add(this.#exit);
    } else if (this.#holder) {
      this.#holder.replaceWith(w);
      this.#holder = null;
      fullExits.delete(this.#exit);
    }
    this.#full = on;
    document.body.classList.toggle('vx-noscroll', on);
    this.redraw();
    requestAnimationFrame(() => {
      this.#layout();
    });
  }
  #click = (ev: MouseEvent): void => {
    this.tap?.(...this.toImg(ev));
  };
  #move = (ev: MouseEvent): void => {
    const [x, y] = this.toImg(ev);
    if (this.#hover) this.highlight(this.hits(x, y, this.#hover)[0]?.id);
    this.moved?.(x, y);
  };
  #leave = (): void => {
    if (this.#hover) this.highlight(null);
    this.left();
  };
  #hide = (): void => {
    if (!this.#cross.on) return;
    this.#cross.on = false;
    this.redraw();
  };
  /** Keyboard answering (TD-3): arrows move a crosshair (Shift: fine steps), Enter or Space taps, Backspace undoes. The
   *  card's own keys are kept away while the picture has the focus. */
  #key = (e: KeyboardEvent): void => {
    const k = this.keys;
    if (!k) return;
    const c = this.#cross;
    const show = (): void => {
      c.on = true;
      this.redraw();
      if (k.describe) this.say(k.describe(c.x, c.y));
    };
    const mv = MOVES[e.key];
    if (mv) {
      e.preventDefault();
      e.stopPropagation();
      const f = e.shiftKey ? 0.01 : 0.04;
      if (c.on) {
        c.x = Math.min(this.W, Math.max(0, c.x + mv[0] * this.W * f));
        c.y = Math.min(this.H, Math.max(0, c.y + mv[1] * this.H * f));
      }
      show();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!c.on) {
        show();
        return;
      }
      const t = k.tap(c.x, c.y);
      if (t) this.say(t);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      const t = k.undo();
      if (t) this.say(t);
    }
  };
}

/** any two controls overlap, or one sticks out of the picture (measurable only once on the screen) */
function overlap(els: readonly Element[], stage: HTMLElement): boolean {
  const sb = stage.getBoundingClientRect();
  if (!sb.width) return false;
  const R = els.map(e => e.getBoundingClientRect());
  if (R.some(r => r.left < sb.left - 4 || r.right > sb.right + 4 || r.top < sb.top - 4 || r.bottom > sb.bottom + 4)) return true;
  return R.some((a, i) =>
    R.slice(i + 1).some(b => a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2),
  );
}

/** A picture with one control per target part: on the picture when there is room, else in a numbered list under it. */
export abstract class SlotPicture extends PictureElement {
  protected abstract readonly targets: readonly Region[];
  /** the control of part k */
  protected abstract control(r: Region, k: number): unknown;

  protected override layer(): unknown {
    const listed = this.compact();
    return this.targets.map(
      (r, k) =>
        html`<div class="vx-pin" style=${styleMap(this.at(r))}>${listed ? nothing : this.control(r, k)}</div>
          <span class="vx-num vx-marker" style=${styleMap(this.at(r))}>${this.app.nf(k + 1)}</span>`,
    );
  }
  protected list(): TemplateResult {
    const listed = this.compact();
    return html`<div class="vx-list">
      ${this.targets.map(
        (r, k) => html`<div class="vx-row"><span class="vx-num">${this.app.nf(k + 1)}</span>${listed ? this.control(r, k) : nothing}</div>`,
      )}
    </div>`;
  }
  /** the controls as they are drawn now */
  protected controls<E extends Element>(sel: string): E[] {
    return this.wrapEl ? [...this.wrapEl.querySelectorAll<E>(sel)] : [];
  }
  protected override crowdedNow(): boolean {
    return !!this.stageEl && overlap(this.controls('.vx-pin > *'), this.stageEl);
  }
}

/** a line of results under the picture after the check (label, select, drag) */
export interface ResultRow {
  readonly k: number;
  readonly r: Region;
  readonly ok: boolean;
  readonly typo?: boolean;
  readonly given: string | undefined;
}
export function results(app: StudyApp, rows: readonly ResultRow[]): TemplateResult {
  const why = ({ ok, typo, given, r }: ResultRow): unknown =>
    !ok
      ? html`<span class="muted"> — ${given ? app.t('engine.vx.resYou', { given }) : app.t('engine.vx.resEmpty')}</span>`
      : typo
        ? html`<span class="muted"> — ${app.t('engine.vx.resTypo', { given: given ?? '', label: r.label ?? '' })}</span>`
        : nothing;
  return html`<div class="vx-results">
    ${rows.map(
      row =>
        html`<div class=${`vx-res ${row.ok ? 'ok' : 'bad'}`}>
          <span class="vx-num">${app.nf(row.k + 1)}</span><b>${row.ok ? '✓' : '✗'}</b>
          <span>${F(row.r.label)}</span>${why(row)}${row.r.note ? html`<div class="tiny">${F(row.r.note)}</div>` : nothing}
        </div>`,
    )}
  </div>`;
}

export const hint = (text: string): TemplateResult => html`<div class="tiny vx-hint">${text}</div>`;
