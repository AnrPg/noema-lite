/* The learner's key/value rows (noema_kv, = engine/cloud.js): records the app syncs (a:curriculum:…, a:packmeta:…), the inboxes
   other writers append for the app to read and delete (a:curin:…, a:langin:…) and the claims of runs (a:curclaim:…).
   Every conditional write goes through swap(): it replaces a row only if it is still the version that was read, and stamps it
   with a version strictly later than that one (isoAfter), so a row's version always moves forward. */
import { isoAfter, jitter, parseJson } from '../util.ts';
import type { Supabase } from './supabase.ts';

export interface KvRow {
  key: string;
  value: string;
  updated_at: string;
}
const enc = encodeURIComponent;
const KV = '/rest/v1/noema_kv';

export class KvStore {
  private readonly sb: Supabase;
  private readonly uid: string;
  constructor(sb: Supabase, uid: string) {
    this.sb = sb;
    this.uid = uid;
  }

  /** One row, or null. */
  async row(key: string): Promise<KvRow | null> {
    const r = await this.sb.request<KvRow[] | null>(`${KV}?select=key,value,updated_at&key=eq.${enc(key)}`);
    return r?.[0] ?? null;
  }
  /** The parsed value of one key, or `d` (missing, unreadable or not JSON). */
  async get<T>(key: string, d: T): Promise<T> {
    const r = await this.row(key).catch(() => null);
    const v = r ? parseJson(r.value) : undefined;
    return v == null ? d : (v as T);
  }
  async has(key: string): Promise<boolean> {
    const r = await this.sb.request<unknown[] | null>(`${KV}?select=key&key=eq.${enc(key)}`).catch(() => []);
    return Array.isArray(r) && r.length > 0;
  }
  /** Every row whose key starts with `prefix`, in key order. */
  async rows(prefix: string): Promise<KvRow[]> {
    return (await this.sb.request<KvRow[] | null>(`${KV}?select=key,value,updated_at&order=key&key=like.${enc(prefix + '*')}`)) ?? [];
  }
  /** Write a row whatever is there (an upsert): records only the connector writes, inbox entries with a key of their own. */
  async put(key: string, value: unknown): Promise<void> {
    await this.sb.request(`${KV}?on_conflict=user_id,key`, {
      method: 'POST',
      body: [{ user_id: this.uid, key, value: JSON.stringify(value), updated_at: new Date().toISOString() }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
  /** Insert the row only if the key is free → the row written, or null when somebody has it. */
  async insert(key: string, value: string): Promise<KvRow | null> {
    const at = new Date().toISOString();
    const r = await this.sb.request<KvRow[] | null>(`${KV}?on_conflict=user_id,key`, {
      method: 'POST',
      body: [{ user_id: this.uid, key, value, updated_at: at }],
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    });
    return Array.isArray(r) && r[0] ? r[0] : null;
  }
  /** THE compare-and-swap: replace `key` only if it is still the version `prev` (its updated_at as read); the new version is
      strictly later than `prev`. → the row written, or null when another writer changed it first (or it is gone). */
  async swap(key: string, prev: string, value: string): Promise<KvRow | null> {
    const r = await this.sb.request<KvRow[] | null>(`${KV}?user_id=eq.${this.uid}&key=eq.${enc(key)}&updated_at=eq.${enc(prev)}`, {
      method: 'PATCH',
      body: { value, updated_at: isoAfter(prev) },
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(r) && r[0] ? r[0] : null;
  }
  /** Change one JSON value with a read-modify-swap, retried on a clash. fn(value) → the new value, or null to leave it.
      → true once written. */
  async update<T>(key: string, fn: (v: T) => T | null | undefined): Promise<boolean> {
    for (let i = 0; i < 5; i++) {
      const row = await this.row(key);
      if (!row) return false;
      const v = parseJson(row.value);
      if (v === undefined) return false;
      const nv = fn(v as T);
      if (nv == null) return false;
      if (await this.swap(key, row.updated_at, JSON.stringify(nv))) return true;
      await jitter(150, 350);
    }
    return false;
  }
  async delete(key: string): Promise<void> {
    await this.sb.request(`${KV}?key=eq.${enc(key)}`, { method: 'DELETE' });
  }
}
