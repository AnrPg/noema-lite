/* ===================== Gemini client ===================== */
const GEM_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** An error of the Gemini client in the learner's words (needsKey: the 🔑 guide helps). */
const gemErr = (key, vars, extra) => Object.assign(new Error(tE(key, vars)), extra || {});
/** Gemini could not be reached (docs/i18n.md §6): the English words in .message (logs), the code for the learner's words (errText → err.ai.network_gemini). */
const gemNetErr = e => Object.assign(new Error(`Network error — are you online? (${e && e.message})`), { code: 'ai.network_gemini', params: { detail: String(e && e.message) } });   // i18n-ignore (English .message of the error contract)
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
  if (!key) throw gemErr('engine.gemini.noKeySet', null, { needsKey: true });
  let r; try { r = await fetch(`${GEM_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } }); } catch (e) { throw gemNetErr(e); }   // offline: the coded network error (docs/i18n.md §6)
  if (!r.ok) throw gemErr('engine.gemini.modelListFailed', { status: r.status, detail: (await r.text()).slice(0, 200) });
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
  if (status === 400 && /API key/i.test(text)) return tE('engine.gemini.keyRejected');   // i18n-ignore (a pattern of Gemini's answer)
  if (status === 403) return tE('engine.gemini.denied');
  if (status === 404) return tE('engine.gemini.noModel');
  if (status === 429) return tE('engine.gemini.rateLimit');
  if (status >= 500) return tE('engine.gemini.hiccup', { status });
  return tE('engine.gemini.error', { status, detail: text.slice(0, 220) });
}
async function gemini(opts, retry = 1) {
  const model = await ensureModel();
  const key = S.settings.apiKey;
  if (!key) throw gemErr('engine.gemini.noKey', null, { needsKey: true });
  const stream = !!opts.onChunk;
  const url = `${GEM_BASE}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;   // i18n-ignore
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(buildBody({ ...opts, model })) });
  } catch (e) { throw gemNetErr(e); }
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 400 && /thinking/i.test(t) && !noThinking.has(model)) { noThinking.add(model); return gemini(opts, retry); }
    if (r.status === 404 && retry > 0) {
      const alt = FALLBACK_MODELS.find(m => m !== model);
      try { await detectModels(); } catch (e) { S.settings.model = alt; }
      if (S.settings.model !== model) return gemini(opts, retry - 1);
    }
    if ((r.status === 503 || r.status === 500) && retry > 0) { await sleep(1200); return gemini(opts, retry - 1); }
    throw Object.assign(new Error(friendlyError(r.status, t)), r.status === 400 && /API key/i.test(t) ? { needsKey: true } : {});   // i18n-ignore
  }
  const partsText = d => (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!stream) {
    const d = await r.json();
    const txt = partsText(d);
    if (!txt) throw d.promptFeedback?.blockReason ? gemErr('engine.gemini.emptyBlocked', { reason: d.promptFeedback.blockReason }) : gemErr('engine.gemini.empty');
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
  if (!full) throw gemErr('engine.gemini.empty');
  return full;
}
async function geminiJSON(prompt, system, schema) {
  const txt = await gemini({ system, contents: [{ role: 'user', parts: [{ text: prompt }] }], json: true, schema, temperature: 0.4 });
  const m = txt.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : txt);
}

