/* WCAG 2 contrast of the token sets: which text token is read on which surface token, and the arithmetic that checks it
   (tokens.test.ts runs it over every character in light and dark, so no theme can drop below the minimum). */
import type { Palette } from './types.ts';

/** WCAG 2.x 1.4.3: normal text needs 4.5:1 (large text and UI components 3:1; every text token here is used at normal sizes) */
export const TEXT_MIN = 4.5;

/** the surfaces of a character's screens: its palette's backgrounds and bg2, the soft background the bridge mixes (css.ts BRIDGE) */
export type Surface = 'bg' | 'paper' | 'bg2' | 'line' | 'acc' | 'accSoft' | 't1' | 't2' | 't3' | 't4';
const ALL: readonly Surface[] = ['bg', 'paper', 'bg2', 'accSoft', 't1', 't2', 't3', 't4'];
/** the line colour is also the track of the tab bar (95_shell.css body.ns-on .tabs): its tabs' words are ink and ink2 */
const WITH_LINE: readonly Surface[] = [...ALL, 'line'];

/** every text token and the surfaces it is read on (the CSS of engine/src/*.css: inks on any surface, a tint's ink on its tint and on
    the plain surfaces, the accent's ink on the accent) */
export const TEXT_ON: readonly { readonly text: keyof Palette; readonly on: readonly Surface[] }[] = [
  { text: 'ink', on: WITH_LINE },
  { text: 'ink2', on: WITH_LINE },
  { text: 'ink3', on: ALL },
  { text: 't1i', on: ['t1', 'accSoft', 'bg', 'paper'] },
  { text: 't2i', on: ['t2', 'bg', 'paper'] },
  { text: 't3i', on: ['t3', 'bg', 'paper'] },
  { text: 't4i', on: ['t4', 'bg', 'paper'] },
  { text: 'accInk', on: ['acc'] },
];

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
/** #rrggbb → [r, g, b] (0–255) */
export function rgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [parseInt(m[1] ?? '', 16), parseInt(m[2] ?? '', 16), parseInt(m[3] ?? '', 16)];
}
/** the relative luminance of WCAG 2 */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** the contrast ratio of two colours (1–21) */
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** color-mix(in srgb, a p%, b): what the browser paints, rounded to #rrggbb */
export function mixSrgb(a: string, b: string, p: number): string {
  const x = rgb(a),
    y = rgb(b);
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v * p + (y[i] ?? 0) * (1 - p))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
/** a surface of a palette as a colour */
export function surface(p: Palette, s: Surface): string {
  return s === 'bg2' ? mixSrgb(p.line, p.bg, 0.6) : p[s];
}

/** the pairs of a palette below the minimum: "ink3 on bg 2.60" */
export function contrastFailures(p: Palette, min = TEXT_MIN): string[] {
  const out: string[] = [];
  for (const { text, on } of TEXT_ON)
    for (const s of on) {
      const r = contrast(p[text], surface(p, s));
      if (r < min) out.push(`${text} on ${s} ${r.toFixed(2)}`);
    }
  return out;
}
