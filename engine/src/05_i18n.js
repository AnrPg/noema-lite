/* ===================== i18n: menus, tabs and back buttons in the learner's language ===================== */
/* The catalogs are i18n/<component>/<locale>.arb (ICU MessageFormat), run by engine/i18n.js (docs/i18n.md). The language is
   S.settings.lang (⚙️ Settings → Display & studying; synced with the account), else the device's. Course material and
   the AI conversations are NOT translated here: they keep their own languages. Numbers and dates: NoemaI18n.fmt. */
const uiLang = () => window.NoemaI18n ? NoemaI18n.lang(S.settings.lang) : 'en';
const t = (key, vars) => window.NoemaI18n ? NoemaI18n.t(key, vars, S.settings.lang) : key;
/* The engine's own words (i18n/engine/<locale>.arb, keys 'engine.…'): tE() is t() under a name no local variable shadows
   (many functions here have a local `t`). errText(e): the words for an error of cloud.js / claude.js / llm.js —
   NoemaI18n.err() translates its code and falls back to the (English) message. */
const tE = (key, vars) => t(key, vars);
const errText = e => window.NoemaI18n?.err ? NoemaI18n.err(e) : String(e?.message ?? e ?? '');
/** "Ch3 · Delta Lake": a chapter's short number and a title, in the UI language. */
const chTitle = (num, title) => tE('engine.common.chTitle', { num, title });
/** The title without a leading "Ch3 · " (English, as older records have it, or the UI language's). */
function stripCh(s) {
  const pre = tE('engine.common.chTitle', { num: '\u0001', title: '\u0002' }).split('\u0002')[0];
  const loc = pre.includes('\u0001') ? '|' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\u0001', '\\d+').replace(/\s+/g, '\\s*') : '';
  return String(s ?? '').replace(new RegExp('^(?:Ch\\d+\\s*·\\s*' + loc + ')'), '');   // i18n-ignore
}
