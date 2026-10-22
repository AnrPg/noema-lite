/* The CI checks of the UI catalogs (docs/i18n.md §7). Exit 1 on any error.
   Usage: node tools/i18n/check.js [--warn-only] [--json]
   Errors:   invalid ICU · a translation's placeholders differ from English · a plural without the categories its locale needs
             (CLDR: ru one/few/many/other, ar zero/one/two/few/many/other …) · a key that English does not have · a key missing
             in a locale that is switched on (config.js locales, default el/ru/fr) · an ASCII apostrophe that starts ICU quoting
             (write ’ U+2019, or '' for a literal ') · an English key without a description (@key.description) for translators.
   Warnings: keys no code seems to use (keys built at run time are listed in i18n/<component>/dynamic_keys.txt), drafts waiting for review. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, LOCALES, loadAll, messages, parse, placeholders, plurals } = require('./icu');
const args = process.argv.slice(2);
const errors = [], warnings = [];
const E = (where, msg) => errors.push(`${where}: ${msg}`), W = (where, msg) => warnings.push(`${where}: ${msg}`);

/** The locale flags as the app reads them (config.js, without config.local.js). */
function flags() {
  const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx); } catch (e) { W('config.js', 'not readable: ' + e.message); }
  const cfg = ctx.window.NOEMA_CONFIG || {}, on = {};
  for (const l of LOCALES) on[l] = l === 'en' ? 'on' : (cfg.locales || {})[l] ?? (['el', 'ru', 'fr'].includes(l) ? 'on' : 'off');
  return on;
}
/** Always-available context values (the frame passes them to every 'sh.' message): the tutor character's name in the forms a
    language needs — tutor (plain), tutorNom (with article), tutorAcc (object), tutorTo (to/at …), Tutor (capitalised). */
