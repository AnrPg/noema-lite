/* Numbers for people in sim-spec@1 (format.ts): the learner's decimal mark, grouping from five digits, prefixes, 0 decimals. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxNum, fmtNum, parseBoxNum, prefixFactor, siUnit } from './format.ts';

test('auto: every digit of a whole number below a billion, scientific only beyond; no separator in a four-digit number', () => {
  assert.equal(fmtNum(12345678, {}, 'en'), '12,345,678');
  assert.equal(fmtNum(2024, {}, 'en'), '2024');
  assert.match(fmtNum(3.2e9, {}, 'en'), /E9/);
  assert.equal(fmtNum(1.5, { unit: 'V' }, 'el'), '1,5 V');
});

test('fixed and plain take 0 decimals; plain never uses an SI prefix', () => {
  assert.equal(fmtNum(3.6, { format: 'fixed', digits: 0 }, 'en'), '4');
  assert.equal(fmtNum(1000, { format: 'plain', unit: 'days' }, 'en'), '1000 days');
  assert.equal(fmtNum(0.1, { format: 'plain' }, 'en'), '0.1');
});

test('prefix: the value shown in an SI prefix (0.001 A → 1 mA); u is µ', () => {
  assert.equal(fmtNum(0.001, { unit: 'A', prefix: 'm' }, 'en'), '1 mA');
  assert.equal(fmtNum(4.7e-6, { unit: 'F', prefix: 'u' }, 'en'), '4.7 µF');
  assert.equal(prefixFactor('k'), 1e3);
  assert.equal(prefixFactor('x'), null);
  assert.ok(siUnit('Hz') && !siUnit('days') && !siUnit('%'));
});

test('number boxes: the learner’s decimal mark, read back whichever mark they type', () => {
  assert.equal(boxNum(0.5, 'el'), '0,5');
  assert.equal(boxNum(12345678, 'el'), '12345678');
  assert.equal(parseBoxNum('0,5', 'el'), 0.5);
  assert.equal(parseBoxNum('1.5', 'el'), 1.5);
  assert.equal(parseBoxNum('1.234,5', 'el'), 1234.5);
  assert.equal(parseBoxNum('1,234.5', 'en'), 1234.5);
  assert.equal(parseBoxNum('−2e-3', 'en'), -0.002);
  assert.ok(Number.isNaN(parseBoxNum('abc', 'en')));
});
