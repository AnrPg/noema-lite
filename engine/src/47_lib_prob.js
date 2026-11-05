/* ===================== prob@1 — probability and statistics: the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md, chapter docs/library/prob.md) =====================
   One general engine with 14 modes (model.mode):
     dist       25 families (pmf/pdf, cdf, sf, logs, quantiles, moments, P(a ≤ X ≤ b), normal and Poisson approximations, plots)
     mc         Monte Carlo of an expression over seeded draws (Welford, Wilson for events, running mean with its band, histogram)
     sampling   sampling distributions: CLT and LLN for any parent (and its failure for heavy tails)
     test       20 tests: z, t (one, paired, Welch, pooled), proportions, exact binomial, sign, χ² (fit, independence), G, Fisher,
                McNemar, F, one-way ANOVA, Pearson, regression slope, Mann–Whitney U, Wilcoxon signed rank
     ci         intervals for a proportion (Wald, Wilson, Agresti–Coull, Clopper–Pearson, Jeffreys) with their exact coverage,
                a Poisson rate (Garwood), a mean (t, z), a variance (χ²)
     power      power and sample size (z, t via the noncentral t of AS 243, two proportions by Cohen's h, the exact binomial test)
     bayes      conjugate updating (beta–binomial, gamma–Poisson, normal–normal): posteriors, equal-tail and HPD intervals, Bayes factors
     screen     the base-rate fallacy: PPV/NPV, likelihood ratios, natural frequencies and their icon array
     simpson    Simpson's paradox over strata: pooled vs stratified rates, direct standardisation, Mantel–Haenszel
     multi      multiple testing (Bonferroni, Holm, Hochberg, Benjamini–Hochberg, Benjamini–Yekutieli) and its seeded simulation
     markov     finite Markov chains: classes, periods, stationary law (GTH), absorption (fundamental matrix), hitting times, mixing
     walk       random walks (exact law of S_n, reflection, returns, Pólya), gambler's ruin, Galton–Watson extinction
     queue      M/M/c queues (Erlang B and C, Little's law)
     bootstrap  the bootstrap (percentile, basic, normal, BCa) and permutation tests
   The special functions are written here with their sources beside them (lgamma, Loader's saddle point, the regularised incomplete
   gamma and beta functions, AS 241, AS 243). Pure, bounded, deterministic JS: no DOM, no network, no clock; the transcendental
   functions are NoemaExpr's fdlibm ports (never the platform's Math.* except sqrt, floor and the IEEE-exact operations); seeded
   randomness only (the core's mulberry32). A value outside a method's validity range is never a silent wrong number: it is NaN or
   Infinity with an issue counted (outputs issue.<code>). */
