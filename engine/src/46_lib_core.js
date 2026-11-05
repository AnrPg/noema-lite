/* ===================== interactive activities — the shared core of the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md §1) =====================
   The library engines (ode@1, prob@1, graph@1, geom@1: 47–48_lib_*.js) are GENERAL engines: each covers a whole family of subjects
   (any system of equations, any distribution, any graph, any construction) instead of one domain. They share this core — the
   hexagon's inner ring:
     • the model checker: a declarative table walked with the same codes and messages as its Python twin (tools/enginelib.py walk),
     • numbers that may be expressions over the spec's names (`numx`), compiled with the app's NoemaExpr in the engine itself,
     • seeded randomness (mulberry32), statistics of a series (final, min, max, mean, pp, rms), thinning to the plot limit,
     • scenes: the drawings an engine returns (points, segments, circles, polygons, labels) for a plot of kind `scene`,
     • the adapter port: makeEngine(def) turns {id, checkSpec, run} into the {id, check, create, workerSource} that ACT.registerEngine
       takes (the same shape as circuit-mna@1 and the P6 engines); every run goes to a Worker whose source is NoemaExpr + this core +
       the engine module (Function.toString: the same code as on the page).
   Pure JS, no DOM, no learner text: codes and numbers only. Tests: node tests/enginelib.js. */
