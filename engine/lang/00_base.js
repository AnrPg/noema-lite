/* noema-lite · language courses — the UI (docs/LANGUAGES.md §8). Built by tools/build.py into engine/langui.js.
   It runs instead of the subject engine when a language course is open; the runtime logic lives in engine/langcore.js. */
const N = window.NoemaLang;
const UI = { acc: null, id: null, C: null, L: null, lang: null, view: 'home', arg: null, prefs: {}, day: 0 };
/* ---------- inside the frame (docs/LANGUAGES.md §8, docs/NEW_FRAME_AND_LANGUAGES.md): the course is drawn into a host element and
   its addresses live under #/lang/<course>/… — every view keeps writing the course's own addresses (#/c/…, #/fn/…), mapped both ways here ---------- */
const FR = { on: false, base: '', host: null, onRoute: null };
/** A course address (#/c/<id>) as the address bar holds it: #/lang/<course>/c/<id> inside the frame, unchanged without it. */
function toHash(inner) {
  if (!FR.on) return inner || '#/';
  const rest = String(inner || '#/').replace(/^#\/?/, '');
  return FR.base + (rest ? '/' + rest : '');
}
/** The course address of the address bar (#/c/<id>), or null when the frame shows something else. */
function innerHash(full = location.hash) {
  if (!FR.on) return full || '#/';
  if (full === FR.base || full === FR.base + '/') return '#/';
  return full.startsWith(FR.base + '/') ? '#/' + full.slice(FR.base.length + 1) : null;
}

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'href' && typeof v === 'string' && v.startsWith('#/')) e.setAttribute(k, toHash(v));   // links inside the course keep working in the frame
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
  pt: { flag: '🇵🇹' }, ko: { flag: '🇰🇷' }, fa: { flag: '🇮🇷' }, nl: { flag: '🇳🇱' }, pl: { flag: '🇵🇱' }, sw: { flag: '🇹🇿' }, vi: { flag: '🇻🇳' }, uk: { flag: '🇺🇦' }, fi: { flag: '🇫🇮' }, hu: { flag: '🇭🇺' },
};
/** A language's English name for codes without an entry above (Intl knows them all). */
const LANG_DN = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch (e) { return null; } })();
const langDisplay = code => { try { return LANG_DN?.of(code) || code; } catch (e) { return code; } };
const info = code => ({ flag: '🏳️', name: langDisplay(code), ...(LANG_INFO[code] || {}), ...((UI.C?.data.course.flags || {})[code] ? { flag: UI.C.data.course.flags[code] } : {}) });
const LX = code => UI.C.lang[code];
const SUB_EMOJI = { root: '🥕', bulb: '🧅', stem: '🌿', leafy: '🥬', brassica: '🥦', fruitveg: '🍅', cucurbit: '🎃', legume: '🫛', flower: '🌸', sea: '🌊', pron: '👤', verb: '🏃', func: '🔤' };
const conceptEmoji = cid => SUB_EMOJI[UI.C.concepts[cid]?.subgroup] || '🔹';
/** The picture of a concept (core/media, docs/LANGUAGES.md §4.3) — its emoji when it has none or the file can't be loaded. */
function conceptPic(cid, cls = 'lx-temoji') {
  const con = UI.C.concepts[cid], m = con?.media && UI.C.data.media?.[con.media];
  const emo = h('span', { class: cls }, conceptEmoji(cid)); if (!m) return emo;
  const img = h('img', { class: cls + ' lx-pic', src: (UI.C.data.mediaBase || '') + m.file, alt: m.alt || con.gloss, loading: 'lazy', title: `📷 ${m.credit || ''} · ${m.license || ''}` });
  img.addEventListener('error', () => img.replaceWith(emo));
  return img;
}

