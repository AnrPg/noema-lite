/* ===================== des@1 — discrete-event simulation of queues and service networks (docs/library/des.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md §1) on the simulation kernel NoemaSimKit (src/engines/kernel/simkit.js):
   entities of up to 8 classes arrive from sources (Poisson, any interarrival distribution, a schedule of times, a rate schedule as a
   non-homogeneous Poisson process, batches), wait in queues (FIFO, LIFO, priority, SPT) at up to 16 stations (servers with a
   capacity, shifts, breakdowns and repairs, pre-emption with resume / restart / resample; delays = infinite servers), balk, renege
   and jockey, and are routed (probabilistically, by condition, to the shortest queue) through a network to the exit.
   Outputs: utilisation, waits, time-weighted queue lengths, throughput, counts, with Student-t intervals over independent
   replications or batch means; warm-up fixed or found by MSER-5; the analytic values where queueing theory has them (M/M/c by
   Erlang C, M/M/c/K, M/G/1 by Pollaczek–Khinchine, M/D/1, M/G/∞, M/G/1 priority by Cobham 1954 / preemptive-resume, Jackson
   networks) and whether the interval covers them; Little's law; series of rep 1; scenes: the station network with queue bars, a
   Gantt chart of the servers, the event log.
   Sources: Law, Simulation Modeling and Analysis 5th ed. 2015 (ch. 1–2 the event-scheduling world view, ch. 9 output analysis);
   Banks, Carson, Nelson & Nicol, Discrete-Event System Simulation 5th ed. 2010 (ch. 6 queueing models, the bank with jockeying);
   Gross, Shortle, Thompson & Harris, Fundamentals of Queueing Theory 4th ed. 2008 (M/M/c, M/M/c/K, M/G/1, priorities, Jackson);
   Kleinrock, Queueing Systems I 1975; Cobham 1954 (Oper. Res. 2); Jackson 1957 (Oper. Res. 5); Little 1961; White 1997 (MSER).
   Pure, deterministic (MRG32k3a streams, one per purpose: common random numbers across scenarios), bounded (≤ 200 000 events in all
   replications), never throws. No learner text: numbers, codes, keys. Tests: node tests/lib_des.js. */
