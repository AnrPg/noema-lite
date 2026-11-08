/* The spec view of sim-spec@1 (Tier B: a declarative simulation, docs/INTERACTIVE.md §12): controls, readouts, plots (and a
   fault-finding bench) drawn by the app from a spec. No code of the pack runs, so there is no frame: the app's own code renders
   the controls and the plots with its own DOM and styles (theme tokens, dark mode, keyboard, labels, 320 px) — docs/adr/001
   "as built". The spec is checked with the same rules as the validators (the content checks' checkSimSpec) before anything is
   shown; a spec that fails shows the activity's fallback.
   The outputs come from the spec's engine (the core's ACT.engine: formula@1, the engine library, wasm@1), from several engines
   (parts, parts.ts), or from a runtime that computes them itself (py-module@1: the ViewHost below).
   The protocol with the core is the one of every runtime: ready, pong, state, event; pause/resume/destroy. */
import type { Compiled, Env, EngineOpts, SimEngine } from '../compute.ts';
import { h } from '../dom.ts';
import type { MountContext, RuntimeHost, RuntimePort } from '../types.ts';
import { makeBench, type BenchView } from './bench.ts';
import { fmtNum, isNum } from './format.ts';
import { partsEngine, partsRunner, withParts, MAX_POINTS, type PartsResult } from './parts.ts';
import { COLORS, DASH, drawPlot, drawScene, playSound, type PlotData } from './plot.ts';
import { engineRunner, type Done } from './runner.ts';
import type { Param, Plot, Spec } from './spec.ts';

let seq = 0;
type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);

/** a runner of outputs (an engine's, the parts', or another runtime's) */
export interface OutputRunner {
  run(inputs: unknown, done: Done): void;
  measure?(inputs: unknown, probe: unknown, done: Done): void;
  close(): void;
}

/** another runtime that computes the outputs itself (py-module@1): its engine's id, the options of checkSimSpec, its runner, the
    fields saved beside the values, and its own lines in the view */
export interface ViewHost {
  readonly engine: { readonly id: string };
  readonly check?: unknown;
  runner(E: unknown, spec: unknown, opts: EngineOpts, onFail: (why: string) => void): OutputRunner;
  stateExtra?(): Obj;
  decorate?(root: HTMLElement): void;
}

/** the port of the view: what the core (and the runtimes built on the view) hold */
export interface ViewPort extends RuntimePort {
  values(): Env | null;
  reveal(): void;
  saveSoon(): void;
}

