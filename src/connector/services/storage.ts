/* The learner's private storage (bucket noema-private, folder <uid>/…): signed upload / download links for Claude's sandbox,
   reads that must see the latest write, writes, lists. */
import type { Supabase } from './supabase.ts';

export const PRIVATE = 'noema-private';
export interface StorageObject { name: string; updated_at?: string; metadata?: { size?: number; eTag?: string } | null }

/** Reads that must see the latest write (a file read-modify-written while other saves run): the storage CDN may hand back the
    copy it cached before (uploads default to max-age 3600), so ask past it. */
const FRESH = { 'cache-control': 'no-cache' };
const fresh = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}fresh=${Date.now()}`;

export class Storage {
  private readonly sb: Supabase;
  constructor(sb: Supabase) { this.sb = sb; }

  /** A signed PUT URL (2 h) for an object of the private bucket (path: <uid>/…). */
  async uploadUrl(path: string, bucket = PRIVATE): Promise<string> {
    const r = await this.sb.request<{ url: string }>(`/storage/v1/object/upload/sign/${bucket}/${path}`, { method: 'POST', headers: { 'x-upsert': 'true' } });
    return this.sb.storageUrl(r.url);
  }
  /** A signed download URL. */
  async downloadUrl(path: string, expiresIn: number, bucket = PRIVATE): Promise<string> {
    const r = await this.sb.request<{ signedURL: string }>(`/storage/v1/object/sign/${bucket}/${path}`, { method: 'POST', body: { expiresIn } });
    return this.sb.storageUrl(r.signedURL);
  }
  /** The objects directly in a folder (prefix ends with '/'); [] when it cannot be listed. */
  async list(prefix: string, limit = 1000): Promise<StorageObject[]> {
    const r = await this.sb.request<StorageObject[] | null>(`/storage/v1/object/list/${PRIVATE}`, { method: 'POST', body: { prefix, limit } }).catch(() => []);
    return r ?? [];
  }
  /** The latest bytes of an object (past the CDN). Throws when it is missing. */
  async readFresh(path: string): Promise<Response> {
    return this.sb.raw(fresh(`/storage/v1/object/authenticated/${PRIVATE}/${path}`), { headers: FRESH });
  }
  /** The object as text (past the CDN), or null when it is missing. */
  async text(path: string): Promise<string | null> {
    try { return await (await this.readFresh(path)).text(); } catch { return null; }
  }
  /** The object as JSON (past the CDN), or null when it is missing or not JSON. */
  async json<T = unknown>(path: string): Promise<T | null> {
    const t = await this.text(path); if (t == null) return null;
    try { return JSON.parse(t) as T; } catch { return null; }
  }
  /** Write (or replace) a JSON object. noCache: readers after this one must not get an older copy from the CDN. */
  async writeJson(path: string, body: string, { noCache = false, bucket = PRIVATE }: { noCache?: boolean; bucket?: string } = {}): Promise<void> {
    await this.sb.request(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-upsert': 'true', ...(noCache ? { 'cache-control': 'no-cache' } : {}) } });
  }
  async remove(paths: string[], bucket = PRIVATE): Promise<void> {
    if (paths.length) await this.sb.request(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes: paths } });
  }
}
