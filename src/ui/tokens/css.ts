/* The token sets as CSS custom properties: engine/tokens.css (generated, never committed: tools/tokens.mjs writes it on every build of tools/esbuild.mjs).
     :root …                 the base set (light; dark by the app's setting or, unset, the system's)
     [data-m="<character>"]  each character's set: its palette, fonts and shape; dark the same way; every element with data-m wears
                             its own character (the gallery shows each in its own clothes); --swatch1…5 its light accent and tints
     [data-m]                the older tokens mapped onto the character's palette (BRIDGE): every existing screen picks it up
     [data-ci="<n>"]         a chapter's colours (chapters.ts), light and dark
   Derived colours (contrast.ts): --acc-text, the accent as TEXT (links, a word in the accent: the accent itself where it
   reads at 4.5:1 on bg, paper, bg2 and acc-soft, else mixed with the ink until it does) — not --acc-ink, the text ON the
   accent; --<c|violet|ok|warn|bad|info>-fill and -on, a colour as a fill and the text on it (fillFor; a character: its tint
   ink under its paper). */
import { BASE } from './base.ts';
import { chaptersCss } from './chapters.ts';
import { CHARACTERS, CHARACTER_IDS } from './characters.ts';
import { derived, fillFor } from './contrast.ts';
import { PALETTE_KEYS, type BaseColours, type CharacterTokens, type Palette } from './types.ts';

const kebab = (k: string): string => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const q = (f: string): string => `"${f}"`;
const decl = (entries: readonly (readonly [string, string | number])[]): string => entries.map(([k, v]) => `--${k}:${v}`).join(';');

/** the colours of the base set that are also fills under text: each gets --<name>-fill and --<name>-on (fillFor) */
export const FILLS = ['c', 'violet', 'ok', 'bad', 'warn', 'info'] as const;
/** a scheme's colours, and the fills derived from them when the scheme sets them */
function baseColours(c: Partial<BaseColours>): [string, string][] {
  const out: [string, string][] = Object.entries(c).map(([k, v]) => [kebab(k), v]);
  for (const name of FILLS) {
    const col = c[name];
    if (col) {
      const f = fillFor(col);
      out.push([name + '-fill', f.fill], [name + '-on', f.on]);
    }
  }
  return out;
}
/** the base set: light on :root, dark on :root[data-theme="dark"] and, unless the app says light, when the system is dark */
export function baseCss(): string {
  const b = BASE;
  const light = decl([
    ...baseColours(b.colour.light),
    ['shadow', b.shadow.light],
    ['r', b.radius.r],
    ['r-sm', b.radius.rSm],
    ['font', b.typography.font],
    ['mono', b.typography.mono],
    ...Object.entries(b.space).map(([k, v]): [string, string] => ['space-' + k, v]),
    ...(['fast', 'base', 'slow', 'view'] as const).map((k): [string, string] => ['motion-' + k, b.motion[k]]),
    ['ease', b.motion.ease],
    ['spring', b.motion.spring],
    ...Object.entries(b.z).map(([k, v]): [string, number] => ['z-' + k, v]),
  ]);
  const dark = decl([...baseColours(b.colour.dark), ['shadow', b.shadow.dark]]);
  return `:root{${light}}\n:root[data-theme="dark"]{${dark}}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}\n`;
}

/** one character in one scheme: its palette, fonts and shape */
function characterVars(t: CharacterTokens, dark: boolean): string {
  const p: Palette = dark ? t.dark : t.light,
    s = t.shape,
    y = t.type,
    sys = BASE.typography.system;
  const display = [q(y.display), y.displayRu ? q(y.displayRu) : null, q(y.body), sys].filter(Boolean).join(',');
  return PALETTE_KEYS.map(k => `--${kebab(k)}:${p[k]}`)
    .concat([
      `--acc-text:${derived(p).accText}`,
      `--display:${display}`,
      `--font:${q(y.body)},${sys}`,
      `--dw:${y.displayWeight}`,
      `--dsty:${y.displayStyle}`,
      `--r:${s.radius}`,
      `--br:${s.buttonRadius}`,
      `--ir:${s.iconRadius}`,
      `--sw:${s.stroke}`,
      `--cap:${s.cap}`,
      `color-scheme:${dark ? 'dark' : 'light'}`,
    ])
    .join(';');
}
/** the older engine tokens, mapped onto the character's palette */
export const BRIDGE =
  '--card:var(--paper);--bg2:color-mix(in srgb,var(--line) 60%,var(--bg));--r-sm:var(--br);' +
  '--ok:var(--t1i);--ok-bg:var(--t1);--bad:var(--t3i);--bad-bg:var(--t3);--warn:var(--t2i);--warn-bg:var(--t2);--info:var(--t4i);--info-bg:var(--t4);' +
  '--violet:var(--acc);--violet-bg:var(--acc-soft);--violet-ink:var(--acc-text);--violet-fill:var(--acc);--violet-on:var(--acc-ink);' +
  '--c:var(--acc);--c-bg:var(--acc-soft);--c-ink:var(--t1i);--c-fill:var(--acc);--c-on:var(--acc-ink);' +
  '--ok-fill:var(--t1i);--ok-on:var(--paper);--warn-fill:var(--t2i);--warn-on:var(--paper);--bad-fill:var(--t3i);--bad-on:var(--paper);--info-fill:var(--t4i);--info-on:var(--paper);' +
  '--shadow:0 1px 2px color-mix(in srgb,var(--ink) 6%,transparent),0 8px 24px -14px color-mix(in srgb,var(--ink) 22%,transparent)';

/** every character's set, then the bridge */
export function charactersCss(): string {
  let out = '';
  for (const m of CHARACTER_IDS) {
    const t: CharacterTokens = CHARACTERS[m],
      L = characterVars(t, false),
      D = characterVars(t, true),
      s = `[data-m="${m}"]`;
    out += `${s}{${L}}\n`;
    out += `@media (prefers-color-scheme:dark){:root:not([data-theme="light"])${s},:root:not([data-theme="light"]) ${s}{${D}}}\n`;
    out += `:root[data-theme="dark"]${s},:root[data-theme="dark"] ${s}{${D}}\n`;
  }
  // the gallery's swatches: the light accent and the four tints, in either scheme
  for (const m of CHARACTER_IDS) {
    const p = CHARACTERS[m].light;
    out += `[data-m="${m}"]{${[p.acc, p.t1, p.t2, p.t3, p.t4].map((c, i) => `--swatch${i + 1}:${c}`).join(';')}}\n`;
  }
  // html[data-m][data-m]: outranks the base set's dark tokens (:root[data-theme=dark] …), so every screen wears the character
  // then the chapters' colours: an element with data-ci wears its chapter, over the bridge's accent
  return out + `[data-m],html[data-m][data-m]{${BRIDGE}}\n` + chaptersCss();
}

/** engine/tokens.css */
export function tokensCss(): string {
  return (
    '/* noema-lite design tokens — GENERATED by tools/tokens.mjs from src/ui/tokens/*.ts. Do not edit. */\n' + baseCss() + charactersCss()
  );
}
