/* ===================== noema-lite engine — core (subject-agnostic) ===================== */
'use strict';
const COURSE = window.COURSE;               // array of chapters of the loaded subject pack (set by the loader)
const SUBJ = Noema.subject;                    // subject.json of the loaded pack
const ACCOUNT = Noema.account;                 // current profile / cloud account
/* i18n-ignore-start */   // the tutor's defaults are words for the AI's prompts (20_ai.js), not for the learner
const TUTOR = Object.assign({ name: 'Brick', avatar: '🦉', domain: SUBJ.title, prior: '', examples: 'Concrete, everyday examples from the subject.', interviewer: `an examiner for ${SUBJ.title}`, simulation: 'a realistic problem, misconception or anomaly from the subject', terminology: 'the canonical terminology of the field', examinerRole: `${SUBJ.title} examiner` }, SUBJ.tutor || {});
/* i18n-ignore-end */
// in the new frame the tutor is the character on screen now (NoemaThemes.current(): the learner's own, or the one on a 5-minute try), named in the menus' language;
// read on every use, so a try or a change shows at once everywhere (buttons, the drawer, the prompts)
if (window.NoemaShell?.mounted && window.NoemaThemes) for (const [k, f] of [['name', t => t.n], ['avatar', t => t.emoji]]) Object.defineProperty(TUTOR, k, { get: () => f(NoemaThemes.tutor()), enumerable: true });
const APP_TITLE = SUBJ.appTitle || `${SUBJ.title} Quest`;
const DEFAULT_KEY = Noema.local.geminiKey || window.DEFAULT_GEMINI_KEY || '';
/* a chapter's colours (--c, --c-bg, --c-ink as text, --c-fill/--c-on as a fill under text) come from engine/tokens.css by
   data-ci (src/ui/tokens/chapters.ts, light and dark, checked for contrast by tokens.test.ts); this is their number */
const CHAPTER_COLOURS = 13;

/* ---------- indexes ---------- */
const CH = {}, SEC = {}, EX = {}, PB = {};
COURSE.forEach((c, i) => {
  c._i = i; CH[c.id] = c;
  c.sections.forEach((s, j) => { s._ch = c; s._j = j; SEC[s.id] = s; });
  c.exercises.forEach(e => { e._ch = c; EX[e.id] = e; });
  c.debug.forEach(d => { d._ch = c; PB[d.id] = d; });
});
const ALL_EX = COURSE.flatMap(c => c.exercises);

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));   // i18n-ignore
function fmt(s) {               // inline markdown-lite → safe HTML
  s = String(s ?? '');
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')   // i18n-ignore
    .replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}
