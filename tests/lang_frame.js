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
  ok(!(await page.$('body > header.lx-top')) && !(await page.$('body > main.lx-main')) && await page.$('#ns-main .lx-host .lx-main'), 'no full-page takeover: the course lives in the frame’s <main>');
  ok(await page.locator('.lx-fhome .ns-item[data-act^="lang-"]').count() === 4, 'the course home: a row per language (the frame’s list)');
  ok(await page.$('.lx-host .lx-fgo.ns-go') && /S00/.test(await page.$eval('.lx-fgo', b => b.textContent)), 'the course home: ONE big card — the next lesson');
  const colours = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement), probe = document.createElement('i'); document.body.append(probe);
    const col = v => { probe.style.color = css.getPropertyValue(v); return getComputedStyle(probe).color; };
    const out = { node: getComputedStyle(document.querySelector('.lx-host .lx-nodes')).backgroundColor, paper: col('--paper'), step: getComputedStyle(document.querySelector('.lx-host .lx-node .lx-step')).backgroundColor, soft: col('--acc-soft') }; probe.remove(); return out; });
  ok(colours.node === colours.paper && colours.step === colours.soft, 'it wears the frame’s colours (the map on --paper, a step’s label on --acc-soft): ' + JSON.stringify(colours));
  ok(await page.evaluate(() => document.documentElement.lang) === 'en', 'the page language is the course’s explanation language');
  ok(await noHScroll(page), 'phone 390 px: nothing scrolls sideways');
  await page.screenshot({ path: SHOTS + '/lf_b_course.png' });

  console.log('C. the course’s addresses under #/lang/<course>/…');
  const lesson = await page.$eval('.lx-host .lx-moved .lx-lessonbtn', b => b.dataset.node);
  await page.click('.lx-host .lx-node:not([hidden]) >> nth=0'); await wait(600);
  ok(await hash(page) === `${BASE}/lesson/${lesson}`, 'a lesson page: ' + await hash(page));
  const crL = await crumbs(page);
  ok(crL.length === 3 && /S00/.test(crL[2]), 'crumbs: Languages › the course › the lesson: ' + crL.join(' › '));
  ok(await page.$eval('#ns-top .ns-back', b => b.classList.contains('on')), '← in the top bar');
  await page.click('#ns-top .ns-back'); await wait(600);
  ok(await hash(page) === BASE && await page.$('.lx-host .lx-fhome'), '← goes back to the course home');
  await page.click('.lx-host .lx-node:not([hidden]) >> nth=1'); await wait(600);
  ok(/#\/lang\/[^/]+\/(node|lesson)\/[^/]+$/.test(await hash(page)), 'a step of the map opens under the course: ' + await hash(page));
  await page.evaluate(() => [...document.querySelectorAll('.ns-crumbs button')].find(b => /Arabic/.test(b.textContent)).click()); await wait(600);   // phones show the last crumb only
  ok(await hash(page) === BASE, 'the course crumb goes home');
  const pagesOf = await page.evaluate(() => {
    const C = NoemaLangUI.UI.C, fn = Object.keys(C.functions).find(f => C.functions[f].category !== 'overview' && C.lang.de.grammar[f]);
    const multi = Object.entries(C.lang.de.lex).find(([, x]) => (x.senses || []).length > 1 && x.senses.every(s => C.concepts[s]));
    return { fn, word: multi && multi[0], concept: multi && multi[1].senses[0], field: (C.data.fields.find(f => (f.concepts || []).length > 30) || C.data.fields[0]).field };
  });
  // the settings and the Claude queue from ⋮
  const cm = await menuItems(page);
  ok(['Course settings', 'Through Claude', 'New language course', 'Choose a subject'].every(w => cm.some(x => x.startsWith(w))), 'the course’s ⋮: ' + cm.join(' · '));
  await pick(page, 'Course settings'); await wait(600);
  ok(await hash(page) === BASE + '/settings' && (await crumbs(page)).pop() === 'Settings' && /Settings/.test(await page.$eval('.lx-host h1', x => x.textContent)), '⋮ › Course settings: #/lang/<course>/settings');
  await pick(page, 'Through Claude'); await wait(600);
  ok(await hash(page) === BASE + '/claude' && await page.$('.lx-host .lj-h1'), '⋮ › Through Claude: the task queue (P8)');
  ok(!(await page.$('.lx-host .lx-back')), 'the views’ own “← …” buttons give way to the frame’s ← and crumbs');
  await page.click('#ns-top .ns-back'); await wait(500);
  ok(await hash(page) === BASE, '← from the Claude page: the course home, in the frame');

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
  // the word card in the frame: the word, 🔊, its meaning and one quiet line; tags, register, context on tap; Practise this word in ⋮
  ok(await page.$('.lx-fword .lx-cardtop .ns-hint') && !(await page.$('.lx-fword .lx-cardtop .lx-chips')) && !(await page.$('.lx-fword > .lx-deepbtn')), 'the word card’s head: the word, 🔊, its meaning and an (i) for its state, level and register');
  ok((await menuItems(page)).some(x => /Practise this word/.test(x)), '… Practise this word waits in ⋮');
  const secs = await page.$$eval('.lx-fword > details.lx-sec', l => l.map(d => (d.open ? '+' : '-') + d.querySelector('summary').textContent.trim()));
  ok(secs.filter(x => x[0] === '+').length === 2 && secs.some(x => /^\+Meanings/.test(x)) && secs.some(x => /^\+In sentences/.test(x)), 'its sections start folded, the meanings and the sentences open: ' + secs.join(' | '));
  const ex0 = '.lx-fword .lx-ex >> nth=0';
  ok(!(await page.locator(ex0).locator('.lx-badge').first().isVisible()) && await page.locator(ex0).locator('.lx-tr').isVisible(), 'an example: the sentence and its translation; its register, context and new words wait');
  await page.locator(ex0).click({ position: { x: 4, y: 4 } }); await wait(200);
  ok(await page.locator(ex0).locator('.lx-badge').first().isVisible(), '… a tap shows them');
  ok(await page.locator('.lx-fword .lx-ex:visible').count() <= 3 && await page.$('.lx-fword .lx-fmorebtn'), 'three sentences, then More');
  await page.click('.lx-fword ol.lx-senses > li:has(a.lx-badge)', { position: { x: 6, y: 6 } }); await wait(200);
  if (links.length) { await page.click('.lx-host a[href^="#/lang/"]:visible'); await wait(600); ok(/\/c\//.test(await hash(page)) && await page.$('.lx-host .lx-view h1'), 'a link opens the concept in the frame'); }
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
  await page.click('.lx-host .lx-fgo'); await wait(800);
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
  await page.click(`.ns-langitem[data-course="${COURSE}"]`); ok(await inCourse(page) && await page.locator('.lx-fhome .ns-item[data-act^="lang-"]').count() === 4, 'back to the library course: another course opens in the same page');
  const tabs = await page.evaluate(() => JSON.parse(localStorage.getItem('noema1:anr:a:settings')).world);
  ok(tabs === 'both', 'what I learn is unchanged (both)');

  console.log('H. main’s calm style: one primary action, the rest in ⋮ / ▾ / sheets, plain chrome, the character’s look');
  const prim = () => page.$$eval('.lx-host .btn.primary', l => l.filter(b => b.offsetParent).length);
  const pictos = () => page.$$eval('.lx-host :is(h1,h2,h3,summary,button.btn)', l => l.filter(x => x.offsetParent && !x.closest('.lx-moved, .lx-stage, [lang]:not([lang|="en"])')).map(x => x.textContent.trim()).filter(t => /\p{Extended_Pictographic}/u.test(t.replace(/[←-⇿■-◿✓✕]/g, ''))));
  await page.goto(url + BASE); await inCourse(page); await wait(300);
  ok(await prim() === 0 && await page.locator('.lx-fhome .ns-go').count() === 1, 'the home: the big card is its one primary action');
  ok(!(await page.$('.lx-host .lx-subbar:not([hidden])')) && !(await page.$('.lx-fhome > .lx-prodlanes, .lx-fhome > .lx-glane')), 'the home: no rows of lane buttons, no grammar-lane block, no second languages switch');
  let pic = await pictos(); ok(!pic.length, 'the home: titles and buttons without pictographs' + (pic.length ? ': ' + pic.slice(0, 3).join(' | ') : ''));
  await page.click('.lx-fhome .ns-item[data-act="lang-de"]'); await page.waitForSelector('.ns-sheet');
  const lanes = await page.$$eval('.ns-sheet .ns-item b', l => l.map(x => x.textContent.trim()));
  ok(['Grammar', 'Writing', 'Reading', 'Peculiarities'].every(w => lanes.some(x => x.startsWith(w))) && lanes.some(x => /Listening/.test(x)) && lanes.some(x => /Tutor/.test(x)), 'German’s row opens a sheet with its lanes: ' + lanes.join(' · '));
  await page.click('.ns-sheet .ns-item:has-text("Writing")'); await wait(700);
  ok(await hash(page) === BASE + '/write/de' && !(await page.$('.ns-sheet')), 'a lane from the sheet opens in the frame (the sheet closes)');
  ok(await page.$('.lx-host .lx-lanegrid .lx-lanecard') && await page.$eval('.lx-host .lx-lanegrid', g => getComputedStyle(g).flexDirection === 'column'), 'the Writing lane: its sets as the frame’s list');
  pic = await pictos(); ok(!pic.length, 'the Writing lane: plain titles and buttons' + (pic.length ? ': ' + pic.slice(0, 3).join(' | ') : ''));
  await page.goto(url + BASE); await inCourse(page);
  await page.click('.lx-fhome .ns-item[data-act="across"]'); await page.waitForSelector('.ns-sheet');
  const across = await page.$$eval('.ns-sheet .ns-item b', l => l.map(x => x.textContent.trim()));
  ok(across.includes('Compare') && across.length >= 5, 'Across your languages (a sheet): ' + across.join(' · '));
  await page.click('.ns-sheet .ns-item:has-text("Compare")'); await wait(700); ok(await hash(page) === BASE + '/cmp', '… Compare opens the compare lane');
  await page.goto(url + BASE); await inCourse(page);
  await page.click('.lx-fhome .ns-item[data-act="drills"]'); await page.waitForSelector('.ns-sheet');
  ok((await page.$$eval('.ns-sheet .ns-item b', l => l.map(x => x.textContent))).some(x => /Principal parts/.test(x)), 'Drills (a sheet): principal parts and the field sorts');
  await page.keyboard.press('Escape'); await wait(200);
  const hm = await menuItems(page);
  ok(hm[0].startsWith('Today’s languages') && hm.some(x => x.startsWith('What the signs mean')) && hm.some(x => x.startsWith('Course settings')), 'the home’s ⋮: ' + hm.join(' · '));
  await pick(page, 'Today’s languages'); await page.waitForSelector('.ns-sheet');
  ok(await page.locator('.ns-sheet .ns-item').count() === 4, 'Today’s languages: a switch per language, in a sheet');
  await page.click('.ns-sheet .ns-item >> nth=3'); await wait(400);
  ok(await page.evaluate(() => NoemaLangUI.UI.prefs.today?.langs?.length === 3), '… leaving one out works');
  await page.click('.ns-sheet .ns-item >> nth=3'); await wait(400); await page.keyboard.press('Escape');
  await page.goto(url + `${BASE}/lesson/${lesson}`); await inCourse(page); await wait(300);
  ok(await prim() === 1, 'a lesson: one primary action');
  const lm = await menuItems(page);
  ok(lm.some(x => /Lesson check/.test(x)) && lm.some(x => /Quiz this node/.test(x)), 'a lesson’s ⋮: the lesson check and the tutor’s questions: ' + lm.join(' · '));
  await pick(page, 'Lesson check'); await wait(900);
  ok(await page.$('.lx-host .lx-session, .lx-host .lx-stage, .lx-host .lx-note'), '⋮ › Lesson check runs in the frame');
  await page.goto(url + `${BASE}/lesson/fd.01`); await inCourse(page); await wait(300);
  ok(await page.locator('.lx-host details.lx-ffold').count() >= 2 && await page.locator('.lx-host details.lx-ffold[open]').count() === 1, 'a lesson’s grammar points: the first open, the others one tap away');
  await page.goto(url + `${BASE}/script/ar`); await inCourse(page); await wait(400);
  ok(await prim() === 1, 'the letters: one primary action');
  await page.click('.lx-host .ns-dropbtn'); await page.waitForSelector('.ns-pop');
  const dm = await page.$$eval('.ns-pop button', l => l.map(x => x.textContent.trim()));
  ok(['Letter forms', 'Vowel marks', 'Tracing'].every(w => dm.some(x => x.includes(w))), 'the letters’ drills in “Practice ▾”: ' + dm.join(' · '));
  await page.click('.ns-pop button:has-text("Letter forms")'); await wait(800);
  ok(await page.$('.lx-host .lx-session, .lx-host .lx-scriptrun'), '… a drill from ▾ runs');
  // the second pass: content views with details on demand
  await page.goto(url + `${BASE}/fn/${pagesOf.fn}/de`); await inCourse(page); await wait(400);
  const fn = await page.evaluate(() => ({ h: document.scrollingElement.scrollHeight, secs: [...document.querySelectorAll('.lx-gram > details.lx-fsec')].map(d => (d.open ? '+' : '') + d.querySelector('summary').textContent), fam: !!document.querySelector('.lx-gram > .lx-familiarline'), first: !!document.querySelector('.lx-gram > .lx-summary') }));
  ok(fn.first && !fn.fam && fn.secs.length >= 3 && fn.secs.every(x => x[0] !== '+') && fn.h < 2600, `a grammar point: the summary and the first block, the rest in folded sections (${fn.secs.join(' · ')}), ${fn.h} px tall at 390`);
  await page.click('.lx-gram > details.lx-fsec[data-k="traps"] > summary').catch(() => { }); await wait(200);
  ok(await page.$eval('.lx-gram > details.lx-fsec[data-k="traps"]', d => d.open && d.textContent.length > 40).catch(() => false), '… Traps open on a tap');
  ok(await page.$eval('#ns-fab .nm', x => getComputedStyle(x).display === 'none') && await page.evaluate(() => document.body.classList.contains('ns-reading')), 'while you read a point the character is a small face (it covers less text)');
  await page.goto(url + `${BASE}/settings`); await inCourse(page); await wait(300);
  const panels = await page.$$eval('.lx-host .lx-fpanel > .ns-label', l => l.map(x => x.textContent));
  ok(panels.length >= 4 && panels.length <= 6 && panels.includes('Sessions'), 'settings in a few panels, like Me: ' + panels.join(' · '));
  await page.goto(url + `${BASE}/peculiar/de`); await inCourse(page); await wait(300);
  ok(await page.$$eval('.lx-host details.lx-sec[open]', l => l.length) === 1 && await page.$('.lx-host p.lx-fseg') && await page.$('.lx-host h1 .ns-hint'), 'peculiarities: the first group open, the others folded, the filter a small switch, the counts behind (i)');
  await page.goto(url + `${BASE}/field/${encodeURIComponent(pagesOf.field)}`); await inCourse(page); await wait(400);
  ok(await page.locator('.lx-host .lx-cgrid > :visible').count() <= 25 && await page.$('.lx-host .lx-fmorebtn') && !/in all/.test(await page.$eval('.lx-host h1', x => x.textContent)), 'a field map: the first 24 words, then More; no counter in the title');
  await page.click('.lx-host .lx-fmorebtn'); await wait(200);
  ok(await page.locator('.lx-host .lx-cgrid > :visible').count() > 25, '… More shows the rest');
  await page.goto(url + `${BASE}/cmp`); await inCourse(page); await wait(300);
  ok(await page.locator('.lx-host .lx-cmplist >> nth=0').locator('.lx-cmprow:visible').count() === 8, 'compare: eight points, then More');
  for (const r of ['', `/lesson/${lesson}`, `/w/de/${encodeURIComponent(pagesOf.word)}`, `/fn/${pagesOf.fn}`, '/write/de', '/script/ar', '/cmp', '/settings', '/claude']) {
    await page.goto(url + BASE + r); await inCourse(page); await wait(250);
    if (!(await noHScroll(page))) ok(false, 'phone 390 px: nothing scrolls sideways on ' + (r || 'the home'));
  }
  ok(true, 'phone 390 px: the home, a lesson, a word, a function, writing, letters, compare, settings, Claude — nothing scrolls sideways (checked above)');
  // three characters, three looks (main's [data-m] rules reach the course)
  const looks = {};
  for (const [ch, w] of [['bear', 390], ['robot', 1280], ['piglet', 1280], ['owl', 390]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(url + BASE); await inCourse(page); await wait(300);
    for (let i = 0; i < 3 && await page.evaluate(() => document.documentElement.dataset.m) !== ch; i++) {   // (a subject engine loaded earlier may write its copy of the settings back once)
      await page.evaluate(ch => { NoemaThemes.putSettings({ character: ch, characterAt: Date.now() - 20 * 864e5 }); NoemaThemes.apply(ch); }, ch); await page.reload(); await inCourse(page); await wait(400);
    }
    looks[ch] = await page.evaluate(() => ({ m: document.documentElement.dataset.m, font: getComputedStyle(document.querySelector('.lx-fhead h1')).fontFamily.split(',')[0], border: getComputedStyle(document.querySelector('.lx-nodes')).borderTopStyle, step: getComputedStyle(document.querySelector('.lx-node .lx-step')).borderTopLeftRadius, icon: getComputedStyle(document.querySelector('.lx-fhome .ns-item[data-act^="lang-"] .ns-ico')).borderTopLeftRadius }));
    await page.screenshot({ path: `${SHOTS}/lf_h_${ch}_${w}.png` });
  }
  ok(looks.bear.m === 'bear' && looks.bear.border === 'dashed' && looks.owl.border === 'solid', 'the bear’s dashed lines reach the course, the owl’s do not: ' + JSON.stringify(looks));
  ok(looks.robot.step === '5px' && looks.owl.step !== '5px', 'the robot’s square labels reach the course');
  ok(new Set(Object.values(looks).map(x => x.font)).size >= 3, 'each character’s display font titles the course: ' + Object.values(looks).map(x => x.font).join(' · '));
  await page.setViewportSize({ width: 390, height: 844 });

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
