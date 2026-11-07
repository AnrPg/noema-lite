/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, compareDays, dayOf, daysBetween, isLocalDay, noonOf, parseDay, weekStart, weekdayOf, type LocalDay } from './day.ts';

const D = (s: string): LocalDay => {
  const r = parseDay(s);
  if (!r.ok) throw r.error;
  return r.value;
};
/** Run f with the process in time zone tz (Node reads TZ again when it changes). */
function inZone<T>(tz: string, f: () => T): T {
  const was = process.env['TZ'];
  process.env['TZ'] = tz;
  try {
    return f();
  } finally {
    if (was === undefined) delete process.env['TZ'];
    else process.env['TZ'] = was;
  }
}

test('the day of a moment is the LOCAL date, not the UTC one', () => {
  inZone('Europe/Athens', () => {
    assert.equal(dayOf(new Date('2026-11-07T23:30:00Z')), '2026-11-08'); // 01:30 in Athens
    assert.equal(dayOf(Date.parse('2026-11-07T21:59:00Z')), '2026-11-07');
  });
  inZone('America/Los_Angeles', () => assert.equal(dayOf(new Date('2026-11-08T03:00:00Z')), '2026-11-07'));
  assert.throws(() => dayOf(NaN), /not a valid moment/);
});

test('parse and isLocalDay accept only real calendar days', () => {
  for (const s of ['2026-11-07', '2024-02-29', '0999-01-01']) assert.ok(isLocalDay(s), s);
  for (const s of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-1-7', '2026-11-07T00:00', '', null, 20261107]) assert.equal(isLocalDay(s), false, String(s));
  const r = parseDay('2026-04-31');
  assert.ok(!r.ok && r.error.code === 'day.invalid');
});

test('add and between across daylight-saving changes never skip or repeat a day', () => {
  const cases = [
    ['2026-03-28', 1, '2026-03-29'], // Athens: 2026-03-29 has 23 hours
    ['2026-03-29', 1, '2026-03-30'],
    ['2026-10-24', 2, '2026-10-26'], // and 2026-10-25 has 25
    ['2018-11-03', 1, '2018-11-04'], // São Paulo: the midnight of 2018-11-04 did not exist
    ['2018-11-04', 1, '2018-11-05'],
    ['2026-01-31', 29, '2026-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-12-31', 1, '2025-01-01'],
    ['2026-11-07', 0, '2026-11-07'],
  ] as const;
  for (const tz of ['Europe/Athens', 'America/Sao_Paulo', 'America/New_York', 'Australia/Lord_Howe', 'UTC'])
    inZone(tz, () => {
      for (const [from, n, to] of cases) {
        assert.equal(addDays(D(from), n), to, `${tz}: ${from} + ${n}`);
        assert.equal(daysBetween(D(from), D(to)), n, `${tz}: between ${from} and ${to}`);
      }
      let d = D('2026-01-01'), seen = 0;
      while (d !== '2027-01-01') {
        const next = addDays(d, 1);
        assert.equal(daysBetween(d, next), 1, `${tz}: ${d}`);
        d = next;
        seen++;
      }
      assert.equal(seen, 365, tz + ': a whole year, day by day');
    });
});

test('noon, weekday, week start, compare', () => {
  inZone('Europe/Athens', () => {
    const n = noonOf(D('2026-11-07'));
    assert.equal(n.getHours(), 12);
    assert.equal(n.getDate(), 7);
    assert.equal(weekdayOf(D('2026-11-07')), 6); // a Saturday
    assert.equal(weekStart(D('2026-11-07')), '2026-11-02'); // its Monday
    assert.equal(weekStart(D('2026-11-02')), '2026-11-02');
    assert.equal(weekStart(D('2026-11-07'), 0), '2026-11-01'); // Sunday-first weeks
    assert.equal(weekStart(D('2026-11-07'), 6), '2026-11-07');
  });
  assert.equal(compareDays(D('2026-11-07'), D('2026-11-08')), -1);
  assert.equal(compareDays(D('2026-11-08'), D('2026-11-08')), 0);
  assert.throws(() => addDays('nope' as LocalDay, 1), /calendar day/);
  assert.throws(() => addDays(D('2026-11-07'), 0.5), /whole/);
});
