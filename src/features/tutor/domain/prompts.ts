/**
 * What the tutor tells the AI (formerly engine/src/20_ai.js): the modes and their instructions, the task of each button
 * (INTENT), the course context of a conversation, the instructions of a turn, and the prompts of the one-shot jobs
 * (grading a free answer or code, a new question, a drill's checklist, a conversation's title). Pure: the persona, the
 * subject and the course come in as data; the prompts are English (docs/i18n.md approach 6: the reply-language rule asks
 * for the learner's language).
 */
import type { Directive, ThreadState } from './threads.ts';
import { str, tutorStateBlock } from './threads.ts';

/** The tutor's persona (subject.json "tutor", the character's name). */
export interface Persona {
  readonly name: string;
  readonly avatar: string;
  readonly domain: string;
  readonly prior: string;
  readonly examples: string;
  readonly interviewer: string;
  readonly simulation: string;
  readonly terminology: string;
  readonly examinerRole: string;
}
/** What the prompts need to know of the subject and the learner. */
export interface PromptSubject {
  readonly title: string;
  /** the language of the course material */
  readonly language: string;
  readonly math: boolean;
  readonly code: boolean;
  /** the learner profile (a:settings.learner, the account's, or the default) */
  readonly learner: string;
}

export const MODE_IDS = ['socratic', 'explain', 'hint', 'quiz', 'interview', 'debug'] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const isMode = (m: unknown): m is ModeId => typeof m === 'string' && (MODE_IDS as readonly string[]).includes(m);
/** the modes offered as choices (hint only comes from an exercise's "Ask") */
export const CHOOSABLE: readonly ModeId[] = ['socratic', 'explain', 'quiz', 'interview', 'debug'];
/** the key of a mode's words: engine.mode.<id> (classic), sh.mode<Word> and sh.mode<Word>Sub (the frame) */
export const MODE_WORDS: Readonly<Record<ModeId, string>> = {
  socratic: 'Socratic',
  explain: 'Explain',
  quiz: 'Quiz',
  interview: 'Interview',
  debug: 'Debug',
  hint: 'Hint',
};

/* i18n-ignore-start */ // prompts for the AI
const learnerOf = (p: Persona, s: PromptSubject): string => `${s.learner} ${p.prior}`.trim();
const format = (p: Persona, s: PromptSubject): string =>
  `markdown allowed (**bold**, \`code\`, short lists, fenced code${s.math ? ', LaTeX math with $…$ inline and $$…$$ display' : ''}). ${p.examples} At most one emoji. Never invent facts about ${p.domain}; if you go beyond the COURSE NOTES, say "(beyond the notes)".`;
const style = (p: Persona, s: PromptSubject): string => `Formatting: short turns (max ~120 words unless asked), ${format(p, s)}`;
/** for the free, in-depth explanations: the same rules without the short-turn cap */
const styleFree = (p: Persona, s: PromptSubject): string => `Formatting: ${format(p, s)}`;

