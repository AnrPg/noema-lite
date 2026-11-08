/**
 * The page of a study screen: <main> cleared and filled (the source filter's bar and the 🔒 bar of a locked Roadmap
 * step on top), the frame's top bar told the crumbs, and the few pieces several screens draw (a progress ring, a list of
 * choices, Practice ▾, a found place outlined). Without the frame (the older page, an old index.html) a screen keeps its
 * own back button and plain tiles instead of the ▾ list.
 */
import type { StudyApp } from './app.ts';
import { h, type Child } from './dom.ts';
import type { Chrome, MenuEntry } from './host.ts';
import { html, M, nothing, ref, type TemplateResult } from './lit/base.ts';
import type { ExplainWhat } from './parts.ts';

/** The screen's frame: its crumbs and ⋮. */
export function chrome(app: StudyApp, c: Chrome): void {
  app.host.frame.chrome(c);
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
export const lockNoteT = (app: StudyApp): TemplateResult =>
  html`<div class="locknote">🔒 ${app.L('exLocked', { list: app.lock?.missing.join(', ') || '…' })}</div>`;

/** 💡 on a part of the lesson (the tutor's explainable, once the part is drawn) */
export const explainable = (app: StudyApp, what: () => ExplainWhat): unknown =>
  ref(el => {
    if (el instanceof HTMLElement) app.tutor.explainable(el, what);
  });

/** a box another area's code fills itself once (a deck of cards, a list of drills); it adds no box of its own to the layout */
export function filled(fill: (box: HTMLElement) => void): HTMLElement {
  const box = document.createElement('div');
  box.style.display = 'contents';
  fill(box);
  return box;
}

/** a progress ring (its arc grows once on the screen: animateRings) */
export function ring(pct: number, size = 120, stroke = 12, color = 'var(--c)'): TemplateResult {
  const r = (size - stroke) / 2,
    C = 2 * Math.PI * r;
  const S = String(size),
    c = String(size / 2);
  return html`<div style="position:absolute;inset:0">
    ${M(
      `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="var(--bg2)" stroke-width="${String(stroke)}"/><circle cx="${c}" cy="${c}" r="${String(r)}" fill="none" stroke="${color}" stroke-width="${String(stroke)}" stroke-linecap="round" stroke-dasharray="${String(C)}" stroke-dashoffset="${String(C)}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" data-off="${String(C * (1 - Math.min(1, pct)))}"/></svg>`,
    )}
  </div>`;
}
export function animateRings(root: Element): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const c of root.querySelectorAll<SVGCircleElement>('circle[data-off]')) c.style.strokeDashoffset = c.dataset['off'] ?? '';
    }),
  );
}
/** bars that grow from 0 to their data-w once on the screen */
export function growBars(root: Element): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const i of root.querySelectorAll<HTMLElement>('.bar>i[data-w]')) i.style.width = i.dataset['w'] ?? '';
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
export function choiceList(app: StudyApp, items: readonly (Choice | null)[]): TemplateResult {
  return html`<div class="plist">
    ${items
      .filter((x): x is Choice => !!x)
      .map(
        it =>
          html`<button
            class="pitem${it.cls ? ` ${it.cls}` : ''}"
            type="button"
            @click=${() => {
              if (it.run) it.run();
              else if (it.href) app.go(it.href);
            }}
          >
            <span class="pic">${it.icon}</span
            ><span class="grow"><b>${it.label}</b>${it.sub ? html`<small>${it.sub}</small>` : nothing}</span>${it.badge
              ? html`<span class="pill c">${it.badge}</span>`
              : nothing}<span class="chev" aria-hidden="true">›</span>
          </button>`,
      )}
  </div>`;
}

/** Practice ▾: the frame's list */
export function practiceButton(app: StudyApp, items: readonly (MenuEntry | null)[]): HTMLElement {
  return app.host.frame.menuButton(items, { cls: 'btn ns-practicebtn', label: app.t('ch.practice') });
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