/* ===================== Tutor ===================== */
/* i18n-ignore-start */   // the learner profile is part of the AI's prompts (English)
function learnerProfile() {
  let learner = '';
  try { learner = JSON.parse(Noema.kv.get(Noema.kv.accountKey('settings')) || '{}').learner || ''; } catch (e) { }
  learner = learner || ACCOUNT.learner || `The learner (${ACCOUNT.name || 'the student'}) learns best when challenged, tested and given tightly structured, co-located information.`;
  return `${learner} ${TUTOR.prior || ''}`.trim();
}
const LEARNER = learnerProfile();
/* i18n-ignore-end */
/* ---------- the language of the AI conversations (⚙️ Settings): only what the AI writes to the learner — the pack is unchanged ---------- */
/* i18n-ignore-start */   // endonyms (shown as they are) and English names for the prompts; langRule … MODES[*].sys, INTENT: prompts for the AI
const CHAT_LANGS = [['en', 'English', 'English'], ['el', 'Ελληνικά', 'Greek'], ['de', 'Deutsch', 'German'], ['fr', 'Français', 'French'], ['es', 'Español', 'Spanish'], ['it', 'Italiano', 'Italian'], ['pt', 'Português', 'Portuguese'], ['nl', 'Nederlands', 'Dutch'], ['pl', 'Polski', 'Polish'], ['ro', 'Română', 'Romanian'], ['bg', 'Български', 'Bulgarian'], ['ru', 'Русский', 'Russian'], ['uk', 'Українська', 'Ukrainian'], ['tr', 'Türkçe', 'Turkish'], ['ar', 'العربية', 'Arabic'], ['he', 'עברית', 'Hebrew'], ['hi', 'हिन्दी', 'Hindi'], ['zh', '中文', 'Chinese'], ['ja', '日本語', 'Japanese'], ['ko', '한국어', 'Korean']];
const langName = code => (CHAT_LANGS.find(l => l[0] === code) || [])[2] || code;
const COURSE_LANG = SUBJ.language || 'en';
/** '' = the language of the course (the learner may still write in another one) */
const chatLang = () => S.settings.chatLang || '';
/** The rule added to every conversation's instructions, read at call time (a change applies to the next answer). */
function langRule() {
  const l = chatLang();
  if (!l || l === COURSE_LANG) return COURSE_LANG !== 'en' || l ? `LANGUAGE: reply in ${langName(COURSE_LANG)} (the language of the course material) unless the learner writes in another language.` : '';
  return `LANGUAGE: always write to the learner in ${langName(l)}, although the course material and the notes below are in ${langName(COURSE_LANG)}. Translate what you quote or explain from them; keep code, formulas and proper names as they are, and give a key technical term in its original form in parentheses the first time it appears (the learner meets it that way in the material). If the learner explicitly asks for another language, use that one.`;
}
/** For the JSON helpers (grading, feedback): which language their human-readable fields are written in. */
const langFields = what => { const l = chatLang(); return l && l !== COURSE_LANG ? ` Write ${what} in ${langName(l)}.` : ''; };
const FORMAT = `markdown allowed (**bold**, \`code\`, short lists, fenced code${SUBJ.features?.math ? ', LaTeX math with $…$ inline and $$…$$ display' : ''}). ${TUTOR.examples} At most one emoji. Never invent facts about ${TUTOR.domain}; if you go beyond the COURSE NOTES, say "(beyond the notes)".`;
const STYLE = `Formatting: short turns (max ~120 words unless asked), ${FORMAT}`;
/** For the free, in-depth explanations: the same rules without the short-turn cap. */
const STYLE_FREE = `Formatting: ${FORMAT}`;
const MODES = {
  socratic: { get label() { return `${TUTOR.avatar} ` + tE('engine.mode.socratic'); }, sys: `You are "{{tutor}}", a Socratic ${TUTOR.domain} tutor. Your job is to make the learner reach CLEAR, CORRECT, LASTING KNOWLEDGE — questions are a means, never the goal. ${LEARNER}

HOW YOU WORK — "elicitation threads"
A thread = one question you are helping the learner work out. The app tracks every thread (see TUTOR STATE below — it is authoritative).
1. Each turn, decide: ANSWER DIRECTLY or ELICIT.
   • Answer directly (no new thread) when it is a fact, definition, number, name or syntax; when the learner asks you to tell them or seems frustrated; when it is a side question; when they already tried twice; or when 2 threads are already open.
   • Elicit (open ONE thread) only when the learner can plausibly reason it out in 1–3 short steps from what they know and the insight is worth the effort.
2. Always react to the learner's last answer FIRST with an explicit verdict — "✅ Correct", "🟡 Partly right" or "❌ Not quite" — plus one sentence why. Never leave them unsure whether they were right.
3. Keep at most 2 threads open (a sub-question may nest inside the main one). After a sub-thread is resolved, say "Back to: <parent question>".
4. A thread ENDS when the learner gets it right, when its attempt budget is used (TUTOR STATE), or when they ask for the answer. Ending a thread = write
   **✅ Answer:** the authoritative, complete answer (2–5 precise sentences, with the key example${SUBJ.features?.code ? ', code' : ''}${SUBJ.features?.math ? ', formula' : ''} if useful)
   **📌 Lesson:** one memorable sentence.
   Even when the learner was right, still give the ✅ Answer in full form so the knowledge is stated authoritatively.
5. If the learner asks a NEW question while a thread is open: answer it directly and briefly (unless it is a true prerequisite → you may open a nested thread), then return to the open thread.
6. When no thread is open and lessons exist, do NOT start a new chain on your own: close with **🎓 What you learned:** (bullets of the lessons) and offer one optional next step as a yes/no question.
7. Normal turns ≤ 140 words; resolutions and summaries may be longer. End with at most ONE question — or none when closing.

MACHINE STATE — mandatory, hidden from the learner. End EVERY reply with exactly one line:
<noema-state>{"opened":[{"id":"t<N>","question":"<question you are asking now>","parent":"<open thread id or null>"}],"resolved":[{"id":"<thread id>","answer":"<1–2 sentence authoritative answer>","lesson":"<one sentence>"}],"lesson":"<optional lesson for a direct answer that opened no thread>","focus":"<id the learner should answer next, or null>","verdict":"correct|partial|wrong|none","summary":<true if this reply contains 🎓 What you learned, else false>}</noema-state>
Omit empty arrays. Use the "Next new thread id" from TUTOR STATE. Nothing may follow the closing tag.
${STYLE}` },
  explain: { get label() { return '💡 ' + tE('engine.mode.explain'); }, sys: `You are "{{tutor}}", an expert ${TUTOR.domain} teacher in a FREE CONVERSATION with the learner. Your only goal is that the learner truly UNDERSTANDS. ${LEARNER}
HOW YOU WORK
• Explain in depth and as intuitively and insightfully as possible. Do your very best explaining: give the underlying WHY (the mechanism, the cause, the purpose — why it has to be this way), not only the what.
• Build from what the learner already knows; use a vivid analogy or mental image, a concrete example${SUBJ.features?.code ? ' or code' : ''}${SUBJ.features?.math ? ' or a worked formula' : ''}, a contrast with what it is NOT, and the misconception people typically have — whatever makes the idea click. Prefer one deep, well-built explanation over a checklist.
• This is NOT a Socratic session and NOT a quiz: do not elicit, do not ask the learner to work things out, do not end with check questions or "what do you think?". Just explain. Answer follow-up questions the same way. Ask something only if the learner's question is truly ambiguous.
• Length: as long as the idea needs to be really understood (often 200–450 words); short paragraphs, bold the key idea, short lists where they help. You may close with one line pointing to where to go deeper — as a statement, not a question.
${STYLE_FREE}` },
  hint: { get label() { return '🪜 ' + tE('engine.mode.hint'); }, chip: false, sys: `You are "{{tutor}}", a ${TUTOR.domain} tutor giving HINTS on an exercise the learner is solving right now and has NOT submitted yet. ${LEARNER}
The exercise below comes with its correct answer and explanation — they are for YOU only.
• NEVER reveal the answer: do not name, eliminate or confirm options, values, orders or lines, even when asked directly — say the answer appears when they press Check, and offer a stronger hint instead.
• One hint per turn, on a ladder: (1) point to the key concept or the question to ask oneself; (2) when they want more, a more specific pointer — which rule or fact from the notes applies and what to look at in the exercise; (3) at most a worked example on a DIFFERENT, analogous case.
• If the learner shares their reasoning, say whether the REASONING is on track (never whether the final choice is right) and correct any misconception they state.
• Each hint ≤ 70 words. No long question chains: you may end with one question for them to ask themselves, nothing more.
${STYLE}` },
  quiz: { get label() { return '⚡ ' + tE('engine.mode.quiz'); }, sys: `You are "{{tutor}}", a rapid-fire ${TUTOR.domain} quiz master. ${LEARNER}
Ask ONE question at a time, varying the format: predict-the-outcome, spot-the-trap, ${SUBJ.features?.code ? 'write-the-syntax, ' : ''}${SUBJ.features?.math ? 'calculate, ' : ''}compare two concepts, "what do you ask yourself first when…". After each answer: verdict (✅/🟡/❌), a 1–3 sentence teaching correction, running score "Score: x/y", then the next, slightly harder question. Focus on traps and reasoning errors. ${STYLE}` },
  interview: { get label() { return '🎤 ' + tE('engine.mode.interview'); }, sys: `You are ${TUTOR.interviewer}. ${LEARNER}
Ask ONE realistic question at a time about the context topic (conceptual, scenario or diagnostic). After the learner answers: score /10, what was strong, what was missing, and a crisp model answer in ≤4 sentences. Then ask the next question, mixing in follow-ups ("and what if…?"). ${STYLE}` },
  debug: { get label() { return '🔧 ' + tE('engine.mode.debug'); }, sys: `You run an interactive CASE / DEBUGGING SIMULATION for ${TUTOR.domain}. ${LEARNER}
Invent a realistic scenario tied to the context topic (for example: ${TUTOR.simulation}). Describe ONLY the symptom or the observed facts (as a ticket, an error, a lab result or a case report would). The learner then asks diagnostic questions or "runs" checks. Reply exactly like the system/colleague/patient/data would — realistic outputs in code blocks where it fits — without revealing the root cause. If they flail, give a small nudge as a question. When they correctly state root cause + fix/explanation, debrief: which "ask yourself" questions they used well, which ones they skipped, and the ideal ordered checklist. ${STYLE}` },
};
/* i18n-ignore-end */
const T = { open: false, mode: 'socratic', ctx: null, hist: {}, busy: false, intents: {} };
function tutorCtxKey() { return (T.ctx?.id || 'course') + '|' + T.mode; }
/* i18n-ignore-start */   // the course context of the prompts
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
  if (c.kind === 'item') {   // 💡 on one part of the lesson: that part first, then the lesson around it
    const sec = c.sec && SEC[c.sec] ? (SEC[c.sec]._full ? { ...SEC[c.sec], blocks: SEC[c.sec]._full.blocks } : SEC[c.sec]) : null; const ch = sec ? sec._ch : c.ch && CH[c.ch];
    return `FOCUS — the part of the lesson the learner asks about:\n${String(c.text || c.label).slice(0, 8000)}` +
      (sec ? `\n\nWIDER CONTEXT — Chapter ${ch.num} "${ch.title}", section "${sec.title}" (the lesson it belongs to):\n` + sectionText(sec).slice(0, 14000) : '') +
      (ch ? '\n\nTHE CHAPTER:\n' + chapterOutline(ch).slice(0, 6000) : '');
  }
  return '';
}
/* i18n-ignore-end */
/** 💡 Explain this — a small icon in the top corner of a lesson part (shown on hover; always faintly on touch screens).
    It opens the tutor dock in “Explain” mode with that part as the focus and its section + chapter as wider context. */