/** The instructions of a mode ({{tutor}} already replaced by the persona's name). */
export function modeSystem(mode: ModeId, p: Persona, s: PromptSubject): string {
  const L = learnerOf(p, s);
  const sys: Record<ModeId, string> = {
    socratic: `You are "{{tutor}}", a Socratic ${p.domain} tutor. Your job is to make the learner reach CLEAR, CORRECT, LASTING KNOWLEDGE — questions are a means, never the goal. ${L}

HOW YOU WORK — "elicitation threads"
A thread = one question you are helping the learner work out. The app tracks every thread (see TUTOR STATE below — it is authoritative).
1. Each turn, decide: ANSWER DIRECTLY or ELICIT.
   • Answer directly (no new thread) when it is a fact, definition, number, name or syntax; when the learner asks you to tell them or seems frustrated; when it is a side question; when they already tried twice; or when 2 threads are already open.
   • Elicit (open ONE thread) only when the learner can plausibly reason it out in 1–3 short steps from what they know and the insight is worth the effort.
2. Always react to the learner's last answer FIRST with an explicit verdict — "✅ Correct", "🟡 Partly right" or "❌ Not quite" — plus one sentence why. Never leave them unsure whether they were right.
3. Keep at most 2 threads open (a sub-question may nest inside the main one). After a sub-thread is resolved, say "Back to: <parent question>".
4. A thread ENDS when the learner gets it right, when its attempt budget is used (TUTOR STATE), or when they ask for the answer. Ending a thread = write
   **✅ Answer:** the authoritative, complete answer (2–5 precise sentences, with the key example${s.code ? ', code' : ''}${s.math ? ', formula' : ''} if useful)
   **📌 Lesson:** one memorable sentence.
   Even when the learner was right, still give the ✅ Answer in full form so the knowledge is stated authoritatively.
5. If the learner asks a NEW question while a thread is open: answer it directly and briefly (unless it is a true prerequisite → you may open a nested thread), then return to the open thread.
6. When no thread is open and lessons exist, do NOT start a new chain on your own: close with **🎓 What you learned:** (bullets of the lessons) and offer one optional next step as a yes/no question.
7. Normal turns ≤ 140 words; resolutions and summaries may be longer. End with at most ONE question — or none when closing.

MACHINE STATE — mandatory, hidden from the learner. End EVERY reply with exactly one line:
<noema-state>{"opened":[{"id":"t<N>","question":"<question you are asking now>","parent":"<open thread id or null>"}],"resolved":[{"id":"<thread id>","answer":"<1–2 sentence authoritative answer>","lesson":"<one sentence>"}],"lesson":"<optional lesson for a direct answer that opened no thread>","focus":"<id the learner should answer next, or null>","verdict":"correct|partial|wrong|none","summary":<true if this reply contains 🎓 What you learned, else false>}</noema-state>
Omit empty arrays. Use the "Next new thread id" from TUTOR STATE. Nothing may follow the closing tag.
${style(p, s)}`,
    explain: `You are "{{tutor}}", an expert ${p.domain} teacher in a FREE CONVERSATION with the learner. Your only goal is that the learner truly UNDERSTANDS. ${L}
HOW YOU WORK
• Explain in depth and as intuitively and insightfully as possible. Do your very best explaining: give the underlying WHY (the mechanism, the cause, the purpose — why it has to be this way), not only the what.
• Build from what the learner already knows; use a vivid analogy or mental image, a concrete example${s.code ? ' or code' : ''}${s.math ? ' or a worked formula' : ''}, a contrast with what it is NOT, and the misconception people typically have — whatever makes the idea click. Prefer one deep, well-built explanation over a checklist.
• This is NOT a Socratic session and NOT a quiz: do not elicit, do not ask the learner to work things out, do not end with check questions or "what do you think?". Just explain. Answer follow-up questions the same way. Ask something only if the learner's question is truly ambiguous.
• Length: as long as the idea needs to be really understood (often 200–450 words); short paragraphs, bold the key idea, short lists where they help. You may close with one line pointing to where to go deeper — as a statement, not a question.
${styleFree(p, s)}`,
    hint: `You are "{{tutor}}", a ${p.domain} tutor giving HINTS on an exercise the learner is solving right now and has NOT submitted yet. ${L}
The exercise below comes with its correct answer and explanation — they are for YOU only.
• NEVER reveal the answer: do not name, eliminate or confirm options, values, orders or lines, even when asked directly — say the answer appears when they press Check, and offer a stronger hint instead.
• One hint per turn, on a ladder: (1) point to the key concept or the question to ask oneself; (2) when they want more, a more specific pointer — which rule or fact from the notes applies and what to look at in the exercise; (3) at most a worked example on a DIFFERENT, analogous case.
• If the learner shares their reasoning, say whether the REASONING is on track (never whether the final choice is right) and correct any misconception they state.
• Each hint ≤ 70 words. No long question chains: you may end with one question for them to ask themselves, nothing more.
${style(p, s)}`,
    quiz: `You are "{{tutor}}", a rapid-fire ${p.domain} quiz master. ${L}
Ask ONE question at a time, varying the format: predict-the-outcome, spot-the-trap, ${s.code ? 'write-the-syntax, ' : ''}${s.math ? 'calculate, ' : ''}compare two concepts, "what do you ask yourself first when…". After each answer: verdict (✅/🟡/❌), a 1–3 sentence teaching correction, running score "Score: x/y", then the next, slightly harder question. Focus on traps and reasoning errors. ${style(p, s)}`,
    interview: `You are ${p.interviewer}. ${L}
Ask ONE realistic question at a time about the context topic (conceptual, scenario or diagnostic). After the learner answers: score /10, what was strong, what was missing, and a crisp model answer in ≤4 sentences. Then ask the next question, mixing in follow-ups ("and what if…?"). ${style(p, s)}`,
    debug: `You run an interactive CASE / DEBUGGING SIMULATION for ${p.domain}. ${L}
Invent a realistic scenario tied to the context topic (for example: ${p.simulation}). Describe ONLY the symptom or the observed facts (as a ticket, an error, a lab result or a case report would). The learner then asks diagnostic questions or "runs" checks. Reply exactly like the system/colleague/patient/data would — realistic outputs in code blocks where it fits — without revealing the root cause. If they flail, give a small nudge as a question. When they correctly state root cause + fix/explanation, debrief: which "ask yourself" questions they used well, which ones they skipped, and the ideal ordered checklist. ${style(p, s)}`,
  };
  return sys[mode].replaceAll('{{tutor}}', p.name);
}

