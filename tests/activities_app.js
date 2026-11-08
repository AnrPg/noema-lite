/* Interactive activities in the app (docs/INTERACTIVE.md, docs/adr/001): the library subject "Demo Activities"
   (built by tests/activities_pack.py with NOEMA_ACT_PACK, imported here into the local account) has the reference activity alias-lab as a theory
   block and as a graded sim exercise. Checks: the frame is sandboxed with exactly allow-scripts and the script-hash CSP;
   the handshake happens and the activity shows its words in the pack's language; state is saved and comes back; the sim
   exercise grades with what the activity reports (right and wrong), with hints; a missing activity and a runtime that is
   switched off show the fallback (picture + text); an endless loop is stopped and Restart works; no page errors.
   P6: wasm-module@1 (wasm-oscillator: the module through the sim renderer, the graded exercise, a refused import, runaway + Restart),
   the xAPI export from the subject's ⋮ (the file, the actor = the account id), external-embed@1 switched on (the consent card, nothing
   requested before Open, the frames, the remembered choice, Settings › Data "Ask again", offline, never graded).
   py-module@1 (PY=0 skips it): over http, see python() below.
   h5p@1 (docs/INTERACTIVE_H5P.md): planets-quiz's .h5p file is taken from the .noema.zip and kept on the device beside the pack; the
   block plays it in the pack's own language, the state comes back after a reload, the sim exercise is graded right and wrong
   from H5P's score, no request leaves the frame, French and Greek through h5pByLocale, the runtime off / a refused translation → the fallback;
   the one-file bundle (act-bundle-inline.html / act-bundle-big.html, built by run_e2e.sh) plays it inline or shows the fallback.
   Usage: node tests/activities_app.js <prepared-repo-dir> <pack.json from tests/activities_pack.py (NOEMA_ACT_PACK)>   (BROWSERS=chromium,firefox,webkit) */
const pw = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');   // the app over http, as the website serves it (tests/serve.js)
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PACK = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); PACK.subject = { ...PACK.subject, id: 'demo-activities', title: 'Demo Activities' };
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(150); } return false; };
// a block that came into view while two others hold the live slots waits with its Start button (at most 2 run at once): press it
const startIfParked = async (p, sel) => { if (await until(() => p.evaluate(s => !!document.querySelector(s + ' .sim'), sel), 1500)) return; const b = p.locator(sel + ' .act-bar button'); if (await b.count()) await b.first().click({ timeout: 5000 }).catch(() => {}); };   // (it may start by itself meanwhile: the button is gone)
// the exercise card #T has computed its latest inputs: its session's values() (what the checks grader reads; null while a run is pending,
// and Check then only asks to finish first)
const computed = p => until(() => p.evaluate(() => !!ACT.LIVE.find(s => s.root.closest('#T'))?.values?.()));
const actFrame = (p, sel) => p.frames().find(f => f.parentFrame() && f.parentFrame().parentFrame() === p.mainFrame() && sel(f));   // the mini-app: inside the wrapper frame

const http = require('http'); const hits = []; let BEACON = '';
// h5p@1: the stored entry of the .noema.zip (the .h5p travels beside the pack), read here without a zip library
const zipEntry = (buf, name) => {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; if (e < 0) return null;
  for (let i = 0, n = buf.readUInt16LE(e + 10), o = buf.readUInt32LE(e + 16); i < n; i++) {
    const method = buf.readUInt16LE(o + 10), size = buf.readUInt32LE(o + 20), nl = buf.readUInt16LE(o + 28), xl = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32), lo = buf.readUInt32LE(o + 42);
    if (buf.toString('utf8', o + 46, o + 46 + nl) === name) { const at = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), d = buf.subarray(at, at + size); return method === 0 ? d : require('zlib').inflateRawSync(d); }
    o += 46 + nl + xl + cl;
  }
  return null;
};
const fs = require('fs');
const PQ_ZIP = fs.existsSync(process.argv[3] + '.noema.zip') ? fs.readFileSync(process.argv[3] + '.noema.zip') : null;
const PQ_FILE = PQ_ZIP && zipEntry(PQ_ZIP, 'activities/planets-quiz/item.h5p');
const PQ_EL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'activities_examples', 'planets-quiz', 'content.el.json'), 'utf8'));
/** this part tests the app without Python (python() below tests py-module@1 with the pinned files): the runtime switched off
    (NOEMA_CONFIG.activities['py-module@1'] = false), whatever config.js says */
const p0flags = ctx => ctx.addInitScript(() => { let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (v && typeof v === 'object') v.activities = Object.assign({}, v.activities, { 'py-module@1': false }); } }); });
async function run(name) {
  // Chromium: the full browser (docs/adr/001 §2), not the headless shell. Its sandboxed srcdoc frames get their own process, and
  // Playwright then cannot attach to the mini-app frame nested in the wrapper; IsolateSandboxedIframes off keeps
  // them in reach (the loop guard, not the process model, is what stops a runaway: Firefox and WebKit have no such process either).
  const browser = await pw[name].launch(name === 'chromium' && process.env.PW_CHANNEL !== '' ? { channel: process.env.PW_CHANNEL || 'chromium', args: ['--disable-features=IsolateSandboxedIframes'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await p0flags(ctx); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const E = []; p.on('pageerror', e => { if (!/^noema: this activity ran too long/.test(e.message)) E.push(e.message); });   // (the loop guard's own stop, thrown inside the frame on purpose)
  await p.goto(await appUrl(ROOT)); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(700);
  await p.evaluate(async pk => { await Noema.importPack(Noema.account.id, pk); }, PACK);
  if (PQ_FILE) {   // h5p@1: as Import does with a .noema.zip, the .h5p file is kept on this device beside the pack (checked by size and sha256)
    const at = await p.evaluate(async ([pk, b64]) => { const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), acc = Noema.account.id;
      const bad = u.slice(); bad[bad.length - 30] ^= 1;   // the same size, one bit off
      const a = pk.activities.items.find(x => x.id === 'planets-quiz');
      return { bad: await NoemaSrcFiles.putActivityFile(acc, pk.subject.id, a, new Blob([bad]), { upload: false }),
        res: await NoemaSrcFiles.attachActivityFiles(acc, pk, async entry => entry === 'activities/planets-quiz/item.h5p' ? new Blob([u]) : null) }; }, [PACK, PQ_FILE.toString('base64')]);
    ok(at.bad === false && at.res.attached.includes('planets-quiz') && !at.res.missing.length, `h5p@1: the .h5p from the .noema.zip is kept on the device (a changed copy of the same size is refused) ${JSON.stringify(at)}`);
  } else ok(false, 'h5p@1: no .noema.zip beside the pack (tests/activities_pack.py with NOEMA_ACT_PACK) or no activities/planets-quiz/item.h5p in it');
  if (PQ_FILE) {   // h5p@1: the .h5p file in an exported package, a share, and when this device cannot keep it
    const r = await p.evaluate(async ([pk, b64]) => {
      const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), acc = Noema.account.id, SF = NoemaSrcFiles, out = { want: u.length };
      if (!window.JSZip && window.NoemaViewer?.jszip) await NoemaViewer.jszip();
      const inZip = async blob => { const f = (await JSZip.loadAsync(blob)).file('activities/planets-quiz/item.h5p'); return f ? (await f.async('uint8array')).length : 0; };
      const fresh = id => { const q = JSON.parse(JSON.stringify(pk)); q.subject = { ...q.subject, id }; return q; }, item = q => q.activities.items.find(x => x.id === 'planets-quiz');
      // the one-file bundle: the item holds its .h5p inline (not enumerable) and nothing is kept on this device for the subject
      const q1 = fresh('pq-inline'); Object.defineProperty(item(q1), 'h5p', { value: b64, enumerable: false, configurable: true, writable: true });
      const b1 = await SF.makeBundle(acc, fresh('pq-inline'), { live: q1 }); out.inline = { size: await inZip(b1.blob), missing: b1.missing };
      const realFetch = window.fetch; window.fetch = async (url, o) => String(url) === 'lib-base/activities/planets-quiz/item.h5p' ? new Response(new Blob([u])) : realFetch(url, o);
      try {
        const b2 = await SF.makeBundle(acc, fresh('pq-lib'), { base: 'lib-base/' }); out.lib = { size: await inZip(b2.blob), missing: b2.missing };   // a library subject before its .h5p is kept here
        const b3 = await SF.makeBundle(acc, fresh('pq-none')); out.none = { size: await inZip(b3.blob), missing: b3.missing };   // nowhere to be had: reported
        const tx = IDBDatabase.prototype.transaction;   // this device cannot keep it (storage full): the checked download still plays
        IDBDatabase.prototype.transaction = function (s, m) { if (m === 'readwrite') throw new DOMException('full', 'QuotaExceededError'); return tx.apply(this, arguments); };
        try { const g = await SF.activityFile(acc, 'pq-quota', item(fresh('pq-quota')), { base: 'lib-base/' }); out.quota = g ? g.length : 0; } finally { IDBDatabase.prototype.transaction = tx; }
      } finally { window.fetch = realFetch; }
      // shared: the .h5p goes with the subject's files, and the one who takes it keeps it as the item's file
      const sh = await SF.forSharing(acc, pk.subject.id, { pack: pk, sources: false }); out.share = sh.map(f => [f.srcId, f.blob.size, !!f.act]);
      const store = Object.fromEntries(sh.map(f => ['x/' + f.srcId, f.blob])), map = Object.fromEntries(sh.map(f => [f.srcId, { path: 'x/' + f.srcId, name: f.name, type: f.type, size: f.blob.size, chunks: 0 }]));
      const had = !!window.NoemaCloud; if (!had) window.NoemaCloud = { session: () => null }; const gf = NoemaCloud.getFile; NoemaCloud.getFile = async (bk, pth) => store[pth];
      try { const rq = fresh('pq-recv'), res = await SF.attachShared(acc, { ...rq, sharedFiles: map }, 'noema-shared'), g = await SF.activityFile(acc, 'pq-recv', item(rq)); out.recv = { res, size: g ? g.length : 0 }; }
      finally { if (had) NoemaCloud.getFile = gf; else delete window.NoemaCloud; }
      return out;
    }, [PACK, PQ_FILE.toString('base64')]);
    const W = r.want;
    ok(r.inline.size === W && !r.inline.missing.length, `export from the one-file bundle: the item's inline .h5p goes into the package ${JSON.stringify(r.inline)}`);
    ok(r.lib.size === W && !r.lib.missing.length, `export of a library subject before its .h5p is kept here: taken from beside the library pack ${JSON.stringify(r.lib)}`);
    ok(r.none.size === 0 && JSON.stringify(r.none.missing) === '["planets-quiz"]', `export with the .h5p nowhere to be had: the item is reported missing ${JSON.stringify(r.none)}`);
    ok(r.quota === W, `this device cannot keep the .h5p (storage full): the checked download is still played (${r.quota} of ${W} bytes)`);
    ok(JSON.stringify(r.share) === JSON.stringify([['act:planets-quiz', W, true]]) && r.recv.res.attached === 1 && !r.recv.res.failed.length && r.recv.size === W, `shared: the .h5p goes with the subject and the recipient keeps it ${JSON.stringify({ share: r.share, recv: r.recv })}`);
  }
  await p.goto((await appUrl(ROOT)) + '?subject=demo-activities'); await wait(1500);
  ok(await p.evaluate(() => SUBJ.id === 'demo-activities' && !!ACT.ITEMS['alias-lab']), 'the pack opens with its activity');
  ok(await p.evaluate(() => JSON.stringify(checkRequires()) === '["runtime:py-module@1"]'), 'pack.requires: with Python switched off, this app has everything the pack needs but Python');

  console.log('— the theory block');
  await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
  const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
  const blk = p.locator('main .act-blk .act').first(); await blk.scrollIntoViewIfNeeded();
  ok(await until(async () => await p.locator('main .act-blk iframe.act-frame').count() === 1), 'the activity mounts when it comes into view');
  const attrs = await p.$eval('main .act-blk iframe.act-frame', f => ({ sandbox: f.getAttribute('sandbox'), srcdoc: f.srcdoc, allow: f.getAttribute('allow'), title: f.title }));
  ok(attrs.sandbox === 'allow-scripts', 'sandbox is exactly "allow-scripts" (never allow-same-origin)');
  const docs = await p.evaluate(src => { const P = new DOMParser(), w = P.parseFromString(src, 'text/html'), f = w.querySelector('iframe'), inn = f ? P.parseFromString(f.getAttribute('srcdoc'), 'text/html') : null;
    const csp = d => d?.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '';
    return { wScripts: w.querySelectorAll('script').length, wFirst: w.head.firstElementChild?.getAttribute('http-equiv'), wCsp: csp(w), innerSandbox: f?.getAttribute('sandbox'),
      iFirst: [...(inn?.head.children || [])].slice(0, 2).map(e => e.getAttribute('http-equiv') || e.getAttribute('charset')), iCsp: csp(inn), iScripts: inn?.querySelectorAll('script').length || 0 }; }, attrs.srcdoc);
  ok(docs.wScripts === 0 && docs.wFirst === 'Content-Security-Policy' && /frame-src 'none'/.test(docs.wCsp) && docs.innerSandbox === 'allow-scripts', 'the wrapper: no scripts, its policy first (frame-src none), the mini-app in a frame sandboxed with allow-scripts');
  ok(docs.iFirst[1] === 'Content-Security-Policy' && /^default-src 'none'; script-src 'sha256-[^ ]+'( 'sha256-[^ ]+')+;/.test(docs.iCsp) && !/unsafe-inline'[^;]*;?\s*$/.test(docs.iCsp.split(';')[1]) && docs.iScripts >= 3, 'the mini-app: the CSP comes first and allows scripts only by hash');
  ok(/connect-src 'none'/.test(attrs.srcdoc) && /camera 'none'/.test(attrs.allow) && attrs.title, 'no network, no devices; the frame has a title');
  let f = null;
  ok(await until(async () => { f = actFrame(p, fr => true); return f && (await f.evaluate(() => document.getElementById('lf')?.textContent)) === 'Signal'; }), 'handshake done: the activity shows its own words (strings.en)');
  ok(await f.evaluate(() => { try { return typeof parent.document === 'undefined'; } catch (e) { return true; } }), 'the frame cannot reach the app page');
  ok(await f.evaluate(() => { try { localStorage.length; return false; } catch (e) { return true; } }), 'the frame has no storage');
  const h0 = await p.$eval('main .act-blk .act-box', b => b.getBoundingClientRect().height);
  ok(h0 > 250, `the frame grew to its content (resize): ${Math.round(h0)} px`);
  await f.evaluate(() => { const r = document.getElementById('fs'); r.value = '10'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok(await until(() => p.evaluate(() => S.act?.['blk:ch01-s01:alias-lab']?.data?.fs === 10)), 'the state is saved (S.act) through noema.saveState');
  ok(/3 Hz/.test(await f.evaluate(() => document.getElementById('out').textContent)), 'the activity computes the alias (7 Hz at 10 Hz → 3 Hz)');
  await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
  const sa2 = await p.$('button:has-text("show all")'); if (sa2) { await sa2.click(); await wait(200); }
  await p.locator('main .act-blk .act').first().scrollIntoViewIfNeeded();
  ok(await until(async () => { const g = actFrame(p, () => true); return g && (await g.evaluate(() => document.getElementById('fs')?.value)) === '10'; }), 'reopened: the saved state comes back');

  console.log('— the sim exercise');
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX['ch01-e900']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await wait(300); };
  const simFrame = async () => { let g = null; await until(async () => { g = actFrame(p, () => true); return g && (await g.evaluate(() => !!document.getElementById('goal')?.textContent)); }); return g; };
  await card();
  let g = await simFrame();
  ok(g && /7 Hz/.test(await g.evaluate(() => document.getElementById('goal').textContent)), 'the task (params f=7, target=3) reaches the activity');
  await p.click('#T button:has-text("Check")'); await wait(200);
  ok(await p.evaluate(() => !document.getElementById('T')._locked()), 'Check before the activity reports anything does not grade');
  const hint = p.locator('#T .act-hints').locator('..').locator('button:has-text("Hint")');
  ok(await hint.count() === 1 && /2/.test(await hint.innerText()), 'the hint button counts the hints left');
  await hint.click(); ok(await p.locator('#T .act-hints .fb').count() === 1, 'a hint is shown');
  await g.evaluate(() => { const r = document.getElementById('fs'); r.value = '5'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(250);
  await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.bad'); }), 'a wrong setting (5 Hz → 2 Hz) is graded wrong');
  ok(await p.evaluate(() => S.att?.['ch01-e900']?.result?.passed === false && S.att['ch01-e900'].hints === 1 && S.att['ch01-e900'].events.length >= 1), 'the attempt is saved (result, hints, events)');
  await card(); g = await simFrame();
  await g.evaluate(() => { const r = document.getElementById('fs'); r.value = '10'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(250);
  await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.ok') && /10 Hz/.test(c.textContent); }), 'the right setting (10 Hz) is graded right, and the reveal is shown');

  console.log('— fallbacks, runaway, Restart');
  const fb = await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'nope' })); return { text: m.textContent, img: !!m.querySelector('.act-fallback') }; });
  ok(fb.img && fb.text.length > 5, 'an activity that is not in the pack: a notice, no frame');
  const off = await p.evaluate(() => { window.NOEMA_CONFIG.activities = { 'html-app@1': false }; const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'alias-lab' })); const r = { img: !!m.querySelector('.act-fallback img'), text: m.querySelector('.act-fbtext')?.textContent || '', frame: !!m.querySelector('iframe') }; delete window.NOEMA_CONFIG.activities; return r; });
  ok(off.img && /3 Hz/.test(off.text) && !off.frame, 'runtime switched off: the fallback picture and text instead');
  // a hostile twin: the same bundle with an endless loop after 1 s
  await p.evaluate(() => {
    const a = ACT.ITEMS['alias-lab'];
    ACT.ITEMS['alias-hog'] = { ...a, id: 'alias-hog', sha256: null, html: a.html.replace('</body>', '<script>setTimeout(function(){ var x = 0; while (true) { x++; } }, 800);</script></body>') };
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'alias-hog' }));
    scrollTo(0, 0);
  });
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-frame'))), 'the hostile twin mounts (before the start: its poster and Start)');
  const t0 = Date.now();
  ok(await until(() => p.evaluate(() => !document.querySelector('main iframe') && !!document.querySelector('main .act-fallback') && document.querySelector('main .act-note').textContent.length > 0), 12000), `an endless loop is stopped: ${((Date.now() - t0) / 1000).toFixed(1)} s after the mount (the loop starts at 0.8 s)`);
  ok(await p.evaluate(() => { const t = performance.now(); return new Promise(r => setTimeout(() => r(performance.now() - t < 500), 50)); }), 'the app stays responsive');
  const restart = p.locator('main .act-bar button:has-text("Restart")');
  ok(await restart.count() === 1, 'Restart is offered');
  await restart.click();
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-frame'))), 'Restart mounts it again');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  console.log('— code the loop guard never saw cannot run');
  await p.evaluate(() => { const a = ACT.ITEMS['alias-lab'];
    ACT.ITEMS['evade'] = { ...a, id: 'evade', sha256: null, html: a.html.replace('</body>', '<b id="x" data-k="1"></b><script>setTimeout(function(){ var s = document.createElement("script"); s.textContent = "document.body.dataset.dyn = 1"; document.body.append(s); var b = document.getElementById("x"); b.setAttribute("onclick", "document.body.dataset.inl = 1"); b.click(); try { eval("document.body.dataset.ev = 1"); } catch (e) {} try { (new Function("document.body.dataset.fn = 1"))(); } catch (e) {} document.body.dataset.done = 1; }, 200);</script></body>') };
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'evade' })); scrollTo(0, 0); });
  let ev = null; await until(async () => { const g = actFrame(p, () => true); ev = g && await g.evaluate(() => ({ ...document.body.dataset })); return ev && ev.done; });
  ok(ev && ev.done && !ev.dyn && !ev.inl && !ev.ev && !ev.fn, 'a script added at run time, an inline handler, eval and new Function do not run ' + JSON.stringify(ev));
  const E0 = E.length;
  console.log('— self-navigation (the frame tries to leave for the network)');
  hits.length = 0;
  for (const [k, js] of Object.entries({ replace: `location.replace('${BEACON}?replace')`, href: `location.href='${BEACON}?href'`, anchor: `var a=document.createElement('a');a.href='${BEACON}?anchor';document.body.append(a);a.click()`,
    meta: `var m=document.createElement('meta');m.httpEquiv='refresh';m.content='0;url=${BEACON}?meta';document.head.append(m)`, open: `window.open('${BEACON}?open')`, data: `location.href='data:text/html,<img src=${BEACON}?data>'` })) {
    await p.evaluate(([k, js]) => { const a = ACT.ITEMS['alias-lab']; ACT.ITEMS['nav-' + k] = { ...a, id: 'nav-' + k, sha256: null, html: a.html.replace('</body>', '<script>setTimeout(function(){' + js + '},300);</script></body>') };
      const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'nav-' + k })); scrollTo(0, 0); }, [k, js]);
    await wait(1800);
  }
  E.length = E0; ok(hits.length === 0, `no request leaves the activity (location, link, meta refresh, popup, data: page): ${JSON.stringify(hits)}`);   // (the hostile frames' own errors don't count)
  await appEngines(p, ctx, E);
  await simSpec(p, ctx, E);
  await circuit(p, ctx, E);
  await p6engines(p, ctx, E);
  await wasmApp(p, ctx, E);
  await xapiApp(p, ctx, E);
  await embedApp(p, ctx, E);
  await h5p(p, ctx, E);
  await h5pBundle(browser, E);
  await browser.close();
}

