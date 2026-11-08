/**
 * The page of a study screen: <main> cleared and filled (the source filter's bar and the 🔒 bar of a locked Roadmap
 * step on top), the frame's top bar told the crumbs, and the few pieces several screens draw (a progress ring, a list of
 * choices, Practice ▾, a found place outlined). Without the frame (the older page, an old index.html) a screen keeps its
 * own back button and plain tiles instead of the ▾ list.
 */
import type { StudyApp } from './app.ts';
import { h, type Child } from './dom.ts';
import type { Chrome, MenuEntry } from './host.ts';

/** The screen's frame: its crumbs and ⋮, and the back button the older page shows instead (label: where it leads). */
export function chrome(app: StudyApp, c: Chrome): void {
  app.host.frame.chrome(c);
}

/** the older page's back button (null in the frame, whose top bar has the arrow) */
export function backBtn(app: StudyApp, label: string, hash: string): HTMLButtonElement | null {
  if (app.host.frame.framed) return null;
  return h(
    'button',
    {
      class: 'back',
      type: 'button',
      onclick: () => {
        app.go(hash);
      },
    },
    label,
  );
}

/** Replaces the page's content: <main> holds one .view (the filter's bar and the lock bar first); → the view. */
export function view(app: StudyApp, ...kids: readonly (Child | readonly Child[])[]): HTMLDivElement {
  const m = app.host.frame.main();
  m.replaceChildren();
  m.dataset['page'] = '@engine';
  const v = h('div', { class: 'view' }, ...kids);
  const setup = app.route === 'home' || app.route === 'subject' ? app.host.frame.setupBanner() : null;
  if (setup) v.prepend(setup);
  const fb = app.sourcesUi.filterBanner();
  if (fb) v.prepend(fb);
  if (app.lock) v.prepend(h('div', { class: 'lockbar', role: 'note' }, `🔒 ${app.L('lockedPreview')}`));
  m.append(v);
  scrollTo({ top: 0 });
  return v;
}

/** the note on a locked step's exercises */
export const lockNote = (app: StudyApp): HTMLElement =>
  h('div', { class: 'locknote' }, '🔒 ', app.L('exLocked', { list: app.lock?.missing.join(', ') || '…' }));

/** a progress ring (its arc grows once on the screen: animateRings) */
export function ring(pct: number, size = 120, stroke = 12, color = 'var(--c)'): HTMLElement {
  const r = (size - stroke) / 2,
    C = 2 * Math.PI * r;
  const S = String(size),
    c = String(size / 2);
  return h('div', {
    style: { position: 'absolute', inset: '0' },
    html: `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--bg2)" stroke-width="${String(stroke)}"/><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="${color}" stroke-width="${String(stroke)}" stroke-linecap="round" stroke-dasharray="${String(C)}" stroke-dashoffset="${String(C)}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" data-off="${String(C * (1 - Math.min(1, pct)))}"/></svg>`,
  });
}
export function animateRings(root: Element): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const c of root.querySelectorAll<SVGCircleElement>('circle[data-off]')) c.style.strokeDashoffset = c.dataset['off'] ?? '';
    }),
  );
}

export interface Choice {
  readonly label: string;
  readonly sub?: string;
  readonly icon: string;
  readonly href?: string;
  readonly run?: () => void;
  readonly badge?: string | null;
  readonly cls?: string;
}
/** a list of choices (the chapter's Practice tab) */
export function choiceList(app: StudyApp, items: readonly (Choice | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'plist' },
    items
      .filter((x): x is Choice => !!x)
      .map(it =>
        h(
          'button',
          {
            class: `pitem${it.cls ? ` ${it.cls}` : ''}`,
            type: 'button',
            onclick: () => {
              if (it.run) it.run();
              else if (it.href) app.go(it.href);
            },
          },
          h('span', { class: 'pic' }, it.icon),
          h('span', { class: 'grow' }, h('b', {}, it.label), it.sub ? h('small', {}, it.sub) : null),
          it.badge ? h('span', { class: 'pill c' }, it.badge) : null,
          h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'),
        ),
      ),
  );
}

/** Practice ▾ (the frame's list), or the older page's tiles */
export function practiceButton(app: StudyApp, items: readonly (MenuEntry | null)[]): HTMLElement {
  if (app.host.frame.framed) return app.host.frame.menuButton(items, { cls: 'btn ns-practicebtn', label: app.t('ch.practice') });
  return h(
    'div',
    { class: 'modes' },
    items
      .filter((x): x is Exclude<MenuEntry, '-'> => !!x && x !== '-')
      .map(it =>
        h(
          'button',
          {
            class: 'mode',
            type: 'button',
            onclick: () => {
              if (it.run) it.run();
              else if (it.href) app.go(it.href);
            },
          },
          it.badge ? h('span', { class: 'pill badge', style: { background: '#ffe3d3', color: '#e8590c' } }, it.badge) : null,
          h('span', { class: 'ic' }, it.icon ?? ''),
          h('b', {}, it.label),
          h('small', {}, it.sub ?? ''),
        ),
      ),
  );
}

/** a place opened from the search: brought into view and outlined for a moment */
export function showHit(el: Element | null | undefined): void {
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ns-hit');
    setTimeout(() => {
      el.classList.remove('ns-hit');
    }, 2600);
  }, 120);
}