import NoemaLibCore from '../kernel/core.ts';
import NoemaSimKit from '../kernel/simkit.ts';
  /* i18n-ignore-start */   // code, not text: only codes, keys and numbers leave this module
  const C = NoemaLibCore, SK = NoemaSimKit;
  const ID = 'des@1';
  const fin = Number.isFinite, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, sqrt = Math.sqrt;
  const MAX_EVENTS = 200000, DEF_REPS = 10, MAX_PRESENT = 100000, MAX_OBS = 200000;
  const DIST_KINDS = ['const', 'exp', 'uniform', 'tri', 'normal', 'lognormal', 'gamma', 'erlang', 'weibull', 'beta', 'empirical', 'discrete'];
  const DIST_NEEDS = { const: ['value'], uniform: ['min', 'max'], tri: ['min', 'mode', 'max'], normal: ['mean', 'sd'], lognormal: ['mean', 'sd'], erlang: ['k', 'mean'], weibull: ['shape', 'scale'], beta: ['a', 'b'], empirical: ['values'], discrete: ['values'] };
  const DIST_NUM = ['value', 'mean', 'rate', 'sd', 'cv', 'min', 'max', 'mode', 'k', 'shape', 'scale', 'a', 'b'];
  const LOCALS = ['prio', 'cls', 'visits', 'waited', 'now'];
  const LOG_KINDS = ['arrive', 'start', 'depart', 'exit', 'balk', 'renege', 'lost', 'preempt', 'jockey', 'fail', 'repair', 'shift', 'route'];
  /** runtime codes (docs/library/des.md §5): errors stop a replication, the others are notes */
  const CODES = ['budget', 'zeno', 'overflow', 'bad-dist', 'clipped', 'no-arrivals', 'route-sum', 'route-none', 'few-reps', 'warmup-short',
    'batch-correlated', 'unstable', 'theory-na', 'theory-approx', 'little', 'model'];
  const FATAL = ['budget', 'zeno', 'overflow', 'bad-dist', 'model'];
  const MEASURES = ['wq', 'w', 'lq', 'l', 'util', 'busy', 'down', 'throughput', 'served', 'arrived', 'balked', 'reneged', 'lost', 'preempted', 'jockeyed', 'pwait', 'maxq', 'littleErr', 'pAbandon'];
  const STATION_ONLY = ['util', 'busy', 'down', 'maxq', 'preempted', 'jockeyed'];
  const CLASSABLE = ['wq', 'w', 'lq', 'l', 'served', 'throughput', 'pwait', 'arrived'];
  const THEORY = ['wq', 'w', 'lq', 'l', 'util', 'pwait', 'rho'];
  const ESTS = ['mean', 'half', 'lo', 'hi', 'sd', 'n'];
  const SCALARS = MEASURES.concat(['theory', 'covers', 'warmupT', 'events', 'reps', 'flag', 'ok']);
  const SERIES = ['t', 'qlen', 'inSystem', 'busySeries', 'repValues', 'waits', 'logT', 'logKind', 'logEntity', 'logStation'];
  const SCENES = ['network', 'gantt', 'log'];

  /* ======================================================================================================================
     The model checker (the same table, codes and messages as tools/lib_des.py)
     ====================================================================================================================== */
  const DIST = { dist: 'enum:' + DIST_KINDS.join('|') + '!', value: 'numx', mean: 'numx', rate: 'numx', sd: 'numx', cv: 'numx', min: 'numx', max: 'numx', mode: 'numx',
    k: 'numx', shape: 'numx', scale: 'numx', a: 'numx', b: 'numx', values: { $list: 'numx', min: 1, max: 100 }, probs: { $list: 'numx', max: 100 } };
  const D = { $obj: DIST };
  const CLASS = { id: 'name!', prio: 'int:0:9', key: 'key' };
  const SOURCE = { id: 'id!', to: 'ref', shortest: { $list: 'ref', min: 2, max: 8 }, class: 'name', mix: { $map: 'numx', max: 8 }, arrival: D, schedule: { $list: 'numx', max: 500 },
    rates: { $list: { $list: 'numx', min: 2, max: 2 }, max: 48 }, period: 'numx', batch: D, start: 'numx', stop: 'numx', limit: 'int:1:100000', key: 'key' };
  const ROUTE = { to: 'ref', shortest: { $list: 'ref', min: 2, max: 8 }, p: 'numx', when: 'expr' };
  const STATION = { id: 'id!', kind: 'enum:server|delay', servers: 'numx', service: D, serviceBy: { $map: D, max: 8 }, discipline: 'enum:fifo|lifo|priority|spt',
    capacity: 'int:0:100000', preempt: 'enum:none|resume|restart|resample', balk: { $obj: { length: 'int:0:100000!', p: 'numx' } }, renege: D, jockey: 'bool',
    shifts: { $obj: { period: 'numx!', plan: { $req: true, $list: { $obj: { from: 'numx!', to: 'numx!', servers: 'int:0:64!' } }, min: 1, max: 24 } } },
    breakdowns: { $obj: { ttf: { $req: true, $obj: DIST }, ttr: { $req: true, $obj: DIST }, policy: 'enum:resume|restart|resample' } },
    route: { $list: { $obj: ROUTE }, max: 16 }, key: 'key' };
  const TABLE = {
    tEnd: 'numx!', unit: 'enum:' + SK.TIME_UNITS.join('|'), warmup: 'numx', reps: 'int:1:200', seed: 'int:0:1000000', maxEvents: 'int:1000:200000',
    analysis: { $obj: { method: 'enum:reps|batch', batches: 'int:5:100', level: 'unit', warmup: 'enum:fixed|mser5', antithetic: 'bool' } },
    classes: { $list: { $obj: CLASS }, max: 8 },
    sources: { $req: true, $list: { $obj: SOURCE }, min: 1, max: 8 },
    stations: { $req: true, $list: { $obj: STATION }, min: 1, max: 16 },
    points: 'int:2:2000', logCap: 'int:0:2000',
  };
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const list = v => (Array.isArray(v) ? v : []);
  const objs = v => list(v).filter(isObj);
  const okName = v => C.checkKind('name', v);
  const okId = v => C.checkKind('id', v);
  const isNum = v => typeof v === 'number' && fin(v);
  const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
  function specNames(spec) {
    const s = [];
    if (isObj(spec.consts)) for (const k of Object.keys(spec.consts)) s.push(k);
    for (const p of objs(spec.params)) if (typeof p.id === 'string') s.push(p.id);
    for (const d of objs(spec.derived)) if (typeof d.id === 'string') s.push(d.id);
    return s;
  }
  function names(m) {
    return { stations: objs(m.stations).map(s => s.id).filter(okId), sources: objs(m.sources).map(s => s.id).filter(okId), classes: objs(m.classes).map(c => c.id).filter(okName) };
  }
  function checkDist(d, p, E) {
    if (!isObj(d) || typeof d.dist !== 'string' || !DIST_KINDS.includes(d.dist)) return;
    const k = d.dist;
    if (k === 'exp') { if (has(d, 'mean') === has(d, 'rate')) E('dist', p, 'exp needs mean or rate (one of them)'); }
    else if (k === 'gamma') { if (!((has(d, 'shape') && has(d, 'scale')) || (has(d, 'mean') && has(d, 'cv')))) E('dist', p, 'gamma needs shape and scale, or mean and cv'); }
    else for (const f of DIST_NEEDS[k]) if (!has(d, f)) E('dist', p + '.' + f, `${k} needs ${DIST_NEEDS[k].join(', ')}`);
    if ((k === 'empirical' || k === 'discrete') && Array.isArray(d.probs) && Array.isArray(d.values) && d.probs.length !== d.values.length) E('dist', p + '.probs', 'one weight per value');
    if (k === 'exp' && ((isNum(d.mean) && !(d.mean > 0)) || (isNum(d.rate) && !(d.rate > 0)))) E('dist', p, 'needs a mean > 0');
    if (k === 'uniform' && isNum(d.min) && isNum(d.max) && !(d.min >= 0 && d.max >= d.min)) E('dist', p, 'needs 0 ≤ min ≤ max');
    if (k === 'tri' && isNum(d.min) && isNum(d.mode) && isNum(d.max) && !(d.min >= 0 && d.min <= d.mode && d.mode <= d.max && d.min < d.max)) E('dist', p, 'needs 0 ≤ min ≤ mode ≤ max, min < max');
  }
  /** the station ids an entity can reach (sources' targets, then every route) */
  function reachable(m, st) {
    const seen = new Set(), stack = [];
    const push = id => { if (st.includes(id) && !seen.has(id)) { seen.add(id); stack.push(id); } };
    for (const s of objs(m.sources)) { if (typeof s.to === 'string') push(s.to); for (const x of list(s.shortest)) push(x); }
    const byId = new Map(objs(m.stations).filter(s => okId(s.id)).map(s => [s.id, s]));
    while (stack.length) { const s = byId.get(stack.pop()); if (!s) continue; for (const r of objs(s.route)) { if (typeof r.to === 'string') push(r.to); for (const x of list(r.shortest)) push(x); } }
    return seen;
  }
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    if (!isObj(spec)) { E('format', '', 'not an object'); return P; }
    const m = spec.model;
    C.walk(m, TABLE, 'model', E, W);
    if (!isObj(m)) { C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => {}, E, W); return P; }
    const N = names(m), sn = specNames(spec);
    // ids: stations and sources share one name space; "exit" is the way out
    const seen = new Set();
    for (const [w, arr] of [['stations', objs(m.stations)], ['sources', objs(m.sources)]]) arr.forEach((x, i) => {
      if (!okId(x.id)) return;
      if (x.id === 'exit') E('value', `model.${w}[${i}].id`, 'exit is the name of the way out');
      else if (seen.has(x.id)) E('dup-name', `model.${w}[${i}].id`, `the id ${x.id} is used twice`);
      seen.add(x.id);
    });
    const cseen = new Set();
    objs(m.classes).forEach((c, i) => {
      if (!okName(c.id)) return;
      if (cseen.has(c.id)) E('dup-name', `model.classes[${i}].id`, `the class ${c.id} is listed twice`);
      else if (LOCALS.includes(c.id)) E('dup-name', `model.classes[${i}].id`, `the class ${c.id} is a name des@1 gives (${LOCALS.join(', ')})`);
      else if (sn.includes(c.id)) E('dup-name', `model.classes[${i}].id`, `the class ${c.id} is also a name of the spec (consts, params, derived)`);
      cseen.add(c.id);
    });
    const isSt = id => typeof id === 'string' && N.stations.includes(id);
    const isCl = id => typeof id === 'string' && N.classes.includes(id);
    const groups = [];
    objs(m.sources).forEach((s, i) => {
      const w = `model.sources[${i}]`;
      if (['arrival', 'schedule', 'rates'].filter(k => s[k] != null).length !== 1) E('value', w, 'needs one of arrival, schedule or rates');
      if (s.period != null && s.rates == null) E('value', w + '.period', 'goes with rates');
      if ((s.to == null) === (s.shortest == null)) E('value', w, 'needs to (a station) or shortest (stations)');
      if (typeof s.to === 'string' && okId(s.to) && !isSt(s.to)) E('value', w + '.to', 'not a station');
      list(s.shortest).forEach((x, j) => { if (typeof x === 'string' && okId(x) && !isSt(x)) E('value', `${w}.shortest[${j}]`, 'not a station'); });
      if (Array.isArray(s.shortest)) groups.push(s.shortest);
      if (s.class != null && okName(s.class) && !isCl(s.class)) E('value', w + '.class', 'not a class');
      if (isObj(s.mix)) for (const k of Object.keys(s.mix)) if (okName(k) && !isCl(k)) E('value', `${w}.mix.${k}`, 'not a class');
      if (s.class != null && s.mix != null) E('value', w + '.mix', 'class or mix, not both');
      checkDist(s.arrival, w + '.arrival', E); checkDist(s.batch, w + '.batch', E);
    });
    objs(m.stations).forEach((s, i) => {
      const w = `model.stations[${i}]`, kind = s.kind === 'delay' ? 'delay' : 'server';
      if (kind === 'delay') for (const f of ['servers', 'discipline', 'capacity', 'preempt', 'balk', 'renege', 'jockey', 'shifts', 'breakdowns']) if (s[f] != null) E('value', `${w}.${f}`, 'a delay station has no queue or servers');
      if (isObj(s.serviceBy)) {
        if (!N.classes.length) E('value', w + '.serviceBy', 'needs model.classes');
        for (const k of Object.keys(s.serviceBy)) { if (okName(k) && !isCl(k)) E('value', `${w}.serviceBy.${k}`, 'not a class'); checkDist(s.serviceBy[k], `${w}.serviceBy.${k}`, E); }
      }
      if (s.service == null) {
        if (!isObj(s.serviceBy)) E('value', w + '.service', 'missing');
        else for (const c of N.classes) if (!has(s.serviceBy, c)) E('value', w + '.serviceBy', `the class ${c} has no service time (add it or a service)`);
      }
      checkDist(s.service, w + '.service', E); checkDist(s.renege, w + '.renege', E);
      if (isObj(s.breakdowns)) { checkDist(s.breakdowns.ttf, w + '.breakdowns.ttf', E); checkDist(s.breakdowns.ttr, w + '.breakdowns.ttr', E); }
      if (typeof s.preempt === 'string' && s.preempt !== 'none' && s.discipline !== 'priority') E('value', w + '.preempt', 'pre-emption needs discipline priority');
      if (s.discipline === 'priority' && !N.classes.length) W('value', w + '.discipline', 'priority needs model.classes (one class: FIFO)');
      if (isObj(s.balk) && isNum(s.balk.p) && !(s.balk.p >= 0 && s.balk.p <= 1)) E('value', w + '.balk.p', 'needs a number from 0 to 1');
      if (isObj(s.shifts)) {
        const per = s.shifts.period, iv = [];
        objs(s.shifts.plan).forEach((x, j) => {
          if (!isNum(x.from) || !isNum(x.to)) return;
          if (!(x.from >= 0 && x.from < x.to)) { E('value', `${w}.shifts.plan[${j}]`, 'needs 0 ≤ from < to'); return; }
          if (isNum(per) && x.to > per) { E('value', `${w}.shifts.plan[${j}].to`, 'after the period'); return; }
          for (const [a, b] of iv) if (x.from < b && a < x.to) { E('value', `${w}.shifts.plan[${j}]`, 'overlaps another shift'); return; }
          iv.push([x.from, x.to]);
        });
        if (isNum(per) && !(per > 0)) E('value', w + '.shifts.period', 'needs a number > 0');
      }
      const rs = objs(s.route);
      rs.forEach((r, j) => {
        const rw = `${w}.route[${j}]`;
        if ((r.to == null) === (r.shortest == null)) E('route', rw, 'needs to (a station or exit) or shortest (stations)');
        if (typeof r.to === 'string' && okId(r.to) && r.to !== 'exit' && !isSt(r.to)) E('route', rw + '.to', 'not a station (or exit)');
        list(r.shortest).forEach((x, k) => { if (typeof x === 'string' && okId(x) && !isSt(x)) E('route', `${rw}.shortest[${k}]`, 'not a station'); });
        if (Array.isArray(r.shortest)) groups.push(r.shortest);
        if (r.p != null && r.when != null) E('route', rw, 'p or when, not both');
        if (isNum(r.p) && r.p < 0) E('route', rw + '.p', 'needs a number >= 0');
      });
      const withP = rs.filter(r => r.p != null).length;
      if (withP && withP !== rs.length) E('route', w + '.route', 'either every way has p (probabilistic) or none (by condition)');
      if (withP && rs.every(r => isNum(r.p)) && rs.reduce((a, r) => a + r.p, 0) > 1 + 1e-9) E('route', w + '.route', 'the probabilities add up to more than 1');
    });
    objs(m.stations).forEach((s, i) => { if (s.jockey === true && okId(s.id) && !groups.some(g => g.includes(s.id))) E('value', `model.stations[${i}].jockey`, 'jockeying needs the station in a shortest group (a source or route with shortest)'); });
    const an = isObj(m.analysis) ? m.analysis : {};
    if (an.method === 'batch' && isNum(m.reps) && m.reps > 1) E('value', 'model.reps', 'batch means use one long run (reps 1)');
    if (isNum(m.tEnd) && !(m.tEnd > 0)) E('value', 'model.tEnd', 'needs a number > 0');
    if (isNum(m.warmup) && isNum(m.tEnd) && !(m.warmup >= 0 && m.warmup < m.tEnd)) E('value', 'model.warmup', 'must be from 0 to before tEnd');
    if (m.warmup != null && an.warmup === 'mser5') W('unknown-field', 'model.warmup', 'mser5 finds the warm-up: model.warmup is ignored');
    const reach = reachable(m, N.stations);
    objs(m.stations).forEach((s, i) => { if (okId(s.id) && N.stations.includes(s.id) && !reach.has(s.id)) W('unreachable', `model.stations[${i}]`, 'no entity can reach this station'); });
    // outputs
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at, E2) => {
      const need = (cond, f, msg) => { if (!cond) E2('output', at + '.' + f, msg); return cond; };
      const of = o.of, kd = o.kind, known = kd === 'series' ? SERIES : kd === 'scalar' ? SCALARS : SCENES;
      if (!known.includes(of)) { E2('output', at + '.of', `${ID} computes as a ${kd}: ${known.join(', ')}`); return; }
      if (o.station != null) need(isSt(o.station), 'station', 'a station of the model');
      if (o.class != null) need(isCl(o.class), 'class', 'a class of the model');
      const meas = of === 'theory' || of === 'covers' || of === 'repValues' ? o.measure : of;
      if (of === 'theory' || of === 'covers') need(THEORY.includes(o.measure), 'measure', 'one of ' + THEORY.join(', '));
      if (of === 'repValues') need(MEASURES.includes(o.measure), 'measure', 'one of ' + MEASURES.join(', '));
      if ((STATION_ONLY.includes(meas) || ['qlen', 'busySeries'].includes(of) || meas === 'util') && o.station == null) need(false, 'station', 'needs a station');
      if (o.class != null && MEASURES.concat(THEORY).includes(meas) && !CLASSABLE.includes(meas)) E2('output', at + '.class', `${meas} is not computed per class`);
      if (o.est != null) need(ESTS.includes(o.est), 'est', 'one of ' + ESTS.join(', '));
      if (of === 'flag') need(CODES.includes(o.code), 'code', 'one of ' + CODES.join(', '));
      if (of === 'gantt' && o.window != null) need(C.checkKind('numx', o.window), 'window', 'needs a number or an expression');
    }, E, W);
    return P;
  }
  function distExprs(d, p, out) {
    if (!isObj(d)) return;
    for (const f of DIST_NUM) if (typeof d[f] === 'string') out.push([d[f], `${p}.${f}`, []]);
    list(d.values).forEach((v, i) => { if (typeof v === 'string') out.push([v, `${p}.values[${i}]`, []]); });
    list(d.probs).forEach((v, i) => { if (typeof v === 'string') out.push([v, `${p}.probs[${i}]`, []]); });
  }
  /** every expression of the model: [source, path, local names] */
  function exprs(spec) {
    const out = [], m = isObj(spec) ? spec.model : null; if (!isObj(m)) return out;
    const add = (v, p, l) => { if (typeof v === 'string') out.push([v, p, l || []]); };
    add(m.tEnd, 'model.tEnd'); add(m.warmup, 'model.warmup');
    const loc = LOCALS.concat(names(m).classes);
    objs(m.sources).forEach((s, i) => {
      const w = `model.sources[${i}]`;
      if (isObj(s.mix)) for (const [k, v] of Object.entries(s.mix)) add(v, `${w}.mix.${k}`);
      distExprs(s.arrival, w + '.arrival', out);
      list(s.schedule).forEach((v, j) => add(v, `${w}.schedule[${j}]`));
      list(s.rates).forEach((r, j) => list(r).forEach((v, k) => add(v, `${w}.rates[${j}][${k}]`)));
      add(s.period, w + '.period'); distExprs(s.batch, w + '.batch', out); add(s.start, w + '.start'); add(s.stop, w + '.stop');
    });
    objs(m.stations).forEach((s, i) => {
      const w = `model.stations[${i}]`;
      add(s.servers, w + '.servers');
      distExprs(s.service, w + '.service', out);
      if (isObj(s.serviceBy)) for (const [k, d] of Object.entries(s.serviceBy)) distExprs(d, `${w}.serviceBy.${k}`, out);
      if (isObj(s.balk)) add(s.balk.p, w + '.balk.p');
      distExprs(s.renege, w + '.renege', out);
      if (isObj(s.shifts)) { add(s.shifts.period, w + '.shifts.period'); objs(s.shifts.plan).forEach((x, j) => { add(x.from, `${w}.shifts.plan[${j}].from`); add(x.to, `${w}.shifts.plan[${j}].to`); }); }
      if (isObj(s.breakdowns)) { distExprs(s.breakdowns.ttf, w + '.breakdowns.ttf', out); distExprs(s.breakdowns.ttr, w + '.breakdowns.ttr', out); }
      objs(s.route).forEach((r, j) => { add(r.p, `${w}.route[${j}].p`); add(r.when, `${w}.route[${j}].when`, loc); });
    });
    list(spec.outputs).forEach((o, i) => { if (isObj(o) && o.of === 'gantt') add(o.window, `outputs[${i}].window`); });
    return out;
  }
  /** every string key the model names */
  function keys(spec) {
    const out = [], m = isObj(spec) ? spec.model : null; if (!isObj(m)) return out;
    objs(m.classes).forEach((c, i) => { if (typeof c.key === 'string') out.push([c.key, `model.classes[${i}].key`]); });
    objs(m.sources).forEach((s, i) => { if (typeof s.key === 'string') out.push([s.key, `model.sources[${i}].key`]); });
    objs(m.stations).forEach((s, i) => { if (typeof s.key === 'string') out.push([s.key, `model.stations[${i}].key`]); });
    return out;
  }

  /* ======================================================================================================================
     Compiling the model once (its formulas through NoemaExpr) and evaluating its numbers for a run
     ====================================================================================================================== */
  function compileDist(d) {
    if (!isObj(d)) return null;
    const f = {}; for (const k of DIST_NUM) if (d[k] != null) f[k] = C.cx(d[k]);
    const vals = Array.isArray(d.values) ? d.values.map(C.cx) : null, probs = Array.isArray(d.probs) ? d.probs.map(C.cx) : null;
    return env => { const o = { dist: d.dist }; for (const k of Object.keys(f)) o[k] = f[k](env); if (vals) o.values = vals.map(g => g(env)); if (probs) o.probs = probs.map(g => g(env)); return o; };
  }
  function build(spec) {
    const m = spec.model, N = names(m);
    const classes = objs(m.classes).map((c, i) => ({ id: c.id, prio: Number.isInteger(c.prio) ? c.prio : 0, key: c.key, i }));
    if (!classes.length) classes.push({ id: '', prio: 0, i: 0, implicit: true });
    const clsIdx = id => max(0, classes.findIndex(c => c.id === id));
    const stIdx = new Map(N.stations.map((id, i) => [id, i]));
    const stations = objs(m.stations).map((s, i) => ({
      id: s.id, i, key: s.key, delay: s.kind === 'delay', serversX: s.kind === 'delay' ? null : C.cx(s.servers == null ? 1 : s.servers), servers: s.kind === 'delay' ? Infinity : isNum(s.servers) ? s.servers : 1,
      disc: s.discipline || 'fifo', capacity: Number.isInteger(s.capacity) ? s.capacity : Infinity, preempt: s.preempt || 'none',
      service: compileDist(s.service), serviceBy: classes.map(c => (isObj(s.serviceBy) && s.serviceBy[c.id] ? compileDist(s.serviceBy[c.id]) : null)),
      balk: isObj(s.balk) ? { length: s.balk.length, p: C.cx(s.balk.p == null ? 1 : s.balk.p) } : null, renege: compileDist(s.renege), jockey: !!s.jockey,
      shifts: isObj(s.shifts) ? { period: C.cx(s.shifts.period), plan: objs(s.shifts.plan).map(x => ({ from: C.cx(x.from), to: C.cx(x.to), servers: x.servers })) } : null,
      bd: isObj(s.breakdowns) ? { ttf: compileDist(s.breakdowns.ttf), ttr: compileDist(s.breakdowns.ttr), policy: s.breakdowns.policy || 'resume' } : null,
      route: objs(s.route).map(r => ({ to: r.to === 'exit' ? -1 : r.to != null ? stIdx.get(r.to) : null, shortest: Array.isArray(r.shortest) ? r.shortest.map(x => stIdx.get(x)) : null,
        p: r.p != null ? C.cx(r.p) : null, when: r.when != null ? C.cx(r.when) : null })),
      raw: s,
    }));
    const sources = objs(m.sources).map((s, i) => ({ id: s.id, i, key: s.key, to: s.to != null ? stIdx.get(s.to) : null, shortest: Array.isArray(s.shortest) ? s.shortest.map(x => stIdx.get(x)) : null,
      cls: s.class != null ? clsIdx(s.class) : null, mix: isObj(s.mix) ? Object.entries(s.mix).map(([k, v]) => [clsIdx(k), C.cx(v)]) : null,
      arrival: compileDist(s.arrival), schedule: Array.isArray(s.schedule) ? s.schedule.map(C.cx) : null, rates: Array.isArray(s.rates) ? s.rates.map(r => r.map(C.cx)) : null,
      period: s.period != null ? C.cx(s.period) : null, batch: compileDist(s.batch), start: C.cx(s.start == null ? 0 : s.start), stop: s.stop != null ? C.cx(s.stop) : null,
      limit: Number.isInteger(s.limit) ? s.limit : Infinity }));
    // jockey groups: the shortest group each station belongs to (the first one listed)
    const groupOf = stations.map(() => null);
    for (const g of sources.map(s => s.shortest).concat(...stations.map(s => s.route.map(r => r.shortest))).filter(Boolean)) for (const j of g) if (groupOf[j] == null) groupOf[j] = g;
    const an = isObj(m.analysis) ? m.analysis : {};
    return { spec, m, classes, stations, sources, groupOf, nS: stations.length, nK: classes.length,
      tEnd: C.cx(m.tEnd), warmup: m.warmup != null ? C.cx(m.warmup) : null, reps: an.method === 'batch' ? 1 : Number.isInteger(m.reps) ? m.reps : DEF_REPS,
      method: an.method === 'batch' ? 'batch' : 'reps', batches: Number.isInteger(an.batches) ? an.batches : 20, level: isNum(an.level) && an.level > 0 && an.level < 1 ? an.level : 0.95,
      mser: an.warmup === 'mser5', anti: !!an.antithetic, seed: Number.isInteger(m.seed) ? m.seed : 0, maxEvents: Number.isInteger(m.maxEvents) ? m.maxEvents : MAX_EVENTS,
      points: Number.isInteger(m.points) ? m.points : 200, logCap: Number.isInteger(m.logCap) ? m.logCap : 200 };
  }
  function prepare(spec) { try { return C.hasErrors(checkSpec(spec)) ? null : build(spec); } catch (e) { return null; } }

  /** the numbers of a run (every numx evaluated once over the spec's names) → P, or null + code bad-dist */
  function evalParams(M, env, codes) {
    const dist = (cd, where) => { if (!cd) return null; const o = cd(env), D0 = SK.dist(o); if (!D0.ok) { codes.code('bad-dist', undefined, where); return null; } D0.spec = o; return D0; };
    const P = { tEnd: M.tEnd(env), warmup: M.warmup ? M.warmup(env) : 0, stations: [], sources: [] };
    if (!(P.tEnd > 0)) { codes.code('bad-dist', undefined, 'model.tEnd'); return null; }
    if (!(P.warmup >= 0 && P.warmup < P.tEnd)) P.warmup = 0;
    let ok = true;
    for (const s of M.stations) {
      let c = s.serversX ? s.serversX(env) : Infinity;
      if (s.serversX && !(Number.isInteger(c) && c >= 1 && c <= 64)) { if (fin(c) && Math.round(c) >= 1 && Math.round(c) <= 64) c = Math.round(c); else { codes.code('bad-dist', undefined, s.id + '.servers'); ok = false; c = 1; } }
      const q = { servers: c, service: dist(s.service, s.id + '.service'), serviceBy: s.serviceBy.map((d, k) => dist(d, s.id + '.serviceBy.' + k)), renege: dist(s.renege, s.id + '.renege'),
        balkP: s.balk ? s.balk.p(env) : 0, ttf: s.bd ? dist(s.bd.ttf, s.id + '.ttf') : null, ttr: s.bd ? dist(s.bd.ttr, s.id + '.ttr') : null,
        route: s.route.map(r => ({ p: r.p ? r.p(env) : null })), shifts: null };
      if ((s.service && !q.service) || s.serviceBy.some((d, k) => d && !q.serviceBy[k]) || (s.renege && !q.renege) || (s.bd && !(q.ttf && q.ttr))) ok = false;
      if (!q.service && M.classes.some((c, k) => !q.serviceBy[k])) ok = false;
      if (s.balk && !(q.balkP >= 0 && q.balkP <= 1)) { codes.code('bad-dist', undefined, s.id + '.balk.p'); ok = false; }
      const ps = q.route.map(r => r.p).filter(v => v != null);
      if (ps.length && (ps.some(v => !(v >= 0)) || ps.reduce((a, b) => a + b, 0) > 1 + 1e-9)) { codes.code('route-sum', undefined, s.id); ok = false; }
      if (s.shifts) { const per = s.shifts.period(env), plan = s.shifts.plan.map(x => ({ from: x.from(env), to: x.to(env), servers: x.servers }));
        if (!(per > 0) || plan.some(x => !(x.from >= 0 && x.from < x.to && x.to <= per))) { codes.code('bad-dist', undefined, s.id + '.shifts'); ok = false; } else q.shifts = { period: per, plan }; }
      P.stations.push(q);
    }
    for (const s of M.sources) {
      const q = { arrival: dist(s.arrival, s.id + '.arrival'), batch: dist(s.batch, s.id + '.batch'), start: s.start(env), stop: s.stop ? s.stop(env) : Infinity,
        schedule: s.schedule ? s.schedule.map(f => f(env)).filter(fin).sort((a, b) => a - b) : null, rates: null, mix: s.mix ? s.mix.map(([k, f]) => [k, f(env)]) : null };
      if ((s.arrival && !q.arrival) || (s.batch && !q.batch)) ok = false;
      if (s.rates) { const pts = s.rates.map(r => [r[0](env), r[1](env)]); if (pts.some(p => !fin(p[0]) || !(p[1] >= 0))) { codes.code('bad-dist', undefined, s.id + '.rates'); ok = false; }
        else { const per = s.period ? s.period(env) : 0; q.rates = { fn: SK.piecewise(pts, per > 0 ? { period: per } : {}), max: max(...pts.map(p => p[1])), pts, period: per }; } }
      if (q.mix && (q.mix.some(([, w]) => !(w >= 0)) || !(q.mix.reduce((a, [, w]) => a + w, 0) > 0))) { codes.code('bad-dist', undefined, s.id + '.mix'); ok = false; }
      if (!fin(q.start)) q.start = 0;
      P.sources.push(q);
    }
    return ok ? P : null;
  }

  /* ======================================================================================================================
     Queues: FIFO / LIFO as arrays with lazy deletion, priority as one FIFO per level (with a front list for the pre-empted),
     SPT as a binary heap on (service time, arrival order)
     ====================================================================================================================== */
  function makeQueue(disc) {
    if (disc === 'priority') {
      const lv = Array.from({ length: 10 }, () => ({ a: [], h: 0, front: [] }));
      return { push(e) { lv[e.prio].a.push(e); }, pushFront(e) { lv[e.prio].front.push(e); },
        pop() { for (const L of lv) { while (L.front.length) { const e = L.front.pop(); if (!e.gone) return e; } while (L.h < L.a.length) { const e = L.a[L.h++]; if (!e.gone) { if (L.h > 1024 && L.h * 2 > L.a.length) { L.a = L.a.slice(L.h); L.h = 0; } return e; } } } return null; },
        popTail() { for (let k = 9; k >= 0; k--) { const L = lv[k]; while (L.a.length > L.h) { const e = L.a.pop(); if (!e.gone) return e; } while (L.front.length) { const e = L.front.shift(); if (!e.gone) return e; } } return null; } };
    }
    if (disc === 'spt') {
      const h = []; const less = (a, b) => a.svc < b.svc || (a.svc === b.svc && a.n < b.n);
      const up = i => { const x = h[i]; while (i > 0) { const p = (i - 1) >> 1; if (!less(x, h[p])) break; h[i] = h[p]; i = p; } h[i] = x; };
      const down = i => { const n = h.length, x = h[i]; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && less(h[c + 1], h[c])) c++; if (!less(h[c], x)) break; h[i] = h[c]; i = c; } h[i] = x; };
      const popTop = () => { const t = h[0], l = h.pop(); if (h.length) { h[0] = l; down(0); } return t; };
      return { push(e) { h.push(e); up(h.length - 1); }, pushFront(e) { h.push(e); up(h.length - 1); },
        pop() { while (h.length) { const e = popTop(); if (!e.gone) return e; } return null; },
        popTail() { let bi = -1; for (let i = 0; i < h.length; i++) if (!h[i].gone && (bi < 0 || less(h[bi], h[i]))) bi = i; if (bi < 0) return null; const e = h[bi]; e.gone = true; e.stolen = true; return e; } };
    }
    const a = []; let hd = 0; const lifo = disc === 'lifo';
    return { push(e) { a.push(e); }, pushFront(e) { if (lifo) a.push(e); else if (hd > 0) a[--hd] = e; else a.unshift(e); },
      pop() { if (lifo) { while (a.length > hd) { const e = a.pop(); if (!e.gone) return e; } return null; }
        while (hd < a.length) { const e = a[hd++]; if (!e.gone) { if (hd > 1024 && hd * 2 > a.length) { a.splice(0, hd); hd = 0; } return e; } } return null; },
      popTail() { if (lifo) { for (let i = hd; i < a.length; i++) if (!a[i].gone) { const e = a[i]; e.gone = true; e.stolen = true; return e; } return null; }
        while (a.length > hd) { const e = a.pop(); if (!e.gone) return e; } return null; } };
  }

  /* ======================================================================================================================
     One replication: the event-scheduling world view (Law §1.3.2) on the kernel's executive
     ====================================================================================================================== */
  // the cumulative accumulators of a replication, laid out in one Float64Array (the snapshot of its statistics at a time)
  function layout(nS, nK) {
    const S_F = ['areaQ', 'areaN', 'areaB', 'areaCap', 'areaDown', 'arr', 'dep', 'sumWq', 'sumW', 'nWaited', 'balk', 'ren', 'lost', 'pre', 'jock'];
    const C_F = ['areaQ', 'areaN', 'arr', 'dep', 'sumWq', 'sumW', 'nWaited'];
    const Y_F = ['areaN', 'arr', 'exit', 'sumWq', 'sumW', 'nWaited', 'balk', 'ren', 'lost'];
    const per = S_F.length + nK * C_F.length, sysBase = nS * per, sysPer = Y_F.length + nK * C_F.length;
    const oS = {}, oC = {}, oY = {}; S_F.forEach((f, i) => { oS[f] = i; }); C_F.forEach((f, i) => { oC[f] = i; }); Y_F.forEach((f, i) => { oY[f] = i; });
    const st = (s, f) => s * per + oS[f], sc = (s, k, f) => s * per + S_F.length + k * C_F.length + oC[f];
    const sy = f => sysBase + oY[f], syc = (k, f) => sysBase + Y_F.length + k * C_F.length + oC[f];
    return { size: sysBase + sysPer, st, sc, sy, syc };
  }
  function replication(M, P, o) {
    const nS = M.nS, nK = M.nK, L = layout(nS, nK), acc = new Float64Array(L.size);
    // time-weighted quantities: their current value, the time of the last change; the area is added into acc
    const twIdx = [], twVal = [], twT = [];
    const tw = i => { const j = twIdx.length; twIdx.push(i); twVal.push(0); twT.push(0); return j; };
    const env = o.env, codes = o.codes, rec = o.record, tEnd = P.tEnd;
    const sim = SK.sim({ tEnd, maxEvents: o.maxEvents, zeno: 10000, logCap: 0 });
    const setTw = (j, v) => { const t = sim.now; acc[twIdx[j]] += twVal[j] * (t - twT[j]); twT[j] = t; twVal[j] = v; };
    const addTw = (j, dv) => setTw(j, twVal[j] + dv);
    const sub = o.sub, anti = o.anti;
    const mk = name => { const r = SK.stream(o.seed, name, { antithetic: anti }); return sub ? r.sub(sub) : r; };
    // one stream per purpose and place: common random numbers across scenarios (Law §11.2)
    const lazy = (pre, arr) => { const c = arr.map(() => null); return i => c[i] || (c[i] = mk(pre + arr[i].id)); };   // streams made on first use
    const R = { arr: lazy('arr:', M.sources), batch: lazy('batch:', M.sources), mix: lazy('mix:', M.sources), svc: lazy('svc:', M.stations), route: lazy('route:', M.stations),
      balk: lazy('balk:', M.stations), ren: lazy('renege:', M.stations), ttf: lazy('ttf:', M.stations), ttr: lazy('ttr:', M.stations) };
    const ST = M.stations.map((s, i) => {
      const q = P.stations[i];
      const base = s.delay ? Infinity : q.servers, slotsN = s.delay ? 0 : max(base, ...(q.shifts ? q.shifts.plan.map(x => x.servers) : [0]));
      return { s, q, i, cap: base, base, busy: 0, slots: Array.from({ length: slotsN }, () => null), Q: s.delay ? null : makeQueue(s.disc), nq: 0, nqK: new Array(nK).fill(0), present: 0, presentK: new Array(nK).fill(0),
        up: true, inSvc: new Set(), twQ: tw(L.st(i, 'areaQ')), twN: tw(L.st(i, 'areaN')), twB: tw(L.st(i, 'areaB')), twCap: tw(L.st(i, 'areaCap')), twDown: tw(L.st(i, 'areaDown')),
        twQK: Array.from({ length: nK }, (_, k) => tw(L.sc(i, k, 'areaQ'))), twNK: Array.from({ length: nK }, (_, k) => tw(L.sc(i, k, 'areaN'))), maxq: 0 };
    });
    const twSys = tw(L.sy('areaN')), twSysK = Array.from({ length: nK }, (_, k) => tw(L.syc(k, 'areaN')));
    for (const X of ST) { if (!X.s.delay) setTw(X.twCap, X.cap); }
    let nEnt = 0, present = 0, stoppedBy = null;
    const log = rec ? [] : null, logCap = rec ? M.logCap : 0;
    const LOG = (kind, e, st) => { if (log && log.length < logCap) log.push([sim.now, LOG_KINDS.indexOf(kind), e ? e.n : -1, st == null ? -1 : st]); };
    const gantt = rec ? [] : null, obsT = [], obsW = [];
    const lenv = Object.assign(Object.create(null), env);
    const clipped = () => codes.code('clipped');
    const draw = (D0, r) => { const v = D0.draw(r); if (!(v >= 0)) { if (fin(v)) { clipped(); return 0; } return 0; } return v; };
    const svcDist = (X, e) => X.q.serviceBy[e.cls] || X.q.service;
    // ---- entering a station ----
    function shortestOf(g) { let best = -1, bv = Infinity; for (const j of g) { const X = ST[j], v = X.s.delay ? 0 : X.nq + X.busy - (X.cap === Infinity ? 0 : 0); if (v < bv) { bv = v; best = j; } } return best; }
    function arrive(e, j) {
      const X = ST[j]; e.st = j; e.tSt = sim.now; e.wSt = 0; e.visits++;
      acc[L.st(j, 'arr')]++; acc[L.sc(j, e.cls, 'arr')]++;
      e.svc = draw(svcDist(X, e), R.svc(j)); e.orig = e.svc;   // drawn on entry: the n-th entry gets the n-th variate (synchronised CRN)
      LOG('arrive', e, j);
      if (X.s.delay) { enterPresent(X, e); sim.after(e.svc, () => depart(X, e, null)); return; }
      const free = X.up && X.busy < X.cap && X.nq === 0;
      if (!free) {
        // pre-emption: a higher class (smaller prio) takes the server of the lowest one in service
        if (X.up && X.s.preempt !== 'none' && X.busy >= X.cap) { const v = victim(X, e); if (v) { enterPresent(X, e); preemptFor(X, v, e); return; } }
        if (X.nq >= X.s.capacity) { acc[L.st(j, 'lost')]++; acc[L.sy('lost')]++; LOG('lost', e, j); leaveSystem(e, false); return; }
        if (X.s.balk && X.nq >= X.s.balk.length && R.balk(j)() < X.q.balkP) { acc[L.st(j, 'balk')]++; acc[L.sy('balk')]++; LOG('balk', e, j); leaveSystem(e, false); return; }
      }
      enterPresent(X, e);
      if (free) { startService(X, e, freeSlot(X)); return; }
      enqueue(X, e, false);
      if (X.q.renege) { const pt = draw(X.q.renege, R.ren(j)); e.renId = sim.after(pt, () => renege(X, e), { prio: 5 }); }
      tryStart(X);
    }
    function enterPresent(X, e) { X.present++; X.presentK[e.cls]++; addTw(X.twN, 1); addTw(X.twNK[e.cls], 1); }
    function leavePresent(X, e) { X.present--; X.presentK[e.cls]--; addTw(X.twN, -1); addTw(X.twNK[e.cls], -1); }
    function enqueue(X, e, front) { e.tq = sim.now; e.gone = false; if (front) X.Q.pushFront(e); else X.Q.push(e); X.nq++; X.nqK[e.cls]++; addTw(X.twQ, 1); addTw(X.twQK[e.cls], 1); if (X.nq > X.maxq) X.maxq = X.nq; }
    function dequeued(X, e) { X.nq--; X.nqK[e.cls]--; addTw(X.twQ, -1); addTw(X.twQK[e.cls], -1); e.wSt += sim.now - e.tq; }
    function freeSlot(X) { for (let k = 0; k < X.slots.length && k < X.cap; k++) if (!X.slots[k]) return k; for (let k = 0; k < X.slots.length; k++) if (!X.slots[k]) return k; return 0; }
    function startService(X, e, k) {
      if (e.renId != null) { sim.cancel(e.renId); e.renId = null; }
      X.slots[k] = e; e.slot = k; X.busy++; addTw(X.twB, 1); X.inSvc.add(e);
      const dur = e.rem != null ? e.rem : e.svc; e.rem = null; e.tStart = sim.now; e.svcRun = dur;
      schedEnd(X, e, dur);
      LOG('start', e, X.i);
    }
    // the end of a service: one event, cancelled and rescheduled on an interruption (pre-emption, breakdown)
    function schedEnd(X, e, dur) { e.end = sim.now + dur; e.evId = sim.at(e.end, () => depart(X, e, e.slot)); }
    function interruptSvc(e) { sim.cancel(e.evId); e.evId = -1; return max(0, e.end - sim.now); }
    function tryStart(X) {
      if (X.s.delay) return;
      while (X.up && X.busy < X.cap && X.nq > 0) { const e = X.Q.pop(); if (!e) { X.nq = 0; break; } dequeued(X, e); startService(X, e, freeSlot(X)); }
    }
    function victim(X, e) { let v = null; for (const x of X.inSvc) if (x.prio > e.prio && (!v || x.prio > v.prio || (x.prio === v.prio && x.tStart > v.tStart))) v = x; return v; }
    function preemptFor(X, v, e) {
      const left = interruptSvc(v); X.inSvc.delete(v); X.slots[v.slot] = null; X.busy--; addTw(X.twB, -1);
      if (gantt && gantt.length < 1500) gantt.push([X.i, v.slot, v.tStart, sim.now, v.cls]);
      const pol = X.s.preempt; v.rem = pol === 'resume' ? left : pol === 'restart' ? v.orig : draw(svcDist(X, v), R.svc(X.i));
      acc[L.st(X.i, 'pre')]++; LOG('preempt', v, X.i);
      const k = freeSlot(X); startService(X, e, k);
      enqueue(X, v, true);
    }
    function renege(X, e) {
      e.renId = null; if (e.gone || e.inService) return;
      if (!(X.inSvc.has(e))) { e.gone = true; dequeued(X, e); leavePresent(X, e); acc[L.st(X.i, 'ren')]++; acc[L.sy('ren')]++; LOG('renege', e, X.i); leaveSystem(e, false); }
    }
    // ---- leaving a station ----
    function depart(X, e, k) {
      if (k != null) { X.slots[k] = null; X.busy--; addTw(X.twB, -1); X.inSvc.delete(e); if (gantt && gantt.length < 1500) gantt.push([X.i, k, e.tStart, sim.now, e.cls]); }
      leavePresent(X, e);
      const j = X.i, wq = e.wSt, w = sim.now - e.tSt;
      acc[L.st(j, 'dep')]++; acc[L.st(j, 'sumWq')] += wq; acc[L.st(j, 'sumW')] += w; if (wq > 1e-12) acc[L.st(j, 'nWaited')]++;
      acc[L.sc(j, e.cls, 'dep')]++; acc[L.sc(j, e.cls, 'sumWq')] += wq; acc[L.sc(j, e.cls, 'sumW')] += w; if (wq > 1e-12) acc[L.sc(j, e.cls, 'nWaited')]++;
      e.wq += wq; LOG('depart', e, j);
      tryStart(X);
      if (X.s.jockey || M.groupOf[j]) jockey(X);
      const to = routeOf(X, e);
      if (to < 0) { LOG('exit', e, -1); leaveSystem(e, true); } else arrive(e, to);
    }
    // Banks et al. 2010 §2 (the bank): after a departure, the last customer of a line at least 2 longer moves to this line
    function jockey(X) {
      const g = M.groupOf[X.i]; if (!g || !X.s.jockey) return;
      let best = -1; for (const j of g) if (j !== X.i && ST[j].s.jockey && ST[j].nq >= X.nq + 2 && (best < 0 || ST[j].nq > ST[best].nq)) best = j;
      if (best < 0) return;
      const Y = ST[best], e = Y.Q.popTail(); if (!e) return;
      e.gone = false; e.stolen = false; dequeued(Y, e); leavePresent(Y, e); acc[L.st(best, 'jock')]++; LOG('jockey', e, X.i);
      e.wq += e.wSt; e.wSt = 0; const rid = e.renId; e.st = X.i; e.tSt = sim.now; enterPresent(X, e);
      if (rid != null) { sim.cancel(rid); e.renId = null; if (X.q.renege) { const pt = draw(X.q.renege, R.ren(X.i)); e.renId = sim.after(pt, () => renege(X, e), { prio: 5 }); } }
      if (X.up && X.busy < X.cap && X.nq === 0) startService(X, e, freeSlot(X)); else enqueue(X, e, false);
    }
    function routeOf(X, e) {
      const rs = X.s.route; if (!rs.length) return -1;
      const ps = X.q.route;
      if (rs[0].p) { const u = R.route(X.i)(); let c = 0; for (let i = 0; i < rs.length; i++) { c += ps[i].p; if (u < c) return target(rs[i]); } return -1; }
      lenv.prio = e.prio; lenv.cls = e.cls; lenv.visits = e.visits; lenv.waited = e.wq; lenv.now = sim.now;
      for (const c of M.classes) if (!c.implicit) lenv[c.id] = c.i === e.cls ? 1 : 0;
      for (const r of rs) if (!r.when || r.when(lenv)) return target(r);
      codes.code('route-none', sim.now, X.s.id); return -1;
    }
    const target = r => (r.shortest ? shortestOf(r.shortest) : r.to);
    function leaveSystem(e, served) {
      present--; addTw(twSys, -1); addTw(twSysK[e.cls], -1);
      if (!served) return;
      const w = sim.now - e.t0;
      acc[L.sy('exit')]++; acc[L.sy('sumWq')] += e.wq; acc[L.sy('sumW')] += w; if (e.wq > 1e-12) acc[L.sy('nWaited')]++;
      acc[L.syc(e.cls, 'dep')]++; acc[L.syc(e.cls, 'sumWq')] += e.wq; acc[L.syc(e.cls, 'sumW')] += w; if (e.wq > 1e-12) acc[L.syc(e.cls, 'nWaited')]++;
      if (obsT.length < o.obsCap) { obsT.push(sim.now); obsW.push(w); }
    }
    // ---- sources ----
    function newEntity(src, cls) {
      if (present >= MAX_PRESENT) { codes.code('overflow', sim.now); sim.stop('overflow'); stoppedBy = 'overflow'; return null; }
      const c = M.classes[cls]; const e = { n: nEnt++, cls, prio: c.prio, t0: sim.now, visits: 0, wq: 0, wSt: 0, st: -1, rem: null, renId: null, gone: false };
      present++; addTw(twSys, 1); addTw(twSysK[cls], 1); acc[L.sy('arr')]++; acc[L.syc(cls, 'arr')]++;
      return e;
    }
    M.sources.forEach((src, si) => {
      const q = P.sources[si]; let count = 0;
      const clsOf = () => (src.cls != null ? src.cls : q.mix ? q.mix[R.mix(si).discrete(q.mix.map(x => x[1]))][0] : 0);
      const emit = () => {
        const nb = q.batch ? max(1, Math.round(q.batch.draw(R.batch(si)))) : 1;
        for (let b = 0; b < nb && count < src.limit; b++) { const e = newEntity(src, clsOf()); if (!e) return; count++; arrive(e, src.shortest ? shortestOf(src.shortest) : src.to); }
      };
      if (q.schedule) { for (const t of q.schedule) if (t >= 0 && t <= tEnd) sim.at(t, emit, { prio: 1 }); return; }
      if (q.rates) {   // a non-homogeneous Poisson process by thinning (Lewis & Shedler 1979)
        const rf = q.rates.fn, rm = q.rates.max; if (!(rm > 0)) return;
        const next = () => { let t = sim.now; for (let i = 0; i < 100000; i++) { t += -Math.log(R.arr(si)()) / rm; if (t > min(tEnd, q.stop)) return; if (R.arr(si)() * rm <= rf(t)) { sim.at(t, () => { if (count < src.limit) emit(); next(); }, { prio: 1 }); return; } } };
        sim.at(max(0, q.start), next, { prio: 1 }); return;
      }
      const D0 = q.arrival;
      const step = () => { if (count >= src.limit) return; emit(); const dt = draw(D0, R.arr(si)); const tn = sim.now + dt; if (tn <= q.stop) sim.at(tn, step, { prio: 1 }); };
      const first = max(0, q.start) + draw(D0, R.arr(si));   // the first arrival one interarrival after the start (Law §1.4)
      if (first <= q.stop) sim.at(first, step, { prio: 1 });
    });
    // ---- shifts and breakdowns ----
    ST.forEach(X => {
      const q = X.q;
      if (q.shifts) {
        const { period, plan } = q.shifts; let n = 0;
        for (let c0 = 0; c0 <= tEnd && n < 4000; c0 += period) for (const x of plan) {
          const a = c0 + x.from, b = c0 + x.to; if (a > tEnd) continue; n += 2;
          sim.at(a, () => setCap(X, x.servers), { prio: -1 }); if (b <= tEnd) sim.at(b, () => setCap(X, X.base), { prio: -1 });
        }
      }
      if (q.ttf) {
        const fail = () => {
          X.up = false; setTw(X.twDown, 1); LOG('fail', null, X.i);
          for (const e of X.inSvc) e.downLeft = interruptSvc(e);
          sim.after(draw(q.ttr, R.ttr(X.i)), repair, { prio: -1 });
        };
        const repair = () => {
          X.up = true; setTw(X.twDown, 0); LOG('repair', null, X.i);
          const pol = X.s.bd.policy;
          for (const e of X.inSvc) schedEnd(X, e, pol === 'restart' ? (e.svcRun != null ? e.svcRun : e.orig) : pol === 'resample' ? draw(svcDist(X, e), R.svc(X.i)) : e.downLeft);
          tryStart(X);
          sim.after(draw(q.ttf, R.ttf(X.i)), fail, { prio: -1 });
        };
        sim.after(draw(q.ttf, R.ttf(X.i)), fail, { prio: -1 });
      }
    });
    function setCap(X, c) { X.cap = c; setTw(X.twCap, c); LOG('shift', null, X.i); tryStart(X); }
    // ---- the grid: snapshots of the accumulators (statistics between any two of them) and the series of rep 1 ----
    const snaps = [], grid = o.grid || [], maxqs = [];
    let gi = 0;
    const flushTw = () => { for (let j = 0; j < twIdx.length; j++) setTw(j, twVal[j]); };
    const snapshot = () => { flushTw(); snaps.push(acc.slice()); maxqs.push(ST.map(X => X.maxq)); for (const X of ST) X.maxq = X.nq; };
    const ser = rec ? { t: [], q: ST.map(() => []), n: ST.map(() => []), b: ST.map(() => []), sys: [] } : null;
    const sampleTimes = rec ? SK.linspace(0, tEnd, M.points) : [];
    const sample = t => { ser.t.push(t); ST.forEach((X, j) => { ser.q[j].push(X.nq); ser.n[j].push(X.present); ser.b[j].push(X.busy); }); ser.sys.push(present); };
    for (const g of grid) sim.at(g, () => snapshot(), { prio: -9 });
    if (rec) for (const t of sampleTimes) sim.at(t, () => sample(t), { prio: -10 });
    if (o.noRun) return { sim, snap() { flushTw(); return acc.slice(); }, maxq: () => ST.map(X => X.maxq), present: () => present };   // the stepper's live replication
    const res = sim.run(tEnd);
    while (snaps.length < grid.length) snapshot();   // a stopped run: the rest of the grid at its end
    const fatal = res.stop === 'budget' || res.stop === 'zeno' || stoppedBy === 'overflow';
    if (res.stop === 'budget') codes.code('budget', sim.now); if (res.stop === 'zeno') codes.code('zeno', sim.now);
    const evs = sim.events - grid.length - sampleTimes.length;
    return { snaps, maxqs, events: max(0, evs), fatal, t: sim.now, obsT, obsW, log, gantt, ser, present, nEnt };
  }

  /* the measures between two snapshots A (at tA) and B (at tB): {key: value}, key = measure|station|class (−1 = all) */
  function measures(M, A, B, span, mq) {
    const L = layout(M.nS, M.nK), d = i => B[i] - A[i], out = {};
    const put = (m, s, k, v) => { out[m + '|' + s + '|' + k] = v; };
    for (let s = 0; s < M.nS; s++) {
      const dep = d(L.st(s, 'dep')), cap = d(L.st(s, 'areaCap')), delay = M.stations[s].delay;
      put('lq', s, -1, d(L.st(s, 'areaQ')) / span); put('l', s, -1, d(L.st(s, 'areaN')) / span);
      put('busy', s, -1, delay ? d(L.st(s, 'areaN')) / span : d(L.st(s, 'areaB')) / span);
      put('util', s, -1, delay ? NaN : cap > 0 ? d(L.st(s, 'areaB')) / cap : NaN); put('down', s, -1, d(L.st(s, 'areaDown')) / span);
      put('served', s, -1, dep); put('throughput', s, -1, dep / span); put('arrived', s, -1, d(L.st(s, 'arr')));
      put('wq', s, -1, dep > 0 ? d(L.st(s, 'sumWq')) / dep : NaN); put('w', s, -1, dep > 0 ? d(L.st(s, 'sumW')) / dep : NaN); put('pwait', s, -1, dep > 0 ? d(L.st(s, 'nWaited')) / dep : NaN);
      put('balked', s, -1, d(L.st(s, 'balk'))); put('reneged', s, -1, d(L.st(s, 'ren'))); put('lost', s, -1, d(L.st(s, 'lost'))); put('preempted', s, -1, d(L.st(s, 'pre'))); put('jockeyed', s, -1, d(L.st(s, 'jock')));
      put('maxq', s, -1, mq ? mq[s] : NaN);
      { const ar = d(L.st(s, 'arr')); put('pAbandon', s, -1, ar > 0 ? (d(L.st(s, 'balk')) + d(L.st(s, 'ren')) + d(L.st(s, 'lost'))) / ar : NaN); }
      const lam = dep / span, Wm = dep > 0 ? d(L.st(s, 'sumW')) / dep : NaN; put('littleErr', s, -1, fin(Wm) ? SK.littleCheck(d(L.st(s, 'areaN')) / span, lam, Wm) : NaN);
      for (let k = 0; k < M.nK; k++) {
        const dk = d(L.sc(s, k, 'dep'));
        put('lq', s, k, d(L.sc(s, k, 'areaQ')) / span); put('l', s, k, d(L.sc(s, k, 'areaN')) / span); put('served', s, k, dk); put('throughput', s, k, dk / span); put('arrived', s, k, d(L.sc(s, k, 'arr')));
        put('wq', s, k, dk > 0 ? d(L.sc(s, k, 'sumWq')) / dk : NaN); put('w', s, k, dk > 0 ? d(L.sc(s, k, 'sumW')) / dk : NaN); put('pwait', s, k, dk > 0 ? d(L.sc(s, k, 'nWaited')) / dk : NaN);
      }
    }
    const ex = d(L.sy('exit'));
    let lqs = 0; for (let s = 0; s < M.nS; s++) lqs += d(L.st(s, 'areaQ')) / span;
    put('l', -1, -1, d(L.sy('areaN')) / span); put('lq', -1, -1, lqs); put('served', -1, -1, ex); put('throughput', -1, -1, ex / span); put('arrived', -1, -1, d(L.sy('arr')));
    put('wq', -1, -1, ex > 0 ? d(L.sy('sumWq')) / ex : NaN); put('w', -1, -1, ex > 0 ? d(L.sy('sumW')) / ex : NaN); put('pwait', -1, -1, ex > 0 ? d(L.sy('nWaited')) / ex : NaN);
    put('balked', -1, -1, d(L.sy('balk'))); put('reneged', -1, -1, d(L.sy('ren'))); put('lost', -1, -1, d(L.sy('lost')));
    { const ar = d(L.sy('arr')); put('pAbandon', -1, -1, ar > 0 ? (d(L.sy('balk')) + d(L.sy('ren')) + d(L.sy('lost'))) / ar : NaN); }
    const Wsys = ex > 0 ? d(L.sy('sumW')) / ex : NaN; put('littleErr', -1, -1, fin(Wsys) ? SK.littleCheck(d(L.sy('areaN')) / span, ex / span, Wsys) : NaN);
    for (let k = 0; k < M.nK; k++) {
      const dk = d(L.syc(k, 'dep')); let lqk = 0; for (let s = 0; s < M.nS; s++) lqk += d(L.sc(s, k, 'areaQ')) / span;
      put('l', -1, k, d(L.syc(k, 'areaN')) / span); put('lq', -1, k, lqk); put('served', -1, k, dk); put('throughput', -1, k, dk / span); put('arrived', -1, k, d(L.syc(k, 'arr')));
      put('wq', -1, k, dk > 0 ? d(L.syc(k, 'sumWq')) / dk : NaN); put('w', -1, k, dk > 0 ? d(L.syc(k, 'sumW')) / dk : NaN); put('pwait', -1, k, dk > 0 ? d(L.syc(k, 'nWaited')) / dk : NaN);
    }
    return out;
  }

  /* ======================================================================================================================
     Queueing theory: what the simulation is validated against (Gross et al. 2008; Kleinrock 1975)
     ====================================================================================================================== */
  /** Erlang C: P(wait) in M/M/c with offered load a = λ/μ (Erlang 1917; Gross et al. §2.3), by the stable recurrence of Erlang B */
  function erlangC(c, a) { if (!(a >= 0) || !(c >= 1)) return NaN; if (a >= c) return 1; let B = 1; for (let k = 1; k <= c; k++) B = a * B / (k + a * B); return B / (1 - (a / c) * (1 - B)); }
  /** M/M/c: {rho, pwait, lq, wq, w, l} */
  function mmc(lam, mu, c) { const a = lam / mu, rho = a / c; if (!(rho < 1)) return { rho, pwait: NaN, lq: NaN, wq: NaN, w: NaN, l: NaN, unstable: true }; const pw = erlangC(c, a), lq = pw * rho / (1 - rho), wq = lq / lam; return { rho, pwait: pw, lq, wq, w: wq + 1 / mu, l: lq + a }; }
  /** M/M/c/K (K = c + room): the birth–death stationary law (Gross et al. §2.5); λ_eff = λ(1 − p_K) */
  function mmck(lam, mu, c, room) {
    const K = c + room; if (K > 100000) return mmc(lam, mu, c);
    const a = lam / mu, p = [1]; for (let n = 1; n <= K; n++) p.push(p[n - 1] * a / min(n, c));
    const s = p.reduce((x, y) => x + y, 0); for (let n = 0; n <= K; n++) p[n] /= s;
    let lq = 0, l = 0; for (let n = 0; n <= K; n++) { l += n * p[n]; if (n > c) lq += (n - c) * p[n]; }
    const le = lam * (1 - p[K]); let pw = 0; for (let n = c; n < K; n++) pw += p[n]; pw /= (1 - p[K]);
    return { rho: le / (c * mu), pwait: pw, lq, l, wq: lq / le, w: l / le, ploss: p[K], lamEff: le };
  }
  /** M/G/1 by Pollaczek–Khinchine: Wq = λE[S²]/(2(1 − ρ)) (Pollaczek 1930, Khinchine 1932; Gross et al. §5.1.1) */
  function mg1(lam, ES, ES2) { const rho = lam * ES; if (!(rho < 1)) return { rho, pwait: NaN, lq: NaN, wq: NaN, w: NaN, l: NaN, unstable: true }; const wq = lam * ES2 / (2 * (1 - rho)); return { rho, pwait: rho, wq, lq: lam * wq, w: wq + ES, l: lam * (wq + ES) }; }
  /** M/G/1 with priority classes (k = 0 the highest): non-preemptive (Cobham 1954) Wq_k = W0/((1 − σ_{k−1})(1 − σ_k)),
      W0 = Σ λ_i E[S_i²]/2; preemptive-resume (Gross et al. §3.4.2, Kleinrock II §3.6): W_k = E[S_k]/(1 − σ_{k−1}) +
      R_k/((1 − σ_{k−1})(1 − σ_k)), R_k = Σ_{i≤k} λ_i E[S_i²]/2 */
  function mg1prio(lams, ES, ES2, preempt) {
    const K = lams.length, out = []; let W0 = 0; for (let i = 0; i < K; i++) W0 += lams[i] * ES2[i] / 2;
    let sig = 0, R = 0;
    for (let k = 0; k < K; k++) {
      const s0 = sig; sig += lams[k] * ES[k]; R += lams[k] * ES2[k] / 2;
      if (!(sig < 1)) { out.push({ wq: NaN, w: NaN, lq: NaN, l: NaN, unstable: true }); continue; }
      let w, wq;
      if (preempt) { w = ES[k] / (1 - s0) + R / ((1 - s0) * (1 - sig)); wq = w - ES[k]; } else { wq = W0 / ((1 - s0) * (1 - sig)); w = wq + ES[k]; }
      out.push({ wq, w, lq: lams[k] * wq, l: lams[k] * w });
    }
    return out;
  }
  /** the analytic values of the model where they exist → {st: [{rho, util, pwait, lq, wq, w, l, cls: [...]}], sys, codes} */
  function theory(M, P) {
    const nS = M.nS, nK = M.nK, codes = [], cd = c => { if (!codes.includes(c)) codes.push(c); };
    const na = () => ({ st: M.stations.map(() => null), sys: null, codes: (cd('theory-na'), codes) });
    // external Poisson rates per station and class; routing by probabilities only (Jackson 1957)
    const gam = Array.from({ length: nS }, () => new Array(nK).fill(0));
    for (let i = 0; i < M.sources.length; i++) {
      const s = M.sources[i], q = P.sources[i];
      if (!q.arrival || q.arrival.spec.dist !== 'exp' || q.batch || q.schedule || q.rates || q.start > 0 || fin(q.stop) || s.shortest || fin(s.limit)) return na();
      const lam = 1 / q.arrival.mean;
      const w = s.cls != null ? [[s.cls, 1]] : q.mix ? q.mix.map(([k, x]) => [k, x / q.mix.reduce((a, b) => a + b[1], 0)]) : [[0, 1]];
      for (const [k, f] of w) gam[s.to][k] += lam * f;
    }
    const Pm = Array.from({ length: nS }, () => new Array(nS).fill(0));
    for (let j = 0; j < nS; j++) { const rs = M.stations[j].route; if (!rs.length) continue; if (!rs[0].p || rs.some(r => r.shortest)) return na(); rs.forEach((r, i) => { if (r.to >= 0) Pm[j][r.to] += P.stations[j].route[i].p; }); }
    // traffic equations λ = γ + Pᵀλ per class, solved by Gaussian elimination with partial pivoting
    const lamK = [];
    for (let k = 0; k < nK; k++) {
      const A = Array.from({ length: nS }, (_, i) => Array.from({ length: nS }, (_, j) => (i === j ? 1 : 0) - Pm[j][i])), b = gam.map(g => g[k]);
      for (let c = 0; c < nS; c++) { let p = c; for (let r = c + 1; r < nS; r++) if (abs(A[r][c]) > abs(A[p][c])) p = r; if (abs(A[p][c]) < 1e-14) return na(); [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
        for (let r = c + 1; r < nS; r++) { const f = A[r][c] / A[c][c]; for (let j = c; j < nS; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; } }
      const x = new Array(nS).fill(0); for (let r = nS - 1; r >= 0; r--) { let s = b[r]; for (let j = r + 1; j < nS; j++) s -= A[r][j] * x[j]; x[r] = s / A[r][r]; }
      lamK.push(x);
    }
    const internal = M.stations.map((_, j) => M.stations.some((s, i) => s.route.some(r => r.to === j)) || M.sources.filter(s => s.to === j).length > 1);
    const st = M.stations.map((s, j) => {
      const q = P.stations[j], lk = lamK.map(x => x[j]), lam = lk.reduce((a, b) => a + b, 0);
      if (!(lam > 0)) return { rho: 0, util: 0, pwait: 0, lq: 0, wq: 0, w: NaN, l: 0, cls: lk.map(() => ({ wq: 0, w: NaN, lq: 0, l: 0, pwait: 0 })) };
      if (q.renege || s.balk || s.bd || q.shifts || (s.capacity < Infinity && !s.delay)) { if (!(q.renege || s.balk || s.bd || q.shifts)) { /* M/M/c/K below */ } else { cd('theory-na'); return null; } }
      const Ds = M.classes.map((c, k) => q.serviceBy[k] || q.service), ES = Ds.map(d => d.mean), ES2 = Ds.map(d => d.var + d.mean * d.mean);
      const mES = lk.reduce((a, l, k) => a + l * ES[k], 0) / lam, mES2 = lk.reduce((a, l, k) => a + l * ES2[k], 0) / lam;
      const allExp = Ds.every(d => d.spec.dist === 'exp') && ES.every(v => abs(v - ES[0]) <= 1e-12 * ES[0]);
      let r;
      if (s.delay) r = { rho: lam * mES, util: NaN, pwait: 0, lq: 0, wq: 0, w: mES, l: lam * mES };   // M/G/∞
      else if (s.capacity < Infinity) { if (!allExp) { cd('theory-na'); return null; } r = mmck(lam, 1 / mES, q.servers, s.capacity); }
      else if (s.disc === 'priority' && nK > 1 && q.servers === 1) {
        const ord = M.classes.map((c, k) => k).sort((a, b) => M.classes[a].prio - M.classes[b].prio || a - b);
        const pr = mg1prio(ord.map(k => lk[k]), ord.map(k => ES[k]), ord.map(k => ES2[k]), s.preempt === 'resume');
        if (s.preempt !== 'none' && s.preempt !== 'resume') cd('theory-approx');
        const cls = new Array(nK); ord.forEach((k, i) => { cls[k] = { ...pr[i], pwait: NaN }; });
        const rho = lam * mES, lq = cls.reduce((a, x) => a + x.lq, 0), l = cls.reduce((a, x) => a + x.l, 0);
        r = rho < 1 ? { rho, util: rho, pwait: rho, lq, l, wq: lq / lam, w: l / lam, cls } : { rho, util: rho, pwait: NaN, lq: NaN, l: NaN, wq: NaN, w: NaN, unstable: true, cls };
      } else if (s.disc === 'spt' || (s.disc === 'priority' && nK > 1)) { cd('theory-na'); return null; }
      else if (allExp) r = mmc(lam, 1 / mES, q.servers);
      else if (q.servers === 1) r = mg1(lam, mES, mES2);
      else { const base = mmc(lam, 1 / mES, q.servers), f = (1 + (mES2 - mES * mES) / (mES * mES)) / 2; cd('theory-approx');   // Allen–Cunneen 1990 (Gross et al. §6.4)
        r = base.unstable ? base : { ...base, wq: base.wq * f, lq: base.lq * f, w: base.wq * f + mES, l: base.lq * f + lam * mES }; }
      if (!s.delay && !allExp && internal[j]) cd('theory-approx');   // a non-exponential station fed by a network: not a product form
      if (r.unstable) cd('unstable');
      if (r.util == null) r.util = s.delay ? NaN : r.rho;
      if (!r.cls) r.cls = lk.map((l, k) => ({ wq: r.wq, w: r.wq + ES[k], lq: lam > 0 ? r.lq * l / lam : 0, l: lam > 0 ? l * (r.wq + ES[k]) : 0, pwait: r.pwait }));
      return r;
    });
    let sys = null;
    if (st.every(Boolean)) {
      const lamE = gam.reduce((a, g) => a + g.reduce((x, y) => x + y, 0), 0), L0 = st.reduce((a, x) => a + x.l, 0), Lq = st.reduce((a, x) => a + x.lq, 0);
      const lost = M.stations.reduce((a, s, j) => a + (st[j].ploss ? st[j].lamEff / (1 - st[j].ploss) * st[j].ploss : 0), 0);
      const thr = lamE - lost;
      sys = { l: L0, lq: Lq, w: L0 / thr, wq: Lq / thr, rho: NaN, util: NaN, pwait: NaN,
        cls: M.classes.map((c, k) => { const g = gam.reduce((a, x) => a + x[k], 0), Lk = st.reduce((a, x) => a + x.cls[k].l, 0), Lqk = st.reduce((a, x) => a + x.cls[k].lq, 0); return { l: Lk, lq: Lqk, w: g > 0 ? Lk / g : NaN, wq: g > 0 ? Lqk / g : NaN, pwait: NaN }; }) };
      if (M.nS === 1) sys.pwait = st[0].pwait;
    }
    return { st, sys, codes };
  }

  /* ======================================================================================================================
     A run: replications (or one long run for batch means), the warm-up, the estimates and the outputs
     ====================================================================================================================== */
  const empty = o => (o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : NaN);
  function simulate(M, P, env, codes, opts) {
    const seed = ((opts.seed >>> 0) || 1) + M.seed, reps = M.reps, T = P.tEnd;
    const G = M.mser ? (M.method === 'batch' ? 200 : 40) : M.method === 'batch' ? 200 : 0;
    const grid = G ? SK.linspace(0, T, G + 1) : (P.warmup > 0 ? [P.warmup, T] : [0, T]);
    let budget = M.maxEvents; const runs = [];
    const obsCap = max(100, floor(MAX_OBS / reps));
    for (let r = 0; r < reps; r++) {
      if (budget <= 0) { codes.code('budget'); break; }
      const anti = M.anti && r % 2 === 1, sub = M.anti ? floor(r / 2) : r;
      const run = replication(M, P, { env, codes, seed, sub, anti, grid, record: r === 0 && opts.record, maxEvents: budget, obsCap });
      budget -= run.events;
      if (run.fatal) { if (r === 0) runs.push(run); break; }
      runs.push(run);
    }
    // the warm-up: fixed, or MSER-5 on the across-replication average of the system times in exit order (White 1997)
    let wT = P.warmup, gW = 0;
    if (M.mser && runs.length) {
      const nmin = min(...runs.map(r => r.obsW.length));
      if (nmin >= 20) {
        const avg = new Float64Array(nmin); for (const r of runs) for (let i = 0; i < nmin; i++) avg[i] += r.obsW[i] / runs.length;
        const ms = SK.mser5(Array.from(avg)); if (ms.short) codes.code('warmup-short');
        wT = ms.d > 0 ? runs.reduce((a, r) => a + r.obsT[min(ms.d, r.obsT.length) - 1], 0) / runs.length : 0;
      } else codes.code('warmup-short');
    }
    if (G) { gW = 0; while (gW < G && grid[gW] < wT - 1e-12 * T) gW++; wT = grid[gW]; } else gW = grid[0] > 0 ? 0 : 0;
    const iEnd = grid.length - 1;
    // per-replication (or per-batch) values of every measure
    const values = {};
    const pushAll = (m) => { for (const [k, v] of Object.entries(m)) (values[k] || (values[k] = [])).push(v); };
    const mqOver = (run, a, b) => run.s ? null : M.stations.map((s, j) => { let x = 0; for (let g = a + 1; g <= b; g++) x = max(x, run.maxqs[g][j]); return x; });
    const good = runs.filter(r => !r.fatal);
    if (M.method === 'batch' && good.length) {
      const run = good[0], nb = M.batches, m0 = iEnd - gW, size = floor(m0 / nb);
      if (size < 1) codes.code('few-reps');
      else { const st0 = iEnd - nb * size; for (let b = 0; b < nb; b++) { const a = st0 + b * size, c = a + size; pushAll(measures(M, run.snaps[a], run.snaps[c], grid[c] - grid[a], mqOver(run, a, c))); } }
    } else for (const run of good) { const a = G ? gW : grid[0] > 0 ? 0 : 0, b = G ? iEnd : 1; const tA = G ? grid[a] : (P.warmup > 0 ? P.warmup : 0); pushAll(measures(M, run.snaps[G ? a : 0], run.snaps[G ? b : 1], T - tA, mqOver(run, G ? a : 0, G ? b : 1))); }
    const est = {};
    // antithetic pairs (rep 2i, 2i+1) are dependent: the CI is over the pair means, n = the number of whole pairs (Law §11.3)
    const pairs = v => { const o = []; for (let i = 0; i + 1 < v.length; i += 2) o.push((v[i] + v[i + 1]) / 2); return o; };
    for (const [k, v] of Object.entries(values)) est[k] = SK.ci(M.anti && M.method !== 'batch' && v.length >= 4 ? pairs(v) : v, M.level);
    { const ar = values['arrived|-1|-1']; if (good.length && (!ar || ar.every(v => !(v > 0)))) codes.code('no-arrivals'); }
    if (M.method === 'batch') { const w = values['w|-1|-1']; if (w && w.length > 2 && abs(SK.acf(w, 1)) > 0.2) codes.code('batch-correlated'); }
    else if (good.length < 2) codes.code('few-reps');
    // Little's law L = λW over the measured span: end effects are of order W/T, so it is only judged on spans ≥ 50 W (Little 1961; Law §1.4.1)
    const li = est['littleErr|-1|-1'], wS = est['w|-1|-1']; if (li && wS && li.mean > 0.05 && (T - wT) > 50 * wS.mean) codes.code('little');
    return { runs, good, est, values, wT, events: runs.reduce((a, r) => a + r.events, 0), first: runs[0] || null };
  }
  function run(spec, env0, opts) {
    const M = (opts && opts.prepared) || prepare(spec);
    const out = {}, outs = objs(spec && spec.outputs);
    const codes = SK.codes(FATAL);
    if (!M) { for (const o of outs) out[o.id] = empty(o); return { out, codes: [{ code: 'model', level: 'error' }] }; }
    const env = Object.assign(Object.create(null), env0 || {});
    const P = evalParams(M, env, codes);
    if (!P) { for (const o of outs) out[o.id] = o.of === 'ok' ? 0 : o.of === 'flag' ? (codes.has(o.code) ? 1 : 0) : empty(o); return { out, codes: codes.list }; }
    const record = outs.some(o => o.kind === 'scene' || (o.kind === 'series' && o.of !== 'repValues'));
    const R = simulate(M, P, env, codes, { seed: opts && opts.seed, record });
    const needTh = outs.some(o => o.of === 'theory' || o.of === 'covers') || outs.some(o => o.kind === 'scene' && o.of === 'network');
    const TH = needTh ? theory(M, P) : null;
    if (TH && outs.some(o => o.of === 'theory' || o.of === 'covers')) for (const c of TH.codes) codes.code(c);
    const sIdx = id => M.stations.findIndex(s => s.id === id), kIdx = id => M.classes.findIndex(c => c.id === id);
    const key = (m, o) => m + '|' + (o.station != null ? sIdx(o.station) : -1) + '|' + (o.class != null ? kIdx(o.class) : -1);
    const thOf = o => { if (!TH) return NaN; const s = o.station != null ? TH.st[sIdx(o.station)] : TH.sys; if (!s) return NaN; const base = o.class != null ? (s.cls ? s.cls[kIdx(o.class)] : null) : s; if (!base) return NaN; const v = base[o.measure]; return typeof v === 'number' ? v : NaN; };
    const first = R.first;
    for (const o of outs) {
      let v;
      try {
        if (o.kind === 'scalar') {
          if (MEASURES.includes(o.of)) { const e = R.est[key(o.of, o)]; v = e ? e[o.est || 'mean'] : NaN; }
          else if (o.of === 'theory') v = thOf(o);
          else if (o.of === 'covers') { const th = thOf(o), e = R.est[key(o.measure === 'rho' ? 'util' : o.measure, o)]; v = fin(th) && e && fin(e.half) ? (th >= e.lo && th <= e.hi ? 1 : 0) : NaN; }
          else if (o.of === 'warmupT') v = R.wT;
          else if (o.of === 'events') v = R.events;
          else if (o.of === 'reps') v = M.method === 'batch' ? (R.values['w|-1|-1'] || []).length : R.good.length;
        } else if (o.kind === 'series') {
          const sj = o.station != null ? sIdx(o.station) : -1, ser = first && first.ser;
          if (o.of === 't') v = ser ? ser.t : [];
          else if (o.of === 'qlen') v = ser ? ser.q[sj] : [];
          else if (o.of === 'inSystem') v = ser ? (sj >= 0 ? ser.n[sj] : ser.sys) : [];
          else if (o.of === 'busySeries') v = ser ? ser.b[sj] : [];
          else if (o.of === 'repValues') v = (R.values[key(o.measure, o)] || []).slice();
          else if (o.of === 'waits') v = first ? first.obsW.slice(0, 2000) : [];
          else if (o.of === 'logT') v = first && first.log ? first.log.map(x => x[0]) : [];
          else if (o.of === 'logKind') v = first && first.log ? first.log.map(x => x[1]) : [];
          else if (o.of === 'logEntity') v = first && first.log ? first.log.map(x => x[2]) : [];
          else if (o.of === 'logStation') v = first && first.log ? first.log.map(x => x[3]) : [];
        } else {
          if (o.of === 'network') v = networkScene(M, P, R, TH);
          else if (o.of === 'gantt') v = ganttScene(M, P, first, o.window != null ? C.cx(o.window)(env) : P.tEnd);
          else if (o.of === 'log') v = logScene(M, first);
        }
      } catch (err) { v = undefined; }
      if (v === undefined) v = empty(o);
      if (o.kind === 'series') v = C.thin(v, 2000);
      out[o.id] = v;
    }
    for (const o of outs) if (o.of === 'flag') out[o.id] = codes.has(o.code) ? 1 : 0; else if (o.of === 'ok') out[o.id] = codes.fatal() ? 0 : 1;
    return { out, codes: codes.list, events: R.events, est: R.est, theory: TH, log: first && first.log ? first.log.slice() : [] };
  }

  /* ---------- scenes ---------- */
  const ROLE_K = ['hi', 'info', 'warn', 'ok', 'bad', 'muted', 'base', 'hi'];
  const label = (it, x) => (x.key ? { ...it, key: x.key } : { ...it, s: String(x.id).slice(0, 64) });
  function layoutNet(M) {
    const depth = M.stations.map(() => Infinity), q = [];
    for (const s of M.sources) for (const j of s.shortest || [s.to]) if (j != null && depth[j] > 1) { depth[j] = 1; q.push(j); }
    while (q.length) { const j = q.shift(); for (const r of M.stations[j].route) for (const k of r.shortest || [r.to]) if (k != null && k >= 0 && depth[k] > depth[j] + 1) { depth[k] = depth[j] + 1; q.push(k); } }
    const col = depth.map(d => (fin(d) ? d : 1)), rows = {}, pos = [];
    M.stations.forEach((s, j) => { const c = col[j]; rows[c] = (rows[c] || 0) + 1; pos[j] = [c * 5, -(rows[c] - 1) * 3.2]; });
    const maxCol = max(1, ...col);
    const srcPos = M.sources.map((s, i) => [0, -i * 3.2]);
    return { pos, srcPos, exit: [(maxCol + 1) * 5, 0], maxCol };
  }
  function networkScene(M, P, R, TH) {
    const Lo = layoutNet(M), get = (m, j) => { const e = R.est[m + '|' + j + '|-1']; return e ? e.mean : NaN; };
    const lqs = M.stations.map((s, j) => get('lq', j)), lqMax = max(1, ...lqs.filter(fin));
    const xs = [], ys = []; for (const p of Lo.pos.concat(Lo.srcPos, [Lo.exit])) { xs.push(p[0] - 3, p[0] + 2); ys.push(p[1] - 1.4, p[1] + 1.4); }
    const sc = C.scene(C.fitView(xs, ys, 0.05));
    M.sources.forEach((s, i) => { const [x, y] = Lo.srcPos[i]; sc.pt(x, y, label({ r: 6, c: 'info' }, s));
      for (const j of s.shortest || [s.to]) { const [tx, ty] = Lo.pos[j]; sc.seg(x + 0.4, y, tx - 1.3, ty, { arrow: true, c: 'muted' }); } });
    M.stations.forEach((s, j) => {
      const [x, y] = Lo.pos[j], u = get('util', j), role = !fin(u) ? 'base' : u < 0.7 ? 'ok' : u < 0.9 ? 'warn' : 'bad';
      sc.poly([x - 1.2, y - 1, x + 1.2, y - 1, x + 1.2, y + 1, x - 1.2, y + 1], { c: role, closed: true });
      const c = s.delay ? 0 : min(8, P.stations[j].servers); for (let k = 0; k < c; k++) sc.circ(x - 0.9 + (k % 4) * 0.6, y + (k < 4 ? 0.35 : -0.35), 0.22, { c: role, fill: true });
      sc.txt(x, y + 1.35, label({ anchor: 'middle' }, s));
      if (fin(u)) sc.txt(x, y - 1.35, { v: Math.round(u * 1000) / 1000, anchor: 'middle', c: role });
      const lq = lqs[j]; if (!s.delay && fin(lq)) { const wdt = 1.6 * min(1, lq / lqMax); if (wdt > 0) sc.poly([x - 1.3 - wdt, y - 0.3, x - 1.3, y - 0.3, x - 1.3, y + 0.3, x - 1.3 - wdt, y + 0.3], { c: 'hi', fill: true, closed: true }); sc.txt(x - 2.2, y + 0.55, { v: Math.round(lq * 100) / 100, anchor: 'middle', c: 'hi' }); }
      const rs = s.route; if (!rs.length) sc.seg(x + 1.2, y, Lo.exit[0] - 0.4, Lo.exit[1], { arrow: true, c: 'muted' });
      rs.forEach((r, i) => { for (const k of r.shortest || [r.to]) { const [tx, ty] = k >= 0 ? Lo.pos[k] : Lo.exit; const back = k >= 0 && tx <= x;
        sc.seg(x + 1.2, y + (back ? 0.6 : 0), k >= 0 ? tx - 1.3 : tx - 0.4, ty + (back ? 0.6 : 0), { arrow: true, c: 'muted', dash: back });
        const pv = R && M.stations[j].route[i].p ? (TH === undefined ? NaN : NaN) : NaN; void pv; } });
    });
    sc.pt(Lo.exit[0], Lo.exit[1], { r: 6, c: 'muted' });
    return sc.done();
  }
  function ganttScene(M, P, run, window) {
    const T = P.tEnd, Wn = fin(window) && window > 0 ? min(window, T) : T, W = 100, lanes = [];
    M.stations.forEach((s, j) => { if (!s.delay) { const n = max(P.stations[j].servers, ...(P.stations[j].shifts ? P.stations[j].shifts.plan.map(x => x.servers) : [0])); for (let k = 0; k < min(n, 8); k++) lanes.push([j, k]); } });
    const H = 4, sc = C.scene([-22, W + 4, -(lanes.length + 1) * H, H]);
    lanes.forEach(([j, k], li) => { const y = -li * H; sc.seg(0, y, W, y, { c: 'muted', w: 1 }); sc.txt(-1, y, { s: (String(M.stations[j].id) + '·' + (k + 1)).slice(0, 64), anchor: 'end' }); });
    for (const g of run && run.gantt ? run.gantt : []) {
      const li = lanes.findIndex(l => l[0] === g[0] && l[1] === g[1]); if (li < 0 || g[2] > Wn) continue;
      sc.seg(g[2] / Wn * W, -li * H, min(g[3], Wn) / Wn * W, -li * H, { c: ROLE_K[g[4] % ROLE_K.length], w: 8 });
    }
    for (let i = 0; i <= 4; i++) sc.txt(i * W / 4, -(lanes.length) * H + 1, { v: Math.round(Wn * i / 4 * 100) / 100, anchor: 'middle', c: 'muted' });
    return sc.done();
  }
  function logScene(M, run) {
    const L0 = run && run.log ? run.log.slice(0, 40) : [], sc = C.scene([0, 60, -(L0.length + 1) * 2, 2]);
    L0.forEach((e, i) => { const y = -i * 2; sc.txt(0, y, { v: Math.round(e[0] * 1000) / 1000 }); sc.txt(12, y, { s: LOG_KINDS[e[1]], c: ['lost', 'balk', 'renege', 'fail'].includes(LOG_KINDS[e[1]]) ? 'bad' : e[1] === 0 ? 'info' : 'base' });
      if (e[2] >= 0) sc.txt(26, y, { s: '#' + e[2] }); if (e[3] >= 0) sc.txt(34, y, { s: String(M.stations[e[3]].id).slice(0, 64) }); });
    return sc.done();
  }

  /* ======================================================================================================================
     The stepper for the parts orchestrator (docs/library/simkit.md §8): one replication advanced by macro steps
     init(model, inputs, ctx) → state; step(state, inputs, t, dt, ctx) → {state, out}. The state holds a live executive (closures):
     resumable by sim().run(t + dt), not snapshottable (snapshot null). out: now, inSystem, served, wq, w (system means so far),
     and nq_<station>, busy_<station>, util_<station> for every station whose id is a name.
     ====================================================================================================================== */
  const stepper = {
    id: ID, snapshot: null, restore: null,
    init(model, inputs, ctx) {
      const spec = ctx && isObj(ctx.spec) ? ctx.spec : { format: 'noema.sim-spec/v1', engine: ID, model, outputs: [] };
      if (C.hasErrors(checkSpec({ ...spec, model }))) return null;
      const M = build({ ...spec, model }), env = Object.assign(Object.create(null), inputs || {}), codes = SK.codes(FATAL), P = evalParams(M, env, codes);
      if (!P) return null;
      P.tEnd = 1e300;   // the orchestrator decides the horizon
      const live = replication(M, P, { env, codes, seed: (((ctx && ctx.seed) >>> 0) || 1) + M.seed, sub: 0, anti: false, grid: [], record: false, maxEvents: M.maxEvents, obsCap: 0, noRun: true });
      return { M, live, codes, outputs: objs(spec.outputs), t: ctx && fin(ctx.t0) ? ctx.t0 : 0, zero: new Float64Array(layout(M.nS, M.nK).size) };
    },
    output(state) { return state ? stepOut(state) : {}; },
    step(state, inputs, t, dt) {
      if (!state || !state.live) return { state, out: {}, fail: 'model' };
      const t1 = (fin(t) ? t : state.t) + dt, r = state.live.sim.run(t1); state.t = t1;
      return { state, out: stepOut(state), dt, ...(r.stop === 'budget' || r.stop === 'zeno' ? { fail: r.stop } : {}) };
    },
  };
  /** the running values of the spec's scalar outputs over [0, now] (one sample per macro step for the orchestrator) */
  function stepOut(state) {
    const { M, live, outputs } = state, now = live.sim.now, out = {};
    const mz = now > 0 ? measures(M, state.zero, live.snap(), now, live.maxq()) : null;
    for (const o of outputs) {
      if (o.kind !== 'scalar') continue;
      const sj = o.station != null ? M.stations.findIndex(x => x.id === o.station) : -1, kj = o.class != null ? M.classes.findIndex(c => c.id === o.class) : -1;
      if (MEASURES.includes(o.of)) out[o.id] = mz && (o.est == null || o.est === 'mean') ? mz[o.of + '|' + sj + '|' + kj] : NaN;
      else if (o.of === 'events') out[o.id] = live.sim.events;
      else if (o.of === 'ok') out[o.id] = state.codes.fatal() ? 0 : 1;
      else if (o.of === 'flag') out[o.id] = state.codes.has(o.code) ? 1 : 0;
      else out[o.id] = NaN;
    }
    return out;
  }

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true, stepper });
  const API = Object.freeze({
    table: { model: TABLE, outputs: { scalar: SCALARS, series: SERIES, scene: SCENES }, fields: { station: 'ref', class: 'name', est: 'enum:' + ESTS.join('|'), measure: 'enum:' + MEASURES.concat(['rho']).join('|'), code: 'enum:' + CODES.join('|'), window: 'numx' } },
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine, stepper: Object.freeze(stepper),
    CODES: Object.freeze(CODES.slice()), MEASURES: Object.freeze(MEASURES.slice()), SCALARS: Object.freeze(SCALARS.slice()), SERIES: Object.freeze(SERIES.slice()), SCENES: Object.freeze(SCENES.slice()),
    LOG_KINDS: Object.freeze(LOG_KINDS.slice()), THEORY: Object.freeze(THEORY.slice()),
    erlangC, mmc, mmck, mg1, mg1prio, theory, layout,
  });
  export default API;
  /* i18n-ignore-end */
