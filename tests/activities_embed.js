/* external-embed@1 (docs/activities-dev/embed.md): an allow-listed third-party page in a frame, opt-in, explore only.
   1. Node (always): the runtime's copy of the allow-list equals tools/embed_allow.json; the URL grammar and the item / pack rules give the
      same codes in JS (engine/src/45_activity_embed.js NoemaEmbed) and Python (tools/embed_check.py) on the same cases; the runtime
      registers only when the deployment switches it on; no provider asks for a sandbox token outside the safe set.
   2. Browser (with --browser): a stub host (like skill/noema-pack-builder/scripts/activity_harness.js) with the real runtime on
      http://localhost:<a>, and a LOCAL fake provider on https://127.0.0.1:<b> (a self-signed certificate, made here with openssl)
      standing in for a real one — the internet is never used. Checks: the consent card comes first and nothing is requested from the
      provider before Open; Open loads only the allowed origin (no Referer); a disallowed URL is refused → fallback; the page cannot
      navigate the top page, its parent or itself to another origin, nor open popups (a beacon server counts every try); offline →
      fallback; the choice is remembered per provider (and across a reload); an exercise is refused (explore only).
   Usage: node tests/activities_embed.js [--browser]     (BROWSERS=chromium,firefox,webkit; NODE_PATH=$(npm root -g)) */
