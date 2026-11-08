import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contracts from './index.ts';
import { check, isContractId, problems, provideContracts } from './page.ts';

test('the page: the learning log’s event contract at once, every other one once the piece is in', () => {
  const ev = 'noema.events.v1#event';
  assert.deepEqual(check(ev, { v: 1 }), contracts.check(ev, { v: 1 }), 'the same words as the full module');
  assert.deepEqual(problems(ev, 1, 'x'), contracts.problems(ev, 1, 'x'));
  assert.ok(isContractId(ev));
  assert.throws(() => check('noema.pack.v3', {}), /not loaded yet/);
  provideContracts(contracts);
  assert.deepEqual(check('noema.pack.v3', {}), contracts.check('noema.pack.v3', {}));
  assert.ok(isContractId('noema.chapter.v1#exercise'));
});
