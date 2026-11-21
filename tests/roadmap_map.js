/* 🗺️ The treasure map of a Roadmap (src/features/roadmaps/ui/map.ts + layout.ts), Playwright + Chromium, on the Roadmap page of
   the frame (#/map/<id>), with a real Roadmap of 20 steps and 29 links (tests/fixtures/roadmap_gadgets.json, Greek interface):
     A. desktop: the map uses the width it is given (centred, no empty half), Fit shows it across the width
     B. no path runs through a step's title or number (every label's box is clear of every path)
     C. the titles are whole (no clipped text; each station's tooltip is its full title)
     D. few crossings (at most the fixture's known minimum)
     E. the Roadmap's title is not repeated on the map
     F. 320 px: the page itself never scrolls sideways (only the map pans), the labels are clear of the paths
   Usage: node tests/roadmap_map.js [<prepared-repo-dir>]   (SHOTS=<folder> for the screenshots) */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'roadmap_gadgets.json'), 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };

const seed = (page, F) => page.evaluate(F => {
  const acc = Noema.account.id, nodes = {}, edges = [];
  for (const [id, title, role, pre] of F.steps) {
    nodes[id] = { id, title, role, chapters: [], part: 'core' };
    for (const p of pre) edges.push({ from: p, to: id, why: '' });
  }
  NoemaCurriculum.save(acc, { id: F.id, title: F.title, goal: F.goal, language: F.language, status: 'ready', stage: 'done', provider: 'auto', goalId: F.steps[F.steps.length - 1][0], nodes, edges });
}, F);

/** what the treasure map draws, in page pixels: the label boxes (number + title), the paths (sampled), the stations */
const geometry = page => page.evaluate(() => {
  const deep = (r, s) => r.querySelector(s) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot, s)).find(Boolean) || null;
  const map = deep(document, 'noema-roadmap-map'), R = map.shadowRoot;
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const labels = [...R.querySelectorAll('.cm-st')].map(b => {
    const t = b.querySelector('.cm-t'), c = b.querySelector('.cm-code');
    return { id: b.dataset.id, title: b.getAttribute('title'), t: box(t), c: box(c), clipped: t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1, text: t.textContent.trim() };
  });
  const paths = [...R.querySelectorAll('.cm-tsvg path.cm-e')].map(p => {
    const n = p.getTotalLength(), m = p.getScreenCTM(), pts = [];
    for (let i = 0; i <= 120; i++) { const q = p.getPointAtLength((n * i) / 120); pts.push([q.x * m.a + m.e, q.y * m.d + m.f]); }
    return pts;
  });
  const sc = R.querySelector('.cm-scroll'), cv = R.querySelector('.cm-canvas');
  return { labels, paths, scroll: box(sc), canvas: box(cv), title: R.querySelector('.cm-tlabel')?.textContent ?? '', mapText: R.querySelector('.cm-tmap')?.innerText ?? '', pageScroll: document.documentElement.scrollWidth - innerWidth };
});
const hits = G => {
  const out = [];
  for (const l of G.labels) for (const r of [l.t, l.c]) {
    if (!r.w) continue;
    const pad = 1;
    G.paths.forEach((pts, k) => { if (pts.some(([x, y]) => x > r.x + pad && x < r.x + r.w - pad && y > r.y + pad && y < r.y + r.h - pad)) out.push(l.id); });
  }
  return [...new Set(out)];
};

