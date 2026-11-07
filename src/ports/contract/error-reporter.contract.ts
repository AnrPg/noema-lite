/// <reference types="node" />
/**
 * The ErrorReporter contract. `make(deps)` gives a reporter that keeps its journal in `deps.store`, tells the learner
 * through `deps.notifier` with words from `deps.i18n`, and takes the time from `deps.now`.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../kernel/errors.ts';
import type { ErrorReporter } from '../error-reporter.ts';
import type { I18n } from '../i18n.ts';
import type { Notifier } from '../notifier.ts';
import type { KeyValueStore } from '../storage.ts';

export interface ReporterDeps {
  readonly store: KeyValueStore;
  readonly notifier: Notifier;
  readonly i18n: I18n;
  readonly now: () => number;
  /** Swallows console output during the test. */
  readonly console: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}
export interface ReporterHarness {
  /** A fresh store, notifier and i18n (catalog: loader.storage.full, err.cloud.network). */
  deps(now?: () => number): ReporterDeps & { readonly told: () => Array<{ kind: string; text: string }> };
}
export type ReporterFactory = (deps: ReporterDeps) => ErrorReporter;

export function errorReporterContract(name: string, make: ReporterFactory, harness: ReporterHarness): void {
  describe(`ErrorReporter contract: ${name}`, () => {
    test('a report is a journal entry with its code, site, severity and context', () => {
      const d = harness.deps();
      const r = make(d);
      const e = r.report(new NoemaError('storage.corrupt', 'bad settings', { params: { key: 'a:settings' } }), { where: 'loader.settings', severity: 'warning', context: { acc: 'u1', n: 2 } });
      assert.equal(e.code, 'storage.corrupt');
      assert.equal(e.where, 'loader.settings');
      assert.equal(e.severity, 'warning');
      assert.deepEqual(e.context, { acc: 'u1', n: 2 });
      assert.equal(e.params['key'], 'a:settings');
      assert.equal(r.journal().length, 1);
    });

    test('anything thrown is reported: a coded engine error keeps its code, the rest is internal.unexpected', () => {
      const r = make(harness.deps());
      assert.equal(r.report(Object.assign(new Error('Not signed in'), { code: 'auth.not_signed_in' })).code, 'auth.not_signed_in');
      assert.equal(r.report(new TypeError('x is undefined')).code, 'internal.unexpected');
      assert.equal(r.report('a string').message, 'a string');
      assert.equal(r.report(undefined).code, 'internal.unexpected');
    });

    test('catcher reports with its site and returns undefined (for .catch)', async () => {
      const r = make(harness.deps());
      const v = await Promise.reject(new Error('lost')).catch(r.catcher('loader.idb.put', { severity: 'debug' }));
      assert.equal(v, undefined);
      const last = r.journal().at(-1);
      assert.equal(last?.where, 'loader.idb.put');
      assert.equal(last?.severity, 'debug');
    });

    test('the journal survives a reload (same store) and is bounded', () => {
      const d = harness.deps();
      const r1 = make(d);
      for (let i = 0; i < 500; i++) r1.report(new Error('e' + i), { severity: 'debug' });
      assert.ok(r1.journal().length <= 500 && r1.journal().length >= 50);
      const r2 = make(d);
      assert.equal(r2.journal().length, r1.journal().length);
      assert.equal(r2.journal().at(-1)?.message, 'e499');
      r2.clearJournal();
      assert.equal(make(d).journal().length, 0);
    });

    test('notify: the learner is told in their words (storage.quota → loader.storage.full), at most once a minute per code', () => {
      let t = 1_000_000;
      const d = harness.deps(() => t);
      const r = make(d);
      r.report(new NoemaError('storage.quota', 'full'), { notify: true });
      r.report(new NoemaError('storage.quota', 'full'), { notify: true });
      assert.equal(d.told().length, 1);
      assert.equal(d.told()[0]?.kind, 'alert');
      assert.match(d.told()[0]?.text ?? '', /storage of this browser is full/);
      r.report(new NoemaError('cloud.network', 'Network error — are you offline? (x)', { params: { detail: 'x' } }), { notify: true, severity: 'warning' });
      assert.equal(d.told().length, 2);
      assert.equal(d.told()[1]?.kind, 'toast');
      assert.match(d.told()[1]?.text ?? '', /OFFLINE x/);
      t += 61_000;
      r.report(new NoemaError('storage.quota', 'full'), { notify: true });
      assert.equal(d.told().length, 3);
      r.report(new NoemaError('storage.failed', 'quiet'));
      assert.equal(d.told().length, 3, 'without notify nobody is told');
    });

    test('listeners hear every report; a failing listener breaks nothing', () => {
      const r = make(harness.deps());
      const seen: string[] = [];
      r.onReport(() => { throw new Error('listener bug'); });
      const off = r.onReport(e => seen.push(e.code));
      r.report(new NoemaError('day.invalid', 'x'));
      off();
      r.report(new NoemaError('day.invalid', 'y'));
      assert.deepEqual(seen, ['day.invalid']);
    });
  });
}