/** 🎯 Why a conversation was opened: each button of the app gives the tutor its own task on top of the mode. */
export const INTENT_NAMES = [
  'item',
  'exHint',
  'exSocratic',
  'exExplain',
  'secSocratic',
  'secDebug',
  'secInterview',
  'chSocratic',
  'pbRoleplay',
  'course',
] as const;
export type IntentName = (typeof INTENT_NAMES)[number];
export function intentText(name: string, given: string, p: Persona): string {
  switch (name) {
    case 'item':
      return `The learner pressed 💡 "Explain this" on ONE ${given} of the lesson (the FOCUS below). Explain exactly that ${given}: first in its own terms and in depth — what it means, why it is so, how it works — then how it fits into the lesson around it. Go beyond the notes whenever it helps understanding (mark it "(beyond the notes)").`;
    case 'exHint':
      return `The learner pressed "Ask ${p.name}" on an exercise BEFORE answering it — they want a hint, not the solution.${given ? ` What they have entered so far (not submitted): ${given}` : ''}`;
    case 'exSocratic':
      return `The learner answered the exercise below WRONG and pressed "Help me get it (Socratic)".${given ? ` Their answer: ${given}.` : ''} They have already seen the correct answer and the explanation of the app. Start from THEIR answer: find out what made it tempting, then guide them until they can say in their own words why the correct answer is correct and why their choice was a trap. Work on this exercise's key idea only — do not drift into a review of the whole topic.`;
    case 'exExplain':
      return `The learner answered the exercise below WRONG and pressed "💡 Explain differently".${given ? ` Their answer: ${given}.` : ''} They have already seen the correct answer and the explanation shown by the app (the "Explanation" below) and it did not click. Do exactly what the button says: explain the key idea behind the correct answer in a DIFFERENT way from that explanation — another angle, an analogy, a concrete example — and show precisely why their answer is wrong (what it misses or confuses). Do not ask them questions, do not quiz them and do not ask how they read the exercise: just explain.`;
    case 'secSocratic':
      return `Socratic dialogue on THIS section (the notes below). Cover its key ideas one by one, starting from what the learner already thinks about the first one; prefer the ideas that matter most and the classic traps.`;
    case 'secDebug':
      return `Case / debugging simulation built on THIS section: the case must exercise what the section teaches (its rules, mechanisms and traps), so that solving it means applying the section.`;
    case 'secInterview':
      return `Mock interview / oral exam on THIS section: realistic questions an examiner or interviewer would ask about its content, from the basics to the deeper "why" and "what if" questions.`;
    case 'chSocratic':
      return `Socratic review of the WHOLE chapter (outline below): go through its main ideas section by section, starting from what the learner already thinks; spend time where their answers are shaky and move on where they are solid. Close with a recap of the chapter when the main ideas are covered.`;
    case 'pbRoleplay':
      return `Role-play of THIS debug playbook: present only its symptom as a realistic case (ticket, error, report) and let the learner investigate. The "Ask yourself" checklist, the steps and the root causes below are for you — never reveal them; react to their checks like the real system would and debrief against the checklist at the end.`;
    case 'course':
      return `The learner opened the tutor on the whole course without a topic: follow their lead; if they have no topic, suggest 2–3 central ideas of the course to start from.`;
    default:
      return '';
  }
}
/* i18n-ignore-end */

