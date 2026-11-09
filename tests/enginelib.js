/* The engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md): the shared core (src/engines/kernel/core.ts),
   the catalogue (src/engines/catalog.ts), the validators' hook (the content checks' checkSimSpec), and — for every engine whose
   module exists — checkSpec / exprs / keys against the golden outputs of its former Python twin on its fixtures tests/fixtures/enginelib/<name>.json
   ({"specs": [spec, …]}). Each engine's own science tests are tests/lib_<name>.js.  Run: node tests/enginelib.js */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibCore = ENGINES.kernel('core'), NoemaEngineCatalog = ENGINES.lib.catalog;
const C = NoemaLibCore, K = NoemaEngineCatalog, PC = NoemaCore.content;
const want = require('./golden.cjs')('enginelib');   // the golden outputs of the former Python twins (tests/golden.cjs)

// ---- 1. the core's checker gives the golden outputs of its former Python twin (tools/enginelib.py) ----
const T = { a: 'pos!', b: 'int:1:5', c: 'enum:x|y', d: 'numx', e: { $obj: { f: 'bool', g: 'key' } }, h: { $list: { id: 'id!', w: 'nonneg' }, max: 3, min: 1 }, m: { $map: 'expr', max: 2 }, r: { $req: true, $list: 'name', max: 4 } };
const cases = [
  { a: 1, r: [] }, {}, { a: -1, b: 7, c: 'z', d: '', e: { f: 1, g: 'Bad Key' }, h: [], m: { x: '', t: 'a' }, r: ['t', 'ok', '9x'] },
  { a: 2, b: 2.5, h: [{ id: 'ok', w: -1 }, { w: 1 }, 3, { id: 'a', z: 1 }], r: 'no', zz: 1 }, { a: 1, h: [{ id: 'x' }], m: { a: 'x', b: 'y', c: 'z' }, r: ['a'], d: 'k*t' }, 5, null,
];
const jsRes = cases.map(o => { const { P, E, W } = C.problems(); C.walk(o, T, 'model', E, W); return P; });
const pyRes = want('walk', JSON.stringify(T) + '\n' + JSON.stringify(cases) + '\n', jsRes);
ok(JSON.stringify(jsRes) === JSON.stringify(pyRes), `the model checker gives the golden codes, paths and messages on ${cases.length} models`);
if (JSON.stringify(jsRes) !== JSON.stringify(pyRes)) cases.forEach((c, i) => { if (JSON.stringify(jsRes[i]) !== JSON.stringify(pyRes[i])) console.log('  case', i, '\n  JS', JSON.stringify(jsRes[i]), '\n  PY', JSON.stringify(pyRes[i])); });
ok(jsRes[0].length === 0 && jsRes[1].some(p => p.path === 'model.a' && p.msg === 'missing') && jsRes[1].some(p => p.path === 'model.r'), 'required fields ("!" and $req) are reported as missing');

// ---- 2. numbers ----
const st = C.stats([1, 3, NaN, 2]);
ok(st.final === 2 && st.min === 1 && st.max === 3 && st.mean === 2 && st.pp === 2 && Math.abs(st.rms - Math.sqrt(14 / 3)) < 1e-15, 'stats: final, min, max, mean, pp, rms over the finite values');
ok(C.thin(Array.from({ length: 5000 }, (_, i) => i), 2000).length === 2000 && C.thin([1, 2, 3], 2000).length === 3, 'thin keeps ≤ 2000 values');
const r1 = C.mulberry32(C.hash32('x', 7)), r2 = C.mulberry32(C.hash32('x', 7));
ok([1, 2, 3].every(() => r1() === r2()), 'seeded randomness: the same seed draws the same numbers');
ok(C.cx('2*k + 1')({ k: 3 }) === 7 && C.cx(4)({}) === 4 && Number.isNaN(C.cx('nope(')({})) && Number.isNaN(C.cx('k')({})), 'cx: numbers and NoemaExpr formulas; a broken or unknown one gives NaN, never throws');
const sc = C.scene([0, 1, 0, 1]); sc.pt(0.5, 0.5, { c: 'hi', key: 'a' }); sc.pt(NaN, 1); sc.seg(0, 0, 1, 1, { arrow: true });
ok(sc.done().items.length === 2 && sc.done().items[0].k === 'pt', 'scenes keep only finite items');