const CONTEXT = /^(tutor|tutorAcc|tutorTo|tutorNom|Tutor)$/;
const pluralNeeds = loc => new Intl.PluralRules(loc).resolvedOptions().pluralCategories;
/** An ASCII apostrophe right before { } # | starts a quoted literal in ICU: the placeholder would print as text. */
const apostropheHazard = msg => /(^|[^'])'(?=[{}#|])/.test(msg);

function checkMessage(where, loc, key, msg, en) {
  if (typeof msg !== 'string') return E(where, `${key} is not a string`);
  if (apostropheHazard(msg)) E(where, `${key}: an ASCII ' before { } # or | starts ICU quoting — use ’ (U+2019) or ''`);
  let ast; try { ast = parse(msg, loc); } catch (e) { return E(where, `${key}: invalid ICU — ${e.message}`); }
  for (const p of plurals(ast)) {
    if (!p.keys.includes('other')) E(where, `${key}: plural {${p.name}} has no 'other'`);
    if (p.ordinal) continue;
    const need = pluralNeeds(loc).filter(c => c !== 'other' && !p.keys.includes(c));
    // English 'one' covers only 1, so a locale may say =1 instead; zero/two/few/many must be there when the locale has them
    const missing = need.filter(c => !(c === 'one' && p.keys.includes('=1')) && !(c === 'zero' && p.keys.includes('=0')));
    if (missing.length) E(where, `${key}: plural {${p.name}} misses ${missing.join(', ')} (${loc} needs ${pluralNeeds(loc).join('/')})`);
  }
  if (en == null || loc === 'en') return ast;
  let enAst; try { enAst = parse(en, 'en'); } catch (e) { return ast; }
  const a = placeholders(ast), b = placeholders(enAst);
  for (const [n, kind] of Object.entries(b)) if (!(n in a) && !CONTEXT.test(n)) E(where, `${key}: placeholder {${n}} of English is missing`);
  for (const [n, kind] of Object.entries(a)) {
    if (!(n in b)) { if (!CONTEXT.test(n)) E(where, `${key}: placeholder {${n}} is not in English`); }
    else if (kind !== b[n] && !(['argument', 'number', 'plural', 'select'].includes(kind) && ['argument', 'number', 'plural', 'select'].includes(b[n]))) E(where, `${key}: {${n}} is ${kind} here but ${b[n]} in English`);
  }
  return ast;
}

function run() {
  const { cats, drafts } = loadAll(), on = flags();
  const enAll = {};
  for (const [comp, byLoc] of Object.entries(cats)) {
    const en = byLoc.en; if (!en) { E(`i18n/${comp}`, 'no en.arb (English is the source)'); continue; }
    for (const [k, v] of Object.entries(messages(en))) {
      if (enAll[k] != null) E(`i18n/${comp}/en.arb`, `${k} is also in another component`);
      enAll[k] = v;
      checkMessage(`i18n/${comp}/en.arb`, 'en', k, v);
      const meta = en['@' + k];
      if (!meta || !String(meta.description || '').trim()) E(`i18n/${comp}/en.arb`, `${k} has no @${k}.description for translators`);
    }
    for (const [loc, arb] of Object.entries(byLoc)) {
      if (loc === 'en') continue;
      if (!LOCALES.includes(loc)) { E(`i18n/${comp}/${loc}.arb`, 'not a UI locale of docs/i18n.md'); continue; }
      const m = messages(arb);
      for (const [k, v] of Object.entries(m)) { if (messages(en)[k] == null) E(`i18n/${comp}/${loc}.arb`, `${k} is not in English (remove it, or add it to en.arb)`); else checkMessage(`i18n/${comp}/${loc}.arb`, loc, k, v, messages(en)[k]); }
    }
    for (const [loc, arb] of Object.entries(drafts[comp] || {})) {
      const m = messages(arb);
      for (const [k, v] of Object.entries(m)) { if (messages(en)[k] == null) E(`i18n/${comp}/drafts/${loc}.arb`, `${k} is not in English`); else checkMessage(`i18n/${comp}/drafts/${loc}.arb`, loc, k, v, messages(en)[k]); }
    }
    for (const loc of LOCALES) {
      if (loc === 'en' || on[loc] !== 'on') continue;
      const m = messages(byLoc[loc]), d = messages((drafts[comp] || {})[loc]), keys = Object.keys(messages(en));
      const miss = keys.filter(k => m[k] == null && d[k] == null), unrev = keys.filter(k => m[k] == null && d[k] != null);
      const sens = unrev.filter(k => (en['@' + k] || {})['x-sensitive']);
      if (miss.length) E(`i18n/${comp}/${loc}.arb`, `${miss.length} key(s) neither translated nor drafted in a locale that is on: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? ' …' : ''}`);
      if (sens.length) E(`i18n/${comp}/${loc}.arb`, `${sens.length} sensitive key(s) (legal/billing/safety) only drafted in a locale that is on — review them in Weblate: ${sens.slice(0, 8).join(', ')}`);
      if (unrev.length) W(`i18n/${comp}/${loc}`, `${unrev.length} draft(s) waiting for review`);
    }
  }
  // keys no code uses (warning): the key, or its part after the component prefix, must appear as a string somewhere
  const src = ['engine', 'cloud'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.(m?js|html)$/.test(f) && !/engine\/(i18n|vendor)\//.test(f) && !/engine\/(engine|langui|authoring)\.js$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  // keys built at run time ('sh.dom_' + id …) are listed per component in i18n/<component>/dynamic_keys.txt (one key or prefix* per line)
  const dyn = Object.keys(cats).flatMap(c => { try { return fs.readFileSync(path.join(ROOT, 'i18n', c, 'dynamic_keys.txt'), 'utf8').split('\n').map(s => s.replace(/#.*/, '').trim()).filter(Boolean); } catch (e) { return []; } });
  for (const k of Object.keys(enAll)) {
    const short = k.replace(/^(sh|vault|social|report)\./, '');
    if (dyn.some(p => p.endsWith('*') ? k.startsWith(p.slice(0, -1)) : p === k)) continue;
    if (!src.includes(`'${k}'`) && !src.includes(`"${k}"`) && !src.includes(`'${short}'`) && !src.includes(`"${short}"`)) W('unused?', k);
  }
  return { on };
}
function walk(d) { let out = []; for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, f); out = fs.statSync(p).isDirectory() ? out.concat(walk(p)) : out.concat(p); } return out; }

if (require.main === module) {
  run();
  if (args.includes('--json')) console.log(JSON.stringify({ errors, warnings }, null, 1));
  else {
    for (const w of warnings.slice(0, 40)) console.log('warn  ' + w);
    if (warnings.length > 40) console.log(`warn  … ${warnings.length - 40} more`);
    for (const e of errors.slice(0, 200)) console.log('ERROR ' + e);
    console.log(`i18n check: ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  process.exit(errors.length && !args.includes('--warn-only') ? 1 : 0);
}
module.exports = { run, errors, warnings, apostropheHazard };
