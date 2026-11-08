/**
 * The Supabase client shared by the Auth and Remote adapters: HTTP over an injected fetch, the session (kept in the
 * device's key-value store in the same form engine/cloud.js keeps it, so both see one sign-in), the token refresh, and
 * the version stamps of compare-and-swap. Supabase shapes live only in src/adapters/supabase/.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, type AsyncResult, type Result } from '../../kernel/result.ts';
import type { KeyValueStore } from '../../ports/storage.ts';
import { failedAnswer, networkError, notSignedIn } from './errors.ts';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: BodyInit | null; signal?: AbortSignal; keepalive?: boolean },
) => Promise<Response>;

/** The session as GoTrue gives it and engine/cloud.js keeps it ('noema1:cloud:session'). */
export interface StoredSession {
  readonly access_token: string;
  readonly refresh_token: string;
  /** Seconds since the epoch. */
  readonly expires_at: number;
  /** engine/cloud.js may keep a session without it */
  readonly user: { readonly id: string; readonly email: string; readonly user_metadata?: { readonly [key: string]: unknown } };
}

export interface SupabaseConfig {
  /** https://<ref>.supabase.co */
  readonly url: string;
  /** The publishable key (sb_publishable_…) or a legacy anon JWT. */
  readonly key: string;
  readonly fetch: FetchLike;
  readonly store: KeyValueStore;
  readonly sessionKey?: string;
  readonly now?: () => number;
}

export const SESSION_KEY = 'noema1:cloud:session';

/** A kept session that has what every call needs: its access token and its user's id. */
function isStoredSession(s: unknown): s is StoredSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as { access_token?: unknown; user?: { id?: unknown } | null };
  return typeof o.access_token === 'string' && !!o.user && typeof o.user.id === 'string';
}

export interface CallOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** With the user's session (default) or only the project key. */
  readonly auth?: boolean;
  readonly signal?: AbortSignal;
  /** Leave the answer's body unread (a file to download: Answer.response has it). */
  readonly raw?: boolean;
}

export interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly response: Response;
}

/** A version stamp strictly later than the one it replaces, even within one millisecond or with a clock behind the server
    (= engine/cloud.js isoAfter, cloud/mcp/server.mjs kvUpdate). */
export function versionAfter(previous: string | null, now: number): string {
  const prev = previous ? Date.parse(previous) : NaN;
  return new Date(Math.max(now, (Number.isNaN(prev) ? 0 : prev) + 1)).toISOString();
}

export class SupabaseClient {
  readonly #c: SupabaseConfig;
  readonly #base: string;
  readonly now: () => number;
  /** Called when the session changes here (sign-in, refresh, sign-out, expiry). */
  onSession: ((s: StoredSession | null, why: 'signed_in' | 'refreshed' | 'signed_out' | 'expired') => void) | null = null;
  #refreshing: Promise<Result<StoredSession>> | null = null;

  constructor(config: SupabaseConfig) {
    this.#c = config;
    this.#base = config.url.replace(/\/+$/, '');
    this.now = config.now ?? Date.now;
  }

  get key(): string {
    return this.#c.sessionKey ?? SESSION_KEY;
  }

  session(): StoredSession | null {
    const raw = this.#c.store.get(this.key);
    if (!raw.ok || !raw.value) return null;
    try {
      const s: unknown = JSON.parse(raw.value);
      return isStoredSession(s) ? s : null;
    } catch {
      // a session copy that cannot be read is no session: the learner signs in again (nothing of theirs is lost)
      return null;
    }
  }

  /** Keeps a GoTrue session answer (or forgets the session: null). */
  setSession(answer: unknown, why: 'signed_in' | 'refreshed' | 'signed_out' | 'expired'): StoredSession | null {
    if (!answer) {
      this.#c.store.delete(this.key);
      this.onSession?.(null, why);
      return null;
    }
    const a = answer as {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in?: number;
      user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
    };
    const s: StoredSession = {
      access_token: a.access_token,
      refresh_token: a.refresh_token,
      expires_at: a.expires_at ?? Math.floor(this.now() / 1000) + (a.expires_in ?? 3600),
      user: { id: a.user.id, email: a.user.email ?? '', user_metadata: a.user.user_metadata ?? {} },
    };
    this.#c.store.set(this.key, JSON.stringify(s));
    this.onSession?.(s, why);
    return s;
  }

  /** The session, refreshed when it ends within a minute (one refresh at a time). */
  async fresh(): AsyncResult<StoredSession> {
    const s = this.session();
    if (!s) return err(notSignedIn());
    if (s.expires_at - 60 > this.now() / 1000) return ok(s);
    if (!this.#refreshing)
      this.#refreshing = this.#refresh(s).finally(() => {
        this.#refreshing = null;
      });
    return this.#refreshing;
  }

  async #refresh(s: StoredSession): AsyncResult<StoredSession> {
    const r = await this.call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: s.refresh_token },
      auth: false,
    });
    if (!r.ok) {
      if (r.error.code === 'auth.session_expired') this.setSession(null, 'expired');
      return r;
    }
    const kept = this.setSession(r.value.body, 'refreshed');
    return kept ? ok(kept) : err(notSignedIn());
  }

  async call(path: string, o: CallOptions = {}): AsyncResult<Answer> {
    let bearer: string | null = /^sb_/.test(this.#c.key) ? null : this.#c.key; // a publishable key is not a JWT
    if (o.auth !== false) {
      const s = await this.fresh();
      if (!s.ok) return s;
      bearer = s.value.access_token;
    }
    const isBinary = o.body instanceof Blob || o.body instanceof Uint8Array;
    const headers: Record<string, string> = {
      apikey: this.#c.key,
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(o.body !== undefined && !isBinary && typeof o.body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...o.headers,
    };
    const body: BodyInit | null =
      o.body === undefined
        ? null
        : o.body instanceof Blob || typeof o.body === 'string'
          ? o.body
          : o.body instanceof Uint8Array
            ? new Blob([o.body as Uint8Array<ArrayBuffer>])
            : JSON.stringify(o.body);
    let response: Response;
    try {
      response = await this.#c.fetch(this.#base + path, {
        method: o.method ?? 'GET',
        headers,
        body,
        ...(o.signal ? { signal: o.signal } : {}),
      });
    } catch (e) {
      return err(networkError(path, e));
    }
    const ct = response.headers.get('content-type') ?? '';
    if (o.raw && response.ok) return ok({ status: response.status, body: null, response });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      } // not JSON: the server's plain words are the body
      return err(failedAnswer(path, parsed, response.status));
    }
    if (!/json/.test(ct)) return ok({ status: response.status, body: null, response });
    const text = await response.text();
    try {
      return ok({ status: response.status, body: text ? (JSON.parse(text) as unknown) : null, response });
    } catch (e) {
      return err(
        new NoemaError('cloud.unknown', 'the cloud answered something that is not JSON', {
          cause: e,
          params: { status: response.status, detail: text.slice(0, 120) },
        }),
      );
    }
  }
}
