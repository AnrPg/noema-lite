/**
 * The tutor of the open subject (in build/study.js, the lazy piece of the study area: the tutor is only ever used with a
 * subject open): the session over the ports — the AI (the Gemini key in ⚙️ Settings, else a Claude key on this device,
 * else the copy fallback), the conversation store (engine/convos.js) and the I18n port — the drawer's screens
 * (src/features/tutor/ui), and the two ports the study area sees (TutorPort, AiPort: src/features/study/ui/parts.ts).
 *
 *   NoemaCore.studyUi.tutor(pageHost) → { session, jobs, port, ai, md, gemini, chatLangs, chatLangIs, resumeAsked, … }
 *       the engine page (engine/src/40_views.js tutorHost()) hands in the open subject: its course, persona, settings
 *   NoemaTutor.current()   the mounted tutor (src/composition/ui.ts; the browser suites look in through it)
 */
import { claudeAI } from '../adapters/claude/index.ts';
import { pageConversationStore } from '../adapters/browser/conversations.ts';
import { GEMINI_DEFAULT_MODEL, geminiAI } from '../adapters/gemini/index.ts';
import { copyPromptAI } from '../adapters/local/copy-prompt.ts';
import type { AI, ChatRequest, ChatResponse } from '../ports/ai.ts';
import type { StoredConversation } from '../ports/conversations.ts';
import type { I18n } from '../ports/i18n.ts';
import type { AsyncResult } from '../kernel/result.ts';
import { TutorJobs } from '../features/tutor/application/jobs.ts';
import { TutorSession, type TutorAi } from '../features/tutor/application/tutor.ts';
import type { Conversation } from '../features/tutor/domain/conversation.ts';
import type { CourseLookup, Persona, ReplyLanguage } from '../features/tutor/domain/prompts.ts';
import { defineTutorUi, explainable, type NoemaTutorPanel, type TutorView } from '../features/tutor/ui/index.ts';
import type { Chapter, Drill, Exercise, Section } from '../features/study/domain/pack.ts';
import type { AiPort, TutorContext, TutorPort } from '../features/study/ui/parts.ts';
import { fmt as inlineMd } from '../features/study/ui/text.ts';
import { OPEN_CONVO, W, copyText, download, mdElement, type ShellApi } from './tutor-page.ts';

/** S.settings of the open subject's page: the Gemini key and model, the 🗣 choice */
export interface TutorSettings {
  apiKey?: string;
  model?: string;
  models?: string[];
  chatLang?: string;
}
/** What the engine page hands in (engine/src/40_views.js tutorHost()). */
export interface TutorPageHost {
  readonly account: { readonly id: string; readonly name: string; readonly kind: string };
  subject(): {
    readonly id: string;
    readonly title: string;
    readonly language: string;
    readonly math: boolean;
    readonly code: boolean;
    readonly packVersion: string | null;
  };
  /** the tutor's persona (subject.json "tutor", with the character's name), read at each call */
  persona(): Persona;
  /** the learner profile of the prompts */
  learner(): string;
  readonly course: CourseLookup;
  /** an exercise's text for the tutor (the whole pack; null: not in it), and that of an exercise object */
  exerciseText(id: string): string | null;
  exerciseTextOf(ex: Exercise): string;
  sectionOf(exerciseId: string): string | null;
  filteredOut(kind: string, id: string): boolean;
  showAll(): void;
  readonly preloaded: readonly StoredConversation[];
  settings(): TutorSettings;
  save(): void;
  toast(text: string, ms?: number): void;
  touchStreak(): void;
  openSettings(): void;
  openGuide(): void;
  /** the drawer (aside.drawer) and its scrim, once the page has drawn them */
  drawer(): HTMLElement | null;
  scrim(): HTMLElement | null;
  /** the character's face (SVG markup) and its names */
  face(): string;
  tutor(): { readonly name: string; readonly avatar: string; readonly plural: boolean };
  uiLang(): string;
  readonly appTitle: string;
  readonly appName: string;
}

export interface TutorUi {
  readonly session: TutorSession;
  readonly jobs: TutorJobs;
  readonly port: TutorPort;
  readonly ai: AiPort;
  readonly subjectId: string;
  md(text: string): HTMLElement;
  /** ⚙️ Settings › Gemini: the models the key can use (saved in the settings), a test call, the models offered without a key */
  readonly gemini: { detect(): Promise<string[]>; test(prompt: string): Promise<string>; readonly fallbackModels: readonly string[] };
  chatLangs(): readonly (readonly [string, string])[];
  chatLangIs(v: string): boolean;
  /** continue the conversation the frame's window asked for (sessionStorage noema-device:openConvo) */
  resumeAsked(): void;
  changed(id: string, patch: { readonly title?: string } | null): void;
  /** ⬇️ a conversation as a Markdown file (named first when it has grown), and every conversation of the subject in one */
  exportOne(cv: Conversation | null): void;
  exportAll(): void;
  /** the character changed: draw the drawer again */
  refresh(): void;
  close(): void;
  open(): void;
}

