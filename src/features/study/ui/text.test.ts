/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, protectMath, restoreMath } from './text.ts';

const draw = (tex: string, display: boolean): string => `[${display ? 'D' : 'I'}:${tex}]`;

test('formulas are kept out of the markdown: _ * \\ | stay TeX', () => {
  const s =
    'Η ισχύς: $p(t) = V_p I_p \\cos(\\omega t)$ και\n\n$$p(t) = \\underbrace{\\frac{V_p I_p}{2} \\cos\\phi}_{\\text{σταθερός όρος}} + \\underbrace{x}_{\\text{ταλαντευόμενος}}$$\n\nκαι \\(a*b*c\\), \\[x_1 | x_2\\].';
  const { text, math } = protectMath(s);
  assert.equal(math.length, 4);
  assert.doesNotMatch(text, /underbrace|\\omega/);
  assert.equal(math[1]?.display, true);
  assert.match(math.at(1)?.tex ?? '', /^p\(t\) = \\underbrace\{\\frac\{V_p I_p\}\{2\} \\cos\\phi\}_\{\\text\{σταθερός όρος\}\}/);
  // a markdown that would eat _ and * (a stand-in for marked)
  const naive = (x: string): string => x.replace(/_([^_]+)_/g, '<em>$1</em>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const html = restoreMath(naive(text), math, draw);
  assert.match(html, /\[I:p\(t\) = V_p I_p \\cos\(\\omega t\)\]/);
  assert.match(html, /<div class="mathblock">\[D:p\(t\) = \\underbrace/);
  assert.match(html, /\[I:a\*b\*c\]/);
  assert.match(html, /\[D:x_1 \| x_2\]/);
  assert.doesNotMatch(html, /<em>/);
});

test('money, code and escaped dollars are not formulas; without KaTeX a formula is shown as written', () => {
  assert.equal(protectMath('It costs $5 and $10 today.').math.length, 0);
  assert.equal(protectMath('Use `$x$` in code, and \\$5.').math.length, 0);
  assert.equal(protectMath('```\n$$a$$\n```').math.length, 0);
  assert.equal(protectMath('price: $ 5 $').math.length, 0);
  const out = markdown('Speed $v_1 < v_2$ here', 'Copy', null);
  assert.match(out, /\$v_1 &lt; v_2\$/);
  const lib = markdown('A $x_1$ B\n\n$$y_2$$', 'Copy', { parse: x => `<p>${x}</p>`, sanitize: x => x, math: draw });
  assert.match(lib, /\[I:x_1\]/);
  assert.match(lib, /<div class="mathblock">\[D:y_2\]<\/div>/);
});
