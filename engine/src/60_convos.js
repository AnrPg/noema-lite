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

/* ---------- storage: canonical noema.conversation/v1 records (engine/convos.js), persisted in the background ---------- */
const CV = { list: [], byKey: {}, titling: new Set() };
const ACC_REF = { id: ACCOUNT.id, kind: ACCOUNT.kind || 'local' };
const SUBJ_REF = { id: SUBJ.id, title: SUBJ.title, packVersion: Noema.pack?.version || null };
function fromRec(r) {     // canonical record → in-memory shape used by the UI
  return { id: r.id, kind: r.kind, mode: r.mode, created: Date.parse(r.createdAt), updated: Date.parse(r.updatedAt),
    ctx: r.context?.type && r.context.type !== 'course' ? { kind: r.context.type, id: r.context.id, label: r.context.label, ...(r.context.type === 'item' ? { sec: r.context.sectionId || null, ch: r.context.chapterId || null } : {}) } : null,
    model: r.model?.name || '', title: r.title, titleSource: r.titleSource,
    titledLen: r.titleSource === 'user' ? 1e9 : (r.meta?.titledAtMessage ?? (r.title ? r.messages.length : 0)),
    msgs: r.messages.map(m => ({ id: m.id, role: m.role === 'assistant' ? 'model' : m.role, text: m.content, t: Date.parse(m.createdAt), ...(m.meta ? { meta: m.meta } : {}) })),
    tutorState: r.tutorState || null };
}
function toRec(cv) {      // in-memory shape → canonical record
  const sec = cv.ctx?.kind === 'section' ? cv.ctx.id : cv.ctx?.kind === 'exercise' ? (EX[cv.ctx.id]?.section || null) : cv.ctx?.kind === 'item' ? (cv.ctx.sec || null) : null;
  return Noema.convos.normalize({ id: cv.id, kind: cv.kind || 'tutor', mode: cv.mode, title: cv.title,
    titleSource: cv.titleSource || (cv.titledLen >= 1e9 ? 'user' : cv.title ? 'ai' : 'none'),
    context: cv.ctx ? { type: cv.ctx.kind, id: cv.ctx.id, label: cv.ctx.label, ...(sec ? { sectionId: sec, chapterId: sec.split('-')[0] } : {}) } : { type: 'course', id: null, label: null },
    model: { provider: 'google', name: cv.model || S.settings.model || null },
    createdAt: new Date(cv.created).toISOString(), updatedAt: new Date(cv.updated || Date.now()).toISOString(),
    messages: cv.msgs.filter(m => !m.hidden).map(m => ({ id: m.id, role: m.role, content: m.text, createdAt: new Date(m.t || cv.created).toISOString(), ...(m.meta ? { meta: m.meta } : {}) })),
    tutorState: cv.tutorState || undefined,
    meta: cv.titledLen && cv.titledLen < 1e9 ? { titledAtMessage: cv.titledLen } : undefined }, { account: ACC_REF, subject: SUBJ_REF });
}
CV.list = (Noema.preloadedConvos || []).map(fromRec);
/** Persist one conversation now (IndexedDB → then folder + cloud in the background). Never blocks the UI. */
function saveConvos(cv) {
  const targets = cv ? [cv] : CV.list;
  targets.forEach(c => { if (c.msgs?.length) Noema.convos.put(ACCOUNT.id, { ...toRec(c), account: ACC_REF, subject: SUBJ_REF }).catch(e => console.warn('[Noema] conversation save failed', e)); });
  return true;
}
function ctxRecord() {
  const c = T.ctx; if (!c) return null;
  return { kind: c.kind, id: c.id, label: ctxLabel().replace(/^\S+\s/, ''), ...(c.kind === 'item' ? { sec: c.sec || null, ch: c.ch || null } : {}) };
}
function persistConvo(key) {
  const hist = T.hist[key];
  if (!hist || !hist.length) return;
  let cv = CV.byKey[key];
  if (!cv || cv.msgs !== hist) {
    cv = { id: Noema.convos.newId(), kind: 'tutor', created: Date.now(), mode: T.mode, ctx: ctxRecord(), model: S.settings.model || '', title: null, msgs: hist };
    CV.byKey[key] = cv; CV.list.push(cv);
  }
  cv.updated = Date.now(); cv.model = S.settings.model || cv.model;
  if (T.tstate[key]) cv.tutorState = T.tstate[key];
  saveConvos(cv);
}
/** Record a one-shot AI interaction (grading, code review, generated question, drill grading) as a canonical conversation. */
function logAI(kind, { ctx = null, title = null, prompt, response }) {
  const t = Date.now();
  const cv = { id: Noema.convos.newId(t), kind, mode: null, created: t, updated: t, ctx, model: S.settings.model || '', title, titleSource: title ? 'system' : 'none', titledLen: 1e9,
    msgs: [{ role: 'user', text: prompt, t }, { role: 'model', text: response, t: Date.now() }] };
  CV.list.push(cv); saveConvos(cv);
  return cv;
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
const KIND_BADGE = { tutor: '', grading: '📝 grading', 'code-review': '⌨️ code review', question: '✨ AI question', 'drill-grading': '🔧 drill grading' };
async function generateTitle(cv) {
  if (CV.titling.has(cv.id)) return cv.title;
  CV.titling.add(cv.id);
  try {
    const transcript = cv.msgs.map(m => (m.role === 'user' ? 'Learner: ' : 'Tutor: ') + m.text).join('\n\n').slice(0, 9000);
    const prompt = `Write the title for this ${TUTOR.domain} tutoring conversation (mode: ${MODE_NAME[cv.mode] || cv.mode}; context: ${cv.ctx?.label || 'whole course'}).
Rules: 3–8 words; name the specific concept(s) actually discussed, not generic words; canonical ${TUTOR.domain} terminology and capitalization (e.g. ${TUTOR.terminology}); Title Case; optionally "Topic: Angle" form; no quotes, emojis, trailing punctuation, dates, or words like Conversation/Chat/Session/Tutor.
Reply with the title only.${chatLang() && chatLang() !== COURSE_LANG ? ` Write it in ${langName(chatLang())}.` : ''}

TRANSCRIPT:
${transcript}`;
    const t = cleanTitle(await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], temperature: 0.2 }));
    if (t && t.split(' ').length <= 14) { cv.title = t; cv.titleSource = 'ai'; cv.titledLen = cv.msgs.length; saveConvos(cv); }
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
    `| **Subject** | ${SUBJ.title} |`, `| **Profile** | ${ACCOUNT.name} |`, `| **Source** | ${APP_TITLE} (${Noema.config.appName}) |`, '', '---', ''];
  const lessons = cv.tutorState?.lessons || [];
  if (lessons.length) lines.push(`${H}# 📌 Lessons learned`, '', ...lessons.map((l, i) => `${i + 1}. ${l.text}`), '', '---', '');
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
  downloadText(`${fmtDate(cv.created, false)}_${slug(MODE_NAME[cv.mode] || cv.kind || 'conversation')}_${slug(title)}.md`, convoMarkdown(cv));
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
    else ctx = { kind: r.kind, id: r.id, label: r.label, ...(r.kind === 'item' ? { sec: r.sec || null, ch: r.ch || null, text: r.label } : {}) };
  }
  T.ctx = ctx; T.mode = MODES[cv.mode] ? cv.mode : (cv.kind && cv.kind !== 'tutor' ? 'explain' : 'socratic');
  const key = tutorCtxKey();
  T.hist[key] = cv.msgs; CV.byKey[key] = cv;
  if (cv.tutorState) T.tstate[key] = cv.tutorState; else if (T.mode === 'socratic' && cv.msgs.some(m => m.meta?.noemaState)) T.tstate[key] = cv.tutorState = rebuildThreadState(cv.msgs); else delete T.tstate[key];
  T.showHistory = false; renderTutor();
}

