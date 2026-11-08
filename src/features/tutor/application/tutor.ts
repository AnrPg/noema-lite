/**
 * The tutor's use cases (formerly engine/src/20_ai.js, 60_convos.js, 65_threads.js): one session per open subject. It
 * knows what the tutor is talking about (the context and the mode, one conversation for each pair), sends a turn to the AI
 * with the instructions the domain builds (the mode, the button's task, the course notes, the language, the Socratic
 * threads), keeps every conversation in the ConversationStore as the learner writes, names conversations, reopens them
 * (from the history, another device, the search), and logs the one-shot AI jobs as conversations too. The screens
 * (src/features/tutor/ui) draw its state and call its methods; it calls them back through subscribe().
 */
import { NoemaError } from '../../../kernel/errors.ts';
import type { AsyncResult } from '../../../kernel/result.ts';
import { aiErrorKind, type AiProviderId, type ChatRequest, type ChatResponse } from '../../../ports/ai.ts';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { ConversationStore, StoredConversation } from '../../../ports/conversations.ts';
import type { I18n } from '../../../ports/i18n.ts';
import {
  cleanTitle,
  convoMarkdown,
  displayTitle,
  fmtDate,
  fromRecord,
  isTutor,
  modeName,
  otherApp,
  slug,
  toRecord,
  USER_TITLED,
  wantsTitle,
  type Conversation,
  type ConversationRecord,
  type CtxRecord,
  type Turn,
} from '../domain/conversation.ts';
import {
  contextText,
  intentText,
  isMode,
  MODE_NAME_EN,
  titlePrompt,
  turnSystem,
  type CourseLookup,
  type ModeId,
  type Persona,
  type PromptSubject,
  type ReplyLanguage,
  type TutorCtx,
} from '../domain/prompts.ts';
import {
  applyControl,
  newThreadState,
  noteLearnerTurn,
  rebuildThreadState,
  splitControl,
  str,
  usesThreads,
  type Directive,
  type Lesson,
  type ThreadState,
} from '../domain/threads.ts';

/** The AI the tutor talks to now (the composition picks the vendor: the Gemini key, a Claude key, else the copy fallback). */
export interface TutorAi {
  readonly provider: AiProviderId | 'copy';
  /** the model's name, kept with the conversation */
  readonly model: string;
  chat(r: ChatRequest): AsyncResult<ChatResponse>;
  /** without a key: the whole turn as one text the learner can paste into another AI */
  fallbackPrompt?(): string | null;
}

/** What the session needs of the open subject and the app. */
export interface TutorDeps {
  readonly i18n: I18n;
  readonly store: ConversationStore;
  readonly course: CourseLookup;
  /** the AI for the next call (keys and settings are read at call time) */
  ai(): Promise<TutorAi>;
  /** the vendor a new conversation is filed under (the old records say "google" for Gemini) */
  vendor(): { readonly provider: string; readonly model: string };
  persona(): Persona;
  subject(): PromptSubject & { readonly id: string; readonly packVersion: string | null };
  account(): { readonly id: string; readonly kind: string; readonly name: string };
  language(): ReplyLanguage;
  now(): number;
  /** an exercise's text for the tutor (the whole course, not only the filtered part); null: not in the pack */
  exerciseText(id: string): string | null;
  /** an exercise's section */
  sectionOf(exerciseId: string): string | null;
  /** is this part of the pack hidden by the source filter? (then the filter is cleared before it opens) */
  filteredOut(kind: string, id: string): boolean;
  showAll(): void;
  notify(text: string, ms?: number): void;
  touchStreak(): void;
  report(e: unknown, where: string): void;
  /** the records of this subject read before the page started */
  readonly preloaded: readonly StoredConversation[];
}

/** A turn that failed: its words, and what can help (a key, or copying the prompt). */
export interface TurnError {
  readonly text: string;
  readonly needsKey: boolean;
  readonly prompt: string | null;
}

/** "explain this" on one part of the lesson */
export interface ExplainRequest {
  readonly label?: string;
  readonly text?: string;
  readonly sec?: string | { readonly id: string } | null;
  readonly ch?: string | { readonly id: string } | null;
  readonly what?: string;
  readonly bid?: string | null;
}

