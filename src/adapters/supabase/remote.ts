/**
 * The Remote port over PostgREST and Supabase Storage. The app's collections and buckets map to tables and buckets
 * here (TABLES, BUCKETS); a row's version is its `updated_at`, and every accepted write stamps one strictly later than the
 * one it replaced (versionAfter). Compare-and-swap: PATCH … &updated_at=eq.<expected> (no row back = refused), and an
 * insert that never overwrites (resolution=ignore-duplicates) for "must not exist yet".
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../kernel/result.ts';
import { textOf } from '../../kernel/text.ts';
import type { Json } from '../../ports/common.ts';
import type { ObjectInfo, Remote, RemoteRow, RowListOptions } from '../../ports/remote.ts';
import { versionAfter, type SupabaseClient } from './client.ts';

export interface TableMap {
  readonly table: string;
  readonly key: string;
  readonly value: string;
  readonly version: string;
}
/** The app's collections → their tables (cloud/supabase.sql). */
export const TABLES: { readonly [collection: string]: TableMap } = Object.freeze({
  kv: { table: 'noema_kv', key: 'key', value: 'value', version: 'updated_at' },
});
/** The app's buckets → Supabase Storage buckets. */
export const BUCKETS: { readonly [bucket: string]: string } = Object.freeze({
  private: 'noema-private',
  public: 'noema-public',
  shared: 'noema-shared',
});

const enc = encodeURIComponent;
const encPath = (p: string): string => p.split('/').map(enc).join('/');
/** A PostgREST `like` pattern that matches the prefix literally (`*` is its wildcard; `%` `_` `\` are escaped). */
const likePrefix = (p: string): string => enc(p.replace(/[\\%_*]/g, m => '\\' + m) + '*');
const conflict = (collection: string, key: string): NoemaError =>
  new NoemaError('remote.conflict', `${collection}/${key} changed since it was read`, { params: { collection, key }, retryable: true });

export interface SupabaseRemoteOptions {
  readonly tables?: { readonly [collection: string]: TableMap };
  readonly buckets?: { readonly [bucket: string]: string };
}