const F = s => h('span', { html: fmt(s) });
/* an arrow written into a text points along the reading direction: mirrored in a right-to-left interface (docs/i18n.md §5) */
const arrowBack = () => window.NoemaI18n?.dir === 'rtl' ? '→' : '←', arrowOn = () => window.NoemaI18n?.dir === 'rtl' ? '←' : '→';
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();
const today = () => NoemaCore.clock.today();   // the learner's local day (src/kernel/day.ts)
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- syntax highlight ---------- */
const KW = {
  /* i18n-ignore-start */
  sql: 'select from where group by order having limit join left right inner outer full cross on as and or not null is in exists between like case when then else end create replace table view or if insert into values overwrite update set delete merge using matched source target alter add column columns drop truncate describe detail history restore version timestamp of vacuum retain hours optimize zorder cluster partitioned tblproperties show tables schemas catalogs use catalog schema grant revoke to all privileges with distinct union explain analyze compute statistics refresh streaming live stream materialized constraint expect violation fail row rows over partition row_number rank desc asc true false cast coalesce sum count avg min max apply purge reorg full by liquid auto',
  python: 'def return import from as if elif else for while in not and or is none true false class with try except finally raise lambda yield pass break continue global print self',
  /* i18n-ignore-end */
};
const KWSET = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));
function highlight(code, lang) {
  lang = (lang || '').toLowerCase();
  const set = KWSET[lang === 'pyspark' ? 'python' : lang];
  const re = /(--[^\n]*|#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|([\s\S])/g;
  let out = '', m;
  while ((m = re.exec(code))) {
    if (m[1]) {
      const isCom = (lang === 'sql' && m[1].startsWith('--')) || ((lang === 'python' || lang === 'bash' || lang === 'yaml' || lang === 'pyspark') && m[1].startsWith('#'));
      out += isCom ? `<span class="tk-c">${esc(m[1])}</span>` : esc(m[1]);
    } else if (m[2]) out += `<span class="tk-s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tk-n">${m[3]}</span>`;
    else if (m[4]) {
      const w = m[4];
      if (set && set.has(w.toLowerCase())) out += `<span class="tk-k">${w}</span>`;
      else if (m[5] && lang !== 'text') out += `<span class="tk-f">${w}</span>`;
      else out += w;
      if (m[5]) out += esc(m[5]);
    } else out += esc(m[6]);
  }
  return out;
}
function guessLang(code) {
  if (/spark\.|\bdf\.|dbutils|^\s*import |\.write\b|\.read\b|\bF\.|^\s*def |display\(/m.test(code)) return 'python';
  if (/\b(select|insert|merge|update|delete|create|alter|describe|show|grant|revoke|optimize|vacuum|restore|row_number|partition by|count\(|truncate|refresh|use)\b/i.test(code)) return 'sql';
  if (/^\s*(databricks|pip|git|%sh)\b/m.test(code)) return 'bash';
  return 'text';
}
function codeBlock(code, lang) {
  const pre = h('div', { class: 'pre', html: highlight(code, lang) });
  if (lang && lang !== 'text') pre.prepend(h('span', { class: 'lang' }, lang));
  const cp = h('button', { class: 'copy', onclick: e => { e.stopPropagation(); navigator.clipboard?.writeText(code); toast(tE('engine.core.copied')); } }, tE('engine.core.copy'));
  pre.append(cp);
  return pre;
}
/* chat markdown */
function md(s) {                 // full markdown (marked + DOMPurify when available), lite fallback
  if (window.marked && window.DOMPurify) { try { return mdRich(s); } catch (e) { NoemaCore.errors.report(e, { where: 'engine.markdown', severity: 'warning' }); } }
  return mdLite(s);
}
function mdLite(s) {
  s = String(s ?? '');
  const parts = s.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  const wrap = h('div');
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) {
      const txt = parts[i];
      if (!txt.trim()) continue;
      const lines = txt.split('\n');
      let list = null, ltype = null, para = [];
      const flushP = () => { if (para.length) { wrap.append(h('p', { html: para.map(fmt).join('<br>') })); para = []; } };
      const flushL = () => { if (list) { wrap.append(list); list = null; ltype = null; } };
      for (const ln of lines) {
        const ul = ln.match(/^\s*[-*•]\s+(.*)/), ol = ln.match(/^\s*\d+[.)]\s+(.*)/), hd = ln.match(/^\s*#{1,4}\s+(.*)/);
        if (ul || ol) {
          flushP();
          const t = ul ? 'ul' : 'ol';
          if (!list || ltype !== t) { flushL(); list = h(t); ltype = t; }
          list.append(h('li', { html: fmt((ul || ol)[1]) }));
        } else if (hd) { flushP(); flushL(); wrap.append(h('p', { html: '<strong>' + fmt(hd[1]) + '</strong>' })); }
        else if (!ln.trim()) { flushP(); flushL(); }
        else { flushL(); para.push(ln); }
      }
      flushP(); flushL();
    } else if (i % 3 === 1) {
      wrap.append(codeBlock(parts[i + 1].replace(/\n$/, ''), parts[i] || 'text')); i++;
    }
  }
  return wrap;
}

/* ---------- state ---------- */
/* Progress is the account's learning log (NoemaCore.learning, src/features/study/application/learning-log.ts): every
   answer, review, read section, XP… is recorded as an event (LOG.record), and S is this subject's fold of them — read
   only, the same object while events fold in (another tab, another device, a restore). Settings:
                        per-account settings  → noema1:<account>:a:settings   (model, theme, goal…: the log's copy)
                        this subject's        → the log (srcOn: the sources it shows)
                        the Gemini key        → noema-device:geminiKey:<account>  (this device only, Noema.geminiKey)
                        XP / streak across all subjects → Noema.stats (the log's)                               */
const LOG = NoemaCore.learning;
const SETTINGS_KEY = Noema.kv.accountKey('settings');
const SETTINGS_DEFAULT = { apiKey: DEFAULT_KEY, model: '', models: [], theme: 'auto', sound: true, goal: 120, chunk: true };
Noema.geminiKey.migrate(ACCOUNT.id);   // the Gemini key lives on this device only (never in a:settings → never synced)
const subjectSrcOn = () => LOG.settings(SUBJ.id).srcOn ?? null;
const PAGE_SETTINGS = (() => {
  let g = {};
  try { g = JSON.parse(Noema.kv.get(SETTINGS_KEY) || '{}'); } catch (e) { g = {}; }
  delete g.apiKey;
  return Object.assign({}, SETTINGS_DEFAULT, g, { srcOn: subjectSrcOn() }, Noema.geminiKey.get(ACCOUNT.id) ? { apiKey: Noema.geminiKey.get(ACCOUNT.id) } : {});
})();
const S = new Proxy(LOG.progress(SUBJ.id), {
  get: (p, k) => k === 'settings' ? PAGE_SETTINGS : p[k],
  set(p, k) { NoemaCore.errors.report(new Error('progress is recorded as events (NoemaCore.learning.record), never written: S.' + String(k)), { where: 'engine.state.write', severity: 'error' }); return true; },
  deleteProperty(p, k) { NoemaCore.errors.report(new Error('progress is recorded as events, never deleted: S.' + String(k)), { where: 'engine.state.write', severity: 'error' }); return true; },
});
/** Records one event of this subject (LOG.record) → the event, or null (refused: reported). */
const learnt = (type, item, data = {}, more = {}) => LOG.record({ type, subject: SUBJ.id, ...(item == null ? {} : { item }), data, ...more });
if (!S.settings.apiKey) S.settings.apiKey = DEFAULT_KEY;
/* a:settings has other writers too (the character, the menus' language, the native language, a course…): S.settings is this page's
   copy of it. What the page last read or wrote, key by key: a save writes only the keys changed HERE, so it can never put an
   older copy back over a choice made elsewhere (e.g. a new character chosen in the frame while this subject was open). */
let settingsSeen = {};
const seeSettings = () => { settingsSeen = {}; for (const k of Object.keys(S.settings)) settingsSeen[k] = JSON.stringify(S.settings[k]); };
seeSettings();
/* flashcards have ids now (chNN-fNNN); their progress used to be keyed by position (chNN#k), which shifted when a card
   was inserted. Positional progress moves to the card's id (card.imported from the old key: idempotent, a moved key is gone;
   if both exist the id's later review wins). */
COURSE.forEach(c => c.flashcards.forEach((f, k) => {
  const old = c.id + '#' + k, r = S.fc[old];
  if (!f.id || !r) return;
  learnt('card.imported', f.id, { box: r.box || 0, ...(r.due ? { due: r.due } : {}), from: old });
}));
let saveT;
function flushSave() {
  clearTimeout(saveT);
  const { srcOn, apiKey, mt: _mt, ...glob } = S.settings;   // a:settings.mt is engine/mt.js's own (written there): never written back from this copy
  if (JSON.stringify(srcOn ?? null) !== JSON.stringify(subjectSrcOn())) LOG.setSubjectSetting(SUBJ.id, 'srcOn', srcOn ?? null);
  Noema.geminiKey.set(ACCOUNT.id, apiKey);   // this device only; the default key is not stored
  let cur = {}; try { cur = JSON.parse(Noema.kv.get(SETTINGS_KEY) || '{}') || {}; } catch (e) { NoemaCore.errors.report(e, { where: 'engine.settings.read', severity: 'warning' }); }
  delete cur.apiKey;
  for (const k of Object.keys(glob)) if (!(k in cur) || JSON.stringify(glob[k]) !== settingsSeen[k]) cur[k] = glob[k];
  Noema.kv.set(SETTINGS_KEY, JSON.stringify(cur));   // → setting.changed events (engine/loader.js)
  Object.assign(S.settings, cur); seeSettings();   // the page's copy follows what the others saved
  LOG.flush();
}
function save() { clearTimeout(saveT); saveT = setTimeout(flushSave, 150); }
/* the settings changed elsewhere (another tab or device, a restore): this page's copy follows, so the next save can't write
   the older copy back; the log changed (the same): the page shows it */
LOG.onSettings(g => { const x = { ...g }; delete x.apiKey; Object.assign(S.settings, x, { srcOn: subjectSrcOn() }); seeSettings(); });
LOG.onChange((evs, why) => {
  if (why === 'local') return;   // this page's own: it drew them already
  try { renderTopStats(); if (why !== 'tab') route(); } catch (x) { NoemaCore.errors.report(x, { where: 'engine.remote.render', severity: 'error' }); }   // another tab's answer never redraws an exercise being done here
});
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function touchStreak() { Noema.stats.touchStreak(); }
function addXP(n, el) {
  if (n <= 0) return;
  const before = Noema.stats.todayXP(), LV = window.NoemaShell?.level, lv0 = LV ? LV(LOG.stats().xp || 0).lv : 0;
  learnt('xp.earned', null, { amount: Math.max(1, Math.round(n)) });
  renderTopStats();
  const r = el?.getBoundingClientRect?.();
  const f = h('div', { class: 'xpfloat', style: { left: (r ? r.left + r.width / 2 : innerWidth / 2) + 'px', top: (r ? r.top : innerHeight / 2) + 'px' } }, tE('engine.core.xpFloat', { n }));
  document.body.append(f); setTimeout(() => f.remove(), 1200);
  const RX = window.NoemaShell?.mounted ? window.NoemaReact : null;   // the character's reactions live in the new frame
  if (before < S.settings.goal && Noema.stats.todayXP() >= S.settings.goal) { if (RX) RX.big('goal'); else confetti(160); toast('🎯 ' + tE('engine.core.goalSmashed')); }
  else if (LV && RX && LV(LOG.stats().xp || 0).lv > lv0) RX.big('level');
}
/** An answer to an exercise (conf: how sure the learner was this time: sure | think | guess). */
function record(ex, ok, firstTry = true, conf = null) {
  learnt('answer.given', ex.id, { ok: !!ok, firstTry: !!firstTry, ...(conf ? { conf } : {}) });
}
const solved = id => S.res[id]?.ok > 0;

/* ---------- sound ---------- */
let AC;
function beep(kind) {
  if (!S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [660, 880] : kind === 'win' ? [523, 659, 784, 1046] : kind === 'tap' ? [540] : [220, 180];
    notes.forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'bad' ? 'triangle' : 'sine'; o.frequency.value = f;
      const t = AC.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch (e) { NoemaCore.errors.report(e, { where: 'engine.sound', severity: 'debug' }); }
}

/* ---------- confetti ---------- */
function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // i18n-ignore
  let cv = $('#confetti');
  if (!cv) { cv = h('canvas', { id: 'confetti' }); document.body.append(cv); }
  const ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#ff6b6b', '#ffb020', '#2ec4b6', '#4d7cfe', '#a35cff', '#40c057', '#e64fa5'];
  const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: -Math.random() * 14 - 4, s: Math.random() * 7 + 4, c: cols[Math.random() * cols.length | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 0 }));
  let fr = 0;
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (++fr < 140) requestAnimationFrame(tick); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}
function toast(msg, ms = 2200) {
  NoemaCore.notify.toast(window.Noema?.plain ? Noema.plain.text(msg) : msg, { ms });
}
function modal(build) {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) close(); } });
  const box = h('div', { class: 'box' }); m.append(box);
  const close = () => m.remove();
  build(box, close); window.Noema?.plain?.watch(box); document.body.append(m);
  return close;
}
function confirmBox(text, onYes) {
  modal((b, close) => b.append(h('h3', {}, text), h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } },
    h('button', { class: 'btn', onclick: close }, tE('engine.core.cancel')), h('button', { class: 'btn primary', onclick: () => { close(); onYes(); } }, tE('engine.core.yes')))));
}

