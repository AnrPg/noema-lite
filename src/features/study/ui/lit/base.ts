/**
 * The study pages' Lit base (docs/ARCHITECTURE.md §6.4): every screen and every answer area is a kit element
 * (NoemaElement) drawn in the page's own DOM (light DOM), because the engine's styles (engine/src/*.css), the RTL rules
 * and the browser suites address their parts by the classes the older pages drew. A study element draws at once
 * (`redraw()`): the page's keys, the suites and the round read what it drew in the same task, as they did before.
 *
 * Lit is bundled into the study piece (build/study.js) for now: ui.js does not share its modules on this base yet.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { NoemaElement } from '../../../../ui/core/element.ts';
import type { StudyApp } from '../app.ts';
import { codeBlockHtml, fmt, guessLang, type Text } from '../text.ts';

export { html, nothing, svg, render, type TemplateResult } from 'lit';
export { ref } from 'lit/directives/ref.js';
export { live } from 'lit/directives/live.js';
export { unsafeHTML };

/** a pack's inline text (markdown-lite) as safe markup in a template */
export const F = (s: Text): unknown => unsafeHTML(fmt(s));
/** markup this area made safe (text.ts) */
export const M = (s: string): unknown => unsafeHTML(s);

/** a code block (its ⧉ is handled for the page: text.ts wireCopy) */
export const codeT = (code: string, lang: string | undefined, copyLabel: string): unknown =>
  unsafeHTML(codeBlockHtml(code, lang ?? guessLang(code), copyLabel));

/** Light DOM, drawn at once. */
export class StudyElement extends NoemaElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  /** draws now (also before the element is on the page) */
  redraw(): this {
    this.requestUpdate();
    this.performUpdate();
    return this;
  }
}

/** A study page: its <main>'s one .view (the source filter's bar, the 🔒 bar of a locked step and the setup reminders first). */
export abstract class StudyScreen extends StudyElement {
  protected readonly app: StudyApp;
  #top: unknown[] | null = null;
  constructor(app: StudyApp) {
    super();
    this.app = app;
  }
  /** the page's own content */
  protected abstract page(): unknown;
  override render(): TemplateResult {
    this.#top ??= topBars(this.app);
    return html`${this.#top}${this.page()}`;
  }
}

function topBars(app: StudyApp): unknown[] {
  const top: unknown[] = [];
  if (app.lock) top.push(html`<div class="lockbar" role="note">🔒 ${app.L('lockedPreview')}</div>`);
  top.push(app.sourcesUi.filterBanner() ?? nothing);
  const setup = app.route === 'home' || app.route === 'subject' ? app.host.frame.setupBanner() : null;
  top.push(setup ?? nothing);
  return top;
}

/** Puts a page on the screen: <main> holds it alone (as its .view); → the page. */
export function show<T extends StudyScreen>(app: StudyApp, screen: T): T {
  const m = app.host.frame.main();
  m.replaceChildren();
  m.dataset['page'] = '@engine';
  screen.classList.add('view');
  screen.redraw();
  m.append(screen);
  scrollTo({ top: 0 });
  return screen;
}

/** A study page made of one template (the small pages: a boss's door, a locked step). */
export class StudyPage extends StudyScreen {
  readonly #draw: () => unknown;
  constructor(app: StudyApp, draw: () => unknown) {
    super(app);
    this.#draw = draw;
  }
  protected page(): unknown {
    return this.#draw();
  }
}

/** the study area's elements by tag (defineStudyElements defines them) */
export const STUDY_TAGS = new Map<string, CustomElementConstructor>();
export function tag(name: string, ctor: CustomElementConstructor): void {
  if (STUDY_TAGS.has(name)) throw new Error(`study element <${name}> is tagged twice`); // one name, one element
  STUDY_TAGS.set(name, ctor);
}
tag('study-page', StudyPage);

/** Defines the study elements (once; again: nothing happens) and their display (a custom element is inline by default). */
export function defineStudyElements(registry: CustomElementRegistry = customElements): void {
  for (const [name, ctor] of STUDY_TAGS) if (!registry.get(name)) registry.define(name, ctor);
  if (typeof document === 'undefined' || document.getElementById('study-elements')) return;
  const st = document.createElement('style');
  st.id = 'study-elements';
  st.textContent = `:where(${[...STUDY_TAGS.keys()].join(',')}){display:block}`;
  document.head.append(st);
}
