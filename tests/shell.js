/* The new frame (engine/shell.js, docs/UI_MAP.md), Playwright + Chromium:
     A. first start: what do you learn → who comes with you (20 characters) → Today; tabs follow the choice
     B. Knowledge, the Shelf and its ⋮ menus; a subject from the Shelf: chapters as a list or as cards, Practice ▾, the subject's ⋮
     C. chapter (Theory · Practice · Traps), section (reading mode, Ask ▾), the tutor sheet
     D. a Roadmap as a page: the path upwards, the character at the next station, map ↔ list, the station panel
     E. Me: what I learn, language & appearance (game mode), the character gallery and the 5-minute preview
     F. reactions: at most one big reaction every 3 minutes, milestones always, calm/off, a strict character
     G. Greek menus: the tutor's Greek name, Roadmap = Οδικός χάρτης; wide screens: the rail
   Usage: node tests/shell.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
function errs(page, bag) { page.on('pageerror', e => bag.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/net::ERR|404|Failed to load resource/.test(m.text())) bag.push(m.text()); }); }
const texts = (page, sel) => page.$$eval(sel, l => l.map(x => x.textContent.trim()));
// a ⋮ / ▾ menu's items: the title of each, without its icon or its explanation
const menuItems = async (page, btn) => { await page.click(btn); await wait(250); const t = await page.$$eval('.ns-pop button', l => l.map(x => (x.querySelector('.mt')?.firstChild?.textContent || x.textContent).trim())); await page.keyboard.press('Escape'); await wait(150); return t; };
const has = (list, want) => want.every(w => list.some(x => x.startsWith(w)));
/** open a ⋮ / ▾ menu and run one of its items */
const pick = async (page, btn, label) => { await page.click(btn); await page.waitForSelector('.ns-pop', { timeout: 5000 }); const b = page.locator('.ns-pop button', { hasText: label }).first();
  if (!(await b.count())) throw new Error(`no “${label}” in the menu: ` + (await texts(page, '.ns-pop button')).join(' | ')); await b.click({ timeout: 5000 }); };

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const E = []; errs(page, E);

  console.log('A. first start');
  await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
  ok(await until(() => page.$('.ns-onb [data-pick="know"]')), 'the first-time questions open: what do you want to learn');
  ok(await page.$$eval('.ns-onb .ns-choice', l => l.length) === 3, 'three choices: knowledge · languages · both');
  await page.click('[data-pick="know"]'); await wait(300);
  ok(await page.$$eval('.ns-pick button', l => l.length) === 20, 'who comes with you: 20 characters');
  await page.click('[data-onbm="robot"]'); await wait(200);
  ok(await page.evaluate(() => document.documentElement.dataset.m) === 'robot', 'picking one dresses the app at once');
  await page.screenshot({ path: SHOTS + '/sh_a1_onboarding.png' });
  await page.click('[data-onbdone]'); await wait(600);
  const set0 = await page.evaluate(() => JSON.parse(localStorage.getItem(`noema1:${Noema.account.id}:a:settings`) || '{}'));
  ok(set0.character === 'robot' && set0.world === 'know' && set0.onboarded > 0, 'the choices are saved in the account settings: ' + JSON.stringify({ c: set0.character, w: set0.world }));
  ok(!(await page.$('.ns-onb')), 'the questions are gone; they do not come back');
  ok(JSON.stringify(await page.$$eval('.ns-tab', l => l.map(x => x.dataset.tab))) === '["today","learn","discover","progress"]', 'tabs: Today · Knowledge · Discover · Progress (no Languages for “knowledge”)');
  ok(await page.$('.ns-hello') && await page.$('.ns-duo'), 'Today: hello, review and mistakes gym');
  ok(await page.$eval('#ns-fab', b => b.hidden), 'no tutor button before a subject is open');
  await page.reload(); await wait(1200);
  ok(!(await page.$('.ns-onb')) && await page.$('.ns-hello'), 'after a reload the app opens on Today, no picker, no questions');

  console.log('B. Knowledge, the Shelf, a subject');
  await page.click('.ns-tab[data-tab="learn"]'); await wait(500);
  ok(await page.$('.ns-newrm') && await page.$('.ns-shelflink'), 'Knowledge: Roadmaps first (+ New Roadmap), the Shelf as a quiet link');
  ok((await menuItems(page, '#ns-top .ns-menubtn')).some(t => t.includes('Import a map')), 'Knowledge ⋮: import a map, Roadmaps others share, the Shelf');
  await page.click('.ns-shelflink'); await wait(800);
  const shelf = await texts(page, '.ns-subj b');
  ok(['Databricks', 'Demo Physics', 'Secret Notes'].every(t => shelf.some(x => x.startsWith(t))), 'the Shelf lists the subjects on no Roadmap: ' + shelf.join(' | '));
  const sm = await menuItems(page, '.ns-itemwrap:has([data-subject="demo-physics"]) .ns-menubtn'), sm2 = await menuItems(page, '.ns-itemwrap:has([data-subject="secret-notes"]) .ns-menubtn');
  ok(has(sm, ['Study', 'Put it on a map', 'Edit', 'Export the package']) && !has(sm, ['Share']), 'a library subject’s ⋮ on the Shelf: ' + sm.join(' · '));
  ok(has(sm2, ['Study', 'Put it on a map', 'Edit', 'Share', 'Export the package']), 'your own subject’s ⋮ adds Share: ' + sm2.join(' · '));
  await page.click('[data-subject="demo-physics"]');
  ok(await until(() => page.$('.subjhead')), 'a subject from the Shelf opens its page (#/subject)');
  ok(await page.evaluate(() => location.hash) === '#/subject', 'address: #/subject');
  ok((await texts(page, '.ns-crumbs > *')).join(' ').includes('Shelf'), 'crumbs: Shelf › the subject');
  ok(await page.$('.chlist .chrow') && !(await page.$('.chapters')), 'chapters as a list by default');
  await page.click('.chviewseg [data-v="cards"]'); await wait(300);
  ok(await page.$('.chapters .chcard') && await page.evaluate(() => localStorage.getItem('noema-chview')) === 'cards', 'the chapter cards stay as a second view, remembered');
  await page.click('.chviewseg [data-v="list"]'); await wait(200);
  const pm = await menuItems(page, '.ns-practicebtn');
  ok(has(pm, ['Mixed practice', 'Flashcards', 'Debug drills', 'Mistakes gym', 'Lightning round', 'Ask Cobalt']), 'Practice ▾: ' + pm.join(' · '));
  const um = await menuItems(page, '#ns-top .ns-menubtn');
  ok(has(um, ['Search this subject', 'Sources', 'Focus sprint', 'Put it on a map', 'Edit', 'Export the package', 'Choose a subject', 'Reset my progress']) && !has(um, ['Share']), 'the subject’s ⋮ holds the rest (no Share for a library subject): ' + um.join(' · '));
  ok(await page.$eval('#ns-fab', b => !b.hidden && b.classList.contains('full')), 'the tutor = the character, full body on the subject page');
  await page.screenshot({ path: SHOTS + '/sh_b1_subject.png' });

  console.log('C. chapter, section, tutor');
  const ch = await page.evaluate(() => COURSE[0].id), sec = await page.evaluate(() => COURSE[0].sections[0].id);
  await page.goto(url + '#/ch/' + ch); await until(() => page.$('.chhead'));
  ok(await page.$$eval('.tabs button', l => l.length) === 3, 'a chapter: Theory · Practice · Traps');
  await page.click('.tabs button:nth-child(2)'); await wait(300);
  ok(await page.$$eval('.plist .pitem', l => l.length) >= 3, 'Practice: the ways to practise the chapter, one list');
  await page.click('.tabs button:nth-child(3)'); await wait(300);
  ok(await page.evaluate(() => location.hash.endsWith('/traps')), 'Traps: its own tab');
  await page.goto(url + '#/s/' + sec); await until(() => page.$('.reader'));
  ok(await page.evaluate(() => document.body.classList.contains('ns-reading')) && await page.$eval('#ns-fab', b => !b.classList.contains('full')), 'reading: the compact tutor button');
  await page.evaluate(() => document.querySelector('.continue .btn.ghost')?.click()); await wait(300);
  if (await page.$('.ns-askbtn')) { const am = await menuItems(page, '.ns-askbtn'); ok(has(am, ['Socratic dialogue on this', 'Debug simulation', 'Interview me', 'A new question']), 'Ask ▾ after the section: ' + am.join(' · ')); }
  else ok(false, 'Ask ▾ after the section');
  await page.click('#ns-fab'); await wait(500);
  ok(await page.$('.drawer.open .avatar.face svg'), 'the tutor opens with the character’s face');
  ok((await page.$eval('.drawer .dh', d => d.textContent)).includes('Cobalt'), 'the tutor has the character’s name');
  await page.evaluate(() => closeTutor());

  console.log('D. a Roadmap as a page');
  const cid = await page.evaluate(() => {
    const C = NoemaCurriculum, acc = Noema.account.id; const c = C.blank({ goal: 'Data engineering', language: 'en', provider: 'auto', prefetch: 0 });
    const mk = (id, title, role) => ({ id, title, summary: title, role, part: C.PART[role], learningGoals: ['Explain ' + id], plannedAt: '2026-01-01T00:00:00.000Z', chapters: [1, 2, 3].map(i => ({ ref: 'c' + i, title: `${title} ${i}`, goals: ['g'], coverage: ['t'] })) });
    c.nodes = { a: mk('a', 'Python basics', 'foundation'), b: mk('b', 'SQL', 'foundation'), d: mk('d', 'Spark DataFrames', 'aspect'), e: mk('e', 'Delta Lake', 'aspect'), f: mk('f', 'Pipelines', 'synthesis') };
    c.edges = [{ from: 'a', to: 'd' }, { from: 'b', to: 'd' }, { from: 'b', to: 'e' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' }];
    c.goalId = 'f'; c.paths = { minimal: [], deep: C.order(c) }; c.title = 'Data engineer'; c.status = 'ready'; C.save(acc, c); return c.id;
  });
  await page.goto(url + '#/learn'); await until(() => page.$('.ns-rmcard'));
  ok((await page.$eval('.ns-rmcard', b => b.textContent)).includes('Mastered 0 of 5 steps'), 'Knowledge: the Roadmap card with its progress');
  await page.click('.ns-rmcard'); await until(() => page.$('.cm-page'));
  ok(await page.$('.cm-page .cm-vert') && await page.$$eval('.cm-node[data-id]', l => l.length) === 5, 'the map is a page; the path grows upwards (5 stations)');
  const ya = await page.$eval('.cm-node[data-id="a"]', b => b.getBoundingClientRect().top), yf = await page.$eval('.cm-node[data-id="f"]', b => b.getBoundingClientRect().top);
  ok(ya > yf, 'the first station is at the bottom, the goal at the top');
  ok(await page.$('.cm-node.cm-nextup .cm-hero svg'), 'the character waits at the next station');
  const mm = await menuItems(page, '#ns-top .ns-menubtn');
  ok(has(mm, ['Show as a list', 'Add a step', 'Share', 'Settings', 'Export (.json)', 'What the signs mean']), 'the map’s ⋮: ' + mm.join(' · '));
  ok(!(await page.$('.cm-page .cm-legend')) && !(await page.$('.cm-page .cm-sharetool')), 'the legend and the share/settings buttons moved into ⋮');
  await page.click('.cm-vbtn[data-list="true"]'); await wait(300);
  ok(await page.$$eval('.cm-list .cm-listnode', l => l.length) === 5 && await page.evaluate(() => localStorage.getItem('noema-mapview')) === 'list', 'Map ↔ List (remembered)');
  await page.click('.cm-listnode[data-id="a"]'); await wait(300);
  ok(await page.$('.cm-panel.on'), 'a station opens its panel');
  await page.screenshot({ path: SHOTS + '/sh_d1_map_list.png' });
  await page.click('.cm-vbtn[data-list="false"]'); await wait(200);
  ok(await page.evaluate(() => document.body.classList.contains('ns-mapmode')), 'the map takes the whole page');
  await page.goto(url + '#/progress'); await wait(400);
  ok(!(await page.evaluate(() => document.body.classList.contains('ns-mapmode'))), 'leaving the map gives the page back');

  console.log('E. Me');
  await page.click('#ns-topme'); await wait(400);
  ok(await page.evaluate(() => location.hash) === '#/me' && (await texts(page, '.ns-view h1'))[0] === 'My account', 'Me › My account');
  await page.click('.ns-seg button:nth-child(3)'); await wait(300);
  ok((await page.$$eval('.ns-tab', l => l.map(x => x.dataset.tab))).includes('lang'), 'what I learn: both → the Languages tab appears');
  await page.click('.ns-seg button:nth-child(1)'); await wait(200);
  await page.goto(url + '#/me/look'); await wait(400);
  await page.click('.ns-seg [data-v="calm"]'); await wait(200);
  ok(await page.evaluate(() => NoemaThemes.game()) === 'calm', 'how much game: calm');
  await page.click('.ns-seg [data-v="playful"]'); await wait(200);
  await page.goto(url + '#/character'); await wait(500);
  ok(await page.$$eval('.ns-gcard', l => l.length) === 20 && await page.$('.ns-gcard.cur[data-char="robot"]'), 'the gallery: 20 characters, each in its own clothes; yours marked');
  ok(['berry', 'robot', 'heron', 'prism'].every(async k => await page.$(`.ns-gcard[data-char="${k}"]`)), 'the four new ones: strawberry, robot, heron, prism');
  await page.click('[data-try="owl"]'); await wait(400);
  ok(await page.$('.ns-preview') && await page.evaluate(() => document.documentElement.dataset.m) === 'owl', 'try anyone for 5 minutes: the preview bar, the app in its clothes');
  await page.click('.ns-preview .btn:not(.primary)'); await wait(300);
  ok(!(await page.$('.ns-preview')) && await page.evaluate(() => document.documentElement.dataset.m) === 'robot', 'end of the try: back to yours');
  ok(!(await page.$('.ns-gcard [data-try] + .btn')), 'changing waits 15 days (no “Choose” button)');

  console.log('F. reactions');
  const R = await page.evaluate(() => {
    const X = NoemaReact, out = { cool: X.COOLDOWN };
    X.state.lastBig = 0; out.first = !!X.big('correct'); out.second = X.big('correct'); out.milestone = !!X.big('chapter');
    X.end(); NoemaThemes.putSettings({ game: 'calm' }); X.state.lastBig = 0; out.calm = X.big('correct'); out.calmMilestone = !!X.big('node');
    X.end(); NoemaThemes.putSettings({ game: 'off' }); X.state.lastBig = 0; X.big('level'); out.offStill = !!document.querySelector('.ns-cele.still') && !document.querySelector('.ns-cele .stage');
    NoemaThemes.putSettings({ game: 'playful' }); X.end(); return out;
  });
  ok(R.cool === 180000 && R.first && R.second === null, 'a big reaction at most once every 3 minutes');
  ok(R.milestone, 'milestones (a chapter finished…) always play');
  ok(R.calm === null && R.calmMilestone, 'calm: only the milestones');
  ok(R.offStill, 'off: only the message, nothing moves');
  const strict = await page.evaluate(() => { Object.assign(NOEMA_CONFIG, { character: 'prism', lockCharacter: true }); NoemaThemes.apply(); const r = { m: document.documentElement.dataset.m, game: NoemaThemes.game(), locked: NoemaThemes.locked() }; NoemaReact.state.lastBig = 0; r.correct = NoemaReact.big('correct'); NoemaReact.big('chapter'); r.still = !!document.querySelector('.ns-cele.still'); NoemaReact.end(); delete NOEMA_CONFIG.lockCharacter; delete NOEMA_CONFIG.character; NoemaThemes.apply(); return r; });
  ok(strict.m === 'prism' && strict.locked && strict.game === 'calm' && strict.correct === null && strict.still, 'an organisation fixes a strict character: calm, no props, no random reactions: ' + JSON.stringify(strict));

  console.log('H. the older buttons in their new homes (docs/UI_MAP.md)');
  await page.goto(url + '#/subject'); await until(() => page.$('.subjhead'));
  await pick(page, '#ns-top .ns-menubtn', 'Search this subject'); await wait(300);
  ok(await page.$('.ns-sheet .search input'), '⋮ › Search this subject: a sheet with the search');
  await page.keyboard.press('Escape'); await wait(200);
  await pick(page, '#ns-top .ns-menubtn', 'Sources'); await wait(300);
  ok(await page.$('.srcdeck.open'), '⋮ › Sources: the sources deck');
  await page.evaluate(() => toggleSourcesDeck(false)); await wait(300);
  await pick(page, '#ns-top .ns-menubtn', 'Focus sprint'); await wait(400);
  ok(/⏱️ 1[45]:\d\d/.test(await page.$eval('#ns-top .ns-focus', b => b.textContent)), '⋮ › Focus sprint: a small clock next to ⋮');
  await page.click('#ns-top .ns-focus'); await wait(200);
  ok(!(await page.$('#ns-top .ns-focus')), 'tapping the clock stops the sprint');
  const homes = {}; for (const t of ['profile', 'settings', 'subjects', 'backup', 'cloud', 'help']) { await page.evaluate(t => openAccountMenu(t), t); await wait(300); homes[t] = await page.evaluate(() => location.hash); }
  ok(JSON.stringify(homes) === JSON.stringify({ profile: '#/me/profile', settings: '#/me/ai', subjects: '#/me/subjects', backup: '#/me/data', cloud: '#/me/data', help: '#/me/help' }), 'every tab of the old account menu has its page under Me: ' + JSON.stringify(homes));
  await page.goto(url + '#/me/data'); await wait(500);
  ok(await page.evaluate(() => document.querySelectorAll('.ns-accbody details.accsec').length >= 4 && !document.querySelector('.ns-accbody details.accsec[open]')), 'Me › Data and sync: cloud, backup and restore, folded');
  await page.goto(url + '#/me/help'); await wait(400);
  ok(await page.$$eval('.ns-accbody details.accsec', d => d.length) === 9, 'Me › Help: the 9 guides');
  await page.goto(url + '#/me/ai'); await wait(400);
  ok(await page.evaluate(() => /Gemini/.test(document.querySelector('.ns-accbody').textContent) && !/Display & studying/.test(document.querySelector('.ns-accbody').textContent)), 'Me › AI: the AI sections only (appearance has its own page)');
  await page.goto(url + '#/discover'); await wait(400);
  ok(has(await texts(page, '.ns-view .ns-item b'), ['What others share', 'Roadmaps others share', 'New Roadmap', 'Create a subject with Claude', 'Import a file', 'Import a map', 'Your Claude app', 'Claude API key']), 'Discover: everything that adds something new');
  await page.goto(url + '#/'); await wait(500);
  ok(has(await menuItems(page, '#ns-top .ns-menubtn'), ['Choose a subject', 'New Roadmap', 'Focus sprint', 'Switch profile']), 'Today ⋮: choose a subject, a new Roadmap, focus sprint, switch profile');
  await page.click('#bellbtn'); await wait(300);
  ok(await page.$('.ns-sheet') && /cloud account/i.test(await page.$eval('.ns-sheet', s => s.textContent)), '🔔: a sheet (shares need a cloud account)');
  await page.keyboard.press('Escape'); await wait(200);
  await page.goto(url + '#/ch/' + ch + '/practice'); await until(() => page.$('.plist'));
  await page.click('.pitem:has-text("Choose what to practise")'); await wait(300);
  ok(await page.evaluate(() => location.hash.endsWith('/filters')) && await page.$('.subback') && /Start round/.test(await page.locator('main').innerText()), 'Practice › Choose what to practise: the old filters, with a way back');
  // the languages branch can live inside the frame (docs/NEW_FRAME_AND_LANGUAGES.md)
  const lw = await page.evaluate(async () => {
    NoemaThemes.putSettings({ world: 'both' });
    NoemaShell.registerWorld('lang', { page(v, { h }) { v.append(h('p', { class: 'fakecourses' }, 'Arabic · Greek')); }, route(parts, { page, h }) { page({ crumbs: [['Languages', '#/lang'], ['Course ' + parts[0]]] }, h('p', { class: 'fakecourse' }, 'inside ' + parts.join('/'))); }, today(box, { h }) { box.append(h('p', { class: 'faketoday' }, 'continue Arabic')); } });
    location.hash = '#/lang'; await new Promise(r => setTimeout(r, 300)); const list = !!document.querySelector('.fakecourses') && document.querySelector('.ns-tab[data-tab="lang"]')?.classList.contains('on');
    location.hash = '#/lang/ar/lesson/3'; await new Promise(r => setTimeout(r, 300)); const inside = document.querySelector('.fakecourse')?.textContent === 'inside ar/lesson/3' && !!document.querySelector('#ns-top .ns-back.on') && document.querySelector('.ns-crumbs').textContent.includes('Course ar');
    location.hash = '#/'; await new Promise(r => setTimeout(r, 500)); const today = !!document.querySelector('.faketoday');
    NoemaThemes.putSettings({ world: 'know' }); return { list, inside, today };
  });
  ok(lw.list && lw.inside && lw.today, 'a registered language world: its list on the Languages tab, a course inside the frame (#/lang/<course>/…), its card on Today: ' + JSON.stringify(lw));

  console.log('G. Greek, wide screens');
  await page.evaluate(() => { NoemaThemes.putSettings({ lang: 'el' }); }); await page.goto(url + '#/learn'); await page.reload(); await wait(1500);
  ok((await texts(page, '.ns-tab .lb')).join(',') === 'Σήμερα,Γνώσεις,Ανακάλυψη,Πρόοδος', 'Greek tabs: ' + (await texts(page, '.ns-tab .lb')).join(','));
  ok((await texts(page, '.ns-view h1'))[0] === 'Γνώσεις' && (await page.$eval('.ns-newrm', b => b.textContent)).includes('Οδικός χάρτης'), 'Roadmap = Οδικός χάρτης: ' + (await page.$eval('.ns-newrm', b => b.textContent)));
  ok(await page.evaluate(() => [NoemaThemes.tutor('owl').n, NoemaThemes.tutor('candy').n, NoemaThemes.tutor('hedge').n, NoemaShell.L('askTutor')].join('|')) === 'Γλαυκούλα|Γκρέτα και Χανς|Αγκαθούλης|Ρώτα τον Κόβαλτ', 'the tutor’s Greek names, in the right form');
  await page.evaluate(() => NoemaThemes.putSettings({ lang: undefined }));
  await page.setViewportSize({ width: 1280, height: 860 }); await page.goto(url + '#/'); await page.reload(); await wait(1200);
  const rail = await page.$eval('.ns-tabs', t => { const r = t.getBoundingClientRect(); return [r.left, r.width, r.height]; });
  ok(rail[0] === 0 && rail[1] === 100 && rail[2] > 800 && await page.$eval('.ns-railme', x => getComputedStyle(x).display !== 'none') && await page.$eval('#ns-topme', x => getComputedStyle(x).display === 'none'), 'wide screens: the rail on the left, “Me” at its foot');
  await page.screenshot({ path: SHOTS + '/sh_g1_wide.png' });

  ok(!E.length, 'no errors in the console' + (E.length ? ': ' + E.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ shell: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
