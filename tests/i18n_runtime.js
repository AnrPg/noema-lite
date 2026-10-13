/* The runtime i18n audit (docs/i18n.md §5.3): the app in the pseudo-locale en-XA ([Ŝóɱé ţéẋţ ····]) — every catalog
   text is accented and bracketed, so any visible text, title, aria-label, placeholder, alt, dialog or toast that still
   has plain Latin letters was not translated. Visits every surface (classic engine, the new frame, Roadmaps, the
   language course, pickers, cloud sign-in with its errors, dialogs) and fails on any untranslated interface text.
   Course and pack content (the facade, learned-language text), user data, product names and codes are not interface
   text: they are recognised by the content corpus (library/, the fixtures) and a short allow-list below.
   Then the right-to-left pseudo-locale ar-XB: key pages are screenshot (SHOTS/rtl_<width>_<page>.png) and checked:
   right to left, nothing visible sticking out sideways.
   Usage: node tests/i18n_runtime.js <prepared-repo-dir>
   env: SHOTS (screenshots, default /tmp/noema_shots) · I18N_ONLY=BC (some parts: A classic · B frame + Roadmaps ·
   C language course · D cloud · E Create with Claude · F right to left) · I18N_DEBUG=1 (each step, a screenshot when one
   fails) · I18N_SHOTS_ALL=1 (a screenshot after every step) · I18N_REPORT=1 (SHOTS/i18n_runtime_kept.json: everything let
   through as content, a name or data — to look over by hand) · I18N_PORT (the emulator's port, default 54377) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
let shotN = 0; const DEBUG = !!process.env.I18N_DEBUG, only = k => !process.env.I18N_ONLY || process.env.I18N_ONLY.includes(k);   // I18N_ONLY=BC: some parts only
const PORT = +process.env.I18N_PORT || 54377, BASE = `http://localhost:${PORT}`;
const COURSE = 'polyglot-semitic-zh-de';

/* ---------- the content corpus: every string of the packs, courses and fixtures the test shows ---------- */
function corpus() {
  const out = [];
  const strings = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(strings); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x); } };
  const json = f => { try { strings(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { } };
  const gen = f => { const s = fs.readFileSync(f, 'utf8'), i = s.indexOf('= {'); if (i < 0) return; try { strings(JSON.parse(s.slice(i + 2).replace(/;\s*$/, ''))); } catch (e) { for (const m of s.matchAll(/"((?:[^"\\]|\\.)*)"/g)) out.push(JSON.parse('"' + m[1] + '"')); } };
  const walk = (d, f) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, f); else f(p); } };
  walk(path.join(ROOT, 'library'), p => { if (/course\.expl\.\w+\.js$|groups\.json$/.test(p)) return; if (p.endsWith('.json')) json(p); else if (/(pack|profiles|registry)\.js$/.test(p)) gen(p); });
  // texts the language course writes in its explanation language (LE(): docs/i18n.md §1, D19) — English while the UI is a pseudo-locale
  const tpl = [];   // (and langcore's lcX(): lc.expl.*)
  for (const [f, pre] of [['i18n/lang/en.arb', 'lang.expl.'], ['i18n/langcore/en.arb', 'lc.expl.']]) try { const en = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); for (const [k, v] of Object.entries(en)) if (k.startsWith(pre)) { out.push(v); tpl.push(v); } } catch (e) { }
  walk(path.join(ROOT, 'accounts'), p => { if (p.endsWith('.json')) json(p); });
  walk(path.join(ROOT, 'tests/fixtures'), p => { if (p.endsWith('.json')) json(p); else if (p.endsWith('.js')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) out.push(m[2]); });
  return index(out, tpl);
}
/** A quick content lookup: every word, the hashes of every word pair and trigram of the corpus; a run is content when its
    words, pairs or trigrams are there (whole: the short strings and the pieces between markup, matched whole). */
