/**
 * The base class of every component of the kit: a LitElement that finds its services (services.ts) when it is connected,
 * draws again when the interface language changes, and speaks only through the catalogs (`this.t('ui.…')`, the keys of
 * i18n/ui/en.arb). Components declare their reactive properties with `static properties` and `declare` fields (no
 * decorators: the unit tests run the TypeScript as it is written, through Node's type stripping).
 */
import { LitElement } from 'lit';
import type { Unsubscribe } from '../../ports/common.ts';
import type { I18n, MessageParams, TextDirection } from '../../ports/i18n.ts';
import { FALLBACK_SERVICES } from './fallback.ts';
import { requestServices, type UiServices } from './services.ts';

export class NoemaElement extends LitElement {
  #services: UiServices | null = null;
  #stop: Unsubscribe | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#services = requestServices(this) ?? FALLBACK_SERVICES;
    this.#stop = this.#services.i18n.onChange(() => {
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stop?.();
    this.#stop = null;
  }

  /** The services of the app this element is in (the fallback's while it is not connected). */
  protected get services(): UiServices {
    return this.#services ?? requestServices(this) ?? FALLBACK_SERVICES;
  }

  protected get i18n(): I18n {
    return this.services.i18n;
  }

  /** A message of the catalogs in the interface language. */
  protected t(key: string, params?: MessageParams): string {
    return this.i18n.t(key, params);
  }

  /** The direction of the interface language (arrow keys and placement follow it). */
  protected get uiDir(): TextDirection {
    return this.i18n.dir();
  }

  /** Dispatches a bubbling, composed CustomEvent; → false when a listener cancelled it. */
  protected emit(type: string, detail?: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }
}
