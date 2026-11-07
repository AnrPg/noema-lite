/* ===================== clinic@1 — clinical reasoning: differential diagnosis, thresholds, decisions, virtual patients, triage (docs/library/clinic.md) =====================
   A GENERAL engine of the library (docs/INTERACTIVE_LIBRARY.md). The model has any of these sections:
     ddx        a differential: hypotheses with priors, findings with likelihoods P(f+|H) (or LR+/LR− against one target), dependence
                groups, the learner's stated probabilities → sequential Bayesian posteriors, their trajectory, the band between
                "independent" and "fully dependent" evidence, the expected information gain of every finding not yet known, calibration
     threshold  Pauker & Kassirer's treatment threshold (NEJM 1975) and testing / test–treatment thresholds (NEJM 1980)
     tests      two tests in series or in parallel (with conditional dependence: Gardner, Prev Vet Med 2000)
     tree       a decision tree rolled back (expected utility), the optimal policy, regret, a one-way sensitivity sweep and its threshold
     markov     a Markov cohort (life expectancy, discounted QALYs and costs, half-cycle correction)
     cea        cost-effectiveness: dominance, extended dominance, ICERs on the frontier, net monetary benefit
     triage     ESI v5 logic (ENA 2023), NEWS2 (RCP 2017), qSOFA (Seymour 2016), SIRS (Bone 1992), shock index
     vp         a virtual patient: timed actions (history, examination, tests with turnaround, treatments with effects) on a small
                physiological model of the circulation, oxygenation and lactate ("haemo-lite", in-house), the course minute by minute,
                the outcome, and the GRADE OF THE REASONING PATH (essential actions, deadlines, harm, order, efficiency, calibration,
                information efficiency of the tests chosen, premature closure)
     sct, calib the script concordance test's aggregate scoring (Charlin 2000); Brier and log scores of forecasts
   Outputs name "<section>.<what>[.<id>]" (docs/library/clinic.md lists them). The body's numbers (oxygen saturation, content, NEWS2)
   come from med@1 (NoemaLibMed.calc): its module travels with this one to the Worker. EDUCATIONAL ONLY — never clinical advice.
   Pure, deterministic (seeded noise only), bounded. */
