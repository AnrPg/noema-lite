/* Numbers for people: SI prefixes, the learner's decimal mark (sim-spec@1's readouts, controls, ticks and bench readings). */

import { str } from '../dom.ts';

export const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export interface NumFormat {
  readonly unit?: unknown;
  readonly format?: unknown;
  readonly digits?: unknown;
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

export function fmtNum(v: unknown, o: NumFormat | null | undefined, locale: string): string {
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (!isNum(v)) return '—';
  const f = (n: number, opt: Intl.NumberFormatOptions): string => {
    try {
      return new Intl.NumberFormat(locale, opt).format(n);
    } catch {
      return String(n); // a locale or option this browser lacks
    }
  };
  const unit = o?.unit ? str(o.unit) : '',
    fm = o?.format ?? 'auto',
    dg = typeof o?.digits === 'number' ? o.digits : undefined;
  if (fm === 'fixed') return f(v, { minimumFractionDigits: dg ?? 2, maximumFractionDigits: dg ?? 2 }) + (unit ? ' ' + unit : '');
  if (fm === 'si') {
    const a = Math.abs(v);
    const [m, p] = a === 0 ? [1, ''] : (SI.find(([m]) => a >= m * 0.9995) ?? SI[SI.length - 1] ?? [1, '']);
    return (f(v / m, { maximumSignificantDigits: dg ?? 3 }) + ' ' + p + unit).trim();
  }
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-4))
    return f(v, { notation: 'scientific', maximumSignificantDigits: dg ?? 3 }) + (unit ? ' ' + unit : '');
  return f(v, { maximumSignificantDigits: dg ?? 4 }) + (unit ? ' ' + unit : '');
}
