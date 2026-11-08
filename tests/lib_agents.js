/* agents@1 (src/engines/agents/agents.js, docs/library/agents.md) against published and exact values:
   1. the classic models: Schelling 1971 (mild preferences, strong segregation), Boids / Vicsek order, SIR well mixed against the
      Kermack–McKendrick 1927 final size (replications with Student-t intervals), the Ising model against Onsager 1944, DeGroot 1974
      consensus = the degree-weighted mean, the voter model's martingale, wolf–sheep coexistence, Sugarscape inequality;
   2. scheduling: synchronous versus random-order asynchronous updating (Huberman & Glance 1993), FIPA-ACL messages and inboxes;
   3. BDI agents (Rao & Georgeff 1995): blind, single-minded and open-minded commitment; norms monitored by NoemaLibLogic
      (violations, sanctions, fulfilments) and the fallback monitor giving the same records;
   4. protocols: Contract Net (Smith 1980) against the optimal assignment, auctions (Vickrey 1961: truthful bidding dominant in the
      second-price auction; revenue equivalence (n−1)/(n+1)), Rubinstein 1982 bargaining (1−δ₂)/(1−δ₁δ₂), Zeuthen → Nash 1950, the
      core and Shapley value (glove game, majority game), Axelrod's 1984 tournament (TFT against ALLD) and its ecology;
   5. codes, the checker and its Python twin, the sim adapter, the stepper, the Worker source, speed, and the reference activity
      schelling-segregation (its tests.json).
   Usage: node tests/lib_agents.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaLibLogic = ENGINES.mod('logic@1'), NoemaLibAgents = ENGINES.mod('agents@1');
const A = NoemaLibAgents, C = NoemaLibCore;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.abs(b);
const spec = (model, outputs, params) => ({ format: 'noema.sim-spec/v1', engine: 'agents@1', params: params || [], model, outputs });
const S = (id, of, extra) => Object.assign({ id, kind: 'scalar', of }, extra || {});
const Se = (id, of, extra) => Object.assign({ id, kind: 'series', of }, extra || {});
const P = (id, name) => S(id, 'protocol', { name });
const run = (model, outputs, env, seed) => { const s = spec(model, outputs); const E = A.checkSpec(s).filter(p => p.level === 'error'); if (E.length) { console.log('  check:', JSON.stringify(E)); return { out: {}, codes: [] }; } return A.run(s, env || {}, { seed: seed || 1 }); };
const codes = r => (r.codes || []).map(c => c.code);
const ms = f => { const t = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };

ok(A.id === 'agents@1' && Object.isFrozen(A) && Object.isFrozen(A.engine) && typeof A.engine.workerSource === 'string' && A.engine.stepper === true, 'NoemaLibAgents: id agents@1, frozen API, an engine with workerSource and a stepper');
ok(A.TEMPLATES.length === 10 && A.PROTOCOLS.length === 5 && A.ACTIONS.length === 12, `${A.TEMPLATES.length} templates, ${A.PROTOCOLS.length} protocols, ${A.ACTIONS.length} actions`);

// ---------- 1. the classic models ----------
{
  const sc = run({ template: 'schelling', set: { want: 0.3 } }, [Se('s', 'reporter', { reporter: 'similar' }), S('u', 'final', { reporter: 'unhappy' }), S('st', 'steps'), { id: 'sp', kind: 'scene', of: 'space', colorBy: 'group' }]);
  ok(near(sc.out.s[0], 0.5, 0.03) && sc.out.s[sc.out.s.length - 1] > 0.7 && sc.out.u === 0 && codes(sc).includes('stopped'), `Schelling: agents content with 30 % like neighbours start at ${sc.out.s[0].toFixed(3)} similar (random, ½) and settle at ${sc.out.s[sc.out.s.length - 1].toFixed(3)} (> 0.7) after ${sc.out.st} steps, nobody unhappy`);
  ok(sc.out.sp.items.length > 100 && sc.out.sp.items.length <= 2000 && sc.out.sp.items.every(it => C.ROLES.includes(it.c || 'base')) && new Set(sc.out.sp.items.map(it => it.c)).size >= 2, `the space scene: ${sc.out.sp.items.length} items, coloured by group in roles only`);
  const lo = run({ template: 'schelling', set: { want: 0.1 } }, [S('s', 'final', { reporter: 'similar' })]);
  ok(lo.out.s < 0.6, `with 10 % wanted the mix stays (similar ${lo.out.s.toFixed(3)})`);
  const bo = run({ template: 'boids', steps: 300 }, [Se('o', 'reporter', { reporter: 'order' })]);
  ok(bo.out.o[0] < 0.3 && bo.out.o[bo.out.o.length - 1] > 0.9, `Boids: the order parameter |Σ v|/(n v) (Vicsek et al. 1995) rises from ${bo.out.o[0].toFixed(2)} (random headings) to ${bo.out.o[bo.out.o.length - 1].toFixed(3)} (a flock)`);
  // the Kermack–McKendrick final size: z = 1 − e^(−R0 z), R0 = contacts·β/γ = 2.5
  let z = 0.5; for (let i = 0; i < 200; i++) z = 1 - Math.exp(-2.5 * z);
  const sw = run({ template: 'sirwell', replications: { n: 8 } }, [S('m', 'replMean', { reporter: 'R' }), S('lo', 'replLo', { reporter: 'R' }), S('hi', 'replHi', { reporter: 'R' }), S('h', 'replHalf', { reporter: 'R' }), Se('v', 'replValues', { reporter: 'R' })]);
  ok(near(sw.out.m, z, 0.02) && sw.out.lo <= z + 0.01 && sw.out.hi >= z - 0.01 && sw.out.v.length >= 2, `SIR well mixed (2000 agents, R0 2.5): the final size ${sw.out.m.toFixed(4)} ± ${sw.out.h.toFixed(4)} over ${sw.out.v.length} replications (Kermack–McKendrick ${z.toFixed(4)})`);
  const onsager = T => Math.pow(1 - Math.pow(Math.sinh(2 / T), -4), 1 / 8);
  const is = run({ template: 'ising', set: { T: 1.5, size: 32 }, steps: 300 }, [Se('m', 'reporter', { reporter: 'm' })]);
  const mLate = is.out.m.slice(-100).reduce((s, v) => s + v, 0) / 100;
  ok(near(mLate, onsager(1.5), 0.015), `Ising (Glauber heat bath, 32², T = 1.5): magnetisation ${mLate.toFixed(4)} (Onsager ${onsager(1.5).toFixed(4)})`);
  const hot = run({ template: 'ising', set: { T: 4, size: 32 }, steps: 300 }, [Se('m', 'reporter', { reporter: 'm' })]);
  const mHot = hot.out.m.slice(-100).reduce((s, v) => s + Math.abs(v), 0) / 100;
  ok(mHot < 0.1, `above T_c = 2.269 (T = 4) the order melts: |m| ${mHot.toFixed(3)}`);
  const dg = run({ template: 'degroot' }, [S('m', 'final', { reporter: 'mean' }), S('sp', 'final', { reporter: 'spread' }), Se('w', 'reporter', { reporter: 'weighted' }), Se('ws', 'reporter', { reporter: 'wsum' })]);
  ok(near(dg.out.m, dg.out.w[0] / dg.out.ws[0], 1e-9) && dg.out.sp < 1e-12, `DeGroot: everyone agrees (variance ${dg.out.sp.toExponential(1)}) on ${dg.out.m.toFixed(6)} = Σ(deg + 1)x₀ / Σ(deg + 1), the stationary weights of the averaging chain`);
  const vt = run({ template: 'voter', set: { size: 10 }, steps: 2000, replications: { n: 40 } }, [S('m', 'replMean', { reporter: 'mean' }), S('h', 'replHalf', { reporter: 'mean' })]);
  ok(Math.abs(vt.out.m - 0.5) <= Math.max(vt.out.h, 0.05) + 0.05, `the voter model: the mean opinion is a martingale, so its expectation stays ½ (${vt.out.m.toFixed(3)} ± ${vt.out.h.toFixed(3)} over 40 runs)`);
  const ws = run({ template: 'wolfsheep', steps: 300 }, [Se('s', 'reporter', { reporter: 'nSheep' }), Se('w', 'reporter', { reporter: 'nWolves' })]);
  ok(ws.out.s.length === 301 && ws.out.s.every(v => v > 0) && ws.out.w[ws.out.w.length - 1] > 0 && Math.max(...ws.out.w) > ws.out.w[0], 'wolf–sheep predation with grass (Wilensky 1997): both survive 300 steps and the wolves boom on the sheep');
  const nw = run({ template: 'wolfsheep', set: { wolves: 0 }, steps: 30 }, [Se('s', 'reporter', { reporter: 'nSheep' }), Se('w', 'reporter', { reporter: 'nWolves' })]);
  ok(nw.out.w.every(v => v === 0) && Math.max(...nw.out.s) > 200, 'without wolves the sheep multiply');
  const su = run({ template: 'sugarscape', steps: 100 }, [S('g', 'final', { reporter: 'gini' }), Se('h', 'hist', { hist: 'wealth' }), Se('e', 'histEdges', { hist: 'wealth' }), S('n', 'final', { reporter: 'agents' })]);
  ok(su.out.g > 0.25 && su.out.g < 0.7 && su.out.h.length === 20 && su.out.e.length === 21 && su.out.h.reduce((s, v) => s + v, 0) <= su.out.n && su.out.n < 250, `Sugarscape (Epstein & Axtell 1996): starvation thins the population to ${su.out.n}, wealth becomes unequal (Gini ${su.out.g.toFixed(3)}), a wealth histogram`);
}

// ---------- 2. scheduling and messages ----------
{
  const two = sch => run({ space: { kind: 'network', edges: [[0, 1]] }, breeds: [{ id: 'n', count: 2, place: 'node', vars: { op: { init: 'id', type: 'bool' } }, rules: [{ do: 'adopt', var: 'op' }] }], reporters: [{ id: 'm', fn: 'mean', expr: 'op' }], steps: 6, schedule: sch }, [Se('m', 'reporter', { reporter: 'm' })]).out.m;
  const sy = two('sync'), as = two('random');
  ok(sy.every(v => v === 0.5) && (as[as.length - 1] === 0 || as[as.length - 1] === 1), `two voters copying each other: updated synchronously they swap opinions for ever (mean ${sy.join(', ')}); in random order they agree at once (${as.join(', ')}) — Huberman & Glance 1993`);
  const msg = run({ space: { kind: 'network', edges: [[0, 1], [1, 2], [2, 0]] }, breeds: [{ id: 'n', count: 3, place: 'node', vars: { v: { init: 'id' }, heard: { init: 0 } }, rules: [{ do: 'send', perf: 'inform', content: 'v' }, { do: 'set', var: 'heard', expr: 'inmean' }] }], aggregates: [{ id: 'inmean', of: 'inbox', fn: 'mean', expr: 'content', perf: 'inform' }], reporters: [{ id: 'h', fn: 'sum', expr: 'heard' }], steps: 3, schedule: 'fixed' }, [S('m', 'messages'), S('mi', 'messages', { perf: 'inform' }), S('h', 'final', { reporter: 'h' }), Se('mc', 'messageCount')]);
  ok(msg.out.m === 18 && msg.out.mi === 18 && near(msg.out.h, 3, 1e-12) && msg.out.mc.length === 3, `FIPA-ACL inform on a triangle: 3 agents × 2 neighbours × 3 steps = ${msg.out.m} messages; each reads the mean of its inbox (Σ heard = ${msg.out.h} = 0 + 1 + 2)`);
  const lim = run({ space: { kind: 'none' }, breeds: [{ id: 'a', count: 500, rules: [{ do: 'send', perf: 'inform', to: 'all', content: '1' }] }], steps: 2 }, [S('m', 'messages'), S('f', 'flag', { code: 'message-limit' })]);
  ok(lim.out.f === 1 && lim.out.m <= 200000, `broadcasts beyond 200 000 messages: code message-limit (${lim.out.m} sent)`);
}

// ---------- 3. BDI and norms ----------
{
  const bdi = cm => run({ space: { kind: 'none' }, globals: { want: 1 }, breeds: [{ id: 'r', count: 1, vars: { pos: { init: 0 } }, bdi: { commitment: cm, goals: [{ id: 'reach', when: 'want == 1', achieved: 'pos >= 10' }], plans: [{ id: 'walk', goal: 'reach', body: [{ do: 'set', var: 'pos', expr: 'pos + 1' }] }] } }], reporters: [{ id: 'where', fn: 'mean', expr: 'pos' }], interrupts: [{ at: 3, set: { want: 0 } }], steps: 20 }, [S('p', 'final', { reporter: 'where' }), S('a', 'bdi', { name: 'achieved' }), S('d', 'bdi', { name: 'dropped' })]).out;
  const bl = bdi('blind'), si = bdi('single'), op = bdi('open');
  ok(bl.p === 10 && bl.a === 1 && si.p === 10 && op.p === 3 && op.d === 1, `BDI commitment (Rao & Georgeff 1991): when the desire goes at step 3, blind and single-minded agents still reach the goal (pos ${bl.p}, ${si.p}); an open-minded one drops it (pos ${op.p}, dropped ${op.d})`);
  const imp = run({ space: { kind: 'none' }, globals: { want: 1, blocked: 0 }, breeds: [{ id: 'r', count: 1, vars: { pos: { init: 0 } }, bdi: { commitment: 'single', goals: [{ id: 'reach', when: 'want == 1', achieved: 'pos >= 10', impossible: 'blocked == 1' }], plans: [{ id: 'walk', goal: 'reach', body: [{ do: 'set', var: 'pos', expr: 'pos + 1' }] }] } }], reporters: [{ id: 'where', fn: 'mean', expr: 'pos' }], interrupts: [{ at: 5, set: { blocked: 1 } }], steps: 20 }, [S('p', 'final', { reporter: 'where' }), S('d', 'bdi', { name: 'dropped' })]).out;
  const imb = run({ space: { kind: 'none' }, globals: { want: 1, blocked: 0 }, breeds: [{ id: 'r', count: 1, vars: { pos: { init: 0 } }, bdi: { commitment: 'blind', goals: [{ id: 'reach', when: 'want == 1', achieved: 'pos >= 10', impossible: 'blocked == 1' }], plans: [{ id: 'walk', goal: 'reach', body: [{ do: 'set', var: 'pos', expr: 'pos + 1' }] }] } }], reporters: [{ id: 'where', fn: 'mean', expr: 'pos' }], interrupts: [{ at: 5, set: { blocked: 1 } }], steps: 20 }, [S('p', 'final', { reporter: 'where' })]).out;
  ok(imp.p === 5 && imp.d === 1 && imb.p === 10, `single-minded: the intention is kept until achieved or impossible (stops at ${imp.p} when blocked); blind ignores impossibility (${imb.p})`);
  const pl = run({ space: { kind: 'none' }, breeds: [{ id: 'r', count: 1, vars: { pos: { init: 0 }, fuel: { init: 3 } }, bdi: { commitment: 'single', goals: [{ id: 'reach', when: '1', achieved: 'pos >= 5' }], plans: [{ id: 'drive', goal: 'reach', context: 'fuel > 0', body: [{ do: 'set', var: 'pos', expr: 'pos + 1' }, { do: 'set', var: 'fuel', expr: 'fuel - 1' }] }, { id: 'walk', goal: 'reach', context: 'fuel <= 0', body: [{ do: 'set', var: 'pos', expr: 'pos + 0.5' }] }] } }], reporters: [{ id: 'where', fn: 'mean', expr: 'pos' }], steps: 20 }, [S('p', 'final', { reporter: 'where' }), S('n', 'bdi', { name: 'actions' })]).out;
  ok(pl.p === 5 && pl.n === 10, `the plan library: context conditions choose the plan (drive while there is fuel, then walk): pos ${pl.p} = 3 + 4 × ½ after ${pl.n} actions (3 × 2 + 4)`);
  const normModel = { space: { kind: 'none' }, breeds: [{ id: 'd', count: 50, vars: { caution: { init: 0 }, fines: { init: 0 } }, rules: [{ do: 'set', var: 'fines', expr: 'fines', when: 'rnd > caution', act: 'speed' }] }], norms: [{ id: 'limit', kind: 'F', act: 'speed', sanction: { var: 'caution', add: '0.2' } }], reporters: [{ id: 'c', fn: 'mean', expr: 'caution' }], steps: 30 };
  const nm = run(normModel, [S('v', 'violations'), Se('vs', 'violations'), S('c', 'final', { reporter: 'c' }), S('f', 'flag', { code: 'logic-fallback' })]);
  const vs = nm.out.vs;
  ok(vs[0] === 50 && vs[vs.length - 1] < 10 && vs.slice(1).every((v, i) => v <= vs[i] + 6) && nm.out.c > 0.5 && nm.out.f === 0, `a prohibition with a sanction (NoemaLibLogic.normMonitor): violations ${vs.slice(0, 6).join(', ')}, … ${vs[vs.length - 1]} as fines make the drivers cautious (mean caution ${nm.out.c.toFixed(2)})`);
  const ob = { space: { kind: 'none' }, breeds: [{ id: 'w', count: 10, vars: { done: { init: 0 } }, rules: [{ do: 'set', var: 'done', expr: '1', when: 'id < 6 && t >= 2', act: 'report' }] }], norms: [{ id: 'rep', kind: 'O', act: 'report', within: 4 }], steps: 10 };
  const o1 = run(ob, [S('v', 'violations'), S('f', 'fulfilments')]);
  ok(o1.out.v === 4 && o1.out.f === 6, `an obligation with a deadline (within 4 steps): 6 agents report in time (fulfilled), 4 never do (violated)`);
  const sat = A.propEval(A.propParse('a & !b | c'), x => x === 'a');
  ok(sat === true && A.propEval(A.propParse('a & b'), x => x === 'a') === false, 'the fallback\'s propositional parser');
}

// ---------- 4. protocols ----------
{
  const cn = run({ protocol: { kind: 'contractnet', tasks: 20, contractors: 5 } }, [P('c', 'totalCost'), P('o', 'optimalCost'), P('m', 'messages'), Se('l', 'protocolSeries', { name: 'load' })]);
  ok(near(cn.out.c, cn.out.o, 1e-9) && cn.out.m === 20 * (3 * 5 + 1) && cn.out.l.reduce((s, v) => s + v, 0) === 20, `Contract Net without capacity limits: the cheapest bids give the optimal assignment (${cn.out.c.toFixed(2)}); ${cn.out.m} messages = tasks × (cfp + bid + answer to each of 5 contractors + inform)`);
  const cc = run({ protocol: { kind: 'contractnet', tasks: 20, contractors: 5, capacity: 4 } }, [P('c', 'totalCost'), P('o', 'optimalCost'), Se('l', 'protocolSeries', { name: 'load' }), P('u', 'unassigned')]);
  ok(cc.out.c >= cc.out.o - 1e-9 && cc.out.o > cn.out.o && cc.out.l.every(v => v <= 4) && cc.out.u === 0, `with capacity 4 each the greedy protocol (${cc.out.c.toFixed(2)}) is no better than the optimal assignment (Hungarian algorithm, ${cc.out.o.toFixed(2)}); no contractor over capacity`);
  // a hand-checked case: costs [[1, 2], [1, 3]], capacity 1: greedy gives task 0 to contractor 0 (1) and task 1 to contractor 1 (3) = 4; the optimum is 2 + 1 = 3
  const hc = run({ protocol: { kind: 'contractnet', tasks: 2, contractors: 2, capacity: 1, costs: [[1, 2], [1, 3]] } }, [P('c', 'totalCost'), P('o', 'optimalCost')]);
  ok(hc.out.c === 4 && hc.out.o === 3, `the price of the greedy, myopic protocol: costs [[1, 2], [1, 3]] with capacity 1 — Contract Net ${hc.out.c}, optimum ${hc.out.o}`);
  const lf = run({ protocol: { kind: 'contractnet', tasks: 3, contractors: 1, loadFactor: 0.5, costs: [[2], [2], [2]] } }, [P('c', 'totalCost'), P('o', 'optimalCost')]);
  ok(lf.out.c === 2 + 3 + 4 && lf.out.o === 9, 'a load factor raises each further task\'s cost (2, 3, 4): both give 9');
  const auc = (format, strategy) => run({ protocol: { kind: 'auction', format, bidders: 4, rounds: 2000, strategy } }, [P('r', 'revenue'), P('e', 'expectedRevenue'), P('d', 'dominance'), P('f', 'efficiency'), P('h', 'revenueHalf')]).out;
  const re = { english: auc('english', 'truthful'), second: auc('second', 'truthful'), first: auc('first', 'bne'), dutch: auc('dutch', 'bne') };
  ok(Object.values(re).every(r => near(r.r, 0.6, 0.02) && near(r.e, 0.6, 1e-12)), `revenue equivalence (Myerson 1981; 4 bidders, values U(0, 1)): English ${re.english.r.toFixed(3)}, second-price ${re.second.r.toFixed(3)}, first-price ${re.first.r.toFixed(3)}, Dutch ${re.dutch.r.toFixed(3)} — all (n−1)/(n+1) = 0.6`);
  ok(re.second.d === 1 && auc('first', 'truthful').d < 1 && Object.values(re).every(r => r.f === 1), 'Vickrey 1961: in the second-price auction no deviation from bidding one\'s value ever pays (dominance 1); in the first-price auction bidding the value is beaten (< 1); every format allocates efficiently');
  const sh = run({ protocol: { kind: 'auction', format: 'first', bidders: 4, rounds: 2000, strategy: 'shade', shade: 0.5 } }, [P('r', 'revenue')]).out;
  ok(near(sh.r, 0.5 * 0.8, 0.02), `first-price bidders who all bid half their value: revenue ${sh.r.toFixed(3)} = ½ E[max of 4] = 0.4 (below the equilibrium 0.6)`);
  const rb = run({ protocol: { kind: 'negotiation', method: 'rubinstein', d1: 0.9, d2: 0.8, horizon: 500 } }, [P('s', 'share1'), P('c', 'closedForm'), P('r', 'rounds'), Se('o', 'protocolSeries', { name: 'offers' })]);
  ok(near(rb.out.s, (1 - 0.8) / (1 - 0.9 * 0.8), 1e-6) && near(rb.out.c, 0.2 / 0.28, 1e-12) && rb.out.r === 1, `Rubinstein 1982 (δ₁ 0.9, δ₂ 0.8): backward induction over 500 rounds gives the proposer ${rb.out.s.toFixed(6)} = (1 − δ₂)/(1 − δ₁δ₂), agreed at once`);
  const sym = run({ protocol: { kind: 'negotiation', method: 'rubinstein', d1: 0.99, d2: 0.99, horizon: 2000 } }, [P('s', 'share1')]);
  ok(near(sym.out.s, 1 / 1.99, 1e-4), `equal patience δ → 1: the split tends to ½ (${sym.out.s.toFixed(4)} = 1/(1 + δ))`);
  const ze = run({ protocol: { kind: 'negotiation', method: 'zeuthen', a1: 1, a2: 2, step: 0.001 } }, [P('s', 'share1'), P('n', 'nashX'), P('a', 'agreement')]);
  ok(near(ze.out.s, 1 / 3, 0.003) && near(ze.out.n, 1 / 3, 1e-6) && ze.out.a === 1, `Zeuthen 1930 concessions (u₁ = x, u₂ = (1 − x)² … risk attitudes a₁ 1, a₂ 2) converge to the Nash bargaining solution x = ${ze.out.n.toFixed(4)} (Harsanyi 1956): ${ze.out.s.toFixed(4)}`);
  const gl = run({ protocol: { kind: 'coalition', players: 3, kinds: [0, 1, 1], v: 'min(k0,k1)' } }, [Se('sh', 'protocolSeries', { name: 'shapley' }), P('ce', 'coreEmpty'), P('ic', 'shapleyInCore'), P('g', 'grand')]);
  ok(near(gl.out.sh[0], 2 / 3, 1e-12) && near(gl.out.sh[1], 1 / 6, 1e-12) && near(gl.out.sh[2], 1 / 6, 1e-12) && gl.out.ce === 0 && gl.out.ic === 0 && gl.out.g === 1, `the glove game (one left glove, two right): Shapley value (${gl.out.sh.map(x => x.toFixed(4)).join(', ')}) = (2/3, 1/6, 1/6); the core is not empty (it is (1, 0, 0)) and the Shapley value is not in it`);
  const mj = run({ protocol: { kind: 'coalition', players: 3, v: 's >= 2 ? 1 : 0' } }, [Se('sh', 'protocolSeries', { name: 'shapley' }), P('ce', 'coreEmpty'), P('m', 'minCoreTotal')]);
  ok(mj.out.sh.every(x => near(x, 1 / 3, 1e-12)) && mj.out.ce === 1 && near(mj.out.m, 1.5, 1e-9), `the 3-player majority game: Shapley ⅓ each; the core is empty (Bondareva–Shapley LP: min Σx subject to the coalitions = ${mj.out.m} > v(N) = 1)`);
  const wv = run({ protocol: { kind: 'coalition', players: 4, weights: [40, 30, 20, 10], v: 'w >= 51 ? 1 : 0' } }, [Se('sh', 'protocolSeries', { name: 'shapley' })]);
  ok(JSON.stringify(wv.out.sh.map(x => Math.round(x * 12))) === JSON.stringify([5, 3, 3, 1]), `the weighted voting game [51; 40, 30, 20, 10]: Shapley–Shubik index (5, 3, 3, 1)/12 (${wv.out.sh.map(x => x.toFixed(4)).join(', ')})`);
  const tb = run({ protocol: { kind: 'coalition', players: 2, table: [1, 1, 3] } }, [Se('sh', 'protocolSeries', { name: 'shapley' })]);
  ok(near(tb.out.sh[0], 1.5, 1e-12) && near(tb.out.sh[1], 1.5, 1e-12), 'a game by its table (bitmask order): the symmetric split of the surplus');
  const pd = run({ protocol: { kind: 'ipd', strategies: ['tft', 'alld'], rounds: 200 } }, [Se('s', 'protocolSeries', { name: 'scores' })]);
  ok(JSON.stringify(pd.out.s) === JSON.stringify([799, 404]), `the iterated prisoner's dilemma (T 5, R 3, P 1, S 0; 200 rounds, a round robin with self-play): TFT ${pd.out.s[0]} = 600 + 199, ALLD ${pd.out.s[1]} = 200 + 204 — TFT never wins a match yet wins the tournament (Axelrod 1984)`);
  const ax = run({ protocol: { kind: 'ipd', strategies: ['allc', 'alld', 'tft', 'grim', 'tf2t', 'pavlov', 'random'], rounds: 200, generations: 200 } }, [Se('s', 'protocolSeries', { name: 'scores' }), Se('x', 'protocolSeries', { name: 'shares' }), P('w', 'winner')]);
  ok(ax.out.s[2] > ax.out.s[1] && ax.out.x[1] < 0.01 && ax.out.x[6] < 0.01 && ax.out.x[0] + ax.out.x[2] + ax.out.x[3] + ax.out.x[4] + ax.out.x[5] > 0.99, `Axelrod's ecological tournament: ALLD (${ax.out.x[1].toExponential(1)}) and RANDOM die out; the nice, retaliating strategies take over (TFT ${ax.out.x[2].toFixed(3)})`);
}

// ---------- 5. codes ----------
{
  const big = run({ space: { kind: 'none' }, breeds: [{ id: 'a', count: 6000 }], steps: 1 }, [S('c', 'count')]);
  ok(codes(big).includes('agent-limit') && big.out.c === 5000, 'more than 5000 agents: code agent-limit, the first 5000 kept');
  const bud = run({ space: { kind: 'none' }, breeds: [{ id: 'a', count: 2000, rules: [{ do: 'contact', set: { v: 1 }, contacts: '50' }], vars: { v: { init: 0 } } }], steps: 2000, maxOps: 100000 }, [S('s', 'steps'), S('f', 'flag', { code: 'budget' })]);
  ok(bud.out.f === 1 && bud.out.s < 2000, `the operation budget (maxOps 100 000): code budget after ${bud.out.s} steps — never a hang`);
  const full = run({ space: { kind: 'grid', nx: 5, ny: 5, capacity: 1 }, breeds: [{ id: 'a', count: 30, place: 'empty' }], steps: 1 }, [S('c', 'count'), S('f', 'flag', { code: 'no-space' })]);
  ok(full.out.f === 1 && full.out.c === 25, 'a 5 × 5 grid of capacity 1 holds 25 agents: code no-space');
  const ext = run({ space: { kind: 'none' }, breeds: [{ id: 'a', count: 5, rules: [{ do: 'die', when: 't >= 3' }] }], steps: 10 }, [S('c', 'count'), S('f', 'flag', { code: 'extinct' }), S('s', 'steps')]);
  ok(ext.out.c === 0 && ext.out.f === 1 && ext.out.s <= 4, 'everyone dies: code extinct, the run ends');
  const rp = run({ template: 'sirwell', replications: { n: 100 } }, [S('m', 'replMean', { reporter: 'R' }), Se('v', 'replValues', { reporter: 'R' }), S('f', 'flag', { code: 'repl-cut' })]);
  ok(rp.out.f === 1 && rp.out.v.length < 100 && rp.out.v.length >= 2 && Number.isFinite(rp.out.m), `replications beyond the total budget: only whole replications (${rp.out.v.length}), code repl-cut`);
  const same = [1, 2].map(() => run({ template: 'schelling', set: { size: 15 } }, [S('s', 'final', { reporter: 'similar' })], {}, 7).out.s);
  const other = run({ template: 'schelling', set: { size: 15 } }, [S('s', 'final', { reporter: 'similar' })], {}, 8).out.s;
  ok(same[0] === same[1] && other !== same[0], 'deterministic per seed: the same seed gives the same run, another seed another');
}

// ---------- 6. the checker and its Python twin ----------
{
  const E = s => A.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + ' ' + p.path);
  ok(E(spec({ space: { kind: 'none' }, breeds: [{ id: 'a', count: 1, rules: [{ do: 'move', how: 'random' }] }], steps: 1 }, [])).includes('value model.breeds[0].rules[0].how'), 'a model without space has no movement');
  ok(E(spec({ template: 'schelling', set: { beta: 1 } }, [])).includes('value model.set.beta'), 'a template takes only its own parameters');
  ok(E(spec({ space: { kind: 'none' }, globals: { x: 1 }, breeds: [{ id: 'a', count: 1 }], steps: 1 }, [])).includes('dup-name model.globals'), 'built-in names cannot be reused');
  ok(E(spec({ protocol: { kind: 'coalition', players: 3, table: [1, 2] } }, [])).includes('value model.protocol.table'), 'a coalition table has 2^n − 1 values');
  ok(E(spec({ protocol: { kind: 'auction' } }, [P('x', 'shapley')])).includes('output outputs[0].name'), 'a protocol output names what that protocol gives');
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'agents.json'), 'utf8')).specs;
  const js = fx.map(s => { const p = A.checkSpec(s), bad = p.some(q => q.level === 'error'); return { p, x: bad ? null : A.exprs(s), k: bad ? null : A.keys(s) }; });
  const py = JSON.parse(execFileSync('python3', ['-c', `import json,sys,lib_agents as M
out=[]
for s in json.loads(sys.stdin.read()):
    p=M.check_spec(s); bad=any(q['level']=='error' for q in p)
    out.append({'p':p,'x':None if bad else [list(t) for t in M.exprs(s)],'k':None if bad else [list(t) for t in M.keys(s)]})
print(json.dumps(out))`], { cwd: path.join(ROOT, 'tools'), input: JSON.stringify(fx), encoding: 'utf8' }));
  const same = js.filter((r, i) => JSON.stringify(r) === JSON.stringify(py[i])).length;
  ok(fx.length >= 20 && same === fx.length && js.some(r => r.x) && js.some(r => !r.x), `tools/lib_agents.py agrees with the JS checker on ${same}/${fx.length} fixture specs (problems, expressions, keys; good and bad)`);
  const pyc = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_agents as M; print(json.dumps([M.CODES,M.SERIES,M.SCALARS,M.SCENES,M.ACTIONS,M.PROTOCOLS,M.PROTO_NAMES,list(M.TEMPLATES),M.TEMPLATES,M.IPD]))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8' }));
  ok(JSON.stringify(pyc) === JSON.stringify([A.CODES, A.SERIES, A.SCALARS, A.SCENES, A.ACTIONS, A.PROTOCOLS, A.PROTO_NAMES, A.TEMPLATES, A.templateParams(), A.IPD]), 'the Python twin has the same codes, outputs, actions, protocols, templates (and their parameters) and IPD strategies');
  const tp = A.TEMPLATES.map(t => { const x = A.template(t); return { reporters: x.reporters.map(r => r.id), vars: [].concat(...x.breeds.map(b => Object.keys(b.vars || {}))), breeds: x.breeds.map(b => b.id), hist: (x.hist || []).map(h => h.id) }; });
  const pyt = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_agents as M; print(json.dumps([M.TPL[t] for t in M.TEMPLATES]))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8' }));
  ok(JSON.stringify(tp) === JSON.stringify(pyt), 'the Python twin knows each template\'s reporters, variables, breeds and histograms');
  let allOk = true, worst = 0;
  fx.forEach(s => { if (A.checkSpec(s).some(p => p.level === 'error')) return; const env = {}; for (const p of s.params || []) env[p.id] = p.default; const [r, t] = ms(() => A.run(s, env, { seed: 1 })); worst = Math.max(worst, t); for (const o of s.outputs) { const v = r.out[o.id]; if (o.kind === 'series' ? !Array.isArray(v) || v.length > 2000 : o.kind === 'scene' ? !v || !Array.isArray(v.items) || v.items.length > 2000 || !v.items.every(it => C.ROLES.includes(it.c || 'base')) : typeof v !== 'number') allOk = false; } });
  ok(allOk && worst < 2000, `every good fixture runs: series ≤ 2000 points, scenes ≤ 2000 items in roles only, scalars numbers; the slowest ${worst.toFixed(0)} ms (< 2 s)`);
  let threw = false; try { for (const s of fx) A.run(s, {}, { seed: 1 }); A.run(null, null, null); A.run({ model: 5 }, {}, {}); A.checkSpec(null); A.exprs({}); } catch (e) { threw = true; console.log(e); }
  ok(!threw, 'bad specs, nulls and junk never throw');
}

// ---------- 7. adapter, stepper, Worker, speed, the reference activity ----------
{
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'schelling-segregation', 'spec.json'), 'utf8'));
  const inp = { ...(ex.consts || {}) }; for (const p of ex.params) inp[p.id] = p.default;
  const sim = A.engine.create(ex, { seed: 1 });
  sim.run({ ...inp, want: 0.2 });   // warm-up (the first run compiles)
  const [o, t1] = ms(() => sim.run(inp));
  ok(Array.isArray(o.t) && Array.isArray(o.sim) && typeof o.similar === 'number' && o.grid && o.grid.items.length > 50 && o.grid.items.length <= 2000, `engine.create(spec).run(inputs): series, scalars and the grid scene (${o.grid.items.length} items)`);
  ok(t1 < 50, `a typical run (the schelling-segregation activity) takes ${t1.toFixed(1)} ms (< 50)`);
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + A.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(ex, { seed: 1 }).run(inp);
  ok(JSON.stringify(w) === JSON.stringify(o), 'the Worker source in a fresh global gives the same outputs, bit for bit');
  const bad = A.engine.create({ ...ex, model: { template: 'nope' } }, {}).run(inp);
  ok(Number.isNaN(bad.similar) && Array.isArray(bad.t) && bad.t.length === 0, 'a spec that does not stand: NaN scalars, empty series, no throw');
  const [, tw] = ms(() => run({ template: 'sirwell' }, [S('r', 'final', { reporter: 'R' })]));
  const [, tb] = ms(() => run({ template: 'boids', steps: 300 }, [S('o', 'final', { reporter: 'order' })]));
  ok(tw < 2000 && tb < 2000, `heavy runs: 2000 well-mixed agents to the end of the epidemic (${tw.toFixed(0)} ms), 150 boids for 300 steps (${tb.toFixed(0)} ms) — each < 2 s`);
  // the stepper: macro steps replay from the seed, so stepping to step k equals a run of k steps
  const sp = spec({ template: 'voter', set: { size: 10 }, steps: 40 }, [S('m', 'final', { reporter: 'mean' })]);
  const st = A.stepper; let state = st.init(sp, {}, { seed: 3 }), last = null, t = 0;
  for (let k = 0; k < 4; k++) { const r = st.step(state, {}, t, 5, {}); state = r.state; t += r.dt; last = r.out; }
  const ref = A.run(spec({ template: 'voter', set: { size: 10 }, steps: 20 }, [S('m', 'final', { reporter: 'mean' })]), {}, { seed: 3 }).out;
  ok(t === 20 && last.m === ref.m, `the stepper (NoemaSimKit.stepper): 4 macro steps of 5 give the 20-step run (mean ${last.m})`);
  const inst = A.engine.create(sp, { seed: 3 }); inst.stepInit({}, 0); let lo = null; for (let k = 0; k < 4; k++) lo = inst.stepTo({}, k * 5, 5, []).out;
  ok(lo.m === ref.m && inst.snapshot() === -1, 'through makeEngine: stepInit / stepTo give the same; snapshot is refused (−1)');
  // the activity's own cases (tests.json)
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'schelling-segregation', 'tests.json'), 'utf8'));
  const checks = ['want <= wantMax', 'similar >= 0.7'].map(e => NoemaExpr.compile(e));   // the exercise's checks (in the pack)
  for (const c of T.cases) {
    const v = { ...inp }; for (const s2 of c.steps) v[s2.set] = s2.value;
    const out = sim.run(v), env = { ...v, ...Object.fromEntries(Object.entries(out).filter(([, x]) => typeof x === 'number')) };
    const inRange = Object.entries(c.expect.values || {}).every(([k, [a, b]]) => env[k] >= a && env[k] <= b);
    const passed = checks.every(f => !!f(env));
    ok(inRange && (c.expect.passed == null || passed === c.expect.passed), `schelling-segregation: ${c.name}`);
  }
  const strings = ['en', 'el', 'ru', 'de', 'fr'].map(l => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'schelling-segregation', `strings.${l}.json`), 'utf8')));
  ok(strings.every(s => JSON.stringify(Object.keys(s).sort()) === JSON.stringify(Object.keys(strings[0]).sort())), 'schelling-segregation: the five string tables have the same keys');
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
