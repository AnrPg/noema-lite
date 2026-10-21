/* 👥 People, study buddies, conversations and study groups (engine/social.js, docs/SOCIAL.md) against the Supabase
   emulator (tests/mock_social.js: the rules of cloud/supabase.sql §12).
   Without a browser: the name as searched (Greek in plain and scholarly Latin letters), the server's refusals in words.
   In the browser, three people: Iro finds Νίκος by typing “nikos”, cannot message him before they are buddies (his
   setting), asks; he sees the badge and accepts; they talk (text, a PDF shown and downloaded, a subject added to his
   subjects, an edit, a deletion); Iro makes a study group, invites Nikos (he joins from his chats) and makes an invitation
   link that Eleni opens and joins with; a file of the vault only the group sees, sent into the group with “Send to…”;
   a report; blocking (she can no longer find or message him); privacy (not findable); the phone width; Greek menus.
   Usage: node tests/social.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54391, BASE = `http://localhost:${PORT}`;

/* ---------- 1. without a browser ---------- */
function unit() {
  console.log('— the name as searched, and the refusals, without a browser');
  const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/social/en.arb'), 'utf8'));
  const NoemaI18n = { t: (k, p = {}) => String(EN[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => p[x] != null ? String(p[x]) : m), err: e => String(e?.message || e), fmt: { number: n => String(n) } };
  const ctx = { window: {}, crypto: require('crypto').webcrypto, console, URLSearchParams, NoemaI18n, document: { addEventListener() { } } }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['engine/catalog.js', 'engine/vault.js', 'engine/social.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const s = ctx.NoemaSocial.searchOf('Νίκος Παπαδάκης');
  ok(/νικο[σς]/.test(s) && /nikos/.test(s) && /papadakis/.test(s), 'Νίκος Παπαδάκης is searched as written (no accents) and in Latin letters: ' + s);
  ok(/only from their study buddies/.test(ctx.NoemaSocial.why(new Error('they do not take messages from you'))) && /50 MB are full/.test(ctx.NoemaSocial.why(new Error('storage quota: 1 of 52428800 bytes used'))), 'the server’s refusals are said in the learner’s words');
}

(async () => {
  unit();
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: false, onboarding: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const S = srv.state.social, uidOf = em => Object.values(srv.state.users).find(u => u.email === em).id;
  const TF = path.join(require('os').tmpdir(), 'noema-social-files-' + process.pid); fs.mkdirSync(TF, { recursive: true });
  const PDF = path.join(TF, 'Genetics summary.pdf'); execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1]); c.drawString(72, 720, 'Genetics summary'); c.showPage(); c.save()`, PDF]);
  const browser = await chromium.launch();
  const E = [];
  const person = async (name, email, vw = { width: 1280, height: 900 }) => {
    const c = await browser.newContext({ viewport: vw, acceptDownloads: true }); const p = await c.newPage(); p.setDefaultTimeout(15000);
    p.on('pageerror', e => E.push(name + ': ' + e.message)); p.on('dialog', d => d.accept());
    await p.addInitScript(() => { new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList?.contains('toast')) (window.__toasts = window.__toasts || []).push(n.textContent); }))).observe(document, { childList: true, subtree: true }); });
    await p.goto(BASE + '/'); await wait(800);
    await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
    await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
    await p.click('button:has-text("Create account")'); await wait(1300);
    await p.evaluate(() => { localStorage.setItem('noema-test:newUI', '1'); NoemaThemes?.putSettings?.({ onboarded: Date.now(), world: 'know' }); });
    await p.reload(); await wait(900);
    if (await p.$('.ns-onb')) { await p.click('[data-pick="know"]').catch(() => { }); await wait(200); await p.click('[data-onbdone]').catch(() => { }); await wait(400); }
    return p;
  };
  const toast = p => p.locator('.toasts').innerText().catch(() => '');
  const goto = async (p, hash) => { await p.evaluate(h => { location.hash = h; }, hash); await wait(700); };
  const token = async email => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })).json()).access_token;
  const rest = (t, pth, o = {}) => fetch(BASE + pth, { ...o, headers: { apikey: 'k', authorization: 'Bearer ' + t, 'content-type': 'application/json', ...(o.headers || {}) } });
  let iro, nikos, eleni;
  try {
    console.log('— finding someone, and the buddies rule');
    nikos = await person('Νίκος Παπαδάκης', 'nikos@example.com');
    ok(await nikos.locator('#ns-people').isVisible(), 'a cloud account has the People button in the top bar');
    await nikos.click('#ns-people'); await wait(800);
    ok(/#\/people/.test(nikos.url()) && await until(() => nikos.locator('.so-first').count()), 'People opens; the first time it says others can now find you, and how to change it');
    ok(S.people[uidOf('nikos@example.com')]?.display_name === 'Νίκος Παπαδάκης' && S.people[uidOf('nikos@example.com')].dm_from === 'buddies', 'his row: his name, findable, messages from buddies only (the default)');
    iro = await person('Iro', 'iro@example.com');
    await iro.click('#ns-people'); await wait(600);
    await iro.fill('.so-find', 'nikos');
    ok(await until(() => iro.locator('.so-found .so-person').count().then(n => n === 1)) && /Νίκος Παπαδάκης/.test(await iro.locator('.so-found').innerText()), 'typing “nikos” in Latin letters finds “Νίκος Παπαδάκης”');
    await iro.fill('.so-find', 'papadakis'); await wait(600);
    ok(await iro.locator('.so-found .so-person').count() === 1, '… and “papadakis” too');
    await iro.click('.so-found .so-who'); await wait(300);
    await iro.click('.so-sheet .so-msgbtn');
    ok(await until(async () => /only from their study buddies/.test(await toast(iro))) && !Object.values(S.rooms).length, 'before they are buddies she cannot start a conversation (his setting): ' + (await toast(iro)).trim());
    await iro.click('.so-sheet .so-askbtn'); await wait(600);
    ok(S.buddies.length === 1 && S.buddies[0].status === 'pending' && S.buddies[0].asked_by === uidOf('iro@example.com'), 'she asks to be study buddies');
    await iro.screenshot({ path: SHOTS + '/so1_find.png', fullPage: true });

    await nikos.evaluate(() => NoemaSocial.refresh()); await wait(300);
    ok(await nikos.locator('#ns-people .bellbadge').innerText() === '1', 'Nikos sees 1 on the People button');
    await nikos.click('.so-tabs [data-tab="buddies"]'); await wait(300);
    ok(/Asked to be your study buddy/i.test(await nikos.locator('.so-buddies').innerText()), 'Buddies tab: Iro asked');
    await nikos.click('.so-buddies .so-act'); await wait(800);
    ok(S.buddies[0].status === 'buddies' && /Study buddy/.test(await nikos.locator('.so-buddies').innerText()), 'he accepts: they are study buddies');

    console.log('— a conversation: text, a file, a subject, edit, delete');
    await iro.evaluate(() => NoemaSocial.refresh()); await iro.click('.so-tabs [data-tab="buddies"]'); await wait(300);
    await iro.click('.so-buddies .so-act'); await wait(1000);
    ok(/#\/chat\//.test(iro.url()) && await iro.locator('.so-box').count() === 1, 'Message opens their conversation');
    await iro.fill('.so-box', 'Hi Nikos! Shall we study genetics together?'); await iro.keyboard.press('Enter');
    ok(await until(() => iro.locator('.so-msg.mine').count().then(n => n === 1)), 'Enter sends');
    const [fc] = await Promise.all([iro.waitForEvent('filechooser'), (async () => { await iro.click('.so-composer .ns-menubtn'); await iro.click('.ns-pop button:has-text("File")'); })()]);
    await fc.setFiles(PDF);
    ok(await until(() => iro.locator('.so-att-file').count().then(n => n === 1), 15000) && S.chatFiles.length === 1 && S.chatFiles[0].status === 'ok' && S.chatObj[S.chatFiles[0].path]?.data.length === S.chatFiles[0].size, 'a PDF is sent: its row, the file whole, checked by the server');
    const [fc2] = await Promise.all([iro.waitForEvent('filechooser'), (async () => { await iro.click('.so-composer .ns-menubtn'); await iro.click('.ns-pop button:has-text("File")'); })()]);
    const EXE = path.join(TF, 'notes.pdf'); fs.writeFileSync(EXE, 'MZ a program pretending'); await fc2.setFiles(EXE);
    ok(await until(async () => /not what its name says/.test(await toast(iro))) && S.chatFiles.length === 1, 'a program renamed .pdf is refused before it leaves the device');
    await iro.click('.so-composer .ns-menubtn'); await iro.click('.ns-pop button:has-text("Subject")'); await wait(400);
    const subj = await until(() => iro.locator('.ns-sheet .so-pick').count());
    if (subj) { await iro.click('.ns-sheet .so-pick >> nth=1'); ok(await until(() => iro.locator('.so-att-subject').count().then(n => n === 1), 15000) && S.chatFiles.some(f => f.mime === 'application/json'), 'one of her subjects is sent (its pack, as a file of the room)'); }
    else ok(false, 'Iro has a subject to send');
    await iro.screenshot({ path: SHOTS + '/so2_chat.png', fullPage: true });
    const rid = Object.values(S.rooms).find(r => r.kind === 'dm').id;
    await nikos.evaluate(() => NoemaSocial.refresh()); await wait(300);
    ok(await nikos.locator('#ns-people .bellbadge').innerText() === '3', 'Nikos: 3 new messages on the People button');
    await nikos.click('.so-tabs [data-tab="chats"]'); await wait(200);
    await nikos.click(`.so-room[data-room="${rid}"]`); await wait(1200);
    ok(/study genetics together/.test(await nikos.locator('.so-msgs').innerText()) && await nikos.locator('.so-att-file').count() === 1, 'he reads her message and sees the file');
    await nikos.click('.so-att-file .so-show');
    ok(await until(() => nikos.locator('.so-att-file iframe').count()), 'Show opens the PDF in place');
    const [dl] = await Promise.all([nikos.waitForEvent('download'), nikos.click('.so-att-file .so-download')]);
    ok(dl.suggestedFilename() === 'Genetics summary.pdf' && (await fs.promises.readFile(await dl.path())).subarray(0, 4).toString() === '%PDF', 'Download gives the PDF with its name');
    if (subj) { await nikos.click('.so-att-subject .so-addsubj');
      ok(await until(() => nikos.evaluate(async () => (await Noema.subjectsFor(Noema.account.id)).filter(s => /^demo-physics-/.test(s.id) && s.title === 'Demo Physics').length === 1)) && await until(() => nikos.evaluate(() => /#\/subject/.test(location.hash))),
        'he adds her subject to his subjects (a copy beside his own Demo Physics) and opens it'); await goto(nikos, '#/chat/' + rid); await wait(600); }
    ok(await until(() => nikos.evaluate(() => NoemaSocial.waiting()).then(n => n === 0)), 'read: nothing waits for him any more');
    await nikos.fill('.so-box', 'Yes! Tuesday at the library?'); await nikos.click('.so-send');
    ok(await until(() => iro.locator('.so-msg:not(.mine)').count().then(n => n === 1), 8000), 'his reply reaches her open conversation by itself');
    await iro.click('.so-msg.mine >> nth=0 >> .so-msgmenu'); await iro.click('.ns-pop button:has-text("Edit")'); await wait(200);
    await iro.fill('.ns-modal textarea', 'Hi Nikos! Shall we study genetics together this week?'); await iro.click('.so-saveedit');
    ok(await until(() => iro.locator('.so-msg.mine >> nth=0').innerText().then(t => /this week/.test(t) && /edited/.test(t))), 'she edits her message (marked “edited”)');
    const nMsgs = S.messages.length; await iro.click('.so-msg.mine.head >> nth=-1 >> .so-msgmenu').catch(() => { });
    await iro.click('.ns-pop button:has-text("Delete")').catch(() => { });
    ok(await until(() => S.messages.some(m => m.deleted && !m.att && m.body === '')) && S.messages.length === nMsgs, 'she deletes one: its text and attachment are gone for everyone, “Message deleted” stays');

    console.log('— a study group: invite a buddy, an invitation link, its own vault folder');
    await goto(iro, '#/people'); await iro.click('.so-tabs [data-tab="groups"]'); await iro.click('.so-newgroup'); await wait(200);
    await iro.click('.so-create'); ok(/Give the group a name/.test(await iro.locator('.ns-modal').innerText()), 'a group needs a name');
    await iro.fill('.ns-modal [data-k="name"]', 'Genetics  2025'); await iro.fill('.ns-modal [data-k="course"]', 'Genetics'); await iro.fill('.ns-modal [data-k="university"]', 'University of Crete'); await iro.fill('.ns-modal [data-k="emoji"]', '🧬');
    await iro.click('.so-create'); await wait(1000);
    const g = Object.values(S.rooms).find(r => r.kind === 'group');
    ok(g && g.name === 'Genetics 2025' && /#\/group\//.test(iro.url()) && /Genetics 2025/.test(await iro.locator('.so-grouptop').innerText()), 'the group is made (its name tidied), Iro is its owner: its page');
    await iro.click('.so-invite'); await wait(300);
    await iro.click(`.so-sheet .so-person[data-person="${uidOf('nikos@example.com')}"] .so-inviteone`); await wait(400);
    ok(S.members.some(m => m.room === g.id && m.user_id === uidOf('nikos@example.com') && m.status === 'invited'), 'she invites her buddy Nikos');
    await iro.click('.so-sheet button:has-text("Done")'); await wait(500);
    await iro.click('.so-linkon'); await wait(500);
    ok(/^[A-Za-z0-9]{18}$/.test(g.join_code || '') && await iro.locator('.so-copylink').count() === 1, 'she makes an invitation link');
    await iro.screenshot({ path: SHOTS + '/so3_group.png', fullPage: true });
    await nikos.evaluate(() => NoemaSocial.refresh()); await goto(nikos, '#/people'); await nikos.click('.so-tabs [data-tab="chats"]'); await wait(300);
    ok(await nikos.locator(`.so-invite[data-room="${g.id}"]`).count() === 1, 'Nikos sees the invitation in his chats');
    await nikos.click(`.so-invite[data-room="${g.id}"] .so-joinbtn`); await wait(1000);
    ok(S.members.find(m => m.room === g.id && m.user_id === uidOf('nikos@example.com')).status === 'joined' && new RegExp(g.id).test(nikos.url()), 'he joins: the group chat opens');
    eleni = await person('Ελένη', 'eleni@example.com');
    const T3 = await token('eleni@example.com');
    ok((await (await rest(T3, `/rest/v1/noema_messages?select=*&room=eq.${g.id}`)).json()).length === 0 && (await rest(T3, '/rest/v1/noema_messages', { method: 'POST', body: JSON.stringify([{ room: g.id, author: uidOf('eleni@example.com'), body: 'x' }]) })).status === 403, 'before joining, Eleni can neither read nor write in the group');
    await goto(eleni, '#/join/' + g.join_code); await wait(600);
    ok(/Genetics 2025/.test(await eleni.locator('.so-joincard').innerText()) && /2 members/.test(await eleni.locator('.so-joincard').innerText()), 'the link shows the group before joining: ' + (await eleni.locator('.so-joincard h1').innerText()));
    await eleni.click('.so-joinnow'); await wait(1000);
    ok(new RegExp('#/chat/' + g.id).test(eleni.url()), 'Eleni joins with the link');
    await eleni.fill('.so-box', 'Hello everyone, I have last year’s exam'); await eleni.click('.so-send'); await wait(500);

    // a Roadmap shared in the group: private, yet its members may join it, each with their own progress
    const cid = await iro.evaluate(() => {
      const C = NoemaCurriculum, acc = Noema.account.id, c = C.blank({ goal: 'Genetics', language: 'en', depth: 'standard' });
      const mk = (id, title, role) => ({ id, title, role, part: C.PART[role], summary: title, learningGoals: ['explain ' + title], chapters: [{ title: title + ' I', goals: ['a'], coverage: ['x'] }] });
      c.nodes = { dna: mk('dna', 'DNA', 'foundation'), genes: mk('genes', 'Genes', 'intro') }; c.edges = [{ from: 'dna', to: 'genes' }];
      c.goalId = 'genes'; c.status = 'ready'; c.stage = 'done'; c.title = 'Genetics'; c.prefetch = 0; C.save(acc, c); return c.id; });
    await goto(iro, '#/group/' + g.id); await wait(800);
    await iro.click('.so-sharerm'); await wait(300); await iro.click(`.ns-sheet .so-pick[data-id="${cid}"]`);
    ok(await until(() => srv.state.curs[cid] && !srv.state.curs[cid].public && S.roomRms.some(x => x.room === g.id && x.curriculum === cid) && S.messages.some(m => m.room === g.id && m.att?.kind === 'roadmap')), 'Iro shares her Roadmap with the group: published privately, listed in the group, announced in its chat');
    await goto(eleni, '#/group/' + g.id); await wait(1000);
    await eleni.click(`.so-rms [data-cur="${cid}"] button`);
    ok(await until(() => srv.state.mems.some(m => m.curriculum === cid && m.user_id === uidOf('eleni@example.com') && m.status === 'joined')) && await until(() => eleni.evaluate(id => !!NoemaCurriculum.get(Noema.account.id, id) && /#\/map\//.test(location.hash), cid)), 'Eleni joins it from the group page: her own copy of the map opens');

    await goto(iro, '#/vault?g=' + g.id); await wait(800);
    ok(/only its members see these files/.test(await iro.locator('.vt-view').innerText()), 'the group’s files: its own folder of the vault');
    await iro.click('.vt-upbtn'); await wait(300); await iro.setInputFiles('.vt-upload .vt-pick', [PDF]); await wait(500);
    const fld = k => `.vt-upload [data-k="${k}"]`;
    await iro.fill(fld('university'), 'University of Crete'); await iro.fill(fld('department'), 'Biology'); await iro.fill(fld('course'), 'Genetics');
    await iro.selectOption(fld('year'), '2023'); await iro.selectOption(fld('semester'), '3'); await iro.selectOption(fld('kind'), 'summary'); await iro.selectOption(fld('subject'), 'biology');
    ok(await iro.inputValue('.vt-where') === g.id, 'uploading from the group’s folder: “Who sees it” is the group');
    await iro.check('.vt-rules'); await iro.click('.vt-go');
    ok(await until(() => srv.state.vfiles.some(f => f.room === g.id && f.status === 'ok'), 20000), 'the file is in the group’s folder');
    const vf = srv.state.vfiles.find(f => f.room === g.id);
    await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'kostas@example.com', password: 'secret123', data: { name: 'Kostas' } }) });
    const T4 = await token('kostas@example.com');
    ok(!(await (await rest(T4, '/rest/v1/noema_vault?select=id')).json()).some(f => f.id === vf.id) && (await rest(T4, '/storage/v1/object/authenticated/noema-vault/' + vf.path)).status === 404
      && (await (await rest(T3, '/rest/v1/noema_vault?select=id')).json()).some(f => f.id === vf.id), 'someone outside the group neither sees nor downloads it; Eleni (a member) does');
    await iro.evaluate(() => NoemaVault.reset()); await goto(iro, '#/vault?g=' + g.id + '&id=' + vf.id); await wait(1200);
    ok(await until(() => iro.locator('.vt-sheet .vt-sendto').count()), 'the file’s page has “Send to…”');
    await iro.click('.vt-sheet .vt-sendto'); await wait(500);
    await iro.fill('.so-sendline', 'For Tuesday'); await iro.click(`.so-sheet .so-pick[data-room="${g.id}"]`); await wait(800);
    const sentV = S.messages.find(m => m.room === g.id && m.att?.kind === 'vault');
    ok(sentV && sentV.att.id === vf.id && sentV.body === 'For Tuesday', 'sent into the group with a line');
    await goto(eleni, '#/people'); await goto(eleni, '#/chat/' + g.id); await wait(1000);
    ok(await eleni.locator('.so-att-vault').count() === 1, 'Eleni sees it in the group');
    await eleni.click('.so-att-vault .so-openvault'); await wait(1200);
    ok(await until(() => eleni.locator('.vt-sheet').count()) && /Genetics summary/.test(await eleni.locator('.vt-sheet').innerText()), '… and opens its page in the vault');

    console.log('— roles, reporting, blocking, privacy');
    await goto(iro, '#/group/' + g.id); await wait(800);
    await iro.click(`.so-member[data-person="${uidOf('eleni@example.com')}"] .ns-menubtn`); await iro.click('.ns-pop button:has-text("Make admin")'); await wait(800);
    ok(S.members.find(m => m.room === g.id && m.user_id === uidOf('eleni@example.com')).role === 'admin' && /Admin/.test(await iro.locator('.so-members').innerText()), 'the owner names Eleni admin');
    const T2 = await token('nikos@example.com');
    await rest(T2, `/rest/v1/noema_room_members?room=eq.${g.id}&user_id=eq.${uidOf('eleni@example.com')}`, { method: 'PATCH', body: JSON.stringify({ status: 'left' }) });
    ok(S.members.find(m => m.room === g.id && m.user_id === uidOf('eleni@example.com')).status === 'joined', 'a plain member cannot remove anyone (the row is not his to change)');
    await goto(nikos, '#/chat/' + g.id); await wait(1200);
    const em = S.messages.find(m => m.room === g.id && m.author === uidOf('eleni@example.com'));
    await nikos.click(`.so-msg[data-id="${em.id}"] .so-msgmenu`); await nikos.click('.ns-pop button:has-text("Report")'); await wait(200);
    await nikos.selectOption('.so-reason', 'live_exam'); await nikos.click('.so-sendreport'); await wait(500);
    ok(S.mreports.length === 1 && S.mreports[0].reason === 'live_exam' && !em.hidden, 'Nikos reports a message (answers of an exam not held yet): one report does not hide it');
    await goto(nikos, '#/people'); await nikos.fill('.so-find', 'eleni'); await wait(800);
    await nikos.click('.so-found .so-who'); await nikos.click('.so-sheet .so-blockbtn'); await wait(800);
    ok(S.blocks.length === 1, 'Nikos blocks Eleni');
    ok(!(await (await rest(T3, '/rest/v1/noema_people?select=user_id&or=(search.ilike."*nikos*")')).json()).length
      && (await (await rest(T3, '/rest/v1/rpc/noema_dm_open', { method: 'POST', body: JSON.stringify({ x: uidOf('nikos@example.com') }) })).json()).message === 'they do not take messages from you', 'she no longer finds him or can message him');
    await goto(iro, '#/people'); await iro.click('.so-view .ns-menubtn').catch(() => iro.click('.ns-top .ns-menubtn')); await iro.click('.ns-pop button:has-text("Privacy")'); await wait(400);
    await iro.click('.so-sheet .ns-pfsw'); await iro.click('.so-dmfrom [data-v="nobody"]'); await iro.click('.so-saveprivacy'); await wait(500);
    ok(S.people[uidOf('iro@example.com')].findable === false && S.people[uidOf('iro@example.com')].dm_from === 'nobody', 'privacy: Iro is no longer findable and takes no new conversations');
    ok(!(await (await rest(T4, '/rest/v1/noema_people?select=user_id&or=(search.ilike."*iro*")')).json()).length && (await (await rest(T2, '/rest/v1/noema_people?select=user_id&or=(search.ilike."*iro*")')).json()).length === 1, 'a stranger no longer finds her; her buddy still sees her');

    console.log('— the phone width, Greek menus');
    await iro.setViewportSize({ width: 390, height: 844 }); await goto(iro, '#/chat/' + rid); await wait(800);
    ok(await iro.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await iro.locator('.so-composer').isVisible(), 'no sideways scrolling at 390 px; the box to write in is there');
    await iro.screenshot({ path: SHOTS + '/so4_phone.png', fullPage: false });
    await iro.evaluate(async () => { await NoemaI18n.use('el'); location.hash = '#/people'; NoemaShell.route(); }); await wait(900);
    const el = await iro.locator('.so-view').innerText();
    ok(/Επαφές/.test(el) && /Συνομιλίες/.test(el) && /Ομάδες/.test(el), 'Greek menus: ' + el.split('\n').slice(0, 2).join(' · '));
    await iro.screenshot({ path: SHOTS + '/so5_greek.png', fullPage: true });
    const odd = []; for (const p of [iro, nikos, eleni]) odd.push(...(await p.evaluate(() => window.__toasts || [])).filter(t => /Cannot read|undefined|null|TypeError/.test(t)));
    ok(!odd.length, 'no broken messages shown to anyone ' + odd.join(' | '));
    ok(!E.length, 'no page errors ' + E.join(' | '));
  } catch (e) { ok(false, 'crashed: ' + e.stack); for (const [n, p] of [['iro', iro], ['nikos', nikos], ['eleni', eleni]]) if (p) await p.screenshot({ path: SHOTS + `/so_fail_${n}.png`, fullPage: true }).catch(() => { }); }
  await browser.close(); srv.close?.();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ all passed'); process.exit(fails ? 1 : 0);
})();