/* html-app@1 + the engine library (docs/INTERACTIVE.md §8.1): the reference mini-game cheapest-route lists "engines": ["graph@1"]; the
   mini-app asks noema.engine('graph@1') and the host runs the model in graph@1's own Worker (one per mini-app and engine, reused for
   another model, ended on unmount). Played with the keyboard; the codes of what is refused (undeclared, spec, inputs, data that is not
   plain, superseded); an engine the app cannot run → the fallback; 320 px without sideways scrolling. */
async function appEngines(p, ctx, E) {
  console.log('— engines from a mini-app (html-app@1 + graph@1)');
  const CR = path.join(__dirname, '..', 'tools', 'activities_examples', 'cheapest-route'), html = fs.readFileSync(path.join(CR, 'app.html'), 'utf8');
  const item = { ...JSON.parse(fs.readFileSync(path.join(CR, 'activity.json'), 'utf8')), html, strings: { en: JSON.parse(fs.readFileSync(path.join(CR, 'strings.en.json'), 'utf8')) } }; delete item.entry;
  await p.evaluate(() => { const W = window.Worker; window.__W = W; window.__wn = 0; window.__wt = 0;
    // window.__hold: the replies of the Workers wait (the queue check below: run 1 cannot end before runs 2 and 3 reach the host)
    window.__hold = false; window.__held = [];
    window.Worker = class extends W { constructor(...a) { super(...a); window.__wn++; this.addEventListener('message', e => { if (window.__hold && !e.__again) { e.stopImmediatePropagation(); window.__held.push([this, e.data]); } }); }
      terminate() { window.__wt++; return super.terminate(); } };
    window.__release = () => { window.__hold = false; for (const [w, data] of window.__held.splice(0)) { const e = new MessageEvent('message', { data }); e.__again = true; w.dispatchEvent(e); } }; });
  const mount = async (it) => {
    await p.evaluate(it => { ACT.ITEMS[it.id] = it; const m = document.querySelector('main'); m.innerHTML = ''; ACT.sweep(); m.append(interactiveBlock({ t: 'interactive', activity: it.id })); scrollTo(0, 0); }, it);
    if (!await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-frame')), 3000)) { const b = p.locator('main .act-bar button'); if (await b.count()) await b.first().click({ timeout: 5000 }).catch(() => {}); }
    let g = null; await until(async () => { g = actFrame(p, () => true); return g && await g.evaluate(() => !!document.body.getAttribute('data-best')); }, 15000); return g;
  };
  let f = await mount(item);
  ok(!!f, 'the mini-game starts and graph@1 answers (the cheapest route is known)');
  if (!f) return;
  const best = +(await f.evaluate(() => document.body.getAttribute('data-best')));
  ok(JSON.stringify(await f.evaluate(() => noema.engines())) === '["graph@1"]' && await p.evaluate(() => window.__wn) === 1, 'noema.engines() lists what the registry entry declares; the model ran in a Worker of the host');
  // play it with the keyboard only: Tab to a road, Enter; then Enter on "Check my route"
  for (let i = 0; i < 8; i++) {
    const sel = await f.evaluate(() => { const bs = [...document.querySelectorAll('#moves button')]; if (!bs.length) return null; const seen = (document.getElementById('where').textContent.match(/: ([A-G – ]+) \(/) || [, ''])[1];
      const b = bs.find(x => x.dataset.to === 'G') || bs.find(x => !seen.includes(x.dataset.to)) || bs[0]; return '[data-to="' + b.dataset.to + '"]'; });
    if (!sel) break;
    await f.focus(sel); await p.keyboard.press('Enter'); await wait(80);
  }
  ok(await f.evaluate(() => !document.getElementById('check').disabled && document.activeElement === document.getElementById('check')), 'keyboard: each road is a button; at the goal the focus is on "Check my route"');
  await p.keyboard.press('Enter'); await wait(150);
  const res = await f.evaluate(() => ({ cls: document.getElementById('out').className, text: document.getElementById('out').textContent }));
  ok(/^(ok|bad)$/.test(res.cls) && res.text.includes(String(best)), `checked: the route is compared with graph@1's cheapest (${best}): "${res.text}"`);
  const codes = await f.evaluate(async () => {
    const g = noema.engine('graph@1'), r = {}, err = async pr => { try { await pr; return 'resolved'; } catch (e) { return [e.code, (e.errors || []).length]; } };
    const sp = { model: { graph: { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ u: 'a', v: 'b', w: 4 }, { u: 'b', v: 'c', w: 1 }, { u: 'a', v: 'c', w: 7 }] }, run: { alg: 'dijkstra', source: 'a', target: 'c' } },
      outputs: [{ id: 'best', kind: 'scalar', of: 'result' }, { id: 'path', kind: 'series', of: 'path' }] };
    r.run = (await g.run(sp, {})).outputs;
    r.check = await g.check({ model: { graph: { nodes: [] } }, outputs: [] });
    r.spec = await err(g.run({ model: { graph: { nodes: [] } }, outputs: [] }, {}));
    r.undeclared = await err(noema.engine('timeline@1').run(sp, {}));
    r.inputs = await err(g.run(sp, { 'not a name': 1 }));
    r.clone = await err(g.run(Object.assign({}, sp, { f: function () { } }), {}));
    window.__sp = sp;
    return r; });
  // one run at a time and one waiting: the host holds run 1's reply until the frame has the middle run's answer (each message of the
  // port is a task of its own, so without the hold run 1 may end before runs 2 and 3 reach the host, and nothing is waiting to be replaced)
  await p.evaluate(() => { window.__hold = true; });
  await f.evaluate(() => { const g = noema.engine('graph@1'), sp = window.__sp; window.__q = [g.run(sp, {}), g.run(sp, {}), g.run(sp, {})].map(pr => pr.then(v => v.outputs.best, e => e.code)); window.__q2 = null; window.__q[1].then(v => { window.__q2 = v; }); });
  await until(() => f.evaluate(() => window.__q2 !== null));
  await p.evaluate(() => window.__release());
  codes.queue = await f.evaluate(() => Promise.all(window.__q));
  ok(codes.run.best === 5 && JSON.stringify(codes.run.path) === '[0,1,2]', 'noema.engine(\'graph@1\').run(spec, inputs) → the outputs the spec names (Dijkstra: 5 along a – b – c) ' + JSON.stringify(codes.run));
  ok(codes.check.length >= 1 && codes.spec[0] === 'spec' && codes.spec[1] >= 1, 'check(spec) → the engine\'s own problems; run on a bad model is refused with code spec and the problems ' + JSON.stringify([codes.check, codes.spec]));
  ok(codes.undeclared[0] === 'undeclared' && codes.inputs[0] === 'inputs' && codes.clone[0] === 'spec', 'an engine the entry does not list, bad inputs and a spec that is not plain data are refused with their codes ' + JSON.stringify([codes.undeclared, codes.inputs, codes.clone]));
  ok(JSON.stringify(codes.queue) === '[5,"superseded",5]' && await p.evaluate(() => window.__wn) === 1, 'one run at a time and one waiting (the middle one is superseded); another model reuses the same Worker ' + JSON.stringify(codes.queue));
  await p.evaluate(() => { document.querySelector('main').innerHTML = ''; ACT.sweep(); }); await wait(200);
  ok(await p.evaluate(() => window.__wt) >= 1, 'unmounted: the engine\'s Worker is ended');
  await p.evaluate(it => { ACT.ITEMS['cr-warp'] = { ...it, id: 'cr-warp', engines: ['graph@1', 'warp@1'] }; const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'cr-warp' })); scrollTo(0, 0); }, item);
  ok(await until(() => p.evaluate(() => !document.querySelector('main iframe') && /A to G/.test(document.querySelector('main .act-fbtext')?.textContent || '')), 6000), 'a mini-app that needs an engine this app lacks shows its fallback');
  await p.setViewportSize({ width: 320, height: 800 });
  f = await mount({ ...item, id: 'cr-320' });
  ok(f && await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelectorAll('#moves button').length > 0), '320 px: the mini-game fits without sideways scrolling');
  await p.evaluate(() => { document.querySelector('main').innerHTML = ''; ACT.sweep(); window.Worker = window.__W; });
  await p.setViewportSize({ width: 1280, height: 900 });
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
}

/* wasm-module@1 (docs/INTERACTIVE_WASM.md): the reference wasm-oscillator — a precompiled module with its own spec, shown by the
   sim-spec renderer (no frame), computed in a worker; the sim exercise graded by checks; a forbidden import and a module that never
   returns (runaway → Restart) show the fallback. */
