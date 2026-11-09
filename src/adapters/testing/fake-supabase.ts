/**
 * Test double: a Supabase project behind `fetch` — GoTrue (password, refresh, sign-up, logout), PostgREST on noema_kv
 * (eq / like / gt filters, order, limit, insert with ignore-duplicates, PATCH and DELETE with return=representation,
 * row-level security by the bearer token), noema_events (insert ignoring ids already there) and noema_settings (an upsert
 * kept only when its stamp is later, a stamp from the future stored as the server's time) with their `*_since` readers,
 * one RPC (echo), and Storage (upload with x-upsert, authenticated download, list,
 * delete). Only what the Supabase adapter sends; anything else is a 404 so a wrong request shows up.
 */
import { compareHlc, decodeHlc } from '../../kernel/hlc.ts';
import { textOf } from '../../kernel/text.ts';
import { storedStamp } from '../../ports/remote.ts';

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
}
interface Row {
  user_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface FakeSupabase {
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: unknown }): Promise<Response>;
  addUser(email: string, password: string, name?: string): string;
  offline: boolean;
  /** The access token lifetime in seconds (short ones test the refresh). */
  tokenSeconds: number;
  readonly requests: Array<{ method: string; path: string }>;
  readonly rows: Row[];
  readonly events: Array<Record<string, unknown>>;
  readonly settings: Array<Record<string, unknown>>;
}