function explainable(el, get) {
  if (!el || [...el.children].some(k => k.classList.contains('xbtn'))) return el;
  el.classList.add('xable');
  const b = h('button', { class: 'xbtn', type: 'button', title: tE('engine.tutor.explainThis'), 'aria-label': tE('engine.tutor.explainThisAria'), onclick: e => { e.stopPropagation(); e.preventDefault(); explainItem(get()); } }, '💡');
  // a block with its own buttons on top (a picture's ⤢, a question set's recall switch) takes the 💡 into that row, so it never covers them
  const dock = el.querySelector(':scope > .vx-fig > .vx > .vx-tools, :scope > .ask > .hd');
  if (dock) { b.classList.add('docked'); const zoom = $(':scope > .vx-zoom', dock); zoom ? dock.insertBefore(b, zoom) : dock.append(b); }
  else el.append(b);
  return el;
}
function explainItem({ label, text, sec, ch, what = 'part of the lesson' }) {   // i18n-ignore (what: words of the prompt)
  const plain = String(label || text || '').replace(/[*_`#>\[\]]/g, '').replace(/\s+/g, ' ').trim();
  const short = plain.length > 70 ? plain.slice(0, 68).replace(/\s+\S*$/, '') + '…' : plain;
  let hsh = 0; for (const x of String(text || label)) hsh = (hsh * 31 + x.charCodeAt(0)) >>> 0;
  openTutor({ kind: 'item', id: 'x' + hsh.toString(36), label: short, text: text || label, sec: sec?.id || sec || null, ch: ch?.id || ch || null }, 'explain', `Explain this ${what} to me: “${short}”`,   // i18n-ignore: the learner's first message to the AI (a prompt; see the report)
    { intent: INTENT.item(what) });
}

function setTutorContext(ctx) { T.ctx = ctx; if (T.open) renderTutor(); }
/** What the tutor talks about: [icon, chapter number or null, title] (ctxLabel() joins them). */
function ctxParts() {
  const c = T.ctx;
  if (!c) return ['🌍', null, tE('engine.tutor.ctxCourse')];
  if (c.kind === 'section') return SEC[c.id] ? ['📍', SEC[c.id]._ch.num, SEC[c.id].title] : ['📍', null, c.label || tE('engine.tutor.ctxSection')];
  if (c.kind === 'chapter') return CH[c.id] ? ['📍', CH[c.id].num, CH[c.id].title] : ['📍', null, c.label || tE('engine.tutor.ctxChapter')];
  if (c.kind === 'playbook') return PB[c.id] ? ['🔧', null, PB[c.id].title] : ['🔧', null, c.label || tE('engine.tutor.ctxDrill')];
  if (c.kind === 'exercise') return ['🧩', null, tE('engine.tutor.ctxExercise')];
  if (c.kind === 'item') return ['🔎', null, c.label || tE('engine.tutor.ctxPart')];
  return null;
}
function ctxLabel() {
  const p = ctxParts(); if (!p) return '';
  return p[0] + ' ' + (p[1] != null ? chTitle(p[1], p[2]) : p[2]);
}
/** 🎯 Why a conversation was opened: each button of the app gives the tutor its own task on top of the mode.
    It goes into the instructions of every turn of that conversation (and is kept with it in the history). */
/* i18n-ignore-start */   // tasks for the AI (prompts)
const INTENT = {
  item: what => `The learner pressed 💡 "Explain this" on ONE ${what} of the lesson (the FOCUS below). Explain exactly that ${what}: first in its own terms and in depth — what it means, why it is so, how it works — then how it fits into the lesson around it. Go beyond the notes whenever it helps understanding (mark it "(beyond the notes)").`,
  exHint: given => `The learner pressed "Ask ${TUTOR.name}" on an exercise BEFORE answering it — they want a hint, not the solution.${given ? ` What they have entered so far (not submitted): ${given}` : ''}`,
  exSocratic: given => `The learner answered the exercise below WRONG and pressed "Help me get it (Socratic)".${given ? ` Their answer: ${given}.` : ''} They have already seen the correct answer and the explanation of the app. Start from THEIR answer: find out what made it tempting, then guide them until they can say in their own words why the correct answer is correct and why their choice was a trap. Work on this exercise's key idea only — do not drift into a review of the whole topic.`,
  exExplain: given => `The learner answered the exercise below WRONG and pressed "💡 Explain differently".${given ? ` Their answer: ${given}.` : ''} They have already seen the correct answer and the explanation shown by the app (the "Explanation" below) and it did not click. Do exactly what the button says: explain the key idea behind the correct answer in a DIFFERENT way from that explanation — another angle, an analogy, a concrete example — and show precisely why their answer is wrong (what it misses or confuses). Do not ask them questions, do not quiz them and do not ask how they read the exercise: just explain.`,
  secSocratic: `Socratic dialogue on THIS section (the notes below). Cover its key ideas one by one, starting from what the learner already thinks about the first one; prefer the ideas that matter most and the classic traps.`,
  secDebug: `Case / debugging simulation built on THIS section: the case must exercise what the section teaches (its rules, mechanisms and traps), so that solving it means applying the section.`,
  secInterview: `Mock interview / oral exam on THIS section: realistic questions an examiner or interviewer would ask about its content, from the basics to the deeper "why" and "what if" questions.`,
  chSocratic: `Socratic review of the WHOLE chapter (outline below): go through its main ideas section by section, starting from what the learner already thinks; spend time where their answers are shaky and move on where they are solid. Close with a recap of the chapter when the main ideas are covered.`,
  pbRoleplay: `Role-play of THIS debug playbook: present only its symptom as a realistic case (ticket, error, report) and let the learner investigate. The "Ask yourself" checklist, the steps and the root causes below are for you — never reveal them; react to their checks like the real system would and debrief against the checklist at the end.`,
  course: `The learner opened the tutor on the whole course without a topic: follow their lead; if they have no topic, suggest 2–3 central ideas of the course to start from.`,
};
/* i18n-ignore-end */
function openTutor(ctx, mode, autoMsg, { intent } = {}) {
  if (ctx !== undefined) T.ctx = ctx;
  if (mode) T.mode = mode;
  if (intent) T.intents[tutorCtxKey()] = intent;
  T.open = true; renderTutor();
  $('.drawer').classList.add('open'); $('.scrim').classList.add('on');
  if (autoMsg) sendTutor(autoMsg, true);
  else setTimeout(() => $('.composer textarea')?.focus(), 350);
}
function closeTutor() { T.open = false; $('.drawer')?.classList.remove('open'); $('.scrim')?.classList.remove('on'); }
/** 🗣 The language picker of the AI conversations (⚙️ Settings and the tutor drawer). */
function chatLangSelect({ cls = '', onChange = null, persist = true } = {}) {
  return h('select', { class: cls, title: tE('engine.tutor.chatLangTip'), 'aria-label': tE('engine.tutor.chatLangAria'), onchange: e => { if (persist) { S.settings.chatLang = e.target.value; save(); } onChange?.(e.target.value); } },
    h('option', { value: '', selected: !chatLang() }, '🗣 ' + tE('engine.tutor.chatLangSame', { lang: CHAT_LANGS.find(l => l[0] === COURSE_LANG)?.[1] || COURSE_LANG })),
    ...CHAT_LANGS.map(([v, l]) => h('option', { value: v, selected: chatLang() === v }, '🗣 ' + l)));
}
/** The tutor is the learner's character: its face (engine/art.js), else the subject's emoji. */
function tutorFace() { const svg = SHL() && window.NoemaArt && window.NoemaThemes ? NoemaArt.mascot(NoemaThemes.current()) : ''; return svg ? h('div', { class: 'avatar face', html: svg }) : h('div', { class: 'avatar' }, TUTOR.avatar); }
/** 🕘 history, ⬇️ export, ↺ new: in a ⋮ with the shell, three small buttons without it. */
function tutorTools() {
  const items = [{ label: tE('engine.tutor.history'), icon: '🕘', run: () => { T.showHistory = !T.showHistory; renderTutor(); } }, { label: tE('engine.tutor.export'), icon: '⬇️', run: () => exportConvo(currentConvo()) },
    { label: tE('engine.tutor.newConvo'), icon: '↺', run: () => { T.hist[tutorCtxKey()] = []; delete T.tstate[tutorCtxKey()]; renderTutor(); } }];
  if (SHL()) return [T.showHistory ? h('button', { class: 'iconbtn on', title: tE('engine.tutor.history'), onclick: items[0].run }, '🕘') : null, SHL().menuButton(items, { label: tE('engine.tutor.more') })];
  return items.map((it, i) => h('button', { class: 'iconbtn' + (i === 0 && T.showHistory ? ' on' : ''), title: it.label, onclick: it.run }, it.icon));
}
function renderTutorHead() { if (T.open) renderTutor(); }
/** The frame's tutor (docs/UI_MAP.md): face, name, ⋮, ✕ · "How <name> helps you" over one list of the modes ·
    a "For: …" chip (✕ = the whole subject) · the conversation · the box to write in. Nothing else. */
const MODE_WORDS = { socratic: 'Socratic', explain: 'Explain', quiz: 'Quiz', interview: 'Interview', debug: 'Debug', hint: 'Hint' };   // i18n-ignore
const modeName = k => MODE_WORDS[k] ? SL('mode' + MODE_WORDS[k]) : (MODES[k]?.label || k), modeSub = k => MODE_WORDS[k] ? SL('mode' + MODE_WORDS[k] + 'Sub') : '';   // i18n-ignore
function renderShellTutor(d) {
  const X = SHL(), hist = T.hist[tutorCtxKey()] || [];
  const msgs = h('div', { class: 'msgs' });
  const send = () => { const ta = $('.composer textarea', d); const v = ta.value.trim(); if (v) { ta.value = ''; ta.style.height = 'auto'; sendTutor(v); } };
  const langMenu = btn => X.popMenu(btn, [{ label: SL('chatLangSame', { l: CHAT_LANGS.find(l => l[0] === COURSE_LANG)?.[1] || COURSE_LANG }), icon: !chatLang() ? '✓' : ' ', run: () => { S.settings.chatLang = ''; save(); renderTutor(); } },
    ...CHAT_LANGS.map(([v, l]) => ({ label: l, icon: chatLang() === v ? '✓' : ' ', run: () => { S.settings.chatLang = v; save(); renderTutor(); } }))]);
  const more = X.menuButton(() => [
    { label: SL('chatHistory'), icon: 'clock', run: () => SHL().convos() },   // the history is a window in the middle of the screen, every subject grouped by Roadmap and step
    { label: SL('chatNew'), icon: '↺', run: () => { T.showHistory = false; T.hist[tutorCtxKey()] = []; delete T.tstate[tutorCtxKey()]; renderTutor(); } },
    hist.length ? { label: SL('chatExport'), icon: '⬇️', run: () => exportConvo(currentConvo()) } : null,
    { label: SL('chatLangItem'), sub: chatLang() ? CHAT_LANGS.find(l => l[0] === chatLang())?.[1] : SL('chatLangSame', { l: CHAT_LANGS.find(l => l[0] === COURSE_LANG)?.[1] || COURSE_LANG }), icon: '🗣', run: () => setTimeout(() => langMenu(more.querySelector('button') || more), 0) }], { label: X.L('more') });
  const modeBtn = h('button', { class: 'ns-modesel', type: 'button', 'data-pop': '1', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: e => { e.stopPropagation(); const had = modeWrap.querySelector(':scope > .ns-pop'); X.closePops(); if (had) return;
    X.popMenu(modeBtn, Object.keys(MODES).filter(k => MODES[k].chip !== false || T.mode === k).map(k => ({ label: modeName(k), sub: modeSub(k), icon: T.mode === k ? '✓' : ' ', run: () => { T.mode = k; renderTutor(); } }))); } },
    h('b', {}, modeName(T.mode)), modeSub(T.mode) ? h('span', { class: 'sub' }, ' · ' + modeSub(T.mode)) : null, h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  const modeWrap = h('div', { class: 'ns-menu ns-modewrap' }, modeBtn);
  const ex = T.ctx?.kind === 'exercise', what = ex ? SL('forExercise') : T.ctx ? (ctxParts()?.[2] ?? '') : SL('tutorWhole');
  d.append(
    h('div', { class: 'dh ns-dh', lang: uiLang() },   // the frame's words: capitals and hyphens of the menus' language (the page has the subject's)
      h('div', { class: 'top' }, tutorFace(), h('b', { class: 'ns-tname grow' }, TUTOR.name), more,
        h('button', { class: 'iconbtn', title: X.L('close'), 'aria-label': X.L('close'), onclick: closeTutor }, '✕')),
      h('div', { class: 'ns-modelabel' }, SL(window.NoemaThemes?.tutor?.()?.pl ? 'tutorHelpsPl' : 'tutorHelps')),
      modeWrap),
    h('div', { class: 'ns-forrow', lang: uiLang() }, h('span', { class: 'ctxchip ns-forchip' }, SL('tutorFor', { what }),
      T.ctx ? h('button', { type: 'button', title: SL('tutorWholeBack'), 'aria-label': SL('tutorWholeBack'), onclick: () => setTutorContext(null) }, '✕') : null)),
    msgs,
    h('div', { class: 'composer' },
      h('textarea', { rows: 1, placeholder: SL('tutorWrite'), 'aria-label': SL('tutorWrite'), onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }, oninput: e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; } }),
      h('button', { class: 'send', title: tE('engine.tutor.send'), 'aria-label': tE('engine.tutor.send'), onclick: send }, '➤')));
  if (T.showHistory) { renderConvoHistory(msgs); return; }
  if (!hist.length) {
    const topic = T.ctx && !ex ? '«' + what + '»' : what;
    const hi = SL('greet' + (MODE_WORDS[T.mode] || 'Socratic'), { name: ACCOUNT.name || '', topic });   // i18n-ignore
    msgs.append(h('div', { class: 'msg ai ns-greet', lang: uiLang() }, ACCOUNT.name ? hi : hi.replace(/,?\s+([.,])/, '$1')));   // no name: "Hi." 
  }
  hist.forEach(m => {
    if (m.hidden) return;
    const b = h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') }, md(m.text));
    const res = m.meta?.noemaState?.resolved || [];
    if (m.role !== 'user' && res.some(r => r.lesson)) b.append(h('div', { class: 'lessonchips' }, ...res.filter(r => r.lesson).map(r => h('span', { class: 'lessonchip', html: '📌 ' + tE('engine.tutor.savedLesson', { lesson: fmt(r.lesson) }) }))));
    msgs.append(b);
  });
  const tb = threadTracker(tutorCtxKey(), hist.length); if (tb) msgs.before(tb);
  msgs.scrollTop = msgs.scrollHeight;
}
function renderTutor() {
  const d = $('.drawer'); d.innerHTML = '';
  if (SHL()) return renderShellTutor(d);
  const hist = T.hist[tutorCtxKey()] || [];
  const msgs = h('div', { class: 'msgs' });
  d.append(
    h('div', { class: 'dh' },
      h('div', { class: 'top' }, tutorFace(),
        h('div', { class: 'grow' }, h('b', {}, TUTOR.name), h('div', { class: 'tiny' }, tE('engine.tutor.poweredBy', { model: S.settings.model || tE('engine.tutor.autoModel') }))),
        ...tutorTools(),
        h('button', { class: 'iconbtn', title: tE('engine.tutor.close'), 'aria-label': tE('engine.tutor.close'), onclick: closeTutor }, '✕')),
      h('div', { class: 'row' }, h('span', { class: 'ctxchip' }, ctxLabel()),
        T.ctx ? h('button', { class: 'tiny', style: { textDecoration: 'underline' }, onclick: () => setTutorContext(null) }, tE('engine.tutor.useWhole')) : null,
        chatLangSelect({ cls: 'chatlang', onChange: () => renderTutor() })),
      h('div', { class: 'modechips' }, ...Object.entries(MODES).filter(([k, m]) => m.chip !== false || T.mode === k).map(([k, m]) => h('button', { class: T.mode === k ? 'on' : '', onclick: () => { T.mode = k; renderTutor(); } }, m.label)))),
    msgs,
    h('div', { class: 'composer' },
      h('textarea', { rows: 1, placeholder: tE('engine.tutor.placeholder'), onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = e.target.value.trim(); if (v) { e.target.value = ''; sendTutor(v); } } }, oninput: e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; } }),
      h('button', { class: 'send', title: tE('engine.tutor.send'), onclick: () => { const ta = $('.composer textarea'); const v = ta.value.trim(); if (v) { ta.value = ''; sendTutor(v); } } }, '➤')));
  if (T.showHistory) { renderConvoHistory(msgs); return; }
  if (!hist.length) {
    const topic = T.ctx ? ctxLabel().replace(/^\S+\s/, '') : SUBJ.title;
    const greet = { name: ACCOUNT.name, tutor: TUTOR.name, avatar: TUTOR.avatar, mode: MODES[T.mode].label };
    msgs.append(h('div', { class: 'msg ai' }, md(ACCOUNT.name ? tE('engine.tutor.greet', greet) : tE('engine.tutor.greetAnon', greet))),
      h('div', { class: 'starters' },
        ...[   // [the button (the learner's words), the mode, the first message sent to the AI (a prompt: English, i18n-ignore)]
          [`${TUTOR.avatar} ` + tE('engine.tutor.starterSocratic'), 'socratic', `Start a Socratic session on: ${topic}. Begin by probing what I already think.`],   // i18n-ignore
          ['⚡ ' + tE('engine.tutor.starterQuiz'), 'quiz', `Quiz me on ${topic}. Focus on certification traps and pitfalls.`],   // i18n-ignore
          ['🔧 ' + tE('engine.tutor.starterDebug'), 'debug', `Start a debugging simulation related to: ${topic}.`],   // i18n-ignore
          ['🎤 ' + tE('engine.tutor.starterInterview'), 'interview', `Interview me about ${topic}.`],   // i18n-ignore
          ['💡 ' + tE('engine.tutor.starterExplain'), 'explain', `Explain the core idea of ${topic} differently from the notes.`],   // i18n-ignore
        ].map(([l, m, msg]) => h('button', { onclick: () => { T.mode = m; renderTutor(); sendTutor(msg); } }, l))));
  }
  hist.forEach(m => {
    if (m.hidden) return;
    const b = h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') }, md(m.text));
    const res = m.meta?.noemaState?.resolved || [];
    if (m.role !== 'user' && res.some(r => r.lesson)) b.append(h('div', { class: 'lessonchips' }, ...res.filter(r => r.lesson).map(r => h('span', { class: 'lessonchip', html: '📌 ' + tE('engine.tutor.savedLesson', { lesson: fmt(r.lesson) }) }))));
    msgs.append(b);
  });
  const tb = threadTracker(tutorCtxKey(), hist.length); if (tb) msgs.before(tb);
  msgs.scrollTop = msgs.scrollHeight;
}
/** The task of this conversation: given now, set by the button that opened it, or kept in its first message. */
function tutorIntent(key, given) {
  return given || T.intents[key] || (T.hist[key] || []).find(m => m.meta?.intent)?.meta.intent || null;
}
/** The instructions of a tutor turn: the mode, then why the conversation was opened, then the course context. */
function tutorSystem(intent) {   // i18n-ignore
  return MODES[T.mode].sys.replaceAll('{{tutor}}', TUTOR.name) + (intent ? '\n\nWHY THIS CONVERSATION WAS OPENED — your task in it (unless the learner asks for something else):\n' + intent : '') + '\n\n' + tutorContextText();   // i18n-ignore
}
async function sendTutor(text, hidden = false, opts = {}) {
  if (T.busy) return;
  const key = tutorCtxKey();
  const hist = T.hist[key] = T.hist[key] || [];
  const threaded = usesThreads(T.mode);
  const ts = threaded ? threadStateFor(key) : null;
  const directive = threaded ? noteLearnerTurn(ts, text, opts.directive) : (opts.directive || null);
  const intent = tutorIntent(key, opts.intent);
  const meta = { ...(directive ? { directive } : {}), ...(intent && !hist.length ? { intent } : {}) };
  hist.push({ role: 'user', text, hidden: false, t: Date.now(), ...(Object.keys(meta).length ? { meta } : {}) });
  T.showHistory = false; persistConvo(key);
  renderTutor();
  const msgs = $('.drawer .msgs');
  const bubble = h('div', { class: 'msg ai' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
  msgs.append(bubble); msgs.scrollTop = msgs.scrollHeight;
  T.busy = true;
  let system = tutorSystem(intent);
  { const lr = langRule(); if (lr) system += '\n\n' + lr; }
  if (threaded) system += '\n\n' + tutorStateBlock(ts, directive);
  else if (directive === 'wrapup') system += '\n\nWRAP UP NOW: answer any question still pending with an authoritative **✅ Answer:**, then give **🎓 What you learned:** (3–7 concrete bullets of the key takeaways of this conversation) and one optional next step. Ask no new question.';   // i18n-ignore
  const contents = hist.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  try {
    const full = await gemini({ system, contents, onChunk: t => { bubble.innerHTML = ''; bubble.append(md(splitControl(t).clean || '…')); msgs.scrollTop = msgs.scrollHeight; } });
    const { clean, control } = splitControl(full);
    const msg = { role: 'model', text: clean || full, t: Date.now() };
    if (threaded) { if (control) { control._text = clean; } const got = applyControl(ts, control, hist.length); if (control) { delete control._text; msg.meta = { noemaState: control }; } if (got.length) toast('📌 ' + tE('engine.tutor.lessonsLearned', { n: got.length })); }
    hist.push(msg);
    persistConvo(key); maybeAutoTitle(key);
    touchStreak();
    renderTutor();
  } catch (e) {
    hist.pop(); persistConvo(key);
    bubble.className = 'msg err'; bubble.innerHTML = ''; bubble.append(md('⚠️ ' + errText(e)), h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: openSettings }, '⚙️ ' + tE('engine.tutor.settings')), e.needsKey || /key/i.test(e.message) ? h('button', { class: 'btn small ghost', onclick: () => openGuide('gemini') }, '🔑 ' + tE('engine.tutor.howKey')) : null));
  } finally { T.busy = false; }
}

