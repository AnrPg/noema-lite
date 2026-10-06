/* ===================== Socratic elicitation threads: tracking, budgets, closure ===================== */
/* Every question the tutor makes the learner work on is a THREAD. The app (not the model) owns the
   thread state: it counts the learner's attempts, enforces a budget, injects the state into every call
   (TUTOR STATE) and parses the model's hidden <lq-state> control line to open/resolve threads.
   A thread always ends with an authoritative ✅ Answer + 📌 Lesson; the session ends with 🎓 What you learned. */
const THREAD_BUDGET = 3;        // learner attempts per thread before the tutor MUST give the answer
const MAX_OPEN_THREADS = 2;     // main question + at most one nested sub-question
const CONVERGE_AFTER = 10;      // learner turns after which the tutor must start converging
const TELL_ME_RE = /\b(just tell me|tell me the answer|give me the answer|i give up|no idea|i don'?t know|idk|what'?s the answer)\b|δεν ξέρω|πες μου|απάντησέ μου|δώσε μου την απάντηση/i;

T.tstate = {};
function newThreadState() { return { v: 1, threads: [], lessons: [], focus: null, learnerTurns: 0, missingControl: 0, wrapped: false }; }
function threadStateFor(key, create = true) { if (!T.tstate[key] && create) T.tstate[key] = newThreadState(); return T.tstate[key]; }
const openThreads = ts => ts.threads.filter(t => t.status === 'open');
const nextThreadId = ts => 't' + (ts.threads.reduce((m, t) => Math.max(m, parseInt(String(t.id).slice(1)) || 0), 0) + 1);
const usesThreads = mode => mode === 'socratic';

/** Split the model reply into the visible text and the hidden control object. Works on partial streams too. */
function splitControl(full) {
  const i = full.indexOf('<lq-state');
  if (i < 0) return { clean: full.trim(), control: null };
  const m = full.slice(i).match(/<lq-state>([\s\S]*?)<\/lq-state>/);
  let control = null;
  if (m) { try { control = JSON.parse(m[1].trim().replace(/^```(?:json)?|```$/g, '')); } catch (e) { control = null; } }
  return { clean: full.slice(0, i).trim(), control };
}

/** Learner sent a message: count an attempt on the focus thread and work out this turn's directive. */
function noteLearnerTurn(ts, text, directive) {
  ts.learnerTurns++;
  if (!directive && TELL_ME_RE.test(text)) directive = 'tellme';
  const f = ts.threads.find(t => t.id === ts.focus && t.status === 'open');
  if (f && !directive) f.attempts = (f.attempts || 0) + 1;
  return directive || null;
}

