/**
 * An in-memory cloud (tests, phase 2's sync tests): Remote rows with compare-and-swap and strictly later versions,
 * objects, RPC functions, and an Auth with users and passwords. Several "devices" share one `memoryCloud()`.
 */
import { NoemaError } from '../../kernel/errors.ts';
import { err, ok, OK_VOID } from '../../kernel/result.ts';
import type { Auth, AuthEvent, AuthSession } from '../../ports/auth.ts';
import type { Json, Unsubscribe } from '../../ports/common.ts';
import type { Remote, RemoteRow } from '../../ports/remote.ts';

export interface MemoryCloud {
  /** The Remote and Auth of one device of the cloud. */
  device(): { readonly remote: Remote; readonly auth: Auth };
  /** Adds an account. */
  addUser(email: string, password: string, name?: string): string;
  /** Adds a server function. */
  addRpc(name: string, f: (args: { readonly [k: string]: Json }, userId: string) => Json): void;
  /** Takes the network away (every call: cloud.network / auth.network) or brings it back. */
  setOffline(offline: boolean): void;
}

export function memoryCloud(options: { readonly collections?: readonly string[]; readonly buckets?: readonly string[]; readonly now?: () => number } = {}): MemoryCloud {
  const now = options.now ?? Date.now;
  const collections = new Set(options.collections ?? ['kv']), buckets = new Set(options.buckets ?? ['private', 'public', 'shared']);
  const rows = new Map<string, RemoteRow>(); // `${user}\u0000${collection}\u0000${key}`
  const objects = new Map<string, Blob>(); // `${bucket}\u0000${path}`
  const users = new Map<string, { id: string; password: string; name: string | null }>();
  const rpcs = new Map<string, (a: { readonly [k: string]: Json }, u: string) => Json>();
  let offline = false, seq = 0;
  const after = (prev: string | null): string => new Date(Math.max(now(), (prev ? Date.parse(prev) : 0) + 1)).toISOString();

  return {
    addUser(email, password, name) { const id = 'user' + ++seq; users.set(email, { id, password, name: name ?? null }); return id; },
    addRpc(name, f) { rpcs.set(name, f); },
    setOffline(x) { offline = x; },
    device() {
      let session: AuthSession | null = null;
      const listeners = new Set<(e: AuthEvent) => void>();
      const emit = (e: AuthEvent): void => { for (const l of [...listeners]) l(e); };
      const net = (auth = false): NoemaError | null => (offline ? new NoemaError(auth ? 'auth.network' : 'cloud.network', 'Network error — are you offline? (offline)', { params: { detail: 'offline' }, retryable: true }) : null);
      const user = (): string | NoemaError => net() ?? session?.user.id ?? new NoemaError('auth.not_signed_in', 'Not signed in');
      const coll = (c: string): NoemaError | null => (collections.has(c) || buckets.has(c) ? null : new NoemaError('remote.unknown_collection', 'no table for the collection ' + c, { params: { collection: c } }));
      const k = (u: string, c: string, key: string): string => `${u}\u0000${c}\u0000${key}`;
      const conflict = (c: string, key: string): NoemaError => new NoemaError('remote.conflict', `${c}/${key} changed since it was read`, { params: { collection: c, key }, retryable: true });
      const guard = (c: string): string | NoemaError => { const u = user(); if (typeof u !== 'string') return u; return coll(c) ?? u; };

      const remote: Remote = {
        rows: {
          async get(c, key) { const u = guard(c); return typeof u === 'string' ? ok(rows.get(k(u, c, key)) ?? null) : err(u); },
          async list(c, lo = {}) {
            const u = guard(c);
            if (typeof u !== 'string') return err(u);
            const pre = `${u}\u0000${c}\u0000`;
            const out = [...rows.entries()].filter(([id, r]) => id.startsWith(pre) && r.key.startsWith(lo.prefix ?? '') && (!lo.after || r.version > lo.after)).map(([, r]) => r).sort((a, b) => (a.key < b.key ? -1 : 1));
            return ok(out.slice(0, lo.limit ?? out.length));
          },
          async put(c, key, value, { expected }) {
            const u = guard(c);
            if (typeof u !== 'string') return err(u);
            const cur = rows.get(k(u, c, key)) ?? null;
            if ((cur?.version ?? null) !== expected) return err(conflict(c, key));
            const row = Object.freeze({ key, value, version: after(expected) });
            rows.set(k(u, c, key), row);
            return ok(row);
          },
          async delete(c, key, d = {}) {
            const u = guard(c);
            if (typeof u !== 'string') return err(u);
            const cur = rows.get(k(u, c, key));
            if (cur && d.expected !== undefined && cur.version !== d.expected) return err(conflict(c, key));
            rows.delete(k(u, c, key));
            return OK_VOID;
          },
        },
        objects: {
          async put(b, path, body, po = {}) {
            const u = guard(b);
            if (typeof u !== 'string') return err(u);
            if (po.upsert === false && objects.has(`${b}\u0000${path}`)) return err(new NoemaError('cloud.unknown', 'The resource already exists', { params: { status: 409, detail: 'exists' } }));
            objects.set(`${b}\u0000${path}`, body instanceof Blob ? body : new Blob([typeof body === 'string' ? body : (body as Uint8Array<ArrayBuffer>)], po.contentType ? { type: po.contentType } : {}));
            return OK_VOID;
          },
          async get(b, path) { const u = guard(b); return typeof u === 'string' ? ok(objects.get(`${b}\u0000${path}`) ?? null) : err(u); },
          async list(b, prefix) {
            const u = guard(b);
            if (typeof u !== 'string') return err(u);
            const folder = prefix.replace(/\/+$/, ''), pre = `${b}\u0000${folder ? folder + '/' : ''}`;
            return ok([...objects.entries()].filter(([id]) => id.startsWith(pre) && !id.slice(pre.length).includes('/')).map(([id, blob]) => ({ path: id.split('\u0000')[1] ?? '', size: blob.size, updatedAt: null })));
          },
          async remove(b, paths) { const u = guard(b); if (typeof u !== 'string') return err(u); for (const p of paths) objects.delete(`${b}\u0000${p}`); return OK_VOID; },
        },
        async rpc(name, args) {
          const u = user();
          if (typeof u !== 'string') return err(u);
          const f = rpcs.get(name);
          return f ? ok(f(args, u)) : err(new NoemaError('cloud.schema_old', 'Could not find the function ' + name));
        },
      };

      const auth: Auth = {
        session: () => session,
        async signIn(email, password) {
          const n = net(true);
          if (n) return err(n);
          const u = users.get(email);
          if (!u || u.password !== password) return err(new NoemaError('auth.invalid_credentials', 'Invalid login credentials'));
          session = Object.freeze({ user: Object.freeze({ id: u.id, email, name: u.name, locale: null }), expiresAt: now() + 3600_000 });
          emit({ type: 'signed_in', session });
          return ok(session);
        },
        /** Signs in at once: this cloud asks for no e-mail confirmation. */
        async signUp(input) {
          const n = net(true);
          if (n) return err(n);
          if (users.has(input.email)) return err(new NoemaError('auth.user_already_exists', 'User already registered'));
          if (input.password.length < 6) return err(new NoemaError('auth.weak_password', 'Password should be at least 6 characters.', { params: { min: 6 } }));
          const id = 'user' + ++seq;
          users.set(input.email, { id, password: input.password, name: input.name ?? null });
          session = Object.freeze({ user: Object.freeze({ id, email: input.email, name: input.name ?? null, locale: input.locale ?? null }), expiresAt: now() + 3600_000 });
          emit({ type: 'signed_in', session });
          return ok(session);
        },
        async signOut() { if (session) { session = null; emit({ type: 'signed_out', reason: 'user' }); } return OK_VOID; },
        async refresh() {
          if (!session) return err(new NoemaError('auth.not_signed_in', 'Not signed in'));
          session = Object.freeze({ ...session, expiresAt: now() + 3600_000 });
          emit({ type: 'refreshed', session });
          return ok(session);
        },
        onChange(l): Unsubscribe { listeners.add(l); return () => { listeners.delete(l); }; },
      };
      return { remote, auth };
    },
  };
}