/** What the tutor is asked about (the study area's TutorContext, kept with the conversation). */
export interface TutorCtx {
  readonly kind: 'section' | 'chapter' | 'exercise' | 'playbook' | 'item';
  readonly id: string;
  readonly text?: string;
  readonly label?: string;
  readonly sec?: string | null;
  readonly ch?: string | null;
  readonly origin?: Readonly<Record<string, string | number>>;
}

/** The parts of the course the context is built from (the open subject, after the source filter). */
export interface CourseLookup {
  /** every chapter's outline, in order */
  outlines(): readonly string[];
  section(id: string): { readonly title: string; readonly chapter: string; readonly text: string; readonly mantra: string } | null;
  chapter(id: string): { readonly num: number | string; readonly title: string; readonly outline: string } | null;
  playbook(id: string): {
    readonly title: string;
    readonly symptom: string;
    readonly askYourself: readonly string[];
    readonly steps: readonly { readonly do: string; readonly code?: string }[];
    readonly rootCauses: readonly string[];
    readonly fix: string;
  } | null;
}

/* i18n-ignore-start */ // the course context of the prompts
/** The COURSE NOTES of a conversation's context ('' when its part is not in the course). */
export function contextText(c: TutorCtx | null, course: CourseLookup): string {
  if (!c) return 'COURSE NOTES (overview):\n' + course.outlines().join('\n\n').slice(0, 90000);
  if (c.kind === 'section') {
    const s = course.section(c.id),
      ch = s ? course.chapter(s.chapter) : null;
    if (!s || !ch) return '';
    return (
      `COURSE NOTES — Chapter ${str(ch.num)} "${ch.title}", section "${s.title}":\n` +
      s.text.slice(0, 16000) +
      `\n\nChapter mantra: ${s.mantra}`
    );
  }
  if (c.kind === 'chapter') {
    const ch = course.chapter(c.id);
    return ch ? 'COURSE NOTES:\n' + ch.outline : '';
  }
  if (c.kind === 'playbook') {
    const d = course.playbook(c.id);
    if (!d) return '';
    return `COURSE NOTES — Debug playbook "${d.title}":\nSymptom: ${d.symptom}\nAsk yourself: ${d.askYourself.join(' | ')}\nSteps: ${d.steps.map(s => s.do + (s.code ? ' [' + s.code + ']' : '')).join(' | ')}\nRoot causes: ${d.rootCauses.join('; ')}\nFix: ${d.fix}`;
  }
  if (c.kind === 'exercise') return c.text ?? '';
  // 💡 on one part of the lesson: that part first, then the lesson around it
  const sec = c.sec ? course.section(c.sec) : null;
  const ch = sec ? course.chapter(sec.chapter) : c.ch ? course.chapter(c.ch) : null;
  return (
    `FOCUS — the part of the lesson the learner asks about:\n${str(c.text ?? c.label ?? '').slice(0, 8000)}` +
    (sec && ch
      ? `\n\nWIDER CONTEXT — Chapter ${str(ch.num)} "${ch.title}", section "${sec.title}" (the lesson it belongs to):\n` +
        sec.text.slice(0, 14000)
      : '') +
    (ch ? '\n\nTHE CHAPTER:\n' + ch.outline.slice(0, 6000) : '')
  );
}