/* ---------- history panel (inside the tutor drawer) ---------- */
let histQuery = '', histAllKinds = false;
function renderConvoHistory(box) {
  const everything = CV.list.filter(c => c.msgs?.length);
  const all = everything.filter(c => histAllKinds || !c.kind || c.kind === 'tutor').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const others = everything.length - everything.filter(c => !c.kind || c.kind === 'tutor').length;
  const q = histQuery.trim().toLowerCase();
  const list = q ? all.filter(c => (displayTitle(c) + ' ' + (c.ctx?.label || '') + ' ' + c.msgs.map(m => m.text).join(' ')).toLowerCase().includes(q)) : all;
  box.classList.add('histbox');
  box.append(h('div', { class: 'histhead' },
    h('b', { class: 'grow' }, `🕘 Conversations (${all.length})`, tip('Every conversation with the tutor — and every AI grading, code review and generated question — is saved automatically in the background: in this browser, in your backup folder (if set) and in the cloud (cloud accounts). ⬇️ exports a readable Markdown copy on demand.')),
    all.length ? h('button', { class: 'btn small', onclick: exportAllConvos }, '⬇️ Export all') : null,
    h('button', { class: 'btn small primary', onclick: () => { T.showHistory = false; renderTutor(); } }, '← Chat')));
  if (others) box.append(h('label', { class: 'row tiny', style: { margin: '2px 0 4px' } }, h('input', { type: 'checkbox', checked: histAllKinds, onchange: e => { histAllKinds = e.target.checked; renderTutor(); } }), `Also show ${others} AI grading / review / question record${others > 1 ? 's' : ''}`));
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
        h('small', {}, `${cv.kind && cv.kind !== 'tutor' ? KIND_BADGE[cv.kind] : (MODES[cv.mode]?.label || cv.mode)} · ${cv.ctx?.label || 'Whole course'}`),
        h('small', {}, `${fmtDate(cv.updated || cv.created)} · ${cv.msgs.length} messages`)),
      h('div', { class: 'cvactions' },
        h('button', { class: 'iconbtn', title: 'Rename', onclick: () => {
          const inp = h('input', { class: 'histsearch', value: displayTitle(cv), onkeydown: e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') renderTutor(); }, onblur: () => done() });
          const done = () => { const v = cleanTitle(inp.value); if (v) { cv.title = v; cv.titleSource = 'user'; cv.titledLen = 1e9; saveConvos(cv); } renderTutor(); };
          titleEl.replaceWith(inp); inp.focus(); inp.select();
        } }, '✏️'),
        h('button', { class: 'iconbtn', title: 'Export .md', onclick: () => exportConvo(cv) }, '⬇️'),
        h('button', { class: 'iconbtn', title: 'Delete', onclick: e => {
          if (!confirmDel) { confirmDel = true; e.currentTarget.textContent = '❓'; e.currentTarget.title = 'Click again to delete'; return; }
          CV.list = CV.list.filter(x => x !== cv); for (const k in CV.byKey) if (CV.byKey[k] === cv) { delete CV.byKey[k]; delete T.hist[k]; } Noema.convos.remove(ACCOUNT.id, cv.id).catch(() => { }); renderTutor();
        } }, '🗑️')));
    box.append(card);
  });
}
