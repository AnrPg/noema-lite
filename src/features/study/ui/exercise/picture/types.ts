/**
 * The seven picture exercise types (docs/VISUAL.md) as light-DOM elements on the stage: 📍 hotspot, 🧭 sequence,
 * 🧩 reveal, 🏷️ drag, ✏️ label, 🔽 select and 🙈 occlusion. Each keeps the widget contract of the card (widget.ts): it
 * collects the answer in the exercise's own indices and marks right and wrong; the verdict is the study domain's.
 */
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { Region } from '../../../domain/pack.ts';
import { replay, shuffle } from '../../dom.ts';
import { F, html, live, nothing, tag } from '../../lit/base.ts';
import { mcq } from '../basic.ts';
import { verdictOf, type Renderer, type Widget, type WidgetCtx } from '../widget.ts';
import { ids, vTargets } from './geometry.ts';
import { hint, PictureElement, results, SlotPicture } from './stage.ts';

/** a picture type's element: its answer area once it is drawn, and what it does first (an occlusion's first part) */
interface TypeElement extends PictureElement {
  widget(): Widget;
  start?(): void;
}
/** a picture type: its element, or the "picture missing" line when the pack lacks the picture */
const visual =
  (Ctor: new (c: WidgetCtx) => TypeElement): Renderer =>
  c => {
    const el = new Ctor(c).redraw();
    if (!el.m) return { el, check: () => null };
    const w = el.widget();
    el.start?.();
    return w;
  };

/* ---------- 📍 hotspot: tap the place(s) ---------- */
const H3 = ['left', 'centre', 'right'] as const,
  V3 = ['top', 'middle', 'bottom'] as const; // the message's select values
const third = (v: number, of: number): number => Math.min(2, Math.floor((3 * v) / of));

