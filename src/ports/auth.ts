/**
 * Auth port: who is signed in to the cloud (docs/ARCHITECTURE.md §4).
 *
 * The session holds no token: tokens are the adapter's (the Supabase adapter keeps them and gives them only to its own
 * Remote). The app sees the user, when the session ends, and the events. Sign-in failures carry the contract codes
 * auth.* (docs/i18n.md §6.2): auth.invalid_credentials, auth.email_not_confirmed, auth.weak_password {min}, auth.network…
 */
import type { AsyncResult } from '../kernel/result.ts';
import type { Unsubscribe } from './common.ts';

export interface AuthUser {
  /** The cloud's user id (the account id is "u_" + id). */
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  /** The UI language kept with the account (docs/i18n.md §6.3), when set. */
  readonly locale: string | null;
}

export interface AuthSession {
  readonly user: AuthUser;
  /** When the session's access ends unless refreshed (epoch ms). The adapter refreshes it itself before calls. */
  readonly expiresAt: number;
}

export type SignOutReason = 'user' | 'expired';

export type AuthEvent =
  | { readonly type: 'signed_in'; readonly session: AuthSession }
  | { readonly type: 'refreshed'; readonly session: AuthSession }
  | { readonly type: 'signed_out'; readonly reason: SignOutReason };

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly locale?: string;
}

export interface Auth {
  /** The current session, or null (from this device's copy: no network). */
  session(): AuthSession | null;
  signIn(email: string, password: string): AsyncResult<AuthSession>;
  /** A new account; null when it must confirm its e-mail before the first sign-in. */
  signUp(input: SignUpInput): AsyncResult<AuthSession | null>;
  /** Ends the session here (and on the server when reachable); always signs out locally. */
  signOut(): AsyncResult<void>;
  /** A fresh session (refreshing the token when it is about to end); auth.not_signed_in without one. */
  refresh(): AsyncResult<AuthSession>;
  onChange(listener: (event: AuthEvent) => void): Unsubscribe;
}

/** The account id of a cloud user (the key namespace `noema1:u_<id>:`). */
export const cloudAccountId = (user: AuthUser): string => 'u_' + user.id;
