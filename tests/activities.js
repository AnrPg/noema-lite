/* Interactive activities without a browser (docs/INTERACTIVE.md, docs/adr/001):
   1. the loop guard (engine/src/33_activity_guard.js): every loop gets the guard, nothing else changes, the program still runs
      the same, an endless loop throws; strings, templates, regexes and comments are left alone;
   2. the protocol checks (ACTP in engine/src/32_activities.js): sizes, types, payloads, a newer version;
   3. the rules in JS (engine/packcheck.js checkActivities) and Python (tools/activities.py) give the same errors on the same packs;
   4. no code path ever gives a frame allow-same-origin.
   Usage: node tests/activities.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };

// 1. the loop guard
require(path.join(ROOT, 'engine', 'src', '33_activity_guard.js'));
const LG = globalThis.NoemaLoopGuard;
const T = src => LG.transform(src, 'G').code;
ok(T('while (a) b();') === 'while (G()&&(a)) b();', 'while (c) → while (G()&&(c))');
ok(T('do { x++ } while (x < 3);') === 'do { x++ } while (G()&&(x < 3));', 'do … while (c) gets the guard too');
ok(T('for (let i = 0; i < n; i++) f(i);') === 'for (let i = 0;G()&&( i < n); i++) f(i);', 'for (a; b; c) → for (a; G()&&(b); c)');
ok(T('for (;;) f();') === 'for (;G();) f();', 'for (;;) → for (;G();)');
ok(T('for (const x of xs) f(x);') === 'for (const x of G.it( xs)) f(x);', 'for (x of y) → for (x of G.it(y))');
ok(T('for await (const x of xs) f(x);') === 'for await (const x of xs) f(x);', 'for await is left alone (it pauses anyway)');
ok(T('for (const k in o) f(k);') === 'for (const k in o) f(k);', 'for (k in o) is finite: left alone');
const quiet = 's = "while (1) {}"; t = `for (;;) ${a} while(x)`; r = /while\\(/g; // while (true)\n/* for (;;) */ o.while(1); o?.for(2);';
ok(T(quiet) === quiet, 'strings, template literals, regexes, comments and properties named while/for are untouched');
ok(T('x = a / b; while (c) d();') === 'x = a / b; while (G()&&(c)) d();', 'a division is not taken for a regex');
ok(T('for (let i = 0, j = (k, 1); i < f(a, b); i++) {}') === 'for (let i = 0, j = (k, 1);G()&&( i < f(a, b)); i++) {}', 'nested brackets in a for head');
ok(LG.transform('while(a){} for(;;){} for(x of y){}', 'G').loops === 3, 'it counts the loops it guarded');
// the guarded program runs the same, and an endless one is stopped
const runIn = (code, budget = 200) => {
  const ctx = { performance: { now: () => Date.now() }, MessageChannel: class { constructor() { this.port1 = {}; this.port2 = { postMessage() { } }; } }, Object, Symbol, Error, window: {} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(LG.runtime('G', budget, 'function(){ window.tripped = true; }'), ctx);
  return { r: vm.runInContext(LG.transform(code, 'G').code, ctx), ctx };
};
ok(runIn('var s = 0; for (var i = 0; i < 1000; i++) s += i; var t = 0; for (var x of [1, 2, 3]) t += x; var k = 0; while (k < 10) k++; [s, t, k].join()').r === '499500,6,10', 'a guarded program computes what it did before');
let thrown = null, ctxT = null; const t0 = Date.now();
try { runIn('while (true) {}', 200); } catch (e) { thrown = e; }
ok(thrown && /ran too long/.test(thrown.message) && Date.now() - t0 < 2000, `an endless loop throws after the budget (${Date.now() - t0} ms)`);
try { const x = runIn('var it = { [Symbol.iterator]() { return { next: () => ({ done: false, value: 1 }) }; } }; for (var v of it) {}', 200); ctxT = x.ctx; } catch (e) { thrown = e; }
ok(/ran too long/.test(thrown.message), 'an endless iterator (for … of) is stopped too');
ok(fs.readFileSync(path.join(ROOT, 'engine', 'src', '34_activity_html.js'), 'utf8').includes('NoemaLoopGuard.transform(s.textContent, G)'), 'html-app@1 guards every script of the bundle before it hashes it');

// 2. the protocol checks
const src32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8');
const actpSrc = src32.slice(src32.indexOf('const ACTP = '), src32.indexOf('const ACT = ('));
const ACTP = vm.runInNewContext(actpSrc + '; ACTP', { TextEncoder, JSON, Object, Array, Number, String, Math });
const M = (type, payload, extra) => ({ p: 'noema.activity', v: 1, type, payload, ...(extra || {}) });
ok(ACTP.check(M('ready', { protocols: [1] })).ok, 'ready is accepted');
ok(!ACTP.check({ p: 'other', v: 1, type: 'ready' }).ok, 'another protocol is refused');
ok(ACTP.check(M('ready', {}, { v: 2 })).version, 'a newer protocol version is told apart (the app says it needs a newer build)');
ok(!ACTP.check(M('result', { score: 2, passed: true })).ok && !ACTP.check(M('result', { score: 0.5 })).ok, 'result: score in [0, 1] and passed are required');
ok(ACTP.check(M('result', { score: 1, passed: true, detail: 'fs=10' })).ok, 'a good result is accepted');
ok(ACTP.check(M('nonsense', {})).ignore, 'an unknown type is ignored, not a strike');
ok(!ACTP.check(M('state', { version: 1, data: 'x'.repeat(300 * 1024) })).ok, 'a state over 256 KB is refused');
ok(!ACTP.check(M('event', { name: 'x', data: 'y'.repeat(70 * 1024) })).ok, 'a message over 64 KB is refused');
ok(!ACTP.check(M('resize', { h: 'tall' })).ok && ACTP.check(M('resize', { h: 300 })).ok, 'resize needs a number');
ok(!ACTP.check(null).ok && !ACTP.check('hello').ok, 'not an object → refused');

// 3. the same rules in JS and Python
require(path.join(ROOT, 'engine', 'packcheck.js'));
const P = globalThis.NoemaPackCheck;
const html = fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', 'app.html'), 'utf8');
const crypto = require('crypto');
const strings = Object.fromEntries(['en', 'el', 'ru'].map(l => [l, JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', `strings.${l}.json`), 'utf8'))]));
const item = { ...JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'alias-lab', 'activity.json'), 'utf8')), html, sha256: crypto.createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html), strings };
delete item.entry;
const base = () => JSON.parse(JSON.stringify({ subject: { id: 'x', language: 'en' }, media: { 'alias-lab-still': { w: 600, h: 220 } }, requires: ['activities/v1', 'runtime:html-app@1'], activities: { format: 'noema.activities/v1', items: [item] },
  chapters: [{ id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'interactive', activity: 'alias-lab' }] }], exercises: [{ id: 'ch01-e1', type: 'sim', activity: 'alias-lab', grade: { mode: 'reported' }, task: { seed: 'auto', params: { f: 7 } }, hints: ['a'] }] }] }));
