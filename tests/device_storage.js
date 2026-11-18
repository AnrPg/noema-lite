/* The device keeps an account of any size (src/adapters/browser/kv-mirror.ts; bug of 2026-11-18: on an iPhone with a few big
   Roadmaps the app said "This device's storage is full, so your latest progress was not saved here").
   localStorage holds about 5 MB in every browser, whatever the free space; the account's keys now live in IndexedDB behind
   an in-memory copy, localStorage only the device's small keys.
     A. 8 Roadmaps of ~2 M characters each (≈ 18 M characters, more than three times what localStorage can hold): saved, no storage-full
        warning, a subject's progress still saved, localStorage stays small
     B. a reload: every Roadmap and the progress are back, read through the same calls
     C. an older version's account in localStorage moves to IndexedDB on the next start, nothing lost
     D. a second tab sees a change the first one makes
   Usage: node tests/device_storage.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };

/** n big Roadmaps (each ~2 M characters of chapter plans), saved through the app's own call */
const fill = (page, n) => page.evaluate(n => {
  const acc = Noema.account.id, text = 'Plan text with goals and coverage. '.repeat(60);
  for (let r = 0; r < n; r++) {
    const nodes = {};
    for (let i = 0; i < 120; i++) nodes['s' + i] = { title: `Step ${i}`, summary: text, chapters: Array.from({ length: 4 }, (_, c) => ({ title: `Chapter ${c}`, goals: [text], coverage: text })) };
    NoemaCurriculum.save(acc, { format: 'noema.curriculum/v1', id: 'big' + r, title: 'Big map ' + r, goal: 'Big map', status: 'ready', provider: 'claudeapp', nodes, edges: [] });
  }
  return JSON.stringify(NoemaCurriculum.list(acc)).length;
}, n);
/** characters in localStorage (keys + values) */
const lsSize = page => page.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; });
const fullWarnings = page => page.evaluate(() => NoemaCore.errors.journal().filter(e => e.code === 'storage.quota').length);

(async () => {
  const browser = await chromium.launch();
  const url = await appUrl(ROOT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const E = [];
  page.on('pageerror', e => E.push('PAGEERROR ' + e.message));

  console.log('A. an account twice the size localStorage can hold');
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);
  ok(await until(() => page.evaluate(() => !!window.Noema?.account?.id)), 'a profile is open');
  const chars = await fill(page, 8);
  ok(chars > 9e6, `8 Roadmaps saved, ${(chars / 1e6).toFixed(1)} M characters`);
  const acc = await page.evaluate(() => Noema.account.id);
  const pk = `noema1:${acc}:s:demo-physics:notes`;
  ok(await page.evaluate(k => Noema.kv.set(k, JSON.stringify({ n: 1 })), pk) !== false, 'a subject’s data is still saved after them');
  ok(await fullWarnings(page) === 0, 'no “storage is full” warning: ' + await fullWarnings(page));
  const ls1 = await lsSize(page);
  ok(ls1 < 200e3, `localStorage keeps only the device’s small keys: ${Math.round(ls1 / 1e3)} K characters`);
  ok(await page.evaluate(() => NoemaCore.storage.estimate().then(e => !!e)), 'the storage estimate answers');

  console.log('B. a reload: everything is back');
  await wait(500); await page.reload();
  ok(await until(() => page.evaluate(() => !!window.Noema?.account?.id)), 'the profile opens again');
  ok(await page.evaluate(a => NoemaCurriculum.list(a).filter(c => c.id.startsWith('big')).length, acc) === 8, 'all 8 Roadmaps are back');
  ok(await page.evaluate(a => Object.keys(NoemaCurriculum.get(a, 'big7').nodes).length, acc) === 120, 'whole, every step');
  ok(await page.evaluate(k => NoemaCore.storage.kv.get(k), pk) === JSON.stringify({ n: 1 }), 'the subject’s data is back');
  ok(await fullWarnings(page) === 0, 'still no storage-full warning');

  console.log('C. an older version’s account in localStorage moves to IndexedDB');
  await page.evaluate(a => { localStorage.setItem(`noema1:${a}:a:curriculum:legacy`, JSON.stringify({ format: 'noema.curriculum/v1', id: 'legacy', title: 'Old', nodes: {}, edges: [] })); localStorage.setItem(`noema1:${a}:s:legacy:x`, '"kept"'); }, acc);
  await page.reload();
  ok(await until(() => page.evaluate(() => !!window.Noema?.account?.id)), 'the profile opens');
  ok(await page.evaluate(a => !!NoemaCurriculum.get(a, 'legacy'), acc), 'the older Roadmap is read');
  ok(await page.evaluate(a => NoemaCore.storage.kv.get(`noema1:${a}:s:legacy:x`), acc) === '"kept"', 'the older subject key is read');
  await wait(500);
  ok(await page.evaluate(a => localStorage.getItem(`noema1:${a}:a:curriculum:legacy`) === null && localStorage.getItem(`noema1:${a}:s:legacy:x`) === null, acc), 'and they left localStorage');
  await page.reload(); await until(() => page.evaluate(() => !!window.Noema?.account?.id));
  ok(await page.evaluate(a => NoemaCore.storage.kv.get(`noema1:${a}:s:legacy:x`), acc) === '"kept"', 'still there after another start');

  console.log('D. a second tab');
  const p2 = await ctx.newPage(); await p2.goto(url);
  ok(await until(() => p2.evaluate(() => !!window.Noema?.account?.id)), 'the second tab opens the profile');
  await page.evaluate(k => Noema.kv.set(k, JSON.stringify({ n: 2 })), pk);
  ok(await until(() => p2.evaluate(k => NoemaCore.storage.kv.get(k), pk).then(v => v === JSON.stringify({ n: 2 })), 5000), 'it sees the first tab’s change');

  const errs = E.filter(e => !/favicon|ERR_|net::/.test(e));
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} check(s) failed` : '\nall device-storage checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
