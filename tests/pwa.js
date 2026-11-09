/* The installable app (PWA): the web manifest and its icons, the ONE service worker (src/composition/sw.ts → the site's /sw.js),
   offline after the first visit, Supabase calls never cached, a new deploy → "A new version is ready" (build/pwa.js) and the
   older build's caches deleted.
   Usage: node tests/pwa.js [repo-dir]   (its built site dist/site: python3 tools/build.py site; tests/run_e2e.sh passes "$T")
   It serves a copy of the site with the service worker switched on (the suites' config switches it off). PW=<playwright> */
const path = require('path'), fs = require('fs'), os = require('os'), { pathToFileURL } = require('url');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SITE0 = path.join(ROOT, 'dist', 'site');
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { void e; } await wait(150); } return false; };
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; return c; };

(async () => {
  if (!fs.existsSync(path.join(SITE0, 'sw.js'))) throw new Error('no built site with its service worker: python3 tools/build.py site (in ' + ROOT + ')');
  const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-pwa-'));
  fs.cpSync(SITE0, SITE, { recursive: true });
  fs.appendFileSync(path.join(SITE, 'config.js'), '\nObject.assign(window.NOEMA_CONFIG, { pwa: true });   // tests/pwa.js: the service worker on\n');
  const { serve } = await import(pathToFileURL(path.join(__dirname, '..', 'tools', 'serve.mjs')).href);
  const srv = await serve(SITE), url = srv.url + '/';

  console.log('— the web manifest');
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const man = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8'));
  ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html) && /<meta name="theme-color"/.test(html), 'index.html names the manifest and the theme colours');
  const sizes = man.icons.filter(i => i.type === 'image/png').map(i => i.sizes);
  ok(man.name && man.short_name && man.start_url && man.display === 'standalone' && man.theme_color && man.background_color && sizes.includes('192x192') && sizes.includes('512x512')
    && man.icons.some(i => i.purpose === 'maskable') && man.icons.every(i => fs.existsSync(path.join(SITE, i.src))), 'installable: name, start, standalone, colours, 192 and 512 px icons, a maskable one, every icon file there');
  const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8'), cfg = JSON.parse(sw.match(/^self\.NOEMA_SW = (.*);$/m)[1]);
  ok(/^[0-9a-f]{16}$/.test(cfg.version) && cfg.shell.includes('index.html') && cfg.shell.includes('engine/engine.js') && !cfg.shell.some(f => f.startsWith('library/')), `the precache list: ${cfg.shell.length} files of the app shell, versioned (${cfg.version}), no packs`);
  ok(!fs.existsSync(path.join(SITE, 'engine', 'pyodide-sw.js')), 'one service worker: the Python files go through /sw.js too');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage(), E = []; page.on('pageerror', e => E.push(e.message));

  console.log('— the first visit');
  await page.goto(url); await wait(800);
  ok(await until(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))?.active)), 'the service worker is installed and active');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/')).scope);
  ok(scope === srv.url + '/', 'its scope is the whole site: ' + scope);
  await page.reload(); await wait(800);
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'it controls the page after a reload');
  const caches1 = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname); return out; });
  const shellKey = 'noema-shell-' + cfg.version;
  ok(caches1[shellKey] && caches1[shellKey].includes('/index.html') && caches1[shellKey].includes('/engine/engine.js') && caches1[shellKey].length === cfg.shell.length, `the app shell is precached (${(caches1[shellKey] || []).length} files)`);
  await page.evaluate(() => fetch('/rest/v1/kv?select=*').catch(() => null)); await page.evaluate(() => fetch('/build.json').catch(() => null));
  const all1 = Object.values(await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname); return out; })).flat();
  ok(!all1.some(p => p.startsWith('/rest/') || p === '/build.json'), 'never cached: Supabase calls and build.json');
  ok(caches1['noema-data-v1'] ? caches1['noema-data-v1'].includes('/library/registry.js') : true, 'packs and data: network first, kept for offline (noema-data-v1)');

  console.log('— offline');
  await ctx.setOffline(true);
  await page.reload(); await wait(1500);
  ok(await page.evaluate(() => !!window.Noema && !!document.querySelector('.noema-overlay, .ns-tab, main')), 'the app opens offline (from the service worker): its first screen is there');
  ok(await page.evaluate(() => typeof window.NoemaI18n?.t === 'function' && typeof window.NOEMA_REGISTRY === 'object'), 'its scripts and the catalogue of subjects came from the caches');
  await ctx.setOffline(false);

  console.log('— a new deploy (at 320 px)');
  await page.setViewportSize({ width: 320, height: 700 });
  const oldVersion = cfg.version, newVersion = 'f'.repeat(16);
  fs.writeFileSync(path.join(SITE, 'sw.js'), sw.replace(`"version":"${oldVersion}"`, `"version":"${newVersion}"`));
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration('/')).update(); });
  ok(await until(() => page.$('#noema-pwa-update')), 'the open tab is told: a new version is ready');
  const note = await page.evaluate(() => { const b = document.getElementById('noema-pwa-update'); return b ? { text: b.textContent, buttons: [...b.querySelectorAll('button')].map(x => x.textContent), role: b.getAttribute('role') } : null; });
  ok(note && /A new version is ready/.test(note.text) && note.buttons.join('|') === 'Reload|Later' && note.role === 'status', 'its words come from the UI catalogs (loader.pwa.*) ' + JSON.stringify(note));
  ok(await page.evaluate(() => document.getElementById('noema-pwa-update').getBoundingClientRect().right <= innerWidth && document.documentElement.scrollWidth <= innerWidth), 'the note fits 320 px (no horizontal scroll)');
  ok(await until(async () => { const k = await page.evaluate(() => caches.keys()); return k.includes('noema-shell-' + newVersion) && !k.includes(shellKey); }), "the older build's caches are deleted when the new worker takes over");
  await page.click('#noema-pwa-update button'); await wait(1200);
  ok(!(await page.$('#noema-pwa-update')) && await page.evaluate(() => !!window.Noema), 'Reload opens the new version');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));

  await browser.close(); await srv.close(); fs.rmSync(SITE, { recursive: true, force: true });
  console.log(fails ? `\n✗ pwa: ${fails} of ${n} failed` : `\n✓ pwa: ${n} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
