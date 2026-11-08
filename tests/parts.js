/* Parts: several engines in one sim-spec@1 activity (docs/INTERACTIVE.md §12.8, docs/INTERACTIVE_LIBRARY.md §1.6).
   1. the plan (NoemaCore.content.partsPlan): the order of derived values and parts, loops and the co-simulation as units;
   2. the steppers of the library engines (makeEngine's optional `stepper`): ode@1 against exp decay, med@1 against the closed form,
      clinic@1 bit for bit against run(), snapshot / restore;
   3. the orchestrator (35_activity_sim.js partsRunner) with inline engine runners: chain, series inputs, a fixed point (and one that
      does not settle), a co-simulation (with iterate), the latest inputs win, a failing part;
   4. the reference activities (tools/activities_examples/pk-ode, genetics-prob, ancient-voyage): their spec passes the content checks and
      every case of their tests.json holds under the orchestrator.
   Run: node tests/parts.js */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
globalThis.window = globalThis;
const ENG = {};
globalThis.ACT = { PARTS: {}, registerEngine: d => { ENG[d.id] = d; }, registerRuntime() { }, engine: id => ENG[id] || NoemaCore.engines.engine(id), engines: () => [...Object.keys(ENG), ...NoemaCore.engines.ids()] };   // = ACT of engine/src/32_activities.js: its own engines, then the library's
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaExpr = ENGINES.kernel('expr'), NoemaLibCore = ENGINES.kernel('core'), NoemaEngineCatalog = ENGINES.lib.catalog, NoemaLibODE = ENGINES.mod('ode@1');
require(path.join(SRC, '35_activity_sim.js'));
const PC = NoemaCore.content, A = globalThis.ACT;
const want = require('./golden.cjs')('parts');   // the golden outputs of the former Python twin (tests/golden.cjs)

const base = o => ({ format: 'noema.sim-spec/v1', params: [{ id: 'D', kind: 'slider', label: 'dLabel', min: 1, max: 10, default: 5 }], ...o });
const pk = () => ({ id: 'pk', engine: 'med@1', model: { items: [{ id: 'o', fn: 'pk.oral', in: { dose: 'dose', v: 40, clear: 5, ka: 1 } }] }, inputs: { dose: 'D * 100' },
  outputs: [{ id: 'cmax', kind: 'scalar', of: 'o.cmax' }, { id: 'tc', kind: 'series', of: 'o.t' }, { id: 'c', kind: 'series', of: 'o.c' }] });
const od = () => ({ id: 'eff', engine: 'ode@1', model: { rhs: { E1: 'ke * (cin - E1)' }, states: [{ id: 'E1', init: 0 }], solve: { tEnd: 24 } }, inputs: { cin: 'cmax', ke: 0.5 },
  outputs: [{ id: 'eEnd', kind: 'scalar', of: 'final', var: 'E1' }] });
const errs = (spec, lib) => PC.checkSimSpec(spec, null, null, { parts: lib || {} });