const J = (status: number, body: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function fakeSupabase(base = 'https://proj.supabase.test', options: { readonly now?: () => number } = {}): FakeSupabase {
  const now = options.now ?? Date.now;
  const users = new Map<string, User>(),
    tokens = new Map<string, { user: User; exp: number }>(),
    refresh = new Map<string, User>();
  const rows: Row[] = [],
    objects = new Map<string, { blob: Blob; owner: string }>(),
    requests: FakeSupabase['requests'] = [];
  const events: Array<Record<string, unknown>> = [],
    settings: Array<Record<string, unknown>> = [];
  let seq = 0,
    writes = 0;
  /** The cursor of a row: "<transaction>:<sequence>" as the SQL functions give it (one transaction per request here). */
  const cursorOf = (r: Record<string, unknown>): string => `1:${textOf(r['seq'])}`;
  const seqOf = (c: unknown): number => (typeof c === 'string' ? Number(c.split(':')[1] ?? 0) : 0);
  const issue = (u: User, seconds: number): Record<string, unknown> => {
    const access = `at${++seq}`,
      rt = `rt${seq}`;
    tokens.set(access, { user: u, exp: now() + seconds * 1000 });
    refresh.set(rt, u);
    return {
      access_token: access,
      refresh_token: rt,
      expires_in: seconds,
      token_type: 'bearer',
      user: { id: u.id, email: u.email, user_metadata: { name: u.name } },
    };
  };
  const like = (pattern: string, s: string): boolean => {
    let re = '^';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i] ?? '';
      if (c === '\\') {
        re += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        continue;
      }
      re += c === '*' || c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(re + '$', 's').test(s);
  };
  const bodyText = async (b: unknown): Promise<string> => (b === undefined || b === null ? '' : b instanceof Blob ? b.text() : textOf(b));

  const fake: FakeSupabase = {
    offline: false,
    tokenSeconds: 3600,
    requests,
    rows,
    events,
    settings,
    addUser(email, password, name = '') {
      const id = `uid-${++seq}`;
      users.set(email, { id, email, password, name });
      return id;
    },
    async fetch(url, init) {
      if (fake.offline) throw new TypeError('Failed to fetch');
      const u = new URL(url),
        path = u.pathname,
        q = u.searchParams,
        method = init.method;
      requests.push({ method, path: path + u.search });
      if (!url.startsWith(base)) return J(404, { message: 'wrong host' });
      if (!init.headers['apikey']) return J(401, { message: 'No API key found in request' });
      const bearer = (init.headers['Authorization'] ?? '').replace(/^Bearer /, '');
      const who = (): User | Response => {
        const t = tokens.get(bearer);
        if (!t) return J(401, { code: 'PGRST301', message: 'JWT expired' });
        if (t.exp < now()) return J(401, { code: 'PGRST303', message: 'JWT expired' });
        return t.user;
      };
      const json = async (): Promise<Record<string, unknown>> => JSON.parse((await bodyText(init.body)) || '{}') as Record<string, unknown>;

      /* ---- Auth ---- */
      if (path === '/auth/v1/token' && q.get('grant_type') === 'password') {
        const b = await json(),
          x = users.get(String(b['email']));
        if (!x || x.password !== b['password'])
          return J(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return J(200, issue(x, fake.tokenSeconds));
      }
      if (path === '/auth/v1/token' && q.get('grant_type') === 'refresh_token') {
        const b = await json(),
          x = refresh.get(String(b['refresh_token']));
        if (!x) return J(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
        refresh.delete(String(b['refresh_token']));
        return J(200, issue(x, fake.tokenSeconds));
      }
      if (path === '/auth/v1/signup') {
        const b = await json();
        if (users.has(String(b['email']))) return J(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        if (String(b['password']).length < 6)
          return J(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
        const id = fake.addUser(
          String(b['email']),
          String(b['password']),
          textOf((b['data'] as Record<string, unknown> | undefined)?.['name'] ?? ''),
        );
        const x = users.get(String(b['email']));
        return J(200, x ? issue(x, fake.tokenSeconds) : { id });
      }
      if (path === '/auth/v1/logout') {
        tokens.delete(bearer);
        return new Response(null, { status: 204 });
      }

      /* ---- PostgREST ---- */
      if (path === '/rest/v1/rpc/echo') {
        const w = who();
        return w instanceof Response ? w : J(200, await json());
      }
      if (path === '/rest/v1/noema_events' && method === 'POST') {
        const w = who();
        if (w instanceof Response) return w;
        if (!/ignore-duplicates/.test(init.headers['Prefer'] ?? '')) return J(400, { message: 'an append never updates' });
        for (const it of JSON.parse(await bodyText(init.body)) as Array<Record<string, unknown>>) {
          if (it['user_id'] && it['user_id'] !== w.id)
            return J(403, { code: '42501', message: 'new row violates row-level security policy' });
          if (events.some(e => e['user_id'] === w.id && e['id'] === it['id'])) continue;
          events.push({ ...it, user_id: w.id, seq: ++writes });
        }
        return new Response(null, { status: 201 });
      }
      if (path === '/rest/v1/noema_settings' && method === 'POST') {
        const w = who();
        if (w instanceof Response) return w;
        const kept: Array<Record<string, unknown>> = [];
        for (const it of JSON.parse(await bodyText(init.body)) as Array<Record<string, unknown>>) {
          if (it['user_id'] && it['user_id'] !== w.id)
            return J(403, { code: '42501', message: 'new row violates row-level security policy' });
          const hlc = storedStamp(textOf(it['hlc']), now());
          if (hlc === null) return J(400, { code: '23514', message: 'new row violates check constraint "noema_settings_hlc_check"' });
          const i = settings.findIndex(e => e['user_id'] === w.id && e['key'] === it['key']);
          const old = i >= 0 ? decodeHlc(settings[i]?.['hlc']) : null,
            nu = decodeHlc(hlc);
          if (old && old.ok && nu.ok && compareHlc(nu.value, old.value) <= 0) continue; // the trigger skips it
          const row = { user_id: w.id, key: it['key'], value: it['value'] ?? null, hlc, device: it['device'], seq: ++writes };
          if (i >= 0) settings[i] = row;
          else settings.push(row);
          kept.push(row);
        }
        return J(201, kept);
      }
      if (path === '/rest/v1/rpc/noema_events_since' || path === '/rest/v1/rpc/noema_settings_since') {
        const w = who();
        if (w instanceof Response) return w;
        const b = await json(),
          after = seqOf(b['after']),
          max = Math.min(Number(b['max_rows'] ?? 1000), 1000);
        const all = path.includes('events') ? events : settings;
        const out = all
          .filter(r => r['user_id'] === w.id && Number(r['seq']) > after)
          .sort((x, y) => Number(x['seq']) - Number(y['seq']))
          .slice(0, max)
          .map(r => {
            const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'user_id' && k !== 'seq'));
            return { ...rest, cursor: cursorOf(r) };
          });
        return J(200, out);
      }
      if (path === '/rest/v1/noema_kv') {
        const w = who();
        if (w instanceof Response) return w;
        const filters = [...q.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k));
        const matches = (r: Row): boolean =>
          r.user_id === w.id &&
          filters.every(([k, v]) => {
            const [op, ...rest] = v.split('.'),
              arg = rest.join('.'),
              field = textOf(Reflect.get(r, k));
            return op === 'eq' ? field === arg : op === 'gt' ? field > arg : op === 'like' ? like(arg, field) : false;
          });
        const out = (rs: Row[]): Response =>
          J(
            200,
            rs.map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at })),
          );
        if (method === 'GET') {
          let rs = rows.filter(matches).sort((a, b) => (a.key < b.key ? -1 : 1));
          const lim = q.get('limit');
          if (lim) rs = rs.slice(0, Number(lim));
          return out(rs);
        }
        if (method === 'POST') {
          const items = JSON.parse(await bodyText(init.body)) as Array<Partial<Record<keyof Row, unknown>>>,
            made: Row[] = [];
          for (const it of items) {
            if (it.user_id && it.user_id !== w.id) return J(403, { code: '42501', message: 'new row violates row-level security policy' });
            if (rows.some(r => r.user_id === w.id && r.key === it.key)) continue; // resolution=ignore-duplicates
            const r: Row = {
              user_id: w.id,
              key: textOf(it.key),
              value: textOf(it.value),
              updated_at: textOf(it.updated_at ?? new Date(now()).toISOString()),
            };
            rows.push(r);
            made.push(r);
          }
          return out(made);
        }
        if (method === 'PATCH') {
          const b = await json(),
            hit = rows.filter(matches);
          for (const r of hit) {
            if (b['value'] !== undefined) r.value = textOf(b['value']);
            if (b['updated_at'] !== undefined) r.updated_at = textOf(b['updated_at']);
          }
          return out(hit);
        }
        if (method === 'DELETE') {
          const hit = rows.filter(matches);
          for (const r of hit) rows.splice(rows.indexOf(r), 1);
          return out(hit);
        }
      }

      /* ---- Storage ---- */
      const obj = /^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(path);
      if (path.startsWith('/storage/v1/object/list/')) {
        const w = who();
        if (w instanceof Response) return w;
        const bucket = path.slice('/storage/v1/object/list/'.length),
          b = await json(),
          prefix = textOf(b['prefix'] ?? '');
        const pre = `${bucket}/${prefix ? prefix + '/' : ''}`;
        const names = [...objects.entries()]
          .filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
          .map(([k, v]) => ({ name: k.slice(pre.length), updated_at: '2026-11-07T00:00:00Z', metadata: { size: v.blob.size } }));
        return J(200, names);
      }
      if (obj && method === 'POST') {
        const w = who();
        if (w instanceof Response) return w;
        const k = `${obj[1]}/${decodeURIComponent(obj[2] ?? '')}`;
        if (objects.has(k) && init.headers['x-upsert'] !== 'true')
          return J(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        const blob = init.body instanceof Blob ? init.body : new Blob([await bodyText(init.body)]);
        objects.set(k, { blob, owner: w.id });
        return J(200, { Key: k });
      }
      if (obj && method === 'GET') {
        const w = who();
        if (w instanceof Response) return w;
        const x = objects.get(`${obj[1]}/${decodeURIComponent(obj[2] ?? '')}`);
        return x
          ? new Response(x.blob, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
          : J(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      }
      const bucketOnly = /^\/storage\/v1\/object\/([^/]+)$/.exec(path);
      if (bucketOnly && method === 'DELETE') {
        const w = who();
        if (w instanceof Response) return w;
        const b = await json();
        for (const p of (b['prefixes'] as string[] | undefined) ?? []) objects.delete(`${bucketOnly[1]}/${p}`);
        return J(200, []);
      }
      return J(404, { message: 'not found: ' + method + ' ' + path });
    },
  };
  return fake;
}
