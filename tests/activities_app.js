/* Interactive activities in the app (docs/INTERACTIVE.md, docs/adr/001): the library subject "Demo Activities"
   (built by tests/activities_pack.py with NOEMA_ACT_PACK, imported here into the local account) has the reference activity alias-lab as a theory
   block and as a graded sim exercise. Checks: the frame is sandboxed with exactly allow-scripts and the script-hash CSP;
   the handshake happens and the activity shows its words in the pack's language; state is saved and comes back; the sim
   exercise grades with what the activity reports (right and wrong), with hints; a missing activity and a runtime that is
   switched off show the fallback (picture + text); an endless loop is stopped and Restart works; no page errors.
   Usage: node tests/activities_app.js <prepared-repo-dir> <pack.json from tests/activities_pack.py (NOEMA_ACT_PACK)>   (BROWSERS=chromium,firefox,webkit) */
const pw = require(process.env.PW || 'playwright');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PACK = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); PACK.subject = { ...PACK.subject, id: 'demo-activities', title: 'Demo Activities' };
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(150); } return false; };
const actFrame = (p, sel) => p.frames().find(f => f.parentFrame() && f.parentFrame().parentFrame() === p.mainFrame() && sel(f));   // the mini-app: inside the wrapper frame

const http = require('http'); const hits = []; let BEACON = '';
async function run(name) {
  const browser = await pw[name].launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const E = []; p.on('pageerror', e => { if (!/^noema: this activity ran too long/.test(e.message)) E.push(e.message); });   // (the loop guard's own stop, thrown inside the frame on purpose)
  await p.goto('file://' + ROOT + '/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(700);
  await p.evaluate(async pk => { await Noema.importPack(Noema.account.id, pk); }, PACK);
  await p.goto('file://' + ROOT + '/index.html?subject=demo-activities'); await wait(1500);
  ok(await p.evaluate(() => SUBJ.id === 'demo-activities' && !!ACT.ITEMS['alias-lab']), 'the pack opens with its activity');
  ok(await p.evaluate(() => checkRequires().length === 0), 'pack.requires: this app has everything the pack needs');

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
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX['ch01-e900']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await wait(300); };
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
  await browser.close();
}
(async () => {
  const srv = http.createServer((q, r) => { hits.push(q.url); r.end('gone'); }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); BEACON = `http://127.0.0.1:${srv.address().port}/beacon`;
  for (const b of (process.env.BROWSERS || 'chromium').split(',')) { console.log(`\n[${b}]`); try { await run(b); } catch (e) { ok(false, b + ': ' + e.message.split('\n')[0]); } }
  srv.close(); console.log(fails ? `\n${fails} failed` : '\nactivities_app: all passed'); process.exit(fails ? 1 : 0);
})();