// ---------- 1. the plan ----------
{
  const s = base({ derived: [{ id: 'c2', expr: 'cmax * 2' }], parts: [{ ...od(), inputs: { cin: 'c2', ke: 0.5 } }, pk()] });
  const P = PC.partsPlan(s, null);
  ok(JSON.stringify(P.order.map(u => u.k + ':' + (u.id || u.parts.join(',')))) === '["part:pk","derived:c2","part:eff"]' && !P.cycles.length && !P.errors.length, 'plan: a part after what it needs (Kahn), whatever the order of spec.parts');
  const lp = base({ parts: [pk(), { ...od(), inputs: { cin: 'cmax', ke: 0.5 } }, { ...pk(), id: 'pk2', inputs: { dose: 'eEnd + 1' }, outputs: [{ id: 'cm2', kind: 'scalar', of: 'o.cmax' }] }].map((p, i) => (i === 1 ? { ...p, inputs: { cin: 'cm2', ke: 0.5 } } : p)), couple: { loops: [{ parts: ['eff', 'pk2'], tol: 1e-6 }] } });
  const P2 = PC.partsPlan(lp, null);
  ok(P2.order.length === 2 && P2.order[1].k === 'loop' && P2.order[1].parts.join() === 'eff,pk2' && !P2.cycles.length, 'plan: a declared loop is one unit');
  const cy = PC.partsPlan(base({ parts: [{ ...pk(), inputs: { dose: 'eEnd + 1' } }, od()] }), null);
  ok(cy.cycles.length === 1 && cy.cycles[0].join(' → ') === 'pk → eff → pk', 'plan: an undeclared cycle is reported with its path');
  ok(errs(base({ parts: [{ ...pk(), inputs: { dose: 'eEnd + 1' } }, od()] })).some(m => /pk → eff → pk depend on each other in a cycle/.test(m)), 'validator: an undeclared cycle is an error naming the cycle');
  const lib = { 'oral-pk': pk() }, u = base({ parts: [{ id: 'pk', use: 'oral-pk', with: { inputs: { dose: 'D * 50' } } }, od()] });
  const R = PC.resolveParts(u, lib, []);
  ok(R[1].p.engine === 'ode@1' && R[0].p.engine === 'med@1' && R[0].p.inputs.dose === 'D * 50' && R[0].p.id === 'pk' && !errs(u, lib).length, 'use / with: a part of activities/_parts, changed by with');
}

{ // the content checks: the golden messages (of the former Python twin) on every case of tests/fixtures/parts_cases.json
  const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'parts_cases.json'), 'utf8')), names = Object.keys(F.cases);
  const js = names.map(k => PC.checkSimSpec(F.cases[k], null, null, { parts: F.lib }));
  const pyr = want('cases', JSON.stringify(F), js);   // the golden outputs of the former Python twin (tools/activities.py check_spec)
  const norm = l => l.map(m => m.replace(/'/g, '"'));   // (the Python twin's repr quoted with ', the JS with ")
  names.forEach((k, i) => {
    const same = JSON.stringify(norm(js[i])) === JSON.stringify(norm(pyr[i])), good = k.startsWith('parts good') ? !js[i].length : js[i].length > 0;
    ok(same && good, `${k}: ${js[i].length} error(s), as the golden outputs${js[i].length ? ' — ' + js[i][0].slice(0, 120) : ''}${same ? '' : ' | GOLDEN: ' + (pyr[i][0] || '')}`);
  });
  const noParts = names.length >= 30 && PC.checkSimSpec(base({ derived: [{ id: 'q', expr: 'D * 2' }] }), null, null, { parts: F.lib }).length === 0;
  ok(noParts, 'a spec without parts is checked as before');
}

