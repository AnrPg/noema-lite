/* Subject packs in several languages (docs/i18n.md §10, tools/CONTENT_SPEC.md "Packs in several languages"), Playwright + Chromium.
   The demo-physics fixture offers its metadata in el and fr (subject.i18n) and its chapter in fr (translations/fr/ch01.json):
     A. classic picker: en → the English title, no language tag; el → the Greek title + an “EN” tag (the content stays English);
        fr → the French title and the French chapter (same ids, the tutor answers in French); ru → English title + tag
     B. the new frame in el: the Shelf, Explore and the subject's home show the Greek title with the tag
     C. the pack itself: schema v2, translations travel with the pack, packcheck accepts it and refuses a broken translation
   Usage: node tests/pack_i18n.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const EL = 'Φυσική (δοκιμή)', FR = 'Physique (démo)';

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + ROOT + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); const E = []; page.on('pageerror', e => E.push(e.message));
  const as = async (lang, extra = {}) => {   // leave the page first: an open subject saves its settings when it unloads
    await page.goto('about:blank'); await page.goto(url); await wait(300);
    await page.evaluate(({ lang, extra }) => { localStorage.clear(); if (extra.newUI) localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ lang, ...(extra.newUI ? { onboarded: Date.now(), world: 'know', character: 'owl' } : {}) })); localStorage.setItem('noema1:current', JSON.stringify({ acc: 'anr' })); }, { lang, extra });
    await page.goto('about:blank'); await page.goto(url); await wait(900);
  };
  const chip = () => page.evaluate(() => [...document.querySelectorAll('.noema-chip')].map(c => ({ t: c.querySelector('.t')?.textContent || '', tag: c.querySelector('.noema-langtag')?.textContent || '', tip: c.querySelector('.noema-langtag')?.title || '' })));
  await page.goto(url);

  console.log('A. the subject picker and the subject in four UI languages');
  await as('en');
  let cs = await chip();
  ok(cs.some(c => c.t === 'Demo Physics' && !c.tag) && !cs.some(c => c.tag), 'en: “Demo Physics”, no language tag anywhere: ' + cs.map(c => c.t).join(' | '));
  await as('el');
  cs = await chip();
  const g = cs.find(c => c.t === EL);
  ok(!!g && g.tag === 'EN' && /Αγγλικ/.test(g.tip), `el: the Greek title with an “EN” tag (${g && g.tip})`);
  ok(cs.some(c => c.t === 'Databricks' && c.tag === 'EN'), 'el: a pack without translations keeps its title and shows its language');
  await page.click(`.noema-chip:has-text("${EL}")`); await wait(1500);
  let st = await page.evaluate(() => ({ title: SUBJ.title, lang: SUBJ.language, ch: COURSE[0].title, head: document.querySelector('.herohead')?.textContent, tag: document.querySelector('.herohead .noema-langtag')?.textContent, doc: document.title }));
  ok(st.title === EL && st.lang === 'en' && st.ch === 'Energy', 'el: the subject opens with the Greek name, the content stays English (no el content): ' + JSON.stringify(st));
  ok(st.head.startsWith(EL) && st.tag === 'EN' && st.doc.startsWith(EL), 'el: the home screen and the page title show the Greek name, the tag says the content is English');

  await as('fr');
  cs = await chip();
  ok(cs.some(c => c.t === FR && !c.tag), "fr: the French title, no tag (the content exists in French): " + JSON.stringify(cs));
  await page.click(`.noema-chip:has-text("${FR}")`); await wait(1500);
  st = await page.evaluate(() => ({ title: SUBJ.title, lang: SUBJ.language, src: SUBJ.sourceLanguage, ch: COURSE[0].title, sec: COURSE[0].sections[0].title, opt: EX['ch01-e108'].options[0], ans: EX['ch01-e108'].answer, ids: ALL_EX.map(e => e.id).join(), dom: SUBJ.tutor.domain, name: SUBJ.tutor.name, chSrc: COURSE[0].src, tag: !!document.querySelector('.herohead .noema-langtag') }));
  ok(st.title === FR && st.lang === 'fr' && st.src === 'en' && st.ch === 'Énergie' && st.sec === 'Énergie cinétique' && !st.tag, 'fr: the chapter is the French translation, the content language is fr: ' + JSON.stringify({ ch: st.ch, lang: st.lang }));
  ok(st.opt === 'Une centrale électrique' && st.ans === 0 && st.ids.includes('ch01-e111') && st.chSrc === 's1', 'fr: same exercise ids and answers (progress is shared), the source mapping is kept');
  ok(st.dom === 'physique' && st.name === 'Ada', 'fr: the tutor fields of subject.i18n.fr apply, the others stay');
  await as('en');
  await page.click('.noema-chip:has-text("Demo Physics")'); await wait(1500);
  ok(await page.evaluate(() => COURSE[0].title === 'Energy' && SUBJ.language === 'en'), 'back in en: the English chapter (the UI language picks the version; the pack is unchanged)');

  await as('ru');
  cs = await chip();
  ok(cs.some(c => c.t === 'Demo Physics' && c.tag === 'EN'), 'ru (no translation): the pack’s own title with the “EN” tag');

  console.log('B. the new frame in el: Shelf, Explore, home');
  await as('el', { newUI: true });
  await page.evaluate(() => { location.hash = '#/shelf'; }); await until(() => page.$('[data-subject="demo-physics"]'));
  const row = await page.evaluate(() => { const r = document.querySelector('[data-subject="demo-physics"]'); return { t: r?.querySelector('b')?.textContent || '', tag: r?.querySelector('.noema-langtag')?.textContent || '' }; });
  ok(row.t.startsWith(EL) && row.tag === 'EN', 'the Shelf shows the Greek title with the tag: ' + JSON.stringify(row));
  await page.evaluate(() => { location.hash = '#/explore/subjects'; }); await until(() => page.$('.ns-pubitem[data-id="demo-physics"]'));
  const ex = await page.evaluate(() => { const r = document.querySelector('.ns-pubitem[data-id="demo-physics"]'); return { t: r?.querySelector('b')?.textContent || '', d: r?.querySelector('small')?.textContent || '', tag: r?.querySelector('.noema-langtag')?.textContent || '' }; });
  ok(ex.t.startsWith(EL) && ex.d === 'Δοκιμαστικό πακέτο με μαθηματικά.' && ex.tag === 'EN', 'Explore shows the Greek title and description with the tag: ' + JSON.stringify(ex));
  await page.evaluate(() => { location.hash = '#/shelf'; }); await until(() => page.$('[data-subject="demo-physics"]'));
  await page.click('[data-subject="demo-physics"]'); await until(() => page.$('.herohead'));
  ok(await until(() => page.evaluate(n => (document.querySelector('.herohead')?.textContent || '').startsWith(n) && !!document.querySelector('.herohead .noema-langtag'), EL)), 'the subject’s home in the frame: the Greek title with the tag');

  console.log('C. the pack: schema v2, packcheck');
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  const tr = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/tr.fr.json'), 'utf8'));
  ok(pack.v === 2 && pack.subject.i18n?.el?.title === EL && pack.translations?.fr?.file === true && pack.translations.fr.chapters === 1 && !pack.translations.fr.chapters?.length, 'pack.json: v 2, subject.i18n, translations.fr only a stub (the chapters live in their own file)');
  ok(tr.format === 'noema-translation' && tr.pack === 'demo-physics' && tr.locale === 'fr' && tr.chapters?.[0]?.title === 'Énergie' && tr.chapters[0].src === 's1' && fs.existsSync(path.join(ROOT, 'library/subjects/demo-physics/tr.fr.js')), 'tr.fr.json (and tr.fr.js): the French chapters with the source mapping, downloaded only by French learners');
  const reg = fs.readFileSync(path.join(ROOT, 'library/registry.js'), 'utf8');
  ok(reg.includes('"contentLocales"') && reg.includes(EL) && reg.includes('"trLocales"'), 'the registry carries the metadata translations, the content languages and where each translation file is');
  const pc = await page.evaluate(([p, t]) => {
    const a = NoemaPackCheck.checkPack(p), at = NoemaPackCheck.checkTranslation(t, p);
    const inl = JSON.parse(JSON.stringify(p)); inl.translations.fr = { chapters: t.chapters };
    const b = JSON.parse(JSON.stringify(inl)); b.translations.fr.chapters[0].exercises[2].answer = 2; b.translations.fr.chapters[0].exercises.pop(); b.subject.i18n.xx_1 = { title: 'x' }; b.subject.i18n.el.colour = 'x';
    const bt = JSON.parse(JSON.stringify(t)); bt.chapters[0].exercises[2].answer = 2; bt.locale = 'en';
    return { a: a.errors.concat(at.errors), inl: NoemaPackCheck.checkPack(inl).errors, c: NoemaPackCheck.checkPack(b).errors, ct: NoemaPackCheck.checkTranslation(bt, p).errors, req: NoemaPackCheck.requiredLocales('el') };
  }, [pack, tr]).catch(e => ({ err: e.message }));
  ok(pc.a && !pc.a.length && pc.inl && !pc.inl.length, 'packcheck accepts the fixture pack, its translation file, and the same translation inline (older packs): ' + JSON.stringify(pc.a || pc.err));
  ok(pc.c && ['answer differs', 'exercises missing', 'not a locale code', 'unknown field'].every(w => pc.c.some(x => x.includes(w))), 'packcheck refuses a broken inline translation: ' + JSON.stringify(pc.c));
  ok(pc.ct && pc.ct.some(x => x.includes('answer differs')) && pc.ct.some(x => /locale/.test(x)), 'checkTranslation refuses a broken translation file (changed answer, wrong locale): ' + JSON.stringify(pc.ct));
  ok(JSON.stringify(pc.req) === JSON.stringify({ translations: ['en', 'ru'], bridges: ['en', 'ru', 'ar'] }), 'a Greek pack needs translations into en, ru and bridges into en, ru, ar: ' + JSON.stringify(pc.req));

  ok(!E.length, 'no page errors: ' + E.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
