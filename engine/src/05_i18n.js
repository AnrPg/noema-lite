/* ===================== i18n: menus, tabs and back buttons in the learner's language ===================== */
/* The catalogs are i18n/<component>/<locale>.arb (ICU MessageFormat), run by engine/i18n.js (docs/i18n.md). The language is
   S.settings.lang (⚙️ Settings → Display & studying; synced with the account), else the device's. Course material and
   the AI conversations are NOT translated here: they keep their own languages. Numbers and dates: NoemaI18n.fmt. */
const uiLang = () => window.NoemaI18n ? NoemaI18n.lang(S.settings.lang) : 'en';
const t = (key, vars) => window.NoemaI18n ? NoemaI18n.t(key, vars, S.settings.lang) : key;
