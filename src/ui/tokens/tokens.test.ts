import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  BASE,
  CHARACTERS,
  CHARACTER_IDS,
  PALETTE_KEYS,
  TEXT_MIN,
  baseCss,
  contrast,
  contrastFailures,
  mixSrgb,
  surface,
  tokensCss,
} from './index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HEX = /^#[0-9a-f]{6}$/i;

test('the characters are those of engine/themes.js, in its order, each with a full palette in light and dark', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'themes.js'), 'utf8');
  const data = /const DATA = (\{[^;]*\});/.exec(src)?.[1];
  assert.ok(data, 'themes.js has DATA');
  assert.deepEqual(Object.keys(vm.runInNewContext(`(${data})`) as object), CHARACTER_IDS);
  for (const id of CHARACTER_IDS) {
    for (const scheme of ['light', 'dark'] as const) {
      const p = CHARACTERS[id][scheme] as Readonly<Record<string, string>>;
      assert.deepEqual(Object.keys(p).sort(), [...PALETTE_KEYS].sort(), `${id} ${scheme}`);
      for (const k of PALETTE_KEYS) assert.match(p[k] ?? '', HEX, `${id} ${scheme} ${k}`);
    }
  }
});

test("the CSS sets the base set on :root, its dark set twice (the app's setting, the system's) and every character with its swatches", () => {
  const base = baseCss();
  assert.ok(base.startsWith(`:root{--bg:${BASE.colour.light.bg};`));
  assert.ok(base.includes(`:root[data-theme="dark"]{--bg:${BASE.colour.dark.bg};`));
  assert.ok(base.includes(`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:${BASE.colour.dark.bg};`));
  const css = tokensCss();
  for (const id of CHARACTER_IDS) {
    assert.ok(css.includes(`[data-m="${id}"]{--bg:${CHARACTERS[id].light.bg};`), id);
    assert.ok(
      css.includes(`:root[data-theme="dark"][data-m="${id}"],:root[data-theme="dark"] [data-m="${id}"]{--bg:${CHARACTERS[id].dark.bg};`),
      id,
    );
    assert.ok(css.includes(`[data-m="${id}"]{--swatch1:${CHARACTERS[id].light.acc};`), id);
  }
});

test('every text token reads at 4.5:1 on each surface it is used on, for every character in light and dark (WCAG 1.4.3)', () => {
  const bad: string[] = [];
  for (const id of CHARACTER_IDS)
    for (const scheme of ['light', 'dark'] as const)
      for (const f of contrastFailures(CHARACTERS[id][scheme])) bad.push(`${id} ${scheme}: ${f}`);
  assert.deepEqual(bad, []);
});

test('the base set: its inks and its accent ink read at 4.5:1 on its surfaces, in light and dark', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const c = { ...BASE.colour.light, ...(scheme === 'dark' ? BASE.colour.dark : {}) };
    for (const text of ['ink', 'ink2', 'ink3', 'cInk'] as const)
      for (const on of text === 'cInk' ? (['bg', 'bg2', 'card', 'cBg'] as const) : (['bg', 'bg2', 'card'] as const))
        assert.ok(contrast(c[text], c[on]) >= TEXT_MIN, `${scheme} ${text} on ${on}: ${contrast(c[text], c[on]).toFixed(2)}`);
  }
});

test("a chapter's colour as text (--c-ink of engine/src/10_core.js) reads at 4.5:1 on every surface of every character", () => {
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '10_core.js'), 'utf8');
  const grab = (re: RegExp): unknown => vm.runInNewContext(`(${re.exec(src)?.[1] ?? 'null'})`);
  const light = grab(/const PALETTE = (\[[\s\S]*?\]\]);/) as [string, string][];
  const dark = grab(/const PALETTE_DARK = (\[[^\]]*\]);/) as string[];
  const share = Number(/const C_INK_SHARE = (\d+)/.exec(src)?.[1]) / 100,
    darkBg = /C_BG_DARK = '(#[0-9a-f]{6})'/i.exec(src)?.[1] ?? '';
  assert.ok(
    light.length > 0 && light.length === dark.length && share > 0 && HEX.test(darkBg),
    '10_core.js: PALETTE, PALETTE_DARK, C_INK_SHARE, C_BG_DARK',
  );
  const bad: string[] = [];
  for (const id of CHARACTER_IDS)
    for (const scheme of ['light', 'dark'] as const) {
      const p = CHARACTERS[id][scheme];
      light.forEach(([c0, bg0], i) => {
        const c = scheme === 'dark' ? (dark[i] ?? '') : c0,
          cBg = scheme === 'dark' ? mixSrgb(c, darkBg, 0.18) : bg0,
          ink = mixSrgb(c, p.ink, share);
        const on: [string, string][] = [
          ['bg', p.bg],
          ['paper', p.paper],
          ['bg2', surface(p, 'bg2')],
          ['c-bg', cBg],
        ];
        for (const [name, col] of on)
          if (contrast(ink, col) < TEXT_MIN) bad.push(`${id} ${scheme} chapter colour ${i} on ${name}: ${contrast(ink, col).toFixed(2)}`);
      });
    }
  assert.deepEqual(bad, []);
});
