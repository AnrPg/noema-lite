/* One-off (Wave 0): the legacy bundles (engine/i18n.js, engine/i18n_shell.js — kept in tools/i18n/legacy_*.js) → ARB catalogs
   i18n/core/<locale>.arb and i18n/shell/<locale>.arb. '<key>1' / '<key>0' variants become ICU plurals of <key>.
   Usage: node tools/i18n/migrate_legacy.js */
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const w = {}; vm.createContext(w); w.window = w;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'legacy_i18n.js'), 'utf8'), w);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'legacy_i18n_shell.js'), 'utf8'), w);
const core = w.NoemaI18n.bundles, shell = w.NOEMA_SHELL_WORDS;
const LOCS = ['en', 'el', 'ru', 'fr'];
const NUMERIC = /^(n|of|xp|goal|fc|pb|count|num|done|total|left|right|wrong|days|min|max|k|m|sec|secs|mins)$/;
// plain {n} → {n, number}: numbers are formatted in the locale's digits only through ICU's number type
const numArgs = s => s.replace(/\{(\w+)\}/g, (m, k) => NUMERIC.test(k) ? `{${k}, number}` : m);
// an ICU apostrophe quotes the next { } # — the catalogs use ’ (U+2019); an ASCII ' next to them is doubled
const apos = s => s.replace(/'(?=[{}#])/g, "''");
const clean = s => apos(numArgs(String(s)));
function pluralize(base, one, zero, loc) {
  const other = clean(base).replace(/\{n, number\}/g, '#'), on = one != null ? clean(one).replace(/\{n, number\}/g, '#').replace(/(^|[^\d])1(?!\d)/, '$1#') : null;
  const z = zero != null ? `=0 {${clean(zero).replace(/\{n, number\}/g, '#')}} ` : '';
  if (on == null) return clean(base);
  const cats = new Intl.PluralRules(loc).resolvedOptions().pluralCategories;
  const parts = [`one {${on}}`]; for (const c of ['few', 'many']) if (cats.includes(c)) parts.push(`${c} {${other}}`);
  return `{n, plural, ${z}${parts.join(' ')} other {${other}}}`;
}
function component(name, bundle, prefix) {
  for (const loc of LOCS) {
    const B = bundle[loc] || {}, en = bundle.en, out = { '@@locale': loc };
    for (const k of Object.keys(en).filter(k => !(name === 'core' && k.startsWith('sh.')))) {
      if (/[01]$/.test(k) && en[k.slice(0, -1)] !== undefined) continue;   // folded into the plural of the base key
      const v = B[k]; if (v == null) continue;
      const one = B[k + '1'], zero = B[k + '0'];
      out[prefix + k] = pluralize(v, one, zero, loc);
      if (loc === 'en') out['@' + prefix + k] = { description: '', ...(one != null || zero != null ? { placeholders: { n: { type: 'num' } } } : {}) };
    }
    const dir = path.join(ROOT, 'i18n', name); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, loc + '.arb'), JSON.stringify(out, null, 2) + '\n');
    console.log(name, loc, Object.keys(out).filter(k => !k.startsWith('@')).length);
  }
}
component('core', core, '');
component('shell', shell, 'sh.');
