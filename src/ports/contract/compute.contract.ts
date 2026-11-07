/// <reference types="node" />
/**
 * The Compute contract. `make(registry)` gives a Compute that runs the registry's jobs (inline, or in Workers that serve
 * the same registry). The jobs it uses are TEST_JOBS (registered with the core ones).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../kernel/errors.ts';
import type { Compute, JobHandler, JobRegistry, Progress } from '../compute.ts';

export const TEST_JOBS: { readonly [name: string]: JobHandler } = {
  'test.add': (x: unknown) => { const { a, b } = x as { a: number; b: number }; return a + b; },
  'test.mutate': (x: unknown) => { (x as { list: number[] }).list.push(4); return (x as { list: number[] }).list.length; },
  'test.progress': async (_x, ctx) => { for (let i = 1; i <= 3; i++) ctx.progress({ done: i, total: 3 }); return 'done'; },
  'test.coded': () => { throw new NoemaError('storage.corrupt', 'bad data inside the job'); },
  'test.throws': () => { throw new TypeError('a bug in the job'); },
  'test.forever': (_x, ctx) => new Promise((_resolve, reject) => { ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)); }),
};

export type ComputeFactory = (registry: JobRegistry) => Compute;

const run = async <O>(c: Compute, job: string, input: unknown, o = {}) => c.run<unknown, O>(job, input, o);

export function computeContract(name: string, make: ComputeFactory, registryOf: (jobs: { readonly [n: string]: JobHandler }) => JobRegistry): void {
  describe(`Compute contract: ${name}`, () => {
    const fresh = (): Compute => make(registryOf(TEST_JOBS));

    test('runs a job and returns its value; core.ping answers', async () => {
      const c = fresh();
      const r = await run<number>(c, 'test.add', { a: 2, b: 3 });
      assert.ok(r.ok && r.value === 5);
      const p = await run<{ pong: unknown }>(c, 'core.ping', 'hi');
      assert.ok(p.ok && p.value.pong === 'hi');
      c.dispose();
    });

    test('the input is a copy: the job cannot change the caller\'s data', async () => {
      const c = fresh();
      const input = { list: [1, 2, 3] };
      const r = await run<number>(c, 'test.mutate', input);
      assert.ok(r.ok && r.value === 4);
      assert.deepEqual(input.list, [1, 2, 3]);
      c.dispose();
    });

    test('progress reaches the caller in order', async () => {
      const c = fresh();
      const seen: Progress[] = [];
      const r = await run<string>(c, 'test.progress', null, { onProgress: (p: Progress) => seen.push(p) });
      assert.ok(r.ok && r.value === 'done');
      assert.deepEqual(seen.map(p => p.done), [1, 2, 3]);
      c.dispose();
    });

    test('failures: an unknown job, a NoemaError (keeps its code), a bug (compute.failed)', async () => {
      const c = fresh();
      const u = await run(c, 'test.none', null);
      assert.ok(!u.ok && u.error.code === 'compute.unknown_job');
      const k = await run(c, 'test.coded', null);
      assert.ok(!k.ok && k.error.code === 'storage.corrupt' && /bad data/.test(k.error.message));
      const b = await run(c, 'test.throws', null);
      assert.ok(!b.ok && b.error.code === 'compute.failed' && /a bug in the job/.test(b.error.message));
      c.dispose();
    });

    test('a job past its time limit is compute.timeout; the next job still runs', async () => {
      const c = fresh();
      const t0 = Date.now();
      const r = await run(c, 'test.forever', null, { timeoutMs: 50 });
      assert.ok(!r.ok && r.error.code === 'compute.timeout');
      assert.ok(Date.now() - t0 < 2000);
      const again = await run<number>(c, 'test.add', { a: 1, b: 1 });
      assert.ok(again.ok && again.value === 2);
      c.dispose();
    });

    test('a cancelled job is compute.cancelled (also when cancelled before it starts)', async () => {
      const c = fresh();
      const ac = new AbortController();
      const p = run(c, 'test.forever', null, { signal: ac.signal });
      setTimeout(() => ac.abort(), 20);
      const r = await p;
      assert.ok(!r.ok && r.error.code === 'compute.cancelled');
      const pre = new AbortController();
      pre.abort();
      const r2 = await run(c, 'test.add', { a: 1, b: 2 }, { signal: pre.signal });
      assert.ok(!r2.ok && r2.error.code === 'compute.cancelled');
      c.dispose();
    });

    test('jobs run side by side', async () => {
      const c = fresh();
      const rs = await Promise.all([1, 2, 3, 4, 5].map(i => run<number>(c, 'test.add', { a: i, b: 10 })));
      assert.deepEqual(rs.map(r => (r.ok ? r.value : -1)), [11, 12, 13, 14, 15]);
      c.dispose();
    });

    test('dispose ends running jobs as compute.cancelled', async () => {
      const c = fresh();
      const p = run(c, 'test.forever', null);
      await new Promise(r => setTimeout(r, 10));
      c.dispose();
      const r = await p;
      assert.ok(!r.ok && r.error.code === 'compute.cancelled');
    });
  });
}
