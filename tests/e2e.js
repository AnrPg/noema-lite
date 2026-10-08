/* End-to-end tests for noema-lite (Playwright + Chromium).
   Usage: node tests/e2e.js <prepared-repo-dir>
   The repo dir must contain a build with the demo-physics fixture (see tests/run_e2e.sh). */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
function errs(page, bag) { page.on('pageerror', e => bag.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FILE_NOT_FOUND|net::ERR|404|Failed to load resource/.test(m.text())) bag.push(m.text()); }); }

async function mockGemini(ctx) {
  await ctx.route('**/generativelanguage.googleapis.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] }] } });
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.generationConfig?.responseMimeType === 'application/json') {
      const sys = body.systemInstruction?.parts?.[0]?.text || '';
      const obj = /exam questions/.test(sys) ? { q: 'AI **question**?', code: '', options: ['a', 'b', 'c', 'd'], answer: 1, why: ['w', 'r', 'w', 'w'], explain: 'Because.' } : /debugging coach/.test(sys) ? { score: 66, hit: [0], feedback: 'Good start.' } : { score: 80, verdict: 'Solid', covered: ['x'], missing: ['y'], mistakes: [], feedback: 'Nice.' };
      return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });
    }
    if (url.includes('streamGenerateContent')) return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ['## Think\n\nWhat happens to **the log**?', ' Tell me.'].map(t => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }) + '\n\n').join('') });
    if (JSON.stringify(body).includes('Write the title')) return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'Delta Log Basics' }] } }] } });
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
  });
}

