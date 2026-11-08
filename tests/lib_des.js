/* des@1 (src/engines/des/des.js, docs/library/des.md) against queueing theory and exact solutions:
   1. the spec check: tests/fixtures/enginelib/des.json (good and bad specs) and the golden outputs of its former Python twin tools/lib_des.py (check_spec, exprs, keys);
   2. analytic values whose CI must hold the theory: M/M/1, M/M/c (Erlang C), M/D/1 and M/G/1 (Pollaczek–Khinchine), M/M/1/K,
      a Jackson network, non-preemptive and preemptive-resume priorities (Cobham 1954; Conway, Maxwell & Miller 1967), M/G/∞,
      Little's law; reneging (M/M/1+M) and balking against their birth–death chains; LIFO = FIFO in the mean; SPT < FIFO;
   3. features: breakdowns (availability), shifts, schedules, time-varying rates, batch arrivals, jockeying, routing by condition;
   4. output analysis: batch means with MSER-5, common random numbers, antithetic pairs;
   5. codes (budget, overflow, bad-dist, route-sum, unstable, theory-na), the engine adapter, the Worker source, the stepper through
      makeEngine (stepInit / stepTo), speed; the reference activity ed-triage (its tests.json cases and string tables).
   Usage: node tests/lib_des.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const want = require('./golden.cjs')('lib_des');   // the golden outputs of the former Python twin (tests/golden.cjs)
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibCore = ENGINES.kernel('core'), NoemaLibDES = ENGINES.mod('des@1');
const D = NoemaLibDES, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const f3 = v => (Number.isFinite(v) ? +v.toFixed(3) : v);

/* a run with, for each named measure, its mean, half-width and theory */
const SPEC = (model, outputs) => ({ format: 'noema.sim-spec/v1', engine: 'des@1', model, outputs });
function est(model, ms, seed, extra) {
  const outs = [];
  for (const [id, o] of Object.entries(ms)) {
    outs.push({ id, kind: 'scalar', ...o }, { id: id + '~h', kind: 'scalar', ...o, est: 'half' });
    if (D.THEORY.includes(o.of)) outs.push({ id: id + '~th', kind: 'scalar', of: 'theory', measure: o.of, ...(o.station ? { station: o.station } : {}), ...(o.class ? { class: o.class } : {}) });
  }
  const r = D.run(SPEC(model, outs.concat(extra || [])), {}, { seed: seed || 1 }), R = {};
  for (const id of Object.keys(ms)) R[id] = { m: r.out[id], h: r.out[id + '~h'], th: r.out[id + '~th'] };
  R._ = r; return R;
}
/* the theory inside mean ± k·half (k = 1.5: the seeds are fixed, so this is a deterministic check with room for a 95 % CI's 5 %) */
const covers = (x, th, k = 1.5) => Number.isFinite(x.m) && Number.isFinite(x.h) && Math.abs(x.m - th) <= k * x.h;
const say = (x, th) => `${f3(x.m)} ± ${f3(x.h)} (theory ${f3(th)})`;
/* stationary distribution of a birth–death chain (states 0..N) */
function bd(birth, death, N) { const p = [1]; for (let k = 1; k <= N; k++) p.push(p[k - 1] * birth(k - 1) / death(k)); const s = p.reduce((a, b) => a + b, 0); return p.map(x => x / s); }

ok(Object.isFrozen(D) && D.id === 'des@1' && typeof D.engine.create === 'function' && D.engine.stepper === true && typeof D.stepper.step === 'function', 'NoemaLibDES: a frozen module, engine des@1 with a stepper');

// ---------- 1. the spec check and the Python twin ----------
{
  const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'des.json'), 'utf8')).specs;
  const js = specs.map(s => { const p = D.checkSpec(s), bad = C.hasErrors(p); return { p, x: bad ? null : D.exprs(s), k: bad ? null : D.keys(s) }; });
  const good = js.filter(r => !r.p.some(q => q.level === 'error')).length;
  ok(specs.length >= 20 && good >= 5 && specs.length - good >= 15, `des.json: ${specs.length} specs, ${good} good and ${specs.length - good} bad`);
  const py = want('check', specs, js);
  const norm = v => JSON.stringify(v);
  let same = 0; js.forEach((r, i) => { if (norm(r) === norm(py[i])) same++; else console.log(`  spec ${i}\n  JS ${norm(r).slice(0, 500)}\n  PY ${norm(py[i]).slice(0, 500)}`); });
  ok(same === specs.length, `the JS gives the golden outputs of the former Python twin on ${same}/${specs.length} specs (checkSpec messages, exprs, keys)`);
  const bad = specs.filter((s, i) => js[i].p.some(q => q.level === 'error'));
  ok(bad.every(s => D.run(s, {}, { seed: 1 }).codes.some(c => c.code === 'model')), 'a bad spec runs to the code model, without throwing');
}

