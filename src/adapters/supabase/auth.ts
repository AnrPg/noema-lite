/** The Auth port over Supabase Auth (GoTrue). The tokens stay in the SupabaseClient; the app sees AuthSession only. */
import { err, ok, OK_VOID } from '../../kernel/result.ts';
import type { Auth, AuthEvent, AuthSession, AuthUser } from '../../ports/auth.ts';
import type { Unsubscribe } from '../../ports/common.ts';
import type { StoredSession, SupabaseClient } from './client.ts';
import { notSignedIn } from './errors.ts';

const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null);

/** GoTrue's user → the port's user (the ACL's only way in). */
export function toUser(u: StoredSession['user']): AuthUser {
  const m = u.user_metadata ?? {};
  return Object.freeze({ id: u.id, email: u.email, name: str(m['name']) ?? str(m['full_name']), locale: str(m['locale']) });
}
export const toSession = (s: StoredSession): AuthSession => Object.freeze({ user: toUser(s.user), expiresAt: s.expires_at * 1000 });

export function supabaseAuth(client: SupabaseClient): Auth {
  const listeners = new Set<(e: AuthEvent) => void>();
  const emit = (e: AuthEvent): void => { for (const l of [...listeners]) l(e); };
  client.onSession = (s, why) => {
    if (s && why === 'signed_in') emit({ type: 'signed_in', session: toSession(s) });
    else if (s && why === 'refreshed') emit({ type: 'refreshed', session: toSession(s) });
    else if (!s) emit({ type: 'signed_out', reason: why === 'expired' ? 'expired' : 'user' });
  };
  const signedIn = (body: unknown) => {
    const s = client.setSession(body, 'signed_in');
    return s ? ok(toSession(s)) : err(notSignedIn());
  };
  return {
    session() { const s = client.session(); return s ? toSession(s) : null; },
    async signIn(email, password) {
      const r = await client.call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } });
      return r.ok ? signedIn(r.value.body) : r;
    },
    async signUp(input) {
      const data: Record<string, string> = {};
      if (input.name) data['name'] = input.name;
      if (input.locale) data['locale'] = input.locale;
      const r = await client.call('/auth/v1/signup', { method: 'POST', auth: false, body: { email: input.email, password: input.password, data } });
      if (!r.ok) return r;
      const body = r.value.body as { access_token?: unknown } | null;
      if (!body || typeof body.access_token !== 'string') return ok(null); // the e-mail must be confirmed first
      return signedIn(body);
    },
    async signOut() {
      if (client.session()) {
        // the server is told when it can be reached; signing out HERE never depends on it (offline, an expired token)
        await client.call('/auth/v1/logout', { method: 'POST' });
      }
      client.setSession(null, 'signed_out');
      return OK_VOID;
    },
    async refresh() {
      const s = client.session();
      if (!s) return err(notSignedIn());
      const r = await client.fresh();
      return r.ok ? ok(toSession(r.value)) : r;
    },
    onChange(listener): Unsubscribe { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
