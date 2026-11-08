/* The plots of sim-spec@1: SVG drawn by the app, coloured by the theme's tokens; the engine library's drawings (scene) and sounds
   (docs/INTERACTIVE_LIBRARY.md §1.4). */
import { svg } from '../dom.ts';
import { fmtNum, isNum } from './format.ts';

export const COLORS = ['var(--c)', 'var(--bad)', 'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--ink2)'];
export const DASH = ['', '7 4', '2 3', '9 3 2 3', '4 4', '1 2']; // a second cue besides the colour
let seq = 0;

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const at = <T>(a: readonly T[], i: number, d: T): T => a[i] ?? d;

export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, n),
    mag = Math.pow(10, Math.floor(Math.log10(raw))),
    r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag,
    out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
export function logTicks(lo: number, hi: number, maxN: number): number[] {
  const a = Math.floor(Math.log10(lo) + 1e-9),
    b = Math.ceil(Math.log10(hi) - 1e-9),
    out: number[] = [];
  const every = Math.max(1, Math.ceil((b - a + 1) / Math.max(2, maxN)));
  for (let k = a; k <= b; k += every) {
    const v = Math.pow(10, k);
    if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
  }
  return out.length ? out : [lo, hi];
}

/** an axis of a plot (the spec's p.x / p.y) */
export interface Axis {
  readonly label?: string;
  readonly unit?: string;
  readonly format?: string;
  readonly digits?: number;
  readonly scale?: string;
  readonly var?: string;
  readonly series?: string;
  readonly min?: unknown;
  readonly max?: unknown;
}
export interface PlotDef {
  readonly kind?: string;
  readonly x?: Axis;
  readonly y?: Axis;
  readonly title?: string;
  readonly height?: number;
  readonly of?: string;
  readonly points?: number;
  readonly series?: readonly Obj[];
  readonly marks?: readonly Obj[];
}
export interface PlotData {
  xs: readonly unknown[];
  lines: { ys: readonly unknown[]; style?: unknown; label?: unknown }[];
  marks: { axis: unknown; v: unknown; label: string }[];
  xr: readonly [unknown, unknown];
  yr: readonly [unknown, unknown];
}
export interface PlotCtx {
  readonly locale: string;
  readonly aria: string;
  readonly xLabel?: string;
  readonly yLabel?: string;
}