async function wasmApp(p, ctx, E) {
  console.log('— wasm-module@1: the theory block');
  const E0 = E.length, SEL = 'main .act-blk .act[data-activity="wasm-oscillator"]';
  await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
  const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
  await p.locator(SEL).first().scrollIntoViewIfNeeded(); await startIfParked(p, SEL);
  const ro = () => p.evaluate(s => [...document.querySelectorAll(s + ' .sim-ro dd')].map(d => d.textContent), SEL);
  ok(await until(async () => (await ro()).length === 2 && /%/.test((await ro())[1])), 'the module renders through the sim-spec runtime (readouts computed by the worker) ' + JSON.stringify(await ro()));
  const shape = await p.evaluate(s => { const r = document.querySelector(s); return { frame: !!r.querySelector('iframe'), sliders: r.querySelectorAll('input[type=range]').length, line: !!r.querySelector('.sim-plot path.sim-line'), title: r.querySelector('.sim-title')?.textContent }; }, SEL);
  ok(!shape.frame && shape.sliders === 3 && shape.line && /damped mass/i.test(shape.title || ''), 'no frame; three sliders, a plot line and the title in the pack\'s words ' + JSON.stringify(shape));
  ok(/0[.,]05/.test((await ro())[0]) && /6\d[.,]\d\s*%/.test((await ro())[1]), `the start values: ζ = 0.05, about 61 % of the energy left (${(await ro()).join(' · ')})`);
  await p.evaluate(s => { const e = document.querySelector(s + ' [data-param="c"]'); e.value = '1.6'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, SEL);
  ok(await until(async () => /^2[.,][0-4]\s*%/.test((await ro())[1])), 'c = 1.6: the module recomputes — about 2 % left ' + (await ro())[1]);
  ok(await until(() => p.evaluate(() => S.act?.['blk:ch01-s01:wasm-oscillator']?.data?.values?.c === 1.6)), 'the state is saved (S.act)');

  console.log('— wasm-module@1: the sim exercise');
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX['ch01-e908']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await wait(300);
    return until(() => p.evaluate(() => !!document.querySelector('#T .sim-ro dd')?.textContent)); };
  const setC = v => p.evaluate(v => { const e = document.querySelector('#T [data-param="c"]'); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  ok(await card(), 'the exercise card mounts the module');
  await setC(1); await computed(p); await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.bad') && /1 of 2|1 \/ 2/.test(c.querySelector('.act-checks-sum')?.textContent || ''); }), 'c = 1 (about 8 % left) is graded wrong: 1 of 2 conditions met');
  await card(); await setC(1.6); await computed(p); await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.ok'); }), 'c = 1.6 is graded right');
  ok(await p.evaluate(() => S.att?.['ch01-e908']?.result?.passed === true && S.att['ch01-e908'].events.length >= 1), 'the attempt is saved (S.att)');

  console.log('— wasm-module@1: refused and runaway modules');
  const bad = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'wasm', 'forbidden.wasm'));
  await p.evaluate(([b64, sha]) => { const a = ACT.ITEMS['wasm-oscillator']; ACT.ITEMS['osc-bad'] = { ...a, id: 'osc-bad', wasm: b64, sha256: sha, bytes: atob(b64).length };
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'osc-bad' })); scrollTo(0, 0); }, [bad.toString('base64'), require('crypto').createHash('sha256').update(bad).digest('hex')]);
  await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && !document.querySelector('main .sim') && document.querySelector('main .act-note').textContent.length > 0 && !document.querySelector('main .act-bar button'))), 'a module that imports env.fetch_url: the fallback, no Restart (refused before it is instantiated)');
  await p.evaluate(() => { const a = ACT.ITEMS['wasm-oscillator']; ACT.ITEMS['osc-spin'] = { ...a, id: 'osc-spin', spec: { ...a.spec, model: { ...a.spec.model, step: 'spin' } } };
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'osc-spin' })); scrollTo(0, 0); });
  await startIfParked(p, 'main .act');
  const t0 = Date.now();
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && !!document.querySelector('main .act-bar button')), 15000), `a step that never returns is stopped (the worker is terminated after the 5 s budget: ${((Date.now() - t0) / 1000).toFixed(1)} s), Restart is offered`);
  ok(await p.evaluate(() => { const t = performance.now(); return new Promise(r => setTimeout(() => r(performance.now() - t < 500), 50)); }), 'the app stayed responsive (the module never ran on the page\'s thread)');
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}

/* xAPI (docs/INTERACTIVE_XAPI.md): the subject's ⋮ has "Export learning record (xAPI)"; it downloads the attempts and answers as
   noema.xapi-export/v1; the actor is the account id (never an e-mail); the statements pass NoemaXAPI.validateAll. */
async function xapiApp(p, ctx, E) {
  console.log('— xAPI: the export');
  const E0 = E.length;
  const item = await p.evaluate(() => { const it = NoemaCore.studyUi.current().inspect.subjectMenu().find(x => x && x.label === tE('engine.xapi.export')); return it ? { label: it.label, sub: it.sub } : null; });
  ok(item && /xAPI/.test(item.label) && item.sub, 'the subject\'s ⋮ menu has the quiet item "Export learning record (xAPI)" ' + JSON.stringify(item));
  // a learner reading the subject in another language: SUBJ carries its translated name (subject.i18n), the chapters stay the pack's own
  const own = await p.evaluate(() => { window.__subjTitle = SUBJ.title; SUBJ.title = 'Titre traduit (fr)'; return Noema.pack.subject.title; });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => NoemaCore.studyUi.current().inspect.subjectMenu().find(x => x && x.label === tE('engine.xapi.export')).run())]);
  const file = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  ok(JSON.stringify(file).includes(own) && !JSON.stringify(file).includes('Titre traduit'), 'the record names the course as the pack does (its own title with its own chapters), not the translated name of the UI');
  ok(dl.suggestedFilename() === 'demo-activities.xapi.json' && file.format === 'noema.xapi-export/v1' && file.statements.length >= 5, `a JSON file is downloaded: ${dl.suggestedFilename()}, ${file.statements?.length} statements`);
  const acc = await p.evaluate(() => String(Noema.account.id));
  ok(file.statements.every(s => s.actor?.account?.name === acc && !s.actor.mbox && !s.actor.mbox_sha1sum) && !/mbox|@[a-z0-9-]+\.[a-z]/i.test(JSON.stringify(file.statements.map(s => s.actor))), 'the actor is the account id, never an e-mail');
  ok(file.statements.some(s => /passed|failed/.test(s.verb.id) && /ch01-e908/.test(s.object.id)) && file.statements.some(s => /answered/.test(s.verb.id) || /attempted/.test(s.verb.id)), 'the wasm exercise\'s result and the other attempts are in it');
  ok(await p.evaluate(f => NoemaXAPI.validateAll(f.statements).length === 0, file), 'the statements are valid xAPI 1.0.3 (NoemaXAPI.validateAll)');
  console.log('— cmi5: the course package');
  const c5 = await p.evaluate(() => { const it = NoemaCore.studyUi.current().inspect.subjectMenu().find(x => x && x.label === tE('engine.xapi.cmi5')); return it ? { sub: it.sub, icon: it.icon } : null; });
  ok(c5 && c5.sub && c5.icon === 'download', 'next to it, the quiet item "Course package for an LMS (cmi5)" ' + JSON.stringify(c5));
  const [dz] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => NoemaCore.studyUi.current().inspect.subjectMenu().find(x => x && x.label === tE('engine.xapi.cmi5')).run())]);
  const zbytes = require('fs').readFileSync(await dz.path());
  const xml = await p.evaluate(async b64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); return { names: Object.keys(z.files), xml: await z.file('cmi5.xml')?.async('string') }; }, zbytes.toString('base64'));
  const base = file.pack.activityBase;
  ok(dz.suggestedFilename() === 'demo-activities.cmi5.zip' && xml.names.join() === 'cmi5.xml' && /<courseStructure xmlns="https:\/\/w3id\.org\/xapi\/profiles\/cmi5\/v1\/CourseStructure\.xsd">/.test(xml.xml || '')
    && (xml.xml || '').includes(`<course id="${base}">`) && (xml.xml || '').includes(`<au id="${base}au/ch01"`) && /\?subject=demo-activities#\/ch\/ch01/.test(xml.xml || ''),
    `a .zip with cmi5.xml: the course and one AU per chapter, with the same ids as the xAPI record (${dz.suggestedFilename()}, ${xml.names})`);
  ok((xml.xml || '').includes(own) && !(xml.xml || '').includes('Titre traduit'), 'cmi5.xml names the course as the pack does, not the translated name');
  await p.evaluate(() => { SUBJ.title = window.__subjTitle; });
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}

/* external-embed@1 (docs/INTERACTIVE_EMBED.md): off by default; switched on here (NOEMA_CONFIG), with PhET answered by a local route (the
   internet is never used). The consent card comes first and nothing is requested before Open; Open frames only the provider; the choice
   is remembered; Settings › Data has the quiet "Ask again" line; offline → the fallback with Restart; as an exercise → refused, no Restart. */
async function embedApp(p, ctx, E) {
  console.log('— external-embed@1: off by default');
  const E0 = E.length;
  ok(await p.evaluate(async () => !(await ACT.runtime('external-embed@1')) && !ACT.hasRuntime('external-embed@1') && !ACT.caps().has('runtime:external-embed@1')), 'the runtime is off in config (the app lacks runtime:external-embed@1)');
  const reqs = []; await ctx.route('https://phet.colorado.edu/**', r => { reqs.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fake PhET</title><p id="sim">Ohm</p>' }); });
  await ctx.addInitScript(() => { let v; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => v, set: x => { v = x; if (x && typeof x === 'object') x.activities = Object.assign({}, x.activities, { 'external-embed@1': true }); } }); });
  await p.reload(); await wait(1500);
  ok(await p.evaluate(async () => ACT.caps().has('runtime:external-embed@1') && !ACT.loadedRuntime('external-embed@1') && (await ACT.runtime('external-embed@1'))?.id === 'external-embed@1' && !!ACT.loadedRuntime('external-embed@1')), 'switched on (NOEMA_CONFIG.activities["external-embed@1"] = true): the app has runtime:external-embed@1, and ACT.runtime loads it (NoemaCore.runtimes, build/runtimes.js) and registers it');
  const ITEM = { id: 'ohm-phet', runtime: 'external-embed@1', stateVersion: 1, provider: 'phet', url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html',
    credit: 'PhET Interactive Simulations, University of Colorado Boulder · Ohm’s Law · CC-BY-4.0 · https://phet.colorado.edu', license: 'CC-BY-4.0', height: 480,
    fallback: { media: 'alias-lab-still', text: 'Ohm’s law: the current through a resistor grows with the voltage and falls with the resistance, I = V / R.' }, strings: { en: { title: 'Ohm’s law simulation', why: 'Move V and R and watch I.' } } };
  const mountBlk = () => p.evaluate(a => { ACT.ITEMS[a.id] = a; const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: a.id })); scrollTo(0, 0); }, ITEM);
  await p.evaluate(() => { const o = Object.assign({}, S.settings.embedOk); delete o.phet; S.settings.embedOk = o; save(); }); await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-embed-card'))), 'the card comes first');
  const cardT = await p.evaluate(() => document.querySelector('main .act-embed-card').textContent);
  ok(/needs the network/.test(cardT) && /cookies/.test(cardT) && /Open PhET/.test(cardT) && /CC-BY-4\.0/.test(cardT) && /terms/.test(cardT), 'the card: what opens, network and cookies, the credit and licence, the terms, Open PhET');
  await wait(800); ok(reqs.length === 0 && await p.evaluate(() => !document.querySelector('main iframe')), 'nothing of the provider is requested before Open');
  await p.click('main .act-embed-open');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-embed-frame'))) && await until(() => reqs.length >= 1), 'Open: the frame loads the provider (answered by the local route) ' + JSON.stringify(reqs.slice(0, 2)));
  const fr = await p.$eval('main iframe.act-embed-frame', f => ({ sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy'), csp: (f.srcdoc.match(/frame-src [^;"]+/) || [''])[0], scripts: /<script/i.test(f.srcdoc), allow: f.getAttribute('allow') }));
  ok(fr.sandbox === 'allow-scripts allow-same-origin' && fr.ref === 'no-referrer' && fr.csp === 'frame-src https://phet.colorado.edu' && !fr.scripts && /camera 'none'/.test(fr.allow), 'the frames: the provider\'s tokens only, no referrer, the wrapper has no scripts and frames only the provider ' + JSON.stringify(fr));
  ok(reqs.every(u => u.startsWith('https://phet.colorado.edu/sims/html/ohms-law/')) && await p.evaluate(() => /PhET/.test(document.querySelector('main .act-embed-credit')?.textContent || '')), 'only the allowed URL is requested; the credit stays under the frame');
  ok(await p.evaluate(() => !!S.settings.embedOk?.phet && Object.keys(S.settings.embedOk).includes('phet')), 'the choice is remembered (S.settings.embedOk, an account setting)');
  await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-embed-frame') && !document.querySelector('main .act-embed-card'))), 'next time it opens without the card');

  console.log('— external-embed@1: Settings › Data — "Ask again"');
  // the page Settings › Data renders (ENGINE.accView('backup'): the same view in the frame and on the classic screens)
  await p.evaluate(async () => { const m = document.querySelector('main'); m.innerHTML = ''; const b = document.createElement('div'); b.className = 'accbody'; m.append(b); await ACC_VIEWS.backup(b, () => { }); });
  ok(await until(() => p.evaluate(() => !!document.querySelector('[data-embed-consent]'))), 'Settings › Data shows one quiet line for the outside activities');
  const row = await p.evaluate(() => { const r = document.querySelector('[data-embed-consent]'); return { text: r.textContent, tip: !!r.querySelector('.tip, [title], button[aria-label]'), btns: r.querySelectorAll('button').length }; });
  ok(/PhET/.test(row.text) && /Ask again/.test(row.text) && row.btns >= 1, 'the line names PhET, has its ⓘ and "Ask again" ' + JSON.stringify(row));
  await p.click('[data-embed-consent] button:has-text("Ask again")'); await wait(300);
  ok(await p.evaluate(() => !document.querySelector('[data-embed-consent]') && Object.keys(S.settings.embedOk || {}).length === 0 && !S.settings.embedOk?.phet), '"Ask again" forgets the choice, and the line goes away');
  await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-embed-card'))), 'the card asks again');
  await p.evaluate(async () => { const m = document.querySelector('main'); m.innerHTML = ''; const b = document.createElement('div'); m.append(b); await ACC_VIEWS.backup(b, () => { }); });
  ok(await p.evaluate(() => !document.querySelector('[data-embed-consent]')), 'with nothing to forget, Settings shows no line at all (quiet)');

  console.log('— external-embed@1: a card holds no live slot');
  // two simulations hold both live slots (1280 px: at most 2); the card (no frame yet) parks neither; Open makes it live, and then one is parked
  await p.evaluate(a => { ACT.ITEMS[a.id] = a; const m = document.querySelector('main'); m.innerHTML = '';
    for (const id of ['s1', 's2', 'e1']) { const d = document.createElement('div'); d.id = 'live-' + id; m.append(d); }
    window.__live = { s1: ACT.mount(document.getElementById('live-s1'), 'rc-lowpass', { place: 'live-1', start: true }), s2: ACT.mount(document.getElementById('live-s2'), 'rc-lowpass', { place: 'live-2', start: true }) }; }, ITEM);
  ok(await until(() => p.evaluate(() => document.querySelectorAll('main .sim').length === 2 && ACT.LIVE.length === 2)), 'two simulations run: both live slots are taken');
  await p.evaluate(() => { window.__live.e1 = ACT.mount(document.getElementById('live-e1'), 'ohm-phet', { start: true }); });
  ok(await until(() => p.evaluate(() => !!document.querySelector('#live-e1 .act-embed-card'))), 'the outside activity shows its card');
  ok(await p.evaluate(() => ACT.LIVE.length === 2 && !ACT.LIVE.includes(__live.e1) && document.querySelectorAll('main .sim').length === 2 && !document.querySelector('#live-s1 .act-bar .btn.primary, #live-s2 .act-bar .btn.primary')),
    'the card does not count toward the live activities: both simulations keep running (none parked)');
  await p.click('#live-e1 .act-embed-open');
  ok(await until(() => p.evaluate(() => !!document.querySelector('#live-e1 iframe.act-embed-frame') && ACT.LIVE.includes(__live.e1) && ACT.LIVE.length === 2 && document.querySelectorAll('main .sim').length === 1)),
    'Open: the frame is live now, and the older simulation is parked to make room ' + JSON.stringify(await p.evaluate(() => ({ live: ACT.LIVE.length, sims: document.querySelectorAll('main .sim').length }))));
  await p.evaluate(() => { for (const s of Object.values(__live)) s.destroy(); document.querySelector('main').innerHTML = ''; { const o = Object.assign({}, S.settings.embedOk); delete o.phet; S.settings.embedOk = o; save(); } });

  console.log('— external-embed@1: offline, and never graded');
  await ctx.setOffline(true); await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && /offline/i.test(document.querySelector('main .act-note').textContent) && /Restart/.test(document.querySelector('main .act-bar').textContent))), 'offline: the fallback, "needs the network", and Restart (to try again)');
  await ctx.setOffline(false);
  await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; ACT.mount(m, 'ohm-phet', { ex: { id: 'ch01-e999', type: 'sim', activity: 'ohm-phet', grade: { mode: 'reported' } }, start: true }); });
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-fallback') && /not on the list/.test(document.querySelector('main .act-note').textContent) && !document.querySelector('main .act-bar button'))), 'mounted as an exercise: refused (explore only), the fallback, no Restart');
  await ctx.unroute('https://phet.colorado.edu/**');
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}

/* sim-spec@1 (docs/INTERACTIVE.md §12): the reference rc-lowpass — the app's own controls, readouts and plots (no frame), state,
   the checks grader with hints, fallbacks (invalid spec, unknown engine, runtime off), registerEngine with a worker, 360 px, dark. */
