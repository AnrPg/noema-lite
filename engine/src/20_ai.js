/* ===================== Gemini client ===================== */
const GEM_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

function modelScore(name) {
  const n = name.replace(/^models\//, '');
  if (/(image|tts|audio|live|embed|aqa|gemma|robotics|computer|native|veo|imagen|learnlm|nano|banana|thinking-exp|research|deep)/i.test(n)) return -1;
  if (!/gemini/i.test(n)) return -1;
  let s = 0;
  const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
  if (v) s += parseFloat(v[1]) * 100; else if (/latest/.test(n)) s += 240;
  if (/flash/.test(n)) s += 60;
  if (/lite/.test(n)) s -= 45;
  if (/pro/.test(n)) s += 20;
  if (/preview|exp/.test(n)) s -= 8;
  if (/\d{2}-\d{2}|\d{3}$/.test(n)) s -= 3;
  return s;
}
async function detectModels() {
  const key = S.settings.apiKey;
  if (!key) throw new Error('No API key set.');
  const r = await fetch(`${GEM_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new Error(`Model list failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const ms = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, '')).filter(n => modelScore(n) >= 0)
    .sort((a, b) => modelScore(b) - modelScore(a));
  S.settings.models = ms;
  if (!S.settings.model || !ms.includes(S.settings.model)) S.settings.model = ms[0] || FALLBACK_MODELS[0];
  save();
  return ms;
}
async function ensureModel() {
  if (S.settings.model) return S.settings.model;
  try { await detectModels(); } catch (e) { S.settings.model = FALLBACK_MODELS[0]; }
  return S.settings.model;
}
function thinkingFor(model) {
  if (/gemini-3/.test(model)) return { thinkingLevel: 'low' };
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  return null;
}
const noThinking = new Set();
function buildBody({ system, contents, json, schema, temperature = 0.7, model }) {
  const gc = { temperature };
  if (json) { gc.responseMimeType = 'application/json'; if (schema) gc.responseSchema = schema; }
  const th = noThinking.has(model) ? null : thinkingFor(model);
  if (th) gc.thinkingConfig = th;
  const body = { contents, generationConfig: gc };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}