/** draw one plot into fig: data = { xs:[…], lines:[{ys, label}], marks:[{axis, v, label}] } */
export function drawPlot(fig: Element, p: PlotDef, data: PlotData, ctx: PlotCtx): SVGElement {
  const W = Math.max(220, Math.floor(fig.clientWidth || 320)),
    H = Math.round(Math.max(170, Math.min(300, W * 0.55)));
  const xa: Axis = p.x ?? {},
    ya: Axis = p.y ?? {},
    xlog = xa.scale === 'log',
    ylog = ya.scale === 'log';
  const ml = W < 360 ? 44 : 54,
    mr = 12,
    mt = 10,
    mb = 40;
  const x0 = Number(data.xr[0]);
  let x1 = Number(data.xr[1]);
  const ys: number[] = [];
  for (const l of data.lines) for (const v of l.ys) if (isNum(v) && (!ylog || v > 0)) ys.push(v);
  let y0 = isNum(data.yr[0]) ? data.yr[0] : null,
    y1 = isNum(data.yr[1]) ? data.yr[1] : null;
  if (y0 == null || y1 == null) {
    let lo = Infinity,
      hi = -Infinity;
    for (const v of ys) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) {
      lo = ylog ? 1 : 0;
      hi = ylog ? 10 : 1;
    }
    if (lo === hi) {
      if (ylog) {
        lo /= 2;
        hi *= 2;
      } else {
        lo -= 1;
        hi += 1;
      }
    }
    const pad = ylog ? 1 : (hi - lo) * 0.06;
    y0 ??= ylog ? lo / 1.2 : lo - pad;
    y1 ??= ylog ? hi * 1.2 : hi + pad;
  }
  if (!(x1 > x0)) x1 = x0 + 1;
  if (!(y1 > y0)) y1 = y0 + 1;
  const tx = xlog ? (v: number): number => Math.log10(v) : (v: number): number => v,
    ty = ylog ? (v: number): number => Math.log10(v) : (v: number): number => v;
  const X0 = x0,
    X1 = x1,
    Y0 = y0,
    Y1 = y1;
  const X = (v: number): number => ml + ((tx(v) - tx(X0)) / (tx(X1) - tx(X0))) * (W - ml - mr),
    Y = (v: number): number => mt + (1 - (ty(v) - ty(Y0)) / (ty(Y1) - ty(Y0))) * (H - mt - mb);
  const s = svg('svg', {
    viewBox: `0 0 ${String(W)} ${String(H)}`,
    width: W,
    height: H,
    role: 'img',
    'aria-label': ctx.aria,
    focusable: 'false',
  });
  const cid = 'simclip' + String(++seq);
  const defs = svg('defs');
  const cp = svg('clipPath', { id: cid });
  cp.append(svg('rect', { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb }));
  defs.append(cp);
  s.append(defs);
  s.append(svg('rect', { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb, fill: 'none', style: 'stroke:var(--line)' }));
  // tick labels: SI prefixes carry the unit (1 kHz, 200 µs); a plain number does not (the axis label has it)
  const tick = (a: Axis, lg: boolean): ((v: number) => string) => {
    const fm = a.format ?? (lg ? 'si' : 'auto');
    return v => fmtNum(v, { format: fm, digits: a.digits || 3, unit: fm === 'si' ? a.unit : '' }, ctx.locale);
  };
  const nt = Math.max(2, Math.floor((W - ml - mr) / 70)),
    fx = tick(xa, xlog),
    fy = tick(ya, ylog);
  const txt = (x: number, y: number, t: string, anchor: string, cls?: string): SVGElement => {
    const e = svg('text', { x, y, 'text-anchor': anchor, class: cls ?? 'sim-tick' });
    e.textContent = t;
    return e;
  };
  for (const v of xlog ? logTicks(X0, X1, nt) : niceTicks(X0, X1, nt)) {
    const px = X(v);
    s.append(svg('line', { x1: px, x2: px, y1: mt, y2: H - mb, class: 'sim-grid' }), txt(px, H - mb + 14, fx(v), 'middle'));
  }
  for (const v of ylog ? logTicks(Y0, Y1, 5) : niceTicks(Y0, Y1, 5)) {
    const py = Y(v);
    s.append(svg('line', { x1: ml, x2: W - mr, y1: py, y2: py, class: 'sim-grid' }), txt(ml - 5, py + 4, fy(v), 'end'));
  }
  if (ctx.xLabel) s.append(txt(ml + (W - ml - mr) / 2, H - 6, ctx.xLabel, 'middle', 'sim-axl'));
  if (ctx.yLabel) {
    const e = txt(0, 0, ctx.yLabel, 'middle', 'sim-axl');
    e.setAttribute('transform', `translate(11 ${String(mt + (H - mt - mb) / 2)}) rotate(-90)`);
    s.append(e);
  }
  const g = svg('g', { 'clip-path': `url(#${cid})` });
  const clampY = (v: number): number => Math.max(-1e4, Math.min(1e4, v));
  data.lines.forEach((l, j) => {
    const st = l.style ?? 'line',
      colour = at(COLORS, j % COLORS.length, ''),
      col = `stroke:${colour}`;
    if (st === 'bars' || st === 'points') {
      // the engine library's styles (docs/INTERACTIVE_LIBRARY.md §1.4): bars for a distribution or counts, points for samples
      const xsN = data.xs.filter((x, i): x is number => isNum(x) && isNum(l.ys[i])),
        gap = xsN.length > 1 ? Math.abs(X(at(xsN, 1, 0)) - X(at(xsN, 0, 0))) : 12,
        bw = Math.max(1, Math.min(40, (gap * 0.8) / (data.lines.length || 1)));
      const base = Y(ylog ? Y0 : Math.max(Y0, Math.min(Y1, 0)));
      for (let i = 0; i < data.xs.length; i++) {
        const x = data.xs[i],
          y = l.ys[i];
        if (!isNum(x) || !isNum(y) || (xlog && x <= 0) || (ylog && y <= 0)) continue;
        if (st === 'points') {
          g.append(svg('circle', { cx: X(x).toFixed(1), cy: clampY(Y(y)).toFixed(1), r: 2.5, style: `fill:${colour}`, class: 'sim-dot' }));
          continue;
        }
        const top = clampY(Y(y)),
          x0b = X(x) - (bw * data.lines.length) / 2 + j * bw;
        g.append(
          svg('rect', {
            x: x0b.toFixed(1),
            y: Math.min(top, base).toFixed(1),
            width: bw.toFixed(1),
            height: Math.abs(base - top).toFixed(1),
            style: `fill:${colour}`,
            class: 'sim-bar',
          }),
        );
      }
      return;
    }
    let d = '',
      pen = false;
    for (let i = 0; i < data.xs.length; i++) {
      const x = data.xs[i],
        y = l.ys[i];
      if (!isNum(x) || !isNum(y) || (xlog && x <= 0) || (ylog && y <= 0)) {
        pen = false;
        continue;
      }
      if (st === 'steps' && pen) d += 'H' + X(x).toFixed(1);
      d += pen
        ? st === 'steps'
          ? 'V' + clampY(Y(y)).toFixed(1)
          : 'L' + X(x).toFixed(1) + ' ' + clampY(Y(y)).toFixed(1)
        : 'M' + X(x).toFixed(1) + ' ' + clampY(Y(y)).toFixed(1);
      pen = true;
    }
    g.append(
      svg('path', {
        d: d || 'M0 0',
        fill: 'none',
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-dasharray': at(DASH, j % DASH.length, '') || null,
        style: col,
        class: 'sim-line',
      }),
    );
  });
  for (const m of data.marks) {
    if (!isNum(m.v)) continue;
    if (m.axis === 'x') {
      if ((xlog && m.v <= 0) || m.v < X0 || m.v > X1) continue;
      const px = X(m.v);
      g.append(svg('line', { x1: px, x2: px, y1: mt, y2: H - mb, class: 'sim-mark' }));
      if (m.label) g.append(txt(px + 4, mt + 12, m.label, 'start', 'sim-markl'));
    } else {
      if ((ylog && m.v <= 0) || m.v < Y0 || m.v > Y1) continue;
      const py = Y(m.v);
      g.append(svg('line', { x1: ml, x2: W - mr, y1: py, y2: py, class: 'sim-mark' }));
      if (m.label) g.append(txt(W - mr - 4, py - 4, m.label, 'end', 'sim-markl'));
    }
  }
  s.append(g);
  return s;
}

