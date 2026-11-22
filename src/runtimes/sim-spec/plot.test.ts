/* The plots and drawings of sim-spec@1 (plot.ts) in a DOM (happy-dom), for the app limits found while upgrading the gadgets
   Roadmap (2026-11-22): a series plot keeps its declared x range when a run stops early (limit lines and marks over the whole
   range); scene letters shrink to the room an item gives (a truth table's headings never overlap); a tall plot height is the
   most a drawing takes; a comma list of atoms is translated name by name; categories (cat) get their own colour class. */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawPlot, drawScene, seriesXRange, spanGrid } from './plot.ts';

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/', width: 1280, height: 900 }); // a DOM (as src/ui/test/dom.ts)

const fig = (w: number): HTMLElement => {
  const f = document.createElement('figure');
  Object.defineProperty(f, 'clientWidth', { value: w });
  return f;
};

test('a series plot keeps its declared x range when the run stops early; expression lines and marks span it', () => {
  const xs = Array.from({ length: 51 }, (_, i) => i); // a thermal run that stopped at t = 50 (the heater cut off)
  assert.deepEqual(seriesXRange(0, 200, xs), [0, 200]);
  assert.deepEqual(seriesXRange(null, null, xs), [0, 50]); // nothing declared: the data's own range
  assert.deepEqual(seriesXRange(Number.NaN, 120, []), [0, 120]);
  const grid = spanGrid([0, 200], xs, false) as number[];
  assert.equal(grid.length, 200);
  assert.equal(grid[0], 0);
  assert.equal(grid[199], 200);
  const lg = spanGrid([1, 1000], xs, true) as number[];
  assert.ok(Math.abs((lg[199] ?? 0) - 1000) < 1e-9 && Math.abs((lg[100] ?? 0) - Math.pow(1000, 100 / 199)) < 1e-9);
  // drawn: the limit line (an expression, 200 °C) reaches the right edge, the measured line stops at t = 50, a y mark spans it all
  const f = fig(400),
    s = drawPlot(
      f,
      { kind: 'series', x: {}, y: {} },
      {
        xs,
        lines: [{ ys: xs.map(x => 20 + 3 * x) }, { ys: grid.map(() => 200), xs: grid }],
        marks: [{ axis: 'y', v: 150, label: 'max', legend: false }],
        xr: [0, 200],
        yr: [0, 250],
      },
      { locale: 'en', aria: 'plot' },
    );
  const ends = [...s.querySelectorAll('path.sim-line')].map(p =>
    Number((p.getAttribute('d') ?? '').split(/[ML]/).pop()?.trim().split(' ')[0]),
  );
  const right = 400 - 12; // W − mr
  assert.ok(Math.abs((ends[1] ?? 0) - right) < 0.6, `the limit line ends at the right edge (${String(ends[1])} vs ${String(right)})`);
  assert.ok((ends[0] ?? 0) < right / 2, 'the run itself ends where it stopped');
  const mk = s.querySelector('line.sim-mark');
  assert.equal(Number(mk?.getAttribute('x2')), right);
});

test('scene letters shrink to the room the item gives (size, fit); a set height is the most a wide drawing takes', () => {
  const sc = {
    view: [0, 40, -16, 1],
    items: [
      { k: 'txt', x: 2, y: 0, s: 'layout', size: 0.8, fit: 3 },
      { k: 'txt', x: 10, y: 0, s: 'enc ∧ cccd ∧ (layout ∨ bonded)', size: 0.8, fit: 12 },
      { k: 'txt', x: 20, y: 0, s: 'plain' },
    ],
  };
  const tt = (k: unknown): string => (k === 'a0' ? 'ready' : k === 'b0' ? 'sending' : '');
  const s = drawScene(fig(360), { kind: 'scene', height: 1400 }, sc, { locale: 'en', aria: 'x', tt });
  const k = 360 / 40;
  assert.ok(
    Number(s.getAttribute('height')) < 1400 && Number(s.getAttribute('height')) >= 120,
    'height 1400 renders, as tall as the drawing',
  );
  const texts = [...s.querySelectorAll('text')];
  const px = (e: Element | undefined): number => Number(/font-size:([\d.]+)px/.exec(e?.getAttribute('style') ?? '')?.[1] ?? 12);
  const est = (e: Element | undefined): number => Array.from(e?.textContent ?? '').length * px(e) * 0.6;
  assert.ok(px(texts[0]) <= 0.8 * k + 0.05 && est(texts[0]) <= 3 * k + 0.5, 'a heading fits its column');
  assert.ok(est(texts[1]) <= 12 * k + 0.5 && px(texts[1]) >= 5, 'a long formula shrinks to its column instead of running past it');
  assert.equal(texts[2]?.getAttribute('style'), null, 'an item without size or fit keeps the 12 px of the theme');
  const s2 = drawScene(
    fig(360),
    { kind: 'scene' },
    {
      view: [-1, 1, -1, 1],
      items: [
        { k: 'txt', x: 0, y: 0, s: 'a0,b0' },
        { k: 'seg', x1: 0, y1: 0, x2: 1, y2: 0, cat: 2, w: 8 },
      ],
    },
    { locale: 'en', aria: 'x', tt },
  );
  assert.equal(s2.querySelector('text')?.textContent, 'ready, sending', 'the atoms of a state are translated name by name');
  assert.match(s2.querySelector('line')?.getAttribute('class') ?? '', /\bsim-k2\b/, 'a category gets its colour class');
});
