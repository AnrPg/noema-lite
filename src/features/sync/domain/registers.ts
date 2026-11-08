/**
 * Settings as last-writer-wins registers (docs/SYNC.md §Settings). Each field of a synced record (a:settings) is its own
 * register: its value and the hybrid-clock stamp of the write that set it. Two devices that change different fields never
 * touch each other's; two that change the same field keep the later write (by the stamp, which a wrong device clock can
 * neither reverse nor push into the future: src/kernel/hlc.ts, the cloud's clamp). A removed field is a register whose
 * value is null, so the removal travels like any change.
 *
 * Pure: the record is a JSON object, the registers a map field → register.
 */
import type { Json } from '../../../ports/common.ts';

export interface Register {
  readonly value: Json;
  /** The text form of an HLC stamp (it sorts in time order). */
  readonly stamp: string;
  /** Sent to the cloud (or came from it). */
  readonly sent: boolean;
}
export type Registers = Readonly<Record<string, Register>>;
export type JsonRecord = Readonly<Record<string, Json>>;

/** JSON text with the keys of every object in order: two equal values give the same text. */
export function canonical(v: Json): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + (v as readonly Json[]).map(canonical).join(',') + ']';
  const o = v as { readonly [k: string]: Json };
  return (
    '{' +
    Object.keys(o)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canonical(o[k] ?? null))
      .join(',') +
    '}'
  );
}
export const sameJson = (a: Json, b: Json): boolean => canonical(a) === canonical(b);

/** Is stamp `a` later than `b` (none: everything is later)? */
export const later = (a: string, b: string | undefined): boolean => b === undefined || a > b;

/**
 * The fields of `record` that differ from their registers (set, changed, or removed: null), leaving out `skip` (secrets
 * that stay on the device). A field whose register holds null and that the record lacks is unchanged.
 */
export function changedFields(record: JsonRecord, regs: Registers, skip: ReadonlySet<string>): Array<readonly [string, Json]> {
  const out: Array<readonly [string, Json]> = [];
  for (const [f, v] of Object.entries(record)) {
    if (skip.has(f)) continue;
    const r = regs[f];
    if (!r || !sameJson(r.value, v)) out.push([f, v]);
  }
  for (const [f, r] of Object.entries(regs)) if (!(f in record) && r.value !== null && !skip.has(f)) out.push([f, null]);
  return out;
}

/** The record with one register's value in it (null: the field removed). */
export function withField(record: JsonRecord, field: string, value: Json): JsonRecord {
  if (value === null) {
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== field));
  }
  return { ...record, [field]: value };
}

/** The register key in the cloud: "<record>.<field>" (e.g. settings.goal). */
export const registerKey = (record: string, field: string): string => `${record}.${field}`;
/** A cloud register key → [record, field], or null when it names none of `records`. */
export function splitRegisterKey(key: string, records: readonly string[]): readonly [string, string] | null {
  const dot = key.indexOf('.');
  if (dot <= 0) return null;
  const rec = key.slice(0, dot),
    field = key.slice(dot + 1);
  return records.includes(rec) && field ? [rec, field] : null;
}
