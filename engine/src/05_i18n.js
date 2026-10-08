/* ===================== i18n: menus, tabs and back buttons in the learner's language ===================== */
/* The bundles live in engine/i18n.js (the pickers in engine/loader.js use them before a subject is open). The language is
   S.settings.lang (⚙️ Settings → Display & studying; synced with the account), else the browser's. Course material and
   the AI conversations are NOT translated here: they keep their own languages. */
const uiLang = () => window.NoemaI18n ? NoemaI18n.lang(S.settings.lang) : 'en';
const t = (key, vars) => window.NoemaI18n ? NoemaI18n.t(key, vars, S.settings.lang) : key;