/** the view in box; viewHost: another runtime that computes the outputs (py-module@1) */
export function simView(
  rt: RuntimeHost,
  box: HTMLElement,
  ctx: Pick<MountContext, 'act' | 'init' | 'onMessage' | 'onFail'>,
  viewHost?: ViewHost,
): ViewPort {
  const { act, onMessage, onFail } = ctx;
  const init = ctx.init ?? {};
  const cmp = rt.compute;
  const later = (f: () => void): void => {
    void Promise.resolve().then(f); // never call back before the core holds the port
  };
  let closed = false;
  const out = (type: string, payload?: Obj): void => {
    if (!closed) onMessage(rt.message(type, payload));
  };
  const port: ViewPort = {
    send: () => undefined,
    close: () => {
      closed = true;
    },
    values: () => null,
    reveal: () => undefined,
    saveSoon: () => undefined,
  };
  const tE = (k: string, v?: Readonly<Record<string, string | number>>): string => rt.t(k, v);
  const spec0 = viewHost ? act.spec : withParts(cmp, act.spec);
  const tables = isObj(act.strings) ? act.strings : null;
  const PT = !viewHost && isObj(spec0) && 'parts' in spec0; // several engines in one spec (§12.8)
  const engId: unknown = viewHost ? viewHost.engine.id : PT ? 'parts' : isObj(spec0) && 'engine' in spec0 ? spec0.engine : 'formula@1';
  const E: (SimEngine & { readonly plan?: { readonly parts: readonly Obj[] } }) | { readonly id: string } | null = viewHost
    ? viewHost.engine
    : PT
      ? partsEngine(cmp, spec0)
      : typeof engId === 'string'
        ? cmp.engine(engId)
        : null;
  if (!E) {
    rt.warn('[noema] sim-spec', act.id, 'unknown engine', engId);
    later(() => {
      onFail('unsupported');
    });
    return port;
  }
  const SE = E as Partial<SimEngine> & { readonly id: string; readonly plan?: { readonly parts: readonly Obj[] } };
  if (isObj(spec0) && spec0.bench && !SE.bench) {
    rt.warn('[noema] sim-spec', act.id, 'engine', engId, 'takes no measurements');
    later(() => {
      onFail('unsupported');
    });
    return port;
  }
  const PC = cmp.content();
  const probs = PC
    ? PC.checkSimSpec(spec0, tables, viewHost ? null : cmp.engines(), viewHost ? viewHost.check : undefined)
    : ['the spec checker is not loaded'];
  if (!probs.length && SE.check) {
    try {
      const more: unknown = SE.check(spec0);
      if (Array.isArray(more)) probs.push(...(more as unknown[]).map(String));
    } catch (e) {
      probs.push(String(e instanceof Error ? e.message : e));
    }
  }
  if (probs.length) {
    rt.warn('[noema] sim-spec', act.id, probs.slice(0, 5).join(' | '));
    later(() => {
      onFail('spec');
    });
    return port;
  }
  const spec = spec0 as Spec;

  const T = isObj(init.strings) ? init.strings : {},
    locale = typeof init.locale === 'string' && init.locale ? init.locale : 'en';
  const tt = (k: unknown): string => (typeof k === 'string' && k && Object.prototype.hasOwnProperty.call(T, k) ? String(T[k]) : '');
  const C = (s: string): Compiled => cmp.compile(s);
  const consts: Env = { ...(spec.consts ?? {}) };
  for (const [k, v] of Object.entries(isObj(init.task) ? init.task : {}))
    if (Object.prototype.hasOwnProperty.call(consts, k) && isNum(v)) consts[k] = v;
  const params = spec.params,
    derived = (spec.derived ?? []).map(d => ({ id: d.id, f: C(d.expr) }));
  const readouts = (spec.readouts ?? []).map(r => ({ ...r, f: C(r.expr) }));
  const lim = (v: unknown): Compiled => (typeof v === 'string' ? C(v) : () => v);
  interface PlotState {
    readonly p: Plot;
    readonly xmin: Compiled | null;
    readonly xmax: Compiled | null;
    readonly ymin: Compiled | null;
    readonly ymax: Compiled | null;
    readonly lines: readonly { readonly f: Compiled | null; readonly y?: string; readonly style?: string; readonly label?: string }[];
    readonly marks: readonly { readonly f: Compiled; readonly axis?: string; readonly label?: string }[];
    aria?: string;
    xLabel?: string;
    yLabel?: string;
    holder?: HTMLElement;
    last?: unknown;
  }
  const plots: PlotState[] = (spec.plots ?? []).map(p =>
    p.kind === 'scene' || p.kind === 'sound'
      ? { p, xmin: null, xmax: null, ymin: null, ymax: null, lines: [], marks: [] }
      : {
          p,
          xmin: p.x.min != null ? lim(p.x.min) : null,
          xmax: p.x.max != null ? lim(p.x.max) : null,
          ymin: p.y?.min != null ? lim(p.y.min) : null,
          ymax: p.y?.max != null ? lim(p.y.max) : null,
          lines: (p.series ?? []).map(s => ({ ...s, f: p.kind === 'function' ? C(String(s.expr)) : null })),
          marks: (p.marks ?? []).map(m => ({ ...m, f: C(m.expr) })),
        },
  );
  const ev = (f: Compiled, env: Env): unknown => {
    try {
      return f(env);
    } catch {
      return NaN;
    }
  };

  /* the values: saved state, else the defaults */
  const def = (p: Param): unknown =>
    p.kind === 'toggle' ? !!p.default : p.kind === 'choice' ? (p.default ?? p.options[0]?.value) : p.default;
  const fits = (p: Param, v: unknown): boolean =>
    p.kind === 'toggle'
      ? typeof v === 'boolean'
      : p.kind === 'choice'
        ? p.options.some(o => o.value === v)
        : isNum(v) && v >= p.min && v <= p.max;
  const vals: Env = {};
  const st0 = isObj(init.state) ? init.state : null,
    data0 = st0 && isObj(st0.data) ? st0.data : null,
    saved = data0 && isObj(data0.values) ? data0.values : null;
  for (const p of params) vals[p.id] = saved && fits(p, saved[p.id]) ? saved[p.id] : def(p);
  const num = (id: string): number => vals[id] as number;

  /* ---------- the view ---------- */
  const uid = 'sim' + String(++seq) + '-';
  const root = h('div', { class: 'sim', lang: locale });
  if (spec.title) root.append(h('h4', { class: 'sim-title' }, tt(spec.title)));
  if (spec.intro) root.append(h('p', { class: 'sim-intro' }, tt(spec.intro)));
  const ctl = h('div', { class: 'sim-ctl' });
  interface CtlEls {
    o?: HTMLOutputElement;
    num?: HTMLInputElement;
    rng?: HTMLInputElement | null;
    cb?: HTMLInputElement;
    sel?: HTMLSelectElement;
  }
  const ctlEls: Record<string, CtlEls> = {};
  const snap = (p: Param, v0: number): number => {
    let v = v0;
    if (p.kind === 'number' || p.kind === 'slider') {
      if (p.step) v = p.min + Math.round((v - p.min) / p.step) * p.step;
      else if (p.scale === 'log') {
        const k = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
        v = Math.round(v / k) * k;
      }
      v = Math.min(p.max, Math.max(p.min, +v.toPrecision(12)));
    }
    return v;
  };
  const pos = (p: Param): number =>
    p.scale === 'log' ? Math.round((1000 * Math.log(num(p.id) / p.min)) / Math.log(p.max / p.min)) : num(p.id);
  const fromPos = (p: Param, x: number): number => (p.scale === 'log' ? p.min * Math.pow(p.max / p.min, x / 1000) : x);
  const showVal = (p: Param): string =>
    fmtNum(vals[p.id], { unit: p.unit, format: p.format ?? (p.scale === 'log' ? 'si' : 'auto'), digits: p.digits }, locale);
  for (const p of params) {
    const id = uid + p.id,
      lab = tt(p.label);
    if (p.kind === 'slider' || p.kind === 'number') {
      const o = h('output', { for: id }),
        numEl = h('input', {
          class: 'sim-num',
          type: 'number',
          'data-param': p.id,
          inputmode: 'decimal',
          min: p.min,
          max: p.max,
          step: p.step || 'any',
          'aria-label': lab + (p.unit ? ' (' + p.unit + ')' : ''),
          value: vals[p.id],
        });
      const rng =
        p.kind === 'slider'
          ? h('input', {
              id,
              type: 'range',
              min: p.scale === 'log' ? 0 : p.min,
              max: p.scale === 'log' ? 1000 : p.max,
              step: p.scale === 'log' ? 1 : p.step || 'any',
              value: pos(p),
            })
          : null;
      if (!rng) numEl.id = id;
      const set = (v: number, commit: boolean): void => {
        if (!isNum(v)) return;
        vals[p.id] = snap(p, v);
        paint(p);
        changed(p, commit);
      };
      rng?.addEventListener('input', () => {
        set(fromPos(p, +rng.value), false);
      });
      rng?.addEventListener('change', () => {
        set(fromPos(p, +rng.value), true);
      });
      numEl.addEventListener('input', () => {
        const v = parseFloat(numEl.value);
        if (isNum(v) && v >= p.min && v <= p.max) set(v, false);
      });
      numEl.addEventListener('change', () => {
        const v = parseFloat(numEl.value);
        if (isNum(v)) set(Math.min(p.max, Math.max(p.min, v)), true);
        else paint(p);
      });
      ctlEls[p.id] = { o, num: numEl, rng };
      ctl.append(
        h(
          'div',
          { class: 'sim-p' },
          h('label', { for: id, class: 'sim-lab' }, h('span', {}, lab), o),
          h('div', { class: 'sim-row' }, rng, numEl),
        ),
      );
    } else if (p.kind === 'toggle') {
      const cb = h('input', { id, type: 'checkbox', role: 'switch', 'data-param': p.id });
      cb.addEventListener('change', () => {
        vals[p.id] = cb.checked;
        changed(p, true);
      });
      ctlEls[p.id] = { cb };
      ctl.append(h('div', { class: 'sim-p sim-tog' }, cb, h('label', { for: id }, lab)));
    } else {
      const sel = h(
        'select',
        { id, class: 'sim-sel', 'data-param': p.id },
        p.options.map(o => h('option', { value: String(o.value) }, tt(o.label))),
      );
      sel.addEventListener('change', () => {
        vals[p.id] = p.options[sel.selectedIndex]?.value;
        changed(p, true);
      });
      ctlEls[p.id] = { sel };
      ctl.append(h('div', { class: 'sim-p' }, h('label', { for: id, class: 'sim-lab' }, lab), sel));
    }
  }
  function paint(p: Param): void {
    const c = ctlEls[p.id];
    if (!c) return;
    if (c.o && c.num) {
      c.o.textContent = showVal(p);
      if (document.activeElement !== c.num) c.num.value = String(vals[p.id]);
      if (c.rng) {
        c.rng.value = String(pos(p));
        c.rng.setAttribute('aria-valuetext', showVal(p));
      }
    }
    if (c.cb) c.cb.checked = !!vals[p.id];
    if (c.sel)
      c.sel.selectedIndex = Math.max(
        0,
        p.options.findIndex(o => o.value === vals[p.id]),
      );
  }
  root.append(ctl);
  const ro = readouts.length ? h('dl', { class: 'sim-ro', 'aria-label': tE('engine.act.sim.results'), 'aria-live': 'polite' }) : null;
  const roEls = readouts.map(r => {
    const dd = h('dd', {});
    ro?.append(h('div', {}, h('dt', {}, tt(r.label)), dd));
    return dd;
  });
  if (ro) root.append(ro);
  let outputs: Record<string, unknown> = {};
  const figs = plots.map(P => {
    const p = P.p,
      fig = h('figure', { class: 'sim-plot' + (p.kind === 'scene' ? ' sim-plot-scene' : p.kind === 'sound' ? ' sim-plot-sound' : '') });
    if (p.kind === 'scene' || p.kind === 'sound') {
      // a drawing / a sound of the engine library
      P.aria = (p.title ? tt(p.title) + '. ' : '') + tE(p.kind === 'scene' ? 'engine.act.sim.scene' : 'engine.act.sim.sound');
      if (p.title) fig.append(h('figcaption', {}, tt(p.title)));
      const holder = h('div', { class: 'sim-svg' });
      P.holder = holder;
      fig.append(holder);
      if (p.kind === 'sound') {
        let stop: (() => void) | null = null;
        const of = String(p.of);
        const b: HTMLButtonElement = h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            'data-sound': p.of,
            'aria-label': P.aria,
            onclick: () => {
              if (stop) {
                stop();
                stop = null;
                b.textContent = '▶ ' + tE('engine.act.sim.play');
                return;
              }
              const snd = outputs[of];
              stop = playSound(snd);
              b.textContent = '■ ' + tE('engine.act.sim.stop');
              const notes = isObj(snd) && Array.isArray(snd.notes) ? (snd.notes as unknown[]) : [];
              const dur = Math.max(0, ...notes.map(n => (isObj(n) ? (Number(n.t) || 0) + (Number(n.d) || 0) : 0)));
              setTimeout(
                () => {
                  if (stop) {
                    stop = null;
                    b.textContent = '▶ ' + tE('engine.act.sim.play');
                  }
                },
                Math.min(60, dur) * 1000 + 200,
              );
            },
          },
          '▶ ' + tE('engine.act.sim.play'),
        );
        holder.append(b);
      }
      root.append(fig);
      return fig;
    }
    const axisLab = (a: Plot['x'] | undefined): string =>
      a?.label ? tt(a.label) + (a.unit ? ' (' + a.unit + ')' : '') : a?.unit ? a.unit : '';
    P.xLabel = axisLab(p.x);
    P.yLabel = axisLab(p.y);
    P.aria = (p.title ? tt(p.title) + '. ' : '') + tE('engine.act.sim.plot', { y: P.yLabel || '—', x: P.xLabel || '—' });
    if (p.title) fig.append(h('figcaption', {}, tt(p.title)));
    const holder = h('div', { class: 'sim-svg' });
    P.holder = holder;
    fig.append(holder);
    const named = P.lines.filter(l => l.label);
    if (named.length)
      fig.append(
        h(
          'div',
          { class: 'sim-leg', 'aria-hidden': 'true' },
          P.lines.map((l, j) =>
            l.label
              ? h(
                  'span',
                  {},
                  h('i', {
                    class: 'sim-sw',
                    style: { borderTopColor: COLORS[j % COLORS.length], borderTopStyle: DASH[j % DASH.length] ? 'dashed' : 'solid' },
                  }),
                  tt(l.label),
                )
              : null,
          ),
        ),
      );
    root.append(fig);
    return fig;
  });
  const busyNote = h('div', { class: 'sim-busy', 'aria-hidden': 'true' });
  const reset = h(
    'button',
    {
      class: 'btn ghost small',
      type: 'button',
      onclick: () => {
        for (const p of params) {
          vals[p.id] = def(p);
          paint(p);
        }
        out('event', { name: 'reset' });
        recompute();
        saveSoon();
      },
    },
    '↺ ' + tE('engine.act.sim.reset'),
  );

  /* ---------- computing ---------- */
  let env: Env = {},
    paused = false,
    dirty = false,
    saveT: ReturnType<typeof setTimeout> | undefined,
    raf = 0,
    rev = 0,
    doneRev = 0;
  const prep: (e: Env) => unknown = typeof SE.prepare === 'function' ? SE.prepare(spec, C) : (x: Env): unknown => x; // the engine's expressions → numbers, on this thread
  function base(): Env {
    const e: Env = { ...consts };
    for (const p of params) e[p.id] = vals[p.id];
    for (const d of derived) e[d.id] = ev(d.f, e);
    return e;
  }
  // a fault-finding bench (§12.7): instruments, the measurement log, the diagnosis
  let runner: OutputRunner | null = null;
  const B: BenchView | null = spec.bench
    ? makeBench({
        rt,
        spec,
        bench: spec.bench,
        init,
        uid,
        locale,
        tt,
        compile: C,
        base,
        prep,
        out,
        saveSoon: () => {
          saveSoon();
        },
        recompute: () => {
          recompute();
        },
        runner: () => runner,
        renew: () => {
          runner?.close();
          runner = newRunner();
        },
        closed: () => closed,
      })
    : null;
  if (B) root.append(B.el);
  const partsNote = PT ? h('p', { class: 'sim-note', 'aria-live': 'polite', hidden: true }) : null; // a loop that did not settle, a part that failed
  if (partsNote) root.append(partsNote);
  root.append(h('div', { class: 'sim-foot' }, busyNote, reset));
  viewHost?.decorate?.(root);
  box.append(root);

  function newRunner(): OutputRunner | null {
    if (SE.id === 'formula@1') return null;
    const o: EngineOpts = { seed: Number(init.seed) >>> 0, task: { ...consts }, ...(B ? { faults: B.applied() } : {}) };
    const fail = (why: string): void => {
      onFail(why);
    };
    if (viewHost) return viewHost.runner(E, spec, o, fail);
    if (PT) {
      const r = partsRunner(rt, spec as unknown as Obj, o, fail);
      return {
        run: (inputs, done) => {
          r.run(inputs as Env, done);
        },
        measure: (inputs, probe, done) => {
          r.measure(inputs as Env, probe, done);
        },
        close: () => {
          r.close();
        },
      };
    }
    return engineRunner(E as SimEngine, spec, o, fail, (...w) => {
      rt.warn(...w);
    });
  }
  runner = newRunner();
  const cosimTime: { id: string; kind: string }[] = (() => {
    if (!PT || !isObj(spec.couple) || !isObj(spec.couple.cosim) || typeof spec.couple.cosim.time !== 'string') return [];
    return [{ id: spec.couple.cosim.time, kind: 'series' }]; // the co-simulation's time series
  })();
  const declared: readonly { id: string; kind?: string }[] = PT
    ? (SE.plan?.parts ?? [])
        .flatMap(p =>
          (Array.isArray(p.outputs) ? (p.outputs as unknown[]) : []).filter(
            (o): o is { id: string; kind?: string } => isObj(o) && typeof o.id === 'string',
          ),
        )
        .concat(cosimTime)
    : (spec.outputs ?? []);

  function cleanOutputs(o: unknown): Record<string, unknown> {
    const r: Record<string, unknown> = {};
    for (const d of declared) {
      const v = isObj(o) ? o[d.id] : undefined;
      if (d.kind === 'scalar') r[d.id] = isNum(v) || typeof v === 'boolean' ? v : NaN;
      else if (d.kind === 'scene') r[d.id] = isObj(v) && Array.isArray(v.items) ? v : { view: [-1, 1, -1, 1], items: [] };
      else if (d.kind === 'sound') r[d.id] = isObj(v) && Array.isArray(v.notes) ? v : { notes: [] };
      else {
        let a: number[] = Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v as ArrayLike<unknown>, x => Number(x)) : [];
        if (a.length > MAX_POINTS) {
          const k = a.length / MAX_POINTS,
            src = a;
          a = Array.from({ length: MAX_POINTS }, (_, i) => src[Math.floor(i * k)] ?? NaN);
        }
        r[d.id] = a;
      }
    }
    return r;
  }
  function recompute(): void {
    if (closed) return;
    if (paused) {
      dirty = true;
      return;
    }
    const e = base(),
      my = ++rev; // values() is null until the latest inputs are computed (Check never grades older results)
    if (!runner) {
      env = e;
      doneRev = my;
      render();
      return;
    }
    busyNote.textContent = tE('engine.act.sim.computing');
    runner.run(prep(e), o0 => {
      if (closed) return;
      let o = o0;
      if (PT) {
        // {outputs, env, codes}: the derived values computed in the plan's order
        const r = (isObj(o) ? o : {}) as Partial<PartsResult>,
          codes = Array.isArray(r.codes) ? r.codes : [];
        for (const d of derived) if (r.env && d.id in r.env) e[d.id] = r.env[d.id];
        o = r.outputs;
        const msg = [
          codes.some(c => c.code === 'no-converge') ? tE('engine.act.sim.noConverge') : '',
          codes.some(c => c.code === 'part-failed') || !r.outputs ? tE('engine.act.sim.partFailed') : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (partsNote) {
          partsNote.textContent = msg;
          partsNote.hidden = !msg;
        }
      }
      outputs = cleanOutputs(o);
      for (const d of declared) if (d.kind === 'scalar') e[d.id] = outputs[d.id];
      env = e;
      if (my === rev) {
        doneRev = my;
        busyNote.textContent = '';
      }
      render();
    });
  }
  const evN = (f: Compiled | null, e: Env): unknown => (f ? ev(f, e) : NaN);
  function render(): void {
    readouts.forEach((r, i) => {
      const el = roEls[i];
      if (el) el.textContent = fmtNum(ev(r.f, env), r, locale);
    });
    plots.forEach((P, i) => {
      const fig = figs[i],
        holder = P.holder;
      if (P.p.kind === 'sound' || !fig || !holder) return;
      if (P.p.kind === 'scene') {
        P.last = outputs[String(P.p.of)];
        holder.replaceChildren(drawScene(fig, P.p, P.last, { locale, aria: P.aria ?? '', tt }));
        return;
      }
      const p = P.p,
        data: PlotData = {
          xs: [],
          lines: [],
          marks: P.marks.map(m => ({ axis: m.axis, v: ev(m.f, env), label: m.label ? tt(m.label) : '' })),
          xr: [0, 1],
          yr: [P.ymin ? ev(P.ymin, env) : null, P.ymax ? ev(P.ymax, env) : null],
        };
      if (p.kind === 'function') {
        const a = evN(P.xmin, env) as number,
          b = evN(P.xmax, env) as number,
          n = Math.min(MAX_POINTS, p.points || 200),
          lg = p.x.scale === 'log' && a > 0 && b > 0;
        data.xr = [a, b];
        data.xs = Array.from({ length: n }, (_, k) => (lg ? a * Math.pow(b / a, k / (n - 1)) : a + ((b - a) * k) / (n - 1)));
        const e2: Env = { ...env };
        const xv = String(p.x.var);
        data.lines = P.lines.map(l => ({
          style: l.style,
          ys: data.xs.map(x => {
            e2[xv] = x;
            const v = l.f ? ev(l.f, e2) : NaN;
            return typeof v === 'boolean' ? +v : v;
          }),
        }));
      } else {
        const xs0 = outputs[String(p.x.series)];
        data.xs = Array.isArray(xs0) ? (xs0 as unknown[]) : [];
        let lo = Infinity,
          hi = -Infinity;
        for (const v of data.xs)
          if (isNum(v)) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        data.xr = [P.xmin ? ev(P.xmin, env) : isFinite(lo) ? lo : 0, P.xmax ? ev(P.xmax, env) : isFinite(hi) ? hi : 1];
        data.lines = P.lines.map(l => {
          const ys = outputs[String(l.y)];
          return { style: l.style, ys: Array.isArray(ys) ? (ys as unknown[]) : [] };
        });
      }
      P.last = data;
      holder.replaceChildren(drawPlot(fig, p, data, { locale, aria: P.aria ?? '', xLabel: P.xLabel ?? '', yLabel: P.yLabel ?? '' }));
    });
  }
  function saveSoon(): void {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const bs = B?.state();
      out('state', {
        version: Number(init.stateVersion) || 1,
        data: { values: { ...vals }, ...(bs ? { bench: bs } : {}), ...(viewHost?.stateExtra?.() ?? {}) },
      });
    }, 250);
  }
  function changed(p: Param, commit: boolean): void {
    recompute();
    saveSoon();
    if (commit) out('event', { name: 'param', data: { id: p.id, v: vals[p.id] } });
  }
  const redraw = (): void => {
    plots.forEach((P, i) => {
      const fig = figs[i];
      if (P.last === undefined || P.p.kind === 'sound' || !fig || !P.holder) return;
      P.holder.replaceChildren(
        P.p.kind === 'scene'
          ? drawScene(fig, P.p, P.last, { locale, aria: P.aria ?? '', tt })
          : drawPlot(fig, P.p, P.last as PlotData, {
              locale,
              aria: P.aria ?? '',
              xLabel: P.xLabel ?? '',
              yLabel: P.yLabel ?? '',
            }),
      );
    });
    B?.redraw();
  };
  const ro2 =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            if (!closed && !paused) redraw();
          });
        })
      : null;
  ro2?.observe(root);
  for (const p of params) paint(p);
  recompute();

  port.send = type => {
    if (closed) return;
    if (type === 'ping') {
      later(() => {
        out('pong');
      });
      return;
    }
    if (type === 'pause') {
      paused = true;
      return;
    }
    if (type === 'resume') {
      paused = false;
      if (dirty) {
        dirty = false;
        recompute();
      }
      return;
    }
    if (type === 'destroy') port.close();
  };
  port.close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(saveT);
    cancelAnimationFrame(raf);
    ro2?.disconnect();
    runner?.close();
    root.remove();
  };
  // what the checks grader reads: the values once the latest inputs are computed (and a bench's own, once a diagnosis is chosen:
  // before that Check waits)
  port.values = () => (closed || doneRev !== rev ? null : B ? (B.ready() ? { ...env, ...B.values() } : null) : { ...env });
  port.reveal = () => {
    if (!closed) B?.reveal(); // after Check: the bench says what the fault was
  };
  port.saveSoon = saveSoon;
  later(() => {
    out('ready', { protocols: [1] });
  });
  return port;
}
