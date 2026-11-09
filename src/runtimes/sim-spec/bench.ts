/* The fault-finding bench of sim-spec@1 (docs/INTERACTIVE.md §12.7): instruments, the measurement log, the diagnosis. The hidden
   fault lives only in this closure and in the engine (never in the page, the state or a label). */
import type { Compile, Env } from '../compute.ts';
import { h, str } from '../dom.ts';
import type { ActivityInit, RuntimeHost } from '../types.ts';
import { fmtNum, isNum } from './format.ts';
import { drawPlot, type PlotData, type PlotDef } from './plot.ts';
import type { OutputRunner } from './view.ts';
import type { Bench, BenchPoint, Instrument, Spec } from './spec.ts';

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);

/** a measurement in the log: where (the event's data) and its reading */
interface LogEntry {
  i: string;
  a?: string | undefined;
  b?: string | undefined;
  part?: number;
  m?: string;
  g?: number;
  r?: unknown;
  [k: string]: unknown;
}

export interface BenchDeps {
  readonly rt: RuntimeHost;
  readonly spec: Spec;
  readonly bench: Bench;
  readonly init: ActivityInit;
  readonly uid: string;
  readonly locale: string;
  tt(k: unknown): string;
  readonly compile: Compile;
  base(): Env;
  prep(e: Env): unknown;
  out(type: string, payload?: Obj): void;
  saveSoon(): void;
  recompute(): void;
  runner(): OutputRunner | null;
  /** a new runner for a new device (its fault applied) */
  renew(): void;
  closed(): boolean;
}

export interface BenchView {
  readonly el: HTMLElement;
  reveal(): void;
  redraw(): void;
  applied(): unknown;
  /** the bench's values for the checks grader: never shown (the validators keep them out of readouts and marks) */
  values(): Env;
  ready(): boolean;
  state(): Obj | undefined;
}

/** a seeded pick: the same seed draws the same item (mulberry32) */
export function seededIndex(seed: number, n: number): number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}

