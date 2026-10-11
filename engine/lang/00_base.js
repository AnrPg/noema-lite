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
/* ---------- the three languages (docs/i18n.md §1): the UI language (menus, buttons, labels, messages: the catalog i18n/lang/, keys
   lang.*) · the course's speaker language (UI.C.explainLang: the course's own explanations come from its data; the few explanations
   this code writes itself are lang.expl.* and follow it when it is a UI locale) · the learned languages (never translated) ---------- */
const LT = (k, p) => window.NoemaI18n ? NoemaI18n.t(k, p) : k;
/* an arrow written into a text points along the reading direction: mirrored in a right-to-left interface (docs/i18n.md §5) */
const arrowBack = () => window.NoemaI18n?.dir === 'rtl' ? '→' : '←', arrowOn = () => window.NoemaI18n?.dir === 'rtl' ? '←' : '→';
const LE = (k, p) => !window.NoemaI18n ? k : UI.C?.explainLang && NoemaI18n.match(UI.C.explainLang) ? NoemaI18n.t(k, p, UI.C.explainLang) : NoemaI18n.t(k, p);
/** A list in the UI locale (“a, b, c” in English, as the course always wrote it; “a, b и c” in Russian …). */
const LLIST = items => window.NoemaI18n && NoemaI18n.locale !== 'en' ? NoemaI18n.fmt.list(items.map(String)) : items.join(', ');
/** A message with elements inside (a link, a bold word): LTE('lang.x', { link: element, n: 3 }) → [text, element, text …], the
    element where the message puts its placeholder (ICU formats the rest). */
const LTE = (k, p = {}) => {
  const els = {}, q = {};
  for (const [n, v] of Object.entries(p)) if (typeof Node !== 'undefined' && v instanceof Node) { els[n] = v; q[n] = '\u0001' + n + '\u0001'; } else q[n] = v;
  return LT(k, q).split('\u0001').map((x, i) => i % 2 ? (els[x] || x) : x).filter(x => x !== '');
};
/** A language's name for a lang.expl.* message: in the language that message is shown in (the explanation language when it is a UI locale). */
const explName = code => { try { const loc = window.NoemaI18n && UI.C?.explainLang && NoemaI18n.match(UI.C.explainLang) ? UI.C.explainLang : (window.NoemaI18n?.locale || 'en'); return new Intl.DisplayNames([loc, 'en'], { type: 'language' }).of(code) || code; } catch (e) { return code; } };
/** A number in the UI locale's digits. */
const LNUM = n => window.NoemaI18n ? NoemaI18n.fmt.number(n) : String(n);
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
const uniq = a => [...new Set(a)];

