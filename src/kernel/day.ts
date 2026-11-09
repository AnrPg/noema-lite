/**
 * LocalDay: the learner's calendar day, "YYYY-MM-DD" in the device's time zone (docs/adr/005).
 *
 * One kind of "today" for everything that counts days: streaks, daily XP, due cards and playbooks, daily caps, backups.
 * Never the UTC date: in Athens (UTC+2/+3) the UTC date changes at 02:00/03:00, so a session after midnight counted for the
 * day before and a card due "tomorrow" came back a day late or early. Days sort and compare as strings.
 *
 * Arithmetic goes through the day's local noon, so a daylight-saving change (a 23- or 25-hour day, or a midnight that does
 * not exist, as in Brazil until 2019) never skips or repeats a day; the distance of two days is counted on their calendar
 * dates (UTC arithmetic of Y-M-D), so it does not depend on the time zone at all.
 *
 * The functions are pure: "now" comes from the Clock port (clock.today()), never from here.
 */
import { NoemaError } from './errors.ts';
import type { Brand } from './ids.ts';
import { err, ok, type Result } from './result.ts';

export type LocalDay = Brand<string, 'LocalDay'>;

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** The calendar day of a moment (a Date or epoch milliseconds) in the device's time zone. */
export function dayOf(moment: Date | number): LocalDay {
  const d = moment instanceof Date ? moment : new Date(moment);
  if (Number.isNaN(d.getTime())) throw new NoemaError('day.invalid', 'not a valid moment: ' + String(moment));
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as LocalDay;
}

function parts(text: string): [number, number, number] | null {
  const m = FORMAT.exec(text);
  if (!m) return null;
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // the month's last day
  return d > last ? null : [y, mo, d];
}

/** Is it a real calendar day written "YYYY-MM-DD"? (2026-02-30 is not.) */
export const isLocalDay = (x: unknown): x is LocalDay => typeof x === 'string' && parts(x) !== null;

/** Text → LocalDay, or day.invalid. */
export function parseDay(text: unknown): Result<LocalDay> {
  return isLocalDay(text)
    ? ok(text)
    : err(new NoemaError('day.invalid', 'not a calendar day "YYYY-MM-DD": ' + JSON.stringify(String(text).slice(0, 40))));
}

function ymd(day: LocalDay): [number, number, number] {
  const p = parts(day);
  if (!p) throw new NoemaError('day.invalid', 'not a calendar day "YYYY-MM-DD": ' + JSON.stringify(String(day).slice(0, 40)));
  return p;
}

/** The day's local noon (a Date): the safe moment to do calendar arithmetic or to format the day. */
export function noonOf(day: LocalDay): Date {
  const [y, m, d] = ymd(day);
  return new Date(y, m - 1, d, 12);
}

/** The day n calendar days after `day` (n < 0: before). */
export function addDays(day: LocalDay, n: number): LocalDay {
  if (!Number.isInteger(n)) throw new NoemaError('day.invalid', 'a number of days must be whole: ' + String(n));
  const d = noonOf(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

/** Whole calendar days from a to b (b later → positive). */
export function daysBetween(a: LocalDay, b: LocalDay): number {
  const [ya, ma, da] = ymd(a),
    [yb, mb, db] = ymd(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 864e5);
}

/** -1, 0 or 1, as the days follow each other. */
export const compareDays = (a: LocalDay, b: LocalDay): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

/** The day of the week: 0 Sunday … 6 Saturday. */
export const weekdayOf = (day: LocalDay): number => noonOf(day).getDay();

/** The first day of the week that holds `day` (firstDay: 1 = Monday, the default; 0 = Sunday; 6 = Saturday). */
export function weekStart(day: LocalDay, firstDay = 1): LocalDay {
  return addDays(day, -((weekdayOf(day) - firstDay + 7) % 7));
}
