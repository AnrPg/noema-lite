/**
 * THE ROUTES OF AREA 5 — languages and activities (the one file that lists them): the addresses, the screen each one
 * mounts in the frame's <main>, and what the frame shows around it (crumbs, back, the tab). The root that owns the router
 * (src/composition/ui-root.ts, or the older shell through NoemaCore.screens while it still runs) matches an address with
 * AREA5_ROUTES and calls mountArea5() with the ports of the screens.
 *
 *   #/lang                       the Languages tab (languages/languages-page.ts, D21)
 *   #/lang/<code>                the home of one language (languages/lang-home.ts, D29)
 *   #/engines, #/engines/new     the engines of activities and the requests for new ones (activities/engines-page.ts)
 *
 * Parts that are not pages (mountArea5Part):
 *   lang-strip      the strip of the learner's languages on every language page (languages/lang-strip.ts)
 *   study-chooser   "Which languages do you want to study?" (languages/study-chooser.ts); options { course, none, onDone }
 *   lang-courses    the courses as rows (Choose another course); options { onPick }
 *   lang-today      Today's card of a course (languages/lang-today.ts); options { course }
 */
import { defineRoutes, type RouteMatch } from '../router/routes.ts';
import type { EnginesPort } from './activities/engines-port.ts';
import { NoemaEngineRequestForm, NoemaEnginesPage } from './activities/engines-page.ts';
import type { CoursePort } from './languages/course-port.ts';
import { NoemaLangHome } from './languages/lang-home.ts';
import { NoemaLangStrip } from './languages/lang-strip.ts';
import { NoemaLangToday } from './languages/lang-today.ts';
import { NoemaLangCourses, NoemaLanguagesPage } from './languages/languages-page.ts';
import type { LanguagesPort } from './languages/languages-port.ts';
import { NoemaStudyChooser } from './languages/study-chooser.ts';

export const AREA5_ROUTES = defineRoutes({
  languages: '/lang',
  language: '/lang/:code',
  engines: '/engines/:sub?',
});
export type Area5Routes = typeof AREA5_ROUTES.table;
export type Area5Match = RouteMatch<Area5Routes>;

/** The ports of area 5's screens; the root makes the one a screen needs when it mounts it. */
export interface Area5Ports {
  engines(): EnginesPort;
  /** the open language course (null when none is open: a course page then has nothing to show) */
  course(): CoursePort | null;
  /** the language courses of this device, before any is loaded */
  languages(): LanguagesPort;
}

export const AREA5_PARTS = ['lang-strip', 'study-chooser', 'lang-courses', 'lang-today'] as const;
export type Area5Part = (typeof AREA5_PARTS)[number];
export const isArea5Part = (s: string): s is Area5Part => (AREA5_PARTS as readonly string[]).includes(s);

/** The options of a part (see the list above). */
export interface PartOptions {
  readonly course?: string | null;
  readonly none?: boolean;
  readonly onDone?: (codes: readonly string[]) => void;
  readonly onPick?: (courseId: string) => void;
}

/** What the frame shows around a screen: the crumbs after the frame's own, the back address, the tab that is on. */
export interface Area5Chrome {
  readonly crumbs: readonly { readonly label: string; readonly href?: string }[];
  readonly back?: string;
  readonly tab?: string;
}

export interface Area5Mounted {
  readonly element: HTMLElement;
  readonly chrome: Area5Chrome;
}

/** Every element of area 5 and its tag. */
export const AREA5_ELEMENTS = {
  'noema-engines-page': NoemaEnginesPage,
  'noema-engine-request-form': NoemaEngineRequestForm,
  'noema-languages-page': NoemaLanguagesPage,
  'noema-lang-courses': NoemaLangCourses,
  'noema-study-chooser': NoemaStudyChooser,
  'noema-lang-today': NoemaLangToday,
  'noema-lang-home': NoemaLangHome,
  'noema-lang-strip': NoemaLangStrip,
} as const;

declare global {
  interface HTMLElementTagNameMap {
    'noema-engines-page': NoemaEnginesPage;
    'noema-engine-request-form': NoemaEngineRequestForm;
    'noema-languages-page': NoemaLanguagesPage;
    'noema-lang-courses': NoemaLangCourses;
    'noema-study-chooser': NoemaStudyChooser;
    'noema-lang-today': NoemaLangToday;
    'noema-lang-home': NoemaLangHome;
    'noema-lang-strip': NoemaLangStrip;
  }
}

type Tag = keyof typeof AREA5_ELEMENTS;
function make<K extends Tag>(doc: Document, tag: K): InstanceType<(typeof AREA5_ELEMENTS)[K]> {
  const el = doc.createElement(tag);
  if (!(el instanceof AREA5_ELEMENTS[tag])) throw new Error(`${tag} is not defined (defineArea5)`);
  return el as InstanceType<(typeof AREA5_ELEMENTS)[K]>;
}

/** Puts the screen of an address into `host` (its children replaced). */
export function mountArea5(m: Area5Match, host: HTMLElement, ports: Area5Ports, t: (key: string) => string): Area5Mounted {
  const doc = host.ownerDocument;
  const put = (el: HTMLElement, chrome: Area5Chrome): Area5Mounted => {
    host.replaceChildren(el);
    return { element: el, chrome };
  };
  switch (m.name) {
    case 'languages': {
      const el = make(doc, 'noema-languages-page');
      el.port = ports.languages();
      return put(el, { crumbs: [{ label: t('sh.languages') }], tab: 'lang' });
    }
    case 'language': {
      const el = make(doc, 'noema-lang-home');
      el.port = ports.course();
      el.code = m.params.code;
      return put(el, { crumbs: [], tab: 'lang' });
    }
    case 'engines': {
      const el = make(doc, 'noema-engines-page');
      el.port = ports.engines();
      el.openForm = m.params.sub === 'new';
      return put(el, { crumbs: [{ label: t('engine.engines.title') }] });
    }
  }
}

/** Puts a part of a page into `host` (its children replaced). */
export function mountArea5Part(part: Area5Part, host: HTMLElement, ports: Area5Ports, o: PartOptions = {}): HTMLElement {
  const doc = host.ownerDocument;
  let el: HTMLElement;
  switch (part) {
    case 'lang-strip': {
      const s = make(doc, 'noema-lang-strip');
      s.port = ports.course();
      el = s;
      break;
    }
    case 'study-chooser': {
      const s = make(doc, 'noema-study-chooser');
      s.port = ports.languages();
      s.course = o.course ?? '';
      s.none = !!o.none;
      if (o.onDone) s.onDone = o.onDone;
      el = s;
      break;
    }
    case 'lang-courses': {
      const s = make(doc, 'noema-lang-courses');
      const P = ports.languages();
      s.port = P;
      s.rows = P.courses();
      if (o.onPick) s.onPick = o.onPick;
      el = s;
      break;
    }
    case 'lang-today': {
      const s = make(doc, 'noema-lang-today');
      s.port = ports.languages();
      s.course = o.course ?? '';
      el = s;
      break;
    }
  }
  host.replaceChildren(el);
  return el;
}

/** Defines area 5's elements (again: nothing happens). */
export function defineArea5(registry: CustomElementRegistry = customElements): void {
  for (const [tag, ctor] of Object.entries(AREA5_ELEMENTS)) if (!registry.get(tag)) registry.define(tag, ctor);
}
