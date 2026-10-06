/* ===================== Rich markdown + tutor conversations (persist, history, export) ===================== */

/* ---------- markdown: marked (GFM) + DOMPurify, code blocks re-rendered with the app's highlighter ---------- */
let _mdHooked = false;
function mdRich(s) {
  if (!_mdHooked) {
    DOMPurify.addHook('afterSanitizeAttributes', n => { if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
    _mdHooked = true;
  }
  const html = DOMPurify.sanitize(marked.parse(String(s ?? ''), { gfm: true, breaks: true, async: false }), { FORBID_TAGS: ['img', 'style', 'iframe', 'form'], FORBID_ATTR: ['style'] });
  const wrap = h('div', { class: 'mdx', html });
  wrap.querySelectorAll('pre > code').forEach(code => {
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || guessLang(code.textContent);
    code.parentElement.replaceWith(codeBlock(code.textContent.replace(/\n$/, ''), lang));
  });
  wrap.querySelectorAll('table').forEach(t => { const w = h('div', { class: 'tablewrap' }); t.replaceWith(w); w.append(t); });
  return wrap;
}

/* ---------- storage (separate key, capped, quota-safe) ---------- */
const CONVO_KEY = LQ.kv.subjectKey('convos');
const CONVO_MAX = 100;
const CV = { list: [], byKey: {}, titling: new Set() };
try { CV.list = JSON.parse(LQ.kv.get(CONVO_KEY) || '[]'); if (!Array.isArray(CV.list)) CV.list = []; } catch (e) { CV.list = []; }
function saveConvos() {
  let list = CV.list.filter(c => c.msgs && c.msgs.length).slice(-CONVO_MAX);
  for (;;) {
    if (LQ.kv.set(CONVO_KEY, JSON.stringify(list, (k, v) => k === 'hidden' ? undefined : v))) { CV.list = list; return true; }
    if (list.length <= 1) return false; list = list.slice(1);   // storage full → drop oldest until it fits
  }
}
function ctxRecord() {
  const c = T.ctx; if (!c) return null;
  return { kind: c.kind, id: c.id, label: ctxLabel().replace(/^\S+\s/, '') };
}
function persistConvo(key) {
  const hist = T.hist[key];
  if (!hist || !hist.length) return;
  let cv = CV.byKey[key];
  if (!cv || cv.msgs !== hist) {
    cv = { id: 'cv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), mode: T.mode, ctx: ctxRecord(), model: S.settings.model || '', title: null, msgs: hist };
    CV.byKey[key] = cv; CV.list.push(cv);
  }
  cv.updated = Date.now(); cv.model = S.settings.model || cv.model;
  saveConvos();
}
function currentConvo() {
  const key = tutorCtxKey(), cv = CV.byKey[key];
  return cv && cv.msgs === T.hist[key] && cv.msgs.length ? cv : null;
}

/* ---------- titles: succinct, descriptive, canonical ---------- */
const MODE_NAME = { socratic: 'Socratic dialogue', explain: 'Explanation', quiz: 'Quiz', interview: 'Mock interview', debug: 'Debugging simulation' };
function cleanTitle(t) {
  return String(t || '').split('\n')[0].replace(/^\s*(title\s*:\s*)/i, '').replace(/[*_#`"“”'‘’]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').replace(/[\s.:;,!-]+$/, '').trim().slice(0, 90);
}
function fallbackTitle(cv) {
  const topic = cv.ctx?.label?.replace(/^Ch\d+\s*·\s*/, '') || (cv.msgs.find(m => m.role === 'user')?.text || SUBJ.title).split(/\s+/).slice(0, 7).join(' ');
  return cleanTitle(`${topic}`) || `${SUBJ.title} Tutoring Session`;
}
const displayTitle = cv => cv.title || fallbackTitle(cv);
async function generateTitle(cv) {
  if (CV.titling.has(cv.id)) return cv.title;
  CV.titling.add(cv.id);
  try {
    const transcript = cv.msgs.map(m => (m.role === 'user' ? 'Learner: ' : 'Tutor: ') + m.text).join('\n\n').slice(0, 9000);
    const prompt = `Write the title for this ${TUTOR.domain} tutoring conversation (mode: ${MODE_NAME[cv.mode] || cv.mode}; context: ${cv.ctx?.label || 'whole course'}).
Rules: 3–8 words; name the specific concept(s) actually discussed, not generic words; canonical ${TUTOR.domain} terminology and capitalization (e.g. ${TUTOR.terminology}); Title Case; optionally "Topic: Angle" form; no quotes, emojis, trailing punctuation, dates, or words like Conversation/Chat/Session/Tutor.
Reply with the title only.

TRANSCRIPT:
${transcript}`;
    const t = cleanTitle(await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], temperature: 0.2 }));
    if (t && t.split(' ').length <= 14) { cv.title = t; cv.titledLen = cv.msgs.length; saveConvos(); }
  } catch (e) { /* keep fallback */ }
  finally { CV.titling.delete(cv.id); }
  if (T.open && T.showHistory) renderTutor();
  return cv.title;
}
function maybeAutoTitle(key) {
  const cv = CV.byKey[key]; if (!cv) return;
  const aiCount = cv.msgs.filter(m => m.role !== 'user').length;
  if (aiCount >= 1 && (!cv.title || cv.msgs.length - (cv.titledLen || 0) >= 8)) generateTitle(cv);
}

/* ---------- export ---------- */
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'conversation';
const pad = n => String(n).padStart(2, '0');
const fmtDate = (t, withTime = true) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` + (withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''); };
function convoMarkdown(cv, level = 1) {
  const H = '#'.repeat(level);
  const title = displayTitle(cv);
  const lines = [`${H} ${title}`, '',
    `| | |`, `|---|---|`,
    `| **Mode** | ${MODE_NAME[cv.mode] || cv.mode} |`,
    `| **Context** | ${cv.ctx?.label ? cv.ctx.label.replace(/\|/g, '\\|') : 'Whole course'} |`,
    `| **Started** | ${fmtDate(cv.created)} |`,
    `| **Last message** | ${fmtDate(cv.updated || cv.created)} |`,
    `| **Messages** | ${cv.msgs.length} |`,
    `| **Tutor** | ${TN} (Gemini${cv.model ? ' · ' + cv.model : ''}) |`,
    `| **Subject** | ${SUBJ.title} |`, `| **Profile** | ${ACCOUNT.name} |`, `| **Source** | ${APP_TITLE} (${LQ.config.appName}) |`, '', '---', ''];
  cv.msgs.forEach(m => {
    const who = m.role === 'user' ? '🧑 You' : `${TUTOR.avatar} ${TN}`;
    lines.push(`${H}# ${who}${m.t ? ' · ' + fmtDate(m.t).slice(11) : ''}`, '', demoteHeadings(String(m.text).trim(), level + 2), '');
  });
  return lines.join('\n');
}
function demoteHeadings(text, minLevel) {   // keep message headings below the speaker headings (skip code fences)
  let fence = false;
  return text.split('\n').map(l => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return l;
    return l.replace(/^(#{1,6})\s+/, (m, hs) => '#'.repeat(Math.min(6, hs.length + minLevel - 1)) + ' ');
  }).join('\n');
}
function downloadText(name, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function exportConvo(cv) {
  if (!cv || !cv.msgs?.length) return toast('Nothing to export yet — start a conversation first 🙂');
  if (!cv.title || cv.msgs.length - (cv.titledLen || 0) >= 2) { toast('✨ Naming your conversation…', 1500); await generateTitle(cv); }
  const title = displayTitle(cv);
  downloadText(`${fmtDate(cv.created, false)}_${slug(MODE_NAME[cv.mode] || cv.mode)}_${slug(title)}.md`, convoMarkdown(cv));
  toast('⬇️ Exported “' + title + '”');
}
function exportAllConvos() {
  const list = CV.list.filter(c => c.msgs?.length).sort((a, b) => (a.created || 0) - (b.created || 0));
  if (!list.length) return toast('No conversations yet');
  const head = [`# ${APP_TITLE} — Tutor Conversations`, '', `Exported ${fmtDate(Date.now())} · ${list.length} conversation${list.length > 1 ? 's' : ''}`, '', '## Contents', '',
    ...list.map((c, i) => `${i + 1}. ${displayTitle(c)} — *${MODE_NAME[c.mode] || c.mode}, ${fmtDate(c.created, false)}*`), '', '---', ''];
  downloadText(`${fmtDate(Date.now(), false)}_${slug(APP_TITLE)}_all-tutor-conversations.md`, head.join('\n') + list.map(c => convoMarkdown(c, 2)).join('\n\n---\n\n'));
}

/* ---------- open a stored conversation ---------- */
function findFull(kind, id) {
  for (const c of FULL_COURSE) {
    if (kind === 'chapter' && c.id === id) return c;
    if (kind === 'section' && c.sections.some(s => s.id === id)) return c;
    if (kind === 'playbook' && c.debug.some(d => d.id === id)) return c;
    if (kind === 'exercise') { const e = c.exercises.find(x => x.id === id); if (e) return e; }
  }
  return null;
}
function openConvo(cv) {
  let ctx = null;
  const r = cv.ctx;
  if (r) {
    const visible = r.kind === 'section' ? SEC[r.id] : r.kind === 'chapter' ? CH[r.id] : r.kind === 'playbook' ? PB[r.id] : r.kind === 'exercise' ? findFull('exercise', r.id) : null;
    if (!visible && findFull(r.kind, r.id)) { setSrcFilter(null); }   // its source is filtered out → show everything again
    if (r.kind === 'exercise') { const e = findFull('exercise', r.id); ctx = e ? { kind: 'exercise', id: r.id, text: exerciseAsText(e) } : null; }
    else ctx = { kind: r.kind, id: r.id, label: r.label };
  }
  T.ctx = ctx; T.mode = MODES[cv.mode] ? cv.mode : 'socratic';
  const key = tutorCtxKey();
  T.hist[key] = cv.msgs; CV.byKey[key] = cv;
  T.showHistory = false; renderTutor();
}

/* ---------- history panel (inside the tutor drawer) ---------- */
let histQuery = '';
function renderConvoHistory(box) {
  const all = CV.list.filter(c => c.msgs?.length).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const q = histQuery.trim().toLowerCase();
  const list = q ? all.filter(c => (displayTitle(c) + ' ' + (c.ctx?.label || '') + ' ' + c.msgs.map(m => m.text).join(' ')).toLowerCase().includes(q)) : all;
  box.classList.add('histbox');
  box.append(h('div', { class: 'histhead' },
    h('b', { class: 'grow' }, `🕘 Conversations (${all.length})`),
    all.length ? h('button', { class: 'btn small', onclick: exportAllConvos }, '⬇️ Export all') : null,
    h('button', { class: 'btn small primary', onclick: () => { T.showHistory = false; renderTutor(); } }, '← Chat')));
  if (all.length > 3) {
    const inp = h('input', { class: 'histsearch', placeholder: 'Search conversations…', value: histQuery, oninput: e => { histQuery = e.target.value; const pos = e.target.selectionStart; renderTutor(); const ni = $('.histsearch'); if (ni) { ni.focus(); ni.setSelectionRange(pos, pos); } } });
    box.append(inp);
  }
  if (!all.length) { box.append(h('div', { class: 'empty' }, h('div', { class: 'e' }, '💬'), h('p', {}, 'No conversations yet. Every chat with your tutor is saved here automatically, ready to export as Markdown.'))); return; }
  list.forEach((cv, i) => {
    let confirmDel = false;
    const titleEl = h('b', { class: 'cvtitle' }, displayTitle(cv), !cv.title && CV.titling.has(cv.id) ? h('span', { class: 'tiny' }, ' · naming…') : null);
    const card = h('div', { class: 'cvcard', style: { animationDelay: Math.min(i, 12) * 25 + 'ms' } },
      h('button', { class: 'cvmain', onclick: () => openConvo(cv) }, titleEl,
        h('small', {}, `${MODES[cv.mode]?.label || cv.mode} · ${cv.ctx?.label || 'Whole course'}`),
        h('small', {}, `${fmtDate(cv.updated || cv.created)} · ${cv.msgs.length} messages`)),
      h('div', { class: 'cvactions' },
        h('button', { class: 'iconbtn', title: 'Rename', onclick: () => {
          const inp = h('input', { class: 'histsearch', value: displayTitle(cv), onkeydown: e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') renderTutor(); }, onblur: () => done() });
          const done = () => { const v = cleanTitle(inp.value); if (v) { cv.title = v; cv.titledLen = 1e9; saveConvos(); } renderTutor(); };
          titleEl.replaceWith(inp); inp.focus(); inp.select();
        } }, '✏️'),
        h('button', { class: 'iconbtn', title: 'Export .md', onclick: () => exportConvo(cv) }, '⬇️'),
        h('button', { class: 'iconbtn', title: 'Delete', onclick: e => {
          if (!confirmDel) { confirmDel = true; e.currentTarget.textContent = '❓'; e.currentTarget.title = 'Click again to delete'; return; }
          CV.list = CV.list.filter(x => x !== cv); for (const k in CV.byKey) if (CV.byKey[k] === cv) { delete CV.byKey[k]; delete T.hist[k]; } saveConvos(); renderTutor();
        } }, '🗑️')));
    box.append(card);
  });
}
