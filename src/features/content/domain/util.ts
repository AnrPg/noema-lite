/* noema-lite — content checks: the small helpers every rule uses to read untyped JSON safely (a pack arrives as data;
   every rule narrows what it reads, so a malformed file is reported, never a crash). */

export type Obj = Readonly<Record<string, unknown>>;
export type MutObj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
/** a non-empty text (not only white space) */
export const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isInt = (v: unknown): v is number => Number.isInteger(v);
/** a whole number from 0 to n − 1 */
export const intIn = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
export const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
export const objs = (v: unknown): Obj[] => list(v).filter(isObj);
export const obj = (v: unknown): Obj => (isObj(v) ? v : {});
export const strs = (v: unknown, min = 1): v is string[] => Array.isArray(v) && v.length >= min && v.every(isStr);
export const has = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** a value of an object by key, only when it is its own */
export const own = (o: unknown, k: string): unknown => (isObj(o) && has(o, k) ? o[k] : undefined);
/** text of a value as a template literal writes it */
export const s = (v: unknown): string => String(v);
/** a value quoted for a message: "x", or none */
export const qv = (v: unknown): string => (v == null ? 'none' : `"${s(v)}"`);
/** the length of an array value, else 0 */
export const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
/** the language part of a locale ("pt-PT" → "pt") */
export const lang0 = (x: unknown): string => (typeof x === 'string' && x ? x : '').split('-')[0]?.toLowerCase() ?? '';
/** a deep copy of JSON data */
export const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** BCP 47 locale codes: el, pt-PT, zh-Hant */
export const LOCALE_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
export const sortStr = (a: readonly string[]): string[] => [...a].sort();

/** errors and warnings of a check */
export interface Report {
  readonly errors: string[];
  readonly warnings: string[];
}
export const report = (): Report => ({ errors: [], warnings: [] });
