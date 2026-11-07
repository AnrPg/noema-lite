/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HLC_MAX_COUNT, HybridClock, compareHlc, decodeHlc, encodeHlc, hlcReceive, hlcTick, hlcZero, type HlcTimestamp } from './hlc.ts';
import { trustedId, type DeviceId } from './ids.ts';
import { unwrap } from './result.ts';

const A = trustedId<DeviceId>('devA'), B = trustedId<DeviceId>('devB');

test('local ticks are strictly increasing, even when the physical clock stands still or goes back', () => {
  let now = 1000;
  const c = new HybridClock(A, () => now);
  const s1 = unwrap(c.now()), s2 = unwrap(c.now());
  now = 500; // the device's clock was set back
  const s3 = unwrap(c.now());
  now = 2000;
  const s4 = unwrap(c.now());
  assert.deepEqual([s1.wall, s1.count, s2.wall, s2.count, s3.wall, s3.count, s4.wall, s4.count], [1000, 0, 1000, 1, 1000, 2, 2000, 0]);
  for (const [x, y] of [[s1, s2], [s2, s3], [s3, s4]] as const) assert.equal(compareHlc(x, y), -1);
});

test('receive: later than both sides; the counter follows the larger wall', () => {
  const last: HlcTimestamp = { wall: 1000, count: 3, node: A };
  assert.deepEqual(unwrap(hlcReceive(last, { wall: 1000, count: 7, node: B }, 900)), { wall: 1000, count: 8, node: A });
  assert.deepEqual(unwrap(hlcReceive(last, { wall: 1500, count: 2, node: B }, 1200)), { wall: 1500, count: 3, node: A });
  assert.deepEqual(unwrap(hlcReceive(last, { wall: 800, count: 9, node: B }, 950)), { wall: 1000, count: 4, node: A });
  assert.deepEqual(unwrap(hlcReceive(last, { wall: 800, count: 9, node: B }, 3000)), { wall: 3000, count: 0, node: A });
});

test('a remote clock far in the future is refused (hlc.drift), and the clock is not moved', () => {
  const c = new HybridClock(A, () => 10_000, { maxDriftMs: 1000 });
  const before = c.last;
  const r = c.receive({ wall: 20_000, count: 0, node: B });
  assert.ok(!r.ok && r.error.code === 'hlc.drift');
  assert.equal(c.last, before);
  assert.ok(c.receive({ wall: 10_900, count: 0, node: B }).ok);
});

test('the counter overflows into an error, never into a wrong order', () => {
  const r = hlcTick({ wall: 5, count: HLC_MAX_COUNT, node: A }, 5);
  assert.ok(!r.ok && r.error.code === 'hlc.overflow');
});

test('ties are broken by the node; the encoded text sorts like the stamps', () => {
  assert.equal(compareHlc({ wall: 1, count: 1, node: A }, { wall: 1, count: 1, node: B }), -1);
  assert.equal(compareHlc(hlcZero(A), hlcZero(A)), 0);
  const stamps: HlcTimestamp[] = [
    { wall: 2, count: 0, node: A },
    { wall: 1, count: 10, node: B },
    { wall: 1, count: 9, node: B },
    { wall: 1_762_500_000_000, count: 0, node: A },
    { wall: 1, count: 10, node: A },
  ];
  const bySort = [...stamps].sort(compareHlc).map(encodeHlc);
  assert.deepEqual([...stamps].map(encodeHlc).sort(), bySort);
  for (const s of stamps) assert.deepEqual(unwrap(decodeHlc(encodeHlc(s))), s);
  assert.equal(encodeHlc({ wall: 1_762_500_000_000, count: 42, node: A }), '001762500000000-00042-devA');
  for (const bad of ['', '1-2-x', '001762500000000-00042-a.b', 7]) assert.equal(decodeHlc(bad).ok, false);
});

test('a clock resumes after its last saved stamp (same device only)', () => {
  const c = new HybridClock(A, () => 1, { last: { wall: 99, count: 4, node: A } });
  assert.deepEqual(unwrap(c.now()), { wall: 99, count: 5, node: A });
  const d = new HybridClock(A, () => 1, { last: { wall: 99, count: 4, node: B } });
  assert.deepEqual(unwrap(d.now()), { wall: 1, count: 0, node: A });
});
