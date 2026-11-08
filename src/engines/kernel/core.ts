/* ===================== interactive activities — the shared core of the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md §1) =====================
   The library engines (ode@1, prob@1, graph@1, geom@1 …: src/engines/<name>/) are GENERAL engines: each covers a whole family of subjects
   (any system of equations, any distribution, any graph, any construction) instead of one domain. They share this core — the
   hexagon's inner ring:
     • the model checker: a declarative table walked with the same codes and messages as the golden outputs of its former Python twin's walk (tests/fixtures/parity/enginelib.json),
     • numbers that may be expressions over the spec's names (`numx`), compiled with the app's NoemaExpr in the engine itself,
     • seeded randomness (mulberry32), statistics of a series (final, min, max, mean, pp, rms), thinning to the plot limit,
     • scenes: the drawings an engine returns (points, segments, circles, polygons, labels) for a plot of kind `scene`,
     • the adapter port: makeEngine(def) turns {id, checkSpec, run} into the {id, check, create, workerSource} that ACT.registerEngine
       takes (the same shape as circuit-mna@1 and the P6 engines); every run goes to a Worker that runs the engine's Worker bundle
       (esbuild: NoemaExpr, this core and the engine module, the same code as on the page; src/engines/plugins.ts).
   No DOM, no learner text: codes and numbers only. Tests: node tests/enginelib.js. */
import NoemaExpr from './simexpr.ts';
import NoemaSimKit from './simkit.ts';
import type { Stream } from './simkit.ts';
import { textOf } from '../../kernel/text.ts';
import type { Inputs, CreateOptions, EngineCore, EngineInstance, Problem, SimEngine, Spec, StepResult } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes, keys and numbers leave this module

/** a plain object of a spec (data from outside: every field is checked where it is read) */
export type Rec = Readonly<Record<string, unknown>>;
/** a node of a model table: a kind (with a trailing "!" when required) or a shape */
export type TableNode = string | Shape;
export interface Shape {
  readonly $obj?: Table;
  readonly $list?: TableNode;
  readonly $map?: TableNode;
  readonly min?: number;
  readonly max?: number;
  readonly $req?: boolean;
}
/** a model table: its fields by name */
export type Table = Readonly<Record<string, TableNode>>;
/** a writer of problems: E (an error) or W (a warning) */
export type Emit = (code: string, path: string, msg: string) => void;
/** the numbers of a run: the spec's consts, params and derived values */
export type Env = Readonly<Record<string, number | boolean>>;
/** an output of the spec after checkOutputs' common checks: its kind is one the engine computes and its `of` a text */
export type CheckedOutput = Rec & { readonly kind: string; readonly of: string };
export type { Stream } from './simkit.ts';
/** an error of the core with its code */
export type CoreError = Error & { code: string } & Record<string, unknown>;

const MAX_POINTS = 2000,
  MAX_SCENE = 2000;
