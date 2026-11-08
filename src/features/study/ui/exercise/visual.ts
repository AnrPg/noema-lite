/**
 * Picture exercises and figures (docs/VISUAL.md, noema.visual/v1): the stage (the picture, an SVG overlay and controls
 * placed on it), and the seven picture types. Same contract as basic.ts; the grading is the study domain's.
 */
import { hits as hitsRegion, targetsOf } from '../../domain/grading/regions.ts';
import type { Block, Exercise, Media, Region } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { h, shuffle, sv } from '../dom.ts';
import { esc, fmt } from '../text.ts';
import { mcq } from './basic.ts';
import { verdictOf, type Renderer, type Widget } from './widget.ts';

export const isVisual = (ex: { readonly type?: string }): boolean => /^img_/.test(ex.type ?? '');

/* ---------- geometry (picture units) ---------- */
const n0 = (x: number | undefined): number => x ?? 0;
function rBox(r: Region): { x: number; y: number; w: number; h: number } {
  if (r.shape === 'circle') return { x: n0(r.cx) - n0(r.r), y: n0(r.cy) - n0(r.r), w: 2 * n0(r.r), h: 2 * n0(r.r) };
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    const xs = P.map(p => p[0]),
      ys = P.map(p => p[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: n0(r.x), y: n0(r.y), w: n0(r.w), h: n0(r.h) };
}
export function rCenter(r: Region): readonly [number, number] {
  if (r.anchor) return r.anchor;
  if (r.shape === 'circle') return [n0(r.cx), n0(r.cy)];
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    return [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
  }
  return [n0(r.x) + n0(r.w) / 2, n0(r.y) + n0(r.h) / 2];
}
const rArea = (r: Region): number => {
  const b = rBox(r);
  return b.w * b.h;
};
function rShape(r: Region, cls: string, pad = 0): SVGElement {
  if (r.shape === 'circle') return sv('circle', { cx: n0(r.cx), cy: n0(r.cy), r: n0(r.r) + pad, class: cls });
  if (r.shape === 'poly') return sv('polygon', { points: (r.points ?? []).map(p => p.join(',')).join(' '), class: cls });
  return sv('rect', { x: n0(r.x) - pad, y: n0(r.y) - pad, width: n0(r.w) + 2 * pad, height: n0(r.h) + 2 * pad, rx: r.rx ?? 8, class: cls });
}
/** the regions of an exercise or a figure: its own, else the picture's (docs/VISUAL.md §3) */
export const vRegions = (ex: { readonly regions?: readonly Region[] }, m: Media | undefined): readonly Region[] =>
  ex.regions ?? m?.regions ?? [];
/** the parts an exercise asks about, in its order (the study domain's rule) */
export function vTargets(ex: Exercise, regs: readonly Region[]): Region[] {
  return targetsOf(ex['targets'], regs).flatMap(g => regs.filter(r => r.id === g.id).slice(0, 1));
}
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/* ---------- the stage: the picture, an SVG overlay and controls placed on it ---------- */
export interface Stage {
  readonly m: Media;
  readonly W: number;
  readonly H: number;
  readonly regs: readonly Region[];
  readonly RG: ReadonlyMap<string, Region>;
  readonly el: HTMLElement;
  readonly wrap: HTMLElement;
  readonly tools: HTMLElement;
  readonly stage: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly layer: HTMLElement;
  readonly below: HTMLElement;
  readonly masks: Map<string, SVGElement>;
  pos(x: number, y: number): Partial<CSSStyleDeclaration>;
  toImg(ev: MouseEvent): [number, number];
  mask(id: string, on?: boolean, cls?: string): SVGElement | undefined;
  outline(id: string, cls: string): void;
  tag(id: string, text: string, cls?: string): void;
  hits(x: number, y: number, among?: readonly Region[]): Region[];
  hover(among: readonly Region[]): (rid: string | null | undefined) => void;
  keyboard(o: { tap(x: number, y: number): string; undo(): string; describe?: (x: number, y: number) => string }): void;
  compact(): boolean;
  onLayout(f: () => void): void;
  setCrowded(): void;
}

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

/** the attribution line: author · licence · link to the original (required by CC BY / Apache-2.0) */
function vCredit(app: StudyApp, m: Media): HTMLElement | null {
  if (!m.credit) return null;
  const txt = m.credit + (m.license && m.license !== 'own' ? ` · ${m.license}` : '');
  return /^https?:\/\//.test(m.url ?? '')
    ? h('a', { class: 'tiny vx-credit', href: m.url, target: '_blank', rel: 'noopener', title: app.t('engine.vx.creditTip') }, `${txt} ↗`)
    : h('span', { class: 'tiny vx-credit' }, txt);
}

export function vStage(
  app: StudyApp,
  media: Readonly<Record<string, Media>>,
  ex: { readonly media?: string; readonly regions?: readonly Region[] },
  o: { readonly regions?: readonly Region[] } = {},
): Stage | HTMLElement {
  const m = ex.media ? media[ex.media] : undefined;
  if (!m) return h('div', { class: 'fb bad' }, `🖼️ ${app.t('engine.vx.missing', { media: ex.media ?? '' })}`);
  wireExits();
  const W = m.w,
    H = m.h;
  const regs = o.regions ?? vRegions(ex, m);
  const RG = new Map(regs.map(r => [r.id, r]));
  const img = h('img', { src: m.data ?? m.url, referrerpolicy: 'no-referrer', alt: m.alt ?? '', draggable: 'false', class: 'vx-img' });
  const svg = sv('svg', { viewBox: `0 0 ${String(W)} ${String(H)}`, class: 'vx-svg', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const gOut = sv('g'),
    gMask = sv('g'),
    gTop = sv('g');
  svg.append(gOut, gMask, gTop);
  const layer = h('div', { class: 'vx-layer' });
  // tall pictures fit on the screen; ⤢ for more
  const stage = h(
    'div',
    {
      class: 'vx-stage',
      style: {
        aspectRatio: `${String(W)} / ${String(H)}`,
        maxWidth: `min(${m.mime === 'image/svg+xml' ? '100%' : `${String(W)}px`}, calc(76vh * ${(W / H).toFixed(4)}))`,
      },
    },
    img,
    svg,
    layer,
  );
  stage.style.setProperty('--ar', String(W / H));
  const below = h('div', { class: 'vx-below' });
  const zoomBtn = h(
    'button',
    {
      class: 'iconbtn vx-zoom',
      type: 'button',
      title: app.t('engine.vx.zoomTip'),
      'aria-label': app.t('engine.vx.zoomAria'),
      onclick: () => {
        toggleFull();
      },
    },
    '⤢',
  );
  const tools = h('div', { class: 'vx-tools' }, vCredit(app, m), h('span', { class: 'grow' }), zoomBtn);
  const wrap = h('div', { class: 'vx' }, tools, stage, below);
  // Full screen: the picture moves to <body> (an animated ancestor would trap position:fixed) and comes back to its
  // placeholder afterwards; its chapter's colours (data-ci) travel with it.
  let holder: Comment | null = null;
  const exit = (): void => {
    toggleFull(false);
  };
  function toggleFull(on = !wrap.classList.contains('full')): void {
    if (on === wrap.classList.contains('full')) return;
    if (on) {
      const ci = wrap.parentElement?.closest<HTMLElement>('[data-ci]')?.dataset['ci'];
      if (ci) wrap.dataset['ci'] = ci;
      holder = document.createComment('vx');
      wrap.replaceWith(holder);
      document.body.append(wrap);
      fullExits.add(exit);
    } else if (holder) {
      holder.replaceWith(wrap);
      holder = null;
      fullExits.delete(exit);
    }
    wrap.classList.toggle('full', on);
    document.body.classList.toggle('vx-noscroll', on);
    zoomBtn.textContent = on ? '✕' : '⤢';
    requestAnimationFrame(layoutAll);
  }
  const pos = (x: number, y: number): Partial<CSSStyleDeclaration> => ({
    left: `${String((x / W) * 100)}%`,
    top: `${String((y / H) * 100)}%`,
  });
  const toImg = (ev: MouseEvent): [number, number] => {
    const b = stage.getBoundingClientRect();
    return [((ev.clientX - b.left) / b.width) * W, ((ev.clientY - b.top) / b.height) * H];
  };
  const masks = new Map<string, SVGElement>();
  const mask = (id: string, on = true, cls = ''): SVGElement | undefined => {
    const r = RG.get(id);
    if (!r) return undefined;
    let e = masks.get(id);
    if (!e) {
      e = rShape(r, `vx-mask ${cls}`, 2);
      e.dataset['rid'] = id;
      gMask.append(e);
      masks.set(id, e);
    }
    e.classList.toggle('off', !on);
    return e;
  };
  const outline = (id: string, cls: string): void => {
    const r = RG.get(id);
    if (r) gOut.append(rShape(r, `vx-out ${cls}`, 3));
  };
  const tag = (id: string, text: string, cls = ''): void => {
    const r = RG.get(id);
    if (!r) return;
    const [x, y] = rCenter(r);
    layer.append(h('span', { class: `vx-tag ${cls}`, style: pos(x, y) }, text));
  };
  /** the regions holding the point, smallest first (nested parts win) */
  const hits = (x: number, y: number, among: readonly Region[] = regs): Region[] =>
    among.filter(r => hitsRegion(r, x, y)).sort((a, b) => rArea(a) - rArea(b));
  const layouts: (() => void)[] = [];
  let crowded = false; // the controls would overlap on the picture: they are listed under it instead
  const narrow = (): boolean => !wrap.classList.contains('full') && stage.clientWidth > 0 && stage.clientWidth < 540;
  const compact = (): boolean => narrow() || crowded;
  function layoutAll(): void {
    crowded = false;
    wrap.classList.toggle('compact', narrow());
    for (const f of layouts) f();
    wrap.classList.toggle('compact', compact());
  }
  new ResizeObserver(() => {
    layoutAll();
  }).observe(stage);
  /** highlights the part under the pointer (the pointer stays on the stage) */
  function hover(among: readonly Region[]): (rid: string | null | undefined) => void {
    const shapes = [...among]
      .sort((a, b) => rArea(b) - rArea(a))
      .map(r => {
        const e = rShape(r, 'vx-hov');
        e.dataset['rid'] = r.id;
        gTop.append(e);
        return e;
      });
    const set = (rid: string | null | undefined): void => {
      for (const e of shapes) e.classList.toggle('hl', e.dataset['rid'] === rid);
    };
    stage.addEventListener('mousemove', ev => {
      const [x, y] = toImg(ev);
      set(hits(x, y, among)[0]?.id);
    });
    stage.addEventListener('mouseleave', () => {
      set(null);
    });
    return set;
  }
  /** Keyboard answering (TD-3): arrows move a crosshair (Shift: fine steps), Enter or Space taps, Backspace undoes. The
   *  card's own keys are kept away while the picture has the focus. */
  function keyboard(k: { tap(x: number, y: number): string; undo(): string; describe?: (x: number, y: number) => string }): void {
    stage.tabIndex = 0;
    stage.setAttribute('role', 'application');
    stage.setAttribute('aria-label', app.t('engine.vx.stageAria'));
    const cross = h('span', { class: 'vx-cross', 'aria-hidden': 'true' });
    layer.append(cross);
    const live = h('span', { class: 'vx-sr', 'aria-live': 'polite' });
    wrap.append(live);
    let cx = W / 2,
      cy = H / 2,
      shown = false;
    const say = (t: string): void => {
      live.textContent = '';
      setTimeout(() => {
        live.textContent = t;
      }, 20);
    };
    const show = (): void => {
      Object.assign(cross.style, pos(cx, cy));
      cross.classList.add('on');
      shown = true;
      if (k.describe) say(k.describe(cx, cy));
    };
    const MOVES: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    stage.addEventListener('keydown', e => {
      const f = e.shiftKey ? 0.01 : 0.04;
      const mv = MOVES[e.key];
      if (mv) {
        e.preventDefault();
        e.stopPropagation();
        if (shown) {
          cx = Math.min(W, Math.max(0, cx + mv[0] * W * f));
          cy = Math.min(H, Math.max(0, cy + mv[1] * H * f));
        }
        show();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (!shown) {
          show();
          return;
        }
        const t = k.tap(cx, cy);
        if (t) say(t);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        const t = k.undo();
        if (t) say(t);
      }
    });
    const hide = (): void => {
      cross.classList.remove('on');
      shown = false;
    };
    stage.addEventListener('blur', hide);
    stage.addEventListener('mousedown', hide);
  }
  return {
    m,
    W,
    H,
    regs,
    RG,
    el: wrap,
    wrap,
    tools,
    stage,
    svg,
    layer,
    below,
    masks,
    pos,
    toImg,
    mask,
    outline,
    tag,
    hits,
    hover,
    keyboard,
    compact,
    onLayout: f => {
      layouts.push(f);
      f();
    },
    setCrowded: () => {
      crowded = true;
    },
  };
}

interface Slot<C extends HTMLElement> {
  readonly r: Region;
  readonly k: number;
  readonly ctl: C;
  readonly pin: HTMLElement;
  readonly row: HTMLElement;
}
/** one control per target part: on the picture when there is room, else in a numbered list under it */
function vSlots<C extends HTMLElement>(app: StudyApp, st: Stage, targets: readonly Region[], make: (r: Region, k: number) => C): Slot<C>[] {
  const list = h('div', { class: 'vx-list' });
  const slots = targets.map((r, k) => {
    const [x, y] = rCenter(r);
    const s: Slot<C> = {
      r,
      k,
      ctl: make(r, k),
      pin: h('div', { class: 'vx-pin', style: st.pos(x, y) }),
      row: h('div', { class: 'vx-row' }, h('span', { class: 'vx-num' }, app.nf(k + 1))),
    };
    st.layer.append(s.pin, h('span', { class: 'vx-num vx-marker', style: st.pos(x, y) }, app.nf(k + 1)));
    list.append(s.row);
    return s;
  });
  st.below.append(list);
  const put = (c: boolean): void => {
    for (const s of slots) {
      const dst = c ? s.row : s.pin;
      if (s.ctl.parentElement !== dst) dst.append(s.ctl);
    }
  };
  st.onLayout(() => {
    if (st.compact()) {
      put(true);
      return;
    }
    put(false);
    if (
      vOverlap(
        slots.map(s => s.ctl),
        st.stage,
      )
    ) {
      st.setCrowded();
      put(true);
    }
  });
  return slots;
}
/** any two controls overlap, or one sticks out of the picture (measurable only once on the screen) */
function vOverlap(els: readonly Element[], stage: HTMLElement): boolean {
  const sb = stage.getBoundingClientRect();
  if (!sb.width) return false;
  const R = els.map(e => e.getBoundingClientRect());
  if (R.some(r => r.left < sb.left - 4 || r.right > sb.right + 4 || r.top < sb.top - 4 || r.bottom > sb.bottom + 4)) return true;
  return R.some((a, i) =>
    R.slice(i + 1).some(b => a.left < b.right + 2 && b.left < a.right + 2 && a.top < b.bottom + 2 && b.top < a.bottom + 2),
  );
}
/** the results under the picture after the check (label, select, drag) */
function vResults(
  app: StudyApp,
  rows: readonly { k: number; r: Region; ok: boolean; typo?: boolean; given: string | undefined }[],
): HTMLElement {
  return h(
    'div',
    { class: 'vx-results' },
    rows.map(({ k, r, ok, typo, given }) =>
      h(
        'div',
        { class: `vx-res ${ok ? 'ok' : 'bad'}` },
        h('span', { class: 'vx-num' }, app.nf(k + 1)),
        h('b', {}, ok ? '✓' : '✗'),
        ' ',
        h('span', { html: fmt(r.label) }),
        !ok
          ? h('span', { class: 'muted' }, ` — ${given ? app.t('engine.vx.resYou', { given }) : app.t('engine.vx.resEmpty')}`)
          : typo
            ? h('span', { class: 'muted' }, ` — ${app.t('engine.vx.resTypo', { given: given ?? '', label: r.label ?? '' })}`)
            : null,
        r.note ? h('div', { class: 'tiny', html: fmt(r.note) }) : null,
      ),
    ),
  );
}
const vHint = (text: string): HTMLElement => h('div', { class: 'tiny vx-hint' }, text);
const off = (st: Stage): void => {
  for (const e of st.masks.values()) e.classList.add('off');
};

type VisualCtx = Parameters<Renderer>[0];
/** a picture type: its stage, or the "picture missing" line when the pack lacks the picture */
const visual =
  (draw: (c: VisualCtx, st: Stage) => Widget, regions?: (c: VisualCtx) => readonly Region[] | undefined): Renderer =>
  c => {
    const r = regions?.(c);
    const st = vStage(c.app, c.media, c.ex, r ? { regions: r } : {});
    return st instanceof HTMLElement ? { el: st, check: () => null } : draw(c, st);
  };

/* ---------- 📍 hotspot: tap the place(s) ---------- */
export const img_hotspot = visual(({ app, ex, api }, st) => {
  const ans = ids(ex.answer)
    .map(id => st.RG.get(id))
    .filter((r): r is Region => !!r);
  const any = !!ex.any; // any: one tap inside ANY of the answer regions is enough
  const multi = !any && (ans.length > 1 || !!ex.multi);
  if (ex.maskLabels) for (const r of st.regs) st.mask(r.id, true, 'plain');
  const pins: { x: number; y: number; el: HTMLElement }[] = [];
  st.stage.classList.add('vx-aim');
  const drop = (p: (typeof pins)[number]): void => {
    p.el.remove();
    pins.splice(pins.indexOf(p), 1);
    if (multi) pins.forEach((q, i) => (q.el.textContent = app.nf(i + 1)));
  };
  // A pin never catches the tap itself (on a small picture it would cover the part next to it): a tap within about 10
  // screen pixels of a pin removes that pin, anywhere else adds one.
  const tapAt = (x: number, y: number): string => {
    if (api.locked()) return '';
    const sb = st.stage.getBoundingClientRect(),
      sx = sb.width / st.W,
      sy = sb.height / st.H;
    const near = pins.find(q => Math.hypot((q.x - x) * sx, (q.y - y) * sy) <= 10);
    if (near) {
      drop(near);
      app.host.feedback.beep('tap');
      return app.t('engine.vx.pinRemoved');
    }
    if (!multi) for (const p of [...pins]) drop(p);
    const p = { x, y, el: h('span', { class: 'vx-pick', style: st.pos(x, y) }, multi ? app.nf(pins.length + 1) : '') };
    pins.push(p);
    st.layer.append(p.el);
    app.host.feedback.beep('tap');
    return multi ? app.t('engine.vx.pinNofM', { n: pins.length, of: ans.length }) : app.t('engine.vx.pinPlaced');
  };
  st.stage.addEventListener('click', ev => {
    tapAt(...st.toImg(ev));
  });
  const third = (v: number, of: number): number => Math.min(2, Math.floor((3 * v) / of));
  const H3 = ['left', 'centre', 'right'] as const,
    V3 = ['top', 'middle', 'bottom'] as const; // the message's select values
  st.keyboard({
    tap: tapAt,
    undo: () => {
      const last = pins.at(-1);
      if (api.locked() || !last) return '';
      drop(last);
      return app.t('engine.vx.lastPinRemoved');
    },
    describe: (x, y) =>
      app.t('engine.vx.where', {
        h: H3[third(x, st.W)],
        v: V3[third(y, st.H)],
        x: Math.round((100 * x) / st.W),
        y: Math.round((100 * y) / st.H),
      }),
  });
  st.below.prepend(
    vHint(multi ? app.t('engine.vx.hotspotMulti', { n: ans.length }) : any ? app.t('engine.vx.hotspotAny') : app.t('engine.vx.hotspotOne')),
  );
  const answer = (): { pins: [number, number][] } => ({ pins: pins.map(p => [p.x, p.y]) });
  return {
    el: st.el,
    answer,
    check: () => verdictOf(ex, answer(), st.regs).ok,
    reveal() {
      off(st);
      for (const r of ans) {
        st.outline(r.id, 'right');
        if (r.label) st.tag(r.id, r.label, 'right');
      }
      const notes: HTMLElement[] = [],
        right = verdictOf(ex, answer(), st.regs).items ?? [];
      const why = ex.why && !Array.isArray(ex.why) ? (ex.why as Readonly<Record<string, string>>) : {};
      pins.forEach((p, i) => {
        const ok = !!right[i];
        p.el.classList.add(ok ? 'right' : 'wrong');
        if (ok) return;
        const r = st.hits(p.x, p.y)[0];
        if (!r) return;
        st.outline(r.id, 'wrong');
        const w = why[r.id];
        if (w) notes.push(h('div', { html: `❌ <b>${esc(r.label ?? r.id)}</b>: ${fmt(w)}` }));
      });
      if (notes.length) st.below.append(h('div', { class: 'fb bad' }, notes));
    },
  };
});

/* ---------- 🧭 sequence: tap the parts in order ---------- */
export const img_sequence = visual(({ app, ex, api }, st) => {
  const among = vTargets(ex, st.regs);
  const order = ids(ex.answer);
  const picks: Region[] = [];
  st.stage.classList.add('vx-aim');
  const hov = st.hover(among);
  const badges = new Map<string, HTMLElement>();
  const counter = h('b', {});
  const draw = (): void => {
    for (const b of badges.values()) b.remove();
    badges.clear();
    picks.forEach((r, i) => {
      const [x, y] = rCenter(r);
      const b = h('span', { class: 'vx-num vx-step', style: st.pos(x, y) }, app.nf(i + 1));
      badges.set(r.id, b);
      st.layer.append(b);
    });
    for (const e of st.svg.querySelectorAll<SVGElement>('.vx-hov'))
      e.classList.toggle(
        'on',
        picks.some(r => r.id === e.dataset['rid']),
      );
    counter.textContent = app.t('engine.vx.seqCounter', { n: picks.length, of: order.length });
  };
  const tapAt = (x: number, y: number): string => {
    if (api.locked()) return '';
    const r = st.hits(x, y, among)[0];
    if (!r) {
      st.stage.classList.remove('vx-miss');
      st.stage.getBoundingClientRect();
      st.stage.classList.add('vx-miss');
      return app.t('engine.vx.noPart');
    }
    const i = picks.indexOf(r);
    if (i >= 0) picks.splice(i);
    else if (picks.length < order.length) {
      picks.push(r);
      app.host.feedback.beep('tap');
    }
    draw();
    return i >= 0 ? app.t('engine.vx.seqRemoved', { n: i + 1 }) : app.t('engine.vx.seqStep', { n: picks.length, label: r.label ?? r.id });
  };
  st.stage.addEventListener('click', ev => {
    tapAt(...st.toImg(ev));
  });
  st.keyboard({
    tap: tapAt,
    undo: () => {
      if (api.locked() || !picks.length) return '';
      picks.pop();
      draw();
      return app.t('engine.vx.lastStepRemoved');
    },
    describe: (x, y) => {
      const r = st.hits(x, y, among)[0];
      hov(r?.id);
      if (!r) return app.t('engine.vx.noPart');
      return picks.includes(r) ? app.t('engine.vx.partStep', { label: r.label ?? r.id, n: picks.indexOf(r) + 1 }) : (r.label ?? r.id);
    },
  });
  st.below.prepend(h('div', { class: 'tiny vx-hint' }, `${app.t('engine.vx.seqHint')} · `, counter));
  draw();
  const answer = (): { sequence: string[] } => ({ sequence: picks.map(r => r.id) });
  return {
    el: st.el,
    answer,
    check: () => verdictOf(ex, answer()).ok,
    reveal() {
      const g = verdictOf(ex, answer()),
        right = g.items ?? [];
      picks.forEach((r, i) => badges.get(r.id)?.classList.add(right[i] ? 'right' : 'wrong'));
      if (!g.ok)
        st.below.append(
          h(
            'div',
            { class: 'fb info' },
            h('b', {}, `🧭 ${app.t('engine.vx.correctPath')} `),
            order.flatMap((id, i) => [
              i ? ` ${app.arrowOn} ` : '',
              h('span', { class: 'vx-chipref' }, `${app.nf(i + 1)}. ${st.RG.get(id)?.label ?? id}`),
            ]),
          ),
        );
    },
  };
});

/* ---------- 🧩 reveal: uncover tiles, answer early ---------- */
const gridTiles = ({ ex, media }: VisualCtx): readonly Region[] | undefined => {
  const m = ex.media ? media[ex.media] : undefined;
  if (!ex.grid || !m) return undefined;
  const [c, rr] = ex.grid;
  const tiles: Region[] = [];
  for (let j = 0; j < rr; j++)
    for (let i = 0; i < c; i++)
      tiles.push({ id: `t${String(j * c + i)}`, shape: 'rect', x: (i * m.w) / c, y: (j * m.h) / rr, w: m.w / c, h: m.h / rr, rx: 0 });
  return tiles;
};
export const img_reveal = visual((c, st) => {
  const { app, ex } = c;
  const start = new Set(ids(ex.start));
  let opened = 0;
  const counter = h('b', {});
  const hidden = st.regs.length - start.size;
  const count = (): void => {
    counter.textContent = `🔍 ${app.t('engine.vx.tilesOpened', { n: opened, of: hidden })}`;
  };
  st.regs.forEach((r, i) => {
    if (start.has(r.id)) return;
    const e = st.mask(r.id, true, `tile c${String(i % 6)}`);
    if (!e) return;
    e.setAttribute('tabindex', '0');
    const open = (): void => {
      if (e.classList.contains('off')) return;
      e.classList.add('off');
      opened++;
      app.host.feedback.beep('tap');
      count();
    };
    e.addEventListener('click', open);
    e.addEventListener('keydown', ev => {
      if (ev instanceof KeyboardEvent && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        open();
      }
    });
  });
  count();
  const mc = mcq({ ...c, ex: { ...ex, type: 'mcq' } });
  st.below.append(h('div', { class: 'tiny vx-hint' }, counter, ` · ${app.t('engine.vx.revealHint')}`), mc.el);
  const many = !!ex.multi || (Array.isArray(ex.answer) && ex.answer.length > 1);
  return {
    el: st.el,
    auto: !many,
    ...(mc.keys ? { keys: mc.keys } : {}),
    ...(mc.answer ? { answer: mc.answer } : {}),
    ...(mc.given ? { given: mc.given } : {}),
    check: () => (mc.answer ? verdictOf(ex, mc.answer()).ok : null),
    reveal() {
      mc.reveal?.();
      off(st);
    },
    bonus: () => Math.round((6 * (hidden - opened)) / Math.max(1, hidden)),
  };
}, gridTiles);

/* ---------- 🏷️ drag: drop the labels on the covered parts ---------- */
function vDraggable(
  el: HTMLElement,
  onDrop: (z: HTMLElement) => void,
  o: { enabled?: () => boolean; onMiss?: () => void } = {},
): { justDragged(): boolean } {
  let just = false;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !(o.enabled?.() ?? true)) return;
    const sx = e.clientX,
      sy = e.clientY;
    let ghost: HTMLElement | null = null;
    const target = (ev: PointerEvent | FocusEvent): HTMLElement | null =>
      ev instanceof PointerEvent ? (document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.vx-drop') ?? null) : null;
    const cool = (): void => {
      for (const z of document.querySelectorAll('.vx-drop.hot')) z.classList.remove('hot');
    };
    const move = (ev: PointerEvent): void => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!ghost) {
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('vx-ghost');
        document.body.append(ghost);
        el.classList.add('dragging');
      }
      ghost.style.left = `${String(ev.clientX)}px`;
      ghost.style.top = `${String(ev.clientY)}px`;
      cool();
      target(ev)?.classList.add('hot');
    };
    const up = (ev: PointerEvent | FocusEvent): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('blur', up);
      if (!ghost) return;
      ghost.remove();
      el.classList.remove('dragging');
      cool();
      just = true;
      setTimeout(() => {
        just = false;
      }, 50);
      const z = ev.type === 'pointerup' ? target(ev) : null;
      if (z && z !== el) onDrop(z);
      else if (!z) o.onMiss?.();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('blur', up);
  });
  return { justDragged: () => just };
}
export const img_drag = visual(({ app, ex, api }, st) => {
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) for (const r of targets) st.mask(r.id, true);
  const chips = shuffle([...targets.map(r => r.label ?? ''), ...(ex.distractors ?? [])]).map((text, i) => ({ text, i }));
  const zoneW = Math.min(170, 26 + Math.max(...chips.map(c => c.text.length)) * 7.4); // fits any label: the layout check holds
  type Chip = (typeof chips)[number];
  const place = new Map<number, Chip>(); // slot k → chip
  let sel: Chip | null = null;
  const bank = h('div', { class: 'pool vx-bank' });
  const put = (k: number, chip: Chip): void => {
    for (const [kk, c] of [...place]) if (c === chip) place.delete(kk);
    place.set(k, chip);
    sel = null;
    app.host.feedback.beep('tap');
    draw();
  };
  const tapZone = (k: number): void => {
    if (api.locked()) return;
    if (sel) {
      put(k, sel);
      return;
    }
    const c = place.get(k);
    if (c) {
      sel = c;
      place.delete(k);
      draw();
    }
  };
  const zoneOf = (z: HTMLElement): number => Number(z.dataset['k']);
  const slots = vSlots(app, st, targets, (_r, k) => {
    const z = h('button', {
      class: 'vx-drop',
      type: 'button',
      'data-k': k,
      'aria-label': app.t('engine.vx.dropZone', { n: k + 1 }),
      style: { minWidth: `${String(zoneW)}px` },
      onclick: (e: Event) => {
        e.stopPropagation();
        if (!drag.justDragged()) tapZone(k);
      },
    });
    // a placed label can be dragged on to another place, or off the picture back to the bank
    const drag = vDraggable(
      z,
      to => {
        const c = place.get(k);
        if (!api.locked() && c) put(zoneOf(to), c);
      },
      {
        enabled: () => !api.locked() && place.has(k),
        onMiss: () => {
          if (api.locked()) return;
          place.delete(k);
          draw();
        },
      },
    );
    return z;
  });
  const chipEl = (c: Chip): HTMLElement => {
    const b = h(
      'button',
      {
        class: `chipx vx-chip${sel === c ? ' sel' : ''}`,
        type: 'button',
        onclick: (e: Event) => {
          e.stopPropagation();
          if (api.locked() || drag.justDragged()) return;
          sel = sel === c ? null : c;
          draw();
        },
      },
      c.text,
    );
    const drag = vDraggable(b, z => {
      if (!api.locked()) put(zoneOf(z), c);
    });
    return b;
  };
  function draw(): void {
    bank.replaceChildren();
    const used = new Set(place.values());
    for (const c of chips) if (!used.has(c)) bank.append(chipEl(c));
    if (!bank.children.length) bank.append(h('span', { class: 'tiny' }, app.t('engine.vx.allPlaced')));
    for (const s of slots) {
      const c = place.get(s.k);
      s.ctl.textContent = c ? c.text : '?';
      s.ctl.title = c ? c.text : '';
      s.ctl.classList.toggle('filled', !!c);
      s.ctl.classList.toggle('hot', !!sel && !c);
    }
  }
  st.below.prepend(vHint(app.t('engine.vx.dragHint')), bank);
  draw();
  const answer = (): { slots: (string | null)[] } => ({ slots: slots.map(s => place.get(s.k)?.text ?? null) });
  return {
    el: st.el,
    answer,
    check: () => verdictOf(ex, answer(), st.regs).ok,
    given: () => answer().slots.join(', '),
    reveal() {
      const right = verdictOf(ex, answer(), st.regs).items ?? [];
      off(st);
      for (const s of slots) {
        const ok = !!right[s.k];
        s.ctl.classList.add(ok ? 'right' : 'wrong');
        st.outline(s.r.id, ok ? 'right' : 'wrong');
      }
      bank.remove();
      st.below.append(
        vResults(
          app,
          slots.map(s => ({ k: s.k, r: s.r, ok: !!right[s.k], given: place.get(s.k)?.text })),
        ),
      );
    },
  };
});