export function supabaseRemote(client: SupabaseClient, o: SupabaseRemoteOptions = {}): Remote {
  const tables = o.tables ?? TABLES,
    buckets = o.buckets ?? BUCKETS;
  const tableOf = (c: string): Result<TableMap> => {
    const t = tables[c];
    return t ? ok(t) : err(new NoemaError('remote.unknown_collection', 'no table for the collection ' + c, { params: { collection: c } }));
  };
  const bucketOf = (b: string): Result<string> => {
    const x = buckets[b];
    return x ? ok(x) : err(new NoemaError('remote.unknown_collection', 'no bucket ' + b, { params: { collection: b } }));
  };
  /** A table row → the port's row (the ACL's only way in). */
  const toRow = (t: TableMap, r: Record<string, unknown>): RemoteRow =>
    Object.freeze({ key: String(r[t.key]), value: textOf(r[t.value] ?? ''), version: String(r[t.version]) });
  const rowsOf = (t: TableMap, body: unknown): RemoteRow[] =>
    Array.isArray(body) ? body.map(r => toRow(t, r as Record<string, unknown>)) : [];
  const uid = (): string | null => client.session()?.user.id ?? null;
  const select = (t: TableMap): string => `select=${t.key},${t.value},${t.version}`;

  const rows: Remote['rows'] = {
    async get(collection, key) {
      const t = tableOf(collection);
      if (!t.ok) return t;
      const r = await client.call(`/rest/v1/${t.value.table}?${select(t.value)}&${t.value.key}=eq.${enc(key)}`);
      return r.ok ? ok(rowsOf(t.value, r.value.body)[0] ?? null) : r;
    },
    async list(collection, lo: RowListOptions = {}) {
      const t = tableOf(collection);
      if (!t.ok) return t;
      const T = t.value;
      let q = `/rest/v1/${T.table}?${select(T)}&order=${T.key}.asc`;
      if (lo.prefix) q += `&${T.key}=like.${likePrefix(lo.prefix)}`;
      if (lo.after) q += `&${T.version}=gt.${enc(lo.after)}`;
      if (lo.limit !== undefined) q += `&limit=${lo.limit}`;
      const r = await client.call(q);
      return r.ok ? ok(rowsOf(T, r.value.body).filter(x => !lo.prefix || x.key.startsWith(lo.prefix))) : r;
    },
    async put(collection, key, value, { expected }) {
      const t = tableOf(collection);
      if (!t.ok) return t;
      const T = t.value,
        version = versionAfter(expected, client.now());
      if (expected === null) {
        const user = uid();
        const r = await client.call(`/rest/v1/${T.table}?on_conflict=user_id,${T.key}`, {
          method: 'POST',
          body: [{ ...(user ? { user_id: user } : {}), [T.key]: key, [T.value]: value, [T.version]: version }],
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        });
        if (!r.ok) return r;
        const got = rowsOf(T, r.value.body)[0];
        return got ? ok(got) : err(conflict(collection, key));
      }
      const user = uid();
      const r = await client.call(
        `/rest/v1/${T.table}?${user ? `user_id=eq.${enc(user)}&` : ''}${T.key}=eq.${enc(key)}&${T.version}=eq.${enc(expected)}`,
        {
          method: 'PATCH',
          body: { [T.value]: value, [T.version]: version },
          headers: { Prefer: 'return=representation' },
        },
      );
      if (!r.ok) return r;
      const got = rowsOf(T, r.value.body)[0];
      return got ? ok(got) : err(conflict(collection, key));
    },
    async delete(collection, key, d = {}) {
      const t = tableOf(collection);
      if (!t.ok) return t;
      const T = t.value,
        user = uid();
      const r = await client.call(
        `/rest/v1/${T.table}?${user ? `user_id=eq.${enc(user)}&` : ''}${T.key}=eq.${enc(key)}${d.expected !== undefined ? `&${T.version}=eq.${enc(d.expected)}` : ''}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' },
        },
      );
      if (!r.ok) return r;
      if (d.expected === undefined || rowsOf(T, r.value.body).length) return OK_VOID;
      const still = await rows.get(collection, key); // nothing deleted: gone already (fine) or changed (refused)
      if (!still.ok) return still;
      return still.value ? err(conflict(collection, key)) : OK_VOID;
    },
  };

  const objects: Remote['objects'] = {
    async put(bucket, path, body, po = {}) {
      const b = bucketOf(bucket);
      if (!b.ok) return b;
      const r = await client.call(`/storage/v1/object/${b.value}/${encPath(path)}`, {
        method: 'POST',
        body: typeof body === 'string' ? new Blob([body], { type: po.contentType ?? 'text/plain' }) : body,
        headers: { 'Content-Type': po.contentType ?? 'application/octet-stream', 'x-upsert': po.upsert === false ? 'false' : 'true' },
      });
      return r.ok ? OK_VOID : r;
    },
    async get(bucket, path): AsyncResult<Blob | null> {
      const b = bucketOf(bucket);
      if (!b.ok) return b;
      const r = await client.call(`/storage/v1/object/authenticated/${b.value}/${encPath(path)}`);
      if (!r.ok) return r.error.status === 404 || /not.?found/i.test(r.error.message) ? ok(null) : r;
      return ok(await r.value.response.blob());
    },
    async list(bucket, prefix): AsyncResult<ObjectInfo[]> {
      const b = bucketOf(bucket);
      if (!b.ok) return b;
      const folder = prefix.replace(/\/+$/, '');
      const r = await client.call(`/storage/v1/object/list/${b.value}`, {
        method: 'POST',
        body: { prefix: folder, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } },
      });
      if (!r.ok) return r;
      const items = Array.isArray(r.value.body)
        ? (r.value.body as Array<{ name?: unknown; updated_at?: unknown; metadata?: { size?: unknown } | null }>)
        : [];
      return ok(
        items.map(x =>
          Object.freeze({
            path: (folder ? folder + '/' : '') + String(x.name),
            size: typeof x.metadata?.size === 'number' ? x.metadata.size : null,
            updatedAt: typeof x.updated_at === 'string' ? x.updated_at : null,
          }),
        ),
      );
    },
    async remove(bucket, paths) {
      const b = bucketOf(bucket);
      if (!b.ok) return b;
      if (!paths.length) return OK_VOID;
      const r = await client.call(`/storage/v1/object/${b.value}`, { method: 'DELETE', body: { prefixes: [...paths] } });
      return r.ok ? OK_VOID : r;
    },
  };

  return {
    rows,
    objects,
    async rpc(name, args) {
      const r = await client.call(`/rest/v1/rpc/${enc(name)}`, { method: 'POST', body: args });
      return r.ok ? ok((r.value.body ?? null) as Json) : r;
    },
  };
}
