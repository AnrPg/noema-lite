/**
 * The ports of area 5's screens over what the page has today: window.NoemaCore (build/app.js — the language courses of
 * the device) and the context the older page hands over (the profile, the open course, the frame's navigation). One small adapter per screen: when the bridge goes, each takes the container's tokens instead
 * and the screens do not change.
 */
import type { CoursesService } from '../features/languages/application/courses.ts';
import type { LanguagesPort } from '../ui/screens/languages/languages-port.ts';
import type { ScreenContext } from './screens-bridge.ts';

/** What the adapters use of window.NoemaCore (the bridge's own surface: src/composition/bridge.ts). */
export interface CoreForScreens {
  /** the language courses of this device (src/composition/languages.ts) */
  readonly languages?: CoursesService;
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
