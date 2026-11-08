/// <reference types="node" />
/**
 * The servers of ⚑ problem reports and of requests for new engines (src/ports/reports.ts): every adapter passes it.
 * `make()` gives two people signed in on their own servers, the first of them one of the app's admins.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoemaError } from '../../kernel/errors.ts';
import type { EngineRequestServer, ReportServer } from '../reports.ts';

export interface ReportsSide {
  readonly reports: ReportServer;
  readonly requests: EngineRequestServer;
}
export type ReportsFactory = () => Promise<{ readonly admin: ReportsSide; readonly learner: ReportsSide }>;

const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const LOC = {
  at: '2026-11-08T10:00:00.000Z',
  route: { hash: '#/ch/ch01', page: 'ch' },
  itemRef: 'phys/ch01',
  subject: { id: 'phys' },
  app: { version: '1.0' },
};

export function reportsContract(name: string, make: ReportsFactory): void {
  describe(`Reports server contract: ${name}`, () => {
    test('a report: sent by a learner, seen by them and by the admins, answered and deleted by an admin', async () => {
      const { admin, learner } = await make();
      assert.equal(value(await admin.reports.isAdmin()), true);
      assert.equal(value(await learner.reports.isAdmin()), false);
      const id = globalThis.crypto.randomUUID();
      value(
        await learner.reports.send({
          id,
          kind: 'content',
          note: 'a typo in the theory',
          route: '#/ch/ch01',
          subject: 'phys',
          item: 'phys/ch01',
          locator: LOC,
          shot: null,
          app_version: '1.0',
        }),
      );
      assert.equal(value(await learner.reports.one(id))?.note, 'a typo in the theory');
      assert.ok(value(await admin.reports.list(['new'])).some(r => r.id === id));
      assert.ok(value(await admin.reports.newCount()) >= 1);
      value(await admin.reports.save(id, { status: 'fixed', fixed_in: 'PR 1' }));
      assert.equal(value(await learner.reports.one(id))?.status, 'fixed');
      assert.equal(
        value(await admin.reports.list(['new'])).some(r => r.id === id),
        false,
      );
      assert.ok(value(await admin.reports.list(null)).some(r => r.id === id));
      value(await admin.reports.remove(id));
      assert.equal(value(await learner.reports.one(id)), null);
    });

    test('a request for a new engine: submitted, mine, listed for the admins, answered', async () => {
      const { admin, learner } = await make();
      const row = {
        title: 'Chemical equilibrium',
        field: null,
        what: 'Le Chatelier: shift the equilibrium by changing concentration, pressure and temperature, and see it move.',
        learner: null,
        measure: null,
        sources: null,
        examples: null,
        accuracy: 'teaching',
        subject: null,
        via: 'app',
        locale: 'en',
        suggested: ['formula@1'],
      };
      const got = value(await learner.requests.submit(row));
      assert.ok(got.id);
      assert.equal(got.status, 'new');
      assert.ok(value(await learner.requests.mine()).some(r => r.id === got.id));
      assert.ok(value(await admin.requests.all(['new', 'seen'])).some(r => r.id === got.id));
      value(await admin.requests.update(got.id ?? '', { status: 'planned', answer: 'next month' }));
      const mine = value(await learner.requests.mine()).find(r => r.id === got.id);
      assert.equal(mine?.status, 'planned');
      assert.equal(mine.answer, 'next month');
      assert.equal(value(await learner.requests.isAdmin()), false);
    });
  });
}
