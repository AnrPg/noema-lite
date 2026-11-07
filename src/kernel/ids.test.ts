/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountId, courseId, deviceId, subjectId, trustedId, type SubjectId } from './ids.ts';

test("ids accept the app's real ids", () => {
  for (const s of ['databricks', 'lang:polyglot', 'ch01-s02', 'u_3f2a.b', 'x@1']) assert.ok(subjectId(s).ok, s);
  assert.ok(accountId('u_0d3c9a1e-1111-2222-3333-444455556666').ok);
  assert.ok(deviceId('tab-1_A').ok);
});

test('ids refuse empty text, spaces, slashes, and a colon where a storage key would break', () => {
  for (const s of ['', ' a', 'a b', 'a/b', '-a', 'x'.repeat(201)]) assert.equal(subjectId(s).ok, false, JSON.stringify(s));
  const r = accountId('u:1');
  assert.ok(!r.ok && r.error.code === 'id.invalid' && r.error.params['kind'] === 'account id');
  assert.equal(courseId('lang:x').ok, false);
  assert.equal(deviceId('a.b').ok, false);
});

test('trustedId brands without a check (validated contracts)', () => {
  const s: SubjectId = trustedId<SubjectId>('anything');
  assert.equal(s, 'anything');
});