// ---------- 2. steppers ----------
const C = NoemaLibCore;
function stepAll(E, spec, inp, tEnd, dt) {
  const i = E.create(spec, { seed: 1 }), r0 = i.stepInit(inp, 0), outs = [r0.out];
  for (let t = 0; t < tEnd - 1e-12; t += dt) outs.push(i.stepTo(inp, t, Math.min(dt, tEnd - t), []).out);
  return { i, outs };
}
{
  const E = A.engine('ode@1');
  ok(!!E && E.stepper === true && typeof NoemaLibODE.simEngine.stepper === 'object', 'ode@1 declares a stepper (engine.stepper, simEngine.stepper)');
  const spec = { format: 'noema.sim-spec/v1', engine: 'ode@1', consts: { k: 0.3 }, model: { rhs: { y: '-k * y' }, states: [{ id: 'y', init: 1 }], solve: { tEnd: 10 } }, outputs: [{ id: 'yy', kind: 'series', of: 'state', var: 'y' }, { id: 'yf', kind: 'scalar', of: 'final', var: 'y' }] };
  const { i, outs } = stepAll(E, spec, { k: 0.3 }, 5, 0.5);
  ok(near(outs[outs.length - 1].yf, Math.exp(-1.5), 1e-5), 'ode@1 stepper: y′ = −k y over 10 macro steps = e^{−kt}');
  const s0 = i.snapshot(), a = i.stepTo({ k: 0.3 }, 5, 1, []).out.yf;
  ok(s0 === 0 && i.restore(0) && i.stepTo({ k: 0.3 }, 5, 1, []).out.yf === a, 'snapshot / restore: the same step again gives the same value');
}
{
  const E = A.engine('med@1'), spec = { format: 'noema.sim-spec/v1', engine: 'med@1', model: { items: [{ id: 'o', fn: 'pk.oral', in: { dose: 500, v: 40, clear: 5, ka: 1 } }] }, outputs: [{ id: 'cmax', kind: 'scalar', of: 'o.cmax' }] };
  const { outs } = stepAll(E, spec, {}, 24, 0.25), ke = 5 / 40, tmax = Math.log(1 / ke) / (1 - ke), cm = 500 / 40 * 1 / (1 - ke) * (Math.exp(-ke * tmax) - Math.exp(-tmax));
  ok(E.stepper === true && near(outs[outs.length - 1].cmax, cm, 2e-3), `med@1 stepper: oral one-compartment c_max ≈ the closed form (${cm.toFixed(4)})`);
}
{
  const E = A.engine('clinic@1'), ex = path.join(ROOT, 'tools', 'activities_examples', 'sepsis-case', 'spec.json');
  if (E && fs.existsSync(ex)) {
    const spec = JSON.parse(fs.readFileSync(ex, 'utf8')), env = {}; for (const [k, v] of Object.entries(spec.consts || {})) env[k] = v; for (const p of spec.params || []) env[p.id] = p.kind === 'toggle' ? !!p.default : p.kind === 'choice' ? (p.default ?? p.options[0].value) : p.default;
    const inp = E.prepare ? E.prepare(spec, NoemaExpr.compile)(env) : env, one = E.create(spec, { seed: 1 }).run(inp);
    const tEnd = (spec.model.vp && spec.model.vp.tEnd) || 240, st = stepAll(E, spec, inp, tEnd, 30), last = st.outs[st.outs.length - 1];
    const sc = spec.outputs.filter(o => o.kind === 'scalar').map(o => o.id);
    const diff = sc.filter(k => !(Object.is(last[k], one[k]) || last[k] === one[k])); ok(E.stepper === true && sc.length > 0 && !diff.length, diff.map(k => k + ' ' + last[k] + '≠' + one[k]).join(' ') + `clinic@1 stepper: the scalars after stepping = run() bit for bit (${sc.length})`);
  } else ok(false, 'clinic@1 and the sepsis-case example are here');
}

