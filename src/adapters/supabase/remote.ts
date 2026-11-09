/**
 * The Remote port over PostgREST and Supabase Storage. The app's collections and buckets map to tables and buckets
 * here (TABLES, BUCKETS); a row's version is its `updated_at`, and every accepted write stamps one strictly later than the
 * one it replaced (versionAfter). Compare-and-swap: PATCH … &updated_at=eq.<expected> (no row back = refused), and an
 * insert that never overwrites (resolution=ignore-duplicates) for "must not exist yet".
 * Logs and registers (cloud/supabase.sql §19): an append is an insert that ignores ids already there; a register write is
 * an upsert the table's trigger keeps only when its stamp is later (and clamps a stamp from the future); reads go through
 * the `*_since` functions, whose cursor ("<transaction>:<sequence>") only ever passes entries that every later read sees too.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../kernel/result.ts';
import { textOf } from '../../kernel/text.ts';
import type { Json } from '../../ports/common.ts';
import type { LogEntry, ObjectInfo, Page, ReadFrom, RegisterEntry, Remote, RemoteRow, RowListOptions } from '../../ports/remote.ts';
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
export interface StreamMap {
  readonly table: string;
  /** The function that reads it from a cursor: (after text, max_rows int) → rows + cursor. */
  readonly since: string;
}
/** The app's logs → their tables (append-only). */
export const LOGS: { readonly [stream: string]: StreamMap } = Object.freeze({
  events: { table: 'noema_events', since: 'noema_events_since' },
});
/** The app's register collections → their tables (last writer wins by stamp). */
export const REGISTERS: { readonly [collection: string]: StreamMap } = Object.freeze({
  settings: { table: 'noema_settings', since: 'noema_settings_since' },
});
/** Rows per request (PostgREST takes more; this keeps each body small). */
export const BATCH = 100;
/** Rows per read (the functions cap it the same way). */
export const READ_MAX = 1000;

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
  readonly logs?: { readonly [stream: string]: StreamMap };
  readonly registers?: { readonly [collection: string]: StreamMap };
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
    async put(collection, key, value, { expected, keepalive }) {
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
          ...(keepalive ? { keepalive: true } : {}),
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
          ...(keepalive ? { keepalive: true } : {}),
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

  const streamOf = (maps: { readonly [k: string]: StreamMap }, c: string): Result<StreamMap> => {
    const t = maps[c];
    return t ? ok(t) : err(new NoemaError('remote.unknown_collection', 'no table for the collection ' + c, { params: { collection: c } }));
  };
  const logMaps = o.logs ?? LOGS,
    registerMaps = o.registers ?? REGISTERS;
  const str = (x: unknown): string => (typeof x === 'string' ? x : textOf(x ?? ''));
  /** A `*_since` answer → a page (the ACL: no table column passes it). */
  async function since<T>(t: StreamMap, from: ReadFrom, entry: (r: Record<string, unknown>) => T): AsyncResult<Page<T>> {
    const limit = Math.min(from.limit ?? READ_MAX, READ_MAX);
    const r = await client.call(`/rest/v1/rpc/${enc(t.since)}`, { method: 'POST', body: { after: from.after, max_rows: limit } });
    if (!r.ok) return r;
    const got = Array.isArray(r.value.body) ? (r.value.body as Array<Record<string, unknown>>) : [];
    const last = got.at(-1);
    return ok({ entries: got.map(entry), cursor: last ? str(last['cursor']) : from.after, more: got.length >= limit });
  }
  const json = (x: unknown): Json => (x === undefined ? null : (x as Json));
  const toLog = (r: Record<string, unknown>): LogEntry =>
    Object.freeze({ id: str(r['id']), kind: str(r['type']), stamp: str(r['hlc']), device: str(r['device']), body: json(r['body']) });
  const toRegister = (r: Record<string, unknown>): RegisterEntry =>
    Object.freeze({ key: str(r['key']), value: json(r['value']), stamp: str(r['hlc']), device: str(r['device']) });

  const log: Remote['log'] = {
    async append(stream, entries, so = {}) {
      const t = streamOf(logMaps, stream);
      if (!t.ok) return t;
      const user = uid();
      for (let i = 0; i < entries.length; i += BATCH) {
        const rows = entries.slice(i, i + BATCH).map(e => ({
          ...(user ? { user_id: user } : {}),
          id: e.id,
          type: e.kind,
          hlc: e.stamp,
          device: e.device,
          body: e.body,
        }));
        const r = await client.call(`/rest/v1/${t.value.table}?on_conflict=user_id,id`, {
          method: 'POST',
          body: rows,
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          ...(so.keepalive ? { keepalive: true } : {}),
        });
        if (!r.ok) return r;
      }
      return OK_VOID;
    },
    async read(stream, from) {
      const t = streamOf(logMaps, stream);
      return t.ok ? since(t.value, from, toLog) : t;
    },
  };

  const registers: Remote['registers'] = {
    async put(collection, entries, so = {}) {
      const t = streamOf(registerMaps, collection);
      if (!t.ok) return t;
      const user = uid(),
        kept: RegisterEntry[] = [];
      for (let i = 0; i < entries.length; i += BATCH) {
        const rows = entries
          .slice(i, i + BATCH)
          .map(e => ({ ...(user ? { user_id: user } : {}), key: e.key, value: e.value, hlc: e.stamp, device: e.device }));
        const r = await client.call(`/rest/v1/${t.value.table}?on_conflict=user_id,key`, {
          method: 'POST',
          body: rows,
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          ...(so.keepalive ? { keepalive: true } : {}),
        });
        if (!r.ok) return r;
        if (Array.isArray(r.value.body)) for (const x of r.value.body as Array<Record<string, unknown>>) kept.push(toRegister(x));
      }
      return ok(kept);
    },
    async read(collection, from) {
      const t = streamOf(registerMaps, collection);
      return t.ok ? since(t.value, from, toRegister) : t;
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
    log,
    registers,
    async rpc(name, args) {
      const r = await client.call(`/rest/v1/rpc/${enc(name)}`, { method: 'POST', body: args });
      return r.ok ? ok((r.value.body ?? null) as Json) : r;
    },
  };
}