(async () => {
  const browser = await chromium.launch();
  /* ======================= A. LOCAL (file://) ======================= */
  console.log('A. local mode (file://)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await mockGemini(ctx);
  const page = await ctx.newPage(); const E = []; errs(page, E);
  const url = 'file://' + ROOT + '/index.html';
  await page.goto(url);
  // seed legacy single-file-app data, then reload
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dbquest_v1', JSON.stringify({ xp: 50, xpDay: { '2026-10-06': 50 }, streak: 3, lastDay: '2026-10-06', read: { 'ch01-s01': true }, res: { 'ch01-e001': { n: 1, ok: 1, last: true }, 'ch01-e002': { n: 1, ok: 0, last: false } }, pb: {}, fc: {}, boss: {}, last: 'ch01-s01', settings: { apiKey: 'LEGACYKEY', theme: 'auto', goal: 120, sound: true, chunk: true, models: [], model: '' } })); localStorage.setItem('dbquest_convos_v1', JSON.stringify([{ id: 'cv_x', created: 1, updated: 2, mode: 'socratic', ctx: null, title: 'Old Chat', msgs: [{ role: 'user', text: 'hi' }, { role: 'model', text: 'hello' }] }])); });
  await page.reload(); await wait(900);
  const chips = await page.$$eval('.noema-chip', c => c.map(x => x.textContent));
  ok(chips.length === 3 && chips.some(c => c.includes('Demo Physics')) && chips.some(c => c.includes('🔒')), 'subject picker lists library + private subjects: ' + chips.join(' | '));
  ok(await page.$$eval('.noema-grouphead', g => g.length) >= 2, 'subjects are grouped');
  await page.screenshot({ path: SHOTS + '/a1_picker.png' });
  await page.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  ok(await page.evaluate(() => S.xp === 50 && Object.keys(S.res).length === 2 && S.settings.apiKey === 'LEGACYKEY'), 'legacy progress migrated into anr/databricks');
  ok(await page.evaluate(() => localStorage.getItem('noema-device:geminiKey:anr') === 'LEGACYKEY' && !localStorage.getItem('noema1:anr:a:settings').includes('LEGACYKEY')), 'the Gemini key moved out of a:settings into this device only');
  ok(await page.evaluate(() => CV.list.length === 1 && CV.list[0].title === 'Old Chat'), 'legacy conversations migrated');
  const canon = await page.evaluate(async () => { const l = await Noema.convos.list('anr'); return l.length === 1 && l[0].schema === 'noema.conversation/v1' && l[0].messages[1].role === 'assistant' && l[0].subject.id === 'databricks'; });
  ok(canon, 'legacy conversation converted to canonical noema.conversation/v1 in IndexedDB');
  // background persistence of a live tutor chat + one-shot AI grading
  await page.evaluate(() => { S.settings.apiKey = 'TESTKEY'; flushSave(); openTutor({ kind: 'section', id: 'ch05-s04' }, 'socratic'); });
  await page.evaluate(() => sendTutor('What is a deletion vector?')); await wait(1500);
  await page.evaluate(async () => { const ex = ALL_EX.find(e => e.type === 'free'); await aiGrade(ex, 'my answer'); const ex2 = ALL_EX.find(e => e.type === 'write'); await aiGrade(ex2, 'SELECT 1'); await aiQuestion(SEC['ch05-s04']); });
  await wait(800);
  const recs = await page.evaluate(async () => (await Noema.convos.list('anr')).map(r => [r.kind, r.mode, r.context.type, r.context.id, r.messages.length, r.title]));
  ok(recs.some(r => r[0] === 'tutor' && r[2] === 'section' && r[3] === 'ch05-s04' && r[4] >= 2), 'tutor chat saved automatically with its context: ' + JSON.stringify(recs.find(r => r[0] === 'tutor' && r[3] === 'ch05-s04')));
  ok(['grading', 'code-review', 'question'].every(k => recs.some(r => r[0] === k)), 'AI grading, code review and generated question are saved as conversations');
  await page.screenshot({ path: SHOTS + '/a2b_tutor.png' });
  await page.evaluate(() => { T.showHistory = true; renderTutor(); }); await wait(300);
  await page.screenshot({ path: SHOTS + '/a2c_history.png' });
  // a conversation written by Meletee (same schema, its own tutor modes): kept as written, not read as 'socratic'
  const mel = await page.evaluate(async () => {
    const base = { kind: 'tutor', subject: { id: 'databricks', title: 'Databricks' }, model: { provider: 'claude', name: 'claude-x' }, meta: { app: 'meletee', task: 'feynman' }, messages: [{ role: 'user', content: 'Delta in plain words' }, { role: 'assistant', content: 'Try again, simpler.' }] };
    const a = await Noema.convos.put('anr', { ...base, id: 'cv_000000mel1aaaaaa', mode: 'feynman', title: 'Feynman: Delta' });
    const b = Noema.convos.normalize({ ...base, mode: 'Not A Mode!' });
    return [a.mode, a.meta?.app, b.mode, Noema.convos.normalize({ ...base, mode: 'why-chain' }).mode];
  });
  ok(mel.join() === 'feynman,meletee,socratic,why-chain', 'Meletee’s modes are kept (an invalid mode still reads as socratic): ' + mel.join());
  await page.evaluate(() => closeTutor());
  await page.reload(); await wait(900); await page.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  ok(await page.evaluate(() => CV.list.length >= 5 && CV.list.some(c => c.kind === 'tutor' && c.msgs.length >= 2)), 'conversations survive a reload (loaded from IndexedDB)');
  ok(await page.evaluate(() => { T.showHistory = true; openTutor(); renderTutor(); const c = [...$$('.cvcard')].find(x => x.textContent.includes('Feynman: Delta')); return !!c && c.querySelector('.cvfrom')?.textContent === 'from Meletee' && c.textContent.includes('Feynman coach'); }), 'conversation list: Meletee’s chat shows “from Meletee” and its mode');
  await page.screenshot({ path: SHOTS + '/a2d_history_meletee.png' });
  const melOpen = await page.evaluate(async () => { const cv = CV.list.find(c => c.id === 'cv_000000mel1aaaaaa'); openConvo(cv); const m = T.mode; cv.title = 'Feynman: Delta Lake'; cv.titleSource = 'user'; saveConvos(cv); await new Promise(r => setTimeout(r, 300)); const r = await Noema.convos.get('anr', cv.id); closeTutor(); return [m, r.mode, r.meta?.app, r.model?.provider, r.title]; });
  ok(melOpen.join() === 'explain,feynman,meletee,claude,Feynman: Delta Lake', 'opened in the tutor as a plain explanation; saving again keeps its mode, app and provider: ' + melOpen.join());
  ok(await page.evaluate(() => Noema.stats.get().xp === 50 && Noema.stats.streakNow() >= 0), 'account-level stats seeded');
  ok(await page.evaluate(() => !!localStorage.getItem('noema1:anr:s:databricks:state') && !!localStorage.getItem('dbquest_v1')), 'namespaced keys written, legacy keys kept (nothing deleted)');
  // stable flashcard ids: progress keyed by a card's position (chNN#k) moves to the card's id once; a:caps says so
  await page.evaluate(() => { S.fc = { 'ch01#2': { box: 3, due: '2099-12-01' }, 'ch02#0': { box: 1, due: '2026-01-01' }, 'ch02-f001': { box: 4, due: '2099-11-11' } }; flushSave(); });
  await page.reload(); await wait(900); await page.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  const mig = await page.evaluate(() => ({ fc: S.fc, key: CH.ch01.flashcards[2]._key, due: countDueCards(), saved: JSON.parse(localStorage.getItem('noema1:anr:s:databricks:state')).fc, caps: JSON.parse(localStorage.getItem('noema1:anr:a:caps') || '{}') }));
  ok(mig.key === 'ch01-f003' && mig.fc['ch01-f003']?.box === 3 && !mig.fc['ch01#2'], 'positional card progress (ch01#2) moved to the card id ch01-f003');
  ok(mig.fc['ch02-f001']?.box === 4 && !mig.fc['ch02#0'], 'when both keys exist the id wins and the positional key is dropped');
  ok(mig.saved['ch01-f003']?.box === 3 && !mig.saved['ch01#2'] && mig.due === 0, 'the move is saved (nothing due yet)');
  ok(mig.caps.stableCardIds === 1, 'a:caps announces stableCardIds');
  // regression: every section renders, every exercise accepts its correct answer
  const reg = await page.evaluate(() => {
    const fails = []; S.settings.chunk = false;
    for (const c of COURSE) { for (const s of c.sections) { try { location.hash = '#/s/' + s.id; route(); } catch (e) { fails.push(s.id + e.message); } } }
    let n = 0; for (const ex of ALL_EX) { try { const card = exerciseCard(ex, { noXP: true }); document.body.append(card); card.remove(); n++; } catch (e) { fails.push(ex.id + e.message); } }
    S.settings.chunk = true; return { fails, n, total: ALL_EX.length, vis: ALL_EX.filter(isVisual).length };
  });
  ok(!reg.fails.length && reg.n === reg.total && reg.n >= 1644 + 53 && reg.vis >= 53, `regression: ${reg.n} exercises (${reg.vis} visual) & all sections render`);
  // a single exercise by id (#/ex/<id>, deep links from Meletee) → a one-exercise run; announced in a:caps
  const exId = await page.evaluate(() => ALL_EX[7].id);
  await page.evaluate(id => { location.hash = '#/ex/' + id; }, exId); await wait(700);
  ok(await page.evaluate(id => location.hash === '#/run' && RUN.list.length === 1 && RUN.list[0].id === id && RUN.back === '#/s/' + EX[id].section, exId), '#/ex/<id> opens that one exercise, back to its section');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:caps') || '{}').exerciseRoute === 1), 'a:caps announces exerciseRoute');
  await page.evaluate(() => { location.hash = '#/ex/nope-e999'; }); await wait(400);
  ok(await page.evaluate(() => location.hash === '#/ex/nope-e999' && !!$('main') && !RUN?.list.some(e => e.id === 'nope-e999')), 'an unknown exercise id falls back to home');
  await page.evaluate(() => { location.hash = '#/'; }); await wait(500);
  await page.screenshot({ path: SHOTS + '/a2_databricks.png' });
  // account menu tabs
  for (const t of ['profile', 'settings', 'subjects', 'backup', 'cloud']) { await page.evaluate(t => { $('.modal')?.remove(); openAccountMenu(t); }, t); await wait(350); await page.screenshot({ path: SHOTS + `/a3_menu_${t}.png` }); }
  ok(await page.$$eval('.modal .tabs button', b => b.map(x => x.textContent).join('|')) === '👤 Profile|⚙️ Settings|📚 Subjects|💾 Backup & restore|☁️ Cloud|❓ Help', 'account menu has 6 tabs: Profile · Settings · Subjects · Backup · Cloud · Help');
  await page.evaluate(() => { $('.modal')?.remove(); openAccountMenu('backup'); }); await wait(500);
  ok(await page.evaluate(() => $$('.modal details.accsec').length === 4 && $$('.modal details.accsec[open]').length === 0), 'backup & restore sections are collapsed by default');
  await page.click('.modal details.accsec:nth-of-type(2) summary'); await wait(300);
  ok(await page.evaluate(() => $$('.modal details.accsec[open]').length === 1), 'a section expands on click');
  await page.screenshot({ path: SHOTS + '/a3b_backup_expanded.png' });
  await page.evaluate(() => { $('.modal')?.remove(); openAccountMenu('help'); }); await wait(400);
  ok(await page.$$eval('.modal details.accsec', d => d.length) === 9, 'help tab lists 9 setup guides');
  await page.screenshot({ path: SHOTS + '/a3c_help.png' });
  await page.evaluate(() => $('.modal')?.remove());
  // menus in the learner's language (engine/i18n.js): ⚙️ Settings → Language of the menus
  ok(await page.evaluate(() => { const B = NoemaI18n.bundles, en = Object.keys(B.en); return ['el', 'ru', 'fr'].every(l => en.every(k => B[l][k]) && Object.keys(B[l]).length === en.length); }), 'every menu string is translated in el, ru and fr');
  const setUiLang = async v => { await page.evaluate(v => { $('.modal')?.remove(); openAccountMenu('settings'); const sel = $('.modal select[aria-label="' + t('set.uiLang') + '"]'); sel.value = v; [...$$('.modal button')].find(b => b.textContent === 'Save settings').click(); }, v); await wait(1200); };
  await setUiLang('fr');
  ok(await page.evaluate(() => document.body.innerText.includes('Qu’est-ce que tu veux étudier\u202f?')), 'after the change the subject picker speaks French');
  await page.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  const fr = await page.evaluate(() => ({ tiles: $$('.modes .mode b').map(b => b.textContent), tutor: $('.iconbtn.tutor span').textContent, ch: (location.hash = '#/ch/ch01', route(), $$('main .tabs button').map(b => b.textContent.trim()).join('|')), back: $('main .back').textContent, cards: (location.hash = '#/cards', route(), $('main .back').textContent + ' ' + $('main h1').textContent), tabs: (openAccountMenu('profile'), $$('.modal .tabs button').map(b => b.textContent).join('|')) }));
  ok(fr.tiles[0] === 'Manche éclair' && fr.tiles.includes('Salle des erreurs') && fr.tutor === 'Tuteur', 'home tiles and top bar in French: ' + fr.tiles.join(' · '));
  ok(/Apprendre/.test(fr.ch) && /S’entraîner/.test(fr.ch) && fr.back === '← Tous les chapitres' && fr.cards === '← Accueil 🃏 Cartes mémoire', 'chapter tabs, back buttons and view titles in French');
  ok(fr.tabs.startsWith('👤 Profil|⚙️ Réglages|📚 Matières'), 'account menu tabs in French: ' + fr.tabs);
  await setUiLang('');
  await page.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  ok(await page.evaluate(() => { location.hash = '#/'; route(); return !S.settings.lang && $$('.modes .mode b')[0].textContent === 'Lightning round'; }), 'back to automatic: the browser’s language (English)');
  // switch subject → math subject
  await page.evaluate(() => Noema.switchTo('anr', 'demo-physics')); await wait(1800);
  ok(await page.evaluate(() => SUBJ.id === 'demo-physics' && S.xp === 0), 'switched to Demo Physics with separate progress');
  ok(await page.$$eval('.katex', k => k.length) > 0, 'math rendered with KaTeX on home');
  await page.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(700);
  ok(await page.$$eval('.katex-display', k => k.length) > 0, 'display math rendered in a section');
  ok(await page.evaluate(() => TN === 'Ada' && MODES.socratic.sys.includes('physics')), 'tutor persona comes from subject.json');
  await page.screenshot({ path: SHOTS + '/a4_physics_section.png', fullPage: true });
  const xpOk = await page.evaluate(() => { const a = Noema.stats.get(); addXP(10); flushSave(); const b = Noema.stats.get(); return b.xp - a.xp === 10 && b.bySubject['demo-physics'] - (a.bySubject['demo-physics'] || 0) === 10 && (b.bySubject['databricks'] || 0) === (a.bySubject['databricks'] || 0); });
  ok(xpOk, 'XP counted per subject and in the account total');
  // new profile: full isolation
  await page.evaluate(() => { Noema.saveLocalAccount({ id: 'maria', name: 'Maria', emoji: '🦊' }); Noema.switchTo('maria', 'databricks'); }); await wait(1800);
  ok(await page.evaluate(() => ACCOUNT.id === 'maria' && S.xp === 0 && Object.keys(S.res).length === 0 && CV.list.length === 0 && S.settings.apiKey !== 'LEGACYKEY'), 'profile Maria is isolated (progress, conversations, API key)');
  ok(await page.evaluate(async () => !(await Noema.subjectsFor('maria')).some(s => s.id === 'secret-notes')), 'private subject of ANR is not visible to Maria');
  ok(await page.evaluate(async () => (await Noema.convos.list('maria')).length === 0 && CV.list.length === 0), 'Maria sees none of ANR’s conversations');
  await page.evaluate(() => { location.hash = '#/'; route(); }); await wait(500);
  ok(!!(await page.$('.setupbar')) && (await page.$$eval('.setuprow', r => r.length)) === 2, 'first-sessions setup banner (no key, no backups) on the home page');
  await page.screenshot({ path: SHOTS + '/a6_banner.png' });
  await page.click('.setuprow .iconbtn'); await wait(400);
  ok((await page.$$eval('.setuprow', r => r.length)) === 1, 'a banner item can be dismissed');
  // backup → restore
  const backupOk = await page.evaluate(async () => {
    const b = await Noema.backup.collect('anr'); if (!b.data['s:databricks:state'] || b.data['a:settings'].includes('LEGACYKEY')) return 'bad backup ' + Object.keys(b.data).join(',');
    await Noema.backup.apply(b, 'maria', 'replace');
    const st = JSON.parse(localStorage.getItem('noema1:maria:s:databricks:state')); const pts = await Noema.backup.listRestorePoints('maria');
    const src = JSON.parse(localStorage.getItem('noema1:anr:s:databricks:state'));
    const nc = (await Noema.convos.list('maria')).length, na = (await Noema.convos.list('anr', { includeDeleted: true })).length;
    if (nc !== na || b.conversations.length !== na) return 'conversations ' + nc + '/' + na;
    return st.xp === src.xp && JSON.stringify(st.res) === JSON.stringify(src.res) && pts.length >= 1 ? 'ok' : 'bad restore ' + JSON.stringify({ xp: st.xp, pts: pts.length });
  });
  ok(backupOk === 'ok', backupOk + ' — backup of ANR restored into Maria (+ restore point created, API key excluded)');
  ok(await page.evaluate(async () => { const b = await Noema.backup.collect('anr', { includeSecrets: true }); const k = JSON.parse(b.data['a:settings']).apiKey; const prev = localStorage.getItem('noema-device:geminiKey:maria'); await Noema.backup.apply(b, 'maria', 'merge'); const got = localStorage.getItem('noema-device:geminiKey:maria'), kept = localStorage.getItem('noema1:maria:a:settings'); prev ? localStorage.setItem('noema-device:geminiKey:maria', prev) : localStorage.removeItem('noema-device:geminiKey:maria'); return !!k && k === localStorage.getItem('noema-device:geminiKey:anr') && got === k && !kept.includes(k); }), 'a backup with secrets carries this device’s Gemini key, and restoring it puts the key on the device');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(async () => Noema.backup.download(await Noema.backup.collect('anr')))]);
  ok(/^noema-lite-backup_anr_\d{4}-\d\d-\d\d_\d{4}\.json$/.test(dl.suggestedFilename()), 'backup download: ' + dl.suggestedFilename());
  const legacyOk = await page.evaluate(() => { try { const b = Noema.backup.validate({ xp: 5, res: { a: { ok: 1 } }, settings: { theme: 'dark' } }); return !!b.data['s:databricks:state']; } catch (e) { return false; } });
  ok(legacyOk, 'old single-file “Export progress” files are accepted for restore');
  // import a pack file
  const packJSON = fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8').replace('"id":"demo-physics"', '"id":"demo-imported"').replace('"title":"Demo Physics"', '"title":"Imported Demo"');
  const imp = await page.evaluate(async txt => { const f = new File([txt], 'x.noema-pack.json', { type: 'application/json' }); const s = await Noema.importPackFile('maria', f); return (await Noema.subjectsFor('maria')).some(x => x.id === 'demo-imported') && s.title; }, packJSON);
  ok(imp === 'Imported Demo', 'subject pack import (per profile)');
  await page.evaluate(() => Noema.switchTo('maria', 'demo-imported')); await wait(1600);
  ok(await page.evaluate(() => SUBJ.id === 'demo-imported' && COURSE.length === 1), 'imported pack opens from IndexedDB');
  // account picker overlay renders
  await page.evaluate(() => { Noema.openAccountPicker(); }); await wait(400);
  ok(await page.$$eval('.noema-acc', a => a.length) >= 3, 'profile picker shows profiles + “New profile”');
  await page.screenshot({ path: SHOTS + '/a5_profiles.png' });
  ok(!E.length, 'no console errors in local mode ' + (E.length ? JSON.stringify(E.slice(0, 5)) : ''));
  await ctx.close();

  /* ======================= B. CLOUD (http + mocked Supabase) ======================= */
  console.log('B. cloud mode (mock Supabase)');
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', supabaseUrl: 'http://localhost:54329', supabaseKey: 'sb_publishable_test', autoBackupMinutes: 5, askSubjectOnStart: true };`;
  const srv = await start({ port: 54329, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const devA = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await mockGemini(devA); const pA = await devA.newPage(); const EA = []; errs(pA, EA);
  await pA.goto('http://localhost:54329/'); await wait(900);
  ok(!(await pA.evaluate(() => /(^|\n)null(\n|$)/.test(document.body.innerText))), 'no stray "null" text in the profile picker');
  ok(!(await pA.content()).includes('config.local.js'), 'website index.html does not reference config.local.js');
  ok(await pA.$$eval('.noema-acc', a => a.length) === 1 && !!(await pA.$('text=Sign in / create a cloud account')), 'hosted site: no local seeds exposed, cloud sign-in offered');
  await pA.click('text=Sign in / create a cloud account'); await wait(300);
  await pA.click('text=No account yet? Create one'); await wait(200);
  await pA.fill('input[placeholder="Display name"]', 'ANR Cloud'); await pA.fill('input[type=email]', 'anr@example.com'); await pA.fill('input[type=password]', 'secret123');
  await pA.screenshot({ path: SHOTS + '/b1_signup.png' });
  await pA.click('button:has-text("Create account")'); await wait(900);
  ok(await pA.$$eval('.noema-chip', c => c.length) === 2, 'cloud account sees shared subjects only (no private ones)');
  await pA.click('.noema-chip:has-text("Databricks")'); await wait(1600);
  await pA.evaluate(() => { location.hash = '#/s/ch01-s01'; }); await wait(500);
  { const sa = await pA.$('button:has-text("show all")'); if (sa) { await sa.click(); await wait(400); } }
  const tipW = await pA.$$eval('main .callout.tip', els => els.map(e => ({ w: e.getBoundingClientRect().width, cur: getComputedStyle(e).cursor })));
  ok(tipW.length > 0 && tipW.every(t => t.w > 300 && t.cur !== 'help'), 'tip callouts render full width (no clash with the ⓘ tooltip style)');
  await pA.evaluate(() => { record(EX['ch01-e001'], true); addXP(12); flushSave(); S.settings.apiKey = 'CLOUDKEY'; S.settings.goal = 150; flushSave(); });
  await pA.evaluate(() => { openTutor({ kind: 'chapter', id: 'ch05' }, 'quiz'); }); await pA.evaluate(() => sendTutor('quiz me')); await pA.evaluate(() => closeTutor());
  await wait(4200);
  const uidA = Object.keys(srv.state.users)[0];
  ok(Object.values(srv.state.convs[uidA] || {}).some(r => r.kind === 'tutor' && r.mode === 'quiz' && r.record.schema === 'noema.conversation/v1'), 'conversation pushed to the cloud (noema_conversations)');
  // folder auto-backup layout (OPFS stands in for a user-chosen folder)
  const fsLayout = await pA.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); const d = await root.getDirectoryHandle('chosen', { create: true });
    await Noema.idb.put('handles', 'dir|' + ACCOUNT.id, d); await Noema.autoBackup.run(ACCOUNT.id, true);
    const names = async (dir) => { const out = []; for await (const [n, hnd] of dir.entries()) out.push(hnd.kind === 'directory' ? { [n]: await names(hnd) } : n); return out; };
    return JSON.stringify(await names(d));
  });
  ok(/backups/.test(fsLayout) && /noema-lite-backup_u_.*_latest\.json/.test(fsLayout) && /conversations/.test(fsLayout) && /cv_[0-9a-z]+\.json/.test(fsLayout) && /cv_[0-9a-z]+\.md/.test(fsLayout) && /index\.json/.test(fsLayout), 'folder backup: backups/ + conversations/<subject>/<YYYY-MM>/<id>.json|.md + index.json');
  console.log('     ' + fsLayout.slice(0, 220));
  const kvA = srv.state.kv[Object.keys(srv.state.users)[0]] || {};
  ok(!!kvA['s:databricks:state'] && JSON.parse(kvA['s:databricks:state'].value).res['ch01-e001'], 'progress pushed to the cloud (noema_kv)');
  ok(!!kvA['a:settings'] && JSON.parse(kvA['a:settings'].value).goal === 150 && !JSON.stringify(kvA).includes('CLOUDKEY') && await pA.evaluate(() => localStorage.getItem('noema-device:geminiKey:' + ACCOUNT.id) === 'CLOUDKEY'), 'settings pushed to the cloud, the Gemini key stays on this device');
  ok(srv.state.snaps.length >= 1, 'daily auto-snapshot created');
  ok(await pA.$eval('#syncdot', d => d.className.includes('ok')), 'sync indicator shows synced');
  // results inbox: other apps (Meletee) append a:inbox:<app>:<id> rows; the open subject applies its own once, then deletes them
  { const inbox = srv.state.kv[uidA]; const at = new Date().toISOString();
    const put = (key, value) => { inbox[key] = { value: typeof value === 'string' ? value : JSON.stringify(value), updated_at: at }; };
    const before = await pA.evaluate(() => ({ n: S.res['ch01-e004']?.n || 0, card: CH.ch02.flashcards[0]._key, box: S.fc[CH.ch02.flashcards[0]._key]?.box || 0, read: !!S.read['ch01-s02'] }));
    const row = { schema: 'noema.results/v1', app: 'meletee', subject: 'databricks', at, items: [
      { kind: 'section', id: 'ch01-s02', event: 'studied', at }, { kind: 'chapter', id: 'ch01', event: 'review', rating: 'hard', date: at.slice(0, 10), at },
      { kind: 'exercise', id: 'ch01-e004', ok: true, at }, { kind: 'card', id: before.card, grade: 2, at },
      { kind: 'exercise', id: 'ch01-e005', ok: 'yes' }, { kind: 'card', id: 'nope#9', grade: 1 }, { kind: 'exercise', id: 'ch99-e001', ok: true }, null, 'junk'] };
    put('a:inbox:meletee:001', row); put('a:inbox:meletee:002', '{not json'); put('a:inbox:meletee:003', { ...row, subject: 'demo-physics' }); put('a:inbox:other:004', { schema: 'noema.results/v9', subject: 'databricks', items: [] });
    put('a:inbox:meletee:005', { schema: 'noema.results/v1', app: 'meletee', subject: 'databricks', items: 'not a list' });
    const n1 = await pA.evaluate(() => checkInbox());
    const after = await pA.evaluate(k => ({ n: S.res['ch01-e004']?.n || 0, ok: S.res['ch01-e005'], box: S.fc[k]?.box, read: !!S.read['ch01-s02'], ext: S.ext?.meletee }), before.card);
    ok(n1 === 4 && after.read && after.n === before.n + 1 && after.box === Math.min(5, before.box + 2) && after.ext?.length === 1 && after.ext[0].rating === 'hard', 'inbox row applied: section read, exercise recorded, card rated, review kept in S.ext.meletee (' + n1 + ' items)');
    ok(!after.ok, 'malformed items in a row are skipped');
    ok(!inbox['a:inbox:meletee:001'] && !inbox['a:inbox:meletee:002'] && !inbox['a:inbox:meletee:005'], 'applied, unreadable and empty rows are deleted from the inbox');
    ok(!!inbox['a:inbox:meletee:003'] && !!inbox['a:inbox:other:004'], 'rows of another subject or an unknown format stay in the inbox');
    ok(JSON.parse(inbox['s:databricks:state'].value).inboxDone?.['a:inbox:meletee:001'] && JSON.parse(inbox['s:databricks:state'].value).read['ch01-s02'], 'the changed state reached the cloud before the row was deleted');
    put('a:inbox:meletee:001', row);   // the same row again (a delete that failed, another tab): counted once
    const n2 = await pA.evaluate(() => checkInbox());
    ok(n2 === 0 && await pA.evaluate(n => S.res['ch01-e004'].n === n, after.n) && !inbox['a:inbox:meletee:001'], 'a row applied twice does not count twice (and is deleted)');
    put('a:inbox:meletee:006', { schema: 'noema.results/v1', app: 'meletee', subject: 'databricks', at, items: [{ kind: 'exercise', id: 'ch01-e004', ok: false, at }] });
    await pA.evaluate(() => NoemaCloud.pull(ACCOUNT.id)); await wait(800);
    ok(await pA.evaluate(n => S.res['ch01-e004'].n === n + 1, after.n) && !inbox['a:inbox:meletee:006'], 'rows arriving later are applied after a pull');
    ok(await pA.evaluate(() => !Object.keys(localStorage).some(k => k.includes(':a:inbox:'))), 'inbox rows are never mirrored into localStorage');
    ok(JSON.parse(inbox['a:caps']?.value || '{}').resultsInbox === 1, 'a:caps announces resultsInbox to other apps');
  }
  await pA.evaluate(() => openAccountMenu('cloud')); await wait(600); await pA.screenshot({ path: SHOTS + '/b2_cloud_menu.png' });
  // pack upload to private storage
  await pA.evaluate(async txt => { const f = new File([txt], 'p.json', { type: 'application/json' }); await Noema.importPackFile(ACCOUNT.id, f); }, packJSON); await wait(4000);
  ok(Object.keys(srv.state.files).some(k => k.endsWith('packs/demo-imported.json')), 'imported pack stored in private cloud storage');
  // an older version had synced the key in a:settings: the next device keeps it locally and clears it from the cloud
  kvA['a:settings'] = { value: JSON.stringify({ ...JSON.parse(kvA['a:settings'].value), apiKey: 'OLDKEY' }), updated_at: new Date().toISOString() };
  // device B
  const devB = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pB = await devB.newPage(); const EB = []; errs(pB, EB);
  await pB.goto('http://localhost:54329/'); await wait(800);
  await pB.click('text=Sign in / create a cloud account'); await wait(300);
  await pB.fill('input[type=email]', 'anr@example.com'); await pB.fill('input[type=password]', 'secret123'); await pB.click('button:has-text("Sign in")'); await wait(1200);
  const chipsB = await pB.$$eval('.noema-chip', c => c.map(x => x.textContent));
  ok(chipsB.some(c => c.includes('Imported Demo')), 'device B sees the pack imported on device A');
  await pB.click('.noema-chip:has-text("Databricks")'); await wait(1600);
  ok(await pB.evaluate(() => !!S.res['ch01-e001'] && S.settings.goal === 150 && Noema.stats.get().xp >= 12), 'device B pulled progress, settings and stats');
  ok(await pB.evaluate(() => S.settings.apiKey === 'OLDKEY' && localStorage.getItem('noema-device:geminiKey:' + ACCOUNT.id) === 'OLDKEY' && !localStorage.getItem(Noema.kv.accountKey('settings')).includes('OLDKEY')), 'a key synced by an older version is moved to this device');
  ok(await pB.evaluate(() => CV.list.some(c => c.mode === 'quiz' && c.msgs.length >= 2)), 'device B has the conversation from device A');
  await pB.screenshot({ path: SHOTS + '/b3_deviceB_mobile.png' });
  await wait(3500); ok(!srv.state.kv[uidA]['a:settings'].value.includes('OLDKEY') && JSON.parse(srv.state.kv[uidA]['a:settings'].value).goal === 150, '… and removed from the cloud row');
  await pB.evaluate(() => Noema.switchTo(ACCOUNT.id, 'demo-imported')); await wait(1800);
  ok(await pB.evaluate(() => SUBJ.id === 'demo-imported'), 'device B downloads the private pack from cloud storage');
  // isolation: a second user sees nothing of the first
  const devC = await browser.newContext(); const pC = await devC.newPage();
  await pC.goto('http://localhost:54329/'); await wait(700); await pC.click('text=Sign in / create a cloud account'); await pC.click('text=No account yet? Create one');
  await pC.fill('input[placeholder="Display name"]', 'Eve'); await pC.fill('input[type=email]', 'eve@example.com'); await pC.fill('input[type=password]', 'secret123'); await pC.click('button:has-text("Create account")'); await wait(900);
  ok(!(await pC.$$eval('.noema-chip', c => c.map(x => x.textContent))).some(c => c.includes('Imported')), 'another user cannot see ANR’s private pack');
  await pC.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  ok(await pC.evaluate(() => !S.res['ch01-e001'] && S.settings.apiKey !== 'CLOUDKEY'), 'another user gets none of ANR’s progress or key');
  ok(!EA.length && !EB.length, 'no console errors in cloud mode ' + JSON.stringify([...EA, ...EB].slice(0, 5)));
  await devA.close(); await devB.close(); await devC.close(); srv.close();

  /* ======================= C. single-file bundle ======================= */
  console.log('C. single-file bundle');
  const pD = await browser.newPage(); const ED = []; errs(pD, ED);
  await pD.goto('file://' + ROOT + '/dist/noema-lite.html'); await wait(900);
  await pD.click('.noema-chip:has-text("Databricks")'); await wait(1600);
  ok(await pD.evaluate(() => Object.keys(SEC).length === 184), 'bundle loads the Databricks pack inline');
  ok(!ED.length, 'no console errors in bundle ' + JSON.stringify(ED.slice(0, 3)));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
