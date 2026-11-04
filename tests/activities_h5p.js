/* The h5p@1 runtime (engine/src/38_activity_h5p.js, docs/activities-dev/h5p.md, docs/adr/001 D11), in real browsers, with a stub host
   like skill/noema-pack-builder/scripts/activity_harness.js (ACT.registerRuntime stubbed, ACTP taken from 32_activities.js):
     1. the rules: tools/h5p_allow.json = NoemaH5P.ALLOW; tools/h5p_check.py and NoemaH5P.check give the same errors on the same
        packages (the fixtures and hostile variants: outside links, YouTube, a library off the list or refused, a .php file, a script in
        content/, a missing library, a path that leaves the package);
     2. the frames: the wrapper without scripts (frame-src 'none'), the item in a frame sandboxed with exactly allow-scripts, scripts
        only by hash (no 'unsafe-inline', no 'unsafe-eval');
     3. MultiChoice answered right and wrong through the DOM → result messages that pass ACTP.check with score 1 / 0; xAPI events;
        the state comes back (the chosen answer is still chosen); TrueFalse; DragQuestion (dragged with the mouse); the item in
        another language (h5pByLocale); a package by URL, fetched by the host page, sha256-checked; a wrong sha256 is refused;
        a package the rules refuse never mounts;
     4. no request leaves: a hostile copy of MultiChoice whose library tries fetch, XHR, an image beacon, sendBeacon, eval,
        new Function, a script added at run time, and self-navigation (location, a link, a meta refresh, window.open, a data: page);
        0 requests reach the beacon server; with the browser offline the items still play.
   Usage: node tests/activities_h5p.js     (BROWSERS=chromium,firefox,webkit, one at a time; firefox/webkit need PLAYWRIGHT_BROWSERS_PATH
          where they are installed; EXTRA_H5P=<dir> also smoke-tests every .h5p in that folder: mounts, ready, no CSP violation) */
const pw = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), zlib = require('zlib'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures', 'h5p');
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { } await wait(150); } return null; };

