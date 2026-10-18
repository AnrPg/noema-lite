/* D29: a language has its own home at #/lang/<code> (never a lesson), the strip of your languages is on every language page,
   a word shows the other languages folded under it, grammar cards carry their aspect, the library lists the sides by aspect.
   Usage: node tests/lang_home.js [prepared-repo-dir]   (needs a built repo: python3 tools/build.py) */
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let chromium; try { ({ chromium } = require(process.env.PW || 'playwright')); } catch (e) { console.log('  (playwright not installed — skipped)'); return; }
  const url = 'file://' + ROOT + '/index.html', COURSE = 'polyglot-semitic-zh-de';
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const p = await ctx.newPage(), E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(url); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'berry', lang: 'en', studyLangs: ['ar', 'he', 'zh', 'de'] })); });
  await p.goto(url + '?account=anr#/lang/he'); await p.waitForSelector('.lx-lhhead', { timeout: 25000 }).catch(() => { }); await wait(500);
  const q = sel => p.locator(sel).count();
  ok(await q('.lx-lhhead[data-lang=he]') === 1 && (await p.evaluate(() => location.hash)) === '#/lang/he', 'a tap on Hebrew: its own home at #/lang/he, the course id is not in the address');
  ok(await q('.lx-lhgo .lx-continue, .lx-lhgo [data-go]') >= 1 && await q('.lx-lhpath .lx-lhstep') >= 3 && await q('.lx-lhlib .lx-lhtile[data-view=grammar]') === 1 && await q('.lx-lhtile[data-view=aspects]') === 1, 'the home has Continue, the path and the library (with grammar and by-aspect)');
  ok(await q('.lx-allchip') === 1 && await q('.lx-flagchip.on') >= 1, 'the strip: All + a chip per language, the current one marked');
  ok(await q('.lx-prodlanes') === 0, 'no leftover lane rows under the home');
  await p.click('.lx-lhtile[data-view=listen]'); await wait(600);
  ok(/^#\/lang\/he\/listen\/he/.test(await p.evaluate(() => location.hash)), 'a library tile keeps the language in the address');
  await p.click('.lx-flagchip:not(.lx-allchip) >> nth=0'); await wait(900);
  ok(/^#\/lang\/ar\/listen/.test(await p.evaluate(() => location.hash)), 'a chip switches the language and keeps the same page');
  await p.click('.lx-allchip'); await wait(1500);
  ok(/^#\/lang\/[^/]*polyglot/.test(await p.evaluate(() => location.hash)), 'All: the combined course');
  await p.goto(url + '?account=anr#/lang/he/aspects/he'); await p.waitForSelector('.lx-asp', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-asp[data-aspect=morphology]') === 1 && await q('.lx-asp[data-aspect=syntax]') === 1 && await q('.lx-asp[data-aspect=writing]') === 1, 'by aspect: morphology, syntax, writing … each a labelled section');
  await p.goto(url + '?account=anr#/lang/he/c/person.teacher'); await p.waitForSelector('.lx-others', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-others') === 1 && await q('.lx-fulltable') === 1, 'a word: “In other languages” folded, with the full-table link');
  await p.goto(url + '?account=anr#/lang/he/fn/fn.agreement/he'); await p.waitForSelector('.lx-gram', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-gram.lx-asp .lx-asplabel') >= 1, 'a grammar card carries its aspect label');
  ok(!E.length, 'no page errors' + (E.length ? ': ' + E[0] : ''));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
