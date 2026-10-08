/* noema-lite · language courses — the UI (docs/LANGUAGES.md §8). Built by tools/build.py into engine/langui.js.
   It runs instead of the subject engine when a language course is open; the runtime logic lives in engine/langcore.js. */
const N = window.NoemaLang;
const UI = { acc: null, id: null, C: null, L: null, lang: null, view: 'home', arg: null, prefs: {}, day: 0 };

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const $ = (s, r = document) => r.querySelector(s);
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
const uniq = a => [...new Set(a)];

/* ---------- languages: names, flags, scripts ---------- */
const LANG_INFO = {
  ar: { flag: '🇸🇦', name: 'Arabic', font: "'Noto Naskh Arabic'" }, he: { flag: '🇮🇱', name: 'Hebrew', font: "'Noto Sans Hebrew'" },
  zh: { flag: '🇨🇳', name: 'Chinese', font: "'Noto Sans SC'" }, de: { flag: '🇩🇪', name: 'German' }, el: { flag: '🇬🇷', name: 'Greek' },
  en: { flag: '🇬🇧', name: 'English' }, ru: { flag: '🇷🇺', name: 'Russian' }, tr: { flag: '🇹🇷', name: 'Turkish' }, hi: { flag: '🇮🇳', name: 'Hindi' },
  fr: { flag: '🇫🇷', name: 'French' }, es: { flag: '🇪🇸', name: 'Spanish' }, it: { flag: '🇮🇹', name: 'Italian' }, ja: { flag: '🇯🇵', name: 'Japanese' },
};
const info = code => ({ flag: '🏳️', name: code, ...(LANG_INFO[code] || {}), ...((UI.C?.data.course.flags || {})[code] ? { flag: UI.C.data.course.flags[code] } : {}) });
const LX = code => UI.C.lang[code];
const SUB_EMOJI = { root: '🥕', bulb: '🧅', stem: '🌿', leafy: '🥬', brassica: '🥦', fruitveg: '🍅', cucurbit: '🎃', legume: '🫛', flower: '🌸', sea: '🌊', pron: '👤', verb: '🏃', func: '🔤' };
const conceptEmoji = cid => SUB_EMOJI[UI.C.concepts[cid]?.subgroup] || '🔹';

/** A foreign word as the learner should see it: right font and direction; vowel marks on/off; transliteration or pinyin under it. */
function word(code, text, { lex = null, cls = '', sub = true } = {}) {
  const X = LX(code), marks = X.language.vowelMarks && UI.prefs.marks === false;
  const shown = marks ? N.stripMarks(code, text) : text;
  const e = h('span', { class: 'lx-w ' + cls, lang: code, dir: X.language.dir || 'ltr' }, shown);
  if (!sub || !lex) return e;
  const helper = code === 'zh' && UI.prefs.pinyin !== false && lex.pinyin && text === lex.lemma ? lex.pinyin.replace(/\s+/g, '')
    : X.language.vowelMarks && UI.prefs.translit !== false && lex.translit && text === lex.lemma ? lex.translit : null;
  return helper ? h('span', { class: 'lx-wbox' }, e, h('span', { class: 'lx-help', lang: code === 'zh' ? 'zh-Latn-pinyin' : 'und-Latn' }, helper)) : e;
}
/** What a word means, in the explanation language. */
function gloss(code, lid) {
  const x = LX(code).lex[lid], c = (x.senses || [])[0];
  return c ? UI.C.concepts[c]?.gloss || c : (x.role || '');
}
const STATE_LABEL = { locked: '🔒 locked', ready: '○ new', seen: '◔ seen', learning: '◑ learning', known_r: '◕ known (reading)', known_p: '● known', mastered: '★ mastered', absent: '— no word', unprepared: '⏳ not written yet', open: '○ open', known: '● known', skipped: '⤼ skipped' };

/* ---------- learner state: one storage key per (language, node) and per (language, function) ---------- */
const P = () => `noema1:${UI.acc}:s:lang:${UI.id}:`;
function loadLearner() {
  const kv = {}, p = P();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(p)) { try { kv[k.slice(p.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { } }
  }
  UI.prefs = kv.prefs || {};
  return N.fromKV(UI.C, kv);
}
let saveTimer = null;
function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => {
    const kv = N.toKV(UI.C, UI.L); kv.prefs = UI.prefs;
    for (const [k, v] of Object.entries(kv)) {
      const key = P() + k, val = JSON.stringify(v);
      if (window.Noema?.kv) Noema.kv.set(key, val); else localStorage.setItem(key, val);   // Noema.kv marks the key for cloud sync
    }
  };
  if (now) go(); else saveTimer = setTimeout(go, 250);
}
const today = () => N.dayNumber();
const activeLangs = () => (UI.L.settings.languages || UI.C.languages).filter(c => UI.C.lang[c]);
