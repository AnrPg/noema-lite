/* 💬→📖 A chat with the tutor used to improve a lesson, in the real app (docs/LESSON_UPDATES.md): a local profile with one
   subject of its own (the gradual chapter of src/features/lesson-updates/application/lesson.fixture.ts, in English and Greek).
     A. "Use this chat in a lesson": the send window (the lesson picked by default), Send, then the review window with the
        answer pasted back from a Claude chat: the checks run, the diff shows the new block in green, nothing saved yet
     B. Approve: the lesson in the account has the block in both languages, a new version; Undo puts it back
     C. the 🔔: a proposal's card makes a row "Claude's changes … are ready"; ✕ declines it
     D. a pasted answer that breaks a rule of the lesson (a term before it is taught, with nowhere better) is refused with
        the problems to copy for Claude, and Approve stays off
     E. the tutor's ⋮ has the item, the Conversations window the button (both open the same send window)
   Usage: node tests/lesson_updates.js [repo-dir] */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };

// the lesson of the unit tests, as a pack with its Greek translation inline (what Noema.importPack takes)
const fx = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
  `import { base, para, trBlocks, update } from ${JSON.stringify(path.join(ROOT, 'src/features/lesson-updates/application/lesson.fixture.ts'))};
   const b = base(); const blocks = [para('Picture the current as the number of people who pass a door each second: the more who pass, the larger the current, whatever the size of the crowd.')];
   const early = [para('A battery label in ampere-hours tells how long the current can last: that is why the ampere-hour matters before anything else here.')];
   console.log(JSON.stringify({ pack: { ...b.pack, translations: { el: { chapters: b.translations.el.chapters } } },
     good: update([{ op: 'blocks', section: 'ch01-s02', at: 1, blocks, i18n: trBlocks(blocks) }]),
     early: update([{ op: 'blocks', section: 'ch01-s01', at: 1, blocks: early, i18n: trBlocks(early) }]),
     bad: update([{ op: 'blocks', section: 'ch01-s02', blocks }]) }));`], { encoding: 'utf8' }));
const record = {
  id: 'cv-door', title: 'Current vs charge', mode: 'explain',
  context: { type: 'section', id: 'ch01-s02', label: 'Charge on the move', chapterId: 'ch01', sectionId: 'ch01-s02' },
  messages: [
    { role: 'user', content: 'Is current the same thing as charge?' },
    { role: 'model', content: 'No. Current is how much charge passes each second, like people passing a door.' },
  ],
};
const dialog = (page, cls) => page.locator(`noema-dialog.${cls}`);
const storedPack = page => page.evaluate(() => Noema.idb.get('packs', Noema.account.id + '|circ-demo'));
const answerBox = d => d.locator('.lu-answer textarea');

