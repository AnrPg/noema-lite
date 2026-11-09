/**
 * Socratic elicitation threads: tracking, budgets, closure (formerly engine/src/65_threads.js).
 *
 * Every question the tutor makes the learner work on is a THREAD. The app (not the model) owns the thread state: it counts
 * the learner's attempts, enforces a budget, injects the state into every call (TUTOR STATE) and parses the model's hidden
 * <noema-state> control line to open and resolve threads. A thread always ends with an authoritative ✅ Answer + 📌 Lesson;
 * the session ends with 🎓 What you learned. Pure: the state is a plain object kept with the conversation (tutorState).
 */

/** any value as text (the model's JSON may hold anything where a string is expected) */
export const str = (x: unknown): string =>
  typeof x === 'string' ? x : typeof x === 'number' || typeof x === 'boolean' ? String(x) : x == null ? '' : JSON.stringify(x);

/** learner attempts per thread before the tutor MUST give the answer */
export const THREAD_BUDGET = 3;
/** main question + at most one nested sub-question */
export const MAX_OPEN_THREADS = 2;
/** learner turns after which the tutor must start converging */
export const CONVERGE_AFTER = 10;
/** "just tell me" in the languages of the UI */
export const TELL_ME_RE =
  /\b(just tell me|tell me the answer|give me the answer|i give up|no idea|i don'?t know|idk|what'?s the answer)\b|δεν ξέρω|πες μου|απάντησέ μου|δώσε μου την απάντηση|не знаю|скажи ответ|просто скажи|дай ответ|сдаюсь|je ne sais pas|dis-moi la réponse|donne-moi la réponse|j['’]abandonne|ich weiß (es )?nicht|sag mir die antwort/i;

export type Directive = 'tellme' | 'wrapup';

export interface Thread {
  id: string;
  question: string;
  parent: string | null;
  status: 'open' | 'resolved';
  attempts: number;
  budget: number;
  openedAt: number;
  resolvedAt?: number;
  how?: string;
  answer?: string;
  lesson?: string;
}
export interface Lesson {
  readonly text: string;
  readonly thread: string | null;
  readonly question: string | null;
  readonly at: number;
}
export interface ThreadState {
  v: 1;
  threads: Thread[];
  lessons: Lesson[];
  focus: string | null;
  learnerTurns: number;
  missingControl: number;
  wrapped: boolean;
}
/** The model's hidden control line (<noema-state>{…}</noema-state>). */
export interface Control {
  opened?: readonly ({ id?: string; question?: string; parent?: string | null } | null)[];
  resolved?: readonly ({ id?: string; question?: string; answer?: string; lesson?: string } | null)[];
  lesson?: string;
  focus?: string | null;
  verdict?: string;
  summary?: boolean;
}

export const newThreadState = (): ThreadState => ({
  v: 1,
  threads: [],
  lessons: [],
  focus: null,
  learnerTurns: 0,
  missingControl: 0,
  wrapped: false,
});
export const openThreads = (ts: ThreadState): Thread[] => ts.threads.filter(t => t.status === 'open');
export const nextThreadId = (ts: ThreadState): string =>
  't' + str(ts.threads.reduce((m, t) => Math.max(m, parseInt(str(t.id).slice(1)) || 0), 0) + 1);
/** the modes that track threads */
export const usesThreads = (mode: string): boolean => mode === 'socratic';

/** Splits the model's reply into the visible text and the hidden control object. Works on partial streams too. */
export function splitControl(full: string): { clean: string; control: Control | null } {
  const i = full.indexOf('<noema-state');
  if (i < 0) return { clean: full.trim(), control: null };
  const m = /<noema-state>([\s\S]*?)<\/noema-state>/.exec(full.slice(i));
  let control: Control | null = null;
  if (m?.[1] !== undefined) {
    try {
      const v: unknown = JSON.parse(m[1].trim().replace(/^```(?:json)?|```$/g, ''));
      control = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      control = null; // a broken control line counts as a missing one
    }
  }
  return { clean: full.slice(0, i).trim(), control };
}

/** The learner sent a message: counts an attempt on the focus thread and works out this turn's directive. */
export function noteLearnerTurn(ts: ThreadState, text: string, directive: Directive | null | undefined): Directive | null {
  ts.learnerTurns++;
  let d = directive ?? null;
  if (!d && TELL_ME_RE.test(text)) d = 'tellme';
  const f = ts.threads.find(t => t.id === ts.focus && t.status === 'open');
  if (f && !d) f.attempts = f.attempts + 1;
  return d;
}

/* i18n-ignore-start */ // a prompt for the AI (English)
/** The TUTOR STATE block appended to the instructions of every Socratic call. lang: the reply-language directive ('' for English). */
export function tutorStateBlock(ts: ThreadState, directive: Directive | null, lang: string): string {
  const open = openThreads(ts);
  const depth = (t: Thread): number => {
    let d = 0;
    let p: Thread | undefined = t;
    while (p?.parent) {
      d++;
      const parent: string = p.parent;
      p = ts.threads.find(x => x.id === parent);
    }
    return d;
  };
  const lines = ['TUTOR STATE (authoritative — maintained by the app; follow it):', 'Open threads (outermost first):'];
  if (!open.length) lines.push('  (none)');
  open.forEach(t =>
    lines.push(
      `  ${'  '.repeat(depth(t))}• ${t.id}${t.parent ? ` (inside ${t.parent})` : ''} "${t.question}" — learner attempts ${str(t.attempts)}/${str(t.budget)}${t.id === ts.focus ? '  ← FOCUS (the learner is answering this)' : ''}`,
    ),
  );
  lines.push(
    ts.lessons.length
      ? 'Lessons already given (do not repeat; build on them):\n' + ts.lessons.map((l, i) => `  ${str(i + 1)}) ${l.text}`).join('\n')
      : 'Lessons already given: (none yet)',
  );
  lines.push(`Learner turns so far: ${str(ts.learnerTurns)}.`);
  const dir: string[] = [];
  open
    .filter(t => t.attempts >= t.budget)
    .forEach(t =>
      dir.push(
        `Thread ${t.id} has used all its attempts → in THIS reply resolve it: **✅ Answer:** + **📌 Lesson:**. Do not ask about it again.`,
      ),
    );
  if (directive === 'tellme')
    dir.push(
      'The learner asked for the answer → resolve the FOCUS thread (and its sub-threads) now with **✅ Answer:** + **📌 Lesson:**, then go back to the parent thread if one is still open.',
    );
  if (directive === 'wrapup')
    dir.push(
      'WRAP UP NOW → resolve EVERY open thread (**✅ Answer:** + **📌 Lesson:** each), then give **🎓 What you learned:** (all lessons of this conversation as 3–7 bullets, authoritative and concrete) and one optional next step. Ask no new Socratic question; "opened" must be empty.',
    );
  if (open.length >= MAX_OPEN_THREADS && directive !== 'wrapup')
    dir.push(`${str(open.length)} threads are open → do NOT open a new thread; answer any new question directly and briefly.`);
  if (ts.learnerTurns >= CONVERGE_AFTER && open.length && !directive)
    dir.push('This conversation is long → converge: resolve the open threads within this or the next reply and give the 🎓 summary.');
  if (!open.length && ts.lessons.length && !directive)
    dir.push(
      'No thread is open → if the learner asked something new, decide afresh (direct answer or ONE new thread). If they just acknowledged, close with **🎓 What you learned:** instead of starting a new chain.',
    );
  if (ts.missingControl) dir.push('Your previous reply lacked the <noema-state> line — you MUST include it.');
  if (lang) dir.push(lang.trim());
  lines.push('DIRECTIVES:', ...(dir.length ? dir.map(d => '- ' + d) : ['- (none)']));
  lines.push(`Next new thread id: ${nextThreadId(ts)}.`);
  return lines.join('\n');
}
/* i18n-ignore-end */

/** Merges the model's control object into the state. text: the visible reply. → the lessons resolved in this turn. */
export function applyControl(ts: ThreadState, control: Control | null, seq: number, text = ''): Lesson[] {
  if (!control || typeof control !== 'object') {
    ts.missingControl++;
    return [];
  }
  ts.missingControl = 0;
  const got: Lesson[] = [];
  for (const o of control.opened ?? []) {
    if (!o?.question) continue;
    const id = o.id && !ts.threads.some(t => t.id === o.id) ? str(o.id) : nextThreadId(ts);
    const parent = o.parent && ts.threads.some(t => t.id === o.parent && t.status === 'open') ? o.parent : null;
    if (openThreads(ts).length >= MAX_OPEN_THREADS + 1) continue; // hard cap even if the model ignores the rule
    ts.threads.push({
      id,
      question: str(o.question).slice(0, 300),
      parent,
      status: 'open',
      attempts: 0,
      budget: THREAD_BUDGET,
      openedAt: seq,
    });
  }
  const resolve = (t: Thread, r: { answer?: string | undefined; lesson?: string | undefined }, how: string): void => {
    t.status = 'resolved';
    t.resolvedAt = seq;
    t.how = how;
    t.answer = r.answer ? str(r.answer) : (t.answer ?? '');
    t.lesson = r.lesson ? str(r.lesson) : (t.lesson ?? '');
    if (t.lesson && !ts.lessons.some(l => l.text === t.lesson)) {
      const l: Lesson = { text: t.lesson, thread: t.id, question: t.question, at: seq };
      ts.lessons.push(l);
      got.push(l);
    }
    ts.threads
      .filter(c => c.parent === t.id && c.status === 'open')
      .forEach(c => {
        resolve(c, {}, 'closed-with-parent');
      });
  };
  for (const r of control.resolved ?? []) {
    if (!r) continue;
    let t = ts.threads.find(x => x.id === r.id);
    if (!t) {
      // i18n-ignore (a thread the model answered without opening it)
      t = {
        id: r.id ?? nextThreadId(ts),
        question: r.question ?? '(answered directly)',
        parent: null,
        status: 'open',
        attempts: 0,
        budget: THREAD_BUDGET,
        openedAt: seq,
      };
      ts.threads.push(t);
    }
    resolve(t, r, control.verdict === 'correct' ? 'learner-correct' : 'answered');
  }
  if (control.lesson && !ts.lessons.some(l => l.text === control.lesson)) {
    const l: Lesson = { text: str(control.lesson), thread: null, question: null, at: seq };
    ts.lessons.push(l);
    got.push(l);
  }
  const open = openThreads(ts);
  const last = open[open.length - 1];
  ts.focus = control.focus && open.some(t => t.id === control.focus) ? control.focus : (last?.id ?? null);
  if (control.summary || (!open.length && /🎓/.test(text))) ts.wrapped = true;
  return got;
}

/** Rebuilds the state from the messages' metadata (conversations stored before tutorState existed). */
export function rebuildThreadState(
  msgs: readonly { readonly role: string; readonly text: string; readonly meta?: { readonly noemaState?: Control } }[],
): ThreadState {
  const ts = newThreadState();
  msgs.forEach((m, i) => {
    if (m.role === 'user') ts.learnerTurns++;
    else if (m.meta?.noemaState) applyControl(ts, m.meta.noemaState, i, m.text);
  });
  return ts;
}
