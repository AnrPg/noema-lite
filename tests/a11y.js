/* Accessibility of the main pages (axe-core through @axe-core/playwright; the WCAG 2.0/2.1/2.2 A and AA rules):
   the start screen (Today), a subject's chapter and the settings, at desktop width and at 320 px, in the app's frame.
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
  const PAGES = [
    { name: 'start screen (Today)', at: '' },
    { name: `a subject's chapter (${SUBJECT} › ${ch})`, at: `?subject=${SUBJECT}#/ch/${ch}` },
    { name: 'settings (Me › AI and settings)', at: '#/me/ai' },
  ];
  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900, label: 'desktop' }, { width: 320, height: 700, label: '320 px' }]) {
    console.log(`— ${vp.label}`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));   // no network: the fonts' CSS answered empty
    const page = await ctx.newPage(), E = []; page.on('pageerror', e => E.push(e.message));
    // the app's frame, past the first-time questions (a learner who has used it before)
    await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload(); await wait(900);
    await page.evaluate(() => { const id = window.Noema?.account?.id; if (id) localStorage.setItem(`noema1:${id}:a:settings`, JSON.stringify({ lang: 'en', world: 'know', character: 'robot', onboarded: Date.now() })); });
    for (const pg of PAGES) {
      await page.goto(url + pg.at); await page.reload(); await wait(1500);
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = res.violations.filter(v => BLOCKING.has(v.impact || ''));
      const minor = res.violations.filter(v => !BLOCKING.has(v.impact || ''));
      const show = v => `${v.id} (${v.impact}, ${v.nodes.length}×: ${v.nodes.slice(0, 2).map(x => x.target.join(' ')).join(' | ')}) — ${v.help}`;
      for (const v of minor) console.log(`     · ${show(v)}`);
      ok(!bad.length, `${pg.name}: no serious or critical violation${bad.length ? '\n       ' + bad.map(show).join('\n       ') : ''} (${res.passes.length} rules pass)`);
    }
    ok(!E.length, `no page errors on these screens${E.length ? ': ' + JSON.stringify([...new Set(E)].slice(0, 3)) : ''}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n✗ a11y: ${fails} of ${n} failed` : `\n✓ a11y: ${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