/** The TUTOR STATE block appended to the system prompt of every Socratic call. */
function tutorStateBlock(ts, directive) {
  const open = openThreads(ts);
  const depth = t => { let d = 0, p = t; while (p && p.parent) { d++; p = ts.threads.find(x => x.id === p.parent); } return d; };
  const lines = ['TUTOR STATE (authoritative — maintained by the app; follow it):', 'Open threads (outermost first):'];
  if (!open.length) lines.push('  (none)');
  open.forEach(t => lines.push(`  ${'  '.repeat(depth(t))}• ${t.id}${t.parent ? ` (inside ${t.parent})` : ''} "${t.question}" — learner attempts ${t.attempts || 0}/${t.budget || THREAD_BUDGET}${t.id === ts.focus ? '  ← FOCUS (the learner is answering this)' : ''}`));
  lines.push(ts.lessons.length ? 'Lessons already given (do not repeat; build on them):\n' + ts.lessons.map((l, i) => `  ${i + 1}) ${l.text}`).join('\n') : 'Lessons already given: (none yet)');
  lines.push(`Learner turns so far: ${ts.learnerTurns}.`);
  const dir = [];
  open.filter(t => (t.attempts || 0) >= (t.budget || THREAD_BUDGET)).forEach(t => dir.push(`Thread ${t.id} has used all its attempts → in THIS reply resolve it: **✅ Answer:** + **📌 Lesson:**. Do not ask about it again.`));
  if (directive === 'tellme') dir.push('The learner asked for the answer → resolve the FOCUS thread (and its sub-threads) now with **✅ Answer:** + **📌 Lesson:**, then go back to the parent thread if one is still open.');
  if (directive === 'wrapup') dir.push('WRAP UP NOW → resolve EVERY open thread (**✅ Answer:** + **📌 Lesson:** each), then give **🎓 What you learned:** (all lessons of this conversation as 3–7 bullets, authoritative and concrete) and one optional next step. Ask no new Socratic question; "opened" must be empty.');
  if (open.length >= MAX_OPEN_THREADS && directive !== 'wrapup') dir.push(`${open.length} threads are open → do NOT open a new thread; answer any new question directly and briefly.`);
  if (ts.learnerTurns >= CONVERGE_AFTER && open.length && !directive) dir.push('This conversation is long → converge: resolve the open threads within this or the next reply and give the 🎓 summary.');
  if (!open.length && ts.lessons.length && !directive) dir.push('No thread is open → if the learner asked something new, decide afresh (direct answer or ONE new thread). If they just acknowledged, close with **🎓 What you learned:** instead of starting a new chain.');
  if (ts.missingControl) dir.push('Your previous reply lacked the <lq-state> line — you MUST include it.');
  lines.push('DIRECTIVES:', ...(dir.length ? dir.map(d => '- ' + d) : ['- (none)']));
  lines.push(`Next new thread id: ${nextThreadId(ts)}.`);
  return lines.join('\n');
}

/** Merge the model's control object into the state. Returns the lessons resolved in this turn. */
function applyControl(ts, control, seq) {
  if (!control || typeof control !== 'object') { ts.missingControl++; return []; }
  ts.missingControl = 0;
  const got = [];
  (control.opened || []).forEach(o => {
    if (!o || !o.question) return;
    let id = o.id && !ts.threads.some(t => t.id === o.id) ? String(o.id) : nextThreadId(ts);
    const parent = o.parent && ts.threads.some(t => t.id === o.parent && t.status === 'open') ? o.parent : null;
    if (openThreads(ts).length >= MAX_OPEN_THREADS + 1) return;                 // hard cap even if the model ignores the rule
    ts.threads.push({ id, question: String(o.question).slice(0, 300), parent, status: 'open', attempts: 0, budget: THREAD_BUDGET, openedAt: seq });
  });
  const resolve = (t, r, how) => {
    t.status = 'resolved'; t.resolvedAt = seq; t.how = how; t.answer = r.answer ? String(r.answer) : (t.answer || ''); t.lesson = r.lesson ? String(r.lesson) : (t.lesson || '');
    if (t.lesson && !ts.lessons.some(l => l.text === t.lesson)) { const l = { text: t.lesson, thread: t.id, question: t.question, at: seq }; ts.lessons.push(l); got.push(l); }
    ts.threads.filter(c => c.parent === t.id && c.status === 'open').forEach(c => resolve(c, {}, 'closed-with-parent'));
  };
  (control.resolved || []).forEach(r => {
    if (!r) return;
    let t = ts.threads.find(x => x.id === r.id);
    if (!t) { t = { id: r.id || nextThreadId(ts), question: r.question || '(answered directly)', parent: null, status: 'open', attempts: 0, budget: THREAD_BUDGET, openedAt: seq }; ts.threads.push(t); }
    resolve(t, r, control.verdict === 'correct' ? 'learner-correct' : 'answered');
  });
  if (control.lesson && !ts.lessons.some(l => l.text === control.lesson)) { const l = { text: String(control.lesson), thread: null, question: null, at: seq }; ts.lessons.push(l); got.push(l); }
  const open = openThreads(ts);
  ts.focus = control.focus && open.some(t => t.id === control.focus) ? control.focus : (open.length ? open[open.length - 1].id : null);
  if (control.summary || (!open.length && /🎓/.test(control._text || ''))) ts.wrapped = true;
  return got;
}