/* ---------- ✏️ label: type the names ---------- */
export const img_label = visual(({ app, ex, api }, st) => {
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) for (const r of targets) st.mask(r.id, true);
  const slots: Slot<HTMLInputElement>[] = vSlots(app, st, targets, (_r, k) =>
    h('input', {
      class: 'vx-input',
      placeholder: `${app.nf(k + 1)} ?`,
      'aria-label': app.t('engine.vx.partName', { n: k + 1 }),
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      onkeydown: (e: Event) => {
        if (!(e instanceof KeyboardEvent) || e.key !== 'Enter') return;
        e.preventDefault();
        const nx = slots[k + 1];
        if (nx) nx.ctl.focus();
        else api.check();
      },
    }),
  );
  st.below.prepend(vHint(app.t('engine.vx.labelHint')));
  const answer = (): { slots: string[] } => ({ slots: slots.map(s => s.ctl.value) });
  return {
    el: st.el,
    focus: () => {
      if (!st.compact()) slots[0]?.ctl.focus({ preventScroll: true });
    },
    answer,
    check: () => verdictOf(ex, answer(), st.regs).ok,
    given: () => answer().slots.join(', '),
    reveal() {
      const g = verdictOf(ex, answer(), st.regs);
      off(st);
      for (const s of slots) {
        const ok = !!g.items?.[s.k];
        s.ctl.readOnly = true;
        s.ctl.classList.add(ok ? 'right' : 'wrong');
        st.outline(s.r.id, ok ? 'right' : 'wrong');
      }
      st.below.append(
        vResults(
          app,
          slots.map(s => ({ k: s.k, r: s.r, ok: !!g.items?.[s.k], typo: !!g.typos?.[s.k], given: s.ctl.value.trim() })),
        ),
      );
    },
  };
});

