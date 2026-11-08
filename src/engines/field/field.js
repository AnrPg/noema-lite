/* ===================== field@1 — fields on 1-D and 2-D grids, and cellular automata (docs/library/field.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md §1): how a quantity spreads, travels, waves, reacts or settles in
   space and time on a uniform grid (≤ 200 × 200 nodes), and the classic cellular automata.
     • heat / diffusion u_t = D∇²u + s: explicit FTCS with its stability limit r ≤ ½, backward Euler, Crank–Nicolson (1-D, Thomas),
       Peaceman–Rachford ADI (2-D) (Crank & Nicolson 1947; Peaceman & Rachford 1955; Morton & Mayers 2005 ch. 2–3);
     • advection u_t + ∇·(v u) = s in conservation form: first-order upwind, Lax–Wendroff, Lax–Friedrichs, the (unstable) centred
       FTCS, and high-resolution flux-limited schemes minmod, van Leer, superbee, MC (Sweby 1984; LeVeque 2002 ch. 4, 6, 19
       dimensional splitting); advection–diffusion by Lie splitting;
     • wave u_tt + γu_t = c²∇²u + s by leapfrog, its CFL limit c·dt·√Σh⁻² ≤ 1 and its exactly conserved discrete energy
       (Courant, Friedrichs & Lewy 1928; Strikwerda 2004 §8.2);
     • reaction–diffusion: Gray–Scott (Pearson 1993), FitzHugh–Nagumo (FitzHugh 1961; Nagumo et al. 1962), Fisher–KPP (Fisher 1937;
       Kolmogorov, Petrovsky & Piskunov 1937; front speed 2√(rD)), Schnakenberg 1979, Brusselator (Prigogine & Lefever 1968), or custom
       kinetics in NoemaExpr; the Turing conditions and the fastest-growing wavelength (Turing 1952; Murray 2003 vol. II §2.3);
     • Poisson −∇²u = s (and Laplace) by Jacobi, Gauss–Seidel and SOR with the optimal ω (Young 1954), stopped by the residual;
     • cellular automata: elementary (Wolfram 1983 numbering), Life-like B/S rules (Gardner 1970), Greenberg & Hastings 1978 excitable
       media, the abelian sandpile (Bak, Tang & Wiesenfeld 1987; Dhar 1990), forest fire (Drossel & Schwabl 1992); synchronous or
       random-sequential update.
   Boundary conditions Dirichlet, Neumann, Robin, periodic (NoemaSpaceKit ghost nodes); sources and sinks; fixed or insulated
   obstacles; probes; conservation checks; events (threshold crossings in space–time) and interrupts that change model variables at
   a time or an event (the NoemaSimKit calendar). Stability is checked before and during a run: a CFL / von Neumann violation is a code
   (unstable, cfl) and the run gives NaN unless the spec asks to see the instability (allowUnstable) — never silent.
   Pure, deterministic per seed (NoemaSimKit streams), bounded (≤ 1e8 node-steps, ≤ 3e6 per-node formula evaluations), never throws.
   Tests: node tests/lib_field.js. */