function friendlyError(status, text) {
  if (status === 400 && /API key/i.test(text)) return 'Your Gemini API key was rejected. Open ⚙️ Settings and paste a valid key.';
  if (status === 403) return 'Access denied (403). The key may be restricted (e.g. HTTP-referrer restriction blocks local files) or the Generative Language API is not enabled for it.';
  if (status === 404) return 'That model is not available for your key. Open ⚙️ Settings → “Detect models”.';
  if (status === 429) return 'Rate limit / quota reached (429). Wait a minute or switch to a lighter model in ⚙️ Settings.';
  if (status >= 500) return 'Gemini is having a hiccup (' + status + '). Try again in a moment.';
  return `Gemini error ${status}: ${text.slice(0, 220)}`;
}
async function gemini(opts, retry = 1) {
  const model = await ensureModel();
  const key = S.settings.apiKey;
  if (!key) throw new Error('No Gemini API key. Open ⚙️ Settings.');
  const stream = !!opts.onChunk;
  const url = `${GEM_BASE}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(buildBody({ ...opts, model })) });
  } catch (e) { throw new Error('Network error — are you online? (' + e.message + ')'); }
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 400 && /thinking/i.test(t) && !noThinking.has(model)) { noThinking.add(model); return gemini(opts, retry); }
    if (r.status === 404 && retry > 0) {
      const alt = FALLBACK_MODELS.find(m => m !== model);
      try { await detectModels(); } catch (e) { S.settings.model = alt; }
      if (S.settings.model !== model) return gemini(opts, retry - 1);
    }
    if ((r.status === 503 || r.status === 500) && retry > 0) { await sleep(1200); return gemini(opts, retry - 1); }
    throw new Error(friendlyError(r.status, t));
  }
  const partsText = d => (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!stream) {
    const d = await r.json();
    const txt = partsText(d);
    if (!txt) throw new Error('Empty answer from Gemini' + (d.promptFeedback?.blockReason ? ' (blocked: ' + d.promptFeedback.blockReason + ')' : '') + '.');
    return txt;
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try { const d = JSON.parse(line.slice(5)); const t = partsText(d); if (t) { full += t; opts.onChunk(full); } } catch (e) { }
    }
  }
  if (!full) throw new Error('Empty answer from Gemini.');
  return full;
}
async function geminiJSON(prompt, system, schema) {
  const txt = await gemini({ system, contents: [{ role: 'user', parts: [{ text: prompt }] }], json: true, schema, temperature: 0.4 });
  const m = txt.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : txt);
}

/* ===================== Tutor ===================== */
function learnerProfile() {
  let learner = '';
  try { learner = JSON.parse(LQ.kv.get(LQ.kv.accountKey('settings')) || '{}').learner || ''; } catch (e) { }
  learner = learner || ACCOUNT.learner || `The learner (${ACCOUNT.name || 'the student'}) learns best when challenged, tested and given tightly structured, co-located information.`;
  return `${learner} ${TUTOR.prior || ''}`.trim();
}
const LEARNER = learnerProfile();
const LANG_NOTE = SUBJ.language && SUBJ.language !== 'en' ? ` Reply in the language of the course material (${SUBJ.language}) unless the learner writes in another language.` : '';
const STYLE = `Formatting: short turns (max ~120 words unless asked), markdown allowed (**bold**, \`code\`, short lists, fenced code${SUBJ.features?.math ? ', LaTeX math with $…$ inline and $$…$$ display' : ''}). ${TUTOR.examples} At most one emoji. Never invent facts about ${TUTOR.domain}; if you go beyond the COURSE NOTES, say "(beyond the notes)".${LANG_NOTE}`;
const TN = TUTOR.name;
const MODES = {
  socratic: { label: `${TUTOR.avatar} Socratic`, sys: `You are "${TN}", a Socratic ${TUTOR.domain} tutor. ${LEARNER}
METHOD (strict):
- Never lecture and never hand over the answer up front. Ask ONE focused question per turn.
- Start by probing what the learner already believes about the topic (a prediction or a "why" question).
- If the learner is right: confirm in one short line, then escalate (a "why", an edge case, an exam trap, or "what would you ask yourself first when diagnosing this?").
- If partially right: name what is right, then ask a narrower hint-question aimed at the gap.
- If wrong: do not just say "wrong" — offer a counter-example or a simpler sub-question that exposes the contradiction.
- After 3 unsuccessful attempts on the same point, give a ≤3-sentence explanation, then a check question.
- Every few turns, ask the learner to summarise in one sentence, or to list the questions they would ask themselves in a diagnostic scenario.
- Always end your turn with exactly one question.
${STYLE}` },
  explain: { label: '💡 Explain', sys: `You are "${TN}", a vivid, friendly ${TUTOR.domain} explainer. ${LEARNER}
Explain the asked concept with: (1) a one-line core idea in bold, (2) an analogy, (3) a tiny concrete example${SUBJ.features?.code ? ' or code' : ''}${SUBJ.features?.math ? ' or worked formula' : ''}, (4) the #1 pitfall. Max ~170 words. Finish with ONE quick check question. ${STYLE}` },
  quiz: { label: '⚡ Quiz me', sys: `You are "${TN}", a rapid-fire ${TUTOR.domain} quiz master. ${LEARNER}
Ask ONE question at a time, varying the format: predict-the-outcome, spot-the-trap, ${SUBJ.features?.code ? 'write-the-syntax, ' : ''}${SUBJ.features?.math ? 'calculate, ' : ''}compare two concepts, "what do you ask yourself first when…". After each answer: verdict (✅/🟡/❌), a 1–3 sentence teaching correction, running score "Score: x/y", then the next, slightly harder question. Focus on traps and reasoning errors. ${STYLE}` },
  interview: { label: '🎤 Interview', sys: `You are ${TUTOR.interviewer}. ${LEARNER}
Ask ONE realistic question at a time about the context topic (conceptual, scenario or diagnostic). After the learner answers: score /10, what was strong, what was missing, and a crisp model answer in ≤4 sentences. Then ask the next question, mixing in follow-ups ("and what if…?"). ${STYLE}` },
  debug: { label: '🔧 Case sim', sys: `You run an interactive CASE / DEBUGGING SIMULATION for ${TUTOR.domain}. ${LEARNER}
Invent a realistic scenario tied to the context topic (for example: ${TUTOR.simulation}). Describe ONLY the symptom or the observed facts (as a ticket, an error, a lab result or a case report would). The learner then asks diagnostic questions or "runs" checks. Reply exactly like the system/colleague/patient/data would — realistic outputs in code blocks where it fits — without revealing the root cause. If they flail, give a small nudge as a question. When they correctly state root cause + fix/explanation, debrief: which "ask yourself" questions they used well, which ones they skipped, and the ideal ordered checklist. ${STYLE}` },
};
const T = { open: false, mode: 'socratic', ctx: null, hist: {}, busy: false };
function tutorCtxKey() { return (T.ctx?.id || 'course') + '|' + T.mode; }
function tutorContextText() {
  const c = T.ctx;
  if (!c) return 'COURSE NOTES (overview):\n' + COURSE.map(chapterOutline).join('\n\n').slice(0, 90000);
  if (c.kind === 'section' && !SEC[c.id]) return '';
  if (c.kind === 'chapter' && !CH[c.id]) return '';
  if (c.kind === 'playbook' && !PB[c.id]) return '';
  if (c.kind === 'section') { const s = SEC[c.id]?._full ? { ...SEC[c.id], blocks: SEC[c.id]._full.blocks } : SEC[c.id]; return `COURSE NOTES — Chapter ${s._ch.num} "${s._ch.title}", section "${s.title}":\n` + sectionText(s).slice(0, 16000) + `\n\nChapter mantra: ${s._ch.mantra}`; }
  if (c.kind === 'chapter') return 'COURSE NOTES:\n' + chapterOutline(CH[c.id]);
  if (c.kind === 'playbook') { const d = PB[c.id]; return `COURSE NOTES — Debug playbook "${d.title}":\nSymptom: ${d.symptom}\nAsk yourself: ${d.askYourself.join(' | ')}\nSteps: ${d.steps.map(s => s.do + (s.code ? ' [' + s.code + ']' : '')).join(' | ')}\nRoot causes: ${d.rootCauses.join('; ')}\nFix: ${d.fix}`; }
  if (c.kind === 'exercise') return c.text;
  return '';
}
function setTutorContext(ctx) { T.ctx = ctx; if (T.open) renderTutor(); }
function ctxLabel() {
  const c = T.ctx;
  if (!c) return '🌍 Whole course';
  if (c.kind === 'section') return SEC[c.id] ? `📍 Ch${SEC[c.id]._ch.num} · ${SEC[c.id].title}` : '📍 ' + (c.label || 'Section');
  if (c.kind === 'chapter') return CH[c.id] ? `📍 Ch${CH[c.id].num} · ${CH[c.id].title}` : '📍 ' + (c.label || 'Chapter');
  if (c.kind === 'playbook') return PB[c.id] ? `🔧 ${PB[c.id].title}` : '🔧 ' + (c.label || 'Debug drill');
  if (c.kind === 'exercise') return '🧩 This exercise';
  return '';
}
function openTutor(ctx, mode, autoMsg) {
  if (ctx !== undefined) T.ctx = ctx;
  if (mode) T.mode = mode;
  T.open = true; renderTutor();
  $('.drawer').classList.add('open'); $('.scrim').classList.add('on');
  if (autoMsg) sendTutor(autoMsg, true);
  else setTimeout(() => $('.composer textarea')?.focus(), 350);
}
function closeTutor() { T.open = false; $('.drawer')?.classList.remove('open'); $('.scrim')?.classList.remove('on'); }
function renderTutor() {
  const d = $('.drawer'); d.innerHTML = '';
  const hist = T.hist[tutorCtxKey()] || [];
  const msgs = h('div', { class: 'msgs' });
  d.append(
    h('div', { class: 'dh' },
      h('div', { class: 'top' }, h('div', { class: 'avatar' }, TUTOR.avatar),
        h('div', { class: 'grow' }, h('b', {}, TN), h('div', { class: 'tiny' }, 'Your Gemini-powered tutor · ' + (S.settings.model || 'auto model'))),
        h('button', { class: 'iconbtn' + (T.showHistory ? ' on' : ''), title: 'Conversation history', onclick: () => { T.showHistory = !T.showHistory; renderTutor(); } }, '🕘'),
        h('button', { class: 'iconbtn', title: 'Export this conversation (.md)', onclick: () => exportConvo(currentConvo()) }, '⬇️'),
        h('button', { class: 'iconbtn', title: 'New conversation', onclick: () => { T.hist[tutorCtxKey()] = []; renderTutor(); } }, '↺'),
        h('button', { class: 'iconbtn', title: 'Close', onclick: closeTutor }, '✕')),
      h('div', { class: 'row' }, h('span', { class: 'ctxchip' }, ctxLabel()),
        T.ctx ? h('button', { class: 'tiny', style: { textDecoration: 'underline' }, onclick: () => setTutorContext(null) }, 'use whole course') : null),
      h('div', { class: 'modechips' }, ...Object.entries(MODES).map(([k, m]) => h('button', { class: T.mode === k ? 'on' : '', onclick: () => { T.mode = k; renderTutor(); } }, m.label)))),
    msgs,
    h('div', { class: 'composer' },
      h('textarea', { rows: 1, placeholder: 'Your answer or question…', onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = e.target.value.trim(); if (v) { e.target.value = ''; sendTutor(v); } } }, oninput: e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; } }),
      h('button', { class: 'send', title: 'Send', onclick: () => { const ta = $('.composer textarea'); const v = ta.value.trim(); if (v) { ta.value = ''; sendTutor(v); } } }, '➤')));
  if (T.showHistory) { renderConvoHistory(msgs); return; }
  if (!hist.length) {
    const topic = T.ctx ? ctxLabel().replace(/^\S+\s/, '') : SUBJ.title;
    msgs.append(h('div', { class: 'msg ai' }, md(`Hi ${ACCOUNT.name || 'there'}! I'm **${TN}** ${TUTOR.avatar}. Mode: **${MODES[T.mode].label}**. Pick a starter or just type.`)),
      h('div', { class: 'starters' },
        ...[
          [`${TUTOR.avatar} Question me Socratically on this`, 'socratic', `Start a Socratic session on: ${topic}. Begin by probing what I already think.`],
          ['⚡ Rapid-fire quiz, traps only', 'quiz', `Quiz me on ${topic}. Focus on certification traps and pitfalls.`],
          ['🔧 Simulate a broken scenario', 'debug', `Start a debugging simulation related to: ${topic}.`],
          ['🎤 Interview me', 'interview', `Interview me about ${topic}.`],
          ['💡 Explain it differently', 'explain', `Explain the core idea of ${topic} differently from the notes.`],
        ].map(([l, m, msg]) => h('button', { onclick: () => { T.mode = m; renderTutor(); sendTutor(msg); } }, l))));
  }
  hist.forEach(m => { if (!m.hidden) msgs.append(h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') }, m.role === 'user' ? md(m.text) : md(m.text))); });
  msgs.scrollTop = msgs.scrollHeight;
}
async function sendTutor(text, hidden = false) {
  if (T.busy) return;
  const key = tutorCtxKey();
  const hist = T.hist[key] = T.hist[key] || [];
  hist.push({ role: 'user', text, hidden: false, t: Date.now() });
  T.showHistory = false; persistConvo(key);
  renderTutor();
  const msgs = $('.drawer .msgs');
  const bubble = h('div', { class: 'msg ai' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
  msgs.append(bubble); msgs.scrollTop = msgs.scrollHeight;
  T.busy = true;
  const system = MODES[T.mode].sys + '\n\n' + tutorContextText();
  const contents = hist.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  try {
    const full = await gemini({ system, contents, onChunk: t => { bubble.innerHTML = ''; bubble.append(md(t)); msgs.scrollTop = msgs.scrollHeight; } });
    hist.push({ role: 'model', text: full, t: Date.now() });
    persistConvo(key); maybeAutoTitle(key);
    touchStreak();
  } catch (e) {
    hist.pop(); persistConvo(key);
    bubble.className = 'msg err'; bubble.innerHTML = ''; bubble.append(md('⚠️ ' + e.message), h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: openSettings }, '⚙️ Settings'), /key/i.test(e.message) ? h('button', { class: 'btn small ghost', onclick: () => openGuide('gemini') }, '🔑 How to get a key') : null));
  } finally { T.busy = false; }
}

/* ---------- AI helpers for exercises ---------- */
async function aiGrade(ex, answer) {
  const schema = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, verdict: { type: 'STRING' }, covered: { type: 'ARRAY', items: { type: 'STRING' } }, missing: { type: 'ARRAY', items: { type: 'STRING' } }, mistakes: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } }, required: ['score', 'verdict', 'feedback'] };
  const ref = ex.type === 'write' ? `Reference solution:\n${ex.solution}` : `Model answer:\n${ex.model}\nRubric key points:\n- ${(ex.rubric || []).join('\n- ')}`;
  const sec = SEC[ex.section];
  const prompt = `Grade the learner's answer to a ${TUTOR.domain} exercise.\nQuestion: ${ex.q}\n${ex.code ? 'Code shown:\n' + ex.code + '\n' : ''}${ref}\n\nLearner's answer:\n"""${answer}"""\n\nSection notes (ground truth):\n${sec ? sectionText(sec).slice(0, 6000) : ''}\n\nReturn JSON: score 0-100 (meaning, not wording; for code accept equivalent correct syntax), verdict (one short line), covered (rubric points hit), missing (points missed), mistakes (factual errors), feedback (2-4 sentences, encouraging, specific, end with a nudge question).`;
  const g = await geminiJSON(prompt, `You are a strict but kind ${TUTOR.examinerRole}. Output only JSON.`, schema);
  try {
    const sec = SEC[ex.section];
    logAI(ex.type === 'write' ? 'code-review' : 'grading', {
      ctx: { kind: 'exercise', id: ex.id, label: `${sec ? 'Ch' + sec._ch.num + ' · ' + sec.title + ' · ' : ''}${ex.id}` },
      title: `${ex.type === 'write' ? 'Code review' : 'Grading'}: ${String(ex.q || '').replace(/[*`_]/g, '').slice(0, 70)}`,
      prompt: `**Question:** ${ex.q}${ex.code ? '\n\n```\n' + ex.code + '\n```' : ''}\n\n**My answer:**\n\n${ex.type === 'write' ? '```\n' + answer + '\n```' : answer}`,
      response: `**Score: ${g.score}/100** — ${g.verdict || ''}\n\n${g.covered?.length ? '✅ ' + g.covered.join(' · ') + '\n\n' : ''}${g.missing?.length ? '➕ Missing: ' + g.missing.join(' · ') + '\n\n' : ''}${g.mistakes?.length ? '❌ ' + g.mistakes.join(' · ') + '\n\n' : ''}${g.feedback || ''}` });
  } catch (e) { }
  return g;
}
async function aiQuestion(sec, kind = 'mcq') {
  const schema = { type: 'OBJECT', properties: { q: { type: 'STRING' }, code: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, why: { type: 'ARRAY', items: { type: 'STRING' } }, explain: { type: 'STRING' } }, required: ['q', 'options', 'answer', 'why', 'explain'] };
  const seen = shuffle(sec._ch.exercises.filter(e => e.section === sec.id)).slice(0, 6).map(e => '- ' + e.q).join('\n');
  const prompt = `Create ONE fresh, tricky multiple-choice question (4 options, exactly one correct) that tests deep understanding of this ${TUTOR.domain} section. Prefer a scenario, a prediction, a debugging decision or a certification trap. Avoid duplicating these existing questions:\n${seen}\n\nSECTION NOTES (only use facts from here):\n${sectionText(sec).slice(0, 9000)}\n\nJSON fields: q (inline markdown with **bold** and \`code\` allowed), code (optional snippet or empty string), options (4 strings), answer (0-3), why (4 short strings: why each option is right/wrong), explain (2-4 sentences that teach).`;
  const r = await geminiJSON(prompt, 'You write excellent exam questions. Output only JSON.', schema);
  try { logAI('question', { ctx: { kind: 'section', id: sec.id, label: `Ch${sec._ch.num} · ${sec.title}` }, title: `AI question: ${String(r.q || '').replace(/[*`_]/g, '').slice(0, 70)}`,
    prompt: `Generate a fresh, tricky question on “${sec.title}”.`,
    response: `${r.q}${r.code ? '\n\n```\n' + r.code + '\n```' : ''}\n\n${(r.options || []).map((o, i) => `${i === (r.answer | 0) ? '✅' : '▫️'} ${String.fromCharCode(65 + i)}. ${o}${r.why?.[i] ? ' — *' + r.why[i] + '*' : ''}`).join('\n')}\n\n**Explanation:** ${r.explain || ''}` }); } catch (e) { }
  return { id: 'ai-' + Date.now(), type: 'mcq', section: sec.id, difficulty: 2, tags: ['concept'], q: r.q, code: r.code || undefined, options: r.options.slice(0, 4), answer: Math.max(0, Math.min(3, r.answer | 0)), why: (r.why || []).slice(0, 4), explain: r.explain, _ch: sec._ch, _ai: true };
}
async function aiDrillGrade(d, answer) {
  const schema = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, hit: { type: 'ARRAY', items: { type: 'INTEGER' } }, feedback: { type: 'STRING' } }, required: ['score', 'hit', 'feedback'] };
  const prompt = `A learner was shown this debugging symptom and listed the questions they would ask themselves.\nSymptom: ${d.symptom}\nCanonical ordered checklist:\n${d.askYourself.map((q, i) => `${i}. ${q}`).join('\n')}\n\nLearner wrote:\n"""${answer}"""\n\nReturn JSON: hit = indexes of checklist questions the learner covered (same meaning counts), score 0-100 (coverage + sensible order), feedback 2-3 sentences: what they nailed, the most important one they missed and why it matters.`;
  const g = await geminiJSON(prompt, 'You are a precise debugging coach. Output only JSON.', schema);
  try { logAI('drill-grading', { ctx: { kind: 'playbook', id: d.id, label: d.title }, title: `Drill: ${d.title}`.slice(0, 90),
    prompt: `**Symptom:** ${d.symptom}\n\n**The questions I would ask myself:**\n\n${answer}`,
    response: `**Score: ${g.score}/100** — covered ${(g.hit || []).length}/${d.askYourself.length}\n\n${g.feedback || ''}\n\n**Canonical checklist:**\n${d.askYourself.map((q, i) => `${(g.hit || []).includes(i) ? '✅' : '▫️'} ${i + 1}. ${q}`).join('\n')}` }); } catch (e) { }
  return g;
}

/* ---------- settings ---------- */
function openSettings() {
  modal((b, close) => {
    const key = h('input', { type: 'password', value: S.settings.apiKey || '', placeholder: 'AIza…' });
    const sel = h('select', {}, ...(S.settings.models.length ? S.settings.models : FALLBACK_MODELS).map(m => h('option', { value: m, selected: m === S.settings.model }, m)));
    const status = h('div', { class: 'tiny' }, S.settings.model ? 'Current model: ' + S.settings.model : 'Model will be auto-detected on first use.');
    const theme = h('select', {}, ...[['auto', 'Auto (system)'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: S.settings.theme === v }, l)));
    const goal = h('input', { type: 'number', min: 20, step: 10, value: S.settings.goal });
    const snd = h('input', { type: 'checkbox', checked: S.settings.sound });
    const chunk = h('input', { type: 'checkbox', checked: S.settings.chunk });
    b.append(h('h2', {}, '⚙️ Settings'),
      !S.settings.apiKey ? h('div', { class: 'callout warn', style: { marginTop: '10px' } }, h('span', { class: 'ci' }, '🔑'), h('b', { class: 't' }, 'No Gemini key yet — the AI tutor is off'), h('div', {}, 'It is free and takes 2 minutes. ', h('button', { class: 'linkish', onclick: () => openGuide('gemini') }, 'Show me how'))) : null,
      h('div', { class: 'field' }, h('label', {}, 'Gemini API key ', tip('Your personal key from Google AI Studio (free). Used only for calls from this app straight to Google. Never shared with other profiles or users.')), key, h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? 'Saved to your account and synced privately to your devices.' : 'Stored only in this browser, for this profile.')),
      h('div', { class: 'field' }, h('label', {}, 'Gemini model'), sel,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); status.textContent = 'Detecting…'; try { const ms = await detectModels(); sel.innerHTML = ''; ms.forEach(m => sel.append(h('option', { value: m, selected: m === S.settings.model }, m))); status.textContent = `Found ${ms.length} models · picked ${S.settings.model}`; } catch (e) { status.textContent = '⚠️ ' + e.message; } } }, '🔍 Detect models'),
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; save(); status.textContent = 'Testing…'; try { const t = await gemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: Brick is ready 🦉' }] }], temperature: 0 }); status.textContent = '✅ ' + t.trim().slice(0, 80); } catch (e) { status.textContent = '⚠️ ' + e.message; } } }, '🧪 Test')),
        status),
      h('div', { class: 'field' }, h('label', {}, 'Theme'), theme),
      h('div', { class: 'field' }, h('label', {}, 'Daily XP goal'), goal),
      h('label', { class: 'row', style: { margin: '10px 0' } }, snd, 'Sound effects'),
      h('label', { class: 'row', style: { margin: '10px 0' } }, chunk, 'Bite-size reading (reveal theory chunk by chunk)'),
      h('div', { class: 'hr' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => { close(); openAccountMenu('backup'); } }, '💾 Backup & restore…'),
        h('button', { class: 'btn small', onclick: () => confirmBox(`Reset your progress in ${SUBJ.title}? (a restore point is kept)`, async () => { await LQ.backup.restorePoint(ACCOUNT.id, 'Before reset of ' + SUBJ.title); const st = S.settings; for (const k of Object.keys(S)) delete S[k]; Object.assign(S, { xp: 0, read: {}, res: {}, pb: {}, fc: {}, boss: {}, last: null, settings: st }); flushSave(); close(); route(); renderTopStats(); }) }, `🗑️ Reset ${SUBJ.title} progress`)),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '20px' } },
        h('button', { class: 'btn primary', onclick: () => { S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; S.settings.theme = theme.value; S.settings.goal = Math.max(20, +goal.value || 120); S.settings.sound = snd.checked; S.settings.chunk = chunk.checked; save(); applyTheme(); close(); route(); renderTopStats(); toast('Saved ✔'); } }, 'Save')));
  });
}
