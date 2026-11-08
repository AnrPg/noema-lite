/**
 * The frame's host (window.NoemaShell, the phase bridge's UI half: docs/ARCHITECTURE.md §6.3): it mounts the frame
 * (src/ui/screens/shell/frame.ts), owns the address (#/…) and draws the page of each one — the shell's own (Lit,
 * src/ui/screens/shell), those the other areas register (engine/app/*.js and the modules they call), and the open
 * subject's, which the study engine draws (engine/src/*: attachEngine). Its toolkit (h, menuButton, sheet, modal, chrome,
 * page …) is what those pages draw with until their areas replace them.
 */
import type { NoemaCoreBridge as CoreBridge } from '../bridge.ts';
import { arrive, backFrom, type TrailStep } from '../../features/shell/domain/trail.ts';
import { CHARACTER_GROUPS, isCharacter } from '../../features/shell/domain/characters.ts';
import { EMPTY_FRAME, type FrameModel, type FrameTab, type NoemaShellFrame } from '../../ui/screens/shell/frame.ts';
import { ENGINE_ROUTES, placeOf } from '../../ui/screens/shell/routes.ts';
import { studyFrame, type StudyFramePage } from './study-frame.ts';
import type { ShellArt, ShellContext, TutorVars } from '../../ui/screens/shell/base.ts';
import { closePops, fitRow, h, menuButton, modal, popMenu, tipped, tone, type DomKit, type Kid, type MenuEntry } from './dom.ts';
import { jsonOf, putJson, type DeviceKv } from './kv.ts';
import { community, legacy, type EngineApi, type SubjectMeta } from './legacy.ts';
import type { Themes } from './themes.ts';

const DAY = 864e5;

/** the top bar and tab of the page now showing */
export interface Chrome {
  readonly tab?: string | null;
  readonly crumbs?: readonly (readonly [string, (string | null)?])[];
  readonly back?: string | null;
  readonly acts?: readonly (Node | null | undefined | false)[];
  readonly menu?: readonly MenuEntry[] | (() => readonly MenuEntry[]) | null;
  readonly menuLabel?: string;
  readonly menuDot?: boolean;
  readonly fab?: boolean;
  readonly reading?: boolean;
  /** what the character button opens on this page (a language course: its own tutor) */
  readonly tutor?: () => void;
  readonly cls?: string;
  readonly corner?: boolean;
  readonly sub?: boolean;
}
/** a page: drawn into <main> for the rest of its address; it returns KEPT when the page shown is the one drawn before
    (the same address drawn again, e.g. on a theme that arrives late: the scroll stays where it is) */
export type PageFn = (args: readonly string[]) => unknown;
export const KEPT = 'kept';
/** a world the languages branch registers (docs/SHELF_AND_LANGUAGES.md) */
export interface World {
  route?: (args: readonly string[]) => unknown;
  today?: (box: HTMLElement, ctx: unknown) => boolean | undefined;
  studying?: () => unknown;
}
/** where the learner reads (Today › Continue): written by the engine */
export interface Recent {
  readonly subj: string;
  readonly title?: string;
  readonly emoji?: string;
  readonly sid?: string;
  readonly cid?: string;
  readonly node?: string;
  readonly secTitle?: string;
  readonly chNum?: number;
  readonly chOf?: number;
  readonly secNum?: number;
  readonly secOf?: number;
  readonly at?: number;
}

/** What the host needs of the app's core (src/composition/shell/core.ts). */
export interface HostCore {
  readonly kv: DeviceKv;
  readonly themes: Themes;
  account(): { id: string; name?: string; emoji?: string; kind?: string; email?: string | null } | null;
  subject(): (SubjectMeta & { tutor?: unknown }) | null;
  subjectsFor(acc: string): Promise<SubjectMeta[]>;
  switchTo(acc: string, subj: string | null, hash?: string): void;
  ensureEngine(): Promise<boolean>;
  toast(text: string, ms?: number): void;
  /** the 🔔 bell's list and its sheet */
  bell: { count(f: (n: number) => void): void; open(sheet: Host['sheet']): void };
  backgroundEngine(): boolean;
  foreground(): void;
}

