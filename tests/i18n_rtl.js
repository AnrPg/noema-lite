/* Right-to-left interfaces and the scripts' fonts (docs/i18n.md §2 Fonts, §5), Playwright + Chromium, pseudo-locale ar-XB:
     A. <html dir lang data-ui-locale> follow the UI locale; the frame mirrors (tutor button, ← back), no sideways scrolling
     B. texts put into messages are bidi-isolated in RTL only; formulas and code stay left to right; a pack's English reads LTR
     C. fonts: fonts/scripts.css is linked, nothing is asked from Google Fonts, an Arabic word loads the self-hosted Noto
     D. the CJK subsets cover every Han character of the zh-Hans / zh-Hant / ja catalogs (a warning: re-run tools/fonts_subset.py)
   Usage: node tests/i18n_rtl.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), glob = d => fs.readdirSync(d, { recursive: true }).map(f => path.join(d, f));
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(200); } return false; };
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

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
  await page.goto(url + '#/lang/polyglot-semitic-zh-de'); await page.waitForSelector('.lx-host .lx-main .lx-view', { timeout: 30000 }).catch(() => {}); await wait(800);
  ok(await noHScroll(page), 'the language course home: no sideways scrolling');

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

  console.log('A2. back to English');
  await boot('en');
  ok(await page.evaluate(() => document.documentElement.dir) === 'ltr', '<html dir="ltr"> again');
  const fab2 = await page.$eval('#ns-fab', b => { const r = b.getBoundingClientRect(); return r.left + r.width / 2 > innerWidth / 2; }).catch(() => null);
  ok(fab2 === true, 'the tutor button is on the right in LTR');
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