// ---- 3. the Worker source ----
ok(ENGINES.lib.ids().every(id => typeof ENGINES.mod(id).engine.workerSource === 'string'), 'every engine has its Worker bundle: the expression language travels to the Worker with it');
{ const vm = require('vm'), ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + ENGINES.mod('ode@1').engine.workerSource, ctx);
  const S = ctx.self.__noemaShared || {};
  ok(!!S['kernel/simexpr'] && !!S['kernel/core'] && S['kernel/core'].cx('3*x')({ x: 2 }) === 6 && !!ctx.self.noemaEngine, 'the core and the expression language run in a fresh global (the Worker)'); }

// ---- 4. the catalogue ----
const ids = K.CATALOG.map(e => e.id);
ok(new Set(ids).size === ids.length && ['ode@1', 'prob@1', 'graph@1', 'geom@1', 'genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1', 'timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1'].every(i => K.LIBRARY.includes(i)), 'the catalogue lists every library engine once');
const libJS = Object.keys(PC.ACTIVITY_RULES.LIB).sort();
ok(JSON.stringify(libJS) === JSON.stringify(K.LIBRARY.slice().sort()) && libJS.every(i => PC.ACTIVITY_RULES.ENGINES.has(i)), 'ACT.LIB of the content checks = the catalogue\'s library, and every one is in ENGINES');
const pyLib = want('lib', undefined, [libJS, [...PC.ACTIVITY_RULES.ENGINES].sort()]);
ok(JSON.stringify(pyLib[0]) === JSON.stringify(libJS) && JSON.stringify(pyLib[1]) === JSON.stringify([...PC.ACTIVITY_RULES.ENGINES].sort()), 'ACT.LIB and ENGINES = the golden lists');
for (const [q, want] of [['predator prey population oscillations', 'ode@1'], ['Ύφανση σε αργαλειό', 'craft@1'], ['the brachial plexus: a nerve lesion', 'anatomy@1'], ['Hijri and Hebrew calendar dates of an event', 'timeline@1'], ['sensitivity and specificity of a test', 'med@1'], ['Wahrscheinlichkeit und Verteilung', 'prob@1'], ['кратчайший путь в графе', 'graph@1'], ['intervalle et accord', 'music@1']])
  ok((K.suggest(q)[0] || {}).id === want, `suggest("${q}") → ${want}`);
ok(K.suggest('').length === 0 && K.suggest('zz').length === 0, 'suggest of nothing is nothing');
for (const e of K.CATALOG.filter(e => e.layer === 'library' && e.plugin)) ok(fs.existsSync(path.join(ROOT, e.file)), `${e.id}: its module ${e.file} exists`);

// ---- 5. the validators' hook, scene / sound plots and line styles (the old messages stay for other engines) ----
const base = { format: 'noema.sim-spec/v1', params: [{ id: 'k', kind: 'slider', label: 'k', min: 0, max: 1, default: 0.5 }] };
const mk = (o) => ({ ...base, ...o });
const old = PC.checkSimSpec(mk({ engine: 'rf@1', plots: [{ kind: 'scene', of: 'x' }] }), null);
ok(old.some(m => m === 'spec.plots[0] must be a plot {kind: function | series, x, y, series}'), 'another engine keeps the old plot message word for word');
const pyOld = want('plot.old', JSON.stringify(mk({ engine: 'rf@1', plots: [{ kind: 'scene', of: 'x' }] })), old);
ok(JSON.stringify(old) === JSON.stringify(pyOld), 'the same as the golden output');
const style = mk({ plots: [{ kind: 'function', x: { var: 'x', min: 0, max: 1 }, series: [{ expr: 'k*x', style: 'bars' }, { expr: 'x', style: 'zig' }] }] });
const st1 = PC.checkSimSpec(style, null), st2 = want('plot.style', JSON.stringify(style), st1);
ok(st1.length === 1 && /series\[1\]\.style is one of line, bars, steps, points/.test(st1[0]) && JSON.stringify(st1) === JSON.stringify(st2), 'line styles: bars, steps, points are known; others refused (= the golden output)');

