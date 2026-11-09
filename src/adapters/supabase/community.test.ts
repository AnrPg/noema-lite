/// <reference types="node" />
/**
 * The community adapters (vault.ts, social.ts, reports.ts over rest.ts) pass their ports' contracts against the emulator
 * the browser suites use (tests/mock_supabase.js: the rules of cloud/supabase.sql §12–§16), over real HTTP.
 */
import { after, before } from 'node:test';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { reportsContract } from '../../ports/contract/reports.contract.ts';
import { socialContract } from '../../ports/contract/social.contract.ts';
import { vaultContract } from '../../ports/contract/vault.contract.ts';
import { memoryStorage } from '../memory/storage.ts';
import { SESSION_KEY } from './client.ts';
import { supabaseEngineRequests, supabaseReports } from './reports.ts';
import { supabaseRest, type Rest } from './rest.ts';
import { supabaseSocial } from './social.ts';
import { supabaseVault } from './vault.ts';

interface Mock extends Server {
  readonly state: { readonly admins: Set<string> };
}
const require = createRequire(import.meta.url);
const mock = require('../../../tests/mock_supabase.js') as { start(o: { port: number }): Promise<Mock> };

const KEY = 'sb_publishable_test';
let srv: Mock | null = null,
  base = '';
before(async () => {
  srv = await mock.start({ port: 0 });
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
after(() => {
  srv?.close();
});

/** A new person, signed up on the emulator, with the session kept as engine/cloud.js keeps it. */
async function person(name: string): Promise<{ rest: Rest; email: string }> {
  const email = `${name.toLowerCase()}-${globalThis.crypto.randomUUID().slice(0, 8)}@example.org`;
  const res = await fetch(base + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-1', data: { name } }),
  });
  const session = (await res.json()) as Record<string, unknown>;
  const store = memoryStorage().kv;
  store.set(SESSION_KEY, JSON.stringify({ ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  return { rest: supabaseRest({ url: base, key: KEY, fetch: (u, i) => fetch(u, i), store }), email };
}

vaultContract('supabase (tests/mock_supabase.js)', async () => supabaseVault((await person('Vera')).rest));
socialContract('supabase (tests/mock_supabase.js)', async () => ({
  a: supabaseSocial((await person('Ada')).rest),
  b: supabaseSocial((await person('Bo')).rest),
}));
reportsContract('supabase (tests/mock_supabase.js)', async () => {
  const admin = await person('Admin'),
    learner = await person('Lea');
  srv?.state.admins.add(admin.email);
  return {
    admin: { reports: supabaseReports(admin.rest), requests: supabaseEngineRequests(admin.rest) },
    learner: { reports: supabaseReports(learner.rest), requests: supabaseEngineRequests(learner.rest) },
  };
});
