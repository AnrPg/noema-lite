/* 🌐 The languages a pack gets: the default (rules.ts LANGUAGES), or its Roadmap's scope (docs/CURRICULUM.md §10b). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiredLocales } from './translation.ts';

test('without a scope: every default translation and 25 bridge pairs for an English pack', () => {
  const r = requiredLocales('en');
  assert.deepEqual(r.translations, ['el', 'ru', 'de', 'fr']);
  assert.equal(r.bridgePairs.length, 25);
});

test('an English + Greek Roadmap: only Greek, and the pairs between the two', () => {
  const r = requiredLocales('en', { translations: ['el'] });
  assert.deepEqual(r.translations, ['el']);
  assert.deepEqual(r.bridgePairs, [
    { source: 'en', native: 'el' },
    { source: 'el', native: 'en' },
  ]);
  assert.deepEqual(r.bridges, ['el', 'en']);
});

test('named pairs only, written either way', () => {
  const r = requiredLocales('en', { translations: ['el'], bridges: ['en>el', { source: 'en', native: 'ar' }, 'en→el'] });
  assert.deepEqual(r.bridgePairs, [
    { source: 'en', native: 'el' },
    { source: 'en', native: 'ar' },
  ]);
});

test('a translated knowledge map: the same ids and structure, only its words in the language', async () => {
  const { checkChapter } = await import('./chapter.ts');
  const map = {
    points: [{ id: 'p1', text: 'Charge comes in two kinds', level: 'core', cats: ['detail'] }],
    learnables: [{ id: 'l1', kp: ['p1'], goal: 'Tell the two kinds apart' }],
    concepts: [{ id: 'charge', terms: ['charge'], in: 'ch01-s01', def: 'A property of particles.', needs: [] }],
  };
  const src = { id: 'ch01', num: 1, sections: [{ id: 'ch01-s01', blocks: [] }], exercises: [], map };
  const errs = (m: unknown): string[] =>
    checkChapter({ ...src, map: m }, { source: src }).errors.filter(e => e.startsWith('translation: map.'));
  const el = {
    points: [{ ...map.points[0], text: 'Το φορτίο είναι δύο ειδών' }],
    learnables: [{ ...map.learnables[0], goal: 'Ξεχώρισε τα δύο είδη' }],
    concepts: [{ ...map.concepts[0], terms: ['φορτίο'], def: 'Μια ιδιότητα των σωματιδίων.' }],
  };
  assert.deepEqual(errs(el), []);
  const moved = {
    ...el,
    learnables: [{ ...el.learnables[0], kp: [] }],
    concepts: [{ ...el.concepts[0], in: 'ch01-s02' }],
  };
  assert.deepEqual(errs(moved), [
    'translation: map.learnables l1 differs from the source in kp (only the words may change)',
    'translation: map.concepts charge differs from the source in in (only the words may change)',
  ]);
  assert.match(errs({ ...el, points: [] })[0] ?? '', /map\.points \[\] != source \['p1'\]/);
});