// ---- 6. every engine that exists: the golden outputs of its former Python twin (tools/lib_<slug>.py) on its fixtures ----
const FIX = path.join(ROOT, 'tests', 'fixtures', 'enginelib');
for (const e of K.CATALOG.filter(e => e.layer === 'library' && e.plugin)) {
  const M = ENGINES.lib.loaded(e.id), name = e.slug, fx = path.join(FIX, name + '.json');
  if (!M) { console.log(`· ${e.id}: not built yet (no module ${e.file})`); continue; }
  ok(typeof M.checkSpec === 'function' && typeof M.exprs === 'function' && typeof M.keys === 'function' && M.engine && M.engine.id === e.id && typeof M.engine.workerSource === 'string', `${e.id}: the module API (checkSpec, exprs, keys, engine with workerSource)`);
  ok(fs.existsSync(fx), `${e.id}: its fixtures tests/fixtures/enginelib/${name}.json`);
  if (!fs.existsSync(fx)) continue;
  const specs = JSON.parse(fs.readFileSync(fx, 'utf8')).specs || [];
  const js = specs.map(s => ({ p: M.checkSpec(s), x: M.checkSpec(s).some(p => p.level === 'error') ? null : M.exprs(s), k: M.checkSpec(s).some(p => p.level === 'error') ? null : M.keys(s), v: PC.checkSimSpec(s, null) }));
  const pr = want('spec.' + name, JSON.stringify(specs), js);
  const norm = v => JSON.stringify(v, (k, x) => Array.isArray(x) ? x : x);
  let same = 0; js.forEach((r, i) => { if (norm(r) === norm(pr[i])) same++; else if (same + 5 > i) console.log(`  ${e.id} spec ${i}\n  JS ${norm(r).slice(0, 600)}\n  PY ${norm(pr[i]).slice(0, 600)}`); });
  ok(specs.length >= 10 && same === specs.length, `${e.id}: the golden outputs on ${same}/${specs.length} specs (checkSpec, exprs, keys and the whole checkSimSpec)`);
  ok(specs.some(s => !PC.checkSimSpec(s, null).length) && specs.some(s => PC.checkSimSpec(s, null).length), `${e.id}: the fixtures hold good and bad specs`);
}
// ---- the reference activity of every library engine (docs/INTERACTIVE_LIBRARY.md §1.1): its spec passes both validators with its
//      own string tables, it has the five pack languages and tests.json, and the skill's activity_new.py --from knows it ----
{
  const EX = path.join(ROOT, 'tools', 'activities_examples'), anew = fs.readFileSync(path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', 'activity_new.py'), 'utf8');
  const refs = fs.readdirSync(EX).filter(d => fs.existsSync(path.join(EX, d, 'spec.json'))).map(d => ({ d, spec: JSON.parse(fs.readFileSync(path.join(EX, d, 'spec.json'), 'utf8')) })).filter(r => Object.prototype.hasOwnProperty.call(PC.ACTIVITY_RULES.LIB, r.spec.engine));
  for (const e of K.CATALOG.filter(x => x.layer === 'library' && x.plugin && ENGINES.lib.loaded(x.id) && ENGINES.lib.loaded(x.id).checkSpec)) {
    const mine = refs.filter(r => r.spec.engine === e.id);
    ok(mine.length > 0, `${e.id}: has a reference activity (${mine.map(r => r.d).join(', ') || 'none'})`);
    for (const { d, spec } of mine) {
      const tables = Object.fromEntries(['en', 'el', 'ru', 'de', 'fr'].filter(l => fs.existsSync(path.join(EX, d, `strings.${l}.json`))).map(l => [l, JSON.parse(fs.readFileSync(path.join(EX, d, `strings.${l}.json`), 'utf8'))]));
      const jsE = PC.checkSimSpec(spec, tables);
      ok(!jsE.length, `${e.id}: ${d} passes checkSimSpec with its strings` + (jsE.length ? ': ' + jsE.slice(0, 3).join(' | ') : ''));
      ok(Object.keys(tables).length === 5 && fs.existsSync(path.join(EX, d, 'tests.json')) && new RegExp(`'${d}': '${e.id.replace('@', '@')}'`).test(anew), `${e.id}: ${d} has strings in en, el, ru, de, fr, tests.json, and activity_new.py --from ${d}`);
    }
  }
}
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