const cases = {
  good: p => p,
  'no format': p => { p.activities.format = 'x'; },
  'bad id': p => { p.activities.items[0].id = 'Alias Lab'; },
  'later runtime': p => { p.activities.items[0].runtime = 'sim-spec@1'; },
  'unknown runtime': p => { p.activities.items[0].runtime = 'flash@9'; },
  'no fallback': p => { delete p.activities.items[0].fallback; },
  'fallback picture missing': p => { p.activities.items[0].fallback.media = 'nope'; },
  'missing locale': p => { delete p.activities.items[0].strings.ru; p.translations = { el: {}, ru: {} }; },
  'keys differ': p => { delete p.activities.items[0].strings.el.signal; },
  'network': p => { p.activities.items[0].html += '<img src="//x.example/a.png">'; p.activities.items[0].sha256 = null; p.activities.items[0].bytes = null; },
  'handler': p => { p.activities.items[0].html += '<button onclick="x()">'; p.activities.items[0].sha256 = null; p.activities.items[0].bytes = null; },
  'sha mismatch': p => { p.activities.items[0].sha256 = '0'.repeat(64); },
  'no requires': p => { p.requires = []; },
  'unknown activity': p => { p.chapters[0].sections[0].blocks[0].activity = 'nope'; },
  'checks grading': p => { p.chapters[0].exercises[0].grade = { mode: 'checks' }; },
  'bad seed': p => { p.chapters[0].exercises[0].task.seed = -1; },
  'bad height': p => { p.chapters[0].sections[0].blocks[0].height = 50; },
  'too many hints': p => { p.chapters[0].exercises[0].hints = Array(7).fill('h'); },
};
const packs = Object.entries(cases).map(([k, f]) => { const p = base(); f(p); return [k, p]; });
const tmp = path.join(require('os').tmpdir(), 'noema-act-parity.json'); fs.writeFileSync(tmp, JSON.stringify(packs));
const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import activities as A
out = {}
for k, p in json.load(open(sys.argv[1], encoding='utf-8')):
    e, w = A.check_activities(p, list((p.get('translations') or {}).keys())); out[k] = [len(e), len(w)]