/* ---------- 🔽 select: a list per part ---------- */
export const img_select = visual(({ app, ex }, st) => {
  const targets = vTargets(ex, st.regs);
  if (ex.mask !== false) for (const r of targets) st.mask(r.id, true);
  const shared = [...new Set([...targets.map(r => r.label ?? ''), ...(ex.distractors ?? [])])].sort((a, b) =>
    app.i18n.format.compare(a, b),
  );
  const slots = vSlots(app, st, targets, (r, k) =>
    h(
      'select',
      { class: 'vx-select', 'aria-label': app.t('engine.vx.part', { n: k + 1 }) },
      h('option', { value: '' }, app.t('engine.vx.choose', { n: k + 1 })),
      (r.options ?? shared).map(o => h('option', { value: o }, o)),
    ),
  );
  st.below.prepend(vHint(app.t('engine.vx.selectHint')));
  const answer = (): { slots: (string | null)[] } => ({ slots: slots.map(s => s.ctl.value || null) });
  return {
    el: st.el,
    answer,
    check: () => verdictOf(ex, answer(), st.regs).ok,
    given: () => answer().slots.join(', '),
    reveal() {
      const right = verdictOf(ex, answer(), st.regs).items ?? [];
      off(st);
      for (const s of slots) {
        const ok = !!right[s.k];
        s.ctl.disabled = true;
        s.ctl.classList.add(ok ? 'right' : 'wrong');
        st.outline(s.r.id, ok ? 'right' : 'wrong');
      }
      st.below.append(
        vResults(
          app,
          slots.map(s => ({ k: s.k, r: s.r, ok: !!right[s.k], given: s.ctl.value })),
        ),
      );
    },
  };
});

