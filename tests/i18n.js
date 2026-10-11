/* The interface-language runtime (engine/i18n.js, docs/i18n.md) in Node: locale resolution and flags, fallback chains, ICU
   plurals per CLDR (ru, ar, fr, ja), digits, drafts and sensitive keys, pseudo-locales, missing keys; then the catalog checks. */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };

cp.execFileSync('node', [path.join(ROOT, 'tools/i18n/build.js')], { stdio: 'ignore' });
/** A fresh window with the runtime, the given config, device languages and stored account settings. */
function boot({ config = {}, languages = ['en-US'], settings = null, host = 'noema-lite.netlify.app', cats = [] } = {}) {
  const store = {}; if (settings) { store['noema1:current'] = JSON.stringify({ acc: 'a1' }); store['noema1:a1:a:settings'] = JSON.stringify(settings); }
  const w = { console: { warn: (...a) => w.warned.push(a.join(' ')), log() { } }, warned: [], navigator: { languages }, location: { hostname: host },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, Intl, Promise, Date, Array, Object, JSON, Math, String, Number, Map, Set };
  w.window = w; w.NOEMA_CONFIG = config; vm.createContext(w);
  for (const f of ['engine/vendor/intl-messageformat.iife.js', 'engine/i18n/en.js', ...cats.map(c => `engine/i18n/${c}.js`), 'engine/i18n.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), w, { filename: f });
  return w;
}

console.log('resolution and flags');
let w = boot({ languages: ['el-GR', 'en'] });
ok(w.NoemaI18n.locale === 'el', 'device el-GR → el (on by default)');
w = boot({ languages: ['de-AT', 'en'] });
ok(w.NoemaI18n.locale === 'en', 'device de-AT → en while de is off');
w = boot({ languages: ['de-AT'], config: { locales: { de: 'on' } } });
ok(w.NoemaI18n.locale === 'de', 'de-AT → de once de is on');
w = boot({ languages: ['es-MX'], config: { locales: { 'es-ES': 'preview' } } });
ok(w.NoemaI18n.locale === 'en', "a 'preview' locale is not used on the live site");
w = boot({ languages: ['es-MX'], config: { locales: { 'es-ES': 'preview' } }, host: 'deploy-preview-12--noema-lite.netlify.app' });
ok(w.NoemaI18n.locale === 'es-ES', 'es-MX → es-ES on a deploy preview');
w = boot({ config: { locales: { 'zh-Hant': 'on', 'zh-Hans': 'on', 'pt-PT': 'on', 'ar-EG': 'on' } } });
const I0 = w.NoemaI18n;
ok(I0.match('zh-TW') === 'zh-Hant' && I0.match('zh-HK') === 'zh-Hant' && I0.match('zh-CN') === 'zh-Hans' && I0.match('zh') === 'zh-Hans', 'zh-TW/HK → Traditional, zh-CN/zh → Simplified');
ok(I0.match('pt-BR') === 'pt-PT' && I0.match('ar-SA') === 'ar-EG' && I0.match('xx') === null, 'pt-BR → pt-PT, ar-SA → ar-EG, unknown → null');
ok(JSON.stringify(I0.chain('zh-Hant')) === '["zh-Hant","en"]' && JSON.stringify(I0.chain('es-ES')) === '["es-ES","es","en"]', 'chains: zh-Hant never falls to Simplified; es-ES → es → en');
w = boot({ languages: ['en'], settings: { lang: 'ru' }, cats: ['ru'] });
ok(w.NoemaI18n.locale === 'ru', "the account's settings.lang wins over the device");
ok(!w.NoemaI18n.available().some(l => l.pseudo), 'pseudo-locales are never offered by default');

console.log('plurals and numbers');
const I = w.NoemaI18n;
const ru = [1, 2, 5, 21, 1.5].map(n => I.t('sh.nMessages', { n }));
ok(/^1 /.test(ru[0]) && ru[0] !== ru[2] && ru[1] !== ru[2] && /^21 /.test(ru[3]) && ru[3].split(' ')[1] === ru[0].split(' ')[1], 'ru: 1 / 2 / 5 / 21 use one/few/many/one: ' + ru.join(' · '));
ok(/1,5/.test(ru[4]), 'ru: fractions use the other form with a decimal comma: ' + ru[4]);
ok(I.fmt.number(1234567.5).replace(/\s/g, ' ') === '1 234 567,5', 'ru numbers: ' + I.fmt.number(1234567.5));
const en = I.t('sh.nMessages', { n: 1 }, 'en');
ok(en === '1 message' && I.t('sh.nMessages', { n: 1000 }, 'en') === '1,000 messages', 'en: "1 message", "1,000 messages"');

// a synthetic catalog for ar, fr, ja (the locales are off: their plural rules are what is tested)
w = boot({ config: { locales: { 'ar-EG': 'on', ja: 'on' } }, languages: ['ar-EG'] });
w.NOEMA_I18N['ar-EG'] = { m: { 'x.n': '{n, plural, zero {لا بطاقات} one {بطاقة واحدة} two {بطاقتان} few {# بطاقات} many {# بطاقة} other {# بطاقة}}' } };
w.NOEMA_I18N.ja = { m: { 'x.n': '{n, plural, other {#枚のカード}}' } };
w.NOEMA_I18N.en.m['x.n'] = '{n, plural, one {# card} other {# cards}}';
const A = w.NoemaI18n;
ok(A.locale === 'ar-EG' && A.dir === 'rtl', 'ar-EG is right-to-left');
const ar = [0, 1, 2, 3, 11, 100].map(n => A.t('x.n', { n }));
ok(ar[0] === 'لا بطاقات' && ar[1] === 'بطاقة واحدة' && ar[2] === 'بطاقتان' && ar[3] === '٣ بطاقات' && ar[4] === '١١ بطاقة', 'ar: zero/one/two/few/many with Arabic-Indic digits: ' + ar.join(' · '));
A.setDigits('ar-EG', 'latn');
ok(A.t('x.n', { n: 3 }) === '3 بطاقات' && A.fmt.number(1234) === '1,234', 'ar: Latin digits on request');
ok(A.t('x.n', { n: 5 }, 'ja') === '5枚のカード', 'ja: one form');
ok(new Intl.PluralRules('fr').select(0) === 'one' && new Intl.PluralRules('fr').select(1.5) === 'one', 'fr: 0 and 1.5 are "one" (CLDR)');

console.log('drafts, sensitive keys, missing keys, pseudo-locales');
w = boot({ languages: ['el'] });
w.NOEMA_I18N.en.m['x.d'] = 'Draft me'; w.NOEMA_I18N.en.m['x.s'] = 'Terms'; w.NOEMA_I18N.en.s = ['x.s'];
w.NOEMA_I18N.el = { m: {}, d: { 'x.d': 'Πρόχειρο', 'x.s': 'Όροι' } };
const D = w.NoemaI18n;
ok(D.t('x.d') === 'Πρόχειρο', 'a draft shows in a locale that is on');
ok(D.t('x.s') === 'Terms', 'a sensitive key never shows a draft (English instead)');
w.NOEMA_CONFIG.i18nDrafts = false; D.setDigits('el', 'latn');
ok(D.t('x.d') === 'Draft me', 'config.i18nDrafts = false: only reviewed translations');
ok(D.t('nope.missing') === 'missing' && w.warned.some(x => /missing key: nope\.missing/.test(x)), 'a missing key is logged once and never crashes');
w = boot({ config: { pseudoLocales: true }, languages: ['en-XA'], cats: ['en-XA'] });
const X = w.NoemaI18n.t('sh.nMessages', { n: 3 });
ok(w.NoemaI18n.locale === 'en-XA' && /^\[.*3.*·+\]$/.test(X) && /[ɱéš]/.test(X), 'en-XA: accented, longer, bracketed — and still formatted: ' + X);
w = boot({ config: { pseudoLocales: true }, languages: ['ar-XB'], cats: ['ar-XB'] });
ok(w.NoemaI18n.dir === 'rtl' && /^‮/.test(w.NoemaI18n.t('sh.nMessages', { n: 3 })), 'ar-XB: right-to-left');

console.log('formatting helpers');
w = boot({ languages: ['el'] });
const F = w.NoemaI18n.fmt;
ok(F.list(['α', 'β', 'γ']) === 'α, β και γ', 'list in el: ' + F.list(['α', 'β', 'γ']));
ok(['ω', 'α', 'Ά'].sort(F.compare).join('') === 'αΆω', 'collation in el: ' + ['ω', 'α', 'Ά'].sort(F.compare).join(''));
ok(F.upper('άλμα') === 'ΆΛΜΑ' || F.upper('άλμα') === 'ΑΛΜΑ', 'locale-aware upper case');
ok(/πριν από 3 ημέρες|πριν 3 ημέρες/.test(F.ago(Date.now() - 3 * 86400e3)), 'relative time: ' + F.ago(Date.now() - 3 * 86400e3));

console.log('catalog checks');
const chk = cp.spawnSync('node', [path.join(ROOT, 'tools/i18n/check.js'), '--json'], { encoding: 'utf8' });
const res = JSON.parse(chk.stdout);
ok(!res.errors.length, `tools/i18n/check.js: ${res.errors.length} error(s)${res.errors.length ? ' — ' + res.errors.slice(0, 5).join(' | ') : ''}`);
const icu = require(path.join(ROOT, 'tools/i18n/check.js'));
ok(icu.apostropheHazard("l'{x}") && !icu.apostropheHazard('l’{x}') && !icu.apostropheHazard("it''s {x}"), "the apostrophe check catches l'{x}");

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