(async () => {
  const browser = await chromium.launch();
  const url = await appUrl(ROOT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const E = [];
  page.on('pageerror', e => E.push('PAGEERROR ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && !/config\.local\.js$/.test(r.url())) E.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);
  ok(await until(() => page.evaluate(() => !!window.NoemaShell?.lessonUpdates)), 'NoemaShell.lessonUpdates is there');
  await page.evaluate(async p => { await NoemaCore.contracts.ready(); await Noema.importPack(Noema.account.id, p); }, fx.pack);
  ok(!(await page.evaluate(() => !!window.__noemaLessonUpdatesPiece)), 'its windows are not loaded before they are needed');

  console.log('A. send, paste the answer, review');
  await page.evaluate(r => NoemaShell.lessonUpdates.send(r, { subject: 'circ-demo', chapter: 'ch01' }), record);
  const send = dialog(page, 'lu-send');
  ok(await until(() => send.isVisible()), 'the send window opens');
  ok(await until(async () => (await send.locator('.lu-chapter').evaluate(e => e.value)) === 'ch01'), 'the lesson the chat is about is picked');
  await send.locator('.lu-note textarea').fill('the door picture');
  await page.screenshot({ path: SHOTS + '/lu_send.png' });
  await send.locator('.lu-go').click();
  ok(await until(() => send.locator('.lu-ok').isVisible()), 'Send records the request: ' + (await send.locator('.lu-ok').textContent().catch(() => '')));
  const req = await page.evaluate(() => { const k = NoemaCore.storage.kv.keys(`noema1:${Noema.account.id}:a:lessonreq:`)[0]; return JSON.parse(NoemaCore.storage.kv.get(k)); });
  ok(req.state === 'open' && req.chapter.id === 'ch01' && req.note === 'the door picture' && req.conversation.turns === 2, 'the request row: open, ch01, the note, 2 turns');
  ok(/the whole brief|paste/i.test(await send.textContent()), 'a local profile: copy the whole brief, paste the answer back');
  await send.locator('.lu-paste').click();
  const rev = dialog(page, 'lu-review');
  ok(await until(() => rev.isVisible()), 'the review window opens on the request');
  await answerBox(rev).fill('```json\n' + JSON.stringify(fx.good) + '\n```');
  await rev.locator('.lu-check').click();
  ok(await until(() => rev.locator('.lu-blk.added').count().then(n => n === 1), 30000), 'the diff shows the one added block');
  ok(/people who pass a door/.test(await rev.locator('.lu-blk.added').textContent()), '… with its words');
  ok(await rev.locator('.lu-same').count() >= 1, 'unchanged blocks are folded');
  ok(await until(async () => !(await rev.locator('.lu-approve').evaluate(e => e.disabled))), 'Approve is on: the checks found nothing new');
  ok(!/people who pass a door/.test(JSON.stringify(await storedPack(page))), 'nothing saved before Approve');
  await page.screenshot({ path: SHOTS + '/lu_review.png' });

  console.log('B. approve, undo');
  await rev.locator('.lu-approve').click();
  ok(await until(() => rev.locator('.lu-undo').isVisible(), 30000), 'applied: Undo is offered');
  const after = await storedPack(page);
  ok(/people who pass a door/.test(JSON.stringify(after.chapters)), 'the lesson in the account has the block');
  ok(/\+lu\./.test(after.version || ''), 'a new version: ' + after.version);
  const el = await page.evaluate(() => Noema.app.inlineTranslations(Noema.account.id, { id: 'circ-demo', origin: 'imported' }, null).catch(() => null));
  const tr = await page.evaluate(async () => { const p = await Noema.idb.get('packs', Noema.account.id + '|circ-demo'); return (await Noema.app.inlineTranslations(Noema.account.id, { id: 'circ-demo', origin: 'imported' }, p)).translations?.el?.chapters; });
  ok(Array.isArray(tr) && /people who pass a door/.test(JSON.stringify(tr)), 'the Greek translation has it at the same place');
  void el;
  await page.screenshot({ path: SHOTS + '/lu_applied.png' });
  await rev.locator('.lu-undo').click();
  ok(await until(async () => !/people who pass a door/.test(JSON.stringify((await storedPack(page)).chapters)), 20000), 'Undo: the lesson as it was');
  await page.keyboard.press('Escape'); await wait(300);

  console.log('C. the 🔔 row');
  await page.evaluate(r => NoemaShell.lessonUpdates.send(r, { subject: 'circ-demo', chapter: 'ch01' }), record);
  await until(() => send.isVisible()); await send.locator('.lu-go').click(); await until(() => send.locator('.lu-ok').isVisible());
  await page.keyboard.press('Escape'); await wait(300);
  const id2 = await page.evaluate(() => { const ks = NoemaCore.storage.kv.keys(`noema1:${Noema.account.id}:a:lessonreq:`); return ks.map(k => JSON.parse(NoemaCore.storage.kv.get(k))).find(r => r.state === 'open').id; });
  await page.evaluate(id => { Noema.kv.set(`noema1:${Noema.account.id}:a:lessonup:${id}`, JSON.stringify({ v: 1, id, at: new Date().toISOString(), pack: 'circ-demo', chapter: 'ch01', summary: 'Adds the door picture of current.', counts: { additions: 1, choices: 0, notes: 0 }, rev: 1 }));
    dispatchEvent(new CustomEvent('noema:pulled', { detail: { acc: Noema.account.id, keys: ['a:lessonup:' + id] } })); }, id2);
  ok(await until(() => page.evaluate(() => (Noema.notes?.pending || []).some(x => x.kind === 'lessonupdate'))), 'the proposal is in the bell\'s list');
  await page.click('#bellbtn'); await wait(400);
  const row = page.getByRole('dialog').locator('.nx-lessonup');
  ok(await until(() => row.isVisible()), 'its row: ' + (await row.textContent().catch(() => '')).trim().slice(0, 90));
  await page.screenshot({ path: SHOTS + '/lu_bell.png' });
  await row.locator('.nx-dismiss').click();
  ok(await until(() => page.evaluate(id => JSON.parse(NoemaCore.storage.kv.get(`noema1:${Noema.account.id}:a:lessonreq:${id}`)).state === 'declined', id2)), '✕ declines it');
  ok(await until(async () => (await page.locator('.nx-lessonup').count()) === 0), '… and the row goes');
  await page.keyboard.press('Escape'); await wait(300);

  console.log('D. a term used too early is moved; an answer that breaks the lesson is refused');
  const pasteNew = async answer => {
    await page.evaluate(r => NoemaShell.lessonUpdates.send(r, { subject: 'circ-demo', chapter: 'ch01' }), record);
    await until(() => send.isVisible()); await send.locator('.lu-go').click(); await until(() => send.locator('.lu-ok').isVisible());
    await send.locator('.lu-paste').click(); await until(() => rev.isVisible());
    await answerBox(rev).fill(answer);
    await rev.locator('.lu-check').click();
  };
  await pasteNew(JSON.stringify(fx.early));
  ok(await until(() => rev.locator('.lu-notes').isVisible(), 30000), 'the review says where it went: ' + (await rev.locator('.lu-notes').textContent().catch(() => '')).trim());
  ok(/Moved from “What charge is” to “Counting a battery”/.test(await rev.locator('.lu-notes').textContent()), '… after the section that teaches ampere-hours');
  ok(await rev.locator('section[data-sec="ch01-s03"] .lu-blk.added').count() === 1, 'the diff shows it in that section');
  await page.screenshot({ path: SHOTS + '/lu_moved.png' });
  await page.keyboard.press('Escape'); await wait(300);
  await pasteNew(JSON.stringify(fx.bad));
  ok(await until(() => rev.locator('.lu-bad').isVisible(), 30000), 'refused: ' + (await rev.locator('.lu-bad p').first().textContent().catch(() => '')));
  ok(/no "el" translation/.test(await rev.locator('.lu-bad pre').textContent()), 'the details for Claude name the problem (no Greek text)');
  ok(await rev.locator('.lu-copyproblems').count() === 1, 'a button copies them for Claude');
  ok(await rev.locator('.lu-approve').count() === 0, 'nothing to approve');
  await page.screenshot({ path: SHOTS + '/lu_refused.png' });
  await page.keyboard.press('Escape'); await wait(300);

  console.log('E. the tutor and Conversations');
  await page.evaluate(async r => NoemaConvos.put(Noema.account.id, { ...r, kind: 'tutor', subject: { id: 'circ-demo', title: 'Circuits' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), record);
  await page.evaluate(() => NoemaShell.convos());
  await until(() => page.locator('.ns-cvmain', { hasText: 'Current vs charge' }).isVisible());
  await page.locator('.ns-cvmain', { hasText: 'Current vs charge' }).click();
  const btn = page.locator('.ns-cvlesson');
  ok(await until(() => btn.isVisible()), 'an open conversation has "' + (await btn.textContent().catch(() => '')).trim() + '" beside Continue');
  await page.screenshot({ path: SHOTS + '/lu_convos.png' });
  await btn.click();
  ok(await until(() => send.isVisible()), 'it opens the send window');
  ok(await until(async () => (await send.locator('.lu-chapter').evaluate(e => e.value)) === 'ch01'), '… on the lesson the chat is about');
  await page.keyboard.press('Escape'); await wait(300);

  ok(E.length === 0, 'no page errors: ' + E.slice(0, 3).join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