/* ---------- languages: names, flags, scripts ---------- */
const LANG_INFO = {   // the names come from Intl in the UI language (uiLangName)
  ar: { flag: '🇸🇦', font: "'Noto Naskh Arabic'" }, he: { flag: '🇮🇱', font: "'Noto Sans Hebrew'" },   // i18n-ignore
  zh: { flag: '🇨🇳', font: "'Noto Sans SC'" }, de: { flag: '🇩🇪' }, el: { flag: '🇬🇷' },   // i18n-ignore
  en: { flag: '🇬🇧' }, ru: { flag: '🇷🇺' }, tr: { flag: '🇹🇷' }, hi: { flag: '🇮🇳' },
  fr: { flag: '🇫🇷' }, es: { flag: '🇪🇸' }, it: { flag: '🇮🇹' }, ja: { flag: '🇯🇵' },
  pt: { flag: '🇵🇹' }, ko: { flag: '🇰🇷' }, fa: { flag: '🇮🇷' }, nl: { flag: '🇳🇱' }, pl: { flag: '🇵🇱' }, sw: { flag: '🇹🇿' }, vi: { flag: '🇻🇳' }, uk: { flag: '🇺🇦' }, fi: { flag: '🇫🇮' }, hu: { flag: '🇭🇺' },
};
/** A language's name in the UI language (Intl knows them all; English when the runtime is missing). */
const LANG_DN = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch (e) { return null; } })();
const langDisplay = code => { try { return LANG_DN?.of(code) || code; } catch (e) { return code; } };
const uiLangName = code => window.NoemaI18n ? NoemaI18n.fmt.langName(code) : langDisplay(code);
/** A language: its flag, its name in the UI language (name: inside a sentence) and as a label of its own (label: “Arabe”, not “arabe”). */
const capFirst = s => { const a = [...String(s || '')]; return a.length ? (window.NoemaI18n ? NoemaI18n.fmt.upper(a[0]) : a[0].toUpperCase()) + a.slice(1).join('') : ''; };
const info = code => ({ flag: '🏳️', ...(LANG_INFO[code] || {}), name: uiLangName(code), get label() { return capFirst(this.name); }, ...((UI.C?.data.course.flags || {})[code] ? { flag: UI.C.data.course.flags[code] } : {}) });
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
/* ---------- the learner's native language (D19, docs/language-packs.md §2.2) and words met before they are learned (D20) ---------- */
/** The account's settings (a:settings: synced; the native language lives there, for every course). */
const accSettings = () => { try { return JSON.parse(localStorage.getItem(`noema1:${UI.acc}:a:settings`) || '{}') || {}; } catch (e) { return {}; } };
function putAccSettings(patch) {
  if (window.NoemaThemes?.putSettings) return NoemaThemes.putSettings(patch, UI.acc);
  const k = `noema1:${UI.acc}:a:settings`, s = Object.assign(accSettings(), patch); Object.keys(patch).forEach(x => patch[x] === undefined && delete s[x]);
  if (window.Noema?.kv) Noema.kv.set(k, JSON.stringify(s)); else try { localStorage.setItem(k, JSON.stringify(s)); } catch (e) { }
}
let nativeMemo = null;
/** The learner's native language: a:settings.native, else the course's settings.knows entry at level native → {code?, name, type, family, branch, supported} | null. */
const nativeL = () => {
  const raw = (localStorage.getItem(`noema1:${UI.acc}:a:settings`) || '') + '|' + JSON.stringify(UI.L?.settings.knows || null);
  if (nativeMemo && nativeMemo.raw === raw && nativeMemo.C === UI.C) return nativeMemo.v;
  const v = N.nativeOf(UI.C, accSettings().native, UI.L?.settings.knows); nativeMemo = { raw, C: UI.C, v }; return v;
};
/** The languages that decide what is familiar (D18, R1: the native language and the ones spoken at C1 / C2); without = the language on screen, never “familiar” from itself. */
const knowsL = (without = null) => [...N.nativeKnows(nativeL()), ...N.speaksOf(UI.L?.settings.knows, nativeL()).map(s => ({ ...s, level: s.level }))].filter(k => (k.code || k.name) !== without);
const profileOf = code => (UI.C.data.world?.languages || []).find(l => l.code === code) || null;
/** A learner's language by name: a group (type:… / family:…), else the course profile's (English) name in an English UI, else the UI language's name. */
const langName = code => code?.startsWith('type:') ? LT('lang.base.langGroup', { group: code.slice(5) }) : code?.startsWith('family:') ? LT('lang.base.langGroup', { group: code.slice(7) }) : code?.startsWith('branch:') ? LT('lang.base.langGroup', { group: code.slice(7) })
  : (() => { const ui = info(code).name; return (!window.NoemaI18n || NoemaI18n.locale === 'en' || ui === code) && profileOf(code)?.name || ui || code; })();   // Intl without a name: the profile's
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
/** Words met before they were learned (D20): remembered per session, listed at the end of a lesson. */
const metNew = new Map();
function noteNew(c, ids) { for (const l of ids || []) metNew.set(c + '|' + l, { c, l }); }
function newWordsList(title = '🆕 ' + LT('lang.base.metBefore')) {
  if (!metNew.size) return null;
  const items = [...metNew.values()];
  return h('details', { class: 'lx-sec lx-newlist', open: true }, h('summary', {}, title, h('span', { class: 'tiny' }, ' ' + LNUM(items.length))),
    h('ul', { class: 'lx-list' }, ...items.map(({ c, l }) => h('li', {}, info(c).flag, ' ', h('button', { class: 'btn ghost small', onclick: () => wordPopup(c, l) }, LX(c).lex[l].lemma), ' — ', gloss(c, l), paramsLine(c, l)))));
}
/** What a word means, in the explanation language. */
function gloss(code, lid) {
  const x = LX(code).lex[lid], c = (x.senses || [])[0];
  return c ? UI.C.concepts[c]?.gloss || c : (x.role || '');
}
/** The state of a word or a step: its sign + its name in the UI language (STATE_LABEL[state], read at draw time). */
const STATE_SIGN = { locked: '🔒', ready: '○', seen: '◔', learning: '◑', known_r: '◕', known_p: '●', mastered: '★', absent: '—', unprepared: '⏳', open: '○', known: '●', skipped: '⤼', passed: '✔' };
const STATE_LABEL = new Proxy({}, { get: (o, s) => s === 'na' ? '—' : typeof s === 'string' && STATE_SIGN[s] ? STATE_SIGN[s] + ' ' + LT('lang.state.' + s) : undefined });

