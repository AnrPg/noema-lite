/* ===================== Learning Quest engine — core (subject-agnostic) ===================== */
'use strict';
const COURSE = window.COURSE;               // array of chapters of the loaded subject pack (set by the loader)
const SUBJ = LQ.subject;                    // subject.json of the loaded pack
const ACCOUNT = LQ.account;                 // current profile / cloud account
const TUTOR = Object.assign({ name: 'Brick', avatar: '🦉', domain: SUBJ.title, prior: '', examples: 'Concrete, everyday examples from the subject.', interviewer: `an examiner for ${SUBJ.title}`, simulation: 'a realistic problem, misconception or anomaly from the subject', terminology: 'the canonical terminology of the field', examinerRole: `${SUBJ.title} examiner` }, SUBJ.tutor || {});
const APP_TITLE = SUBJ.appTitle || `${SUBJ.title} Quest`;
const DEFAULT_KEY = LQ.local.geminiKey || window.DEFAULT_GEMINI_KEY || '';
const PALETTE = [
  ['#ff6b6b','#ffe7e7'],['#ff922b','#fff0e1'],['#f2a20c','#fff4d6'],['#40c057','#e4f7e8'],['#12b5a5','#ddf6f3'],
  ['#3b9cf6','#e1effe'],['#5c6cff','#e8eaff'],['#9254ff','#f0e7ff'],['#e64fa5','#fde6f3'],['#f0563d','#fde9e4'],['#2b8a3e','#e3f4e6'],['#1c7ed6','#dfeefc'],['#d9480f','#ffe8d9']];