print(json.dumps(out))`, tmp], { encoding: 'utf8' }));
for (const [k, p] of packs) {
  const js = P.checkActivities(p, Object.keys(p.translations || {}));
  const same = js.errors.length === py[k][0];
  ok(same && (k === 'good' ? js.errors.length === 0 : js.errors.length > 0), `${k}: JS ${js.errors.length} error(s), Python ${py[k][0]}${k === 'good' ? ' (a good pack passes)' : ''}${same ? '' : '  JS: ' + js.errors.join(' | ')}`);
}
ok(P.TYPES.has('sim') && P.BLOCKS.has('interactive'), 'packcheck knows the sim type and the interactive block');

// 4. never allow-same-origin
const files = cp.execSync('git ls-files engine cloud tools skill', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.(js|mjs|py|html)$/.test(f) && !f.startsWith('engine/i18n/') && !f.includes('vendor/'));
const bad = [];
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/sandbox['"]?\s*[:,=]\s*['"`][^'"`]*allow-same-origin/g)) bad.push(f + ': ' + m[0].slice(0, 80));   // a sandbox VALUE with the token
}
const okFiles = ['engine/viewer.js'];   // (the source viewer frames an outside web page from its own URL: its own origin, never pack content)
ok(bad.filter(b => !okFiles.some(f => b.startsWith(f))).length === 0, 'no code gives a frame allow-same-origin ' + JSON.stringify(bad.filter(b => !okFiles.some(f => b.startsWith(f))).slice(0, 3)));
ok(/setAttribute\('sandbox', 'allow-scripts'\)/.test(fs.readFileSync(path.join(ROOT, 'engine', 'src', '34_activity_html.js'), 'utf8')), 'html-app@1 sets sandbox to exactly allow-scripts');
// 5. the content author learns it: the connector's guide has the part "interactive" (docs/INTERACTIVE.md + the playbook), the skill ships the toolkit
const srv = fs.readFileSync(path.join(ROOT, 'cloud', 'mcp', 'server.mjs'), 'utf8'), bld = fs.readFileSync(path.join(ROOT, 'tools', 'build.py'), 'utf8');
ok(/enum: \['workflow', 'content', 'visual', 'interactive'/.test(srv) && /interactive: DOCS\.interactive/.test(srv) && /docs\['interactive'\] = rd\('docs\/INTERACTIVE\.md'\)/.test(bld), 'noema_authoring_guide serves part "interactive" (and in "all")');
for (const f of ['activity_new.py', 'activity_lint.py', 'activity_test.py', 'activity_preview.py', 'activity_harness.js']) ok(fs.existsSync(path.join(ROOT, 'skill', 'noema-pack-builder', 'scripts', f)), 'the skill has ' + f);
ok(/'activities\.py'/.test(bld) && /activity_host/.test(bld) && /activities_examples/.test(bld), 'the skill zip carries activities.py, the runtime for the harness and the reference activity');
console.log(fails ? `\n${fails} of ${n} failed` : `\nactivities: ${n} checks passed`); process.exit(fails ? 1 : 0);