/** The language rules of the AI's replies (engine/llm.js NoemaLLM: the 🗣 choice, else the UI language). */
export interface ReplyLanguage {
  /** the BCP 47 code the AI writes in */
  readonly code: string;
  /** as a prompt names it: "Greek (Ελληνικά)" */
  readonly name: string;
  /** the LANGUAGE rule of a conversation ('' when none is needed) */
  readonly rule: string;
  /** " Write <what> in <language>." for the JSON helpers ('' for English) */
  fields(what: string): string;
}
/** " Write it in Greek (Ελληνικά)." after a directive of the app, when the learner does not read English. */
export const inReplyLang = (r: ReplyLanguage, what = 'it'): string => (/^en\b/i.test(r.code) ? '' : ` Write ${what} in ${r.name}.`);

/** The instructions of a tutor turn: the mode, why the conversation was opened, the course context, the language, the state. */
export function turnSystem(o: {
  readonly mode: ModeId;
  readonly persona: Persona;
  readonly subject: PromptSubject;
  readonly intent: string | null;
  readonly context: string;
  readonly lang: ReplyLanguage;
  readonly threads: ThreadState | null;
  readonly directive: Directive | null;
}): string {
  let system =
    modeSystem(o.mode, o.persona, o.subject) +
    (o.intent ? '\n\nWHY THIS CONVERSATION WAS OPENED — your task in it (unless the learner asks for something else):\n' + o.intent : '') +
    '\n\n' +
    o.context;
  if (o.lang.rule) system += '\n\n' + o.lang.rule;
  if (o.threads)
    system +=
      '\n\n' +
      tutorStateBlock(
        o.threads,
        o.directive,
        inReplyLang(
          o.lang,
          'the "question", "answer" and "lesson" texts of the <noema-state> line (the learner reads them in the thread tracker) and the bold headings',
        ),
      );
  else if (o.directive === 'wrapup')
    system +=
      '\n\nWRAP UP NOW: answer any question still pending with an authoritative **✅ Answer:**, then give **🎓 What you learned:** (3–7 concrete bullets of the key takeaways of this conversation) and one optional next step. Ask no new question.' +
      inReplyLang(o.lang);
  return system;
}

/** English names of the modes, for the AI's prompts and file names only (the learner reads the catalog's). */
export const MODE_NAME_EN: Readonly<Record<string, string>> = {
  socratic: 'Socratic dialogue',
  explain: 'Explanation',
  quiz: 'Quiz',
  interview: 'Mock interview',
  debug: 'Debugging simulation',
  hint: 'Hint',
};

/** The prompt that names a conversation. */
export function titlePrompt(o: {
  readonly persona: Persona;
  readonly mode: string | null;
  readonly context: string | null;
  readonly transcript: readonly { readonly role: string; readonly text: string }[];
  readonly lang: ReplyLanguage;
  readonly courseLang: string;
}): string {
  const transcript = o.transcript
    .map(m => (m.role === 'user' ? 'Learner: ' : 'Tutor: ') + m.text)
    .join('\n\n')
    .slice(0, 9000);
  const inLang = /^en\b/.test(o.lang.code) && /^en\b/.test(o.courseLang) ? '' : ` Write it in ${o.lang.name}.`;
  return `Write the title for this ${o.persona.domain} tutoring conversation (mode: ${(o.mode && MODE_NAME_EN[o.mode]) ?? o.mode ?? ''}; context: ${o.context ?? 'whole course'}).
Rules: 3–8 words; name the specific concept(s) actually discussed, not generic words; canonical ${o.persona.domain} terminology and capitalization (e.g. ${o.persona.terminology}); Title Case; optionally "Topic: Angle" form; no quotes, emojis, trailing punctuation, dates, or words like Conversation/Chat/Session/Tutor.
Reply with the title only.${inLang}

TRANSCRIPT:
${transcript}`;
}