// ---------- 2. analytic values ----------
const exp = (mean) => ({ dist: 'exp', mean });
{ // M/M/1, ρ = 0.8: Wq = ρ/(μ − λ) = 4, Lq = ρ²/(1 − ρ) = 3.2, P(wait) = ρ
  const R = est({ tEnd: 4000, warmup: 400, reps: 10, sources: [{ id: 'a', to: 'q', arrival: { dist: 'exp', rate: 0.8 } }], stations: [{ id: 'q', service: exp(1) }] },
    { wq: { of: 'wq', station: 'q' }, lq: { of: 'lq', station: 'q' }, u: { of: 'util', station: 'q' }, pw: { of: 'pwait', station: 'q' } });
  ok(Math.abs(R.wq.th - 4) < 1e-12 && Math.abs(R.lq.th - 3.2) < 1e-12 && covers(R.wq, 4) && covers(R.lq, 3.2), `M/M/1 ρ 0.8: Wq ${say(R.wq, 4)}, Lq ${say(R.lq, 3.2)}`);
  ok(covers(R.u, 0.8) && covers(R.pw, 0.8), `M/M/1: utilisation ${say(R.u, 0.8)}, P(wait) ${say(R.pw, 0.8)}`);
}
{ // M/M/3, λ 2.4, μ 1: Erlang C(3, 2.4) = 0.6472, Wq = C/(cμ − λ) = 1.0787 (Gross et al. 2008 §2.3)
  const R = est({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'q', arrival: { dist: 'exp', rate: 2.4 } }], stations: [{ id: 'q', servers: 3, service: exp(1) }] },
    { wq: { of: 'wq', station: 'q' }, pw: { of: 'pwait', station: 'q' }, u: { of: 'util', station: 'q' } });
  ok(Math.abs(D.erlangC(3, 2.4) - 0.647191) < 1e-6 && Math.abs(R.wq.th - 1.078652) < 1e-5, `Erlang C(3, 2.4) = ${D.erlangC(3, 2.4).toFixed(6)} (0.647191), Wq theory ${R.wq.th.toFixed(6)}`);
  ok(covers(R.wq, R.wq.th) && covers(R.pw, R.pw.th) && covers(R.u, 0.8), `M/M/3: Wq ${say(R.wq, R.wq.th)}, P(wait) ${say(R.pw, R.pw.th)}, util ${say(R.u, 0.8)}`);
}
{ // M/D/1 ρ 0.7: Wq = ρ/(2μ(1 − ρ)) = 1.1667; M/G/1 uniform(0.2, 1.8), λ 0.8: Wq = λE[S²]/(2(1 − ρ)) = 2.4267
  const R = est({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1 / 0.7) }], stations: [{ id: 'q', service: { dist: 'const', value: 1 } }] }, { wq: { of: 'wq', station: 'q' } });
  ok(Math.abs(R.wq.th - 7 / 6) < 1e-12 && covers(R.wq, 7 / 6), `M/D/1 ρ 0.7 (Pollaczek–Khinchine): Wq ${say(R.wq, 7 / 6)}`);
  const ES2 = (1.8 ** 3 - 0.2 ** 3) / (3 * 1.6), th = 0.8 * ES2 / (2 * 0.2);
  const G = est({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1.25) }], stations: [{ id: 'q', service: { dist: 'uniform', min: 0.2, max: 1.8 } }] }, { wq: { of: 'wq', station: 'q' } });
  ok(Math.abs(G.wq.th - th) < 1e-12 && covers(G.wq, th), `M/G/1 uniform(0.2, 1.8), ρ 0.8: Wq ${say(G.wq, th)}`);
  const E = est({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1.25) }], stations: [{ id: 'q', service: { dist: 'erlang', k: 4, mean: 1 } }] }, { wq: { of: 'wq', station: 'q' } });
  ok(Math.abs(E.wq.th - 0.8 * 1.25 / 0.4) < 1e-12 && covers(E.wq, 2.5), `M/E4/1 ρ 0.8: Wq ${say(E.wq, 2.5)}`);
}
{ // M/M/1/K, K = 5 (room 4), λ 1, μ 1/0.9: the truncated geometric distribution
  const rho = 0.9, K = 5, p = Array.from({ length: K + 1 }, (_, k) => rho ** k), s = p.reduce((a, b) => a + b, 0), P = p.map(x => x / s);
  const L = P.reduce((a, x, k) => a + k * x, 0), lamE = 1 * (1 - P[K]), Wq = L / lamE - 0.9;
  const R = est({ tEnd: 3000, warmup: 100, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', capacity: 4, service: exp(0.9) }] },
    { wq: { of: 'wq', station: 'q' }, l: { of: 'l', station: 'q' }, pa: { of: 'pAbandon', station: 'q' } });
  ok(Math.abs(R.wq.th - Wq) < 1e-9 && covers(R.wq, Wq) && covers(R.l, L) && covers(R.pa, P[K]), `M/M/1/5: Wq ${say(R.wq, Wq)}, L ${say(R.l, L)}, P(lost) ${say(R.pa, P[K])}`);
}
{ // a Jackson network (Jackson 1957): A (2 servers) → B 0.6 / C 0.4; B → A 0.2 / exit; traffic λA = 1/(1 − 0.12) …
  const lA = 1 / (1 - 0.6 * 0.2), lB = 0.6 * lA, lC = 0.4 * lA;
  const a = D.mmc(lA, 1 / 0.8, 2), b = D.mmc(lB, 1 / 0.9, 1), c = D.mmc(lC, 1 / 1.2, 1), W = (a.l + b.l + c.l) / 1;
  const R = est({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'A', arrival: exp(1) }], stations: [
    { id: 'A', servers: 2, service: exp(0.8), route: [{ to: 'B', p: 0.6 }, { to: 'C', p: 0.4 }] },
    { id: 'B', service: exp(0.9), route: [{ to: 'A', p: 0.2 }, { to: 'exit', p: 0.8 }] }, { id: 'C', service: exp(1.2) }] },
  { w: { of: 'w' }, wqA: { of: 'wq', station: 'A' }, wqB: { of: 'wq', station: 'B' }, wqC: { of: 'wq', station: 'C' }, li: { of: 'littleErr' } });
  ok(Math.abs(R.w.th - W) < 1e-9 && covers(R.w, W), `Jackson network: system W ${say(R.w, W)} (traffic equations λA = ${lA.toFixed(4)})`);
  ok(covers(R.wqA, a.wq) && covers(R.wqB, b.wq) && covers(R.wqC, c.wq), `Jackson stations: Wq A ${say(R.wqA, a.wq)}, B ${say(R.wqB, b.wq)}, C ${say(R.wqC, c.wq)}`);
  ok(R.li.m < 0.02 && !R._.codes.some(x => x.code === 'little'), `Little's law L = λW over the run: relative error ${R.li.m.toExponential(2)}`);
}
{ // priorities on one exponential server, λ hi 0.3, lo 0.5, μ 1: non-preemptive Cobham, Wq_k = W0/((1 − σ_{k−1})(1 − σ_k)), W0 = Σλ E[S²]/2 = 0.8
  const m = (pre) => ({ tEnd: 4000, warmup: 300, reps: 10, classes: [{ id: 'hi', prio: 0 }, { id: 'lo', prio: 1 }],
    sources: [{ id: 'a', to: 'q', class: 'hi', arrival: exp(1 / 0.3) }, { id: 'b', to: 'q', class: 'lo', arrival: exp(1 / 0.5) }],
    stations: [{ id: 'q', discipline: 'priority', ...(pre ? { preempt: 'resume' } : {}), service: exp(1) }] });
  const NP = est(m(false), { hi: { of: 'wq', station: 'q', class: 'hi' }, lo: { of: 'wq', station: 'q', class: 'lo' } });
  const tH = 0.8 / (1 * 0.7), tL = 0.8 / (0.7 * 0.2);
  ok(Math.abs(NP.hi.th - tH) < 1e-12 && Math.abs(NP.lo.th - tL) < 1e-12 && covers(NP.hi, tH) && covers(NP.lo, tL), `non-preemptive priority (Cobham): Wq hi ${say(NP.hi, tH)}, lo ${say(NP.lo, tL)}`);
  // preemptive resume: W_k = E[S_k](1 − σ_{k−1})⁻¹ + R_k/((1 − σ_{k−1})(1 − σ_k)), R_k = Σ_{i≤k} λ_i E[S_i²]/2
  const PR = est(m(true), { hi: { of: 'w', station: 'q', class: 'hi' }, lo: { of: 'w', station: 'q', class: 'lo' }, pre: { of: 'preempted', station: 'q' } });
  const wH = 1 + 0.3 / 0.7, wL = 1 / 0.7 + 0.8 / (0.7 * 0.2);
  ok(covers(PR.hi, wH) && covers(PR.lo, wL) && PR.pre.m > 100, `preemptive-resume priority: W hi ${say(PR.hi, wH)} (= M/M/1 of its own), lo ${say(PR.lo, wL)}; ${Math.round(PR.pre.m)} pre-emptions per run`);
  // the conservation law (Kleinrock): Σ ρ_k Wq_k is the same for every work-conserving order: here = ρ·W0/(1 − ρ)
  const cons = 0.3 * NP.hi.m + 0.5 * NP.lo.m, consTh = 0.8 * 0.8 / 0.2;
  ok(Math.abs(cons - consTh) <= 1.5 * (0.3 * NP.hi.h + 0.5 * NP.lo.h), `Kleinrock's conservation law Σρ_k Wq_k = ${f3(cons)} (theory ${f3(consTh)})`);
}
{ // M/G/∞ (lognormal mean 3): L = λE[S] = 6, insensitive to the distribution
  const R = est({ tEnd: 2000, warmup: 100, reps: 10, sources: [{ id: 'a', to: 'd', arrival: exp(0.5) }], stations: [{ id: 'd', kind: 'delay', service: { dist: 'lognormal', mean: 3, sd: 2 } }] },
    { l: { of: 'l', station: 'd' }, w: { of: 'w', station: 'd' } });
  ok(covers(R.l, 6) && covers(R.w, 3) && R.l.th === 6, `M/G/∞ lognormal service: L ${say(R.l, 6)}, W ${say(R.w, 3)}`);
}
{ // reneging, M/M/1+M: λ 1, μ 1, patience exp(mean 5): death rate μ + (n − 1)θ; P(abandon) = θ·Lq/λ
  const th = 0.2, P = bd(() => 1, k => 1 + (k - 1) * th, 200), Lq = P.reduce((a, x, k) => a + Math.max(0, k - 1) * x, 0), pAb = th * Lq;
  const R = est({ tEnd: 3000, warmup: 200, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', service: exp(1), renege: exp(5) }] },
    { pa: { of: 'pAbandon' }, lq: { of: 'lq', station: 'q' } }, 1, [{ id: 'na', kind: 'scalar', of: 'theory', measure: 'wq', station: 'q' }]);
  ok(covers(R.pa, pAb) && covers(R.lq, Lq), `M/M/1+M (reneging, birth–death): P(abandon) ${say(R.pa, pAb)}, Lq ${say(R.lq, Lq)}`);
  ok(Number.isNaN(R._.out.na) && R._.codes.some(c => c.code === 'theory-na'), 'no closed form with reneging: theory NaN and the code theory-na');
  // balking: at 3 or more waiting, half the arrivals go: birth λ for n ≤ 3, λ/2 above
  const Pb = bd(k => (k - 1 >= 3 ? 0.5 : 1) * 0.9, () => 1, 300), pB = Pb.reduce((a, x, k) => a + (k - 1 >= 3 ? 0.5 * x : 0), 0);
  const B = est({ tEnd: 3000, warmup: 200, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1 / 0.9) }], stations: [{ id: 'q', service: exp(1), balk: { length: 3, p: 0.5 } }] }, { pa: { of: 'pAbandon' }, l: { of: 'l', station: 'q' } });
  const Lb = Pb.reduce((a, x, k) => a + k * x, 0);
  ok(covers(B.pa, pB) && covers(B.l, Lb), `balking (birth–death): P(balk) ${say(B.pa, pB)}, L ${say(B.l, Lb)}`);
}
{ // LIFO has the FIFO mean (work-conserving, blind to service times) but a wider spread; SPT lowers the mean wait (Conway et al. 1967)
  const m = disc => ({ tEnd: 4000, warmup: 300, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1.25) }], stations: [{ id: 'q', discipline: disc, service: { dist: 'gamma', mean: 1, cv: 1.5 } }] });
  const sd = disc => { const r = D.run(SPEC(m(disc), [{ id: 'w', kind: 'series', of: 'waits' }, { id: 'q', kind: 'series', of: 'qlen', station: 'q' }]), {}, { seed: 1 }); const w = r.out.w; const mu = w.reduce((a, b) => a + b, 0) / w.length; return Math.sqrt(w.reduce((a, b) => a + (b - mu) ** 2, 0) / w.length); };
  const F = est(m('fifo'), { wq: { of: 'wq', station: 'q' } }), L = est(m('lifo'), { wq: { of: 'wq', station: 'q' } }), S = est(m('spt'), { wq: { of: 'wq', station: 'q' } });
  const th = 0.8 * (1 + 2.25) / (2 * 0.2);   // P-K with E[S²] = 1 + cv²
  ok(covers(F.wq, th) && covers(L.wq, th, 2), `M/G/1 (gamma, cv 1.5): FIFO Wq ${say(F.wq, th)}, LIFO ${say(L.wq, th)}: the same mean`);
  ok(sd('lifo') > 1.3 * sd('fifo'), `LIFO spreads the waits: sd ${f3(sd('lifo'))} against FIFO ${f3(sd('fifo'))}`);
  ok(S.wq.m + S.wq.h < F.wq.m - F.wq.h, `SPT (shortest first) cuts the mean wait: ${say(S.wq, NaN)} against FIFO ${f3(F.wq.m)}`);
}

