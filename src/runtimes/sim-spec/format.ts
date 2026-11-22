/* Numbers for people: SI prefixes, the learner's decimal mark (sim-spec@1's readouts, controls, ticks and bench readings). */

import { str } from '../dom.ts';

export const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export interface NumFormat {
  readonly unit?: unknown;
  readonly format?: unknown;
  readonly digits?: unknown;
  /** an SI prefix the value is shown in (prefix "m" with unit "A": 0.001 is shown as 1 mA) */
  readonly prefix?: unknown;
}

const SI: readonly (readonly [number, string])[] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];
/** the factor of an SI prefix ("m" → 1e-3; "u" is µ), or null */
export const prefixFactor = (p: unknown): number | null => {
  const k = p === 'u' ? 'µ' : p;
  return typeof k === 'string' && k ? (SI.find(([, n]) => n === k)?.[0] ?? null) : null;
};
/** the units an SI prefix reads well on (1 kHz, 200 µs); on others (days, %, items, dB) a log axis prints plain numbers */
const SI_UNITS = new Set([
  'Hz',
  's',
  'V',
  'A',
  'W',
  'Ω',
  'F',
  'H',
  'm',
  'g',
  'B',
  'b',
  'bit',
  'J',
  'Pa',
  'N',
  'C',
  'S',
  'Wh',
  'Ah',
  'VA',
  'T',
  'Wb',
  'bps',
  'eV',
  'L',
  'mol',
  'cd',
  'lm',
  'lx',
  'K',
]);
export const siUnit = (u: unknown): boolean => typeof u === 'string' && SI_UNITS.has(u.trim());

export function fmtNum(v: unknown, o: NumFormat | null | undefined, locale: string): string {
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (!isNum(v)) return '—';
  const f = (n: number, opt: Intl.NumberFormatOptions): string => {
    try {
      // thousands separators only from five digits (10 000): a year, a count or a four-digit reading stays one word
      // where the thousands separator is a point (el, de, it, es…) it reads as a decimal point (2.435 MHz): a narrow space
      // separates the thousands instead (12 500), as SI writes them
      return new Intl.NumberFormat(locale, { useGrouping: 'min2', ...opt })
        .formatToParts(n)
        .map(p => (p.type === 'group' && p.value === '.' ? '\u202f' : p.value))
        .join('');
    } catch {
      try {
        return new Intl.NumberFormat(locale, opt).format(n);
      } catch {
        return String(n); // a locale or option this browser lacks
      }
    }
  };
  const pf = prefixFactor(o?.prefix);
  const unit0 = o?.unit ? str(o.unit) : '',
    unit = pf && unit0 ? str(o?.prefix === 'u' ? 'µ' : o?.prefix) + unit0 : unit0,
    x = pf ? v / pf : v,
    fm = o?.format ?? 'auto',
    dg = typeof o?.digits === 'number' ? o.digits : undefined;
  const u = (s: string): string => s + (unit ? ' ' + unit : '');
  if (fm === 'fixed') return u(f(x, { minimumFractionDigits: dg ?? 2, maximumFractionDigits: dg ?? 2 }));
  if (fm === 'plain') return u(f(x, { maximumFractionDigits: dg ?? 6 }));
  if (fm === 'si' && !pf) {
    const a = Math.abs(x);
    const [m, p] = a === 0 ? [1, ''] : (SI.find(([m]) => a >= m * 0.9995) ?? SI[SI.length - 1] ?? [1, '']);
    return (f(x / m, { maximumSignificantDigits: Math.max(1, dg ?? 3) }) + ' ' + p + unit).trim();
  }
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) return u(f(x, { notation: 'scientific', maximumSignificantDigits: Math.max(1, dg ?? 3) }));
  // whole numbers up to a billion keep every digit (2 024 000, not 2.024e6); the rest have digits significant digits
  return u(f(x, a >= 1e4 && Number.isInteger(x) ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: Math.max(1, dg ?? 4) }));
}

/** a number as the learner types it in a number box: their decimal mark, no grouping, at most 12 significant digits */
export function boxNum(v: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { useGrouping: false, maximumSignificantDigits: 12 }).format(v);
  } catch {
    return String(+v.toPrecision(12));
  }
}
/** what the learner typed (1,5 or 1.5; a space or a thin space between thousands) → a number, or NaN */
export function parseBoxNum(t: string, locale: string): number {
  const dec = boxNum(1.5, locale).includes(',') ? ',' : '.'; // the learner's decimal mark (boxNum falls back to '.')
  let s = t
    .trim()
    .replace(/[\s  ']/g, '')
    .replace(/−/g, '-');
  if (dec === ',') s = s.replace(/\./g, s.includes(',') ? '' : '.').replace(',', '.');
  else s = s.replace(/,/g, s.includes('.') ? '' : '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
}