const words = s => String(s).toLowerCase().replace(/[’‘ʼ]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
function index(strings, templates = []) {
  const tri = new Set(), bi = new Set(), uni = new Set(), wild = new Set(), whole = new Set();
  for (const str of strings) {
    const w = words(str);
    if (w.length <= 4) whole.add(w.join(' '));
    for (const piece of str.split(/[\n*`_|#>\[\]():;,.!?"“”«»—–]+|<[^>]+>/)) { const pw = words(piece); if (pw.length && pw.length <= 4) whole.add(pw.join(' ')); }
    for (let i = 0; i < w.length; i++) { uni.add(w[i]); if (i + 1 < w.length) bi.add(fnv(w[i] + ' ' + w[i + 1])); if (i + 2 < w.length) tri.add(fnv(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2])); }
  }
  // messages the course writes in its explanation language with parameters (“Both from {lang} {word}.”): a parameter is a
  // wildcard of up to two words; their trigrams are only used inside the language module (.lx-…)
  for (const m of templates) {
    const w = words(String(m).replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' qqwild qqwild ')).map(x => x === 'qqwild' ? '*' : x);
    for (const x of w) if (x !== '*') uni.add(x);
    for (let i = 0; i + 2 < w.length; i++) if (w[i] !== '*' || w[i + 1] !== '*' || w[i + 2] !== '*') wild.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    for (let i = 0; i + 1 < w.length; i++) if (w[i] !== '*' || w[i + 1] !== '*') wild.add(w[i] + ' ' + w[i + 1]);
  }
  const W = (a, b, c) => wild.has(`${a} ${b} ${c}`) || wild.has(`* ${b} ${c}`) || wild.has(`${a} * ${c}`) || wild.has(`${a} ${b} *`) || wild.has(`${a} * *`) || wild.has(`* * ${c}`) || wild.has(`* ${b} *`);
  const seg = (w, lx) => {
    if (w.length === 1) return uni.has(w[0]);
    if (w.length === 2) return bi.has(fnv(w[0] + ' ' + w[1])) || (lx && (wild.has(w[0] + ' ' + w[1]) || wild.has('* ' + w[1]) || wild.has(w[0] + ' *')));
    let found = 0, total = 0;
    for (let i = 0; i + 2 < w.length; i++) { total++; if (tri.has(fnv(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2])) || (lx && W(w[i], w[i + 1], w[i + 2]))) found++; }
    // all of them; a long run may cross the joins of the code (a title + its text, a snippet that cuts words): three in four
    return found === total || (w.length >= 6 && found / total >= 0.75);
  };
  return { whole: t => whole.has(words(t).join(' ')), has(run, where = '') {
    const lx = /\blx-/.test(where);
    // codes inside a run (C01, S06, Q81, p178, 3rd, numbers) separate it into parts that are checked one by one
    // so do the joins the code puts between texts (“title: text”, list items “ - ”, “ · ”, “→”, “=”)
    const parts = String(run).split(/[:;=→·|]|\s[-–—]\s|\s\*\s/).flatMap(piece => words(piece).reduce((a, x) => { if (/\d/.test(x)) a.push([]); else a[a.length - 1].push(x); return a; }, [[]])).filter(p => p.length);
    return parts.every(p => seg(p, lx)); } };
}

/** The interface's own English messages (short ones, without parameters): such words on the screen in en-XA were written by
    the code, not taken from the catalog — even when a pack happens to contain them too. */
function catalogWords() {
  const set = new Set();
  for (const c of fs.readdirSync(path.join(ROOT, 'i18n'))) { try { const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', c, 'en.arb'), 'utf8'));
    for (const [k, v] of Object.entries(en)) if (!k.startsWith('@') && typeof v === 'string' && !/[{}]/.test(v) && !/^(lang|lc)\.expl\./.test(k)) { const w = words(v); if (w.length && w.length <= 4) set.add(w.join(' ')); } } catch (e) { } }
  return set;
}

/* ---------- what is translated ---------- */
// the pseudo-locales' marks: en-XA accents (tools/i18n/build.js) and its padding; ar-XB wraps every message in U+202E … U+202C
const PS = /[áƀçďéƒĝĥíĵķļɱñóþǫŕšţúṽŵẋýžÁƁÇĎÉƑĜĤÍĴĶĻṀÑÓÞǪŔŠŢÚṼŴẊÝŽ·]/;
/** The parts of a text that no catalog message produced: plain runs outside every pseudo message, and the plain runs
    inside a message (its parameters: a subject's title, a name … or an English word glued in by the code). */
function plainRuns(s) {
  let x = String(s), prev; const inner = [];
  const cut = m => { const body = m.slice(1, -1); body.split('\u0001').forEach(r => inner.push(r)); return '\u0001'; };
  do { prev = x; x = x.replace(/\[[^\[\]]*\]/g, m => PS.test(m) ? cut(m) : m).replace(/\u202e[^\u202e\u202c]*\u202c/g, cut); } while (x !== prev);
  // a run = consecutive words without a pseudo mark (an accented word belongs to a message)
  const runs = r => r.split('\u0001').flatMap(t => t.replace(/[\u200e\u200f\u2066-\u2069]/g, '').split(/(\s+)/).reduce((a, w) => { if (PS.test(w)) a.push(''); else a[a.length - 1] += w; return a; }, ['']))
    .map(t => t.trim()).filter(t => /[A-Za-z]{2}/.test(t));
  return { outside: runs(x), inside: inner.flatMap(runs) };
}
// not interface text: product and service names, codes, units, file names, addresses, keys' shapes, data the test types
const ALLOW = [
  /^(noema(-lite)?|Claude|Gemini|Supabase|Netlify|Google|Chrome|Edge|Safari|Firefox|GitHub|Weblate|Anthropic|Bing|DuckDuckGo|Wikimedia|Wikipedia|KaTeX|PDF|JSON|ZIP|CSV|HTML|URL|API|HTTPS?|MCP|MB|KB|GB|B|ms|px)$/,
  /^[a-z]{2,3}-[A-Za-z]{2,4}$/,                    // locale codes: ar-EG, zh-Hant (a bare “de” only where codes are shown: below)
  /^https?:\/\/\S+$/, /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/,  // addresses
  /^[\w-]+\.(pdf|json|zip|png|jpe?g|svg|md|html|txt|js)$/i, // file names
  /^(sk-ant-|AIza)/,                                // the shape of an API key
  /^(gemini|claude)-[\w.-]+$/, /^Claude (Opus|Sonnet|Haiku)( [\d.]+)?$/,   // model names
  /^[\w-]+(\.[\w-]+)+(\/\S*)?$/, /^localhost(:\d+)?$/, /noema\.zip$/, // domains, file patterns
  /Ƥşḗŭḓǿ/,                                         // the pseudo-locales' own names
];
/** Endonyms (a language's name in itself: the language pickers) are never translated. */
const ENDONYMS = new Set();
for (const a of 'abcdefghijklmnopqrstuvwxyz') for (const b of 'abcdefghijklmnopqrstuvwxyz') { try { const c = a + b, n = new Intl.DisplayNames([c], { type: 'language', fallback: 'none' }).of(c); if (n && n !== c && (c === 'en' || n !== new Intl.DisplayNames(['en'], { type: 'language' }).of(c))) ENDONYMS.add(n.toLowerCase()); } catch (e) { } }
ENDONYMS.delete('english');   // “English” only in a language picker (below): elsewhere it is a word the code wrote
// a parameter that holds a provider's, a server's or the browser's own words (docs/i18n.md §6.1: `detail` stays as it is)
const PARAM_ALLOW = [/\{"error"/, /^\(?\d{3}\)?:/, /failed to fetch|fetch failed|networkerror|load failed/i];
/** Places whose words are kept on purpose (input for a parser, …) — each with its reason. */
const WHERE_ALLOW = [
  [/\bcm-(ex|tree)\b|cm-rules > tbody > tr > td|td > code/, 'the Roadmap import guide: its syntax column and examples are input for the parser (curimport.js), kept as it reads them'],
  [/results > button\.result > small/, 'a search result’s snippet: a cut of the subject’s own text (content)'],
  [/svg > (g > )*text$/, 'the characters’ drawings (engine/art.js): a formula, “$ git push / ✓ tests pass” on a terminal — part of the picture, like code'],
];
const allowed = (run, C, extra, inside, it = {}) => {
  if (WHERE_ALLOW.some(([r]) => r.test(it.where || ''))) return 'kept';
  const t = run.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!/[A-Za-z]{2}/.test(t)) return 'none';
  if (extra.some(e => e === t || (e instanceof RegExp && e.test(t)))) return 'data';
  if (ALLOW.some(r => r.test(t)) || ENDONYMS.has(t.toLowerCase()) || (t === 'English' && /option|lang|pick/i.test(it.where))) return 'name';
  if (inside && PARAM_ALLOW.some(r => r.test(run))) return 'detail';
  if (/^[a-z]{2,3}$/.test(t) && (it.kind !== 'text' || /\bcode\b|option|select/.test(it.where || ''))) return 'name';   // a language code (de, ar) in a picker or a code element
  if (t.split(/\s+/).length > 1 && t.split(/\s+/).every(w => ALLOW.some(r => r.test(w.replace(/[\p{P}\p{S}]+/gu, ''))) || !/[A-Za-z]{2}/.test(w))) return 'name';
  // the words of a catalog message, not a whole text of the content: written by the code
  // (an attribute or a dialog is never a pack's text: there the catalog's words alone decide)
  const w = words(t); if (w.length <= 4 && C.ui.has(w.join(' ')) && (it.kind !== 'text' || !C.whole(t))) return null;
  if (C.has(run, it.where)) return 'content';
  return null;
};

/* ---------- in the page: every text the app shows (a MutationObserver keeps the short-lived ones: toasts) ---------- */
const OBSERVE = () => {
  // the Intl helpers speak English in en-XA (no CLDR data for it): mark what they write, so a date or a language name
  // written without them (hand-made, English) still shows up
  const ACC = { a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž' };
  const acc = s => String(s).replace(/[a-z]/gi, c => { const x = ACC[c.toLowerCase()]; return x ? (c === c.toLowerCase() ? x : x.toUpperCase()) : c; });
  let NI; Object.defineProperty(window, 'NoemaI18n', { configurable: true, get: () => NI, set: v => { NI = v; try {
    const f = v.fmt, pseudo = () => /-X[AB]$/.test(v.locale);
    for (const k of ['date', 'time', 'relative', 'langName']) { const o = f[k]; f[k] = (...a) => { const r = o(...a); return pseudo() ? '[' + acc(r) + ' ·]' : r; }; }
    const ol = f.list; f.list = (items, o = { type: 'conjunction' }) => { if (!pseudo()) return ol(items, o); try { return new Intl.ListFormat('en', o).formatToParts(items.map(String)).map(p => p.type === 'literal' ? acc(p.value) + (/\w/.test(p.value) ? '·' : '') : p.value).join(''); } catch (e) { return ol(items, o); } };
  } catch (e) { } } });
  const SEEN = window.__i18nSeen = window.__i18nSeen || new Map(), ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description', 'data-tip', 'label'];
  const where = el => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 4 && e !== document.body; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '') + (e.id ? '#' + e.id : '')); return p.join(' > '); };
  // text in a learned language (an element with its own lang: a word, its transliteration, pinyin) is not interface text
  const foreign = el => { const l = el.closest('[lang]'); return !!l && l !== document.documentElement && !/^(en|en-XA|ar-XB)$/i.test(l.lang) && !l.closest('#ns-top, .ns-tabs, #ns-fab'); };
  const skip = el => !el || !!el.closest('script,style,noscript,textarea,[contenteditable="true"],.katex,.noema-i18n-skip') || foreign(el);
  const put = (text, el, kind) => { text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text || !/[A-Za-z]/.test(text)) return; const k = kind + '\u0000' + text; if (!SEEN.has(k)) SEEN.set(k, { text, kind, where: where(el), fresh: true }); };
  const visit = n => {
    if (n.nodeType === 3) { if (!skip(n.parentElement)) put(n.data, n.parentElement, 'text'); return; }
    if (n.nodeType !== 1 || skip(n)) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) put(n.getAttribute(a), n, a);
    if (n.matches('input[type=button],input[type=submit]')) put(n.value, n, 'value');
    for (const c of n.childNodes) visit(c);
  };
  window.__i18nScan = () => { visit(document.documentElement); put(document.title, document.head, 'title-doc'); };
  window.__i18nDrain = () => { window.__i18nScan(); const out = []; for (const v of SEEN.values()) if (v.fresh) { v.fresh = false; out.push({ text: v.text, kind: v.kind, where: v.where }); } return out; };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') visit(m.target); else if (m.type === 'attributes') { if (!skip(m.target)) put(m.target.getAttribute(m.attributeName), m.target, m.attributeName); } else m.addedNodes.forEach(visit); } })
    .observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
};
/** config.js sets window.NOEMA_CONFIG: keep its values and add ours (the pseudo-locales, the emulator). */
const CONFIG = extra => `(() => { let c; Object.defineProperty(window, 'NOEMA_CONFIG', { configurable: true, get: () => c, set: v => { c = Object.assign(v || {}, ${JSON.stringify(extra)}); } }); })();`;

(async () => {
  const C = corpus(); C.ui = catalogWords();
  const srv = await start({ port: PORT, staticDir: ROOT });
  const browser = await chromium.launch();
  const found = new Map();    // run → { kind, where, surfaces }
  const extra = ['ANR', 'anr', 'Old Chat', 'xyzqq', 'TESTKEY', 'Hello', 'binary'];           // data the test itself typed (names, titles)
  let surface = '';
  const record = (it, run, inside) => { const key = run; const f = found.get(key) || { run, kind: it.kind, where: it.where, text: it.text, inside, surfaces: new Set() }; f.surfaces.add(surface); found.set(key, f); };
  const kept = new Map();   // I18N_REPORT=1: what was let through as content, a name or data (for a person to look over)
  function check(it) {
    const { outside, inside } = plainRuns(it.text);
    for (const [list, ins] of [[outside, false], [inside, true]]) for (const r of list) { const why = allowed(r, C, extra, ins, it); if (!why) record(it, r, ins); else if (process.env.I18N_REPORT && why !== 'none' && !kept.has(r)) kept.set(r, { why, where: it.where, kind: it.kind, surface }); }
  }
  async function grab(page, name) {
    surface = name || surface;
    let items = []; try { items = await page.evaluate(() => window.__i18nDrain ? window.__i18nDrain() : []); } catch (e) { }
    for (const it of items) check(it);
  }
  async function newPage(opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, locale: opts.locale || 'en-XA', acceptDownloads: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
    await ctx.addInitScript(CONFIG({ pseudoLocales: true, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', siteUrl: BASE, ...(opts.config || {}) }));
    await ctx.addInitScript(OBSERVE);
    const page = await ctx.newPage(); page.setDefaultTimeout(4000);
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    page.on('dialog', async d => { check({ text: d.message() + (d.defaultValue() ? ' ' + d.defaultValue() : ''), kind: 'dialog:' + d.type(), where: 'window.' + d.type() }); await (page.dialogAnswer ? d.accept(page.dialogAnswer) : d.dismiss()); });
    return page;
  }
  /** One surface: do something, wait, collect what appeared (a step that hangs is abandoned after 12 s). */
  const visit = async (page, name, fn, ms = 500) => { surface = name; const t0 = Date.now();
    try { await Promise.race([fn(), wait(12000).then(() => { throw new Error('still running after 12 s'); })]); } catch (e) { console.log('    (' + name + ': ' + e.message.split('\n')[0] + ')'); if (DEBUG) await page.screenshot({ path: path.join(SHOTS, 'err_' + name.replace(/[^\w]+/g, '_').slice(0, 60) + '.png') }).catch(() => { }); }
    await wait(ms); await grab(page, name); if (process.env.I18N_SHOTS_ALL) await page.screenshot({ path: path.join(SHOTS, 'v' + String(++shotN).padStart(3, '0') + '_' + name.replace(/[^\w]+/g, '_').slice(0, 50) + '.png') }).catch(() => { }); if (DEBUG) console.log('    · ' + name + ' ' + (Date.now() - t0) + ' ms'); };
  const go = (page, hash, ms = 600) => visit(page, hash, () => page.evaluate(h => { location.hash = h; }, hash), ms);

  /** Every page and panel of a subject in the classic screens (engine/src): home, chapters and their tabs, a section,
      one exercise of every type (asked, then checked wrong), the practice modes, search, sources, the bell, the tutor,
      the conversation history, the account menu with all its tabs, the setup guides. */
  async function classic(page, subj, { pictures = false, light = false } = {}) {
    const S = subj + ' · ';
    const info = await page.evaluate(() => { const types = {}; for (const e of ALL_EX) if (!types[e.type]) types[e.type] = e.id;
      return { chs: COURSE.map(c => c.id), sec: COURSE[0].sections.map(s => s.id), types, drill: Object.keys(PB)[0] || null, src: (SOURCES[0] || {}).id }; });
    await go(page, '#/', 800);
    const ch = info.chs[0];
    await go(page, '#/ch/' + ch, 700);
    await clickAll(page, S + 'chapter tab', 'main .tabs button');
    for (const sid of info.sec.slice(0, 2)) { await go(page, '#/s/' + sid, 700); await visit(page, S + 'section: continue', () => page.evaluate(() => { for (let i = 0; i < 8; i++) document.querySelector('.continue .btn')?.click(); }), 400); }
    for (const [type, id] of Object.entries(info.types)) {
      if (!pictures && /^img_/.test(type)) continue;
      await go(page, '#/ex/' + id, 600);
      await visit(page, S + 'exercise ' + type + ' (checked)', () => page.evaluate(() => { const c = document.querySelector('main .ex'); c?._check?.(); }), 500);
      await visit(page, S + 'exercise ' + type + ' (shown)', () => page.evaluate(() => { const c = document.querySelector('main .ex'); [...(c?.querySelectorAll('button') || [])].filter(b => /reveal|show|solution|answer/i.test(b.className)).forEach(b => b.click()); }), 300);
    }
    if (light) return;   // the second subject: its picture exercises only
    for (const hsh of ['#/practice/all', '#/practice/' + ch, '#/lightning', '#/cards', '#/drills', '#/mistakes', '#/new', '#/boss/' + ch, '#/run']) await go(page, hsh, 700);
    await visit(page, S + 'lightning round', async () => { await page.evaluate(c => { location.hash = '#/lightning/' + c; }, ch); await wait(800); await page.evaluate(() => document.querySelector('main .ex, main button.opt, main .lopt')?.click()); }, 900);
    await visit(page, S + 'flashcards', async () => { await page.evaluate(() => { location.hash = '#/cards'; }); await wait(500); await page.evaluate(() => { document.querySelector('main .fcard, main .flash, main .card')?.click(); }); }, 500);
    await visit(page, S + 'flashcards rated', () => page.evaluate(() => [...document.querySelectorAll('main .rate button, main .fcrate button')][0]?.click()), 400);
    if (info.drill) { await go(page, '#/drill/' + info.drill, 700); await visit(page, S + 'drill checked', () => page.evaluate(() => [...document.querySelectorAll('main .btn.primary')].pop()?.click()), 500); }
    await visit(page, S + 'mistakes gym (with mistakes)', async () => { await page.evaluate(() => { const e = ALL_EX.slice(0, 3); e.forEach(x => S.res[x.id] = { n: 1, ok: 0, last: false }); save(); location.hash = '#/x'; location.hash = '#/mistakes'; }); }, 700);
    await visit(page, S + 'a run to its summary', async () => { await page.evaluate(() => startRun(ALL_EX.filter(e => ['mcq', 'tf', 'cloze'].includes(e.type)).slice(0, 3), { title: '🎯' }));
      for (let i = 0; i < 7; i++) { await wait(300); await grab(page); await page.evaluate(() => { const c = document.querySelector('main .ex'); if (c && !c._locked?.()) c._check?.(); else [...document.querySelectorAll('main .btn.primary')].filter(b => b.offsetParent).pop()?.click(); }); } }, 800);
    await visit(page, S + 'boss exam', async () => { await page.evaluate(c => { location.hash = '#/boss/' + c; }, ch); await wait(600); await page.evaluate(() => [...document.querySelectorAll('main .btn.primary')].filter(b => b.offsetParent)[0]?.click());
      for (let i = 0; i < 6; i++) { await wait(300); await grab(page); await page.evaluate(() => { const c = document.querySelector('main .ex'); if (c && !c._locked?.()) c._check?.(); else [...document.querySelectorAll('main .btn.primary')].filter(b => b.offsetParent).pop()?.click(); }); } }, 800);
    await visit(page, S + 'search', async () => { await page.evaluate(() => openSearch()); await wait(300); await page.fill('.modal input', 'a'); await page.keyboard.type('xyzqq'); await wait(300); await page.fill('.modal input', 'the'); }, 600);
    await visit(page, S + 'sources deck', () => page.evaluate(() => { document.querySelector('.modal')?.remove(); toggleSourcesDeck(true); }), 600);
    await visit(page, S + 'a source', () => page.evaluate(id => { toggleSourcesDeck(false); return openSource(id); }, info.src), 1200);
    await visit(page, S + 'notifications', () => page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); document.querySelector('.viewer, .srcviewer')?.remove(); openNotes(); }), 500);
    await visit(page, S + 'tutor', () => page.evaluate(sid => { document.querySelectorAll('.modal').forEach(m => m.remove()); openTutor({ kind: 'section', id: sid }, 'socratic'); }, info.sec[0]), 600);
    await visit(page, S + 'tutor history', () => page.evaluate(() => { T.showHistory = true; renderTutor(); }), 500);
    await visit(page, S + 'tutor modes', () => page.evaluate(() => { T.showHistory = false; renderTutor(); [...document.querySelectorAll('.drawer select, .drawer .modechips button')].forEach(x => x.click?.()); }), 400);
    await visit(page, S + 'focus sprint', () => page.evaluate(() => { closeTutor(); focusSprint(document.querySelector('.timer')); }), 500);
    for (const tab of ['profile', 'settings', 'subjects', 'backup', 'cloud', 'help']) await visit(page, S + 'account menu: ' + tab, () => page.evaluate(t => { document.querySelectorAll('.modal').forEach(m => m.remove()); openAccountMenu(t); document.querySelectorAll('.modal details').forEach(d => d.open = true); }, tab), 700);
    await visit(page, S + 'guides', async () => { for (const g of ['gemini', 'backupFolder', 'restore', 'cloudUser', 'cloudOwner', 'github', 'claude', 'curricula', 'friends']) { await page.evaluate(g => { document.querySelectorAll('.modal').forEach(m => m.remove()); openGuide(g); }, g); await wait(150); await grab(page); } }, 200);
    const bad = { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') };
    await visit(page, S + 'restore: a broken file', async () => { await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); openAccountMenu('backup'); document.querySelectorAll('.modal details').forEach(d => d.open = true); }); await wait(400); await page.setInputFiles('.modal input[type=file][accept=".json"]', bad); }, 1200);
    await visit(page, S + 'import a pack: a broken file', async () => { await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); openAccountMenu('subjects'); document.querySelectorAll('.modal details').forEach(d => d.open = true); }); await wait(400); await page.setInputFiles('.modal input[type=file][accept=".json,.noemapack"]', bad); }, 1200);
    for (const [n, o] of [['unreachable', { url: 'https://unreachable.invalid/book.pdf' }], ['text', { blob: 'Hello', name: 'a.txt' }], ['csv', { blob: 'a,b\n1,2', name: 'a.csv' }], ['unknown', { blob: '\u0000\u0001binary', name: 'a.bin' }]])
      await visit(page, S + 'viewer: ' + n, () => page.evaluate(o => { document.querySelectorAll('.modal').forEach(m => m.remove()); if (o.blob) o.blob = new Blob([o.blob]); NoemaViewer.open(o); }, o), 1500);
    await page.evaluate(() => document.querySelector('.vw-ov')?.remove());
    await visit(page, S + 'subject menu', () => page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); location.hash = '#/'; }), 600);
    await visit(page, S + 'home buttons', () => page.evaluate(() => [...document.querySelectorAll('main .subjmenu, main .menubtn, main [aria-haspopup]')].forEach(b => b.click())), 400);
    await visit(page, S + 'reset progress (confirm)', () => page.evaluate(() => resetProgress(() => { })), 400);
    await visit(page, S + 'what is new', () => page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); location.hash = '#/new'; }), 500);
  }
  /** The AI helpers when the provider fails: a wrong key, quota, a server error, no network. */
  async function aiErrors(page) {
    const ctx = page.context();
    for (const [name, res] of [['401', { status: 401, body: '{"error":{"code":401,"message":"API key not valid. Please pass a valid API key.","status":"UNAUTHENTICATED"}}' }], ['429', { status: 429, body: '{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}' }], ['500', { status: 500, body: '{"error":{"code":500,"message":"Internal error","status":"INTERNAL"}}' }], ['offline', null]]) {
      await ctx.unroute('**/generativelanguage.googleapis.com/**').catch(() => { });
      await ctx.route('**/generativelanguage.googleapis.com/**', r => res ? r.fulfill({ status: res.status, contentType: 'application/json', body: res.body }) : r.abort('internetdisconnected'));
      await visit(page, 'AI error ' + name + ': tutor', () => page.evaluate(async () => { S.settings.apiKey = 'TESTKEY'; S.settings.model = 'gemini-3-flash-preview'; S.settings.models = ['gemini-3-flash-preview']; openTutor({ kind: 'section', id: COURSE[0].sections[0].id }, 'socratic'); await sendTutor('hi').catch(() => { }); }), 1500);
      await visit(page, 'AI error ' + name + ': grading', () => page.evaluate(async () => { closeTutor(); const ex = ALL_EX.find(e => e.type === 'free') || ALL_EX[0]; location.hash = '#/ex/' + ex.id; await new Promise(r => setTimeout(r, 400)); const ta = document.querySelector('main .ex textarea'); if (ta) { ta.value = 'my answer'; ta.dispatchEvent(new Event('input', { bubbles: true })); } document.querySelector('main .ex')?._check?.(); }), 1500);
      await visit(page, 'AI error ' + name + ': settings test', () => page.evaluate(() => { openAccountMenu('settings'); document.querySelectorAll('.modal details').forEach(d => d.open = true); [...document.querySelectorAll('.modal button')].filter(b => /🔍|🧪/.test(b.textContent)).forEach(b => b.click()); }), 1500);
      await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));
    }
    await ctx.unroute('**/generativelanguage.googleapis.com/**').catch(() => { });
  }

  /** The cloud sign-in form, from the account picker. */
  async function openCloudForm(pg) {
    await pg.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); Noema.openAccountPicker(); });
    await pg.waitForSelector('.noema-ovbox'); await pg.evaluate(() => document.querySelector('.noema-ovbox .noema-cloudrow button')?.click()); await pg.waitForSelector('.noema-ovbox input[type=email]');
  }

  /** Open every ⋮ / ▾ menu that is on the screen, one after another (their items are texts too). */
  async function menus(page, name, sel = '#ns-top .ns-menubtn, .ns-view .ns-menubtn, .ns-practicebtn, .ns-view [aria-haspopup="menu"]') {
    const n = await page.$$eval(sel, l => l.filter(b => b.offsetParent).length).catch(() => 0);
    for (let i = 0; i < Math.min(n, 8); i++) await visit(page, name + ' · menu ' + (i + 1), async () => { await page.evaluate(([sel, i]) => [...document.querySelectorAll(sel)].filter(b => b.offsetParent)[i]?.click(), [sel, i]); await wait(250); await grab(page); await page.keyboard.press('Escape'); }, 150);
  }
  const openDetails = (page, name) => visit(page, name + ' · folds open', () => page.evaluate(() => document.querySelectorAll('details:not([open])').forEach(d => d.open = true)), 250);
  /** Click every element of a selector (folds, tabs, toggles) and collect after each. */
  async function clickAll(page, name, sel) {
    const n = await page.$$eval(sel, l => l.length).catch(() => 0);
    for (let i = 0; i < Math.min(n, 12); i++) await visit(page, name + ' · ' + (i + 1), () => page.evaluate(([sel, i]) => document.querySelectorAll(sel)[i]?.click(), [sel, i]), 150);
  }
  /** Run a language session: answer every exercise with the first choice (or a wrong word), up to 25 steps. */
  async function session(page, name) {
    await visit(page, name + ': start', async () => { await page.evaluate(c => { location.hash = '#/lang/' + c; }, COURSE); await wait(1500); await page.click('.lx-host .lx-fgo'); }, 1000);
    for (let i = 0; i < 25; i++) await visit(page, name + ': step', () => page.evaluate(() => {
      const st = document.querySelector('.lx-stage, .lx-session') || document; const vis = b => b.offsetParent && !b.disabled;
      const inp = [...st.querySelectorAll('input[type=text], input:not([type]), textarea')].find(vis); if (inp && !inp.value) { inp.value = 'xx'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      const opt = [...st.querySelectorAll('.lx-opt, .lx-choice, .lx-tile, .opt')].find(vis); if (opt) opt.click();
      const btn = [...st.querySelectorAll('button.primary, .btn.primary, button.lx-next, button.lx-check')].find(vis); btn?.click();
    }), 350);
  }
  /** A Roadmap: the map, the list, a step's panel and its dialogs, the ⋮ items, the dialogs to create and import one. */
  async function roadmaps(page, cid) {
    await go(page, '#/learn', 800); await menus(page, 'Knowledge with a Roadmap');
    await go(page, '#/map/' + cid, 1200); await menus(page, 'map');
    await visit(page, 'map as a list', () => page.click('.cm-vbtn[data-list="true"]'), 500);
    for (const id of ['a', 'd', 'f']) {
      await visit(page, 'step panel ' + id, () => page.evaluate(id => document.querySelector(`.cm-listnode[data-id="${id}"]`)?.click(), id), 600);
      await clickAll(page, 'step panel ' + id, '.cm-panel.on details > summary');
      await menus(page, 'step panel ' + id, '.cm-panel.on .ns-menubtn, .cm-panel.on [aria-haspopup]');
    }
    await visit(page, 'edit step', () => page.click('.cm-panel.on .cm-editbtn'), 800);
    await openDetails(page, 'edit step'); await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    const items = await page.evaluate(() => { document.querySelector('#ns-top .ns-menubtn')?.click(); const l = [...document.querySelectorAll('.ns-pop button')].map((b, i) => i); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return l.length; });
    for (let i = 0; i < items; i++) {
      await visit(page, 'map ⋮ item ' + (i + 1), async () => { await page.evaluate(id => { location.hash = '#/map/' + id; }, cid).catch(() => { }); await wait(500); await page.click('#ns-top .ns-menubtn'); await wait(250);
        const label = await page.evaluate(i => { const b = [...document.querySelectorAll('.ns-pop button')][i]; const t = b?.textContent || ''; if (b && !/🗑|Ďéļéţé|Ŕéɱóṽé|Éẋþóŕţ/.test(t)) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return t; }, i); }, 900);
      await openDetails(page, 'map ⋮ item ' + (i + 1));
      await page.evaluate(() => { document.querySelectorAll('.noema-overlay, .ns-sheet, .ns-modal').forEach(o => o.remove()); });
    }
    await visit(page, 'plan now', () => page.evaluate(id => NoemaCurMap.planNow(Noema.account.id, id, {}), cid), 1000);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'attach dialog', () => page.evaluate(id => NoemaCurMap.attachDialog(Noema.account.id, { cid: id, nid: 'a' }), cid), 1000);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'review changes', () => page.evaluate(id => NoemaCurMap.reviewChanges(Noema.account.id, id), cid), 800);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'new Roadmap', () => page.evaluate(() => NoemaCurMap.create(Noema.account.id, {})), 1000);
    await openDetails(page, 'new Roadmap');
    await clickAll(page, 'new Roadmap: choices', '.noema-ovbox .cm-prov, .noema-ovbox [data-prov], .noema-ovbox .seg button');
    await visit(page, 'new Roadmap: Claude app', async () => { await page.fill('.noema-ovbox textarea, .noema-ovbox input[type=text]', 'Data engineering').catch(() => { }); await page.evaluate(() => [...document.querySelectorAll('.noema-ovbox button.primary')].pop()?.click()); }, 1500);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'import a Roadmap', () => page.evaluate(() => NoemaCurMap.importMap(Noema.account.id, {})), 1000);
    await openDetails(page, 'import a Roadmap');
    await visit(page, 'import: pasted outline', async () => { await page.fill('.noema-ovbox textarea', '# Data engineer\n- Python basics\n- SQL\n  - Spark DataFrames').catch(() => { }); await page.evaluate(() => [...document.querySelectorAll('.noema-ovbox button.primary')].pop()?.click()); }, 1500);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'Claude setup', () => page.evaluate(() => Noema.claudeGuide({})), 1000);
    await openDetails(page, 'Claude setup'); await clickAll(page, 'Claude setup ways', '.noema-ovbox .seg button, .noema-ovbox [data-way]');
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
  }

  /* ======================= A. the classic engine ======================= */
  if (only('A')) {
    console.log('A. the classic engine (en-XA)');
    const page = await newPage();
    await page.goto(BASE + '/index.html'); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(1200);
    ok(await page.evaluate(() => NoemaI18n.locale) === 'en-XA', 'the interface speaks the pseudo-locale en-XA (the device’s language)');
    await grab(page, 'subject picker');
    await visit(page, 'picker → Databricks', () => page.click('.noema-chip:has-text("Databricks")'), 1800);
    await classic(page, 'Databricks');
    await visit(page, 'picker → Demo Physics', async () => { await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); Noema.openSubjectPicker(); }); await wait(500); await page.click('.noema-chip:has-text("Demo Physics")'); }, 2500);
    await classic(page, 'Demo Physics', { pictures: true, light: true });
    await aiErrors(page);
    await page.context().close();
  }

  /* ======================= B. the new frame ======================= */
  let cid = null;
  if (only('B')) {
    console.log('B. the new frame and Roadmaps (en-XA)');
    const page = await newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE + '/index.html'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); }); await page.reload(); await wait(1500);
    await grab(page, 'onboarding: what do you learn');
    await visit(page, 'onboarding: characters', async () => { await page.click('[data-pick="both"]'); await wait(300); await page.evaluate(() => document.querySelectorAll('.ns-chgrp').forEach(d => d.open = true)); }, 400);
    await visit(page, 'onboarding: picked', async () => { await page.click('[data-onbm="robot"]'); }, 300);
    await visit(page, 'Today', () => page.click('[data-onbdone]'), 1200);
    await menus(page, 'Today');
    for (const hsh of ['#/learn', '#/shelf', '#/lang', '#/discover', '#/explore', '#/explore/subjects', '#/progress', '#/me', '#/me/profile', '#/me/ai', '#/me/look', '#/me/subjects', '#/me/data', '#/me/help', '#/character']) {
      await go(page, hsh, 900); await openDetails(page, hsh); await menus(page, hsh);
    }
    await visit(page, 'edit a subject', () => page.evaluate(async () => { const s = (await Noema.subjectsFor(Noema.account.id)).find(x => x.id === 'demo-physics'); Noema.editSubject(s); }), 900);
    await openDetails(page, 'edit a subject'); await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'delete a subject (asked)', () => page.evaluate(async () => { const s = (await Noema.subjectsFor(Noema.account.id)).find(x => x.id === 'demo-physics'); Noema.deleteSubject({ ...s, origin: 'imported' }); }), 900);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'character: try', async () => { await page.evaluate(() => document.querySelectorAll('.ns-chgrp').forEach(d => d.open = true)); await page.click('[data-try="owl"]'); }, 600);
    await visit(page, 'character: end the try', () => page.click('.ns-preview .btn:not(.primary)'), 400);
    await visit(page, 'Me: what I learn', () => page.evaluate(() => { location.hash = '#/me'; }), 500);
    await visit(page, 'bell', () => page.click('#bellbtn'), 500); await page.keyboard.press('Escape');
    await visit(page, 'switch profile', () => page.evaluate(() => { Noema.openAccountPicker(); }), 700);
    await visit(page, 'new profile form', () => page.evaluate(() => [...document.querySelectorAll('.noema-ovbox button')].find(b => /➕|new/i.test(b.textContent) || b.dataset.act === 'new')?.click()), 500);
    await visit(page, 'cloud form', () => page.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); Noema.openAccountPicker(); setTimeout(() => [...document.querySelectorAll('.noema-ovbox button')].find(b => b.textContent.includes('☁'))?.click(), 200); }), 700);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    // a subject in the frame
    await visit(page, 'Shelf → Demo Physics', async () => { await page.evaluate(() => { location.hash = '#/shelf'; }); await wait(700); await page.click('[data-subject="demo-physics"]'); }, 1500);
    await menus(page, 'subject page');
    const ch = await page.evaluate(() => COURSE[0].id), sec = await page.evaluate(() => COURSE[0].sections[0].id);
    for (const hsh of ['#/ch/' + ch, '#/ch/' + ch + '/practice', '#/ch/' + ch + '/traps', '#/ch/' + ch + '/practice/filters', '#/s/' + sec, '#/cards', '#/mistakes', '#/lightning', '#/drills']) { await go(page, hsh, 800); await menus(page, hsh); }
    await visit(page, 'tutor (frame)', () => page.click('#ns-fab'), 700);
    await menus(page, 'tutor (frame)', '.drawer .ns-menubtn, .drawer .ns-modesel');
    await visit(page, 'conversations', async () => { await page.evaluate(() => closeTutor()); await page.evaluate(async () => { const t = new Date().toISOString(); await Noema.convos.put(Noema.account.id, Noema.convos.normalize({ kind: 'tutor', mode: 'socratic', title: 'Old Chat', context: { type: 'course' }, messages: [{ role: 'user', content: 'hi', createdAt: t }, { role: 'assistant', content: 'hello', createdAt: t }] }, { account: { id: Noema.account.id, kind: 'local' }, subject: { id: SUBJ.id, title: SUBJ.title } })); NoemaShell.convos(); }); }, 900);
    await visit(page, 'a conversation', () => page.click('.ns-cvmain'), 500);
    await page.keyboard.press('Escape');
    // a Roadmap (as tests/shell.js makes one)
    cid = await page.evaluate(() => {
      const C = NoemaCurriculum, acc = Noema.account.id; const c = C.blank({ goal: 'Data engineering', language: 'en', provider: 'auto', prefetch: 0 });
      const mk = (id, title, role) => ({ id, title, summary: title, role, part: C.PART[role], learningGoals: ['Explain ' + id], plannedAt: '2026-01-01T00:00:00.000Z', chapters: [1, 2, 3].map(i => ({ ref: 'c' + i, title: `${title} ${i}`, goals: ['g'], coverage: ['t'] })) });
      c.nodes = { a: mk('a', 'Python basics', 'foundation'), b: mk('b', 'SQL', 'foundation'), d: mk('d', 'Spark DataFrames', 'aspect'), e: mk('e', 'Delta Lake', 'aspect'), f: mk('f', 'Pipelines', 'synthesis') };
      c.edges = [{ from: 'a', to: 'd' }, { from: 'b', to: 'd' }, { from: 'b', to: 'e' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' }];
      c.goalId = 'f'; c.paths = { minimal: [], deep: C.order(c) }; c.title = 'Data engineer'; c.status = 'ready'; C.save(acc, c); return c.id; });
    extra.push('Data engineering', 'Data engineer', 'Python basics', 'SQL', 'Spark DataFrames', 'Delta Lake', 'Pipelines', /^(Python basics|SQL|Spark DataFrames|Delta Lake|Pipelines) [123]$/, /^Explain [a-f]$/, 'Explain', 'Old Chat', 'hello', 'hi');
    await roadmaps(page, cid);
    await page.context().close();
  }

  /* ======================= C. the language course in the frame ======================= */
  if (only('C')) {
    console.log('C. the language course (en-XA)');
    const page = await newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + '/index.html'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); });
    await page.goto(BASE + '/index.html?account=anr'); await until(() => page.$('.ns-hello'), 20000); await grab(page, 'Today (both)');
    await go(page, '#/lang', 1200); await menus(page, '#/lang');
    await visit(page, 'course home', () => page.evaluate(c => { location.hash = '#/lang/' + c; }, COURSE), 4000);
    await grab(page, 'course home'); await openDetails(page, 'course home'); await menus(page, 'course home');
    await visit(page, 'native language question', () => page.evaluate(() => document.querySelector('.lx-native-ask button, .lx-native-ask select')?.click()), 600);
    const R = await page.evaluate(() => { const { C } = NoemaLangUI.UI; return { de: Object.keys(C.lang.de.lex)[40], ar: Object.keys(C.lang.ar.lex)[40], zh: Object.keys(C.lang.zh.lex)[40], frame: C.data.frames[0].id }; });
    const routes = ['#/settings', '#/lesson/fd.00', '#/lesson/fd.05', '#/lesson/cr.01', '#/node/veg.1', '#/c/veg.carrot', `#/w/de/${R.de}`, `#/w/ar/${R.ar}`, `#/w/zh/${R.zh}`, '#/field/food.vegetables/0', '#/recall/food.vegetables', '#/peculiar/ar', '#/sort/food.vegetables', '#/parts/de', '#/parts/ar',
      '#/fn/fn.plural.noun/de', '#/fn/fn.plural.noun/ar', '#/fn/fn.overview/zh', '#/fn/fn.tones/zh', '#/fn/fn.root.pattern/he', '#/grammar/de', '#/grammar/ar', '#/grammar/zh', `#/deep/de/${R.de}`, '#/deepen/veg.1/de', '#/cmp', '#/cmp/fn/fn.negation', `#/cmp/frame/${R.frame}`, '#/cmp/c/veg.carrot',
      '#/poly/which_language', '#/poly/parallel_align', '#/poly/parallel_translate', '#/poly/cognate_bridge', '#/poly/compare_rule', '#/write/de', '#/write/he/translate', '#/write/de/compose', '#/read/de', '#/read/zh', '#/script/ar', '#/script/he', '#/script/zh', '#/script/de', '#/listen/de', '#/lanes', '#/claude'];
    for (const r of routes) { await go(page, '#/lang/' + COURSE + '/' + r.slice(2), 900); await openDetails(page, r); await menus(page, r); await clickAll(page, r, '.lx-host .lx-main .lx-view button.lx-fold, .lx-host .lx-main .lx-view summary'); }
    await visit(page, 'script keyboard', () => page.evaluate(() => document.querySelector('.lx-kbdtoggle, .lx-kbbtn, [data-kb]')?.click()), 500);
    for (const lang of ['de', 'ar']) for (let i = 0; i < 8; i++) {
      await visit(page, `language sheet ${lang} · item ${i + 1}`, async () => { await page.keyboard.press('Escape'); await page.evaluate(c => { document.querySelectorAll('.ns-sheet').forEach(x => x.remove()); location.hash = '#/lang/' + c; }, COURSE); await wait(1200); await page.click(`.lx-fhome .ns-item[data-act="lang-${lang}"]`); await wait(400); await grab(page);
        await page.evaluate(i => document.querySelectorAll('.ns-sheet .ns-item')[i]?.click(), i); }, 1200);
      await openDetails(page, `language sheet ${lang} · item ${i + 1}`);
    }
    await page.keyboard.press('Escape'); await page.evaluate(() => { document.querySelectorAll('.ns-sheet').forEach(x => x.remove()); try { NoemaLangUI.prod.closeLangTutor(); } catch (e) { } });
    await session(page, 'lesson session');
    await visit(page, 'language tutor', async () => { await page.evaluate(c => { location.hash = '#/lang/' + c; }, COURSE); await wait(1200); await page.click('#ns-fab'); }, 800);
    await visit(page, 'language tutor (no key, sent)', () => page.evaluate(() => { const ta = document.querySelector('.lx-tutor textarea, .drawer textarea'); if (ta) { ta.value = 'Hallo'; ta.dispatchEvent(new Event('input', { bubbles: true })); } document.querySelector('.lx-tutor .send, .drawer .send, .lx-tutor button.primary')?.click(); }), 1200);
    await page.evaluate(() => { try { NoemaLangUI.prod.closeLangTutor(); } catch (e) { } });
    // the language tutor with a Gemini key, when Gemini fails
    await page.evaluate(() => localStorage.setItem('noema-device:geminiKey:anr', 'TESTKEY'));
    for (const [name, res] of [['429', { status: 429, body: '{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}' }], ['500', { status: 500, body: '{"error":{"code":500,"message":"Internal error","status":"INTERNAL"}}' }], ['offline', null]]) {
      await page.context().unroute('**/generativelanguage.googleapis.com/**').catch(() => { });
      await page.context().route('**/generativelanguage.googleapis.com/**', r => res ? r.fulfill({ status: res.status, contentType: 'application/json', body: res.body }) : r.abort('internetdisconnected'));
      await visit(page, 'language tutor: Gemini ' + name, async () => { await page.evaluate(c => { try { NoemaLangUI.prod.closeLangTutor(); } catch (e) { } location.hash = '#/lang/' + c + '/fn/fn.plural.noun/de'; }, COURSE); await wait(1200);
        await page.evaluate(() => [...document.querySelectorAll('.lx-tutorrow button, .lx-totutor, [data-intent]')].find(b => b.offsetParent)?.click()); await wait(800);
        await page.evaluate(() => { const ta = document.querySelector('.lx-tutor textarea'); if (ta) { ta.value = 'Hallo'; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } }); }, 2500);
    }
    await page.context().unroute('**/generativelanguage.googleapis.com/**').catch(() => { });
    await page.evaluate(() => { localStorage.removeItem('noema-device:geminiKey:anr'); try { NoemaLangUI.prod.closeLangTutor(); } catch (e) { } });
    await visit(page, 'new language dialog', async () => { await page.evaluate(() => { location.hash = '#/lang'; }); await wait(900); await page.click('.ns-view button:has-text("·")', { timeout: 2000 }).catch(() => page.evaluate(() => [...document.querySelectorAll('.ns-view button')].pop()?.click())); }, 900);
    extra.push('Frame course', 'Hallo');
    await visit(page, 'new language: created', async () => { await page.fill('.lj-box input', 'Frame course').catch(() => { }); await page.click('.lj-lang[data-lang=es]').catch(() => { }); await page.click('.lj-create').catch(() => { }); }, 1500);
    extra.push('Frame course', 'Hallo');
    await visit(page, 'new language: its Claude page', () => page.evaluate(() => [...document.querySelectorAll('.lj-box button')].find(b => b.classList.contains('primary'))?.click()), 1500);
    await page.context().close();
  }

  /* ======================= D. cloud: sign-in and its errors, sharing, invitations, the OAuth consent page ======================= */
  if (only('D')) {
    console.log('D. cloud (en-XA)');
    const page = await newPage({ config: { askSubjectOnStart: true, shell: false } });
    await page.goto(BASE + '/index.html'); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(1000);
    extra.push('authorization not found', 'back in Claude');   // the emulator's own words (a server's detail; its callback page)
    extra.push('Anna', 'anna@example.com', 'Bob', 'bob@example.com', 'nobody@example.com', 'a@example.com', 'not-an-address', 'upstream unavailable', 'Heart test', 'Data engineering', 'Data engineer', 'Python basics');
    const err = (status, body) => r => /\/(token|signup|recover)/.test(r.request().url()) ? r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) : r.continue();
    const form = async (pg, name, fill, route) => {
      if (route) await pg.route('**/auth/v1/**', route);
      await visit(pg, 'sign-in: ' + name, async () => { await openCloudForm(pg); await fill(); }, 1500);
      if (route) await pg.unroute('**/auth/v1/**');
    };
    const signIn = (pg, email, pw) => async () => { await pg.fill('.noema-ovbox input[type=email]', email); await pg.fill('.noema-ovbox input[type=password]', pw); await pg.click('.noema-ovbox button.primary'); };
    const signUp = (pg, name, email, pw) => async () => { await pg.click('.noema-ovbox .linkish >> nth=0'); await wait(200); await pg.fill('.noema-ovbox input:not([type=email]):not([type=password])', name); await signIn(pg, email, pw)(); };
    await form(page, 'wrong password', signIn(page, 'nobody@example.com', 'wrong-one'));
    await form(page, 'email not confirmed', signIn(page, 'a@example.com', 'secret123'), err(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }));
    await form(page, 'rate limit', signIn(page, 'a@example.com', 'secret123'), err(429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }));
    await form(page, 'server error', signIn(page, 'a@example.com', 'secret123'), err(503, { message: 'upstream unavailable' }));
    await form(page, 'offline', signIn(page, 'a@example.com', 'secret123'), r => r.abort('internetdisconnected'));
    await form(page, 'weak password', signUp(page, 'Anna', 'anna@example.com', 'x'), err(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.', weak_password: { reasons: ['length'] } }));
    await form(page, 'user exists', signUp(page, 'Anna', 'anna@example.com', 'secret123'), err(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' }));
    await form(page, 'forgot password', async () => { await page.fill('.noema-ovbox input[type=email]', 'anna@example.com'); await page.click('.noema-ovbox .linkish >> nth=-1'); await wait(400); await page.evaluate(() => [...document.querySelectorAll('.noema-ovbox button.primary')].pop()?.click()); });
    await form(page, 'sign up', signUp(page, 'Anna', 'anna@example.com', 'secret123'));
    await wait(1500); await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'cloud: picker', () => page.evaluate(() => { Noema.openSubjectPicker(); }), 800);
    await visit(page, 'cloud: Databricks', () => page.click('.noema-chip:has-text("Databricks")'), 2500);
    for (const tab of ['profile', 'backup', 'cloud']) await visit(page, 'cloud account menu: ' + tab, () => page.evaluate(t => { document.querySelectorAll('.modal').forEach(m => m.remove()); openAccountMenu(t); document.querySelectorAll('.modal details').forEach(d => d.open = true); }, tab), 1200);
    await visit(page, 'cloud self-test', () => page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('🩺'))?.click()), 3500);
    await visit(page, 'snapshot', () => page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('📸'))?.click()), 1500);
    await visit(page, 'sync now', () => page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => /🔄|⇅/.test(b.textContent))?.click()), 1500);
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));
    const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
    await page.evaluate(async p => { p.subject = { ...p.subject, id: 'heart-test', title: 'Heart test', owner: null }; p.version = 'h1'; Object.values(p.media)[0].restricted = true; await Noema.importPack(ACCOUNT.id, p); }, fx);
    await visit(page, 'share dialog', () => page.evaluate(() => { Noema.share({ id: 'heart-test', title: 'Heart test', origin: 'imported' }); }), 1200);
    const send = async addr => { await page.fill('.noema-ovbox input[type=email]', addr); await page.click('.noema-ovbox button:has-text("📨")'); };
    await visit(page, 'share: bad e-mail', () => send('not-an-address'), 900);
    await visit(page, 'share: own e-mail', () => send('anna@example.com'), 900);
    await visit(page, 'share: sent', () => send('bob@example.com'), 1500);
    await visit(page, 'share: public (warning)', () => page.click('.noema-ovbox button:has-text("🌍")'), 800);
    await visit(page, 'share: public', async () => { await page.check('.nx-warn input'); await page.click('.noema-ovbox button:has-text("🌍")'); }, 1500);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'explore', () => page.evaluate(() => { Noema.explore(); }), 1500);
    await clickAll(page, 'explore', '.noema-ovbox .seg button, .noema-ovbox [role=tab]');
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    const cid2 = await page.evaluate(() => { const C = NoemaCurriculum, acc = Noema.account.id; const c = C.blank({ goal: 'Data engineering', language: 'en', provider: 'auto', prefetch: 0 });
      c.nodes = { a: { id: 'a', title: 'Python basics', summary: 'Python basics', role: 'foundation', part: C.PART.foundation, learningGoals: [], chapters: [] } }; c.edges = []; c.goalId = 'a'; c.paths = { minimal: [], deep: ['a'] }; c.title = 'Data engineer'; c.status = 'ready'; C.save(acc, c); return c.id; });
    await visit(page, 'Roadmap share dialog', () => page.evaluate(id => { NoemaCurMap.shareCurriculum(Noema.account.id, id); }, cid2), 1200);
    await visit(page, 'Roadmap share: with people', () => page.click('.noema-ovbox .cm-sharepeople'), 2500);
    await visit(page, 'Roadmap share: invite', async () => { await page.fill('.noema-ovbox input[type=email]', 'bob@example.com'); await page.keyboard.press('Enter'); await wait(300); await page.evaluate(() => [...document.querySelectorAll('.noema-ovbox input[type=email]')].pop()?.closest('div')?.querySelector('button')?.click()); }, 2000);
    await visit(page, 'Roadmap share: bad invite', async () => { await page.fill('.noema-ovbox input[type=email]', 'not-an-address'); await page.keyboard.press('Enter'); await wait(300); await page.evaluate(() => [...document.querySelectorAll('.noema-ovbox input[type=email]')].pop()?.closest('div')?.querySelector('button')?.click()); }, 1200);
    await visit(page, 'Roadmap share: public', () => page.click('.noema-ovbox .cm-publictoggle'), 2000);
    await openDetails(page, 'Roadmap share');
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'Roadmaps library (shared)', () => page.evaluate(() => { NoemaCurMap.library(Noema.account.id); }), 1500);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'Roadmaps others share', () => page.evaluate(() => { NoemaCurMap.exploreCurricula(Noema.account.id); }), 1500);
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    await visit(page, 'the shared map', () => page.evaluate(id => NoemaCurMap.map(Noema.account.id, id), cid2), 1500);
    await page.context().close();
    // Bob: the requests, the banner, the bell, the invitation
    const bob = await newPage({ config: { askSubjectOnStart: true, shell: false } });
    await bob.goto(BASE + '/index.html'); await bob.evaluate(() => localStorage.clear()); await bob.reload(); await wait(900);
    await form(bob, 'Bob signs up', signUp(bob, 'Bob', 'bob@example.com', 'secret123'));
    await wait(1500); await grab(bob, 'Bob: picker with requests');
    await visit(bob, 'Bob: Databricks', async () => { await bob.evaluate(() => { document.querySelectorAll('.noema-overlay').forEach(o => o.remove()); Noema.openSubjectPicker(); }); await wait(600); await bob.click('.noema-chip:has-text("Databricks")'); }, 2500);
    await visit(bob, 'Bob: notifications', () => bob.evaluate(() => openNotes()), 1000);
    await visit(bob, 'Bob: banner later', () => bob.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); [...document.querySelectorAll('.sharebar button')].pop()?.click(); }), 800);
    await visit(bob, 'Bob: accept from the bell', () => bob.evaluate(() => { openNotes(); setTimeout(() => document.querySelector('.modal button.primary')?.click(), 300); }), 3000);
    await visit(bob, 'Bob: Roadmaps (invitation)', () => bob.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); NoemaCurMap.library(Noema.account.id); }), 2000);
    await visit(bob, 'Bob: join', () => bob.evaluate(() => [...document.querySelectorAll('.noema-ovbox button.primary')].find(b => b.closest('.cm-invite, .cm-inv, li, .row'))?.click()), 2500);
    await bob.context().close();
    // the OAuth consent page of the Claude connector
    const oa = await newPage();
    await visit(oa, 'OAuth consent: unknown id (signed out)', () => oa.goto(BASE + '/index.html?authorization_id=nope'), 2500);
    await visit(oa, 'OAuth consent: sign in', async () => { await oa.click('.noema-ovbox button.primary'); await wait(300); await signIn(oa, 'bob@example.com', 'secret123')(); }, 3000);
    srv.state.authz = srv.state.authz || {}; srv.state.authz.az1 = { redirect_uri: BASE + '/oauth-callback' };
    await visit(oa, 'OAuth consent: the question', () => oa.goto(BASE + '/index.html?authorization_id=az1'), 3000);
    await visit(oa, 'OAuth consent: cancel', () => oa.click('.noema-ovbox button:not(.primary) >> nth=-1'), 1500);
    await oa.context().close();
  }

  /* ======================= E. Create with Claude (API key): the key check and a job, with the Claude API's errors ======================= */
  if (only('E')) {
    console.log('E. Create with Claude, Discover (en-XA)');
    const page = await newPage();
    await page.goto(BASE + '/index.html'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); });
    await page.goto(BASE + '/index.html?account=anr'); await until(() => page.$('.ns-hello'), 20000);
    const n = await page.evaluate(() => { location.hash = '#/discover'; return new Promise(r => setTimeout(() => r(document.querySelectorAll('.ns-view .ns-item').length), 800)); });
    for (let i = 0; i < n; i++) {
      await visit(page, 'Discover item ' + (i + 1), async () => { await page.evaluate(() => { document.querySelectorAll('.noema-overlay, .ns-sheet, .ns-modal').forEach(o => o.remove()); location.hash = '#/discover'; }); await wait(600); await page.evaluate(i => document.querySelectorAll('.ns-view .ns-item')[i]?.click(), i); }, 1200);
      await openDetails(page, 'Discover item ' + (i + 1));
    }
    await page.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    const claudeApi = async (models, messages) => { await page.context().unroute('**/api.anthropic.com/**').catch(() => { }); await page.context().route('**/api.anthropic.com/**', r => r.request().url().includes('/v1/models') ? models(r) : messages(r)); };
    const apiErr = (status, type, message) => r => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type, message } }) });
    const okModels = r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5', type: 'model' }, { id: 'claude-opus-4-5', display_name: 'Claude Opus 4.5', type: 'model' }] }) });
    await visit(page, 'Create with Claude', () => page.evaluate(() => Noema.claudeGuide({})), 900);
    await visit(page, 'Create with Claude: way A', () => page.click('.cg-choice >> nth=0'), 700);
    await visit(page, 'Claude key: not a key', async () => { await page.fill('.cg-box input[type=password]', 'hello'); await page.evaluate(() => [...document.querySelectorAll('.cg-box button')].find(b => b.textContent.includes('✔'))?.click()); }, 800);
    for (const [name, res] of [['401', apiErr(401, 'authentication_error', 'invalid x-api-key')], ['403', apiErr(403, 'permission_error', 'not allowed')], ['529', apiErr(529, 'overloaded_error', 'Overloaded')], ['offline', r => r.abort('internetdisconnected')]]) {
      await claudeApi(res, res);
      await visit(page, 'Claude key: ' + name, async () => { await page.fill('.cg-box input[type=password]', 'sk-ant-api03-' + 'x'.repeat(80)); await page.evaluate(() => [...document.querySelectorAll('.cg-box button')].find(b => b.textContent.includes('✔'))?.click()); }, 6000);
    }
    extra.push('Claude Sonnet 4.5', 'Claude Opus 4.5', 'invalid x-api-key', 'not allowed', 'Overloaded', 'Pumps', 'pumps', 'pumps-mine');
    await claudeApi(okModels, apiErr(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'));
    await visit(page, 'Claude key: works', async () => { await page.fill('.cg-box input[type=password]', 'sk-ant-api03-' + 'y'.repeat(80)); await page.evaluate(() => [...document.querySelectorAll('.cg-box button')].find(b => b.textContent.includes('✔'))?.click()); }, 1500);
    await visit(page, 'Create: missing sources', () => page.click('.cg-go'), 600);
    await visit(page, 'Create: missing title', async () => { await page.fill('.cg-box textarea >> nth=0', 'https://example.org/pumps.html'); await page.click('.cg-go'); }, 600);
    await visit(page, 'Create: the job (no credit)', async () => { await page.fill('.cg-box input.noema-input:not([type])', 'Pumps'); await page.click('.cg-go'); }, 6000);
    await visit(page, 'Create: the job later', () => wait(4000), 500);
    await clickAll(page, 'the job’s buttons', '.cg-box .row button:not(.primary)');
    await page.context().close();
  }

  /* ======================= F. right to left: ar-XB — key pages screenshot, nothing scrolls sideways ======================= */
  if (only('F')) {
    console.log('F. right to left (ar-XB)');
    const bad = [];
    for (const width of [390, 1280]) {
      const page = await newPage({ locale: 'ar-XB', viewport: { width, height: width < 500 ? 844 : 900 } });
      const shot = async (name, fn, ms = 900) => { try { await fn(); } catch (e) { console.log('    (' + name + ': ' + e.message.split('\n')[0] + ')'); } await wait(ms);
        // what sticks out of the screen sideways and can be seen (a hidden tooltip may lie outside: it is not drawn)
        const r = await page.evaluate(() => { const W = innerWidth, out = [];
          for (const e of document.querySelectorAll('body *')) { if ((e.closest('svg') && e.tagName !== 'svg') || e.closest('.drawer:not(.open)')) continue; const b = e.getBoundingClientRect(); if (!b.width || (b.left > -2 && b.right < W + 2)) continue;
            if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue; let clipped = false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) { const ab = a.getBoundingClientRect(); if (ab.left > -2 && ab.right < W + 2) { clipped = true; break; } } } if (!clipped) out.push(e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + ` ${Math.round(b.left)}…${Math.round(b.right)}`); }
          return { dir: document.documentElement.dir, out: out.slice(0, 3) }; }).catch(() => ({}));
        if (r.dir !== 'rtl' || (r.out || []).length) bad.push(`${name} @${width}: dir=${r.dir} ${(r.out || []).join(', ')}`);
        await page.screenshot({ path: path.join(SHOTS, `rtl_${width}_${name}.png`) }); };
      await page.goto(BASE + '/index.html'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('noema-test:newUI', '1'); localStorage.setItem('noema1:anr:a:settings', JSON.stringify({ onboarded: Date.now(), world: 'both', character: 'owl' })); });
      await page.goto(BASE + '/index.html?account=anr'); await until(() => page.$('.ns-hello'), 20000);
      ok(await page.evaluate(() => NoemaI18n.locale === 'ar-XB' && document.documentElement.dir === 'rtl'), `${width} px: the page is right to left in ar-XB`);
      await shot('today', () => wait(300));
      await shot('learn', () => page.evaluate(() => { location.hash = '#/learn'; }));
      await shot('me', () => page.evaluate(() => { location.hash = '#/me'; }));
      await shot('me_look', () => page.evaluate(() => { location.hash = '#/me/look'; }));
      await shot('me_data', () => page.evaluate(() => { location.hash = '#/me/data'; document.querySelectorAll('details').forEach(d => d.open = true); }));
      await shot('subject', async () => { await page.evaluate(() => { location.hash = '#/shelf'; }); await wait(700); await page.click('[data-subject="demo-physics"]'); }, 1500);
      await shot('chapter', () => page.evaluate(() => { location.hash = '#/ch/' + COURSE[0].id; }));
      await shot('section', () => page.evaluate(() => { location.hash = '#/s/' + COURSE[0].sections[0].id; }));
      await shot('exercise', () => page.evaluate(() => { location.hash = '#/ex/' + ALL_EX.find(e => e.type === 'mcq').id; }));
      await shot('picture_exercise', () => page.evaluate(() => { location.hash = '#/ex/' + ALL_EX.find(e => e.type === 'img_drag').id; }));
      await shot('tutor', () => page.click('#ns-fab'));
      await page.evaluate(() => closeTutor());
      await shot('lang_home', () => page.evaluate(c => { location.hash = '#/lang/' + c; }, COURSE), 3000);
      await shot('lang_word', () => page.evaluate(c => { const { C } = NoemaLangUI.UI; location.hash = '#/lang/' + c + '/w/de/' + encodeURIComponent(Object.keys(C.lang.de.lex)[40]); }, COURSE), 1200);
      await shot('lang_grammar', () => page.evaluate(c => { location.hash = '#/lang/' + c + '/fn/fn.plural.noun/ar'; }, COURSE), 1200);
      await shot('lang_settings', () => page.evaluate(c => { location.hash = '#/lang/' + c + '/settings'; }, COURSE), 1200);
      await shot('lang_session', async () => { await page.evaluate(c => { location.hash = '#/lang/' + c; }, COURSE); await wait(1500); await page.click('.lx-host .lx-fgo'); }, 1500);
      await shot('signin', () => openCloudForm(page), 600);
      await page.context().close();
    }
    ok(!bad.length, 'right to left: every key page in ar-XB, nothing scrolls sideways' + (bad.length ? ': ' + bad.join(' · ') : ''));
  }

  /* ---------- the report ---------- */
  const list = [...found.values()];
  const show = f => `  ${f.inside ? '(param) ' : ''}“${f.run.slice(0, 90)}”  ← ${f.kind} @ ${f.where}  [${[...f.surfaces].slice(0, 3).join(' · ')}]` + (process.env.I18N_REPORT ? `\n      full: ${f.text.slice(0, 200)}` : '');
  if (process.env.I18N_REPORT) fs.writeFileSync(path.join(SHOTS, 'i18n_runtime_kept.json'), JSON.stringify([...kept].map(([run, v]) => ({ run, ...v })), null, 1));
  fs.writeFileSync(path.join(SHOTS, 'i18n_runtime.json'), JSON.stringify(list.map(f => ({ ...f, surfaces: [...f.surfaces] })), null, 1));
  console.log(`\n${list.length} untranslated texts`); list.forEach(f => console.log(show(f)));
  ok(list.length === 0, 'every interface text is translated (no plain Latin text outside the pseudo-locale’s messages)');
  await browser.close(); srv.close?.();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