/* ---------- learner state: one storage key per (language, node) and per (language, function) ---------- */
const P = () => `noema1:${UI.acc}:s:lang:${UI.id}:`;
function loadLearner() {
  const kv = {}, p = P();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(p)) { try { kv[k.slice(p.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) { } }
  }
  UI.prefs = kv.prefs || {};
  const L = N.fromKV(UI.C, kv);
  L.settings.languages = UI.C.languages.slice();   // D21: the course's settings say what it teaches now (the others' progress stays stored)
  return L;
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
  if (!studyAnswer()) { const ch = studyChoice(); if (ch.langs.join() !== UI.C.languages.join() && !document.querySelector('.lx-session')) { save(true); return restudy(); } }   // another device chose other languages (before D21's answer)
  UI.L.settings.languages = UI.C.languages.slice();
  save();
  if (!document.querySelector('.lx-session')) render();
  UI.remoteFolds = (UI.remoteFolds || 0) + 1;
}
addEventListener('noema:remote', foldRemote);
const today = () => N.dayNumber();
const activeLangs = () => (UI.L.settings.languages || UI.C.languages).filter(c => UI.C.lang[c]);
/* ---------- D21: the learner chooses the languages to study (docs/LANGUAGES.md §8 *Languages to study*) ----------
   One answer for the whole app: a:settings.studyLangs (synced, in backups) — the languages the learner studies, in every course
   that has them. The course is built with only those (N.course(data, {languages})), so every view, session, generator, compare
   table and bridge knows only them; the progress of the others stays stored (one key per language and node, §5.6) and is back as
   soon as they are chosen again. Before the learner answers, a course teaches what it taught before (its settings.languages, else all). */
/** The stored settings of the open course (before the learner state is loaded). */
const storedCourseSettings = () => { try { return JSON.parse(localStorage.getItem(P() + 'settings') || '{}') || {}; } catch (e) { return {}; } };
/** The account's answer (codes) or null when the learner has not answered yet. */
const studyAnswer = () => { const s = accSettings().studyLangs; return Array.isArray(s) ? s : null; };
/** N.studyLangs for the open course: {langs, chosen, none}. */
const studyChoice = (data = UI.data) => N.studyLangs(data.course.languages, studyAnswer(), UI.L && UI.L.course === UI.id ? UI.L.settings.languages : storedCourseSettings().languages);
/** Every language the app offers to study (the library's courses and the learner's own, loader.js), this course's first. */
const offeredLangs = () => uniq([...(UI.data?.course.languages || []), ...((window.Noema?.langStudy?.offered?.(UI.acc)) || []).map(x => x.code)]);
/** Store a new answer (codes, in any order) for the whole app. */
function putStudy(codes) {
  const all = offeredLangs(), want = all.filter(c => codes.includes(c)).concat(codes.filter(c => !all.includes(c)));
  if (window.Noema?.langStudy?.set) Noema.langStudy.set(UI.acc, want); else putAccSettings({ studyLangs: want });
}
/** Study / stop studying one language of this course (⚙️ Settings): the answer so far (all the app's languages before the first
    one) with this language in or out — a course never ends up with none. */
function toggleStudy(code, on) {
  const cur = studyAnswer() || offeredLangs().filter(c => !UI.data.course.languages.includes(c) || UI.C.languages.includes(c));
  const next = on ? uniq([...cur, code]) : cur.filter(c => c !== code);
  if (!UI.data.course.languages.some(c => next.includes(c))) return false;
  putStudy(next); restudy(); return true;
}
