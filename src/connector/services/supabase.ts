/* The anti-corruption layer to Supabase (PostgREST, Storage, Auth): every request goes out as the user, with the user's own
   access token, so row-level security applies exactly as in the app. The connector holds no secret key. */
import { trimSlash, type ConnectorConfig } from '../env.ts';

export interface RequestOptions {
  method?: string;
  /** a string or bytes are sent as they are; anything else as JSON */
  body?: unknown;
  headers?: Record<string, string>;
  /** true → the Response itself (downloads) */
  raw?: boolean;
}

export class SupabaseError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Supabase ${status}: ${detail.slice(0, 300)}`);
    this.name = 'SupabaseError';
    this.status = status;
  }
}

/** One user's view of the project. */
export class Supabase {
  readonly base: string;
  private readonly cfg: ConnectorConfig;
  readonly token: string;
  private readonly net: typeof fetch;
  constructor(cfg: ConnectorConfig, token: string, net: typeof fetch) {
    this.cfg = cfg;
    this.token = token;
    this.net = net;
    this.base = trimSlash(cfg.supabaseUrl);
  }
  get key(): string {
    return this.cfg.supabaseKey;
  }

  async raw(path: string, o: RequestOptions = {}): Promise<Response> {
    const bin = typeof o.body === 'string' || o.body instanceof Uint8Array;
    const headers: Record<string, string> = {
      apikey: this.cfg.supabaseKey,
      authorization: 'Bearer ' + this.token,
      ...(o.body != null && !bin ? { 'content-type': 'application/json' } : {}),
      ...(o.headers ?? {}),
    };
    const init: RequestInit = { method: o.method ?? 'GET', headers };
    if (o.body != null) init.body = bin ? (o.body as string | Uint8Array<ArrayBuffer>) : JSON.stringify(o.body);
    const r = await this.net(this.base + path, init);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new SupabaseError(r.status, t);
    }
    return r;
  }
  /** The parsed JSON answer (null for an empty one). */
  async request<T = unknown>(path: string, o: RequestOptions = {}): Promise<T> {
    const r = await this.raw(path, o);
    const t = await r.text();
    return (t ? JSON.parse(t) : null) as T;
  }
  /** The shape engine/curshare.js expects for its `api` (path, options) → JSON | Response. */
  readonly api = (path: string, o: RequestOptions = {}): Promise<unknown> => (o.raw ? this.raw(path, o) : this.request(path, o));
  /** A storage URL as the outside world sees it (the signed paths Supabase returns start with /object/…). */
  storageUrl(rel: string): string {
    return `${this.base}/storage/v1${rel}`;
  }
}

/** The signed-in user, or null when the token is not (or no longer) valid. Other failures throw. */
export async function currentUser(sb: Supabase): Promise<AuthUser | null> {
  try {
    const u = await sb.request<AuthUser | null>('/auth/v1/user');
    return u?.id ? u : null;
  } catch (e) {
    if (e instanceof SupabaseError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}
export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: { name?: string } & Record<string, unknown>;
}
export const nameOf = (u: AuthUser | null | undefined): string => u?.user_metadata?.name || (u?.email ?? '').split('@')[0] || '';