/** A foreign word as the learner should see it: right font and direction; vowel marks on/off; transliteration or pinyin under it. */
function word(code, text, { lex = null, cls = '', sub = true, marks = null } = {}) {
  const X = LX(code), shown = shownMarks(code, text, lex, marks);   // vowel marks: full · fading · none (P4, 90_script.js)
  const e = h('span', { class: 'lx-w ' + cls, lang: code, dir: X.language.dir || 'ltr' }, shown);
  if (!sub || !lex) return e;
  const helper = code === 'zh' && UI.prefs.pinyin !== false && lex.pinyin && text === lex.lemma ? lex.pinyin.replace(/\s+/g, '')
    : X.language.vowelMarks && (UI.prefs.translit !== false || needTranslit(code)) && lex.translit && text === lex.lemma ? lex.translit : null;   // always until the letters are known (§5.5)
  return helper ? h('span', { class: 'lx-wbox' }, e, h('span', { class: 'lx-help', lang: code === 'zh' ? 'zh-Latn-pinyin' : 'und-Latn' }, helper)) : e;
}
/* ---------- the learner's languages (D18) and words met before they are learned (D19) ---------- */
/** The languages the learner knows: settings, else the course's known languages as native ones. */
/** The learner's languages (D18); without = the language on screen, which is never “familiar” from itself. */
const knowsL = (without = null) => (UI.L.settings.knows || (UI.C.data.course.knownLanguages || []).map(code => ({ code, level: 'native' }))).filter(k => (k.code || k) !== without);
const profileOf = code => (UI.C.data.world?.languages || []).find(l => l.code === code) || null;
const langName = code => code?.startsWith('type:') ? `${code.slice(5)} languages` : code?.startsWith('family:') ? `${code.slice(7)} languages` : (profileOf(code)?.name || info(code).name || code);
/** A bank sentence, word by word: every word shows its meaning on hover and opens its card on tap; unknown words carry 🆕. */
function sentenceView(c, s, unknown = []) {
  if (!s?.tokens) return word(c, s?.text || '', { sub: false });
  const X = LX(c), un = new Set(unknown), parts = [];
  for (const k of s.tokens) {
    const l = k.l || (k.parts || []).map(p => p.l).filter(x => x && X.lex[x]).slice(-1)[0];
    if (k.p || !l || !X.lex[l]) { parts.push({ t: k.t, el: h('span', { lang: c }, k.t) }); continue; }
    const isNew = un.has(l), el = h('span', { class: 'lx-w lx-tok' + (isNew ? ' lx-new' : ''), lang: c, title: (isNew ? '🆕 ' : '') + gloss(c, l), tabindex: '0',
      onclick: e => { e.stopPropagation(); wordPopup(c, l); } }, shownMarks(c, k.t, X.lex[l]));
    parts.push({ t: k.t, el });
  }
  const sp = X.language.tokenJoin !== 'none';
  return h('span', { class: 'lx-sent', lang: c, dir: X.language.dir || 'ltr' }, ...parts.flatMap((p, i) => i && sp && !/^[.,!?;:،؟。，！？、)」]/.test(p.t) ? [' ', p.el] : [p.el]));
}
/** The card of a word over the page (translation first, then everything about it). */
function wordPopup(c, lid) {
  document.querySelector('.lx-pop')?.remove();
  const pop = h('div', { class: 'lx-pop', role: 'dialog', onclick: e => { if (e.target === pop) pop.remove(); } },
    h('div', { class: 'lx-popbox' }, h('div', { class: 'row' }, h('b', {}, gloss(c, lid)), h('button', { class: 'btn ghost small', onclick: () => pop.remove() }, '✕')), wordCardView(c, lid)));
  document.body.append(pop);
}
/** Words met before they were learned (D19): remembered per session, listed at the end of a lesson. */
const metNew = new Map();
function noteNew(c, ids) { for (const l of ids || []) metNew.set(c + '|' + l, { c, l }); }
function newWordsList(title = '🆕 Words you met before learning them') {
  if (!metNew.size) return null;
  const items = [...metNew.values()];
  return h('details', { class: 'lx-sec lx-newlist', open: true }, h('summary', {}, title, h('span', { class: 'tiny' }, ' ' + items.length)),
    h('ul', { class: 'lx-list' }, ...items.map(({ c, l }) => h('li', {}, info(c).flag, ' ', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, LX(c).lex[l].lemma), ' — ', gloss(c, l)))));
}
/** What a word means, in the explanation language. */
function gloss(code, lid) {
  const x = LX(code).lex[lid], c = (x.senses || [])[0];
  return c ? UI.C.concepts[c]?.gloss || c : (x.role || '');
}
const STATE_LABEL = { locked: '🔒 locked', ready: '○ new', seen: '◔ seen', learning: '◑ learning', known_r: '◕ known (reading)', known_p: '● known', mastered: '★ mastered', absent: '— no word', unprepared: '⏳ not written yet', open: '○ open', known: '● known', skipped: '⤼ skipped', passed: '✔ passed', na: '—' };

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
/** Another device changed this course's progress (docs/SYNC.md): fold the stored copies into what this page holds,
    so the next save keeps both (the same rules as the cloud: NoemaCloud.mergeValue on s:lang:… keys). */
function foldRemote(e) {
  if (!UI.C || e.detail?.acc !== UI.acc) return;
  const p = P(), keys = (e.detail.keys || []).filter(k => k.startsWith(p)); if (!keys.length) return;
  const kv = N.toKV(UI.C, UI.L); kv.prefs = UI.prefs;
  for (const full of keys) {
    const k = full.slice(p.length), raw = localStorage.getItem(full); if (raw == null) continue;
    let stored; try { stored = JSON.parse(raw); } catch (x) { continue; }
    if (kv[k] === undefined) { kv[k] = stored; continue; }
    const m = window.NoemaCloud?.mergeValue ? NoemaCloud.mergeValue('s:lang:' + UI.id + ':' + k, JSON.stringify(kv[k]), raw, true).value : raw;
    try { kv[k] = JSON.parse(m); } catch (x) { }
  }
  const L2 = N.fromKV(UI.C, kv); UI.L.settings = L2.settings; UI.L.langs = L2.langs; UI.prefs = kv.prefs || UI.prefs;   // in place: a running session keeps writing into UI.L
  save();
  if (!document.querySelector('.lx-session')) render();
  UI.remoteFolds = (UI.remoteFolds || 0) + 1;
}
addEventListener('noema:remote', foldRemote);
const today = () => N.dayNumber();
const activeLangs = () => (UI.L.settings.languages || UI.C.languages).filter(c => UI.C.lang[c]);