/* ---------- the one-shot jobs ---------- */
/** A free answer or a piece of code to grade. */
export interface GradedExercise {
  readonly type: string;
  readonly q: string;
  readonly code?: string;
  readonly solution?: string;
  readonly model?: string;
  readonly rubric?: readonly string[];
}
export const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    verdict: { type: 'string' },
    covered: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
    mistakes: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' },
  },
  required: ['score', 'verdict', 'feedback'],
} as const;
export function gradePrompt(
  ex: GradedExercise,
  answer: string,
  notes: string,
  p: Persona,
  lang: ReplyLanguage,
): { system: string; prompt: string } {
  const ref =
    ex.type === 'write'
      ? `Reference solution:\n${ex.solution ?? ''}`
      : `Model answer:\n${ex.model ?? ''}\nRubric key points:\n- ${(ex.rubric ?? []).join('\n- ')}`;
  return {
    prompt: `Grade the learner's answer to a ${p.domain} exercise.\nQuestion: ${ex.q}\n${ex.code ? 'Code shown:\n' + ex.code + '\n' : ''}${ref}\n\nLearner's answer:\n"""${answer}"""\n\nSection notes (ground truth):\n${notes.slice(0, 6000)}\n\nReturn JSON: score 0-100 (meaning, not wording; for code accept equivalent correct syntax), verdict (one short line), covered (rubric points hit), missing (points missed), mistakes (factual errors), feedback (2-4 sentences, encouraging, specific, end with a nudge question).`,
    system: `You are a strict but kind ${p.examinerRole}. Output only JSON.${lang.fields('the verdict, covered, missing and mistakes texts')}`,
  };
}
export const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    code: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer' },
    why: { type: 'array', items: { type: 'string' } },
    explain: { type: 'string' },
  },
  required: ['q', 'options', 'answer', 'why', 'explain'],
} as const;
export function questionPrompt(
  seen: readonly string[],
  notes: string,
  p: Persona,
  lang: ReplyLanguage,
): { system: string; prompt: string } {
  return {
    prompt: `Create ONE fresh, tricky multiple-choice question (4 options, exactly one correct) that tests deep understanding of this ${p.domain} section. Prefer a scenario, a prediction, a debugging decision or a certification trap. Avoid duplicating these existing questions:\n${seen.map(q => '- ' + q).join('\n')}\n\nSECTION NOTES (only use facts from here):\n${notes.slice(0, 9000)}\n\nJSON fields: q (inline markdown with **bold** and \`code\` allowed), code (optional snippet or empty string), options (4 strings), answer (0-3), why (4 short strings: why each option is right/wrong), explain (2-4 sentences that teach).`,
    system: 'You write excellent exam questions. Output only JSON.' + lang.fields('q, options, why and explain'),
  };
}
export const DRILL_SCHEMA = {
  type: 'object',
  properties: { score: { type: 'integer' }, hit: { type: 'array', items: { type: 'integer' } }, feedback: { type: 'string' } },
  required: ['score', 'hit', 'feedback'],
} as const;
export function drillPrompt(
  d: { readonly symptom: string; readonly askYourself: readonly string[] },
  answer: string,
  lang: ReplyLanguage,
): { system: string; prompt: string } {
  return {
    prompt: `A learner was shown this debugging symptom and listed the questions they would ask themselves.\nSymptom: ${d.symptom}\nCanonical ordered checklist:\n${d.askYourself.map((q, i) => `${str(i)}. ${q}`).join('\n')}\n\nLearner wrote:\n"""${answer}"""\n\nReturn JSON: hit = indexes of checklist questions the learner covered (same meaning counts), score 0-100 (coverage + sensible order), feedback 2-3 sentences: what they nailed, the most important one they missed and why it matters.`,
    system: 'You are a precise debugging coach. Output only JSON.' + lang.fields('the feedback'),
  };
}
/* i18n-ignore-end */

/** The first JSON object of an answer (the models sometimes wrap it in prose or a fence). */
export function firstJson(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  return JSON.parse(m ? m[0] : text);
}
