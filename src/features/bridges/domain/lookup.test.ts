/* The 文A bridges' lookup: pair keys, the bridges of a pack from one language, and a bridge cut and joined with its pack. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { available, mergeBridges, pairKey, pairOf, splitBridge } from './lookup.ts';

/** the value, asserted to be there */
const def = <T>(x: T | null | undefined): T => {
  assert.ok(x !== undefined && x !== null);
  return x;
};

test('pair keys: from the own language, from a translation', () => {
  assert.equal(pairKey(null, 'el-GR', 'en'), 'el');
  assert.equal(pairKey('en', 'ru', 'en'), 'ru');
  assert.equal(pairKey('fr', 'ru', 'en'), 'fr.ru');
  assert.deepEqual(pairOf('fr.ru', 'en'), { src: 'fr', nat: 'ru' });
  assert.deepEqual(pairOf('ru', 'de'), { src: 'de', nat: 'ru' });
});

test('available: the account wins over the library; one source language at a time', () => {
  const lib = { ru: { status: 'reviewed' }, 'fr.el': { status: 'draft' } },
    acc = { ru: { status: 'draft' }, 'fr.ru': { status: 'draft' } };
  const own = available(lib, acc, null, 'en');
  assert.deepEqual(Object.keys(own), ['ru']);
  assert.equal(def(own.ru).own, true);
  assert.equal(def(own.ru).status, 'draft');
  const fr = available(lib, acc, 'fr', 'en');
  assert.deepEqual(Object.keys(fr).sort(), ['el', 'ru']);
  assert.equal(def(fr.el).key, 'fr.el');
  assert.equal(def(fr.el).own, false);
});

test('a bridge follows its chapters when a pack is cut and joined', () => {
  const b = {
    pack: 'p',
    source: 'en',
    native: 'el',
    status: 'reviewed',
    chapters: ['ch01', 'ch02'],
    of: 2,
    entries: [{ k: 'force', senses: [{ id: 1 }] }],
    sections: { 'ch01-s01': { terms: ['force'] }, 'ch02-s01': { terms: ['mass'] } },
    anchors: [{ at: 'ch02-s01/3', k: 'mass' }],
  };
  const a = def(splitBridge(b, 'p', ['ch01'], new Set(['ch01-s01']))),
    z = def(splitBridge(b, 'p2', ['ch02'], new Set(['ch02-s01'])));
  assert.deepEqual(Object.keys(a.sections ?? {}), ['ch01-s01']);
  assert.deepEqual(z.anchors, [{ at: 'ch02-s01/3', k: 'mass' }]);
  assert.equal(z.pack, 'p2');
  assert.equal(splitBridge(b, 'p3', ['ch09'], new Set(['ch09-s01'])), null);
  const j = mergeBridges('p', [a, { ...z, status: 'draft', entries: [{ k: 'force', senses: [{ id: 2 }] }] }]);
  assert.equal(j.length, 1);
  const j0 = def(j[0]);
  assert.deepEqual(Object.keys(j0.sections ?? {}).sort(), ['ch01-s01', 'ch02-s01']);
  assert.deepEqual(j0.chapters, ['ch01', 'ch02']);
  assert.equal(j0.entries?.[0]?.senses?.length, 2);
  assert.equal(j0.status, 'draft');
});