(async () => {
  const browser = await chromium.launch();
  const url = await appUrl(ROOT);
  const run = async (vp, name) => {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage(); const E = [];
    page.on('pageerror', e => E.push('PAGEERROR ' + e.message));
    await page.goto(url); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload();
    await until(() => page.$('[data-pick="know"]')); await page.click('[data-pick="know"]'); await wait(300); await page.click('[data-onbdone]'); await wait(800);
    await page.evaluate(() => { NoemaThemes.putSettings({ lang: 'el' }); });
    await seed(page, FIX);
    await page.goto(url + '#/map/' + FIX.id); await page.reload();
    await until(() => page.$('noema-roadmap-map .cm-st')); await wait(1200);
    await page.screenshot({ path: `${SHOTS}/map_${name}.png` });
    // the whole map in one picture: a page as tall as the map
    const tall = await page.evaluate(() => { const deep = (r, s) => r.querySelector(s) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot, s)).find(Boolean); return deep(document, 'noema-roadmap-map').shadowRoot.querySelector('.cm-canvas').getBoundingClientRect().height; });
    await page.setViewportSize({ width: vp.width, height: Math.ceil(tall) + 260 }); await wait(700);
    await page.screenshot({ path: `${SHOTS}/map_${name}_whole.png` });
    await page.setViewportSize(vp); await wait(700);
    return { page, ctx, E };
  };

  console.log('— desktop 1512 × 830');
  {
    const { page, ctx, E } = await run({ width: 1512, height: 830 }, 'desktop');
    let G = await geometry(page);
    const used = (G.canvas.w) / G.scroll.w;
    ok(used > 0.8 || G.canvas.w >= G.scroll.w - 40, `the map uses the width it has (${Math.round(G.canvas.w)} of ${Math.round(G.scroll.w)} px)`);
    const mid = G.canvas.x + G.canvas.w / 2, smid = G.scroll.x + G.scroll.w / 2;
    ok(Math.abs(mid - smid) < 30, 'the map is centred in its space');
    const h = hits(G);
    ok(!h.length, 'no path runs through a step’s number or title' + (h.length ? ': ' + h.join(', ') : ''));
    const out = G.paths.flat().filter(([x]) => x < G.canvas.x || x > G.canvas.x + G.canvas.w).length;
    ok(!out, 'every path stays inside the map' + (out ? ` (${out} points outside)` : ''));
    const cl = G.labels.filter(l => l.clipped).map(l => l.id);
    ok(!cl.length, 'every title is whole' + (cl.length ? ': ' + cl.join(', ') : ''));
    ok(G.labels.every(l => l.title && FIX.steps.some(s => s[1] === l.title)), 'each station’s tooltip is its full title');
    ok(!G.mapText.includes(FIX.title) && !G.title, 'the Roadmap’s title is not repeated on the map');
    const cr = await page.evaluate(() => { const deep = (r, s) => r.querySelector(s) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot, s)).find(Boolean); return Number(deep(document, 'noema-roadmap-map').shadowRoot.querySelector('.cm-canvas').dataset.crossings); });
    console.log('    crossings: ' + cr);
    ok(cr <= 5, `few crossings (${cr}; 5 is the least 3000 random restarts found for this layering)`);
    // Fit: the whole map across the width
    await page.evaluate(() => { const deep = (r, s) => r.querySelector(s) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot, s)).find(Boolean); deep(document, 'noema-roadmap-map').shadowRoot.querySelector('.cm-zoom').click(); });
    await wait(300);
    await page.evaluate(() => { const deep = (r, s) => r.querySelector(s) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && deep(e.shadowRoot, s)).find(Boolean); deep(document, 'noema-roadmap-map').shadowRoot.querySelector('.cm-fit').click(); });
    await wait(600);
    G = await geometry(page);
    ok(G.canvas.w >= G.scroll.w * 0.8 && G.canvas.w <= G.scroll.w + 1, `Fit: the map across the width (${Math.round(G.canvas.w)} of ${Math.round(G.scroll.w)} px)`);
    ok(!hits(G).length, 'Fit: still no path through a label');
    await page.screenshot({ path: `${SHOTS}/map_desktop_fit.png` });
    ok(!E.length, 'no errors' + (E.length ? ': ' + E.join(' | ') : ''));
    await ctx.close();
  }

  console.log('— phone 320 × 640');
  {
    const { page, ctx, E } = await run({ width: 320, height: 640 }, 'phone');
    const G = await geometry(page);
    ok(G.pageScroll <= 0, 'the page never scrolls sideways (only the map pans)');
    const h = hits(G);
    ok(!h.length, 'no path runs through a label' + (h.length ? ': ' + h.join(', ') : ''));
    ok(!G.labels.filter(l => l.clipped).length, 'every title is whole');
    ok(!E.length, 'no errors' + (E.length ? ': ' + E.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ the treasure map: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