/* ---------- AI helpers for exercises ---------- */
async function aiGrade(ex, answer) {
  const schema = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, verdict: { type: 'STRING' }, covered: { type: 'ARRAY', items: { type: 'STRING' } }, missing: { type: 'ARRAY', items: { type: 'STRING' } }, mistakes: { type: 'ARRAY', items: { type: 'STRING' } }, feedback: { type: 'STRING' } }, required: ['score', 'verdict', 'feedback'] };
  /* i18n-ignore-start */   // the grading prompt (English; langFields() asks for the learner's language)
  const ref = ex.type === 'write' ? `Reference solution:\n${ex.solution}` : `Model answer:\n${ex.model}\nRubric key points:\n- ${(ex.rubric || []).join('\n- ')}`;
  const sec = SEC[ex.section];
  const prompt = `Grade the learner's answer to a ${TUTOR.domain} exercise.\nQuestion: ${ex.q}\n${ex.code ? 'Code shown:\n' + ex.code + '\n' : ''}${ref}\n\nLearner's answer:\n"""${answer}"""\n\nSection notes (ground truth):\n${sec ? sectionText(sec).slice(0, 6000) : ''}\n\nReturn JSON: score 0-100 (meaning, not wording; for code accept equivalent correct syntax), verdict (one short line), covered (rubric points hit), missing (points missed), mistakes (factual errors), feedback (2-4 sentences, encouraging, specific, end with a nudge question).`;
  const g = await geminiJSON(prompt, `You are a strict but kind ${TUTOR.examinerRole}. Output only JSON.${langFields('the verdict, covered, missing and mistakes texts')}`, schema);
  /* i18n-ignore-end */
  try {
    const sec = SEC[ex.section];
    logAI(ex.type === 'write' ? 'code-review' : 'grading', {
      ctx: { kind: 'exercise', id: ex.id, label: sec ? tE('engine.log.exCtx', { ch: chTitle(sec._ch.num, sec.title), id: ex.id }) : ex.id },
      title: tE(ex.type === 'write' ? 'engine.log.codeReview' : 'engine.log.grading', { q: String(ex.q || '').replace(/[*`_]/g, '').slice(0, 70) }),
      prompt: tE('engine.log.questionMd', { q: ex.q }) + (ex.code ? '\n\n```\n' + ex.code + '\n```' : '') + '\n\n' + tE('engine.log.myAnswerMd') + '\n\n' + (ex.type === 'write' ? '```\n' + answer + '\n```' : answer),
      response: tE('engine.log.scoreMd', { score: g.score }) + ' — ' + (g.verdict || '') + '\n\n' + (g.covered?.length ? '✅ ' + g.covered.join(' · ') + '\n\n' : '') + (g.missing?.length ? '➕ ' + tE('engine.log.missing', { list: g.missing.join(' · ') }) + '\n\n' : '') + (g.mistakes?.length ? '❌ ' + g.mistakes.join(' · ') + '\n\n' : '') + (g.feedback || '') });
  } catch (e) { }
  return g;
}
async function aiQuestion(sec, kind = 'mcq') {
  const schema = { type: 'OBJECT', properties: { q: { type: 'STRING' }, code: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, why: { type: 'ARRAY', items: { type: 'STRING' } }, explain: { type: 'STRING' } }, required: ['q', 'options', 'answer', 'why', 'explain'] };
  /* i18n-ignore-start */   // the question prompt (English)
  const seen = shuffle(sec._ch.exercises.filter(e => e.section === sec.id)).slice(0, 6).map(e => '- ' + e.q).join('\n');
  const prompt = `Create ONE fresh, tricky multiple-choice question (4 options, exactly one correct) that tests deep understanding of this ${TUTOR.domain} section. Prefer a scenario, a prediction, a debugging decision or a certification trap. Avoid duplicating these existing questions:\n${seen}\n\nSECTION NOTES (only use facts from here):\n${sectionText(sec).slice(0, 9000)}\n\nJSON fields: q (inline markdown with **bold** and \`code\` allowed), code (optional snippet or empty string), options (4 strings), answer (0-3), why (4 short strings: why each option is right/wrong), explain (2-4 sentences that teach).`;
  const r = await geminiJSON(prompt, 'You write excellent exam questions. Output only JSON.', schema);
  /* i18n-ignore-end */
  try { logAI('question', { ctx: { kind: 'section', id: sec.id, label: chTitle(sec._ch.num, sec.title) }, title: tE('engine.log.aiQuestion', { q: String(r.q || '').replace(/[*`_]/g, '').slice(0, 70) }),
    prompt: tE('engine.log.aiQuestionAsk', { title: sec.title }),
    response: `${r.q}${r.code ? '\n\n```\n' + r.code + '\n```' : ''}\n\n${(r.options || []).map((o, i) => `${i === (r.answer | 0) ? '✅' : '▫️'} ${String.fromCharCode(65 + i)}. ${o}${r.why?.[i] ? ' — *' + r.why[i] + '*' : ''}`).join('\n')}\n\n` + tE('engine.log.explanationMd', { text: r.explain || '' }) }); } catch (e) { }
  return { id: 'ai-' + Date.now(), type: 'mcq', section: sec.id, difficulty: 2, tags: ['concept'], q: r.q, code: r.code || undefined, options: r.options.slice(0, 4), answer: Math.max(0, Math.min(3, r.answer | 0)), why: (r.why || []).slice(0, 4), explain: r.explain, _ch: sec._ch, _ai: true };
}
async function aiDrillGrade(d, answer) {
  const schema = { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, hit: { type: 'ARRAY', items: { type: 'INTEGER' } }, feedback: { type: 'STRING' } }, required: ['score', 'hit', 'feedback'] };
  /* i18n-ignore-start */   // the drill-grading prompt (English; langFields() asks for the learner's language)
  const prompt = `A learner was shown this debugging symptom and listed the questions they would ask themselves.\nSymptom: ${d.symptom}\nCanonical ordered checklist:\n${d.askYourself.map((q, i) => `${i}. ${q}`).join('\n')}\n\nLearner wrote:\n"""${answer}"""\n\nReturn JSON: hit = indexes of checklist questions the learner covered (same meaning counts), score 0-100 (coverage + sensible order), feedback 2-3 sentences: what they nailed, the most important one they missed and why it matters.`;
  const g = await geminiJSON(prompt, 'You are a precise debugging coach. Output only JSON.' + langFields('the feedback'), schema);
  /* i18n-ignore-end */
  try { logAI('drill-grading', { ctx: { kind: 'playbook', id: d.id, label: d.title }, title: tE('engine.log.drill', { title: d.title }).slice(0, 90),
    prompt: tE('engine.log.symptomMd', { symptom: d.symptom }) + '\n\n' + tE('engine.log.myQuestionsMd') + '\n\n' + answer,
    response: tE('engine.log.drillScoreMd', { score: g.score, hit: (g.hit || []).length, of: d.askYourself.length }) + '\n\n' + (g.feedback || '') + '\n\n' + tE('engine.log.checklistMd') + '\n' + d.askYourself.map((q, i) => `${(g.hit || []).includes(i) ? '✅' : '▫️'} ${i + 1}. ${q}`).join('\n') }); } catch (e) { }
  return g;
}

/* ---------- settings: a tab of the account menu (engine/src/70_account.js ACC_VIEWS.settings) ---------- */
function openSettings() { openAccountMenu('settings'); }
