/**
 * What the tutor's screens get from the composition (src/composition/tutor.ts): the session, the words, the character,
 * the frame's menus when the page has the frame, the markdown, the 🗣 language choice and the downloads. The screens are
 * Lit elements in the page's own DOM (light DOM), like the shell's: the drawer's styles (engine/src/10_base.css,
 * 20_sources_convos.css, 95_shell.css) and the browser suites address their parts by class.
 */
import { LitElement } from 'lit';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { I18n, MessageParams } from '../../../ports/i18n.ts';
import type { TutorSession } from '../application/tutor.ts';
import type { Conversation } from '../domain/conversation.ts';

/** an item of the frame's ⋮ menus (src/composition/shell/dom.ts MenuEntry) */
export interface MenuItem {
  readonly label: string;
  readonly sub?: string;
  readonly icon?: string;
  readonly run: () => void;
}
export interface TutorView {
  readonly session: TutorSession;
  readonly i18n: I18n;
  /** the page has the new frame (the frame's tutor), else the classic drawer */
  framed(): boolean;
  /** a word of the shell's catalog (sh.*) with the tutor's names */
  L(key: string, params?: MessageParams): string;
  /** the character's face as SVG markup ('' without the art) */
  face(): string;
  tutor(): { readonly name: string; readonly avatar: string; readonly plural: boolean };
  accountName(): string;
  subjectTitle(): string;
  /** the AI model the classic header names ('' = automatic) */
  model(): string;
  /** the language of the frame's menus (the page has the subject's) */
  uiLang(): string;
  md(text: string): HTMLElement;
  /** inline markdown → safe HTML (a lesson chip) */
  fmt(text: string): string;
  menuButton(items: () => readonly (MenuItem | null)[], label: string): HTMLElement;
  popMenu(anchor: HTMLElement, items: readonly MenuItem[]): void;
  closePops(): void;
  /** 🗣 the language of the AI conversations: [value, label] ('' = automatic) */
  chatLangs(): readonly (readonly [string, string])[];
  chatLangIs(v: string): boolean;
  chatLang(): string;
  setChatLang(v: string): void;
  openSettings(): void;
  openGuide(): void;
  /** the frame's window of every conversation */
  history(): void;
  exportOne(cv: Conversation | null): void;
  exportAll(): void;
  copy(text: string): Promise<boolean>;
  toast(text: string, ms?: number): void;
}

/** The base of the tutor's elements: light DOM, drawn again whenever the session changes. */
export class TutorElement extends LitElement {
  static override properties = { view: { attribute: false } };
  declare view: TutorView | undefined;
  #stop: Unsubscribe | null = null;
  #watched: TutorView | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.#watch();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stop?.();
    this.#stop = null;
    this.#watched = undefined;
  }
  protected override willUpdate(): void {
    if (this.view !== this.#watched) this.#watch();
  }
  #watch(): void {
    this.#stop?.();
    this.#watched = this.view;
    const v = this.view;
    this.#stop = v
      ? v.session.subscribe(() => {
          this.requestUpdate();
        })
      : null;
  }
  protected t(key: string, params?: MessageParams): string {
    return this.view?.i18n.t(key, params) ?? key;
  }
}