async function simSpec(p, ctx, E) {
  console.log('— sim-spec@1: the theory block');
  const E0 = E.length;
  const SEL = 'main .act-blk .act[data-activity="rc-lowpass"]';
  const openSec = async () => {
    await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await startIfParked(p, SEL);
    return until(() => p.evaluate(s => !!document.querySelector(s + ' .sim .sim-ro dd')?.textContent, SEL));
  };
  const ro = () => p.evaluate(s => [...document.querySelectorAll(s + ' .sim-ro dd')].map(d => d.textContent), SEL);
  const bode = () => p.evaluate(s => document.querySelector(s + ' .sim-plot path.sim-line')?.getAttribute('d') || '', SEL);
  ok(await openSec(), 'the sim-spec block renders when it comes into view');
  const shape = await p.evaluate(s => { const r = document.querySelector(s); return { frame: !!r.querySelector('iframe'), sliders: r.querySelectorAll('input[type=range]').length, plots: r.querySelectorAll('.sim-plot svg').length,
    title: r.querySelector('.sim-title')?.textContent, unlabelled: [...r.querySelectorAll('input, select')].filter(i => !(i.getAttribute('aria-label') || (i.id && r.querySelector(`label[for="${i.id}"]`)))).length,
    svgAria: [...r.querySelectorAll('.sim-plot svg')].every(v => v.getAttribute('role') === 'img' && /Frequency|Time/.test(v.getAttribute('aria-label') || '')) }; }, SEL);
  ok(!shape.frame && shape.sliders === 2 && shape.plots === 2 && shape.title === 'RC low-pass filter', `no frame: the app's own controls (2 sliders), 2 plots, the words of strings.en ${JSON.stringify(shape)}`);
  ok(shape.unlabelled === 0 && shape.svgAria, 'every control has a label; every plot is an image with a description');
  let r0 = await ro(); const d0 = await bode();
  ok(/339\s*Hz/.test(r0[0]) && /470\s*µs/.test(r0[1]), `readouts from the defaults (R 4.7 kΩ, C 100 nF): ${r0.slice(0, 2).join(' · ')}`);
  // the keyboard moves the slider (step 10 Ω): fc goes down a little, the plot follows
  const rng = p.locator(SEL + ' input[type=range]').first(); await rng.focus(); for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight'); await wait(150);
  const r1 = await ro(), d1 = await bode();
  ok(r1[0] !== r0[0] && /33\d/.test(r1[0]) && d1 !== d0 && d1.length > 100, `moving the slider with the keyboard updates the readout (${r1[0]}) and the plot`);
  ok(/4[.,]75\s*kΩ/.test(await p.locator(SEL + ' .sim-lab output').first().innerText()), 'the slider shows its value with the unit');
  await p.locator(SEL + ' input.sim-num[data-param="R"]').fill('1600'); await p.locator(SEL + ' input.sim-num[data-param="R"]').press('Tab'); await wait(150);
  r0 = await ro();
  ok(/995\s*Hz/.test(r0[0]) && /0[.,]5\s*%/.test(r0[2]), `typing R = 1600 Ω: fc ≈ 995 Hz, 0.5 % from the target (${r0[0]} · ${r0[2]})`);
  ok(await until(() => p.evaluate(() => S.act?.['blk:ch01-s01:rc-lowpass']?.data?.values?.R === 1600)), 'the values are saved (S.act)');
  await p.reload(); await wait(1200);
  ok(await openSec() && /995\s*Hz/.test((await ro())[0]) && await p.locator(SEL + ' input.sim-num[data-param="R"]').inputValue() === '1600', 'after a reload the saved values come back');
  // Reset puts the defaults back
  await p.locator(SEL + ' .sim-foot button').click();
  ok(await until(async () => /339\s*Hz/.test((await ro())[0])), 'Reset brings back the defaults ' + JSON.stringify((await ro())[0]));
  // pause (the block left the screen): nothing is computed until resume
  await p.evaluate(() => ACT.LIVE.find(s => s.act.id === 'rc-lowpass').send('pause'));
  await p.locator(SEL + ' input.sim-num[data-param="R"]').fill('2000'); await p.locator(SEL + ' input.sim-num[data-param="R"]').press('Tab'); await wait(100);
  const paused = (await ro())[0];
  await p.evaluate(() => ACT.LIVE.find(s => s.act.id === 'rc-lowpass').send('resume')); await wait(100);
  ok(/339\s*Hz/.test(paused) && /796\s*Hz/.test((await ro())[0]), `paused: no new results (${paused}); resumed: computed (${(await ro())[0]})`);
  ok(await p.evaluate(() => ACT.LIVE.length <= 2), 'the live limit counts sim-spec activities too (at most 2 on a wide screen)');

  console.log('— sim-spec@1: small screens and dark mode');
  for (const w of [360, 320]) {
    await p.setViewportSize({ width: w, height: 800 }); await wait(400);
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await wait(200);
    const fit = await p.evaluate(s => { const r = document.querySelector(s), box = r.querySelector('.act-box'), rr = box.getBoundingClientRect();
      return { page: document.documentElement.scrollWidth <= innerWidth + 1, box: box.scrollWidth <= box.clientWidth + 1, inside: rr.right <= innerWidth + 1 && rr.left >= -1,
        svg: [...r.querySelectorAll('.sim-plot svg')].every(v => v.getBoundingClientRect().right <= rr.right + 1), touch: [...r.querySelectorAll('input.sim-num, input[type=range], .sim-foot button')].every(e => e.getBoundingClientRect().height >= 35) }; }, SEL);
    ok(fit.page && fit.box && fit.inside && fit.svg && fit.touch, `${w} px: no sideways scrolling, the plots fit, touch targets >= 36 px ${JSON.stringify(fit)}`);
  }
  await p.setViewportSize({ width: 1280, height: 900 }); await wait(300);
  await p.emulateMedia({ colorScheme: 'dark' }); await openSec(); await until(() => p.evaluate(s => !!document.querySelector(s)?.querySelector('.sim-plot path.sim-line'), SEL), 8000);   // the page is drawn again for the new scheme
  const lum = c => { const m = (c.match(/[\d.]+/g) || [255, 255, 255]).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const dk = await p.evaluate(s => { const r = document.querySelector(s); const box = r.querySelector('.act-box'), dd = r.querySelector('.sim-ro dd'), ln = r.querySelector('.sim-plot path.sim-line');
    return { bg: getComputedStyle(box).backgroundColor, ink: getComputedStyle(dd).color, line: getComputedStyle(ln).stroke }; }, SEL);
  ok(lum(dk.bg) < 0.35 && lum(dk.ink) > 0.6 && dk.line && dk.line !== 'none', `dark mode: the theme's tokens (background ${dk.bg}, text ${dk.ink}, line ${dk.line})`);
  await p.emulateMedia({ colorScheme: 'light' }); await wait(200);

  console.log('— sim-spec@1: the sim exercise (checks grader)');
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX['ch01-e901']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await until(() => p.evaluate(() => !!document.querySelector('#T .sim .sim-ro dd')?.textContent)); };
  const setR = async v => { const n = p.locator('#T input.sim-num[data-param="R"]'); await n.fill(String(v)); await n.press('Tab'); await computed(p); };
  const check = async () => { await p.click('#T button:has-text("Check")'); await wait(300); };
  await card();
  ok(await p.evaluate(() => !!EX['ch01-e901'] && !document.querySelector('#T iframe')), 'the sim exercise with a sim-spec activity is shown');
  await check();
  ok(await p.evaluate(() => !document.getElementById('T')._locked()), 'Check before the learner changed anything does not grade');
  const hint = p.locator('#T .act-hints').locator('..').locator('button:has-text("Hint")');
  await hint.click(); ok(await p.locator('#T .act-hints .fb').count() === 1, 'a hint is shown');
  await setR(4710); await check();
  const bad = await p.evaluate(() => { const c = document.getElementById('T'); return { locked: c._locked(), bad: !!c.querySelector('.explain.bad'), list: [...c.querySelectorAll('.act-checks li')].map(l => l.className + ':' + l.textContent), sum: c.querySelector('.act-checks-sum')?.textContent, att: S.att?.['ch01-e901'] }; });
  ok(bad.locked && bad.bad && bad.list.length === 2 && /^bad:/.test(bad.list[0]) && /^ok:/.test(bad.list[1]) && /1 of 2 conditions/.test(bad.sum), `R = 4.71 kΩ (≈ 338 Hz) is graded wrong; the conditions are listed ${JSON.stringify(bad.list)} · ${bad.sum}`);
  ok(bad.att?.result?.passed === false && Math.abs(bad.att.result.score - 0.25 * 0.85) < 1e-6 && bad.att.hints === 1 && bad.att.events.length >= 1, `the attempt is saved: share 1/4 (weights 3 + 1) × 0.85 for the hint = ${bad.att?.result?.score}`);
  await card(); await setR(1600); await check();
  let good = await p.evaluate(() => { const c = document.getElementById('T'); return { ok: !!c.querySelector('.explain.ok'), reveal: /995 Hz/.test(c.textContent), score: S.att?.['ch01-e901']?.result?.score }; });
  ok(good.ok && good.reveal && good.score === 1, `R = 1.6 kΩ is graded right (score ${good.score}), and the reveal is shown`);
  await card(); await hint.click(); await setR(1600); await check();
  await wait(2300);   // the earlier cards' sessions are torn down meanwhile (the watchdog sees they left the page): they must not overwrite this attempt
  good = await p.evaluate(() => ({ ok: !!document.querySelector('#T .explain.ok'), score: S.att?.['ch01-e901']?.result?.score, hints: S.att?.['ch01-e901']?.hints }));
  ok(good.ok && Math.abs(good.score - 0.85) < 1e-9 && good.hints === 1, `right after one hint: passed, score × 0.85 = ${good.score}; the attempt stays the last one`);
  await card(); await p.locator('#T input.sim-num[data-param="C"]').fill('0.000001'); await p.locator('#T input.sim-num[data-param="C"]').press('Tab'); await wait(100); await setR(160); await check();
  ok(await p.evaluate(() => !!document.querySelector('#T .explain.bad') && /99\d\s*Hz/.test(document.querySelector('#T .sim-ro dd').textContent)), 'the right fc reached with another C fails the "C stays 100 nF" condition');

  console.log('— sim-spec@1: fallbacks and engines');
  const mountItem = (id, change) => p.evaluate(([id, change]) => {
    const a = JSON.parse(JSON.stringify(ACT.ITEMS['rc-lowpass'])); a.id = id; (new Function('a', change))(a); ACT.ITEMS[id] = a;   // (test code in the app page, not pack content)
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: id })); scrollTo(0, 0);
  }, [id, change]);
  const fbState = () => p.evaluate(() => ({ sim: !!document.querySelector('main .sim'), fb: !!document.querySelector('main .act-fallback img'), text: document.querySelector('main .act-fbtext')?.textContent || '', note: document.querySelector('main .act-note')?.textContent || '', restart: !!document.querySelector('main .act-bar button') && /Restart/.test(document.querySelector('main .act-bar').textContent) }));
  await mountItem('rc-badspec', "a.spec.derived.push({ id: 'x', expr: 'R +* 2' });"); await until(async () => (await fbState()).note, 6000);
  let st = await fbState();
  ok(!st.sim && st.fb && /1 kHz/.test(st.text) && /could not start/.test(st.note) && !st.restart, `an invalid spec: the fallback picture and text, no simulation ${JSON.stringify(st.note)}`);
  await mountItem('rc-engine', "a.spec.engine = 'warp@9';"); await until(async () => (await fbState()).note, 6000);
  st = await fbState();
  ok(!st.sim && st.fb && /cannot run in this version/.test(st.note), 'an engine this app does not have: the fallback, "cannot run in this version"');
  await p.evaluate(() => { window.NOEMA_CONFIG.activities = { 'sim-spec@1': false }; }); await mountItem('rc-off', ''); await wait(300);
  st = await fbState(); await p.evaluate(() => { delete window.NOEMA_CONFIG.activities; });
  ok(!st.sim && st.fb, 'runtime sim-spec@1 switched off: the fallback');
  // registerEngine: a tiny test engine (exponential decay, a time series) in a worker; and one whose own check refuses the spec
  await p.evaluate(() => {
    window.__inline = 0;
    const src = "self.noemaEngine = { create: function (spec, o) { return { run: function (x) { var t = [], v = []; for (var i = 0; i <= 200; i++) { var tt = i * x.T / 200; t.push(tt); v.push(x.V0 * Math.exp(-tt / x.tau)); } return { t: t, v: v, vEnd: v[200], seed: o.seed }; } }; } };";
    ACT.registerEngine({ id: 'decay-test@1', workerSource: src, check: spec => spec.model && spec.model.kind === 'decay' ? [] : ['model.kind must be decay'],
      create(spec, o) { window.__inline++; const f = {}; (new Function('self', src))(f); return f.noemaEngine.create(spec, o); } });
  });
  const ENG = "a.spec = { format: 'noema.sim-spec/v1', engine: 'decay-test@1', model: { kind: 'decay' }, consts: { V0: 5 }, params: [{ id: 'tau', kind: 'slider', label: 'resistance', min: 0.1, max: 5, step: 0.1, default: 1 }, { id: 'T', kind: 'number', label: 'capacitance', min: 1, max: 20, default: 5 }]," +
    " outputs: [{ id: 't', kind: 'series' }, { id: 'v', kind: 'series' }, { id: 'vEnd', kind: 'scalar' }], readouts: [{ label: 'voltage', expr: 'vEnd', digits: 3 }], plots: [{ kind: 'series', title: 'stepTitle', x: { series: 't', label: 'time', unit: 's' }, y: { min: 0, max: 5, label: 'voltage', unit: 'V' }, series: [{ y: 'v' }] }] };";
  await mountItem('decay', ENG);
  ok(await until(() => p.evaluate(() => /^0[.,]0337/.test(document.querySelector('main .sim-ro dd')?.textContent || ''))), 'an engine from registerEngine computes the outputs (5·e^−5 = 0.0337 V at the end)');
  const dk2 = await p.evaluate(() => ({ d: document.querySelector('main .sim-plot path.sim-line')?.getAttribute('d') || '', inline: window.__inline, caps: ACT.caps().has('engine:decay-test@1') }));
  ok(dk2.d.split('L').length > 150 && dk2.caps, `its time series is plotted (${dk2.d.split('L').length} points); the app lists engine:decay-test@1 among its capabilities`);
  ok(dk2.inline === 0, `the engine with workerSource ran in a Worker (inline runs: ${dk2.inline})`);
  await p.locator('main input.sim-num[data-param="tau"]').fill('2.5'); await p.locator('main input.sim-num[data-param="tau"]').press('Tab');
  ok(await until(() => p.evaluate(() => /^0[.,]677/.test(document.querySelector('main .sim-ro dd')?.textContent || ''))), 'a new input runs the engine again (τ = 2.5 s → 0.677 V)');
  // the checks grader never reads older results: while the engine still computes the latest inputs, values() is null
  const stale = await p.evaluate(async () => {
    const src = "self.noemaEngine = { create: function () { return { run: function (x) { var t0 = Date.now(); while (Date.now() - t0 < 400) { } return { vEnd: x.tau }; } }; } };";
    ACT.registerEngine({ id: 'slow-test@1', workerSource: src, create() { const f = {}; (new Function('self', src))(f); return f.noemaEngine.create(); } });
    const a = JSON.parse(JSON.stringify(ACT.ITEMS['rc-lowpass'])); a.id = 'slow';
    a.spec = { format: 'noema.sim-spec/v1', engine: 'slow-test@1', model: {}, params: [{ id: 'tau', kind: 'number', label: 'resistance', min: 0, max: 10, default: 1 }], outputs: [{ id: 'vEnd', kind: 'scalar' }], readouts: [{ label: 'voltage', expr: 'vEnd' }] };
    const box = document.createElement('div'); document.body.append(box); const msgs = [];
    const port = (await ACT.runtime('sim-spec@1')).mount(box, { act: a, init: { locale: 'en', stateVersion: 1 }, onMessage: m => msgs.push(m), onFail: c => msgs.push({ fail: c }) });
    const until = async f => { for (let i = 0; i < 60; i++) { if (f()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
    const first = await until(() => port.values()?.vEnd === 1);
    const inp = box.querySelector('input[data-param="tau"]'); inp.value = '7'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60)); const during = port.values();
    const after = await until(() => port.values()?.vEnd === 7);
    port.close(); box.remove(); return { first, during, after, fails: msgs.filter(m => m.fail) };
  });
  ok(stale.first && stale.during === null && stale.after && !stale.fails.length, `while the engine computes the latest inputs the checks grader gets nothing (no grading of older results) ${JSON.stringify(stale)}`);
  await mountItem('decay-bad', ENG + " a.spec.model.kind = 'other';"); await wait(400);
  st = await fbState();
  ok(!st.sim && st.fb && /could not start/.test(st.note), "the engine's own check refuses the spec: the fallback");
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}
/* circuit-mna@1 (docs/INTERACTIVE_CIRCUIT.md, docs/INTERACTIVE.md §12.6–12.7): rc-transient (sliders bound to the parts, a scope trace)
   and the fault bench led-bench — measurements that are the engine's numbers, the log, the diagnosis graded right and wrong, the
   hidden fault nowhere in the page before the diagnosis, the explorer's bench after a reload, scope and logic faces, 360 px, dark. */
