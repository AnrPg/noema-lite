/* noema-lite — the interface language (docs/i18n.md). One runtime for every screen:
   • catalogs: i18n/<component>/<locale>.arb (ICU MessageFormat) → built by tools/i18n/build.js into engine/i18n/<locale>.js;
     English is loaded with the page, any other locale lazily (a <script>, so it works on file:// and offline too);
   • t(key, params) formats with intl-messageformat (plurals, select, numbers in the locale's digits) along the
     fallback chain of the locale (pt-PT → pt → en …); a missing key shows the English text and is logged once;
   • the locale: the account's choice (a:settings.lang; Arabic digits: a:settings.numerals), else the device's languages (BCP 47 lookup), else English;
     each locale has a flag in config.js (locales: { tag: 'on' | 'preview' | 'off' }) — 'preview' only on deploy previews;
   • Intl helpers: numbers, dates, relative time, lists, collation, plural categories, names order.
   Keeps the older API: NoemaI18n.t(key, vars, pref), .lang(pref), .browser(), .LANGS. */
(function (root) {
  'use strict';
  /* ---------- the UI locales (endonyms, never flags) ---------- */
  const LOCALES = [
    { tag: 'en', name: 'English' }, { tag: 'el', name: 'Ελληνικά' }, { tag: 'ru', name: 'Русский' }, { tag: 'fr', name: 'Français' },
    { tag: 'ar-EG', name: 'العربية (مصر)', dir: 'rtl' }, { tag: 'de', name: 'Deutsch' }, { tag: 'hi', name: 'हिन्दी' },
    { tag: 'zh-Hans', name: '中文（简体）' }, { tag: 'zh-Hant', name: '中文（繁體）' }, { tag: 'ja', name: '日本語', familyFirst: true },
    { tag: 'it', name: 'Italiano' }, { tag: 'es-ES', name: 'Español (España)' }, { tag: 'sq', name: 'Shqip' }, { tag: 'pt-PT', name: 'Português (Portugal)' }, { tag: 'tr', name: 'Türkçe' },
    // pseudo-locales for testing (never offered unless config.pseudoLocales): accented +40 %, and right-to-left
    { tag: 'en-XA', name: '[Ƥşḗŭḓǿ]', pseudo: true }, { tag: 'ar-XB', name: '[ˁƤşḗŭḓǿ RTL]', pseudo: true, dir: 'rtl' },
  ];
  for (const L of LOCALES) { L.dir = L.dir || 'ltr'; if (/^(zh|ja)/.test(L.tag)) L.familyFirst = true; }
  const BY = Object.fromEntries(LOCALES.map(L => [L.tag.toLowerCase(), L]));
  /** The fallback chain of a locale: itself, its language without the region, English (Traditional never falls to Simplified). */
  function chain(tag) {
    const out = [tag], parts = tag.split('-');
    if (parts.length > 1 && !/^zh-/i.test(tag)) out.push(parts[0]);
    if (tag === 'en-XA') out.push('en'); if (tag === 'ar-XB') out.push('en');
    if (!out.includes('en')) out.push('en');
    return out;
  }
  const CFG = () => root.NOEMA_CONFIG || {};
  const isPreviewHost = () => { try { return !!CFG().i18nPreview || /^(deploy-preview-\d+|[\w-]+--)/.test(location.hostname); } catch (e) { return false; } };
  /** 'on' | 'preview' | 'off' for a locale (config.locales; English is always on; the four shipped locales default to on). */
  function flag(tag) {
    if (tag === 'en') return 'on';
    const L = BY[tag.toLowerCase()]; if (!L) return 'off';
    if (L.pseudo) return CFG().pseudoLocales ? 'on' : 'off';
    const f = (CFG().locales || {})[L.tag] ?? (['el', 'ru', 'fr'].includes(L.tag) ? 'on' : 'off');
    return f;
  }
  const usable = tag => { const f = flag(tag); return f === 'on' || (f === 'preview' && isPreviewHost()); };
  /** The locales offered in the picker: those switched on (and preview ones on deploy previews). */
  const available = () => LOCALES.filter(L => usable(L.tag));

  /* ---------- locale resolution (RFC 4647 lookup with a few known equivalences) ---------- */
  function match(raw) {
    if (!raw) return null;
    const t = String(raw).replace(/_/g, '-').trim(), lo = t.toLowerCase(), base = lo.split('-')[0];
    if (BY[lo] && usable(BY[lo].tag)) return BY[lo].tag;
    if (base === 'zh') { const trad = /-(hant|tw|hk|mo)\b/.test(lo); const x = trad ? 'zh-Hant' : 'zh-Hans'; return usable(x) ? x : null; }
    const byBase = { es: 'es-ES', pt: 'pt-PT', ar: 'ar-EG' }[base] || (BY[base] ? BY[base].tag : null);
    return byBase && usable(byBase) ? byBase : null;
  }
  const deviceList = () => { try { return navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]; } catch (e) { return []; } };
  /** The device's best supported locale (or 'en'). */
  const browser = () => deviceList().map(match).find(Boolean) || 'en';
  /** The locale to show for a preference (the account's settings.lang): the preference when usable, else the device's, else English. */
  const lang = pref => match(pref) || browser();

  /* ---------- catalogs ---------- */
  const CAT = root.NOEMA_I18N = root.NOEMA_I18N || {};   // tag → { m: messages, d: drafts }
  const loading = {};
  const base = () => { try { const s = document.currentScript?.src || [...document.scripts].map(x => x.src).find(x => /engine\/i18n\.js/.test(x)); return s ? s.replace(/i18n\.js(\?.*)?$/, 'i18n/') : 'engine/i18n/'; } catch (e) { return 'engine/i18n/'; } };
  const BASE = base();
  /** Load a locale's catalog (and its fallbacks) → Promise. English comes with the page. */
  function load(tag) {
    return Promise.all(chain(tag).filter(t => !CAT[t] && t !== 'en' && BY[t.toLowerCase()]).map(t => loading[t] || (loading[t] = new Promise(res => {
      if (typeof document === 'undefined') return res(false);
      const s = document.createElement('script'); s.src = BASE + t + '.js'; s.async = true;
      s.onload = () => res(true); s.onerror = () => { console.warn('[i18n] no catalog for ' + t); res(false); };
      document.head.append(s);
    })))).then(() => { cache.clear(); return tag; });
  }
  const cache = new Map(), missing = new Set();
  const IMF = () => root.IntlMessageFormat && (root.IntlMessageFormat.IntlMessageFormat || root.IntlMessageFormat.default || root.IntlMessageFormat);
  /** May Claude's draft (not yet reviewed in Weblate) be shown? In a 'preview' locale yes; in a locale that is 'on' too (unless
      config.i18nDrafts === false) — but never for a key marked sensitive (legal, billing, safety: "x-sensitive" in en.arb). */
  function draftOK(t, key) {
    const D = CFG().i18nDrafts; if (D === true) return true;
    if ((CAT.en && CAT.en.s || []).includes(key)) return false;
    const f = flag(t); return f === 'preview' || (f === 'on' && D !== false);
  }
  /** The message of a key for a locale: approved first, then a draft (draftOK), along the chain. */
  function source(tag, key) {
    for (const t of chain(tag)) {
      const c = CAT[t]; if (!c) continue;
      if (c.m && c.m[key] != null) return [c.m[key], t];
      if (c.d && c.d[key] != null && draftOK(t, key)) return [c.d[key], t];
    }
    return [null, null];
  }
  /** The locale string Intl uses: the tag plus the chosen digits (Arabic: arab by default, latn on request). */
  function intlTag(tag) {
    const nu = (state.digits || {})[tag];
    return nu ? `${tag}-u-nu-${nu}` : tag;
  }
  /** In a right-to-left locale a text put into a message ({title}, {name} …: a subject's title, a name — often left-to-right)
      is bidi-isolated (FSI … PDI), so its direction neither takes from nor gives to the sentence around it. Only plain {x}
      arguments: numbers, plurals and selects keep their values. */
  const SIMPLE = new Map();
  function isolate(tag, msg, params) {
    if (!params || (BY[tag.toLowerCase()] || {}).dir !== 'rtl') return params;
    let names = SIMPLE.get(msg);
    if (!names) { names = new Set([...String(msg).matchAll(/\{\s*(\w+)\s*\}/g)].map(m => m[1])); SIMPLE.set(msg, names); }
    let out = params;
    for (const k of names) if (typeof params[k] === 'string' && params[k]) { if (out === params) out = { ...params }; out[k] = '⁨' + params[k] + '⁩'; }
    return out;
  }
  function format(tag, key, params) {
    const [msg, from] = source(tag, key);
    if (msg == null) {
      if (!missing.has(key)) { missing.add(key); console.warn('[i18n] missing key: ' + key); }
      return key.split('.').pop();
    }
    const ck = tag + '\u0000' + key;
    let f = cache.get(ck);
    if (!f) {
      const M = IMF();
      if (!M) f = { format: p => String(msg).replace(/\{(\w+)\}/g, (m, k) => p && p[k] != null ? String(p[k]) : m) };
      else try { f = new M(msg, intlTag(from === 'en' && tag !== 'en' ? 'en' : tag), undefined, { ignoreTag: true }); }
      catch (e) { console.warn('[i18n] invalid message ' + key + ' (' + from + '): ' + e.message); f = { format: () => msg }; }
      cache.set(ck, f);
    }
    try { const out = f.format(isolate(tag, msg, params) || {}); return Array.isArray(out) ? out.join('') : out; }
    catch (e) { console.warn('[i18n] ' + key + ': ' + e.message); return String(msg); }
  }
  /** t('home.due', { n: 3 }) in the current locale; the third argument (a preference) is kept for older callers. */
  function t(key, params, pref) {
    let tag = state.locale;
    if (pref !== undefined) { tag = lang(pref); if (!chain(tag).every(x => x === 'en' || CAT[x] || !BY[x.toLowerCase()])) load(tag); }   // not loaded yet: English now, the right words on the next draw
    return format(tag, key, params);
  }
  const has = (key, tag = state.locale) => source(tag, key)[0] != null;
  /** The words for an error: a backend answer { code, params, message } or an Error with .code/.params → t('err.' + code),
      else its (English) message — older servers and unknown codes keep working (docs/i18n.md §6). */
  function err(e) {
    if (e == null) return '';
    const x = e.error && typeof e.error === 'object' ? e.error : e, code = x.code, msg = x.message || (typeof e === 'string' ? e : String(e));
    return code && has('err.' + code) ? t('err.' + code, x.params || {}) : msg;
  }

  /* ---------- the current locale ---------- */
  /** The last account's settings (a:settings: lang, numerals) — read before any account is open, so the first screen is right. */
  const accountSettings = () => { try { const c = JSON.parse(localStorage.getItem('noema1:current') || '{}') || {}; return c.acc ? JSON.parse(localStorage.getItem(`noema1:${c.acc}:a:settings`) || '{}') || {} : {}; } catch (e) { return {}; } };
  const state = { locale: 'en', digits: {} };
  try { const a = accountSettings(); state.locale = lang(a.lang); if (a.numerals) state.digits = { 'ar-EG': a.numerals }; } catch (e) { state.locale = browser(); }
  const listeners = [];
  /** Switch to a locale (the account's preference, or null for the device's) → Promise once its catalog is in. */
  function use(pref, { digits } = {}) {
    const tag = lang(pref); if (digits) state.digits = { ...state.digits, ...digits };
    return load(tag).then(() => {
      const changed = tag !== state.locale; state.locale = tag; if (digits) cache.clear();
      apply(); if (changed) listeners.forEach(f => { try { f(tag); } catch (e) { console.warn(e); } });
      return tag;
    });
  }
  /** <html lang dir> follow the UI locale (the content keeps its own lang/dir on each element). */
  function apply(first) {
    try { const L = BY[state.locale.toLowerCase()] || BY.en, d = document.documentElement; if (first) d.lang = L.tag; d.dir = L.dir; d.dataset.uiLocale = L.tag; } catch (e) { }
  }
  const ready = load(state.locale).then(() => { apply(true); return state.locale; });

  /* ---------- Intl helpers (never hand-formatted) ---------- */
  const COLL = { c: null, loc: null };
  const fmt = {
    number: (n, o) => new Intl.NumberFormat(intlTag(state.locale), o).format(n),
    percent: (x, o) => new Intl.NumberFormat(intlTag(state.locale), { style: 'percent', maximumFractionDigits: 0, ...o }).format(x),
    // a missing or broken time stamp (an old record, a hand-edited backup) gives '' — never a RangeError that stops a whole page from drawing
    date: (d, o = { dateStyle: 'medium' }) => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : new Intl.DateTimeFormat(intlTag(state.locale), o).format(x); },
    time: (d, o = { timeStyle: 'short' }) => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : new Intl.DateTimeFormat(intlTag(state.locale), o).format(x); },
    relative: (v, unit, o = { numeric: 'auto' }) => new Intl.RelativeTimeFormat(intlTag(state.locale), o).format(v, unit),
    /** “3 days ago” from a time stamp, in the largest fitting unit. */
    ago(ts, now = Date.now()) {
      const s = Math.round((ts - now) / 1000), a = Math.abs(s);
      const [v, u] = a < 60 ? [s, 'second'] : a < 3600 ? [Math.round(s / 60), 'minute'] : a < 86400 ? [Math.round(s / 3600), 'hour'] : a < 2592000 ? [Math.round(s / 86400), 'day'] : a < 31536000 ? [Math.round(s / 2592000), 'month'] : [Math.round(s / 31536000), 'year'];
      return fmt.relative(v, u);
    },
    list: (items, o = { type: 'conjunction' }) => new Intl.ListFormat(state.locale, o).format(items.map(String)),
    collator: (o = { sensitivity: 'base', numeric: true }) => new Intl.Collator(state.locale, o),
    compare: (a, b) => { if (!COLL.c || COLL.loc !== state.locale) { COLL.c = fmt.collator(); COLL.loc = state.locale; } return COLL.c.compare(String(a ?? ''), String(b ?? '')); },   // one Collator per locale: a sort calls this thousands of times
    plural: n => new Intl.PluralRules(state.locale).select(n),
    /** A person's name in the locale's order (family first for ja and zh). */
    name: (given, family) => (BY[state.locale.toLowerCase()] || {}).familyFirst ? [family, given].filter(Boolean).join('') : [given, family].filter(Boolean).join(' '),
    /** Language names in the UI language (Intl.DisplayNames). */
    langName: code => { try { return new Intl.DisplayNames([state.locale, 'en'], { type: 'language' }).of(code) || code; } catch (e) { return code; } },
    /** Locale-aware case: Greek uppercase without accents comes from the locale rules. */
    upper: s => String(s).toLocaleUpperCase(state.locale), lower: s => String(s).toLocaleLowerCase(state.locale),
  };

  const LANGS = LOCALES.filter(L => !L.pseudo).map(L => [L.tag, L.name]);   // older callers: [[tag, endonym]] (filtered by available() where offered)
  root.NoemaI18n = {
    t, has, err, lang, browser, match, chain, use, load, ready, flag, available, onChange: f => listeners.push(f),
    get locale() { return state.locale; }, get dir() { return (BY[state.locale.toLowerCase()] || BY.en).dir; },
    setDigits: (tag, nu) => { state.digits = { ...state.digits, [tag]: nu }; cache.clear(); },
    fmt, LOCALES, LANGS, missingKeys: () => [...missing], catalogs: CAT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
