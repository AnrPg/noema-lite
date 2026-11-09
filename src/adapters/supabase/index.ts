/** Supabase behind its anti-corruption layer: one client, the Auth and Remote ports over it. */
import type { Auth } from '../../ports/auth.ts';
import type { Remote } from '../../ports/remote.ts';
import { supabaseAuth } from './auth.ts';
import { SupabaseClient, type SupabaseConfig } from './client.ts';
import { supabaseRemote, type SupabaseRemoteOptions } from './remote.ts';

export function createSupabase(
  config: SupabaseConfig,
  options: SupabaseRemoteOptions = {},
): { readonly auth: Auth; readonly remote: Remote } {
  const client = new SupabaseClient(config);
  return { auth: supabaseAuth(client), remote: supabaseRemote(client, options) };
}

export { SESSION_KEY, versionAfter, type FetchLike, type SupabaseConfig } from './client.ts';
export { BUCKETS, TABLES } from './remote.ts';
