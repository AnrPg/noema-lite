/**
 * The base of the small elements the older pages put into their own markup (🌐 a translation toggle, 文A a word's card, 👁
 * the file viewer): a LitElement drawn in the light DOM, so the page's sheets (engine/engine.css) and the browser suites
 * read the classes they always read; built with its port (`new X(port)`), so it speaks the app's words before it is on the
 * page; drawn at once (`redraw()`), so a caller reads what it drew in the same task. It follows a change of the interface
 * language while it is on the page.
 */
import { LitElement } from 'lit';
import type { Unsubscribe } from '../../../ports/common.ts';
import type { I18n, MessageParams } from '../../../ports/i18n.ts';

export abstract class LightElement extends LitElement {
  protected readonly i18n: I18n;
  #stop: Unsubscribe | null = null;

  constructor(i18n: I18n) {
    super();
    this.i18n = i18n;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#stop ??= this.i18n.onChange(() => {
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stop?.();
    this.#stop = null;
  }

  protected t(key: string, params?: MessageParams): string {
    return this.i18n.t(key, params);
  }

  /** draws now (also before the element is on the page) */
  redraw(): this {
    this.requestUpdate();
    this.performUpdate();
    return this;
  }

  /** Built with its port, so the browser cannot make one bare: a copy (the ⚑ report's screenshot clones the page) is a
      plain element with the same attributes and content. */
  override cloneNode(deep = false): Node {
    const c = this.ownerDocument.createElement('span');
    for (const a of Array.from(this.attributes)) c.setAttribute(a.name, a.value);
    if (deep) for (const k of Array.from(this.childNodes)) c.append(k.cloneNode(true));
    return c;
  }
}

/** Defines an element once (a second define of the same tag is skipped: the page keeps one class per tag). */
export function defineOnce(registry: CustomElementRegistry | undefined, tag: string, ctor: CustomElementConstructor): void {
  if (registry && !registry.get(tag)) registry.define(tag, ctor);
}

/** A language's name in the interface language ('el' → "Greek"), or the tag. */
export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag; // a tag Intl does not know: shown as it is
  }
}
