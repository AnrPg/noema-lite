/* The design tokens (src/ui/tokens): the typed token sets and their CSS (engine/tokens.css). */
export type { BaseColours, BaseTokens, CharacterShape, CharacterTokens, CharacterType, Colour, Length, Palette } from './types.ts';
export { PALETTE_KEYS } from './types.ts';
export { BASE } from './base.ts';
export { CHARACTERS, CHARACTER_IDS, type CharacterId } from './characters.ts';
export { BRIDGE, FILLS, baseCss, charactersCss, tokensCss } from './css.ts';
export {
  ACC_TEXT_ON,
  GOLD_SEED,
  GRAPHIC_MIN,
  ON_DARK,
  ON_LIGHT,
  TEXT_MIN,
  TEXT_ON,
  contrast,
  contrastFailures,
  derived,
  fillFor,
  goldFor,
  luminance,
  mixSrgb,
  surface,
  textOn,
  type Fill,
  type Surface,
} from './contrast.ts';
export {
  CHAPTER_DARK,
  CHAPTER_LIGHT,
  DARK_BG_SHARE,
  DARK_SURFACE,
  INK_SHARE,
  chapterColour,
  chaptersCss,
  type ChapterColour,
} from './chapters.ts';