const idOf = (x: string | { readonly id: string } | null | undefined): string | null =>
  x == null ? null : typeof x === 'string' ? x : x.id;

export class TutorSession {
  open = false;
  mode: ModeId = 'socratic';
  ctx: TutorCtx | null = null;
  busy = false;
  showHistory = false;
  /** the reply as it streams in (visible text), null when no turn is running */
  stream: string | null = null;
  error: TurnError | null = null;
  /** the conversation of each context|mode */
  readonly hist: Record<string, Turn[]> = {};
  tstate: Record<string, ThreadState> = {};
  readonly intents: Record<string, string> = {};
  readonly byKey: Record<string, Conversation> = {};
  list: Conversation[];
  readonly titling = new Set<string>();
  readonly #listeners = new Set<() => void>();

  readonly #d: TutorDeps;
  constructor(d: TutorDeps) {
    this.#d = d;
    this.list = d.preloaded.map(r => fromRecord(r as unknown as ConversationRecord));
  }

  /* ---------- state ---------- */
  subscribe(f: () => void): Unsubscribe {
    this.#listeners.add(f);
    return () => this.#listeners.delete(f);
  }
  changed(): void {
    for (const f of [...this.#listeners]) f();
  }
  /** the conversation key of the context and mode now */
  key(): string {
    return (this.ctx?.id ?? 'course') + '|' + this.mode;
  }
  history(key = this.key()): Turn[] {
    return this.hist[key] ?? [];
  }
  threads(key = this.key()): ThreadState | null {
    return this.tstate[key] ?? null;
  }
  /** the conversation shown now, once it has a message */
  current(): Conversation | null {
    const key = this.key(),
      cv = this.byKey[key];
    return cv && cv.msgs === this.hist[key] && cv.msgs.length ? cv : null;
  }
  /** the instructions of a mode (with the persona's name) — what the AI is told first */
  system(mode: ModeId = this.mode): string {
    return turnSystem({
      mode,
      persona: this.#d.persona(),
      subject: this.#d.subject(),
      intent: null,
      context: '',
      lang: { ...this.#d.language(), rule: '' },
      threads: null,
      directive: null,
    }).trim();
  }
  /** the task of a button by name */
  intent(name: string, given = ''): string {
    return intentText(name, given, this.#d.persona());
  }

  /* ---------- the drawer ---------- */
  openTutor(
    ctx?: TutorCtx | null,
    mode?: string | null,
    firstMessage?: string | null,
    o: { readonly intent?: string | undefined } = {},
  ): void {
    if (ctx !== undefined) this.ctx = ctx;
    if (mode && isMode(mode)) this.mode = mode;
    if (o.intent) this.intents[this.key()] = o.intent;
    this.open = true;
    this.error = null;
    this.changed();
    if (firstMessage) void this.send(firstMessage);
  }
  close(): void {
    this.open = false;
    this.changed();
  }
  setContext(ctx: TutorCtx | null): void {
    this.ctx = ctx;
    if (this.open) this.changed();
  }
  setMode(m: string): void {
    if (!isMode(m)) return;
    this.mode = m;
    this.error = null;
    this.changed();
  }
  /** ↺ a new conversation on the same context and mode */
  fresh(key = this.key()): void {
    this.hist[key] = [];
    Reflect.deleteProperty(this.tstate, key);
    this.showHistory = false;
    this.error = null;
    this.changed();
  }
  toggleHistory(on = !this.showHistory): void {
    this.showHistory = on;
    this.changed();
  }

  /** "Ask <character>" about an exercise — each its own conversation, mode and task: before answering → hints (never the
      answer) · "Help me get it" after a wrong answer → Socratic, from the learner's answer · "Explain differently" → a free,
      in-depth explanation from another angle. */
  askAbout(ex: { readonly id: string; readonly section?: string }, mode: string | null, given: string, exerciseText: string): void {
    const m: ModeId = mode === 'explain' ? 'explain' : mode === 'socratic' ? 'socratic' : 'hint';
    const via = m === 'explain' ? 'explainDifferently' : m === 'socratic' ? 'helpSocratic' : 'askHint';
    const ctx: TutorCtx = {
      kind: 'exercise',
      id: ex.id,
      text: exerciseText,
      origin: { via, ex: ex.id, ...(ex.section ? { sec: ex.section } : {}) },
    };
    this.fresh(ex.id + '|' + m);
    const mine = { answered: given ? 'yes' : 'no', given: given.length > 300 ? given.slice(0, 300) + '…' : given }; // the learner's first message (their bubble, in the UI language)
    const t = this.#d.i18n.t.bind(this.#d.i18n);
    if (m === 'explain') this.openTutor(ctx, 'explain', t('engine.aimsg.exExplain', mine), { intent: this.intent('exExplain', given) });
    else if (m === 'socratic')
      this.openTutor(ctx, 'socratic', t('engine.aimsg.exSocratic', mine), { intent: this.intent('exSocratic', given) });
    else this.openTutor(ctx, 'hint', t('engine.aimsg.exHint'), { intent: this.intent('exHint', given) });
  }
  /** 💡 Explain this: the drawer in Explain mode with that part as the focus and its section and chapter as wider context. */
  explainItem(r: ExplainRequest): void {
    const what = r.what ?? 'part of the lesson'; // i18n-ignore (words of the prompt; the learner's message names it in the UI language)
    const plain = str(r.label ?? r.text ?? '')
      .replace(/[*_`#>[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const short = plain.length > 70 ? plain.slice(0, 68).replace(/\s+\S*$/, '') + '…' : plain;
    let hsh = 0;
    for (const x of str(r.text ?? r.label ?? '')) hsh = (hsh * 31 + x.charCodeAt(0)) >>> 0;
    const sec = idOf(r.sec),
      ch = idOf(r.ch);
    const ctx: TutorCtx = {
      kind: 'item',
      id: 'x' + hsh.toString(36),
      label: short,
      text: r.text ?? r.label ?? '',
      sec,
      ch,
      origin: { via: 'explainThis', what, ...(r.bid ? { bid: r.bid } : {}), ...(sec ? { sec } : {}), ...(ch ? { ch } : {}) },
    };
    this.openTutor(ctx, 'explain', this.#d.i18n.t('engine.aimsg.explainItem', { what: what.replace(/\s+/g, '_'), text: short }), {
      intent: this.intent('item', what),
    });
  }

  /** What the tutor talks about: [icon, chapter number or null, title]. */
  ctxParts(c: TutorCtx | null = this.ctx): [string, number | string | null, string] {
    const t = this.#d.i18n.t.bind(this.#d.i18n),
      course = this.#d.course;
    if (!c) return ['🌍', null, t('engine.tutor.ctxCourse')];
    if (c.kind === 'section') {
      const s = course.section(c.id),
        ch = s ? course.chapter(s.chapter) : null;
      return s ? ['📍', ch?.num ?? null, s.title] : ['📍', null, c.label ?? t('engine.tutor.ctxSection')];
    }
    if (c.kind === 'chapter') {
      const ch = course.chapter(c.id);
      return ch ? ['📍', ch.num, ch.title] : ['📍', null, c.label ?? t('engine.tutor.ctxChapter')];
    }
    if (c.kind === 'playbook') {
      const p = course.playbook(c.id);
      return ['🔧', null, p ? p.title : (c.label ?? t('engine.tutor.ctxDrill'))];
    }
    if (c.kind === 'exercise') return ['🧩', null, t('engine.tutor.ctxExercise')];
    return ['🔎', null, c.label ?? t('engine.tutor.ctxPart')];
  }
  /** the context as a label without its icon ("Ch3 · Title") */
  ctxTitle(c: TutorCtx | null = this.ctx): string {
    const [, num, title] = this.ctxParts(c);
    return num != null ? this.#d.i18n.t('engine.common.chTitle', { num, title }) : title;
  }

  /* ---------- a turn ---------- */
  /** The task of this conversation: given now, set by the button that opened it, or kept in its first message. */
  #intentOf(key: string, given: string | undefined): string | null {
    return given ?? this.intents[key] ?? this.history(key).find(m => m.meta?.intent)?.meta?.intent ?? null;
  }
  #threadState(key: string): ThreadState {
    return (this.tstate[key] ??= newThreadState());
  }
  async send(text: string, o: { readonly directive?: Directive; readonly intent?: string } = {}): Promise<void> {
    if (this.busy) return;
    const key = this.key();
    const hist = (this.hist[key] ??= []);
    const threaded = usesThreads(this.mode);
    const ts = threaded ? this.#threadState(key) : null;
    const directive = ts ? noteLearnerTurn(ts, text, o.directive) : (o.directive ?? null);
    const intent = this.#intentOf(key, o.intent);
    const meta = { ...(directive ? { directive } : {}), ...(intent && !hist.length ? { intent } : {}) };
    hist.push({ role: 'user', text, t: this.#d.now(), ...(Object.keys(meta).length ? { meta } : {}) });
    this.showHistory = false;
    this.error = null;
    this.persist(key);
    this.busy = true;
    this.stream = '';
    this.changed();
    const system = turnSystem({
      mode: this.mode,
      persona: this.#d.persona(),
      subject: this.#d.subject(),
      intent,
      context: contextText(this.ctx, this.#d.course),
      lang: this.#d.language(),
      threads: ts,
      directive,
    });
    let ai: TutorAi | null = null;
    try {
      ai = await this.#d.ai();
      let full = '';
      const r = await ai.chat({
        system,
        messages: hist.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: [{ type: 'text', text: m.text }] })),
        temperature: 0.7,
        onDelta: dl => {
          if (dl.type !== 'text') return;
          full += dl.text;
          this.stream = splitControl(full).clean || '…';
          this.changed();
        },
      });
      if (!r.ok) throw r.error;
      const answer = r.value.text || full;
      const { clean, control } = splitControl(answer);
      const msg: Turn = { role: 'model', text: clean || answer, t: this.#d.now() };
      if (ts) {
        const got: Lesson[] = applyControl(ts, control, hist.length, clean);
        if (control) msg.meta = { noemaState: control };
        if (got.length) this.#d.notify('📌 ' + this.#d.i18n.t('engine.tutor.lessonsLearned', { n: got.length }));
      }
      hist.push(msg);
      this.persist(key);
      this.#maybeTitle(key);
      this.#d.touchStreak();
    } catch (e) {
      hist.pop();
      this.persist(key);
      const ne = e instanceof NoemaError ? e : null;
      const kind = ne ? aiErrorKind(ne) : 'other';
      this.error = {
        text: this.#d.i18n.err(e),
        needsKey: kind === 'no_key' || kind === 'unauthorized' || /key/i.test(str((e as Error | null)?.message ?? '')),
        prompt: ai?.fallbackPrompt?.() ?? null,
      };
    } finally {
      this.busy = false;
      this.stream = null;
      this.changed();
    }
  }

  /* ---------- storage ---------- */
  #ctxRecord(): CtxRecord | null {
    const c = this.ctx;
    if (!c) return null;
    return {
      kind: c.kind,
      id: c.id,
      label: this.ctxTitle(c),
      ...(c.kind === 'item' ? { sec: c.sec ?? null, ch: c.ch ?? null, text: str(c.text ?? '').slice(0, 6000) } : {}),
      ...(c.origin ? { origin: c.origin } : {}),
    };
  }
  /** keeps a context's conversation (a new record for its first message) */
  persist(key: string): void {
    const hist = this.hist[key];
    if (!hist?.length) return;
    let cv = this.byKey[key];
    const v = this.#d.vendor(),
      now = this.#d.now();
    if (!cv || cv.msgs !== hist) {
      cv = {
        id: this.#d.store.newId(now),
        kind: 'tutor',
        created: now,
        updated: now,
        mode: this.mode,
        ctx: this.#ctxRecord(),
        model: v.model,
        provider: v.provider,
        title: null,
        titledLen: 0,
        msgs: hist,
      };
      this.byKey[key] = cv;
      this.list.push(cv);
    }
    cv.updated = now;
    cv.model = v.model || cv.model;
    cv.provider = v.provider;
    const ts = this.tstate[key];
    if (ts) cv.tutorState = ts;
    this.save(cv);
  }
  /** saves one conversation now (in the background: never blocks the screen) */
  save(cv: Conversation): void {
    if (!cv.msgs.length) return;
    const a = this.#d.account(),
      s = this.#d.subject();
    const rec = {
      ...toRecord(cv, id => this.#d.sectionOf(id)),
      account: { id: a.id, kind: a.kind },
      subject: { id: s.id, title: s.title, packVersion: s.packVersion },
    } as unknown as StoredConversation;
    this.#d.store.put(a.id, rec).catch((e: unknown) => {
      this.#d.report(e, 'tutor.save');
    });
  }
  /** a one-shot AI interaction (grading, code review, a generated question, drill grading) kept as a conversation */
  logAI(
    kind: string,
    o: { readonly ctx?: CtxRecord | null; readonly title?: string | null; readonly prompt: string; readonly response: string },
  ): Conversation {
    const t = this.#d.now(),
      v = this.#d.vendor();
    const cv: Conversation = {
      id: this.#d.store.newId(t),
      kind,
      mode: null,
      created: t,
      updated: t,
      ctx: o.ctx ?? null,
      model: v.model,
      provider: v.provider,
      title: o.title ?? null,
      titleSource: o.title ? 'system' : 'none',
      titledLen: USER_TITLED,
      msgs: [
        { role: 'user', text: o.prompt, t },
        { role: 'model', text: o.response, t: this.#d.now() },
      ],
    };
    this.list.push(cv);
    this.save(cv);
    return cv;
  }

  /* ---------- titles ---------- */
  displayTitle(cv: Conversation): string {
    return displayTitle(cv, this.#d.subject().title, this.#d.i18n);
  }
  #maybeTitle(key: string): void {
    const cv = this.byKey[key];
    if (cv && wantsTitle(cv)) void this.nameIt(cv);
  }
  /** asks the AI for a succinct, canonical title (the fallback title stays when it cannot) */
  async nameIt(cv: Conversation): Promise<string | null> {
    if (this.titling.has(cv.id)) return cv.title;
    this.titling.add(cv.id);
    this.changed();
    try {
      const ai = await this.#d.ai();
      const prompt = titlePrompt({
        persona: this.#d.persona(),
        mode: cv.mode,
        context: cv.ctx?.label ?? null,
        transcript: cv.msgs,
        lang: this.#d.language(),
        courseLang: this.#d.subject().language,
      });
      const r = await ai.chat({ messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], temperature: 0.2 });
      const t = r.ok ? cleanTitle(r.value.text) : '';
      if (t && t.split(' ').length <= 14) {
        cv.title = t;
        cv.titleSource = 'ai';
        cv.titledLen = cv.msgs.length;
        this.save(cv);
      }
    } catch (e) {
      this.#d.report(e, 'tutor.title'); // keep the fallback title
    } finally {
      this.titling.delete(cv.id);
      this.changed();
    }
    return cv.title;
  }

  /* ---------- the history ---------- */
  /** the conversations of this subject with messages (tutor chats; with all: the one-shot records too), newest first */
  conversations(all = false): Conversation[] {
    return this.list.filter(c => c.msgs.length && (all || isTutor(c.kind))).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }
  /** opens a stored conversation in the drawer (its part of the course, its mode and its thread state) */
  openConversation(cv: Conversation): void {
    let ctx: TutorCtx | null = null;
    const r = cv.ctx;
    if (r) {
      if (this.#d.filteredOut(r.kind, r.id)) this.#d.showAll(); // its source is filtered out → show everything again
      if (r.kind === 'exercise') {
        const text = this.#d.exerciseText(r.id);
        ctx = text != null ? { kind: 'exercise', id: r.id, text } : null;
      } else
        ctx = {
          kind: r.kind,
          id: r.id,
          ...(r.label ? { label: r.label } : {}),
          ...(r.kind === 'item' ? { sec: r.sec ?? null, ch: r.ch ?? null, text: r.text ?? r.label ?? '' } : {}),
        };
    }
    this.ctx = ctx;
    // another app's mode (e.g. Meletee's feynman) continues as a plain explanation; the record keeps its mode
    this.mode = isMode(cv.mode) ? cv.mode : !isTutor(cv.kind) || cv.mode ? 'explain' : 'socratic';
    const key = this.key();
    this.hist[key] = cv.msgs;
    this.byKey[key] = cv;
    if (cv.tutorState) this.tstate[key] = cv.tutorState;
    else if (this.mode === 'socratic' && cv.msgs.some(m => m.meta?.noemaState))
      this.tstate[key] = cv.tutorState = rebuildThreadState(cv.msgs);
    else Reflect.deleteProperty(this.tstate, key);
    this.showHistory = false;
    this.error = null;
    this.changed();
  }
  /** continue a conversation by its id (the frame's window, the search) → false when this subject does not have it */
  resume(id: string): boolean {
    const cv = this.list.find(c => c.id === id);
    if (!cv) return false;
    this.openTutor();
    this.openConversation(cv);
    return true;
  }
  /** a conversation renamed (patch) or deleted (null) elsewhere: keep this subject's copy in step */
  changedElsewhere(id: string, patch: { readonly title?: string } | null): void {
    const cv = this.list.find(c => c.id === id);
    if (!cv) return;
    if (patch) {
      if (patch.title) {
        cv.title = patch.title;
        cv.titleSource = 'user';
        cv.titledLen = USER_TITLED;
      }
    } else this.#drop(cv);
    this.changed();
  }
  rename(cv: Conversation, title: string): void {
    const v = cleanTitle(title);
    if (v) {
      cv.title = v;
      cv.titleSource = 'user';
      cv.titledLen = USER_TITLED;
      this.save(cv);
    }
    this.changed();
  }
  remove(cv: Conversation): void {
    this.#drop(cv);
    this.#d.store.remove(this.#d.account().id, cv.id).catch((e: unknown) => {
      this.#d.report(e, 'tutor.remove');
    });
    this.changed();
  }
  #drop(cv: Conversation): void {
    this.list = this.list.filter(x => x !== cv);
    for (const k of Object.keys(this.byKey))
      if (this.byKey[k] === cv) {
        Reflect.deleteProperty(this.byKey, k);
        Reflect.deleteProperty(this.hist, k);
      }
  }

  /* ---------- export ---------- */
  #exportInfo(
    x: { readonly tutorName: string; readonly tutorAvatar: string; readonly source: string },
    cv?: Conversation,
  ): Parameters<typeof convoMarkdown>[1] {
    const i18n = this.#d.i18n;
    return {
      i18n,
      subjectTitle: this.#d.subject().title,
      tutorName: x.tutorName,
      tutorAvatar: x.tutorAvatar,
      profile: this.#d.account().name,
      source: (cv && otherApp(cv)) ?? x.source,
      modeName: m => modeName(m, i18n),
    };
  }
  /** one conversation as a Markdown file (named first when its title is missing or old) → null: nothing to export */
  async exportOne(
    cv: Conversation | null,
    x: { readonly tutorName: string; readonly tutorAvatar: string; readonly source: string },
  ): Promise<{ name: string; text: string } | null> {
    if (!cv?.msgs.length) return null;
    if (!cv.title || cv.msgs.length - (cv.titledLen || 0) >= 2) {
      this.#d.notify('✨ ' + this.#d.i18n.t('engine.cv.naming'), 1500);
      await this.nameIt(cv);
    }
    const title = this.displayTitle(cv);
    return {
      name: `${fmtDate(cv.created, false)}_${slug((cv.mode && MODE_NAME_EN[cv.mode]) ?? (cv.kind || 'conversation'))}_${slug(title)}.md`,
      text: convoMarkdown(cv, this.#exportInfo(x, cv)),
    };
  }
  /** every conversation of this subject in one Markdown file */
  exportAll(x: {
    readonly tutorName: string;
    readonly tutorAvatar: string;
    readonly source: string;
    readonly appTitle: string;
  }): { name: string; text: string } | null {
    const list = this.list.filter(c => c.msgs.length).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!list.length) return null;
    const t = this.#d.i18n.t.bind(this.#d.i18n);
    const head = [
      '# ' + t('engine.cv.md.allTitle', { app: x.appTitle }),
      '',
      t('engine.cv.md.exportedOn', { date: fmtDate(this.#d.now()), n: list.length }),
      '',
      '## ' + t('engine.cv.md.contents'),
      '',
      ...list.map((c, i) => `${str(i + 1)}. ${this.displayTitle(c)} — *${modeName(c.mode, this.#d.i18n)}, ${fmtDate(c.created, false)}*`),
      '',
      '---',
      '',
    ];
    return {
      name: `${fmtDate(this.#d.now(), false)}_${slug(x.appTitle)}_all-tutor-conversations.md`, // i18n-ignore
      text: head.join('\n') + list.map(c => convoMarkdown(c, this.#exportInfo(x, c), 2)).join('\n\n---\n\n'),
    };
  }
}
