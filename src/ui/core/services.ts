/**
 * What the components need from the core, handed to them by their root (src/composition/ui.ts; a test's fakes): the
 * I18n port for every word and the locale's direction, the Clock port for every timer, and the list of the interface
 * languages the learner may switch to. Components never import an adapter: they ask the nearest provider in the DOM for
 * these services with a bubbling, composed `noema-ui-services` event (the context protocol, also across shadow roots).
 *
 *   provideServices(document.body, services);         // the root, once, on the element that holds the app
 *   requestServices(el) → UiServices | null           // a component, when it is connected
 */
import type { Clock } from '../../ports/clock.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { I18n, TextDirection } from '../../ports/i18n.ts';

/** One interface language the learner may choose: its BCP 47 tag, its own name (an endonym, never a flag), its direction. */
export interface LocaleInfo {
  readonly tag: string;
  readonly name: string;
  readonly dir: TextDirection;
}
/** The interface languages of the app and the switch between them (the I18n port tells the locale once it changed). */
export interface Locales {
  list(): readonly LocaleInfo[];
  /** Switches the interface language; resolves with the locale in use afterwards (the device's when the tag is not offered). */
  use(tag: string): Promise<string>;
}

export interface UiServices {
  readonly i18n: I18n;
  readonly clock: Clock;
  readonly locales: Locales;
}

export const SERVICES_EVENT = 'noema-ui-services';

/** The detail of a services request: the provider fills `services`. */
export interface ServicesRequest {
  services: UiServices | null;
}

/** Answers every services request that bubbles up to `host` (the nearest provider wins). */
export function provideServices(host: EventTarget, services: UiServices): Unsubscribe {
  const answer = (e: Event): void => {
    const detail = (e as CustomEvent<ServicesRequest>).detail;
    if (detail.services) return;
    detail.services = services;
    e.stopPropagation();
  };
  host.addEventListener(SERVICES_EVENT, answer);
  return () => {
    host.removeEventListener(SERVICES_EVENT, answer);
  };
}

/** The services of the nearest provider above `el` (null when there is none: the element is not in an app). */
export function requestServices(el: EventTarget): UiServices | null {
  const detail: ServicesRequest = { services: null };
  el.dispatchEvent(new CustomEvent<ServicesRequest>(SERVICES_EVENT, { detail, bubbles: true, composed: true }));
  return detail.services;
}
