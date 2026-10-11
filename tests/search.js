/* The search (engine/search.js, engine/catalog.js, docs/SEARCH.md), Playwright + Chromium, in the new frame:
     A. 🔎 in the top bar (and / or Ctrl K): the quick sheet, results grouped by kind, Knowledge or Languages on each
     B. #/search: its own page and address, kind chips, filters, “here” as a scope, exact matches on top
     C. stable addresses: a theory block, a trap and a single flashcard open where they are, highlighted
     D. conversations: their own group, with the style and where they began (exercise n of chapter c)
     E. collections (saved searches) and “Practise these results”: a round, step after step
     F. Greek words
   Usage: node tests/search.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
function errs(page, bag) { page.on('pageerror', e => bag.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/net::ERR|404|Failed to load resource/.test(m.text())) bag.push(m.text()); }); }
const texts = (page, sel) => page.$$eval(sel, l => l.map(x => x.textContent.trim()));
const ready = async page => { await wait(600); return until(() => page.evaluate(() => { const I = NoemaSearch.index(); return !I.state.busy && I.records().length > 0; }), 60000, 300); };

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const E = []; errs(page, E);
  let answer = null; page.on('dialog', d => d.type() === 'prompt' || d.type() === 'confirm' ? d.accept(answer ?? undefined) : d.dismiss());

  await page.goto(url); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  await until(() => page.$('.ns-onb [data-pick="know"]'));
  await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);

  console.log('A. the quick sheet');
  ok(await page.$('#ns-find'), 'a magnifier in the top bar');
  await page.keyboard.press('/'); ok(await until(() => page.$('.ns-srsheet .ns-srin'), 5000), '“/” opens the search sheet');
  await page.keyboard.press('Escape'); await wait(300);
  await page.click('#ns-find'); await page.waitForSelector('.ns-srsheet .ns-srin');
  ok(await ready(page), 'the index is built in the background, place by place');
  await page.fill('.ns-srsheet .ns-srin', 'kinetic'); await wait(500);
  const qg = await page.$$eval('.ns-srquick .ns-srgrp', l => l.map(s => s.dataset.ty || 'exact'));
  ok(qg.length >= 2 && qg.includes('theory'), 'results grouped by kind: ' + qg.join(', '));
  ok(await page.$$eval('.ns-srquick .ns-sr .ns-srw', l => l.length && l.every(x => /Knowledge/.test(x.textContent))), 'each result says Knowledge');
  ok(await page.$eval('.ns-srquick .ns-sr[data-ty="theory"] mark', m => /kinetic/i.test(m.textContent) && m.parentElement.textContent.length > m.textContent.length + 10), 'a snippet: the word marked, with a little before and after');
  await page.screenshot({ path: SHOTS + '/sr_a_quick.png' });
  await page.press('.ns-srsheet .ns-srin', 'Enter'); await wait(800);
  ok((await page.evaluate(() => location.hash)).startsWith('#/search?q=kinetic'), 'Enter opens the search page, with its own address');

  console.log('B. the page');
  await until(() => page.$('.ns-searchview .ns-srchip'));
  const chips = await page.$$eval('.ns-srchip', l => l.map(x => x.dataset.ty));
  ok(chips[0] === 'all' && chips.includes('theory'), 'kind chips with counts: ' + chips.join(', '));
  await page.click('.ns-srchip[data-ty="theory"]'); await wait(400);
  ok((await page.evaluate(() => location.hash)).includes('t=theory') && await page.$$eval('.ns-srout .ns-sr', l => l.length && l.every(x => x.dataset.ty === 'theory' || x.closest('.ns-srexact'))), 'a chip filters the kinds; the address keeps it');
  ok(await page.$eval('.ns-srfilters', f => f.hidden) , 'filters are folded under “Filters ▾”');
  await page.click('.ns-srfilt'); await wait(200);
  ok(await page.$eval('.ns-srfilters', f => !f.hidden && f.textContent.includes('Not read yet')), 'filters: status (unread, unsolved, wrong)');
  await page.goto(url + '#/search?q=squared%20velocity'); await page.reload(); await ready(page); await until(() => page.$('.ns-srexact'), 8000);
  ok(await page.$('.ns-srexact .ns-sr[data-ty="trap"]'), 'an exact title goes on top: the trap “Squared velocity”');
  await page.screenshot({ path: SHOTS + '/sr_b_page.png', fullPage: true });

  console.log('C. stable addresses');
  await page.click('.ns-srexact .ns-sr[data-ty="trap"]');
  ok(await until(() => page.evaluate(() => /^#\/ch\/ch01\/traps\/p/.test(location.hash) && document.querySelector('[data-pid].ns-hit'))), 'a trap opens in its chapter’s Traps, highlighted: ' + await page.evaluate(() => location.hash));
  await page.goto(url + '#/search?q=kinetic&t=theory'); await page.reload(); await ready(page); await until(() => page.$('.ns-sr[data-ty="theory"]'), 8000);
  await page.click('.ns-sr[data-ty="theory"]');
  ok(await until(() => page.evaluate(() => /^#\/s\/ch01-s01\/b/.test(location.hash) && document.querySelector('[data-bid].ns-hit'))), 'a theory block opens in its section, scrolled to and highlighted');
  await page.goto(url + '#/search?q=formula%20for&t=card'); await page.reload(); await ready(page); await until(() => page.$('.ns-sr[data-ty="card"]'), 8000);
  await page.click('.ns-sr[data-ty="card"]');
  ok(await until(() => page.evaluate(() => location.hash === '#/cards/ch01-f001' && document.body.textContent.includes('Formula for'))), 'a flashcard opens alone, by its id');

  console.log('D. conversations');
  await page.evaluate(async () => { await NoemaConvos.put(Noema.account.id, { id: 'cv_0000000001aaaaaa', kind: 'tutor', mode: 'explain', title: 'Why squared?', subject: { id: 'demo-physics', title: 'Demo Physics' },
    context: { type: 'exercise', id: 'ch01-e001', label: 'Exercise', origin: { via: 'explainDifferently', ex: 'ch01-e001' } }, messages: [{ role: 'user', content: 'why is the velocity squared in kinetic energy?' }, { role: 'assistant', content: 'Because work adds up over distance.' }] }); });
  await page.goto(url + '#/search?q=velocity%20squared'); await page.reload(); await ready(page);
  await until(() => page.evaluate(() => NoemaSearch.index().records().some(r => r.ty === 'convo')), 20000);
  ok(await until(() => page.$('.ns-srgrp[data-ty="convo"] .ns-sr, .ns-srexact .ns-sr[data-ty="convo"]'), 10000), 'conversations are their own group');
  const via = await page.$eval('.ns-sr[data-ty="convo"] .ns-srvia', x => x.textContent).catch(() => '');
  ok(/Explain/i.test(via) && via.includes('“Explain differently”') && /exercise 1 of chapter 1/.test(via), 'with the style and where it began: ' + via);
  await page.click('.ns-sr[data-ty="convo"]');
  ok(await until(() => page.$('.drawer.open, .ns-convos, .ns-sheet'), 8000), 'a conversation opens');

  console.log('E. collections and the practice round');
  await page.goto(url + '#/search?q=energy'); await page.reload(); await ready(page); await until(() => page.$('.ns-srsave'), 8000);
  answer = 'Energy things'; await page.click('.ns-srsave'); await wait(500);
  ok(await page.evaluate(() => NoemaSearch.collections().some(c => c.name === 'Energy things' && c.p.q === 'energy')) && (await page.evaluate(() => location.hash)).includes('c=q'), 'save the search as a collection (kept with the account)');
  await page.goto(url + '#/search'); await page.reload(); await until(() => page.$('.ns-srcols'), 8000);
  ok((await texts(page, '.ns-srcols .ns-item b')).includes('Energy things'), 'the empty page lists the collections');
  ok(await page.$('.ns-srrecent'), '… and recent searches on this device');
  await page.click('.ns-srcols .ns-menubtn'); await page.waitForSelector('.ns-pop');
  answer = 'Energy'; await page.locator('.ns-pop button', { hasText: 'Rename' }).first().click(); await wait(400);
  ok(await page.evaluate(() => NoemaSearch.collections()[0]?.name === 'Energy'), 'rename a collection');
  await page.goto(url + '#/search?q=E_k'); await page.reload(); await ready(page); await until(() => page.$('.ns-srpractise'), 8000);
  await page.click('.ns-srpractise');
  ok(await until(() => page.evaluate(() => location.hash === '#/srun' && NoemaSearch.round()?.steps?.length > 0), 15000), 'Practise these results: a round, its first step opens: ' + await page.evaluate(() => JSON.stringify(NoemaSearch.round()?.steps?.map(s => s.kind))));
  await page.screenshot({ path: SHOTS + '/sr_e_round.png' });
  ok(await until(() => page.$('.runner .runtop')), 'the exercises of the round open in the runner');
  ok(await page.evaluate(() => /Next|end/i.test(NoemaSearch.after()?.label || '')), 'each step knows the next one (or the end): ' + await page.evaluate(() => NoemaSearch.after()?.label));
  await page.evaluate(() => NoemaSearch.goStep(1)); await wait(1200);
  ok(await until(() => page.evaluate(() => location.hash === '#/srun' && NoemaSearch.round()?.i === 1 && document.body.textContent.includes('Formula for'))), 'the next step: the flashcards found');
  await page.evaluate(() => NoemaSearch.goStep(99)); await wait(800);
  ok(await page.evaluate(() => !NoemaSearch.round() && location.hash.startsWith('#/search?q=E_k')), 'the end of the round goes back to the results');
  await page.goto(url + '#/search'); await page.reload(); await until(() => page.$('.ns-srcols'), 8000);
  await page.click('.ns-srcols .ns-menubtn'); await page.waitForSelector('.ns-pop');
  await page.locator('.ns-pop button', { hasText: 'Delete' }).first().click(); await wait(400);
  ok(await page.evaluate(() => NoemaSearch.collections().length === 0), 'delete a collection');

  console.log('F. Greek');
  await page.evaluate(() => NoemaThemes.putSettings({ lang: 'el' })); await page.goto(url + '#/search?q=kinetic'); await page.reload(); await ready(page); await until(() => page.$('.ns-srchip'), 8000);
  ok(await page.$eval('.ns-srchip[data-ty="all"]', b => b.textContent.startsWith('Όλα')) && (await page.$eval('.ns-srfilt', b => b.textContent)).startsWith('Φίλτρα'), 'Greek words: ' + (await texts(page, '.ns-srchip')).join(' · '));
  ok(await page.$eval('.ns-sr .ns-srw', x => x.textContent.trim() === 'Γνώσεις'), 'Knowledge = Γνώσεις on each result');

  ok(!E.length, 'no page errors: ' + E.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