// ---------- 3. features ----------
{ // breakdowns: the server is down a fraction E[ttr]/(E[ttf] + E[ttr]) of the time (failures run on the clock)
  const R = est({ tEnd: 5000, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(2) }], stations: [{ id: 'q', service: exp(1), breakdowns: { ttf: exp(30), ttr: exp(3) } }] },
    { dn: { of: 'down', station: 'q' }, th: { of: 'throughput', station: 'q' }, u: { of: 'busy', station: 'q' } });
  ok(covers(R.dn, 3 / 33) && covers(R.th, 0.5) && R.u.m > 0.5 + R.u.h, `breakdowns ttf 30, ttr 3: down ${say(R.dn, 3 / 33)}; throughput ${say(R.th, 0.5)}; occupied ${f3(R.u.m)} > 0.5 (a job held through a repair)`);
}
{ // shifts: 2 servers, none from 20 to 30 of every 50: the mean capacity = busy/util = 1.6
  const R = est({ tEnd: 2000, reps: 5, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', servers: 2, service: exp(1), shifts: { period: 50, plan: [{ from: 20, to: 30, servers: 0 }] } }] },
    { b: { of: 'busy', station: 'q' }, u: { of: 'util', station: 'q' } });
  ok(Math.abs(R.b.m / R.u.m - 1.6) < 0.01, `shifts: mean capacity busy/util = ${f3(R.b.m / R.u.m)} (1.6)`);
}
{ // a schedule of arrival times, piecewise rates and batches
  const S = D.run(SPEC({ tEnd: 100, reps: 2, sources: [{ id: 'a', to: 'q', schedule: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] }], stations: [{ id: 'q', service: { dist: 'const', value: 0.5 } }] },
    [{ id: 'n', kind: 'scalar', of: 'arrived' }, { id: 'wq', kind: 'scalar', of: 'wq' }, { id: 'lt', kind: 'series', of: 'logT' }, { id: 'lk', kind: 'series', of: 'logKind' }]), {}, { seed: 1 }).out;
  const arrT = S.lt.filter((t, i) => D.LOG_KINDS[S.lk[i]] === 'arrive');
  ok(S.n === 10 && S.wq === 0 && JSON.stringify(arrT) === '[1,2,3,5,8,13,21,34,55,89]', `schedule: 10 arrivals at the given times, none waits (log: ${arrT.join(', ')})`);
  // rates 2 for the first 10 of every 20, 0.5 after: the expected count over 400 = 20 · (20 + 5) = 500
  const R = est({ tEnd: 400, reps: 20, sources: [{ id: 'a', to: 'd', rates: [[0, 2], [10, 0.5]], period: 20 }], stations: [{ id: 'd', kind: 'delay', service: exp(1) }] }, { n: { of: 'arrived' } });
  ok(covers(R.n, 500), `time-varying rates (thinning, Lewis & Shedler 1979): arrivals ${say(R.n, 500)}`);
  const B = est({ tEnd: 1000, reps: 10, sources: [{ id: 'a', to: 'd', arrival: exp(1), batch: { dist: 'const', value: 3 } }], stations: [{ id: 'd', kind: 'delay', service: exp(1) }] }, { n: { of: 'arrived' }, l: { of: 'l', station: 'd' } });
  ok(covers(B.n, 3000) && covers(B.l, 3), `batch arrivals of 3: arrivals ${say(B.n, 3000)}, L ${say(B.l, 3)}`);
}
{ // routing by condition and jockeying between two lines (Banks et al., the bank with jockeying)
  const R = D.run(SPEC({ tEnd: 2000, reps: 5, classes: [{ id: 'x', prio: 0 }, { id: 'y', prio: 1 }],
    sources: [{ id: 'a', to: 'triage', mix: { x: 0.25, y: 0.75 }, arrival: exp(1) }],
    stations: [{ id: 'triage', service: exp(0.3), route: [{ to: 'X', when: 'x' }, { to: 'Y' }] }, { id: 'X', service: exp(0.5) }, { id: 'Y', service: exp(0.5) }] },
  [{ id: 'nx', kind: 'scalar', of: 'served', station: 'X' }, { id: 'ny', kind: 'scalar', of: 'served', station: 'Y' }, { id: 'xy', kind: 'scalar', of: 'served', station: 'X', class: 'y' }]), {}, { seed: 2 }).out;
  ok(R.xy === 0 && Math.abs(R.nx / (R.nx + R.ny) - 0.25) < 0.03, `routing by condition: class x to X (${f3(R.nx / (R.nx + R.ny))} of the work), no y at X`);
  const m = j => ({ tEnd: 3000, warmup: 300, reps: 10, sources: [{ id: 'a', shortest: ['L', 'R'], arrival: exp(1 / 1.7) }],
    stations: [{ id: 'L', service: exp(1), jockey: j }, { id: 'R', service: exp(1), jockey: j }] });
  const J = est(m(true), { w: { of: 'w' }, j: { of: 'jockeyed', station: 'L' } }), N0 = est(m(false), { w: { of: 'w' } }), mm2 = D.mmc(1.7, 1, 2).w;
  ok(J.j.m > 10 && covers(J.w, mm2) && covers(N0.w, mm2, 2), `jockeying: ${Math.round(J.j.m)} moves per run; W ${say(J.w, mm2)} = M/M/2 (one line) to within the CI, joining the shortest alone ${f3(N0.w.m)}`);
}