/* ---------- theming per chapter ---------- */
function isDark() { return document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); }   // i18n-ignore
function setAccent(el, ch) { el.dataset.ci = String(ch ? (ch._ci ?? ch._i) % CHAPTER_COLOURS : 7); }
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

/* ---------- progress ---------- */
function chProgress(c) {
  const sr = c.sections.filter(s => S.read[s.id]).length / c.sections.length;
  const ex = c.exercises.filter(e => solved(e.id)).length / c.exercises.length;
  return { sr, ex };
}

/* ---------- section plain text (for AI context) ---------- */
/* i18n-ignore-start */   // context for the AI's prompts (English, like the prompts themselves)
function blockText(b) {
  switch (b.t) {
    case 'p': return b.text;
    case 'list': return b.items.map(x => '- ' + x).join('\n');
    case 'code': return '```' + (b.lang || '') + '\n' + b.code + '\n```';
    case 'diagram': return b.text;
    case 'table': return [b.head.join(' | '), ...b.rows.map(r => r.join(' | '))].join('\n');
    case 'callout': return `[${b.kind.toUpperCase()}] ${b.title || ''}: ${b.text}`;
    case 'compare': return b.items.map(i => i.title + ': ' + i.points.join('; ')).join('\n');
    case 'flow': return b.items.join(' → ');
    case 'reveal': return `Q: ${b.label}\nA: ${b.text}`;
    case 'ask': return (b.title || 'Ask yourself') + ':\n' + b.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    case 'terms': return b.items.map(i => `${i.term}: ${i.def}`).join('\n');
    case 'figure': return figureAsText(b);
    case 'interactive': return interactiveAsText(b);
  }
  return '';
}
function sectionText(s) { return `## ${s.title}\n${s.hook || ''}\n` + s.blocks.map(blockText).join('\n\n'); }
function chapterOutline(c) {
  return `# Chapter ${c.num}: ${c.title} — ${c.subtitle}\nMantra: ${c.mantra}\nSections:\n` + c.sections.map(s => `- ${s.title}: ${s.hook || ''}`).join('\n') +
    '\nKey pitfalls:\n' + c.pitfalls.map(p => `- ${p.title}: ${p.text}`).join('\n');
}
/* i18n-ignore-end */