/** Rebuild state from message metadata (for conversations stored before tutorState existed). */
function rebuildThreadState(msgs) {
  const ts = newThreadState();
  msgs.forEach((m, i) => { if (m.role === 'user') ts.learnerTurns++; else if (m.meta?.lqState) applyControl(ts, m.meta.lqState, i); });
  return ts;
}

/* ---------- UI: thread tracker inside the tutor drawer ---------- */
function threadTracker(key, histLen) {
  const ts = T.tstate[key];
  const socr = usesThreads(T.mode);
  if (!histLen) return null;
  const open = ts ? openThreads(ts) : [];
  const focus = ts && open.find(t => t.id === ts.focus);
  const bar = h('div', { class: 'threadbar' });
  const row = h('div', { class: 'tb-row' });
  const add = (...xs) => xs.forEach(x => x && row.append(x));
  if (socr && ts) {
    add(h('span', { class: 'tb-ic' }, open.length ? '🧵' : '✅'),
      h('div', { class: 'grow tb-txt' }, focus ? h('span', {}, h('b', {}, 'Working on: '), focus.question, ' ', h('span', { class: 'pill ' + ((focus.attempts || 0) >= (focus.budget || THREAD_BUDGET) - 1 ? 'warnpill' : '') }, `try ${Math.min((focus.attempts || 0) + 1, focus.budget || THREAD_BUDGET)}/${focus.budget || THREAD_BUDGET}`)) : h('span', {}, open.length ? `${open.length} open question(s)` : (ts.lessons.length ? 'All questions answered' : 'Ask anything — I’ll answer or guide you, then close with the answer'))),
      ts.lessons.length ? h('button', { class: 'pill c tb-lessons', onclick: () => bar.classList.toggle('open') }, `📌 ${ts.lessons.length} lesson${ts.lessons.length > 1 ? 's' : ''}`) : null,
      ts.threads.length ? h('button', { class: 'iconbtn tb-more', title: 'Show all threads', onclick: () => bar.classList.toggle('open') }, '▾') : null);
  } else add(h('span', { class: 'tb-ic' }, '🎯'), h('div', { class: 'grow tb-txt tiny' }, 'Want the key takeaways of this conversation?'));
  const actions = h('div', { class: 'tb-actions' },
    socr && focus ? h('button', { class: 'btn small', onclick: () => sendTutor('Just tell me the answer, please.', false, { directive: 'tellme' }) }, '💡 Just tell me') : null,
    histLen >= 2 ? h('button', { class: 'btn small primary', onclick: () => sendTutor('Let’s wrap up: give me the answers and what I learned.', false, { directive: 'wrapup' }) }, '🎓 Wrap up') : null);
  bar.append(row);
  if (actions.children.length) bar.append(actions);
  if (ts && ts.threads.length) {
    const tree = h('div', { class: 'tb-tree' });
    const kids = p => ts.threads.filter(t => (t.parent || null) === p);
    const draw = (t, d) => { tree.append(h('div', { class: 'tb-node ' + t.status, style: { paddingLeft: 8 + d * 16 + 'px' } }, h('span', {}, t.status === 'open' ? (t.id === ts.focus ? '👉' : '⏳') : '✅'), h('div', { class: 'grow' }, h('div', {}, t.question), t.lesson ? h('div', { class: 'tb-lesson', html: '📌 ' + fmt(t.lesson) }) : null))); kids(t.id).forEach(c => draw(c, d + 1)); };
    kids(null).forEach(t => draw(t, 0));
    const loose = ts.lessons.filter(l => !l.thread);
    if (loose.length) tree.append(...loose.map(l => h('div', { class: 'tb-node resolved', style: { paddingLeft: '8px' } }, h('span', {}, '📌'), h('div', { class: 'grow tb-lesson', html: fmt(l.text) }))));
    bar.append(tree);
  }
  return bar;
}
