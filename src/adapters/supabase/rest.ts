/**
 * PostgREST, RPC and Storage calls of the community features (vault, people, reports, engine requests) over the one
 * SupabaseClient: the signed-in person's session, the error codes of errors.ts. The features' adapters (vault.ts,
 * social.ts, reports.ts) are written in these words; no PostgREST shape leaves src/adapters/supabase/.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult } from '../../kernel/result.ts';
import { SupabaseClient, type SupabaseConfig } from './client.ts';

export const enc = encodeURIComponent;
/** The path of an object in its bucket, each part encoded. */
const objectPath = (path: string): string => path.split('/').map(enc).join('/');
export const MINIMAL = { Prefer: 'return=minimal' } as const;

export interface Rest {
  /** the signed-in person's id (null: nobody) */
  uid(): string | null;
  /** the JSON answer of a REST call (null when it has none) */
  json<T>(path: string, o?: { method?: string; body?: unknown; headers?: Record<string, string> }): AsyncResult<T | null>;
  /** the rows of a REST read ([] when it answers nothing) */
  rows<T>(path: string): AsyncResult<T[]>;
  /** a write whose answer is not needed */
  write(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, headers?: Record<string, string>): AsyncResult<void>;
  rpc<T>(fn: string, body?: unknown): AsyncResult<T | null>;
  putObject(bucket: string, path: string, body: Blob, mime: string): AsyncResult<void>;
  /** missing objects are fine */
  removeObjects(bucket: string, paths: readonly string[]): AsyncResult<void>;
  download(bucket: string, path: string, mime: string): AsyncResult<Blob>;
}

export function rest(client: SupabaseClient): Rest {
  const json = async <T>(
    path: string,
    o: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): AsyncResult<T | null> => {
    const r = await client.call(path, o);
    return r.ok ? ok(r.value.body as T | null) : r;
  };
  return {
    uid: () => client.session()?.user.id ?? null,
    json,
    async rows<T>(path: string) {
      const r = await json<T[]>(path);
      return r.ok ? ok(Array.isArray(r.value) ? r.value : []) : r;
    },
    async write(path, method, body, headers = MINIMAL) {
      const r = await client.call(path, { method, ...(body === undefined ? {} : { body }), headers });
      return r.ok ? OK_VOID : r;
    },
    rpc: <T>(fn: string, body: unknown = {}) => json<T>('/rest/v1/rpc/' + fn, { method: 'POST', body }),
    async putObject(bucket, path, body, mime) {
      const r = await client.call(`/storage/v1/object/${bucket}/${objectPath(path)}`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true' },
      });
      return r.ok ? OK_VOID : r;
    },
    async removeObjects(bucket, paths) {
      if (!paths.length) return OK_VOID;
      const r = await client.call(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes: paths } });
      return r.ok ? OK_VOID : r;
    },
    async download(bucket, path, mime) {
      const r = await client.call(`/storage/v1/object/authenticated/${bucket}/${objectPath(path)}`, { raw: true });
      if (!r.ok) return r;
      try {
        const b = await r.value.response.blob();
        return ok(mime && b.type !== mime ? new Blob([b], { type: mime }) : b);
      } catch (e) {
        return err(
          new NoemaError('cloud.network', 'the file could not be read: ' + (e instanceof Error ? e.message : 'unknown'), { cause: e }),
        );
      }
    },
  };
}

/** The calls over a client of their own (it shares the sign-in kept in the device's store with engine/cloud.js). */
export const supabaseRest = (config: SupabaseConfig): Rest => rest(new SupabaseClient(config));
