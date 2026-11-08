/**
 * The ports of area 5's screens over what the page has today: window.NoemaCore (build/app.js — the engine library, the
 * engine requests, the notifier, the i18n runtime) and the context the older page hands over (the profile, the subject,
 * which runtimes it mounts). One small adapter per screen: when the bridge goes, each takes the container's tokens instead
 * and the screens do not change.
 */
import type { CoursesService } from '../features/languages/application/courses.ts';
import type { EngineEntry, EngineRequestRow, EnginesPort, RequestStore } from '../ui/screens/activities/engines-port.ts';
import type { LanguagesPort } from '../ui/screens/languages/languages-port.ts';
import type { ScreenContext } from './screens-bridge.ts';

/** What the adapters use of window.NoemaCore (the bridge's own surface: src/composition/bridge.ts, community.ts). */
export interface CoreForScreens {
  readonly engines?: {
    readonly catalog: {
      readonly CATALOG: readonly (EngineEntry & { readonly runtime?: string | boolean })[];
      byId(id: string): (EngineEntry & { readonly runtime?: string | boolean }) | null;
      suggest(text: string): readonly { readonly id: string }[];
    };
  };
  readonly engineRequests?: {
    readonly FIELDS: Readonly<Record<string, { readonly min?: number; readonly max: number }>>;
    readonly ACCURACY: readonly string[];
    readonly STATUSES: readonly string[];
    normalize(input: unknown): { readonly row: unknown; readonly problems: readonly { readonly field: string; readonly code: string }[] };
    cleanPatch(p: unknown): { readonly error: string } | Readonly<Record<string, unknown>>;
    brief(r: unknown): string;
    store(account: { readonly id?: string | null; readonly kind?: string } | null): {
      readonly kind: string;
      isAdmin(): Promise<boolean>;
      mine(): Promise<readonly EngineRequestRow[]>;
      all(scope: 'all'): Promise<readonly EngineRequestRow[]>;
      submit(row: unknown): Promise<unknown>;
      update(id: string, patch: unknown): Promise<unknown>;
    };
  };
  readonly notify: { toast(text: string, o?: { readonly ms?: number }): void };
  /** the language courses of this device (src/composition/languages.ts) */
  readonly languages?: CoursesService;
  readonly i18n: { err(e: unknown): string; locale(): string };
}

/** Saves a text file through the browser (an <a download> of a Blob URL). */
export function downloadText(doc: Document, name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(doc.createElement('a'), { href: url, download: name });
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

/** The engines page's port (#/engines). */
export function enginesPort(core: CoreForScreens, ctx: ScreenContext, doc: Document): EnginesPort {
  const K = core.engines?.catalog,
    R = core.engineRequests;
  const runs = (e: EngineEntry & { readonly runtime?: string | boolean }): boolean =>
    ctx.runs ? ctx.runs(e.id, e.runtime ? (typeof e.runtime === 'string' ? e.runtime : e.id) : null) : true;
  let store: RequestStore | null = null;
  return {
    available: () => !!K && !!R,
    engines: () => (K ? K.CATALOG.filter(runs) : []),
    suggest: text =>
      K
        ? K.suggest(text)
            .map(s => K.byId(s.id))
            .filter((e): e is NonNullable<typeof e> => !!e && runs(e))
        : [],
    store: () => {
      if (!R) throw new Error('no engine requests in this build');
      if (store) return store;
      const s = R.store(ctx.account);
      store = {
        kind: s.kind,
        isAdmin: () => s.isAdmin(),
        mine: () => s.mine(),
        all: () => s.all('all'),
        submit: r => s.submit(r),
        update: (id, p) => s.update(id, p),
      };
      return store;
    },
    statuses: R?.STATUSES ?? [],
    accuracy: R?.ACCURACY ?? [],
    fields: R?.FIELDS ?? {},
    normalize: input =>
      R
        ? R.normalize({ ...input, subject: ctx.subject ?? undefined, via: 'app', locale: core.i18n.locale() })
        : { row: null, problems: [] },
    cleanPatch: p => (R ? R.cleanPatch(p) : { error: 'unavailable' }),
    brief: r => (R ? R.brief(r) : ''),
    toast: (text, ms) => {
      core.notify.toast(text, ms ? { ms } : {});
    },
    errorText: e => core.i18n.err(e),
    copy: async text => {
      try {
        await doc.defaultView?.navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false; // the browser refuses the clipboard (no permission, not a secure page): the caller offers a file
      }
    },
    download: (name, text, type) => {
      downloadText(doc, name, text, type);
    },
  };
}

/** What the Languages tab's adapter uses of the page besides NoemaCore.languages: the open course's state, the locale. */
export interface LangPage {
  readonly NoemaLangUI?: {
    readonly UI?: { id?: string | null; lang?: string; prefs?: Record<string, unknown>; C?: { lang?: Record<string, unknown> } };
  };
  readonly NoemaI18n?: { readonly locale?: string };
}

/** The Languages tab's port (#/lang) and the chooser's. */
export function languagesPort(svc: CoursesService, ctx: ScreenContext, win: Window & LangPage): LanguagesPort {
  const acc = ctx.account?.id ?? '';
  const go = (hash: string): void => {
    if (ctx.go) ctx.go(hash);
    else win.location.hash = hash;
  };
  const courseHash = (id: string): string => '#/lang/' + encodeURIComponent(id);
  return {
    courses: () => {
      const last = svc.last(acc);
      return svc.courses(acc).map(m => {
        const p = svc.progress(acc, m);
        const n = p.sum?.next;
        return {
          courseId: m.courseId,
          title: m.title,
          languages: m.languages,
          studied: p.langs,
          account: m.account,
          studies: svc.studiesAny(acc, m),
          last: m.courseId === last,
          words: p.words,
          total: p.total,
          due: p.due,
          started: p.started,
          pct: p.pct,
          next: n ? { title: n.title, ...(n.step ? { step: n.step } : {}) } : null,
        };
      });
    },
    study: () => svc.study(acc),
    offered: () => {
      const all = svc.courses(acc);
      return svc.offered(acc).map(o => ({
        code: o.code,
        courses: o.courses,
        titles: o.courses.map(id => all.find(m => m.courseId === id)?.title ?? id),
      }));
    },
    courseLanguages: id => svc.course(acc, id)?.languages ?? [],
    setStudy: codes => {
      svc.setStudy(acc, codes);
    },
    locale: () => win.NoemaI18n?.locale ?? 'en',
    openCourse: id => {
      go(courseHash(id));
    },
    openLanguage: code => {
      const m = svc.courseFor(acc, code);
      if (!m) return;
      const UI = win.NoemaLangUI?.UI; // the course is open on this page: it shows that language at once
      if (UI?.id === m.courseId && UI.C?.lang?.[code]) {
        UI.lang = code;
        if (UI.prefs) UI.prefs['lang'] = code;
      } else svc.setCourseLang(acc, m.courseId, code);
      go(courseHash(code));
    },
    createCourse: () => {
      ctx.createCourse?.();
    },
    courseHref: (id, page) => courseHash(id) + (page ? '/' + page : ''),
  };
}