const path = require('path'), fs = require('fs'), cp = require('child_process'), vm = require('vm'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + m); return c; };
const SRC = fs.readFileSync(path.join(ROOT, 'engine', 'src', '45_activity_embed.js'), 'utf8');
const ALLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'embed_allow.json'), 'utf8'));
const E = require(path.join(ROOT, 'engine', 'src', '45_activity_embed.js'));
const codes = list => list.map(m => (m.match(/(?:^|: )([a-z][a-z-]+):/) || [])[1] || m).sort();
const py = (fn, payload) => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'noema-embed-')), 'cases.json'); fs.writeFileSync(tmp, JSON.stringify(payload));
  return JSON.parse(cp.execFileSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import embed_check as C
d = json.load(open(sys.argv[1], encoding='utf-8')); out = {}
${fn}
print(json.dumps(out))`, tmp], { encoding: 'utf8' }));
};

console.log('— the allow-list');
ok(JSON.stringify(E.PROVIDERS) === JSON.stringify(ALLOW.providers), 'the runtime\'s copy of the allow-list equals tools/embed_allow.json');
ok(ALLOW.providers.every(p => p.origins.every(o => /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o)) && Array.isArray(p.sandbox) && p.sandbox.every(t => E.SANDBOX_OK.has(t))), 'every provider: exact https origins, sandbox tokens from the safe set only');
ok(!JSON.stringify(ALLOW).match(/allow-top-navigation|allow-popups-to-escape-sandbox|allow-modals|allow-downloads/), 'no provider gets top navigation, escaping popups, modals or downloads');
ok(ALLOW.providers.every(p => p.supportsResult === false), 'no provider has a result channel: every embed is explore only');
ok(ALLOW.providers.every(p => ['id', 'name', 'status', 'origins', 'path', 'licenses', 'creditMust', 'credit', 'terms', 'notes'].every(k => k in p) && /^https:\/\//.test(p.terms)), 'every provider has its licence, credit template, terms URL and notes');
ok(['phet', 'geogebra', 'desmos'].every(id => E.PROVIDERS.find(p => p.id === id)?.status === 'allowed') && ['falstad', 'circuitjs', 'wokwi'].every(id => E.PROVIDERS.find(p => p.id === id)?.status === 'pending'), 'allowed: PhET, GeoGebra, Desmos; pending (terms not confirmed): Falstad, CircuitJS1, Wokwi');

console.log('— URLs: the grammar and the exact match (JS and Python)');
const PH = 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html';
const URLS = [
  ['phet', PH, 'ok'], ['phet', PH + '?locale=el', 'ok'], ['phet', 'https://phet.colorado.edu/sims/html/ohms-law/1.4.21/ohms-law_el.html', 'ok'],
  ['geogebra', 'https://www.geogebra.org/material/iframe/id/hpyyrskt/width/800/height/600/border/888888', 'ok'],
  ['desmos', 'https://www.desmos.com/calculator/zukjgk9iry?embed', 'ok'],
  ['phet', 'http://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html', 'url-scheme'],
  ['phet', 'javascript:alert(1)', 'url-scheme'], ['phet', 'data:text/html,<b>x</b>', 'url-scheme'], ['phet', 'HTTPS://phet.colorado.edu/sims/html/a/latest/a_all.html', 'url-scheme'],
  ['phet', '//phet.colorado.edu/sims/html/a/latest/a_all.html', 'url-scheme'], ['phet', ' ' + PH, 'url-scheme'], ['phet', '', 'url-missing'], ['phet', 42, 'url-missing'],
  ['phet', PH + ' ', 'url-chars'], ['phet', PH.replace('ohms-law_all', 'ohms\\law_all'), 'url-chars'], ['phet', 'https://phet.colorado.edu/sims/html/ohmé/latest/a_all.html', 'url-chars'],
  ['phet', PH + '\n', 'url-chars'], ['phet', PH.replace('.html', '.html"onload="x'), 'url-chars'],
  ['phet', 'https://user@phet.colorado.edu/sims/html/a/latest/a_all.html', 'url-userinfo'], ['phet', 'https://phet.colorado.edu@evil.example/sims/html/a/latest/a_all.html', 'url-userinfo'],
  ['phet', 'https://PHET.colorado.edu/sims/html/a/latest/a_all.html', 'url-host'], ['phet', 'https://phet.colorado.edu./sims/html/a/latest/a_all.html', 'url-host'], ['phet', 'https://localhost/x', 'url-host'],
  ['phet', 'https://phet.colorado.edu.evil.example/sims/html/a/latest/a_all.html', 'url-origin'], ['phet', 'https://phet.colorado.edu:8443/sims/html/a/latest/a_all.html', 'url-origin'],
  ['phet', 'https://evil.example/sims/html/a/latest/a_all.html', 'url-origin'], ['geogebra', PH, 'url-origin'],
  ['phet', 'https://phet.colorado.edu/sims/html/../../evil/a_all.html', 'url-path'], ['phet', 'https://phet.colorado.edu/sims/html/a/latest/%2e%2e/a_all.html', 'url-path'],
  ['phet', 'https://phet.colorado.edu//sims/html/a/latest/a_all.html', 'url-path'], ['phet', 'https://phet.colorado.edu/en/simulations/ohms-law', 'url-path'], ['phet', 'https://phet.colorado.edu', 'url-path'],
  ['phet', PH + '?locale=el&brand=x', 'url-query'], ['phet', PH + '?', 'ok'], ['desmos', 'https://www.desmos.com/calculator/zukjgk9iry', 'url-query'], ['desmos', 'https://www.desmos.com/calculator/zukjgk9iry?embed&x', 'url-query'],
  ['phet', PH + '#x', 'url-hash'], ['phet', PH + 'x'.repeat(2100), 'url-long'],
];
const pyU = py(`for i, (pid, u, _) in enumerate(d):
    p = next(x for x in C.providers() if x['id'] == pid); m = C.match(u, p); out[i] = 'ok' if m.get('ok') else m['code']`, URLS);
URLS.forEach(([pid, u, want], i) => {
  const m = E.match(u, E.PROVIDERS.find(p => p.id === pid)), js = m.ok ? 'ok' : m.code;
  ok(js === want && pyU[i] === want, `${pid} ${JSON.stringify(String(u).slice(0, 70))} → ${want}${js !== want || pyU[i] !== want ? `  (JS ${js}, Python ${pyU[i]})` : ''}`);
});

console.log('— items and packs (JS and Python give the same codes)');
const good = () => ({ id: 'ohm-phet', runtime: 'external-embed@1', provider: 'phet', url: PH + '?locale=el', stateVersion: 1,
  credit: 'PhET Interactive Simulations, University of Colorado Boulder · Ohm\'s Law · CC-BY-4.0 · https://phet.colorado.edu', license: 'CC-BY-4.0',
  fallback: { media: 'ohm-still', text: 'Ohm\'s law: the current grows with the voltage and falls with the resistance (I = V / R).' },
  strings: { en: { title: 'Ohm\'s law simulation', why: 'Move V and R and watch I.' }, el: { title: 'Προσομοίωση του νόμου του Ohm' } } });
const ITEMS = {
  good: [a => a, []],
  'wrong runtime': [a => { a.runtime = 'html-app@1'; }, ['runtime']],
  'unknown provider': [a => { a.provider = 'flashsims'; }, ['provider-unknown']],
  'unknown provider, javascript: url': [a => { a.provider = 'x'; a.url = 'javascript:alert(1)'; }, ['provider-unknown', 'url-scheme']],
  'pending provider': [a => { a.provider = 'wokwi'; a.url = 'https://wokwi.com/projects/305569599398609473'; a.credit = 'Blink · simulated on Wokwi'; a.license = 'Wokwi-ToS'; }, ['provider-pending']],
  'url of another provider': [a => { a.url = 'https://www.desmos.com/calculator/zukjgk9iry?embed'; }, ['url-origin']],
  'data: url': [a => { a.url = 'data:text/html,hi'; }, ['url-scheme']],
  'no credit': [a => { delete a.credit; }, ['credit-missing']],
  'credit without the provider': [a => { a.credit = 'A simulation'; }, ['credit-provider']],
  'no licence': [a => { a.license = ''; }, ['license-missing']],
  'licence not the provider\'s': [a => { a.license = 'MIT'; }, ['license-provider']],
  'no fallback': [a => { delete a.fallback; }, ['fallback-missing']],
  'short fallback': [a => { a.fallback.text = 'a sim'; }, ['fallback-missing']],
  'capabilities': [a => { a.capabilities = ['result']; }, ['capabilities']],
  'a bundle too': [a => { a.html = '<p>x'; }, ['not-embed']],
  'no title': [a => { delete a.strings.el.title; }, ['strings-title']],
  'no strings': [a => { delete a.strings; }, ['strings-title']],
  'bad height': [a => { a.height = 50; }, ['height']],
  'non-commercial licence (a warning)': [a => { a.license = 'CC-BY-NC-4.0'; }, []],
  'not an object': [a => null, ['item']],
};
const itemCases = Object.entries(ITEMS).map(([k, [f]]) => { const a = good(); const r = f(a); return [k, r === null ? null : a]; });
const pyI = py(`for k, a in d:
    e, w = C.check_item(a); out[k] = [e, w]`, itemCases);
for (const [k, a] of itemCases) {
  const js = E.check(a), want = ITEMS[k][1].slice().sort(), jc = codes(js.errors), pc = codes(pyI[k][0]);
  ok(JSON.stringify(jc) === JSON.stringify(want) && JSON.stringify(pc) === JSON.stringify(want) && js.warnings.length === pyI[k][1].length,
    `${k}: ${want.join(', ') || 'no errors'}${JSON.stringify(jc) !== JSON.stringify(want) || JSON.stringify(pc) !== JSON.stringify(want) ? `  (JS ${jc.join(',')} | Python ${pc.join(',')})` : ''}`);
}
ok(E.check({ ...good(), license: 'CC-BY-NC-4.0' }).warnings.some(w => /^license-nc/.test(w)), 'a non-commercial licence is a warning (the owner decides)');
const pack = sim => ({ activities: { format: 'noema.activities/v1', items: [good(), { id: 'other', runtime: 'html-app@1' }] },
  chapters: [{ id: 'ch01', exercises: sim ? [{ id: 'ch01-e900', type: 'sim', activity: 'ohm-phet' }] : [{ id: 'ch01-e1', type: 'mcq' }] }] });
const pyP = py(`for k, p in d:
    e, w = C.check_pack(p); out[k] = e`, [['block', pack(false)], ['sim', pack(true)]]);
ok(E.checkPack(pack(false)).errors.length === 0 && pyP.block.length === 0, 'a pack with the embed in a theory block passes (other runtimes are left to their own checks)');
ok(E.checkPack(pack(true)).errors.some(m => /sim-embed/.test(m)) && pyP.sim.some(m => /sim-embed/.test(m)), 'a sim exercise on an embed is refused (explore only), in JS and Python');
ok(cp.spawnSync('python3', ['-I', path.join(ROOT, 'tools', 'embed_check.py'), path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'noema-embed-')), 'x.json')], { encoding: 'utf8' }).status !== 0, 'embed_check.py: a missing file fails');

console.log('— registration (opt-in per deployment)');
const reg = cfg => { const got = []; const ctx = { ACT: { registerRuntime: d => got.push(d.id) }, window: { NOEMA_CONFIG: cfg }, document: {}, console, Promise, setTimeout, clearTimeout, URL }; vm.createContext(ctx); vm.runInContext(SRC, ctx); return got; };
ok(reg(undefined).length === 0 && reg({ activities: { 'external-embed@1': 'yes' } }).length === 0, 'not switched on: the runtime does not register (packs that need it show their fallback)');
ok(JSON.stringify(reg({ activities: { 'external-embed@1': true } })) === '["external-embed@1"]', 'NOEMA_CONFIG.activities["external-embed@1"] === true: it registers');
ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(SRC), 'the runtime never writes HTML from strings and never evaluates code');
ok(!/allow-top-navigation|allow-popups-to-escape/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\/\*@providers\*\/[\s\S]*?\/\*@end\*\//, '')), 'the runtime\'s code names no top-navigation or escaping-popup token');

/* ======================================== 2. the browser part ======================================== */
async function browserPart() {
  let pw; try { pw = require(process.env.PW || 'playwright'); } catch (e) { ok(false, 'Playwright is missing (NODE_PATH=$(npm root -g))'); return; }
  const http = require('http'), https = require('https');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-embed-tls-'));
  cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const provHits = [], beaconHits = [];
  const listen = (srv, host) => new Promise(r => srv.listen(0, host, () => r(srv.address().port)));
  const beacon = http.createServer((q, r) => { beaconHits.push(q.url); r.end('gone'); });
  const BPORT = await listen(beacon, '127.0.0.1'), BEACON = `http://127.0.0.1:${BPORT}/beacon`;
  const fakePage = `<!doctype html><meta charset="utf-8"><title>fake</title><body><h1 id="h">fake sim</h1><button id="top">top</button>
<a id="blank" target="_blank" href="${BEACON}?blank">x</a><form id="f" action="${BEACON}" target="_top" method="get"><input name="form" value="1"></form><script>
var B = ${JSON.stringify(BEACON)}, t = new URLSearchParams(location.search).get('t');
try { localStorage.setItem('k', '1'); document.body.dataset.ls = localStorage.getItem('k'); } catch (e) { document.body.dataset.ls = 'no'; }
document.getElementById('top').onclick = function () { try { top.location.href = B + '?click'; } catch (e) { } document.body.dataset.click = '1'; };
if (t === 'hostile') setTimeout(function () {
  try { top.location.href = B + '?top'; } catch (e) { }
  try { var w = window.open(B + '?open'); document.body.dataset.popup = w ? 'yes' : 'no'; } catch (e) { document.body.dataset.popup = 'no'; }
  try { document.getElementById('blank').click(); } catch (e) { }
  try { document.getElementById('f').submit(); } catch (e) { }
  try { parent.location.href = B + '?parent'; } catch (e) { }
  try { top.postMessage({ p: 'noema.activity', v: 1, type: 'result', payload: { score: 1, passed: true } }, '*'); } catch (e) { }
  document.body.dataset.tried = '1';
  setTimeout(function () { location.href = B + '?self'; }, 400);
}, 200);
</script>`;
  const prov = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, (q, r) => {
    provHits.push({ url: q.url, referer: q.headers.referer || null });
    if (q.url.startsWith('/sims/html/fake/latest/fake_all.html') || q.url.startsWith('/other.html')) { r.setHeader('Content-Type', 'text/html'); r.setHeader('Set-Cookie', 'fake=1; Secure; SameSite=None'); r.end(fakePage); }
    else { r.statusCode = 404; r.end(); }
  });
  const PPORT = await listen(prov, '127.0.0.1'), PROV = `https://127.0.0.1:${PPORT}`;
  const TEST_PROVIDERS = [
    { id: 'fake', name: 'FakeSim', status: 'allowed', origins: [PROV], path: '/sims/html/fake/latest/fake_all\\.html', query: '(t=[a-z]+)?', hash: null, sandbox: ['allow-scripts', 'allow-same-origin'], licenses: ['CC-BY-4.0'], creditMust: 'Fake Lab', credit: 'Fake Lab · {title} · {license}', terms: PROV + '/terms', supportsResult: false, notes: 'test' },
    { id: 'fake2', name: 'OtherSim', status: 'allowed', origins: [PROV], path: '/other\\.html', query: null, hash: null, sandbox: ['allow-scripts', 'allow-same-origin'], licenses: ['CC-BY-4.0'], creditMust: 'Other Lab', credit: 'Other Lab', terms: PROV + '/terms2', supportsResult: false, notes: 'test' },
    { id: 'fakepending', name: 'PendingSim', status: 'pending', origins: [PROV], path: '/.*', query: '.*', hash: null, sandbox: ['allow-scripts', 'allow-same-origin'], licenses: ['CC-BY-4.0'], creditMust: 'P', credit: 'P', terms: PROV + '/t3', supportsResult: false, notes: 'test' },
  ];
  const s32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8'), ACTPsrc = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));
  const rt = SRC.replace(/\/\*@providers\*\/[\s\S]*?\/\*@end\*\//, () => '/*@providers*/' + JSON.stringify(TEST_PROVIDERS) + '/*@end*/');
  const HOST = `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(ROOT, 'engine', 'src', '45_activity_embed.css'), 'utf8')}</style>
<body style="margin:0;font-family:system-ui"><div id="box" class="act-box" style="position:relative;width:100%;height:420px"></div><div id="fb"></div><script>
window.NOEMA_CONFIG = { activities: { 'external-embed@1': true } };
var S = { settings: (function () { try { return JSON.parse(localStorage.getItem('embedS') || '{}'); } catch (e) { return {}; } })() };
function save() { localStorage.setItem('embedS', JSON.stringify(S.settings)); }
function tE(k, v) { return k + (v ? ' ' + JSON.stringify(v) : ''); }
var RT = null; var ACT = { registerRuntime: function (d) { RT = d; } };
${ACTPsrc}
</script><script>${rt}</script><script>
window.LOG = []; window.H = null;
window.run = function (act, init) {
  var box = document.getElementById('box'); box.innerHTML = ''; document.getElementById('fb').textContent = ''; window.LOG = [];
  if (window.H) try { window.H.close(); } catch (e) { }
  window.H = RT.mount(box, { act: act, init: init, title: 'activity ' + act.id,
    onMessage: function (raw) { var r = ACTP.check(raw); LOG.push(r.ok ? r.msg : { type: 'bad', why: r.why }); },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); try { H.close(); } catch (e) { } document.getElementById('fb').textContent = 'FALLBACK ' + act.fallback.text; } });
};
addEventListener('message', function (e) { LOG.push({ type: 'stray', data: e.data }); });
</script>`;
  const app = http.createServer((q, r) => { if (q.url.startsWith('/host.html')) { r.setHeader('Content-Type', 'text/html'); r.end(HOST); } else { r.statusCode = 404; r.end(); } });
  const APORT = await listen(app, 'localhost'), HOSTURL = `http://localhost:${APORT}/host.html`;

  const URL1 = PROV + '/sims/html/fake/latest/fake_all.html';
  const act = (o = {}) => Object.assign({ id: 'fake-sim', runtime: 'external-embed@1', provider: 'fake', url: URL1, stateVersion: 1, credit: 'Fake Lab · Fake simulation · CC-BY-4.0', license: 'CC-BY-4.0',
    fallback: { media: 'still', text: 'A still of the fake simulation: what it shows and what it teaches, in words.' }, strings: { en: { title: 'Fake simulation', why: 'Try the slider.' } } }, o);
  const init = (o = {}) => Object.assign({ activityId: 'fake-sim', exerciseId: null, attemptId: 't', seed: 1, task: {}, locale: 'en', strings: { title: 'Fake simulation', why: 'Try the slider.' }, theme: {}, state: null, stateVersion: 1, capabilities: [] }, o);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(150); } return false; };

  for (const name of (process.env.BROWSERS || 'chromium').split(',')) {
    console.log(`\n[${name}]`);
    let browser;
    try {
      browser = await pw[name].launch(name === 'chromium' ? { channel: 'chromium' } : {});
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 900 } });
      const p = await ctx.newPage(); p.setDefaultTimeout(10000);
      // (WebKit reports the sandbox's refusals of the hostile page's own navigation tries as page errors: the refusal is what is tested,
      //  so those are not errors of the app; every other error counts)
      const errs = []; p.on('pageerror', e => { if (!/t=hostile'\. The frame attempting navigation .*is sandboxed/.test(e.message)) errs.push(e.message); });
      const reqs = []; p.on('request', r => reqs.push(r.url()));
      let popups = 0; ctx.on('page', () => popups++);
      await p.goto(HOSTURL); await p.evaluate(() => localStorage.clear()); await p.reload();
      const run = (a, i) => p.evaluate(([a, i]) => window.run(a, i), [a, i]);
      const log = () => p.evaluate(() => window.LOG);
      const failed = async why => until(async () => (await log()).some(m => m.type === 'fail' && m.why === why), 4000);
      const provFrame = () => p.frames().find(f => f.url().startsWith(PROV));

      console.log('— the consent card first');
      provHits.length = 0; reqs.length = 0;
      await run(act(), init());
      ok(await until(async () => (await log()).some(m => m.type === 'ready')), 'the runtime says ready (the core\'s start timer is satisfied) without loading anything');
      const card = await p.evaluate(() => { const c = document.querySelector('#box .act-embed-card'); return c && { text: c.textContent, frames: document.querySelectorAll('#box iframe').length, terms: c.querySelector('a') && { href: c.querySelector('a').href, rel: c.querySelector('a').rel, target: c.querySelector('a').target }, button: !!c.querySelector('button.act-embed-open') }; });
      ok(card && card.frames === 0 && card.button, 'the card is shown, with Open, and no frame');
      ok(card && /Fake simulation/.test(card.text) && /engine\.act\.embed\.ask \{"provider":"FakeSim"\}/.test(card.text) && /Try the slider/.test(card.text), 'it names what opens (the pack\'s title, why) and the provider (engine.act.embed.ask)');
      ok(card && /Fake Lab · Fake simulation/.test(card.text) && /CC-BY-4\.0/.test(card.text) && card.terms.href === PROV + '/terms' && /noopener/.test(card.terms.rel) && /noreferrer/.test(card.terms.rel) && card.terms.target === '_blank', 'credit, licence and the provider\'s terms (a link that opens apart, no referrer)');
      await wait(1500);
      ok(provHits.length === 0 && !reqs.some(u => u.startsWith(PROV)), `nothing is requested from the provider before Open (${provHits.length} hits)`);
      await p.evaluate(() => H.send('ping')); ok(await until(async () => (await log()).some(m => m.type === 'pong'), 2000), 'ping → pong (the core\'s watchdog is satisfied)');

      console.log('— Open');
      await p.click('#box .act-embed-open');
      ok(await until(async () => { const f = provFrame(); return f && (await f.evaluate(() => document.body.dataset.ls)) === '1'; }), 'Open loads the provider\'s page, which keeps its own origin (its storage works)');
      const fr = await p.evaluate(() => { const f = document.querySelector('#box iframe.act-embed-frame'), d = new DOMParser().parseFromString(f.srcdoc, 'text/html'), inner = d.querySelector('iframe');
        return { sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy'), allow: f.getAttribute('allow'), cl: f.hasAttribute('credentialless'), lazy: f.getAttribute('loading'), title: f.title,
          wScripts: d.querySelectorAll('script').length, csp: d.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '',
          inner: inner && { sandbox: inner.getAttribute('sandbox'), src: inner.getAttribute('src'), ref: inner.getAttribute('referrerpolicy'), allow: inner.getAttribute('allow') }, credit: document.querySelector('#box .act-embed .act-embed-credit')?.textContent || '' }; });
      ok(fr.sandbox === 'allow-scripts allow-same-origin' && fr.inner && fr.inner.sandbox === fr.sandbox, 'both frames: sandbox is exactly the provider\'s tokens (no top navigation, popups or forms)');
      ok(fr.ref === 'no-referrer' && fr.inner.ref === 'no-referrer' && /camera 'none'/.test(fr.allow) && /microphone 'none'/.test(fr.inner.allow) && fr.cl && fr.lazy === 'lazy' && /frameTitle/.test(fr.title), 'no referrer, devices off, credentialless, lazy, a title');
      ok(fr.wScripts === 0 && /script-src 'none'/.test(fr.csp) && fr.csp.includes('frame-src ' + PROV) && fr.inner.src === URL1, 'the wrapper: no scripts, its policy allows frames of the provider\'s origin only, the page is the allowed URL');
      ok(provHits.length >= 1 && provHits.every(h => h.referer === null), `the provider gets no Referer (${provHits.length} requests)`);
      ok(reqs.filter(u => !u.startsWith('http://localhost:' + APORT) && !u.startsWith('about:') && !u.startsWith('data:')).every(u => u.startsWith(PROV)), 'every request goes to the allowed origin only');
      ok(/Fake Lab/.test(fr.credit) && /terms/.test(fr.credit), 'the credit line stays under the frame (attribution at the point of use)');
      ok(await p.evaluate(() => !!(S.settings.embedOk && S.settings.embedOk.fake)), 'the choice is saved for this provider (S.settings.embedOk)');
      ok((await log()).some(m => m.type === 'event' && m.payload.name === 'embed:open'), 'an embed:open event is logged');

      console.log('— the choice is remembered, per provider');
      await run(act(), init());
      ok(await until(async () => await p.evaluate(() => !!document.querySelector('#box iframe.act-embed-frame') && !document.querySelector('#box .act-embed-card'))), 'mounted again: the frame opens without the card');
      await run(act({ id: 'other', provider: 'fake2', url: PROV + '/other.html', credit: 'Other Lab' }), init());
      ok(await until(async () => await p.evaluate(() => !!document.querySelector('#box .act-embed-card') && !document.querySelector('#box iframe'))), 'another provider still asks');
      await p.reload(); await run(act(), init());
      ok(await until(async () => await p.evaluate(() => !!document.querySelector('#box iframe.act-embed-frame'))), 'after a reload the choice is still there');

      console.log('— refused URLs → fallback, nothing requested');
      for (const [k, o] of Object.entries({ 'http': { url: URL1.replace('https:', 'http:') }, 'another path': { url: PROV + '/evil.html' }, 'javascript:': { url: 'javascript:alert(1)' }, 'data:': { url: 'data:text/html,<b>x</b>' },
        'extra query': { url: URL1 + '?x=1' }, 'user info': { url: URL1.replace('https://', 'https://u@') }, 'pending provider': { provider: 'fakepending', credit: 'P' }, 'no credit': { credit: '' }, 'unknown provider': { provider: 'nope' } })) {
        await run(act(o), init()); await wait(300);   // (a request of the frame mounted before may still arrive while it is torn down)
        provHits.length = 0; await run(act(o), init());
        ok(await failed('embed-refused') && await p.evaluate(() => !document.querySelector('#box iframe') && !document.querySelector('#box .act-embed-card') && /FALLBACK/.test(document.getElementById('fb').textContent)) && provHits.length === 0, `${k}: refused → the fallback, no frame, no request ${JSON.stringify(provHits.map(x => x.url))}`);
      }
      await run(act(), init({ exerciseId: 'ch01-e900' }));
      ok(await failed('embed-graded'), 'as a sim exercise: refused (explore only)');

      console.log('— the page cannot leave its frame');
      beaconHits.length = 0; const before = p.url(), pagesBefore = ctx.pages().length; popups = 0;
      await run(act({ url: URL1 + '?t=hostile' }), init());
      let f = null;
      ok(await until(async () => { f = provFrame(); return f && (await f.evaluate(() => document.body.dataset.tried)) === '1'; }), 'the hostile page ran its tries (top, popup, _blank link, form to _top, parent, a forged result)');
      try { await f.click('#top', { timeout: 3000 }); } catch (e) { }   // with a user gesture too
      await wait(2000);
      ok(beaconHits.length === 0, `no navigation or popup reached the network: ${JSON.stringify(beaconHits)}`);
      ok(p.url() === before && ctx.pages().length === pagesBefore && popups === 0, 'the top page did not move and no popup opened');
      ok(!(await log()).some(m => m.type === 'result'), 'a message the page posts never becomes a result');

      console.log('— offline');
      await ctx.setOffline(true);
      await run(act(), init()); ok(await failed('embed-offline'), 'offline, provider already chosen: the fallback');
      await run(act({ id: 'other', provider: 'fake2', url: PROV + '/other.html', credit: 'Other Lab' }), init()); ok(await failed('embed-offline'), 'offline, provider not chosen: the fallback (no card)');
      await ctx.setOffline(false);
      await run(act({ id: 'other', provider: 'fake2', url: PROV + '/other.html', credit: 'Other Lab' }), init());
      await until(async () => await p.evaluate(() => !!document.querySelector('#box .act-embed-open')));
      await ctx.setOffline(true); await p.click('#box .act-embed-open'); ok(await failed('embed-offline'), 'Open while offline: the fallback'); await ctx.setOffline(false);
      ok(!errs.length, 'no page errors ' + JSON.stringify(errs.slice(0, 3)));
    } catch (e) { ok(false, name + ': ' + e.message.split('\n')[0]); }
    try { await browser?.close(); } catch (e) { }
  }
  app.close(); prov.close(); beacon.close();
}

(async () => {
  if (process.argv.includes('--browser')) await browserPart();
  console.log(fails ? `\n${fails} of ${n} failed` : `\nactivities_embed: ${n} checks passed`); process.exit(fails ? 1 : 0);
})();