// ---------- 4. output analysis ----------
{ // one long run: batch means after an MSER-5 warm-up, starting empty (Schmeiser 1982; White 1997)
  const R = est({ tEnd: 20000, reps: 1, analysis: { method: 'batch', batches: 20, warmup: 'mser5' }, sources: [{ id: 'a', to: 'q', arrival: { dist: 'exp', rate: 0.7 } }], stations: [{ id: 'q', service: exp(1) }] },
    { wq: { of: 'wq', station: 'q' } }, 1, [{ id: 'wt', kind: 'scalar', of: 'warmupT' }, { id: 'nb', kind: 'scalar', of: 'reps' }]);
  ok(covers(R.wq, 7 / 3) && R._.out.nb === 20 && R._.out.wt >= 0 && R._.out.wt < 5000, `batch means + MSER-5: Wq ${say(R.wq, 7 / 3)} over 20 batches, warm-up ${f3(R._.out.wt)}`);
  // common random numbers: the difference of two designs varies far less with the same streams than with independent ones
  const m = mean => ({ tEnd: 1000, warmup: 100, reps: 20, sources: [{ id: 'a', to: 'q', arrival: exp(1.25) }], stations: [{ id: 'q', service: exp(mean) }] });
  const rv = (mean, seed) => D.run(SPEC(m(mean), [{ id: 'v', kind: 'series', of: 'repValues', measure: 'wq', station: 'q' }]), {}, { seed }).out.v;
  const vr = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1); };
  const a1 = rv(0.8, 1), b1 = rv(0.7, 1), b2 = rv(0.7, 99);
  const vCRN = vr(a1.map((x, i) => x - b1[i])), vInd = vr(a1.map((x, i) => x - b2[i]));
  ok(a1.length === 20 && vCRN < 0.25 * vInd && a1.every((x, i) => x > b1[i]), `CRN: var of the paired difference ${f3(vCRN)} against ${f3(vInd)} with independent streams; the faster server wins in every replication`);
  // antithetic pairs: negatively correlated, and the CI is taken over the pair means
  const A = D.run(SPEC({ ...m(0.8), reps: 60, analysis: { antithetic: true } }, [{ id: 'v', kind: 'series', of: 'repValues', measure: 'l', station: 'q' }, { id: 'n', kind: 'scalar', of: 'wq', station: 'q', est: 'n' }]), {}, { seed: 1 }).out;
  const x = A.v.filter((_, i) => i % 2 === 0), y = A.v.filter((_, i) => i % 2 === 1), mx = x.reduce((a, b) => a + b) / x.length, my = y.reduce((a, b) => a + b) / y.length;
  const rho = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
  ok(rho < -0.2 && A.n === 30, `antithetic replications (L of M/M/1): pair correlation ${f3(rho)} < 0; the CI over ${A.n} pair means`);
}

