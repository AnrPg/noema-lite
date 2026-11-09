/* The colours of a subject's chapters: chapter n wears colour n % 13 (engine/src/10_core.js setAccent puts data-ci="<n>" on
   the element; nothing else in the app writes a chapter's colour). Each colour gives five tokens, in light and dark:
     --c       the colour itself, for fills, bars, borders and outlines
     --c-bg    its soft background
     --c-ink   the colour as text: INK_SHARE of it, the rest the character's ink, so it reads on every surface (tokens.test.ts)
     --c-fill  the colour as a fill under text, and --c-on the text on it (fillFor in contrast.ts: ≥ 4.5:1, nearly always
               the colour itself) */
import { fillFor, mixSrgb } from './contrast.ts';

/** the light colours and their soft backgrounds, in chapter order */
export const CHAPTER_LIGHT: readonly (readonly [colour: string, bg: string])[] = [
  ['#ff6b6b', '#ffe7e7'],
  ['#ff922b', '#fff0e1'],
  ['#f2a20c', '#fff4d6'],
  ['#40c057', '#e4f7e8'],
  ['#12b5a5', '#ddf6f3'],
  ['#3b9cf6', '#e1effe'],
  ['#5c6cff', '#e8eaff'],
  ['#9254ff', '#f0e7ff'],
  ['#e64fa5', '#fde6f3'],
  ['#f0563d', '#fde9e4'],
  ['#2b8a3e', '#e3f4e6'],
  ['#1c7ed6', '#dfeefc'],
  ['#d9480f', '#ffe8d9'],
];
/** the dark colours, in the same order (their soft background: DARK_BG_SHARE of the colour on DARK_SURFACE) */
export const CHAPTER_DARK: readonly string[] = [
  '#ff8787',
  '#ffa94d',
  '#ffc53d',
  '#69db7c',
  '#38d9c6',
  '#5fb0ff',
  '#8291ff',
  '#b083ff',
  '#f783c6',
  '#ff8a6e',
  '#51cf66',
  '#4dabf7',
  '#ff8c42',
];
export const DARK_SURFACE = '#1f232e';
export const DARK_BG_SHARE = 0.18;
/** the share of the colour in --c-ink (the rest: the character's ink) */
export const INK_SHARE = 0.45;

/** one chapter colour in one scheme */
export interface ChapterColour {
  readonly c: string;
  readonly bg: string;
  readonly fill: string;
  readonly on: string;
}
/** chapter colour i (0–12) in light or dark */
export function chapterColour(i: number, dark: boolean): ChapterColour {
  const n = CHAPTER_LIGHT.length,
    k = ((i % n) + n) % n;
  const [light, lightBg] = CHAPTER_LIGHT[k] ?? ['#7c5cff', '#efebff'];
  const c = dark ? (CHAPTER_DARK[k] ?? light) : light;
  const bg = dark ? mixSrgb(c, DARK_SURFACE, DARK_BG_SHARE) : lightBg;
  return { c, bg, ...fillFor(c) };
}

/** the CSS of the chapter colours: light on [data-ci], dark by the app's setting or, unset, the system's */
export function chaptersCss(): string {
  const vars = (x: ChapterColour): string =>
    `--c:${x.c};--c-bg:${x.bg};--c-ink:color-mix(in srgb,${x.c} ${Math.round(INK_SHARE * 100)}%,var(--ink));--c-fill:${x.fill};--c-on:${x.on}`;
  const rules = (dark: boolean, scope: string): string =>
    CHAPTER_LIGHT.map((_, i) => `${scope}[data-ci="${i}"]{${vars(chapterColour(i, dark))}}\n`).join('');
  return (
    rules(false, '') +
    `@media (prefers-color-scheme:dark){\n${rules(true, ':root:not([data-theme="light"]) ')}}\n` +
    rules(true, ':root[data-theme="dark"] ')
  );
}
