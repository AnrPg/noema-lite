/* An in-memory PostgREST for the connector's unit tests: the tables noema_kv and noema_sagas with the rules the services rely
   on — upsert (merge- / ignore-duplicates), eq filters, a compare-and-swap PATCH on updated_at=eq., return=representation,
   and (noema_sagas, like the trigger of cloud/supabase.sql §18) the server's own stamp, strictly later than the one before. */
import { Supabase } from '../services/supabase.ts';

type Row = Record<string, unknown> & { key: string; updated_at: string };
export interface FakeDb { kv: Map<string, Row>; sagas: Map<string, Row>; requests: string[] }

const stamp = (prev?: string): string => new Date(Math.max(Date.now(), prev ? Date.parse(prev) + 1 : 0)).toISOString();

export function fakeSupabase(uid = 'u1'): { sb: Supabase; db: FakeDb } {
  const db: FakeDb = { kv: new Map(), sagas: new Map(), requests: [] };
  const net = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(String(input)), method = init.method ?? 'GET', path = u.pathname;
    db.requests.push(method + ' ' + path + u.search);
    const table = path === '/rest/v1/noema_kv' ? db.kv : path === '/rest/v1/noema_sagas' ? db.sagas : null;
    if (!table) return new Response('{"message":"not found"}', { status: 404 });
    const serverStamp = table === db.sagas;
    const matches = (r: Row): boolean => [...u.searchParams.keys()].every(k => {
      const v = u.searchParams.get(k) ?? '';
      if (['select', 'order', 'on_conflict', 'limit'].includes(k) || k === 'user_id') return true;
      if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
      if (v.startsWith('neq.')) return String(r[k]) !== v.slice(4);
      if (v.startsWith('lt.')) return Date.parse(String(r[k])) < Date.parse(v.slice(3));
      if (v.startsWith('like.')) return new RegExp('^' + v.slice(5).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(String(r[k]));
      return true;
    });
    const rep = /representation/.test(new Headers(init.headers).get('prefer') ?? '');
    const out = (rows: Row[], status = 200): Response => new Response(rep || method === 'GET' ? JSON.stringify(rows) : null, { status: rep || method === 'GET' ? status : 204 });
    const body = init.body == null ? null : JSON.parse(String(init.body)) as unknown;
    if (method === 'GET') return out([...table.values()].filter(matches).map(r => ({ ...r })));
    if (method === 'POST') {
      const keep = /ignore-duplicates/.test(new Headers(init.headers).get('prefer') ?? ''), wrote: Row[] = [];
      for (const r of body as Row[]) {
        if (r.user_id !== uid) return new Response('{"message":"rls"}', { status: 403 });
        const had = table.get(r.key);
        if (had && keep) continue;
        const row: Row = { ...(had ?? {}), ...r, ...(serverStamp ? { updated_at: stamp(had?.updated_at) } : {}) };
        table.set(r.key, row); wrote.push({ ...row });
      }
      return out(wrote, 201);
    }
    if (method === 'PATCH') {
      const wrote: Row[] = [];
      for (const r of [...table.values()].filter(matches)) {
        const row: Row = { ...r, ...(body as Record<string, unknown>), key: r.key, updated_at: serverStamp ? stamp(r.updated_at) : String((body as Row).updated_at ?? r.updated_at) };
        table.set(r.key, row); wrote.push({ ...row });
      }
      return out(wrote);
    }
    if (method === 'DELETE') { const gone = [...table.values()].filter(matches); gone.forEach(r => table.delete(r.key)); return out(gone); }
    return new Response(null, { status: 405 });
  };
  const sb = new Supabase({ siteUrl: 'https://site.test', supabaseUrl: 'https://db.test', supabaseKey: 'k' }, 'token', net as typeof fetch);
  return { sb, db };
}