const isObj = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
/** has(o, k): k is an own key of o (any k: hasOwnProperty turns it into a key) */
const has = (o: object, k: unknown) => Object.prototype.hasOwnProperty.call(o, k as PropertyKey);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/; // ids of model parts (nodes, objects, states)
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/; // names an expression can use (variables of an ODE)
const KEY_RE = /^[a-z][a-zA-Z0-9_.-]{0,63}$/; // keys of the activity's string tables (= packcheck ACT.KEY_RE)
const RESERVED = ['t', 'n', 'pi', 'e', 'true', 'false'];
function fail(code: string, extra?: Rec | null): CoreError {
  const e = new Error('enginelib: ' + code) as CoreError;
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

/* ---------- the model checker: a table of kinds, walked like rf@1's (the same messages as the former Python twin (tests/fixtures/parity/enginelib.json)) ----------
     kinds: pos · nonneg · fin · unit (0–1) · bool · int:a:b · enum:a|b · id · name · key · expr (a non-empty text) ·
            numx (a number or an expression) · ref (an id, resolved by the engine); a trailing "!" = required.
     shapes: {$obj: T} · {$list: T or kind, min?, max} · {$map: kind, max} (an object of names → kind) */
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function checkKind(kind: string, v: unknown): boolean {
  if (kind === 'bool') return typeof v === 'boolean';
  if (kind === 'id' || kind === 'ref') return typeof v === 'string' && ID_RE.test(v);
  if (kind === 'name') return typeof v === 'string' && NAME_RE.test(v) && !RESERVED.includes(v);
  if (kind === 'key') return typeof v === 'string' && KEY_RE.test(v);
  if (kind === 'expr') return typeof v === 'string' && v.trim() !== '';
  if (kind === 'numx') return isNum(v) || (typeof v === 'string' && v.trim() !== '');
  if (kind.startsWith('int:')) {
    const [, a, b] = kind.split(':');
    return typeof v === 'number' && Number.isInteger(v) && v >= +a! && v <= +b!;
  }
  if (kind.startsWith('enum:')) return typeof v === 'string' && kind.slice(5).split('|').includes(v);
  if (!isNum(v)) return false;
  return kind === 'pos' ? v > 0 : kind === 'nonneg' ? v >= 0 : kind === 'unit' ? v >= 0 && v <= 1 : true;
}
const KIND_MSG: Readonly<Record<string, string | undefined>> = {
  pos: 'needs a number > 0',
  nonneg: 'needs a number >= 0',
  unit: 'needs a number from 0 to 1',
  fin: 'needs a number',
};
function kindMsg(kind: string): string | undefined {
  if (kind === 'bool') return 'needs true or false';
  if (kind === 'id' || kind === 'ref') return 'needs an id (a letter, then letters, digits, _ or -; at most 32)';
  if (kind === 'name') return 'needs a name (a letter or _, then letters, digits, _; not t, n, pi, e, true or false)';
  if (kind === 'key') return 'needs a key of the string tables';
  if (kind === 'expr') return 'needs an expression';
  if (kind === 'numx') return 'needs a number or an expression';
  if (kind.startsWith('int:')) {
    const [, a, b] = kind.split(':');
    return `needs an integer from ${a!} to ${b!}`;
  }
  if (kind.startsWith('enum:')) return 'one of ' + kind.slice(5).split('|').join(', ');
  return KIND_MSG[kind];
}
const join = (p: string, k: string) => (p ? p + '.' + k : k);
function walkValue(v: unknown, kd: TableNode, p: string, E: Emit, W: Emit): void {
  if (typeof kd === 'string') {
    if (!checkKind(kd, v)) E(kd.startsWith('enum:') ? 'enum' : 'value', p, kindMsg(kd)!);
  } else if (kd.$obj) walk(v, kd.$obj, p, E, W);
  else if (kd.$map) {
    if (!isObj(v)) {
      E('format', p, 'not an object');
      return;
    }
    const ks = Object.keys(v);
    if (ks.length > kd.max!) {
      E('size', p, `more than ${kd.max!} items`);
      return;
    }
    for (const k of ks) {
      if (!checkKind('name', k)) E('value', join(p, k), kindMsg('name')!);
      else walkValue(v[k], kd.$map, join(p, k), E, W);
    }
  } else if (!Array.isArray(v)) E('format', p, 'not an array');
  else if (v.length > kd.max!) E('size', p, `more than ${kd.max!} items`);
  else if (kd.min && v.length < kd.min) E('size', p, `fewer than ${kd.min} items`);
  else
    v.forEach((x: unknown, i) => {
      walkValue(x, kd.$list!, `${p}[${i}]`, E, W);
    });
}
/** walk(o, T, path, E, W): E(code, path, msg) an error, W(code, path, msg) a warning; codes format, value, enum, size, unknown-field */
function walk(o: unknown, T: Table, path: string, E: Emit, W: Emit): void {
  if (!isObj(o)) {
    E('format', path, 'not an object');
    return;
  }
  for (const k of Object.keys(o)) if (!has(T, k) && k !== 'meta') W('unknown-field', join(path, k), 'ignored');
  for (const k of Object.keys(T)) {
    let kd = T[k]!;
    const p = join(path, k),
      v = o[k];
    if (typeof kd === 'string') {
      const must = kd.endsWith('!');
      kd = must ? kd.slice(0, -1) : kd;
      if (v === undefined) {
        if (must) E('value', p, 'missing');
        continue;
      }
    } else if (kd.$req) {
      if (v === undefined) {
        E('value', p, 'missing');
        continue;
      }
    } else if (v === undefined) continue;
    walkValue(v, kd, p, E, W);
  }
}
/** a problem list with its two writers: const { P, E, W } = problems() */
function problems(): { P: Problem[]; E: Emit; W: Emit } {
  const P: Problem[] = [];
  return {
    P,
    E: (code, path, msg) => {
      P.push({ code, path, msg, level: 'error' });
    },
    W: (code, path, msg) => {
      P.push({ code, path, msg, level: 'warning' });
    },
  };
}
const hasErrors = (P: readonly Problem[]) => P.some(p => p.level === 'error');

/** an output whose kind is a text (one of the engine's kinds, checked before) and whose `of` is a non-empty text */
const isOutput = (o: Rec): o is CheckedOutput => typeof o.kind === 'string' && typeof o.of === 'string' && o.of !== '';
/** the common part of every library engine's outputs: [{id, kind: scalar | series | scene, of, …}]; each output's own fields are
      checked by the engine's `out(o, at, E, W)` → false when the output is not one the engine computes */
function checkOutputs(
  spec: unknown,
  id: string,
  kinds: readonly unknown[],
  out: (o: CheckedOutput, at: string, E: Emit, W: Emit) => unknown,
  E: Emit,
  W: Emit,
): void {
  const outs = isObj(spec) ? spec.outputs : undefined;
  if (!Array.isArray(outs)) {
    E('format', 'outputs', 'not an array');
    return;
  }
  outs.forEach((o: unknown, i) => {
    const at = `outputs[${i}]`;
    if (!isObj(o)) {
      E('output', at, 'not an object');
      return;
    }
    if (!kinds.includes(o.kind)) {
      E('output', at + '.kind', 'one of ' + kinds.join(', '));
      return;
    }
    if (!isOutput(o)) {
      E('output', at + '.of', 'names what ' + id + ' computes');
      return;
    }
    out(o, at, E, W);
  });
}

/* ---------- numbers ---------- */
const STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'];
/** the statistics of a series */
export interface Stats {
  final: number;
  min: number;
  max: number;
  mean: number;
  pp: number;
  rms: number;
}
/** stats(values) → {final, min, max, mean, pp, rms} over the finite values (NaN when there are none) */
function stats(a: Iterable<number>): Stats {
  let n = 0,
    s = 0,
    s2 = 0,
    lo = Infinity,
    hi = -Infinity,
    last = NaN;
  for (const v of a)
    if (Number.isFinite(v)) {
      n++;
      s += v;
      s2 += v * v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      last = v;
    }
  if (!n) return { final: NaN, min: NaN, max: NaN, mean: NaN, pp: NaN, rms: NaN };
  return { final: last, min: lo, max: hi, mean: s / n, pp: hi - lo, rms: Math.sqrt(s2 / n) };
}
/** thin(values, n) → at most n values, evenly picked (the first and the last kept) */
function thin<T>(a: readonly T[], n?: number): T[] {
  n = n || MAX_POINTS;
  if (a.length <= n) return a.slice();
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(a[Math.round((i * (a.length - 1)) / (n - 1))]!);
  return out;
}
/** seeded randomness: the same seed draws the same numbers on every device */
function hash32(s: string, seed: number) {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => {
  const u = Math.max(r(), 1e-300),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* ---------- expressions: compiled once per run with the app's NoemaExpr (the same evaluator as the spec's formulas) ---------- */
/** a number of a model as a function of the run's names */
export type NumFn = (env?: Rec | null) => number;
/** cx(v) → (env) => number: a number stays a number; a text is a NoemaExpr formula (a failing one gives NaN, never throws) */
function cx(v: unknown): NumFn {
  if (typeof v === 'number') return () => v;
  if (typeof v === 'boolean') return () => +v;
  if (typeof v !== 'string') return () => NaN;
  let f: ReturnType<typeof NoemaExpr.compile>;
  try {
    f = NoemaExpr.compile(v);
  } catch {
    return () => NaN;
  }
  return env => {
    try {
      const r = f(env);
      return typeof r === 'boolean' ? +r : r;
    } catch {
      return NaN;
    }
  };
}

/* ---------- scenes: what a plot of kind `scene` draws (src/runtimes/sim-spec/plot.ts drawScene) ----------
     {view: [x0, x1, y0, y1], items: [
        {k: 'pt',   x, y, r?, c?, key?, v?}                 a point (r in px; key: a label key of the string tables; v: a number shown)
        {k: 'seg',  x1, y1, x2, y2, c?, arrow?, w?, dash?, key?, v?}   a segment / an arrow (w: width in px)
        {k: 'circ', x, y, r, c?, fill?, dash?}              a circle (r in model units)
        {k: 'poly', pts: [x, y, x, y, …], c?, fill?, closed?, dash?}
        {k: 'txt',  x, y, key?, v?, c?} ]}                  a label at a place
     c is a role, never a colour: base · muted · hi · ok · bad · warn · info (the theme maps it); y grows upwards. */
const ROLES = ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'];
/** the view of a scene: [x0, x1, y0, y1] */
export type View = number[];
/** the options of a scene item (a role, a label key, a number shown, a width, a dash…) */
export type ItemOpts = Readonly<Record<string, unknown>> | null | undefined;
/** an item of a scene */
export type SceneItem = Readonly<Record<string, unknown>> & { readonly k: 'pt' | 'seg' | 'circ' | 'poly' | 'txt' };
/** a finished scene: what a plot of kind `scene` draws */
export interface SceneData {
  view: View;
  items: SceneItem[];
}
/** a scene being drawn */
export interface Scene {
  readonly items: SceneItem[];
  readonly view: View;
  pt(x: number, y: number, o?: ItemOpts): void;
  seg(x1: number, y1: number, x2: number, y2: number, o?: ItemOpts): void;
  circ(x: number, y: number, r: number, o?: ItemOpts): void;
  poly(pts: number[], o?: ItemOpts): void;
  txt(x: number, y: number, o?: ItemOpts): void;
  done(): SceneData;
}
function scene(view: View): Scene {
  const items: SceneItem[] = [];
  const fin = (...a: number[]) => a.every(Number.isFinite);
  const push = (it: SceneItem) => {
    if (items.length < MAX_SCENE) items.push(it);
  };
  return {
    items,
    view,
    pt(x, y, o) {
      if (fin(x, y)) push({ k: 'pt', x, y, ...(o || {}) });
    },
    seg(x1, y1, x2, y2, o) {
      if (fin(x1, y1, x2, y2)) push({ k: 'seg', x1, y1, x2, y2, ...(o || {}) });
    },
    circ(x, y, r, o) {
      if (fin(x, y, r) && r >= 0) push({ k: 'circ', x, y, r, ...(o || {}) });
    },
    poly(pts, o) {
      if (pts.length >= 4 && pts.every(Number.isFinite)) push({ k: 'poly', pts, ...(o || {}) });
    },
    txt(x, y, o) {
      if (fin(x, y)) push({ k: 'txt', x, y, ...(o || {}) });
    },
    done() {
      return { view: view.slice(), items: items.slice() };
    },
  };
}
/** the bounding view [x0, x1, y0, y1] of points with a margin (never empty) */
function fitView(xs: ArrayLike<number>, ys: ArrayLike<number>, margin?: number | null): [number, number, number, number] {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (let i = 0; i < xs.length; i++)
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) {
      x0 = Math.min(x0, xs[i]!);
      x1 = Math.max(x1, xs[i]!);
      y0 = Math.min(y0, ys[i]!);
      y1 = Math.max(y1, ys[i]!);
    }
  if (!Number.isFinite(x0)) return [-1, 1, -1, 1];
  const w = Math.max(x1 - x0, y1 - y0, 1e-9),
    m = (margin == null ? 0.12 : margin) * w;
  return [x0 - m, x1 + m, y0 - m, y1 + m];
}

/* ---------- the adapter port: an engine of the library → what ACT.registerEngine takes ----------
     def = { id, global (its window name), checkSpec(spec) → problems, run(spec, env, {seed}) → {scalars, series, scenes}, module (the
     engine module's function, for the Worker) }. The worker gets the spec once and then the inputs (consts, params, derived) of each
     run; outputs are picked by the spec's outputs: scalar → a number, series → an array (≤ 2000), scene → a scene object, sound → {notes, wave?, partials?}. */
/** what an engine's run gives: its outputs by id */
export interface RunResult {
  readonly out?: Readonly<Record<string, unknown>>;
}
/** the options of a run: the seed, the prepared model and the series inputs of a part */
export interface RunOpts<P = unknown> {
  readonly seed: number;
  readonly prepared: P | null;
  readonly series?: Readonly<Record<string, unknown[]>>;
}
/** the context of a stepped part */
export interface StepCtx<P = unknown> {
  readonly spec: Spec;
  readonly seed: number;
  readonly prepared: P | null;
  readonly id: string;
  t0: number;
  readonly rand: () => number;
}
/** a step of a part as the engine gives it */
export type CoreStep<S> = {
  readonly state?: S | undefined;
  readonly out?: unknown;
  readonly dt?: number | undefined;
  readonly events?: unknown;
  readonly fail?: unknown;
};
/** the stepper of an engine (docs/INTERACTIVE_LIBRARY.md §1.6) */
export interface CoreStepper<S = unknown, P = unknown> {
  init(model: unknown, inputs: Readonly<Record<string, number | boolean>>, ctx: StepCtx<P>): S | null | undefined;
  step(
    state: S,
    inputs: Readonly<Record<string, number | boolean>>,
    t: number,
    dt: number,
    ctx: StepCtx<P>,
  ): CoreStep<S> | null | undefined;
  readonly snapshot?: ((state: S) => unknown) | null | undefined;
  readonly restore?: ((snap: unknown) => S) | null | undefined;
  readonly output?: ((state: S, ctx: StepCtx<P>) => unknown) | null | undefined;
  readonly onEvent?: ((state: S, ev: unknown, t: number) => S | undefined) | null | undefined;
}
/** an engine of the library as its module defines it (makeEngine's def) */
export interface EngineDef<P = unknown, S = unknown> {
  readonly id: string;
  checkSpec(spec: Spec): Problem[];
  run(spec: Spec, env: Readonly<Record<string, number | boolean>>, opts: RunOpts<P>): RunResult | null | undefined;
  readonly prepare?: ((spec: Spec) => P) | undefined;
  readonly scenes?: boolean | undefined;
  readonly stepper?: CoreStepper<S, P> | undefined;
}
function pick(spec: Spec | null | undefined, res: RunResult | null | undefined): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const o of ((spec && spec.outputs) || []) as readonly (Rec | null)[]) {
    if (!o || typeof o.id !== 'string') continue;
    const v = res && res.out ? res.out[o.id] : undefined;
    if (o.kind === 'series') r[o.id] = Array.isArray(v) ? thin(v, MAX_POINTS) : [];
    else if (o.kind === 'scene') r[o.id] = isObj(v) ? v : { view: [-1, 1, -1, 1], items: [] };
    else if (o.kind === 'sound')
      r[o.id] = isObj(v) && Array.isArray(v.notes) ? { ...v, notes: (v.notes as unknown[]).slice(0, 512) } : { notes: [] }; // ≤ 512 notes (docs/INTERACTIVE_LIBRARY.md §1.4)
    else r[o.id] = typeof v === 'number' || typeof v === 'boolean' ? v : NaN;
  }
  return r;
}
/* ---------- the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): an engine that evolves in time can be stepped by the parts orchestrator ----------
     def.stepper = { init(model, inputs, ctx) → state,
                     step(state, inputs, t, dt, ctx) → { state, out: {outputId: value}, dt? (taken ≤ dt: an early stop), events?: [{t, kind, data, to?}], fail?: code },
                     snapshot?(state) → copy, restore?(copy) → state (default: a deep copy of plain data; null = cannot be iterated),
                     output?(state, ctx) → out (the outputs at the start), onEvent?(state, ev, t) → state (an event of another part) }
     ctx = { spec, seed, prepared, id, t0, rand (a seeded stream of this part) }. inputs: the part's numbers (consts, params, its inputs), held
     over the step. out: the spec's output ids → a number (a scalar now; a series output collects one sample per step), an array (kept
     whole), a scene or a sound. The same signature as NoemaSimKit.stepper / cosim (src/engines/kernel/simkit.ts). Pure, bounded, never throws. */