const ROLE = (r: unknown): string =>
  typeof r === 'string' && ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'].includes(r) ? r : 'base';
export interface SceneCtx {
  readonly locale: string;
  readonly aria: string;
  tt(key: unknown): string;
}
/** draw a scene {view: [x0, x1, y0, y1], items} into fig: the same scale on both axes, y upwards; words from the string tables */
export function drawScene(fig: Element, p: PlotDef, sc: unknown, ctx: SceneCtx): SVGElement {
  const W = Math.max(220, Math.floor(fig.clientWidth || 320));
  const sv = isObj(sc) && Array.isArray(sc.view) ? (sc.view as unknown[]) : null;
  const v: readonly number[] =
    sv && sv.length === 4 && sv.every(isNum) && (sv[1] as number) > (sv[0] as number) && (sv[3] as number) > (sv[2] as number)
      ? sv
      : [-1, 1, -1, 1];
  const v0 = at(v, 0, -1),
    v1 = at(v, 1, 1),
    v2 = at(v, 2, -1),
    v3 = at(v, 3, 1);
  const aspect = (v3 - v2) / (v1 - v0);
  const H = p.height || Math.round(Math.max(180, Math.min(520, W * aspect)));
  const k = Math.min(W / (v1 - v0), H / (v3 - v2)),
    ox = (W - k * (v1 - v0)) / 2,
    oy = (H - k * (v3 - v2)) / 2;
  const X = (x: number): number => ox + (x - v0) * k,
    Y = (y: number): number => H - oy - (y - v2) * k;
  const s = svg('svg', {
    viewBox: `0 0 ${String(W)} ${String(H)}`,
    width: W,
    height: H,
    role: 'img',
    'aria-label': ctx.aria,
    focusable: 'false',
    class: 'sim-scene',
  });
  const mid = 'simarr' + String(++seq),
    defs = svg('defs'),
    mk = svg('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  mk.append(svg('path', { d: 'M0 0L10 5L0 10z', class: 'sim-arrowhead' }));
  defs.append(mk);
  s.append(defs);
  const word = (it: Obj): string =>
    it.key != null
      ? ctx.tt(it.key)
      : isNum(it.v)
        ? fmtNum(it.v, { digits: it.digits || 3 }, ctx.locale)
        : typeof it.s === 'string'
          ? it.s.slice(0, 64)
          : '';
  const label = (x: number, y: number, it: Obj, anchor?: string): void => {
    const t = word(it);
    if (!t) return;
    const e = svg('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor ?? 'middle', class: 'sim-sl sim-r-' + ROLE(it.c) });
    e.textContent = t;
    s.append(e);
  };
  const items = isObj(sc) && Array.isArray(sc.items) ? (sc.items as unknown[]).slice(0, 2000) : [];
  const order: Readonly<Record<string, number>> = { poly: 0, circ: 1, seg: 2, pt: 3, txt: 4 };
  const rank = (a: unknown): number => (isObj(a) && typeof a.k === 'string' ? (order[a.k] ?? 9) : 9);
  const N = (v: unknown): number => v as number;
  for (const it of items.slice().sort((a, b) => rank(a) - rank(b))) {
    if (!isObj(it)) continue;
    const cls = 'sim-r-' + ROLE(it.c),
      dash = it.dash ? '5 4' : null;
    if (it.k === 'pt' && isNum(it.x) && isNum(it.y)) {
      s.append(
        svg('circle', {
          cx: X(it.x).toFixed(1),
          cy: Y(it.y).toFixed(1),
          r: isNum(it.r) ? Math.max(1, Math.min(30, it.r)) : 4,
          class: 'sim-pt ' + cls,
        }),
      );
      label(X(it.x), Y(it.y) - 9, it);
    } else if (it.k === 'seg' && [it.x1, it.y1, it.x2, it.y2].every(isNum)) {
      s.append(
        svg('line', {
          x1: X(N(it.x1)).toFixed(1),
          y1: Y(N(it.y1)).toFixed(1),
          x2: X(N(it.x2)).toFixed(1),
          y2: Y(N(it.y2)).toFixed(1),
          class: 'sim-seg ' + cls,
          'stroke-width': isNum(it.w) ? Math.max(0.5, Math.min(12, it.w)) : 2,
          'stroke-dasharray': dash,
          'marker-end': it.arrow ? `url(#${mid})` : null,
        }),
      );
      label((X(N(it.x1)) + X(N(it.x2))) / 2, (Y(N(it.y1)) + Y(N(it.y2))) / 2 - 5, it);
    } else if (it.k === 'circ' && [it.x, it.y, it.r].every(isNum))
      s.append(
        svg('circle', {
          cx: X(N(it.x)).toFixed(1),
          cy: Y(N(it.y)).toFixed(1),
          r: Math.max(0, N(it.r) * k).toFixed(1),
          class: 'sim-circ ' + cls + (it.fill ? ' sim-fill' : ''),
          'stroke-dasharray': dash,
        }),
      );
    else if (it.k === 'poly' && Array.isArray(it.pts) && it.pts.length >= 4 && (it.pts as unknown[]).every(isNum)) {
      const ps = it.pts as number[],
        pts: string[] = [];
      for (let i = 0; i + 1 < ps.length; i += 2) pts.push(X(at(ps, i, 0)).toFixed(1) + ',' + Y(at(ps, i + 1, 0)).toFixed(1));
      s.append(
        svg(it.closed === false ? 'polyline' : 'polygon', {
          points: pts.join(' '),
          class: 'sim-poly ' + cls + (it.fill ? ' sim-fill' : ''),
          'stroke-dasharray': dash,
        }),
      );
    } else if (it.k === 'txt' && isNum(it.x) && isNum(it.y))
      label(X(it.x), Y(it.y), it, it.anchor === 'start' || it.anchor === 'end' ? it.anchor : 'middle');
  }
  return s;
}

/** play a sound {notes: [{f Hz, t s, d s, g 0–1}], wave?, partials?: [amplitudes]} with WebAudio (≤ 512 notes, ≤ 60 s); → stop() */
let AC: AudioContext | null = null;
export function playSound(snd: unknown): () => void {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const A = w.AudioContext ?? w.webkitAudioContext;
  if (!A || !isObj(snd) || !Array.isArray(snd.notes)) return () => undefined;
  const ac = (AC ??= new A());
  if (ac.state === 'suspended') void ac.resume();
  const t0 = ac.currentTime + 0.05,
    out = ac.createGain();
  out.gain.value = 0.25;
  out.connect(ac.destination);
  const wave: OscillatorType =
    typeof snd.wave === 'string' && ['sine', 'triangle', 'square', 'sawtooth'].includes(snd.wave) ? (snd.wave as OscillatorType) : 'sine';
  let custom: PeriodicWave | null = null;
  if (Array.isArray(snd.partials) && snd.partials.length > 1 && (snd.partials as unknown[]).every(isNum)) {
    const ps = snd.partials as number[],
      n = Math.min(64, ps.length),
      re = new Float32Array(n + 1),
      im = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) im[i + 1] = at(ps, i, 0);
    custom = ac.createPeriodicWave(re, im);
  }
  const oscs: OscillatorNode[] = [];
  for (const nt of (snd.notes as unknown[]).slice(0, 512)) {
    if (
      !isObj(nt) ||
      !isNum(nt.f) ||
      !isNum(nt.t) ||
      !isNum(nt.d) ||
      nt.f < 16 ||
      nt.f > 20000 ||
      nt.d <= 0 ||
      nt.t < 0 ||
      nt.t + nt.d > 60
    )
      continue;
    const o = ac.createOscillator(),
      g = ac.createGain(),
      a = t0 + nt.t,
      e = a + nt.d,
      gv = isNum(nt.g) ? Math.max(0, Math.min(1, nt.g)) : 0.8;
    if (custom) o.setPeriodicWave(custom);
    else o.type = wave;
    o.frequency.value = nt.f;
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(gv, a + 0.01);
    g.gain.setValueAtTime(gv, Math.max(a + 0.01, e - 0.03));
    g.gain.linearRampToValueAtTime(0, e);
    o.connect(g);
    g.connect(out);
    o.start(a);
    o.stop(e + 0.02);
    oscs.push(o);
  }
  return () => {
    for (const o of oscs) {
      try {
        o.stop();
      } catch {
        continue; // already stopped
      }
    }
    out.disconnect();
  };
}
