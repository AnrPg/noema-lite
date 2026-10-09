/* 🌍 Language courses across devices (docs/SYNC.md, docs/LANGUAGES.md §5.6): two browsers on one cloud account (mock Supabase).
   Progress made on one device reaches the other; two copies changed on both sides are combined (nothing is lost); an open
   course folds in what another device changed, so its next save keeps both.
   Usage: node tests/lang_sync.js <prepared-repo-dir>   (built with tools/build.py site) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const COURSE = 'polyglot-semitic-zh-de', PORT = 54333, URL = `http://localhost:${PORT}/`;

(async () => {
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', supabaseUrl: 'http://localhost:${PORT}', supabaseKey: 'sb_publishable_test', autoBackupMinutes: 0, askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const browser = await chromium.launch();
  const noFonts = ctx => ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const E = [];
  const device = async (vp, signup) => {
    const ctx = await browser.newContext({ viewport: vp }); await noFonts(ctx); const p = await ctx.newPage(); p.on('pageerror', e => E.push(e.message));
    await p.goto(URL); await wait(700);
    await p.click('text=Sign in / create a cloud account'); await wait(300);
    if (signup) { await p.click('text=No account yet? Create one'); await wait(200); await p.fill('input[placeholder="Display name"]', 'Polyglot'); }
    await p.fill('input[type=email]', 'poly@example.com'); await p.fill('input[type=password]', 'secret123');
    await p.click(signup ? 'button:has-text("Create account")' : 'button:has-text("Sign in")'); await wait(1200);
    if (await p.isVisible('.noema-inuse')) { await p.click('.noema-inuse button:has-text("Use here")'); await wait(1000); }
    return { ctx, p };
  };
  const open = async p => { const acc = await p.evaluate(() => window.ACCOUNT?.id || Object.keys(localStorage).map(k => k.split(':')[1]).find(Boolean));
    await p.goto(URL + '?account=' + encodeURIComponent(acc) + '&subject=lang:' + COURSE); await wait(1500);
    if (await p.isVisible('.noema-inuse')) { await p.click('.noema-inuse button:has-text("Use here")'); await wait(1000); } };
  const rows = () => { const uid = Object.keys(srv.state.users)[0]; return srv.state.kv[uid] || {}; };
  const flush = async p => { await p.evaluate(async () => { NoemaLangUI.save(true); const acc = NoemaLangUI.UI.acc; await NoemaCloud.push(acc); }); await wait(300); };

  // ---------- device A learns ----------
  const A = await device({ width: 1280, height: 900 }, true); await open(A.p);
  ok(await A.p.evaluate(() => !!window.NoemaLangUI?.UI?.C), 'device A opens the language course from its cloud account');
  const W = await A.p.evaluate(() => { const U = NoemaLangUI.UI, X = U.C.lang.ar, ids = Object.keys(X.lex).filter(id => X.lex[id].node === Object.values(X.lex)[0].node).slice(0, 3); return { ids, node: X.lex[ids[0]].node }; });
  await A.p.evaluate(ids => { const U = NoemaLangUI.UI, N = NoemaLang; N.review(U.C, U.L, 'ar', ids[0], 'r', true, U.day); N.review(U.C, U.L, 'ar', ids[0], 'p', true, U.day);
    N.practiceFunction(U.C, U.L, 'ar', 'fn.definite', 4, 5, U.day); }, W.ids);
  await flush(A.p);
  const KEY = `s:lang:${COURSE}:lang:ar:node:${W.node}`, FKEY = `s:lang:${COURSE}:lang:ar:fn:fn.definite`;
  const r1 = rows()[KEY] && JSON.parse(rows()[KEY].value);
  ok(!!r1?.items?.[W.ids[0]]?.r && !!r1.items[W.ids[0]].p, 'the word answered on device A reaches the cloud (s:lang:<course>:lang:ar:node:<node>)');
  ok(!!rows()[FKEY], 'the grammar practice reaches the cloud too (…:fn:<function>)');

  // ---------- device B continues ----------
  const B = await device({ width: 390, height: 844 }, false); await open(B.p);
  ok(await B.p.evaluate(id => !!NoemaLangUI.UI.L.langs.ar.items[id]?.p, W.ids[0]), 'device B (phone) starts with device A\'s progress');
  ok(await A.p.evaluate(() => NoemaCloud.lease.check()) === 'other', 'device A waits while device B is in use');

  // ---------- the combining rules (the same as the cloud uses) ----------
  const m = await B.p.evaluate(({ KEY, FKEY }) => {
    const mv = (k, a, b) => JSON.parse(NoemaCloud.mergeValue(k, JSON.stringify(a), JSON.stringify(b), false).value);
    const t = (last, reps) => ({ reps, ivl: reps, ease: 2.5, lapses: 0, streak: reps, due: last + reps, last });
    const n = mv(KEY, { items: { x: { seen: 5, r: t(9, 3) }, y: { seen: 4, r: t(4, 1) } }, check: { day: 3, score: 0.9, best: 0.9, tries: 2 } },
      { items: { x: { seen: 3, r: t(7, 2), p: t(8, 1) }, z: { seen: 6 } }, check: { day: 5, score: 0.5, best: 0.6, tries: 3 } });
    const f = mv(FKEY, { log: [{ day: 1, c: 4, n: 5 }, { day: 3, c: 2, n: 2 }] }, { log: [{ day: 2, c: 1, n: 3 }, { day: 3, c: 5, n: 6 }] });
    const s = mv(KEY.replace(/lang:ar:node:.*/, 'settings'), { languages: ['ar', 'he'], batch: 8 }, { languages: ['ar'], knows: [{ code: 'el', level: 'native' }] });
    return { n, f, s };
  }, { KEY, FKEY });
  ok(Object.keys(m.n.items).sort().join() === 'x,y,z', 'combining a node: the words of both copies are kept');
  ok(m.n.items.x.r.last === 9 && m.n.items.x.p?.last === 8 && m.n.items.x.seen === 3, '… per word and track the later review wins; first seen = the earlier day');
  ok(m.n.check.best === 0.9 && m.n.check.tries === 3 && m.n.check.day === 5, '… a lesson check keeps the best score and the most tries');
  ok(m.f.log.map(e => e.day).join() === '1,2,3' && m.f.log[2].n === 6, 'combining a grammar function: every day of both logs (the fuller entry of a day)');
  ok(m.s.knows?.[0]?.code === 'el' && m.s.batch === 8, 'settings: every field of both copies');

  // ---------- an open course takes in what another device changed ----------
  await B.p.evaluate(ids => { const U = NoemaLangUI.UI; NoemaLang.review(U.C, U.L, 'ar', ids[1], 'r', true, U.day); }, W.ids);   // B answers word 2 (not saved yet)
  { const row = rows()[KEY], v = JSON.parse(row.value); v.items[W.ids[2]] = { seen: 1, r: { reps: 1, ivl: 1, ease: 2.5, lapses: 0, streak: 1, due: 2, last: 1 } };   // meanwhile another device (an offline tablet) answered word 3
    rows()[KEY] = { value: JSON.stringify(v), updated_at: new Date(Date.now() + 1000).toISOString() }; }
  await B.p.evaluate(() => NoemaCloud.pull(NoemaLangUI.UI.acc)); await wait(600);
  ok(await B.p.evaluate(ids => { const it = NoemaLangUI.UI.L.langs.ar.items; return !!it[ids[1]]?.r && !!it[ids[2]]?.r && !!it[ids[0]]?.p; }, W.ids) && await B.p.evaluate(() => NoemaLangUI.UI.remoteFolds >= 1),
    'the open course folds in the other device\'s answers and keeps its own unsaved one');
  await flush(B.p);
  const r2 = JSON.parse(rows()[KEY].value);
  ok([0, 1, 2].every(i => r2.items[W.ids[i]]?.r), '… so its next save keeps all three words in the cloud');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close?.();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