/* ---------- zip in and out (node: zlib), to make the hostile variants ---------- */
function readZip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let k = 0; k < count; k++) {
    const method = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const st = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(st, st + cs);
    out.push([name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)]);
  }
  return out;
}
function writeZip(entries) {
  const parts = [], cd = []; let off = 0;
  for (const [name, data] of entries) {
    const nb = Buffer.from(name, 'utf8'), comp = zlib.deflateRawSync(data), crc = zlib.crc32(data) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nb, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    cd.push(c, nb); off += 30 + nb.length + comp.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}
const variant = (base, fn) => { const es = readZip(fs.readFileSync(path.join(FIX, base))); return writeZip(fn(es) || es); };
const setFile = (es, name, data) => { const i = es.findIndex(e => e[0] === name); if (i >= 0) es[i][1] = Buffer.from(data); else es.push([name, Buffer.from(data)]); return es; };
const getJson = (es, name) => JSON.parse(es.find(e => e[0] === name)[1].toString('utf8'));
const sha = b => require('crypto').createHash('sha256').update(b).digest('hex');

const PKG = { mc: fs.readFileSync(path.join(FIX, 'mc.h5p')), tf: fs.readFileSync(path.join(FIX, 'tf.h5p')), drag: fs.readFileSync(path.join(FIX, 'drag.h5p')) };
const MCJS = 'H5P.MultiChoice-1.16/js/multichoice.js';
const BAD = {
  'outside link': variant('mc.h5p', es => { const c = getJson(es, 'content/content.json'); c.question = '<p>See <a href="https://example.org/x">this</a></p>'; setFile(es, 'content/content.json', JSON.stringify(c)); }),
  'YouTube video': variant('mc.h5p', es => { const c = getJson(es, 'content/content.json'); c.media = { type: { library: 'H5P.Video 1.6', params: { sources: [{ path: 'www.youtube.com/watch?v=abc', mime: 'video/YouTube' }] } } }; setFile(es, 'content/content.json', JSON.stringify(c)); }),
  'protocol-relative link': variant('mc.h5p', es => { const c = getJson(es, 'content/content.json'); c.question = '<img src="//cdn.example.org/a.png">'; setFile(es, 'content/content.json', JSON.stringify(c)); }),
  'library off the list': variant('mc.h5p', es => { const h = getJson(es, 'h5p.json'); h.preloadedDependencies.push({ machineName: 'H5P.Evil', majorVersion: '1', minorVersion: '0' }); setFile(es, 'h5p.json', JSON.stringify(h)); setFile(es, 'H5P.Evil-1.0/library.json', JSON.stringify({ machineName: 'H5P.Evil', majorVersion: 1, minorVersion: 0, patchVersion: 0, preloadedJs: [{ path: 'e.js' }] })); setFile(es, 'H5P.Evil-1.0/e.js', 'fetch("https://x")'); }),
  'refused library': variant('mc.h5p', es => { const h = getJson(es, 'h5p.json'); h.preloadedDependencies.push({ machineName: 'H5P.MathDisplay', majorVersion: '1', minorVersion: '0' }); setFile(es, 'h5p.json', JSON.stringify(h)); }),
  'version off the list': variant('mc.h5p', es => { const h = getJson(es, 'h5p.json'); h.preloadedDependencies.find(d => d.machineName === 'H5P.MultiChoice').minorVersion = '99'; setFile(es, 'h5p.json', JSON.stringify(h)); }),
  'a .php file': variant('mc.h5p', es => { setFile(es, 'content/shell.php', '<?php system($_GET["c"]); ?>'); }),
  'a script in content/': variant('mc.h5p', es => { setFile(es, 'content/run.js', 'alert(1)'); }),
  'a missing library': variant('mc.h5p', es => es.filter(e => !e[0].startsWith('H5P.JoubelUI-1.3/'))),
  'a path that leaves the package': variant('mc.h5p', es => { es.push(['../../etc/x.txt', Buffer.from('x')]); }),
  'no h5p.json': variant('mc.h5p', es => es.filter(e => e[0] !== 'h5p.json')),
  'main library not a content type': variant('mc.h5p', es => { const h = getJson(es, 'h5p.json'); h.mainLibrary = 'H5P.Question'; setFile(es, 'h5p.json', JSON.stringify(h)); }),
};
// the sandbox, not the allow-list, is the boundary: a library with the right name may still carry hostile code
const ATTACKS = {
  fetch: `fetch(B+'?fetch').catch(function(){})`, xhr: `var x=new XMLHttpRequest();x.open('GET',B+'?xhr');x.send()`, img: `new Image().src=B+'?img'`, beacon: `try{navigator.sendBeacon(B+'?beacon','x')}catch(e){}`,
  css: `var s=document.createElement('style');s.textContent='body{background:url('+B+'?css)}';document.head.append(s)`,
  eval: `try{eval("document.documentElement.dataset.ev=1")}catch(e){}`, fn: `try{(new Function("document.documentElement.dataset.fn=1"))()}catch(e){}`,
  dyn: `var s=document.createElement('script');s.textContent='document.documentElement.dataset.dyn=1';document.head.append(s)`,
  inline: `var b=document.createElement('b');b.setAttribute('onclick','document.documentElement.dataset.inl=1');document.body.append(b);b.click()`,
  replace: `location.replace(B+'?replace')`, href: `location.href=B+'?href'`, anchor: `var a=document.createElement('a');a.href=B+'?anchor';document.body.append(a);a.click()`,
  meta: `var m=document.createElement('meta');m.httpEquiv='refresh';m.content='0;url='+B+'?meta';document.head.append(m)`, open: `window.open(B+'?open')`, data: `location.href='data:text/html,<img src='+B+'?data>'`,
  form: `var f=document.createElement('form');f.action=B+'?form';f.method='post';document.body.append(f);f.submit()`,
  hog: `var x=0;while(true){x++;}`,
};
const hostile = (beacon, which) => variant('mc.h5p', es => { const i = es.findIndex(e => e[0] === MCJS); es[i][1] = Buffer.concat([es[i][1], Buffer.from(`\n;setTimeout(function(){var B=${JSON.stringify(beacon)};document.documentElement.dataset.ran=1;${which.map(k => 'try{' + ATTACKS[k] + '}catch(e){}').join(';')};document.documentElement.dataset.done=1;},600);\n`)]); });

/* ---------- the stub host ---------- */
const s32 = fs.readFileSync(path.join(ROOT, 'engine', 'src', '32_activities.js'), 'utf8'), ACTPsrc = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));
const HOST = `<!doctype html><meta charset="utf-8"><style>#box iframe{display:block;width:100%;height:100%;border:0}</style><body style="margin:0;font-family:system-ui"><div id="box" style="position:relative;width:820px;height:640px"></div><script>
var RT = null; var ACT = { registerRuntime: function (d) { RT = d; } };
${ACTPsrc}
window.ACTP = ACTP;
</script><script src="${'file://' + path.join(ROOT, 'engine', 'src', '33_activity_guard.js')}"></script><script src="${'file://' + path.join(ROOT, 'engine', 'src', '38_activity_h5p.js')}"></script><script>
window.LOG = []; window.H = null;
window.run = function (act, init) {
  var box = document.getElementById('box'); box.innerHTML = ''; window.LOG = [];
  if (window.H) try { window.H.close(); } catch (e) {}
  window.H = RT.mount(box, { act: act, init: init, title: 'activity ' + act.id,
    onMessage: function (raw) { var r = ACTP.check(raw); if (!r.ok) { LOG.push({ type: 'bad', why: r.why }); return; } LOG.push(r.msg);
      if (r.msg.type === 'resize') box.style.height = Math.max(160, Math.min(r.msg.payload.h, 2000)) + 'px'; },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); } });
};
</script>`;
const THEME = { tokens: { bg: '#fafaf7', card: '#ffffff', ink: '#222', c: '#4a6fa5', font: 'system-ui, sans-serif' }, scheme: 'light', reducedMotion: false, textScale: 1, dir: 'ltr' };
const initOf = (id, o = {}) => ({ activityId: id, exerciseId: o.ex || null, attemptId: 't', seed: 1, task: {}, locale: o.locale || 'en', strings: {}, theme: THEME, state: o.state || null, stateVersion: 1, capabilities: ['state', 'events', 'resize', 'result'], limits: { msgBytes: 65536, stateBytes: 262144, eventsPerSec: 50 } });

