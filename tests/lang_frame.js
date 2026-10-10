/* The language courses inside the new frame (docs/LANGUAGES.md §8, docs/NEW_FRAME_AND_LANGUAGES.md), Playwright + Chromium:
     A. the Languages tab (文A) lists the course (languages, progress, what is due) with its ⋮; the tab's ⋮
     B. a course inside the frame: #/lang/<course>, crumbs Languages › course, the frame's tabs stay, its colours (--paper, --acc)
     C. the course's own addresses under #/lang/<course>/… (lesson, concept, function, word, settings, ✨ Through Claude), links, ← and the crumbs
     D. deep links on a fresh load, back / forward, the character opens the language tutor, a session runs inside the frame
     E. Today's "continue" card; boot: ?subject=lang:<id>, the course you were in, #/ stays Today; a subject afterwards is the one a reload reopens
     F. ✨ + New language: the dialog, an account course opens inside the frame on its Through Claude page
     G. phone 390 px and desktop 1280 px: no horizontal scrolling, the rail; shell: false keeps the full-page course
   Usage: node tests/lang_frame.js <prepared-repo-dir>   (built with tools/build.py) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const COURSE = 'polyglot-semitic-zh-de', BASE = '#/lang/' + COURSE;
function errs(page, bag) { page.on('pageerror', e => bag.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/net::ERR|404|Failed to load resource/.test(m.text())) bag.push(m.text()); }); }
const hash = page => page.evaluate(() => location.hash);
const crumbs = page => page.$$eval('.ns-crumbs > *', l => l.map(x => x.textContent.trim()).filter(t => t && t !== '›'));
const inCourse = page => page.waitForSelector('.lx-host .lx-main .lx-view', { timeout: 30000 }).then(() => true).catch(() => false);
const menuItems = async (page, btn = '#ns-top .ns-menubtn') => { await page.click(btn); await wait(250); const t = await page.$$eval('.ns-pop button', l => l.map(x => (x.querySelector('.mt')?.firstChild?.textContent || x.textContent).trim())); await page.keyboard.press('Escape'); await wait(150); return t; };
const pick = async (page, label, btn = '#ns-top .ns-menubtn') => { await page.click(btn); await page.waitForSelector('.ns-pop', { timeout: 5000 }); await page.locator('.ns-pop button', { hasText: label }).first().click(); };
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(); const E = []; errs(page, E);
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); });
  await page.goto(url + '?account=anr'); await until(() => page.$('.ns-hello'));

  console.log('A. the Languages tab');
  ok(JSON.stringify(await page.$$eval('.ns-tab', l => l.map(x => x.dataset.tab))) === '["today","learn","lang","discover","progress"]', 'Knowledge and Languages: the 文A tab is there');
  await page.click('.ns-tab[data-tab="lang"]'); await until(() => page.$('.ns-langitem'));
  ok(await hash(page) === '#/lang' && await page.$eval('.ns-tab[data-tab="lang"]', b => b.classList.contains('on')), 'address #/lang, the tab is on');
  const item = await page.$eval(`.ns-langitem[data-course="${COURSE}"]`, b => b.innerText).catch(() => '');
  ok(/Arabic/.test(item) && /German/.test(item) && /🇸🇦/.test(item), 'the library course is listed with its languages: ' + item.replace(/\n/g, ' | '));
  ok(await page.$('.ns-view button:has-text("New language")'), '+ New language on the tab');
  const im = await menuItems(page, `.ns-itemwrap:has([data-course="${COURSE}"]) .ns-menubtn`);
  ok(['Start', 'Course settings', 'Through Claude'].every(w => im.some(x => x.startsWith(w))), 'the course’s ⋮: ' + im.join(' · '));
  const tm = await menuItems(page);
  ok(tm.some(x => x.startsWith('New language course')) && tm.some(x => x.startsWith('Choose a subject')), 'the tab’s ⋮: ' + tm.join(' · '));
  await page.screenshot({ path: SHOTS + '/lf_a_tab.png' });

  console.log('B. a course inside the frame');
  await page.click(`.ns-langitem[data-course="${COURSE}"]`);
  ok(await inCourse(page), 'the course opens inside the frame');
  ok(await hash(page) === BASE, 'address: ' + BASE);
  const cr = await crumbs(page);
  ok(cr[0] === 'Languages' && /Arabic/.test(cr[1]) && cr.length === 2, 'crumbs: Languages › the course: ' + cr.join(' › '));
  ok(await page.$eval('.ns-tabs', t => getComputedStyle(t).display !== 'none') && await page.$eval('.ns-tab[data-tab="lang"]', b => b.classList.contains('on')), 'the frame’s tabs stay, Languages is on');
  ok(!(await page.$('body > header.lx-top')) && !(await page.$('body > main.lx-main')) && await page.$('#ns-main .lx-host .lx-subbar'), 'no full-page takeover: the course lives in the frame’s <main>');
  ok(await page.locator('.lx-subbar .lx-flagchip').count() === 4, 'the course’s own bar: four language chips');
  ok(await page.$('.lx-host .lx-hero') && await page.$('.lx-host .lx-lessonbtn'), 'the course home: the session, the next lesson');
  const colours = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement), probe = document.createElement('i'); document.body.append(probe);
    const col = v => { probe.style.color = css.getPropertyValue(v); return getComputedStyle(probe).color; };
    const out = { node: getComputedStyle(document.querySelector('.lx-host .lx-node')).backgroundColor, paper: col('--paper'), chip: getComputedStyle(document.querySelector('.lx-subbar .lx-flagchip.on')).borderTopColor, acc: col('--acc') }; probe.remove(); return out; });
  ok(colours.node === colours.paper && colours.chip === colours.acc, 'it wears the frame’s colours (the map on --paper, the chosen language in --acc): ' + JSON.stringify(colours));
  ok(await page.evaluate(() => document.documentElement.lang) === 'en', 'the page language is the course’s explanation language');
  ok(await noHScroll(page), 'phone 390 px: nothing scrolls sideways');
  await page.screenshot({ path: SHOTS + '/lf_b_course.png' });

  console.log('C. the course’s addresses under #/lang/<course>/…');
  const lesson = await page.$eval('.lx-host .lx-lessonbtn', b => b.dataset.node);
  await page.click('.lx-host .lx-lessonbtn button:has-text("Open")'); await wait(600);
  ok(await hash(page) === `${BASE}/lesson/${lesson}`, 'a lesson page: ' + await hash(page));
  const crL = await crumbs(page);
  ok(crL.length === 3 && /S00/.test(crL[2]), 'crumbs: Languages › the course › the lesson: ' + crL.join(' › '));
  ok(await page.$eval('#ns-top .ns-back', b => b.classList.contains('on')), '← in the top bar');
  await page.click('#ns-top .ns-back'); await wait(600);
  ok(await hash(page) === BASE && await page.$('.lx-host .lx-hero'), '← goes back to the course home');
  await page.click('.lx-host .lx-node:not([hidden]) >> nth=1'); await wait(600);
  ok(/#\/lang\/[^/]+\/(node|lesson)\/[^/]+$/.test(await hash(page)), 'a step of the map opens under the course: ' + await hash(page));
  await page.evaluate(() => [...document.querySelectorAll('.ns-crumbs button')].find(b => /Arabic/.test(b.textContent)).click()); await wait(600);   // phones show the last crumb only
  ok(await hash(page) === BASE, 'the course crumb goes home');
  const pagesOf = await page.evaluate(() => {
    const C = NoemaLangUI.UI.C, fn = Object.keys(C.functions).find(f => C.functions[f].category !== 'overview' && C.lang.de.grammar[f]);
    const multi = Object.entries(C.lang.de.lex).find(([, x]) => (x.senses || []).length > 1 && x.senses.every(s => C.concepts[s]));
    return { fn, word: multi && multi[0], concept: multi && multi[1].senses[0] };
  });
  // the settings and the Claude queue from ⋮
  const cm = await menuItems(page);
  ok(['Course settings', 'Through Claude', 'New language course', 'Choose a subject'].every(w => cm.some(x => x.startsWith(w))), 'the course’s ⋮: ' + cm.join(' · '));
  await pick(page, 'Course settings'); await wait(600);
  ok(await hash(page) === BASE + '/settings' && (await crumbs(page)).pop() === 'Settings' && /Settings/.test(await page.$eval('.lx-host h1', x => x.textContent)), '⋮ › Course settings: #/lang/<course>/settings');
  await pick(page, 'Through Claude'); await wait(600);
  ok(await hash(page) === BASE + '/claude' && await page.$('.lx-host .lj-h1'), '⋮ › Through Claude: the task queue (P8)');
  await page.click('.lx-host button:has-text("The course")'); await wait(500);
  ok(await hash(page) === BASE, 'its “← The course” stays in the frame');

  console.log('D. deep links, back / forward, the tutor, a session');
  await page.goto(url + `${BASE}/c/${pagesOf.concept}`); await page.reload();
  ok(await inCourse(page) && await hash(page) === `${BASE}/c/${pagesOf.concept}`, 'a deep link to a concept opens it in the frame after a fresh load');
  const crC = await crumbs(page);
  ok(crC.length === 3 && crC[0] === 'Languages', 'crumbs: Languages › the course › the concept: ' + crC.join(' › '));
  await page.goto(url + `${BASE}/fn/${pagesOf.fn}`); await inCourse(page); await wait(300);
  ok(await hash(page) === `${BASE}/fn/${pagesOf.fn}` && (await crumbs(page)).length === 3, 'a grammar function: ' + pagesOf.fn);
  await page.goto(url + `${BASE}/w/de/${encodeURIComponent(pagesOf.word)}`); await inCourse(page); await wait(500);
  const links = await page.$$eval('.lx-host a[href^="#/"]', l => l.map(a => a.getAttribute('href')));
  ok(links.length > 0 && links.every(x => x.startsWith(`#/lang/${'polyglot-semitic-zh-de'}/c/`)), 'links inside a word card point under the course: ' + links.slice(0, 2).join(' '));
  if (links.length) { await page.click('.lx-host a[href^="#/lang/"]'); await wait(600); ok(/\/c\//.test(await hash(page)) && await page.$('.lx-host .lx-view h1'), 'a link opens the concept in the frame'); }
  await page.goBack(); await wait(600);
  ok(await hash(page) === `${BASE}/w/de/${encodeURIComponent(pagesOf.word)}` && await page.$('.lx-host .lx-view'), 'back: the word again');
  await page.goBack(); await wait(600);
  ok(await hash(page) === `${BASE}/fn/${pagesOf.fn}` && await page.$('.lx-host .lx-view'), 'back: the function again');
  await page.goForward(); await wait(600);
  ok(await hash(page) === `${BASE}/w/de/${encodeURIComponent(pagesOf.word)}`, 'forward: the word');
  await page.click('.ns-tab[data-tab="today"]'); await wait(500); await page.goBack(); await wait(800);
  ok(await hash(page) === `${BASE}/w/de/${encodeURIComponent(pagesOf.word)}` && await page.$('.lx-host .lx-view'), 'Today, then back: the course is drawn again where it was');
  await page.click('#ns-fab'); await wait(500);
  ok(await page.$('.lx-tutor') && !(await page.$('.drawer.open')), 'the character opens the course’s own tutor (not a subject’s)');
  await page.evaluate(() => NoemaLangUI.prod.closeLangTutor());
  await page.goto(url + BASE); await inCourse(page);
  await page.click('.lx-host .lx-go'); await wait(800);
  ok(await page.$('.lx-host .lx-session') && await page.$eval('.ns-tabs', t => getComputedStyle(t).display !== 'none'), 'a lesson runs inside the frame, the tabs stay');
  await page.screenshot({ path: SHOTS + '/lf_d_session.png' });

  console.log('E. Today, the boot');
  await page.click('.ns-tab[data-tab="today"]'); await until(() => page.$('.ns-langgo'));
  const card = await page.$eval('.ns-langgo', b => b.innerText).catch(() => '');
  ok(/Arabic/.test(card) && /(S00|session|Start)/i.test(card), 'Today: a “continue” card for the course you were in: ' + card.replace(/\n/g, ' | '));
  ok(await page.$eval('.ns-stack', b => b.firstElementChild?.classList.contains('ns-langgo')) && !(await page.$('.ns-stack .ns-empty')), 'with no subject to continue, the course leads Today (no welcome panel)');
  await page.screenshot({ path: SHOTS + '/lf_e_today.png' });
  await page.click('.ns-langgo'); ok(await inCourse(page) && await hash(page) === BASE, 'the card opens the course');
  await page.goto(url + '?account=anr'); await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search)); await page.reload();
  ok(await inCourse(page) && await hash(page) === BASE, 'a reload without an address reopens the course you were in, inside the frame');
  await page.goto(url + '#/'); await page.reload(); await until(() => page.$('.ns-hello'));
  ok(await hash(page) === '#/' && await page.$('.ns-langgo'), '#/ stays Today');
  await page.evaluate(() => { localStorage.removeItem('noema1:current'); localStorage.removeItem('noema1:anr:meta:lastLang'); });
  await page.goto(url + '?account=anr&subject=lang:' + COURSE);
  ok(await inCourse(page) && await hash(page) === BASE, '?subject=lang:<course> opens it at #/lang/<course>');
  await page.click('.ns-tab[data-tab="learn"]'); await wait(400); await page.click('.ns-shelflink'); await wait(600);
  await page.click('[data-subject="demo-physics"]'); await until(() => page.$('.subjhead'));
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:current')).subj) === 'demo-physics', 'a subject opened afterwards is the one a reload reopens');
  await page.goto(url + BASE); await inCourse(page); await page.click('.ns-tab[data-tab="today"]'); await wait(600);
  await page.click('.ns-go:not(.ns-langgo)'); await until(() => page.$('.subjhead'));
  ok(await hash(page) === '#/subject' && await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:current')).subj) === 'demo-physics', 'Today › Continue the subject after a course: the subject again');

  console.log('F. + New language');
  await page.goto(url + '#/lang'); await until(() => page.$('.ns-langitem'));
  await page.click('.ns-view button:has-text("New language")'); await until(() => page.$('.lj-box'));
  ok(await page.$('.lj-box .lj-create'), 'the ✨ new-course dialog');
  await page.fill('.lj-box input[aria-label=Title]', 'Frame course'); await page.click('.lj-lang[data-lang=es]'); await page.click('.lj-lang[data-lang=de]');
  await page.click('.lj-create'); await page.waitForSelector('.lj-box h2:has-text("waiting for your Claude app")', { timeout: 10000 }).catch(() => { });
  await page.click('.lj-box button:has-text("Open the course")'); await wait(400);
  ok(await until(() => page.$('.lx-host .lj-h1')) && /^#\/lang\/[^/]+$/.test(await hash(page)) && await hash(page) !== BASE, 'the new account course opens inside the frame, on its ✨ Through Claude page: ' + await hash(page));
  ok((await crumbs(page)).includes('Frame course'), 'crumbs: Languages › Frame course');
  await page.click('.ns-tab[data-tab="lang"]'); await until(() => page.$$eval('.ns-langitem', l => l.length === 2));
  ok(/Your own course/.test(await page.$eval('.ns-langitem:has-text("Frame course")', b => b.innerText).catch(() => '')), 'the tab lists both courses, the new one as your own');
  await page.click(`.ns-langitem[data-course="${COURSE}"]`); ok(await inCourse(page) && await page.locator('.lx-subbar .lx-flagchip').count() === 4, 'back to the library course: another course opens in the same page');
  const tabs = await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:settings')).world);
  ok(tabs === 'both', 'what I learn is unchanged (both)');

  console.log('G. widths, the frame off');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(url + `${BASE}/lesson/${lesson}`); await inCourse(page); await wait(400);
  ok(await page.$eval('.ns-tabs', t => t.getBoundingClientRect().width < 200) && await noHScroll(page), 'desktop 1280 px: the rail on the left, nothing scrolls sideways');
  ok(await page.$eval('.lx-host', x => x.getBoundingClientRect().width > 760), 'desktop: the course has room (wider than the frame’s reading column)');
  ok((await crumbs(page)).length === 3, 'desktop crumbs: Languages › the course › the lesson');
  await page.screenshot({ path: SHOTS + '/lf_g_desktop.png' });
  await page.goto(url + '#/lang'); await wait(600);
  ok(await page.$('.ns-langitem') && await noHScroll(page), 'desktop: the Languages tab');
  // a learner of knowledge only, sent a link to a course: the course opens and the Languages tab appears
  await page.evaluate(() => NoemaThemes.putSettings({ world: 'know' })); await page.goto(url + BASE); await page.reload();
  ok(await inCourse(page) && (await page.$$eval('.ns-tab', l => l.map(x => x.dataset.tab))).includes('lang'), 'knowledge only + a link to a course: it opens, the Languages tab appears');
  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.slice(0, 5).join(' | ') : ''));

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const p2 = await ctx2.newPage(); const E2 = []; errs(p2, E2);
  await p2.goto(url); await p2.evaluate(() => localStorage.clear());
  await p2.goto(url + '?account=anr&subject=lang:' + COURSE); await p2.waitForSelector('main.lx-main .lx-view', { timeout: 30000 }).catch(() => { });
  ok(await p2.$('body > header.topbar.lx-top') && !(await p2.$('.ns-tabs')) && await p2.evaluate(() => location.hash) === '', 'shell: false — the course takes the page as before (its own top bar, no frame, its own addresses)');
  await p2.click('.lx-node >> nth=0'); await wait(500);
  ok(/^#\/(lesson|node)\//.test(await p2.evaluate(() => location.hash)), 'shell: false — the addresses stay #/lesson/…');
  ok(!E2.length, 'shell: false — no page errors' + (E2.length ? ': ' + E2.slice(0, 5).join(' | ') : ''));

  await browser.close();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ lang_frame: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
