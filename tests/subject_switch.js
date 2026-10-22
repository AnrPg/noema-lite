/* Opening another subject while one is open (engine/loader.js switchTo): the page reloads on the new one.
   Over a real network the reload takes a moment, and the old page still handles its hashchange meanwhile;
   it must not write the old subject back as the one to reopen (bug of 2026-10-22: every course opened the last one).
   Served over http with a slow index.html, so the race happens as it does on the site.
   Usage: node tests/subject_switch.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(200); } return false; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
let slow = false;
const srv = http.createServer(async (q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  if (slow && f.endsWith('index.html')) await wait(1500);
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  console.log('Opening another subject while one is open');
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(600);
  await page.goto(url + '#/shelf'); await until(() => page.$('[data-subject="demo-physics"]')); await page.click('[data-subject="demo-physics"]'); await until(() => page.$('.subjhead'));
  ok(await page.evaluate(() => Noema.subject?.id) === 'demo-physics', 'the first subject opens');
  slow = true;
  await page.goto(url + '#/shelf'); await until(() => page.$('[data-subject="secret-notes"]')); await page.click('[data-subject="secret-notes"]');
  await wait(2500); await until(() => page.$('.subjhead'));
  const now = await page.evaluate(() => [Noema.subject?.id, location.hash]);
  ok(now[0] === 'secret-notes' && now[1] === '#/subject', 'another one from the Shelf opens that one, not the one that was open: ' + now.join(' '));
  await browser.close(); srv.close();
  console.log(fails ? `\n❌ subject_switch: ${fails} failed` : '\n✅ subject_switch: all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