const FALLBACK_MODELS = [GEMINI_DEFAULT_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'];

/** mount the tutor of the open subject (once per page: a page holds one subject) */
export function mountTutor(host: TutorPageHost, i18n: I18n): TutorUi {
  defineTutorUi();
  const store = pageConversationStore(() => W().NoemaConvos);
  // fetch is read at each call, so a test's routes and a later polyfill apply
  const fetchOf = (u: string, init: RequestInit): Promise<Response> => fetch(u, init);
  const settings = (): TutorSettings => host.settings();
  const acc = host.account.id;
  const gem = (): AI => geminiAI({ apiKey: settings().apiKey ?? '', fetch: fetchOf, maxRetries: 1 }); // one try, as before: the learner sees a busy or offline answer at once
  /** the Gemini models of the key, best first: kept in the settings with the chosen one */
  async function detect(): Promise<string[]> {
    const r = await gem().models();
    if (!r.ok) throw r.error;
    const ms = r.value.map(m => m.id),
      s = settings();
    s.models = ms;
    if (!s.model || !ms.includes(s.model)) s.model = ms[0] ?? FALLBACK_MODELS[0] ?? GEMINI_DEFAULT_MODEL;
    host.save();
    return ms;
  }
  async function ensureModel(): Promise<string> {
    const s = settings();
    if (s.model) return s.model;
    try {
      await detect();
    } catch {
      s.model = FALLBACK_MODELS[0] ?? GEMINI_DEFAULT_MODEL; // offline or a bad key: the call itself says why
    }
    return s.model ?? GEMINI_DEFAULT_MODEL;
  }
  /** a Gemini call; a model that is gone (404) is replaced by the best one the key still has */
  async function gemChat(r: ChatRequest): AsyncResult<ChatResponse> {
    const model = await ensureModel();
    const res = await gem().chat({ ...r, model });
    if (res.ok || res.error.status !== 404) return res;
    const s = settings();
    try {
      await detect();
    } catch {
      s.model = FALLBACK_MODELS.find(m => m !== model) ?? model;
    }
    return s.model && s.model !== model ? gem().chat({ ...r, model: s.model }) : res;
  }
  const claudeKey = (): string => W().NoemaClaude?.Key.get(acc) ?? '';
  const claudeModel = (): string => W().Noema?.jget<string | null>(`noema1:${acc}:a:claudeModel`, null) ?? '';
  const copy = copyPromptAI();
  async function ai(): Promise<TutorAi> {
    if (settings().apiKey) {
      const model = await ensureModel();
      return { provider: 'gemini', model, chat: gemChat };
    }
    const key = claudeKey();
    if (key) {
      const m = claudeModel();
      const c = claudeAI({ apiKey: key, fetch: fetchOf, ...(m ? { defaultModel: m } : {}) });
      return { provider: 'claude', model: m, chat: r => c.chat(r) };
    }
    return { provider: 'copy', model: '', chat: r => copy.chat(r), fallbackPrompt: () => copy.prompt() };
  }
  const vendor = (): { provider: string; model: string } =>
    settings().apiKey
      ? { provider: 'google', model: settings().model ?? '' }
      : claudeKey()
        ? { provider: 'claude', model: claudeModel() }
        : { provider: 'google', model: '' };
  const courseLang = (): string => host.subject().language || 'en';
  const chatLang = (): string => settings().chatLang ?? '';
  function language(): ReplyLanguage {
    const L = W().NoemaLLM;
    const ui = host.uiLang();
    const r = L?.replyLang
      ? L.replyLang(null, chatLang(), ui)
      : { code: chatLang() || 'en', auto: !chatLang(), name: chatLang() || 'English', address: '' };
    return {
      code: r.code,
      name: r.name,
      rule: L?.chatRule ? L.chatRule(r, courseLang()) : '',
      fields: what => (L?.fieldsRule ? L.fieldsRule(r, courseLang(), what) : ''),
    };
  }
  /** 🗣 automatic, the course's language, every UI language by its endonym, and an older choice that is none of them */
  function chatLangs(): [string, string][] {
    const locales = W().NoemaI18n?.LOCALES ?? [{ tag: 'en', name: 'English' }];
    const endo = (c: string): string => {
      const L = locales.find(l => l.tag === c);
      if (L) return L.name;
      try {
        const n = new Intl.DisplayNames([c], { type: 'language' }).of(c) ?? c;
        return n.charAt(0).toLocaleUpperCase(c) + n.slice(1);
      } catch {
        return c;
      }
    };
    const base = (c: string): string => (c.split('-')[0] ?? c).toLowerCase();
    const cl = courseLang();
    const out: [string, string][] = [
      ['', i18n.t('engine.tutor.chatLangAuto')],
      [cl, i18n.t('engine.tutor.chatLangCourse', { lang: endo(cl) })],
    ];
    for (const L of locales) if (!L.pseudo && L.tag !== cl) out.push([L.tag, L.name]);
    const cur = chatLang();
    if (cur && !out.some(([v]) => v === cur) && !out.some(([v]) => v && base(v) === base(cur))) out.push([cur, endo(cur)]);
    return out;
  }
  /** is a choice the current one? (an older 'es' / 'pt' / 'zh' / 'ar' matches its UI locale es-ES / pt-PT / zh-Hans / ar-EG) */
  function chatLangIs(v: string): boolean {
    const cur = chatLang();
    if (v === cur) return true;
    if (!v || !cur) return false;
    const ch = chatLangs();
    if (ch.some(([x]) => x === cur)) return false;
    const b = (c: string): string => (c.split('-')[0] ?? c).toLowerCase();
    return ch.find(([x]) => x && b(x) === b(cur))?.[0] === v;
  }
  const session = new TutorSession({
    i18n,
    store,
    course: host.course,
    ai,
    vendor,
    persona: () => host.persona(),
    subject: () => {
      const s = host.subject();
      return {
        id: s.id,
        title: s.title,
        language: s.language || 'en',
        math: s.math,
        code: s.code,
        learner: host.learner(),
        packVersion: s.packVersion,
      };
    },
    account: () => host.account,
    language,
    now: () => Date.now(),
    exerciseText: id => host.exerciseText(id),
    sectionOf: id => host.sectionOf(id),
    filteredOut: (k, id) => host.filteredOut(k, id),
    showAll: () => {
      host.showAll();
    },
    notify: (t, ms) => {
      host.toast(t, ms);
    },
    touchStreak: () => {
      host.touchStreak();
    },
    report: (e, where) => {
      W().NoemaCore?.errors.report(e, { where: 'tutor.' + where, severity: 'warning' });
    },
    preloaded: host.preloaded,
  });
  const jobs = new TutorJobs({ i18n, ai, persona: () => host.persona(), language }, session);
  const md = (t: string): HTMLElement =>
    mdElement(t, i18n, x => {
      host.toast(x);
    });
  const shell = (): ShellApi | undefined => W().NoemaShell;
  const exportInfo = () => ({
    tutorName: host.tutor().name,
    tutorAvatar: host.tutor().avatar,
    source: `${host.appTitle} (${host.appName})`,
  });
  const view: TutorView = {
    session,
    i18n,
    L: (k, p) => shell()?.L(k, p) ?? k,
    face: () => host.face(),
    tutor: () => host.tutor(),
    accountName: () => host.account.name,
    uiLang: () => host.uiLang(),
    md,
    fmt: t => inlineMd(t),
    menuButton: (items, label) => shell()?.menuButton(items, { label }) ?? document.createElement('span'),
    popMenu: (a, items) => shell()?.popMenu(a, items),
    closePops: () => shell()?.closePops(),
    chatLangs,
    chatLangIs,
    chatLang,
    setChatLang: v => {
      settings().chatLang = v;
      host.save();
      session.changed();
    },
    openSettings: () => {
      host.openSettings();
    },
    openGuide: () => {
      host.openGuide();
    },
    history: () => shell()?.convos?.(),
    exportOne: cv => {
      void session.exportOne(cv, exportInfo()).then(f => {
        if (!f) {
          host.toast(i18n.t('engine.cv.nothingToExport'));
          return;
        }
        download(f.name, f.text);
        host.toast('⬇️ ' + i18n.t('engine.cv.exported', { title: session.displayTitle(cv as Conversation) }));
      });
    },
    exportAll: () => {
      const f = session.exportAll({ ...exportInfo(), appTitle: host.appTitle });
      if (f) download(f.name, f.text);
      else host.toast(i18n.t('engine.cv.none'));
    },
    copy: copyText,
    toast: (t, ms) => {
      host.toast(t, ms);
    },
  };

  /* the drawer follows the session: open / closed, the panel drawn in it */
  let panel: NoemaTutorPanel | null = null,
    wasOpen = false;
  function follow(): void {
    const d = host.drawer(),
      sc = host.scrim();
    if (!d) return;
    if (!panel && session.open) {
      panel = document.createElement('noema-tutor-panel') as NoemaTutorPanel;
      panel.view = view;
      d.replaceChildren(panel);
    }
    d.classList.toggle('open', session.open);
    sc?.classList.toggle('on', session.open);
    if (session.open && !wasOpen && !session.busy) setTimeout(() => panel?.focusComposer(), 350);
    wasOpen = session.open;
  }
  session.subscribe(follow);

  /** a page section carries its chapter (the engine adds _ch to every section of the pack) */
  type PageSection = Section & { readonly _ch?: Chapter & { readonly num?: number; readonly exercises?: readonly Exercise[] } };
  const chLabel = (sec: PageSection): string => i18n.t('engine.common.chTitle', { num: sec._ch?.num ?? '', title: sec.title });
  const port: TutorPort = {
    open: (ctx, mode, first, o) => {
      session.openTutor(ctx, mode ?? null, first ?? null, { intent: o?.intent });
    },
    close: () => {
      session.close();
    },
    setContext: (ctx: TutorContext | null) => {
      session.setContext(ctx);
    },
    askAbout: (ex, mode, given) => {
      session.askAbout(ex, mode, given ?? '', host.exerciseTextOf(ex));
    },
    explainable: (el, what) =>
      explainable(el, () => what(), {
        title: i18n.t('engine.tutor.explainThis'),
        aria: i18n.t('engine.tutor.explainThisAria'),
        explain: r => {
          session.explainItem(r);
        },
      }),
    intent: (name, given) => session.intent(name, given ?? ''),
  };
  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  const aiPort: AiPort = {
    grade: (ex: Exercise, answer: string) => {
      const sec = host.course.section(ex.section);
      const s = ex as Exercise & { solution?: string; model?: string; rubric?: string[]; code?: string };
      return jobs.grade(
        {
          id: ex.id,
          type: ex.type,
          q: ex.q ?? '',
          ...(s.code ? { code: s.code } : {}),
          ...(s.solution ? { solution: s.solution } : {}),
          ...(s.model ? { model: s.model } : {}),
          ...(s.rubric ? { rubric: s.rubric } : {}),
        },
        answer,
        {
          notes: sec?.text ?? '',
          label: sec ? i18n.t('engine.common.chTitle', { num: host.course.chapter(sec.chapter)?.num ?? '', title: sec.title }) : null,
        },
      );
    },
    question: async (s0: Section) => {
      const sec = s0 as PageSection,
        ch = sec._ch;
      const seen = shuffle((ch?.exercises ?? []).filter(e => e.section === sec.id))
        .slice(0, 6)
        .map(e => e.q ?? '');
      const r = await jobs.question({
        id: sec.id,
        title: sec.title,
        notes: host.course.section(sec.id)?.text ?? '',
        label: chLabel(sec),
        seen,
      });
      return {
        id: 'ai-' + String(Date.now()),
        type: 'mcq',
        section: sec.id,
        difficulty: 2,
        tags: ['concept'],
        q: r.q,
        ...(r.code ? { code: r.code } : {}),
        options: r.options,
        answer: r.answer,
        why: r.why,
        explain: r.explain,
        _ch: sec._ch,
        _ai: true,
      };
    },
    drillGrade: (d: Drill, answer: string) =>
      jobs.drillGrade({ id: d.id, title: d.title, symptom: d.symptom, askYourself: d.askYourself }, answer),
    md,
  };
  const ui: TutorUi = {
    session,
    jobs,
    port,
    ai: aiPort,
    subjectId: host.subject().id,
    md,
    gemini: {
      detect,
      test: async prompt => {
        const r = await gemChat({ messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], temperature: 0 });
        if (!r.ok) throw r.error;
        return r.value.text;
      },
      fallbackModels: FALLBACK_MODELS,
    },
    chatLangs,
    chatLangIs,
    resumeAsked: () => {
      type Asked = { acc?: string; sid?: string; id?: string } | null;
      let f: Asked = null;
      try {
        f = JSON.parse(sessionStorage.getItem(OPEN_CONVO) ?? 'null') as Asked;
        sessionStorage.removeItem(OPEN_CONVO);
      } catch {
        f = null; // no sessionStorage here: nothing was asked
      }
      if (!f || f.acc !== acc || f.sid !== host.subject().id || !f.id) return;
      session.resume(f.id);
    },
    changed: (id, patch) => {
      session.changedElsewhere(id, patch);
    },
    exportOne: cv => {
      if (cv) view.exportOne(cv);
      else host.toast(i18n.t('engine.cv.nothingToExport'));
    },
    exportAll: () => {
      view.exportAll();
    },
    refresh: () => {
      session.changed();
    },
    close: () => {
      session.close();
    },
    open: () => {
      session.openTutor();
    },
  };
  return ui;
}
