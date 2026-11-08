/* The design tokens of the app (docs/ARCHITECTURE.md "Design tokens"): typed data, one token set per character (theme and mascot
   in one: engine/themes.js), on top of the base set every screen starts from. css.ts turns them into CSS custom properties
   (engine/tokens.css); nothing else in the app writes a colour, a font or a shape of a character. */

/** a CSS colour as the stylesheet writes it (#rrggbb, rgba(…), color-mix(…)) */
export type Colour = string;
/** a CSS length (14px, 50%, 999px, an elliptical border-radius such as "48% 52% 46% 54% / 55% 50% 50% 45%") */
export type Length = string;

/** the palette of a character, in one scheme (light or dark): what its screens are painted with */
export interface Palette {
  readonly bg: Colour;
  /** cards and sheets */
  readonly paper: Colour;
  readonly ink: Colour;
  readonly ink2: Colour;
  readonly ink3: Colour;
  readonly line: Colour;
  /** the accent, the text on it, and its soft background */
  readonly acc: Colour;
  readonly accInk: Colour;
  readonly accSoft: Colour;
  /** four tints, each a background and its ink: 1 good, 2 warning, 3 bad, 4 information */
  readonly t1: Colour;
  readonly t1i: Colour;
  readonly t2: Colour;
  readonly t2i: Colour;
  readonly t3: Colour;
  readonly t3i: Colour;
  readonly t4: Colour;
  readonly t4i: Colour;
  /** the still landscape */
  readonly deco1: Colour;
  readonly deco2: Colour;
  readonly deco3: Colour;
}
export const PALETTE_KEYS = ['bg', 'paper', 'ink', 'ink2', 'ink3', 'line', 'acc', 'accInk', 'accSoft', 't1', 't1i', 't2', 't2i', 't3', 't3i', 't4', 't4i', 'deco1', 'deco2', 'deco3'] as const satisfies readonly (keyof Palette)[];

/** the typography of a character: its display face (titles), a display face for Cyrillic when the first has none, its body face */
export interface CharacterType {
  readonly display: string;
  readonly displayRu: string | null;
  readonly body: string;
  readonly displayWeight: number;
  readonly displayStyle: 'normal' | 'italic';
}
/** the shape of a character: cards, buttons, icon tiles, the stroke of its drawings and their line caps */
export interface CharacterShape {
  readonly radius: Length;
  readonly buttonRadius: Length;
  readonly iconRadius: Length;
  readonly stroke: string;
  readonly cap: 'round' | 'square';
}
/** one character's token set */
export interface CharacterTokens {
  readonly type: CharacterType;
  readonly shape: CharacterShape;
  readonly light: Palette;
  readonly dark: Palette;
}

/** the colours of the base set (the screens before a character is applied, and the tokens every older rule reads) */
export interface BaseColours {
  readonly bg: Colour;
  readonly bg2: Colour;
  readonly card: Colour;
  readonly ink: Colour;
  readonly ink2: Colour;
  readonly ink3: Colour;
  readonly line: Colour;
  readonly ok: Colour;
  readonly okBg: Colour;
  readonly bad: Colour;
  readonly badBg: Colour;
  readonly warn: Colour;
  readonly warnBg: Colour;
  readonly info: Colour;
  readonly infoBg: Colour;
  readonly violet: Colour;
  readonly violetBg: Colour;
  /** the accent of the older screens */
  readonly c: Colour;
  readonly cBg: Colour;
  readonly codeBg: Colour;
  readonly codeInk: Colour;
}
/** the base set: colours (light, and what dark changes), typography, spacing, radius, shadow, motion, z-index */
export interface BaseTokens {
  readonly colour: { readonly light: BaseColours; readonly dark: Partial<BaseColours> };
  readonly typography: { readonly font: string; readonly mono: string; readonly system: string };
  /** the spacing scale (px) */
  readonly space: Readonly<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', Length>>;
  readonly radius: { readonly r: Length; readonly rSm: Length };
  readonly shadow: { readonly light: string; readonly dark: string };
  /** durations and easings */
  readonly motion: Readonly<Record<'fast' | 'base' | 'slow' | 'view', string>> & { readonly ease: string; readonly spring: string };
  /** the stacking layers, bottom to top */
  readonly z: Readonly<Record<'tabs' | 'bar' | 'sticky' | 'top' | 'fx' | 'drawer' | 'modal' | 'toast' | 'tip' | 'popover' | 'confetti' | 'overlay', number>>;
}