export class ImgHotspot extends PictureElement {
  readonly #c: WidgetCtx;
  readonly #ans: readonly Region[];
  readonly #any: boolean;
  readonly #multi: boolean;
  readonly #pins: { readonly x: number; readonly y: number; cls: string }[] = [];
  #notes: { readonly r: Region; readonly why: string }[] = [];
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    const { ex, app } = c;
    this.#ans = ids(ex.answer)
      .map(id => this.RG.get(id))
      .filter((r): r is Region => !!r);
    this.#any = !!ex.any; // any: one tap inside ANY of the answer regions is enough
    this.#multi = !this.#any && (this.#ans.length > 1 || !!ex.multi);
    if (ex.maskLabels) for (const r of this.regs) this.cover(r.id, true, 'plain');
    this.aim = true;
    this.keys = {
      tap: (x, y) => this.#tapAt(x, y),
      undo: () => {
        if (this.#c.api.locked() || !this.#pins.length) return '';
        this.#pins.pop();
        this.redraw();
        return app.t('engine.vx.lastPinRemoved');
      },
      describe: (x, y) =>
        app.t('engine.vx.where', {
          h: H3[third(x, this.W)],
          v: V3[third(y, this.H)],
          x: Math.round((100 * x) / this.W),
          y: Math.round((100 * y) / this.H),
        }),
    };
  }
  // A pin never catches the tap itself (on a small picture it would cover the part next to it): a tap within about 10
  // screen pixels of a pin removes that pin, anywhere else adds one.
  #tapAt(x: number, y: number): string {
    const { app, api } = this.#c;
    if (api.locked()) return '';
    const sb = this.stageEl?.getBoundingClientRect(),
      sx = (sb?.width ?? this.W) / this.W,
      sy = (sb?.height ?? this.H) / this.H;
    const near = this.#pins.findIndex(q => Math.hypot((q.x - x) * sx, (q.y - y) * sy) <= 10);
    app.host.feedback.beep('tap');
    if (near >= 0) {
      this.#pins.splice(near, 1);
      this.redraw();
      return app.t('engine.vx.pinRemoved');
    }
    if (!this.#multi) this.#pins.length = 0;
    this.#pins.push({ x, y, cls: '' });
    this.redraw();
    return this.#multi ? app.t('engine.vx.pinNofM', { n: this.#pins.length, of: this.#ans.length }) : app.t('engine.vx.pinPlaced');
  }
  protected override tap(x: number, y: number): void {
    this.#tapAt(x, y);
  }
  protected override layer(): unknown {
    return repeat(
      this.#pins,
      p => p,
      (p, i) =>
        html`<span class=${p.cls ? `vx-pick ${p.cls}` : 'vx-pick'} style=${styleMap(this.pos(p.x, p.y))}
          >${this.#multi ? this.app.nf(i + 1) : ''}</span
        >`,
    );
  }
  protected override below(): unknown {
    const { app } = this;
    const text = this.#multi
      ? app.t('engine.vx.hotspotMulti', { n: this.#ans.length })
      : this.#any
        ? app.t('engine.vx.hotspotAny')
        : app.t('engine.vx.hotspotOne');
    return html`${hint(text)}${
      this.#notes.length
        ? html`<div class="fb bad">${this.#notes.map(n => html`<div>❌ <b>${n.r.label ?? n.r.id}</b>: ${F(n.why)}</div>`)}</div>`
        : nothing
    }`;
  }
  #answer = (): { pins: [number, number][] } => ({ pins: this.#pins.map(p => [p.x, p.y]) });
  widget(): Widget {
    const { ex } = this.#c;
    return {
      el: this,
      answer: this.#answer,
      check: () => verdictOf(ex, this.#answer(), this.regs).ok,
      reveal: () => {
        this.uncoverAll();
        for (const r of this.#ans) {
          this.outline(r.id, 'right');
          if (r.label) this.tag(r.id, r.label, 'right');
        }
        const right = verdictOf(ex, this.#answer(), this.regs).items ?? [];
        const why = ex.why && !Array.isArray(ex.why) ? (ex.why as Readonly<Record<string, string>>) : {};
        this.#pins.forEach((p, i) => {
          const ok = !!right[i];
          p.cls = ok ? 'right' : 'wrong';
          if (ok) return;
          const r = this.hits(p.x, p.y)[0];
          if (!r) return;
          this.outline(r.id, 'wrong');
          const w = why[r.id];
          if (w) this.#notes.push({ r, why: w });
        });
        this.redraw();
      },
    };
  }
}

/* ---------- 🧭 sequence: tap the parts in order ---------- */
export class ImgSequence extends PictureElement {
  readonly #c: WidgetCtx;
  readonly #among: readonly Region[];
  readonly #order: readonly string[];
  readonly #picks: Region[] = [];
  #marks: readonly boolean[] | null = null;
  #ok: boolean | null = null;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    const { app } = c;
    this.#among = vTargets(c.ex, this.regs);
    this.#order = ids(c.ex.answer);
    this.aim = true;
    this.hover(this.#among);
    this.keys = {
      tap: (x, y) => this.#tapAt(x, y),
      undo: () => {
        if (this.#c.api.locked() || !this.#picks.length) return '';
        this.#picks.pop();
        this.#drawn();
        return app.t('engine.vx.lastStepRemoved');
      },
      describe: (x, y) => {
        const r = this.hits(x, y, this.#among)[0];
        this.highlight(r?.id);
        if (!r) return app.t('engine.vx.noPart');
        const i = this.#picks.indexOf(r);
        return i >= 0 ? app.t('engine.vx.partStep', { label: r.label ?? r.id, n: i + 1 }) : (r.label ?? r.id);
      },
    };
  }
  #drawn(): void {
    this.picked = new Set(this.#picks.map(r => r.id));
    this.redraw();
  }
  #tapAt(x: number, y: number): string {
    const { app, api } = this.#c;
    if (api.locked()) return '';
    const r = this.hits(x, y, this.#among)[0];
    if (!r) {
      if (this.stageEl) replay(this.stageEl, 'vx-miss');
      return app.t('engine.vx.noPart');
    }
    const i = this.#picks.indexOf(r);
    if (i >= 0) this.#picks.splice(i);
    else if (this.#picks.length < this.#order.length) {
      this.#picks.push(r);
      app.host.feedback.beep('tap');
    }
    this.#drawn();
    return i >= 0
      ? app.t('engine.vx.seqRemoved', { n: i + 1 })
      : app.t('engine.vx.seqStep', { n: this.#picks.length, label: r.label ?? r.id });
  }
  protected override tap(x: number, y: number): void {
    this.#tapAt(x, y);
  }
  protected override layer(): unknown {
    const m = this.#marks;
    return repeat(
      this.#picks,
      r => r.id,
      (r, i) =>
        html`<span
          class=${classMap({ 'vx-num': true, 'vx-step': true, right: !!m?.[i], wrong: !!m && !m[i] })}
          style=${styleMap(this.at(r))}
          >${this.app.nf(i + 1)}</span
        >`,
    );
  }
  protected override below(): unknown {
    const { app } = this;
    const path =
      this.#ok === false
        ? html`<div class="fb info">
            <b>🧭 ${app.t('engine.vx.correctPath')} </b>${this.#order.map(
              (id, i) =>
                html`${i ? ` ${app.arrowOn} ` : ''}<span class="vx-chipref">${app.nf(i + 1)}. ${this.RG.get(id)?.label ?? id}</span>`,
            )}
          </div>`
        : nothing;
    return html`<div class="tiny vx-hint">
        ${app.t('engine.vx.seqHint')} · <b>${app.t('engine.vx.seqCounter', { n: this.#picks.length, of: this.#order.length })}</b>
      </div>
      ${path}`;
  }
  #answer = (): { sequence: string[] } => ({ sequence: this.#picks.map(r => r.id) });
  widget(): Widget {
    const { ex } = this.#c;
    return {
      el: this,
      answer: this.#answer,
      check: () => verdictOf(ex, this.#answer()).ok,
      reveal: () => {
        const g = verdictOf(ex, this.#answer());
        this.#marks = g.items ?? [];
        this.#ok = g.ok;
        this.redraw();
      },
    };
  }
}

/* ---------- 🧩 reveal: uncover tiles, answer early ---------- */
function gridTiles({ ex, media }: WidgetCtx): readonly Region[] | undefined {
  const m = ex.media ? media[ex.media] : undefined;
  if (!ex.grid || !m) return undefined;
  const [c, rr] = ex.grid;
  const tiles: Region[] = [];
  for (let j = 0; j < rr; j++)
    for (let i = 0; i < c; i++)
      tiles.push({ id: `t${String(j * c + i)}`, shape: 'rect', x: (i * m.w) / c, y: (j * m.h) / rr, w: m.w / c, h: m.h / rr, rx: 0 });
  return tiles;
}
export class ImgReveal extends PictureElement {
  readonly #c: WidgetCtx;
  readonly #hidden: number;
  #opened = 0;
  readonly #mc: Widget;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex, gridTiles(c));
    this.#c = c;
    const start = new Set(ids(c.ex.start));
    this.#hidden = this.regs.length - start.size;
    this.regs.forEach((r, i) => {
      if (start.has(r.id)) return;
      const cv = this.cover(r.id, true, `tile c${String(i % 6)}`);
      if (!cv) return;
      cv.focusable = true;
      cv.open = () => {
        if (cv.off) return;
        cv.off = true;
        this.#opened++;
        this.app.host.feedback.beep('tap');
        this.redraw();
      };
    });
    this.#mc = mcq({ ...c, ex: { ...c.ex, type: 'mcq' } });
  }
  protected override below(): unknown {
    const { app } = this;
    return html`<div class="tiny vx-hint">
        <b>🔍 ${app.t('engine.vx.tilesOpened', { n: this.#opened, of: this.#hidden })}</b> · ${app.t('engine.vx.revealHint')}
      </div>
      ${this.#mc.el}`;
  }
  widget(): Widget {
    const { ex } = this.#c;
    const mc = this.#mc;
    const many = !!ex.multi || (Array.isArray(ex.answer) && ex.answer.length > 1);
    return {
      el: this,
      auto: !many,
      ...(mc.keys ? { keys: mc.keys } : {}),
      ...(mc.answer ? { answer: mc.answer } : {}),
      ...(mc.given ? { given: mc.given } : {}),
      check: () => (mc.answer ? verdictOf(ex, mc.answer()).ok : null),
      reveal: () => {
        mc.reveal?.();
        this.uncoverAll();
        this.redraw();
      },
      bonus: () => Math.round((6 * (this.#hidden - this.#opened)) / Math.max(1, this.#hidden)),
    };
  }
}

/* ---------- 🏷️ drag: drop the labels on the covered parts ---------- */
// A label's button and a place's carry their text alone (.textContent): what the learner placed is read back exactly.
interface Chip {
  readonly text: string;
  readonly i: number;
}
export class ImgDrag extends SlotPicture {
  readonly #c: WidgetCtx;
  protected readonly targets: readonly Region[];
  readonly #chips: readonly Chip[];
  readonly #zoneW: number;
  readonly #place = new Map<number, Chip>(); // slot k → chip
  #sel: Chip | null = null;
  /** the zone under a dragged label, and what is dragged */
  #over: number | null = null;
  #dragging: Chip | number | null = null;
  #justDragged = false;
  #marks: readonly boolean[] | null = null;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    this.targets = vTargets(c.ex, this.regs);
    if (c.ex.mask !== false) for (const r of this.targets) this.cover(r.id, true);
    this.#chips = shuffle([...this.targets.map(r => r.label ?? ''), ...(c.ex.distractors ?? [])]).map((text, i) => ({ text, i }));
    this.#zoneW = Math.min(170, 26 + Math.max(...this.#chips.map(ch => ch.text.length)) * 7.4); // fits any label: the layout check holds
  }
  get #locked(): boolean {
    return this.#c.api.locked();
  }
  #put(k: number, chip: Chip): void {
    for (const [kk, ch] of [...this.#place]) if (ch === chip) this.#place.delete(kk);
    this.#place.set(k, chip);
    this.#sel = null;
    this.app.host.feedback.beep('tap');
    this.redraw();
  }
  #tapZone(k: number): void {
    if (this.#locked) return;
    if (this.#sel) {
      this.#put(k, this.#sel);
      return;
    }
    const ch = this.#place.get(k);
    if (ch) {
      this.#sel = ch;
      this.#place.delete(k);
      this.redraw();
    }
  }
  /** a press that may become a drag (a label from the bank, or a placed one: on to another place or off the picture) */
  #press(e: PointerEvent, from: Chip | number, drop: (k: number) => void, miss?: () => void): void {
    const src = e.currentTarget;
    if (e.button !== 0 || !(src instanceof HTMLElement)) return;
    const sx = e.clientX,
      sy = e.clientY;
    let ghost: HTMLElement | null = null;
    const zoneAt = (ev: PointerEvent): number | null => {
      const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.vx-drop');
      return z && this.wrapEl?.contains(z) ? Number(z.dataset['k']) : null;
    };
    const move = (ev: PointerEvent): void => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      let changed = false;
      if (!ghost) {
        ghost = src.cloneNode(true) as HTMLElement;
        ghost.classList.add('vx-ghost');
        document.body.append(ghost);
        this.#dragging = from;
        changed = true;
      }
      ghost.style.left = `${String(ev.clientX)}px`;
      ghost.style.top = `${String(ev.clientY)}px`;
      const over = zoneAt(ev);
      if (over !== this.#over) {
        this.#over = over;
        changed = true;
      }
      if (changed) this.redraw();
    };
    const up = (ev: PointerEvent | FocusEvent): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('blur', up);
      if (!ghost) return;
      ghost.remove();
      this.#dragging = null;
      this.#over = null;
      this.#justDragged = true;
      setTimeout(() => {
        this.#justDragged = false;
      }, 50);
      const k = ev instanceof PointerEvent && ev.type === 'pointerup' ? zoneAt(ev) : null;
      if (k !== null && k !== from) drop(k);
      else if (k === null) miss?.();
      this.redraw();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('blur', up);
  }
  protected control(_r: Region, k: number): unknown {
    const ch = this.#place.get(k),
      m = this.#marks;
    return html`<button
      class=${classMap({
        'vx-drop': true,
        filled: !!ch,
        hot: !m && ((!!this.#sel && !ch) || this.#over === k),
        dragging: this.#dragging === k,
        right: !!m?.[k],
        wrong: !!m && !m[k],
      })}
      type="button"
      data-k=${k}
      aria-label=${this.app.t('engine.vx.dropZone', { n: k + 1 })}
      title=${ch ? ch.text : ''}
      .textContent=${ch ? ch.text : '?'}
      style=${styleMap({ minWidth: `${String(this.#zoneW)}px` })}
      @click=${(e: Event) => {
        e.stopPropagation();
        if (!this.#justDragged) this.#tapZone(k);
      }}
      @pointerdown=${(e: PointerEvent) => {
        if (this.#locked || !this.#place.has(k)) return;
        // a placed label can be dragged on to another place, or off the picture back to the bank
        this.#press(
          e,
          k,
          to => {
            const placed = this.#place.get(k);
            if (!this.#locked && placed) this.#put(to, placed);
          },
          () => {
            if (this.#locked) return;
            this.#place.delete(k);
          },
        );
      }}
    ></button>`;
  }
  #chip(ch: Chip): unknown {
    return html`<button
      class=${classMap({ chipx: true, 'vx-chip': true, sel: this.#sel === ch, dragging: this.#dragging === ch })}
      type="button"
      .textContent=${ch.text}
      @click=${(e: Event) => {
        e.stopPropagation();
        if (this.#locked || this.#justDragged) return;
        this.#sel = this.#sel === ch ? null : ch;
        this.redraw();
      }}
      @pointerdown=${(e: PointerEvent) => {
        this.#press(e, ch, k => {
          if (!this.#locked) this.#put(k, ch);
        });
      }}
    ></button>`;
  }
  protected override below(): unknown {
    const used = new Set(this.#place.values());
    const free = this.#chips.filter(ch => !used.has(ch));
    const bank = this.#marks
      ? nothing
      : html`<div class="pool vx-bank">
          ${
            free.length
              ? repeat(
                  free,
                  ch => ch.i,
                  ch => this.#chip(ch),
                )
              : html`<span class="tiny">${this.app.t('engine.vx.allPlaced')}</span>`
          }
        </div>`;
    const m = this.#marks;
    return html`${hint(this.app.t('engine.vx.dragHint'))}${bank}${this.list()}${
      m
        ? results(
            this.app,
            this.targets.map((r, k) => ({ k, r, ok: !!m[k], given: this.#place.get(k)?.text })),
          )
        : nothing
    }`;
  }
  #answer = (): { slots: (string | null)[] } => ({ slots: this.targets.map((_r, k) => this.#place.get(k)?.text ?? null) });
  widget(): Widget {
    const { ex } = this.#c;
    return {
      el: this,
      answer: this.#answer,
      check: () => verdictOf(ex, this.#answer(), this.regs).ok,
      given: () => this.#answer().slots.join(', '),
      reveal: () => {
        const right = verdictOf(ex, this.#answer(), this.regs).items ?? [];
        this.#marks = this.targets.map((_r, k) => !!right[k]);
        this.uncoverAll();
        this.targets.forEach((r, k) => {
          this.outline(r.id, right[k] ? 'right' : 'wrong');
        });
        this.redraw();
      },
    };
  }
}

/* ---------- ✏️ label: type the names ---------- */
export class ImgLabel extends SlotPicture {
  readonly #c: WidgetCtx;
  protected readonly targets: readonly Region[];
  readonly #values: string[];
  #grade: { readonly items: readonly boolean[]; readonly typos: readonly boolean[] } | null = null;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    this.targets = vTargets(c.ex, this.regs);
    this.#values = this.targets.map(() => '');
    if (c.ex.mask !== false) for (const r of this.targets) this.cover(r.id, true);
  }
  protected control(_r: Region, k: number): unknown {
    const g = this.#grade;
    return html`<input
      class=${classMap({ 'vx-input': true, right: !!g?.items[k], wrong: !!g && !g.items[k] })}
      placeholder=${`${this.app.nf(k + 1)} ?`}
      aria-label=${this.app.t('engine.vx.partName', { n: k + 1 })}
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"
      ?readonly=${!!g}
      .value=${live(this.#values[k] ?? '')}
      @input=${(e: Event) => {
        if (e.target instanceof HTMLInputElement) this.#values[k] = e.target.value;
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const nx = this.controls<HTMLInputElement>('.vx-input')[k + 1];
        if (nx) nx.focus();
        else this.#c.api.check();
      }}
    />`;
  }
  protected override below(): unknown {
    const g = this.#grade;
    return html`${hint(this.app.t('engine.vx.labelHint'))}${this.list()}${
      g
        ? results(
            this.app,
            this.targets.map((r, k) => ({ k, r, ok: !!g.items[k], typo: !!g.typos[k], given: (this.#values[k] ?? '').trim() })),
          )
        : nothing
    }`;
  }
  #answer = (): { slots: string[] } => ({ slots: [...this.#values] });
  widget(): Widget {
    const { ex } = this.#c;
    return {
      el: this,
      focus: () => {
        if (!this.compact()) this.controls<HTMLInputElement>('.vx-input')[0]?.focus({ preventScroll: true });
      },
      answer: this.#answer,
      check: () => verdictOf(ex, this.#answer(), this.regs).ok,
      given: () => this.#answer().slots.join(', '),
      reveal: () => {
        const g = verdictOf(ex, this.#answer(), this.regs);
        this.#grade = { items: this.targets.map((_r, k) => !!g.items?.[k]), typos: this.targets.map((_r, k) => !!g.typos?.[k]) };
        this.uncoverAll();
        this.targets.forEach((r, k) => {
          this.outline(r.id, g.items?.[k] ? 'right' : 'wrong');
        });
        this.redraw();
      },
    };
  }
}

/* ---------- 🔽 select: a list per part ---------- */
export class ImgSelect extends SlotPicture {
  readonly #c: WidgetCtx;
  protected readonly targets: readonly Region[];
  readonly #shared: readonly string[];
  readonly #values: string[];
  #marks: readonly boolean[] | null = null;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    this.targets = vTargets(c.ex, this.regs);
    this.#values = this.targets.map(() => '');
    if (c.ex.mask !== false) for (const r of this.targets) this.cover(r.id, true);
    this.#shared = [...new Set([...this.targets.map(r => r.label ?? ''), ...(c.ex.distractors ?? [])])].sort((a, b) =>
      c.app.i18n.format.compare(a, b),
    );
  }
  protected control(r: Region, k: number): unknown {
    const m = this.#marks,
      v = this.#values[k] ?? '';
    return html`<select
      class=${classMap({ 'vx-select': true, right: !!m?.[k], wrong: !!m && !m[k] })}
      aria-label=${this.app.t('engine.vx.part', { n: k + 1 })}
      ?disabled=${!!m}
      @change=${(e: Event) => {
        if (e.target instanceof HTMLSelectElement) this.#values[k] = e.target.value;
      }}
    >
      <option value="" .selected=${live(v === '')}>${this.app.t('engine.vx.choose', { n: k + 1 })}</option>
      ${(r.options ?? this.#shared).map(o => html`<option value=${o} .selected=${live(v === o)}>${o}</option>`)}
    </select>`;
  }
  protected override below(): unknown {
    const m = this.#marks;
    return html`${hint(this.app.t('engine.vx.selectHint'))}${this.list()}${
      m
        ? results(
            this.app,
            this.targets.map((r, k) => ({ k, r, ok: !!m[k], given: this.#values[k] })),
          )
        : nothing
    }`;
  }
  #answer = (): { slots: (string | null)[] } => ({ slots: this.#values.map(v => v || null) });
  widget(): Widget {
    const { ex } = this.#c;
    return {
      el: this,
      answer: this.#answer,
      check: () => verdictOf(ex, this.#answer(), this.regs).ok,
      given: () => this.#answer().slots.join(', '),
      reveal: () => {
        const right = verdictOf(ex, this.#answer(), this.regs).items ?? [];
        this.#marks = this.targets.map((_r, k) => !!right[k]);
        this.uncoverAll();
        this.targets.forEach((r, k) => {
          this.outline(r.id, right[k] ? 'right' : 'wrong');
        });
        this.redraw();
      },
    };
  }
}

/* ---------- 🙈 occlusion: one covered part at a time: recall, reveal, rate ---------- */
export class ImgOcclusion extends PictureElement {
  readonly #c: WidgetCtx;
  readonly #targets: readonly Region[];
  #k = 0;
  #knew = 0;
  readonly #marks: boolean[] = [];
  #shown = false;
  #final: boolean | null = null;
  constructor(c: WidgetCtx) {
    super(c.app, c.media, c.ex);
    this.#c = c;
    const all = vTargets(c.ex, this.regs);
    this.#targets = c.ex.order === 'random' ? shuffle(all) : all;
    for (const r of this.#targets) this.cover(r.id, true, 'occ');
  }
  start(): void {
    this.#focusOn();
  }
  /** the next part: its cover lit, its question asked (none left: the score) */
  #focusOn(): void {
    this.#targets.forEach((r, i) => {
      const cv = this.covers.get(r.id);
      if (!cv) return;
      cv.cur = i === this.#k;
      cv.open =
        i === this.#k
          ? () => {
              if (!this.#c.api.locked()) this.#show();
            }
          : undefined;
    });
    this.#shown = false;
    if (!this.#targets[this.#k]) {
      this.#finish();
      return;
    }
    this.redraw();
    this.#focusBtn('.vx-occ .btn.primary');
  }
  #focusBtn(sel: string): void {
    setTimeout(() => {
      this.wrapEl?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
    }, 30);
  }
  #show = (): void => {
    const r = this.#targets[this.#k],
      cv = r && this.covers.get(r.id);
    if (!r || !cv || cv.off) return;
    cv.off = true;
    this.#shown = true;
    this.redraw();
    this.#focusBtn('.vx-occ .vx-yes');
  };
  #rate(ok: boolean): void {
    const r = this.#targets[this.#k];
    if (!r) return;
    this.#marks[this.#k] = ok;
    if (ok) this.#knew++;
    this.outline(r.id, ok ? 'right' : 'wrong');
    this.app.host.feedback.beep(ok ? 'ok' : 'bad');
    this.#k++;
    this.#focusOn();
  }
  #finish(): void {
    const ok = verdictOf(this.#c.ex, { knew: this.#targets.map((_, i) => !!this.#marks[i]) }).ok === true;
    this.#final = ok;
    this.redraw();
    this.#c.api.done(ok);
  }
  protected override layer(): unknown {
    return this.#targets.map((r, i) => {
      const seen = i < this.#k || (i === this.#k && this.#shown);
      const mark = this.#marks[i];
      return html`<span
        class=${classMap({
          'vx-num': true,
          'vx-marker': true,
          always: true,
          cur: i === this.#k,
          seen,
          right: mark === true,
          wrong: mark === false,
        })}
        style=${styleMap(this.at(r))}
        >${this.app.nf(i + 1)}</span
      >`;
    });
  }
  protected override below(): unknown {
    const { app } = this;
    const n = this.#targets.length;
    if (this.#final !== null)
      return html`<div class="vx-occ">
        <div class=${`fb ${this.#final ? 'ok' : 'bad'}`}>
          <b>${app.t('engine.vx.recalled', { n: this.#knew, of: n })} </b>${
            this.#final ? app.t('engine.vx.strong') : app.t('engine.vx.comeBack')
          }
        </div>
      </div>`;
    const r = this.#targets[this.#k];
    if (!r) return nothing;
    const num = html`<span class="vx-num">${app.nf(this.#k + 1)}</span>`;
    if (!this.#shown)
      return html`<div class="vx-occ">
        <div class="vx-occq">${num}<span>${F(r.q ?? app.t('engine.vx.occQ'))}</span></div>
        <div class="actions">
          <button class="btn primary" type="button" @click=${this.#show}>👁 ${app.t('engine.vx.reveal')}</button
          ><span class="tiny">${app.t('engine.vx.nOfM', { n: this.#k + 1, of: n })}</span>
        </div>
      </div>`;
    return html`<div class="vx-occ">
      <div class="vx-occq">${num}<b>${F(r.label)}</b>${r.note ? html`<div class="tiny">${F(r.note)}</div>` : nothing}</div>
      <div class="actions">
        <button
          class="btn small vx-yes"
          type="button"
          @click=${() => {
            this.#rate(true);
          }}
        >
          ✓ ${app.t('engine.vx.knew')}</button
        ><button
          class="btn small vx-no"
          type="button"
          @click=${() => {
            this.#rate(false);
          }}
        >
          ✗ ${app.t('engine.vx.didnt')}
        </button>
      </div>
    </div>`;
  }
  widget(): Widget {
    return { el: this, selfDone: true, given: () => this.app.t('engine.vx.recalled', { n: this.#knew, of: this.#targets.length }) };
  }
}

tag('study-img-hotspot', ImgHotspot);
tag('study-img-sequence', ImgSequence);
tag('study-img-reveal', ImgReveal);
tag('study-img-drag', ImgDrag);
tag('study-img-label', ImgLabel);
tag('study-img-select', ImgSelect);
tag('study-img-occlusion', ImgOcclusion);

export const VISUAL_TYPES: Readonly<Record<string, Renderer>> = {
  img_hotspot: visual(ImgHotspot),
  img_sequence: visual(ImgSequence),
  img_reveal: visual(ImgReveal),
  img_drag: visual(ImgDrag),
  img_label: visual(ImgLabel),
  img_select: visual(ImgSelect),
  img_occlusion: visual(ImgOcclusion),
};
