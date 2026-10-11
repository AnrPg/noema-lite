/* Right-to-left interfaces and the scripts' fonts (docs/i18n.md §2 Fonts, §5), Playwright + Chromium, pseudo-locale ar-XB:
     A. <html dir lang data-ui-locale> follow the UI locale; the frame mirrors (tutor button, ← back), no sideways scrolling
     B. texts put into messages are bidi-isolated in RTL only; formulas and code stay left to right; a pack's English reads LTR
     C. fonts: fonts/scripts.css is linked, nothing is asked from Google Fonts, an Arabic word loads the self-hosted Noto
     E. a pack's text (exercise prompts and options, Roadmap and Shelf titles, crumbs, flashcards, chat bubbles, the course's
        explanations) keeps its own direction, the interface's words do not; arrows written into texts point along the
        reading direction; at 1280 px the rail stands at the right and the tutor panel slides in from the left
     D. the CJK subsets cover every Han character of the zh-Hans / zh-Hant / ja catalogs (a warning: re-run tools/fonts_subset.py)
   Usage: node tests/i18n_rtl.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), glob = d => fs.readdirSync(d, { recursive: true }).map(f => path.join(d, f));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(200); } return false; };
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
const bidi = (page, sel) => page.$eval(sel, e => getComputedStyle(e).unicodeBidi).catch(() => null);
// where a text's characters land: is its last '?' / '.' drawn right of its first letter (= read left to right)?
const endsRight = (page, sel) => page.$eval(sel, e => {
  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n, tn = null; while ((n = w.nextNode())) if (/[A-Za-z].*[?.!]\s*$/.test(n.textContent)) { tn = n; break; }
  if (!tn) return null; const s = tn.textContent, r = document.createRange(), at = i => { r.setStart(tn, i); r.setEnd(tn, i + 1); return r.getBoundingClientRect().left; };
  return at(s.search(/[A-Za-z]/)) < at(s.search(/[?.!]\s*$/)); }).catch(() => null);
const rect = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth }; }).catch(() => null);
const seedRoadmap = page => page.evaluate(() => {   // a Roadmap whose steps' titles end in punctuation (as in tests/shell.js D)
  const C = NoemaCurriculum, c = C.blank({ goal: 'Data engineering?', language: 'en', provider: 'auto', prefetch: 0 });
  const mk = (id, title, role) => ({ id, title, summary: title, role, part: C.PART[role], learningGoals: ['Explain ' + id + '.'], plannedAt: '2026-01-01T00:00:00.000Z', chapters: [1, 2].map(i => ({ ref: 'c' + i, title: `${title} ${i}`, goals: ['g'], coverage: ['t'] })) });
  c.nodes = { a: mk('a', 'Python basics?', 'foundation'), b: mk('b', 'Spark DataFrames.', 'aspect') }; c.edges = [{ from: 'a', to: 'b' }];
  c.goalId = 'b'; c.paths = { minimal: [], deep: C.order(c) }; c.title = 'Data engineer?'; c.status = 'ready'; C.save(Noema.account.id, c); });

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const asked = []; await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => { asked.push(r.request().url()); r.fulfill({ status: 200, body: '' }); });
  await ctx.addInitScript(() => {   // the pseudo-locales on, whatever config.js says
    let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = v; if (c) c.pseudoLocales = true; } });
  });
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const fontsLoaded = []; page.on('request', r => { if (/\/fonts\/noto-/.test(r.url())) fontsLoaded.push(r.url().split('/fonts/')[1]); });
  const boot = async (lang, hash = '') => {
    await page.goto(url);
    await page.evaluate(l => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:current', JSON.stringify({ acc: 'anr' })); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl', lang: l })); }, lang);
    await page.goto(url + '?account=anr' + hash); await until(() => page.$('.ns-hello'));
  };

  console.log('A. the page follows the locale');
  await boot('ar-XB');
  const root = await page.evaluate(() => ({ dir: document.documentElement.dir, loc: document.documentElement.dataset.uiLocale }));
  ok(root.dir === 'rtl' && root.loc === 'ar-XB', '<html dir="rtl" data-ui-locale="ar-XB">: ' + JSON.stringify(root));
  ok(await noHScroll(page), 'Today: no sideways scrolling');
  const fab = await page.$eval('#ns-fab', b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2 < innerWidth / 2; }).catch(() => null);
  ok(fab === true, 'the tutor button sits on the left (inset-inline-end)');
  await page.goto(url + '#/me'); await wait(600);
  ok(await noHScroll(page), 'Me: no sideways scrolling');
  const back = await page.$eval('.ns-back', b => getComputedStyle(b).scale).catch(() => null);
  ok(back === '-1 1', '← back is mirrored: scale ' + back);
  await page.goto(url + '#/me/data'); await wait(800); await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); await wait(300);
  ok(await noHScroll(page), 'Me › Data: no sideways scrolling (the hidden ⓘ tooltips take no room)');
  await page.goto(url + '#/lang/polyglot-semitic-zh-de'); await page.waitForSelector('.lx-host .lx-main .lx-view', { timeout: 30000 }).catch(() => {}); await wait(800);
  ok(await noHScroll(page), 'the language course home: no sideways scrolling');
  await page.evaluate(() => { location.hash = '#/lang/polyglot-semitic-zh-de/fn/fn.plural.noun/ar'; }); await until(() => page.$('article.lx-card p'));
  ok(await bidi(page, 'article.lx-card p') === 'plaintext', 'the course’s explanations (article.lx-card p) keep their own direction');

  console.log('B. bidi isolation, LTR islands');
  const iso = await page.evaluate(() => [NoemaI18n.t('sh.rmPubMeta', { who: 'ANR', n: 2, p: 1 }), NoemaI18n.t('sh.rmPubMeta', { who: 'ANR', n: 2, p: 1 }, 'en')]);
  ok(iso[0].includes('⁨ANR⁩') && !iso[1].includes('⁨'), 'a name in a message is isolated (FSI…PDI) in RTL, untouched in English');
  const css = await page.evaluate(() => { const k = document.createElement('span'); k.className = 'katex'; const c = document.createElement('code'); const p = document.createElement('div'); p.className = 'blk'; document.body.append(k, c, p);
    const r = [getComputedStyle(k).direction, getComputedStyle(c).direction, getComputedStyle(p).unicodeBidi]; k.remove(); c.remove(); p.remove(); return r; });
  ok(css[0] === 'ltr' && css[1] === 'ltr' && css[2] === 'plaintext', 'formulas and code stay LTR, a pack’s paragraphs find their own direction: ' + css.join(' · '));

  console.log('C. self-hosted fonts');
  ok(await page.$('link[href="fonts/scripts.css"]') && !(await page.$('link[data-lx-fonts]')), 'fonts/scripts.css is linked; the course no longer links Google Fonts');
  await page.evaluate(() => document.fonts.load('16px "Noto Naskh Arabic"', 'العربية')); await wait(500);
  ok(fontsLoaded.some(f => f.startsWith('noto-naskh-arabic/')) && !fontsLoaded.some(f => /noto-sans-(jp|tc)/.test(f)), 'Arabic course text loads the self-hosted Naskh, no Japanese or Traditional slices: ' + [...new Set(fontsLoaded)].join(', '));
  ok(asked.length === 0, 'nothing asked from Google Fonts: ' + asked.length);

  console.log('E. a pack’s text keeps its own direction; arrows written into texts and the wide frame mirror');
  await boot('ar-XB'); await seedRoadmap(page);
  await page.evaluate(() => { location.hash = '#/learn'; }); await until(() => page.$('.ns-rmcard')); await page.click('.ns-rmcard'); await until(() => page.$('.cm-node[data-id="a"]'));
  ok(await endsRight(page, '.cm-title b') === true, 'a Roadmap’s title “Data engineer?” reads left to right (the ? at its end)');
  await page.click('.cm-node[data-id="a"]'); await until(() => page.$('.cm-ptitle h3'));
  ok(await endsRight(page, '.cm-ptitle h3') === true && await bidi(page, '.cm-pre>.cm-names') === 'plaintext', 'a step’s title in its panel and the names of the steps it opens keep their direction');
  await page.click('.cm-vbtn[data-list="true"]').catch(() => {}); await until(() => page.$('.cm-listnode'));
  ok(await bidi(page, '.cm-listnode .cm-t>b') === 'plaintext', 'the Roadmap as a list: the steps’ titles keep their direction');
  await page.evaluate(() => { location.hash = '#/shelf'; }); await until(() => page.$('[data-subject="demo-physics"]'));
  ok(await bidi(page, '.ns-item b') === 'plaintext', 'the Shelf: the subjects’ titles keep their direction');
  await page.click('[data-subject="demo-physics"]'); await until(() => page.evaluate(() => typeof ALL_EX !== 'undefined' && !!document.querySelector('.ns-top')));
  await page.evaluate(() => { location.hash = '#/ex/ch01-e003'; }); await until(() => page.$('.ex .q'));
  ok(await endsRight(page, '.ex .q') === true, 'an exercise’s prompt “Unit of energy?” reads left to right (not “?Unit of energy”)');
  ok(await bidi(page, '.ex .opt>span:not(.k)') === 'plaintext' && await bidi(page, '.ex .exhead .pill') !== 'plaintext' && await bidi(page, '.ns-tab .lb') !== 'plaintext',
    'its options keep their own direction; the interface’s words (type pill, tabs) are not turned by their first letter');
  ok(await bidi(page, '.ns-crumbs b') === 'plaintext', 'the crumbs: the pack’s titles keep their direction');
  await page.evaluate(() => { location.hash = '#/s/' + COURSE[0].sections[0].id; }); await until(() => page.$('.secnext .nx'));
  const nx = await page.$eval('.secnext .nx', b => b.textContent).catch(() => '');
  ok(/←$/.test(nx) && !/→/.test(nx), 'an arrow in a button’s text points along the reading direction (“… ←”): ' + nx);
  await page.evaluate(() => { location.hash = '#/cards'; }); await until(() => page.$('.flash .face>div'));
  ok(await bidi(page, '.flash .face>div:not(.tiny)') === 'plaintext', 'a flashcard’s text keeps its direction');
  await page.evaluate(() => { location.hash = '#/s/' + COURSE[0].sections[0].id; }); await until(() => page.$('.secnext'));
  await page.setViewportSize({ width: 1280, height: 900 }); await wait(400);
  const rail = await rect(page, '.ns-tabs'), fabW = await rect(page, '#ns-fab'), shut = await rect(page, '.drawer');
  ok(rail && rail.l > rail.w / 2 && rail.r >= rail.w - 1, '1280 px: the rail (tabs) stands at the right: ' + JSON.stringify(rail));
  ok(fabW && fabW.r < fabW.w / 2 && shut && shut.r <= 0, '1280 px: the tutor button at the left, the closed tutor panel out of sight at the left: ' + JSON.stringify([fabW, shut]));
  await page.click('#ns-fab'); await until(() => page.$('.drawer.open')); await wait(600);
  const opened = await rect(page, '.drawer.open');
  ok(opened && opened.l <= 1 && opened.r < opened.w / 2, '1280 px: the tutor panel slides in from the left: ' + JSON.stringify(opened));
  await page.fill('.drawer textarea', 'Why is energy conserved?'); await page.click('.drawer .send'); await until(() => page.$$eval('.drawer .msg', l => l.some(m => m.textContent.includes('Why is energy conserved?'))));
  ok(await page.$$eval('.drawer .msg', l => { const m = l.find(x => x.textContent.includes('Why is energy conserved?')); return getComputedStyle(m).unicodeBidi; }) === 'plaintext', 'a chat bubble with the learner’s English keeps its direction');
  ok(await noHScroll(page), '1280 px: no sideways scrolling');
  await page.setViewportSize({ width: 390, height: 844 });

  console.log('A2. back to English');
  await boot('en');
  ok(await page.evaluate(() => document.documentElement.dir) === 'ltr', '<html dir="ltr"> again');
  const fab2 = await page.$eval('#ns-fab', b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2 > innerWidth / 2; }).catch(() => null);
  ok(fab2 === true, 'the tutor button is on the right in LTR');
  await page.goto(url + '#/shelf'); await until(() => page.$('[data-subject="demo-physics"]')); await page.click('[data-subject="demo-physics"]');
  await until(() => page.evaluate(() => typeof COURSE !== 'undefined' && !!document.querySelector('.ns-top')));
  await page.evaluate(() => { location.hash = '#/s/' + COURSE[0].sections[0].id; }); await until(() => page.$('.secnext .nx'));
  const nx2 = await page.$eval('.secnext .nx', b => b.textContent).catch(() => '');
  ok(/→$/.test(nx2), 'the arrow in a button’s text points right in LTR: ' + nx2);
  await page.setViewportSize({ width: 1280, height: 900 }); await wait(400);
  const rail2 = await rect(page, '.ns-tabs'); await page.click('#ns-fab'); await until(() => page.$('.drawer.open')); await wait(600); const open2 = await rect(page, '.drawer.open');
  ok(rail2 && rail2.l <= 0 && open2 && open2.r >= open2.w - 1 && open2.l > open2.w / 2, '1280 px in LTR: the rail at the left, the tutor panel from the right: ' + JSON.stringify([rail2, open2]));
  ok(E.length === 0, 'no page errors' + (E.length ? ': ' + E.slice(0, 3).join(' | ') : ''));

  console.log('D. the CJK subsets cover the catalogs');
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'fonts', 'scripts.json'), 'utf8'));
  const cover = fam => { const set = new Set(); const css = fs.readFileSync(path.join(ROOT, 'fonts', 'scripts.css'), 'utf8');
    for (const m of css.matchAll(/font-family: '([^']+)';[\s\S]*?unicode-range: ([^;]+);/g)) if (m[1] === fam) for (const r of m[2].split(',')) { const [a, b] = r.trim().slice(2).split('-').map(x => parseInt(x, 16)); for (let c = a; c <= (b || a); c++) set.add(c); }
    return set; };
  for (const [fam, locs] of [['Noto Sans SC', ['zh-Hans']], ['Noto Sans TC', ['zh-Hant']], ['Noto Sans JP', ['ja']]]) {
    if (!meta[fam]) { ok(false, fam + ' in fonts/scripts.json'); continue; }
    const have = cover(fam), miss = new Set();
    for (const f of glob(path.join(ROOT, 'i18n'))) if (locs.some(l => f.endsWith(path.sep + l + '.arb'))) for (const ch of fs.readFileSync(f, 'utf8')) { const o = ch.codePointAt(0); if (o >= 0x4E00 && o <= 0x9FFF && !have.has(o)) miss.add(ch); }
    console.log(miss.size ? `  ⚠️  ${fam}: ${miss.size} character(s) of the catalogs are not in the subset (system font shown) — run python3 tools/fonts_subset.py` : `  ✅ ${fam}: the catalogs are covered`);
  }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