(function noemaLibCoreModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this module
  'use strict';
  const MAX_POINTS = 2000, MAX_SCENE = 2000;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;          // ids of model parts (nodes, objects, states)
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;        // names an expression can use (variables of an ODE)
  const KEY_RE = /^[a-z][a-zA-Z0-9_.-]{0,63}$/;           // keys of the activity's string tables (= packcheck ACT.KEY_RE)
  const RESERVED = ['t', 'n', 'pi', 'e', 'true', 'false'];
  function fail(code, extra) { const e = new Error('enginelib: ' + code); e.code = code; if (extra) Object.assign(e, extra); return e; }

  /* ---------- the model checker: a table of kinds, walked like rf@1's (the same messages as tools/enginelib.py) ----------
     kinds: pos · nonneg · fin · unit (0–1) · bool · int:a:b · enum:a|b · id · name · key · expr (a non-empty text) ·
            numx (a number or an expression) · ref (an id, resolved by the engine); a trailing "!" = required.
     shapes: {$obj: T} · {$list: T or kind, min?, max} · {$map: kind, max} (an object of names → kind) */
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  function checkKind(kind, v) {
    if (kind === 'bool') return typeof v === 'boolean';
    if (kind === 'id' || kind === 'ref') return typeof v === 'string' && ID_RE.test(v);
    if (kind === 'name') return typeof v === 'string' && NAME_RE.test(v) && !RESERVED.includes(v);
    if (kind === 'key') return typeof v === 'string' && KEY_RE.test(v);
    if (kind === 'expr') return typeof v === 'string' && v.trim() !== '';
    if (kind === 'numx') return isNum(v) || (typeof v === 'string' && v.trim() !== '');
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return typeof v === 'number' && Number.isInteger(v) && v >= +a && v <= +b; }
    if (kind.startsWith('enum:')) return typeof v === 'string' && kind.slice(5).split('|').includes(v);
    if (!isNum(v)) return false;
    return kind === 'pos' ? v > 0 : kind === 'nonneg' ? v >= 0 : kind === 'unit' ? v >= 0 && v <= 1 : true;
  }
  function kindMsg(kind) {
    if (kind === 'bool') return 'needs true or false';
    if (kind === 'id' || kind === 'ref') return 'needs an id (a letter, then letters, digits, _ or -; at most 32)';
    if (kind === 'name') return 'needs a name (a letter or _, then letters, digits, _; not t, n, pi, e, true or false)';
    if (kind === 'key') return 'needs a key of the string tables';
    if (kind === 'expr') return 'needs an expression';
    if (kind === 'numx') return 'needs a number or an expression';
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return `needs an integer from ${a} to ${b}`; }
    if (kind.startsWith('enum:')) return 'one of ' + kind.slice(5).split('|').join(', ');
    return { pos: 'needs a number > 0', nonneg: 'needs a number >= 0', unit: 'needs a number from 0 to 1', fin: 'needs a number' }[kind];
  }
  const join = (p, k) => (p ? p + '.' + k : k);
  function walkValue(v, kd, p, E, W) {
    if (typeof kd === 'string') {
      if (!checkKind(kd, v)) E(kd.startsWith('enum:') ? 'enum' : 'value', p, kindMsg(kd));
    } else if (kd.$obj) walk(v, kd.$obj, p, E, W);
    else if (kd.$map) {
      if (!isObj(v)) { E('format', p, 'not an object'); return; }
      const ks = Object.keys(v);
      if (ks.length > kd.max) { E('size', p, `more than ${kd.max} items`); return; }
      for (const k of ks) { if (!checkKind('name', k)) E('value', join(p, k), kindMsg('name')); else walkValue(v[k], kd.$map, join(p, k), E, W); }
    } else if (!Array.isArray(v)) E('format', p, 'not an array');
    else if (v.length > kd.max) E('size', p, `more than ${kd.max} items`);
    else if (kd.min && v.length < kd.min) E('size', p, `fewer than ${kd.min} items`);
    else v.forEach((x, i) => walkValue(x, kd.$list, `${p}[${i}]`, E, W));
  }
  /** walk(o, T, path, E, W): E(code, path, msg) an error, W(code, path, msg) a warning; codes format, value, enum, size, unknown-field */
  function walk(o, T, path, E, W) {
    if (!isObj(o)) { E('format', path, 'not an object'); return; }
    for (const k of Object.keys(o)) if (!has(T, k) && k !== 'meta') W('unknown-field', join(path, k), 'ignored');
    for (const k of Object.keys(T)) {
      let kd = T[k]; const p = join(path, k), v = o[k];
      if (typeof kd === 'string') {
        const must = kd.endsWith('!'); kd = must ? kd.slice(0, -1) : kd;
        if (v === undefined) { if (must) E('value', p, 'missing'); continue; }
      } else if (kd.$req) { if (v === undefined) { E('value', p, 'missing'); continue; } }
      else if (v === undefined) continue;
      walkValue(v, kd, p, E, W);
    }
  }
  /** a problem list with its two writers: const { P, E, W } = problems() */
  function problems() {
    const P = [];
    return { P, E: (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); }, W: (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); } };
  }
  const hasErrors = P => P.some(p => p.level === 'error');

  /** the common part of every library engine's outputs: [{id, kind: scalar | series | scene, of, …}]; each output's own fields are
      checked by the engine's `out(o, at, E, W)` → false when the output is not one the engine computes */
  function checkOutputs(spec, id, kinds, out, E, W) {
    const outs = isObj(spec) ? spec.outputs : undefined;
    if (!Array.isArray(outs)) { E('format', 'outputs', 'not an array'); return; }
    outs.forEach((o, i) => {
      const at = `outputs[${i}]`;
      if (!isObj(o)) { E('output', at, 'not an object'); return; }
      if (!kinds.includes(o.kind)) { E('output', at + '.kind', 'one of ' + kinds.join(', ')); return; }
      if (typeof o.of !== 'string' || !o.of) { E('output', at + '.of', 'names what ' + id + ' computes'); return; }
      out(o, at, E, W);
    });
  }

  /* ---------- numbers ---------- */
  const STATS = ['final', 'min', 'max', 'mean', 'pp', 'rms'];
  /** stats(values) → {final, min, max, mean, pp, rms} over the finite values (NaN when there are none) */
  function stats(a) {
    let n = 0, s = 0, s2 = 0, lo = Infinity, hi = -Infinity, last = NaN;
    for (const v of a) if (Number.isFinite(v)) { n++; s += v; s2 += v * v; if (v < lo) lo = v; if (v > hi) hi = v; last = v; }
    if (!n) return { final: NaN, min: NaN, max: NaN, mean: NaN, pp: NaN, rms: NaN };
    return { final: last, min: lo, max: hi, mean: s / n, pp: hi - lo, rms: Math.sqrt(s2 / n) };
  }
  /** thin(values, n) → at most n values, evenly picked (the first and the last kept) */
  function thin(a, n) {
    n = n || MAX_POINTS; if (a.length <= n) return a.slice();
    const out = []; for (let i = 0; i < n; i++) out.push(a[Math.round(i * (a.length - 1) / (n - 1))]);
    return out;
  }
  /** seeded randomness: the same seed draws the same numbers on every device */
  function hash32(s, seed) { let h = (seed ^ 0x811c9dc5) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function mulberry32(a) { a >>>= 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = r => { const u = Math.max(r(), 1e-300), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* ---------- expressions: compiled once per run with the app's NoemaExpr (the same evaluator as the spec's formulas) ---------- */
  const NX = () => root.NoemaExpr || null;
  /** cx(v) → (env) => number: a number stays a number; a text is a NoemaExpr formula (a failing one gives NaN, never throws) */
  function cx(v) {
    if (typeof v === 'number') return () => v;
    if (typeof v === 'boolean') return () => +v;
    if (typeof v !== 'string' || !NX()) return () => NaN;
    let f; try { f = NX().compile(v); } catch (e) { return () => NaN; }
    return env => { try { const r = f(env); return typeof r === 'boolean' ? +r : r; } catch (e) { return NaN; } };
  }

  /* ---------- scenes: what a plot of kind `scene` draws (engine/src/35_activity_sim.js drawScene) ----------
     {view: [x0, x1, y0, y1], items: [
        {k: 'pt',   x, y, r?, c?, key?, v?}                 a point (r in px; key: a label key of the string tables; v: a number shown)
        {k: 'seg',  x1, y1, x2, y2, c?, arrow?, w?, dash?, key?, v?}   a segment / an arrow (w: width in px)
        {k: 'circ', x, y, r, c?, fill?, dash?}              a circle (r in model units)
        {k: 'poly', pts: [x, y, x, y, …], c?, fill?, closed?, dash?}
        {k: 'txt',  x, y, key?, v?, c?} ]}                  a label at a place
     c is a role, never a colour: base · muted · hi · ok · bad · warn · info (the theme maps it); y grows upwards. */
  const ROLES = ['base', 'muted', 'hi', 'ok', 'bad', 'warn', 'info'];
  function scene(view) {
    const items = [];
    const fin = (...a) => a.every(Number.isFinite);
    const push = it => { if (items.length < MAX_SCENE) items.push(it); };
    return {
      items, view,
      pt(x, y, o) { if (fin(x, y)) push({ k: 'pt', x, y, ...(o || {}) }); },
      seg(x1, y1, x2, y2, o) { if (fin(x1, y1, x2, y2)) push({ k: 'seg', x1, y1, x2, y2, ...(o || {}) }); },
      circ(x, y, r, o) { if (fin(x, y, r) && r >= 0) push({ k: 'circ', x, y, r, ...(o || {}) }); },
      poly(pts, o) { if (pts.length >= 4 && pts.every(Number.isFinite)) push({ k: 'poly', pts, ...(o || {}) }); },
      txt(x, y, o) { if (fin(x, y)) push({ k: 'txt', x, y, ...(o || {}) }); },
      done() { return { view: view.slice(), items: items.slice() }; },
    };
  }
  /** the bounding view [x0, x1, y0, y1] of points with a margin (never empty) */
  function fitView(xs, ys, margin) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]); }
    if (!Number.isFinite(x0)) return [-1, 1, -1, 1];
    const w = Math.max(x1 - x0, y1 - y0, 1e-9), m = (margin == null ? 0.12 : margin) * w;
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }

  /* ---------- the adapter port: an engine of the library → what ACT.registerEngine takes ----------
     def = { id, global (its window name), checkSpec(spec) → problems, run(spec, env, {seed}) → {scalars, series, scenes}, module (the
     engine module's function, for the Worker) }. The worker gets the spec once and then the inputs (consts, params, derived) of each
     run; outputs are picked by the spec's outputs: scalar → a number, series → an array (≤ 2000), scene → a scene object, sound → {notes, wave?, partials?}. */
  function pick(spec, res) {
    const r = {};
    for (const o of (spec && spec.outputs) || []) {
      if (!o || typeof o.id !== 'string') continue;
      const v = res && res.out ? res.out[o.id] : undefined;
      if (o.kind === 'series') r[o.id] = Array.isArray(v) ? thin(v, MAX_POINTS) : [];
      else if (o.kind === 'scene') r[o.id] = isObj(v) ? v : { view: [-1, 1, -1, 1], items: [] };
      else if (o.kind === 'sound') r[o.id] = isObj(v) && Array.isArray(v.notes) ? { ...v, notes: v.notes.slice(0, 512) } : { notes: [] };   // ≤ 512 notes (docs/INTERACTIVE_LIBRARY.md §1.4)
      else r[o.id] = typeof v === 'number' || typeof v === 'boolean' ? v : NaN;
    }
    return r;
  }
  function makeEngine(def) {
    const simEngine = {
      create(spec, opts) {
        const seed = ((opts && opts.seed) >>> 0) || 1;
        const prepared = def.prepare ? def.prepare(spec) : null;   // the model compiled once (its formulas through NoemaExpr)
        let key = null, res = null;
        return {
          run(inp) {
            const env = {};
            for (const [k, v] of Object.entries(inp || {})) if (typeof v === 'number' || typeof v === 'boolean') env[k] = v;
            const kk = JSON.stringify(env);
            if (kk !== key) { key = kk; try { res = def.run(spec, env, { seed, prepared }); } catch (e) { res = null; } }
            return pick(spec, res);
          },
        };
      },
    };
    const engine = {
      id: def.id,
      check: spec => def.checkSpec(spec).filter(p => p.level === 'error').map(p => `${p.path}: ${p.msg}`),
      create: (spec, opts) => simEngine.create(spec, opts),
      ...(def.scenes ? { scenes: true } : {}),
    };
    return { engine, simEngine };
  }
  /** the Worker source of a library engine: NoemaExpr, this core, then the engine module; it sets self.noemaEngine */
  function workerSource(moduleFn, global) {
    const nx = NX() && typeof NX().source === 'function' ? NX().source() : '';
    return nx + '\n;(' + noemaLibCoreModule.toString() + ')(self);\n;(' + moduleFn.toString() + ')(self);\nself.noemaEngine = self.' + global + '.simEngine;';
  }
  const source = () => '(' + noemaLibCoreModule.toString() + ')(self);';

  root.NoemaLibCore = Object.freeze({
    MAX_POINTS, MAX_SCENE, ID_RE, NAME_RE, KEY_RE, RESERVED: Object.freeze(RESERVED.slice()), STATS: Object.freeze(STATS.slice()), ROLES: Object.freeze(ROLES.slice()),
    isObj, has, isNum, fail, checkKind, kindMsg, walk, problems, hasErrors, checkOutputs,
    stats, thin, hash32, mulberry32, gauss, cx, scene, fitView, makeEngine, workerSource, source,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
