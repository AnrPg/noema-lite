import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BASE, CHARACTERS, CHARACTER_IDS, PALETTE_KEYS, baseCss, tokensCss } from './index.ts';

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

test('the CSS sets the base set on :root, its dark set twice (the app\'s setting, the system\'s) and every character with its swatches', () => {
  const base = baseCss();
  assert.ok(base.startsWith(`:root{--bg:${BASE.colour.light.bg};`));
  assert.ok(base.includes(`:root[data-theme="dark"]{--bg:${BASE.colour.dark.bg};`));
  assert.ok(base.includes(`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:${BASE.colour.dark.bg};`));
  const css = tokensCss();
  for (const id of CHARACTER_IDS) {
    assert.ok(css.includes(`[data-m="${id}"]{--bg:${CHARACTERS[id].light.bg};`), id);
    assert.ok(css.includes(`:root[data-theme="dark"][data-m="${id}"],:root[data-theme="dark"] [data-m="${id}"]{--bg:${CHARACTERS[id].dark.bg};`), id);
    assert.ok(css.includes(`[data-m="${id}"]{--swatch1:${CHARACTERS[id].light.acc};`), id);
  }
});