/* ---------- 🙈 occlusion: one covered part at a time: recall, reveal, rate ---------- */
export const img_occlusion = visual(({ app, ex, api }, st) => {
  const targets = ex.order === 'random' ? shuffle(vTargets(ex, st.regs)) : vTargets(ex, st.regs);
  const masks = targets.map(r => st.mask(r.id, true, 'occ') ?? sv('g'));
  const nums = targets.map((r, k) => {
    const [x, y] = rCenter(r);
    const e = h('span', { class: 'vx-num vx-marker always', style: st.pos(x, y) }, app.nf(k + 1));
    st.layer.append(e);
    return e;
  });
  let k = 0,
    knew = 0;
  const marks: boolean[] = [];
  const panel = h('div', { class: 'vx-occ' });
  const focusOn = (): void => {
    targets.forEach((_, i) => {
      masks[i]?.classList.toggle('cur', i === k);
      nums[i]?.classList.toggle('cur', i === k);
    });
    panel.replaceChildren();
    const r = targets[k];
    if (!r) {
      finish();
      return;
    }
    const revealBtn = h('button', { class: 'btn primary', type: 'button', onclick: show }, `👁 ${app.t('engine.vx.reveal')}`);
    panel.append(
      h(
        'div',
        { class: 'vx-occq' },
        h('span', { class: 'vx-num' }, app.nf(k + 1)),
        h('span', { html: fmt(r.q ?? app.t('engine.vx.occQ')) }),
      ),
      h('div', { class: 'actions' }, revealBtn, h('span', { class: 'tiny' }, app.t('engine.vx.nOfM', { n: k + 1, of: targets.length }))),
    );
    const m = masks[k];
    if (m)
      m.onclick = () => {
        if (!api.locked()) show();
      };
    setTimeout(() => {
      revealBtn.focus({ preventScroll: true });
    }, 30);
  };
  const show = (): void => {
    const r = targets[k],
      m = masks[k];
    if (!r || !m || m.classList.contains('off')) return;
    m.classList.add('off');
    nums[k]?.classList.add('seen');
    panel.replaceChildren();
    const rate = (ok: boolean): void => {
      marks[k] = ok;
      if (ok) knew++;
      nums[k]?.classList.add(ok ? 'right' : 'wrong');
      st.outline(r.id, ok ? 'right' : 'wrong');
      app.host.feedback.beep(ok ? 'ok' : 'bad');
      k++;
      focusOn();
    };
    panel.append(
      h(
        'div',
        { class: 'vx-occq' },
        h('span', { class: 'vx-num' }, app.nf(k + 1)),
        h('b', { html: fmt(r.label) }),
        r.note ? h('div', { class: 'tiny', html: fmt(r.note) }) : null,
      ),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'btn small vx-yes',
            type: 'button',
            onclick: () => {
              rate(true);
            },
          },
          `✓ ${app.t('engine.vx.knew')}`,
        ),
        h(
          'button',
          {
            class: 'btn small vx-no',
            type: 'button',
            onclick: () => {
              rate(false);
            },
          },
          `✗ ${app.t('engine.vx.didnt')}`,
        ),
      ),
    );
  };
  const finish = (): void => {
    const ok = verdictOf(ex, { knew: targets.map((_, i) => !!marks[i]) }).ok === true;
    panel.append(
      h(
        'div',
        { class: `fb ${ok ? 'ok' : 'bad'}` },
        h('b', {}, `${app.t('engine.vx.recalled', { n: knew, of: targets.length })} `),
        ok ? app.t('engine.vx.strong') : app.t('engine.vx.comeBack'),
      ),
    );
    api.done(ok);
  };
  st.below.append(panel);
  focusOn();
  return { el: st.el, selfDone: true, given: () => app.t('engine.vx.recalled', { n: knew, of: targets.length }) };
});

