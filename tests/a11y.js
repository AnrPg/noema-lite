/* Accessibility of the main pages (axe-core through @axe-core/playwright; the WCAG 2.0/2.1/2.2 A and AA rules), in the app's frame:
   the start screen (Today), a subject's chapter, the settings, the language course's home (the polyglot course) and a word's
   card in it, at desktop width and at 320 px; then the chapter and the two language screens for three characters (robot; litF, whose art draws
   letters; fruit, the palest accent) in light and dark, so neither a character's colours and art nor a chapter's colour can fail.
   Fails on every violation axe rates serious or critical (moderate and minor ones are listed, not failed).
   Usage: node tests/a11y.js [prepared-repo-dir]   (tests/run_e2e.sh passes its prepared copy, which has the demo-physics subject;
   on the repo alone the Databricks subject is used)   PW=<path to playwright> */
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const { appUrl } = require('./serve');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SUBJECT = fs.existsSync(path.join(ROOT, 'library', 'subjects', 'demo-physics')) ? 'demo-physics' : 'databricks';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };

/** the first chapter of the subject (its id, as the route #/ch/<id> names it) */
function firstChapter() {
  const dir = path.join(ROOT, 'library', 'subjects', SUBJECT, 'chapters');
  const f = fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()[0];
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id;
}

(async () => {
  const url = await appUrl(ROOT), ch = firstChapter();
  // the library's polyglot course (library/languages), its languages studied: its combined home, and a word's card (links)
  const COURSE = fs.readdirSync(path.join(ROOT, 'library', 'languages')).filter(d => !d.startsWith('_')).sort()[0];
  const LANGS = { world: 'both', studyLangs: ['ar', 'he', 'zh', 'de'] };
  const TODAY = { name: 'start screen (Today)', at: '' },
    CHAPTER = { name: `a subject's chapter (${SUBJECT} › ${ch})`, at: `?subject=${SUBJECT}#/ch/${ch}` },
    SETTINGS = { name: 'settings (Me › AI and settings)', at: '#/me/ai' },
    LANG = { name: `the language-course home (#/lang/${COURSE})`, at: `#/lang/${COURSE}`, settings: LANGS, ready: '.lx-fhome', wait: 1500 },
    WORD = { name: "a word's card in the course (#/lang/he/c/person.teacher)", at: '#/lang/he/c/person.teacher', settings: LANGS, ready: '.lx-others', wait: 1500 };
  const robot = pages => pages.map(p => ({ ...p, character: 'robot' }));
  const RUNS = [
    { label: 'desktop', viewport: { width: 1280, height: 900 }, pages: robot([TODAY, CHAPTER, SETTINGS, LANG, WORD]) },
    { label: '320 px', viewport: { width: 320, height: 700 }, pages: robot([TODAY, CHAPTER, SETTINGS, LANG, WORD]) },
    ...['light', 'dark'].map(scheme => ({
      label: `three characters, ${scheme}`, viewport: { width: 1280, height: 900 }, colorScheme: scheme,
      pages: ['robot', 'litF', 'fruit'].flatMap(character => [CHAPTER, LANG, WORD].map(p => ({ ...p, name: `${character}: ${p.name}`, character }))),
    })),
  ];
  const browser = await chromium.launch();
  for (const run of RUNS) {
    console.log(`— ${run.label}`);
    const ctx = await browser.newContext({ viewport: run.viewport, colorScheme: run.colorScheme || 'light' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));   // no network: the fonts' CSS answered empty
    const page = await ctx.newPage(), E = []; page.on('pageerror', e => E.push(e.message));
    // the app's frame, past the first-time questions (a learner who has used it before)
    await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload(); await wait(900);
    for (const pg of run.pages) {
      const settings = { lang: 'en', world: 'know', character: pg.character, onboarded: Date.now(), ...(pg.settings || {}) };
      await page.evaluate(s => { const id = window.Noema?.account?.id; if (id) localStorage.setItem(`noema1:${id}:a:settings`, JSON.stringify(s)); }, settings);
      await page.goto(url + pg.at); await page.reload();
      const ready = !pg.ready || await page.waitForSelector(pg.ready, { timeout: 25000 }).then(() => true, () => false);
      await wait(pg.wait || 1500);
      const [m, scheme] = await page.evaluate(() => [document.documentElement.dataset.m, matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light']);
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = res.violations.filter(v => BLOCKING.has(v.impact || ''));
      const minor = res.violations.filter(v => !BLOCKING.has(v.impact || ''));
      const show = v => `${v.id} (${v.impact}, ${v.nodes.length}×: ${v.nodes.slice(0, 2).map(x => x.target.join(' ')).join(' | ')}) — ${v.help}`;
      for (const v of minor) console.log(`     · ${show(v)}`);
      ok(ready && m === pg.character && !bad.length, `${pg.name} [${m}, ${scheme}]: no serious or critical violation${ready ? '' : ` (${pg.ready} never showed)`}${m === pg.character ? '' : ` (the character on screen is not ${pg.character})`}${bad.length ? '\n       ' + bad.map(show).join('\n       ') : ''} (${res.passes.length} rules pass)`);
    }
    ok(!E.length, `no page errors on these screens${E.length ? ': ' + JSON.stringify([...new Set(E)].slice(0, 3)) : ''}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n✗ a11y: ${fails} of ${n} failed` : `\n✓ a11y: ${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
