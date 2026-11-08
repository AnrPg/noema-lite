/* noema-lite — the checks of a sim-spec@1 spec (docs/INTERACTIVE.md §12): its controls, derived values, outputs, readouts and
   plots; every expression through the expression language; the model of its engine (circuit-mna@1, the P6 engines, the engine
   library) with the engine's own checks; the fault-finding bench; several engines in one spec (parts, §12.8). The engines come
   from the CheckEnv (env.ts): createSimSpec(env) gives the checks bound to them. Every message names the field it is about. */
import { utf8Length } from '../../../../kernel/bytes.ts';
import type { CheckEnv, EngineChecks } from '../env.ts';
import { copy, has, isNum, isObj, list, objs, qv, s, type MutObj, type Obj } from '../util.ts';
import {
  AC_CURVES,
  AC_POINT,
  AC_STATS,
  BENCH_ENGINES,
  BENCH_ID_RE,
  BENCH_KEYS,
  BENCH_LIM,
  BENCH_NAMES,
  CIRCUIT,
  DEFAULT_ENGINE,
  ENGINES,
  INST_KEYS,
  INSTRUMENTS,
  isLib,
  isP6,
  KEY_RE,
  LIB,
  LIB_KINDS,
  LINE_STYLES,
  MODEL_KEYS,
  MODES,
  NAME_RE,
  NUM_FORMATS,
  OUT_KEYS,
  P6,
  P6_TIMED,
  PARAM_KINDS,
  PART_KEYS,
  PARTS_LIM,
  PY,
  SPEC_FORMAT,
  SPEC_KEYS,
  SPEC_LIM,
  STATS,
  STEPPERS,
  TWIN,
  TWIN_INSTRUMENTS,
  TWIN_POINTS,
  USE_RE,
  WASM,
  WASM_ENGINE,
  WAVES,
  WHOLE,
} from './rules.ts';

const inA = (a: readonly unknown[], v: unknown): boolean => a.includes(v);
const isGnd = (x: unknown): boolean => x === 'gnd' || x === '0';
const strList = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === 'string');
/** the fields of o that are not allowed, each as an issue */
export const unknownKeys = (o: Obj, allowed: readonly string[], w: string, E: string[]): void => {
  for (const k of Object.keys(o)
    .filter(k => !allowed.includes(k))
    .sort())
    E.push(`${w}: unknown field ${qv(k)}`);
};
const stepsOver = (tEnd: unknown, dt: unknown): boolean => isNum(tEnd) && isNum(dt) && Math.ceil(tEnd / dt - 1e-9) > BENCH_LIM.steps;
const errPath = (p: { readonly path?: string; readonly msg: string }, base: string): string =>
  `${base}${p.path ? '.' + p.path : ''}: ${p.msg}`;

/** the spec a wasm-module@1 item shows: its own spec, run by wasm@1 on the item itself (as the runtime completes it) */
export function ownSpec(a: unknown): unknown {
  const sp = isObj(a) ? a.spec : undefined;
  if (!isObj(sp) || !isObj(a)) return sp;
  return { ...sp, engine: WASM_ENGINE, model: { ...(isObj(sp.model) ? sp.model : {}), module: a.id } };
}
/** the spec an activity shows (sim-spec@1: its spec; wasm-module@1: its own spec, completed) or null */
export const specOf = (a: unknown): Obj | null => {
  if (!isObj(a)) return null;
  if (typeof a.runtime === 'string' && (a.runtime === 'sim-spec@1' || a.runtime === PY)) return isObj(a.spec) ? a.spec : null;
  if (a.runtime === WASM) {
    const o = ownSpec(a);
    return isObj(a.spec) && isObj(o) ? o : null;
  }
  return null;
};
/** a wasm-module@1 item without its own spec: a module for a sim-spec@1 spec, nothing a block or an exercise can show */
export const showsNothing = (a: unknown): boolean => isObj(a) && a.runtime === WASM && !isObj(a.spec);
export const SHOWS_NOTHING = `is a ${WASM} module without its own spec: show it through a sim-spec@1 spec (engine ${WASM_ENGINE}, model.module) or give it a spec`;

/** an engine's messages about spec.X → about spec.parts[i].X */
export const partMsg = (m: string, w: string): string => m.replace(/^spec(?=[.:[])/, w);

/** deep merge of plain objects (b wins; arrays and other values are replaced) */
function mergeDeep(a: unknown, b: unknown): unknown {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : copy(b);
  const o = copy(a) as MutObj;
  for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(o[k]) ? mergeDeep(o[k], v) : copy(v);
  return o;
}

/** the spec one part shows its engine: its model and outputs, the spec's consts and params, and its inputs as names */
export function partSpec(spec: unknown, p: unknown): MutObj {
  const sp = isObj(spec) ? spec : {},
    part = isObj(p) ? p : {};
  const consts: MutObj = { ...(isObj(sp.consts) ? sp.consts : {}) };
  for (const k of isObj(part.inputs) ? Object.keys(part.inputs) : []) if (!has(consts, k)) consts[k] = 0;
  const out: MutObj = { format: SPEC_FORMAT, engine: part.engine, consts, params: list(sp.params) };
  if (part.model !== undefined) out.model = part.model;
  if (part.outputs !== undefined) out.outputs = part.outputs;
  return out;
}

/** the parts of a spec with every `use` resolved against the pack's activities/_parts (lib: {name: part}); E gets the problems */
export function resolveParts(spec: unknown, lib: unknown, E: string[]): { i: number; w: string; p: MutObj }[] | null {
  const ps = isObj(spec) ? spec.parts : undefined,
    L = PARTS_LIM,
    out: { i: number; w: string; p: MutObj }[] = [];
  if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.parts)) {
    E.push(`spec.parts must be a list of 1–${L.parts} parts {id, engine, model, outputs, inputs?}`);
    if (!Array.isArray(ps)) return null;
  }
  (ps as unknown[]).slice(0, L.parts).forEach((p, i) => {
    const w = `spec.parts[${i}]`;
    if (!isObj(p)) {
      E.push(`${w} must be an object {id, engine, model, outputs, inputs?} or {id, use, with?}`);
      return;
    }
    unknownKeys(p, PART_KEYS, w, E);
    let q: MutObj = p;
    if (p.use !== undefined) {
      if (!(typeof p.use === 'string' && USE_RE.test(p.use))) {
        E.push(`${w}.use must be the name of a file activities/_parts/<name>.json (lower-case letters, digits and -)`);
        return;
      }
      const d = isObj(lib) && has(lib, p.use) ? lib[p.use] : undefined;
      if (d === undefined) {
        E.push(`${w}.use: activities/_parts/${p.use}.json is not in the pack`);
        return;
      }
      if (!isObj(d)) {
        E.push(`${w}.use: activities/_parts/${p.use}.json must be a part {engine, model, outputs, inputs?}`);
        return;
      }
      if (p.with !== undefined && !isObj(p.with)) {
        E.push(`${w}.with must be an object (the fields of the part to change)`);
        return;
      }
      const base: MutObj = {};
      for (const k of Object.keys(d)) if (inA(PART_KEYS, k) && k !== 'id' && k !== 'use' && k !== 'with') base[k] = d[k];
      q = mergeDeep(base, p.with ?? {}) as MutObj;
      for (const k of ['engine', 'model', 'outputs', 'inputs']) if (p[k] !== undefined) q[k] = copy(p[k]);
      q.id = p.id;
    } else if (p.with !== undefined) E.push(`${w}.with needs use (the part of activities/_parts it changes)`);
    out.push({ i, w, p: q });
  });
  return out;
}

interface Graph {
  nodes: string[];
  deps: Map<string, string[]>;
  sccs: string[][];
  label: Map<string, string>;
}
interface Unit {
  k: 'derived' | 'part' | 'loop' | 'cosim';
  id?: string;
  i?: number;
  parts?: string[];
  derived?: string[];
  key: string;
}
export type PlanUnit = Omit<Unit, 'key'>;
export interface PartsPlan {
  readonly parts: MutObj[];
  readonly order: PlanUnit[];
  readonly errors: string[];
  readonly cycles: string[][];
}

