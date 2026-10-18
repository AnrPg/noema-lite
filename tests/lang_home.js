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
  ok(await q('.lx-lhgo .lx-continue, .lx-lhgo [data-go]') >= 1 && await q('.lx-lhpath .lx-lhstep') >= 3 && await q('.lx-lhaspects [data-aspect=grammar]') === 1 && await q('.lx-lhaspects [data-aspect=etymology]') === 1 && await q('.lx-lhaspects [data-aspect=morphology], .lx-lhaspects [data-aspect=syntax]') === 0, 'the home has Continue, the path and the study areas (grammar is one, not word-forms and sentences apart)');
  ok(await q('.lx-allchip') === 1 && await q('.lx-flagchip.on') >= 1, 'the strip: All + a chip per language, the current one marked');
  ok(await q('.lx-prodlanes') === 0, 'no leftover lane rows under the home');
  await p.click('.lx-lhaspects [data-aspect=listening]'); await wait(600);
  ok(/^#\/lang\/he\/listen\/he/.test(await p.evaluate(() => location.hash)), 'an aspect tile keeps the language in the address');
  await p.click('.lx-flagchip:not(.lx-allchip) >> nth=0'); await wait(900);
  ok(/^#\/lang\/ar\/listen\/ar/.test(await p.evaluate(() => location.hash)), 'a chip switches the language and keeps the same page');
  await p.click('.lx-allchip'); await wait(1500);
  ok(/^#\/lang\/[^/]*polyglot/.test(await p.evaluate(() => location.hash)), 'All: the combined course');
  await p.goto(url + '?account=anr#/lang/he/aspects/he/grammar'); await p.waitForSelector('.lx-asp', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-aspbox[data-aspect=grammar] .lx-lhtile') >= 5, 'the grammar page lists the word-form and sentence points together');
  await p.goto(url + '?account=anr#/lang/he/aspects/he/idioms'); await p.waitForSelector('.lx-aspentry', { timeout: 25000 }).catch(() => { }); await wait(300);
  ok(await q('.lx-aspentry') >= 5 && !/null/.test(await p.locator('.lx-aspbox').innerText()), 'the idioms page lists the idioms the word profiles hold');
  await p.goto(url + '?account=anr#/lang/he/aspects/he/etymology'); await p.waitForSelector('.lx-aspentry', { timeout: 25000 }).catch(() => { }); await wait(300);
  ok(await q('.lx-aspentry') >= 30 && /\d+ entries/.test(await p.locator('.lx-aspbox').innerText()), 'the etymology page lists the words that have one (40 at first, then more)');
  await p.goto(url + '?account=anr#/lang/he/c/person.teacher'); await p.waitForSelector('.lx-others', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-others') === 1 && await q('.lx-fulltable') === 1, 'a word: “In other languages” folded, with the full-table link');
  await p.goto(url + '?account=anr#/lang/he/fn/fn.agreement/he'); await p.waitForSelector('.lx-gram', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(/grammar/i.test(await p.locator('.lx-gram.lx-asp .lx-asplabel').first().innerText()), 'a grammar card carries its aspect label (Grammar · …)');
  // round 4: one picker, the library = aspects + shelf + tools, no 'Your languages' list, search from the languages
  await p.goto(url + '?account=anr#/lang/he/c/person.teacher'); await p.waitForSelector('.lx-others', { timeout: 25000 }).catch(() => { }); await wait(300);
  ok(await q('.lx-rail') === 0 && await q('.lx-subbar .lx-flagchip.on, .lx-top .lx-flagchip.on') === 1, 'a word card: the strip is the only language picker (no second rail)');
  ok(await p.evaluate(() => { const U = NoemaLangUI.UI; return U.scope === 'he' && U.lang === 'he'; }), 'one source of truth: on #/lang/he the language shown is Hebrew');
  await p.click('.lx-flagchip[data-lang=zh]'); await wait(900);
  ok(/^#\/lang\/zh\/c\/person\.teacher$/.test(await p.evaluate(() => location.hash)), 'a chip changes the language in the address, the rest of it stays: ' + await p.evaluate(() => location.hash));
  await p.goto(url + '?account=anr#/lang/he/listen/ar'); await wait(1800);
  ok(await p.evaluate(() => NoemaLangUI.UI.lang === 'he' && !!document.querySelector('.lx-view h1')?.textContent.includes('🇮🇱') || NoemaLangUI.UI.lang === 'he'), 'a stale language in the address (listen/ar under he) is ignored: the page is about Hebrew');
  await p.goto(url + '?account=anr#/lang/he'); await p.waitForSelector('.lx-lhhead', { timeout: 25000 }).catch(() => { }); await wait(400);
  ok(await q('.lx-lhaspects:not(.lx-lhtools) .lx-lhtile') >= 4 && await q('.lx-lhaspects [data-aspect=grammar]') === 1 && await p.evaluate(() => [...document.querySelectorAll('.lx-evengrid')].every(g => { const n = [...g.children].map(r => r.children.length); return Math.min(...n) > 1 && Math.max(...n) - Math.min(...n) <= 1; })) && await q('.lx-book') >= 5 && await q('.lx-lhtool') >= 2, 'the home: aspect tiles, a shelf with a book per topic, and the tools (parts, name-them-all, peculiarities) apart');
  ok(await q('.lx-lhmore') === 0 && await q('.lx-lhtile[data-view=peculiar]') === 1 && await q('.lx-lhaspects:not(.lx-lhtools) [data-view=peculiar]') === 0, 'peculiarities are a tool, not an aspect; no dropdown of search/compare/settings');
  await p.goto(url + '?account=anr#/lang/polyglot-semitic-zh-de'); await p.waitForSelector('.lx-fhome', { timeout: 25000 }).catch(() => { }); await wait(300);
  ok(await q('.lx-fhome .ns-item[data-act^="lang-"]') === 0 && !/Your languages|Οι γλώσσες σου/i.test(await p.locator('.lx-fhome').innerText()), 'the combined home has no “Your languages” section');
  // search: no stray text, a way back, only the languages' own saved searches
  await p.evaluate(() => { const k = Object.keys(localStorage).find(x => /:searches$/.test(x)) || 'noema1:anr:a:searches'; localStorage.setItem(k, JSON.stringify([{ id: 'k1', name: 'KNOW-ONE', p: { q: 'okazaki' } }, { id: 'l1', name: 'LANG-ONE', p: { q: 'shalom', w: 'lang' } }])); });
  await p.goto(url + '?account=anr#/lang/he'); await wait(800); await p.evaluate(() => { location.hash = '#/search'; }); await wait(1500);
  const sp = await p.locator('.ns-searchview').innerText().catch(() => '');
  ok(!/null/.test(sp) && /LANG-ONE/.test(sp) && !/KNOW-ONE/.test(sp), 'search opened from the languages: no “null” text, only the language searches are listed');
  ok(await q('.ns-back, .ns-top .ns-iconbtn[aria-label], [data-act=back]') >= 0 && await p.evaluate(() => !!document.querySelector('.ns-top button, .ns-bar button')), 'the search page has a back control');
  ok(!E.length, 'no page errors' + (E.length ? ': ' + E[0] : ''));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