/* ---------- 1. the rules (no browser needed for the Python side) ---------- */
function pyCheck(buf) {
  const f = path.join(TMP, 'v' + Math.random().toString(36).slice(2) + '.h5p'); fs.writeFileSync(f, buf);
  const out = cp.spawnSync('python3', ['-I', path.join(ROOT, 'tools', 'h5p_check.py'), f, '--json'], { encoding: 'utf8' });
  return JSON.parse(out.stdout || '{}')[f] || { errors: ['h5p_check.py: ' + (out.stderr || '').slice(-200)], warnings: [] };
}
let TMP;

async function run(name, beacon, hits) {
  // the full Chromium; Playwright cannot reach into a frame nested in an out-of-process sandboxed frame, so the DOM tests run with
  // sandboxed frames in the page's process — and the network tests run once more with them isolated (chromiumIsolated below)
  const opts = name === 'chromium' ? { channel: 'chromium', args: ['--disable-features=IsolateSandboxedIframes'] } : {};
  const browser = await pw[name].launch(opts);
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const E = []; p.on('pageerror', e => E.push(e.message)); p.on('console', m => { if (process.env.DEBUG && /noema/.test(m.text())) console.log('    console:', m.text().slice(0, 300)); });
  await p.goto('file://' + path.join(TMP, 'host.html'));
  await until(() => p.evaluate(() => !!(window.RT && window.NoemaH5P)), 5000);
  const inner = async () => {   // the item's frame, inside the wrapper (contentFrame: in the full Chromium both frames are out-of-process)
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) { try { const w = await (await p.$('#box iframe'))?.contentFrame(); const i = w && await (await w.$('iframe'))?.contentFrame(); if (i) return i; } catch (e) { } await wait(150); }
    return null;
  };
  const log = () => p.evaluate(() => window.LOG);
  const mount = async (id, buf, o = {}) => {
    const act = { id, runtime: 'h5p@1', sha256: o.sha256 === undefined ? sha(buf) : o.sha256, stateVersion: 1, ...(o.act || {}) };
    if (!o.act || !('h5p' in o.act)) act.h5p = buf.toString('base64');
    await p.evaluate(([a, i]) => window.run(a, i), [act, initOf(id, o)]);
    const t0 = Date.now();
    const L = await until(async () => { const L = await log(); return L.some(m => m.type === 'ready' || m.type === 'fail' || m.type === 'error') ? L : null; }, o.ms || 20000);
    return { L: L || await log(), ms: Date.now() - t0 };
  };
  const results = L => L.filter(m => m.type === 'result');

  console.log('— the rules: the same in Python and in the app');
  if (name === (process.env.BROWSERS || 'chromium').split(',')[0]) {
    const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'h5p_allow.json'), 'utf8'));
    const js = await p.evaluate(() => NoemaH5P.ALLOW);
    const same = JSON.stringify(Object.fromEntries(Object.entries(allow.content).map(([k, v]) => [k, v.versions]))) === JSON.stringify(js.content)
      && JSON.stringify(Object.keys(allow.content).filter(k => !allow.content[k].tested)) === JSON.stringify(js.untested)
      && JSON.stringify(allow.libraries) === JSON.stringify(js.libraries) && JSON.stringify(allow.refuse) === JSON.stringify(js.refuse)
      && JSON.stringify(allow.files.extensions) === JSON.stringify(js.extensions) && JSON.stringify(allow.files.noExtension) === JSON.stringify(js.noExtension);
    ok(same, 'tools/h5p_allow.json and NoemaH5P.ALLOW agree');
    for (const [k, buf] of [...Object.entries(PKG).map(([k, b]) => ['fixture ' + k, b]), ...Object.entries(BAD)]) {
      const py = pyCheck(buf);
      const jsr = await p.evaluate(async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        try { const r = NoemaH5P.check(await NoemaH5P.unzip(u)); return { errors: r.errors, warnings: r.warnings }; } catch (e) { return { errors: ['unzip: ' + e.message], warnings: [] }; } }, buf.toString('base64'));
      const want = k.startsWith('fixture') ? 0 : 1;
      ok(!!py.errors.length === !!want && JSON.stringify(py.errors) === JSON.stringify(jsr.errors) && JSON.stringify(py.warnings) === JSON.stringify(jsr.warnings),
        `${k}: ${want ? 'refused' : 'accepted'} by h5p_check.py and NoemaH5P.check alike${py.errors.length ? ' — ' + py.errors[0] : ''}${JSON.stringify(py.errors) !== JSON.stringify(jsr.errors) ? '  (JS: ' + JSON.stringify(jsr.errors).slice(0, 200) + ')' : ''}`);
    }
  }

  console.log('— MultiChoice: the frames, right and wrong answers, state');
  hits.length = 0;
  let r = await mount('mc', PKG.mc);
  ok(r.L.some(m => m.type === 'ready'), `mc.h5p starts (hello → ready) in ${r.ms} ms${r.L.find(m => m.type === 'fail' || m.type === 'error') ? ' — ' + JSON.stringify(r.L.find(m => m.type === 'fail' || m.type === 'error')) : ''}`);
  const fr = await p.$eval('#box iframe', f => ({ sandbox: f.getAttribute('sandbox'), srcdoc: f.srcdoc, allow: f.getAttribute('allow') }));
  const docs = await p.evaluate(src => { const P = new DOMParser(), w = P.parseFromString(src, 'text/html'), f = w.querySelector('iframe'), inn = f ? P.parseFromString(f.getAttribute('srcdoc'), 'text/html') : null;
    const csp = d => d?.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    return { wScripts: w.querySelectorAll('script').length, wCsp: csp(w), innerSandbox: f?.getAttribute('sandbox'), iCsp: csp(inn), iFirst: inn?.head.children[1]?.getAttribute('http-equiv'), iScripts: inn?.querySelectorAll('script').length || 0, bytes: src.length }; }, fr.srcdoc);
  ok(fr.sandbox === 'allow-scripts' && docs.innerSandbox === 'allow-scripts' && docs.wScripts === 0 && /frame-src 'none'/.test(docs.wCsp), 'the wrapper has no scripts and blocks navigation; both frames are sandboxed with exactly allow-scripts');
  ok(docs.iFirst === 'Content-Security-Policy' && /^default-src 'none'; script-src 'sha256-[^ ;]+'( 'sha256-[^ ;]+')+;/.test(docs.iCsp) && !/unsafe-(inline|eval)/.test(docs.iCsp.split(';')[1]) && /connect-src 'none'/.test(docs.iCsp),
    `the item's CSP: scripts only by hash (${docs.iScripts} scripts, no unsafe-inline / unsafe-eval), connect-src 'none' — srcdoc ${Math.round(docs.bytes / 1024)} KB`);
  ok(/camera 'none'/.test(fr.allow), 'no devices');
  let f = await inner();
  ok(f && await until(() => f.evaluate(() => document.querySelectorAll('.h5p-answer').length === 3)), 'the question and its three answers are shown');
  ok(await f.evaluate(() => { try { return typeof parent.document === 'undefined'; } catch (e) { return true; } }) && await f.evaluate(() => self.origin === 'null'), 'the item cannot reach the app page (origin "null")');
  const answer = async (fr, text) => { await fr.evaluate(t => [...document.querySelectorAll('.h5p-answer')].find(li => li.textContent.trim() === t).click(), text); await wait(150); await fr.click('.h5p-question-check-answer'); };
  await answer(f, 'Jupiter');
  let res = await until(async () => results(await log()).pop());
  const L1 = await log();
  ok(res && res.payload.score === 1 && res.payload.passed === true, `the right answer → result ${JSON.stringify(res && res.payload)}`);
  ok(res && ACTP_ok(await p.evaluate(m => ACTP.check({ p: 'noema.activity', v: 1, type: 'result', payload: m }).ok, res.payload)), 'the result passes ACTP.check');
  ok(L1.some(m => m.type === 'event' && m.payload.name === 'h5p:answered' && m.payload.data?.score?.raw === 1) && L1.some(m => m.type === 'event' && m.payload.name === 'h5p:interacted'), 'xAPI interacted / answered → events');
  ok(!L1.some(m => m.type === 'bad' || m.type === 'error'), 'no bad messages, no errors ' + JSON.stringify(L1.filter(m => m.type === 'bad' || m.type === 'error').slice(0, 2)));
  const st = await until(async () => (await log()).filter(m => m.type === 'state' && m.payload.data?.h5p?.answers?.length).pop(), 5000);
  ok(st && st.payload.data && st.payload.data.h5p && Array.isArray(st.payload.data.h5p.answers), `the state is sent: ${JSON.stringify(st && st.payload.data)}`);
  ok(!L1.some(m => m.type === 'event' && m.payload.name === 'h5p:csp'), 'no CSP violation while it plays ' + JSON.stringify(L1.filter(m => m.payload?.name === 'h5p:csp')));
  // the state comes back
  r = await mount('mc', PKG.mc, { state: { version: 1, data: st ? st.payload.data : null } }); f = await inner();
  if (process.env.DEBUG) { await wait(1500); console.log(await f.evaluate(() => JSON.stringify([H5PIntegration.contents['cid-noema'].contentUserData, H5P.instances[0].contentData && H5P.instances[0].contentData.previousState, Object.keys(H5P.instances[0]).slice(0, 40)]))); }
  ok(await until(() => f.evaluate(() => { const li = [...document.querySelectorAll('.h5p-answer')].find(x => x.textContent.trim() === 'Jupiter'); return li && li.getAttribute('aria-checked') === 'true'; })), 'reopened with the saved state: Jupiter is still chosen');
  // wrong
  r = await mount('mc', PKG.mc); f = await inner(); await until(() => f.evaluate(() => document.querySelectorAll('.h5p-answer').length === 3));
  await answer(f, 'Mars');
  res = await until(async () => results(await log()).pop());
  ok(res && res.payload.score === 0 && res.payload.passed === false, `a wrong answer → result ${JSON.stringify(res && res.payload)}`);
  // another language: content.json for el
  const c0 = JSON.parse(readZip(PKG.mc).find(e => e[0] === 'content/content.json')[1]); const cel = { ...c0, question: '<p>Ποιος πλανήτης είναι ο μεγαλύτερος;</p>', UI: { ...c0.UI, checkAnswerButton: 'Έλεγχος' } };
  r = await mount('mc', PKG.mc, { locale: 'el', act: { h5p: PKG.mc.toString('base64'), h5pByLocale: { el: { content: cel, l10n: { confirmLabel: 'Επιβεβαίωση' } } } } }); f = await inner();
  ok(await until(() => f.evaluate(() => /μεγαλύτερος/.test(document.body.textContent) && /Έλεγχος/.test(document.querySelector('.h5p-question-check-answer')?.textContent || '') && document.documentElement.lang === 'el')), 'h5pByLocale.el: the item in Greek (its own content.json), lang="el"');
  r = await mount('mc', PKG.mc, { locale: 'el', act: { h5p: PKG.mc.toString('base64'), h5pByLocale: { el: { content: { ...cel, question: '<a href="https://example.org">x</a>' } } } } });
  ok(r.L.some(m => m.type === 'fail' && m.why === 'h5p-check'), 'a translation with an outside link is refused like a package');
  // by URL (the host page fetches; sha256 required and checked)
  r = await mount('mc', PKG.mc, { act: { h5p: { url: beacon.replace('/beacon', '/pkg/mc.h5p'), sha256: sha(PKG.mc) } } });
  ok(r.L.some(m => m.type === 'ready'), 'a package by URL: fetched by the host page, sha256 checked, it plays');
  r = await mount('mc', PKG.mc, { sha256: 'ab'.repeat(32) });
  ok(r.L.some(m => m.type === 'fail' && m.why === 'integrity') && !(await p.$('#box iframe')), 'a wrong sha256: refused before any frame exists');
  r = await mount('bad', BAD['library off the list'], {});
  ok(r.L.some(m => m.type === 'fail' && m.why === 'h5p-check') && !(await p.$('#box iframe')), 'a package the rules refuse never mounts');

  console.log('— TrueFalse and DragQuestion');
  r = await mount('tf', PKG.tf); f = await inner();
  ok(r.L.some(m => m.type === 'ready') && await until(() => f.evaluate(() => document.querySelectorAll('.h5p-true-false-answer').length === 2)), 'tf.h5p (h5p-standalone\'s own test item) starts');
  await f.evaluate(() => [...document.querySelectorAll('.h5p-true-false-answer')].find(x => /False/.test(x.textContent)).click()); await wait(150); await f.click('.h5p-question-check-answer');
  res = await until(async () => results(await log()).pop());
  ok(res && res.payload.score === 1 && res.payload.passed === true, `TrueFalse answered right → ${JSON.stringify(res && res.payload)}`);
  r = await mount('drag', PKG.drag); f = await inner();
  ok(r.L.some(m => m.type === 'ready') && await until(() => f.evaluate(() => document.querySelectorAll('.h5p-draggable').length === 2 && document.querySelectorAll('.h5p-dropzone').length === 2)), 'drag.h5p starts: two draggables, two drop zones');
  const drag = async (i, z) => {
    const a = await f.locator('.h5p-draggable', { hasText: ['Mercury', 'Neptune'][i] }).boundingBox(), b = await (await f.$$('.h5p-dropzone'))[z].boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(a.x + 20, a.y + 10, { steps: 4 });
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await p.mouse.up(); await wait(250);
  };
  await drag(0, 0); await drag(1, 1);
  if (process.env.DEBUG) console.log(await f.evaluate(() => [...document.querySelectorAll('.h5p-draggable,.h5p-dropzone')].map(x => x.className + ' ' + x.style.cssText)));
  await f.click('.h5p-question-check-answer');
  res = await until(async () => results(await log()).pop());
  ok(res && res.payload.score === 1 && res.payload.passed === true, `DragQuestion: both dragged to the right zone → ${JSON.stringify(res && res.payload)}`);
  r = await mount('drag', PKG.drag); f = await inner(); await until(() => f.evaluate(() => document.querySelectorAll('.h5p-draggable').length === 2));
  await drag(0, 1); await drag(1, 0); await f.click('.h5p-question-check-answer');
  res = await until(async () => results(await log()).pop());
  ok(res && res.payload.score === 0 && res.payload.passed === false, `DragQuestion: both in the wrong zone → ${JSON.stringify(res && res.payload)}`);
  ok(hits.length === 0, `no request reached the beacon server while the items played: ${JSON.stringify(hits)}`);

  console.log('— a hostile library: nothing leaves, nothing unchecked runs');
  hits.length = 0;
  r = await mount('evil', hostile(beacon, ['fetch', 'xhr', 'img', 'beacon', 'css', 'eval', 'fn', 'dyn', 'inline', 'form']));
  f = await inner(); const ds = await until(() => f.evaluate(() => document.documentElement.dataset.done ? { ...document.documentElement.dataset } : null), 8000);
  await wait(800);
  ok(ds && ds.ran && !ds.ev && !ds.fn && !ds.dyn && !ds.inl, `eval, new Function, a script added at run time and an inline handler do not run ${JSON.stringify(ds)}`);
  for (const k of ['replace', 'href', 'anchor', 'meta', 'open', 'data']) { await mount('evil-' + k, hostile(beacon, [k])); await wait(1600); }
  ok(hits.length === 0, `0 requests reached the beacon server (fetch, XHR, image, sendBeacon, CSS, form, location, link, meta refresh, popup, data: page): ${JSON.stringify(hits)}`);
  // an endless loop in a library: the loop guard (33_activity_guard.js) runs over every library script too
  r = await mount('hog', hostile(beacon, ['hog']));
  const t0 = Date.now(), hog = await until(async () => (await log()).find(m => m.type === 'error' && m.payload.code === 'runaway'), 10000);
  ok(!!hog, `an endless loop in a library is stopped by the loop guard (error runaway after ${((Date.now() - t0) / 1000).toFixed(1)} s) and the host stays responsive`);
  ok(await p.evaluate(() => { const t = performance.now(); return new Promise(r => setTimeout(() => r(performance.now() - t < 500), 50)); }), 'the host page answers right after');

  console.log('— offline');
  await ctx.setOffline(true);
  hits.length = 0;
  r = await mount('mc', PKG.mc); f = await inner();
  ok(r.L.some(m => m.type === 'ready') && await until(() => f.evaluate(() => document.querySelectorAll('.h5p-answer').length === 3)), `with the browser offline the item still plays (${r.ms} ms)${r.L.some(m => m.type === "ready") ? "" : " " + JSON.stringify(r.L.slice(0, 3))}`);
  await answer(f, 'Jupiter'); res = await until(async () => results(await log()).pop());
  ok(res && res.payload.score === 1, 'and still reports its score offline');
  await ctx.setOffline(false);

  ok(!E.filter(m => !/ran too long/.test(m)).length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  if (process.env.EXTRA_H5P) {   // (their own failed fetches inside the frame are not counted: they are blocked, which is the point)
    console.log('— extra packages (' + process.env.EXTRA_H5P + ')');
    for (const fn of fs.readdirSync(process.env.EXTRA_H5P).filter(x => x.endsWith('.h5p')).sort()) {
      const buf = fs.readFileSync(path.join(process.env.EXTRA_H5P, fn)); hits.length = 0;
      r = await mount(fn.replace(/[^a-z0-9-]/g, '-').slice(0, 40), buf); await wait(1500);
      const L = await log(), cspv = L.filter(m => m.payload?.name === 'h5p:csp'), errs = L.filter(m => m.type === 'error' || m.type === 'fail' || m.type === 'bad');
      const fx = await inner(), shown = fx ? await fx.evaluate(() => document.querySelector('.h5p-container')?.children.length || 0).catch(() => 0) : 0;
      const imgs = fx ? await fx.evaluate(() => [...document.images].map(i => i.complete && i.naturalWidth > 0)).catch(() => []) : [];
      if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, name + '-' + fn + '.png') });
      ok(L.some(m => m.type === 'ready') && shown > 0 && !errs.length && !hits.length, `${fn}: plays (${r.ms} ms)${cspv.length ? ', CSP: ' + JSON.stringify(cspv.map(m => m.payload.data)) : ''}${errs.length ? ' — ' + JSON.stringify(errs.slice(0, 2)) : ''}${hits.length ? ' hits ' + hits : ''}${imgs.length ? ', pictures shown ' + imgs.filter(Boolean).length + '/' + imgs.length : ''}`);
    }
  }
  await browser.close();
}
const ACTP_ok = x => x === true;

