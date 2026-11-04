/* Interactive activities in the app (docs/INTERACTIVE.md, docs/adr/001): the library subject "Demo Activities"
   (built by tests/activities_pack.py with NOEMA_ACT_PACK, imported here into the local account) has the reference activity alias-lab as a theory
   block and as a graded sim exercise. Checks: the frame is sandboxed with exactly allow-scripts and the script-hash CSP;
   the handshake happens and the activity shows its words in the pack's language; state is saved and comes back; the sim
   exercise grades with what the activity reports (right and wrong), with hints; a missing activity and a runtime that is
   switched off show the fallback (picture + text); an endless loop is stopped and Restart works; no page errors.
   P6: wasm-module@1 (wasm-oscillator: the module through the sim renderer, the graded exercise, a refused import, runaway + Restart),
   the xAPI export from the subject's ⋮ (the file, the actor = the account id), external-embed@1 switched on (the consent card, nothing
   requested before Open, the frames, the remembered choice, Settings › Data "Ask again", offline, never graded).
   Usage: node tests/activities_app.js <prepared-repo-dir> <pack.json from tests/activities_pack.py (NOEMA_ACT_PACK)>   (BROWSERS=chromium,firefox,webkit) */
const pw = require(process.env.PW || 'playwright');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PACK = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); PACK.subject = { ...PACK.subject, id: 'demo-activities', title: 'Demo Activities' };
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(150); } return false; };
// a block that came into view while two others hold the live slots waits with its Start button (at most 2 run at once): press it
const startIfParked = async (p, sel) => { if (await until(() => p.evaluate(s => !!document.querySelector(s + ' .sim'), sel), 1500)) return; const b = p.locator(sel + ' .act-bar button'); if (await b.count()) await b.first().click(); };
const actFrame = (p, sel) => p.frames().find(f => f.parentFrame() && f.parentFrame().parentFrame() === p.mainFrame() && sel(f));   // the mini-app: inside the wrapper frame

const http = require('http'); const hits = []; let BEACON = '';
async function run(name) {
  // Chromium: the full browser (docs/adr/001 §2), not the headless shell. Its sandboxed srcdoc frames get their own process, and
  // Playwright then cannot attach to the mini-app frame nested in the wrapper (on a file:// page); IsolateSandboxedIframes off keeps
  // them in reach (the loop guard, not the process model, is what stops a runaway: Firefox and WebKit have no such process either).
  const browser = await pw[name].launch(name === 'chromium' && process.env.PW_CHANNEL !== '' ? { channel: process.env.PW_CHANNEL || 'chromium', args: ['--disable-features=IsolateSandboxedIframes'] } : {});
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
  await simSpec(p, ctx, E);
  await circuit(p, ctx, E);
  await p6engines(p, ctx, E);
  await wasmApp(p, ctx, E);
  await xapiApp(p, ctx, E);
  await embedApp(p, ctx, E);
  await browser.close();
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
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX['ch01-e908']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await wait(300);
    return until(() => p.evaluate(() => !!document.querySelector('#T .sim-ro dd')?.textContent)); };
  const setC = v => p.evaluate(v => { const e = document.querySelector('#T [data-param="c"]'); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  ok(await card(), 'the exercise card mounts the module');
  await setC(1); await wait(700); await p.click('#T button:has-text("Check")'); await wait(300);
  ok(await p.evaluate(() => { const c = document.getElementById('T'); return c._locked() && !!c.querySelector('.explain.bad') && /1 of 2|1 \/ 2/.test(c.querySelector('.act-checks-sum')?.textContent || ''); }), 'c = 1 (about 8 % left) is graded wrong: 1 of 2 conditions met');
  await card(); await setC(1.6); await wait(700); await p.click('#T button:has-text("Check")'); await wait(300);
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
  const item = await p.evaluate(() => { const it = subjectMenu()().find(x => x && x.label === tE('engine.xapi.export')); return it ? { label: it.label, sub: it.sub } : null; });
  ok(item && /xAPI/.test(item.label) && item.sub, 'the subject\'s ⋮ menu has the quiet item "Export learning record (xAPI)" ' + JSON.stringify(item));
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => subjectMenu()().find(x => x && x.label === tE('engine.xapi.export')).run())]);
  const file = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  ok(dl.suggestedFilename() === 'demo-activities.xapi.json' && file.format === 'noema.xapi-export/v1' && file.statements.length >= 5, `a JSON file is downloaded: ${dl.suggestedFilename()}, ${file.statements?.length} statements`);
  const acc = await p.evaluate(() => String(Noema.account.id));
  ok(file.statements.every(s => s.actor?.account?.name === acc && !s.actor.mbox && !s.actor.mbox_sha1sum) && !/mbox|@[a-z0-9-]+\.[a-z]/i.test(JSON.stringify(file.statements.map(s => s.actor))), 'the actor is the account id, never an e-mail');
  ok(file.statements.some(s => /passed|failed/.test(s.verb.id) && /ch01-e908/.test(s.object.id)) && file.statements.some(s => /answered/.test(s.verb.id) || /attempted/.test(s.verb.id)), 'the wasm exercise\'s result and the other attempts are in it');
  ok(await p.evaluate(f => NoemaXAPI.validateAll(f.statements).length === 0, file), 'the statements are valid xAPI 1.0.3 (NoemaXAPI.validateAll)');
  console.log('— cmi5: the course package');
  const c5 = await p.evaluate(() => { const it = subjectMenu()().find(x => x && x.label === tE('engine.xapi.cmi5')); return it ? { sub: it.sub, icon: it.icon } : null; });
  ok(c5 && c5.sub && c5.icon === 'download', 'next to it, the quiet item "Course package for an LMS (cmi5)" ' + JSON.stringify(c5));
  const [dz] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => subjectMenu()().find(x => x && x.label === tE('engine.xapi.cmi5')).run())]);
  const zbytes = require('fs').readFileSync(await dz.path());
  const xml = await p.evaluate(async b64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); return { names: Object.keys(z.files), xml: await z.file('cmi5.xml')?.async('string') }; }, zbytes.toString('base64'));
  const base = file.pack.activityBase;
  ok(dz.suggestedFilename() === 'demo-activities.cmi5.zip' && xml.names.join() === 'cmi5.xml' && /<courseStructure xmlns="https:\/\/w3id\.org\/xapi\/profiles\/cmi5\/v1\/CourseStructure\.xsd">/.test(xml.xml || '')
    && (xml.xml || '').includes(`<course id="${base}">`) && (xml.xml || '').includes(`<au id="${base}au/ch01"`) && /\?subject=demo-activities#\/ch\/ch01/.test(xml.xml || ''),
    `a .zip with cmi5.xml: the course and one AU per chapter, with the same ids as the xAPI record (${dz.suggestedFilename()}, ${xml.names})`);
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}