const PALETTE_DARK = ['#ff8787','#ffa94d','#ffc53d','#69db7c','#38d9c6','#5fb0ff','#8291ff','#b083ff','#f783c6','#ff8a6e','#51cf66','#4dabf7','#ff8c42'];

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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fmt(s) {               // inline markdown-lite → safe HTML
  s = String(s ?? '');
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}
const F = s => h('span', { html: fmt(s) });
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/;$/, '').trim();
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- syntax highlight ---------- */
const KW = {
  sql: 'select from where group by order having limit join left right inner outer full cross on as and or not null is in exists between like case when then else end create replace table view or if insert into values overwrite update set delete merge using matched source target alter add column columns drop truncate describe detail history restore version timestamp of vacuum retain hours optimize zorder cluster partitioned tblproperties show tables schemas catalogs use catalog schema grant revoke to all privileges with distinct union explain analyze compute statistics refresh streaming live stream materialized constraint expect violation fail row rows over partition row_number rank desc asc true false cast coalesce sum count avg min max apply purge reorg full by liquid auto',
  python: 'def return import from as if elif else for while in not and or is none true false class with try except finally raise lambda yield pass break continue global print self',
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
  const cp = h('button', { class: 'copy', onclick: e => { e.stopPropagation(); navigator.clipboard?.writeText(code); toast('Copied 📋'); } }, 'copy');
  pre.append(cp);
  return pre;
}
/* chat markdown */
function md(s) {                 // full markdown (marked + DOMPurify when available), lite fallback
  if (window.marked && window.DOMPurify) { try { return mdRich(s); } catch (e) { } }
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
/* State is namespaced: per-subject progress  → lq1:<account>:s:<subject>:state
                        per-account settings  → lq1:<account>:a:settings   (API key, model, theme, goal…)
                        XP / streak across all subjects → LQ.stats (lq1:<account>:a:stats)            */
const STATE_KEY = LQ.kv.subjectKey('state'), SETTINGS_KEY = LQ.kv.accountKey('settings');
const SETTINGS_DEFAULT = { apiKey: DEFAULT_KEY, model: '', models: [], theme: 'auto', sound: true, goal: 120, chunk: true };
const S = (() => {
  let s = {}, g = {};
  try { s = JSON.parse(LQ.kv.get(STATE_KEY) || '{}'); } catch (e) { s = {}; }
  try { g = JSON.parse(LQ.kv.get(SETTINGS_KEY) || '{}'); } catch (e) { g = {}; }
  const st = Object.assign({ xp: 0, read: {}, res: {}, pb: {}, fc: {}, boss: {}, last: null }, s);
  st.settings = Object.assign({}, SETTINGS_DEFAULT, g, { srcOn: s.srcOn ?? null });
  delete st.srcOn; delete st.xpDay; delete st.streak; delete st.lastDay;
  return st;
})();
if (!S.settings.apiKey) S.settings.apiKey = DEFAULT_KEY;
let saveT;
function flushSave() {
  clearTimeout(saveT);
  const { settings, ...rest } = S; const { srcOn, ...glob } = settings;
  LQ.kv.set(STATE_KEY, JSON.stringify({ ...rest, srcOn }));
  let cur = {}; try { cur = JSON.parse(LQ.kv.get(SETTINGS_KEY) || '{}'); } catch (e) { }
  LQ.kv.set(SETTINGS_KEY, JSON.stringify(Object.assign(cur, glob)));
}
function save() { clearTimeout(saveT); saveT = setTimeout(flushSave, 150); }
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function touchStreak() { LQ.stats.touchStreak(); }
function addXP(n, el) {
  if (n <= 0) return;
  const before = LQ.stats.todayXP();
  S.xp += n; LQ.stats.add(n); save();
  renderTopStats();
  const r = el?.getBoundingClientRect?.();
  const f = h('div', { class: 'xpfloat', style: { left: (r ? r.left + r.width / 2 : innerWidth / 2) + 'px', top: (r ? r.top : innerHeight / 2) + 'px' } }, `+${n} XP`);
  document.body.append(f); setTimeout(() => f.remove(), 1200);
  if (before < S.settings.goal && LQ.stats.todayXP() >= S.settings.goal) { confetti(160); toast('🎯 Daily goal smashed!'); }
}
function record(ex, ok, firstTry = true) {
  const r = S.res[ex.id] || { n: 0, ok: 0 };
  r.n++; if (ok) r.ok++; r.last = ok; r.t = Date.now(); S.res[ex.id] = r; save();
}
const solved = id => S.res[id]?.ok > 0;

/* ---------- sound ---------- */
let AC;
function beep(kind) {
  if (!S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [660, 880] : kind === 'win' ? [523, 659, 784, 1046] : [220, 180];
    notes.forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'bad' ? 'triangle' : 'sine'; o.frequency.value = f;
      const t = AC.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch (e) { }
}

/* ---------- confetti ---------- */
function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
  let t = $('.toasts'); if (!t) { t = h('div', { class: 'toasts' }); document.body.append(t); }
  const el = h('div', { class: 'toast' }, msg); t.append(el); setTimeout(() => el.remove(), ms);
}
function modal(build) {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) close(); } });
  const box = h('div', { class: 'box' }); m.append(box);
  const close = () => m.remove();
  build(box, close); document.body.append(m);
  return close;
}
function confirmBox(text, onYes) {
  modal((b, close) => b.append(h('h3', {}, text), h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } },
    h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { close(); onYes(); } }, 'Yes'))));
}

/* ---------- theming per chapter ---------- */
function isDark() { return document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); }
function setAccent(el, ch) {
  const i = ch ? (ch._ci ?? ch._i) % PALETTE.length : 7;
  const c = isDark() ? PALETTE_DARK[i] : PALETTE[i][0];
  const bg = isDark() ? `color-mix(in srgb, ${PALETTE_DARK[i]} 18%, #1f232e)` : PALETTE[i][1];
  el.style.setProperty('--c', c); el.style.setProperty('--c-bg', bg);
}
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
  }
  return '';
}
function sectionText(s) { return `## ${s.title}\n${s.hook || ''}\n` + s.blocks.map(blockText).join('\n\n'); }
function chapterOutline(c) {
  return `# Chapter ${c.num}: ${c.title} — ${c.subtitle}\nMantra: ${c.mantra}\nSections:\n` + c.sections.map(s => `- ${s.title}: ${s.hook || ''}`).join('\n') +
    '\nKey pitfalls:\n' + c.pitfalls.map(p => `- ${p.title}: ${p.text}`).join('\n');
}