// ---------- 5. codes, the adapter, the Worker, the stepper, speed ----------
{
  const codes = (model, inputs) => D.run(SPEC(model, [{ id: 'ok', kind: 'scalar', of: 'ok' }, { id: 'wq', kind: 'scalar', of: 'wq', station: 'q' }, { id: 'th', kind: 'scalar', of: 'theory', measure: 'wq', station: 'q' }]), inputs || {}, { seed: 1 });
  const b = codes({ tEnd: 1e6, maxEvents: 1000, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', service: exp(0.5) }] });
  ok(b.codes.some(c => c.code === 'budget') && b.out.ok === 0, 'the event budget stops a run with the code budget (ok = 0)');
  const o = codes({ tEnd: 1000, reps: 1, sources: [{ id: 'a', to: 'q', arrival: exp(0.005) }], stations: [{ id: 'q', service: exp(1000) }] });
  ok(o.codes.some(c => c.code === 'overflow') && o.out.ok === 0, 'more than 100 000 entities present: the code overflow');
  const d = D.run({ ...SPEC({ tEnd: 100, sources: [{ id: 'a', to: 'q', arrival: { dist: 'exp', mean: 'm' } }], stations: [{ id: 'q', service: exp(0.5) }] }, [{ id: 'ok', kind: 'scalar', of: 'ok' }]), params: [{ id: 'm', kind: 'slider', min: -1, max: 1, default: -1 }] }, { m: -1 }, { seed: 1 });
  ok(d.codes.some(c => c.code === 'bad-dist') && d.out.ok === 0, 'a distribution made impossible by a parameter (mean −1): the code bad-dist');
  const rs = D.run({ ...SPEC({ tEnd: 100, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', service: exp(0.5), route: [{ to: 'exit', p: 'p' }, { to: 'q', p: 0.5 }] }] }, [{ id: 'ok', kind: 'scalar', of: 'ok' }]), params: [{ id: 'p', kind: 'slider', min: 0, max: 1, default: 0.8 }] }, { p: 0.8 }, { seed: 1 });
  ok(rs.codes.some(c => c.code === 'route-sum'), 'route probabilities that add up to more than 1: the code route-sum');
  const na = codes({ tEnd: 100, sources: [{ id: 'a', to: 'q', schedule: [500] }], stations: [{ id: 'q', service: exp(1) }] });
  ok(na.codes.some(c => c.code === 'no-arrivals') && na.out.ok === 1, 'no arrival inside the horizon: the note no-arrivals (not an error)');
  const u = codes({ tEnd: 200, sources: [{ id: 'a', to: 'q', arrival: exp(1) }], stations: [{ id: 'q', service: exp(1.2) }] });
  ok(u.codes.some(c => c.code === 'unstable') && Number.isNaN(u.out.th), 'ρ ≥ 1: the code unstable and no steady-state theory');
  ok(D.erlangC(2, 0) === 0 && D.erlangC(1, 0.5) === 0.5 && D.mmck(1, 1, 1, 0).ploss > 0.49 && D.mmck(1, 1, 1, 0).ploss < 0.51, 'Erlang C at the edges (a = 0; c = 1 gives ρ); Erlang B M/M/1/1 loses ½ at a = 1');
}
const MM1 = SPEC({ tEnd: 2000, warmup: 200, reps: 10, sources: [{ id: 'a', to: 'q', arrival: exp(1.25) }], stations: [{ id: 'q', service: exp(1) }] },
  [{ id: 'wq', kind: 'scalar', of: 'wq', station: 'q' }, { id: 'nq', kind: 'scalar', of: 'lq', station: 'q' }, { id: 't', kind: 'series', of: 't' }, { id: 'q', kind: 'series', of: 'qlen', station: 'q' }, { id: 'net', kind: 'scene', of: 'network' }, { id: 'g', kind: 'scene', of: 'gantt', window: 30 }, { id: 'lg', kind: 'scene', of: 'log' }]);
{
  const a = D.engine.create(MM1, { seed: 3 }).run({}), b = D.engine.create(MM1, { seed: 3 }).run({}), c = D.engine.create(MM1, { seed: 4 }).run({});
  ok(JSON.stringify(a) === JSON.stringify(b) && a.wq !== c.wq && a.t.length > 10 && a.q.length === a.t.length, 'engine.create(…).run: deterministic for a seed, another seed another sample; series of equal length');
  ok(['net', 'g', 'lg'].every(k => a[k] && Array.isArray(a[k].items) && a[k].items.length > 0), `scenes: network (${a.net.items.length} items), gantt (${a.g.items.length}), log (${a.lg.items.length})`);
  ok(D.engine.check(MM1).length === 0 && D.engine.check({ ...MM1, model: { ...MM1.model, stations: [] } }).length > 0, 'engine.check: [] for a good spec, messages for a bad one');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + D.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(MM1, { seed: 3 }).run({});
  ok(JSON.stringify(w) === JSON.stringify(a), 'the Worker source (NoemaExpr + core + simkit + des) gives the same outputs in a fresh global');
}
{ // the stepper through makeEngine: stepInit / stepTo by macro steps of 50, the running means approach the theory
  const inst = D.simEngine.create(MM1, { seed: 1 }), i0 = inst.stepInit({}, 0);
  let last = null, t = 0; for (let k = 0; k < 400; k++) { last = inst.stepTo({}, t, 50, []); t += 50; }
  const one = D.run({ ...MM1, model: { ...MM1.model, tEnd: 20000, warmup: 0, reps: 1 } }, {}, { seed: 1 }).out;
  ok(!i0.fail && !last.fail && last.dt === 50 && Math.abs(last.out.wq - one.wq) < 1e-9 * one.wq && Math.abs(last.out.nq - one.nq) < 1e-9 * one.nq && Math.abs(last.out.wq - 3.2) < 1.2,
    `stepper (stepInit, stepTo × 400 of 50): running Wq ${f3(last.out.wq)}, Lq ${f3(last.out.nq)} = one replication to 20 000 run whole (${f3(one.wq)}, ${f3(one.nq)}; theory 3.2, 2.56)`);
  ok(inst.snapshot() === -1, 'the stepper holds a live executive: no snapshot (the orchestrator does not iterate it)');
  const bad = D.simEngine.create({ ...MM1, model: { tEnd: 1 } }, { seed: 1 }).stepInit({}, 0);
  ok(bad.fail === 'part-failed', 'a bad model: stepInit fails with part-failed');
  const st = D.stepper.init(MM1.model, {}, { spec: MM1, seed: 1 }), s1 = D.stepper.step(st, {}, 0, 100), s2 = D.stepper.step(s1.state, {}, 100, 100);
  ok(s2.state.live.sim.now === 200 && s2.out.wq >= 0, 'stepper.step advances the executive to t + dt');
}
{ // speed: a typical run warm < 80 ms; every fixture's run < 2 s
  D.run(MM1, {}, { seed: 1 }); let t0 = Date.now(); const r = D.run(MM1, {}, { seed: 2 }); const warm = Date.now() - t0;
  const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'des.json'), 'utf8')).specs;
  let worst = 0; for (const s of specs) { t0 = Date.now(); D.run(s, {}, { seed: 1 }); worst = Math.max(worst, Date.now() - t0); }
  ok(warm < 80 && worst < 2000, `speed: M/M/1 10 × 2000 (${r.events} events) in ${warm} ms; the slowest fixture ${worst} ms`);
}

// ---------- 6. the reference activity ed-triage ----------
{
  const EX = path.join(ROOT, 'tools', 'activities_examples', 'ed-triage'), rj = f => JSON.parse(fs.readFileSync(path.join(EX, f), 'utf8'));
  const spec = rj('spec.json'), tests = rj('tests.json'), tables = Object.fromEntries(['en', 'el', 'ru', 'de', 'fr'].map(l => [l, rj(`strings.${l}.json`)]));
  ok(!C.hasErrors(D.checkSpec(spec)), 'ed-triage: the spec passes checkSpec' + (C.hasErrors(D.checkSpec(spec)) ? ': ' + JSON.stringify(D.checkSpec(spec)).slice(0, 300) : ''));
  const want = new Set([spec.title, spec.intro, ...spec.params.map(p => p.label), ...spec.readouts.map(r => r.label), ...spec.plots.flatMap(p => [p.title, p.x && p.x.label, p.y && p.y.label, ...(p.series || []).map(s => s.label)]), ...D.keys(spec).map(k => Array.isArray(k) ? k[0] : k)].filter(x => typeof x === 'string'));
  const ks = Object.values(tables).map(t => Object.keys(t).sort().join());
  const missing = [...want].filter(k => !Object.prototype.hasOwnProperty.call(tables.en, k));
  ok(ks.every(k => k === ks[0]) && !missing.length && Object.values(tables).every(t => Object.values(t).every(v => typeof v === 'string' && v.trim())), `ed-triage: strings in en, el, ru, de, fr with the same ${Object.keys(tables.en).length} keys, covering every label` + (missing.length ? ' (missing ' + missing.join(', ') + ')' : ''));
  // the exercise's checks (the grade of ch01-e920): the busy hour, under 3 % leaving unseen, routine wait ≤ 15 min, ≤ 4 doctors
  const K = spec.consts, pass = (v, s) => s.perHour >= K.busyHour && v.lwbs <= K.maxLwbs && v.wqRoutine <= K.maxRoutineWait && s.doctors <= K.maxDoctors;
  const inst = D.engine.create(spec, { seed: 1 }), def = Object.fromEntries(spec.params.map(p => [p.id, p.default]));
  for (const c of tests.cases) {
    const s = { ...def }; for (const st of c.steps) s[st.set] = st.value;
    const t0 = Date.now(), v = inst.run(s), ms = Date.now() - t0;
    const bad = Object.entries(c.expect.values || {}).filter(([k, r]) => !(Array.isArray(r) ? v[k] >= r[0] && v[k] <= r[1] : v[k] === r));
    const gp = c.expect.passed === undefined || pass(v, s) === c.expect.passed;
    ok(!bad.length && gp && ms < 2000, `ed-triage: ${c.name}` + (bad.length ? ' — off: ' + bad.map(([k]) => `${k} ${f3(v[k])}`).join(', ') : '') + (gp ? '' : ' — the grade differs') + ` [${ms} ms]`);
  }
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