async function circuit(p, ctx, E) {
  const E0 = E.length;
  const val = t => { const m = String(t).replace(/−/g, '-').match(/(-?[\d.,]+)\s*([pnµmkMG]?)/); if (!m) return NaN; return parseFloat(m[1].replace(',', '.')) * ({ p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1); };
  const openSec = async sel => {
    await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    await p.locator(sel).first().scrollIntoViewIfNeeded(); await startIfParked(p, sel);
    return until(() => p.evaluate(s => !!document.querySelector(s + ' .sim'), sel));
  };
  console.log('— circuit-mna@1: rc-transient (a netlist, sliders bound to R1 and C1, the scope trace)');
  const RT = 'main .act-blk .act[data-activity="rc-transient"]';
  ok(await openSec(RT) && await until(() => p.evaluate(s => /0[.,]9\d\s*V/.test(document.querySelector(s + ' .sim-ro')?.textContent || ''), RT), 15000), 'the circuit simulation renders (no frame) and computes: 0.96 V at 1 ms with τ = 4.7 ms');
  const trace = () => p.evaluate(s => [...document.querySelectorAll(s + ' .sim-plot path.sim-line')].map(x => x.getAttribute('d') || ''), RT);
  const t0 = await trace();
  ok(t0.length === 2 && t0.every(d => d.split('L').length > 100) && !(await p.evaluate(s => !!document.querySelector(s + ' iframe'), RT)), `the scope plot shows the input and the capacitor (${t0.map(d => d.split('L').length).join(' + ')} points)`);
  await p.locator(RT + ' input.sim-num[data-param="R"]').fill('1000'); await p.locator(RT + ' input.sim-num[data-param="R"]').press('Tab');
  ok(await until(() => p.evaluate(s => /3[.,]1\d\s*V/.test(document.querySelector(s + ' .sim-ro')?.textContent || ''), RT)), 'R = 1 kΩ: the engine (in its worker) gives 3.16 V at 1 ms (63 %)');
  const t1 = await trace();
  ok(t1[1] !== t0[1] && t1[0] === t0[0], 'the slider changes the capacitor trace on the scope, not the input');
  ok(await p.evaluate(() => ACT.caps().has('engine:circuit-mna@1') && !checkRequires().includes('engine:circuit-mna@1')), 'the app has engine:circuit-mna@1 (that part of pack.requires is met)');

  console.log('— circuit-mna@1: the fault bench (an exercise)');
  const card = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX[id]); c.id = 'T'; m.append(c); scrollTo(0, 0); }, id); await until(() => p.evaluate(() => !!document.querySelector('#T .sim-bench'))); };
  const measure = async (m) => {
    const n0 = await p.evaluate(() => document.querySelectorAll('#T .sim-log li').length);
    await p.selectOption('#T [data-bench="instrument"]', m.i);
    if (m.a) await p.selectOption('#T [data-bench="a"]', m.a);
    if (m.b) await p.selectOption('#T [data-bench="b"]', m.b);
    if (m.part != null) await p.selectOption('#T [data-bench="part"]', String(m.part));
    await p.click('#T [data-bench="measure"]');
    await until(() => p.evaluate(n => { const l = document.querySelectorAll('#T .sim-log li'); return l.length > n && !/…$/.test(l[l.length - 1].textContent); }, n0));
  };
  const logs = () => p.evaluate(() => [...document.querySelectorAll('#T .sim-log li b')].map(b => b.textContent));
  const check = async () => { await p.click('#T button:has-text("Check")'); await wait(400); };
  const secret = () => p.evaluate(() => { const h = document.body.innerHTML + document.body.innerText; return { id: /ledReversed|ledOpen|rOpen|rDrift|openTrace/.test(h.replace(/data-activity="[^"]*"/g, '')), verdict: !!document.querySelector('#T .sim-dx-out')?.textContent, reveal: /the wrong way round: TP3/.test(h) }; });
  await card('ch01-e903');
  const shape = await p.evaluate(() => { const r = document.querySelector('#T .sim'); return { frame: !!r.querySelector('iframe'), inst: [...r.querySelectorAll('[data-bench="instrument"] option')].map(o => o.textContent), opts: r.querySelectorAll('[data-bench="diagnosis"] option').length, left: r.querySelector('.sim-left')?.textContent, commit: !!r.querySelector('[data-bench="commit"]'),
    unlabelled: [...r.querySelectorAll('input, select')].filter(i => !(i.getAttribute('aria-label') || (i.id && r.querySelector(`label[for="${i.id}"]`)))).length }; });
  ok(!shape.frame && shape.inst.join('|') === 'Multimeter: voltage|Multimeter: current|Multimeter: resistance' && shape.opts === 8 && /8 measurements left/.test(shape.left) && !shape.commit && shape.unlabelled === 0, `the bench: three instruments, 7 diagnoses, the budget; every control labelled; in an exercise the card's Check grades it ${JSON.stringify(shape)}`);
  let sc = await secret();
  ok(!sc.id && !sc.verdict && !sc.reveal, 'the hidden fault is nowhere in the page before the diagnosis (no id, no verdict, no reveal)');
  await measure({ i: 'V', a: 'TP3', b: 'GND' }); await measure({ i: 'V', a: 'LK', b: 'GND' }); await measure({ i: 'V', a: 'LA', b: 'GND' }); await measure({ i: 'I', part: 0 });
  let L = await logs();
  // the same readings from the circuit engine itself (NoemaCore.engines.loaded('circuit-mna@1')): the netlist, the fault ledReversed, the seeded noise of the exercise (seed 7), the same order
  const want = await p.evaluate(() => { const sp = ACT.ITEMS['led-bench'].spec, s = NoemaCore.engines.loaded('circuit-mna@1').create(sp.model.netlist, { faults: sp.bench.faults.find(f => f.id === 'ledReversed').apply, seed: 7, noise: { rel: sp.model.noise.rel, abs: 0, seed: 7 } });
    return [{ kind: 'V', a: 'TP3', b: 'gnd' }, { kind: 'V', a: '@D1.1', b: 'gnd' }, { kind: 'V', a: '@D1.0', b: 'gnd' }, { kind: 'I', element: 'R1' }].map(q => s.measure(q).value); });
  const close = L.length === 4 && L.every((t, i) => Math.abs(val(t) - want[i]) <= 0.005 * Math.abs(want[i]) + 1e-3);
  ok(close && val(L[0]) > 4.9 && val(L[1]) > 4.9 && Math.abs(val(L[2])) < 0.05, `the multimeter shows the engine's numbers: ${L.join(' · ')} (NoemaCircuit: ${want.map(v => +v.toPrecision(3)).join(' · ')})`);
  ok(await p.evaluate(() => /4 measurements left/.test(document.querySelector('#T .sim-left').textContent) && !!document.querySelector('#T .sim-face .sim-meter-v')?.textContent && /LED anode leg/.test(document.querySelector('#T .sim-log').textContent)), 'the meter face shows the last reading; the log names the instrument and the test points; the budget counts down');
  await check();
  ok(await p.evaluate(() => !document.getElementById('T')._locked()), 'Check before a diagnosis does not grade');
  sc = await secret(); ok(!sc.id && !sc.verdict && !sc.reveal, 'still hidden after measuring and an early Check');
  await p.selectOption('#T [data-bench="diagnosis"]', '5'); await check();   // "the LED is open": tempting (the LED does not light) but the cathode leg is at 5 V
  const bad = await p.evaluate(() => { const c = document.getElementById('T'); return { locked: c._locked(), bad: !!c.querySelector('.explain.bad'), dx: c.querySelector('.sim-dx-out')?.className + ': ' + c.querySelector('.sim-dx-out')?.textContent, list: [...c.querySelectorAll('.act-checks li')].map(l => l.className), att: S.att?.['ch01-e903'], dis: c.querySelector('[data-bench="measure"]').disabled }; });
  ok(bad.locked && bad.bad && /bad: Not this one\. The fault was: The LED is soldered the wrong way round/.test(bad.dx) && bad.list.join() === 'bad,ok' && bad.dis, `a wrong diagnosis is graded wrong; only now the bench says what the fault was (${bad.dx}); the bench is locked`);
  ok(bad.att?.result?.passed === false && bad.att.events.filter(e => e.name === 'measure').length === 4 && bad.att.events.some(e => e.name === 'diagnose' && e.data.option === 5), `the attempt keeps the measurements and the diagnosis as events (${bad.att?.events?.length})`);
  await card('ch01-e903');
  await measure({ i: 'V', a: 'TP3', b: 'GND' }); await measure({ i: 'V', a: 'LK', b: 'GND' });
  await p.selectOption('#T [data-bench="diagnosis"]', '6'); await check();
  const good = await p.evaluate(() => { const c = document.getElementById('T'); return { ok: !!c.querySelector('.explain.ok'), dx: c.querySelector('.sim-dx-out')?.className + ': ' + c.querySelector('.sim-dx-out')?.textContent, score: S.att?.['ch01-e903']?.result?.score }; });
  ok(good.ok && /ok: Right: The LED is soldered the wrong way round/.test(good.dx) && good.score === 1, `the right diagnosis with 2 measurements is graded right (score ${good.score}): ${good.dx}`);

  console.log('— circuit-mna@1: the real instruments (docs/INTERACTIVE_CIRCUIT.md §9.5): meter modes, the scope probe ground, the Bode analyser');
  const ins0 = await p.evaluate(() => { const b = ACT.ITEMS['led-bench'].spec.bench, o = JSON.stringify(b.instruments);
    b.instruments[0].modes = ['dc', 'ac', 'rms'];
    b.instruments.push({ kind: 'scope', tEnd: 0.001, leads: [{ label: 'tp3', lead: 1.5e-7 }, { label: 'gnd', lead: 2e-9 }] }, { kind: 'bode', source: 'V1', fStart: 10, fStop: 1e6, fPoints: 60 }); return o; });
  await card('ch01-e903');
  const sh2 = await p.evaluate(() => { const r = document.querySelector('#T .sim'), q = s => r.querySelector(`[data-bench="${s}"]`);
    return { inst: [...q('instrument').options].map(o => o.textContent), modes: [...q('mode').options].map(o => o.textContent), modeShown: !q('mode').closest('.sim-p').hidden,
      unlabelled: [...r.querySelectorAll('input, select')].filter(i => !(i.getAttribute('aria-label') || (i.id && r.querySelector(`label[for="${i.id}"]`)))).length }; });
  ok(sh2.inst.length === 5 && /Bode/.test(sh2.inst[4]) && sh2.modes.join('|') === 'DC|AC|true RMS (AC+DC)' && sh2.modeShown && sh2.unlabelled === 0, `the voltmeter offers its modes, the bench a Bode analyser; every control labelled ${JSON.stringify(sh2)}`);
  await p.selectOption('#T [data-bench="mode"]', 'rms'); await measure({ i: 'V', a: 'TP1', b: 'GND' });
  await p.selectOption('#T [data-bench="instrument"]', 'scope');
  const gsel = await p.evaluate(() => { const g = document.querySelector('#T [data-bench="ground"]'); return { shown: !g.closest('.sim-p').hidden, n: g.options.length, mode: document.querySelector('#T [data-bench="mode"]').closest('.sim-p').hidden }; });
  await p.selectOption('#T [data-bench="ground"]', '1'); await measure({ i: 'scope', a: 'TP3' });
  await measure({ i: 'bode', a: 'TP3' });
  const L2 = await logs(), bode = await p.evaluate(() => { const f = document.querySelector('#T .sim-face'); return { svg: !!f.querySelector('svg'), line: (f.querySelector('path.sim-line')?.getAttribute('d') || '').split('L').length, cap: f.querySelector('figcaption')?.textContent || '' }; });
  const li = await p.evaluate(() => [...document.querySelectorAll('#T .sim-log li')].map(l => l.textContent));
  ok(gsel.shown && gsel.n === 2 && gsel.mode, `the scope offers its two ground leads (the voltmeter's modes hidden) ${JSON.stringify(gsel)}`);
  const rms = parseFloat((String(L2[0]).match(/(\d+[.,]\d+)\s*V true RMS/) || [])[1]?.replace(',', '.'));   // 5 V within the bench's noise (model.noise.rel = 0.5 %)
  ok(Math.abs(rms - 5) <= 5 * 0.005 + 0.005 && /\(gnd|GND\)|\(/.test(li[1]) && /dB/.test(L2[2]) && bode.svg && bode.line >= 50 && /Bode/.test(bode.cap), `the readings: RMS on the meter (${L2[0]}), the scope with its lead (${li[1]}), the Bode plot drawn (${bode.line} points): ${L2[2]}`);
  await p.evaluate(o => { ACT.ITEMS['led-bench'].spec.bench.instruments = JSON.parse(o); }, ins0);

  console.log('— circuit-mna@1: the bench as a theory block (explorer)');
  const LB = 'main .act-blk .act[data-activity="led-bench"]';
  ok(await openSec(LB), 'the bench block renders');
  const blog = () => p.evaluate(s => [...document.querySelectorAll(s + ' .sim-log li')].map(l => l.textContent), LB);
  await p.selectOption(LB + ' [data-bench="instrument"]', 'V'); await p.selectOption(LB + ' [data-bench="a"]', 'TP3'); await p.click(LB + ' [data-bench="measure"]');
  await until(async () => { const l = await blog(); return l.length === 1 && !/…$/.test(l[0]); });
  await p.selectOption(LB + ' [data-bench="instrument"]', 'R'); await p.selectOption(LB + ' [data-bench="a"]', 'TP2'); await p.selectOption(LB + ' [data-bench="b"]', 'TP3'); await p.click(LB + ' [data-bench="measure"]');
  await until(async () => { const l = await blog(); return l.length === 2 && !/…$/.test(l[1]); });
  const before = await blog();
  ok(before.length === 2 && /Ω|OL/.test(before[1]), `two measurements in the log: ${before.join(' | ')}`);
  ok(await until(() => p.evaluate(() => (S.act?.['blk:ch01-s01:led-bench']?.data?.bench?.log || []).length === 2)), 'the bench is saved (its device, the log)');
  const savedJ = await p.evaluate(() => JSON.stringify(S.act['blk:ch01-s01:led-bench'].data.bench));
  ok(!/ledReversed|ledOpen|rOpen|rDrift|openTrace|"fault"/.test(savedJ), 'the saved state does not name the fault either');
  await p.reload(); await wait(1200);
  ok(await openSec(LB) && JSON.stringify(await blog()) === JSON.stringify(before), 'after a reload the same device comes back with its log');
  await p.selectOption(LB + ' [data-bench="diagnosis"]', '0'); await p.click(LB + ' [data-bench="commit"]'); await wait(200);
  const ex = await p.evaluate(s => ({ out: document.querySelector(s + ' .sim-dx-out')?.className, txt: document.querySelector(s + ' .sim-dx-out')?.textContent, dis: document.querySelector(s + ' [data-bench="measure"]').disabled }), LB);
  ok(/sim-dx-out (ok|bad)/.test(ex.out) && ex.txt.length > 5 && ex.dis, `"Check my diagnosis" in the explorer: the verdict (${ex.txt}) and the bench locks`);
  await p.click(LB + ' [data-bench="another"]'); await wait(200);
  ok(await p.evaluate(s => document.querySelectorAll(s + ' .sim-log li').length === 0 && !document.querySelector(s + ' .sim-dx-out').textContent && !document.querySelector(s + ' [data-bench="measure"]').disabled, LB), '"Another device": a fresh device, an empty log');

  console.log('— circuit-mna@1: small screens and dark mode');
  for (const w of [360, 320]) {
    await p.setViewportSize({ width: w, height: 800 }); await wait(400);
    await p.locator(LB).first().scrollIntoViewIfNeeded(); await wait(200);
    const fit = await p.evaluate(s => { const r = document.querySelector(s), box = r.querySelector('.act-box'), rr = box.getBoundingClientRect();
      return { page: document.documentElement.scrollWidth <= innerWidth + 1, box: box.scrollWidth <= box.clientWidth + 1, inside: [...r.querySelectorAll('select, button')].every(e => e.getBoundingClientRect().right <= rr.right + 1),
        touch: [...r.querySelectorAll('.sim-bench select, .sim-bench button')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().height >= 35) }; }, LB);   // (the rows of the other instruments are hidden)
    ok(fit.page && fit.box && fit.inside && fit.touch, `${w} px: the bench fits without sideways scrolling, touch targets >= 36 px ${JSON.stringify(fit)}`);
  }
  await p.setViewportSize({ width: 1280, height: 900 }); await wait(300);
  await p.emulateMedia({ colorScheme: 'dark' }); await openSec(LB); await wait(300);
  await p.click(LB + ' [data-bench="measure"]'); await wait(600);
  const lum = c => { const m = (c.match(/[\d.]+/g) || [255, 255, 255]).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const dk = await p.evaluate(s => { const r = document.querySelector(s), g = e => e ? getComputedStyle(e) : null; return { bg: g(r.querySelector('.act-box')).backgroundColor, sel: g(r.querySelector('.sim-bench select')).backgroundColor, ink: g(r.querySelector('.sim-log li b'))?.color || '', meter: g(r.querySelector('.sim-meter-v'))?.color || '' }; }, LB);
  ok(lum(dk.bg) < 0.35 && lum(dk.sel) < 0.35 && lum(dk.ink) > 0.6 && lum(dk.meter) > 0.5, `dark mode: the bench uses the theme (background ${dk.bg}, controls ${dk.sel}, log ${dk.ink}, meter ${dk.meter})`);
  await p.emulateMedia({ colorScheme: 'light' }); await wait(200);

  console.log('— circuit-mna@1: the oscilloscope and the logic analyser (a modified item)');
  await p.evaluate(() => {
    const a = JSON.parse(JSON.stringify(ACT.ITEMS['rc-transient'])); a.id = 'rc-scope';
    a.spec.bench = { faults: [{ id: 'cOpen', apply: [{ element: 'C1', kind: 'open' }] }, { id: 'rDrift', apply: [{ element: 'R1', kind: 'drift', factor: 3 }] }],
      points: [{ id: 'IN', at: 'in', label: 'inLine' }, { id: 'OUT', at: 'out', label: 'outLine' }, { id: 'G', at: 'gnd', label: 'voltage' }],
      instruments: [{ kind: 'scope', tEnd: 0.02, dt: 1e-5 }, { kind: 'logic', tEnd: 0.02, threshold: 2.5 }, { kind: 'V' }],
      diagnosis: { options: [{ label: 'inLine', fault: 'cOpen' }, { label: 'outLine', fault: 'rDrift' }] } };
    ACT.ITEMS['rc-scope'] = a;
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'rc-scope' })); scrollTo(0, 0);
  });
  await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .sim-bench'))), 'a bench on rc-transient with a scope and a logic analyser mounts ' + await p.evaluate(() => document.querySelector('main .act-note')?.textContent || ''));
  await p.selectOption('main [data-bench="instrument"]', 'scope'); await p.selectOption('main [data-bench="a"]', 'IN'); await p.click('main [data-bench="measure"]');
  ok(await until(() => p.evaluate(() => { const l = document.querySelectorAll('main .sim-log li'); return l.length === 1 && !/…$/.test(l[0].textContent) && !!document.querySelector('main .sim-face .sim-svg path.sim-line'); })), 'the scope face: a trace plot');
  const s1 = await p.evaluate(() => ({ log: document.querySelector('main .sim-log li').textContent, pts: (document.querySelector('main .sim-face path.sim-line').getAttribute('d') || '').split('L').length, cap: document.querySelector('main .sim-face figcaption')?.textContent }));
  ok(/\b5(?:[.,]0+)?\s*V peak to peak/.test(s1.log) && /100\s*Hz/.test(s1.log) && s1.pts > 100, `the scope reading: peak to peak, mean, frequency of the 100 Hz square wave (${s1.log}; ${s1.pts} points)`);
  await p.selectOption('main [data-bench="instrument"]', 'logic'); await p.selectOption('main [data-bench="a"]', 'IN'); await p.click('main [data-bench="measure"]');
  ok(await until(() => p.evaluate(() => { const l = document.querySelectorAll('main .sim-log li'); return l.length === 2 && /duty cycle/.test(l[1].textContent) && !!document.querySelector('main .sim-face path.sim-line'); })), 'the logic analyser face: a logic trace');
  const s2 = await p.evaluate(() => document.querySelectorAll('main .sim-log li')[1].textContent);
  ok(/100\s*Hz/.test(s2) && /50\s*%/.test(s2), `the logic reading: frequency and duty cycle (${s2})`);
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}
/* the P6 engines (docs/INTERACTIVE_ENGINES.md): thermal@1 heatsink, pid@1 pid-tune, rf@1 lora-link, twin@1 sensor-node — each renders in the
   app's own sim runtime (no frame), computes in its Worker the numbers the engine on the page gives, is graded by its exercise's checks
   (right and wrong); and twin@1's fault-finding bench (a modified sensor-node): voltmeter, ammeter, current scope, event log, RSSI,
   the diagnosis, the hidden fault nowhere in the page before it. */
async function p6engines(p, ctx, E) {
  const E0 = E.length;
  const val = t => { const m = String(t).replace(/−/g, '-').replace(/ | /g, ' ').match(/(-?[\d.,]+)\s*([pnµmkMG]?)/); if (!m) return NaN; return parseFloat(m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.')) * ({ p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1); };
  const openSec = async sel => {
    await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    await p.locator(sel).first().scrollIntoViewIfNeeded(); await startIfParked(p, sel);
    return until(() => p.evaluate(s => !!document.querySelector(s + ' .sim'), sel));
  };
  const ro = (sel, i) => p.evaluate(([s, k]) => document.querySelectorAll(s + ' .sim-ro dd')[k]?.textContent || '', [sel, i]);
  const setNum = async (sel, id, v) => { await p.locator(sel + ` input.sim-num[data-param="${id}"]`).fill(String(v)); await p.locator(sel + ` input.sim-num[data-param="${id}"]`).press('Tab'); };
  // what the engine itself gives on the page for these values (the same spec, the app's NoemaCore.engines.expr): the reference for the worker's numbers
  const direct = (aid, vals) => p.evaluate(([a, v]) => { const sp = ACT.ITEMS[a].spec, E = ACT.engine(sp.engine), env = { ...(sp.consts || {}) };
    for (const q of sp.params) env[q.id] = q.id in v ? v[q.id] : q.default; for (const d of sp.derived || []) env[d.id] = NoemaCore.engines.expr.compile(d.expr)(env);
    return E.create(sp, { seed: 1 }).run(E.prepare(sp, NoemaCore.engines.expr.compile)(env)); }, [aid, vals]);
  // the library's engines are known at once (caps, pack.requires) and loaded the first time an activity needs one (NoemaCore.engines.load)
  const p6 = await p.evaluate(async () => { const ids = ['thermal@1', 'pid@1', 'rf@1', 'twin@1'], known = ids.every(e => ACT.caps().has('engine:' + e)), rep = await NoemaCore.engines.load(ids);
    return { known, ok: rep.ok, failed: rep.failed, worker: ids.every(e => typeof ACT.engine(e)?.workerSource === 'string'), bench: ACT.engine('twin@1')?.bench === true, req: checkRequires(), met: checkRequires().every(x => x === 'runtime:py-module@1' && !ACT.enabled('py-module@1')) }; });
  ok(p6.known && p6.ok && p6.worker && p6.bench && p6.met,
    'the app has engine:thermal@1, engine:pid@1, engine:rf@1 and engine:twin@1 (each loads with a workerSource; twin@1 runs benches); pack.requires is met (but for Python where it cannot run) ' + JSON.stringify(p6));

  console.log('— thermal@1: heatsink');
  const HS = 'main .act-blk .act[data-activity="heatsink"]';
  ok(await openSec(HS) && await until(() => p.evaluate(s => /174[.,]0\s*°C/.test(document.querySelector(s + ' .sim-ro')?.textContent || ''), HS), 15000), 'heatsink renders (no frame) and computes: Tj = 174.0 °C with Rsa = 6 K/W');
  ok(!(await p.evaluate(s => !!document.querySelector(s + ' iframe'), HS)) && (await p.evaluate(s => [...document.querySelectorAll(s + ' .sim-plot path.sim-line')].map(x => (x.getAttribute('d') || '').split('L').length), HS)).every(n => n > 100), 'the warm-up curves of the junction and the heatsink are plotted');
  await setNum(HS, 'Rsa', 3.5);
  const hs = await direct('heatsink', { Rsa: 3.5 });
  ok(await until(async () => Math.abs(val(await ro(HS, 0)) - hs.tjSS) < 0.06), `Rsa = 3.5 K/W: the worker's Tj (${await ro(HS, 0)}) is the engine's ${hs.tjSS.toFixed(2)} °C; the slowest time constant ${await ro(HS, 3)}`);

  console.log('— pid@1: pid-tune');
  const PT = 'main .act-blk .act[data-activity="pid-tune"]';
  ok(await openSec(PT) && await until(async () => /\d/.test(await ro(PT, 0)), 15000), 'pid-tune renders and computes the step response');
  for (const [k, v] of [['Kp', 2], ['Ki', 3], ['Kd', 0.4]]) await setNum(PT, k, v);
  const pt = await direct('pid-tune', { Kp: 2, Ki: 3, Kd: 0.4 });
  ok(await until(async () => Math.abs(val(await ro(PT, 1)) - pt.ts) < 0.006), `Kp 2, Ki 3, Kd 0.4: settling ${await ro(PT, 1)} and overshoot ${await ro(PT, 0)} as the engine gives (${pt.ts.toFixed(3)} s, ${pt.os.toFixed(2)} %)`);
  ok((await p.evaluate(s => document.querySelectorAll(s + ' .sim-plot').length, PT)) === 2, 'two plots: the step response with its marks, and the control signal');

  console.log('— rf@1: lora-link');
  const LL = 'main .act-blk .act[data-activity="lora-link"]';
  ok(await openSec(LL) && await until(async () => /dB/.test(await ro(LL, 2)), 15000), 'lora-link renders and computes the link budget');
  await p.selectOption(LL + ' select[data-param="ant"]', '5'); await setNum(LL, 'sf', 9);
  const ll = await direct('lora-link', { sf: 9, ant: 5 });
  ok(await until(async () => Math.abs(val(await ro(LL, 2)) - ll.margin) < 0.06), `SF9 with the 5 dBi antenna: margin ${await ro(LL, 2)} (engine ${ll.margin.toFixed(2)} dB), ${await ro(LL, 3)} on air`);

  console.log('— twin@1: sensor-node');
  const SN = 'main .act-blk .act[data-activity="sensor-node"]';
  ok(await openSec(SN) && await until(async () => /\d/.test(await ro(SN, 2)), 15000), 'sensor-node renders and simulates 30 days of the device');
  await setNum(SN, 'period', 900);
  const sn = await direct('sensor-node', { period: 900 });
  ok(await until(async () => Math.abs(val(await ro(SN, 2)) - Math.round(sn.life / 86400)) < 1.5), `a wake every 15 minutes: ${await ro(SN, 2)} days of battery (engine ${(sn.life / 86400).toFixed(1)}), ${await ro(SN, 0)} readings a day`);

  console.log('— the P6 exercises: graded by their checks');
  const card = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX[id]); c.id = 'T'; m.append(c); scrollTo(0, 0); }, id); await until(() => p.evaluate(() => !!document.querySelector('#T .sim .sim-ro dd')?.textContent)); };
  const grade = async () => { await p.click('#T button:has-text("Check")'); await until(() => p.evaluate(() => document.getElementById('T')._locked())); return p.evaluate(() => { const c = document.getElementById('T'); return { ok: !!c.querySelector('.explain.ok'), bad: !!c.querySelector('.explain.bad'), list: [...c.querySelectorAll('.act-checks li')].map(l => l.className).join() }; }); };
  const tries = [
    ['ch01-e904', [['Rsa', 3.5]], true], ['ch01-e904', [['Rsa', 1]], false],
    ['ch01-e905', [['Kp', 2], ['Ki', 3], ['Kd', 0.4]], true], ['ch01-e905', [['Kp', 1.05]], false],
    ['ch01-e906', [['ant', '5'], ['sf', 9]], true], ['ch01-e906', [['sf', 12]], false],
    ['ch01-e907', [['period', 900]], true], ['ch01-e907', [['period', 7200]], false],
  ];
  for (const [id, sets, want] of tries) {
    await card(id);
    for (const [k, v] of sets) { if (typeof v === 'string') await p.selectOption(`#T select[data-param="${k}"]`, v); else await setNum('#T', k, v); }
    await computed(p);
    const g = await grade();
    ok(want ? g.ok && !g.bad : g.bad && !g.ok, `${id} ${sets.map(([k, v]) => k + ' ' + v).join(', ')}: graded ${want ? 'right' : 'wrong'} (${g.list})`);
  }

  console.log('— twin@1: the fault-finding bench (a modified sensor-node)');
  await p.evaluate(() => {
    const a = JSON.parse(JSON.stringify(ACT.ITEMS['sensor-node'])); a.id = 'node-bench';
    a.spec.bench = { faults: [{ id: 'antenna', apply: [{ kind: 'antenna-detached' }] }, { id: 'ageing', apply: [{ kind: 'battery-ageing' }] }, { id: 'wake', apply: [{ kind: 'wake-period', factor: 0.1 }] }],
      points: [{ id: 'VBAT', at: 'vbat', label: 'period' }, { id: 'VLOAD', at: 'vload', label: 'soc' }, { id: 'GND', at: 'gnd', label: 'time' }, { id: 'ISENSE', at: 'i', label: 'iAvgLabel' }],
      instruments: [{ kind: 'V', points: ['VBAT', 'VLOAD', 'GND'] }, { kind: 'I', parts: [{ element: 'battery', label: 'iAvgLabel' }] }, { kind: 'scope', points: ['ISENSE'], tEnd: 1300 }, { kind: 'log' }, { kind: 'rssi' }],
      budget: 6, diagnosis: { options: [{ label: 'checkLife', fault: 'antenna' }, { label: 'checkRate', fault: 'ageing' }, { label: 'perDayLabel', fault: 'wake' }, { label: 'ratioLabel' }] } };
    ACT.ITEMS['node-bench'] = a;
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'node-bench' })); scrollTo(0, 0);
  });
  await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .sim-bench'))), 'a bench on twin@1 mounts ' + await p.evaluate(() => document.querySelector('main .act-note')?.textContent || ''));
  const inst = await p.evaluate(() => [...document.querySelectorAll('main [data-bench="instrument"] option')].map(o => o.textContent));
  ok(inst.join('|') === 'Multimeter: voltage|Multimeter: current|Oscilloscope|Event log|Radio: signal strength (RSSI)', `five instruments in the learner's words: ${inst.join(' · ')}`);
  const secret = () => p.evaluate(() => { const h = document.body.innerHTML.replace(/data-activity="[^"]*"/g, '') + document.body.innerText; return /antenna-detached|battery-ageing|wake-period|"antenna"|"ageing"/.test(h) || !!document.querySelector('main .sim-dx-out')?.textContent; });
  ok(!(await secret()), 'the hidden fault is nowhere in the page before the diagnosis');
  const blog = () => p.evaluate(() => [...document.querySelectorAll('main .sim-log li')].map(l => l.textContent));
  const meas = async (i, a, n) => { await p.selectOption('main [data-bench="instrument"]', i); if (a) await p.selectOption('main [data-bench="a"]', a); await p.click('main [data-bench="measure"]'); await until(async () => { const l = await blog(); return l.length === n && !/…$/.test(l[n - 1]); }, 15000); };
  await meas('V', 'VBAT', 1); await meas('I', null, 2); await meas('scope', 'ISENSE', 3); await meas('log', null, 4); await meas('rssi', null, 5);
  const L = await blog();   // (the hidden fault is drawn at random: an aged cell can read a round “3 V”)
  ok(L.length === 5 && /\b[34]([.,]\d+)?\s*V\b/.test(L[0]) && /µA|mA/.test(L[1]) && /peak to peak/.test(L[2]) && /mA/.test(L[2]) && /resets: \d+, lost messages: \d+, overrun wake-ups: \d+/.test(L[3]) && /-?−?\d+[.,]\d\s*dBm/.test(L[4]), `the readings: ${L.join(' | ')}`);
  const hide = await p.evaluate(() => { const r = q => document.querySelector(`main [data-bench="${q}"]`).closest('.sim-p'); return { a: r('a').hidden, b: r('b').hidden, part: r('part').hidden }; });
  ok(hide.a && hide.b && hide.part, 'the RSSI reading and the event log need no lead: no point is offered');
  await p.selectOption('main [data-bench="instrument"]', 'scope'); await p.selectOption('main [data-bench="a"]', 'ISENSE'); await p.click('main [data-bench="measure"]');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .sim-face path.sim-line') && /Current \(A\)/.test(document.querySelector('main .sim-face svg')?.textContent || ''))), 'the scope face plots the supply current (axis "Current (A)")');
  ok(/5 measurements left|1 measurement left|No measurements left/.test(await p.evaluate(() => document.querySelector('main .sim-left')?.textContent || '')) && !(await secret()), 'the budget counts down; still hidden');
  await p.selectOption('main [data-bench="diagnosis"]', '0'); await p.click('main [data-bench="commit"]'); await wait(200);
  const v = await p.evaluate(() => ({ cls: document.querySelector('main .sim-dx-out')?.className || '', txt: document.querySelector('main .sim-dx-out')?.textContent || '', dis: document.querySelector('main [data-bench="measure"]').disabled }));
  ok(/sim-dx-out (ok|bad)/.test(v.cls) && v.txt.length > 5 && v.dis, `"Check my diagnosis": the verdict (${v.txt}) and the bench locks`);
  // the readings are the engine's: the same device and fault, measured by NoemaTwin on the page
  const want = await p.evaluate(() => { const sp = ACT.ITEMS['node-bench'].spec, E = ACT.engine('twin@1'), env = { ...(sp.consts || {}), period: 60, perDay: 1440 };
    return ['antenna', 'ageing', 'wake'].map(id => E.create(sp, { seed: 1, faults: sp.bench.faults.find(f => f.id === id).apply }).measure(E.prepare(sp, NoemaCore.engines.expr.compile)(env), { kind: 'I' }).value); });
  ok(want.some(w => Math.abs(val(L[1]) - w) <= 0.01 * w), `the ammeter shows the engine's average current for the drawn device (${L[1]}; NoemaTwin: ${want.map(w => (w * 1e6).toFixed(1) + ' µA').join(', ')})`);
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}
/* py-module@1 (docs/INTERACTIVE_PYTHON.md): the reference py-filter over http, from the built site (dist/site) with the pinned Python
   files (tools/fetch_pyodide.py) and the site's own _headers. The runtime is on by default; the test also forces the flag on, whatever config.js says.
   Checks: the first-use note (sizes from the manifest), the Python sim renders in the sim-spec view, a slider changes Python's outputs,
   the checks grader grades Python's outputs right and wrong, Settings › "Prepare Python for offline" → ready offline (classic and shell),
   offline after prepare (/vendor aborted) it still runs, the Greek words, the one-file bundle (over http and from disk) shows the fallback. */
async function python(name) {
  const fs = require('fs'), cp = require('child_process');
  const SITE = path.join(ROOT, 'dist', 'site'), BUNDLE = path.join(ROOT, 'dist', 'noema-lite.html');
  console.log('— py-module@1');
  if (!fs.existsSync(path.join(SITE, 'index.html'))) { console.log('  SKIP: no dist/site (python3 tools/build.py site)'); return; }
  if (!fs.existsSync(path.join(SITE, 'vendor', 'pyodide', 'manifest.json'))) {
    try { cp.execFileSync('python3', [path.join(ROOT, 'tools', 'fetch_pyodide.py'), '--site', SITE], { stdio: 'inherit' }); }
    catch (e) { console.log('  SKIP: tools/fetch_pyodide.py could not fetch Pyodide (network?)'); return; }
  }
  // the site's own _headers (Netlify: every rule whose path matches adds its headers)
  const rules = []; let cur = null;
  for (const l of fs.readFileSync(path.join(SITE, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(l)) { cur = { re: new RegExp('^' + l.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), h: {} }; rules.push(cur); }
    else if (cur && /^\s+[\w-]+:/.test(l)) { const i = l.indexOf(':'); cur.h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/zip', '.woff2': 'font/woff2' };
  let BLOCK = false; const VH = [];
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (u.endsWith('/')) u += 'index.html';
    if (u.startsWith('/vendor/')) { VH.push(u); if (BLOCK) { r.writeHead(503); return r.end(); } }
    if (u === '/bundle.html') { r.writeHead(200, { 'content-type': TYPES['.html'] }); return r.end(fs.readFileSync(BUNDLE)); }
    const f = path.join(SITE, u);
    if (u.includes('..') || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
    const hd = { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' };
    for (const x of rules) if (x.re.test(u)) Object.assign(hd, x.h);
    r.writeHead(200, hd); r.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const URL0 = `http://127.0.0.1:${srv.address().port}`;
  const man = JSON.parse(fs.readFileSync(path.join(SITE, 'vendor', 'pyodide', 'manifest.json'), 'utf8'));
  const browser = await pw[name].launch(name === 'chromium' && process.env.PW_CHANNEL !== '' ? { channel: process.env.PW_CHANNEL || 'chromium' } : {});
  // the runtime switched on (NOEMA_CONFIG.activities['py-module@1'] = true), whatever config.js says — the same for the site and the bundle
  const flagOn = () => { let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (v && typeof v === 'object') v.activities = Object.assign({}, v.activities, { 'py-module@1': true }); } }); };
  const E = [];
  const page = async (ctx, url, newUI) => {
    const p = await ctx.newPage(); p.setDefaultTimeout(15000); p.on('pageerror', e => E.push(e.message));
    await p.goto(url); await p.evaluate(n => { localStorage.clear(); if (n) localStorage.setItem('noema-test:newUI', '1'); }, !!newUI); await p.reload(); await wait(800);
    // the website ships no profiles (build.py site leaves accounts/ out) and asks "Who is studying?": one local profile on this device
    if (!await p.evaluate(() => !!window.Noema?.account)) { await p.evaluate(() => localStorage.setItem('noema1:accounts', JSON.stringify([{ id: 'learner', name: 'Learner', emoji: '🦉', pin: null, created: Date.now() }]))); await p.reload(); await wait(800); }
    await p.evaluate(async pk => { await Noema.importPack(Noema.account.id, pk); }, PACK);
    await p.goto(url + (url.includes('?') ? '&' : '?') + 'subject=demo-activities'); await wait(1500);
    return p;
  };
  const SEL = 'main .act-blk .act[data-activity="py-filter"]';
  const openBlock = async p => {
    await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await startIfParked(p, SEL);
  };
  const ro = (p, s = SEL) => p.evaluate(s => [...document.querySelectorAll(s + ' .sim-ro dd')].map(d => d.textContent), s);
  const filled = (p, s = SEL, ms = 120000) => until(() => p.evaluate(s => { const d = document.querySelectorAll(s + ' .sim-ro dd'); return d.length === 3 && [...d].every(x => /\d/.test(x.textContent)); }, s), ms);
  const setN = (p, s, v) => p.evaluate(([s, v]) => { const e = document.querySelector(`${s} input[type=range][data-param="N"]`) || document.querySelector(`${s} [data-param="N"]`); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [s, v]);

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(flagOn);
    let p = await page(ctx, URL0 + '/index.html');
    ok(await p.evaluate(() => !!ACT.ITEMS['py-filter'] && NoemaCore.runtimes.available('py-module@1') && ACT.caps().has('runtime:py-module@1') && checkRequires().length === 0), 'on the website (http, the runtime on): the app has runtime:py-module@1, pack.requires is met');
    // every text the quiet line shows (first use → loading → gone): from a local server Python loads in moments, so the
    // first-use note may be replaced by the progress before a poll would see it
    await p.evaluate(() => { window.__pyLines = []; new MutationObserver(() => { for (const l of document.querySelectorAll('.act-pyline')) { const x = l.textContent; if (x && window.__pyLines[window.__pyLines.length - 1] !== x) window.__pyLines.push(x); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
    await openBlock(p);
    const first = await until(() => p.evaluate(() => window.__pyLines.some(x => /downloads about \d+\s*MB once/.test(x))), 15000);
    const note = await p.evaluate(() => window.__pyLines.join(' | '));
    ok(first, `the first-use note says what it downloads, once (${note}; the manifest lists ${Object.keys(man.files || {}).length} files)`);
    ok(await filled(p), 'the Python sim renders: the readouts come from step() (' + (await ro(p)).join(' · ') + ')');
    const shape = await p.evaluate(s => { const r = document.querySelector(s); return { title: r.querySelector('.sim-title')?.textContent, plots: r.querySelectorAll('.sim-plot svg').length, frames: [...r.querySelectorAll('iframe')].map(f => ({ sb: f.getAttribute('sandbox'), vis: f.getAttribute('aria-hidden') !== 'true' && f.offsetHeight > 1 && getComputedStyle(f).opacity !== '0' })), line: r.querySelector('.act-pyline')?.hidden }; }, SEL);
    ok(shape.title === 'Two digital low-pass filters' && shape.plots === 2 && shape.frames.length === 1 && shape.frames[0].sb === 'allow-scripts' && !shape.frames[0].vis && shape.line, `the app's own controls and 2 plots; Python in one hidden sandboxed frame; the note gone once ready ${JSON.stringify(shape)}`);
    const r4 = await ro(p);
    await setN(p, SEL, 8); await until(async () => (await ro(p))[0] !== r4[0], 20000);
    const r8 = await ro(p);
    ok(/−?-?3[.,]7\s*dB/.test(r4[0]) && /−?-?1\d\d[.,]\d\s*dB|−?-?[5-9]\d[.,]\d\s*dB/.test(r8[0]) && /1[.,]3\s*dB/.test(r8[1]), `a slider changes Python's outputs: N = 4 → ${r4[0]}, N = 8 → ${r8[0]} (300 Hz: ${r8[1]})`);
    ok(VH.some(u => /numpy/.test(u)) && !VH.some(u => /scipy|openblas/.test(u)), 'numpy only: no scipy file was fetched (' + VH.length + ' /vendor requests)');

    console.log('— py-module@1: the sim exercise (checks on Python\'s outputs)');
    const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX['ch01-e911']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await startIfParked(p, '#T'); return filled(p, '#T', 60000); };
    const check = async () => { await p.click('#T button:has-text("Check")'); await wait(400); };
    ok(await card(), 'the sim exercise ch01-e911 shows the Python activity ' + await p.evaluate(() => { const c = document.getElementById('T'); return JSON.stringify({ note: c?.querySelector('.act-note')?.textContent, line: c?.querySelector('.act-pyline')?.textContent, ro: [...(c?.querySelectorAll('.sim-ro dd') || [])].map(d => d.textContent), bar: c?.querySelector('.act-bar')?.textContent, live: ACT.LIVE.length }); }));
    await setN(p, '#T', 16); await until(async () => /5[.,]9/.test((await ro(p, '#T'))[1] || ''), 20000); await check();
    const bad = await p.evaluate(() => { const c = document.getElementById('T'); return { bad: !!c.querySelector('.explain.bad'), list: [...c.querySelectorAll('.act-checks li')].map(l => l.className + ':' + l.textContent), att: S.att?.['ch01-e911']?.result }; });
    ok(bad.bad && bad.list.length === 2 && /^ok:/.test(bad.list[0]) && /^bad:/.test(bad.list[1]) && bad.att?.passed === false, `N = 16 removes the tone but loses 6 dB at 300 Hz: graded wrong ${JSON.stringify(bad.list)}`);
    await card(); await setN(p, '#T', 8); await until(async () => /1[.,]3/.test((await ro(p, '#T'))[1] || ''), 20000); await check();
    const good = await p.evaluate(() => ({ ok: !!document.querySelector('#T .explain.ok'), att: S.att?.['ch01-e911']?.result }));
    ok(good.ok && good.att?.passed === true && good.att.score === 1, `N = 8: graded right (score ${good.att?.score})`);

    console.log('— py-module@1: Settings › Prepare Python for offline (classic)');
    await p.evaluate(() => openAccountMenu('backup'));
    ok(await until(() => p.evaluate(() => [...document.querySelectorAll('.accbody details summary')].some(x => /Python for activities/.test(x.textContent))), 8000), 'the classic Backup tab has the Python section');
    const pyDet = p.locator('.accbody details', { has: p.locator('summary', { hasText: 'Python for activities' }) });
    await pyDet.locator('summary').click();
    const st0 = await pyDet.evaluate(d => ({ pill: d.querySelector('summary .pill')?.textContent, line: d.querySelector('.act-pyset .tiny')?.textContent, btn: d.querySelector('[data-py="prepare"]')?.hidden === false ? d.querySelector('[data-py="prepare"]').textContent : null }));
    ok(/Partly here/.test(st0.pill) && /of .* on this device/.test(st0.line) && /Prepare Python for offline \(\d/.test(st0.btn || ''), `before: partly here (numpy ran), the button says how much is left ${JSON.stringify(st0)}`);
    await pyDet.locator('[data-py="prepare"]').click();
    ok(await until(() => pyDet.evaluate(d => /Ready offline/.test(d.querySelector('summary .pill')?.textContent || '')), 180000), 'Prepare → the pill says "Ready offline"');
    const st1 = await pyDet.evaluate(d => ({ line: d.querySelector('.act-pyset .tiny')?.textContent, btn: d.querySelector('[data-py="prepare"]')?.hidden, tip: d.textContent }));
    ok(/numpy and scipy/.test(st1.line) && st1.btn === true, `after: what is on the device (${st1.line}); no button`);
    ok(VH.some(u => /scipy/.test(u)), 'Prepare fetched scipy too');
    const status = await p.evaluate(() => ACT.runtime('py-module@1').then(rt => rt.py.status()));
    ok(status && status.groups && Object.values(status.groups).every(g => g.ready), 'the Python service status(): every group is cached ' + JSON.stringify(Object.fromEntries(Object.entries(status?.groups || {}).map(([k, g]) => [k, g.ready]))));
    await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));

    console.log('— py-module@1: offline after Prepare');
    BLOCK = true; await ctx.route('**/vendor/**', rt => rt.abort());
    const p2 = await ctx.newPage(); p2.on('pageerror', e => E.push(e.message));
    await p2.goto(URL0 + '/index.html?subject=demo-activities'); await wait(1500); await openBlock(p2);
    ok(await filled(p2, SEL, 60000), 'a new page with /vendor blocked (server 503 + route abort) still runs the Python activity (' + (await ro(p2)).join(' · ') + ')');
    ok(!(await p2.evaluate(s => document.querySelector(s + ' .act-fallback'), SEL)), 'no fallback');
    await p2.close(); await ctx.unroute('**/vendor/**'); BLOCK = false;

    console.log('— py-module@1: the shell (Me › Data and sync) and Greek');
    await p.close();
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx3.addInitScript(flagOn);
    p = await page(ctx3, URL0 + '/index.html', true);
    await p.evaluate(() => { S.settings.lang = 'el'; save(); }); await p.reload(); await wait(1200);
    await p.evaluate(() => { location.hash = '#/me/data'; }); await wait(800); await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); await wait(300);
    const el = await until(() => p.evaluate(() => [...document.querySelectorAll('details summary')].some(x => /Python για τις δραστηριότητες/.test(x.textContent))), 8000);
    // the pill and the button are drawn once the section has read what is on the device (the Python service's need, over http)
    const elSec = () => p.evaluate(() => { const d = [...document.querySelectorAll('details')].find(x => /Python για τις δραστηριότητες/.test(x.querySelector('summary')?.textContent || ''));
      return d ? { pill: d.querySelector('summary .pill')?.textContent || '', line: d.querySelector('.act-pyset .tiny')?.textContent || '', btn: d.querySelector('[data-py="prepare"]')?.textContent || '' } : null; });
    const elOk = s => !!s && /Όχι σε αυτή τη συσκευή|Εν μέρει εδώ/.test(s.pill) && /Ετοίμασε την Python/.test(s.btn);
    await until(async () => elOk(await elSec()), 15000);
    const elS = await elSec();
    ok(el && elOk(elS), 'the shell\'s Data and sync page has the section, in Greek: ' + JSON.stringify(elS));
    await p.evaluate(() => { window.__pyLines = []; new MutationObserver(() => { for (const l of document.querySelectorAll('.act-pyline')) { const x = l.textContent; if (x && window.__pyLines[window.__pyLines.length - 1] !== x) window.__pyLines.push(x); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
    await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    if (await p.evaluate(() => { const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === SL('showAll')); b?.click(); return !!b; })) await wait(300);   // the section in steps: "show all" (in Greek)
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await startIfParked(p, SEL);
    ok(await until(() => p.evaluate(() => window.__pyLines.some(x => /κατεβάζει περίπου \d+\s*MB μία φορά/.test(x))), 15000), 'the first-use note in Greek ' + await p.evaluate(() => window.__pyLines.join(' | ')));
    await ctx3.close(); await ctx.close();

    console.log('— py-module@1: where Python cannot run (the one-file bundle, over http and from disk)');
    const fbOf = q => q.evaluate(s => { const r = document.querySelector(s); return r ? { sim: !!r.querySelector('.sim'), fb: !!r.querySelector('.act-fallback img'), note: r.querySelector('.act-note')?.textContent || '', text: r.querySelector('.act-fbtext')?.textContent || '' } : null; }, SEL);
    if (fs.existsSync(BUNDLE)) {
      const c4 = await browser.newContext(); await c4.addInitScript(flagOn); const V4 = [];   // this context's own /vendor requests (the server's list may still get late ones of the pages closed before)
      c4.on('request', r => { if (new URL(r.url()).pathname.startsWith('/vendor/')) V4.push(new URL(r.url()).pathname); });
      const b = await page(c4, URL0 + '/bundle.html'); await openBlock(b); await wait(800);
      const f = await fbOf(b);
      const bu = await b.evaluate(() => ({ bundle: !!window.NOEMA_BUNDLE, py: NoemaCore.runtimes.available('py-module@1') || ACT.hasRuntime('py-module@1') }));
      ok(bu.bundle && !bu.py && f && !f.sim && f.fb && /works only on the website/.test(f.note) && !V4.length, `the one-file bundle (even over http): the fallback, "works only on the website", no /vendor request ${JSON.stringify({ ...bu, vendor: V4.slice(0, 4), ...f, text: undefined })}`);
      await c4.close();
    } else console.log('  (no dist/noema-lite.html: python3 tools/build.py bundle)');
    if (fs.existsSync(BUNDLE)) {   // the one file as it is used: opened from disk
      const c5 = await browser.newContext(); await c5.addInitScript(flagOn);
      const fp = await page(c5, 'file://' + BUNDLE); await openBlock(fp); await wait(800);
      const f5 = await fbOf(fp);
      ok(f5 && !f5.sim && f5.fb && /works only on the website/.test(f5.note) && /moving-average|8 kHz|1 kHz/i.test(f5.text + ' ' + (await fp.evaluate(s => document.querySelector(s + ' img')?.alt || '', SEL))), `the one-file bundle from disk (file://): the fallback picture and text, "works only on the website" ${JSON.stringify(f5)}`);
      await c5.close();
    }
    ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  } finally { await browser.close(); srv.close(); }
}

/* h5p@1 (docs/INTERACTIVE_H5P.md): planets-quiz, an ordinary .h5p package (H5P.MultiChoice) whose file travels beside the pack. */
const h5pFrame = async (p, ms = 20000) => {   // the item's frame (inside the wrapper) once H5P has drawn the question
  let g = null;
  await until(async () => { for (const f of p.frames()) { if (!(f.parentFrame() && f.parentFrame().parentFrame() === p.mainFrame())) continue;
    if (await f.evaluate(() => document.querySelectorAll('.h5p-answer').length === 3).catch(() => false)) { g = f; return true; } } return false; }, ms);
  return g;
};
const h5pAnswer = async (g, text) => { await g.evaluate(t => [...document.querySelectorAll('.h5p-answer')].find(li => li.textContent.trim() === t).click(), text); await wait(150); await g.click('.h5p-question-check-answer'); await wait(400); };
const h5pStart = async (p, sel) => {   // a parked block (the live slots are taken): press its Start, as a learner would
  if (await until(() => p.evaluate(s => !!document.querySelector(s + ' iframe.act-frame'), sel), 1500)) return;
  const b = p.locator(sel + ' .act-bar button.primary'); if (await b.count()) await b.first().click();
};
async function h5p(p, ctx, E) {
  const E0 = E.length; hits.length = 0;
  const SEL = 'main .act-blk .act[data-activity="planets-quiz"]';
  const openSec = async () => {
    await p.evaluate(() => { location.hash = '#/'; }); await wait(300); await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(600);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await h5pStart(p, SEL);
    return h5pFrame(p);
  };
  console.log('— h5p@1: planets-quiz (an H5P package beside the pack)');
  const it = await p.evaluate(() => { const a = ACT.ITEMS['planets-quiz']; return a && { fn: typeof a.h5p, keys: Object.keys(a).includes('h5p'), json: JSON.stringify(a).includes('"h5p"'), caps: ACT.caps().has('runtime:h5p@1'), req: (Noema.pack.requires || []).includes('runtime:h5p@1'), by: Object.keys(a.h5pByLocale || {}), lang: SUBJ.language }; });
  ok(it && it.fn === 'function' && !it.keys && !it.json && it.caps && it.req, `the item has its loader (never stored: not enumerable, not in JSON); the app runs runtime:h5p@1, which pack.requires names ${JSON.stringify(it)}`);
  let g = await openSec();
  ok(!!g, 'the H5P block plays: the question and its three answers ' + await p.evaluate(s => document.querySelector(s + ' .act-note')?.textContent || '', SEL));
  if (!g) return;
  const attrs = await p.$eval(SEL + ' iframe.act-frame', f => { const P = new DOMParser(), w = P.parseFromString(f.srcdoc, 'text/html'), i = w.querySelector('iframe'), inn = i ? P.parseFromString(i.getAttribute('srcdoc'), 'text/html') : null;
    return { sandbox: f.getAttribute('sandbox'), inner: i?.getAttribute('sandbox'), wScripts: w.querySelectorAll('script').length, csp: inn?.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || '' }; });
  ok(attrs.sandbox === 'allow-scripts' && attrs.inner === 'allow-scripts' && attrs.wScripts === 0 && /script-src 'sha256-/.test(attrs.csp) && /connect-src 'none'/.test(attrs.csp) && !/unsafe-/.test(attrs.csp.split(';').find(d => /^\s*script-src/.test(d)) || ''),
    'the same sandbox as a mini-app: allow-scripts only, a wrapper with no scripts, scripts by hash (no unsafe-* in script-src; inline styles as for a mini-app), no network ' + JSON.stringify({ ...attrs, csp: attrs.csp.replace(/'sha256-[^']*' ?/g, '') }));
  ok(/Which planet is the largest/.test(await g.evaluate(() => document.querySelector('.h5p-question-introduction')?.textContent || '')), "its words in the pack's own language (the package's own content.json)");
  await h5pAnswer(g, 'Jupiter');
  ok(await until(() => p.evaluate(() => !!S.act?.['blk:ch01-s01:planets-quiz']?.data?.h5p)), 'the state H5P reports is saved (S.act … data.h5p)');
  await p.reload(); await wait(1500);
  g = await openSec();
  ok(g && await until(() => g.evaluate(() => { const li = [...document.querySelectorAll('.h5p-answer')].find(x => x.textContent.trim() === 'Jupiter'); return !!li && li.getAttribute('aria-checked') === 'true'; })), 'after a reload the saved state comes back: Jupiter is still chosen');

  console.log('— h5p@1: the sim exercise (grade "reported": the score H5P reports)');
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = NoemaCore.studyUi.current().exerciseCard(EX['ch01-e910']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await wait(300); await h5pStart(p, '#T'); return h5pFrame(p); };
  g = await card();
  ok(!!g, 'the exercise mounts the H5P item');
  await p.click('#T button:has-text("Check")'); await wait(200);
  ok(await p.evaluate(() => !document.getElementById('T')._locked()), 'Check before H5P reports a score does not grade');
  await h5pAnswer(g, 'Mars');
  await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.bad') && S.att?.['ch01-e910']?.result?.passed === false; }), 'a wrong answer (Mars) is graded wrong, and the attempt saved');
  g = await card(); await h5pAnswer(g, 'Jupiter');
  await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'), r = S.att?.['ch01-e910']?.result; return c._locked() && !!c.querySelector('.explain.ok') && r?.passed === true && r.score === 1 && /11 times/.test(c.textContent); }), 'the right answer (Jupiter) is graded right (score 1), and the reveal is shown');

  console.log('— h5p@1: translations through h5pByLocale (French from the pack, Greek), fallbacks');
  for (const [loc, want] of [['fr', /Quelle est la plus grande planète/], ['el', /Ηλιακό Σύστημα/]]) {
    await p.evaluate(([loc, el]) => { const a = ACT.ITEMS['planets-quiz'], b = { ...a, id: 'pq-' + loc, h5pByLocale: { ...a.h5pByLocale, ...(loc === 'el' ? { el: { content: el } } : {}) } };
      Object.defineProperty(b, 'h5p', { value: a.h5p, enumerable: false, configurable: true, writable: true }); ACT.ITEMS['pq-' + loc] = b;
      window.__lang = SUBJ.language; SUBJ.language = loc;   // the pack read in that language
      const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'pq-' + loc })); scrollTo(0, 0); }, [loc, PQ_EL]);
    await h5pStart(p, 'main'); g = await h5pFrame(p);
    const gr = g && await g.evaluate(() => ({ text: document.querySelector('.h5p-question-introduction')?.textContent || '', lang: document.documentElement.lang }));
    await p.evaluate(() => { SUBJ.language = window.__lang; });
    ok(gr && want.test(gr.text) && gr.lang === loc, `read in ${loc}: the item's content.json in that language (h5pByLocale.${loc}${loc === 'fr' ? ', put in by make_pack.py' : ''}) ${JSON.stringify(gr)}`);
  }
  const off = await p.evaluate(() => { window.NOEMA_CONFIG.activities = { 'h5p@1': false }; const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'planets-quiz' })); const r = { img: !!m.querySelector('.act-fallback img'), text: m.querySelector('.act-fbtext')?.textContent || '', frame: !!m.querySelector('iframe') }; delete window.NOEMA_CONFIG.activities; return r; });
  ok(off.img && /Jupiter/.test(off.text) && !off.frame, 'h5p@1 switched off: the fallback picture and text instead');
  await p.evaluate(B => { const a = ACT.ITEMS['planets-quiz'], c = JSON.parse(JSON.stringify(a.h5pByLocale.fr.content)); c.question = '<p><img src="' + B + '?h5p-img"> ?</p>';
    const b = { ...a, id: 'pq-link', h5pByLocale: { fr: { content: c } } }; Object.defineProperty(b, 'h5p', { value: a.h5p, enumerable: false, configurable: true, writable: true }); ACT.ITEMS['pq-link'] = b;
    window.__lang = SUBJ.language; SUBJ.language = 'fr';
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'pq-link' })); scrollTo(0, 0); }, BEACON);
  await h5pStart(p, 'main');
  ok(await until(() => p.evaluate(() => !document.querySelector('main iframe') && !!document.querySelector('main .act-fallback img')), 12000), 'a translation with an outside link is refused before any frame: the fallback');
  await p.evaluate(() => { SUBJ.language = window.__lang; });
  const bad = await p.evaluate(() => { const a = ACT.ITEMS['planets-quiz'], b = { ...a, id: 'pq-bad', sha256: 'f'.repeat(64) }; Object.defineProperty(b, 'h5p', { value: a.h5p, enumerable: false, configurable: true, writable: true }); ACT.ITEMS['pq-bad'] = b;
    const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: 'pq-bad' })); scrollTo(0, 0); return true; });
  await h5pStart(p, 'main');
  ok(bad && await until(() => p.evaluate(() => !document.querySelector('main iframe') && !!document.querySelector('main .act-fallback img')), 12000), 'a package that is not the one the pack names (sha256) never plays: the fallback');
  await wait(1000);
  ok(hits.length === 0, `no request leaves the H5P frame: ${JSON.stringify(hits)}`);
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}
/* h5p@1 in the one-file bundle (tools/build.py bundle_h5p): the .h5p inline up to NOEMA_H5P_INLINE_MAX; over it, the fallback. */
async function h5pBundle(browser, E) {
  for (const [file, inline] of [['act-bundle-inline.html', true], ['act-bundle-big.html', false]]) {
    const f = path.join(ROOT, file);
    if (!fs.existsSync(f)) { ok(false, `${file}: not built (tests/run_e2e.sh builds it)`); continue; }
    console.log(`— h5p@1 in the one-file bundle (${inline ? 'the .h5p inline' : 'the .h5p too big for the one file'})`);
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }), p = await c.newPage(); p.setDefaultTimeout(10000);
    const PE = []; p.on('pageerror', e => PE.push(e.message)); hits.length = 0;
    await p.goto('file://' + f + '?subject=demo-physics'); await wait(1500);
    ok(await until(() => p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.id === 'demo-physics' && !!ACT.ITEMS['planets-quiz'])), `${file}: the subject opens with its H5P item`);
    const kind = await p.evaluate(() => { const a = ACT.ITEMS['planets-quiz']; return { has: 'h5p' in a, type: a.h5p === null ? 'null' : typeof a.h5p, own: !Object.keys(a).includes('h5p') }; });
    ok(kind.has && kind.own && kind.type === (inline ? 'string' : 'null'), `${file}: the item's .h5p is ${inline ? 'inline (base64)' : 'left out (null)'} and not enumerable ${JSON.stringify(kind)}`);
    await p.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(800);
    const sa = await p.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(200); }
    const SEL = 'main .act-blk .act[data-activity="planets-quiz"]';
    await p.locator(SEL).first().scrollIntoViewIfNeeded(); await h5pStart(p, SEL);
    if (inline) ok(!!(await h5pFrame(p)), `${file}: the H5P item plays from the one file`);
    else ok(await until(() => p.evaluate(s => { const r = document.querySelector(s); return !!r && !r.querySelector('iframe') && !!r.querySelector('.act-fallback img') && /Jupiter/.test(r.querySelector('.act-fbtext')?.textContent || ''); }, SEL), 15000), `${file}: too big for the one file — its fallback picture and text`);
    ok(hits.length === 0 && !PE.length, `${file}: no request, no page errors ${JSON.stringify(hits)} ${JSON.stringify(PE.slice(0, 3))}`);
    await c.close();
  }
}
(async () => {
  const srv = http.createServer((q, r) => { hits.push(q.url); r.end('gone'); }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); BEACON = `http://127.0.0.1:${srv.address().port}/beacon`;
  for (const b of (process.env.BROWSERS || 'chromium').split(',')) { console.log(`\n[${b}]`); try { await run(b); } catch (e) { ok(false, b + ': ' + e.message.split('\n')[0]); }
    if (process.env.PY !== '0') try { await python(b); } catch (e) { ok(false, b + ' py-module@1: ' + e.message.split('\n')[0]); } }
  srv.close(); console.log(fails ? `\n${fails} failed` : '\nactivities_app: all passed'); process.exit(fails ? 1 : 0);
})();