export function createHost(core: HostCore) {
  const W = legacy;
  const N = () => core;
  const acc = (): string | null => core.account()?.id ?? null;
  const settings = (): Record<string, unknown> => core.themes.settings();
  const uiPref = (): unknown => settings()['lang'];
  const lang = (): string => W().NoemaI18n?.lang(uiPref()) ?? 'en';
  const art = (): ShellArt => {
    const a = W().NoemaArt;
    return a
      ? {
          svg: (k, c) => a.svg(k, c),
          mascot: (m, w, hh) => a.mascot(m, w, hh),
          land: m => a.land(m),
          collection: (m, n, f) => a.collection(m, n, f),
          has: k => !!a.I[k],
        }
      : { svg: () => '', mascot: () => '', land: () => '', collection: () => '', has: () => false };
  };

  /* ---------- words: i18n/shell (sh.*), with the tutor's name in the right form ---------- */
  function tv(m?: string): TutorVars {
    const t = core.themes.tutor(m);
    const nom = t.nom || t.n;
    return { tutor: t.n, tutorAcc: t.acc, tutorTo: t.to, tutorNom: nom, Tutor: nom ? (nom[0] ?? '').toUpperCase() + nom.slice(1) : t.n };
  }
  const L = (k: string, v?: Record<string, unknown> | null): string =>
    W().NoemaI18n?.t('sh.' + k, { ...tv(), ...(v ?? {}) }, uiPref()) ?? k;
  /** a sentence with some of its values in bold (names and titles stay text, never markup) */
  function rich(k: string, vals: Record<string, Kid>): Kid[] {
    const names = Object.keys(vals),
      marks = Object.fromEntries(names.map((n, i) => [n, `\u0001${String(i)}\u0001`]));
    return L(k, marks)
      .split('\u0001')
      .map((x, i) => {
        if (!(i % 2)) return x;
        const v = vals[names[+x] ?? ''];
        return v instanceof Node ? v : h('b', {}, v);
      });
  }
  const fmtDate = (t: unknown, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string => {
    try {
      return W().NoemaI18n?.fmt.date(t, o) ?? new Date(t as number).toLocaleDateString(lang(), o);
    } catch {
      return new Date(t as number).toDateString();
    }
  };
  const today = (): string => NoemaCoreBridge().clock.today();

  /* ---------- icons and small parts ---------- */
  const svg = (k: string, cls = 'i'): HTMLElement => h('span', { class: 'ns-svg', html: art().svg(k, cls) });
  const faceEl = (m: string = core.themes.current(), cls = ''): HTMLElement =>
    h('span', { class: 'ns-face ' + cls, 'aria-hidden': 'true', html: art().mascot(m) });
  const ico = (k: string, n = 1): HTMLElement => h('span', { class: 'ns-ico', style: tone(n) }, svg(k));
  const icoTxt = (x: Kid, n = 1, cls = 'txt'): HTMLElement => h('span', { class: 'ns-ico ' + cls, style: tone(n) }, x);
  const pill = (x: Kid, n = 1, cls = ''): HTMLElement => h('span', { class: 'ns-pill ' + cls, style: tone(n) }, x);
  const bar = (pct: number): HTMLElement =>
    h('div', { class: 'ns-bar' }, h('i', { style: { width: `${String(Math.round(Math.max(0, Math.min(1, pct || 0)) * 100))}%` } }));
  const chev = (): HTMLElement => h('span', { class: 'ns-chev', 'aria-hidden': 'true' }, '›');
  function ring(pct: number, size: number, stroke: number): HTMLElement {
    const r = (size - stroke) / 2,
      C = 2 * Math.PI * r,
      off = C * (1 - Math.max(0, Math.min(1, pct || 0)));
    const s = String(size),
      c = String(size / 2);
    return h('span', {
      class: 'ns-ringsvg',
      html: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--line)" stroke-width="${String(stroke)}"/><circle class="ns-arc" cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--acc)" stroke-width="${String(stroke)}" stroke-linecap="round" style="--C:${String(C)};stroke-dasharray:${String(C)};stroke-dashoffset:${String(off)}"/></svg>`,
    });
  }
  const kit: DomKit = {
    svg,
    pill,
    hasIcon: k => art().has(k),
    go: (x: string) => {
      go(x);
    },
  };

  /* ---------- the learner's places (device-local) ---------- */
  const recentKey = (): string => `noema1:${acc() ?? ''}:meta:recent`;
  const recent = (): Recent[] => (jsonOf<(Recent | null)[] | null>(core.kv, recentKey(), []) ?? []).filter((r): r is Recent => !!r?.subj);
  const hideKey = (): string => `noema1:${acc() ?? ''}:meta:todayHide`;
  const hiddenToday = (): string[] => {
    const v = jsonOf<{ d?: string; ids?: unknown } | null>(core.kv, hideKey(), null);
    return v?.d === today() && Array.isArray(v.ids) ? (v.ids as string[]) : [];
  };
  const hideToday = (id: string): void => {
    putJson(core.kv, hideKey(), { d: today(), ids: [...new Set([...hiddenToday(), id])] });
  };
  function noteRecent(r: Recent): void {
    if (!acc() || !r.subj) return;
    const list = recent().filter(x => x.subj !== r.subj);
    list.unshift({ ...r, at: Date.now() });
    putJson(core.kv, recentKey(), list.slice(0, 12));
    if (hiddenToday().includes(r.subj))
      putJson(core.kv, hideKey(), {
        d: today(),
        ids: hiddenToday().filter(x => x !== r.subj),
      }); // studied again: suggest it again
  }

  /* ---------- the engine of the open subject ---------- */
  let ENGINE: EngineApi | null = null;
  let pendingEngine = false;
  const subjectId = (): string | null => core.subject()?.id ?? null;
  const isLang = (s: SubjectMeta | null | undefined): boolean => !!s && (s.kind === 'language' || s.id.startsWith('lang:'));
  /** Open a subject (loads its pack: the page reloads) or, when it is open already, go to the place. */
  function open(subj: string | null | undefined, hash = '#/subject'): void {
    if (!subj) return;
    const a = acc();
    if (ENGINE && subj === subjectId()) {
      location.hash = hash;
      return;
    }
    if (a) core.switchTo(a, subj, hash);
  }

  /* ---------- worlds and pages ---------- */
  const WORLDS: Record<string, World> = {};
  const PAGES: Record<string, PageFn> = {};
  /** the pages of the open subject an area registers (the study area's: engine/app/study.js) */
  const SUBJECT_PAGES = new Set<string>();
  /** a page of the open subject: drawn once its engine is there, in the subject's language, under its top bar */
  const isSubjectPage = (k: string): boolean => ENGINE_ROUTES.has(k) || SUBJECT_PAGES.has(k);
  let mounted = false;
  let chromeNow: Chrome = {};
  let frame: NoemaShellFrame | null = null;
  let model: FrameModel = EMPTY_FRAME;
  const parts = {
    acts: h('div', { class: 'ns-acts' }),
    share: h('div', { class: 'sharebar', role: 'status' }),
    main: h('main'),
    fx: h('div', { class: 'ns-fx', id: 'ns-fx' }),
    layer: h('div', { class: 'ns-layer', id: 'ns-layer' }),
    preview: h('div', { class: 'ns-pvslot' }),
  };
  const setModel = (patch: Partial<FrameModel>): void => {
    model = { ...model, ...patch };
    if (frame) frame.model = model;
  };
  function registerWorld(id: string, provider: World): void {
    WORLDS[id] = provider;
    if (mounted) {
      drawTabs();
      route();
    }
  }
  /** an area's page: drawn for the addresses #/<key>/… (subject: a page of the open subject) */
  function registerPage(key: string, fn: PageFn, o: { subject?: boolean } = {}): void {
    PAGES[key] = fn;
    if (o.subject) SUBJECT_PAGES.add(key);
    else SUBJECT_PAGES.delete(key);
  }

  /* ---------- the frame ---------- */
  let peopleWaiting = 0;
  const social = (): boolean => !!community() && core.account()?.kind === 'cloud' && !!W().NoemaCloud?.session();
  function tabsList(): FrameTab[] {
    const w = core.themes.world();
    const t: FrameTab[] = [{ key: 'today', href: '#/', icon: 'sun', label: L('today'), title: L('today') }];
    if (w !== 'lang') t.push({ key: 'learn', href: '#/learn', icon: 'path', label: L('knowledge'), title: L('knowledge') });
    if (w !== 'know') t.push({ key: 'lang', href: '#/lang', icon: '文A', text: true, label: L('languages'), title: L('languages') }); // i18n-ignore (文A: the Languages icon)
    t.push({ key: 'discover', href: '#/discover', icon: 'compass', label: L('discover'), title: L('discover') });
    // the vault and people are places of their own, not corners of Discover (people: cloud accounts only)
    t.push({ key: 'vault', href: '#/vault', icon: 'vault', label: L('vault'), title: L('vaultSub') });
    if (social())
      t.push({ key: 'people', href: '#/people', icon: 'community', label: L('people'), title: L('peopleSub'), badge: peopleWaiting });
    t.push({ key: 'progress', href: '#/progress', icon: 'star', label: L('progress'), title: L('progress') });
    return t;
  }
  function drawTabs(): void {
    setModel({ tabs: tabsList() });
  }
  function drawMe(): void {
    const a = core.account();
    setModel({ me: { emoji: a?.emoji || (a?.name || '?').trim()[0]?.toUpperCase() || '?', name: a?.name ?? '' } });
  }
  function chrome(c: Chrome = {}): void {
    chromeNow = c;
    const menu =
      c.menu && (typeof c.menu === 'function' || c.menu.length)
        ? menuButton(kit, c.menu, { label: c.menuLabel ?? L('more'), dot: !!c.menuDot })
        : null;
    parts.acts.replaceChildren(...[...(c.acts ?? []), menu].filter((x): x is Node => !!x)); // menu: a list, or a function that makes it when opened
    setModel({
      crumbs: (c.crumbs ?? []).map(([label, href]) => ({ label, href: href ?? null })),
      back: !!c.back,
      tab: c.tab ?? null,
      fab: c.fab !== false, // the tutor is always there, whole and alive, with its name
      reading: !!c.reading,
    });
    frame?.showTop();
  }
  const go = (hash: string): void => {
    if (location.hash === hash || (hash === '#/' && !location.hash)) route();
    else location.hash = hash;
  };

  /* ---------- ← back: the trail of this tab (sessionStorage) ---------- */
  const TRAIL = 'noema-trail',
    here0 = (): string => location.hash || '#/';
  const trailGet = (): TrailStep[] => {
    try {
      const t: unknown = JSON.parse(sessionStorage.getItem(TRAIL) ?? 'null');
      return Array.isArray(t) ? (t as TrailStep[]) : [];
    } catch {
      return [];
    }
  };
  const trailPut = (t: readonly TrailStep[]): void => {
    try {
      sessionStorage.setItem(TRAIL, JSON.stringify(t));
    } catch {
      /* no sessionStorage here (blocked site data): the trail of this tab is only kept in memory */
      memTrail = [...t];
    }
  };
  let memTrail: TrailStep[] = [];
  let backTo: TrailStep | null = null; // the address ← (or the browser's back) is returning to: its scroll position comes back too
  let lastInput = 0;
  function noteTrail(): void {
    const r = arrive(trailGet().length ? trailGet() : memTrail, here0(), { now: Date.now(), lastInput, scrollY });
    backTo = r.backTo;
    trailPut(r.trail);
  }
  function restoreScroll(): void {
    const b = backTo;
    if (!b?.y) return;
    for (const ms of [60, 250])
      setTimeout(() => {
        if (here0() === b.h && scrollY < 4) scrollTo({ top: b.y });
      }, ms);
  }
  function goBack(): void {
    go(backFrom(trailGet(), here0(), chromeNow.back));
  }

  /* ---------- small pop-overs ---------- */
  let tipT = 0;
  function tip(text: string): void {
    parts.layer.querySelector('.ns-tip')?.remove();
    const ps = text.split(/(?<=[.!?;·])\s+(?=\S)/).filter(Boolean);
    const t: HTMLElement = h(
      'div',
      {
        class: 'ns-tip',
        role: 'status',
        onclick: () => {
          t.remove();
        },
      },
      ...(ps.length > 1 ? ps.map(x => h('p', {}, x)) : [text]),
    );
    parts.layer.append(t);
    clearTimeout(tipT);
    tipT = window.setTimeout(
      () => {
        t.remove();
      },
      Math.max(5500, text.length * 70),
    ); // a long hint reads as short lines, stays long enough to read, and goes on a tap
  }
  const hint = (text: string): HTMLElement =>
    h(
      'button',
      {
        class: 'ns-hint',
        'aria-label': L('whatIsThis'),
        title: L('whatIsThis'),
        onclick: (e: Event) => {
          e.stopPropagation();
          tip(text);
        },
      },
      'i',
    );
  let vcardN = 0;
  /** A card that opens something, with an (i) beside its title (no control within a control). */
  function vcard(run: () => void, icon: Kid, badge: Kid, title: Kid, tipText: string, sub: Kid): HTMLElement {
    const id = `ns-vcard-${String(++vcardN)}`;
    return h(
      'div',
      { class: 'ns-vcard', onclick: run },
      h('span', { class: 'top' }, icon, badge),
      h(
        'b',
        {},
        h(
          'button',
          {
            class: 'ns-vgo',
            type: 'button',
            'aria-describedby': id,
            onclick: (e: Event) => {
              e.stopPropagation();
              run();
            },
          },
          title,
        ),
        ' ',
        hint(tipText),
      ),
      h('small', { id }, sub),
    );
  }
  /** A sheet from the bottom (phones) / the right (wide screens). build(body, close) */
  function sheet(title: string, build: (body: HTMLElement, close: () => void) => void, { cls = '' }: { cls?: string } = {}): () => void {
    const close = (): void => {
      parts.layer.replaceChildren();
    };
    const body = h('div', { class: 'ns-shbody' });
    parts.layer.replaceChildren(
      h('div', { class: 'ns-scrim', onclick: close }),
      h(
        'aside',
        { class: 'ns-sheet ' + cls, role: 'dialog', 'aria-label': title },
        h(
          'div',
          { class: 'ns-shhead' },
          h('b', {}, title),
          h('button', { class: 'ns-iconbtn', 'aria-label': L('close'), onclick: close }, svg('close')),
        ),
        body,
      ),
    );
    build(body, close);
    plainWatch(body);
    return close;
  }
  const modalOn = (title: string, build: Parameters<typeof modal>[2], o?: { cls?: string }): (() => void) =>
    modal(parts.layer, title, build, o);
  let plainWatch: (root: HTMLElement) => void = () => undefined;

  /* ======================= routing ======================= */
  let routedHash: string | null = null;
  function route(): void {
    if (!mounted) return;
    // a menu closes when the learner goes elsewhere, not when the same page is drawn again
    if (location.hash !== routedHash) closePops();
    routedHash = location.hash;
    const { page: k, args } = placeOf(location.hash);
    // <html lang>: the subject's language on its own pages (its text), the menus' language everywhere else
    const docLang = (l: string): void => {
      if (document.documentElement.lang !== l) document.documentElement.lang = l;
    };
    const top = frame?.top;
    for (const e of [top, frame?.querySelector('.ns-tabs'), frame?.querySelector('#ns-fab'), parts.layer])
      if (e instanceof HTMLElement) e.lang = lang(); // the frame itself always speaks the menus' language
    if (isSubjectPage(k)) {
      docLang(core.subject()?.language || 'en');
      if (!ENGINE && pendingEngine) {
        chrome({ tab: 'learn', crumbs: [['…']] });
        parts.main.dataset['page'] = '@wait';
        parts.main.replaceChildren(h('div', { class: 'ns-view ns-wait' }, faceEl(undefined, 'breathe')));
        return;
      }
      if (!ENGINE) {
        location.replace('#/');
        return;
      }
      if (core.backgroundEngine()) core.foreground(); // a quietly loaded subject you now study is the one a reload reopens
      chrome(subjectChrome());
      const own = SUBJECT_PAGES.has(k) ? PAGES[k] : undefined;
      if (!own) {
        ENGINE.route();
        return;
      }
      try {
        void Promise.resolve(own(args)).catch(fail);
      } catch (e) {
        fail(e);
      }
      return;
    }
    docLang(lang());
    if (k === 'lang' && core.themes.world() === 'know') {
      // a link to a course (#/lang/<course>…) shows the Languages tab too; the tab alone goes home
      if (args[0] && WORLDS['lang']?.route) {
        core.themes.putSettings({ world: 'both' });
        drawTabs();
      } else {
        location.replace('#/');
        return;
      }
    }
    if (k === 'learn' && core.themes.world() === 'lang') {
      location.replace('#/lang');
      return;
    }
    if (parts.main.dataset['page'] !== k) parts.main.replaceChildren();
    parts.main.dataset['page'] = k;
    document.body.classList.remove('ns-mapmode');
    const fn = PAGES[k] ?? PAGES[''];
    let kept = false;
    try {
      const r = fn?.(args);
      kept = r === KEPT;
      void Promise.resolve(r).catch(fail);
    } catch (e) {
      fail(e);
    }
    if (!kept) scrollTo({ top: 0 });
  }
  function fail(e: unknown): void {
    console.error('[shell]', e);
    parts.main.replaceChildren(h('div', { class: 'ns-view' }, h('p', {}, e instanceof Error ? e.message : String(e))));
  }
  /** Draw a page into <main>: chrome + content. */
  function page(c: Chrome, ...kids: Kid[]): HTMLElement {
    chrome(c);
    const v = h('div', { class: 'ns-view' + (c.cls ? ' ' + c.cls : '') }, ...kids);
    parts.main.replaceChildren(v);
    delete parts.main.dataset['engine'];
    return v;
  }
  /** Mount a Lit screen of the shell as the page: chrome + the element. */
  function screen<E extends HTMLElement>(c: Chrome, el: E): E {
    chrome(c);
    const v = h('div', { class: 'ns-view' + (c.cls ? ' ' + c.cls : '') }, el);
    parts.main.replaceChildren(v);
    delete parts.main.dataset['engine'];
    return el;
  }
  const shortTitle = (c: { title?: string; goal?: string }): string => {
    const t = W().NoemaCurriculum?.shownTitle(c as never) || c.title || c.goal || '';
    return t.length > 28
      ? t
          .split(/[:—–(-]/)[0]
          ?.trim()
          .slice(0, 28) || t.slice(0, 28)
      : t;
  };
  /** The default top bar of a subject's pages; the engine's views refine it (crumbs, ⋮). */
  function subjectChrome(extra: Chrome = {}): Chrome {
    const s = core.subject(),
      node = (W() as { Noema?: { node?: { id: string; node: string } | null } }).Noema?.node ?? null,
      c = node ? W().NoemaCurriculum?.get(acc(), node.id) : null;
    const mapHref = c && node ? '#/map/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(node.node) : null;
    const crumbs: [string, string | null][] = c && mapHref ? [[shortTitle(c), mapHref]] : [[L('shelf'), '#/shelf']];
    return {
      tab: isLang(s) ? 'lang' : 'learn',
      ...extra,
      crumbs: [...crumbs, [s?.title || '…', extra.sub ? '#/subject' : null], ...(extra.crumbs ?? [])],
      back: extra.back ?? mapHref ?? '#/shelf',
    };
  }
  /** Where the learner is now, for the search's "here": the open subject, a Roadmap, a language course (or nothing). */
  function here(): unknown {
    const { page: k, args } = placeOf(location.hash);
    const s = core.subject();
    if (isSubjectPage(k) && s?.id && !isLang(s)) return { kind: 'subj', id: s.id, title: s.title };
    if (k === 'map' && args[0]) {
      const c = W().NoemaCurriculum?.get(acc(), args[0]);
      if (c) return { kind: 'cur', id: c.id, title: shortTitle(c) };
    }
    if (k === 'lang' && args[0]) {
      const reg = (W().NOEMA_REGISTRY as { languages?: { id: string; title?: string }[] } | undefined)?.languages ?? [];
      return {
        kind: 'course',
        id: args[0],
        title: W().NoemaLangUI?.titleOf?.(args[0]) || reg.find(x => x.id === args[0])?.title || args[0],
      };
    }
    if (k === 'search') return community()?.search.hereNow() ?? null;
    return null;
  }

  /* ---------- Me ▾ ---------- */
  const RL = (k: string, v?: Record<string, unknown>): string => W().NoemaI18n?.t('report.' + k, v ?? null, uiPref()) ?? k;
  const reports = { admin: false, fresh: 0 };
  let meMenuItems: () => readonly MenuEntry[] = () => [];
  function meMenu(anchor: HTMLElement, rail = false): void {
    const had = document.querySelector('.ns-pop.ns-mepop');
    closePops();
    if (had) return;
    const pop = popMenu(kit, anchor, meMenuItems(), { down: !rail });
    // on <body>, fixed under "Me" (top right) or above it (the rail's foot), so no bar clips it
    pop.classList.add('ns-mepop');
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const px = (n: number): string => `${String(n)}px`;
    Object.assign(
      pop.style,
      rail
        ? { left: px(r.left), right: 'auto', top: 'auto', bottom: px(innerHeight - r.top + 6), maxHeight: px(r.top - 14) }
        : {
            right: px(Math.max(8, innerWidth - r.right)),
            left: 'auto',
            top: px(r.bottom + 6),
            bottom: 'auto',
            maxHeight: px(innerHeight - r.bottom - 14),
          },
    );
  }

  /* ---------- the parts of the frame that follow the account ---------- */
  function wireSocial(): void {
    const S = community()?.social;
    if (!S || !social()) return;
    drawTabs();
    S.start();
    S.onChange(() => {
      peopleWaiting = S.waiting();
      drawTabs();
    });
  }
  function wireSync(): void {
    const C = W().NoemaCloud;
    if (core.account()?.kind !== 'cloud' || !C?.onStatus) return;
    const paint = (s: { error?: string; syncing?: boolean; pending?: unknown }): void => {
      setModel({
        sync: {
          state: s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok',
          title: s.error ? L('syncErr', { e: s.error }) : s.syncing ? L('syncing') : s.pending ? L('syncWait') : L('synced'),
        },
      });
    };
    C.onStatus(paint);
    paint(C.status());
  }
  function wireReports(): void {
    const R = community()?.report;
    if (!R) return;
    setModel({ report: true });
    const isAdmin = R.isAdmin.bind(R);
    const check = (): void => {
      isAdmin()
        .then(yes => {
          reports.admin = yes;
          return yes ? R.newCount() : 0;
        })
        .then(n => {
          reports.fresh = n || 0;
          setModel({ reportDot: reports.fresh > 0 });
        })
        .catch(NoemaCoreBridge().errors.catcher('shell.reports.count', { severity: 'info' }));
    };
    check();
    addEventListener('hashchange', () => {
      if (/^#\/admin/.test(location.hash) || reports.admin) check();
    });
  }

  /* ---------- mount ---------- */
  let onMounted: () => void = () => undefined;
  const ctx: ShellContext = {
    art: art(),
    character: () => core.themes.current(),
    tutorVars: m => tv(m),
    go: x => {
      go(x);
    },
  };
  function mount({ engine = false }: { engine?: boolean } = {}): void {
    if (mounted) return;
    mounted = true;
    pendingEngine = engine;
    core.themes.apply();
    document.body.classList.add('ns-on');
    const existing = document.querySelector('main');
    if (existing) {
      existing.replaceWith(parts.main);
      parts.main.append(...existing.childNodes);
    }
    parts.main.id = 'ns-main';
    const f: NoemaShellFrame = document.createElement('noema-shell-frame');
    frame = f;
    f.ctx = { ...ctx, art: art() };
    f.parts = parts;
    f.model = model;
    f.addEventListener('shell-go', e => {
      go((e as CustomEvent<string>).detail);
    });
    f.addEventListener('shell-back', goBack);
    f.addEventListener('shell-bell', () => {
      core.bell.open(sheet);
    });
    f.addEventListener('shell-me', e => {
      const d = (e as CustomEvent<{ anchor: HTMLElement; rail: boolean }>).detail;
      meMenu(d.anchor, d.rail);
    });
    f.addEventListener('shell-find', () => {
      void community()?.search.quick(here());
    });
    f.addEventListener('shell-report', () => {
      void community()?.report.open();
    });
    f.addEventListener('shell-fab', () => {
      if (chromeNow.tutor) chromeNow.tutor();
      else if (ENGINE) ENGINE.openTutor?.();
      else
        void core.ensureEngine().then(ok => {
          if (ok) ENGINE?.openTutor?.();
          else core.toast(L('needSubject'), 4000);
        });
    });
    document.body.prepend(f);
    drawMe();
    drawTabs();
    core.bell.count(n => {
      setModel({ bell: n });
    });
    wireSocial();
    wireSync();
    wireReports();
    core.themes.onChange((_m, why) => {
      if (why === 'tick') return;
      f.ctx = { ...ctx, art: art() };
      f.requestUpdate();
      ENGINE?.retheme?.();
      if (!parts.layer.querySelector('.ns-onb')) route();
    });
    for (const k of ['pointerdown', 'keydown'])
      addEventListener(
        k,
        () => {
          lastInput = Date.now();
        },
        true,
      );
    noteTrail();
    addEventListener('hashchange', () => {
      noteTrail();
      route();
      restoreScroll();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (closePops()) return;
        if (parts.layer.firstChild && !parts.layer.querySelector('[data-sticky]')) {
          parts.layer.replaceChildren();
          return;
        }
      }
      // / or Ctrl/⌘ K: search (not while typing, not over a window that must be answered)
      const target = e.target as Element | null;
      const search =
        (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey));
      if (
        search &&
        !target?.closest('input, textarea, select, [contenteditable="true"]') &&
        !parts.layer.querySelector('[data-sticky], .ns-modal') &&
        community()
      ) {
        e.preventDefault();
        void community()?.search.quick(here());
      }
    });
    document.addEventListener(
      'click',
      e => {
        if (!(e.target as Element | null)?.closest('.ns-pop, [data-pop]')) closePops();
      },
      true,
    );
    route();
    onMounted();
    for (const f of mountedHooks.splice(0)) f();
  }
  /** What an area wires into the frame once it is there (at once when it is): the share bar, a world's tab… */
  const mountedHooks: (() => void)[] = [];
  function whenMounted(f: () => void): void {
    if (mounted) f();
    else mountedHooks.push(f);
  }

  /* ======================= for the engine ======================= */
  /** The engine of the open subject calls this once it has booted: from now on its routes are drawn by it. */
  function attachEngine(api: EngineApi): void {
    ENGINE = api;
    pendingEngine = false;
    if (mounted) route();
  }
  /** The subject could not be loaded: say so and stay on the shell's pages. */
  function noEngine(msg: string): void {
    pendingEngine = false;
    core.toast(msg, 6000);
    if (isSubjectPage(placeOf(location.hash).page)) location.replace('#/');
    else route();
  }
  /** Small items an engine page shows in the top bar, next to ⋮ (e.g. the focus-sprint clock). */
  function setActs(nodes: readonly (Node | null | undefined | false)[]): void {
    parts.acts.prepend(...nodes.filter((x): x is Node => !!x));
  }

  const api = {
    /* the frame */
    mount,
    route,
    go,
    goBack,
    open,
    here,
    chrome,
    subjectChrome,
    page,
    screen,
    registerPage,
    isSubjectPage,
    /** the frame as the study area sees it (src/features/study/ui/host.ts FramePort) */
    studyFrame: (pageParts: StudyFramePage) =>
      studyFrame(
        {
          main: parts.main,
          chrome,
          subjectChrome,
          menuButton: (items, o) => menuButton(kit, items, o),
          sheet,
          setActs,
          noteRecent,
          toast: (m, ms) => {
            core.toast(m, ms);
          },
          L,
          place: () => {
            const s = core.subject(),
              node = (W() as { Noema?: { node?: { id: string; node: string } | null } }).Noema?.node ?? null;
            return s ? { subj: s.id, title: s.title ?? '', cid: node?.id ?? null, node: node?.node ?? null } : null;
          },
        },
        pageParts,
      ),
    registerWorld,
    whenMounted,
    attachEngine,
    noEngine,
    setActs,
    drawTabs,
    drawMe,
    /* the toolkit */
    h,
    svg,
    faceEl,
    ico,
    icoTxt,
    pill,
    bar,
    chev,
    ring,
    tone,
    L,
    RL,
    tv,
    rich,
    fmtDate,
    tip,
    hint,
    vcard,
    sheet,
    modal: modalOn,
    menuButton: (
      items: readonly MenuEntry[] | (() => readonly MenuEntry[]),
      o: { label?: string; cls?: string; content?: Node | null; down?: boolean; dot?: boolean } = {},
    ) => menuButton(kit, items, { ...o, label: o.label ?? L('more') }),
    popMenu: (anchor: HTMLElement, items: readonly MenuEntry[], o?: { down?: boolean }) => popMenu(kit, anchor, items, o),
    closePops,
    fitRow,
    tipped,
    meMenu,
    /* the learner's places */
    recent,
    noteRecent,
    hiddenToday,
    hideToday,
    isLang,
    WORLDS,
    PAGES,
    /** what a page returns when it kept the page drawn before (route(): the scroll stays) */
    KEPT,
    reports,
    GROUPS: CHARACTER_GROUPS,
    ctx: (): ShellContext => ({ ...ctx, art: art() }),
    get layer() {
      return parts.layer;
    },
    get main() {
      return parts.main;
    },
    get share() {
      return parts.share;
    },
    get preview() {
      return parts.preview;
    },
    get frame() {
      return frame;
    },
    get mounted() {
      return mounted;
    },
    get engine() {
      return ENGINE;
    },
    get chromeNow() {
      return chromeNow;
    },
    /** what the root adds once it knows them (the Me menu, the plain-text watch, what runs after mounting) */
    configure(o: { meMenu?: () => readonly MenuEntry[]; plainWatch?: (root: HTMLElement) => void; onMounted?: () => void }): void {
      if (o.meMenu) meMenuItems = o.meMenu;
      if (o.plainWatch) plainWatch = o.plainWatch;
      if (o.onMounted) onMounted = o.onMounted;
    },
    isCharacter,
    DAY,
    N,
  };
  return api;
}
export type Host = ReturnType<typeof createHost>;

/** the phase bridge (window.NoemaCore, build/app.js) */
export const NoemaCoreBridge = (): CoreBridge => (globalThis as unknown as { NoemaCore: CoreBridge }).NoemaCore;
