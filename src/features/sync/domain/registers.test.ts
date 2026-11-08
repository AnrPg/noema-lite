/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, changedFields, later, registerKey, sameJson, splitRegisterKey, withField, type Registers } from './registers.ts';

test('canonical JSON: the same value gives the same text whatever the key order', () => {
  assert.equal(canonical({ b: 1, a: [{ y: 2, x: null }] }), '{"a":[{"x":null,"y":2}],"b":1}');
  assert.ok(sameJson({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(!sameJson({ a: 1 }, { a: '1' }));
});

test('changed fields: set, changed and removed ones; secrets and unchanged ones are left out', () => {
  const regs: Registers = {
    goal: { value: 100, stamp: 's1', sent: true },
    lang: { value: 'el', stamp: 's1', sent: true },
    gone: { value: null, stamp: 's1', sent: true },
    theme: { value: { a: 1, b: 2 }, stamp: 's1', sent: true },
  };
  assert.deepEqual(
    changedFields({ goal: 150, lang: 'el', theme: { b: 2, a: 1 }, sound: true, apiKey: 'SECRET' }, regs, new Set(['apiKey'])),
    [
      ['goal', 150],
      ['sound', true],
    ],
  );
  assert.deepEqual(
    changedFields({ goal: 100, theme: { a: 1, b: 2 } }, regs, new Set()),
    [['lang', null]],
    'a removed field is a null register',
  );
});

test('stamps compare as text; register keys name a record and a field', () => {
  assert.ok(later('000000000000002-00000-a', '000000000000001-00009-z'));
  assert.ok(!later('000000000000001-00000-a', '000000000000001-00000-a'));
  assert.ok(later('x', undefined));
  assert.equal(registerKey('settings', 'goal'), 'settings.goal');
  assert.deepEqual(splitRegisterKey('settings.mt.on', ['settings']), ['settings', 'mt.on']);
  assert.deepEqual(
    [splitRegisterKey('profile.x', ['settings']), splitRegisterKey('settings.', ['settings']), splitRegisterKey('nodot', ['settings'])],
    [null, null, null],
  );
  assert.deepEqual(withField({ a: 1, b: 2 }, 'a', null), { b: 2 });
  assert.deepEqual(withField({ a: 1 }, 'b', [1]), { a: 1, b: [1] });
});