(function noemaLibClinicModule(root) {
  /* i18n-ignore-start */
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'clinic@1';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fin = Number.isFinite;
  const MED = () => root.NoemaLibMed || null;
  const CODES = ['normalised', 'certain', 'approx', 'impossible', 'incomplete', 'range', 'unsafe', 'no-test-zone'];
  const SECTIONS = ['ddx', 'threshold', 'tests', 'tree', 'markov', 'cea', 'triage', 'vp', 'sct', 'calib'];
  const VARS = ['hr', 'sbp', 'dbp', 'map', 'spo2', 'rr', 'lactate', 'temp', 'volume', 'burden', 'pao2', 'hb', 'news2'];
  const GRADE = ['total', 'essential', 'timely', 'safety', 'efficiency', 'order', 'calib', 'critical', 'process', 'outcome', 'lowYield', 'closure', 'infoEff'];

  /* ---------- the model checker (the same codes, paths and messages as tools/lib_clinic.py) ---------- */
  const HYP = { id: 'id!', prior: 'numx!', mustNotMiss: 'bool', act: 'numx', treatedBy: { $list: 'ref', max: 10 }, key: 'key' };
  const FIND = { id: 'id!', lik: { $map: 'numx', max: 31 }, lr: { $obj: { pos: 'numx!', neg: 'numx!' } }, target: 'ref', present: 'numx', group: 'ref', key: 'key' };
  const DDX = { hypotheses: { $req: true, $list: { $obj: HYP }, min: 2, max: 30 }, findings: { $list: { $obj: FIND }, max: 60 }, groups: { $list: { $obj: { id: 'id!', rho: 'numx!' } }, max: 20 },
    estimates: { $list: { $obj: { hyp: 'ref!', after: 'ref', p: 'numx!' } }, max: 30 }, other: 'bool', allowCertain: 'bool', truth: 'ref' };
  const THR = { benefit: 'numx!', harm: 'numx!', se: 'numx', sp: 'numx', testRisk: 'numx', p: 'numx' };
  const TESTS = { se1: 'numx!', sp1: 'numx!', se2: 'numx!', sp2: 'numx!', covSe: 'numx', covSp: 'numx', prev: 'numx', cost1: 'numx', cost2: 'numx' };
  const NODE = { id: 'id!', type: 'enum:decision|chance|terminal!', children: { $list: { $obj: { to: 'ref!', p: 'numx', key: 'key' } }, max: 8 }, u: 'numx', key: 'key' };
  const TREE = { root: 'ref!', nodes: { $req: true, $list: { $obj: NODE }, min: 2, max: 60 }, sweep: { $obj: { name: 'name!', min: 'fin!', max: 'fin!', points: 'int:2:200' } } };
  const MARKOV = { states: { $req: true, $list: { $obj: { id: 'id!', u: 'numx!', cost: 'numx', alive: 'bool', key: 'key' } }, min: 2, max: 30 }, P: { $req: true, $list: { $list: 'numx', max: 30 }, max: 30 },
    start: { $req: true, $list: 'numx', max: 30 }, cycles: 'int:1:1200!', discount: 'numx', halfCycle: 'bool', cycleYears: 'numx' };
  const CEA = { strategies: { $req: true, $list: { $obj: { id: 'id!', cost: 'numx!', qaly: 'numx!', key: 'key' } }, min: 2, max: 12 }, wtp: 'numx!' };
  const TRIAGE = { esi: { $obj: { lifesaving: 'numx', highRisk: 'numx', confused: 'numx', pain: 'numx', resources: 'numx', hr: 'numx', rr: 'numx', spo2: 'numx', age: 'numx' } },
    news2: { $obj: { rr: 'numx!', spo2: 'numx!', o2: 'numx', sbp: 'numx!', hr: 'numx!', cvpu: 'numx', temp: 'numx!', scale2: 'numx' } },
    qsofa: { $obj: { rr: 'numx!', sbp: 'numx!', gcs: 'numx!' } }, sirs: { $obj: { temp: 'numx', hr: 'numx', rr: 'numx', paco2: 'numx', wbc: 'numx', bands: 'numx' } }, shock: { $obj: { hr: 'numx!', sbp: 'numx!' } } };
  const EFFECT = { fluid: 'numx', over: 'numx', vaso: 'numx', abx: 'numx', o2: 'numx', stopBleed: 'numx', blood: 'numx' };
  const ACTION = { id: 'id!', kind: 'enum:ask|exam|test|treat|dispose!', at: 'numx!', cost: 'numx', dur: 'numx', turnaround: 'numx', reveals: { $list: 'ref', max: 10 }, effect: { $obj: EFFECT },
    harm: 'numx', essential: 'numx', deadline: 'numx', after: { $list: 'ref', max: 10 }, lowYield: 'bool', key: 'key' };
  const PATIENT = { weight: 'numx', hb: 'numx', shunt: 'numx', lung: 'numx', bleed: 'numx', sepsis: 'numx', growth: 'numx', volume: 'numx' };
  const VP = { tEnd: 'numx', patient: { $obj: PATIENT }, actions: { $req: true, $list: { $obj: ACTION }, min: 1, max: 60 }, noise: 'bool', budget: 'numx',
    weights: { $obj: { essential: 'nonneg', timely: 'nonneg', safety: 'nonneg', efficiency: 'nonneg', order: 'nonneg', calib: 'nonneg' } } };
  const MODEL = { ddx: { $obj: DDX }, threshold: { $obj: THR }, tests: { $obj: TESTS }, tree: { $obj: TREE }, markov: { $obj: MARKOV }, cea: { $obj: CEA }, triage: { $obj: TRIAGE },
    vp: { $obj: VP }, sct: { $obj: { panel: { $req: true, $list: 'nonneg', min: 2, max: 7 }, answer: 'numx!' } }, calib: { $obj: { forecasts: { $req: true, $list: { $obj: { p: 'numx!', o: 'numx!' } }, min: 1, max: 200 } } } };
  const arr = v => (Array.isArray(v) ? v : []);
  const idsOf = l => arr(l).filter(isObj).map(x => x.id).filter(x => typeof x === 'string');
  function dups(list, path, E) { const seen = new Set(); arr(list).forEach((x, i) => { if (isObj(x) && typeof x.id === 'string') { if (seen.has(x.id)) E('id', `${path}[${i}].id`, 'used twice'); seen.add(x.id); } }); }
  function specNames(spec) { const n = []; if (isObj(spec.consts)) n.push(...Object.keys(spec.consts)); for (const p of arr(spec.params)) if (isObj(p) && typeof p.id === 'string') n.push(p.id); return n; }

  /** every output name the model offers: {scalar: [...], series: [...], scene: [...]} (the same lists in Python) */
  function offered(m) {
    const S = [], R = [], N = [];
    if (!isObj(m)) return { scalar: S, series: R, scene: N };
    for (const s of SECTIONS) if (isObj(m[s])) { S.push(s + '.flags'); for (const c of CODES) S.push(`${s}.flag.${c}`); }
    if (isObj(m.ddx)) {
      const d = m.ddx, hs = idsOf(d.hypotheses).concat(d.other === true ? ['other'] : []);
      for (const h of hs) { for (const k of ['post', 'prior', 'lo', 'hi', 'over']) S.push(`ddx.${k}.${h}`); R.push('ddx.traj.' + h); }
      S.push('ddx.top', 'ddx.topP', 'ddx.entropy', 'ddx.known', 'ddx.best');
      for (const f of idsOf(d.findings)) S.push('ddx.gain.' + f);
      if (arr(d.estimates).length) S.push('ddx.estErr', 'ddx.updateRatio', 'ddx.brier');
      R.push('ddx.step'); N.push('ddx');
    }
    if (isObj(m.threshold)) { for (const k of ['treat', 'test', 'testTreat', 'zone', 'evNone', 'evTest', 'evTreat']) S.push('threshold.' + k); N.push('threshold'); }
    if (isObj(m.tests)) for (const k of ['serialSe', 'serialSp', 'parallelSe', 'parallelSp', 'serialCost', 'parallelCost', 'serialPpv', 'serialNpv', 'parallelPpv', 'parallelNpv']) S.push('tests.' + k);
    if (isObj(m.tree)) {
      const t = m.tree, nodes = arr(t.nodes).filter(isObj);
      S.push('tree.ev'); for (const nd of nodes) if (typeof nd.id === 'string') { S.push('tree.ev.' + nd.id); if (nd.type === 'decision') S.push('tree.choice.' + nd.id, 'tree.regret.' + nd.id); }
      if (isObj(t.sweep)) { S.push('tree.threshold'); R.push('tree.sweep'); const r = nodes.find(nd => nd.id === t.root); if (r) for (const c of arr(r.children)) if (isObj(c) && typeof c.to === 'string') R.push('tree.line.' + c.to); }
      N.push('tree');
    }
    if (isObj(m.markov)) { S.push('markov.le', 'markov.qaly', 'markov.cost'); R.push('markov.cycle'); for (const s of idsOf(m.markov.states)) { S.push('markov.occ.' + s); R.push('markov.trace.' + s); } }
    if (isObj(m.cea)) { S.push('cea.best'); for (const s of idsOf(m.cea.strategies)) S.push('cea.icer.' + s, 'cea.nmb.' + s, 'cea.dominated.' + s); N.push('cea'); }
    if (isObj(m.triage)) { const t = m.triage; if (isObj(t.esi)) S.push('triage.esi', 'triage.dangerZone'); if (isObj(t.news2)) S.push('triage.news2', 'triage.news2band'); if (isObj(t.qsofa)) S.push('triage.qsofa'); if (isObj(t.sirs)) S.push('triage.sirs'); if (isObj(t.shock)) S.push('triage.shock'); }
    if (isObj(m.vp)) {
      R.push('vp.t'); for (const v of VARS) { R.push('vp.' + v); S.push('vp.final.' + v); }
      S.push('vp.min.map', 'vp.max.lactate', 'vp.timeHypo', 'vp.outcome', 'vp.diedAt', 'vp.cost', 'vp.busy');
      for (const a of idsOf(m.vp.actions)) S.push('vp.done.' + a, 'vp.resultAt.' + a);
      for (const g of GRADE) S.push('grade.' + g);
      N.push('vp');
    }
    if (isObj(m.sct)) S.push('sct.credit');
    if (isObj(m.calib)) S.push('calib.brier', 'calib.log', 'calib.n');
    return { scalar: S, series: R, scene: N };
  }

  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    C.walk(m, MODEL, 'model', E, W);
    if (isObj(m)) {
      if (!SECTIONS.some(s => m[s] !== undefined)) E('model', 'model', 'needs at least one of ' + SECTIONS.join(', '));
      const d = m.ddx;
      if (isObj(d)) {
        dups(d.hypotheses, 'model.ddx.hypotheses', E); dups(d.findings, 'model.ddx.findings', E); dups(d.groups, 'model.ddx.groups', E);
        const hs = idsOf(d.hypotheses), hsx = hs.concat(d.other === true ? ['other'] : []), fs = idsOf(d.findings), gs = idsOf(d.groups);
        let lrUsed = false;
        arr(d.findings).forEach((f, i) => {
          const p = `model.ddx.findings[${i}]`; if (!isObj(f)) return;
          if ((f.lik === undefined) === (f.lr === undefined)) E('model', p, 'needs lik or lr (one of them)');
          if (isObj(f.lik)) for (const k of Object.keys(f.lik)) if (!hsx.includes(k)) E('ref', `${p}.lik.${k}`, 'names no hypothesis');
          if (f.lr !== undefined) { lrUsed = true; if (typeof f.target !== 'string') E('value', p + '.target', 'missing (the hypothesis lr is about)'); }
          if (typeof f.target === 'string' && !hs.includes(f.target)) E('ref', p + '.target', 'names no hypothesis');
          if (typeof f.group === 'string' && !gs.includes(f.group)) E('ref', p + '.group', 'names no group');
        });
        if (lrUsed && hsx.length > 2) W('approx', 'model.ddx.findings', 'lr with more than two hypotheses: one-versus-rest approximation (give lik for every hypothesis)');
        arr(d.estimates).forEach((e, i) => {
          if (!isObj(e)) return;
          if (typeof e.hyp === 'string' && !hsx.includes(e.hyp)) E('ref', `model.ddx.estimates[${i}].hyp`, 'names no hypothesis');
          if (typeof e.after === 'string' && !fs.includes(e.after)) E('ref', `model.ddx.estimates[${i}].after`, 'names no finding');
        });
        if (typeof d.truth === 'string' && !hsx.includes(d.truth)) E('ref', 'model.ddx.truth', 'names no hypothesis');
      }
      const t = m.tree;
      if (isObj(t) && Array.isArray(t.nodes)) {
        dups(t.nodes, 'model.tree.nodes', E);
        const ns = idsOf(t.nodes), byId = {}; arr(t.nodes).forEach(nd => { if (isObj(nd) && typeof nd.id === 'string' && !byId[nd.id]) byId[nd.id] = nd; });
        if (typeof t.root === 'string' && !ns.includes(t.root)) E('ref', 'model.tree.root', 'names no node');
        const parents = {};
        arr(t.nodes).forEach((nd, i) => {
          const p = `model.tree.nodes[${i}]`; if (!isObj(nd)) return;
          const ch = arr(nd.children);
          if (nd.type === 'terminal') { if (nd.u === undefined) E('value', p + '.u', 'missing (a terminal node needs u)'); if (ch.length) E('model', p + '.children', 'a terminal node has no children'); }
          else if ((nd.type === 'decision' || nd.type === 'chance') && !ch.length) E('model', p + '.children', 'needs at least one branch');
          ch.forEach((c, j) => {
            if (!isObj(c)) return;
            if (typeof c.to === 'string') { if (!ns.includes(c.to)) E('ref', `${p}.children[${j}].to`, 'names no node'); else (parents[c.to] = parents[c.to] || []).push(nd.id); }
            if (nd.type === 'chance' && c.p === undefined) E('value', `${p}.children[${j}].p`, 'missing (a chance branch needs p)');
          });
        });
        const multi = Object.keys(parents).some(k => parents[k].length > 1) || (typeof t.root === 'string' && parents[t.root]);
        let loop = false;
        if (!multi && typeof t.root === 'string' && byId[t.root]) {
          const seen = new Set(), stack = [t.root];
          while (stack.length) { const id = stack.pop(); if (seen.has(id)) { loop = true; break; } seen.add(id); const nd = byId[id]; if (nd) for (const c of arr(nd.children)) if (isObj(c) && byId[c.to]) stack.push(c.to); }
          if (!loop) ns.forEach((id, i) => { if (!seen.has(id)) W('unused', `model.tree.nodes[${i}]`, 'not reachable from the root'); });
        }
        if (multi || loop) E('model', 'model.tree.nodes', 'is not a tree (a node has two parents, or the branches loop back)');
        if (isObj(t.sweep) && typeof t.sweep.name === 'string' && !specNames(spec).includes(t.sweep.name)) E('ref', 'model.tree.sweep.name', 'names no const or param of the spec');
        if (isObj(t.sweep) && C.isNum(t.sweep.min) && C.isNum(t.sweep.max) && !(t.sweep.min < t.sweep.max)) E('value', 'model.tree.sweep', 'min must be below max');
      }
      const mk = m.markov;
      if (isObj(mk) && Array.isArray(mk.states)) {
        dups(mk.states, 'model.markov.states', E);
        const n = mk.states.length;
        if (Array.isArray(mk.P)) { if (mk.P.length !== n) E('size', 'model.markov.P', `needs ${n} rows (one per state)`); mk.P.forEach((r, i) => { if (Array.isArray(r) && r.length !== n) E('size', `model.markov.P[${i}]`, `needs ${n} values`); }); }
        if (Array.isArray(mk.start) && mk.start.length !== n) E('size', 'model.markov.start', `needs ${n} values`);
      }
      if (isObj(m.cea)) dups(m.cea.strategies, 'model.cea.strategies', E);
      const v = m.vp;
      if (isObj(v)) {
        dups(v.actions, 'model.vp.actions', E);
        const as = idsOf(v.actions), fs = isObj(d) ? idsOf(d.findings) : [];
        arr(v.actions).forEach((a, i) => {
          if (!isObj(a)) return;
          arr(a.reveals).forEach((r, j) => { if (typeof r === 'string' && !fs.includes(r)) E('ref', `model.vp.actions[${i}].reveals[${j}]`, 'names no finding of model.ddx'); });
          arr(a.after).forEach((r, j) => { if (typeof r === 'string' && !as.includes(r)) E('ref', `model.vp.actions[${i}].after[${j}]`, 'names no action'); });
        });
      }
      if (isObj(d)) arr(d.hypotheses).forEach((h, i) => { if (isObj(h)) arr(h.treatedBy).forEach((r, j) => { if (typeof r === 'string' && !(isObj(v) && idsOf(v.actions).includes(r))) E('ref', `model.ddx.hypotheses[${i}].treatedBy[${j}]`, 'names no action of model.vp'); }); });
    }
    const off = offered(m);
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at, E2, W2) => {
      for (const k of Object.keys(o)) if (!['id', 'kind', 'of'].includes(k)) W2('unknown-field', `${at}.${k}`, 'ignored');
      if (!off[o.kind].includes(o.of)) E2('output', at + '.of', `${o.of} is not a ${o.kind} of this model (docs/library/clinic.md)`);
    }, E, W);
    return P;
  }
  /* every expression of the model: the strings that are not ids, references or keys (walked in the model's own order) */
  const REFKEYS = ['id', 'type', 'root', 'to', 'target', 'group', 'key', 'kind', 'after', 'reveals', 'hyp', 'name', 'truth', 'treatedBy'];
  function walkStrings(v, path, keyName, out, wantKeys) {
    if (typeof v === 'string') {
      if (wantKeys) { if (keyName === 'key') out.push([v, path]); }
      else if (!REFKEYS.includes(keyName)) out.push([v, path, []]);
    } else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, `${path}[${i}]`, keyName, out, wantKeys));
    else if (isObj(v)) for (const k of Object.keys(v)) walkStrings(v[k], `${path}.${k}`, k, out, wantKeys);
  }
  function exprs(spec) { const out = []; if (isObj(spec) && isObj(spec.model)) for (const s of SECTIONS) if (spec.model[s] !== undefined) walkStrings(spec.model[s], 'model.' + s, s, out, false); return out; }
  function keys(spec) { const out = []; if (isObj(spec) && isObj(spec.model)) for (const s of SECTIONS) if (spec.model[s] !== undefined) walkStrings(spec.model[s], 'model.' + s, s, out, true); return out; }

  /* ---------- helpers ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const logit = p => Math.log(p / (1 - p));
  const H2 = ps => { let h = 0; for (const p of ps) if (p > 0) h -= p * Math.log2(p); return h; };
  function prep(spec) {   // every numx of the model compiled once: a map path → (env) → number
    const F = {}; for (const [src, path] of exprs(spec)) F[path] = C.cx(src); return F;
  }
  function numAt(F, path, raw, env, dflt) {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'boolean') return +raw;
    if (typeof raw === 'string' && F[path]) { const v = F[path](env); return typeof v === 'boolean' ? +v : v; }
    return dflt === undefined ? NaN : dflt;
  }

  /* ---------- ddx: sequential Bayes over exclusive hypotheses (Sox et al., Medical Decision Making 3e, ch. 3–4) ---------- */
  function ddxSetup(d, F, env, code) {
    const hyps = arr(d.hypotheses).map((h, i) => ({ id: h.id, prior: Math.max(0, numAt(F, `model.ddx.hypotheses[${i}].prior`, h.prior, env)), mnm: !!h.mustNotMiss, act: numAt(F, `model.ddx.hypotheses[${i}].act`, h.act, env, NaN), by: arr(h.treatedBy) }));
    let sum = hyps.reduce((a, h) => a + (fin(h.prior) ? h.prior : 0), 0);
    if (hyps.some(h => !fin(h.prior))) code('incomplete');
    if (d.other === true) { hyps.push({ id: 'other', prior: Math.max(0, 1 - sum), mnm: false, act: NaN }); if (sum > 1 + 1e-9) code('normalised'); sum = hyps.reduce((a, h) => a + (fin(h.prior) ? h.prior : 0), 0); }
    if (!(sum > 0)) { code('impossible'); return null; }
    if (Math.abs(sum - 1) > 1e-6) code('normalised');
    hyps.forEach(h => { h.prior = (fin(h.prior) ? h.prior : 0) / sum; });
    const groups = {}; arr(d.groups).forEach((g, i) => { groups[g.id] = clamp(numAt(F, `model.ddx.groups[${i}].rho`, g.rho, env, 0), 0, 1); });
    const lo = d.allowCertain === true ? 0 : 1e-6, hi = d.allowCertain === true ? 1 : 1 - 1e-6;
    const finds = arr(d.findings).map((f, i) => {
      const p = `model.ddx.findings[${i}]`, lik = {};
      if (isObj(f.lik)) { for (const h of hyps) if (f.lik[h.id] !== undefined) lik[h.id] = numAt(F, `${p}.lik.${h.id}`, f.lik[h.id], env); }
      else if (isObj(f.lr)) {   // LR+ / LR− against the target → Se, Sp (one-versus-rest)
        const lp = numAt(F, `${p}.lr.pos`, f.lr.pos, env), ln = numAt(F, `${p}.lr.neg`, f.lr.neg, env);
        if (!(lp > 1 && ln < 1 && ln >= 0)) code('impossible');
        const sp = (lp - 1) / (lp - ln), se = lp * (1 - sp);
        for (const h of hyps) lik[h.id] = h.id === f.target ? se : 1 - sp;
        if (hyps.length > 2) code('approx');
      }
      const listed = hyps.filter(h => h.id !== 'other' && fin(lik[h.id]));   // "other" without its own likelihood: the prior-weighted mean of the listed ones
      if (!fin(lik.other) && hyps.some(h => h.id === 'other')) { const w = listed.reduce((a, h) => a + h.prior, 0); lik.other = w > 0 ? listed.reduce((a, h) => a + h.prior * lik[h.id], 0) / w : 0.5; }
      for (const h of hyps) { let v = lik[h.id]; if (!fin(v)) { v = 0.5; code('incomplete'); } if (v < 0 || v > 1) code('impossible'); if (v < lo || v > hi) code('certain'); lik[h.id] = clamp(v, lo, hi); }
      const pr = numAt(F, `${p}.present`, f.present, env, NaN);
      return { id: f.id, lik, group: typeof f.group === 'string' ? f.group : null, status: pr === 1 ? 1 : pr === 0 ? 0 : -1, time: 0, idx: i };
    });
    return { hyps, finds, groups };
  }
  /** posterior given the known findings `known` (list of finding records with status 0/1), dependence ρ per group (or forced) */
  function posterior(S, known, rhoForce) {
    const cnt = {}; for (const f of known) if (f.group) cnt[f.group] = (cnt[f.group] || 0) + 1;
    const lp = S.hyps.map(h => Math.log(h.prior > 0 ? h.prior : 1e-300));
    for (const f of known) {
      const rho = f.group ? (rhoForce == null ? S.groups[f.group] || 0 : rhoForce) : 0, w = f.group ? 1 / (1 + rho * (cnt[f.group] - 1)) : 1;
      S.hyps.forEach((h, j) => { const l = f.lik[h.id]; lp[j] += w * Math.log(f.status === 1 ? l : 1 - l); });
    }
    const mx = Math.max(...lp), e = lp.map(v => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / s);
  }
  function gainOf(S, post, f, known) {   // expected entropy reduction (bits) of asking finding f now
    const cnt = known.filter(k => k.group && k.group === f.group).length, rho = f.group ? S.groups[f.group] || 0 : 0, w = f.group ? 1 / (1 + rho * cnt) : 1;
    const pp = S.hyps.map((h, j) => post[j] * Math.pow(f.lik[h.id], w)), pn = S.hyps.map((h, j) => post[j] * Math.pow(1 - f.lik[h.id], w));
    const a = pp.reduce((x, y) => x + y, 0), b = pn.reduce((x, y) => x + y, 0), z = a + b;
    if (!(z > 0)) return 0;
    return Math.max(0, H2(post) - (a / z) * H2(pp.map(v => v / a)) - (b / z) * H2(pn.map(v => v / b)));
  }
  function runDdx(m, F, env, out, codes, vpInfo) {
    const code = c => codes.ddx.add(c);
    const d = m.ddx, S = ddxSetup(d, F, env, code);
    if (!S) return null;
    if (vpInfo) for (const f of S.finds) if (vpInfo.revealAt[f.id] !== undefined) { const t = vpInfo.revealAt[f.id]; if (!(t <= vpInfo.seenUntil)) f.status = -1; f.time = t; }
    const known = S.finds.filter(f => f.status !== -1).sort((a, b) => a.time - b.time || a.idx - b.idx);
    const traj = [posterior(S, [])]; for (let k = 1; k <= known.length; k++) traj.push(posterior(S, known.slice(0, k)));
    const post = traj[traj.length - 1], ind = posterior(S, known, 0), dep = posterior(S, known, 1);
    S.hyps.forEach((h, j) => {
      out[`ddx.post.${h.id}`] = post[j]; out[`ddx.prior.${h.id}`] = h.prior; out[`ddx.lo.${h.id}`] = Math.min(ind[j], dep[j], post[j]); out[`ddx.hi.${h.id}`] = Math.max(ind[j], dep[j], post[j]);
      out[`ddx.over.${h.id}`] = fin(h.act) ? (post[j] >= h.act ? 1 : 0) : NaN;
      out[`ddx.traj.${h.id}`] = traj.map(p => p[j]);
    });
    let top = 0; post.forEach((p, j) => { if (p > post[top]) top = j; });
    out['ddx.top'] = top + 1; out['ddx.topP'] = post[top]; out['ddx.entropy'] = H2(post); out['ddx.known'] = known.length; out['ddx.step'] = traj.map((_, i) => i);
    let best = 0, bg = 0;
    S.finds.forEach((f, i) => { const g = f.status === -1 ? gainOf(S, post, f, known) : 0; out['ddx.gain.' + f.id] = g; if (g > bg + 1e-12) { bg = g; best = i + 1; } });
    out['ddx.best'] = best;
    if (arr(d.estimates).length) {   // the learner's stated probabilities against Bayes (calibration, conservatism/over-reaction)
      const errs = [], ratios = [], br = [], last = {};
      arr(d.estimates).forEach((e, i) => {
        const p = numAt(F, `model.ddx.estimates[${i}].p`, e.p, env), j = S.hyps.findIndex(h => h.id === e.hyp);
        let k = 0; if (typeof e.after === 'string') { k = known.findIndex(f => f.id === e.after) + 1; if (k === 0) return; }
        const bay = traj[k][j]; if (!fin(p) || j < 0) return;
        errs.push(Math.abs(p - bay));
        if (typeof d.truth === 'string') br.push(Math.pow(p - (e.hyp === d.truth ? 1 : 0), 2));
        const pc = clamp(p, 1e-4, 1 - 1e-4), bc = clamp(bay, 1e-4, 1 - 1e-4);
        if (last[e.hyp]) { const db = logit(bc) - logit(last[e.hyp][1]); if (Math.abs(db) > 0.05) ratios.push((logit(pc) - logit(last[e.hyp][0])) / db); }
        last[e.hyp] = [pc, bc];
      });
      const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
      out['ddx.estErr'] = mean(errs); out['ddx.updateRatio'] = mean(ratios); out['ddx.brier'] = mean(br);
    }
    return { S, post, known, traj, postAt: t => posterior(S, known.filter(f => f.time <= t)) };
  }
  function sceneDdx(out, S) {
    const n = S.hyps.length, sc = C.scene([-0.5, n + 0.5, -0.25, 1.15]);
    sc.seg(-0.2, 0, n + 0.2, 0, { c: 'muted' });
    S.hyps.forEach((h, j) => {
      const p = out[`ddx.post.${h.id}`], x0 = j + 0.15, x1 = j + 0.85;
      sc.poly([x0, 0, x1, 0, x1, p, x0, p], { closed: true, fill: h.mnm ? 'warn' : 'hi', c: 'base' });
      sc.seg(x0, out[`ddx.prior.${h.id}`], x1, out[`ddx.prior.${h.id}`], { c: 'muted', dash: true });
      if (out[`ddx.lo.${h.id}`] < out[`ddx.hi.${h.id}`] - 1e-9) sc.seg(j + 0.5, out[`ddx.lo.${h.id}`], j + 0.5, out[`ddx.hi.${h.id}`], { c: 'info', w: 2 });
      if (fin(h.act)) sc.seg(x0 - 0.05, h.act, x1 + 0.05, h.act, { c: 'bad', dash: true });
      sc.txt(j + 0.5, p + 0.05, { v: p });
      sc.txt(j + 0.5, -0.12, { s: String(h.id).slice(0, 12), c: 'base' });
    });
    return sc.done();
  }

  /* ---------- thresholds (Pauker & Kassirer NEJM 1975;293:229; NEJM 1980;302:1109) ---------- */
  function runThreshold(t, F, env, out, code) {
    const g = (k, dflt) => numAt(F, 'model.threshold.' + k, t[k], env, dflt);
    const B = g('benefit'), H = g('harm'), se = g('se', NaN), sp = g('sp', NaN), Rt = g('testRisk', 0), p = g('p', NaN);
    if (!(B > 0 && H >= 0)) { code('impossible'); return; }
    const treat = H / (H + B); out['threshold.treat'] = treat;
    let zone = fin(p) ? (p < treat ? 0 : 2) : NaN;
    if (fin(se) && fin(sp)) {
      const test = ((1 - sp) * H + Rt) / ((1 - sp) * H + se * B), tt = (sp * H - Rt) / (sp * H + (1 - se) * B);
      out['threshold.test'] = test; out['threshold.testTreat'] = tt;
      if (test >= tt) { code('no-test-zone'); } else if (fin(p)) zone = p < test ? 0 : p <= tt ? 1 : 2;
      if (fin(p)) out['threshold.evTest'] = -p * (1 - se) * B - (1 - p) * (1 - sp) * H - Rt;
    }
    if (fin(p)) { out['threshold.evNone'] = -p * B; out['threshold.evTreat'] = -(1 - p) * H; if (p < 0 || p > 1) code('impossible'); }
    out['threshold.zone'] = zone;
  }
  function sceneThreshold(out, p) {
    const sc = C.scene([-0.05, 1.05, -0.3, 0.3]), a = out['threshold.test'], b = out['threshold.testTreat'], t = out['threshold.treat'];
    const band = (x0, x1, fill) => { if (fin(x0) && fin(x1) && x1 > x0) sc.poly([x0, -0.06, x1, -0.06, x1, 0.06, x0, 0.06], { closed: true, fill, c: 'muted' }); };
    if (fin(a) && fin(b) && a < b) { band(0, a, 'ok'); band(a, b, 'info'); band(b, 1, 'warn'); sc.txt(a, -0.15, { v: a }); sc.txt(b, -0.15, { v: b }); }
    else if (fin(t)) { band(0, t, 'ok'); band(t, 1, 'warn'); }
    if (fin(t)) { sc.seg(t, -0.1, t, 0.1, { c: 'bad', dash: true }); sc.txt(t, 0.15, { v: t, c: 'bad' }); }
    if (fin(p)) { sc.pt(p, 0, { c: 'hi', r: 6 }); sc.txt(p, 0.24, { v: p, c: 'hi' }); }
    return sc.done();
  }

  /* ---------- two tests (Gardner IA et al., Prev Vet Med 2000;45:107) ---------- */
  function runTests(t, F, env, out, code) {
    const g = (k, d) => numAt(F, 'model.tests.' + k, t[k], env, d);
    const se1 = g('se1'), sp1 = g('sp1'), se2 = g('se2'), sp2 = g('sp2'), cse = g('covSe', 0), csp = g('covSp', 0), prev = g('prev', NaN), c1 = g('cost1', 0), c2 = g('cost2', 0);
    if (![se1, sp1, se2, sp2].every(v => v >= 0 && v <= 1)) { code('impossible'); return; }
    const sSe = se1 * se2 + cse, sSp = 1 - (1 - sp1) * (1 - sp2) - csp, pSe = 1 - (1 - se1) * (1 - se2) - cse, pSp = sp1 * sp2 + csp;
    if (![sSe, sSp, pSe, pSp].every(v => v >= -1e-12 && v <= 1 + 1e-12)) code('impossible');
    Object.assign(out, { 'tests.serialSe': sSe, 'tests.serialSp': sSp, 'tests.parallelSe': pSe, 'tests.parallelSp': pSp, 'tests.parallelCost': c1 + c2 });
    if (fin(prev)) {
      const pos1 = prev * se1 + (1 - prev) * (1 - sp1), ppv = (se, sp) => se * prev / (se * prev + (1 - sp) * (1 - prev)), npv = (se, sp) => sp * (1 - prev) / (sp * (1 - prev) + (1 - se) * prev);
      Object.assign(out, { 'tests.serialCost': c1 + pos1 * c2, 'tests.serialPpv': ppv(sSe, sSp), 'tests.serialNpv': npv(sSe, sSp), 'tests.parallelPpv': ppv(pSe, pSp), 'tests.parallelNpv': npv(pSe, pSp) });
    }
  }

  /* ---------- decision trees (Hunink et al., Decision Making in Health and Medicine 2e 2014) ---------- */
  function treeEval(t, F, env, code) {
    const byId = {}; arr(t.nodes).forEach((nd, i) => { byId[nd.id] = { nd, i }; });
    const ev = {}, choice = {}, regret = {};
    const visit = (id, depth) => {
      if (ev[id] !== undefined) return ev[id];
      const e = byId[id]; if (!e || depth > 60) return NaN;
      const nd = e.nd, base = `model.tree.nodes[${e.i}]`;
      let v = NaN;
      if (nd.type === 'terminal') v = numAt(F, base + '.u', nd.u, env);
      else if (nd.type === 'chance') {
        let s = 0, ps = 0; arr(nd.children).forEach((c, j) => { const p = numAt(F, `${base}.children[${j}].p`, c.p, env); if (p < 0 || p > 1) code('impossible'); ps += p; s += p * visit(c.to, depth + 1); });
        if (Math.abs(ps - 1) > 1e-6) { code('impossible'); v = NaN; } else v = s;
      } else {
        const vals = arr(nd.children).map(c => visit(c.to, depth + 1)); let bi = 0; vals.forEach((x, j) => { if (x > vals[bi]) bi = j; });
        v = vals[bi]; choice[id] = vals.every(fin) ? bi + 1 : NaN; const srt = vals.slice().sort((a, b) => b - a); regret[id] = srt.length > 1 ? srt[0] - srt[1] : 0;
      }
      ev[id] = v; return v;
    };
    visit(t.root, 0);
    return { ev, choice, regret };
  }
  function runTree(t, F, env, out, code) {
    const r = treeEval(t, F, env, code);
    out['tree.ev'] = r.ev[t.root];
    for (const nd of arr(t.nodes)) { out['tree.ev.' + nd.id] = fin(r.ev[nd.id]) ? r.ev[nd.id] : NaN; if (nd.type === 'decision') { out['tree.choice.' + nd.id] = r.choice[nd.id]; out['tree.regret.' + nd.id] = r.regret[nd.id]; } }
    if (isObj(t.sweep)) {
      const sw = t.sweep, n = sw.points || 41, xs = Array.from({ length: n }, (_, i) => sw.min + (sw.max - sw.min) * i / (n - 1));
      const rootN = arr(t.nodes).find(nd => nd.id === t.root), kids = rootN ? arr(rootN.children).map(c => c.to) : [];
      const lines = kids.map(() => []), bestAt = [];
      const evAt = x => treeEval(t, F, { ...env, [sw.name]: x }, () => {});
      for (const x of xs) { const e = evAt(x); kids.forEach((k, j) => lines[j].push(e.ev[k])); bestAt.push(e.choice[t.root]); }
      out['tree.sweep'] = xs; kids.forEach((k, j) => { out['tree.line.' + k] = lines[j]; });
      let th = NaN;
      for (let i = 1; i < xs.length && rootN && rootN.type === 'decision'; i++) if (fin(bestAt[i]) && fin(bestAt[i - 1]) && bestAt[i] !== bestAt[i - 1]) {
        const a = kids[bestAt[i - 1] - 1], b = kids[bestAt[i] - 1], f = x => { const e = evAt(x); return e.ev[a] - e.ev[b]; };
        let lo = xs[i - 1], hi = xs[i], flo = f(lo); for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid; }
        th = (lo + hi) / 2; break;
      }
      out['tree.threshold'] = th;
    }
    return r;
  }
  function sceneTree(t, r) {
    const byId = {}; arr(t.nodes).forEach(nd => { byId[nd.id] = nd; });
    const pos = {}; let leaf = 0, maxD = 0;
    const lay = (id, d) => { const nd = byId[id]; if (!nd || pos[id] || d > 60) return; maxD = Math.max(maxD, d); const ch = arr(nd.children).filter(c => byId[c.to]);
      if (!ch.length) { pos[id] = [d, leaf++]; return; } ch.forEach(c => lay(c.to, d + 1)); const ys = ch.map(c => (pos[c.to] || [0, 0])[1]); pos[id] = [d, (Math.min(...ys) + Math.max(...ys)) / 2]; };
    lay(t.root, 0);
    const W = Math.max(1, maxD), Hh = Math.max(1, leaf - 1), X = d => d / W * 10, Y = y => 10 - y / Hh * 10, sc = C.scene([-1, 12, -1, 11]);
    const onPath = new Set(); let cur = t.root; for (let g = 0; g < 61 && byId[cur]; g++) { onPath.add(cur); const nd = byId[cur]; if (nd.type === 'decision' && fin(r.choice[cur])) cur = nd.children[r.choice[cur] - 1].to; else break; }
    for (const nd of arr(t.nodes)) { const p = pos[nd.id]; if (!p) continue; arr(nd.children).forEach(c => { const q = pos[c.to]; if (q) sc.seg(X(p[0]), Y(p[1]), X(q[0]), Y(q[1]), { c: onPath.has(nd.id) && onPath.has(c.to) ? 'hi' : nd.type === 'decision' ? 'muted' : 'base', w: onPath.has(c.to) && onPath.has(nd.id) ? 3 : 1, key: c.key }); }); }
    for (const nd of arr(t.nodes)) { const p = pos[nd.id]; if (!p) continue; const x = X(p[0]), y = Y(p[1]), s = 0.3;
      if (nd.type === 'decision') sc.poly([x - s, y - s, x + s, y - s, x + s, y + s, x - s, y + s], { closed: true, fill: 'info', c: 'base' });
      else if (nd.type === 'chance') sc.circ(x, y, s, { fill: 'ok', c: 'base' });
      else sc.poly([x - s, y, x + s, y + s, x + s, y - s], { closed: true, fill: 'muted', c: 'base' });
      sc.txt(x + 0.5, y + 0.4, { v: r.ev[nd.id] }); if (nd.key) sc.txt(x, y - 0.6, { key: nd.key, c: 'muted' }); }
    return sc.done();
  }

  /* ---------- Markov cohort (Sonnenberg & Beck, Med Decis Making 1993;13:322) ---------- */
  function runMarkov(mk, F, env, out, code) {
    const n = mk.states.length, P = mk.P.map((r, i) => r.map((v, j) => numAt(F, `model.markov.P[${i}][${j}]`, v, env)));
    for (const r of P) { const s = r.reduce((a, b) => a + b, 0); if (r.some(v => !(v >= 0 && v <= 1)) || Math.abs(s - 1) > 1e-6) { code('impossible'); return; } }
    let occ = mk.start.map((v, i) => numAt(F, `model.markov.start[${i}]`, v, env)); const s0 = occ.reduce((a, b) => a + b, 0);
    if (!(s0 > 0)) { code('impossible'); return; } if (Math.abs(s0 - 1) > 1e-6) code('normalised'); occ = occ.map(v => v / s0);
    const u = mk.states.map((s, i) => numAt(F, `model.markov.states[${i}].u`, s.u, env)), cost = mk.states.map((s, i) => numAt(F, `model.markov.states[${i}].cost`, s.cost, env, 0));
    const alive = mk.states.map(s => s.alive !== false), cy = numAt(F, 'model.markov.cycleYears', mk.cycleYears, env, 1), disc = numAt(F, 'model.markov.discount', mk.discount, env, 0), half = mk.halfCycle === true;
    const N = mk.cycles, traces = mk.states.map((_, i) => [occ[i]]); let le = 0, q = 0, c = 0;
    const reward = (o, w) => { let a = 0, qq = 0, cc = 0; for (let i = 0; i < n; i++) { if (alive[i]) a += o[i]; qq += o[i] * u[i]; cc += o[i] * cost[i]; } return [a * w, qq * w, cc * w]; };
    for (let k = 1; k <= N; k++) {
      const nx = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nx[j] += occ[i] * P[i][j];
      const df = 1 / Math.pow(1 + disc, k * cy);   // end-of-cycle discounting
      const [a1, q1, c1] = half ? reward(occ.map((v, i) => (v + nx[i]) / 2), cy) : reward(nx, cy);
      le += a1; q += q1 * df; c += c1 * df; occ = nx; mk.states.forEach((_, i) => traces[i].push(occ[i]));
    }
    out['markov.le'] = le; out['markov.qaly'] = q; out['markov.cost'] = c; out['markov.cycle'] = Array.from({ length: N + 1 }, (_, i) => i);
    mk.states.forEach((s, i) => { out['markov.occ.' + s.id] = occ[i]; out['markov.trace.' + s.id] = traces[i]; });
  }

  /* ---------- cost-effectiveness (Drummond et al., Methods for the Economic Evaluation of Health Care Programmes 4e 2015) ---------- */
  function runCea(ce, F, env, out, code) {
    const st = ce.strategies.map((s, i) => ({ id: s.id, i, cost: numAt(F, `model.cea.strategies[${i}].cost`, s.cost, env), q: numAt(F, `model.cea.strategies[${i}].qaly`, s.qaly, env), dom: 0, icer: NaN }));
    const wtp = numAt(F, 'model.cea.wtp', ce.wtp, env);
    if (st.some(s => !fin(s.cost) || !fin(s.q)) || !fin(wtp)) { code('incomplete'); return null; }
    for (const a of st) for (const b of st) if (a !== b && b.cost <= a.cost && b.q >= a.q && (b.cost < a.cost || b.q > a.q)) a.dom = 1;
    let fr = st.filter(s => !s.dom).sort((a, b) => a.cost - b.cost || b.q - a.q), changed = true;
    while (changed && fr.length > 2) { changed = false; for (let k = 1; k < fr.length - 1; k++) { const i1 = (fr[k].cost - fr[k - 1].cost) / (fr[k].q - fr[k - 1].q), i2 = (fr[k + 1].cost - fr[k].cost) / (fr[k + 1].q - fr[k].q); if (i2 < i1) { fr[k].dom = 2; fr = fr.filter(s => s !== fr[k]); changed = true; break; } } }
    for (let k = 1; k < fr.length; k++) fr[k].icer = (fr[k].cost - fr[k - 1].cost) / (fr[k].q - fr[k - 1].q);
    let best = 0; st.forEach((s, j) => { const nmb = wtp * s.q - s.cost; out['cea.nmb.' + s.id] = nmb; out['cea.icer.' + s.id] = s.icer; out['cea.dominated.' + s.id] = s.dom; if (nmb > wtp * st[best].q - st[best].cost) best = j; });
    out['cea.best'] = best + 1;
    return { st, fr, wtp };
  }
  function sceneCea(r) {
    const xs = r.st.map(s => s.q), ys = r.st.map(s => s.cost), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = v => (x1 > x0 ? (v - x0) / (x1 - x0) : 0.5), Y = v => (y1 > y0 ? (v - y0) / (y1 - y0) : 0.5), sc = C.scene([-0.15, 1.15, -0.15, 1.15]);
    sc.seg(0, 0, 1.08, 0, { c: 'muted', arrow: true }); sc.seg(0, 0, 0, 1.08, { c: 'muted', arrow: true });
    for (let k = 1; k < r.fr.length; k++) sc.seg(X(r.fr[k - 1].q), Y(r.fr[k - 1].cost), X(r.fr[k].q), Y(r.fr[k].cost), { c: 'hi', w: 2 });
    for (const s of r.st) { sc.pt(X(s.q), Y(s.cost), { c: s.dom === 1 ? 'bad' : s.dom === 2 ? 'warn' : 'hi', r: 6 }); sc.txt(X(s.q), Y(s.cost) + 0.06, { s: String(s.id).slice(0, 12) }); }
    const c0 = r.fr[0]; if (c0 && x1 > x0 && y1 > y0) { const slope = r.wtp * (x1 - x0) / (y1 - y0), xe = Math.min(1.1, X(c0.q) + (1.1 - Y(c0.cost)) / Math.max(slope, 1e-9)); sc.seg(X(c0.q), Y(c0.cost), xe, Y(c0.cost) + slope * (xe - X(c0.q)), { c: 'info', dash: true }); }
    return sc.done();
  }

  /* ---------- triage ---------- */
  function runTriage(t, F, env, out, code) {
    const g = (sec, k, d) => numAt(F, `model.triage.${sec}.${k}`, t[sec][k], env, d), Mx = MED();
    if (isObj(t.esi)) {   // Emergency Severity Index (ENA, ESI Implementation Handbook v4 2012 / v5 2023): decision points A–D
      const age = g('esi', 'age', 30), hr = g('esi', 'hr', NaN), rr = g('esi', 'rr', NaN), spo2 = g('esi', 'spo2', NaN), res = g('esi', 'resources', 0);
      // high-risk (danger-zone) vitals by age: ESI Handbook 5th ed. (ENA 2023), Figure 6-1 — < 1 mo 190/60, 1–12 mo 180/55, 1–3 y 140/40,
      // 3–5 y 120/35, 5–12 y 120/30, ≥ 12 y 100/20, SpO2 < 92 % (v4 2012 had < 3 mo 180/50, 3 mo–3 y 160/40, 3–8 y 140/30, > 8 y 100/20)
      const lim = age < 1 / 12 ? [190, 60] : age < 1 ? [180, 55] : age < 3 ? [140, 40] : age < 5 ? [120, 35] : age < 12 ? [120, 30] : [100, 20];
      const dz = (hr > lim[0]) || (rr > lim[1]) || (spo2 < 92) ? 1 : 0;
      let esi;
      if (g('esi', 'lifesaving', 0) === 1) esi = 1;
      else if (g('esi', 'highRisk', 0) === 1 || g('esi', 'confused', 0) === 1 || g('esi', 'pain', 0) >= 7) esi = 2;
      else if (res >= 2) esi = dz ? 2 : 3;
      else esi = res === 1 ? 4 : 5;
      out['triage.esi'] = esi; out['triage.dangerZone'] = dz;
    }
    if (isObj(t.news2)) {
      const x = {}; for (const k of ['rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp', 'scale2']) x[k] = g('news2', k, 0);
      if (!Mx) code('incomplete'); else { const r = Mx.calc.news2(x); out['triage.news2'] = r.score; out['triage.news2band'] = r.band; }
    }
    if (isObj(t.qsofa)) { const x = { rr: g('qsofa', 'rr'), sbp: g('qsofa', 'sbp'), gcs: g('qsofa', 'gcs') }; out['triage.qsofa'] = (x.rr >= 22 ? 1 : 0) + (x.sbp <= 100 ? 1 : 0) + (x.gcs < 15 ? 1 : 0); }
    if (isObj(t.sirs)) { const T = g('sirs', 'temp', 37), hr = g('sirs', 'hr', 70), rr = g('sirs', 'rr', 14), pc = g('sirs', 'paco2', 40), w = g('sirs', 'wbc', 8), bd = g('sirs', 'bands', 0);
      out['triage.sirs'] = (T > 38 || T < 36 ? 1 : 0) + (hr > 90 ? 1 : 0) + (rr > 20 || pc < 32 ? 1 : 0) + (w > 12 || w < 4 || bd > 10 ? 1 : 0); }
    if (isObj(t.shock)) { const hr = g('shock', 'hr'), sbp = g('shock', 'sbp'); if (!(sbp > 0)) code('impossible'); out['triage.shock'] = hr / sbp; }
  }

  /* ---------- the virtual patient: "haemo-lite" (in-house; docs/library/clinic.md §vp) ----------
     Guyton-style: stressed volume → stroke volume (saturating), HR × SV → CO, MAP = CO × SVR; a baroreflex moves HR and SVR toward a
     MAP set point with first-order lags; sepsis lowers SVR (vasoplegia), leaks volume and raises temperature, HR and RR; antibiotics
     stop its growth after an onset delay; fluids/blood add volume (crystalloid 40 % retained); noradrenaline raises SVR; oxygen sets
     FiO2; PaO2 from the shunt equation (med@1's Severinghaus curve); lactate rises when DO2 falls below a critical delivery. */
  const VDEF = { essential: 0.3, timely: 0.25, safety: 0.2, efficiency: 0.1, order: 0.05, calib: 0.1 };
  function runVp(m, F, env, out, codes, seed) {
    const v = m.vp, code = c => codes.vp.add(c), Mx = MED();
    if (!Mx) { code('incomplete'); return null; }
    const sev = Mx.calc.sev, content = Mx.calc.content;
    const tEnd = clamp(Math.round(numAt(F, 'model.vp.tEnd', v.tEnd, env, 240)), 10, 1440);
    const pat = isObj(v.patient) ? v.patient : {}, pg = (k, d) => numAt(F, 'model.vp.patient.' + k, pat[k], env, d);
    const W = clamp(pg('weight', 70), 2, 250), hb0 = clamp(pg('hb', 14), 3, 22), shunt0 = clamp(pg('shunt', 0.05), 0, 0.8), lungK = clamp(pg('lung', 0), 0, 0.6);
    const bleed = Math.max(0, pg('bleed', 0)), B0 = clamp(pg('sepsis', 0), 0, 1), growth = Math.max(0, pg('growth', 0.6)), vol0 = clamp(pg('volume', 1), 0.3, 1.5);
    const acts = arr(v.actions).map((a, i) => {
      const p = `model.vp.actions[${i}]`, e = isObj(a.effect) ? a.effect : {}, eg = (k, d) => numAt(F, `${p}.effect.${k}`, e[k], env, d);
      const at = numAt(F, p + '.at', a.at, env, NaN);
      return { id: a.id, i, kind: a.kind, at, cost: numAt(F, p + '.cost', a.cost, env, 0), dur: numAt(F, p + '.dur', a.dur, env, a.kind === 'ask' || a.kind === 'exam' ? 2 : 5),
        ta: numAt(F, p + '.turnaround', a.turnaround, env, 0), harm: numAt(F, p + '.harm', a.harm, env, 0), ess: numAt(F, p + '.essential', a.essential, env, 0),
        deadline: numAt(F, p + '.deadline', a.deadline, env, NaN), after: arr(a.after), reveals: arr(a.reveals), low: a.lowYield === true,
        fluid: eg('fluid', 0), over: Math.max(1, eg('over', 30)), vaso: eg('vaso', NaN), abx: eg('abx', 0), o2: eg('o2', NaN), stop: eg('stopBleed', 0), blood: eg('blood', 0) };
    });
    const disp = acts.filter(a => a.kind === 'dispose' && fin(a.at) && a.at >= 0 && a.at <= tEnd).map(a => a.at), tDisp = disp.length ? Math.min(...disp) : Infinity;
    for (const a of acts) a.done = fin(a.at) && a.at >= 0 && a.at <= tEnd && (a.kind === 'dispose' || a.at <= tDisp);
    // the physiology, minute by minute (internal step 0.1 min)
    const Vn = 70 * W, Vu = 0.7 * Vn, SVn = W, HRn = 72, SVRn = 90 / (SVn * HRn / 1000), Cart = 1.4 * W / 70, crit = 4.5 * W;
    let V = Vn * vol0, RBC = hb0 * V, B = B0, Lac = 1, HR = HRn, sv = 1, bleeding = bleed > 0, hypo = 0, crash = 0, died = NaN;
    const rnd = C.mulberry32(C.hash32('vp', seed || 1)), noise = v.noise === true;
    const S = {}; for (const k of ['t', ...VARS]) S[k] = [];
    let minMap = Infinity, maxLac = -Infinity;
    const dt = 0.1;
    const state = t => {
      const fio2 = acts.reduce((f, a) => (a.done && fin(a.o2) && a.at <= t ? Math.max(f, clamp(a.o2, 0.21, 1)) : f), 0.21);
      const vaso = acts.reduce((d, a) => (a.done && fin(a.vaso) && a.at <= t ? a.vaso : d), 0);
      return { fio2, vaso };
    };
    for (let k = 0; k <= tEnd * 10; k++) {
      const t = k * dt, { fio2, vaso } = state(t);
      if (acts.some(a => a.done && a.stop && a.at <= t)) bleeding = false;
      const pf = clamp((V - Vu) / (Vn - Vu), 0, 2.5), SV = SVn * (2 * pf / (1 + pf)) * (1 - Math.max(0, (HR - 150) / 100));
      const vfac = (1 - 0.55 * B) * (1 + 1.2 * vaso / (vaso + 0.15)), SVR = SVRn * sv * vfac, CO = Math.max(0, SV * HR / 1000), MAP = fin(died) ? 0 : CO * SVR;
      const hb = RBC / V, shunt = clamp(shunt0 + lungK * B, 0, 0.95), pA = fio2 * 713 - 40 / 0.8, cc = content(hb, sev(pA), pA), ca = cc - 5 * shunt / (1 - shunt);
      let pao2 = 0; { let lo = 0, hi = pA; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (content(hb, sev(mid), mid) < ca) lo = mid; else hi = mid; } pao2 = (lo + hi) / 2; }
      const sat = sev(pao2), DO2 = CO * content(hb, sat, pao2) * 10, T = 37 + 2.2 * B;
      const RR = clamp(14 + 10 * B + 1.2 * Math.max(0, Lac - 2) + 25 * Math.max(0, 0.92 - sat), 6, 50);
      if (k % 10 === 0) {   // a minute: record (noise only on the shown vitals)
        const nz = s => (noise ? s * C.gauss(rnd) : 0), dead = fin(died);
        const rec = { hr: dead ? 0 : HR + nz(2), map: MAP + (dead ? 0 : nz(2)), spo2: dead ? 0 : clamp(100 * sat + nz(1), 0, 100), rr: dead ? 0 : RR + nz(1), lactate: Lac, temp: T, volume: V, burden: B, pao2, hb };
        const pp = dead ? 0 : SV / Cart; rec.sbp = rec.map + 2 * pp / 3; rec.dbp = rec.map - pp / 3;
        rec.news2 = dead ? NaN : Mx.calc.news2({ rr: rec.rr, spo2: rec.spo2, o2: fio2 > 0.21 ? 1 : 0, sbp: rec.sbp, hr: rec.hr, cvpu: MAP < 60 || sat < 0.85 ? 1 : 0, temp: T, scale2: 0 }).score;
        S.t.push(t); for (const kk of VARS) S[kk].push(rec[kk]);
        if (!dead) { minMap = Math.min(minMap, MAP); maxLac = Math.max(maxLac, Lac); if (MAP < 65) hypo++; }
      }
      if (fin(died)) continue;
      // derivatives
      let dV = 0, dR = 0;
      if (bleeding) { dV -= bleed; dR -= bleed * hb; }
      dV -= 0.004 * B * (V - Vu);   // capillary leak in sepsis
      for (const a of acts) if (a.done && t >= a.at && t < a.at + a.over) { if (a.fluid) dV += 0.4 * a.fluid / a.over; if (a.blood) { dV += a.blood / a.over; dR += a.blood / a.over * 20; } }
      const abxOn = acts.some(a => a.done && a.abx && t >= a.at + 60);
      const dB = abxOn ? -0.5 * B / 60 : growth * B * (1 - B) / 60;
      const e = (90 - MAP) / 90, HRt = clamp(HRn * (1 + 1.2 * e) + 35 * B, 40, 180), svt = clamp(1 + 1.0 * e, 0.6, 1.8);
      const prod = 0.08 * Math.max(0, 1 - DO2 / (1.4 * crit)) + 0.03 * B + 0.03 * Math.max(0, (65 - MAP) / 65), dL = prod - 0.012 * (Lac - 1);   // hypoperfusion, sepsis (aerobic glycolysis), clearance τ ≈ 80 min
      V = Math.max(0.3 * Vn, V + dt * dV); RBC = Math.max(0, RBC + dt * dR); B = clamp(B + dt * dB, 0, 1); Lac = Math.max(0.3, Lac + dt * dL);
      HR += dt * (HRt - HR) / 1; sv += dt * (svt - sv) / 2;
      if (MAP < 45) crash += dt; if (crash >= 20 || Lac >= 15) died = t;
    }
    const last = i => S[i][S[i].length - 1];
    out['vp.t'] = S.t; for (const k of VARS) { out['vp.' + k] = S[k]; out['vp.final.' + k] = last(k); }
    out['vp.min.map'] = minMap; out['vp.max.lactate'] = maxLac; out['vp.timeHypo'] = hypo; out['vp.diedAt'] = died;
    const outcome = fin(died) ? 2 : (last('map') >= 65 && last('lactate') < 2 && last('spo2') >= 92 ? 0 : 1); out['vp.outcome'] = outcome;
    out['vp.cost'] = acts.reduce((s, a) => s + (a.done ? a.cost : 0), 0); out['vp.busy'] = acts.reduce((s, a) => s + (a.done ? a.dur : 0), 0);
    const revealAt = {}; for (const a of acts) { for (const f of a.reveals) { const rt = a.done ? a.at + a.ta : Infinity; if (revealAt[f] === undefined || rt < revealAt[f]) revealAt[f] = rt; } out['vp.done.' + a.id] = a.done ? 1 : 0; out['vp.resultAt.' + a.id] = a.done ? a.at + a.ta : NaN; }
    if (fin(died) || minMap < 50) code('unsafe');
    return { acts, outcome, revealAt, seenUntil: Math.min(tDisp, tEnd), tDisp, tEnd, S };
  }
  function gradeVp(m, F, env, out, vr, dd) {
    const acts = vr.acts, wv = isObj(m.vp.weights) ? m.vp.weights : {}, w = {}; for (const k of Object.keys(VDEF)) w[k] = C.isNum(wv[k]) ? wv[k] : VDEF[k];
    const essT = acts.reduce((s, a) => s + Math.max(0, a.ess), 0), essD = acts.reduce((s, a) => s + (a.done ? Math.max(0, a.ess) : 0), 0);
    const dl = acts.filter(a => fin(a.deadline)), onTime = dl.filter(a => a.done && a.at <= a.deadline).length, missed = dl.length - onTime;
    const harmSum = acts.reduce((s, a) => s + (a.done ? Math.max(0, a.harm) : 0), 0), harmful = acts.filter(a => a.done && a.harm >= 0.5).length;
    const con = acts.filter(a => a.done && a.after.length), viol = con.filter(a => a.after.some(id => { const b = acts.find(x => x.id === id); return !b || !b.done || !(b.at < a.at); })).length;
    const low = acts.filter(a => a.done && a.low).length, budget = numAt(F, 'model.vp.budget', m.vp.budget, env, NaN);
    const g = {};
    g.essential = essT > 0 ? essD / essT : 1; g.timely = dl.length ? onTime / dl.length : 1; g.safety = Math.max(0, 1 - harmSum); g.order = con.length ? 1 - viol / con.length : 1;
    g.efficiency = clamp(1 - 0.15 * low - (fin(budget) && budget > 0 ? Math.max(0, out['vp.cost'] / budget - 1) : 0), 0, 1); g.lowYield = low;
    g.calib = dd && fin(out['ddx.estErr']) ? clamp(1 - out['ddx.estErr'], 0, 1) : NaN;
    g.critical = missed + harmful;
    // information efficiency of the tests chosen (confirmation bias: a test with little expected information), premature closure
    g.infoEff = NaN; g.closure = 0;
    if (dd) {
      const S = dd.S, tests = acts.filter(a => a.done && a.kind === 'test' && a.reveals.length).sort((a, b) => a.at - b.at), ratios = [];
      for (const a of tests) {
        const known = dd.known.filter(f => f.time <= a.at), post = dd.postAt(a.at), unk = id => !known.some(f => f.id === id);
        const gainA = x => x.reveals.filter(unk).reduce((s, id) => { const f = S.finds.find(y => y.id === id); return s + (f ? gainOf(S, post, f, known) : 0); }, 0);
        const avail = acts.filter(x => x.kind === 'test' && x.reveals.length && !(x.done && x.at < a.at));
        const mx = Math.max(0, ...avail.map(gainA)); if (mx > 1e-9) ratios.push(gainA(a) / mx);
      }
      if (ratios.length) g.infoEff = ratios.reduce((x, y) => x + y, 0) / ratios.length;
      const pt = dd.postAt(Math.min(vr.tDisp, vr.tEnd));
      const tc = Math.min(vr.tDisp, vr.tEnd);   // premature closure: a must-not-miss diagnosis still above its action threshold at disposition, neither ruled out nor acted on
      S.hyps.forEach((h, j) => { if (h.mnm && pt[j] >= (fin(h.act) ? h.act : 0.02) && !h.by.some(id => acts.some(a => a.id === id && a.done && a.at <= tc))) g.closure++; });
    }
    let sw = 0, s = 0; for (const k of Object.keys(VDEF)) if (fin(g[k]) && w[k] > 0) { s += w[k] * g[k]; sw += w[k]; }
    g.process = sw > 0 ? s / sw : NaN; g.total = g.critical > 0 || g.closure > 0 ? Math.min(g.process, 0.5) : g.process;
    g.outcome = vr.outcome === 0 ? 1 : vr.outcome === 1 ? 0.5 : 0;
    for (const k of GRADE) out['grade.' + k] = g[k];
  }
  function sceneVp(m, out, vr) {
    const tEnd = vr.tEnd, sc = C.scene([-0.08 * tEnd, 1.05 * tEnd, -0.35 * tEnd, 0.75 * tEnd]), Y = mp => (clamp(mp, 0, 150) / 150) * 0.6 * tEnd;
    sc.seg(0, 0, tEnd, 0, { c: 'muted', arrow: true }); sc.seg(0, Y(65), tEnd, Y(65), { c: 'bad', dash: true });
    const t = out['vp.t'], mp = out['vp.map'], pts = []; const step = Math.max(1, Math.floor(t.length / 400)); for (let i = 0; i < t.length; i += step) pts.push(t[i], Y(mp[i]));
    sc.poly(pts, { c: 'hi', closed: false });
    vr.acts.forEach((a, i) => { if (!a.done) return; const y = -0.06 * tEnd - (i % 4) * 0.06 * tEnd, role = a.harm >= 0.5 ? 'bad' : fin(a.deadline) && a.at > a.deadline ? 'warn' : a.ess > 0 ? 'ok' : a.low ? 'muted' : 'info';
      sc.pt(a.at, y, { c: role, r: 5, key: arr(m.vp.actions)[i].key }); if (a.ta > 0) sc.seg(a.at, y, a.at + a.ta, y, { c: role, dash: true }); });
    if (fin(vr.tDisp)) sc.seg(vr.tDisp, -0.3 * tEnd, vr.tDisp, 0.7 * tEnd, { c: 'warn', dash: true });
    return sc.done();
  }

  /* ---------- run ---------- */
  function run(spec, env, opt) {
    const m = spec.model, F = (opt && opt.prepared) || prep(spec), out = {}, codes = {}, seed = (opt && opt.seed) || 1;
    for (const s of SECTIONS) codes[s] = new Set();
    const guard = (s, f) => { try { f(); } catch (e) { codes[s].add('impossible'); } };
    let vr = null, dd = null, tr = null, ce = null;
    if (isObj(m.vp)) guard('vp', () => { vr = runVp(m, F, env, out, codes, seed); });
    if (isObj(m.ddx)) guard('ddx', () => { dd = runDdx(m, F, env, out, codes, vr); });
    if (vr) guard('vp', () => gradeVp(m, F, env, out, vr, dd));
    if (isObj(m.threshold)) guard('threshold', () => runThreshold(m.threshold, F, env, out, c => codes.threshold.add(c)));
    if (isObj(m.tests)) guard('tests', () => runTests(m.tests, F, env, out, c => codes.tests.add(c)));
    if (isObj(m.tree)) guard('tree', () => { tr = runTree(m.tree, F, env, out, c => codes.tree.add(c)); });
    if (isObj(m.markov)) guard('markov', () => runMarkov(m.markov, F, env, out, c => codes.markov.add(c)));
    if (isObj(m.cea)) guard('cea', () => { ce = runCea(m.cea, F, env, out, c => codes.cea.add(c)); });
    if (isObj(m.triage)) guard('triage', () => runTriage(m.triage, F, env, out, c => codes.triage.add(c)));
    if (isObj(m.sct)) guard('sct', () => { const pn = m.sct.panel, a = Math.round(numAt(F, 'model.sct.answer', m.sct.answer, env)), mx = Math.max(...pn); out['sct.credit'] = a >= 1 && a <= pn.length && mx > 0 ? pn[a - 1] / mx : NaN; if (!fin(out['sct.credit'])) codes.sct.add('impossible'); });
    if (isObj(m.calib)) guard('calib', () => { let b = 0, l = 0, n = 0; m.calib.forecasts.forEach((f, i) => { const p = numAt(F, `model.calib.forecasts[${i}].p`, f.p, env), o = numAt(F, `model.calib.forecasts[${i}].o`, f.o, env); if (!(p >= 0 && p <= 1) || !(o === 0 || o === 1)) { codes.calib.add('impossible'); return; } b += (p - o) ** 2; l += -Math.log(clamp(o ? p : 1 - p, 1e-6, 1)); n++; }); out['calib.brier'] = n ? b / n : NaN; out['calib.log'] = n ? l / n : NaN; out['calib.n'] = n; });
    for (const s of SECTIONS) if (isObj(m[s])) { out[s + '.flags'] = codes[s].size; for (const c of CODES) out[`${s}.flag.${c}`] = codes[s].has(c) ? 1 : 0; }
    const res = {};
    for (const o of spec.outputs || []) {
      if (o.kind === 'scene') {
        try {
          if (o.of === 'ddx' && dd) res[o.id] = sceneDdx(out, dd.S);
          else if (o.of === 'threshold') res[o.id] = sceneThreshold(out, numAt(F, 'model.threshold.p', m.threshold.p, env, NaN));
          else if (o.of === 'tree' && tr) res[o.id] = sceneTree(m.tree, tr);
          else if (o.of === 'cea' && ce) res[o.id] = sceneCea(ce);
          else if (o.of === 'vp' && vr) res[o.id] = sceneVp(m, out, vr);
        } catch (e) { /* an empty scene */ }
      } else res[o.id] = out[o.of];
    }
    return { out: res, all: out, codes: Object.fromEntries(Object.entries(codes).map(([k, s]) => [k, [...s]])) };
  }
  const prepare = spec => prep(spec);

  /* ---------- the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the virtual patient in a co-simulation ----------
     The same "haemo-lite" physiology as runVp (the same equations, 0.1 min substeps), stepped from a state; at every macro step the
     patient's numbers (bleed, sepsis growth, lung, shunt) and the actions (their times and effects: a vasopressor dose another part
     — a controller, a pharmacokinetic model — computes) are read again from the current inputs. Time: minutes of the co-simulation.
     Outputs per step: vp.<vital> (series: one sample a step; scalar: now), vp.final.<vital>, vp.min.map, vp.max.lactate, vp.timeHypo,
     vp.diedAt, vp.outcome. Other sections are recomputed at each step from the current inputs. Noise is off in a co-simulation. */
  function vpActs(m, F, env) {   // the actions taken (as runVp: at ≥ 0, none after the disposition)
    const all = arr(m.vp.actions).map((a, i) => {
      const p = `model.vp.actions[${i}]`, e = isObj(a.effect) ? a.effect : {}, eg = (k, d) => numAt(F, `${p}.effect.${k}`, e[k], env, d);
      return { kind: a.kind, at: numAt(F, p + '.at', a.at, env, NaN), fluid: eg('fluid', 0), over: Math.max(1, eg('over', 30)), vaso: eg('vaso', NaN), abx: eg('abx', 0), o2: eg('o2', NaN), stop: eg('stopBleed', 0), blood: eg('blood', 0) };
    });
    const disp = all.filter(a => a.kind === 'dispose' && fin(a.at) && a.at >= 0).map(a => a.at), tDisp = disp.length ? Math.min(...disp) : Infinity;
    return all.filter(a => fin(a.at) && a.at >= 0 && (a.kind === 'dispose' || a.at <= tDisp));
  }
  const restCache = new WeakMap();   // the step context → the outputs of the other sections for the latest inputs
  const vpStepper = {
    init(model, env, sc) {
      if (!isObj(model) || !isObj(model.vp) || !MED()) return isObj(model) && !isObj(model.vp) ? { other: true } : null;
      const F = sc.prepared || prep(sc.spec), v = model.vp, pat = isObj(v.patient) ? v.patient : {}, pg = (k, d) => numAt(F, 'model.vp.patient.' + k, pat[k], env, d);
      const W = clamp(pg('weight', 70), 2, 250), hb0 = clamp(pg('hb', 14), 3, 22), vol0 = clamp(pg('volume', 1), 0.3, 1.5), B0 = clamp(pg('sepsis', 0), 0, 1);
      const Vn = 70 * W;
      return { t0: sc.t0 || 0, W, Vn, Vu: 0.7 * Vn, SVn: W, HRn: 72, SVRn: 90 / (W * 72 / 1000), Cart: 1.4 * W / 70, crit: 4.5 * W,
        V: Vn * vol0, RBC: hb0 * Vn * vol0, B: B0, Lac: 1, HR: 72, sv: 1, bleeding: pg('bleed', 0) > 0, crash: 0, died: null, hypo: 0, minMap: null, maxLac: null, last: null, k: 0, kRec: -1 };
    },
    step(st, env, t, dt, sc) {
      if (st.other) { const r = run(sc.spec, env, { seed: sc.seed }); return { state: st, out: r.out, dt }; }
      const m = sc.spec.model, F = sc.prepared || prep(sc.spec), Mx = MED(), sev = Mx.calc.sev, content = Mx.calc.content;
      const pat = isObj(m.vp.patient) ? m.vp.patient : {}, pg = (k, d) => numAt(F, 'model.vp.patient.' + k, pat[k], env, d);
      const shunt0 = clamp(pg('shunt', 0.05), 0, 0.8), lungK = clamp(pg('lung', 0), 0, 0.6), bleed = Math.max(0, pg('bleed', 0)), growth = Math.max(0, pg('growth', 0.6));
      const acts = vpActs(m, F, env), S = C.copyData(st), h = 0.1, rel = tt => tt - S.t0;
      const n = Math.max(1, Math.round(dt / h)), hh = dt / n;
      let rec = S.last;
      for (let j = 0; j <= n; j++) {
        const tt = rel(t) + j * hh, on = a => fin(a.at) && a.at <= tt;
        const fio2 = acts.reduce((f, a) => (fin(a.o2) && on(a) ? Math.max(f, clamp(a.o2, 0.21, 1)) : f), 0.21), vaso = acts.reduce((d, a) => (fin(a.vaso) && on(a) ? a.vaso : d), 0);
        if (acts.some(a => a.stop && on(a))) S.bleeding = false;
        const dead = S.died !== null, pf = clamp((S.V - S.Vu) / (S.Vn - S.Vu), 0, 2.5), SV = S.SVn * (2 * pf / (1 + pf)) * (1 - Math.max(0, (S.HR - 150) / 100));
        const vfac = (1 - 0.55 * S.B) * (1 + 1.2 * vaso / (vaso + 0.15)), SVR = S.SVRn * S.sv * vfac, CO = Math.max(0, SV * S.HR / 1000), MAP = dead ? 0 : CO * SVR;
        const hb = S.RBC / S.V, shunt = clamp(shunt0 + lungK * S.B, 0, 0.95), pA = fio2 * 713 - 40 / 0.8, cc = content(hb, sev(pA), pA), ca = cc - 5 * shunt / (1 - shunt);
        let lo = 0, hi = pA; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (content(hb, sev(mid), mid) < ca) lo = mid; else hi = mid; }
        const pao2 = (lo + hi) / 2, sat = sev(pao2), DO2 = CO * content(hb, sat, pao2) * 10, T = 37 + 2.2 * S.B;
        const RR = clamp(14 + 10 * S.B + 1.2 * Math.max(0, S.Lac - 2) + 25 * Math.max(0, 0.92 - sat), 6, 50);
        if (j === n || j === 0) {
          const pp = dead ? 0 : SV / S.Cart;
          rec = { hr: dead ? 0 : S.HR, map: MAP, spo2: dead ? 0 : clamp(100 * sat, 0, 100), rr: dead ? 0 : RR, lactate: S.Lac, temp: T, volume: S.V, burden: S.B, pao2, hb };
          rec.sbp = rec.map + 2 * pp / 3; rec.dbp = rec.map - pp / 3;
          rec.news2 = dead ? NaN : Mx.calc.news2({ rr: rec.rr, spo2: rec.spo2, o2: fio2 > 0.21 ? 1 : 0, sbp: rec.sbp, hr: rec.hr, cvpu: MAP < 60 || sat < 0.85 ? 1 : 0, temp: T, scale2: 0 }).score;
        }
        if (S.k % 10 === 0 && S.kRec !== S.k && !dead) {   // a minute (as runVp records it)
          S.kRec = S.k; S.minMap = S.minMap === null ? MAP : Math.min(S.minMap, MAP); S.maxLac = S.maxLac === null ? S.Lac : Math.max(S.maxLac, S.Lac); if (MAP < 65) S.hypo++;
        }
        if (j === n || dead) { if (j < n) S.k++; continue; }
        S.k++;
        let dV = 0, dR = 0;
        if (S.bleeding) { dV -= bleed; dR -= bleed * hb; }
        dV -= 0.004 * S.B * (S.V - S.Vu);
        for (const a of acts) if (fin(a.at) && tt >= a.at && tt < a.at + a.over) { if (a.fluid) dV += 0.4 * a.fluid / a.over; if (a.blood) { dV += a.blood / a.over; dR += a.blood / a.over * 20; } }
        const abxOn = acts.some(a => a.abx && fin(a.at) && tt >= a.at + 60), dB = abxOn ? -0.5 * S.B / 60 : growth * S.B * (1 - S.B) / 60;
        const e = (90 - MAP) / 90, HRt = clamp(S.HRn * (1 + 1.2 * e) + 35 * S.B, 40, 180), svt = clamp(1 + 1.0 * e, 0.6, 1.8);
        const prod = 0.08 * Math.max(0, 1 - DO2 / (1.4 * S.crit)) + 0.03 * S.B + 0.03 * Math.max(0, (65 - MAP) / 65), dL = prod - 0.012 * (S.Lac - 1);
        S.V = Math.max(0.3 * S.Vn, S.V + hh * dV); S.RBC = Math.max(0, S.RBC + hh * dR); S.B = clamp(S.B + hh * dB, 0, 1); S.Lac = Math.max(0.3, S.Lac + hh * dL);
        S.HR += hh * (HRt - S.HR); S.sv += hh * (svt - S.sv) / 2;
        if (MAP < 45) S.crash += hh; if (S.crash >= 20 || S.Lac >= 15) S.died = tt + hh;
      }
      S.last = rec;
      const all = { 'vp.min.map': S.minMap === null ? NaN : S.minMap, 'vp.max.lactate': S.maxLac === null ? NaN : S.maxLac, 'vp.timeHypo': S.hypo, 'vp.diedAt': S.died === null ? NaN : S.died,
        'vp.outcome': S.died !== null ? 2 : rec.map >= 65 && rec.lactate < 2 && rec.spo2 >= 92 ? 0 : 1, 'vp.t': rel(t) + dt };
      for (const k of VARS) { all['vp.' + k] = rec[k]; all['vp.final.' + k] = rec[k]; }
      const out = {}; let rest = null;
      for (const o of sc.spec.outputs || []) {
        if (!o || typeof o.id !== 'string' || o.kind === 'scene') continue;
        if (Object.prototype.hasOwnProperty.call(all, o.of)) out[o.id] = all[o.of];
        else {   // the other sections (ddx, grade, cost…): run() on the current inputs, once per inputs
          if (!rest) { const key = JSON.stringify(env), c = restCache.get(sc); if (c && c.key === key) rest = c.out; else { try { rest = run(sc.spec, env, { seed: sc.seed, prepared: F }).out; } catch (e) { rest = {}; } restCache.set(sc, { key, out: rest }); } }
          if (Object.prototype.hasOwnProperty.call(rest, o.id)) out[o.id] = rest[o.id];
        }
      }
      return { state: S, out, dt };
    },
  };

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true, stepper: vpStepper });
  /* the Worker gets med@1 too (its calculators are this engine's physiology): NoemaExpr + the core + med + clinic */
  Object.defineProperty(engine, 'workerSource', { enumerable: true, get() {
    const nx = root.NoemaExpr && typeof root.NoemaExpr.source === 'function' ? root.NoemaExpr.source() : '', medSrc = root.NoemaLibMed && root.NoemaLibMed.moduleSource ? root.NoemaLibMed.moduleSource() : '';
    return nx + '\n;' + C.source() + '\n' + (medSrc ? ';(' + medSrc + ')(self);\n' : '') + ';(' + noemaLibClinicModule.toString() + ')(self);\nself.noemaEngine = self.NoemaLibClinic.simEngine;';
  } });
  /** evaluate(model, inputs) → every computed value (tests, authoring tools) */
  function evaluate(model, inputs, outputs, seed) { const spec = { model, outputs: outputs || [] }; return run(spec, inputs || {}, { seed }); }
  root.NoemaLibClinic = Object.freeze({ id: ID, table: { model: MODEL, outputs: { scalar: [], series: [], scene: [] }, offered }, CODES, SECTIONS, VARS, GRADE, checkSpec, exprs, keys, offered, run, evaluate, engine: Object.freeze(engine), simEngine, posterior, gainOf });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
