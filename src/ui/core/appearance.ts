/**
 * The appearance of the app, applied from the design tokens (src/ui/tokens): the colour scheme (light, dark, or the
 * system's), the character — the mascot, whose token set is the whole look: palette, fonts, shapes (data-m on the root,
 * the rules of engine/tokens.css) —, the amount of motion, and the reading direction of the interface language.
 *
 *   const stop = applyAppearance(document.documentElement, { scheme: 'system', character: 'owl', motion: 'system' });
 *
 * What it writes on the root: data-theme (light | dark; none for the system's), data-m (the character),
 * data-motion (reduced | full; none for the system's); the browser's theme-color (<meta name="theme-color">) follows the
 * character's background in the scheme on screen, also when the system switches. A small stylesheet on the document
 * turns those into the kit's switches (--u-motion, --u-flip). The token stylesheet itself (engine/tokens.css) is linked
 * by the page.
 */
import type { Unsubscribe } from '../../ports/common.ts';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../tokens/characters.ts';

export type Scheme = 'system' | 'light' | 'dark';
export type Motion = 'system' | 'reduced' | 'full';

export interface Appearance {
  readonly scheme: Scheme;
  readonly character: CharacterId;
  readonly motion: Motion;
}

/** the character a learner who has not chosen sees (engine/themes.js DEFAULT) */
export const DEFAULT_CHARACTER: CharacterId = 'hedge';
export const DEFAULT_APPEARANCE: Appearance = { scheme: 'system', character: DEFAULT_CHARACTER, motion: 'system' };

export const isCharacter = (x: unknown): x is CharacterId => typeof x === 'string' && (CHARACTER_IDS as readonly string[]).includes(x);

/** the kit's switches, from the root's attributes and the system's preferences */
export const SWITCHES_CSS = `:root{--u-motion:1;--u-flip:1}
:root[dir="rtl"]{--u-flip:-1}
@media (prefers-reduced-motion:reduce){:root:not([data-motion="full"]){--u-motion:0}}
:root[data-motion="reduced"]{--u-motion:0}`;
const SWITCHES_ID = 'noema-ui-switches';

/** The scheme on screen now: the app's choice, else the system's. */
export function resolvedScheme(scheme: Scheme, win: Pick<Window, 'matchMedia'> | null): 'light' | 'dark' {
  if (scheme !== 'system') return scheme;
  return win?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme-color of a character in a scheme (its palette's background). */
export const themeColour = (character: CharacterId, scheme: 'light' | 'dark'): string => CHARACTERS[character][scheme].bg;

function setData(el: HTMLElement, key: string, value: string | null): void {
  if (value === null) el.removeAttribute(`data-${key}`);
  else if (el.getAttribute(`data-${key}`) !== value) el.setAttribute(`data-${key}`, value);
}

/** Applies an appearance to the root (and keeps theme-color right while the system's scheme changes); → stops that. */
export function applyAppearance(root: HTMLElement, a: Appearance): Unsubscribe {
  const doc = root.ownerDocument,
    win = doc.defaultView;
  if (!doc.getElementById(SWITCHES_ID)) {
    const style = doc.createElement('style');
    style.id = SWITCHES_ID;
    style.textContent = SWITCHES_CSS;
    doc.head.append(style);
  }
  const character = isCharacter(a.character) ? a.character : DEFAULT_CHARACTER;
  setData(root, 'theme', a.scheme === 'system' ? null : a.scheme);
  setData(root, 'm', character);
  setData(root, 'motion', a.motion === 'system' ? null : a.motion);
  const paint = (): void => {
    const colour = themeColour(character, resolvedScheme(a.scheme, win));
    let metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    if (!metas.length) {
      const m = doc.createElement('meta');
      m.name = 'theme-color';
      doc.head.append(m);
      metas = [m];
    }
    for (const m of metas) {
      m.content = colour;
      m.removeAttribute('media'); // one colour: the scheme on screen (the page's per-scheme pair is for before the app ran)
    }
  };
  paint();
  const mq = a.scheme === 'system' ? win?.matchMedia('(prefers-color-scheme: dark)') : undefined;
  mq?.addEventListener('change', paint);
  return () => {
    mq?.removeEventListener('change', paint);
  };
}
