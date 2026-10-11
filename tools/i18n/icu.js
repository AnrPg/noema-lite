/* Shared helpers for the i18n tools (Node): load the ARB catalogs, parse ICU messages with the same intl-messageformat the app
   uses (engine/vendor/intl-messageformat.iife.js), print an AST back, list placeholders and plural categories. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const CAT_DIR = path.join(ROOT, 'i18n');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine', 'vendor', 'intl-messageformat.iife.js'), 'utf8') + ';this.__IMF = IntlMessageFormat;', ctx);
const IMF = ctx.__IMF.IntlMessageFormat;
const T = { literal: 0, argument: 1, number: 2, date: 3, time: 4, select: 5, plural: 6, pound: 7, tag: 8 };

/** The UI locales (BCP 47) in the order of docs/i18n.md. */
const LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT'];
const components = () => fs.readdirSync(CAT_DIR).filter(d => fs.statSync(path.join(CAT_DIR, d)).isDirectory()).sort();
const readArb = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(f + ': ' + e.message); } };
/** {component: {locale: arb, …}} and the drafts {component: {locale: arb}}. */
function loadAll() {
  const cats = {}, drafts = {};
  for (const c of components()) {
    cats[c] = {}; drafts[c] = {};
    for (const f of fs.readdirSync(path.join(CAT_DIR, c))) if (f.endsWith('.arb')) cats[c][f.slice(0, -4)] = readArb(path.join(CAT_DIR, c, f));
    const dd = path.join(CAT_DIR, c, 'drafts');
    if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd)) if (f.endsWith('.arb')) drafts[c][f.slice(0, -4)] = readArb(path.join(dd, f));
  }
  return { cats, drafts };
}
const messages = arb => Object.fromEntries(Object.entries(arb || {}).filter(([k]) => !k.startsWith('@')));
/** Parse → AST (throws with the reason on invalid syntax). */
const parse = (msg, loc = 'en') => new IMF(msg, loc, undefined, { ignoreTag: true }).getAst();
/** Placeholders of a message: {name: kind} (argument, number, date, time, select, plural) — nested ones included. */
function placeholders(ast, out = {}) {
  for (const el of ast) {
    if (el.type === T.literal || el.type === T.pound) continue;
    out[el.value] = ['', 'argument', 'number', 'date', 'time', 'select', 'plural', '', 'tag'][el.type];
    if (el.options) for (const o of Object.values(el.options)) placeholders(o.value, out);
    if (el.children) placeholders(el.children, out);
  }
  return out;
}
/** Every plural element: [{name, keys:[…]}] */
function plurals(ast, out = []) {
  for (const el of ast) {
    if (el.type === T.plural) out.push({ name: el.value, keys: Object.keys(el.options), ordinal: el.pluralType === 'ordinal' });
    if (el.options) for (const o of Object.values(el.options)) plurals(o.value, out);
  }
  return out;
}
const esc = s => s.replace(/'/g, "''").replace(/([{}])/g, "'$1'");
/** AST → ICU text; lit(s) may change the literal parts (pseudo-localization). */
function print(ast, lit = s => s, inPlural = false) {
  return ast.map(el => {
    switch (el.type) {
      case T.literal: return esc(lit(el.value)).replace(inPlural ? /#/g : /$^/, "'#'");
      case T.argument: return `{${el.value}}`;
      case T.number: case T.date: case T.time: { const k = ['', '', 'number', 'date', 'time'][el.type]; const st = el.style ? (typeof el.style === 'string' ? el.style : '::' + (el.style.pattern || el.style.skeleton || (el.style.tokens || []).map(x => x.stem + (x.options.length ? '/' + x.options.join('/') : '')).join(' '))) : ''; return `{${el.value}, ${k}${st ? ', ' + st : ''}}`; }
      case T.select: return `{${el.value}, select, ${Object.entries(el.options).map(([k, o]) => `${k} {${print(o.value, lit, inPlural)}}`).join(' ')}}`;
      case T.plural: return `{${el.value}, ${el.pluralType === 'ordinal' ? 'selectordinal' : 'plural'}, ${el.offset ? `offset:${el.offset} ` : ''}${Object.entries(el.options).map(([k, o]) => `${k} {${print(o.value, lit, true)}}`).join(' ')}}`;
      case T.pound: return '#';
      case T.tag: return `<${el.value}>${print(el.children, lit, inPlural)}</${el.value}>`;
    }
    return '';
  }).join('');
}
module.exports = { ROOT, CAT_DIR, IMF, T, LOCALES, components, loadAll, messages, parse, placeholders, plurals, print, readArb };
