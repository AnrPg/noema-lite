import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_ROUTES, placeOf } from './routes.ts';

test('every hash route of the app finds its page, its arguments and its query', () => {
  assert.deepEqual(placeOf(''), { page: '', args: [], query: {} });
  assert.deepEqual(placeOf('#/'), { page: '', args: [], query: {} });
  assert.equal(placeOf('#/map/c%201/n2').page, 'map');
  assert.deepEqual(placeOf('#/map/c%201/n2').args, ['c 1', 'n2']);
  assert.equal(placeOf('#/search?q=cell').page, 'search');
  assert.equal(placeOf('#/search?q=cell').query['q'], 'cell');
  for (const p of [
    'learn',
    'shelf',
    'explore',
    'discover',
    'progress',
    'me',
    'help',
    'subjects',
    'profile',
    'character',
    'lang',
    'vault',
    'people',
    'admin',
  ])
    assert.equal(placeOf('#/' + p).page, p, p);
  for (const p of ['subject', 'ch', 's', 'practice', 'cards', 'mistakes', 'author', 'engines']) assert.ok(ENGINE_ROUTES.has(p), p);
});
