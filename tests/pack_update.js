/* A subject that is already on this device gets a new version from Claude (connector: pack file + a:packmeta with a new
   version). Opening the app — or 🔄 Sync now — must show and open the NEW version, without any manual cleanup.
   Also: a failed download says so (and keeps the saved copy) instead of silently showing the old one.
   Usage: node tests/pack_update.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(200); } return false; };
const PORT = 54351, BASE = `http://localhost:${PORT}`;

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: true, shell: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Ana'); await p.fill('input[type=email]', 'ana@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1200);
  const uid = Object.values(srv.state.users).find(u => u.email === 'ana@example.com').id;

  // version 1 is on this device (and in the cloud), like a subject that was opened before
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  const v1 = JSON.parse(JSON.stringify(base)); v1.subject = { ...v1.subject, id: 'cellbio', title: 'Cell Biology', owner: null }; v1.version = 'v1';
  await p.evaluate(async pk => { await Noema.importPack(Noema.account.id, pk); }, v1);
  await p.goto(BASE + '/?subject=cellbio'); await wait(2000);
  ok(await p.evaluate(() => SUBJ.id === 'cellbio' && COURSE.length === 1), 'version 1 opens (1 chapter)');

  // Claude saves version 2 through the connector: the pack file + the synced metadata with the new version
  const v2 = JSON.parse(JSON.stringify(v1)); v2.version = 'v2';
  const ch2 = JSON.parse(JSON.stringify(v2.chapters[0])); const re = s => JSON.parse(JSON.stringify(s).replace(/ch01/g, 'ch02'));
  v2.chapters.push(Object.assign(re(ch2), { num: 2, title: 'Added by Claude' }));
  v2.counts = { chapters: 2, sections: v2.chapters.reduce((a, c) => a + c.sections.length, 0), exercises: v2.chapters.reduce((a, c) => a + c.exercises.length, 0) };
  srv.state.files[`${uid}/packs/cellbio.json`] = { data: Buffer.from(JSON.stringify(v2)), type: 'application/json' };
  srv.state.kv[uid]['a:packmeta:cellbio'] = { value: JSON.stringify({ ...v2.subject, counts: v2.counts, version: 'v2', via: 'claude', updatedAt: new Date().toISOString() }), updated_at: new Date(Date.now() + 1000).toISOString() };

  console.log('— reopening the app picks up the new version');
  await p.goto(BASE + '/'); await wait(1500);
  const chip = p.locator('.noema-chip:has-text("Cell Biology")');
  ok(await chip.count() === 1 && /✨/.test(await chip.innerText()), 'the subject chip shows ✨ (a new version is ready)');
  await chip.click();
  ok(await until(() => p.evaluate(() => typeof SUBJ !== 'undefined' && SUBJ.id === 'cellbio' && COURSE.length === 2)), 'it opens the NEW version (2 chapters) — no manual cleanup');
  ok(await p.evaluate(async () => (await new Promise(r => { const q = indexedDB.open('noema-lite', 1); q.onsuccess = () => { const g = q.result.transaction('packs').objectStore('packs').get(Noema.account.id + '|cellbio'); g.onsuccess = () => r(g.result?.version); }; })) === 'v2'), 'the copy saved on this device is now version 2');
  await p.goto(BASE + '/'); await wait(1200);
  ok(!/✨/.test(await p.locator('.noema-chip:has-text("Cell Biology")').innerText()), 'afterwards no ✨ (up to date)');
  await p.click('.noema-chip:has-text("Cell Biology")'); await wait(1500);

  console.log('— 🔄 Sync now while the app is open');
  const v3 = JSON.parse(JSON.stringify(v2)); v3.version = 'v3'; v3.chapters[1].title = 'Renamed in v3';
  srv.state.files[`${uid}/packs/cellbio.json`] = { data: Buffer.from(JSON.stringify(v3)), type: 'application/json' };
  srv.state.kv[uid]['a:packmeta:cellbio'] = { value: JSON.stringify({ ...v3.subject, counts: v2.counts, version: 'v3', via: 'claude', updatedAt: new Date().toISOString() }), updated_at: new Date(Date.now() + 5000).toISOString() };
  const pulled = await p.evaluate(async () => { await NoemaCloud.push(Noema.account.id); return NoemaCloud.pull(Noema.account.id); });   // what the 🔄 Sync now button does (then it reloads)
  await p.reload(); await wait(800);
  if (await p.locator('.noema-chip:has-text("Cell Biology")').count()) await p.click('.noema-chip:has-text("Cell Biology")');
  ok(pulled > 0 && await until(() => p.evaluate(() => COURSE[1]?.title === 'Renamed in v3')), 'after Sync now the subject shows version 3');

  console.log('— a download that fails is reported, the saved copy still works');
  srv.state.kv[uid]['a:packmeta:cellbio'] = { value: JSON.stringify({ ...v3.subject, counts: v2.counts, version: 'v4', updatedAt: new Date().toISOString() }), updated_at: new Date(Date.now() + 9000).toISOString() };
  delete srv.state.files[`${uid}/packs/cellbio.json`];   // e.g. the file is not reachable right now
  await p.goto(BASE + '/'); await wait(1200);
  await p.click('.noema-chip:has-text("Cell Biology")');
  ok(await until(() => p.locator('.toast').filter({ hasText: 'could not be downloaded' }).count()), 'a toast explains that the new version could not be downloaded');
  ok(await until(() => p.evaluate(() => SUBJ.id === 'cellbio' && COURSE[1]?.title === 'Renamed in v3')), 'and the saved copy (v3) still opens');

  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