// ---------- 3. the orchestrator ----------
const deps = { runner: A.engineRunner === undefined ? null : undefined };
function runParts(spec, env, o) {
  return new Promise((res, rej) => {
    const r = A.partsRunner(spec, { seed: 1, task: { ...(spec.consts || {}) }, ...(o || {}) }, why => res({ failed: why }), { lib: (o && o.lib) || {} });
    const e = { ...(spec.consts || {}) }; for (const p of spec.params || []) e[p.id] = p.default; Object.assign(e, env || {});
    r.run(e, out => { r.close(); res(out); });
  });
}
(async () => {
  ok(typeof A.partsRunner === 'function', 'ACT.partsRunner is exported (35_activity_sim.js)');
  const chain = await runParts(base({ parts: [pk(), od()] }));
  const single = A.engine('med@1').create({ ...PC.partSpec(base({}), pk()) }, { seed: 1 }).run({ D: 5, dose: 500 });
  ok(chain.outputs && near(chain.outputs.cmax, single.cmax, 1e-12) && chain.outputs.c.length > 10 && near(chain.outputs.eEnd, single.cmax, 1e-4) && !chain.codes.length, 'chain: med@1 → ode@1 (the ODE relaxes to the c_max it is given)');
  const d2 = await runParts(base({ derived: [{ id: 'c2', expr: 'cmax * 2' }], parts: [pk(), { ...od(), inputs: { cin: 'c2', ke: 0.5 } }] }));
  ok(near(d2.env.c2, 2 * single.cmax, 1e-12) && near(d2.outputs.eEnd, 2 * single.cmax, 1e-4), 'chain: a derived value between two parts');
  const st = await runParts(base({ parts: [pk(), { ...od(), inputs: { cin: { series: 'c', stat: 'max' }, ke: 0.5 } }] }));
  ok(near(st.outputs.eEnd, Math.max(...chain.outputs.c), 1e-4), 'chain: a series input made a number by stat');
  // a fixed point: x = cos(x) through two ode parts that relax to their input
  const relaxTo = (id, out, expr) => ({ id, engine: 'ode@1', model: { rhs: { z: '50 * (u - z)' }, states: [{ id: 'z', init: 0 }], solve: { tEnd: 2 } }, inputs: { u: expr }, outputs: [{ id: out, kind: 'scalar', of: 'final', var: 'z' }] });
  const fp = base({ parts: [relaxTo('a', 'xa', 'cos(xb)'), relaxTo('b', 'xb', 'xa')], couple: { loops: [{ parts: ['a', 'b'], tol: 1e-7, maxIter: 50 }] } });
  ok(!errs(fp).length, 'a declared loop passes the validators ' + errs(fp).slice(0, 2).join(' | '));
  const r1 = await runParts(fp);
  ok(near(r1.outputs.xa, 0.7390851332, 1e-5) && !r1.codes.length, `loop: Gauss–Seidel settles at the fixed point of cos (${r1.outputs.xa})`);
  const div = base({ parts: [relaxTo('a', 'xa', '2 * xb + 1'), relaxTo('b', 'xb', 'xa')], couple: { loops: [{ parts: ['a', 'b'], tol: 1e-9, maxIter: 8 }] } });
  const r2 = await runParts(div);
  ok(Number.isNaN(r2.outputs.xa) && r2.codes.some(c => c.code === 'no-converge' && c.loop === 0 && c.iterations === 8), 'loop: one that does not settle gives NaN and the code no-converge');
  const rl = await runParts(base({ parts: fp.parts, couple: { loops: [{ parts: ['a', 'b'], tol: 1e-7, maxIter: 50, relax: 0.7, init: { xb: 0.5 } }] } }));
  ok(near(rl.outputs.xa, 0.7390851332, 1e-5), 'loop: relax and first guesses');
  // a co-simulation: the ODE sees the concentration at each macro step
  const cs = base({ parts: [pk(), { ...od(), inputs: { cin: 'c', ke: 0.5 } }], couple: { cosim: { tEnd: 24, dt: 0.25, parts: ['pk', 'eff'], time: 'tt' } } });
  ok(!errs(cs).length, 'a co-simulation passes the validators ' + errs(cs).slice(0, 2).join(' | '));
  const r3 = await runParts(cs);
  ok(r3.outputs && r3.outputs.tt.length === 97 && r3.outputs.c.length === 97 && near(r3.outputs.tt[96], 24, 1e-12) && r3.outputs.eEnd > 0 && r3.outputs.eEnd < r3.outputs.cmax && !r3.codes.length, `cosim: 96 macro steps, the time series and one sample per step (eEnd ${r3.outputs && r3.outputs.eEnd.toFixed(3)} < c_max)`);
  const r4 = await runParts({ ...cs, couple: { cosim: { ...cs.couple.cosim, iterate: { tol: 1e-9, maxIter: 5 } } } });
  ok(r4.outputs && near(r4.outputs.eEnd, r3.outputs.eEnd, 1e-3) && !r4.codes.some(c => c.code === 'no-snapshot'), 'cosim iterate: macro steps repeated from snapshots (one-way coupling: the same answer)');
  // the latest inputs win
  await new Promise(res => {
    const r = A.partsRunner(base({ parts: [pk(), od()] }), { seed: 1, task: {} }, () => { }, { lib: {} }), got = [];
    r.run({ D: 2 }, o => got.push(['a', o])); r.run({ D: 7 }, o => got.push(['b', o]));
    setTimeout(() => { ok(got.length === 1 && got[0][0] === 'b' && near(got[0][1].outputs.cmax, 7 / 5 * single.cmax, 1e-9), 'the latest inputs win (an older run is dropped)'); r.close(); res(); }, 300);
  });
  // a part that fails: NaN outputs and a code (an engine that throws)
  ENG['boom@1'] = { id: 'boom@1', create: () => ({ run() { throw new Error('x'); } }) };
  const r5 = await new Promise(res => { const r = A.partsRunner(base({ parts: [{ id: 'b', engine: 'boom@1', outputs: [{ id: 'q', kind: 'scalar' }] }] }), { seed: 1 }, w => res({ failed: w }), { lib: {}, plan: s => ({ parts: s.parts, order: [{ k: 'part', id: 'b' }], errors: [], cycles: [] }) }); r.run({ D: 1 }, res); });
  ok(Number.isNaN(r5.outputs.q) && r5.codes.some(c => c.code === 'part-failed' && c.part === 'b'), 'a failing part: NaN and the code part-failed, the rest goes on');
  delete ENG['boom@1'];
  // the golden plan (of the former Python twin, tools/activities.py parts_plan)
  const pyPlan = want('plan', JSON.stringify(fp), PC.partsPlan(fp, null).order);
  ok(JSON.stringify(pyPlan) === JSON.stringify(PC.partsPlan(fp, null).order), 'partsPlan = the golden plan');

  // the mini-apps' noema.sim(spec).run(inputs) (34_activity_html.js engineBridge): declared engines only, the spec checks, the orchestrator
  {
    const vm = require('vm'), h34 = fs.readFileSync(path.join(SRC, '34_activity_html.js'), 'utf8'), s32 = fs.readFileSync(path.join(SRC, '32_activities.js'), 'utf8');
    const ACTP = vm.runInNewContext(s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = (')) + '; ACTP', { TextEncoder, JSON, Object, Array, Number, String, Math });
    ok(ACTP.check({ p: 'noema.activity', v: 1, type: 'sim:run', id: 's1', payload: { spec: { parts: [] }, inputs: { D: 1 }, seed: 3 } }).ok && !ACTP.check({ p: 'noema.activity', v: 1, type: 'sim:run', payload: { spec: 'x' } }).ok, 'ACTP: sim:run {spec, inputs?, seed?}');
    const ctx = { console, Promise, Date, JSON, Object, Array, Set, Map, String, Number, Math, Error, isFinite, setTimeout, clearTimeout, ACTP, Worker: function () { } };
    ctx.window = ctx; ctx.NoemaCore = NoemaCore;
    ctx.ACT = { registerRuntime() { }, engine: A.engine, engines: A.engines, engineRunner: A.engineRunner, partsRunner: A.partsRunner };
    vm.createContext(ctx); vm.runInContext(h34.replace('ACT.registerRuntime({', 'globalThis.__bridge = engineBridge; ACT.registerRuntime({'), ctx);
    const got = [], B = ctx.__bridge({ engines: ['med@1', 'ode@1'] }, 5, (type, payload, extra) => got.push({ type, payload, re: extra.re }));
    const sp = { consts: { D: 5 }, parts: [pk(), od()] }, wait = re => new Promise(res => { const t = setInterval(() => { const m = got.find(g => g.re === re); if (m) { clearInterval(t); res(m.payload); } }, 5); });
    B.handle({ type: 'sim:run', id: 'a', payload: { spec: sp, inputs: { D: 5 } } });
    const a = await wait('a');
    if (!a.ok) console.log(JSON.stringify(a).slice(0, 400));
    ok(a.ok && near(a.outputs.cmax, single.cmax, 1e-12) && near(a.outputs.eEnd, single.cmax, 1e-4) && Array.isArray(a.codes), 'noema.sim: a chain med@1 → ode@1 from a mini-app, answered with the outputs');
    B.handle({ type: 'sim:run', id: 'b', payload: { spec: { parts: [pk(), { ...od(), engine: 'graph@1' }] } } });
    ok((await wait('b')).code === 'undeclared', 'noema.sim: an engine the registry entry does not list: undeclared');
    B.handle({ type: 'sim:run', id: 'c', payload: { spec: { consts: { D: 5 }, parts: [{ ...pk(), inputs: { dose: 'eEnd + 1' } }, od()] } } });
    const c = await wait('c'); if (c.code !== 'spec') console.log(JSON.stringify(c).slice(0, 300)); ok(c.code === 'spec' && /cycle/.test(c.message), 'noema.sim: the spec checks of sim-spec@1 (an undeclared cycle): spec');
    B.handle({ type: 'sim:run', id: 'd', payload: { spec: sp, inputs: { 'a b': 1 } } });
    ok((await wait('d')).code === 'inputs', 'noema.sim: inputs with a bad name: inputs');
    B.close();
  }

  // ---------- 3b. the old plugins as parts: thermal@1, pid@1, twin@1, circuit-mna@1 (transient) have steppers ----------
  {
    const exSpec = id => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', id, 'spec.json'), 'utf8'));
    const envOf = sp => { const e = { ...(sp.consts || {}) }; for (const q of sp.params || []) e[q.id] = q.default; return e; };
    /** step a plugin's instance from 0 to tEnd by macro steps dt; → [the last outputs, run()'s outputs] */
    const stepVsRun = (id, sp, tEnd, dt, seed) => {
      const E = A.engine(id), prep = E.prepare(sp, NoemaExpr.compile), inp = prep(envOf(sp)), i = E.create(sp, { seed: seed || 1 });
      let last = i.stepInit(inp, 0).out; for (let t = 0; t < tEnd - 1e-12; t += dt) last = i.stepTo(inp, t, Math.min(dt, tEnd - t), []).out;
      return { E, i, last, one: E.create(sp, { seed: seed || 1 }).run(inp), inp };
    };
    const lastOf = a => a[a.length - 1];
    { const sp = exSpec('pid-tune'), tEnd = sp.model.transient.tEnd, r = stepVsRun('pid@1', sp, tEnd, tEnd / 20);
      ok(r.E.stepper === true && near(r.last.y, lastOf(r.one.y), 1e-9) && near(r.last.ess, r.one.ess, 1e-9) && near(r.last.os, r.one.os, 1e-9), `pid@1 stepper: stepped to tEnd in 20 macro steps = run() (y ${r.last.y.toFixed(6)}, overshoot ${r.last.os.toFixed(3)} %)`);
      const s0 = r.i.snapshot(), a = r.i.stepTo(r.inp, tEnd, 0.5, []).out.y; ok(s0 === 0 && r.i.restore(0) && r.i.stepTo(r.inp, tEnd, 0.5, []).out.y === a, 'pid@1 snapshot / restore: the same step again gives the same value'); }
    { const sp = exSpec('heatsink'), env = envOf(sp), tEnd = Math.max(600, 300 * env.Rsa), r = stepVsRun('thermal@1', sp, tEnd, tEnd / 30);
      ok(r.E.stepper === true && near(r.last.tj, lastOf(r.one.tj), 1e-9) && near(r.last.ths, lastOf(r.one.ths), 1e-9) && r.last.tjSS === r.one.tjSS, `thermal@1 stepper: the θ-method stepped to tEnd = transient() (Tj ${r.last.tj.toFixed(4)} °C), the steady scalars as run()`);
      const s0 = r.i.snapshot(), a = r.i.stepTo(r.inp, tEnd, 10, []).out.tj; ok(s0 === 0 && r.i.restore(0) && r.i.stepTo(r.inp, tEnd, 10, []).out.tj === a, 'thermal@1 snapshot / restore'); }
    { const sp = exSpec('sensor-node'), T = sp.model.device.sim.duration, r = stepVsRun('twin@1', sp, T, T / 24, 5);
      ok(r.E.stepper === true && r.last.iAvg > 0 && near(r.last.iAvg, r.one.iAvg, 1e-9) && near(r.last.ratio, r.one.ratio, 1e-12) && r.i.snapshot() === -1, `twin@1 stepper: the firmware paused 24 times gives run()'s average current (${(r.last.iAvg).toFixed(5)} mA) and delivery ratio; no snapshot (a running program)`); }
    { const sp = exSpec('rc-transient'), tEnd = sp.model.transient.tEnd, r = stepVsRun('circuit-mna@1', sp, tEnd, tEnd / 50);
      ok(r.E.stepper === true && near(r.last.vc, lastOf(r.one.vc), 1e-9) && near(r.last.vMax, r.one.vMax, 1e-9), `circuit-mna@1 stepper: the transient held open over 50 macro steps = transient() (v_C ${r.last.vc.toFixed(6)} V, max ${r.last.vMax.toFixed(6)} V)`); }
    { // the grid made a divisor of the macro step (Copilot #65: dt 0.6 of a macro step would land at 1.2 macro steps), a start t0 ≠ 0
      const sp = exSpec('rc-transient'), tEnd = sp.model.transient.tEnd, H = tEnd / 50; sp.model.transient.dt = 0.6 * H;
      const E = A.engine('circuit-mna@1'), inp = E.prepare(sp, NoemaExpr.compile)(envOf(sp)), i = E.create(sp, { seed: 1 }), t0 = 2;
      i.stepInit(inp, t0); let last = null; for (let k = 0; k < 50; k++) last = i.stepTo(inp, t0 + k * H, H, []);
      const ref = E.create(sp, { seed: 1 }).run({ ...inp, $tran: { tEnd, dt: H / 2 } });
      ok(last.dt === H && near(last.out.t, t0 + tEnd, 1e-12) && near(last.out.vc, lastOf(ref.vc), 1e-9), `circuit-mna@1 stepper: grid ${(0.6 * H).toExponential(1)} → ${(H / 2).toExponential(1)} (a divisor of the macro step), started at t0 = ${t0}: time ${last.out.t} = t0 + tEnd, v_C = transient() on that grid`);
      // a last step off the grid: its values at the asked time, interpolated; the step reported as asked
      const j = E.create(sp, { seed: 1 }); j.stepInit(inp, 0); j.stepTo(inp, 0, H, []); const r2 = j.stepTo(inp, H, 0.25 * H, []);
      const g = ref.t.findIndex(x => x > 1.25 * H - 1e-15), w = (1.25 * H - ref.t[g - 1]) / (ref.t[g] - ref.t[g - 1]), want = ref.vc[g - 1] + w * (ref.vc[g] - ref.vc[g - 1]);
      ok(r2.dt === 0.25 * H && near(r2.out.t, 1.25 * H, 1e-12) && near(r2.out.vc, want, 1e-9), `circuit-mna@1 stepper: a step of ¼ macro step off the grid reports t = ${r2.out.t.toExponential(3)} and v_C interpolated there`);
    }
    { // a binding that changes while stepping (Copilot #65): a DC source bound to Vs, 1 V then 5 V, the capacitor's charge kept
      const sp = { format: 'noema.sim-spec/v1', engine: 'circuit-mna@1', consts: {}, params: [{ id: 'Vs', kind: 'slider', min: 0, max: 10, default: 1 }],
        model: { netlist: { format: 'noema.circuit/v1', nodes: ['in', 'out'], elements: [{ id: 'V1', type: 'V', n: ['in', 'gnd'], value: 1 }, { id: 'R1', type: 'R', n: ['in', 'out'], value: 1000 }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6, ic: 0 }] },
          bindings: [{ element: 'V1', expr: 'Vs' }], transient: { tEnd: 0.01, dt: 1e-6 } },
        outputs: [{ id: 'vc', kind: 'series', node: 'out' }] };
      const E = A.engine('circuit-mna@1'), prep = E.prepare(sp, NoemaExpr.compile), i = E.create(sp, { seed: 1 }), tau = 1e-3, H = 1e-4;
      const in1 = prep({ Vs: 1 }), in5 = prep({ Vs: 5 }); let last = i.stepInit(in1, 0).out;
      const v0 = last.vc; for (let k = 0; k < 10; k++) last = i.stepTo(in1, k * H, H, []).out;
      const v1 = last.vc; for (let k = 10; k < 30; k++) last = i.stepTo(in5, k * H, H, []).out;
      const want1 = 1 - Math.exp(-1e-3 / tau), want = 5 - (5 - want1) * Math.exp(-2e-3 / tau);
      ok(Math.abs(v0) < 1e-12 && near(v1, want1, 1e-4) && near(last.vc, want, 1e-4), `circuit-mna@1 stepper: V1 bound 1 V → 5 V at 1 ms goes into the running transient (v_C ${v1.toFixed(5)} → ${last.vc.toFixed(5)} V, exact ${want.toFixed(5)})`);
    }
    // a co-simulation: pid@1's plant output y drives an ODE that integrates it, z' = y (the validators list pid@1 as a stepper)
    const pidP = { id: 'loop', engine: 'pid@1', model: { plant: { type: 'fopdt', K: 1, tau: 1 }, controller: { Kp: 2, Ki: 1 }, setpoint: { step: { to: 1 } }, transient: { tEnd: 10, dt: 0.01 } },
      outputs: [{ id: 'yv', kind: 'series', signal: 'y' }, { id: 'ess', kind: 'scalar', metric: 'ess' }] };
    const intP = { id: 'int', engine: 'ode@1', model: { rhs: { z: 'yin' }, states: [{ id: 'z', init: 0 }], solve: { tEnd: 10 } }, inputs: { yin: 'yv' }, outputs: [{ id: 'zEnd', kind: 'scalar', of: 'final', var: 'z' }] };
    const cs = base({ parts: [pidP, intP], couple: { cosim: { tEnd: 10, dt: 0.05, parts: ['loop', 'int'], time: 'tt' } } });
    ok(!errs(cs).length, 'a co-simulation pid@1 + ode@1 passes the validators ' + errs(cs).slice(0, 2).join(' | '));
    const rc = await runParts(cs), ref = A.engine('pid@1').create({ model: pidP.model, outputs: [{ id: 't', kind: 'series', time: true }, { id: 'y', kind: 'series', signal: 'y' }] }, { seed: 1 }).run({ $tran: { tEnd: 10, dt: 0.01 } });
    let integ = 0; for (let k = 1; k < ref.y.length; k++) integ += 0.5 * (ref.t[k] - ref.t[k - 1]) * (ref.y[k] + ref.y[k - 1]);
    ok(rc.outputs && rc.outputs.yv.length === 201 && Math.abs(rc.outputs.zEnd - integ) < 0.02 * integ && !rc.codes.length, `cosim pid@1 → ode@1: ∫y dt over the macro steps ${rc.outputs && rc.outputs.zEnd.toFixed(4)} ≈ ${integ.toFixed(4)} (zero-order hold, first order in dt)`);
  }

  // ---------- 4. the reference activities ----------
  for (const id of ['pk-ode', 'genetics-prob', 'ancient-voyage']) {
    const dir = path.join(ROOT, 'tools', 'activities_examples', id);
    if (!fs.existsSync(dir)) { ok(false, `${id}: the reference activity exists`); continue; }
    const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.json'), 'utf8')), strings = {};
    for (const f of fs.readdirSync(dir)) { const m = f.match(/^strings\.(.+)\.json$/); if (m) strings[m[1]] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    const e1 = PC.checkSimSpec(spec, strings, null, { parts: {} });
    ok(!e1.length && ['en', 'el', 'fr', 'ru', 'de'].every(l => strings[l]), `${id}: the spec passes the content checks, with strings in en, el, fr, ru and de ${e1.slice(0, 2).join(' | ')}`);
    const tests = JSON.parse(fs.readFileSync(path.join(dir, 'tests.json'), 'utf8'));
    for (const [k, tc] of (tests.cases || []).entries()) {
      const env = {}; for (const p of spec.params || []) env[p.id] = p.kind === 'toggle' ? !!p.default : p.kind === 'choice' ? (p.default ?? p.options[0].value) : p.default;
      for (const s of tc.steps || []) if (s.set !== undefined) env[s.set] = s.value;
      const r = await runParts(spec, env, { seed: 12345 }), all = r.outputs ? { ...r.env, ...r.outputs } : {};
      const bad = Object.entries((tc.expect && tc.expect.values) || {}).filter(([nm, w]) => { const v = all[nm]; return Array.isArray(w) ? !(v >= w[0] && v <= w[1]) : !(v === w || near(v, w, 1e-9)); });
      ok(r.outputs && !bad.length && !(r.codes || []).length, `${id}: tests.json case ${k + 1} (${tc.name || ''}) holds under the orchestrator ${bad.map(([nm]) => nm + '=' + all[nm]).join(' ')}`);
    }
  }
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('✗ ' + (e.stack || e)); process.exit(1); });