(function noemaLibProbModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, numbers and the model's own state names leave this module
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'prob@1';
  /* the schema of every mode, the families, the outputs each mode computes — the SAME JSON is embedded in tools/lib_prob.py
     (tests/lib_prob.js checks that the two copies are identical) */
  const DATA = __DATA__;
  const isObj = C.isObj, isNum = C.isNum, has = C.has;
  const fin = Number.isFinite;

  /* ===================================================================================================================== */
  /* the model checker (the same codes, paths, messages and order as tools/lib_prob.py)                                    */
  /* ===================================================================================================================== */
  const MISSING = undefined;
  function dig(o, path) { let v = o; for (const k of path.split('.')) { if (!isObj(v) || !has(v, k)) return MISSING; v = v[k]; } return v; }
  function specNames(spec) {
    const out = [];
    if (isObj(spec.consts)) out.push(...Object.keys(spec.consts));
    for (const k of ['params', 'derived']) if (Array.isArray(spec[k])) for (const p of spec[k]) if (isObj(p) && typeof p.id === 'string') out.push(p.id);
    return out;
  }
  /** the table of one distribution object: {family!, …its parameters} */
  function distTable(F) {
    const T = { family: 'enum:' + Object.keys(DATA.families).join('|') + '!' };
    if (!F) return T;
    for (const [k, kd] of Object.entries(F.p)) {
      const req = kd.endsWith('!'), b = req ? kd.slice(0, -1) : kd;
      if (b === 'bool') T[k] = 'bool';
      else if (b === 'list') T[k] = { $req: true, $list: 'numx', max: 64, min: 1 };
      else if (b === 'flist') T[k] = { $list: 'fin', max: 64 };
      else T[k] = req ? 'numx!' : 'numx';
    }
    return T;
  }
  function checkDist(o, p, E, W) {
    if (!isObj(o)) { E('format', p, 'not an object'); return; }
    const F = has(DATA.families, o.family) ? DATA.families[o.family] : null;
    C.walk(o, distTable(F), p, E, W);
    if (!F) return;
    for (const [k, kd] of Object.entries(F.p)) {
      const b = kd.replace('!', ''), v = o[k];
      if (b === 'bool' || b === 'flist') continue;
      if (b === 'list') { if (Array.isArray(v)) v.forEach((x, i) => { if (isNum(x) && x < 0) E('value', `${p}.${k}[${i}]`, C.kindMsg('nonneg')); }); continue; }
      if (isNum(v) && !C.checkKind(b, v)) E('value', `${p}.${k}`, C.kindMsg(b));
    }
    const f = o.family, n = k => isNum(o[k]);
    if (f === 'uniform' && n('a') && n('b') && !(o.b > o.a)) E('value', p + '.b', 'needs b > a');
    if (f === 'dunif' && n('a') && n('b') && !(o.b >= o.a)) E('value', p + '.b', 'needs b >= a');
    if (f === 'triangular' && n('a') && n('b') && n('c') && !(o.a <= o.c && o.c <= o.b && o.a < o.b)) E('value', p + '.c', 'needs a <= c <= b and a < b');
    if (f === 'hypergeometric' && n('N') && n('K') && o.K > o.N) E('value', p + '.K', 'needs K <= N');
    if (f === 'hypergeometric' && n('N') && n('n') && o.n > o.N) E('value', p + '.n', 'needs n <= N');
    if (f === 'gamma' && o.rate !== undefined && o.scale !== undefined) E('value', p + '.scale', 'give rate or scale, not both');
    if (f === 'categorical' && Array.isArray(o.values) && Array.isArray(o.probs) && o.values.length !== o.probs.length) E('value', p + '.values', 'needs one value per probability');
  }
  const IDX_RE = /^(0|[1-9][0-9]{0,5})$/;
  function prefOk(pref, of, m) {
    if (!pref) return false;
    for (const pf of Object.keys(pref)) {
      if (!of.startsWith(pf)) continue;
      const rest = of.slice(pf.length), vals = pref[pf];
      if (Array.isArray(vals)) { if (vals.includes(rest)) return true; continue; }
      if (vals === '$states') { if (Array.isArray(m.states) && m.states.includes(rest)) return true; continue; }
      const arr = vals === '$strata' ? m.strata : m.p;
      if (IDX_RE.test(rest) && Array.isArray(arr) && +rest < arr.length) return true;
    }
    return false;
  }
  function outOk(mode, m, kind, of) {
    const O = DATA.outs[mode];
    if (kind === 'scalar') return O.scalar.includes(of) || (of.startsWith('issue.') && O.issues.includes(of.slice(6))) || prefOk(O.prefix, of, m);
    if (kind === 'series') return O.series.includes(of) || prefOk(O.sprefix, of, m);
    return O.scene.includes(of);
  }
  const KINDS = ['scalar', 'series', 'scene'];
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('format', 'model', 'not an object'); C.checkOutputs(spec, ID, KINDS, () => { }, E, W); return P; }
    const mode = DATA.modes.includes(m.mode) ? m.mode : null;
    const T = Object.assign({ mode: 'enum:' + DATA.modes.join('|') + '!' }, mode ? DATA.schema[mode] : {});
    const own = (mode && DATA.custom[mode]) || [];   // fields checked by extra(), not by the table
    const mm = {}; for (const k of Object.keys(m)) if (!own.includes(k)) mm[k] = m[k];
    C.walk(mm, T, 'model', E, W);
    if (mode) extra(mode, m, spec, E, W);
    C.checkOutputs(spec, ID, KINDS, (o, at) => {
      if (mode && !outOk(mode, m, o.kind, o.of)) E('output', at + '.of', `${mode} computes no ${o.kind} "${o.of}"`);
    }, E, W);
    return P;
  }
  /** the checks a table cannot say (the same order and messages as tools/lib_prob.py extra) */
  function extra(mode, m, spec, E, W) {
    if (mode === 'dist' || mode === 'sampling') {
      const f = mode === 'dist' ? 'dist' : 'parent';
      if (m[f] === undefined) E('value', 'model.' + f, 'missing'); else checkDist(m[f], 'model.' + f, E, W);
    }
    if (mode === 'mc') {
      const d = m.draws;
      if (d === undefined) E('value', 'model.draws', 'missing');
      else if (!isObj(d)) E('format', 'model.draws', 'not an object');
      else {
        const ks = Object.keys(d);
        if (!ks.length) E('size', 'model.draws', 'fewer than 1 items');
        else if (ks.length > 16) E('size', 'model.draws', 'more than 16 items');
        else {
          const taken = specNames(spec);
          for (const k of ks) {
            const p = 'model.draws.' + k;
            if (!C.checkKind('name', k)) E('value', p, C.kindMsg('name'));
            else if (taken.includes(k)) E('value', p, 'is already a name of the spec');
            else checkDist(d[k], p, E, W);
          }
        }
      }
    }
    for (const [f, kd] of Object.entries(DATA.ranges[mode])) { const v = dig(m, f); if (isNum(v) && !C.checkKind(kd, v)) E('value', 'model.' + f, C.kindMsg(kd)); }
    const kf = DATA.kindField[mode];
    if (kf && DATA.needs[mode]) {
      const kind = kf === '*' ? '*' : m[kf];
      const alts = typeof kind === 'string' && has(DATA.needs[mode], kind) ? DATA.needs[mode][kind] : null;
      if (alts && !alts.some(a => a.every(f => dig(m, f) !== MISSING))) E('value', 'model', `${kind === '*' ? mode : kind} needs ${alts.map(a => a.join(' and ')).join(' or ')}`);
    }
    const k = m.kind, A = Array.isArray;
    if (mode === 'test') {
      if (A(m.table)) {
        const rows = m.table, rect = rows.length > 0 && rows.every(r => A(r) && A(rows[0]) && r.length === rows[0].length);
        if (!rect) E('value', 'model.table', 'needs rows of the same length');
        else if ((k === 'fisher' || k === 'mcnemar') && !(rows.length === 2 && rows[0].length === 2)) E('value', 'model.table', 'needs a 2 × 2 table');
        else if ((k === 'chi2-indep' || k === 'g-test') && (rows.length < 2 || rows[0].length < 2)) E('size', 'model.table', 'needs at least 2 rows and 2 columns');
      }
      if ((k === 't-paired' || k === 'pearson' || k === 'regression') && A(m.x) && A(m.y) && m.x.length !== m.y.length) E('value', 'model.y', 'needs as many values as model.x');
      if ((k === 'chi2-gof' || k === 'g-test') && A(m.observed) && A(m.probs) && m.observed.length !== m.probs.length) E('value', 'model.probs', 'needs one probability per observed count');
      if (k === 'anova' && A(m.groups) && m.groups.length < 2) E('size', 'model.groups', 'needs at least 2 groups');
    } else if (mode === 'ci') {
      if (typeof m.method === 'string' && has(DATA.ciMethods, k) && DATA.ciMethods[k].indexOf(m.method) < 0) E('value', 'model.method', `not a method for ${k} (${DATA.ciMethods[k].join(', ')})`);
    } else if (mode === 'bootstrap') {
      if (m.stat === 'corr' && A(m.x) && A(m.y) && m.x.length !== m.y.length) E('value', 'model.y', 'needs as many values as model.x');
      if (m.perm === true && m.y === undefined) E('value', 'model.perm', 'needs model.y');
    } else if (mode === 'markov') {
      const S = A(m.states) ? m.states : null;
      if (S) {
        const K = S.length;
        S.forEach((s, i) => { if (typeof s === 'string' && S.indexOf(s) < i) E('value', `model.states[${i}]`, `the state ${s} is listed twice`); });
        if (A(m.P) && (m.P.length !== K || m.P.some(r => !A(r) || r.length !== K))) E('value', 'model.P', `needs ${K} rows of ${K} numbers`);
        if (A(m.init) && m.init.length !== K) E('value', 'model.init', `needs ${K} numbers`);
        if (A(m.labels) && m.labels.length !== K) E('value', 'model.labels', `needs ${K} keys`);
        if (typeof m.start === 'string' && !S.includes(m.start)) E('value', 'model.start', 'not one of model.states');
      }
      if (m.init !== undefined && m.start !== undefined) E('value', 'model.start', 'give init or start, not both');
    } else if (mode === 'simpson') {
      if (A(m.strata)) m.strata.forEach((s, i) => {
        if (!isObj(s)) return;
        if (isNum(s.k1) && isNum(s.n1) && s.k1 > s.n1) E('value', `model.strata[${i}].k1`, 'needs k1 <= n1');
        if (isNum(s.k2) && isNum(s.n2) && s.k2 > s.n2) E('value', `model.strata[${i}].k2`, 'needs k2 <= n2');
      });
    } else if (mode === 'walk') {
      if (k === 'ruin' && isNum(m.i) && isNum(m.N) && m.i > m.N) E('value', 'model.i', 'needs i <= N');
    } else if (mode === 'multi') {
      if (isObj(m.sim) && isNum(m.sim.m) && isNum(m.sim.m0) && m.sim.m0 > m.sim.m) E('value', 'model.sim.m0', 'needs m0 <= m');
    }
  }

  /** every expression of the model: [source, path, local names] (the same order as tools/lib_prob.py exprs): the distributions
      first, then the fields in the schema's order; model.expr of mc may use the names of its draws */
  function exprs(spec) {
    const out = [], m = isObj(spec) ? spec.model : null;
    if (!isObj(m) || !DATA.modes.includes(m.mode)) return out;
    const local = m.mode === 'mc' && isObj(m.draws) ? Object.keys(m.draws) : [];
    const visitDist = (o, p) => {
      if (!isObj(o) || !has(DATA.families, o.family)) return;
      for (const [k, kd] of Object.entries(DATA.families[o.family].p)) {
        const v = o[k];
        if (kd.startsWith('list')) { if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'string') out.push([x, `${p}.${k}[${i}]`, []]); }); }
        else if (!kd.startsWith('bool') && !kd.startsWith('flist') && typeof v === 'string') out.push([v, p + '.' + k, []]);
      }
    };
    if (m.mode === 'dist') visitDist(m.dist, 'model.dist');
    if (m.mode === 'sampling') visitDist(m.parent, 'model.parent');
    if (m.mode === 'mc' && isObj(m.draws)) for (const k of Object.keys(m.draws)) visitDist(m.draws[k], 'model.draws.' + k);
    const visit = (v, kd, p) => {
      if (v === undefined || kd === undefined) return;
      if (typeof kd === 'string') {
        const b = kd.replace('!', '');
        if ((b === 'numx' || b === 'expr') && typeof v === 'string') out.push([v, p, b === 'expr' ? local : []]);
        return;
      }
      if (kd.$obj) { if (isObj(v)) for (const k of Object.keys(kd.$obj)) visit(v[k], kd.$obj[k], p + '.' + k); return; }
      if (kd.$list !== undefined && Array.isArray(v)) v.forEach((x, i) => visit(x, kd.$list, `${p}[${i}]`));
    };
    const T = DATA.schema[m.mode];
    for (const k of Object.keys(T)) visit(m[k], T[k], 'model.' + k);
    return out;
  }
  /** the string keys the model names: the labels of a Markov chain's states */
  function keys(spec) {
    const m = isObj(spec) ? spec.model : null;
    if (!isObj(m) || m.mode !== 'markov' || !Array.isArray(m.labels)) return [];
    return m.labels.map((k, i) => [k, `model.labels[${i}]`]).filter(r => typeof r[0] === 'string');
  }

  /* ---------- the model's numbers: compiled once (prepare), evaluated per run ---------- */
  function prepare(spec) {
    const fns = new Map();
    for (const [src] of exprs(spec)) if (!fns.has(src)) fns.set(src, C.cx(src));
    return { fns };
  }
  function resolver(prepared, env) {
    const fns = prepared ? prepared.fns : new Map();
    return v => typeof v === 'number' ? v : typeof v === 'boolean' ? +v : typeof v === 'string' ? (fns.get(v) || C.cx(v))(env) : NaN;
  }
  /** g(o, key, dflt): the number of a field (dflt when absent; NaN when it does not compute) */
  const getter = R => (o, k, d) => (isObj(o) && o[k] !== undefined ? R(o[k]) : d === undefined ? NaN : d);
  function issueBag() { const b = {}; return { add(c, k) { b[c] = (b[c] || 0) + (k || 1); }, out: b }; }

  //__NUMERICS__
})(typeof window !== 'undefined' ? window : globalThis);