export const VISUAL_TYPES: Readonly<Record<string, Renderer>> = {
  img_hotspot,
  img_sequence,
  img_reveal,
  img_drag,
  img_label,
  img_select,
  img_occlusion,
};

/* ---------- the figure block (theory): an explorable picture ---------- */
export function figureBlock(app: StudyApp, media: Readonly<Record<string, Media>>, b: Block): HTMLElement {
  const st = vStage(app, media, b);
  if (st instanceof HTMLElement) return st;
  const regs = st.regs;
  const box = h('figure', { class: 'vx-fig' }, st.el);
  const cap = b.caption ?? st.m.caption;
  if (regs.length && b.explore !== false) {
    st.hover(regs);
    // The label sits on the frame, not inside the picture (which clips at its edges): it may run past the picture,
    // never past the screen; it is moved sideways (and above or below) until it fits.
    const tipEl = h('div', { class: 'vx-tip' });
    st.wrap.append(tipEl);
    let pinned: Region | null = null,
      tipAt: readonly [number, number] | null = null;
    const placeTip = (): void => {
      if (!tipAt || !tipEl.classList.contains('on')) return;
      const [x, y] = tipAt,
        sb = st.stage.getBoundingClientRect(),
        wb = st.wrap.getBoundingClientRect();
      const px = sb.left - wb.left + (x / st.W) * sb.width,
        py = sb.top - wb.top + (y / st.H) * sb.height;
      const w = tipEl.offsetWidth,
        ht = tipEl.offsetHeight,
        gap = 14,
        edge = 8,
        vw = document.documentElement.clientWidth || innerWidth;
      const left = Math.max(edge, Math.min(wb.left + px - w / 2, vw - edge - w)) - wb.left;
      const roomAbove = wb.top + py - gap - ht >= edge,
        roomBelow = wb.top + py + gap + ht <= innerHeight - edge;
      const below = (y < st.H * 0.3 || !roomAbove) && (roomBelow || !roomAbove);
      tipEl.classList.toggle('below', below);
      Object.assign(tipEl.style, { left: `${String(left)}px`, top: `${String(below ? py + gap : py - gap - ht)}px` });
    };
    const showTip = (r: Region): void => {
      tipEl.replaceChildren(h('b', { html: fmt(r.label ?? r.id) }));
      if (r.note) tipEl.append(h('div', { html: fmt(r.note) }));
      tipAt = rCenter(r);
      tipEl.classList.add('on');
      placeTip();
    };
    const hideTip = (): void => {
      tipEl.classList.remove('on');
    };
    new ResizeObserver(placeTip).observe(st.stage);
    const covered = (r: Region | undefined): boolean => !!r && !!st.masks.get(r.id) && !st.masks.get(r.id)?.classList.contains('off'); // a hidden label stays hidden until peeked at
    st.stage.addEventListener('mousemove', ev => {
      if (pinned) return;
      const r = st.hits(...st.toImg(ev))[0];
      if (r && !covered(r)) showTip(r);
      else hideTip();
    });
    st.stage.addEventListener('mouseleave', () => {
      if (!pinned) hideTip();
    });
    st.stage.addEventListener('click', ev => {
      const r = st.hits(...st.toImg(ev))[0];
      const m = r && st.masks.get(r.id);
      if (m && !m.classList.contains('off')) {
        m.classList.add('off');
        return;
      }
      pinned = r && pinned !== r ? r : null;
      if (pinned) showTip(pinned);
      else hideTip();
    });
    // keyboard exploring: arrows move, the part under the crosshair is shown and said; Enter peeks under a cover
    st.keyboard({
      tap: (x, y) => {
        const r = st.hits(x, y)[0];
        const m = r && st.masks.get(r.id);
        if (r && m && !m.classList.contains('off')) {
          m.classList.add('off');
          return app.t('engine.vx.uncovered', { label: r.label ?? r.id });
        }
        return r ? (r.label ?? r.id) + (r.note ? `. ${r.note}` : '') : app.t('engine.vx.nothing');
      },
      undo: () => '',
      describe: (x, y) => {
        const r = st.hits(x, y)[0];
        if (r && covered(r)) {
          hideTip();
          return app.t('engine.vx.hiddenLabel');
        }
        if (r) showTip(r);
        else hideTip();
        return r ? (r.label ?? r.id) : app.t('engine.vx.nothing');
      },
    });
    const named = regs.filter(r => r.label && !r.id.endsWith('-area'));
    if (named.length) {
      // the labels start hidden (test yourself first); the switch and its line sit on top of the picture
      let hidden = true;
      const say = h('span', { class: 'vx-lbltext' }),
        hideBtn = h('button', { class: 'btn small vx-lblbtn', type: 'button' });
      const draw = (): void => {
        for (const r of named) st.mask(r.id, hidden);
        hideBtn.textContent = hidden ? `👀 ${app.t('engine.vx.showLabels')}` : `🙈 ${app.t('engine.vx.hideLabels')}`;
        say.textContent = hidden ? app.t('engine.vx.labelsHidden') : app.t('engine.vx.hoverPart');
      };
      hideBtn.onclick = () => {
        hidden = !hidden;
        draw();
      };
      const credit = st.tools.querySelector('.vx-credit');
      if (credit) st.below.append(h('div', { class: 'vx-figbar' }, credit));
      st.tools.prepend(h('div', { class: 'vx-labelbar' }, hideBtn, say));
      draw();
    } else st.below.append(h('div', { class: 'row vx-figbar' }, h('span', { class: 'tiny grow' }, `👆 ${app.t('engine.vx.hoverPart')}`)));
  }
  if (cap) box.append(h('figcaption', { class: 'caption', html: fmt(cap) }));
  return box;
}
