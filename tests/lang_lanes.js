/* ⫴ Parallel lanes (docs/LANGUAGES.md §9.2, D13): the layout keeps the same subject on one level in every language, a step of
   one language alone fills the gap beside the others; the view in a browser (classic screens) with a tap on a step.
   Usage: node tests/lang_lanes.js <prepared-repo-dir> */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const N = require(path.join(ROOT, 'engine', 'langcore.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const load = dir => { const rd = r => { try { return JSON.parse(fs.readFileSync(path.join(dir, r), 'utf8')); } catch (e) { return null; } };
  const ls = r => { try { return fs.readdirSync(path.join(dir, r)).filter(f => f.endsWith('.json')).sort(); } catch (e) { return []; } }; return N.course(N.readCourse(rd, ls)); };
console.log('— the layout');
const M = load(path.join(ROOT, 'tests', 'fixtures', 'lang-mini')), LM = N.parallelLanes(M);
const rowOf = (L, c, nid) => L.rows.findIndex(r => r.cells[c] === nid);
const common = M.order.filter(nid => M.languages.filter(c => M.lang[c].applies[nid]).length > 1);
ok(common.every(nid => new Set(M.languages.filter(c => M.lang[c].applies[nid]).map(c => rowOf(LM, c, nid))).size === 1), 'mini: every shared step sits on ONE level in all its languages');
const only = M.order.find(nid => M.languages.filter(c => M.lang[c].applies[nid]).length === 1);
const oc = M.languages.find(c => M.lang[c].applies[only]), r = rowOf(LM, oc, only);
ok(!!only && Object.keys(LM.rows[r].cells).length === 1 && LM.rows[r].cells[oc] === only, `mini: ${only} (only ${oc}) has a level of its own, the other lanes run on beside it`);
ok(M.languages.every(c => { const rs = M.order.filter(n => M.lang[c].applies[n]).map(n => rowOf(LM, c, n)); return rs.every((x, i) => !i || x > rs[i - 1]); }), 'mini: in every lane the steps keep the course order');
// a made-up split: Chinese skips one lesson, German and Chinese share one the others skip, one step for Hebrew alone
const P = load(path.join(ROOT, 'library', 'languages', 'polyglot-semitic-zh-de'));
P.lang.zh.applies['fd.04'] = false; P.lang.ar.applies['fd.09'] = false; P.lang.he.applies['fd.09'] = false;
const LP = N.parallelLanes(P);
ok(rowOf(LP, 'ar', 'fd.05') === rowOf(LP, 'zh', 'fd.05') && rowOf(LP, 'zh', 'fd.04') === -1 && rowOf(LP, 'ar', 'fd.04') + 1 === rowOf(LP, 'ar', 'fd.05'), 'a lane that skips a step waits beside it: the next shared step is level again');
ok(rowOf(LP, 'de', 'fd.09') === rowOf(LP, 'zh', 'fd.09') && rowOf(LP, 'ar', 'fd.10') === rowOf(LP, 'de', 'fd.10'), 'a step of two languages: level in both; the next shared step level in all four');
const secs = [...new Set(LP.rows.map(r => r.section))];
ok(secs[0] === 'foundations' && secs.includes('core') && secs.some(s => s.startsWith('field:')), 'the parts of the course in order: ' + secs.join(' → '));

(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed — the browser part is skipped)'); return end(); }
  console.log('— the view');
  const b = await chromium.launch(), E = [];
  for (const [w, hh] of [[1280, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hh } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const p = await ctx.newPage(); p.on('pageerror', e => E.push(e.message)); const url = 'file://' + ROOT + '/index.html';
    await p.goto(url); await p.evaluate(() => localStorage.clear());
    await p.goto(url + '?account=anr&subject=lang:polyglot-semitic-zh-de'); await p.waitForFunction(() => window.NoemaLangUI?.UI?.C && document.querySelector('.lx-view'), null, { timeout: 60000 }); await wait(400);
    const btn = p.locator('.lx-tolanes:visible'); ok(await btn.count() === 1, `${w}px: ⫴ Parallel lanes next to the map`);
    await btn.click(); await p.waitForSelector('.lx-lanes2', { timeout: 20000 }); await wait(200);
    const g = await p.evaluate(() => { const rows = [...document.querySelectorAll('.lx-lrow')], cols = getComputedStyle(rows[0]).gridTemplateColumns.split(' ').length;
      const x = rows.slice(0, 5).map(r => [...r.querySelectorAll('.lx-lnode')].map(n => Math.round(n.getBoundingClientRect().top)));
      return { rows: rows.length, cols, level: x.every(t => new Set(t).size === 1), heads: document.querySelectorAll('.lx-lflag').length }; });
    ok(g.cols === 4 && g.heads === 4 && g.level && g.rows === 72, `${w}px: four lanes, the same step level across them (${g.rows} levels)`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, `${w}px: nothing scrolls sideways`);
    await p.locator('.lx-lnode[data-lang="zh"]').nth(2).click(); await wait(300);
    const info = await p.evaluate(() => (document.querySelector('.lx-linfo') || document.querySelector('.ns-sheet') || {}).innerText || '');
    ok(/Chinese/.test(info) && /Also in/.test(info) && /Open/.test(info), `${w}px: a tap on a step tells what it is there and where else it is`);
    // dots: chosen, or automatic when the lanes are too narrow for tiles; hover / focus tells more, a tap opens the step
    await p.evaluate(() => document.querySelector('.lx-pop')?.remove()); await p.click('.lx-lviewpick button:has-text("Dots")'); await wait(300);
    ok(await p.locator('.lx-ldot').count() > 200 && await p.locator('.lx-lnode').count() === 0 && /^S\d+$/.test(await p.locator('.lx-ldot').first().innerText()), `${w}px: Dots — small round steps with their code (S0, S1 …)`);
    await p.locator('.lx-ldot[data-lang="he"]').nth(3).hover(); await wait(200);
    ok(/Hebrew/.test(await p.locator('.lx-lhover').innerText().catch(() => '')), `${w}px: pointing at a dot tells what it is`);
    await p.locator('.lx-ldot[data-lang="he"]').nth(3).click(); await wait(300);
    ok(/Also in/.test(await p.evaluate(() => (document.querySelector('.lx-linfo') || document.querySelector('.ns-sheet') || {}).innerText || '')), `${w}px: a tap on a dot opens its card`);
    await p.evaluate(() => document.querySelector('.lx-pop')?.remove());
    await p.click('.lx-lviewpick button:has-text("Auto")'); await wait(300);
    await ctx.close();
  }
  { // Auto: dots when a lane would be narrower than a tile
    const ctx = await b.newContext({ viewport: { width: 320, height: 700 } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const p = await ctx.newPage(); p.on('pageerror', e => E.push(e.message)); const url = 'file://' + ROOT + '/index.html';
    await p.goto(url); await p.evaluate(() => localStorage.clear());
    await p.goto(url + '?account=anr&subject=lang:polyglot-semitic-zh-de#/lanes'); await p.waitForSelector('.lx-lanes2', { timeout: 60000 }); await wait(300);
    ok(await p.locator('.lx-lanes2.lx-ldots').count() === 1 && await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, '320px, Auto: four lanes do not fit as tiles → dots, nothing scrolls sideways');
    await ctx.close();
  }
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await b.close(); end();
})();
function end() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