export function makeBench(d: BenchDeps): BenchView {
  const { rt, bench: bn, init, uid, locale } = d;
  const tt = (k: unknown): string => d.tt(k);
  const tE = (k: string, v?: Readonly<Record<string, string | number>>): string => rt.t(k, v);
  const C = d.compile;
  const ev = (f: (e: Env) => unknown, env: Env): unknown => {
    try {
      return f(env);
    } catch {
      return NaN;
    }
  };
  const exMode = !!init.exerciseId,
    opts = bn.diagnosis.options,
    budget = bn.budget ?? 0;
  const st0 = isObj(init.state) ? init.state : null,
    data0 = st0 && isObj(st0.data) ? st0.data : null;
  const savedB = !exMode && data0 && isObj(data0.bench) ? data0.bench : null;
  let seed = isNum(savedB?.seed) ? savedB.seed >>> 0 : Number(init.seed) >>> 0,
    fault = 0,
    dx: number | null = null,
    done = false,
    count = 0,
    face: (() => void) | null = null;
  const log: LogEntry[] = [];
  const task = isObj(init.task) ? init.task : {};
  function pick(): void {
    const ids = bn.faults.map(f => f.id),
      tf = task.fault;
    const pool =
      typeof tf === 'string' && ids.includes(tf)
        ? [tf]
        : Array.isArray(tf) && (tf as unknown[]).some(x => ids.includes(x as string))
          ? (tf as unknown[]).filter((x): x is string => ids.includes(x as string))
          : ids;
    fault = ids.indexOf(pool[seededIndex(seed, pool.length)] ?? '');
  }
  pick();
  const pt = (id: unknown): BenchPoint | undefined => bn.points.find(p => p.id === id);
  const instName = (k: string): string => tE('engine.act.bench.inst.' + k);
  const sel = (
    cls: string,
    label: string,
    items: readonly { value: string; text: string }[],
  ): { s: HTMLSelectElement; row: HTMLElement } => {
    // a labelled select: items [{value, text}]
    const id = uid + 'b-' + cls,
      s = h(
        'select',
        { id, class: 'sim-sel', 'data-bench': cls },
        items.map(o => h('option', { value: o.value }, o.text)),
      );
    return { s, row: h('div', { class: 'sim-p sim-bsel' }, h('label', { for: id, class: 'sim-lab' }, label), s) };
  };
  const inst = sel(
    'instrument',
    tE('engine.act.bench.instrument'),
    bn.instruments.map(x => ({ value: x.kind, text: instName(x.kind) })),
  );
  const ptItems = (ids: readonly string[]): { value: string; text: string }[] => ids.map(id => ({ value: id, text: tt(pt(id)?.label) }));
  const A = sel('a', tE('engine.act.bench.red'), []),
    Bk = sel('b', tE('engine.act.bench.black'), []);
  const aLabel = A.row.querySelector('label'); // its words change with the instrument
  const part = sel('part', tE('engine.act.bench.part'), []);
  const modeS = sel('mode', tE('engine.act.bench.mode'), []),
    gndS = sel('ground', tE('engine.act.bench.ground'), []); // a multimeter's modes, a scope probe's ground leads (§9.5)
  const modeName = (q: string): string => tE('engine.act.bench.mode.' + q);
  const btn = h(
    'button',
    {
      class: 'btn primary small',
      type: 'button',
      'data-bench': 'measure',
      onclick: () => {
        measure();
      },
    },
    tE('engine.act.bench.measure'),
  );
  const left = h('span', { class: 'sim-left', 'aria-live': 'polite' });
  const faceEl = h('div', { class: 'sim-face', 'aria-live': 'polite' });
  const logEl = h('ol', { class: 'sim-log' }),
    logEmpty = h('p', { class: 'sim-log-empty' }, tE('engine.act.bench.logEmpty'));
  const dxSel = sel('diagnosis', bn.diagnosis.label ? tt(bn.diagnosis.label) : tE('engine.act.bench.diagnosis'), [
    { value: '', text: tE('engine.act.bench.choose') },
    ...opts.map((o, i) => ({ value: String(i), text: tt(o.label) })),
  ]);
  const dxBtn = exMode
    ? null
    : h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          'data-bench': 'commit',
          onclick: () => {
            if (dx != null && !done) {
              reveal();
              d.saveSoon();
            }
          },
        },
        tE('engine.act.bench.commit'),
      );
  const dxOut = h('p', { class: 'sim-dx-out', 'aria-live': 'polite' });
  const another = exMode
    ? null
    : h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          'data-bench': 'another',
          onclick: () => {
            newDevice();
          },
        },
        '↻ ' + tE('engine.act.bench.another'),
      );
  const cur = (): Instrument => bn.instruments.find(x => x.kind === inst.s.value) ?? (bn.instruments[0] as Instrument);
  const whole = (k: string): boolean => k === 'log' || k === 'rssi' || k === 'T' || k === 'clock'; // twin@1: the event log, the RSSI, the thermometer and the clock check read the device, not a point
  function setInstrument(): void {
    const x = cur(),
      two = x.kind === 'V' || x.kind === 'R',
      ids = x.points ?? bn.points.map(p => p.id);
    const keep = (s: HTMLSelectElement, items: readonly { value: string; text: string }[], fallback: string): void => {
      const v = s.value;
      s.replaceChildren(...items.map(o => h('option', { value: o.value }, o.text)));
      s.value = items.some(o => o.value === v) ? v : fallback;
    };
    if (x.kind === 'I')
      keep(
        part.s,
        (x.parts ?? []).map((q, i) => ({ value: String(i), text: tt(q.label) })),
        '0',
      );
    else if (!whole(x.kind)) {
      const g = ids.find(id => /^(gnd|0)$/.test(String(pt(id)?.at))) ?? ids[ids.length - 1] ?? '';
      keep(A.s, ptItems(ids), ids.find(id => id !== g) ?? ids[0] ?? '');
      if (two) keep(Bk.s, ptItems(ids), g);
    }
    const ms = x.modes ?? [],
      ls = x.leads ?? [];
    keep(
      modeS.s,
      ms.map(q => ({ value: q, text: modeName(q) })),
      ms[0] ?? '',
    );
    keep(
      gndS.s,
      ls.map((q, i) => ({ value: String(i), text: tt(q.label) })),
      '0',
    );
    if (aLabel) aLabel.textContent = two ? tE('engine.act.bench.red') : tE('engine.act.bench.probe');
    A.row.hidden = x.kind === 'I' || whole(x.kind);
    Bk.row.hidden = !two;
    part.row.hidden = x.kind !== 'I';
    modeS.row.hidden = ms.length < 2;
    gndS.row.hidden = ls.length < 2;
  }
  inst.s.addEventListener('change', setInstrument);
  dxSel.s.addEventListener('change', () => {
    if (done) return;
    dx = dxSel.s.value === '' ? null : +dxSel.s.value;
    if (dx != null) d.out('event', { name: 'diagnose', data: { option: dx } });
    d.saveSoon();
  });
  const tval = (v: unknown, dflt?: unknown): unknown => {
    const g = typeof v === 'string' ? C(v) : null;
    return g ? ev(g, d.base()) : v === undefined ? dflt : v;
  };
  function probeOf(x: Instrument): { probe: Obj; ev: LogEntry } {
    const tw =
      x.tEnd === undefined
        ? {}
        : {
            tEnd: tval(x.tEnd),
            ...(x.dt !== undefined ? { dt: tval(x.dt) } : {}),
            ...(x.tStart !== undefined ? { tStart: tval(x.tStart) } : {}),
          };
    const mode =
      Array.isArray(x.modes) && x.modes.length ? (x.modes.includes(modeS.s.value) ? modeS.s.value : (x.modes[0] as string)) : null;
    const md = mode ? { mode } : {},
      zin = x.zin !== undefined ? { zin: x.zin } : {};
    if (x.kind === 'I') {
      const ps = x.parts ?? [],
        q = ps[+part.s.value] ?? ps[0];
      return {
        probe: { kind: 'I', element: q?.element, ...(q?.pin !== undefined ? { pin: q.pin } : {}), ...md, ...tw },
        ev: { i: 'I', part: +part.s.value, ...(mode ? { m: mode } : {}) },
      };
    }
    if (whole(x.kind)) return { probe: { kind: x.kind }, ev: { i: x.kind } };
    const a = pt(A.s.value),
      b = Bk.s.value ? pt(Bk.s.value) : null;
    if (x.kind === 'R') return { probe: { kind: 'R', a: a?.at, b: b ? b.at : 'gnd' }, ev: { i: 'R', a: a?.id, b: b?.id } };
    if (x.kind === 'V')
      return {
        probe: { kind: 'V', a: a?.at, b: b ? b.at : 'gnd', ...zin, ...md, ...tw },
        ev: { i: 'V', a: a?.id, b: b?.id, ...(mode ? { m: mode } : {}) },
      };
    if (x.kind === 'bode')
      return {
        probe: {
          kind: 'bode',
          node: a?.at,
          ref: 'gnd',
          source: x.source,
          fStart: tval(x.fStart),
          fStop: tval(x.fStop),
          ...(x.fPoints ? { points: x.fPoints } : {}),
        },
        ev: { i: 'bode', a: a?.id },
      };
    if (x.kind === 'scope') {
      const ls = x.leads ?? [],
        gi = ls.length ? Math.min(ls.length - 1, +gndS.s.value || 0) : -1,
        l = gi >= 0 ? ls[gi] : null;
      return {
        probe: {
          kind: 'scope',
          node: a?.at,
          ref: 'gnd',
          ...zin,
          ...(l ? { lead: l.lead, ...(l.cin !== undefined ? { cin: l.cin } : {}) } : {}),
          ...tw,
        },
        ev: { i: 'scope', a: a?.id, ...(l ? { g: gi } : {}) },
      };
    }
    return {
      probe: { kind: 'logic', nodes: [a?.at], ...zin, ...(x.threshold !== undefined ? { threshold: tval(x.threshold) } : {}), ...tw },
      ev: { i: 'logic', a: a?.id },
    };
  }
  function paintLeft(): void {
    left.textContent = budget ? tE('engine.act.bench.left', { left: Math.max(0, budget - count) }) : '';
    btn.disabled = done || (!!budget && count >= budget);
    for (const s of [inst.s, A.s, Bk.s, part.s, modeS.s, gndS.s, dxSel.s]) s.disabled = done;
    if (dxBtn) dxBtn.disabled = done;
  }
  const fm = (v: unknown, unit: string): string => fmtNum(v, { format: 'si', unit, digits: 3 }, locale);
  const withMode = (txt: string, r: Obj): string => (r.mode && r.mode !== 'dc' ? txt + ' ' + modeName(str(r.mode)) : txt);
  const statsOf = (v: unknown): Obj => (isObj(v) ? v : {});
  /** the reading in words and numbers (never the fault) */
  function reading(r0: unknown): string {
    if (!isObj(r0) || r0.error) return tE('engine.act.bench.failed');
    const r = r0;
    if (r.kind === 'V') return withMode(fm(r.value, 'V'), r);
    if (r.kind === 'I') return withMode(fm(r.value, 'A'), r);
    if (r.kind === 'T') {
      const c = (v: unknown): string => fmtNum(v, { format: 'fixed', digits: 1, unit: '°C' }, locale);
      return tE('engine.act.bench.tempStats', { now: c(r.value), min: c(r.min), max: c(r.max) });
    }
    if (r.kind === 'clock')
      return tE('engine.act.bench.clockStats', {
        ppm: fmtNum(r.value, { format: 'fixed', digits: 1, unit: 'ppm' }, locale),
        err: fm(r.err, 's'),
      });
    if (r.kind === 'bode') {
      const st = statsOf(r.stats),
        db = (v: unknown): string => (isNum(v) ? fmtNum(v, { format: 'fixed', digits: 1, unit: 'dB' }, locale) : '—'),
        hz = (v: unknown): string => (isNum(v) && v > 0 ? fm(v, 'Hz') : '—');
      return tE('engine.act.bench.bodeStats', { dc: db(st.dcDb), peak: db(st.peakDb), f3db: hz(st.f3db), unity: hz(st.fUnity) });
    }
    if (r.kind === 'R') return r.value === 'OL' ? 'OL' : fm(r.value, 'Ω'); // i18n-ignore (the meter's own display)
    if (r.kind === 'rssi') return fmtNum(r.value, { format: 'fixed', digits: 1, unit: 'dBm' }, locale);
    if (r.kind === 'log') {
      const n = logCounts(r),
        c = n.collision ?? 0,
        sm = n['slot-miss'] ?? 0;
      return c || sm
        ? tE('engine.act.bench.logStats2', { resets: n.reset ?? 0, lost: n.lost ?? 0, overruns: n.overrun ?? 0, collisions: c, missed: sm })
        : tE('engine.act.bench.logStats', { resets: n.reset, lost: n.lost, overruns: n.overrun } as Record<string, number>);
    }
    const u = r.unit === 'A' ? 'A' : 'V'; // a scope shows a voltage, or (twin@1) the supply current
    if (r.kind === 'scope') {
      const st = statsOf(r.stats);
      return tE('engine.act.bench.scopeStats', {
        pp: fm(st.pp, u),
        mean: fm(st.mean, u),
        freq: Number(st.freq) > 0 ? fm(st.freq, 'Hz') : '—',
      });
    }
    const tr = Object.values(statsOf(r.traces))[0];
    const st = isObj(tr) ? statsOf(tr.stats) : {};
    return tE('engine.act.bench.logicStats', {
      freq: Number(st.freq) > 0 ? fm(st.freq, 'Hz') : '—',
      duty: fmtNum(100 * (Number(st.duty) || 0), { format: 'fixed', digits: 0, unit: '%' }, locale),
    });
  }
  /** the event log of twin@1: how many resets, lost messages and overrun wakes */
  function logCounts(r: Obj): Record<string, number> {
    if (isObj(r.counts)) return r.counts as Record<string, number>;
    const n: Record<string, number> = { reset: 0, lost: 0, overrun: 0, dead: 0 };
    for (const e of Array.isArray(r.events) ? (r.events as unknown[]) : [])
      if (isObj(e) && typeof e.code === 'string' && Object.prototype.hasOwnProperty.call(n, e.code)) n[e.code] = (n[e.code] ?? 0) + 1;
    return n;
  }
  /** a reading as it is kept in the saved state: the numbers the log shows, not the traces */
  function slim(r: unknown): unknown {
    if (!isObj(r)) return r;
    if (r.kind === 'scope') return { kind: 'scope', stats: r.stats, ...(r.unit ? { unit: r.unit } : {}) };
    if (r.kind === 'log') return { kind: 'log', counts: logCounts(r) };
    if (r.kind === 'logic')
      return {
        kind: 'logic',
        traces: Object.fromEntries(Object.entries(statsOf(r.traces)).map(([k, v]) => [k, { stats: isObj(v) ? v.stats : undefined }])),
      };
    if (r.kind === 'bode') return { kind: 'bode', stats: r.stats };
    return r;
  }
  function where(e: LogEntry): string {
    if (e.i === 'I') return tt(bn.instruments.find(x => x.kind === 'I')?.parts?.[Number(e.part)]?.label);
    const a = pt(e.a),
      b = e.b ? pt(e.b) : null,
      l = e.i === 'scope' && Number.isInteger(e.g) ? bn.instruments.find(x => x.kind === 'scope')?.leads?.[Number(e.g)] : null;
    return a ? tt(a.label) + (b ? ' → ' + tt(b.label) : '') + (l ? ' (' + tt(l.label) + ')' : '') : '';
  }
  function paintLog(): void {
    logEl.replaceChildren(
      ...log.map(e =>
        h(
          'li',
          {},
          h('span', { class: 'sim-log-i' }, instName(e.i)),
          ' ' + where(e) + ': ',
          h('b', {}, e.r === undefined ? '…' : reading(e.r)),
        ),
      ),
    );
    logEmpty.hidden = log.length > 0;
  }
  const nums = (v: unknown): number[] => (Array.isArray(v) ? (v as number[]) : []);
  function showFace(e: LogEntry): void {
    const r = e.r;
    faceEl.replaceChildren();
    if (!isObj(r) || r.error || !(r.kind === 'scope' || r.kind === 'logic' || (r.kind === 'bode' && Array.isArray(r.f)))) {
      faceEl.append(
        h(
          'div',
          { class: 'sim-meter' },
          h('span', { class: 'sim-meter-i' }, instName(e.i)),
          h('output', { class: 'sim-meter-v' }, reading(r)),
        ),
      );
      return;
    }
    const fig = h('figure', { class: 'sim-plot sim-scope' });
    faceEl.append(fig);
    let xl = tE('engine.act.bench.time') + ' (s)',
      p: PlotDef,
      data: PlotData,
      yl: string;
    if (r.kind === 'bode') {
      // the gain over frequency (log axis)
      const f = nums(r.f);
      xl = tE('engine.act.bench.frequency') + ' (Hz)';
      yl = tE('engine.act.bench.gain') + ' (dB)';
      p = { x: { label: 'x', unit: 'Hz', format: 'si', scale: 'log' }, y: { label: 'y', unit: 'dB', digits: 1 } };
      data = { xs: f, lines: [{ ys: nums(r.db) }], marks: [], xr: [f[0], f[f.length - 1]], yr: [null, null] };
    } else if (r.kind === 'scope') {
      const isCur = r.unit === 'A',
        t = nums(r.t);
      yl = isCur ? tE('engine.act.bench.current') + ' (A)' : tE('engine.act.bench.voltage') + ' (V)';
      p = { x: { label: 'x', unit: 's', format: 'si' }, y: { label: 'y', unit: isCur ? 'A' : 'V', ...(isCur ? { format: 'si' } : {}) } };
      data = { xs: t, lines: [{ ys: nums(r.v) }], marks: [], xr: [t[0], t[t.length - 1]], yr: [null, null] };
    } else {
      // a logic trace: steps from the level at the start and the edges
      const tr0 = Object.values(statsOf(r.traces))[0],
        tr = isObj(tr0) ? tr0 : { level0: 0, edges: [] },
        xs: unknown[] = [r.t0],
        ys: unknown[] = [tr.level0];
      for (const ed of Array.isArray(tr.edges) ? (tr.edges as unknown[]) : []) {
        if (!isObj(ed)) continue;
        xs.push(ed.t, ed.t);
        ys.push(ys[ys.length - 1], ed.to);
      }
      xs.push(r.t1);
      ys.push(ys[ys.length - 1]);
      yl = tE('engine.act.bench.level');
      p = { x: { label: 'x', unit: 's', format: 'si' }, y: { label: 'y', digits: 1 } };
      data = { xs, lines: [{ ys }], marks: [], xr: [r.t0, r.t1], yr: [-0.15, 1.15] };
    }
    const aria = instName(e.i) + ', ' + where(e) + ': ' + reading(r);
    const holder = h('div', { class: 'sim-svg' });
    fig.append(h('figcaption', {}, aria), holder);
    const draw = (): void => {
      if (holder.isConnected) holder.replaceChildren(drawPlot(holder, p, data, { locale, aria, xLabel: xl, yLabel: yl }));
    };
    requestAnimationFrame(draw);
    face = draw;
  }
  function measure(): void {
    const runner = d.runner();
    if (done || (budget && count >= budget) || !runner?.measure) return;
    const x = cur(),
      m = probeOf(x),
      e: LogEntry = { ...m.ev };
    count++;
    log.push(e);
    paintLog();
    paintLeft();
    d.out('event', { name: 'measure', data: { ...m.ev } });
    runner.measure(d.prep(d.base()), m.probe, r => {
      if (d.closed()) return;
      e.r = isObj(r)
        ? r.kind === 'scope' || r.kind === 'logic' || r.kind === 'bode'
          ? r
          : r.kind === 'log' && !r.error
            ? { kind: 'log', counts: logCounts(r) }
            : r.error
              ? { kind: r.kind, error: r.error }
              : r.kind === 'T'
                ? { kind: 'T', value: r.value, min: r.min, max: r.max }
                : r.kind === 'clock'
                  ? { kind: 'clock', value: r.value, err: r.err }
                  : { kind: r.kind, value: r.value, error: r.error, ...(r.mode ? { mode: r.mode } : {}) }
        : { error: 'none' };
      paintLog();
      showFace(e);
      d.saveSoon();
    });
  }
  const faultId = (): string => bn.faults[fault]?.id ?? '';
  /** after the diagnosis: lock the bench and say what the fault was (the only time the page learns it) */
  function reveal(): void {
    if (done) return;
    done = true;
    const chosen = dx != null ? opts[dx] : undefined;
    const right = chosen?.fault === faultId(),
      truth = opts.find(o => o.fault === faultId());
    dxOut.className = 'sim-dx-out ' + (right ? 'ok' : 'bad');
    dxOut.textContent = right
      ? tE('engine.act.bench.right', { fault: tt(chosen.label) })
      : tE('engine.act.bench.wrong', { fault: truth ? tt(truth.label) : '—' });
    paintLeft();
  }
  function newDevice(): void {
    seed = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) >>> 0;
    pick();
    log.length = 0;
    count = 0;
    dx = null;
    done = false;
    dxSel.s.value = '';
    dxOut.textContent = '';
    dxOut.className = 'sim-dx-out';
    faceEl.replaceChildren();
    d.renew();
    d.out('event', { name: 'reset' });
    paintLog();
    paintLeft();
    d.recompute();
    d.saveSoon();
  }
  if (savedB) {
    // an explorer's bench comes back: the same device (seed), its log, the diagnosis
    for (const e of Array.isArray(savedB.log) ? (savedB.log as unknown[]).slice(0, 200) : [])
      if (isObj(e) && typeof e.i === 'string') log.push({ ...e } as LogEntry);
    count = log.length;
    const sdx = savedB.dx;
    if (typeof sdx === 'number' && Number.isInteger(sdx) && sdx >= 0 && sdx < opts.length) {
      dx = sdx;
      dxSel.s.value = String(dx);
    }
  }
  setInstrument();
  paintLog();
  paintLeft();
  if (savedB?.done && dx != null) reveal();
  const ctl = h(
    'div',
    { class: 'sim-bctl' },
    inst.row,
    A.row,
    Bk.row,
    part.row,
    modeS.row,
    gndS.row,
    h('div', { class: 'sim-brow' }, btn, left),
  );
  const el = h(
    'section',
    { class: 'sim-bench' },
    h('div', { class: 'sim-binst' }, ctl, faceEl),
    h('h5', { class: 'sim-bh' }, tE('engine.act.bench.log')),
    logEmpty,
    logEl,
    h('div', { class: 'sim-dx' }, dxSel.row, h('div', { class: 'sim-brow' }, dxBtn, another), dxOut),
  );
  return {
    el,
    reveal,
    redraw: () => {
      face?.();
    },
    applied: () => JSON.parse(JSON.stringify(bn.faults[fault]?.apply ?? [])) as unknown,
    values: () => ({ diagnosis: dx == null ? -1 : dx, measurements: count, correct: dx != null && opts[dx]?.fault === faultId() }),
    ready: () => dx != null,
    state: () => (exMode ? undefined : { seed, log: log.map(e => ({ ...e, r: slim(e.r) })), dx, done }),
  };
}
