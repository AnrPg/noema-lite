/* ⚑ Problem reports (engine/report.js, engine/src/85_locate.js, docs/REPORTS.md) against the Supabase emulator (rules of
   cloud/supabase.sql §15) and the connector (cloud/mcp/server.mjs: noema_reports, noema_report, noema_report_update).
   Without a browser: the brief and the repository paths from a locator.
   In the browser: the button at the foot of the side bar (a line icon, no emoji), the dialog with a screenshot of the
   window as it is (also scrolled), a kind is required, 🎯 pointing at an exercise's question → the report names the
   exercise, its field and the pack version; a block of the theory read in a French translation → the translation file
   and the text in the pack's own language; an interface word → its catalog key; on a phone the item is in Me ▾; an
   account that is not an admin cannot see the reports page; the admin sees them (with a count in Me ▾), opens one
   (screenshot, the place, the brief for Claude), answers it; Claude reads the same report through the connector.
   Usage: node tests/reports.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54383, BASE = `http://localhost:${PORT}`;

function unit() {
  console.log('— the brief and the files, without a browser');
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine/report.js'), 'utf8'), ctx);
  const R = ctx.NoemaReport;
  ok(R && typeof R.brief === 'function' && !R.open, 'engine/report.js loads without a page (as in the connector): only the pure part');
  const loc = { route: { hash: '#/s/ch01-s01', page: 's', args: ['ch01-s01'] }, app: { version: '1.0.0', commit: 'abc123', url: 'https://noema-lite.netlify.app/' },
    subject: { id: 'demo-physics', title: 'Demo Physics', origin: 'library', version: 'v1', translation: 'fr', packLanguage: 'en', shown: 'fr' },
    item: { chapter: { id: 'ch01', num: 1, title: 'Énergie' }, section: { id: 'ch01-s01', title: 'Énergie cinétique' }, exercise: { id: 'ch01-e003', type: 'mcq', q: 'Quelle…', qOwn: 'Which…' }, field: { path: 'options.2', shown: '8 J', own: '8 J' }, content: { packLanguage: 'en', shown: 'fr', translation: 'fr' } },
    target: { picked: true, text: '8 J', selector: 'div.ex > button.opt', data: [{ nf: 'options.2' }, { ex: 'ch01-e003', ch: 'ch01' }], i18n: [] }, ui: { locale: 'fr' }, itemRef: 'ex:ch01-e003' };
  const files = R.repoFiles({ ...loc, kind: 'content' }).map(f => f.path);
  ok(files[0] === 'library/subjects/demo-physics/translations/fr/ch01.json' && files[1] === 'library/subjects/demo-physics/chapters/ch01.json', 'a library pack read in French: the French translation file first, then the chapter: ' + files.slice(0, 2).join(', '));
  const b = R.brief({ id: 'r1', kind: 'content', status: 'new', note: 'Option C should be 9 J', item: 'ex:ch01-e003', route: '#/s/ch01-s01', locator: loc });
  ok(/Item id:\*\* ex:ch01-e003/.test(b) && /`ch01-e003` type `mcq`/.test(b) && /Field:\*\* `options\.2`/.test(b) && /TRANSLATION of the pack’s en/.test(b) && /commit abc123/.test(b) && /Option C should be 9 J/.test(b), 'the brief: the item id, its type, the field, that it was a translation, the build, the learner’s words');
  const ui = R.repoFiles({ route: { page: '' }, target: { i18n: [{ key: 'sh.vault', locale: 'el' }, { key: 'roadmap.x', locale: 'en' }] } }).map(f => f.path);
  ok(ui.includes('i18n/shell/en.arb') && ui.includes('i18n/shell/el.arb') && ui.includes('i18n/roadmaps/en.arb') && ui.includes('i18n/roadmaps-map/en.arb'), 'an interface text: its component’s catalogs (English and the locale shown)');
  const comps = fs.readdirSync(path.join(ROOT, 'i18n')).filter(d => fs.existsSync(path.join(ROOT, 'i18n', d, 'en.arb')));
  const bad = []; for (const c of comps) for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', c, 'en.arb'), 'utf8'))).filter(k => !k.startsWith('@'))) if (!R.componentsOf(k).includes(c)) bad.push(c + ':' + k);
  ok(!bad.length, 'every catalog key’s prefix leads to its component (i18n/<component>/en.arb)' + (bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''));
  const lg = R.repoFiles({ route: { page: 'lang' }, lang: { course: 'polyglot-semitic-zh-de' } }).map(f => f.path);
  ok(lg[0] === 'library/languages/polyglot-semitic-zh-de/', 'a language course: its folder');
}

(async () => {
  unit();
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const E = []; p.on('pageerror', e => E.push(e.message));
  const openReport = async () => { await p.click('#ns-report'); return until(() => p.locator('.nr-modal .nr-send, .nr-modal .nr-actions .btn.primary').count()); };
  try {
    console.log('— the button and the dialog');
    await signUp(p, 'Iro', 'iro@example.com');
    await p.evaluate(() => Noema.switchTo(Noema.account.id, 'demo-physics', '#/s/ch01-s01')); await wait(2500);
    const btn = p.locator('#ns-report');
    ok(await btn.isVisible() && await btn.locator('svg.i').count() === 1 && !(await btn.innerText()).trim() && await btn.getAttribute('aria-label') === 'Report a problem', 'the side bar has the report button at its foot: a line icon (no emoji), named for screen readers');
    const rb = await btn.boundingBox(), mb = await p.locator('.ns-railme').boundingBox();
    ok(rb.y + rb.height <= mb.y + 2 && Math.abs((rb.x + rb.width / 2) - (mb.x + mb.width / 2)) < 3, 'it sits just above Me, centred in the rail');
    await p.evaluate(() => document.querySelector('[data-ex="ch01-e001"] [data-nf="q"]').scrollIntoView({ block: 'center' })); await wait(300);
    ok(await openReport(), 'pressing it opens the report dialog');
    const shot = await p.locator('.nr-shot img').getAttribute('src');
    ok(/^data:image\/jpeg;base64,/.test(shot || '') && shot.length > 20000, 'a screenshot of the window is taken first (JPEG, ' + Math.round((shot || '').length / 1024) + ' KB)');
    fs.writeFileSync(SHOTS + '/report_shot_scrolled.jpg', Buffer.from(shot.split(',')[1], 'base64'));
    ok(await p.locator('.nr-modal').evaluate(m => !/[\u{1F300}-\u{1FAFF}⚑]/u.test(m.innerText)), 'no emoji in the dialog: the app’s line icons');
    await p.screenshot({ path: SHOTS + '/report_dialog.png' });
    await p.click('.nr-send'); await wait(200);
    ok(/Choose what kind/.test(await p.locator('.nr-err').innerText()) && !srv.state.ereps.length, 'a kind is required');
    await p.click('.nr-kind[data-k="content"]'); await p.fill('.nr-note', 'The answer should be 9 J');
    console.log('— pointing at the wrong thing');
    await p.click('.nr-point'); await wait(300);
    ok(await p.locator('.nr-tip').isVisible() && !(await p.locator('.nr-modal').count()), 'pointing: the dialog steps aside, a hint says what to do');
    const qb = await p.locator('[data-ex="ch01-e001"] [data-nf="q"]').boundingBox();
    await p.mouse.move(qb.x + qb.width - 20, qb.y + qb.height / 2); await wait(150);
    ok(await p.locator('.nr-hl').isVisible(), 'the thing under the pointer is framed');
    await p.mouse.click(qb.x + qb.width - 20, qb.y + qb.height / 2);
    ok(await until(() => p.locator('.nr-modal .nr-pointed').count()), 'clicked: the dialog is back with what was pointed at');
    ok(await p.locator('.nr-kind.on[data-k="content"]').count() === 1 && await p.inputValue('.nr-note') === 'The answer should be 9 J', 'the kind and the words are kept');
    await p.click('.nr-send');
    ok(await until(() => srv.state.ereps.length === 1), 'sent');
    const r1 = srv.state.ereps[0], L1 = r1.locator;
    ok(r1.item === 'ex:ch01-e001' && L1.item.exercise.id === 'ch01-e001' && L1.item.exercise.type === 'calc' && L1.item.field.path === 'q' && L1.item.chapter.id === 'ch01' && L1.item.section.id === 'ch01-s01', 'the report names the exercise, its type, the field (the question), the chapter and section: ' + r1.item);
    ok(L1.subject.id === 'demo-physics' && L1.subject.origin === 'library' && /^[0-9a-f]{8,}/.test(L1.subject.version || '') && r1.route === '#/s/ch01-s01' && L1.route.page === 's', 'the subject, where it comes from, the pack version and the address');
    ok(L1.app.version && 'commit' in L1.app && L1.app.builtAt && L1.ui.locale === 'en' && L1.ui.viewport.w === 1280 && L1.ui.scroll.y > 0, 'the build, the interface language, the window and the scroll');
    ok(L1.target.picked && L1.target.data.some(d => d.ex === 'ch01-e001') && !L1.target.i18n.length && L1.visible.some(v => v.ref === 'ex:ch01-e001'), 'the element pointed at with its data-* chain (not mistaken for an interface text); what else was on screen');
    ok(/^data:image\/jpeg;base64,/.test(r1.shot || '') && r1.reporter_email === 'iro@example.com' && r1.status === 'new', 'with the screenshot (taken again with the frame on it), the reporter and status new');
    fs.writeFileSync(SHOTS + '/report_shot_pointed.jpg', Buffer.from(r1.shot.split(',')[1], 'base64'));
    ok(!(await p.locator('.nr-hl, .nr-tip').count()), 'nothing of the report is left on the page');

    console.log('— a block of the theory read in French (a translation of the pack)');
    await p.evaluate(() => { const k = `noema1:${Noema.account.id}:a:settings`; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.lang = 'fr'; localStorage.setItem(k, JSON.stringify(s)); });
    await p.goto(BASE + '/#/s/ch01-s01'); await p.reload(); await wait(2500);
    await p.evaluate(() => scrollTo(0, 0)); await wait(200);
    ok(await p.locator('#ns-report').getAttribute('aria-label') === 'Signaler un problème', 'the button speaks French');
    await openReport(); await p.click('.nr-kind[data-k="translation"]'); await p.click('.nr-point'); await wait(300);
    const pb = await p.locator('.blk [data-nf="text"]').first().boundingBox();
    await p.mouse.click(pb.x + 30, pb.y + pb.height / 2); await until(() => p.locator('.nr-modal .nr-pointed').count());
    await p.click('.nr-send'); await until(() => srv.state.ereps.length === 2);
    const L2 = srv.state.ereps[1].locator;
    ok(L2.subject.translation === 'fr' && L2.item.content.translation === 'fr' && /^blk:ch01-s01\//.test(srv.state.ereps[1].item) && L2.item.block.id && L2.item.block.text !== L2.item.block.textOwn && L2.item.block.textOwn, 'the block, with its text as shown (French) and in the pack’s own language: ' + srv.state.ereps[1].item);
    const f2 = (await p.evaluate(l => NoemaReport.repoFiles(l), L2)).map(f => f.path);
    ok(f2[0] === 'library/subjects/demo-physics/translations/fr/ch01.json', 'the place to fix it is the French translation file');

    console.log('— an interface word');
    await p.evaluate(() => { const k = `noema1:${Noema.account.id}:a:settings`; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.lang = 'en'; localStorage.setItem(k, JSON.stringify(s)); });
    await p.goto(BASE + '/#/'); await p.reload(); await wait(1500);
    await openReport(); await p.click('.nr-kind[data-k="translation"]'); await p.click('.nr-point'); await wait(300);
    const vb = await p.locator('.ns-tab[data-tab="vault"] .lb').boundingBox();
    await p.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2); await until(() => p.locator('.nr-modal .nr-pointed').count());
    await p.click('.nr-send'); await until(() => srv.state.ereps.length === 3);
    const r3 = srv.state.ereps[2];
    ok(r3.item === 'ui:sh.vault' && r3.locator.target.i18n[0].key === 'sh.vault' && !r3.subject, 'the tab’s word is found in the catalog: ' + r3.item);

    console.log('— on a phone, and who sees the reports');
    await p.setViewportSize({ width: 390, height: 800 }); await wait(300);
    ok(!(await p.locator('#ns-report').isVisible()), 'on a phone the rail (and its button) is not there');
    await p.click('#ns-topme'); await wait(300);
    ok(await p.locator('.ns-mepop .ns-reportitem').isVisible() && !(await p.locator('.ns-mepop button:has-text("Problem reports")').count()), 'Me ▾ has Report a problem; no Problem reports for someone who is not an admin');
    await p.keyboard.press('Escape'); await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(BASE + '/#/admin/reports'); await wait(1200);
    ok(await until(() => p.locator('.nr-admin .ns-panel').count()) && !(await p.locator('.nr-item').count()) && await p.evaluate(() => document.querySelector('.nr-admin').innerText === NoemaI18n.t('report.notAdmin')), 'the reports page refuses an account that is not an admin');
    const iroT = (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'iro@example.com', password: 'secret123' }) })).json()).access_token;
    const mine = await (await fetch(BASE + '/rest/v1/noema_error_reports?select=id,status', { headers: { apikey: 'k', authorization: 'Bearer ' + iroT } })).json();
    const patch = await fetch(BASE + `/rest/v1/noema_error_reports?id=eq.${mine[0].id}`, { method: 'PATCH', headers: { apikey: 'k', authorization: 'Bearer ' + iroT, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'fixed' }) });
    ok(mine.length === 3 && (await patch.json()).length === 0 && srv.state.ereps[0].status === 'new', 'the reporter reads their own reports but cannot change them');

    console.log('— the admin');
    const a = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })).newPage(); a.setDefaultTimeout(15000);
    a.on('pageerror', e => E.push('admin: ' + e.message));
    await signUp(a, 'ANR', 'anr@example.com'); await wait(800);
    ok(await until(() => a.locator('#ns-report.has-dot').count()), 'the admin’s report button carries a dot: new reports wait');
    await a.click('.ns-railme'); await wait(300);
    ok(/3/.test(await a.locator('.ns-mepop button:has-text("Problem reports")').innerText()), 'Me ▾ › Problem reports, with the count of new ones');
    await a.click('.ns-mepop button:has-text("Problem reports")');
    ok(await until(() => a.locator('.nr-item').count().then(n => n === 3)) && /3 reports/.test(await a.locator('.nr-bar').innerText()), 'the list: the three reports');
    await a.screenshot({ path: SHOTS + '/report_admin_list.png' });
    await a.click(`.nr-item[data-id="${r1.id}"]`);
    ok(await until(() => a.locator('.nr-where').count()), 'a report opens');
    const where = await a.locator('.nr-where').innerText();
    ok(/ex:ch01-e001/.test(where) && /ch01-e001 · calc/.test(where) && /demo-physics/.test(where) && /#\/s\/ch01-s01/.test(where) && await a.locator('.nr-bigshot img').count() === 1 && /9 J/.test(await a.locator('.nr-quote').innerText()), 'its screenshot, the learner’s words and the place: item, exercise, subject, address');
    ok(srv.state.ereps[0].status === 'seen', 'opening a new report marks it seen');
    await a.screenshot({ path: SHOTS + '/report_admin_one.png', fullPage: true });
    await a.click('.nr-copy'); await wait(400);
    const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(/# noema-lite problem report/.test(clip) && /library\/subjects\/demo-physics\/chapters\/ch01\.json/.test(clip) && /`ch01-e001` type `calc`/.test(clip), 'Copy the brief for Claude: the report, the unique place and the file to change');
    await a.selectOption('.nr-status', 'fixed'); await a.fill('.nr-anote', 'Fixed the expected answer'); await a.fill('.nr-fixed', 'abc1234'); await a.click('.nr-save');
    ok(await until(() => srv.state.ereps[0].status === 'fixed' && srv.state.ereps[0].fixed_in === 'abc1234' && srv.state.ereps[0].note === 'The answer should be 9 J'), 'the admin answers it (status, note, where it was fixed); the learner’s words stay');
    await a.click('.nr-filter [data-f="fixed"]'); await wait(600);
    ok(await a.locator('.nr-item').count() === 1, 'the Fixed filter');

    console.log('— Claude reads the same reports through the connector');
    const CFG = { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] };
    const fn = path.join(os.tmpdir(), `noema-mcp-rep-${process.pid}.mjs`);
    fs.writeFileSync(fn, `const CFG = ${JSON.stringify(CFG)};\nconst DOCS = {};\nglobalThis.window = globalThis;\n` + ['engine/report.js', 'engine/packcheck.js', 'engine/llm.js', 'engine/curriculum.js', 'engine/curjobs.js', 'engine/curshare.js', 'engine/imglib.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n').join('') + fs.readFileSync(path.join(ROOT, 'cloud/mcp/server.mjs'), 'utf8'));
    const { default: handler } = await import(fn);
    const tok = async email => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })).json()).access_token;
    const tool = async (t, name, args) => (await (await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }))).json()).result;
    const AT = await tok('anr@example.com');
    ok(/Only the app's admins/.test((await tool(iroT, 'noema_reports', {})).content[0].text), 'noema_reports: admins only');
    const lst = (await tool(AT, 'noema_reports', { status: 'all' })).content[0].text;
    ok(/3 all problem report/.test(lst) && lst.includes(r1.id) && /ui:sh\.vault/.test(lst), 'noema_reports lists them with their item ids');
    const one = await tool(AT, 'noema_report', { id: srv.state.ereps[1].id });
    ok(/translations\/fr\/ch01\.json/.test(one.content[0].text) && one.content.some(c => c.type === 'image' && c.mimeType === 'image/jpeg' && c.data.length > 1000), 'noema_report: the brief (the French translation file to fix) and the screenshot as an image');
    const up = await tool(AT, 'noema_report_update', { id: srv.state.ereps[1].id, status: 'fixing', note: 'on it' });
    ok(/fixing/.test(up.content[0].text) && srv.state.ereps[1].status === 'fixing' && srv.state.ereps[1].admin_note === 'on it', 'noema_report_update answers it');
    fs.unlinkSync(fn);
    ok(!E.length, 'no page errors' + (E.length ? ': ' + E.slice(0, 3).join(' | ') : ''));
  } catch (e) { console.error(e); fails++; }
  await browser.close(); srv.close();
  console.log('\n' + (fails ? `${fails} FAILED` : 'ALL PASSED')); process.exit(fails ? 1 : 0);
})();
