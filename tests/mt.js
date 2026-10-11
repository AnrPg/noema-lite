/* 🌐 Machine translation of shared content (engine/mt.js, docs/i18n.md §11) with a mocked provider:
     A. defaults (off, no provider without an own key), own keys only (Claude / Gemini; never the app's default key)
     B. cheap language detection (script + stored field + function words)
     C. policy: only public kinds; private / sensitive items and personal data are never sent; off = nothing sent
     D. translation + cache hits (per hash and target), duplicates sent once, the cache survives a reload
     E. caps: characters per day, requests per session, requests per minute; the cost estimate
     F. UI: the per-item toggle (Translate / Show original, machine-translated badge), the bar with the estimate before a bulk
        translation, the consent dialog when it is off, the hint without a key, the Greek UI
   Usage: node tests/mt.js <prepared-repo-dir>   (served from dist/site, so the built catalogs are used) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SITE = fs.existsSync(path.join(ROOT, 'dist', 'site', 'engine', 'mt.js')) ? path.join(ROOT, 'dist', 'site') : ROOT;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>window.NOEMA_CONFIG = { mtPerMinute: 100 }; localStorage.setItem('noema1:current', JSON.stringify({ acc: 'tester' }));</script>
<script src="engine/vendor/intl-messageformat.iife.js"></script><script src="engine/i18n/en.js"></script><script src="engine/i18n.js"></script>
<script src="engine/mt.js"></script></body></html>`;

(async () => {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/' || u === '/mt.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(PAGE); }
    const f = path.join(SITE, path.normalize(u).replace(/^([/\\])+/, ''));
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const BASE = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { console.log('  page error: ' + e.message); fails++; });
  await page.goto(BASE + '/mt.html');
  await page.waitForFunction(() => window.NoemaMT && window.NoemaI18n);
  // the mock provider: records every text it receives, answers "[en] <text>"
  const mock = () => page.evaluate(() => { window.SENT = []; window.CALLS = 0; NoemaMT.useProvider({ label: 'Mock', translate: async (acc, texts, o) => { CALLS++; SENT.push(...texts); return { texts: texts.map(t => `[${o.to}] ${t}`) }; } }); });

  console.log('A. defaults and own keys');
  let r = await page.evaluate(() => ({ s: NoemaMT.settings(), p: NoemaMT.provider() }));
  ok(r.s.on === false && r.s.provider === 'auto' && r.s.dailyChars > 0 && r.s.sessionRequests > 0, 'off by default, with caps');
  ok(r.p === null, 'no own key → no provider');
  r = await page.evaluate(() => { window.DEFAULT_GEMINI_KEY = 'AIza-default-key'; localStorage.setItem('noema-device:geminiKey:tester', 'AIza-default-key'); const a = NoemaMT.provider(); localStorage.setItem('noema-device:geminiKey:tester', 'AIza-mine'); const b = NoemaMT.provider(); window.NoemaClaude = { Key: { get: () => 'sk-ant-api03-mine' } }; const c = NoemaMT.provider(); NoemaMT.setSettings(null, { provider: 'gemini' }); const d = NoemaMT.provider(); NoemaMT.setSettings(null, { provider: 'auto' }); delete window.NoemaClaude; localStorage.removeItem('noema-device:geminiKey:tester'); return [a, b?.id, c?.id, d?.id]; });
  ok(r[0] === null, 'the app’s default Gemini key is not the learner’s own');
  ok(r[1] === 'gemini' && r[2] === 'claude' && r[3] === 'gemini', 'own Gemini key → Gemini; with a Claude key → Claude (auto); a chosen provider is respected');

  console.log('B. language detection');
  r = await page.evaluate(() => [NoemaMT.detect('Κινηματική για αρχάριους'), NoemaMT.detect('Механика для начинающих'), NoemaMT.detect('The basics of the cell and its parts'), NoemaMT.detect('Kinematik', 'de'),
    NoemaMT.detect('日本語のテキスト'), NoemaMT.detect('中文课程'), NoemaMT.detect('Les bases de la cellule et du noyau'), NoemaMT.detect('Mechanik'), NoemaMT.detect('Привет', 'uk'), NoemaMT.detect('Physics', 'el')]);
  ok(JSON.stringify(r) === JSON.stringify(['el', 'ru', 'en', 'de', 'ja', 'zh', 'fr', null, 'uk', null]), 'script, stored language, function words: ' + JSON.stringify(r));
  r = await page.evaluate(() => [NoemaMT.differs('Κινηματική', null, 'en'), NoemaMT.differs('Κινηματική', null, 'el'), NoemaMT.differs('Physics', 'en', 'en'), NoemaMT.differs('Physics', 'en', 'el'), NoemaMT.differs('中文', null, 'zh-Hant')]);
  ok(JSON.stringify(r) === '[true,false,false,true,false]', 'differs from the UI locale (zh-Hans = zh-Hant)');

  console.log('C. the policy check');
  await mock();
  r = await page.evaluate(async () => {
    const off = await NoemaMT.translate(['Κινηματική για αρχάριους'], { kind: 'explore.pack', to: 'en' });
    NoemaMT.setSettings(null, { on: true });
    const note = await NoemaMT.translate(['Οι σημειώσεις μου'], { kind: 'note', to: 'en' });
    const none = await NoemaMT.translate(['Οι σημειώσεις μου'], { to: 'en' });
    const items = await NoemaMT.translate([{ text: 'Ιδιωτικό θέμα', private: true }, { text: 'Ευαίσθητο', sensitive: true }, { text: 'Γράψε μου στο maria@example.com' }, { text: 'Τηλέφωνο 210 123 4567 για μαθήματα' }, { text: 'Κλειδί sk-ant-api03-abcdefghijklmnopqrstu' }, { text: 'Ημερομηνία 2026-10-11 και θέμα Φυσική' }], { kind: 'shared.roadmap', to: 'en' });
    return { off: off[0], note: note[0].reason, none: none[0].reason, items: items.map(x => x.reason || (x.translated ? 'ok' : '?')), sent: SENT.slice() };
  });
  ok(r.off.reason === 'off' && !r.off.translated && r.off.text === 'Κινηματική για αρχάριους', 'off → nothing sent, the original');
  ok(r.note === 'policy' && r.none === 'policy', 'a kind that is not public (or none) → refused');
  ok(JSON.stringify(r.items) === JSON.stringify(['private', 'private', 'sensitive', 'sensitive', 'sensitive', 'ok']), 'private / sensitive flags, e-mail, phone, key refused; a date is fine: ' + JSON.stringify(r.items));
  ok(r.sent.length === 1 && r.sent[0].startsWith('Ημερομηνία') && !r.sent.some(t => /Ιδιωτικό|Ευαίσθητο|maria@|210 123|sk-ant/.test(t)), 'only the eligible text reached the provider');

  console.log('D. translation and the cache');
  await mock();
  r = await page.evaluate(async () => {
    NoemaMT.cache.clear();
    const a = await NoemaMT.translate([{ text: 'Κινηματική για αρχάριους' }, { text: 'Μηχανική', language: 'el' }, { text: 'Physics for everyone', language: 'en' }, { text: 'Κινηματική για αρχάριους' }], { kind: 'explore.pack', to: 'en' });
    const calls1 = CALLS, sent1 = SENT.slice();
    const b = await NoemaMT.translate(['Κινηματική για αρχάριους', 'Μηχανική'], { kind: 'explore.pack', to: 'en' });
    const c = await NoemaMT.translate(['Μηχανική'], { kind: 'explore.pack', to: 'fr' });
    return { a, b, c, calls1, sent1, calls: CALLS, size: NoemaMT.cache.size(), stored: !!localStorage.getItem('noema-device:mt:cache:tester') };
  });
  ok(r.calls1 === 1 && r.sent1.length === 2, 'one request, each text once (duplicates and same-language texts not sent)');
  ok(r.a[0].translated && r.a[0].text === '[en] Κινηματική για αρχάριους' && r.a[3].text === r.a[0].text && r.a[2].reason === 'same' && r.a[2].text === 'Physics for everyone', 'results in order, the original kept beside: ' + JSON.stringify(r.a.map(x => x.text)));
  ok(r.b.every(x => x.cached && x.translated) && r.calls === 2, 'second time: cache hits, nothing sent');
  ok(r.c[0].text === '[fr] Μηχανική' && !r.c[0].cached, 'the cache is per target locale');
  ok(r.size === 3 && r.stored, 'saved on this device (3 entries)');
  await page.reload(); await page.waitForFunction(() => window.NoemaMT); await mock();
  r = await page.evaluate(async () => { const x = await NoemaMT.translate(['Μηχανική'], { kind: 'explore.pack', to: 'en' }); return { x: x[0], calls: CALLS }; });
  ok(r.x.cached && r.calls === 0, 'the cache survives a reload');
  r = await page.evaluate(async () => { const t = 'x'.repeat(2000); const pairs = []; for (let i = 0; i < 150; i++) pairs.push({ text: 'Θέμα ' + i, t: t }); NoemaMT.cache.put(null, 'en', pairs); return NoemaMT.cache.all(); });
  ok(Object.values(r).reduce((n, e) => n + e.t.length, 0) <= 250000, 'the cache is size-capped (least recently used out)');
  await page.evaluate(() => NoemaMT.cache.clear());

  console.log('E. caps and the estimate');
  await mock();
  r = await page.evaluate(async () => {
    await NoemaMT.translate(['Κάτι νέο'], { kind: 'explore.pack', to: 'en' }); CALLS = 0;   // one request in this minute
    NoemaMT.setSettings(null, { dailyChars: NoemaMT.usage.day() + 5 });
    const daily = await NoemaMT.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack', to: 'en' });
    NoemaMT.setSettings(null, { dailyChars: 20000, sessionRequests: NoemaMT.usage.session() });
    const sess = await NoemaMT.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack', to: 'en' });
    NoemaMT.setSettings(null, { sessionRequests: 1000 }); window.NOEMA_CONFIG.mtPerMinute = NoemaMT.usage.perMinute();
    const rate = await NoemaMT.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack', to: 'en' });
    window.NOEMA_CONFIG.mtPerMinute = 100;
    const est = NoemaMT.estimate(['Ένα', 'Δύο κείμενα', 'Ένα'], { to: 'en' });
    return { daily: daily[0].reason, sess: sess[0].reason, rate: rate[0].reason, calls: CALLS, est };
  });
  ok(r.daily === 'cap.daily' && r.sess === 'cap.session' && r.rate === 'cap.rate' && r.calls === 0, 'daily characters, session requests, requests per minute: nothing sent over a cap');
  ok(r.est.texts === 2 && r.est.chars === 14 && r.est.usd > 0 && r.est.provider === 'Mock', 'estimate: uncached unique texts, characters, cost, provider: ' + JSON.stringify(r.est));

  console.log('F. the UI');
  await mock();
  await page.evaluate(() => {
    const d = document.createElement('div'); d.id = 'list'; document.body.append(d);
    const mk = (tag, text, language, kind = 'explore.pack') => { const n = document.createElement(tag); n.textContent = text; d.append(n); return NoemaMT.mark(n, { language, kind }); };
    window.N1 = mk('b', 'Κύτταρο και πυρήνας', 'el'); window.N2 = mk('p', 'Μια εισαγωγή στη βιολογία', 'el'); window.N3 = mk('b', 'Cell biology', 'en'); window.N4 = mk('b', 'Γενετική', 'el');
    window.T1 = NoemaMT.toggle(null, [N1, N2]); d.append(T1); window.T3 = NoemaMT.toggle(null, [N3]);
    window.BAR = NoemaMT.bar(null, d); document.body.prepend(BAR);
  });
  r = await page.evaluate(() => ({ t1: !!T1, t3: T3, label: T1.querySelector('button').textContent }));
  ok(r.t1 && r.t3 === null && r.label === '🌐 Translate', 'a toggle only where the language differs from the UI');
  // two texts never translated before → the estimate first (bulk)
  await page.click('#list .mt-btn');
  await page.waitForSelector('#list .mt-estimate');
  r = await page.evaluate(() => ({ est: document.querySelector('#list .mt-estimate').textContent, calls: CALLS }));
  ok(/^Translate 2 texts \(\d+ characters, under \$0\.01\) with Mock\?$/.test(r.est) && r.calls === 0, 'cost estimate before a bulk translation: ' + r.est);
  await page.click('#list .mt-go');
  await page.waitForFunction(() => N1.getAttribute('data-mt-state') === 'mt');
  r = await page.evaluate(() => ({ n1: N1.textContent, badge: N1.nextSibling?.textContent, tip: N1.title, lang: N1.lang, label: T1.querySelector('button').textContent, n4: N4.textContent }));
  ok(r.n1 === '[en] Κύτταρο και πυρήνας' && r.badge === 'machine-translated' && /Machine-translated from Greek by Mock\. Original: Κύτταρο και πυρήνας/.test(r.tip) && r.lang === 'en', 'translated in place, marked machine-translated, the original in the tooltip');
  ok(r.label === '🌐 Show original' && r.n4 === 'Γενετική', 'the toggle says Show original; other items untouched');
  await page.click('#list .mt-btn');
  r = await page.evaluate(() => ({ n1: N1.textContent, n2: N2.textContent, badges: document.querySelectorAll('#list .mt-badge').length, state: N1.getAttribute('data-mt-state'), label: T1.querySelector('button').textContent }));
  ok(r.n1 === 'Κύτταρο και πυρήνας' && r.n2 === 'Μια εισαγωγή στη βιολογία' && !r.badges && !r.state && r.label === '🌐 Translate', 'Show original restores the text and removes the mark');
  // the bar: everything in the list (N1, N2 cached → only N4 is new → no estimate for a single new text)
  r = await page.evaluate(() => ({ hidden: BAR.hidden, label: BAR.querySelector('.mt-all').textContent }));
  ok(!r.hidden && r.label === '🌐 Translate all', 'the bar shows while something needs a translation');
  await page.evaluate(() => { CALLS = 0; SENT = []; });
  await page.click('.mt-all');
  await page.waitForFunction(() => N4.getAttribute('data-mt-state') === 'mt');
  r = await page.evaluate(() => ({ calls: CALLS, sent: SENT, n1: N1.textContent, n3: N3.textContent, note: BAR.querySelector('.mt-note').textContent, label: BAR.querySelector('.mt-all').textContent }));
  ok(r.calls === 1 && JSON.stringify(r.sent) === '["Γενετική"]' && r.n1.startsWith('[en]') && r.n3 === 'Cell biology', 'Translate all: cached texts free, only the new one sent, the English one left');
  ok(r.note === 'Machine translation by Mock: it may contain mistakes.' && r.label === '🌐 Show originals', 'machine-translation note and Show originals');
  // a newly drawn text while the bar is on takes its cached translation
  await page.evaluate(() => { const n = document.createElement('b'); n.textContent = 'Γενετική'; NoemaMT.mark(n, { language: 'el', kind: 'explore.pack' }); document.getElementById('list').append(n); window.N5 = n; });
  await page.waitForFunction(() => N5.getAttribute('data-mt-state') === 'mt');
  ok(true, 'a redrawn item takes the cached translation');
  await page.click('.mt-all');
  r = await page.evaluate(() => [N1, N2, N4, N5].map(n => n.textContent).join('|'));
  ok(r === 'Κύτταρο και πυρήνας|Μια εισαγωγή στη βιολογία|Γενετική|Γενετική', 'Show originals restores every text');
  // a private item never gets a toggle, never reaches the provider
  r = await page.evaluate(() => { const n = document.createElement('b'); n.textContent = 'Οι ιδιωτικές μου σημειώσεις'; NoemaMT.mark(n, { language: 'el', kind: 'explore.pack', private: true }); const m = document.createElement('b'); m.textContent = 'Σημείωση'; NoemaMT.mark(m, { language: 'el', kind: 'note' }); return [NoemaMT.toggle(null, [n]), NoemaMT.toggle(null, [m])]; });
  ok(r[0] === null && r[1] === null, 'no toggle for a private item or a private kind');
  // consent when it is off
  await page.evaluate(() => { NoemaMT.setSettings(null, { on: false }); CALLS = 0; const n = document.createElement('b'); n.textContent = 'Οπτική'; n.id = 'n6'; document.body.append(n); NoemaMT.mark(n, { language: 'el', kind: 'shared.roadmap' }); const t = NoemaMT.toggle(null, [n]); t.id = 't6'; document.body.append(t); });
  await page.click('#t6 .mt-btn');
  await page.waitForSelector('.mt-consent-no');
  r = await page.evaluate(() => document.querySelector('.mt-modal').textContent);
  ok(/never to a noema-lite server/.test(r) && /never sent/.test(r), 'the consent dialog says what is sent where');
  await page.click('.mt-consent-no');
  r = await page.evaluate(() => ({ on: NoemaMT.enabled(), calls: CALLS, t: document.getElementById('n6').textContent }));
  ok(!r.on && r.calls === 0 && r.t === 'Οπτική', 'Cancel: still off, nothing sent');
  await page.click('#t6 .mt-btn'); await page.waitForSelector('.mt-consent-yes'); await page.click('.mt-consent-yes');
  await page.waitForFunction(() => document.getElementById('n6').textContent === '[en] Οπτική');
  ok(await page.evaluate(() => NoemaMT.enabled()), 'Turn on and translate: enabled, translated');
  // no key → the hint, the original
  await page.evaluate(() => { NoemaMT.useProvider(null); const n = document.createElement('b'); n.textContent = 'Θερμοδυναμική'; n.id = 'n7'; document.body.append(n); NoemaMT.mark(n, { language: 'el', kind: 'explore.roadmap' }); const t = NoemaMT.toggle(null, [n]); t.id = 't7'; document.body.append(t); });
  await page.click('#t7 .mt-btn');
  await page.waitForFunction(() => document.querySelector('#t7 .mt-status').textContent.length > 0);
  r = await page.evaluate(() => ({ s: document.querySelector('#t7 .mt-status').textContent, t: document.getElementById('n7').textContent }));
  ok(/^No AI key on this device/.test(r.s) && r.t === 'Θερμοδυναμική', 'no own key: the hint, the original stays');
  // the settings panel
  r = await page.evaluate(() => { const p = NoemaMT.panel(); document.body.append(p); return { cb: p.querySelector('.mt-enable').checked, prov: p.querySelector('.mt-provider').value, txt: p.textContent }; });
  ok(r.cb === true && r.prov === 'auto' && /Machine translation/.test(r.txt) && /Characters per day/.test(r.txt) && /Clear saved translations/.test(r.txt), 'Settings: consent, provider, caps, clear');
  await page.evaluate(() => { const c = document.querySelector('.mt-panel .mt-enable'); c.click(); });
  ok(await page.evaluate(() => !NoemaMT.enabled()), 'Settings: unticking turns it off');
  // the Greek UI: Greek texts need nothing, English ones do; the words come from the catalog
  await mock();
  await page.evaluate(() => { NoemaMT.setSettings(null, { on: true }); return NoemaI18n.use('el'); });
  r = await page.evaluate(() => { const g = document.createElement('b'); g.textContent = 'Κινηματική'; NoemaMT.mark(g, { language: 'el', kind: 'explore.pack' }); const e = document.createElement('b'); e.textContent = 'Kinematics'; NoemaMT.mark(e, { language: 'en', kind: 'explore.pack' }); const t = NoemaMT.toggle(null, [e]); return { g: NoemaMT.toggle(null, [g]), label: t && t.querySelector('button').textContent }; });
  ok(r.g === null && r.label === '🌐 Μετάφραση', 'Greek UI: no toggle on Greek text; the toggle in Greek: ' + r.label);

  await browser.close(); srv.close();
  console.log(fails ? `\n❌ ${fails} failure(s)` : '\n✅ machine translation: all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
