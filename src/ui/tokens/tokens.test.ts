import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ACC_TEXT_ON,
  BASE,
  BRIDGE,
  CHAPTER_DARK,
  CHAPTER_LIGHT,
  CHARACTERS,
  CHARACTER_IDS,
  FILLS,
  PALETTE_KEYS,
  INK_SHARE,
  ON_DARK,
  ON_LIGHT,
  TEXT_MIN,
  baseCss,
  chapterColour,
  contrast,
  contrastFailures,
  derived,
  fillFor,
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

test('the base set: its inks, its accent inks and the text on its accents read at 4.5:1 on its surfaces, in light and dark', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const c = { ...BASE.colour.light, ...(scheme === 'dark' ? BASE.colour.dark : {}) };
    for (const text of ['ink', 'ink2', 'ink3', 'cInk', 'violetInk'] as const)
      for (const on of text === 'cInk'
        ? (['bg', 'bg2', 'card', 'cBg'] as const)
        : text === 'violetInk'
          ? (['bg', 'bg2', 'card', 'violetBg'] as const)
          : (['bg', 'bg2', 'card'] as const))
        assert.ok(contrast(c[text], c[on]) >= TEXT_MIN, `${scheme} ${text} on ${on}: ${contrast(c[text], c[on]).toFixed(2)}`);
    for (const k of FILLS) {
      const f = fillFor(c[k]);
      assert.ok(contrast(f.on, f.fill) >= TEXT_MIN, `${scheme} --${k}-on on --${k}-fill`);
      if (scheme === 'light') assert.ok(baseCss().includes(`--${k}-fill:${f.fill};--${k}-on:${f.on}`), `base --${k}-fill`);
    }
  }
});

test('every chapter colour, for every character in light and dark: as text (--c-ink) on every surface, and its fill with its text (--c-fill, --c-on)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'engine', 'src', '10_core.js'), 'utf8');
  assert.equal(
    Number(/const CHAPTER_COLOURS = (\d+);/.exec(src)?.[1]),
    CHAPTER_LIGHT.length,
    '10_core.js CHAPTER_COLOURS = the colours of chapters.ts',
  );
  assert.equal(CHAPTER_DARK.length, CHAPTER_LIGHT.length);
  const bad: string[] = [];
  for (const id of CHARACTER_IDS)
    for (const scheme of ['light', 'dark'] as const) {
      const p = CHARACTERS[id][scheme];
      CHAPTER_LIGHT.forEach((_, i) => {
        const ch = chapterColour(i, scheme === 'dark'),
          ink = mixSrgb(ch.c, p.ink, INK_SHARE);
        const on: [string, string][] = [
          ['bg', p.bg],
          ['paper', p.paper],
          ['bg2', surface(p, 'bg2')],
          ['c-bg', ch.bg],
        ];
        for (const [name, col] of on)
          if (contrast(ink, col) < TEXT_MIN) bad.push(`${id} ${scheme} chapter colour ${i} on ${name}: ${contrast(ink, col).toFixed(2)}`);
        if (contrast(ch.on, ch.fill) < TEXT_MIN)
          bad.push(`${id} ${scheme} chapter ${i}: --c-on on --c-fill ${contrast(ch.on, ch.fill).toFixed(2)}`);
      });
      // a screen without a chapter: --c is the accent, --c-fill/--c-on the accent and its ink (the bridge)
      if (contrast(p.accInk, p.acc) < TEXT_MIN) bad.push(`${id} ${scheme}: acc-ink on acc`);
    }
  assert.deepEqual(bad, []);
});

test('the chapter colours stay themselves as fills: --c-fill is the colour, or the colour darkened by at most 15 %', () => {
  for (const dark of [false, true])
    CHAPTER_LIGHT.forEach((_, i) => {
      const ch = chapterColour(i, dark);
      const near = [...Array(16).keys()].some(k => mixSrgb(ch.c, '#000000', 1 - k / 100) === ch.fill);
      assert.ok(near, `${dark ? 'dark' : 'light'} ${i}: ${ch.c} → ${ch.fill}`);
    });
});

test('fillFor: white, else the dark ink, else white on the colour darkened just enough; always ≥ 4.5:1', () => {
  assert.deepEqual(fillFor('#1c1c1c'), { fill: '#1c1c1c', on: ON_LIGHT });
  assert.deepEqual(fillFor('#ffc53d'), { fill: '#ffc53d', on: ON_DARK });
  const mid = fillFor('#7c5cff');
  assert.equal(mid.on, ON_LIGHT);
  assert.notEqual(mid.fill, '#7c5cff');
  assert.ok(contrast(mid.on, mid.fill) >= TEXT_MIN);
  for (let v = 0; v < 256; v += 5) {
    const g = '#' + v.toString(16).padStart(2, '0').repeat(3),
      f = fillFor(g);
    assert.ok(contrast(f.on, f.fill) >= TEXT_MIN, g);
  }
});

test('the accent as text (--acc-text) is the accent where it reads, and the CSS writes it for every character', () => {
  const css = tokensCss();
  for (const id of CHARACTER_IDS)
    for (const scheme of ['light', 'dark'] as const) {
      const p = CHARACTERS[id][scheme],
        t = derived(p).accText;
      for (const s of ACC_TEXT_ON) assert.ok(contrast(t, surface(p, s)) >= TEXT_MIN, `${id} ${scheme} acc-text on ${s}`);
      if (ACC_TEXT_ON.every(s => contrast(p.acc, surface(p, s)) >= TEXT_MIN)) assert.equal(t, p.acc, `${id} ${scheme}`);
      assert.ok(css.includes(`--acc-text:${t};`), `${id} ${scheme} in the CSS`);
    }
  for (const v of [
    '--violet-ink:var(--acc-text)',
    '--c-fill:var(--acc)',
    '--c-on:var(--acc-ink)',
    '--violet-fill:var(--acc)',
    '--violet-on:var(--acc-ink)',
    '--ok-fill:var(--t1i);--ok-on:var(--paper)',
    '--warn-fill:var(--t2i);--warn-on:var(--paper)',
    '--bad-fill:var(--t3i);--bad-on:var(--paper)',
    '--info-fill:var(--t4i);--info-on:var(--paper)',
  ])
    assert.ok(BRIDGE.includes(v), v);
  // a tint's ink as a fill under the paper (--ok-fill/--ok-on …): the pair TEXT_ON checks (tXi on paper), here for every character
  for (const id of CHARACTER_IDS)
    for (const scheme of ['light', 'dark'] as const) {
      const p = CHARACTERS[id][scheme];
      for (const t of ['t1i', 't2i', 't3i', 't4i'] as const)
        assert.ok(contrast(p.paper, p[t]) >= TEXT_MIN, `${id} ${scheme} paper on ${t}`);
    }
  for (let i = 0; i < CHAPTER_LIGHT.length; i++) {
    const l = chapterColour(i, false),
      d = chapterColour(i, true);
    assert.ok(css.includes(`[data-ci="${i}"]{--c:${l.c};--c-bg:${l.bg};`), `chapter ${i} light`);
    assert.ok(css.includes(`:root[data-theme="dark"] [data-ci="${i}"]{--c:${d.c};`), `chapter ${i} dark`);
    assert.ok(css.includes(`:root:not([data-theme="light"]) [data-ci="${i}"]{--c:${d.c};`), `chapter ${i} dark (system)`);
  }
  // the chapters come after the bridge, so an element with data-ci wears its chapter over the accent
  assert.ok(css.indexOf('[data-ci="0"]') > css.indexOf(BRIDGE));
});
