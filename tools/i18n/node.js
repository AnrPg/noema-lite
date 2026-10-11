/* noema-lite in Node (tests, tools, the skill's scripts): the interface texts in English, formatted exactly as the app formats
   them (docs/i18n.md). Node has no account and no screen, so its output never depends on the machine's language.
     english() → { messages, IntlMessageFormat }   the English catalog and the vendored intl-messageformat, without touching
                                                     any global (engine/langcore.js calls it by itself when NoemaI18n is absent)
     load()    → NoemaI18n                          intl-messageformat, the English catalog and engine/i18n.js in Node's global,
                                                     pinned to English (for a Node consumer that wants the whole runtime)
   Where the files come from: in the repo, i18n/<component>/en.arb (always current, no build needed), engine/vendor/ and
   engine/i18n.js; in the skill noema-language-builder (scripts/i18n/, tools/build.py lang_builder_files) the copies next to
   this file: en.js (the built English catalog), intl-messageformat.iife.js, i18n.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..'), REPO = fs.existsSync(path.join(ROOT, 'engine', 'langcore.js')) && fs.existsSync(path.join(ROOT, 'i18n'));
const first = (...ps) => ps.find(p => fs.existsSync(p)) || null;
const FILES = REPO ? {
  imf: () => first(path.join(ROOT, 'engine', 'vendor', 'intl-messageformat.iife.js')),
  arbDir: () => path.join(ROOT, 'i18n'),
  enJs: () => first(path.join(ROOT, 'engine', 'i18n', 'en.js')),
  runtime: () => first(path.join(ROOT, 'engine', 'i18n.js')),
} : {
  imf: () => first(path.join(__dirname, 'intl-messageformat.iife.js')),
  arbDir: () => null,
  enJs: () => first(path.join(__dirname, 'en.js')),
  runtime: () => first(path.join(__dirname, 'i18n.js')),
};
const need = (f, what) => { if (!f) throw new Error('i18n (Node): ' + what + ' not found next to ' + __dirname); return f; };

/** The English messages: every i18n/<component>/en.arb merged (as tools/i18n/build.js does), else the built en.js. */
function englishMessages() {
  const dir = FILES.arbDir();
  if (dir) {
    const m = {};
    for (const c of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, c, 'en.arb'); if (!fs.existsSync(f)) continue;
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) if (!k.startsWith('@')) m[k] = v;
    }
    return m;
  }
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(need(FILES.enJs(), 'en.js'), 'utf8'), ctx);
  return ((ctx.window.NOEMA_I18N || {}).en || {}).m || {};
}
let IMF = null;
/** The vendored intl-messageformat class, run in its own context (no global is changed). */
function messageFormat() {
  if (IMF) return IMF;
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(need(FILES.imf(), 'intl-messageformat.iife.js'), 'utf8') + ';this.__IMF = IntlMessageFormat;', ctx);
  const M = ctx.__IMF; IMF = M.IntlMessageFormat || M.default || M;
  return IMF;
}
let EN = null;
function english() { if (!EN) EN = { messages: englishMessages(), IntlMessageFormat: messageFormat() }; return EN; }

/** The whole runtime in Node's global, in English: globalThis.IntlMessageFormat, NOEMA_I18N.en, NoemaI18n. */
function load() {
  const g = globalThis;
  if (g.NoemaI18n) return g.NoemaI18n;
  if (!g.IntlMessageFormat) vm.runInThisContext(fs.readFileSync(need(FILES.imf(), 'intl-messageformat.iife.js'), 'utf8') + ';globalThis.IntlMessageFormat = IntlMessageFormat;');
  const cat = g.NOEMA_I18N = g.NOEMA_I18N || {};
  if (!cat.en) cat.en = { m: english().messages };
  // pinned to English: while engine/i18n.js picks its locale, no other locale is switched on (Node's navigator.languages
  // follows the machine's LANG — a Greek machine would otherwise print Greek)
  const had = Object.prototype.hasOwnProperty.call(g, 'NOEMA_CONFIG'), cfg = g.NOEMA_CONFIG;
  g.NOEMA_CONFIG = { ...(cfg || {}), locales: {}, pseudoLocales: false };
  for (const t of ['el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT']) g.NOEMA_CONFIG.locales[t] = 'off';
  try { vm.runInThisContext(fs.readFileSync(need(FILES.runtime(), 'i18n.js'), 'utf8'), { filename: 'i18n.js' }); }
  finally { if (had) g.NOEMA_CONFIG = cfg; else delete g.NOEMA_CONFIG; }
  return g.NoemaI18n;
}

module.exports = { english, load };