/* external-embed@1 (docs/INTERACTIVE_EMBED.md): off by default; switched on here (NOEMA_CONFIG), with PhET answered by a local route (the
   internet is never used). The consent card comes first and nothing is requested before Open; Open frames only the provider; the choice
   is remembered; Settings › Data has the quiet "Ask again" line; offline → the fallback with Restart; as an exercise → refused, no Restart. */
async function embedApp(p, ctx, E) {
  console.log('— external-embed@1: off by default');
  const E0 = E.length;
  ok(await p.evaluate(() => !ACT.runtime('external-embed@1') && !ACT.caps().has('runtime:external-embed@1')), 'the runtime is off in config (the app lacks runtime:external-embed@1)');
  const reqs = []; await ctx.route('https://phet.colorado.edu/**', r => { reqs.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fake PhET</title><p id="sim">Ohm</p>' }); });
  await ctx.addInitScript(() => { let v; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => v, set: x => { v = x; if (x && typeof x === 'object') x.activities = Object.assign({}, x.activities, { 'external-embed@1': true }); } }); });
  await p.reload(); await wait(1500);
  ok(await p.evaluate(() => !!ACT.runtime('external-embed@1')), 'switched on (NOEMA_CONFIG.activities["external-embed@1"] = true): the runtime registers');
  const ITEM = { id: 'ohm-phet', runtime: 'external-embed@1', stateVersion: 1, provider: 'phet', url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html',
    credit: 'PhET Interactive Simulations, University of Colorado Boulder · Ohm’s Law · CC-BY-4.0 · https://phet.colorado.edu', license: 'CC-BY-4.0', height: 480,
    fallback: { media: 'alias-lab-still', text: 'Ohm’s law: the current through a resistor grows with the voltage and falls with the resistance, I = V / R.' }, strings: { en: { title: 'Ohm’s law simulation', why: 'Move V and R and watch I.' } } };
  const mountBlk = () => p.evaluate(a => { ACT.ITEMS[a.id] = a; const m = document.querySelector('main'); m.innerHTML = ''; m.append(interactiveBlock({ t: 'interactive', activity: a.id })); scrollTo(0, 0); }, ITEM);
  await p.evaluate(() => { NoemaEmbed.consent.forget('phet'); }); await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main .act-embed-card'))), 'the card comes first');
  const cardT = await p.evaluate(() => document.querySelector('main .act-embed-card').textContent);
  ok(/needs the network/.test(cardT) && /cookies/.test(cardT) && /Open PhET/.test(cardT) && /CC-BY-4\.0/.test(cardT) && /terms/.test(cardT), 'the card: what opens, network and cookies, the credit and licence, the terms, Open PhET');
  await wait(800); ok(reqs.length === 0 && await p.evaluate(() => !document.querySelector('main iframe')), 'nothing of the provider is requested before Open');
  await p.click('main .act-embed-open');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-embed-frame'))) && await until(() => reqs.length >= 1), 'Open: the frame loads the provider (answered by the local route) ' + JSON.stringify(reqs.slice(0, 2)));
  const fr = await p.$eval('main iframe.act-embed-frame', f => ({ sandbox: f.getAttribute('sandbox'), ref: f.getAttribute('referrerpolicy'), csp: (f.srcdoc.match(/frame-src [^;"]+/) || [''])[0], scripts: /<script/i.test(f.srcdoc), allow: f.getAttribute('allow') }));
  ok(fr.sandbox === 'allow-scripts allow-same-origin' && fr.ref === 'no-referrer' && fr.csp === 'frame-src https://phet.colorado.edu' && !fr.scripts && /camera 'none'/.test(fr.allow), 'the frames: the provider\'s tokens only, no referrer, the wrapper has no scripts and frames only the provider ' + JSON.stringify(fr));
  ok(reqs.every(u => u.startsWith('https://phet.colorado.edu/sims/html/ohms-law/')) && await p.evaluate(() => /PhET/.test(document.querySelector('main .act-embed-credit')?.textContent || '')), 'only the allowed URL is requested; the credit stays under the frame');
  ok(await p.evaluate(() => !!S.settings.embedOk?.phet && NoemaEmbed.consent.list().includes('phet')), 'the choice is remembered (S.settings.embedOk, an account setting)');
  await mountBlk(); await startIfParked(p, 'main .act');
  ok(await until(() => p.evaluate(() => !!document.querySelector('main iframe.act-embed-frame') && !document.querySelector('main .act-embed-card'))), 'next time it opens without the card');

  console.log('— external-embed@1: Settings › Data — "Ask again"');
  // the page Settings › Data renders (ENGINE.accView('backup'): the same view in the frame and on the classic screens)
  await p.evaluate(async () => { const m = document.querySelector('main'); m.innerHTML = ''; const b = document.createElement('div'); b.className = 'accbody'; m.append(b); await ACC_VIEWS.backup(b, () => { }); });
  ok(await until(() => p.evaluate(() => !!document.querySelector('[data-embed-consent]'))), 'Settings › Data shows one quiet line for the outside activities');
  const row = await p.evaluate(() => { const r = document.querySelector('[data-embed-consent]'); return { text: r.textContent, tip: !!r.querySelector('.tip, [title], button[aria-label]'), btns: r.querySelectorAll('button').length }; });
  ok(/PhET/.test(row.text) && /Ask again/.test(row.text) && row.btns >= 1, 'the line names PhET, has its ⓘ and "Ask again" ' + JSON.stringify(row));
  await p.click('[data-embed-consent] button:has-text("Ask again")'); await wait(300);
  ok(await p.evaluate(() => !document.querySelector('[data-embed-consent]') && NoemaEmbed.consent.list().length === 0 && !S.settings.embedOk?.phet), '"Ask again" forgets the choice, and the line goes away');
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
  await p.evaluate(() => { for (const s of Object.values(__live)) s.destroy(); document.querySelector('main').innerHTML = ''; NoemaEmbed.consent.forget('phet'); });

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
  await p.locator(SEL + ' .sim-foot button').click(); await wait(150);
  ok(/339\s*Hz/.test((await ro())[0]), 'Reset brings back the defaults');
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
  await p.emulateMedia({ colorScheme: 'dark' }); await openSec(); await wait(300);
  const lum = c => { const m = (c.match(/[\d.]+/g) || [255, 255, 255]).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const dk = await p.evaluate(s => { const r = document.querySelector(s); const box = r.querySelector('.act-box'), dd = r.querySelector('.sim-ro dd'), ln = r.querySelector('.sim-plot path.sim-line');
    return { bg: getComputedStyle(box).backgroundColor, ink: getComputedStyle(dd).color, line: getComputedStyle(ln).stroke }; }, SEL);
  ok(lum(dk.bg) < 0.35 && lum(dk.ink) > 0.6 && dk.line && dk.line !== 'none', `dark mode: the theme's tokens (background ${dk.bg}, text ${dk.ink}, line ${dk.line})`);
  await p.emulateMedia({ colorScheme: 'light' }); await wait(200);

  console.log('— sim-spec@1: the sim exercise (checks grader)');
  const card = async () => { await p.evaluate(() => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX['ch01-e901']); c.id = 'T'; m.append(c); scrollTo(0, 0); }); await until(() => p.evaluate(() => !!document.querySelector('#T .sim .sim-ro dd')?.textContent)); };
  const setR = async v => { const n = p.locator('#T input.sim-num[data-param="R"]'); await n.fill(String(v)); await n.press('Tab'); await wait(150); };
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
  await mountItem('rc-badspec', "a.spec.derived.push({ id: 'x', expr: 'R +* 2' });"); await wait(500);
  let st = await fbState();
  ok(!st.sim && st.fb && /1 kHz/.test(st.text) && /could not start/.test(st.note) && !st.restart, `an invalid spec: the fallback picture and text, no simulation ${JSON.stringify(st.note)}`);
  await mountItem('rc-engine', "a.spec.engine = 'warp@9';"); await wait(500);
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
    const port = ACT.runtime('sim-spec@1').mount(box, { act: a, init: { locale: 'en', stateVersion: 1 }, onMessage: m => msgs.push(m), onFail: c => msgs.push({ fail: c }) });
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
  ok(await p.evaluate(() => ACT.caps().has('engine:circuit-mna@1') && checkRequires().length === 0), 'the app has engine:circuit-mna@1 (pack.requires is met)');

  console.log('— circuit-mna@1: the fault bench (an exercise)');
  const card = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX[id]); c.id = 'T'; m.append(c); scrollTo(0, 0); }, id); await until(() => p.evaluate(() => !!document.querySelector('#T .sim-bench'))); };
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
  // the same readings from NoemaCircuit itself: the netlist, the fault ledReversed, the seeded noise of the exercise (seed 7), the same order
  const want = await p.evaluate(() => { const sp = ACT.ITEMS['led-bench'].spec, s = NoemaCircuit.create(sp.model.netlist, { faults: sp.bench.faults.find(f => f.id === 'ledReversed').apply, seed: 7, noise: { rel: sp.model.noise.rel, abs: 0, seed: 7 } });
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
  // what the engine itself gives on the page for these values (the same spec, the app's NoemaExpr): the reference for the worker's numbers
  const direct = (aid, vals) => p.evaluate(([a, v]) => { const sp = ACT.ITEMS[a].spec, E = ACT.engine(sp.engine), env = { ...(sp.consts || {}) };
    for (const q of sp.params) env[q.id] = q.id in v ? v[q.id] : q.default; for (const d of sp.derived || []) env[d.id] = NoemaExpr.compile(d.expr)(env);
    return E.create(sp, { seed: 1 }).run(E.prepare(sp, NoemaExpr.compile)(env)); }, [aid, vals]);
  ok(await p.evaluate(() => ['thermal@1', 'pid@1', 'rf@1', 'twin@1'].every(e => ACT.caps().has('engine:' + e) && typeof ACT.engine(e)?.workerSource === 'string') && ACT.engine('twin@1').bench === true && checkRequires().length === 0),
    'the app has engine:thermal@1, engine:pid@1, engine:rf@1 and engine:twin@1 (each with a workerSource; twin@1 runs benches); pack.requires is met');

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
  const card = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX[id]); c.id = 'T'; m.append(c); scrollTo(0, 0); }, id); await until(() => p.evaluate(() => !!document.querySelector('#T .sim .sim-ro dd')?.textContent)); };
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
    await wait(300);
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
    return ['antenna', 'ageing', 'wake'].map(id => E.create(sp, { seed: 1, faults: sp.bench.faults.find(f => f.id === id).apply }).measure(E.prepare(sp, NoemaExpr.compile)(env), { kind: 'I' }).value); });
  ok(want.some(w => Math.abs(val(L[1]) - w) <= 0.01 * w), `the ammeter shows the engine's average current for the drawn device (${L[1]}; NoemaTwin: ${want.map(w => (w * 1e6).toFixed(1) + ' µA').join(', ')})`);
  ok(E.length === E0, 'no page errors ' + JSON.stringify(E.slice(E0, E0 + 3)));
}
(async () => {
  const srv = http.createServer((q, r) => { hits.push(q.url); r.end('gone'); }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); BEACON = `http://127.0.0.1:${srv.address().port}/beacon`;
  for (const b of (process.env.BROWSERS || 'chromium').split(',')) { console.log(`\n[${b}]`); try { await run(b); } catch (e) { ok(false, b + ': ' + e.message.split('\n')[0]); } }
  srv.close(); console.log(fails ? `\n${fails} failed` : '\nactivities_app: all passed'); process.exit(fails ? 1 : 0);
})();