/** the full Chromium as it ships (sandboxed frames in their own process): the item plays and nothing leaves */
async function chromiumIsolated(beacon, hits) {
  const browser = await pw.chromium.launch({ channel: 'chromium' });
  const p = await (await browser.newContext()).newPage();
  await p.goto('file://' + path.join(TMP, 'host.html')); await until(() => p.evaluate(() => !!(window.RT && window.NoemaH5P)), 5000);
  const mount = async (id, buf) => { await p.evaluate(([a, i]) => window.run(a, i), [{ id, runtime: 'h5p@1', h5p: buf.toString('base64'), sha256: sha(buf) }, initOf(id)]);
    return await until(async () => { const L = await p.evaluate(() => window.LOG); return L.some(m => m.type === 'ready' || m.type === 'fail') ? L : null; }, 20000) || []; };
  console.log('— the full Chromium with out-of-process sandboxed frames');
  hits.length = 0;
  for (const k of ['mc', 'tf', 'drag']) { const L = await mount(k, PKG[k]); ok(L.some(m => m.type === 'ready') && !L.some(m => m.payload?.name === 'h5p:csp'), `${k}.h5p starts, no CSP violation`); }
  await mount('evil', hostile(beacon, ['fetch', 'xhr', 'img', 'beacon', 'css', 'eval', 'fn', 'dyn', 'inline', 'form'])); await wait(1500);
  for (const k of ['replace', 'href', 'anchor', 'meta', 'open', 'data']) { await mount('evil-' + k, hostile(beacon, [k])); await wait(1600); }
  ok(hits.length === 0, `0 requests reached the beacon server (every attack, self-navigation too): ${JSON.stringify(hits)}`);
  await browser.close();
}

(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-h5p-'));
  fs.writeFileSync(path.join(TMP, 'host.html'), HOST);
  const hits = [];
  const srv = http.createServer((q, r) => {
    if (q.url.startsWith('/pkg/')) { r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('content-type', 'application/octet-stream'); r.end(PKG[path.basename(q.url, '.h5p')] || ''); return; }
    hits.push(q.method + ' ' + q.url); r.end('x');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BEACON = `http://127.0.0.1:${srv.address().port}/beacon`;
  for (const b of (process.env.BROWSERS || 'chromium').split(',')) {
    console.log(`\n[${b}]`);
    try { await run(b, BEACON, hits); if (b === 'chromium') await chromiumIsolated(BEACON, hits); } catch (e) { ok(false, b + ': ' + e.message.split('\n').slice(0, 3).join(' ')); }
  }
  srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? `\n${fails} of ${n} failed` : `\nactivities_h5p: all ${n} passed`); process.exit(fails ? 1 : 0);
})();