const copyData = (v: unknown): unknown => {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return (v as Float64Array).slice();
  if (Array.isArray(v)) return v.map(copyData);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v)) o[k] = copyData((v as Rec)[k]);
  return o;
};
/** only the declared outputs of a step (arrays thinned to the plot limit) */
function pickStep(spec: Spec | null | undefined, out: unknown): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (!isObj(out)) return r;
  for (const o of ((spec && spec.outputs) || []) as readonly (Rec | null)[]) {
    if (!o || typeof o.id !== 'string' || !has(out, o.id)) continue;
    const v = out[o.id];
    r[o.id] =
      Array.isArray(v) || ArrayBuffer.isView(v)
        ? thin(Array.from(v as ArrayLike<unknown>), MAX_POINTS)
        : typeof v === 'number' || typeof v === 'boolean'
          ? v
          : isObj(v)
            ? v
            : NaN;
  }
  return r;
}
/** the stepping side of an instance: init / step / snapshot / restore over one state (what the Worker's step messages call) */
function stepInstance<P, S>(def: EngineDef<P, S>, spec: Spec, seed: number, prepared: P | null) {
  const S = def.stepper!,
    snaps: unknown[] = [];
  let state = null as S | null,
    ok = false;
  const ctx: StepCtx<P> = { spec, seed, prepared, id: def.id, t0: 0, rand: mulberry32(hash32(def.id + ':step', seed)) };
  const scal = (inp: Rec | null | undefined) => {
    const env: Record<string, number | boolean> = {};
    for (const [k, v] of Object.entries(inp || {})) if (typeof v === 'number' || typeof v === 'boolean') env[k] = v;
    return env;
  };
  return {
    stepInit(inp: Rec | null | undefined, t0: number): StepResult {
      ctx.t0 = Number.isFinite(t0) ? t0 : 0;
      snaps.length = 0;
      try {
        state = S.init(spec.model, scal(inp), ctx) as S | null;
        ok = state !== undefined && state !== null;
      } catch {
        state = null;
        ok = false;
      }
      if (!ok) return { fail: 'part-failed', out: {} };
      let o: unknown = {};
      try {
        o = S.output ? S.output(state as S, ctx) || {} : {};
      } catch {
        o = {};
      }
      return { out: pickStep(spec, o) };
    },
    stepTo(inp: Rec | null | undefined, t: number, dt: number, inbox?: readonly unknown[]): StepResult {
      if (!ok) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
      if (S.onEvent)
        for (const ev of Array.isArray(inbox) ? inbox : []) {
          let s2;
          try {
            s2 = S.onEvent(state as S, ev, t);
          } catch {
            s2 = undefined; /* a handler that throws drops the event */
          }
          if (s2 !== undefined) state = s2;
        }
      let r = null;
      try {
        r = S.step(state as S, scal(inp), t, dt, ctx);
      } catch {
        r = null;
      }
      if (!isObj(r)) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
      if (r.state !== undefined) state = r.state;
      const taken = Number.isFinite(r.dt) ? Math.max(0, Math.min(r.dt!, dt)) : dt;
      const evs = ((Array.isArray(r.events) ? r.events : []) as unknown[])
        .filter(isObj)
        .slice(0, 256)
        .map(e => ({
          t: Number.isFinite(e.t) ? e.t : t + taken,
          kind: textOf(e.kind != null ? e.kind : e.name || ''),
          data: e.data === undefined ? null : e.data,
          ...(Array.isArray(e.to) ? { to: e.to.map(String) } : {}),
          ...(Number.isFinite(e.prio) ? { prio: e.prio } : {}),
        }));
      return { out: pickStep(spec, r.out), dt: taken, events: evs, ...(r.fail ? { fail: textOf(r.fail) } : {}) };
    },
    snapshot(): number {
      if (!ok || S.snapshot === null) return -1;
      let c;
      try {
        c = S.snapshot ? S.snapshot(state as S) : copyData(state);
      } catch {
        return -1;
      }
      snaps.length = 0;
      snaps.push(c);
      return 0; // one slot: the master snapshots at the start of a macro step and may go back to it
    },
    restore(i: number): boolean {
      if (!(i >= 0 && i < snaps.length) || S.restore === null) return false;
      try {
        state = S.restore ? S.restore(snaps[i]) : (copyData(snaps[i]) as S);
        return true;
      } catch {
        return false;
      }
    },
  };
}
function makeEngine<P = unknown, S = unknown>(
  def: EngineDef<P, S>,
): { engine: EngineCore; simEngine: SimEngine & { stepper?: CoreStepper<S, P> } } {
  const simEngine = {
    create(spec: Spec, opts?: CreateOptions): EngineInstance {
      const seed = (opts && opts.seed)! >>> 0 || 1;
      const prepared = def.prepare ? def.prepare(spec) : null; // the model compiled once (its formulas through NoemaExpr)
      let key: string | null = null,
        res: RunResult | null | undefined = null;
      const inst: EngineInstance = {
        run(inp: Inputs | null | undefined) {
          const env: Record<string, number | boolean> = {},
            series: Record<string, unknown[]> = {};
          for (const [k, v] of Object.entries(inp || {}))
            if (typeof v === 'number' || typeof v === 'boolean') env[k] = v;
            else if (Array.isArray(v)) series[k] = v.slice(0, MAX_POINTS); // a series input of a part (docs/INTERACTIVE.md §12.8)
          const hasS = Object.keys(series).length > 0,
            kk = hasS ? JSON.stringify([env, series]) : JSON.stringify(env);
          if (kk !== key) {
            key = kk;
            try {
              res = def.run(spec, env, hasS ? { seed, prepared, series } : { seed, prepared });
            } catch {
              res = null;
            }
          }
          return pick(spec, res);
        },
      };
      if (def.stepper) Object.assign(inst, stepInstance(def, spec, seed, prepared));
      return inst;
    },
    ...(def.stepper ? { stepper: def.stepper } : {}),
  };
  const engine: EngineCore = {
    id: def.id,
    check: spec =>
      def
        .checkSpec(spec)
        .filter(p => p.level === 'error')
        .map(p => `${p.path}: ${p.msg}`),
    create: (spec, opts) => simEngine.create(spec, opts),
    ...(def.scenes ? { scenes: true } : {}),
    ...(def.stepper ? { stepper: true } : {}),
  };
  return { engine, simEngine };
}
/** the simulation kernel NoemaSimKit (src/engines/kernel/simkit.ts, docs/library/simkit.md), imported with this core */
function kit() {
  return NoemaSimKit;
}
/** a seeded stream for one purpose (docs/library/simkit.md §2): the kernel's MRG32k3a stream (seed, name) — with its variates
      r.normal, r.int, r.binomial… */
function rng(seed: number, name: unknown): Stream {
  return NoemaSimKit.stream(seed >>> 0, textOf(name));
}
/** a standard normal from a stream of rng() (inversion: one uniform, CRN-friendly), or Box–Muller on a bare uniform function */
const normal = (r: (() => number) & { readonly normal?: Stream['normal'] }) => (typeof r.normal === 'function' ? r.normal(0, 1) : gauss(r));

const API = Object.freeze({
  MAX_POINTS,
  MAX_SCENE,
  ID_RE,
  NAME_RE,
  KEY_RE,
  RESERVED: Object.freeze(RESERVED.slice()),
  STATS: Object.freeze(STATS.slice()),
  ROLES: Object.freeze(ROLES.slice()),
  isObj,
  has,
  isNum,
  fail,
  checkKind,
  kindMsg,
  walk,
  problems,
  hasErrors,
  checkOutputs,
  stats,
  thin,
  hash32,
  mulberry32,
  gauss,
  cx,
  scene,
  fitView,
  makeEngine,
  stepInstance,
  pickStep,
  copyData,
  kit,
  rng,
  normal,
});
export default API;
/* i18n-ignore-end */
