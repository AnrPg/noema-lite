/* 🔔 News that arrives (a step ready, a subject attached, a new part, links added — engine/curjobs.js through Noema.notice,
   engine/loader.js Notices): at most 2 short toasts on screen at once; a 3rd moves them all to the bell, where they wait
   (on this device) until cleared one by one or with “Clear all”. The toasts never stack up over the page.
   Driven through the real inbox (NoemaCurJobs.App.poll) with 4 “links added” answers, the cloud calls stubbed.
     A. the new frame (shell.js): 2 toasts, then 0 toasts and 4 in the bell; ✕ one, reload keeps the rest, Clear all
     B. one or two pieces of news: only toasts, nothing in the bell
     C. the classic screens' bell (engine/src/40_views.js) lists them too, ✕ and Clear all there
     D. deleting a profile deletes its news
   Usage: node tests/notices.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };

/** A Roadmap with steps a…f and no links, the cloud stubbed, and `n` inbox answers that each add one link: polled once. */
const arrive = (page, n, cid) => page.evaluate(async ([n, cid]) => {
  const acc = Noema.account.id, ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  NoemaCurriculum.save(acc, { id: cid, title: 'Test map', goal: 'Test map', status: 'ready', provider: 'claudeapp', nodes: Object.fromEntries(ids.map(i => [i, { title: 'Step ' + i.toUpperCase(), chapters: [] }])), edges: [] });
  const rows = Array.from({ length: n }, (_, i) => ({ key: `a:curin:${cid}:${String(i).padStart(3, '0')}`, value: JSON.stringify({ kind: 'link', id: cid + 'l' + i, links: [{ from: ids[i], to: ids[i + 1], why: 'test' }] }), updated_at: new Date().toISOString() }));
  Object.assign(NoemaCloud, { session: () => ({ user: { id: 'u' } }), kvRows: async () => rows.splice(0), pull: async () => { }, push: async () => { }, kvDelete: async () => { } });
  return NoemaCurJobs.App.poll(acc);
}, [n, cid]);
const toasts = page => page.$$eval('.toasts .toast', l => l.map(x => x.textContent));
const badge = (page, sel) => page.$eval(sel, b => b.style.display === 'none' ? 0 : +b.textContent || 0);

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const E = [];
  page.on('pageerror', e => E.push('PAGEERROR ' + e.message));

  console.log('A. four pieces of news at once (the new frame)');
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);
  ok(await until(() => page.$('#bellbtn')), 'the frame and its 🔔 are up');
  const sent = [];
  await page.exposeFunction('seen', t => sent.push(t));
  const watch = () => page.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(x => x.classList?.contains('toast') && window.seen(x.textContent)))).observe(document.body, { childList: true, subtree: true }));
  await watch();
  ok(await arrive(page, 4, 'cn-four') === 4, 'the inbox applies 4 answers (links added) in one check');
  await wait(300);
  ok(sent.length === 2, `only 2 toasts were ever shown: ${sent.length}`);
  ok((await toasts(page)).length === 0, 'when the 3rd arrived the toasts left the screen: nothing stacks up');
  ok(await badge(page, '#bellbtn .bellbadge') === 4, 'the bell counts the 4 pieces of news: ' + await badge(page, '#bellbtn .bellbadge'));
  await page.screenshot({ path: SHOTS + '/notices_bell.png' });
  await page.click('#bellbtn'); await wait(300);
  const rows = await page.$$eval('.nx-notice', l => l.map(x => x.textContent));
  ok(rows.length === 4 && rows.every(t => /Links between steps changed/.test(t)), 'the bell lists all 4, the 2 toasts included: ' + (rows[0] || '').slice(0, 80));
  ok(await page.$('.nx-noticeclear button') && /Clear all/.test(await page.textContent('.nx-noticeclear button')), '“Clear all” under the list');
  await page.screenshot({ path: SHOTS + '/notices_sheet.png' });
  await page.click('.nx-notice button'); await wait(200);
  ok(await page.$$eval('.nx-notice', l => l.length) === 3, '✕ clears one');
  ok(!(await page.$('.sharebar.on')), 'news never shows in the share banner');
  await page.reload(); await until(() => page.$('#bellbtn')); await wait(800);
  ok(await badge(page, '#bellbtn .bellbadge') === 3, 'after a reload the 3 still wait in the bell');
  await page.click('#bellbtn'); await wait(300); await page.click('.nx-noticeclear button'); await wait(200);
  ok(await page.$$eval('.nx-notice', l => l.length) === 0 && !(await page.$('.nx-noticeclear')), 'Clear all empties the list');
  ok(await badge(page, '#bellbtn .bellbadge') === 0, 'and the bell has no count');
  await page.keyboard.press('Escape'); await page.goto(url + '#/'); await wait(500);

  console.log('B. two pieces of news: toasts only');
  sent.length = 0; await watch();
  ok(await arrive(page, 2, 'cn-two') === 2, 'the inbox applies 2 answers');
  await wait(300);
  { const t = await toasts(page); ok(sent.length === 2 && t.length === 2, `two toasts on screen: ${sent.length} shown, ${t.length} now`); }
  ok(await badge(page, '#bellbtn .bellbadge') === 0, 'nothing went to the bell');
  await page.screenshot({ path: SHOTS + '/notices_two.png' });

  console.log('C. the classic screens\' bell');
  const p2 = await ctx.newPage(); p2.on('pageerror', e => E.push('PAGEERROR ' + e.message));
  await p2.goto(url); await p2.evaluate(() => { localStorage.removeItem('noema-test:newUI'); }); await p2.reload();
  await until(() => p2.$('.noema-chip')); await p2.click('.noema-chip:has-text("Demo Physics")');
  ok(await until(() => p2.$('#bellbtn')), 'a subject opens in the classic screens, with its 🔔');
  await p2.evaluate(() => { for (let i = 1; i <= 3; i++) Noema.notice('📦 news ' + i, 4000); });
  await wait(200);
  ok((await toasts(p2)).length === 0 && await badge(p2, '#bellbtn .bellbadge') === 3, '3 at once: no toast left, the classic bell counts 3');
  ok(!(await p2.$('.sharebar.on')), 'news never shows in the classic share banner');
  await p2.click('#bellbtn'); await wait(300);
  ok(await p2.$$eval('.nx-notice', l => l.length) === 3, 'the classic bell lists them');
  await p2.click('.nx-notice button'); await wait(200);
  ok(await p2.$$eval('.nx-notice', l => l.length) === 2, '✕ clears one there too');
  await p2.click('.nx-noticeclear button'); await wait(200);
  ok(await p2.$$eval('.nx-notice', l => l.length) === 0 && await badge(p2, '#bellbtn .bellbadge') === 0, 'Clear all empties the classic bell');

  console.log('D. deleting a profile deletes its news');
  ok(await p2.evaluate(() => { const id = Noema.account.id; Noema.notice('a', 10); Noema.notice('b', 10); Noema.notice('c', 10); const before = !!localStorage.getItem('noema-notices:' + id); Noema.wipeAccountData(id); return before && !localStorage.getItem('noema-notices:' + id); }), 'wipeAccountData removes the profile\'s news from this device');

  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n❌ notices: ${fails} failed` : '\n✅ notices: all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
