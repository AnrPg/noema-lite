/* Sharing (public + with a person), 🌍 Explore, 🔔 notifications and the 🩺 cloud self-test, against the Supabase emulator.
   Usage: node tests/sharing.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const PORT = 54333, BASE = `http://localhost:${PORT}`;

async function signUp(browser, email, name) {
  const ctx = await browser.newContext({ viewport: { width: 1250, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(10000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1200);
  return { p, E, ctx };
}
(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', autoBackupMinutes: 5, askSubjectOnStart: true, storageChunkBytes: 200000 };`;
  // like Supabase's free plan, the emulator refuses objects over a size (here 300 KB) → big source files travel in parts
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg, maxObject: 300000 });
  const BIG = 700000, bytes = (n, k) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * k + (i >> 8)) % 251; return b; };
  const browser = await chromium.launch();
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  const mk = (id, title, restricted) => { const p = JSON.parse(JSON.stringify(fx)); p.subject = { ...p.subject, id, title, owner: null, description: 'Energy, momentum and a power station.' }; p.version = id + '-v1'; if (restricted) Object.values(p.media)[0].restricted = true; return p; };

  console.log('— Anna shares');
  const A = await signUp(browser, 'anna@example.com', 'Anna');
  await A.p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await A.p.evaluate(async ps => { for (const p of ps) await Noema.importPack(ACCOUNT.id, p); }, [mk('heart-test', 'Heart test', true), mk('lungs-test', 'Lungs test')]);
  // Heart test has two source files: a small PDF and a big one (700 KB > the 300 KB object limit → stored in 4 parts)
  await A.p.evaluate(async BIG => { const mk = (n, k) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * k + (i >> 8)) % 251; return b; };
    await NoemaSrcFiles.put(ACCOUNT.id, 'heart-test', 'notes', new File([mk(5000, 3)], 'Σημειώσεις καρδιάς.pdf', { type: 'application/pdf' }));
    await NoemaSrcFiles.put(ACCOUNT.id, 'heart-test', 'atlas', new File([mk(BIG, 7)], 'heart-atlas.pdf', { type: 'application/pdf' })); }, BIG);
  const anna = Object.values(srv.state.users).find(u => u.email === 'anna@example.com').id;
  const parts = Object.keys(srv.state.files).filter(k => k.startsWith(`${anna}/sources/heart-test/atlas/file.pdf.p`)).sort();
  ok(parts.length === 4 && Buffer.concat(parts.map(k => Buffer.from(srv.state.files[k].data))).equals(bytes(BIG, 7)), 'a big source file is stored in parts under the storage limit (no 50 MB limit any more): ' + parts.length + ' parts');
  ok(await A.p.evaluate(async () => (await NoemaSrcFiles.get(ACCOUNT.id, 'heart-test', 'atlas')).blob.size) === BIG, '…and is whole again on this device');
  await A.p.evaluate(() => { Noema.openSubjectPicker(); }); await wait(500);
  const sb = A.p.locator('.noema-chipwrap:has-text("Heart test") .noema-sharebtn');
  ok(await sb.count() === 1 && await A.p.locator('.noema-chipwrap:has-text("Databricks") .noema-sharebtn').count() === 0, 'personal subjects carry a subtle 🔗 share button (library ones don’t)');
  await A.p.hover('.noema-chipwrap:has-text("Heart test")'); await sb.click(); await wait(500);
  ok(/Share “Heart test”/.test(await A.p.locator('.noema-ovbox').last().innerText()), 'the share dialog opens');
  ok(await A.p.locator('.nx-warn').count() === 1, 'a pack with non-open pictures shows the licence warning');
  ok(/Include its 2 source files \(\d+ KB\)/.test(await A.p.locator('.nx-files').innerText()) && await A.p.isChecked('.nx-files input'), 'the dialog offers to include the 2 source files (ticked)');
  await A.p.click('button:has-text("Make it public")'); await wait(400);
  ok(srv.state.pubPacks.length === 0, 'publishing waits until the warning is acknowledged');
  await A.p.check('.nx-warn input'); await A.p.click('button:has-text("Make it public")'); await wait(800);
  const pubRow = srv.state.pubPacks.find(r => r.subject_id === 'heart-test');
  ok(!!pubRow && Object.keys(srv.state.pubFiles).some(k => k.endsWith('/heart-test.json')) && pubRow.meta.chapters?.length === 1 && pubRow.owner_name === 'Anna', 'public: row with info (chapters, counts, owner) + file in the public bucket');
  const pubParts = Object.keys(srv.state.pubFiles).filter(k => k.startsWith(`${anna}/heart-test/sources/`));
  ok(pubParts.length === 5 && pubRow.meta.sourceFiles === 2 && pubRow.meta.filePaths.length === 5 && JSON.parse(srv.state.pubFiles[`${anna}/heart-test.json`].data).sharedFiles?.atlas?.chunks === 4, 'public: the source files go with it (the big one in 4 parts) and the pack says where they are');
  await A.p.screenshot({ path: SHOTS + '/x1_share_dialog.png' });
  await A.p.check('.nx-warn input').catch(() => { });
  await A.p.fill('input[type=email]', 'Bob@Example.com'); await A.p.fill('input[placeholder^="Optional message"]', 'for Friday'); await A.p.click('button:has-text("Send")'); await wait(800);
  ok(srv.state.shares.length === 1 && srv.state.shares[0].to_email === 'bob@example.com' && srv.state.shares[0].status === 'pending' && Object.keys(srv.state.shrFiles).filter(k => k.endsWith('.json')).length === 1, 'shared with Bob (e-mail lower-cased, pending, file uploaded)');
  const sid1 = srv.state.shares[0].id;
  ok(Object.keys(srv.state.shrFiles).filter(k => k.startsWith(sid1 + '.src-')).length === 5 && srv.state.shares[0].meta.sourceFiles === 2, 'the source files are shared too, readable only by Anna and Bob (<share>.src-…)');
  ok(/bob@example\.com/.test(await A.p.locator('.nx-sent').innerText()) && /waiting/.test(await A.p.locator('.nx-sent').innerText()), 'the dialog lists it as ⏳ waiting');
  await A.p.click('.noema-ovbox button:has-text("Close") >> nth=-1'); await wait(300);
  // second share, which Bob will reject
  await A.p.evaluate(() => { Noema.share({ id: 'lungs-test', title: 'Lungs test', origin: 'imported' }); }); await wait(600);
  await A.p.fill('input[type=email]', 'bob@example.com'); await A.p.click('button:has-text("Send")'); await wait(700);
  ok(srv.state.shares.length === 2, 'a second subject shared');

  console.log('— Bob receives');
  const B = await signUp(browser, 'bob@example.com', 'Bob');
  ok(/2 subject\(s\) shared with you/i.test(await B.p.locator('.nx-reqs').innerText()) && /Anna/.test(await B.p.locator('.nx-reqs').innerText()), 'the subject picker lists the incoming requests');
  await B.p.click('.noema-chip:has-text("Databricks")'); await wait(1600);
  ok(await B.p.$eval('#bellbtn .bellbadge', b => b.textContent) === '2', '🔔 shows 2');
  ok(await B.p.$eval('.sharebar', b => b.classList.contains('on') && /Anna/.test(b.innerText)), 'the top banner shows the newest request');
  await B.p.screenshot({ path: SHOTS + '/x2_banner.png' });
  await B.p.click('.sharebar button:has-text("Accept")'); await wait(1200);
  ok(srv.state.shares.find(s => s.subject_id === 'heart-test').status === 'accepted', 'Accept → share accepted'); await wait(3500);
  const bob = Object.values(srv.state.users).find(u => u.email === 'bob@example.com').id;
  ok(!!srv.state.kv[bob]?.['a:packmeta:heart-test'] && Object.keys(srv.state.files).some(k => k === `${bob}/packs/heart-test.json`), 'the pack is copied into Bob’s own account (synced to all his devices)');
  const bIdx = JSON.parse(srv.state.kv[bob]?.['a:srcfiles:heart-test']?.value || '{}');
  const bParts = Object.keys(srv.state.files).filter(k => k.startsWith(`${bob}/sources/heart-test/atlas/file.pdf.p`)).sort();
  ok(bIdx.notes?.name === 'Σημειώσεις καρδιάς.pdf' && bIdx.atlas?.chunks === 4 && Buffer.concat(bParts.map(k => Buffer.from(srv.state.files[k].data))).equals(bytes(BIG, 7)) && Buffer.from(srv.state.files[`${bob}/sources/heart-test/notes/file.pdf`].data).equals(bytes(5000, 3)), 'Bob gets the source files too, byte for byte, in his own account');
  ok(!JSON.stringify(JSON.parse(Buffer.from(srv.state.files[`${bob}/packs/heart-test.json`].data).toString())).includes('sharedFiles'), 'the download addresses are not kept in Bob’s copy of the pack');
  await B.p.click('.modal button:has-text("No"), .modal button:has-text("Cancel"), .modal .btn:not(.primary)').catch(() => { }); await wait(300);
  ok(await B.p.$eval('#bellbtn .bellbadge', b => b.textContent) === '1', '🔔 now shows 1');
  await B.p.click('#bellbtn'); await wait(300);
  ok(/Lungs test/.test(await B.p.locator('.modal').last().innerText()), 'the bell lists the remaining request');
  await B.p.click('.modal .nx-req button:has-text("Reject")'); await wait(700);
  ok(srv.state.shares.find(s => s.subject_id === 'lungs-test').status === 'rejected', 'Reject → share rejected');
  await B.p.keyboard.press('Escape'); await wait(200);
  await B.p.evaluate(() => { Noema.openSubjectPicker(); }); await wait(500);
  ok(await B.p.locator('.noema-chip:has-text("Heart test")').count() === 1 && /🤝/.test(await B.p.locator('.noema-chip:has-text("Heart test")').innerText()), 'the accepted subject is in Bob’s picker (🤝 shared)');
  await B.p.click('.noema-chip:has-text("Heart test")'); await wait(1600);
  ok(await B.p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.title === 'Heart test'), 'and it opens');

  console.log('— 🌍 Explore');
  await B.p.click('.explorechip'); await wait(700);
  const cards = await B.p.locator('.nx-card').allInnerTexts();
  ok(cards.some(t => /Databricks/.test(t)) && cards.some(t => /Heart test/.test(t)) && cards.every(t => !/\d+ ch|exercises|library|Anna/.test(t)), 'Explore cards show only emoji + title (the details moved to the info popup)');
  await B.p.hover('.nx-card:has-text("Databricks")'); await wait(450);
  const hov = await B.p.locator('.nx-hover.on').innerText();
  ok(/chapters/.test(hov) && /Foundations: Storage, Tables/.test(hov) && /exercises/.test(hov) && /library/.test(hov), 'hover → info popup: statistics, owner and the chapter list');
  const ch = await B.p.$eval('.nx-hover.on .nx-chapters', e => ({ items: e.querySelectorAll('ol > li').length, bold: !!e.querySelector('li strong'), scroll: e.scrollHeight > e.clientHeight, h: e.clientHeight, oflow: getComputedStyle(e).overflowY }));
  ok(ch.items === 13 && ch.bold && ch.scroll && ch.oflow === 'auto' && ch.h <= 300, 'chapters: Markdown rendered as a numbered list in a fixed-size scrollable box ' + JSON.stringify(ch));
  await B.p.screenshot({ path: SHOTS + '/x3_explore_hover.png' });
  await B.p.hover('.nx-card:has-text("Heart test")'); await wait(450);
  const info = await B.p.locator('.nx-hover.on').innerText();
  ok(/Heart test/.test(info) && /Anna/.test(info) && /chapter/i.test(info) && /sources/i.test(info) && /not openly licensed/.test(info), 'info: owner, stats, chapters, sources, licence note');
  await B.p.screenshot({ path: SHOTS + '/x4_info.png' });
  await B.p.click('.nx-card:has-text("Heart test")'); await wait(1800);
  ok(await B.p.locator('.nx-menu').count() === 0 && await B.p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.title === 'Heart test'), 'click → selects the subject straight away (no extra menu)');

  console.log('— 🌍 Explore on a phone');
  const phc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await B.ctx.storageState() }); const ph = await phc.newPage();
  await ph.goto(BASE + '/'); await wait(2000);
  await ph.evaluate(() => { Noema.explore(); }).catch(() => { }); await ph.waitForSelector('.nx-card', { timeout: 8000 }).catch(() => { });
  ok(/press and hold/.test(await ph.locator('.noema-ovbox').last().innerText()), 'phone: the hint says “tap to study · press and hold for details”');
  const card = ph.locator('.nx-card:has-text("Databricks")'); const bb = await card.boundingBox();
  await card.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: bb.x + 20, clientY: bb.y + 20, isPrimary: true }); await wait(650);
  await card.dispatchEvent('pointerup', { pointerType: 'touch', clientX: bb.x + 20, clientY: bb.y + 20 }); await card.dispatchEvent('click');
  await wait(300);
  ok(await ph.locator('.nx-hover.sheet.on').count() === 1 && /Foundations: Storage, Tables/.test(await ph.locator('.nx-hover.sheet').innerText()) && await ph.evaluate(() => !!document.querySelector('.noema-overlay')), 'press and hold → the info opens as a bottom sheet (and does not select the subject)');
  await ph.screenshot({ path: SHOTS + '/x7_phone_sheet.png' });
  await ph.mouse.click(20, 80); await wait(250);
  ok(await ph.locator('.nx-hover.on').count() === 0, 'tapping outside closes the sheet');
  await phc.close();

  console.log('— Carl (not shared with) studies a public subject');
  const Cc = await signUp(browser, 'carl@example.com', 'Carl');
  ok(await Cc.p.locator('.nx-reqs').count() === 0 || (await Cc.p.locator('.nx-reqs').innerText()) === '', 'Carl gets no requests');
  await Cc.p.click('.noema-ovfoot button:has-text("Explore")'); await wait(700);
  await Cc.p.click('.nx-card:has-text("Heart test")'); await wait(2200);
  await Cc.p.screenshot({ path: SHOTS + '/x6_carl.png' });
  ok(await Cc.p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.title === 'Heart test'), 'Choose → downloaded from the public bucket, added to Carl’s subjects and opened');
  ok(await Cc.p.evaluate(async () => { const r = await NoemaSrcFiles.get(ACCOUNT.id, 'heart-test', 'atlas'); return r?.blob.size; }) === BIG, 'the public subject comes with its source files (the big one joined again)');
  // 🔔 a new version of the public subject waits for Carl: Keep mine, then Update
  const republish = v => A.p.evaluate(async v => { const p = await Noema.loadSubject(ACCOUNT.id, 'heart-test'); p.version = v; await Noema.importPack(ACCOUNT.id, JSON.parse(JSON.stringify(p))); document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); Noema.share({ id: 'heart-test', title: 'Heart test', origin: 'imported' }); }, v);
  await republish('heart-test-v2'); await wait(700);
  await A.p.check('.nx-warn input').catch(() => { }); await A.p.locator('.noema-ovbox').last().locator('button:has-text("Publish the newest version")').click(); await wait(900);
  ok(srv.state.pubPacks.find(r => r.subject_id === 'heart-test')?.meta?.version === 'heart-test-v2', 'Anna publishes a new version of “Heart test”');
  let up = await Cc.p.evaluate(() => Noema.notes.refresh().then(l => l.filter(x => x.kind === 'subjupdate').map(x => x.subject)));
  ok(up.join() === 'heart-test' && /published a new version of/.test(await Cc.p.locator('.sharebar').innerText()), '🔔 Carl is told (bell + banner): Update or Keep mine');
  await Cc.p.click('.sharebar button:has-text("Keep mine")'); await wait(500);
  up = await Cc.p.evaluate(() => Noema.notes.refresh().then(l => l.filter(x => x.kind === 'subjupdate').length));
  ok(up === 0 && await Cc.p.evaluate(() => JSON.parse(localStorage.getItem(`noema1:${ACCOUNT.id}:a:packmeta:heart-test`)).version) === 'heart-test-v1', '“Keep mine”: he keeps v1 and is not asked again about v2');
  await republish('heart-test-v3'); await wait(700);
  await A.p.check('.nx-warn input').catch(() => { }); await A.p.locator('.noema-ovbox').last().locator('button:has-text("Publish the newest version")').click(); await wait(900);
  await Cc.p.evaluate(() => Noema.notes.refresh()); await wait(300);
  await Cc.p.click('.sharebar button:has-text("Update")'); await wait(2000);
  const cm = await Cc.p.evaluate(async () => ({ meta: JSON.parse(localStorage.getItem(`noema1:${ACCOUNT.id}:a:packmeta:heart-test`)), pack: (await Noema.loadSubject(ACCOUNT.id, 'heart-test')).version }));
  ok(cm.meta.version === 'heart-test-v3' && cm.pack === 'heart-test-v3' && cm.meta.publicFrom === anna && !(await Cc.p.evaluate(() => Noema.notes.pending.some(x => x.kind === 'subjupdate'))), '⬆️ Update: he has v3 — the same subject (his progress stays), still from Anna');
  await A.p.click('.noema-ovbox button:has-text("Close") >> nth=-1').catch(() => { });
  // withdrawing removes the shared copies of the files
  await A.p.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); Noema.share({ id: 'heart-test', title: 'Heart test', origin: 'imported' }); }); await wait(700);
  await A.p.locator('.noema-ovbox').last().locator('button:has-text("Withdraw")').first().click(); await wait(800);
  ok(!srv.state.pubPacks.some(r => r.subject_id === 'heart-test') && !Object.keys(srv.state.pubFiles).some(k => k.startsWith(`${anna}/heart-test`)), 'withdrawing a public subject removes its public files too');
  await A.p.click('.noema-ovbox button:has-text("Close") >> nth=-1').catch(() => { });

  console.log('— 🩺 self-test');
  await B.p.evaluate(() => openAccountMenu('cloud')); await wait(600);
  await B.p.click('summary:has-text("Check the cloud connection")'); await B.p.click('button:has-text("Run the check")'); await wait(2500);
  const st = await B.p.locator('.selftest').innerText();
  ok(/Everything works with the real cloud/.test(st) && (st.match(/✅/g) || []).length >= 9, 'all 9 checks pass and clean up: ' + st.replace(/\s+/g, ' '));
  await B.p.screenshot({ path: SHOTS + '/x5_selftest.png' });
  ok(!Object.keys(srv.state.files).some(k => k.includes('selftest')) && !Object.keys(srv.state.pubFiles).some(k => k.includes('selftest')) && !Object.keys(srv.state.kv[bob] || {}).some(k => k.includes('selftest')), 'the self-test leaves nothing behind');
  // Anna sees the answers
  await A.p.evaluate(() => { Noema.share({ id: 'lungs-test', title: 'Lungs test', origin: 'imported' }); }); await wait(700);
  ok(/rejected/.test(await A.p.locator('.nx-sent').last().innerText()), 'the sender sees ✖ rejected');
  for (const [n, x] of [['Anna', A], ['Bob', B], ['Carl', Cc]]) ok(!x.E.length, `${n}: no page errors ${JSON.stringify(x.E.slice(0, 2))}`);
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