import NoemaLibCore from '../kernel/core.js';
import NoemaExpr from '../kernel/simexpr.ts';
import NoemaSimKit from '../kernel/simkit.js';
import NoemaSpaceKit from '../kernel/space.js';
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this module
  const C = NoemaLibCore, S = NoemaSpaceKit;
  const SK = () => NoemaSimKit;   // the time / randomness / output-analysis kernel (src/engines/kernel/simkit.js, loaded before this file)
  const ID = 'field@1';
  const EQUATIONS = ['heat', 'advection', 'advdiff', 'wave', 'rd', 'poisson', 'ca'];
  const ADV = ['upwind', 'laxwendroff', 'laxfriedrichs', 'centred', 'minmod', 'vanleer', 'superbee', 'mc'];
  const METHODS = { heat: ['ftcs', 'btcs', 'cn', 'adi'], advection: ADV, advdiff: ADV, wave: ['leapfrog'], rd: ['ftcs'], poisson: ['sor', 'gs', 'jacobi'], ca: [] };
  const DEFAULT_METHOD = { heat: 'ftcs', advection: 'vanleer', advdiff: 'vanleer', wave: 'leapfrog', rd: 'ftcs', poisson: 'sor' };
  const ALL_METHODS = ['ftcs', 'btcs', 'cn', 'adi', ...ADV, 'leapfrog', 'sor', 'gs', 'jacobi'];
  const PRESETS = { grayscott: { F: 0.04, k: 0.06 }, fhn: { a: 0.7, b: 0.8, eps: 0.08, I: 0 }, fisher: { r: 1 }, schnakenberg: { a: 0.1, b: 0.9, gamma: 1 }, brusselator: { A: 1, B: 3 }, custom: {} };
  const KINETICS = Object.keys(PRESETS);
  const CA_RULES = ['elementary', 'life', 'gh', 'sandpile', 'forestfire'];
  const STATS = ['max', 'min', 'mean', 'total', 'energy', 'l2'];
  const CODES = ['unstable', 'cfl', 'blow-up', 'budget', 'nan', 'grid', 'no-converge', 'incompatible', 'dt-auto', 'overshoot', 'mass-drift', 'cn-oscillation',
    'event-limit', 'stopped', 'front-not-found', 'unknown-steady', 'not-turing', 'period-not-found', 'nine-point-dx', 'topple-limit', 'kernel'];
  const FATAL = ['unstable', 'blow-up', 'budget', 'nan', 'grid', 'kernel'];
  const MAX_WORK = 1e8, MAX_EXPR = 3e6, MAX_EVENTS = 2000, MAX_ITER = 100000, MAX_TOPPLE = 2e7, DEF_STEPS = 200000;
  const SERIES = ['x', 'y', 't', 'profile', 'probe', 'stat', 'front', 'residual', 'population', 'avalanche', 'eventTime'];
  const SCALARS = ['final', 'at', 'probe', 'eventTime', 'eventCount', 'frontSpeed', 'drift', 'cfl', 'r', 'dtMax', 'dt', 'gain', 'iterations', 'residual', 'error',
    'wavelength', 'turing', 'turingK', 'turingWavelength', 'steps', 'population', 'density', 'cell', 'avalancheMean', 'avalancheTau', 'flag', 'ok'];
  const SCENES = ['heatmap', 'spacetime'];

  /* ---------- the model checker (the same table and messages as tools/lib_field.py) ---------- */
  const SIDE = { type: 'enum:' + S.BC_TYPES.join('|'), value: 'numx', a: 'numx', b: 'numx' };
  const BC = { $obj: { all: { $obj: SIDE }, left: { $obj: SIDE }, right: { $obj: SIDE }, bottom: { $obj: SIDE }, top: { $obj: SIDE } } };
  const SHAPE = { shape: 'enum:point|rect|circle|all!', x: 'numx', y: 'numx', r: 'numx', x0: 'numx', x1: 'numx', y0: 'numx', y1: 'numx' };
  const CA_T = { rule: 'enum:' + CA_RULES.join('|') + '!', code: 'int:0:255', bs: 'expr', states: 'int:3:16', threshold: 'int:1:8', p: 'numx', f: 'numx', density: 'numx',
    init: 'enum:random|single|cells', cells: { $list: { $list: 'fin', min: 1, max: 2 }, max: 2000 }, neighbourhood: 'enum:moore|vonneumann', wrap: 'bool',
    update: 'enum:sync|async', steps: 'int:1:5000', drop: 'enum:centre|random', pile: 'int:0:1000000' };
  const TABLE = {
    dim: 'int:1:2', grid: { $req: true, $obj: { nx: 'int:2:2000!', ny: 'int:2:200', x0: 'numx', x1: 'numx', y0: 'numx', y1: 'numx' } },
    equation: 'enum:' + EQUATIONS.join('|') + '!', method: 'enum:' + ALL_METHODS.join('|'),
    D: 'numx', Dv: 'numx', vx: 'numx', vy: 'numx', c: 'numx', damping: 'numx',
    kinetics: 'enum:' + KINETICS.join('|'), kp: { $map: 'numx', max: 12 }, reaction: { $map: 'expr', max: 2 },
    init: 'numx', initV: 'numx', noise: { $obj: { amp: 'numx!', field: 'enum:u|v' } }, source: 'numx',
    sources: { $list: { $obj: Object.assign({}, SHAPE, { rate: 'numx!' }) }, max: 8 },
    obstacles: { $list: { $obj: Object.assign({}, SHAPE, { value: 'numx' }) }, max: 8 },
    bc: BC, bcV: BC, vars: { $map: 'numx', max: 12 },
    tEnd: 'numx', dt: 'numx', safety: 'unit', maxSteps: 'int:1:200000', points: 'int:2:2000', frames: 'int:2:200', allowUnstable: 'bool', nine: 'bool',
    probes: { $list: { $obj: { id: 'id!', at: 'enum:point|line|area!', x: 'numx', y: 'numx', x0: 'numx', x1: 'numx', y0: 'numx', y1: 'numx', stat: 'enum:mean|max|min|total', field: 'enum:u|v' } }, max: 8 },
    front: { $obj: { level: 'numx!', y: 'numx', field: 'enum:u|v' } },
    events: { $list: { $obj: { id: 'id!', of: 'enum:max|min|mean|total|probe|front!', probe: 'id', field: 'enum:u|v', level: 'numx!', dir: 'int:-1:1', stop: 'bool' } }, max: 8 },
    interrupts: { $list: { $obj: { at: 'numx', on: 'id', set: { $req: true, $map: 'numx', max: 12 } } }, max: 8 },
    solver: { $obj: { tol: 'pos', maxIter: 'int:1:100000', omega: 'numx' } },
    ca: { $obj: CA_T },
  };
  const OUT_FIELDS = { field: 'enum:u|v', t: 'numx', x: 'numx', y: 'numx', probe: 'id', stat: 'enum:' + STATS.join('|'), event: 'id', nth: 'int:-2000:2000', expr: 'expr', norm: 'enum:l2|max', code: 'enum:' + CODES.join('|'), levels: 'int:2:5', contours: 'int:0:8' };
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const list = v => (Array.isArray(v) ? v : []);
  const objs = v => list(v).filter(isObj);
  const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
  const okName = v => C.checkKind('name', v);
  const LOCAL = ['x', 'y', 'u', 'v'];
  function specNames(spec) {
    const s = [];
    if (isObj(spec.consts)) for (const k of Object.keys(spec.consts)) s.push(k);
    for (const p of objs(spec.params)) if (typeof p.id === 'string') s.push(p.id);
    for (const d of objs(spec.derived)) if (typeof d.id === 'string') s.push(d.id);
    return s;
  }
  const varNames = m => (isObj(m.vars) ? Object.keys(m.vars).filter(okName) : []);
  const kpNames = m => { const k = typeof m.kinetics === 'string' && PRESETS[m.kinetics] ? m.kinetics : null; const a = k ? Object.keys(PRESETS[k]) : []; if (isObj(m.kp)) for (const n of Object.keys(m.kp)) if (okName(n) && !a.includes(n)) a.push(n); return a; };
  /** an output read at a time t of the run (a snapshot): a profile, a heat map, a value at a point, a final statistic, an error, a probe */
  const atTime = o => !!o.tc && (o.of === 'profile' || o.of === 'heatmap' || (o.kind === 'scalar' && ['at', 'final', 'error', 'probe'].includes(o.of)));
  const twoFields = m => m.equation === 'rd' && (m.kinetics === 'custom' ? has(m.reaction, 'v') : m.kinetics !== 'fisher' && typeof m.kinetics === 'string');

  function checkShape(o, w, dim, E, allowAll) {
    const sh = o.shape;
    if (sh === 'all') { if (!allowAll) E('shape', w + '.shape', 'all is for sources'); return; }
    if (sh === 'point') { if (o.x == null) E('shape', w + '.x', 'a point needs x'); if (dim === 2 && o.y == null) E('shape', w + '.y', 'a point on a 2-D grid needs y'); }
    if (sh === 'rect') { for (const k of dim === 2 ? ['x0', 'x1', 'y0', 'y1'] : ['x0', 'x1']) if (o[k] == null) E('shape', w + '.' + k, 'a rect needs x0, x1' + (dim === 2 ? ', y0, y1' : '')); }
    if (sh === 'circle') { if (dim !== 2) E('shape', w + '.shape', 'a circle is for a 2-D grid (use rect on a line)'); else for (const k of ['x', 'y', 'r']) if (o[k] == null) E('shape', w + '.' + k, 'a circle needs x, y, r'); }
  }
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    if (!isObj(spec)) { E('format', '', 'not an object'); return P; }
    const m = spec.model;
    C.walk(m, TABLE, 'model', E, W);
    const kinds = ['scalar', 'series', 'scene'];
    if (!isObj(m)) { C.checkOutputs(spec, ID, kinds, () => {}, E, W); return P; }
    const dim = m.dim === 2 ? 2 : 1, eq = typeof m.equation === 'string' && EQUATIONS.includes(m.equation) ? m.equation : null;
    if (dim === 2 && isObj(m.grid) && Number.isInteger(m.grid.nx) && m.grid.nx > 200) E('value', 'model.grid.nx', 'a 2-D grid has at most 200 × 200 nodes');
    if (dim === 1) {
      if (isObj(m.grid)) for (const k of ['ny', 'y0', 'y1']) if (m.grid[k] != null) E('value', 'model.grid.' + k, 'only a 2-D grid (dim 2) has ny, y0, y1');
      for (const b of ['bc', 'bcV']) if (isObj(m[b])) for (const k of ['bottom', 'top']) if (m[b][k] != null) E('bc', `model.${b}.${k}`, 'a 1-D grid has only left and right');
      if (m.vy != null) E('value', 'model.vy', 'only a 2-D grid has vy');
      if (m.nine != null) E('value', 'model.nine', 'the 9-point Laplacian is for a 2-D grid');
    }
    if (eq) {
      const meth = typeof m.method === 'string' ? m.method : null;
      if (eq === 'ca') { if (meth) E('method', 'model.method', 'a cellular automaton has no method (model.ca.update)'); }
      else if (meth && !METHODS[eq].includes(meth)) E('method', 'model.method', `${eq} is solved by: ${METHODS[eq].join(', ')}`);
      if (eq === 'heat' && dim === 2 && (meth === 'btcs' || meth === 'cn')) E('method', 'model.method', 'on a 2-D grid the implicit heat step is adi (Peaceman–Rachford)');
      if (eq === 'heat' && dim === 1 && meth === 'adi') E('method', 'model.method', 'adi is for a 2-D grid (on a line use cn or btcs)');
      const need = (k, msg) => { if (m[k] == null) E('value', 'model.' + k, msg); };
      if (['heat', 'advdiff', 'rd'].includes(eq)) need('D', `missing (${eq} needs the diffusion coefficient D)`);
      if (eq === 'advection' || eq === 'advdiff') need('vx', 'missing (the velocity: vx' + (dim === 2 ? ', vy' : '') + ')');
      if (eq === 'wave') need('c', 'missing (the wave speed c)');
      if (eq === 'rd') {
        need('kinetics', 'missing (' + KINETICS.join(', ') + ')');
        if (m.kinetics === 'custom') { if (!has(m.reaction, 'u')) E('value', 'model.reaction.u', 'missing (custom kinetics: reaction {u, v?})'); }
        else if (m.reaction != null) E('value', 'model.reaction', 'only custom kinetics take reaction');
        if (isObj(m.reaction)) for (const k of Object.keys(m.reaction)) if (k !== 'u' && k !== 'v') E('value', 'model.reaction.' + k, 'the fields are u and v');
        if (twoFields(m)) need('Dv', 'missing (the diffusion coefficient of v)');
        if (isObj(m.kp) && typeof m.kinetics === 'string' && m.kinetics !== 'custom' && PRESETS[m.kinetics]) for (const k of Object.keys(m.kp)) if (okName(k) && !has(PRESETS[m.kinetics], k)) E('value', 'model.kp.' + k, `not a parameter of ${m.kinetics} (its parameters: ${Object.keys(PRESETS[m.kinetics]).join(', ')})`);
      } else for (const k of ['kinetics', 'kp', 'reaction', 'Dv', 'bcV']) if (m[k] != null) E('value', 'model.' + k, 'only reaction–diffusion (rd) has ' + k);
      if (eq === 'ca') {
        if (!isObj(m.ca)) E('value', 'model.ca', 'missing (the automaton: rule, …)');
        else {
          const ca = m.ca, r = ca.rule;
          if (r === 'elementary') { if (dim !== 1) E('value', 'model.dim', 'an elementary automaton is 1-D'); if (ca.code == null) E('value', 'model.ca.code', 'missing (the Wolfram rule number 0–255)'); }
          else if (typeof r === 'string' && CA_RULES.includes(r) && dim !== 2) E('value', 'model.dim', `the ${r} automaton is 2-D`);
          if (r === 'life') { if (ca.bs == null) E('value', 'model.ca.bs', 'missing (B/S notation, e.g. B3/S23)'); else if (typeof ca.bs === 'string' && !/^B[0-8]*\/S[0-8]*$/.test(ca.bs)) E('value', 'model.ca.bs', 'B/S notation: B then the birth counts, / S then the survival counts (B3/S23)'); }
          if (r === 'forestfire') for (const k of ['p', 'f']) if (ca[k] == null) E('value', 'model.ca.' + k, 'missing (forest fire: growth p and lightning f)');
          if (ca.init === 'cells' && ca.cells == null) E('value', 'model.ca.cells', 'missing (the cells set to 1)');
          list(ca.cells).forEach((c, i) => { if (Array.isArray(c) && c.length !== dim) E('value', `model.ca.cells[${i}]`, dim === 2 ? 'needs [i, j]' : 'needs [i]'); });
          if (r !== 'sandpile') for (const k of ['drop', 'pile']) if (ca[k] != null) E('value', 'model.ca.' + k, 'only the sandpile has ' + k);
          const steps = Number.isInteger(ca.steps) ? ca.steps : 100, nx = isObj(m.grid) && Number.isInteger(m.grid.nx) ? m.grid.nx : 2, ny = dim === 2 ? (isObj(m.grid) && Number.isInteger(m.grid.ny) ? m.grid.ny : nx) : 1;
          if (nx * ny * steps > 2e7) E('budget', 'model.ca.steps', 'cells × steps is more than 20 000 000');
        }
        for (const k of ['bc', 'events', 'interrupts', 'probes', 'front', 'tEnd', 'dt']) if (m[k] != null) E('value', 'model.' + k, 'not for a cellular automaton');
      } else {
        if (m.ca != null) E('value', 'model.ca', 'only a cellular automaton (equation ca) has ca');
        if (eq === 'poisson') {
          for (const k of ['tEnd', 'dt', 'events', 'interrupts']) if (m[k] != null) E('value', 'model.' + k, 'poisson is solved by iteration, not in time');
        } else if (m.tEnd == null) E('value', 'model.tEnd', 'missing');
        if (eq !== 'poisson' && m.solver != null) E('value', 'model.solver', 'only poisson iterates');
      }
      if (m.nine && !((eq === 'heat' && (!meth || meth === 'ftcs')) || eq === 'rd' || eq === 'poisson' && false)) E('value', 'model.nine', 'the 9-point Laplacian goes with explicit heat (ftcs) or rd');
      if (m.initV != null && !(eq === 'wave' || twoFields(m))) E('value', 'model.initV', 'only wave (u_t at t = 0) and two-field rd (v) have initV');
      if (m.damping != null && eq !== 'wave') E('value', 'model.damping', 'only the wave equation has damping');
    }
    // boundary conditions: periodic on both sides of an axis, robin with a and b
    for (const b of ['bc', 'bcV']) if (isObj(m[b])) {
      const B = m[b], side = s => (isObj(B[s]) ? B[s] : isObj(B.all) ? B.all : null), ty = s => (side(s) && side(s).type) || null;
      for (const [p, q] of [['left', 'right'], ['bottom', 'top']]) { if (dim === 1 && p === 'bottom') continue; if ((ty(p) === 'periodic') !== (ty(q) === 'periodic')) E('bc', `model.${b}.${ty(p) === 'periodic' ? q : p}`, `periodic goes on both ${p} and ${q}`); }
      for (const s of ['all', 'left', 'right', 'bottom', 'top']) if (isObj(B[s])) {
        const o = B[s];
        if (o.type === 'robin' && (o.a == null || o.b == null)) E('bc', `model.${b}.${s}`, 'robin needs a and b (a·u + b·∂u/∂n = value)');
        if (o.type !== 'robin' && (o.a != null || o.b != null)) E('bc', `model.${b}.${s}`, 'only robin has a and b');
        if (o.type === 'periodic' && o.value != null) E('bc', `model.${b}.${s}.value`, 'periodic has no value');
      }
    }
    objs(m.sources).forEach((o, i) => checkShape(o, `model.sources[${i}]`, dim, E, true));
    objs(m.obstacles).forEach((o, i) => checkShape(o, `model.obstacles[${i}]`, dim, E, false));
    // names: the model's variables against the spec and the field's own names
    const vn = varNames(m), sn = specNames(spec);
    for (const v of vn) { if (LOCAL.includes(v)) E('dup-name', 'model.vars', `the name ${v} is a name of the field (x, y, u, v)`); else if (sn.includes(v)) E('dup-name', 'model.vars', `the name ${v} is also a name of the spec (consts, params, derived)`); }
    const two = twoFields(m);
    const probes = objs(m.probes).map(p => p.id).filter(x => typeof x === 'string');
    probes.forEach((x, i) => { if (probes.indexOf(x) !== i) E('dup-name', 'model.probes', `the probe ${x} is listed twice`); });
    objs(m.probes).forEach((p, i) => {
      const w = `model.probes[${i}]`;
      if (p.at === 'point') { if (p.x == null) E('shape', w + '.x', 'a point needs x'); if (dim === 2 && p.y == null) E('shape', w + '.y', 'a point on a 2-D grid needs y'); }
      else if (p.at === 'line' || p.at === 'area') for (const k of dim === 2 ? ['x0', 'x1', 'y0', 'y1'] : ['x0', 'x1']) if (p[k] == null) E('shape', `${w}.${k}`, `a ${p.at} needs x0, x1` + (dim === 2 ? ', y0, y1' : ''));
      if (p.field === 'v' && !two) E('value', w + '.field', 'only two-field rd has v');
    });
    if (isObj(m.front) && m.front.field === 'v' && !two) E('value', 'model.front.field', 'only two-field rd has v');
    const evs = objs(m.events).map(e => e.id).filter(x => typeof x === 'string');
    evs.forEach((x, i) => { if (evs.indexOf(x) !== i) E('dup-name', 'model.events', `the event ${x} is listed twice`); });
    objs(m.events).forEach((e, i) => {
      const w = `model.events[${i}]`;
      if (e.of === 'probe' && !probes.includes(e.probe)) E('event', w + '.probe', 'a probe of model.probes');
      if (e.of !== 'probe' && e.probe != null) E('event', w + '.probe', 'goes with of: probe');
      if (e.of === 'front' && !isObj(m.front)) E('event', w + '.of', 'needs model.front');
      if (e.field === 'v' && !two) E('value', w + '.field', 'only two-field rd has v');
    });
    objs(m.interrupts).forEach((it, i) => {
      const w = `model.interrupts[${i}]`;
      if ((it.at == null) === (it.on == null)) E('event', w, 'needs at (a time) or on (an event), not both');
      if (it.on != null && !evs.includes(it.on)) E('event', w + '.on', 'an event of model.events');
      if (isObj(it.set)) for (const k of Object.keys(it.set)) if (okName(k) && !vn.includes(k)) E('value', `${w}.set.${k}`, 'not a variable of model.vars');
    });
    // outputs
    const evIds = evs;
    const need = (cond, at, f, msg) => { if (!cond) E('output', at + '.' + f, msg); return cond; };
    C.checkOutputs(spec, ID, kinds, (o, at) => {
      const of = o.of, kd = o.kind, known = kd === 'series' ? SERIES : kd === 'scalar' ? SCALARS : SCENES;
      if (!known.includes(of)) { E('output', at + '.of', `${ID} computes as a ${kd}: ${known.join(', ')}`); return; }
      for (const [f, k] of Object.entries(OUT_FIELDS)) if (o[f] != null && !C.checkKind(k, o[f])) E('output', at + '.' + f, C.kindMsg(k));
      if (o.field === 'v' && !two) E('output', at + '.field', 'only two-field rd has v');
      const isCA = eq === 'ca', isP = eq === 'poisson';
      if (of === 'y') need(dim === 2, at, 'of', 'y is for a 2-D grid');
      if (of === 'profile' && dim === 2) need((o.y == null) !== (o.x == null), at, 'y', 'a 2-D profile needs y (a row) or x (a column), one of them');
      if (['profile', 'heatmap', 'at', 'final', 'error', 'probe'].includes(of)) { if (o.t != null) need(!isP && !isCA, at, 't', 'a time is for an equation in time'); }
      if (of === 'probe') need(probes.includes(o.probe), at, 'probe', 'a probe of model.probes');
      if ((of === 'stat' && kd === 'series') || of === 'final') need(STATS.includes(o.stat), at, 'stat', 'one of ' + STATS.join(', '));
      if (of === 'stat' || of === 'final' || of === 'at' || of === 'profile' || of === 'probe' || of === 'front' || of === 'frontSpeed' || of === 'error' || of === 'wavelength') need(!isCA, at, 'of', 'not for a cellular automaton (population, density, avalanche…)');
      if (of === 'at') { need(o.x != null, at, 'x', 'needs x'); if (dim === 2) need(o.y != null, at, 'y', 'needs y on a 2-D grid'); }
      if (of === 'eventTime' || of === 'eventCount') need(evIds.includes(o.event), at, 'event', 'an event of model.events');
      if (of === 'eventTime' && kd === 'scalar') need(Number.isInteger(o.nth) && o.nth !== 0, at, 'nth', 'a whole number ±1–2000 (1 the first, −1 the last)');
      if (of === 'front' || of === 'frontSpeed') need(isObj(m.front), at, 'of', 'needs model.front');
      if (of === 'residual' || of === 'iterations') need(isP, at, 'of', 'only poisson iterates');
      if (of === 'population' || of === 'density') need(isCA, at, 'of', 'a cellular automaton only');
      if (of === 'cell') { if (need(isCA, at, 'of', 'a cellular automaton only')) { need(o.x != null, at, 'x', 'needs x (the column)'); if (dim === 2) need(o.y != null, at, 'y', 'needs y (the row) on a 2-D grid'); } }
      if (of === 'avalanche' || of === 'avalancheMean' || of === 'avalancheTau') need(isCA && isObj(m.ca) && m.ca.rule === 'sandpile', at, 'of', 'the sandpile only');
      if (of === 'turing' || of === 'turingK' || of === 'turingWavelength') need(two, at, 'of', 'two-field reaction–diffusion only');
      if (of === 'error') need(typeof o.expr === 'string' && o.expr.trim() !== '', at, 'expr', 'needs the exact solution (an expression over x, y, t)');
      if (of === 'cfl') need(['advection', 'advdiff', 'wave'].includes(eq), at, 'of', 'advection, advdiff or wave only');
      if (of === 'r') need(['heat', 'advdiff', 'rd'].includes(eq), at, 'of', 'heat, advdiff or rd only');
      if (of === 'gain' || of === 'dtMax' || of === 'dt') need(!isP && !isCA, at, 'of', 'an equation in time only');
      if (of === 'flag') need(CODES.includes(o.code), at, 'code', 'one of ' + CODES.join(', '));
      if (of === 'heatmap') need(dim === 2, at, 'of', 'a heat map is for a 2-D grid (a line: spacetime)');
      if (of === 'spacetime') need(dim === 1 && eq !== 'poisson', at, 'of', 'a space–time diagram is for a 1-D grid in time');
      if (of === 'x' || of === 'y') need(!isCA || dim === 1 || true, at, 'of', '');
    }, E, W);
    return P;
  }
  /** every expression of the model: [source, path, local names] */
  function exprs(spec) {
    const out = [], m = isObj(spec) && isObj(spec.model) ? spec.model : null;
    if (!m) return out;
    const vn = varNames(m), kp = kpNames(m), dim = m.dim === 2 ? 2 : 1;
    const xy = dim === 2 ? ['x', 'y'] : ['x'];
    const tv = vn.concat(['t']), field = xy.concat(tv), reac = ['u', 'v'].concat(xy, kp, tv);
    const add = (v, p, l) => { if (typeof v === 'string') out.push([v, p, l]); };
    if (isObj(m.grid)) for (const k of ['x0', 'x1', 'y0', 'y1']) add(m.grid[k], 'model.grid.' + k, []);
    for (const k of ['D', 'Dv', 'c', 'damping']) add(m[k], 'model.' + k, tv);
    for (const k of ['vx', 'vy']) add(m[k], 'model.' + k, field);
    if (isObj(m.kp)) for (const [k, v] of Object.entries(m.kp)) add(v, 'model.kp.' + k, tv);
    if (isObj(m.reaction)) for (const [k, v] of Object.entries(m.reaction)) add(v, 'model.reaction.' + k, reac);
    add(m.init, 'model.init', xy); add(m.initV, 'model.initV', xy);
    if (isObj(m.noise)) add(m.noise.amp, 'model.noise.amp', []);
    add(m.source, 'model.source', field);
    objs(m.sources).forEach((o, i) => { for (const k of ['x', 'y', 'r', 'x0', 'x1', 'y0', 'y1']) add(o[k], `model.sources[${i}].${k}`, []); add(o.rate, `model.sources[${i}].rate`, tv); });
    objs(m.obstacles).forEach((o, i) => { for (const k of ['x', 'y', 'r', 'x0', 'x1', 'y0', 'y1', 'value']) add(o[k], `model.obstacles[${i}].${k}`, []); });
    for (const b of ['bc', 'bcV']) if (isObj(m[b])) for (const s of ['all', 'left', 'right', 'bottom', 'top']) if (isObj(m[b][s])) { add(m[b][s].value, `model.${b}.${s}.value`, field); add(m[b][s].a, `model.${b}.${s}.a`, tv); add(m[b][s].b, `model.${b}.${s}.b`, tv); }
    if (isObj(m.vars)) for (const [k, v] of Object.entries(m.vars)) add(v, 'model.vars.' + k, []);
    for (const k of ['tEnd', 'dt']) add(m[k], 'model.' + k, []);
    objs(m.probes).forEach((p, i) => { for (const k of ['x', 'y', 'x0', 'x1', 'y0', 'y1']) add(p[k], `model.probes[${i}].${k}`, []); });
    if (isObj(m.front)) { add(m.front.level, 'model.front.level', []); add(m.front.y, 'model.front.y', []); }
    objs(m.events).forEach((e, i) => add(e.level, `model.events[${i}].level`, vn));
    objs(m.interrupts).forEach((it, i) => { add(it.at, `model.interrupts[${i}].at`, []); if (isObj(it.set)) for (const [k, v] of Object.entries(it.set)) add(v, `model.interrupts[${i}].set.${k}`, tv); });
    if (isObj(m.solver)) add(m.solver.omega, 'model.solver.omega', []);
    if (isObj(m.ca)) for (const k of ['p', 'f', 'density']) add(m.ca[k], 'model.ca.' + k, []);
    list(spec.outputs).forEach((o, i) => {
      if (!isObj(o)) return;
      for (const k of ['t', 'x', 'y']) add(o[k], `outputs[${i}].${k}`, []);
      if (o.of === 'error') add(o.expr, `outputs[${i}].expr`, xy.concat(['t']));
    });
    return out;
  }
  function keys() { return []; }

  /* ======================================================================================================================
     Compilation (once per spec): every formula through NoemaExpr, with the names it uses (to know what must be re-evaluated)
     ====================================================================================================================== */
  function usesOf(src) {
    const s = new Set(), NX = NoemaExpr;
    if (typeof src !== 'string' || !NX) return s;
    let ast; try { ast = NX.parse(src); } catch (e) { return s; }
    (function walk(n) { if (!n) return; if (n.t === 'var') s.add(n.name); else if (n.t === 'un') walk(n.a); else if (n.t === 'bin') { walk(n.a); walk(n.b); } else if (n.t === 'cond') { walk(n.c); walk(n.a); walk(n.b); } else if (n.t === 'call') n.args.forEach(walk); })(ast);
    return s;
  }
  /** {f(env), xy (uses x or y), td (uses t or a model variable), num (a plain number)} */
  function cmp(v, vars) {
    if (v == null) return null;
    const u = usesOf(v), num = typeof v === 'number';
    return { f: C.cx(v), xy: u.has('x') || u.has('y'), td: u.has('t') || vars.some(n => u.has(n)), uv: u.has('u') || u.has('v'), num, val: num ? v : NaN, src: v };
  }
  function prepare(spec) {
    try {
      if (C.hasErrors(checkSpec(spec))) return null;
      const m = spec.model, vn = varNames(m), c = v => cmp(v, vn);
      const eq = m.equation, dim = m.dim === 2 ? 2 : 1;
      const M = { m, eq, dim, vn, method: m.method || DEFAULT_METHOD[eq], two: twoFields(m), kinetics: m.kinetics || null };
      M.grid = { x0: c(m.grid.x0 != null ? m.grid.x0 : 0), x1: c(m.grid.x1 != null ? m.grid.x1 : 1), y0: c(m.grid.y0 != null ? m.grid.y0 : 0), y1: c(m.grid.y1 != null ? m.grid.y1 : 1) };
      for (const k of ['D', 'Dv', 'c', 'damping', 'vx', 'vy', 'init', 'initV', 'source', 'tEnd', 'dt']) M[k] = c(m[k]);
      M.kp = {}; const pre = M.kinetics && PRESETS[M.kinetics] ? PRESETS[M.kinetics] : {};
      for (const k of Object.keys(pre)) M.kp[k] = c(pre[k]);
      if (isObj(m.kp)) for (const [k, v] of Object.entries(m.kp)) M.kp[k] = c(v);
      M.reaction = isObj(m.reaction) ? { u: c(m.reaction.u), v: c(m.reaction.v) } : null;
      M.noise = isObj(m.noise) ? { amp: c(m.noise.amp), field: m.noise.field || 'u' } : null;
      const shp = o => ({ shape: o.shape, x: c(o.x), y: c(o.y), r: c(o.r), x0: c(o.x0), x1: c(o.x1), y0: c(o.y0), y1: c(o.y1) });
      M.sources = objs(m.sources).map(o => Object.assign(shp(o), { rate: c(o.rate) }));
      M.obstacles = objs(m.obstacles).map(o => Object.assign(shp(o), { value: c(o.value) }));
      const sides = B => { const r = {}; for (const s of S.SIDES) { const o = isObj(B) ? (isObj(B[s]) ? B[s] : isObj(B.all) ? B.all : null) : null; r[s] = o ? { type: o.type || 'dirichlet', value: c(o.value != null ? o.value : 0), a: c(o.a), b: c(o.b) } : null; } return r; };
      M.bc = sides(m.bc); M.bcV = isObj(m.bcV) ? sides(m.bcV) : M.bc;
      M.vars = vn.map(k => [k, c(m.vars[k])]);
      M.probes = objs(m.probes).map(p => ({ id: p.id, at: p.at, stat: p.stat || 'mean', field: p.field || 'u', x: c(p.x), y: c(p.y), x0: c(p.x0), x1: c(p.x1), y0: c(p.y0), y1: c(p.y1) }));
      M.front = isObj(m.front) ? { level: c(m.front.level), y: c(m.front.y), field: m.front.field || 'u' } : null;
      M.events = objs(m.events).map(e => ({ id: e.id, of: e.of, probe: e.probe, field: e.field || 'u', level: c(e.level), dir: Number.isInteger(e.dir) ? e.dir : 0, stop: !!e.stop }));
      M.interrupts = objs(m.interrupts).map(it => ({ at: c(it.at), on: it.on || null, set: Object.entries(it.set || {}).map(([k, v]) => [k, c(v)]) }));
      M.solver = isObj(m.solver) ? m.solver : {};
      M.ca = isObj(m.ca) ? Object.assign({}, m.ca, { p: c(m.ca.p), f: c(m.ca.f), density: c(m.ca.density != null ? m.ca.density : 0.5) }) : null;
      M.outs = objs(spec.outputs).map(o => Object.assign({}, o, { tc: c(o.t), xc: c(o.x), yc: c(o.y), ec: o.of === 'error' ? c(o.expr) : null }));
      return M;
    } catch (e) { return null; }
  }

  /* ======================================================================================================================
     The run context: codes (NoemaSimKit codes()), the expression budget, the environment
     ====================================================================================================================== */
  function makeCtx() {
    const K = SK().codes(); let ev = 0;
    return {
      code: (c, t, info) => K.code(c, t, info, FATAL.includes(c)), has: c => K.has(c), fatal: () => K.fatal(), list: () => K.list.map(x => ({ code: x.code, level: FATAL.includes(x.code) ? 'error' : 'note', ...(x.t != null ? { t: x.t } : {}) })),
      expr(n) { ev += n; return ev <= MAX_EXPR; }, get evals() { return ev; },
    };
  }
  const val = (cc, env) => (cc == null ? NaN : cc.num ? cc.val : cc.f(env));
  const finite = Number.isFinite;

  /** the grid, the node weights (trapezoid ½ at a bounded edge: what FTCS with mirrored Neumann ghosts conserves exactly) */
  function makeGrid(M, env, ctx) {
    const m = M.m, b = M.bc;
    const px = !!(b.left && b.left.type === 'periodic'), py = M.dim === 2 && !!(b.bottom && b.bottom.type === 'periodic');
    const x0 = val(M.grid.x0, env), x1 = val(M.grid.x1, env), y0 = val(M.grid.y0, env), y1 = val(M.grid.y1, env);
    if (!(finite(x0) && finite(x1) && x1 > x0) || (M.dim === 2 && !(finite(y0) && finite(y1) && y1 > y0))) { ctx.code('grid'); return null; }
    const G = S.grid({ dim: M.dim, nx: m.grid.nx, ny: m.grid.ny || m.grid.nx, x0, x1, y0, y1, periodicX: px, periodicY: py });
    const IDX = new Int32Array(G.cells), W = new Float64Array(G.cells);
    let q = 0;
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
      IDX[q] = G.at(i, j);
      W[q] = ((!px && (i === 0 || i === G.nx - 1)) ? 0.5 : 1) * (M.dim === 2 && !py && (j === 0 || j === G.ny - 1) ? 0.5 : 1);
      q++;
    }
    return { G, IDX, W, cellArea: G.dx * (M.dim === 2 ? G.dy : 1) };
  }
  /** the nodes inside a shape → padded indices */
  function shapeNodes(G, sh, env) {
    const out = [];
    if (sh.shape === 'all') { for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) out.push(G.at(i, j)); return out; }
    if (sh.shape === 'point') { const [i, j] = S.nearest(G, val(sh.x, env), G.dim === 2 ? val(sh.y, env) : 0); if (finite(val(sh.x, env))) out.push(G.at(i, j)); return out; }
    const x0 = val(sh.x0, env), x1 = val(sh.x1, env), y0 = G.dim === 2 ? val(sh.y0, env) : 0, y1 = G.dim === 2 ? val(sh.y1, env) : 0;
    const cx = val(sh.x, env), cy = val(sh.y, env), r = val(sh.r, env);
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
      const x = G.xs[i], y = G.ys[j], eps = 1e-12 * (Math.abs(x) + Math.abs(y) + 1);
      const inside = sh.shape === 'rect' ? (x >= Math.min(x0, x1) - eps && x <= Math.max(x0, x1) + eps && (G.dim === 1 || (y >= Math.min(y0, y1) - eps && y <= Math.max(y0, y1) + eps)))
        : (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + eps;
      if (inside) out.push(G.at(i, j));
    }
    return out;
  }
  /** boundary conditions at time t (env.t set): per side {type, g (a number or an array along the side), a, b} */
  function makeBC(M, G, which, ctx) {
    const sp = which === 'v' ? M.bcV : M.bc, def = (M.eq === 'wave' || M.eq === 'poisson') ? 'dirichlet' : 'neumann';
    const cache = {}, len = s => (s === 'left' || s === 'right' ? G.ny : G.nx);
    let first = true;
    return env => {
      const B = {};
      for (const s of S.SIDES) {
        if (G.dim === 1 && (s === 'bottom' || s === 'top')) continue;
        const o = sp[s];
        if (!o) { B[s] = { type: def, g: 0 }; continue; }
        if (o.type === 'periodic') { B[s] = { type: 'periodic' }; continue; }
        const redo = first || o.value.td || (o.a && o.a.td) || (o.b && o.b.td);
        if (!redo) { B[s] = cache[s]; continue; }
        let g;
        if (o.value.xy) {
          const n = len(s); g = new Float64Array(n); if (!ctx.expr(n)) { ctx.code('budget'); }
          const sx = env.x, sy = env.y;
          for (let k = 0; k < n; k++) {
            env.x = s === 'left' ? G.x0 : s === 'right' ? G.xs[G.nx - 1] : G.xs[k];
            env.y = G.dim === 1 ? 0 : s === 'bottom' ? G.y0 : s === 'top' ? G.ys[G.ny - 1] : G.ys[k];
            g[k] = o.value.f(env);
          }
          env.x = sx; env.y = sy;
        } else g = val(o.value, env);
        const a = o.type === 'robin' ? val(o.a, env) : 0, b = o.type === 'robin' ? val(o.b, env) : 1;
        B[s] = cache[s] = { type: o.type, g, a, b };
      }
      first = false;
      return B;
    };
  }
  const anyTD = (M, side) => S.SIDES.some(s => { const o = M[side][s]; return o && o.type !== 'periodic' && (o.value.td || (o.a && o.a.td) || (o.b && o.b.td)); });

  /* ======================================================================================================================
     Turing analysis of two-field kinetics (Turing 1952; Murray 2003 vol. II §2.3): the homogeneous steady state (u*, v*), its
     Jacobian J, and the dispersion relation λ(k²) = the largest real part of the eigenvalues of J − k²·diag(Du, Dv)
     ====================================================================================================================== */
  function steadyState(kin, P) {
    if (kin === 'schnakenberg') { const u = P.a + P.b; return [u, P.b / (u * u)]; }
    if (kin === 'brusselator') return [P.A, P.B / P.A];
    if (kin === 'grayscott') {   // the upper non-trivial branch: (F+k)v² − F v + F(F+k) = 0, u = (F+k)/v (Pearson 1993)
      const F = P.F, k = P.k, s = F + k, disc = F * F - 4 * F * s * s;
      if (!(disc >= 0 && s > 0)) return null; const v = (F + Math.sqrt(disc)) / (2 * s); return [s / v, v];
    }
    if (kin === 'fhn') {   // u − u³/3 − (u + a)/b + I = 0 (one real root for b < 1 and the classic values), bisection
      const g = u => u - u * u * u / 3 - (u + P.a) / P.b + P.I; let lo = -10, hi = 10; if (g(lo) * g(hi) > 0) return null;
      for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (g(lo) * g(mid) <= 0) hi = mid; else lo = mid; }
      const u = (lo + hi) / 2; return [u, (u + P.a) / P.b];
    }
    return null;
  }
  function kineticsF(kin, P) {
    switch (kin) {
      case 'grayscott': return (u, v) => [-u * v * v + P.F * (1 - u), u * v * v - (P.F + P.k) * v];
      case 'fhn': return (u, v) => [u - u * u * u / 3 - v + P.I, P.eps * (u + P.a - P.b * v)];
      case 'schnakenberg': return (u, v) => [P.gamma * (P.a - u + u * u * v), P.gamma * (P.b - u * u * v)];
      case 'brusselator': return (u, v) => [P.A - (P.B + 1) * u + u * u * v, P.B * u - u * u * v];
      case 'fisher': return u => [P.r * u * (1 - u), 0];
      default: return null;
    }
  }
  function turing(kin, P, Du, Dv) {
    const ss = steadyState(kin, P), f = kineticsF(kin, P);
    if (!ss || !f) return null;
    const [u0, v0] = ss, h = 1e-6 * Math.max(1, Math.abs(u0), Math.abs(v0));
    const a = f(u0 + h, v0), b = f(u0 - h, v0), c = f(u0, v0 + h), d = f(u0, v0 - h);
    const fu = (a[0] - b[0]) / (2 * h), gu = (a[1] - b[1]) / (2 * h), fv = (c[0] - d[0]) / (2 * h), gv = (c[1] - d[1]) / (2 * h);
    const det = fu * gv - fv * gu, tr = fu + gv, q = Dv * fu + Du * gv;
    const cond = tr < 0 && det > 0 && q > 0 && q * q > 4 * Du * Dv * det;
    const lam = k2 => { const A = fu - Du * k2, D2 = gv - Dv * k2, T = A + D2, De = A * D2 - fv * gu, disc = T * T - 4 * De; return disc >= 0 ? (T + Math.sqrt(disc)) / 2 : T / 2; };
    let kBest = NaN;
    if (cond) {
      const kc2 = q / (2 * Du * Dv); let best = -Infinity, arg = kc2;
      for (let i = 1; i <= 400; i++) { const k2 = 4 * kc2 * i / 400, l = lam(k2); if (l > best) { best = l; arg = k2; } }
      let lo = Math.max(0, arg - 4 * kc2 / 400), hi = arg + 4 * kc2 / 400;   // golden-section refinement
      for (let i = 0; i < 80; i++) { const m1 = lo + (hi - lo) * 0.381966, m2 = lo + (hi - lo) * 0.618034; if (lam(m1) < lam(m2)) lo = m1; else hi = m2; }
      kBest = Math.sqrt((lo + hi) / 2);
    }
    return { u: u0, v: v0, J: [fu, fv, gu, gv], cond, k: kBest, wavelength: cond ? 2 * Math.PI / kBest : NaN };
  }

  /* ======================================================================================================================
     Field statistics, probes, fronts
     ====================================================================================================================== */
  function fieldStat(R, u, stat, solid) {
    const { IDX, W, cellArea } = R; let mx = -Infinity, mn = Infinity, s = 0, sw = 0, s2 = 0;
    for (let q = 0; q < IDX.length; q++) {
      const k = IDX[q]; if (solid && solid[k]) continue; const v = u[k], w = W[q];
      if (v > mx) mx = v; if (v < mn) mn = v; s += w * v; sw += w; s2 += w * v * v;
      if (v !== v) { mx = NaN; mn = NaN; }
    }
    if (stat === 'max') return mx; if (stat === 'min') return mn; if (stat === 'mean') return s / sw;
    if (stat === 'total') return s * cellArea; if (stat === 'l2') return Math.sqrt(s2 * cellArea); if (stat === 'energy') return 0.5 * s2 * cellArea;
    return NaN;
  }
  function probeValue(R, u, P, solid) {
    const { G } = R;
    if (P.at === 'point') return S.sample(G, u, P.px, P.py);
    if (P.at === 'line') {
      const n = Math.max(G.nx, G.ny); let s = 0, mx = -Infinity, mn = Infinity;
      for (let q = 0; q < n; q++) { const a = n > 1 ? q / (n - 1) : 0, v = S.sample(G, u, P.x0 + a * (P.x1 - P.x0), P.y0 + a * (P.y1 - P.y0)); s += v; if (v > mx) mx = v; if (v < mn) mn = v; }
      const len = Math.hypot(P.x1 - P.x0, P.y1 - P.y0);
      return P.stat === 'max' ? mx : P.stat === 'min' ? mn : P.stat === 'total' ? s / n * len : s / n;
    }
    let s = 0, c = 0, mx = -Infinity, mn = Infinity;
    for (const k of P.nodes) { if (solid && solid[k]) continue; const v = u[k]; s += v; c++; if (v > mx) mx = v; if (v < mn) mn = v; }
    if (!c) return NaN;
    return P.stat === 'max' ? mx : P.stat === 'min' ? mn : P.stat === 'total' ? s * R.cellArea : s / c;
  }
  /** the front: the largest x where u ≥ level along the line (1-D: the grid; 2-D: the row nearest y), interpolated */
  function frontX(R, u, level, row) {
    const { G } = R;
    for (let i = G.nx - 1; i >= 0; i--) {
      const v = u[G.at(i, row)];
      if (v >= level) { if (i === G.nx - 1) return G.xs[i]; const w = u[G.at(i + 1, row)]; return G.xs[i] + G.dx * (v - level) / (v - w); }
    }
    return NaN;
  }
  /** a profile along a row (y given) or a column (x given) of a padded field */
  function profileOf(R, u, o, env) {
    const { G } = R, out = [];
    if (G.dim === 1) { for (let i = 0; i < G.nx; i++) out.push(u[G.at(i, 0)]); return out; }
    if (o.yc) { const [, j] = S.nearest(G, G.x0, val(o.yc, env)); for (let i = 0; i < G.nx; i++) out.push(u[G.at(i, j)]); }
    else { const [i] = S.nearest(G, val(o.xc, env), G.y0); for (let j = 0; j < G.ny; j++) out.push(u[G.at(i, j)]); }
    return out;
  }
  /** the dominant wavelength from the up-crossings of the mean along a line of values (spacing h): L / crossings */
  function crossWavelength(vals, h) {
    let m = 0; for (const v of vals) m += v; m /= vals.length; let cr = 0;
    for (let i = 1; i < vals.length; i++) if (vals[i - 1] < m && vals[i] >= m) cr++;
    return cr >= 2 ? vals.length * h / cr : NaN;
  }

  /* ======================================================================================================================
     The schemes in time (one step of length h from u at t, ghosts filled at t)
     ====================================================================================================================== */
  /** the line solve of a θ-scheme along ks (n nodes, spacing hs, rr = θ·h·D/hs²): Dirichlet rows, mirrored Neumann / Robin
      ghosts eliminated, insulated solids cut out, periodic by Sherman–Morrison. rhs (padded) in, result written to out */
  function lineSolve(ks, n, hs, rr, sL, sR, gi, periodic, rhs, out, sol, fixedVal, buf) {
    const { a, b, c, d, w } = buf;
    for (let q = 0; q < n; q++) {
      const k = ks[q];
      if (sol && sol[k]) { a[q] = 0; b[q] = 1; c[q] = 0; d[q] = Number.isFinite(fixedVal[k]) ? fixedVal[k] : rhs[k]; continue; }
      a[q] = -rr; b[q] = 1 + 2 * rr; c[q] = -rr; d[q] = rhs[k];
      if (q > 0 && sol && sol[ks[q - 1]] && !Number.isFinite(fixedVal[ks[q - 1]])) { a[q] = 0; b[q] -= rr; }
      if (q < n - 1 && sol && sol[ks[q + 1]] && !Number.isFinite(fixedVal[ks[q + 1]])) { c[q] = 0; b[q] -= rr; }
    }
    if (!periodic) {
      for (const [q, s, nb] of [[0, sL, 1], [n - 1, sR, n - 2]]) {
        const k = ks[q]; if (sol && sol[k]) continue;
        const g = s == null ? 0 : typeof s.g === 'number' ? s.g : s.g ? s.g[gi] : 0;
        const dir = s && (s.type === 'dirichlet' || (s.type === 'robin' && !(s.b !== 0 && Number.isFinite(s.b))));
        if (dir) { a[q] = 0; b[q] = 1; c[q] = 0; d[q] = s.type === 'dirichlet' ? g : g / (s.a || 1); continue; }
        const A = s && s.type === 'robin' ? s.a : 0, Bc = s && s.type === 'robin' ? s.b : 1;
        b[q] = 1 + 2 * rr + 2 * rr * hs * A / Bc; d[q] += 2 * rr * hs * g / Bc;
        if (q === 0) { a[q] = 0; c[q] = -2 * rr; } else { c[q] = 0; a[q] = -2 * rr; }
        void nb;
      }
      S.thomas(a, b, c, d, n, w);
    } else S.thomasPeriodic(a, b, c, d, n);
    for (let q = 0; q < n; q++) out[ks[q]] = d[q];
  }
  /** one axis of the Laplacian (axis 0: x, 1: y), insulated solids reflecting */
  function lapAxis(G, u, out, axis, sol) {
    const st = axis === 0 ? 1 : G.sx, ih = axis === 0 ? 1 / (G.dx * G.dx) : 1 / (G.dy * G.dy);
    for (let j = 0; j < G.ny; j++) { let k = G.at(0, j); for (let i = 0; i < G.nx; i++, k++) { const cc = u[k]; let w = u[k - st], e = u[k + st]; if (sol) { if (sol[k - st]) w = cc; if (sol[k + st]) e = cc; } out[k] = (w - 2 * cc + e) * ih; } }
  }

  /* ======================================================================================================================
     The run of an equation in time
     ====================================================================================================================== */
  function runTime(M, env, ctx, seed, mode) {
    const R = makeGrid(M, env, ctx); if (!R) return null;
    const { G, IDX, W } = R, m = M.m, eq = M.eq, meth = M.method, two = M.two || eq === 'wave';
    const rng = SK().stream(seed, 'field.noise');
    // the model variables
    for (const [k, cc] of M.vars) env[k] = val(cc, env);
    env.t = 0;
    const tEnd = val(M.tEnd, env);
    if (!(tEnd > 0)) { ctx.code('grid'); return null; }
    // step-scalars (re-evaluated when they depend on t or a variable)
    const sc = {};
    const evalScalars = () => {
      sc.D = val(M.D, env); sc.Dv = val(M.Dv, env); sc.c = val(M.c, env); sc.gam = M.damping ? val(M.damping, env) : 0;
      sc.P = {}; for (const [k, cc] of Object.entries(M.kp)) sc.P[k] = val(cc, env);
      sc.rates = M.sources.map(s => val(s.rate, env));
    };
    evalScalars();
    const scalarTD = [M.D, M.Dv, M.c, M.damping, ...Object.values(M.kp), ...M.sources.map(s => s.rate)].some(cc => cc && cc.td);
    // velocity: per face (x faces at x + dx/2, y faces at y + dy/2)
    const adv = eq === 'advection' || eq === 'advdiff';
    const AX = adv ? new Float64Array(G.size) : null, AY = adv && G.dim === 2 ? new Float64Array(G.size) : null, NXv = adv ? new Float64Array(G.size) : null, NYv = adv && G.dim === 2 ? new Float64Array(G.size) : null;
    let vmax = [0, 0];
    const evalVel = () => {
      if (!adv) return;
      vmax = [0, 0];
      const fx = M.vx, fy = M.vy;
      if ((fx.xy || (fy && fy.xy)) && !ctx.expr(4 * G.cells)) ctx.code('budget');
      const vxs = fx.xy ? null : val(fx, env), vys = !fy ? 0 : fy.xy ? null : val(fy, env);
      for (let j = (G.dim === 2 ? -1 : 0); j < G.ny + (G.dim === 2 ? 1 : 0); j++) for (let i = -1; i <= G.nx; i++) {
        const k = G.at(i, j), x = G.x0 + i * G.dx, y = G.dim === 2 ? G.y0 + j * G.dy : 0;
        if (vxs != null) { AX[k] = vxs; NXv[k] = vxs; } else { env.x = x + G.dx / 2; env.y = y; AX[k] = fx.f(env); env.x = x; NXv[k] = fx.f(env); }
        if (AY) { if (vys != null) { AY[k] = vys; NYv[k] = vys; } else { env.x = x; env.y = y + G.dy / 2; AY[k] = fy.f(env); env.y = y; NYv[k] = fy.f(env); } }
        if (i >= 0 && i < G.nx && j >= 0 && j < G.ny) { vmax[0] = Math.max(vmax[0], Math.abs(AX[k]), Math.abs(NXv[k])); if (AY) vmax[1] = Math.max(vmax[1], Math.abs(AY[k]), Math.abs(NYv[k])); }
      }
    };
    evalVel();
    const velTD = adv && ((M.vx && M.vx.td) || (M.vy && M.vy.td));
    // the time step: the given dt, or safety × the stability limit; then dt = tEnd / N exactly
    const limit = () => {
      if (eq === 'heat') return meth === 'ftcs' ? S.ftcsLimit(G, sc.D) : Infinity;
      if (eq === 'rd') return S.ftcsLimit(G, Math.max(sc.D, M.two ? sc.Dv : 0));
      if (eq === 'wave') return 1 / (Math.abs(sc.c) * Math.sqrt(1 / (G.dx * G.dx) + (G.dim === 2 ? 1 / (G.dy * G.dy) : 0)));
      if (adv) {
        const ca = Math.max(vmax[0] / G.dx, G.dim === 2 ? vmax[1] / G.dy : 0), la = ca > 0 ? 1 / ca : Infinity;
        return eq === 'advdiff' ? Math.min(la, S.ftcsLimit(G, sc.D)) : la;
      }
      return Infinity;
    };
    let dt0 = M.dt ? val(M.dt, env) : NaN;
    if (M.dt == null) {
      const lim = limit(), saf = typeof m.safety === 'number' ? m.safety : 0.9;
      dt0 = Number.isFinite(lim) ? saf * lim : tEnd / 200; ctx.code('dt-auto');
    }
    if (!(dt0 > 0)) { ctx.code('grid'); return null; }
    const maxSteps = Number.isInteger(m.maxSteps) ? m.maxSteps : DEF_STEPS;
    let N = Math.max(1, Math.ceil(tEnd / dt0 - 1e-9));
    const work = N * G.cells * (M.two ? 2 : 1);
    const res = { R, N, dt: tEnd / N, tEnd, stab: {}, rec: { t: [] }, ev: {}, frames: [], snaps: new Map() };
    if (N > maxSteps || work > MAX_WORK) { ctx.code('budget'); return res; }
    const h = tEnd / N; res.dt = h;
    // stability: von Neumann gain and Courant numbers (Strikwerda 2004; CFL 1928)
    const stability = () => {
      const st = {}, inv2 = 1 / (G.dx * G.dx) + (G.dim === 2 ? 1 / (G.dy * G.dy) : 0);
      st.dtMax = limit();
      if (eq === 'heat') { st.r = sc.D * h * inv2; st.gain = S.vonNeumann(meth === 'ftcs' ? 'ftcs' : meth === 'btcs' ? 'btcs' : 'cn', { r: st.r }); }
      else if (eq === 'rd') { st.r = Math.max(sc.D, M.two ? sc.Dv : 0) * h * inv2; st.gain = S.vonNeumann('ftcs', { r: st.r }); }
      else if (eq === 'wave') { st.cfl = S.waveCourant(G, sc.c, h); st.gain = S.vonNeumann('leapfrog', { C: st.cfl }); }
      else if (adv) {
        const co = Math.max(vmax[0] * h / G.dx, G.dim === 2 ? vmax[1] * h / G.dy : 0); st.cfl = co;
        const sch = meth === 'laxwendroff' ? 'laxwendroff' : meth === 'laxfriedrichs' ? 'laxfriedrichs' : meth === 'centred' ? 'centred' : 'upwind';
        if (eq === 'advdiff') { st.r = sc.D * h * inv2; let g = 0; for (let q = 0; q <= 720; q++) { const th = Math.PI * q / 720; g = Math.max(g, S.amplification(sch, { C: co }, th) * S.amplification('ftcs', { r: st.r }, th)); } st.gain = g; }
        else st.gain = S.vonNeumann(sch, { C: co });
      }
      const bad = st.gain > 1 + 1e-12 || ((adv || eq === 'wave') && st.cfl > 1 + 1e-12);
      if (st.cfl > 1 + 1e-12) ctx.code('cfl');
      if (bad) ctx.code('unstable');
      if (eq === 'heat' && meth === 'cn' && st.r > 1) ctx.code('cn-oscillation');
      if (M.m.nine && G.dim === 2 && Math.abs(G.dx - G.dy) > 1e-9 * G.dx) ctx.code('nine-point-dx');
      res.stab = st;
      return bad;
    };
    if (stability() && !m.allowUnstable) return res;
    // fields
    const u = S.field(G), un = S.field(G), L = S.field(G);
    const v = two ? S.field(G) : null, vn2 = two ? S.field(G) : null, Lv = M.two ? S.field(G) : null;
    // obstacles: fixed value (Dirichlet) or insulated (no flux)
    let sol = null; const fixedVal = new Float64Array(G.size).fill(NaN), solidList = [];
    if (M.obstacles.length) {
      sol = new Uint8Array(G.size);
      for (const o of M.obstacles) { const vv = o.value ? val(o.value, env) : NaN; for (const k of shapeNodes(G, o, env)) { sol[k] = 1; fixedVal[k] = vv; solidList.push(k); } }
    }
    const ins = sol ? Uint8Array.from(sol, (s, k) => (s && !Number.isFinite(fixedVal[k]) ? 1 : 0)) : null;
    const insAny = ins && ins.some(x => x);
    // initial values
    const setInit = (arr, cc, fld) => {
      for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { env.x = G.xs[i]; env.y = G.ys[j]; arr[G.at(i, j)] = cc ? val(cc, env) : 0; }
      if (M.noise && M.noise.field === fld) { const amp = val(M.noise.amp, env); for (const k of IDX) arr[k] += amp * (rng() - 0.5); }
    };
    setInit(u, M.init, 'u');
    if (two) setInit(v, M.initV, 'v');
    const fixSolids = (arr, init) => { for (const k of solidList) arr[k] = Number.isFinite(fixedVal[k]) ? fixedVal[k] : init[k]; };
    const u0copy = sol ? Float64Array.from(u) : null, v0copy = sol && v ? Float64Array.from(v) : null;
    if (sol) { fixSolids(u, u0copy); if (v && M.two) fixSolids(v, v0copy); }
    // sources: a density field s(x, y, t) plus shapes (a point: an amount per unit time; rect, circle, all: per unit area)
    const srcArr = new Float64Array(G.size), srcNodes = M.sources.map(s => shapeNodes(G, s, env));
    const srcTD = (M.source && (M.source.td || M.source.uv)) || false;
    if (M.source && M.source.uv) ctx.code('budget');
    let srcField = null;
    const evalSrcField = () => {
      if (!M.source) return;
      if (!srcField) srcField = new Float64Array(G.size);
      if (M.source.xy) { if (!ctx.expr(G.cells)) ctx.code('budget'); for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { env.x = G.xs[i]; env.y = G.ys[j]; srcField[G.at(i, j)] = M.source.f(env); } }
      else { const s = val(M.source, env); for (const k of IDX) srcField[k] = s; }
    };
    const buildSrc = () => {
      srcArr.fill(0);
      if (srcField) for (const k of IDX) srcArr[k] = srcField[k];
      M.sources.forEach((s, q) => { const r = sc.rates[q], dens = s.shape === 'point' ? r / R.cellArea : r; for (const k of srcNodes[q]) srcArr[k] += dens; });
    };
    evalSrcField(); buildSrc();
    const hasSrc = !!M.source || M.sources.length > 0;
    // boundary conditions
    const bcU = makeBC(M, G, 'u', ctx), bcV = M.two ? makeBC(M, G, 'v', ctx) : null;
    const bcTD = anyTD(M, 'bc') || (M.two && anyTD(M, 'bcV'));
    let BU = bcU(env), BV = bcV ? bcV(env) : null;
    const fill = () => { S.fillGhosts(G, u, BU); if (M.two) S.fillGhosts(G, v, BV); else if (eq === 'wave') S.fillGhosts(G, v, BU); };
    // a per-step formula budget (custom kinetics, time-dependent source / velocity / boundary profiles)
    let perStep = 0;
    if (eq === 'rd' && M.kinetics === 'custom') perStep += G.cells * (M.reaction.v ? 2 : 1);
    if (srcTD && M.source.xy) perStep += G.cells;
    if (velTD && (M.vx.xy || (M.vy && M.vy.xy))) perStep += 4 * G.cells;
    if (bcTD) perStep += 2 * (G.nx + G.ny);
    if (perStep * N + ctx.evals > MAX_EXPR) { ctx.code('budget'); return res; }
    // conservation: closed = nothing enters or leaves
    const closedSide = (B, s) => !B[s] || B[s].type === 'periodic' || (B[s].type === 'neumann' && B[s].g === 0 && (!M.bc[s] || !M.bc[s].value.td));
    const closed = !hasSrc && !solidList.some(k => Number.isFinite(fixedVal[k])) && S.SIDES.every(s => (G.dim === 1 && (s === 'bottom' || s === 'top')) || closedSide(BU, s))
      && (eq === 'heat' || (adv && (G.periodicX && (G.dim === 1 || G.periodicY))) || (eq === 'rd' && false));
    // recording
    const P = Number.isInteger(m.points) ? m.points : 200, F = Number.isInteger(m.frames) ? m.frames : 100;
    const recAt = new Set(), frameAt = new Set();
    for (let q = 0; q < Math.min(P, N + 1); q++) recAt.add(Math.round(q * N / (Math.min(P, N + 1) - 1 || 1)));
    for (let q = 0; q < Math.min(F, N + 1); q++) frameAt.add(Math.round(q * N / (Math.min(F, N + 1) - 1 || 1)));
    const snapSteps = new Map();   // output index → step
    M.outs.forEach((o, q) => { if (atTime(o)) { const ts = val(o.tc, env); snapSteps.set(q, Math.max(0, Math.min(N, Math.round(ts / h)))); } });
    const needSnap = new Set(snapSteps.values());
    const statKeys = new Set();
    if (eq === 'wave') statKeys.add('u:energy');   // its drift (the leapfrog energy is conserved exactly)
    for (const o of M.outs) if (o.of === 'stat' && o.kind === 'series') statKeys.add((o.field || 'u') + ':' + o.stat);
    for (const e of M.events) if (['max', 'min', 'mean', 'total'].includes(e.of)) statKeys.add(e.field + ':' + e.of);
    for (const k of statKeys) res.rec[k] = [];
    for (const p of M.probes) {
      p.px = val(p.x, env); p.py = G.dim === 2 ? val(p.y, env) : 0; p.x0 = val(p.x0, env); p.x1 = val(p.x1, env); p.y0 = G.dim === 2 ? val(p.y0, env) : 0; p.y1 = G.dim === 2 ? val(p.y1, env) : 0;
      if (p.at === 'area') p.nodes = shapeNodes(G, { shape: 'rect', x0: { num: true, val: p.x0 }, x1: { num: true, val: p.x1 }, y0: { num: true, val: p.y0 }, y1: { num: true, val: p.y1 } }, env);
      if (p.at === 'line' && G.dim === 1) { p.at = 'area'; p.nodes = shapeNodes(G, { shape: 'rect', x0: { num: true, val: p.x0 }, x1: { num: true, val: p.x1 } }, env); }
      res.rec['p:' + p.id] = [];
    }
    const frontLevel = M.front ? val(M.front.level, env) : NaN, frontRow = M.front && G.dim === 2 ? S.nearest(G, G.x0, M.front.y ? val(M.front.y, env) : (G.y0 + G.y1) / 2)[1] : 0;
    if (M.front) res.rec.front = [];
    const fieldOf = f => (f === 'v' ? v : u);
    let started = false;
    const energyWave = (uOld) => {   // leapfrog's conserved energy between levels n (uOld) and n+1 (u); at t = 0 from u0 and u_t(0)
      let kin = 0, pot = 0; const c2 = sc.c * sc.c;
      if (!started) uOld = u;
      for (let q = 0; q < IDX.length; q++) { const k = IDX[q], d = started ? (u[k] - uOld[k]) / h : v[k]; kin += W[q] * d * d; }
      for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
        const k = G.at(i, j);
        if (i + 1 < G.nx || G.periodicX) pot += (u[k + 1] - u[k]) * (uOld[k + 1] - uOld[k]) / (G.dx * G.dx) * ((G.dim === 2 && !G.periodicY && (j === 0 || j === G.ny - 1)) ? 0.5 : 1);
        if (G.dim === 2 && (j + 1 < G.ny || G.periodicY)) pot += (u[k + G.sx] - u[k]) * (uOld[k + G.sx] - uOld[k]) / (G.dy * G.dy) * ((!G.periodicX && (i === 0 || i === G.nx - 1)) ? 0.5 : 1);
      }
      return 0.5 * (kin + c2 * pot) * R.cellArea;
    };
    let prevU = eq === 'wave' ? Float64Array.from(u) : null;   // u at level n−1 for the leapfrog
    const statNow = key => { const [f, st] = key.split(':'); if (st === 'energy' && eq === 'wave') return energyWave(prevU); return fieldStat(R, fieldOf(f), st, sol); };
    const record = (n) => {
      res.rec.t.push(n * h);
      for (const k of statKeys) res.rec[k].push(statNow(k));
      for (const p of M.probes) res.rec['p:' + p.id].push(probeValue(R, fieldOf(p.field), p, sol));
      if (M.front) res.rec.front.push(frontX(R, fieldOf(M.front.field), frontLevel, frontRow));
    };
    const frame = () => { if (G.dim === 1) res.frames.push(S.interior(G, u)); };
    // events: the quantities at each step, crossings interpolated in time
    const evq = e => (e.of === 'probe' ? probeValue(R, fieldOf(M.probes.find(p => p.id === e.probe).field), M.probes.find(p => p.id === e.probe), sol)
      : e.of === 'front' ? frontX(R, fieldOf(M.front.field), frontLevel, frontRow) : fieldStat(R, fieldOf(e.field), e.of, sol));
    for (const e of M.events) res.ev[e.id] = [];
    // timed interrupts on the NoemaSimKit calendar
    const cal = SK().calendar();
    const applySet = it => { for (const [k, cc] of it.set) env[k] = val(cc, env); };
    M.interrupts.forEach((it, q) => { if (it.at) { const ta = val(it.at, env); if (Number.isFinite(ta)) cal.schedule(Math.max(0, ta), 'interrupt', q); } });
    const total0 = closed ? fieldStat(R, u, 'total', sol) : NaN;
    let range0 = null;
    if (adv && !hasSrc) { range0 = [fieldStat(R, u, 'min', sol), fieldStat(R, u, 'max', sol)]; for (const s of S.SIDES) { const b = BU[s]; if (b && b.type === 'dirichlet') { const gs = typeof b.g === 'number' ? [b.g] : Array.from(b.g); for (const g of gs) { range0[0] = Math.min(range0[0], g); range0[1] = Math.max(range0[1], g); } } } }
    // the start
    const changed = () => {   // after an interrupt: the scalars, sources, velocity, boundaries and stability again
      evalScalars(); if (velTD) evalVel(); if (srcTD) evalSrcField(); buildSrc(); BU = bcU(env); if (bcV) BV = bcV(env);
      if (stability() && !m.allowUnstable) return true; return false;
    };
    let stop = false, n = 0;
    while (cal.peek() <= 1e-12 * tEnd) { const e = cal.pop(); applySet(M.interrupts[e.data]); }
    if (changed()) return res;
    fill();
    const evPrev = M.events.map(e => evq(e));
    if (recAt.has(0)) record(0);
    if (frameAt.has(0)) frame();
    if (needSnap.has(0)) res.snaps.set(0, { u: Float64Array.from(u), v: v ? Float64Array.from(v) : null });
    const nine = !!m.nine && G.dim === 2;
    const P2 = { a: new Float64Array(Math.max(G.nx, G.ny)), b: new Float64Array(Math.max(G.nx, G.ny)), c: new Float64Array(Math.max(G.nx, G.ny)), d: new Float64Array(Math.max(G.nx, G.ny)), w: new Float64Array(Math.max(G.nx, G.ny)) };
    const rowKs = j => { const ks = new Int32Array(G.nx); for (let i = 0; i < G.nx; i++) ks[i] = G.at(i, j); return ks; };
    const colKs = i => { const ks = new Int32Array(G.ny); for (let j = 0; j < G.ny; j++) ks[j] = G.at(i, j); return ks; };
    const ROWS = Array.from({ length: G.ny }, (_, j) => rowKs(j)), COLS = G.dim === 2 ? Array.from({ length: G.nx }, (_, i) => colKs(i)) : [];
    const LIM = S.LIMITERS[meth] || (meth === 'upwind' ? S.LIMITERS.upwind : meth === 'laxwendroff' ? S.LIMITERS.laxwendroff : null);
    const sweep = (arr, out, axis) => {   // one conservative advection sweep (LeVeque 2002 §6.12 high-resolution, §19.5 splitting)
      const st = axis === 0 ? 1 : G.sx, hs = axis === 0 ? G.dx : G.dy, A = axis === 0 ? AX : AY, NV = axis === 0 ? NXv : NYv, lam = h / hs;
      const lines = axis === 0 ? ROWS : COLS;
      for (const ks of lines) {
        const n0 = ks.length;
        if (meth === 'laxfriedrichs' || meth === 'centred') {
          for (let q = 0; q < n0; q++) { const k = ks[q]; if (sol && sol[k]) { out[k] = arr[k]; continue; } const fl = NV[k - st] * arr[k - st], fr = NV[k + st] * arr[k + st]; out[k] = (meth === 'laxfriedrichs' ? 0.5 * (arr[k - st] + arr[k + st]) : arr[k]) - 0.5 * lam * (fr - fl); }
          continue;
        }
        let Fm = 0;
        for (let q = -1; q < n0; q++) {
          const k = q < 0 ? ks[0] - st : ks[q], kp = k + st, a = A[k];
          let Fp;
          if (sol && (sol[k] || sol[kp])) Fp = 0;
          else {
            const du = arr[kp] - arr[k];
            Fp = a > 0 ? a * arr[k] : a * arr[kp];
            if (du !== 0 && LIM) { const up = a > 0 ? arr[k] - arr[k - st] : arr[kp + st] - arr[kp]; const phi = LIM(up / du); Fp += 0.5 * Math.abs(a) * (1 - Math.abs(a) * lam) * phi * du; }
          }
          if (q >= 0) out[k] = arr[k] - lam * (Fp - Fm);
          Fm = Fp;
        }
      }
    };
    const fixedNodes = () => { /* Dirichlet sides are reset by fillGhosts */ };
    void fixedNodes;
    let swapOrder = false, halted = false;
    const one = () => {
      n++;
      const t = (n - 1) * h;
      env.t = t;
      if (scalarTD || bcTD || srcTD || velTD) { if (scalarTD) evalScalars(); if (velTD) evalVel(); if (srcTD) evalSrcField(); if (scalarTD || srcTD) buildSrc(); if (bcTD) { BU = bcU(env); if (bcV) BV = bcV(env); } fill(); if ((scalarTD || velTD) && stability() && !m.allowUnstable) { n--; halted = true; return; } }
      if (eq === 'heat' && meth === 'ftcs') {
        S.laplacian(G, u, L, insAny ? ins : null, nine); const D = sc.D;
        for (let q = 0; q < IDX.length; q++) { const k = IDX[q]; un[k] = u[k] + h * (D * L[k] + srcArr[k]); }
        u.set(un);
      } else if (eq === 'heat' && (meth === 'btcs' || meth === 'cn')) {
        const th = meth === 'btcs' ? 1 : 0.5, D = sc.D;
        S.laplacian(G, u, L, insAny ? ins : null);
        for (const k of IDX) un[k] = u[k] + (1 - th) * h * D * L[k] + h * srcArr[k];
        env.t = t + h; const B1 = bcTD ? bcU(env) : BU;
        lineSolve(ROWS[0], G.nx, G.dx, th * h * D / (G.dx * G.dx), B1.left, B1.right, 0, G.periodicX, un, u, sol, fixedVal, P2);
        BU = B1;
      } else if (eq === 'heat' && meth === 'adi') {   // Peaceman & Rachford 1955
        const D = sc.D, h2 = h / 2;
        lapAxis(G, u, L, 1, insAny ? ins : null);
        for (const k of IDX) un[k] = u[k] + h2 * D * L[k] + h2 * srcArr[k];
        env.t = t + h2; const Bh = bcTD ? bcU(env) : BU;
        for (let j = 0; j < G.ny; j++) lineSolve(ROWS[j], G.nx, G.dx, h2 * D / (G.dx * G.dx), Bh.left, Bh.right, j, G.periodicX, un, u, sol, fixedVal, P2);
        S.fillGhosts(G, u, Bh);
        lapAxis(G, u, L, 0, insAny ? ins : null);
        for (const k of IDX) un[k] = u[k] + h2 * D * L[k] + h2 * srcArr[k];
        env.t = t + h; const B1 = bcTD ? bcU(env) : BU;
        for (let i = 0; i < G.nx; i++) lineSolve(COLS[i], G.ny, G.dy, h2 * D / (G.dy * G.dy), B1.bottom, B1.top, i, G.periodicY, un, u, sol, fixedVal, P2);
        BU = B1;
      } else if (adv) {
        const order = G.dim === 2 ? (swapOrder ? [1, 0] : [0, 1]) : [0];
        for (let q = 0; q < order.length; q++) { sweep(u, un, order[q]); u.set(un); if (q + 1 < order.length) { if (sol) fixSolids(u, u0copy); S.fillGhosts(G, u, BU); } }
        swapOrder = !swapOrder;
        if (hasSrc) for (const k of IDX) u[k] += h * srcArr[k];
        if (eq === 'advdiff') { if (sol) fixSolids(u, u0copy); S.fillGhosts(G, u, BU); S.laplacian(G, u, L, insAny ? ins : null); for (const k of IDX) u[k] += h * sc.D * L[k]; }
      } else if (eq === 'wave') {
        S.laplacian(G, u, L, insAny ? ins : null);
        const c2 = sc.c * sc.c, g2 = sc.gam * h / 2;
        if (n === 1) for (const k of IDX) un[k] = u[k] + h * v[k] + 0.5 * h * h * (c2 * L[k] + srcArr[k]) - 0.5 * h * h * sc.gam * v[k];
        else for (const k of IDX) un[k] = (2 * u[k] - (1 - g2) * prevU[k] + h * h * (c2 * L[k] + srcArr[k])) / (1 + g2);
        prevU.set(u); u.set(un); started = true;
        for (const k of IDX) v[k] = (u[k] - prevU[k]) / h;   // u_t (backward), for the record
      } else if (eq === 'rd') {
        const Du = sc.D, Dv = sc.Dv, Pk = sc.P;
        S.laplacian(G, u, L, insAny ? ins : null, nine); if (M.two) S.laplacian(G, v, Lv, insAny ? ins : null, nine);
        const kin = M.kinetics;
        if (kin === 'grayscott') { const Fv = Pk.F, kk = Pk.k; for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k], b = v[k], r = a * b * b; un[k] = a + h * (Du * L[k] - r + Fv * (1 - a) + srcArr[k]); vn2[k] = b + h * (Dv * Lv[k] + r - (Fv + kk) * b); } }
        else if (kin === 'fhn') { for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k], b = v[k]; un[k] = a + h * (Du * L[k] + a - a * a * a / 3 - b + Pk.I + srcArr[k]); vn2[k] = b + h * (Dv * Lv[k] + Pk.eps * (a + Pk.a - Pk.b * b)); } }
        else if (kin === 'schnakenberg') { const g = Pk.gamma; for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k], b = v[k], q = a * a * b; un[k] = a + h * (Du * L[k] + g * (Pk.a - a + q) + srcArr[k]); vn2[k] = b + h * (Dv * Lv[k] + g * (Pk.b - q)); } }
        else if (kin === 'brusselator') { for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k], b = v[k], q = a * a * b; un[k] = a + h * (Du * L[k] + Pk.A - (Pk.B + 1) * a + q + srcArr[k]); vn2[k] = b + h * (Dv * Lv[k] + Pk.B * a - q); } }
        else if (kin === 'fisher') { const r = Pk.r; for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k]; un[k] = a + h * (Du * L[k] + r * a * (1 - a) + srcArr[k]); } }
        else {   // custom kinetics in NoemaExpr (counted in the formula budget)
          for (const [kk, vv] of Object.entries(Pk)) env[kk] = vv;
          const fu = M.reaction.u.f, fv = M.reaction.v ? M.reaction.v.f : null; let q = 0;
          for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++, q++) {
            const k = IDX[q]; env.x = G.xs[i]; env.y = G.ys[j]; env.u = u[k]; env.v = v ? v[k] : 0;
            un[k] = u[k] + h * (Du * L[k] + fu(env) + srcArr[k]);
            if (M.two) vn2[k] = v[k] + h * (Dv * Lv[k] + fv(env));
          }
          ctx.expr(G.cells * (fv ? 2 : 1));
        }
        u.set(un); if (M.two) v.set(vn2);
      }
      if (sol) { fixSolids(u, u0copy); if (v && M.two) fixSolids(v, v0copy); }
      env.t = n * h;
      // interrupts due by this time
      let ch = false;
      while (cal.peek() <= n * h + 1e-9 * h) { const e = cal.pop(); applySet(M.interrupts[e.data]); ch = true; }
      if (ch && changed()) { stop = true; }
      if (bcTD && !ch) { BU = bcU(env); if (bcV) BV = bcV(env); }
      fill();
      // blow-up watch: every 16 steps and at the records
      if ((n & 15) === 0 || recAt.has(n) || n === N) {
        let bad = false; for (let qi = 0, nI = IDX.length; qi < nI; qi++) { const k = IDX[qi]; const a = u[k]; if (!(a > -1e150 && a < 1e150)) { bad = true; break; } }
        if (bad) { ctx.code(u.some(x => x !== x) ? 'nan' : 'blow-up', n * h); ctx.code('blow-up', n * h); halted = true; return; }
      }
      // events
      if (M.events.length) {
        M.events.forEach((e, q) => {
          const now = evq(e), lv = val(e.level, env), was = evPrev[q];
          const up = was < lv && now >= lv, dn = was > lv && now <= lv;
          if ((e.dir >= 0 && up) || (e.dir <= 0 && dn) ? (e.dir !== 0 || up || dn) : false) {
            const tc = (n - 1) * h + h * (Number.isFinite(was) && now !== was ? (lv - was) / (now - was) : 1);
            if (res.ev[e.id].length < MAX_EVENTS) res.ev[e.id].push(tc); else ctx.code('event-limit');
            M.interrupts.forEach(it => { if (it.on === e.id) { applySet(it); if (changed()) stop = true; } });
            if (e.stop) { stop = true; ctx.code('stopped', tc); }
          }
          evPrev[q] = now;
        });
      }
      if (recAt.has(n) || stop) record(n);
      if (frameAt.has(n)) frame();
      if (needSnap.has(n)) res.snaps.set(n, { u: Float64Array.from(u), v: v ? Float64Array.from(v) : null });
    };
    /** advance by k steps (fewer when the run ends, stops or halts); → the steps taken */
    const advance = k => { const n0 = n, end = Math.min(N, n + k); while (n < end && !stop && !halted) one(); return n - n0; };
    /** inputs from outside (a co-simulation): the spec's names change, then the scalars, sources, boundaries and stability again */
    const input = inp => { let any = false; for (const [k, x] of Object.entries(inp || {})) if ((typeof x === 'number' || typeof x === 'boolean') && env[k] !== x) { env[k] = x; any = true; } if (any) { if (changed()) halted = true; else fill(); } };
    const finish = () => { finishTime(res, n, h, { u, v, sol, prevU, sc, closed, eq, energyWave, total0, R, range0, M, ctx }); return res; };
    if (mode === 'stepper') return { ok: true, res, advance, finish, input, env, h, N, get n() { return n; }, get done() { return n >= N || stop || halted; }, u, v };
    advance(N);
    return finish();
  }
  function finishTime(res, n, h, X) {
    const { u, v, sol, prevU, sc, closed, eq, energyWave, total0, R, range0, M, ctx } = X;
    res.stepsDone = n;
    res.tStop = res.stepsDone * h;
    res.u = u; res.v = v; res.sol = sol; res.prevU = prevU; res.sc = sc; res.closed = closed;
    res.energyNow = eq === 'wave' ? () => energyWave(prevU) : null;
    if (closed) { const t1 = fieldStat(R, u, 'total', sol); res.drift = Math.abs(t1 - total0) / Math.max(Math.abs(total0), 1e-300); if (res.drift > 1e-9) ctx.code('mass-drift'); }
    else res.drift = NaN;
    if (eq === 'wave' && res.rec['u:energy'] && res.rec['u:energy'].length > 1) { const E = res.rec['u:energy'], e0 = E.length > 2 ? E[1] : E[0]; res.drift = Math.abs(E[E.length - 1] - e0) / Math.max(Math.abs(e0), 1e-300); }
    if (range0) { const lo = fieldStat(R, u, 'min', sol), hi = fieldStat(R, u, 'max', sol), sc0 = Math.max(1e-12, range0[1] - range0[0]); if (lo < range0[0] - 1e-9 * sc0 || hi > range0[1] + 1e-9 * sc0) ctx.code('overshoot'); }
    if (M.front && res.rec.front.every(x => !Number.isFinite(x))) ctx.code('front-not-found');
    return res;
  }

  /* ======================================================================================================================
     Poisson −∇²u = s by Jacobi, Gauss–Seidel or SOR (Young 1954; LeVeque 2007 ch. 4), stopped when the residual has fallen by tol
     ====================================================================================================================== */
  function runPoisson(M, env, ctx) {
    const R = makeGrid(M, env, ctx); if (!R) return null;
    const { G, IDX, W } = R, meth = M.method;
    for (const [k, cc] of M.vars) env[k] = val(cc, env);
    env.t = 0;
    const u = S.field(G), s = S.field(G);
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { env.x = G.xs[i]; env.y = G.ys[j]; const k = G.at(i, j); u[k] = M.init ? val(M.init, env) : 0; s[k] = M.source ? val(M.source, env) : 0; }
    const rates = M.sources.map(sr => val(sr.rate, env));
    M.sources.forEach((sr, q) => { const dens = sr.shape === 'point' ? rates[q] / R.cellArea : rates[q]; for (const k of shapeNodes(G, sr, env)) s[k] += dens; });
    let sol = null; const fixedVal = new Float64Array(G.size).fill(NaN);
    if (M.obstacles.length) { sol = new Uint8Array(G.size); for (const o of M.obstacles) { const vv = o.value ? val(o.value, env) : NaN; for (const k of shapeNodes(G, o, env)) { sol[k] = 1; fixedVal[k] = vv; if (Number.isFinite(vv)) u[k] = vv; } } }
    const B = makeBC(M, G, 'u', ctx)(env);
    const fixed = S.fixedMask(G, B);
    S.fillGhosts(G, u, B);
    const anyFixed = fixed.some(x => x) || (sol && Array.from(fixedVal).some(Number.isFinite)) || S.SIDES.some(sd => B[sd] && B[sd].type === 'robin' && B[sd].a !== 0);
    // the pure Neumann / periodic problem: solvable only when the sources balance the boundary fluxes (compatibility)
    if (!anyFixed) {
      let tot = 0, sw = 0; for (let q = 0; q < IDX.length; q++) { tot += W[q] * s[IDX[q]]; sw += W[q]; }
      let flux = 0; for (const sd of S.SIDES) { const b = B[sd]; if (b && b.type === 'neumann') { const len = (sd === 'left' || sd === 'right') ? (G.dim === 2 ? G.y1 - G.y0 : 1) : G.x1 - G.x0; flux += (typeof b.g === 'number' ? b.g : Array.from(b.g).reduce((a, x) => a + x, 0) / b.g.length) * len; } }
      const area = (G.x1 - G.x0) * (G.dim === 2 ? G.y1 - G.y0 : 1);
      if (Math.abs(tot / sw * area + flux) > 1e-9 * (Math.abs(tot / sw * area) + Math.abs(flux) + 1e-300)) ctx.code('incompatible');
    }
    const ix2 = 1 / (G.dx * G.dx), iy2 = G.dim === 2 ? 1 / (G.dy * G.dy) : 0;
    const solver = M.solver, tol = typeof solver.tol === 'number' ? solver.tol : 1e-6, maxIter = Number.isInteger(solver.maxIter) ? solver.maxIter : 20000;
    const nmax = Math.max(G.nx, G.ny);
    const omega = meth === 'sor' ? (solver.omega != null ? val({ num: typeof solver.omega === 'number', val: solver.omega, f: C.cx(solver.omega) }, env) : 2 / (1 + Math.sin(Math.PI / (nmax - 1)))) : 1;
    const free = []; for (const k of IDX) if (!fixed[k] && !(sol && sol[k])) free.push(k);
    const nb = G.dim === 2 ? [-1, 1, -G.sx, G.sx] : [-1, 1], wts = G.dim === 2 ? [ix2, ix2, iy2, iy2] : [ix2, ix2];
    const residual = () => {
      let r = 0;
      for (const k of free) { let lap = 0, cc = u[k]; for (let q = 0; q < nb.length; q++) { const kk = k + nb[q]; lap += ((sol && sol[kk] && !Number.isFinite(fixedVal[kk])) ? cc : u[kk]) * wts[q]; } lap -= 2 * (ix2 + iy2) * cc; const e = Math.abs(lap + s[k]); if (e > r) r = e; }
      return r;
    };
    const hist = []; let r0 = residual(), r = r0, it = 0;
    hist.push(r0);
    const un = meth === 'jacobi' ? Float64Array.from(u) : null;
    const work = free.length * 2;
    const maxBy = Math.floor(MAX_WORK / Math.max(1, work));
    const cap = Math.min(maxIter, maxBy);
    const scale = Math.max(r0, 1e-300);
    const gauge = () => { if (anyFixed) return; let m0 = 0, sw = 0; for (let q = 0; q < IDX.length; q++) { m0 += W[q] * u[IDX[q]]; sw += W[q]; } m0 /= sw; for (const k of IDX) u[k] -= m0; S.fillGhosts(G, u, B); };
    if (!anyFixed) { let m0 = 0, sw = 0; for (let q = 0; q < IDX.length; q++) { m0 += W[q] * s[IDX[q]]; sw += W[q]; } m0 /= sw; for (const k of IDX) s[k] -= m0; r0 = residual(); r = r0; hist[0] = r0; }
    while (r > tol * scale && r > 1e-13 * (1 + Math.abs(fieldStat(R, s, 'max')) ) && it < cap) {
      it++;
      if (meth === 'jacobi') {
        for (const k of free) { let sum = s[k], diag = 2 * (ix2 + iy2); for (let q = 0; q < nb.length; q++) { const kk = k + nb[q]; if (sol && sol[kk] && !Number.isFinite(fixedVal[kk])) diag -= wts[q]; else sum += u[kk] * wts[q]; } un[k] = sum / diag; }
        for (const k of free) u[k] = un[k];
      } else {
        for (const k of free) { let sum = s[k], diag = 2 * (ix2 + iy2); for (let q = 0; q < nb.length; q++) { const kk = k + nb[q]; if (sol && sol[kk] && !Number.isFinite(fixedVal[kk])) diag -= wts[q]; else sum += u[kk] * wts[q]; } const gs = sum / diag; u[k] += omega * (gs - u[k]); }
      }
      S.fillGhosts(G, u, B);
      gauge();
      r = residual();
      if (!Number.isFinite(r)) { ctx.code('blow-up'); break; }
      if (hist.length < 20000) hist.push(r);
    }
    if (r > tol * scale && !(r <= 1e-13 * (1 + Math.abs(fieldStat(R, s, 'max'))))) { ctx.code('no-converge'); if (it >= maxBy && maxBy < maxIter) ctx.code('budget'); }
    return { R, u, v: null, sol, iterations: it, residual: r / scale, hist, omega, stab: {}, rec: { t: [] }, ev: {}, frames: [], snaps: new Map(), drift: NaN };
  }

  /* ======================================================================================================================
     Cellular automata (synchronous or random-sequential update; NoemaSimKit stream 'field.ca')
     ====================================================================================================================== */
  function parseBS(bs) { const m = /^B([0-8]*)\/S([0-8]*)$/.exec(bs || ''); let b = 0, s = 0; if (m) { for (const ch of m[1]) b |= 1 << +ch; for (const ch of m[2]) s |= 1 << +ch; } return [b, s]; }
  function runCA(M, env, ctx, seed) {
    const m = M.m, ca = M.ca, dim = M.dim, nx = m.grid.nx, ny = dim === 2 ? (m.grid.ny || nx) : 1, n = nx * ny;
    const rng = SK().stream(seed, 'field.ca');
    const rule = ca.rule, steps = Number.isInteger(ca.steps) ? ca.steps : 100, wrap = ca.wrap !== false && rule !== 'sandpile';
    const async = ca.update === 'async';
    const hood = ca.neighbourhood || (rule === 'life' ? 'moore' : 'vonneumann');
    const states = rule === 'gh' ? (ca.states || 3) : rule === 'forestfire' ? 3 : 2;
    let g = rule === 'sandpile' ? new Int32Array(n) : new Uint8Array(n);
    const dens = val(ca.density, env);
    const init = ca.init || (rule === 'elementary' ? 'single' : rule === 'sandpile' ? 'none' : 'random');
    if (init === 'random') for (let k = 0; k < n; k++) g[k] = rule === 'sandpile' ? Math.floor(rng() * 4) : rng() < dens ? (rule === 'gh' ? 1 + rng.int(states - 1) : 1) : 0;
    else if (init === 'single') g[Math.floor(ny / 2) * nx + Math.floor(nx / 2)] = 1;
    else if (init === 'cells') for (const c of list(ca.cells)) { const i = Math.round(c[0]), j = dim === 2 ? Math.round(c[1]) : 0; if (i >= 0 && i < nx && j >= 0 && j < ny) g[j * nx + i] = 1; }
    const nbr = dim === 2 ? S.latticeNeighbours(nx, ny, hood, 1, wrap) : null;
    const rows = [], pop = [], aval = [], tt = [];
    const count = () => { let c = 0; for (let k = 0; k < n; k++) if (rule === 'sandpile' ? false : g[k] === 1) c++; if (rule === 'sandpile') { for (let k = 0; k < n; k++) c += g[k]; } return c; };
    if (rule === 'elementary') rows.push(Uint8Array.from(g));
    pop.push(count()); tt.push(0);
    const code = ca.code | 0, [Bm, Sm] = parseBS(ca.bs), thr = ca.threshold || 1;
    const p = rule === 'forestfire' ? val(ca.p, env) : 0, f = rule === 'forestfire' ? val(ca.f, env) : 0;
    let topples = 0;
    // sandpile relaxation (Bak, Tang & Wiesenfeld 1987; Dhar 1990: the final state does not depend on the order — abelian)
    const relax = () => {
      let size = 0;
      if (!async) {   // parallel rounds: every unstable site topples at once
        let any = true;
        while (any && topples < MAX_TOPPLE) {
          any = false; const add = new Int32Array(n);
          for (let k = 0; k < n; k++) if (g[k] >= 4) { const q = g[k] >> 2; any = true; add[k] -= 4 * q; size += q; topples += q; for (let e = nbr.off[k]; e < nbr.off[k + 1]; e++) add[nbr.nbr[e]] += q; }
          for (let k = 0; k < n; k++) g[k] += add[k];
        }
      } else {        // one site at a time, from a stack
        const st = []; for (let k = 0; k < n; k++) if (g[k] >= 4) st.push(k);
        while (st.length && topples < MAX_TOPPLE) { const k = st.pop(); if (g[k] < 4) continue; const q = g[k] >> 2; g[k] -= 4 * q; size += q; topples += q; for (let e = nbr.off[k]; e < nbr.off[k + 1]; e++) { const j = nbr.nbr[e]; g[j] += q; if (g[j] >= 4) st.push(j); } }
      }
      if (topples >= MAX_TOPPLE) ctx.code('topple-limit');
      return size;
    };
    if (rule === 'sandpile' && ca.pile) { g[Math.floor(ny / 2) * nx + Math.floor(nx / 2)] += ca.pile; relax(); pop[0] = count(); }
    const order = async ? Array.from({ length: n }, (_, k) => k) : null;
    const next = rule === 'sandpile' ? null : new Uint8Array(n);
    const newState = (k, src) => {
      if (rule === 'elementary') { const i = k; const l = i > 0 ? src[i - 1] : wrap ? src[n - 1] : 0, r = i < n - 1 ? src[i + 1] : wrap ? src[0] : 0; return (code >> ((l << 2) | (src[i] << 1) | r)) & 1; }
      let c = 0, burn = false;
      for (let e = nbr.off[k]; e < nbr.off[k + 1]; e++) { const s = src[nbr.nbr[e]]; if (rule === 'life' && s === 1) c++; else if (rule === 'gh' && s === 1) c++; else if (rule === 'forestfire' && s === 2) burn = true; }
      const s0 = src[k];
      if (rule === 'life') return s0 ? ((Sm >> c) & 1) : ((Bm >> c) & 1);
      if (rule === 'gh') return s0 === 0 ? (c >= thr ? 1 : 0) : (s0 + 1) % states;
      if (rule === 'forestfire') return s0 === 2 ? 0 : s0 === 1 ? (burn || rng() < f ? 2 : 1) : (rng() < p ? 1 : 0);
      return s0;
    };
    for (let st = 1; st <= steps; st++) {
      if (rule === 'sandpile') {
        const k = ca.drop === 'random' ? rng.int(n) : Math.floor(ny / 2) * nx + Math.floor(nx / 2);
        g[k] += 1; aval.push(relax());
      } else if (async) { rng.shuffle(order); for (const k of order) g[k] = newState(k, g); }
      else { for (let k = 0; k < n; k++) next[k] = newState(k, g); g.set(next); }
      if (rule === 'elementary') rows.push(Uint8Array.from(g));
      pop.push(rule === 'gh' ? (() => { let c = 0; for (let k = 0; k < n; k++) if (g[k] === 1) c++; return c; })() : count()); tt.push(st);
    }
    return { ca: true, g, nx, ny, rows, pop, aval, tt, states, rule, R: null, rec: { t: tt }, ev: {}, stab: {}, frames: [], snaps: new Map(), drift: NaN, topples };
  }

  /* ======================================================================================================================
     Scenes
     ====================================================================================================================== */
  function heatScene(R, arr, o, env, M) {
    const { G } = R, sc = C.scene([G.x0, G.x1 + (G.periodicX ? G.dx : 0), G.y0, G.y1 + (G.periodicY ? G.dy : 0)]);
    const vals = S.interior(G, arr);
    let lo = Infinity, hi = -Infinity; for (const x of vals) if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
    const ex = [G.x0 - (G.periodicX ? 0 : G.dx / 2), G.x1 + (G.periodicX ? G.dx : G.dx / 2), G.y0 - (G.periodicY ? 0 : G.dy / 2), G.y1 + (G.periodicY ? G.dy : G.dy / 2)];
    sc.poly([ex[0], ex[2], ex[1], ex[2], ex[1], ex[3], ex[0], ex[3]], { c: 'muted' });
    S.heatmap(sc, vals, G.nx, G.ny, ex, { levels: o.levels || 5, lo, hi, maxItems: 1200 });
    const nc = Number.isInteger(o.contours) ? o.contours : 0;
    for (let q = 1; q <= nc && hi > lo; q++) S.contour(sc, vals, G.nx, G.ny, G.xs, G.ys, lo + (hi - lo) * q / (nc + 1), { c: 'base', w: 1, maxItems: Math.floor(600 / nc) });
    if (R.sol) for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) if (R.sol[G.at(i, j)] && ((i + j) % 2 === 0)) sc.pt(G.xs[i], G.ys[j], { r: 1.5, c: 'base' });
    const out = sc.done(); out.view = ex; return out;
  }
  function caScene(res) {
    const { nx, ny } = res;
    if (res.rule === 'elementary') {   // the space–time diagram, time downwards
      const rows = res.rows, T = rows.length, step = Math.max(1, Math.ceil(T / 200)), vals = [], used = [];
      for (let r = 0; r < T; r += step) used.push(rows[r]);
      const Ty = used.length; for (let r = Ty - 1; r >= 0; r--) for (let i = 0; i < nx; i++) vals.push(used[r][i]);
      const sc = C.scene([0, nx, 0, Ty]); S.heatmap(sc, vals, nx, Ty, [0, nx, 0, Ty], { levels: 2, lo: 0, hi: 1, maxItems: 1800 }); return sc.done();
    }
    const sc = C.scene([0, nx, 0, ny]);
    const vals = Array.from(res.g, x => (res.rule === 'sandpile' ? Math.min(3, x) : x));
    const hi = res.rule === 'sandpile' ? 3 : res.states - 1;
    S.heatmap(sc, vals, nx, ny, [0, nx, 0, ny], { levels: Math.min(5, hi + 1), lo: 0, hi: hi + 1e-9, maxItems: 1800 });
    return sc.done();
  }
  function spaceTime(res) {
    const { G } = res.R, F = res.frames, T = F.length, sc = C.scene([G.x0, G.x1, 0, res.tStop || res.tEnd || 1]);
    if (!T) return sc.done();
    const vals = []; let lo = Infinity, hi = -Infinity;
    for (let r = 0; r < T; r++) for (let i = 0; i < G.nx; i++) { const x = F[r][i]; vals.push(x); if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } }
    const tTop = res.tStop != null ? res.tStop : res.tEnd;
    S.heatmap(sc, vals, G.nx, T, [G.x0, G.x1, 0, tTop], { levels: 5, lo, hi, maxItems: 1800 });
    const d = sc.done(); const w = G.x1 - G.x0; d.view = [G.x0, G.x1, 0, tTop]; if (tTop > 3 * w || tTop < w / 3) { /* the app draws one scale on both axes: a stretched time axis keeps the picture square */ d.view = [G.x0, G.x1, 0, tTop]; d.stretch = w / tTop; }
    return d;
  }

  /* ======================================================================================================================
     run(spec, env, {seed, prepared}) → {out, codes}
     ====================================================================================================================== */
  const empty = o => (o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN);
  function turingOf(M, env, ctx) {
    let tur = null;
    if (M.two && M.outs.some(o => /^turing/.test(o.of))) {
      env.t = 0; for (const [k, cc] of M.vars) if (env[k] === undefined) env[k] = val(cc, env);
      const Pk = {}; for (const [k, cc] of Object.entries(M.kp)) Pk[k] = val(cc, env);
      tur = M.kinetics !== 'custom' ? turing(M.kinetics, Pk, val(M.D, env), val(M.Dv, env)) : null;
      if (!tur) ctx.code('unknown-steady'); else if (!tur.cond) ctx.code('not-turing');
    }
    return tur;
  }
  function buildOutputs(M, res, env, ctx, tur, usable, out) {
    const fieldArr = f => (res ? (f === 'v' ? res.v : res.u) : null);
    for (const o of M.outs) {
      let v;
      try {
        const of = o.of, f = o.field || 'u';
        if (res && res.ca) {
          if (of === 't') v = res.tt.slice();
          else if (of === 'population') v = o.kind === 'series' ? res.pop.slice() : res.pop[res.pop.length - 1];
          else if (of === 'density') v = res.pop[res.pop.length - 1] / (res.nx * res.ny);
          else if (of === 'cell') { const i = Math.round(val(o.xc, env)), j = res.ny > 1 ? Math.round(val(o.yc, env)) : 0; v = i >= 0 && i < res.nx && j >= 0 && j < res.ny ? res.g[j * res.nx + i] : NaN; }
          else if (of === 'avalanche') v = res.aval.slice();
          else if (of === 'avalancheMean') v = res.aval.length ? res.aval.reduce((a, b) => a + b, 0) / res.aval.length : NaN;
          else if (of === 'avalancheTau') {   // discrete power law, the MLE of Clauset, Shalizi & Newman 2009 eq. 3.7 (s_min = 1)
            const sz = res.aval.filter(s => s >= 1); v = sz.length >= 10 ? 1 + sz.length / sz.reduce((a, s) => a + Math.log(s / 0.5), 0) : NaN;
          }
          else if (of === 'x') v = Array.from({ length: res.nx }, (_, i) => i);
          else if (of === 'y') v = Array.from({ length: res.ny }, (_, j) => j);
          else if (of === 'steps') v = res.tt.length - 1;
          else if (of === 'heatmap' || of === 'spacetime') v = caScene(res);
        } else if (of === 'x') v = res && res.R ? Array.from(res.R.G.xs) : [];
        else if (of === 'y') v = res && res.R ? Array.from(res.R.G.ys) : [];
        else if (of === 'cfl') v = res && res.stab ? res.stab.cfl : NaN;
        else if (of === 'r') v = res && res.stab ? res.stab.r : NaN;
        else if (of === 'gain') v = res && res.stab ? res.stab.gain : NaN;
        else if (of === 'dtMax') v = res && res.stab ? res.stab.dtMax : NaN;
        else if (of === 'dt') v = res ? res.dt : NaN;
        else if (of === 'turing') v = tur ? (tur.cond ? 1 : 0) : NaN;
        else if (of === 'turingK') v = tur ? tur.k : NaN;
        else if (of === 'turingWavelength') v = tur ? tur.wavelength : NaN;
        else if (of === 'iterations') v = res ? res.iterations : NaN;
        else if (of === 'residual') v = o.kind === 'series' ? (res && res.hist ? C.thin(res.hist.map(x => x / Math.max(res.hist[0], 1e-300)), 2000) : []) : (res ? res.residual : NaN);   // relative to the first residual, as the stopping test
        else if (of === 'steps') v = res ? (res.iterations != null ? res.iterations : res.stepsDone) : NaN;
        else if (!usable && !(M.m.allowUnstable && res && res.u)) v = undefined;
        else if (of === 't') v = res.rec.t.slice();
        else if (of === 'stat' && o.kind === 'series') v = (res.rec[f + ':' + o.stat] || []).slice();
        else if (of === 'probe' && atTime(o) && res.snaps && res.snaps.get(Math.max(0, Math.min(res.N, Math.round(val(o.tc, env) / res.dt))))) { const sn = res.snaps.get(Math.max(0, Math.min(res.N, Math.round(val(o.tc, env) / res.dt)))), pr = M.probes.find(p => p.id === o.probe); v = pr ? probeValue(res.R, pr.field === 'v' ? sn.v : sn.u, pr, res.sol) : NaN; }
        else if (of === 'probe') { const s = res.rec['p:' + o.probe] || []; v = o.kind === 'series' ? s.slice() : (res.iterations != null ? probeValue(res.R, res.u, M.probes.find(p => p.id === o.probe), res.sol) : s[s.length - 1]); }
        else if (of === 'front') v = (res.rec.front || []).slice();
        else if (of === 'frontSpeed') {   // least squares over the second half of the run
          const T = res.rec.t, X = res.rec.front || [], pts = []; for (let q = 0; q < T.length; q++) if (T[q] >= (res.tStop || res.tEnd) / 2 && Number.isFinite(X[q])) pts.push([T[q], X[q]]);
          if (pts.length >= 3) { let st = 0, sx = 0, stt = 0, stx = 0; for (const [a, b] of pts) { st += a; sx += b; stt += a * a; stx += a * b; } const k = pts.length; v = (k * stx - st * sx) / (k * stt - st * st); } else { v = NaN; ctx.code('front-not-found'); }
        }
        else if (of === 'eventTime') { const ts = res.ev[o.event] || []; if (o.kind === 'series') v = ts.slice(); else { const k = o.nth > 0 ? o.nth - 1 : ts.length + o.nth; v = k >= 0 && k < ts.length ? ts[k] : NaN; } }
        else if (of === 'eventCount') v = (res.ev[o.event] || []).length;
        else if (of === 'drift') v = res.drift;
        else {
          let arr = fieldArr(f);
          let tAt = null;
          if (atTime(o) && res.snaps) { const step = Math.max(0, Math.min(res.N, Math.round(val(o.tc, env) / res.dt))); const sn = res.snaps.get(step); if (sn) { arr = f === 'v' ? sn.v : sn.u; tAt = step * res.dt; } }
          if (!arr) v = undefined;
          else if (of === 'final') v = o.stat === 'energy' && res.energyNow ? res.energyNow() : fieldStat(res.R, arr, o.stat, res.sol);
          else if (of === 'at') v = S.sample(res.R.G, arr, val(o.xc, env), res.R.G.dim === 2 ? val(o.yc, env) : 0);
          else if (of === 'profile') v = profileOf(res.R, arr, o, env);
          else if (of === 'error') {
            const { G, IDX, W } = res.R; let s2 = 0, sw = 0, mx = 0; env.t = tAt != null ? tAt : res.tStop != null ? res.tStop : 0; let q = 0;
            for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++, q++) { const k = IDX[q]; if (res.sol && res.sol[k]) continue; env.x = G.xs[i]; env.y = G.ys[j]; const e = arr[k] - o.ec.f(env); s2 += W[q] * e * e; sw += W[q]; mx = Math.max(mx, Math.abs(e)); if (e !== e) mx = NaN; }
            v = o.norm === 'max' ? mx : Math.sqrt(s2 / sw);
          }
          else if (of === 'wavelength') {
            const { G } = res.R;
            if (G.dim === 1) v = crossWavelength(Array.from(S.interior(G, arr)), G.dx);
            else { const row = [], col = []; const jm = Math.floor(G.ny / 2), im = Math.floor(G.nx / 2); for (let i = 0; i < G.nx; i++) row.push(arr[G.at(i, jm)]); for (let j = 0; j < G.ny; j++) col.push(arr[G.at(im, j)]); const a = crossWavelength(row, G.dx), b = crossWavelength(col, G.dy); v = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b; }
            if (!Number.isFinite(v)) ctx.code('period-not-found');
          }
          else if (of === 'heatmap') v = heatScene(Object.assign({}, res.R, { sol: res.sol }), arr, o, env, M);
          else if (of === 'spacetime') v = spaceTime(res);
        }
      } catch (err) { v = undefined; }
      if (v === undefined || v === null) v = empty(o);
      if (o.kind === 'series') v = C.thin(Array.from(v), 2000);
      out[o.id] = v;
    }
    for (const o of M.outs) if (o.of === 'flag') out[o.id] = ctx.has(o.code) ? 1 : 0; else if (o.of === 'ok') out[o.id] = ctx.fatal() ? 0 : 1;
    return out;
  }
  function run(spec, env0, opts) {
    const M = (opts && opts.prepared) || prepare(spec), out = {};
    if (!M) { for (const o of list(spec && spec.outputs)) if (isObj(o)) out[o.id] = empty(o); return { out, codes: [{ code: 'model', level: 'error' }] }; }
    if (!NoemaSimKit) { for (const o of M.outs) out[o.id] = o.of === 'flag' ? (o.code === 'kernel' ? 1 : 0) : o.of === 'ok' ? 0 : empty(o); return { out, codes: [{ code: 'kernel', level: 'error' }] }; }
    const env = Object.assign(Object.create(null), env0 || {}), ctx = makeCtx(), seed = ((opts && opts.seed) >>> 0) || 1;
    let res = null;
    try { res = M.eq === 'ca' ? runCA(M, env, ctx, seed) : M.eq === 'poisson' ? runPoisson(M, env, ctx) : runTime(M, env, ctx, seed); } catch (e) { res = null; ctx.code('nan'); }
    const fatal = ctx.fatal() && !(M.m.allowUnstable && !ctx.has('budget') && !ctx.has('grid'));
    const usable = res && (res.u || res.ca) && !fatal;
    // the Turing analysis (kinetics with a known homogeneous state)
    const tur = turingOf(M, env, ctx);
    buildOutputs(M, res, env, ctx, tur, usable, out);
    return { out, codes: ctx.list(), evals: ctx.evals };
  }

  /* ---------- the stepper (co-simulation, docs/library/simkit.md: init(model, inputs, ctx) → state; step(state, inputs, t, dt, ctx)
     → {state, out, dt, events}): an equation in time advances by whole steps of its own dt (h = tEnd / N), the inputs (the spec's
     names) are applied before each macro step; poisson and ca are computed once, at the first step ---------- */
  const asSpec = m => (isObj(m) && isObj(m.model) ? m : { format: 'noema.sim-spec/v1', engine: ID, model: m, outputs: [] });
  const stepDef = {
    id: ID,
    init(model, inputs, sctx) {
      const spec = sctx && isObj(sctx.spec) && sctx.spec.model === model ? sctx.spec : asSpec(model), M = prepare(spec); if (!M) return { bad: true, spec };   // makeEngine passes the model and the whole spec in ctx
      const env = Object.assign(Object.create(null), inputs || {}), ctx = makeCtx(), seed = ((sctx && sctx.seed) >>> 0) || 1;
      if (M.eq === 'ca' || M.eq === 'poisson') return { spec, M, env, ctx, seed, once: true, evSeen: {} };
      const sim = runTime(M, env, ctx, seed, 'stepper');
      return { spec, M, env, ctx, seed, sim: sim && sim.ok ? sim : null, res: sim && !sim.ok ? sim : null, evSeen: {} };
    },
    step(st, inputs, t, dt) {
      if (!st || st.bad) return { state: st, out: {}, dt: 0, fail: 'model' };
      const { M, env, ctx } = st, out = {};
      let res, taken = dt;
      if (st.once) { if (!st.res) { Object.assign(env, inputs || {}); st.res = M.eq === 'ca' ? runCA(M, env, ctx, st.seed) : runPoisson(M, env, ctx); } res = st.res; }
      else if (st.sim) {
        st.sim.input(inputs);
        const want = Math.max(0, Math.round(((t || 0) + dt) / st.sim.h + 1e-9) - st.sim.n);
        const k = st.sim.advance(want); res = st.sim.finish();
        taken = Math.max(0, Math.min(dt, st.sim.n * st.sim.h - (t || 0)));
        if (k < want && !st.sim.done) taken = k * st.sim.h;
      } else { res = st.res; taken = 0; }
      const usable = res && (res.u || res.ca) && !ctx.fatal();
      buildOutputs(M, res, env, ctx, turingOf(M, env, ctx), usable, out);
      const events = [];
      if (res && res.ev) for (const [id, ts] of Object.entries(res.ev)) { const seen = st.evSeen[id] || 0; for (let q = seen; q < ts.length; q++) events.push({ t: ts[q], kind: 'event', data: { id } }); st.evSeen[id] = ts.length; }
      return { state: st, out, dt: taken, events };
    },
    snapshot: null,
  };
  const stepper = NoemaSimKit && typeof NoemaSimKit.stepper === 'function' ? NoemaSimKit.stepper(stepDef) : stepDef;
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true, stepper });
  const API = Object.freeze({
    table: { model: TABLE, outputs: { scalar: SCALARS, series: SERIES, scene: SCENES }, fields: OUT_FIELDS },   // the form of the activity author (src/engines/kernel/schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine,
    EQUATIONS: Object.freeze(EQUATIONS.slice()), METHODS: Object.freeze(Object.assign({}, METHODS)), KINETICS: Object.freeze(KINETICS.slice()), CA_RULES: Object.freeze(CA_RULES.slice()),
    CODES: Object.freeze(CODES.slice()), SERIES: Object.freeze(SERIES.slice()), SCALARS: Object.freeze(SCALARS.slice()), SCENES: Object.freeze(SCENES.slice()), STATS: Object.freeze(STATS.slice()),
    stepper, turing, steadyState, parseBS, MAX_WORK, MAX_EXPR,
  });
  export default API;
  /* i18n-ignore-end */
