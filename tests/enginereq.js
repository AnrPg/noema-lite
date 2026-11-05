/* ⚙ Requests for new engines of interactive activities (engine/enginereq.js, engine/src/49_lib_view.js, docs/INTERACTIVE_LIBRARY.md §3)
   against the Supabase emulator (rules of cloud/supabase.sql §16) and the connector (cloud/mcp/server.mjs: noema_request_engine,
   noema_engine_requests, noema_engine_request_update).
   Without a browser: normalize (required fields, limits, accuracy, the catalogue's suggestions), cleanPatch, the brief, the local store.
   In the browser: the subject's ⋮ › Engines of activities opens #/engines (only engines this app has, grouped; nothing scrolls sideways
   at 320 px); Request a new engine: the required fields, the suggestions while writing, sending; Your requests with the status; a
   non-admin cannot answer; the admin sees every request and answers it in place; Claude asks for one and answers through the connector.
   Usage: node tests/enginereq.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54391, BASE = `http://localhost:${PORT}`;
const WHAT = 'Chemical equilibrium of a reversible reaction: the learner changes temperature, pressure and concentrations and sees the equilibrium shift (Le Chatelier), with K from ΔG = −RT ln K.';

async function unit() {
  console.log('— the domain, without a browser');
  const ls = new Map(); const ctx = { console, localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)) } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['engine/enginereq.js', 'engine/src/49_lib_catalog.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const R = ctx.NoemaEngineRequests;
  ok(R && typeof R.normalize === 'function' && typeof R.store === 'function', 'engine/enginereq.js loads without a page (as in the connector)');
  let n = R.normalize({});
  ok(n.problems.map(p => p.field + ':' + p.code).join() === 'title:missing,what:missing', 'a name and what to simulate are required: ' + n.problems.map(p => p.field + ':' + p.code).join());
  n = R.normalize({ title: 'abc', what: 'too short', accuracy: 'exact' });
  ok(n.problems.map(p => p.field + ':' + p.code).join() === 'title:short,what:short,accuracy:value' && n.row.accuracy === 'teaching', 'too short, and an accuracy that is not one of the three: ' + n.problems.map(p => p.field + ':' + p.code).join());
  n = R.normalize({ title: 'x'.repeat(121), what: WHAT });
  ok(n.problems.length === 1 && n.problems[0].code === 'long' && n.row.title.length === 120, 'too long: a problem, and the row is clipped');
  n = R.normalize({ title: '  Chemical equilibrium ', what: WHAT, accuracy: 'quantitative', subject: 'demo-physics', via: 'claude', locale: 'el', extra: 'dropped', status: 'available' });
  ok(!n.problems.length && n.row.title === 'Chemical equilibrium' && n.row.accuracy === 'quantitative' && n.row.via === 'claude' && n.row.locale === 'el' && n.row.subject === 'demo-physics' && !('extra' in n.row) && !('status' in n.row), 'a good request: trimmed; nothing but the request’s own fields (no status)');
  n = R.normalize({ title: 'A pendulum with friction', what: 'A damped pendulum: the learner changes the length, the damping and the start angle and sees the oscillation decay.' });
  ok(n.row.suggested[0] === 'ode@1', 'the catalogue suggests what may already do it: ' + n.row.suggested.join(', '));
  n = R.normalize({ title: 'Ημερολόγιο', what: 'Μετατροπή ημερομηνιών ανάμεσα στο εβραϊκό, το ισλαμικό και το γρηγοριανό ημερολόγιο, σε μια χρονογραμμή.' });
  ok(n.row.suggested.includes('timeline@1'), 'also in Greek (accents folded): ' + n.row.suggested.join(', '));
  ok(R.cleanPatch({ status: 'done' }).error && R.cleanPatch({ engine_id: 'Chem' }).error && JSON.stringify(R.cleanPatch({ status: 'available', engine_id: ' chem@1 ', answer: 'ok', fixed_in: 'PR 1', title: 'no' })) === '{"status":"available","engine_id":"chem@1","answer":"ok","fixed_in":"PR 1"}', 'cleanPatch: only status, engine_id, answer and fixed_in, checked');
  const b = R.brief({ id: 'r1', title: 'Chemical equilibrium', what: WHAT, accuracy: 'research', suggested: ['formula@1'], status: 'new', via: 'app', locale: 'de' });
  ok(/^# Engine request: Chemical equilibrium/.test(b) && /accuracy wanted: research/.test(b) && /formula@1 \(check these first/.test(b) && /## What should be simulated/.test(b) && /INTERACTIVE_LIBRARY\.md §1/.test(b) && !/## Sources/.test(b), 'the brief: the request, what the library may already do, how to build it (empty sections left out)');
  const L = R.store(null);
  ok(L.kind === 'local', 'no cloud account: the store of this device');
  const r = await L.submit(R.normalize({ title: 'Chemical equilibrium', what: WHAT }).row);
  ok(r.id && r.status === 'new' && (await L.mine()).length === 1 && !(await L.isAdmin()) && [...ls.keys()][0] === 'noema1:local:enginereq', 'it keeps the request on this device (noema1:<profile>:enginereq)');
}

(async () => {
  await unit();
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: false, onboarding: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  srv.state.admins.add('anr@example.com');
  const browser = await chromium.launch();
  const signUp = async (p, name, email) => {
    await p.goto(BASE + '/'); await wait(800);
    await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
    await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
    await p.click('button:has-text("Create account")'); await wait(1300);
    await p.evaluate(() => { localStorage.setItem('noema-test:newUI', '1'); NoemaThemes?.putSettings?.({ onboarded: Date.now(), world: 'know' }); });
    await p.reload(); await wait(900);
    if (await p.$('.ns-onb')) { await p.click('[data-pick="know"]').catch(() => { }); await wait(200); await p.click('[data-onbdone]').catch(() => { }); await wait(400); }
  };
  const E = [];
  try {
    console.log('— the page');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    p.on('pageerror', e => E.push(e.message));
    await signUp(p, 'Iro', 'iro@example.com');
    await p.evaluate(() => Noema.switchTo(Noema.account.id, 'demo-physics', '#/engines')); await wait(2500);
    ok(await until(() => p.locator('.eng-head h2').count()), '#/engines opens');
    const ids = await p.$$eval('.eng-row', l => l.map(e => e.dataset.engine));
    const reg = await p.evaluate(() => NoemaEngineCatalog.CATALOG.filter(e => e.runtime ? ACT.runtime(typeof e.runtime === 'string' ? e.runtime : e.id) : ACT.engine(e.id)).map(e => e.id));
    ok(ids.includes('formula@1') && ids.includes('html-app@1') && ids.includes('circuit-mna@1') && ids.length === reg.length && ids.every(i => reg.includes(i)), `only the engines this app has (${ids.length}): ` + ids.join(', '));
    ok(await p.locator('.eng-row[data-engine="formula@1"] b').innerText() === 'Formulas' && !(await p.$$eval('.eng-row', l => l.some(e => /engine\.engines\./.test(e.innerText)))), 'every engine with its name and one line (no missing words)');
    await p.screenshot({ path: SHOTS + '/engines_page.png', fullPage: true });
    console.log('— requesting one');
    await p.click('[data-act="request"]');
    ok(await until(() => p.locator('#engreq-title').count()), 'Request a new engine opens the form, the name first');
    ok(!(await p.locator('#engreq-field').isVisible()) && await p.locator('details.eng-more').count() === 1, 'the optional details are folded');
    await p.click('[data-act="send"]'); await wait(200);
    ok(/Name/.test(await p.locator('.modal .bad, .tiny.bad').first().innerText()) && !srv.state.ereqs.length, 'a name is required (nothing sent)');
    await p.fill('#engreq-title', 'Electronic filter with a resistor'); await p.fill('#engreq-what', 'short');
    await p.click('[data-act="send"]'); await wait(200);
    ok(/40/.test(await p.locator('.tiny.bad').first().innerText()), 'what to simulate needs 40 characters: ' + await p.locator('.tiny.bad').first().innerText());
    await p.fill('#engreq-what', 'An RC low-pass filter with a resistor and a capacitor: the learner changes R and C and sees the cutoff frequency and the voltage.');
    ok(await until(() => p.locator('.eng-sug .eng-row[data-engine="circuit-mna@1"]').count()), 'while writing, the engines that may already do it are shown');
    await p.click('details.eng-more summary'); await p.fill('#engreq-field', 'Electronics'); await p.selectOption('#engreq-accuracy', 'quantitative');
    await p.screenshot({ path: SHOTS + '/engines_request.png' });
    await p.click('[data-act="send"]');
    ok(await until(() => srv.state.ereqs.length === 1), 'sent');
    const q = srv.state.ereqs[0];
    ok(q.title === 'Electronic filter with a resistor' && q.field === 'Electronics' && q.accuracy === 'quantitative' && q.via === 'app' && q.locale === 'en' && q.subject === 'demo-physics' && q.suggested.includes('circuit-mna@1') && q.status === 'new' && q.requester_name === 'Iro', 'stored with the field, the accuracy, the subject, the language and the suggestions');
    ok(await until(() => p.locator('.eng-req').count().then(n => n === 1)) && /New/.test(await p.locator('.eng-req .eng-st').innerText()) && !(await p.locator('.eng-admin').count()), 'Your requests: the request with its status; no answering for someone who is not an admin');
    const iroT = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'iro@example.com', password: 'secret123' }) })).json()).access_token;
    const patch = await fetch(BASE + `/rest/v1/noema_engine_requests?id=eq.${q.id}`, { method: 'PATCH', headers: { apikey: 'k', authorization: 'Bearer ' + iroT, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'available' }) });
    ok((await patch.json()).length === 0 && q.status === 'new', 'the requester cannot change the status');
    console.log('— on a small phone');
    await p.setViewportSize({ width: 320, height: 700 }); await wait(400);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'at 320 px nothing scrolls sideways');
    await p.screenshot({ path: SHOTS + '/engines_320.png', fullPage: true });

    console.log('— the admin');
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); a.setDefaultTimeout(15000);
    a.on('pageerror', e => E.push('admin: ' + e.message));
    await signUp(a, 'ANR', 'anr@example.com');
    await a.evaluate(() => Noema.switchTo(Noema.account.id, 'demo-physics', '#/engines')); await wait(2500);
    ok(await until(() => a.locator('.eng-req').count().then(n => n === 1)) && /1 request/.test(await a.locator('.eng-mine h3').innerText()), 'the admin sees every request');
    await a.click('.eng-admin summary'); await a.selectOption('.eng-admin select', 'available');
    await a.fill('.eng-admin input[aria-label="Engine that does it"]', 'circuit-mna@1'); await a.fill('.eng-admin input[aria-label="Note for the requester"]', 'The circuit plugin already does this.');
    await a.click('.eng-admin button:has-text("Save")');
    ok(await until(() => q.status === 'available' && q.engine_id === 'circuit-mna@1' && q.answer === 'The circuit plugin already does this.'), 'the admin answers it in place');
    await p.setViewportSize({ width: 1280, height: 900 }); await p.reload(); await wait(2000);
    ok(await until(() => p.locator('.eng-req .eng-st').innerText().then(t => /Available/.test(t))) && /circuit-mna@1/.test(await p.locator('.eng-req').innerText()) && /already does/.test(await p.locator('.eng-answer').innerText()), 'the requester sees the answer');

    console.log('— Claude through the connector');
    const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] };
    const fn = path.join(os.tmpdir(), `noema-mcp-ereq-${process.pid}.mjs`);
    fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = {};\nglobalThis.window = globalThis;\n` + ['engine/report.js', 'engine/enginereq.js', 'engine/src/49_lib_catalog.js', 'engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
    const { default: handler } = await import(fn);
    const tok = async email => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })).json()).access_token;
    const tool = async (t, name, args) => (await (await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }))).json()).result;
    const AT = await tok('anr@example.com');
    const tl = (await (await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + iroT }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }))).json()).result.tools.map(t => t.name);
    ok(['noema_request_engine', 'noema_engine_requests', 'noema_engine_request_update'].every(n => tl.includes(n)), 'three new tools of their own');
    let r = await tool(iroT, 'noema_request_engine', { title: 'x' });
    ok(r.isError && /title: at least 4/.test(r.content[0].text) && /what: required/.test(r.content[0].text), 'noema_request_engine: the same checks');
    r = await tool(iroT, 'noema_request_engine', { title: 'Damped pendulum', what: 'A damped pendulum: the learner changes the length, the damping and the start angle and sees the oscillation decay.', check_only: true });
    ok(/ode@1/.test(r.content[0].text) && /Nothing was stored/.test(r.content[0].text) && srv.state.ereqs.length === 1, 'check_only: only what may already do it');
    r = await tool(iroT, 'noema_request_engine', { title: 'Chemical equilibrium', what: WHAT, accuracy: 'research', locale: 'el' });
    ok(/Request sent/.test(r.content[0].text) && srv.state.ereqs.length === 2 && srv.state.ereqs[1].via === 'claude' && srv.state.ereqs[1].accuracy === 'research', 'Claude sends one (via claude)');
    r = await tool(iroT, 'noema_engine_requests', {});
    ok(/2 all request/.test(r.content[0].text) && /circuit-mna@1/.test(r.content[0].text), 'noema_engine_requests: the account’s own, with the answers');
    ok((await tool(iroT, 'noema_engine_request_update', { id: srv.state.ereqs[1].id, status: 'planned' })).isError, 'noema_engine_request_update: admins only');
    r = await tool(AT, 'noema_engine_requests', {});
    ok(/1 open request/.test(r.content[0].text) && /Chemical equilibrium/.test(r.content[0].text) && /Iro/.test(r.content[0].text), 'the admin: the open ones of everybody');
    r = await tool(AT, 'noema_engine_requests', { id: srv.state.ereqs[1].id });
    ok(/^# Engine request: Chemical equilibrium/.test(r.content[0].text) && srv.state.ereqs[1].status === 'seen', 'one request: its brief (and it is marked seen)');
    ok((await tool(AT, 'noema_engine_request_update', { id: srv.state.ereqs[1].id, engine_id: 'Chem!' })).isError, 'a wrong engine id is refused');
    r = await tool(AT, 'noema_engine_request_update', { id: srv.state.ereqs[1].id, status: 'planned', answer: 'Planned as chem@1.' });
    ok(/planned/.test(r.content[0].text) && srv.state.ereqs[1].status === 'planned' && srv.state.ereqs[1].what === WHAT, 'the admin answers it; what was asked never changes');
    fs.unlinkSync(fn);
    ok(!E.length, 'no page errors' + (E.length ? ': ' + E.slice(0, 3).join(' | ') : ''));
  } catch (e) { console.error(e); fails++; }
  await browser.close(); srv.close();
  console.log('\n' + (fails ? `${fails} FAILED` : 'ALL PASSED')); process.exit(fails ? 1 : 0);
})();
