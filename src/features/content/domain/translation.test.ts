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