/** the checks of sim-spec@1 bound to the engines of env */
export function createSimSpec(env: CheckEnv) {
  const NX = env.expr;
  const MOD = (id: string): EngineChecks | null => env.engine(id);

  /** null, or the first problem of an expression (names null = not checked) */
  function exprProblem(src: unknown, names: readonly string[] | null, where: string): string | null {
    if (typeof src !== 'string' || !src.trim()) return `${where}: an expression (a text such as “2*x + 1”) is required`;
    if (!NX) return `${where}: the expression checker (NoemaCore.engines.expr) is not loaded here`;
    const p = NX.check(src, names ? { vars: names } : {});
    const first = p[0];
    return first ? `${where}: ${first.msg} in “${src.slice(0, 60)}”` : null;
  }
  const badName = (n: unknown): boolean =>
    !(typeof n === 'string' && NAME_RE.test(n)) ||
    n === 'pi' ||
    n === 'e' ||
    n === 'true' ||
    n === 'false' ||
    !NX ||
    NX.check(n).length > 0;

  /** the scalar names an expression of the spec may use: consts, params, derived, the engine's scalar outputs */
  function specNames(spec: unknown): string[] {
    if (!isObj(spec)) return [];
    const out = isObj(spec.consts) ? Object.keys(spec.consts) : [];
    for (const k of ['params', 'derived']) for (const x of list(spec[k])) if (isObj(x) && typeof x.id === 'string') out.push(x.id);
    for (const x of list(spec.outputs)) if (isObj(x) && typeof x.id === 'string' && x.kind === 'scalar') out.push(x.id);
    for (const p of list(spec.parts))
      for (const x of isObj(p) ? list(p.outputs) : []) if (isObj(x) && typeof x.id === 'string' && x.kind === 'scalar') out.push(x.id);
    if (isObj(spec.bench)) out.push(...BENCH_NAMES);
    return out;
  }

  /** the names an expression uses (its free variables), in order of appearance; [] when it does not parse */
  function freeVars(src: unknown): string[] {
    if (typeof src !== 'string' || !NX) return [];
    let ast: unknown;
    try {
      ast = NX.parse(src);
    } catch {
      return [];
    }
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (!isObj(n)) return;
      if (n.t === 'var') {
        if (typeof n.name === 'string' && !out.includes(n.name)) out.push(n.name);
        return;
      }
      for (const k of ['a', 'b', 'c']) if (n[k]) walk(n[k]);
      if (Array.isArray(n.args)) (n.args as unknown[]).forEach(walk);
    };
    walk(ast);
    return out;
  }

  /* ---------- circuit-mna@1 ---------- */
  interface Circuit {
    nl: Obj;
    els: Map<unknown, Obj>;
    nodes: Set<unknown>;
  }
  const CK = (): EngineChecks | null => MOD(CIRCUIT);
  const errors = (ps: readonly { readonly level: string }[] | undefined): boolean => (ps ?? []).some(p => p.level === 'error');
  /** the netlist of a spec without errors: its elements and its node and test-point names, or null */
  function circuitOf(spec: unknown): Circuit | null {
    const nl = isObj(spec) && isObj(spec.model) ? spec.model.netlist : null;
    const ck = CK();
    if (!ck?.check || !isObj(nl) || errors(ck.check(nl))) return null;
    return {
      nl,
      els: new Map(objs(nl.elements).map(e => [e.id, e])),
      nodes: new Set(list(nl.nodes).map(x => (isObj(x) ? x.name : x))),
    };
  }
  const pins = (e: Obj): number => list(e.n).length;
  /** a measuring point: a node, a test-point label, gnd, or a pin "@R1.0" */
  function endpointOk(c: Circuit, x: unknown): boolean {
    if (typeof x !== 'string') return false;
    if (x.startsWith('@')) {
      const m = /^@(.*)\.(\d+)$/.exec(x),
        e = m ? c.els.get(m[1]) : undefined;
      return !!e && !!m && Number(m[2]) < pins(e);
    }
    return c.nodes.has(x) || isGnd(x);
  }
  function probeOk(c: Circuit, p: unknown): boolean {
    if (!isObj(p)) return false;
    const meter = p.kind === 'V' || p.kind === 'I';
    if (p.mode !== undefined && !(meter && inA(MODES, p.mode))) return false;
    if (p.zin !== undefined && !(p.kind === 'V' && isNum(p.zin) && p.zin >= 0)) return false;
    for (const k of ['tEnd', 'dt', 'tStart']) {
      const v = p[k];
      if (v !== undefined && !(meter && isNum(v) && (k === 'tStart' ? v >= 0 : v > 0))) return false;
    }
    if (
      (p.dt !== undefined || p.tStart !== undefined) &&
      (p.tEnd === undefined || (p.tStart !== undefined && !((p.tStart as number) < (p.tEnd as number))))
    )
      return false;
    if (p.kind === 'V' || p.kind === 'R') return endpointOk(c, p.a) && (p.b === undefined || endpointOk(c, p.b));
    if (p.kind === 'I') {
      const e = typeof p.element === 'string' ? c.els.get(p.element) : undefined;
      return !!e && (p.pin === undefined || (Number.isInteger(p.pin) && (p.pin as number) >= 0 && (p.pin as number) < pins(e)));
    }
    return false;
  }
  /** a source the AC analysis can excite: a V or I part */
  const acSourceOk = (c: Circuit, id: unknown): boolean => {
    const e = typeof id === 'string' ? c.els.get(id) : undefined;
    return !!e && (e.type === 'V' || e.type === 'I');
  };
  /** a number (> 0 when pos) or an expression of names → the number, or null (an expression, or a problem pushed to E) */
  function numOrExpr(v: unknown, names: readonly string[], where: string, E: string[], pos: boolean): number | null {
    if (typeof v === 'string') {
      const m = exprProblem(v, names, where);
      if (m) E.push(m);
      return null;
    }
    if (!(isNum(v) && (!pos || v > 0))) {
      E.push(`${where} must be a number${pos ? ' > 0' : ''} or an expression`);
      return null;
    }
    return v;
  }
  function checkCircuit(spec: Obj, names: readonly string[], E: string[]): void {
    const m = spec.model,
      L = BENCH_LIM;
    if (!isObj(m)) {
      E.push(`spec.model: ${CIRCUIT} needs a model {netlist, bindings?, transient?, noise?}`);
      return;
    }
    unknownKeys(m, MODEL_KEYS, 'spec.model', E);
    const ck = CK();
    if (!ck?.check) {
      E.push(`spec.model: the ${CIRCUIT} checker (src/engines/circuit/sim.js) is not loaded here`);
      return;
    }
    if (!isObj(m.netlist)) {
      E.push('spec.model.netlist must be a netlist {format: "noema.circuit/v1", nodes, elements}');
      return;
    }
    const probs = ck.check(m.netlist).filter(p => p.level === 'error');
    for (const p of probs) E.push(errPath(p, 'spec.model.netlist'));
    if (probs.length) return;
    const c = circuitOf(spec);
    if (!c) return;
    const bs = m.bindings;
    if (bs != null && !(Array.isArray(bs) && bs.length <= L.bindings))
      E.push(`spec.model.bindings must be a list of at most ${L.bindings} {element, prop?, expr}`);
    list(bs)
      .slice(0, L.bindings)
      .forEach((b, i) => {
        const w = `spec.model.bindings[${i}]`;
        if (!isObj(b)) {
          E.push(`${w} must be an object {element, prop?, expr}`);
          return;
        }
        unknownKeys(b, ['element', 'prop', 'expr'], w, E);
        const e = typeof b.element === 'string' ? c.els.get(b.element) : undefined;
        if (!e) E.push(`${w}.element is not a part of the netlist`);
        else {
          const prop = b.prop === undefined ? 'value' : b.prop,
            wave = isObj(e.value) ? (Object.keys(e.value)[0] ?? null) : null;
          const okp =
            typeof prop === 'string' &&
            (e.type === 'R' || e.type === 'C' || e.type === 'L'
              ? prop === 'value'
              : e.type === 'SW'
                ? prop === 'on'
                : e.type === 'V' || e.type === 'I'
                  ? prop === 'value'
                    ? wave === null || wave === 'dc'
                    : wave !== null && has(WAVES, wave) && (WAVES[wave] ?? []).some(f => wave + '.' + f === prop)
                  : false);
          if (!okp)
            E.push(
              `${w}.prop cannot be set on this part (value of R, C, L and a DC source; on of a switch; pulse.v2, sine.freq, pwm.duty … of a source with that waveform)`,
            );
        }
        const mm = exprProblem(b.expr, names, w + '.expr');
        if (mm) E.push(mm);
      });
    const tr = m.transient;
    if (tr != null) {
      if (!isObj(tr)) E.push('spec.model.transient must be an object {tEnd, dt?}');
      else {
        unknownKeys(tr, ['tEnd', 'dt'], 'spec.model.transient', E);
        let te: number | null = null;
        if (tr.tEnd === undefined) E.push('spec.model.transient.tEnd is required');
        else te = numOrExpr(tr.tEnd, names, 'spec.model.transient.tEnd', E, true);
        const dt = tr.dt === undefined ? null : numOrExpr(tr.dt, names, 'spec.model.transient.dt', E, true);
        if (stepsOver(te, dt)) E.push(`spec.model.transient: tEnd / dt is more than ${L.steps} steps`);
      }
    }
    const nz = m.noise;
    if (
      nz != null &&
      !(
        isObj(nz) &&
        Object.keys(nz).every(k => k === 'rel' || k === 'abs') &&
        ['rel', 'abs'].every(k => {
          const v = nz[k];
          return v === undefined || (isNum(v) && v >= 0 && v <= 1);
        })
      )
    )
      E.push("spec.model.noise is {rel?, abs?}: numbers from 0 to 1 (the meter's relative and absolute error)");
    const ac = m.ac;
    if (ac != null) {
      if (!isObj(ac)) E.push('spec.model.ac must be an object {source, fStart, fStop, points?}');
      else {
        unknownKeys(ac, ['source', 'fStart', 'fStop', 'points'], 'spec.model.ac', E);
        if (!acSourceOk(c, ac.source))
          E.push('spec.model.ac.source must be a V or I part of the netlist (the source the analysis excites)');
        for (const k of ['fStart', 'fStop']) {
          if (ac[k] === undefined) E.push(`spec.model.ac.${k} is required (Hz)`);
          else numOrExpr(ac[k], names, 'spec.model.ac.' + k, E, true);
        }
        if (isNum(ac.fStart) && isNum(ac.fStop) && !(ac.fStop > ac.fStart)) E.push('spec.model.ac: fStop must be above fStart');
        if (ac.points !== undefined && !(Number.isInteger(ac.points) && (ac.points as number) >= 2 && (ac.points as number) <= L.acPoints))
          E.push(`spec.model.ac.points is a whole number 2–${L.acPoints}`);
      }
    }
    list(spec.outputs).forEach((o, i) => {
      const w = `spec.outputs[${i}]`;
      if (!(isObj(o) && (o.kind === 'scalar' || o.kind === 'series'))) return;
      unknownKeys(o, OUT_KEYS, w, E);
      if ('ac' in o) {
        if (['branch', 'time', 'probe', 'power', 'stat'].some(k => k in o))
          E.push(`${w}: an ac output reads only ac, node, ref and (a gain or phase at one frequency) at`);
        const curve = o.kind === 'series',
          okv = curve ? inA(AC_CURVES, o.ac) : inA(AC_POINT, o.ac) || inA(AC_STATS, o.ac);
        if (!okv) E.push(`${w}.ac is one of ${(curve ? [...AC_CURVES] : [...AC_POINT, ...AC_STATS]).join(', ')} on a ${o.kind} output`);
        const nodeOk = (x: unknown): boolean => typeof x === 'string' && (c.nodes.has(x) || isGnd(x));
        if (o.ac !== 'f' && !nodeOk(o.node)) E.push(`${w}.node is not a node of the netlist (where the response is read)`);
        if (o.ac === 'f' && 'node' in o) E.push(`${w}: the frequency axis (ac: f) reads no node`);
        if ('ref' in o && !nodeOk(o.ref)) E.push(`${w}.ref is not a node of the netlist`);
        if (!curve && inA(AC_POINT, o.ac)) {
          if (!('at' in o)) E.push(`${w}.at is required: the frequency (Hz) of this ${s(o.ac)}`);
          else numOrExpr(o.at, names, w + '.at', E, true);
        } else if ('at' in o) E.push(`${w}: at belongs to a gain or phase at one frequency (ac: db, phase, mag on a scalar)`);
        if (!isObj(m.ac)) E.push(`${w} needs model.ac {source, fStart, fStop, points?}`);
        return;
      }
      if ('ref' in o) E.push(`${w}: ref belongs to an ac output`);
      const src = ['node', 'branch', 'time', 'probe', 'power'].filter(k => k in o);
      if (src.length !== 1) {
        E.push(`${w} must name what it reads: one of node, branch, time, probe, power, ac`);
        return;
      }
      const sk = src[0];
      if (sk === 'time' && !(o.time === true && o.kind === 'series'))
        E.push(`${w}.time is true on a series output (the time axis of the transient)`);
      if (sk === 'node' && !(typeof o.node === 'string' && (c.nodes.has(o.node) || isGnd(o.node))))
        E.push(`${w}.node is not a node of the netlist`);
      if (sk === 'branch' && !(typeof o.branch === 'string' && c.els.has(o.branch))) E.push(`${w}.branch is not a part of the netlist`);
      if (sk === 'power' && !(typeof o.power === 'string' && c.els.has(o.power)))
        E.push(`${w}.power is not a part of the netlist (the part whose power is read)`);
      if (sk === 'probe' && !(o.kind === 'scalar' && probeOk(c, o.probe)))
        E.push(
          `${w}.probe must be a reading {kind: V | I | R, a, b? | element, pin?, mode?, zin?, tEnd?, dt?, tStart?} on a scalar output`,
        );
      const at = 'at' in o,
        st = 'stat' in o;
      if ((at || st) && !(o.kind === 'scalar' && (sk === 'node' || sk === 'branch' || sk === 'power')))
        E.push(`${w}: at and stat belong to a scalar output of a node, a branch or a power`);
      if (sk === 'power' && o.kind === 'scalar' && !at && !st) E.push(`${w}: a power is read over the transient: give at or stat`);
      if (at && st) E.push(`${w}: at or stat, not both`);
      if (at) numOrExpr(o.at, names, w + '.at', E, false);
      if (st && !inA(STATS, o.stat)) E.push(`${w}.stat is one of ${STATS.join(', ')}`);
      if ((o.kind === 'series' || at || st) && !isObj(m.transient)) E.push(`${w} needs model.transient {tEnd, dt?}`);
    });
  }

  /* ---------- the P6 engines and the engine library: the engine's own checkSpec, then every expression of its model ---------- */
  function engineExprs(spec: Obj, eng: string): [string, string][] {
    const m = isObj(spec.model) ? spec.model : {},
      out: [string, string][] = [],
      timed = inA(P6_TIMED, eng);
    const add = (v: unknown, w: string): void => {
      if (typeof v === 'string' && v.trim()) out.push([v, w]);
    };
    list(m.bindings).forEach((b, i) => {
      if (isObj(b)) add(b.expr, `spec.model.bindings[${i}].expr`);
    });
    if (timed && isObj(m.transient)) for (const k of ['tEnd', 'dt']) add(m.transient[k], `spec.model.transient.${k}`);
    if (timed)
      list(spec.outputs).forEach((o, i) => {
        if (isObj(o)) add(o.at, `spec.outputs[${i}].at`);
      });
    return out;
  }
  function checkEngine(spec: Obj, eng: string, names: readonly string[], E: string[]): void {
    const M = MOD(eng);
    if (!M?.checkSpec) {
      E.push(`spec.model: the ${eng} checker (src/engines/${P6[eng] ?? eng}) is not loaded here`);
      return;
    }
    for (const p of M.checkSpec(spec)) if (p.level === 'error') E.push(errPath(p, 'spec'));
    for (const [src, w] of engineExprs(spec, eng)) {
      const m = exprProblem(src, names, w);
      if (m) E.push(m);
    }
  }
  type KeyFn = (k: unknown, where: string, need?: boolean) => void;
  function checkLib(spec: Obj, eng: string, names: readonly string[], E: string[], key: KeyFn): void {
    const M = MOD(eng);
    if (!M?.checkSpec) {
      E.push(`spec.model: the ${eng} checker (src/engines/${LIB[eng] ?? eng}) is not loaded here`);
      return;
    }
    const P = M.checkSpec(spec);
    for (const p of P) if (p.level === 'error') E.push(errPath(p, 'spec'));
    if (errors(P)) return;
    for (const [src, w, local] of M.exprs?.(spec) ?? []) {
      const m = exprProblem(src, [...names, ...(local ?? [])], 'spec.' + w);
      if (m) E.push(m);
    }
    for (const [k, w] of M.keys?.(spec) ?? []) key(k, 'spec.' + w, true);
  }
  /** twin@1: the device of a spec without errors, or null */
  function twinOf(spec: Obj): Obj | null {
    const d = isObj(spec.model) ? spec.model.device : null,
      T = MOD(TWIN);
    return T?.check && isObj(d) && !errors(T.check(d)) ? d : null;
  }

  /* ---------- the fault-finding bench (docs/INTERACTIVE.md §12.7) ---------- */
  function checkBench(spec: Obj, names: readonly string[], seen: ReadonlySet<string>, E: string[], key: KeyFn, eng: unknown): void {
    const b = spec.bench,
      L = BENCH_LIM,
      tw = eng === TWIN,
      c = tw ? null : circuitOf(spec),
      dev = tw ? twinOf(spec) : null;
    const KINDS: readonly string[] = tw ? TWIN_INSTRUMENTS : INSTRUMENTS;
    if (!isObj(b)) {
      E.push('spec.bench must be an object {faults, points, instruments, diagnosis, budget?}');
      return;
    }
    unknownKeys(b, BENCH_KEYS, 'spec.bench', E);
    for (const n of BENCH_NAMES)
      if (seen.has(n)) E.push(`spec: the name ${n} belongs to the bench (its values: ${BENCH_NAMES.join(', ')})`);
    const ids = (arr: unknown, w: string, what: string): string[] => {
      const out: string[] = [];
      list(arr).forEach((x, i) => {
        if (!isObj(x)) return;
        if (!(typeof x.id === 'string' && BENCH_ID_RE.test(x.id)))
          E.push(`${w}[${i}].id must be a name (a letter, then letters, digits, _ or -; at most 32)`);
        else if (out.includes(x.id)) E.push(`${w}[${i}].id: the ${what} ${x.id} is listed twice`);
        else out.push(x.id);
      });
      return out;
    };
    const fs = b.faults;
    if (!(Array.isArray(fs) && fs.length >= 1 && fs.length <= L.faults))
      E.push(`spec.bench.faults must be a list of 1–${L.faults} faults {id, apply}`);
    const fids = ids(fs, 'spec.bench.faults', 'fault');
    list(fs).forEach((f, i) => {
      const w = `spec.bench.faults[${i}]`;
      if (!isObj(f)) {
        E.push(`${w} must be an object {id, apply}`);
        return;
      }
      unknownKeys(f, ['id', 'apply'], w, E);
      if (!(Array.isArray(f.apply) && f.apply.length <= L.apply)) {
        E.push(`${w}.apply must be a list of at most ${L.apply} changes to the ${tw ? 'device' : 'circuit'} ([] = a healthy device)`);
        return;
      }
      const apply = f.apply as unknown[];
      const cf = CK()?.checkFaults,
        tf = MOD(TWIN)?.checkFaults;
      if (c && cf) for (const p of cf(c.nl, apply)) E.push(`${w}.${(p.path ?? '').replace(/^faults/, 'apply')}: ${p.msg}`);
      if (dev && tf) for (const p of tf(dev, apply)) E.push(`${w}.${(p.path ?? '').replace(/^faults/, 'apply')}: ${p.msg}`);
    });
    const ps = b.points;
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.points))
      E.push(`spec.bench.points must be a list of 1–${L.points} probe points {id, at, label}`);
    const pids = ids(ps, 'spec.bench.points', 'point'),
      atOf = new Map<string, unknown>();
    list(ps).forEach((p, i) => {
      const w = `spec.bench.points[${i}]`;
      if (!isObj(p)) {
        E.push(`${w} must be an object {id, at, label}`);
        return;
      }
      unknownKeys(p, ['id', 'at', 'label'], w, E);
      if (typeof p.id === 'string' && !atOf.has(p.id)) atOf.set(p.id, p.at);
      if (c && !endpointOk(c, p.at)) E.push(`${w}.at must be a node, a test point, gnd or a pin such as @R1.0 of the netlist`);
      if (tw && !inA(TWIN_POINTS, p.at))
        E.push(`${w}.at is one of ${TWIN_POINTS.join(', ')} (the battery, the battery under load, the supply current, the ground)`);
      key(p.label, w + '.label', true);
    });
    const is = b.instruments,
      kinds: unknown[] = [];
    if (!(Array.isArray(is) && is.length >= 1 && is.length <= L.instruments))
      E.push(`spec.bench.instruments must be a list of 1–${L.instruments} instruments {kind, …}`);
    list(is).forEach((x, i) => {
      const w = `spec.bench.instruments[${i}]`;
      if (!(isObj(x) && inA(KINDS, x.kind))) {
        E.push(`${w}.kind is one of ${KINDS.join(', ')}`);
        return;
      }
      const kind = s(x.kind);
      if (kinds.includes(kind)) E.push(`${w}: the instrument ${kind} is listed twice`);
      kinds.push(kind);
      unknownKeys(x, INST_KEYS, w, E);
      if (inA(WHOLE, kind)) {
        const what: Readonly<Record<string, string>> = { log: 'event log', rssi: 'RSSI reading', T: 'thermometer', clock: 'clock check' };
        if (Object.keys(x).some(k => k !== 'kind' && inA(INST_KEYS, k))) E.push(`${w}: the ${what[kind] ?? kind} has only a kind`);
        return;
      }
      const scope = kind === 'scope' || kind === 'logic',
        meter = !tw && (kind === 'V' || kind === 'I');
      if (kind === 'I') {
        if ('points' in x) E.push(`${w}: the ammeter reads parts (parts), not points`);
        const pa = x.parts;
        if (!(Array.isArray(pa) && pa.length >= 1 && pa.length <= L.parts))
          E.push(`${w}.parts must be a list of 1–${L.parts} parts {element, label, pin?}`);
        else
          (pa as unknown[]).forEach((q, j) => {
            const wq = `${w}.parts[${j}]`;
            if (!isObj(q)) {
              E.push(`${wq} must be an object {element, label, pin?}`);
              return;
            }
            unknownKeys(q, ['element', 'label', 'pin'], wq, E);
            if (c && !probeOk(c, { kind: 'I', element: q.element, pin: q.pin }))
              E.push(`${wq}: element must be a part of the netlist (and pin one of its pins)`);
            if (tw && !(q.element === 'battery' && q.pin === undefined))
              E.push(`${wq}: element must be battery (the twin's ammeter reads the supply current), without pin`);
            key(q.label, wq + '.label', true);
          });
      } else {
        if ('parts' in x) E.push(`${w}: only the ammeter (I) reads parts`);
        const pts = x.points;
        if (pts !== undefined && !(Array.isArray(pts) && pts.length >= 1 && pts.every(q => typeof q === 'string' && pids.includes(q))))
          E.push(`${w}.points must be ids of spec.bench.points`);
        if ((kind === 'V' || kind === 'R') && (Array.isArray(pts) ? pts.length : pids.length) < 2)
          E.push(`${w}: a meter needs two points to put its leads on`);
        if (tw) {
          const on = (Array.isArray(pts) ? strList(pts) : pids).filter(q => pids.includes(q)).map(q => atOf.get(q));
          if (kind === 'V' && on.some(a => a === 'i'))
            E.push(`${w}: the twin's voltmeter reads vbat or vload against gnd (list its points: not the current i)`);
          if (kind === 'scope' && on.some(a => a !== 'i'))
            E.push(`${w}: the twin's oscilloscope shows the supply current (list its points: only points at i)`);
        }
      }
      for (const k of ['tEnd', 'dt', 'tStart', 'threshold'])
        if (k in x && !((scope || meter) && (k !== 'threshold' || kind === 'logic')))
          E.push(
            `${w}.${k} belongs to ${k === 'threshold' ? 'the logic analyser' : 'the oscilloscope, the logic analyser and (its averaging window) the multimeter'}`,
          );
      if ('modes' in x) {
        const ms = x.modes;
        if (!(meter && Array.isArray(ms) && ms.length >= 1 && ms.every((q, j) => inA(MODES, q) && ms.indexOf(q) === j)))
          E.push(`${w}.modes belongs to the multimeter (V, I): a list of ${MODES.join(', ')}, each once`);
      }
      if ('zin' in x && !(!tw && ['V', 'scope', 'logic'].includes(kind) && isNum(x.zin) && x.zin >= 0))
        E.push(`${w}.zin belongs to the voltmeter, the oscilloscope and the logic analyser: their input resistance in Ω (0 = ideal)`);
      if ('leads' in x) {
        const ld = x.leads;
        if (!(!tw && kind === 'scope' && Array.isArray(ld) && ld.length >= 1 && ld.length <= L.leads))
          E.push(`${w}.leads belongs to the oscilloscope: a list of 1–${L.leads} ground leads {label, lead, cin?}`);
        else
          (ld as unknown[]).forEach((q, j) => {
            const wq = `${w}.leads[${j}]`;
            if (!isObj(q)) {
              E.push(`${wq} must be an object {label, lead, cin?}`);
              return;
            }
            unknownKeys(q, ['label', 'lead', 'cin'], wq, E);
            if (!(isNum(q.lead) && q.lead >= 0))
              E.push(`${wq}.lead is the ground lead's inductance in H (0 = none; about 1 nH per mm of wire)`);
            if (q.cin !== undefined && !(isNum(q.cin) && q.cin >= 0)) E.push(`${wq}.cin is the probe's capacitance in F`);
            key(q.label, wq + '.label', true);
          });
      }
      const bode = kind === 'bode';
      for (const k of ['source', 'fStart', 'fStop', 'fPoints'])
        if (k in x && !bode) E.push(`${w}.${k} belongs to the frequency response analyser (bode)`);
      if (bode) {
        if (c && !acSourceOk(c, x.source)) E.push(`${w}.source must be a V or I part of the netlist (the source the analyser sweeps)`);
        for (const k of ['fStart', 'fStop']) {
          if (x[k] === undefined) E.push(`${w}.${k} is required (Hz)`);
          else numOrExpr(x[k], names, `${w}.${k}`, E, true);
        }
        if (x.fPoints !== undefined && !(Number.isInteger(x.fPoints) && (x.fPoints as number) >= 2 && (x.fPoints as number) <= L.acPoints))
          E.push(`${w}.fPoints is a whole number 2–${L.acPoints}`);
      }
      if (meter) {
        const te = x.tEnd === undefined ? null : numOrExpr(x.tEnd, names, w + '.tEnd', E, true),
          dt = x.dt === undefined ? null : numOrExpr(x.dt, names, w + '.dt', E, true);
        if ('tStart' in x) numOrExpr(x.tStart, names, w + '.tStart', E, false);
        if (('dt' in x || 'tStart' in x) && !('tEnd' in x)) E.push(`${w}: the multimeter's averaging window needs tEnd`);
        if (isNum(x.tStart) && isNum(te) && !(x.tStart < te)) E.push(`${w}: the multimeter's averaging window needs tStart below tEnd`);
        if (stepsOver(te, dt)) E.push(`${w}: tEnd / dt is more than ${L.steps} steps`);
      }
      if (scope) {
        let te: number | null = null;
        if (x.tEnd === undefined) E.push(`${w}.tEnd is required (how long the trace is, in s)`);
        else te = numOrExpr(x.tEnd, names, w + '.tEnd', E, true);
        const dt = x.dt === undefined ? null : numOrExpr(x.dt, names, w + '.dt', E, true);
        if ('tStart' in x) numOrExpr(x.tStart, names, w + '.tStart', E, false);
        if ('threshold' in x && kind === 'logic') numOrExpr(x.threshold, names, w + '.threshold', E, false);
        if (stepsOver(te, dt)) E.push(`${w}: tEnd / dt is more than ${L.steps} steps`);
      }
    });
    const d = b.diagnosis;
    if (!isObj(d)) E.push('spec.bench.diagnosis must be an object {options: [{label, fault?}]}');
    else {
      unknownKeys(d, ['label', 'options'], 'spec.bench.diagnosis', E);
      key(d.label, 'spec.bench.diagnosis.label');
      const os = d.options,
        named: string[] = [];
      if (!(Array.isArray(os) && os.length >= 2 && os.length <= L.options))
        E.push(`spec.bench.diagnosis.options must be a list of 2–${L.options} options {label, fault?}`);
      else {
        (os as unknown[]).forEach((o, i) => {
          const w = `spec.bench.diagnosis.options[${i}]`;
          if (!isObj(o)) {
            E.push(`${w} must be an object {label, fault?}`);
            return;
          }
          unknownKeys(o, ['label', 'fault'], w, E);
          key(o.label, w + '.label', true);
          if (o.fault !== undefined) {
            if (!(typeof o.fault === 'string' && fids.includes(o.fault))) E.push(`${w}.fault must be the id of one of spec.bench.faults`);
            else if (named.includes(o.fault)) E.push(`${w}.fault: two options name the fault ${o.fault}`);
            else named.push(o.fault);
          }
        });
        for (const f of fids)
          if (!named.includes(f)) E.push(`spec.bench.diagnosis: no option names the fault ${f} (the learner could not diagnose it)`);
      }
    }
    if (b.budget !== undefined && !(Number.isInteger(b.budget) && (b.budget as number) >= 1 && (b.budget as number) <= L.budget))
      E.push(`spec.bench.budget is a whole number 1–${L.budget} (the measurements allowed)`);
  }

  /* ---------- parts: several engines in one spec (docs/INTERACTIVE.md §12.8) ---------- */
  /** the dependency graph of derived values and parts: nodes "d:<id>" and "p:<id>" in the spec's order, each with the nodes it
      needs; its strongly connected components (Tarjan 1972) */
  function partsGraph(spec: Obj, parts: readonly Obj[]): Graph {
    const nodes: string[] = [],
      deps = new Map<string, string[]>(),
      owner = new Map<string, string>(),
      label = new Map<string, string>();
    for (const d of list(spec.derived))
      if (isObj(d) && typeof d.id === 'string' && !label.has('d:' + d.id)) {
        nodes.push('d:' + d.id);
        label.set('d:' + d.id, d.id);
        if (!owner.has(d.id)) owner.set(d.id, 'd:' + d.id);
      }
    for (const p of parts)
      if (typeof p.id === 'string' && !label.has('p:' + p.id)) {
        nodes.push('p:' + p.id);
        label.set('p:' + p.id, p.id);
        for (const o of list(p.outputs)) if (isObj(o) && typeof o.id === 'string' && !owner.has(o.id)) owner.set(o.id, 'p:' + p.id);
      }
    for (const n of nodes) deps.set(n, []);
    const need = (n: string, names: readonly string[]): void => {
      const a = deps.get(n) ?? [];
      for (const x of names) {
        const o = owner.get(x);
        if (o && !a.includes(o)) a.push(o);
      }
    };
    for (const d of list(spec.derived))
      if (isObj(d) && typeof d.id === 'string' && deps.has('d:' + d.id)) need('d:' + d.id, freeVars(d.expr));
    for (const p of parts)
      if (typeof p.id === 'string' && deps.has('p:' + p.id) && isObj(p.inputs))
        for (const v of Object.values(p.inputs))
          need('p:' + p.id, typeof v === 'string' ? freeVars(v) : isObj(v) && typeof v.series === 'string' ? [v.series] : []);
    let idx = 0;
    const st: string[] = [],
      on = new Set<string>(),
      ix = new Map<string, number>(),
      low = new Map<string, number>(),
      sccs: string[][] = [];
    const visit = (v: string): void => {
      ix.set(v, idx);
      low.set(v, idx);
      idx++;
      st.push(v);
      on.add(v);
      for (const w of deps.get(v) ?? []) {
        if (!ix.has(w)) {
          visit(w);
          low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
        } else if (on.has(w)) low.set(v, Math.min(low.get(v) ?? 0, ix.get(w) ?? 0));
      }
      if (low.get(v) === ix.get(v)) {
        const c: string[] = [];
        let w: string | undefined;
        do {
          w = st.pop();
          if (w === undefined) break;
          on.delete(w);
          c.push(w);
        } while (w !== v);
        sccs.push(c.sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b)));
      }
    };
    for (const v of nodes) if (!ix.has(v)) visit(v);
    return { nodes, deps, sccs, label };
  }
  /** a cycle through the component c, as names: the shortest way from its first node back to it */
  function cyclePath(G: Graph, c: readonly string[]): string[] {
    const st = c[0] ?? '',
      prev = new Map<string, string | null>([[st, null]]),
      q = [st];
    const lab = (x: string): string => G.label.get(x) ?? x;
    while (q.length) {
      const v = q.shift() ?? '';
      for (const w of G.deps.get(v) ?? []) {
        if (!c.includes(w)) continue;
        if (w === st) {
          const path: string[] = [];
          for (let x: string | null = v; x !== null; x = prev.get(x) ?? null) path.unshift(lab(x));
          return [...path, lab(st)];
        }
        if (!prev.has(w)) {
          prev.set(w, v);
          q.push(w);
        }
      }
    }
    return [lab(st), lab(st)];
  }
  /** the coupling groups of a spec (only well-formed lists of part ids) */
  function couplingGroups(spec: Obj, ids: readonly unknown[]): { k: 'loop' | 'cosim'; i?: number; parts: string[] }[] {
    const c = spec.couple,
      out: { k: 'loop' | 'cosim'; i?: number; parts: string[] }[] = [];
    if (!isObj(c)) return out;
    list(c.loops).forEach((l, i) => {
      if (isObj(l) && Array.isArray(l.parts)) out.push({ k: 'loop', i, parts: strList(l.parts).filter(x => ids.includes(x)) });
    });
    if (isObj(c.cosim) && Array.isArray(c.cosim.parts)) {
      const ps = strList(c.cosim.parts).filter(x => ids.includes(x)),
        ord = Array.isArray(c.cosim.order) ? strList(c.cosim.order).filter(x => ps.includes(x)) : [];
      out.push({ k: 'cosim', parts: [...ord, ...ps.filter(x => !ord.includes(x))] });
    }
    return out;
  }
  /** the order of evaluation, each unit after what it needs (Kahn 1962, ties in the spec's order), and the undeclared cycles */
  function partsOrder(spec: Obj, parts: readonly Obj[]): { order: PlanUnit[]; cycles: string[][] } {
    const G = partsGraph(spec, parts),
      ids = parts.map(p => p.id),
      groups = couplingGroups(spec, ids),
      unitOf = new Map<string, Unit>(),
      units: Unit[] = [],
      cycles: string[][] = [];
    const gOf = (pid: string): number => groups.findIndex(g => g.parts.includes(pid));
    groups.forEach((g, j) => {
      const u: Unit = {
        ...(g.k === 'loop' ? { k: 'loop' as const, i: g.i ?? 0 } : { k: 'cosim' as const }),
        parts: g.parts.slice(),
        derived: [],
        key: `g${j}`,
      };
      units.push(u);
      for (const p of g.parts) unitOf.set('p:' + p, u);
    });
    for (const c of G.sccs) {
      const c0 = c[0] ?? '';
      const cyc = c.length > 1 || (G.deps.get(c0) ?? []).includes(c0);
      if (!cyc) continue;
      const ps = c.filter(n => n.startsWith('p:')).map(n => n.slice(2)),
        gs = [...new Set(ps.map(gOf))];
      const g0 = gs[0];
      const u = gs.length === 1 && g0 !== undefined && g0 >= 0 ? unitOf.get('p:' + (ps[0] ?? '')) : undefined;
      if (ps.length && u) {
        for (const n of c)
          if (n.startsWith('d:') && !unitOf.has(n)) {
            (u.derived ??= []).push(n.slice(2));
            unitOf.set(n, u);
          }
      } else cycles.push(cyclePath(G, c));
    }
    for (const n of G.nodes)
      if (!unitOf.has(n)) {
        const u: Unit = n.startsWith('d:') ? { k: 'derived', id: n.slice(2), key: n } : { k: 'part', id: n.slice(2), key: n };
        units.push(u);
        unitOf.set(n, u);
      }
    for (const u of units) if (u.derived) u.derived.sort((a, b) => G.nodes.indexOf('d:' + a) - G.nodes.indexOf('d:' + b));
    const rank = (u: Unit): number => Math.min(...G.nodes.filter(n => unitOf.get(n) === u).map(n => G.nodes.indexOf(n)), 1e9);
    const udeps = new Map<Unit, Set<Unit>>(units.map(u => [u, new Set()]));
    for (const n of G.nodes)
      for (const m of G.deps.get(n) ?? []) {
        const a = unitOf.get(n),
          b = unitOf.get(m);
        if (a && b && a !== b) udeps.get(a)?.add(b);
      }
    const done = new Set<Unit>(),
      order: Unit[] = [];
    if (!cycles.length)
      while (order.length < units.length) {
        const ready = units
          .filter(u => !done.has(u) && [...(udeps.get(u) ?? [])].every(b => done.has(b)))
          .sort((a, b) => rank(a) - rank(b));
        const first = ready[0];
        if (!first) break;
        done.add(first);
        order.push(first);
      }
    return {
      order: order.map(u => {
        const o: Partial<Unit> = { ...u };
        delete o.key;
        return o as PlanUnit;
      }),
      cycles,
    };
  }
  /** partsPlan(spec, lib) → the resolved parts, the order of evaluation, the problems — what the runtime (35_activity_sim.js) runs */
  function partsPlan(spec: unknown, lib: unknown): PartsPlan {
    const E: string[] = [],
      R = isObj(spec) ? (resolveParts(spec, lib, E) ?? []) : [];
    const parts = R.map(r => r.p);
    const { order, cycles } = partsOrder(isObj(spec) ? spec : {}, parts);
    return { parts, order, errors: E, cycles };
  }

  interface PartInfo {
    id: unknown;
    eng: unknown;
    lib: boolean;
    w: string;
    i: number;
    p: MutObj;
    inNames: string[];
  }
  interface PartsInfo {
    cp: string[];
    parts: PartInfo[];
    scalars: string[];
    series: string[];
    scenes: string[];
    sounds: string[];
    anyLib: boolean;
    outOf: Map<string, unknown>;
    kindOf: Map<string, unknown>;
    ids: string[];
  }
  type NameFn = (n: unknown, where: string) => boolean;
  /** check the parts (the first half: before the derived values are checked) — registers every output id as a name of the spec */
  function checkParts(
    spec: Obj,
    X: { E: string[]; name: NameFn; key: KeyFn; items: Obj | null; lib: Obj | null; cp: string[]; known: ReadonlySet<string> },
  ): PartsInfo {
    const { E, name, key, items, lib, cp, known } = X,
      L = PARTS_LIM;
    const R = resolveParts(spec, lib, E) ?? [];
    const info: PartsInfo = {
      cp,
      parts: [],
      scalars: [],
      series: [],
      scenes: [],
      sounds: [],
      anyLib: false,
      outOf: new Map(),
      kindOf: new Map(),
      ids: [],
    };
    let nOut = 0;
    for (const { i, w, p } of R) {
      if (!(typeof p.id === 'string' && BENCH_ID_RE.test(p.id)))
        E.push(`${w}.id must be an id (a letter, then letters, digits, _ or -; at most 32)`);
      else if (info.ids.includes(p.id)) E.push(`${w}.id: the part ${p.id} is listed twice`);
      else info.ids.push(p.id);
      const eng = p.engine,
        lib1 = isLib(eng);
      if (eng === DEFAULT_ENGINE) E.push(`${w}.engine: ${DEFAULT_ENGINE} computes nothing a part could add (use derived)`);
      else if (typeof eng !== 'string' || !known.has(eng))
        E.push(
          `${w}.engine: unknown engine ${qv(eng)} (this version knows ${[...known]
            .filter(e => e !== DEFAULT_ENGINE)
            .sort()
            .join(', ')})`,
        );
      if (lib1) info.anyLib = true;
      if (p.model !== undefined && !isObj(p.model)) E.push(`${w}.model must be an object`);
      const ins = p.inputs,
        inNames: string[] = [];
      if (ins !== undefined) {
        if (!(isObj(ins) && Object.keys(ins).length <= L.inputs))
          E.push(`${w}.inputs must be an object of at most ${L.inputs} inputs {name: number | expression | {series: "<output id>"}}`);
        else
          for (const k of Object.keys(ins)) {
            if (badName(k))
              E.push(`${w}.inputs: ${qv(k)} is not a usable name (a letter or _, then letters, digits, _; not pi, e or a reserved word)`);
            else inNames.push(k);
          }
      }
      const os = p.outputs,
        mine: PartInfo = { id: p.id, eng, lib: lib1, w, i, p, inNames };
      if (!(Array.isArray(os) && os.length >= 1 && os.length <= SPEC_LIM.outputs))
        E.push(`${w}.outputs must be a list of 1–${SPEC_LIM.outputs} {id, kind}`);
      else
        (os as unknown[]).forEach((o, j) => {
          const wo = `${w}.outputs[${j}]`,
            kinds: readonly string[] = lib1 ? LIB_KINDS : ['scalar', 'series'];
          if (!(isObj(o) && inA(kinds, o.kind))) {
            E.push(`${wo} must be {id, kind: ${kinds.join(' | ')}}`);
            return;
          }
          nOut++;
          if (name(o.id, wo + '.id')) {
            const id = s(o.id);
            (o.kind === 'scalar' ? info.scalars : o.kind === 'series' ? info.series : o.kind === 'scene' ? info.scenes : info.sounds).push(
              id,
            );
            info.outOf.set(id, p.id);
            info.kindOf.set(id, o.kind);
          }
        });
      const sub = partSpec(spec, p),
        names = [...cp, ...inNames.filter(n => !cp.includes(n))],
        E2: string[] = [];
      if (typeof eng === 'string' && known.has(eng)) {
        if (eng === CIRCUIT) checkCircuit(sub, names, E2);
        else if (isP6(eng)) checkEngine(sub, eng, names, E2);
        else if (lib1)
          checkLib(sub, eng, names, E2, (k, wk, nd) => {
            key(k, partMsg(wk, w), nd);
          });
        if (eng === WASM_ENGINE && items) {
          if (!env.wasm) E2.push('spec.model: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here');
          else E2.push(...env.wasm.checkModel(sub, items));
        }
      }
      E.push(...E2.map(m => partMsg(m, w)));
      info.parts.push(mine);
    }
    if (nOut > L.outputs) E.push(`spec.parts: at most ${L.outputs} outputs in all`);
    return info;
  }
  /** check the parts (the second half: inputs, coupling, the order, the bench), once every name of the spec is known */
  function checkPartLinks(
    spec: Obj,
    info: PartsInfo,
    X: { E: string[]; names: string[]; cp: string[]; seen: ReadonlySet<string>; key: KeyFn; name: NameFn },
  ): void {
    const { E, names, cp, seen, key, name } = X,
      L = PARTS_LIM,
      ids = info.ids;
    const c = spec.couple,
      inGroup = new Map<string, string>();
    const tol = (v: unknown, w: string): void => {
      if (v === undefined) E.push(`${w}.tol is required: a number > 0 (the largest relative change that counts as settled)`);
      else if (!(isNum(v) && v > 0)) E.push(`${w}.tol must be a number > 0`);
    };
    const maxIter = (v: unknown, w: string): void => {
      if (v !== undefined && !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= L.iter))
        E.push(`${w}.maxIter is a whole number 1–${L.iter}`);
    };
    const groupParts = (ps: unknown, w: string, what: string): string[] => {
      if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.parts && ps.every(x => typeof x === 'string'))) {
        E.push(`${w}.parts must be a list of 1–${L.parts} ids of spec.parts`);
        return [];
      }
      const ok: string[] = [];
      for (const x of ps) {
        if (!ids.includes(x)) E.push(`${w}.parts: ${qv(x)} is not a part of spec.parts`);
        else if (ok.includes(x)) E.push(`${w}.parts lists the part ${x} twice`);
        else if (inGroup.has(x)) E.push(`${w}.parts: the part ${x} is already in ${inGroup.get(x) ?? ''}`);
        else {
          ok.push(x);
          inGroup.set(x, what);
        }
      }
      return ok;
    };
    const initOf = (o: unknown, w: string, ps: readonly string[]): void => {
      if (o === undefined) return;
      if (!isObj(o)) {
        E.push(`${w}.init must be an object {output id: number} (the first guesses)`);
        return;
      }
      for (const [k, v] of Object.entries(o)) {
        if (!(info.outOf.has(k) && ps.includes(s(info.outOf.get(k))) && info.kindOf.get(k) === 'scalar'))
          E.push(`${w}.init.${k} must name a scalar output of a part of the ${w.endsWith('cosim') ? 'co-simulation' : 'loop'}`);
        else if (!isNum(v)) E.push(`${w}.init.${k} must be a number`);
      }
    };
    let cosimParts: string[] = [];
    if (c !== undefined && c !== 'chain') {
      if (!isObj(c)) E.push('spec.couple is "chain" or {loops?: […], cosim?: {…}}');
      else {
        unknownKeys(c, ['loops', 'cosim'], 'spec.couple', E);
        if (c.loops !== undefined) {
          if (!(Array.isArray(c.loops) && c.loops.length >= 1 && c.loops.length <= L.loops))
            E.push(`spec.couple.loops must be a list of 1–${L.loops} loops {parts, tol, maxIter?, relax?, init?}`);
          else
            (c.loops as unknown[]).forEach((l, i) => {
              const w = `spec.couple.loops[${i}]`;
              if (!isObj(l)) {
                E.push(`${w} must be an object {parts, tol, maxIter?, relax?, init?}`);
                return;
              }
              unknownKeys(l, ['parts', 'tol', 'maxIter', 'relax', 'init'], w, E);
              const ps = groupParts(l.parts, w, `the loop ${i}`);
              tol(l.tol, w);
              maxIter(l.maxIter, w);
              if (l.relax !== undefined && !(isNum(l.relax) && l.relax > 0 && l.relax <= 1))
                E.push(`${w}.relax is a number in (0, 1] (1 = no relaxation)`);
              initOf(l.init, w, ps);
            });
        }
        if (c.cosim !== undefined) {
          const w = 'spec.couple.cosim',
            sm = c.cosim;
          if (!isObj(sm)) E.push(`${w} must be an object {tEnd, dt, parts, order?, t0?, time?, init?, iterate?}`);
          else {
            unknownKeys(sm, ['tEnd', 'dt', 'parts', 'order', 't0', 'time', 'init', 'iterate'], w, E);
            cosimParts = groupParts(sm.parts, w, 'the co-simulation');
            for (const pid of cosimParts) {
              const q = info.parts.find(x => x.id === pid);
              if (q && typeof q.eng === 'string' && !STEPPERS.has(q.eng))
                E.push(
                  `${w}.parts: the engine ${q.eng} of the part ${pid} cannot be stepped in time (a co-simulation needs ${[...STEPPERS].sort().join(', ')}); couple it in a chain or a loop`,
                );
            }
            let te: number | null = null,
              dt: number | null = null;
            if (sm.tEnd === undefined) E.push(`${w}.tEnd is required (when the co-simulation ends)`);
            else te = numOrExpr(sm.tEnd, cp, `${w}.tEnd`, E, true);
            if (sm.dt === undefined) E.push(`${w}.dt is required (the macro step: how often the parts exchange their values)`);
            else dt = numOrExpr(sm.dt, cp, `${w}.dt`, E, true);
            const t0 = sm.t0 === undefined ? 0 : numOrExpr(sm.t0, cp, `${w}.t0`, E, false);
            if (isNum(te) && isNum(dt) && isNum(t0) && Math.ceil((te - t0) / dt - 1e-9) > L.macro)
              E.push(`${w}: (tEnd − t0) / dt is more than ${L.macro} macro steps`);
            if (isNum(te) && isNum(t0) && !(te > t0)) E.push(`${w}: tEnd must be after t0`);
            const order = sm.order;
            if (
              order !== undefined &&
              !(Array.isArray(order) && order.length === cosimParts.length && cosimParts.every(x => (order as unknown[]).includes(x)))
            )
              E.push(`${w}.order must list each part of the co-simulation once (the order they exchange in)`);
            if (sm.time !== undefined && name(sm.time, `${w}.time`)) info.series.push(s(sm.time));
            initOf(sm.init, w, cosimParts);
            if (sm.iterate !== undefined) {
              if (!isObj(sm.iterate)) E.push(`${w}.iterate must be an object {tol, maxIter?}`);
              else {
                unknownKeys(sm.iterate, ['tol', 'maxIter'], `${w}.iterate`, E);
                tol(sm.iterate.tol, `${w}.iterate`);
                maxIter(sm.iterate.maxIter, `${w}.iterate`);
              }
            }
          }
        }
      }
    }
    for (const q of info.parts) {
      const ins = isObj(q.p.inputs) ? q.p.inputs : {},
        co = cosimParts.includes(s(q.id));
      const nm = co
        ? [...names, ...[...info.outOf.keys()].filter(o => cosimParts.includes(s(info.outOf.get(o))) && !names.includes(o))]
        : names;
      for (const k of q.inNames) {
        const v = ins[k],
          wi = `${q.w}.inputs.${k}`;
        if (typeof v === 'string') {
          const m = exprProblem(v, nm, wi);
          if (m) E.push(m);
        } else if (isNum(v)) {
          /* a number */
        } else if (isObj(v)) {
          unknownKeys(v, ['series', 'points', 'stat'], wi, E);
          if (!(typeof v.series === 'string' && info.kindOf.get(v.series) === 'series' && info.outOf.get(v.series) !== q.id))
            E.push(`${wi}.series must name a series output of another part`);
          else if (co && cosimParts.includes(s(info.outOf.get(v.series))))
            E.push(`${wi}: the parts of a co-simulation exchange numbers at each step, not series (use the output's id in a formula)`);
          if (v.points !== undefined && !(Number.isInteger(v.points) && (v.points as number) >= 2 && (v.points as number) <= L.points))
            E.push(`${wi}.points is a whole number 2–${L.points} (a series input is at most ${L.points} points)`);
          if (v.stat !== undefined && !inA(STATS, v.stat)) E.push(`${wi}.stat is one of ${STATS.join(', ')}`);
          if (v.stat !== undefined && v.points !== undefined)
            E.push(`${wi}: stat makes a number of the series, points resamples it: one or the other`);
        } else E.push(`${wi} must be a number, an expression or {series: "<output id>"}`);
      }
    }
    const good = info.parts
      .filter((q, k) => typeof q.id === 'string' && info.ids.includes(q.id) && info.parts.findIndex(x => x.id === q.id) === k)
      .map(q => ({
        ...q.p,
        outputs: list(q.p.outputs).filter(o => isObj(o) && typeof o.id === 'string' && info.outOf.get(o.id) === q.id),
      }));
    for (const cy of partsOrder(spec, good).cycles)
      E.push(
        `spec.parts: ${cy.join(' → ')} depend on each other in a cycle: declare it in spec.couple.loops (a fixed point) or spec.couple.cosim (in time)`,
      );
    if (spec.bench != null) {
      const b = spec.bench,
        q = isObj(b) ? info.parts.find(x => x.id === b.part) : undefined;
      if (!isObj(b) || !q || typeof q.eng !== 'string' || !BENCH_ENGINES.has(q.eng))
        E.push(`spec.bench.part must be the id of a part whose engine takes measurements (${[...BENCH_ENGINES].sort().join(', ')})`);
      else {
        const sub = partSpec(spec, q.p),
          bb: MutObj = {};
        for (const k of Object.keys(b)) if (k !== 'part') bb[k] = b[k];
        sub.bench = bb;
        checkBench(sub, [...cp, ...q.inNames.filter(n => !cp.includes(n))], seen, E, key, q.eng);
      }
    }
  }

  /** checkSimSpec(spec, tables?, engines?, opts?) → errors of a sim-spec@1 spec. tables: {locale: {key: text}}; engines: the known
      engine ids (default ENGINES; the app passes the engines it has registered). opts.python: the spec of a py-module@1 activity
      (its outputs come from Python's step()). opts.items: {id: item} of the pack (a wasm@1 model names its module there; none = the
      model is not checked here). opts.parts: the pack's activities/_parts. */
  function checkSimSpec(
    spec: unknown,
    tables?: unknown,
    engines?: readonly string[] | null,
    opts?: { readonly python?: boolean; readonly items?: unknown; readonly parts?: unknown } | null,
  ): string[] {
    const py = !!opts?.python,
      items = opts && isObj(opts.items) ? opts.items : null;
    const E: string[] = [],
      L = SPEC_LIM;
    if (!isObj(spec)) return ['spec: a JSON object is required (activities/<id>/spec.json)'];
    if (utf8Length(JSON.stringify(spec)) > L.bytes) E.push(`spec: at most ${L.bytes / 1024} KB`);
    if (spec.format !== SPEC_FORMAT) E.push(`spec: format must be "${SPEC_FORMAT}"`);
    for (const k of Object.keys(spec)
      .filter(k => !SPEC_KEYS.has(k))
      .sort())
      E.push(`spec: unknown field ${qv(k)}`);
    const eng: unknown = py ? PY : 'engine' in spec ? spec.engine : DEFAULT_ENGINE,
      known: ReadonlySet<string> = engines ? new Set(engines) : ENGINES;
    if (py) {
      if ('engine' in spec) E.push('spec.engine: the outputs of a py-module@1 activity come from its Python step(); leave engine out');
      if ('model' in spec) E.push('spec.model: a py-module@1 activity has no engine model (its Python code is the model)');
    } else if (typeof eng !== 'string' || !known.has(eng))
      E.push(`spec: unknown engine ${qv(eng)} (this version knows ${[...known].sort().join(', ')})`);
    const PT = !py && 'parts' in spec;
    if (py && 'parts' in spec) E.push('spec.parts: a py-module@1 activity has no parts (its Python code is the model)');
    if (PT && typeof eng === 'string' && eng !== DEFAULT_ENGINE)
      E.push(`spec.engine: a spec with parts names the engine of each part (leave spec.engine out, or "${DEFAULT_ENGINE}")`);
    if (!PT && 'couple' in spec) E.push('spec.couple: coupling needs parts (spec.parts)');
    if (eng === DEFAULT_ENGINE && 'model' in spec) E.push('spec: model configures another engine; formula@1 has none');
    if (spec.model != null && !isObj(spec.model)) E.push('spec: model must be an object');
    const keys = new Set<string>(),
      seen = new Set<string>();
    const key: KeyFn = (k, where, need = false) => {
      if (k == null && !need) return;
      if (!(typeof k === 'string' && KEY_RE.test(k))) {
        E.push(`${where} must be a key of the activity's string tables`);
        return;
      }
      keys.add(k);
    };
    const name: NameFn = (n, where) => {
      if (badName(n)) {
        E.push(`${where}: ${qv(n)} is not a usable name (a letter or _, then letters, digits, _; not pi, e or a reserved word)`);
        return false;
      }
      const nn = s(n);
      if (seen.has(nn)) {
        E.push(`${where}: the name ${nn} is used twice`);
        return false;
      }
      seen.add(nn);
      return true;
    };
    const expr = (src: unknown, names: readonly string[], where: string): void => {
      const m = exprProblem(src, names, where);
      if (m) E.push(m);
    };
    const numfmt = (o: Obj, where: string): void => {
      if (o.unit != null && !(typeof o.unit === 'string' && o.unit.length <= L.unit))
        E.push(`${where}.unit must be a text of at most ${L.unit} characters`);
      if (o.format != null && !inA(NUM_FORMATS, o.format)) E.push(`${where}.format is one of ${NUM_FORMATS.join(', ')}`);
      if (o.digits != null && !(Number.isInteger(o.digits) && (o.digits as number) >= 1 && (o.digits as number) <= L.digits))
        E.push(`${where}.digits is a whole number 1–${L.digits}`);
    };
    key(spec.title, 'spec.title');
    key(spec.intro, 'spec.intro');
    const c = spec.consts;
    if (c != null) {
      if (!(isObj(c) && Object.keys(c).length <= L.consts)) E.push(`spec.consts must be an object of at most ${L.consts} numbers`);
      else for (const [k, v] of Object.entries(c)) if (name(k, 'spec.consts') && !isNum(v)) E.push(`spec.consts.${k} must be a number`);
    }
    const ps = spec.params;
    if (!(Array.isArray(ps) && ps.length >= 1 && ps.length <= L.params)) E.push(`spec.params must be a list of 1–${L.params} controls`);
    list(ps)
      .slice(0, L.params)
      .forEach((p, i) => {
        const w = `spec.params[${i}]`;
        if (!isObj(p)) {
          E.push(`${w} must be an object`);
          return;
        }
        name(p.id, w + '.id');
        key(p.label, w + '.label', true);
        const kd = p.kind;
        if (!inA(PARAM_KINDS, kd)) {
          E.push(`${w}.kind is one of ${PARAM_KINDS.join(', ')}`);
          return;
        }
        if (kd === 'slider' || kd === 'number') {
          const lo = p.min,
            hi = p.max,
            df = p.default;
          if (!(isNum(lo) && isNum(hi) && lo < hi)) {
            E.push(`${w}: min and max must be numbers, min < max`);
            return;
          }
          if (p.step != null && !(isNum(p.step) && p.step > 0)) E.push(`${w}.step must be a number > 0`);
          if (!(isNum(df) && lo <= df && df <= hi)) E.push(`${w}.default must be a number from min to max`);
          if (p.scale != null && !['lin', 'log'].includes(s(p.scale))) E.push(`${w}.scale is lin or log`);
          else if (p.scale === 'log' && lo <= 0) E.push(`${w}: a log scale needs min > 0`);
          numfmt(p, w);
        } else if (kd === 'toggle') {
          if (p.default != null && typeof p.default !== 'boolean') E.push(`${w}.default must be true or false`);
        } else {
          const ops = p.options;
          if (!(Array.isArray(ops) && ops.length >= 2 && ops.length <= L.options)) {
            E.push(`${w}.options must be a list of 2–${L.options} {value, label}`);
            return;
          }
          const vals: unknown[] = [];
          (ops as unknown[]).forEach((o, j) => {
            if (!(isObj(o) && isNum(o.value))) {
              E.push(`${w}.options[${j}] needs a number value`);
              return;
            }
            key(o.label, `${w}.options[${j}].label`, true);
            vals.push(o.value);
          });
          if (new Set(vals).size !== vals.length) E.push(`${w}.options: two options have the same value`);
          if (p.default != null && !vals.includes(p.default)) E.push(`${w}.default must be the value of one of the options`);
        }
      });
    const names = [...seen];
    const PI = PT
      ? checkParts(spec, { E, name, key, items, lib: opts && isObj(opts.parts) ? opts.parts : null, cp: [...names], known })
      : null;
    const ds = spec.derived;
    if (ds != null && !(Array.isArray(ds) && ds.length <= L.derived))
      E.push(`spec.derived must be a list of at most ${L.derived} {id, expr}`);
    list(ds)
      .slice(0, L.derived)
      .forEach((d, i) => {
        const w = `spec.derived[${i}]`;
        if (!isObj(d)) {
          E.push(`${w} must be an object {id, expr}`);
          return;
        }
        expr(d.expr, PI ? [...names, ...PI.scalars] : [...names], w + '.expr');
        if (name(d.id, w + '.id')) names.push(s(d.id));
      });
    const inNames = [...names];
    const os = spec.outputs,
      series: string[] = [],
      scenes: string[] = [],
      sounds: string[] = [],
      lib = PI ? PI.anyLib : isLib(eng);
    if (PI) {
      names.push(...PI.scalars);
      checkPartLinks(spec, PI, { E, names, cp: PI.cp, seen, key, name });
      series.push(...PI.series);
      scenes.push(...PI.scenes);
      sounds.push(...PI.sounds);
    }
    if (py && !(Array.isArray(os) && os.length)) E.push('spec.outputs: list what step() returns, at least one {id, kind: scalar | series}');
    if (os != null) {
      if (PT) E.push('spec.outputs: a spec with parts lists the outputs of each part (spec.parts[i].outputs)');
      else if (eng === DEFAULT_ENGINE) E.push('spec.outputs come from an engine; formula@1 has none (use derived)');
      else if (!(Array.isArray(os) && os.length <= L.outputs)) E.push(`spec.outputs must be a list of at most ${L.outputs} {id, kind}`);
      else
        (os as unknown[]).forEach((o, i) => {
          const w = `spec.outputs[${i}]`;
          const kinds: readonly string[] = lib ? LIB_KINDS : ['scalar', 'series'];
          if (!(isObj(o) && inA(kinds, o.kind))) {
            E.push(`${w} must be {id, kind: ${kinds.join(' | ')}}`);
            return;
          }
          if (name(o.id, w + '.id'))
            (o.kind === 'scalar' ? names : o.kind === 'series' ? series : o.kind === 'scene' ? scenes : sounds).push(s(o.id));
        });
    }
    const rs = spec.readouts;
    if (rs != null && !(Array.isArray(rs) && rs.length <= L.readouts))
      E.push(`spec.readouts must be a list of at most ${L.readouts} {label, expr}`);
    list(rs)
      .slice(0, L.readouts)
      .forEach((r, i) => {
        const w = `spec.readouts[${i}]`;
        if (!isObj(r)) {
          E.push(`${w} must be an object {label, expr}`);
          return;
        }
        key(r.label, w + '.label', true);
        expr(r.expr, names, w + '.expr');
        numfmt(r, w);
      });
    const pl = spec.plots;
    if (pl != null && !(Array.isArray(pl) && pl.length <= L.plots)) E.push(`spec.plots must be a list of at most ${L.plots} plots`);
    list(pl)
      .slice(0, L.plots)
      .forEach((p, i) => {
        const w = `spec.plots[${i}]`;
        if (!isObj(p) || !(lib ? ['function', 'series', 'scene', 'sound'] : ['function', 'series']).includes(s(p.kind))) {
          E.push(
            lib
              ? `${w} must be a plot {kind: function | series, x, y, series} or {kind: scene | sound, of}`
              : `${w} must be a plot {kind: function | series, x, y, series}`,
          );
          return;
        }
        key(p.title, w + '.title');
        if (p.kind === 'scene' || p.kind === 'sound') {
          unknownKeys(p, ['kind', 'title', 'of', 'height'], w, E);
          if (!inA(p.kind === 'scene' ? scenes : sounds, p.of)) E.push(`${w}.of must name a ${p.kind} output of the engine`);
          if (p.height != null && !(Number.isInteger(p.height) && (p.height as number) >= 120 && (p.height as number) <= 900))
            E.push(`${w}.height is a whole number 120–900 (px)`);
          return;
        }
        const x = isObj(p.x) ? p.x : null,
          y = p.y != null ? p.y : {};
        if (!x) {
          E.push(`${w}.x must be an object`);
          return;
        }
        if (!isObj(y)) {
          E.push(`${w}.y must be an object`);
          return;
        }
        for (const [ax, o] of [
          ['x', x],
          ['y', y],
        ] as const) {
          key(o.label, `${w}.${ax}.label`);
          numfmt(o, `${w}.${ax}`);
          if (o.scale != null && !['lin', 'log'].includes(s(o.scale))) E.push(`${w}.${ax}.scale is lin or log`);
          for (const b of ['min', 'max']) {
            const v = o[b];
            if (v == null) continue;
            if (typeof v === 'string') expr(v, names, `${w}.${ax}.${b}`);
            else if (!isNum(v)) E.push(`${w}.${ax}.${b} must be a number or an expression`);
          }
          if (isNum(o.min) && isNum(o.max) && !(o.min < o.max)) E.push(`${w}.${ax}: min must be below max`);
          if (o.scale === 'log' && isNum(o.min) && o.min <= 0) E.push(`${w}.${ax}: a log scale needs min > 0`);
        }
        const local = [...names];
        if (p.kind === 'function') {
          const xv = x.var;
          if (badName(xv) || seen.has(s(xv)))
            E.push(`${w}.x.var: ${qv(xv)} must be a new name for the x axis (not one of the spec's names)`);
          else local.push(s(xv));
          if (x.min == null || x.max == null) E.push(`${w}.x needs min and max`);
          const pts = p.points;
          if (pts != null && !(Number.isInteger(pts) && (pts as number) >= 2 && (pts as number) <= L.points))
            E.push(`${w}.points is a whole number 2–${L.points}`);
        } else if (!inA(series, x.series)) E.push(`${w}.x.series must name a series output of the engine`);
        let ss: unknown[] = list(p.series).slice();
        if (!(Array.isArray(p.series) && ss.length >= 1 && ss.length <= L.series)) {
          E.push(`${w}.series must be a list of 1–${L.series} lines`);
          ss = [];
        }
        ss.forEach((sr, j) => {
          const ws = `${w}.series[${j}]`;
          if (!isObj(sr)) {
            E.push(`${ws} must be an object`);
            return;
          }
          key(sr.label, ws + '.label');
          if (sr.style != null && !inA(LINE_STYLES, sr.style)) E.push(`${ws}.style is one of ${LINE_STYLES.join(', ')}`);
          if (p.kind === 'function') expr(sr.expr, local, ws + '.expr');
          else if (!inA(series, sr.y)) E.push(`${ws}.y must name a series output of the engine`);
        });
        let mk: unknown = p.marks;
        if (mk != null && !(Array.isArray(mk) && mk.length <= L.marks)) {
          E.push(`${w}.marks must be a list of at most ${L.marks} {axis, expr}`);
          mk = [];
        }
        list(mk).forEach((m, j) => {
          const wm = `${w}.marks[${j}]`;
          if (!(isObj(m) && (m.axis === 'x' || m.axis === 'y'))) {
            E.push(`${wm} must be {axis: x | y, expr, label?}`);
            return;
          }
          key(m.label, wm + '.label');
          expr(m.expr, names, wm + '.expr');
        });
      });
    if (eng === CIRCUIT) checkCircuit(spec, inNames, E);
    else if (isP6(eng)) checkEngine(spec, eng, inNames, E);
    else if (lib && !PT && typeof eng === 'string') checkLib(spec, eng, inNames, E, key);
    if (eng === WASM_ENGINE && items) {
      if (!env.wasm) E.push('spec.model: the WebAssembly checker (NoemaWasm, engine/src/44_activity_wasm.js) is not loaded here');
      else E.push(...env.wasm.checkModel(spec, items));
    }
    if (spec.bench != null && !PT) {
      if (typeof eng !== 'string' || !BENCH_ENGINES.has(eng))
        E.push(`spec.bench needs an engine that can take measurements (${[...BENCH_ENGINES].sort().join(', ')})`);
      else checkBench(spec, inNames, seen, E, key, eng);
    }
    if (isObj(tables) && Object.keys(tables).length)
      for (const k of [...keys].sort()) {
        const miss = Object.keys(tables)
          .filter(l => {
            const t = tables[l];
            return isObj(t) && !has(t, k);
          })
          .sort();
        if (miss.length) E.push(`spec: the string ${k} is missing in strings.${miss.join(', strings.')}`);
      }
    return E;
  }

  return { checkSimSpec, exprProblem, specNames, freeVars, partsPlan };
}
export type SimSpecChecks = ReturnType<typeof createSimSpec>;
