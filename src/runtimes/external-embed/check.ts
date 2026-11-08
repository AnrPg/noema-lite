/* external-embed@1: the rules of an outside page (docs/activities-dev/embed.md, docs/adr/001 D12). Pure: the URL grammar, the exact
   match against the allow-list (tools/embed_allow.json, imported as it is: the one copy) and the item / pack checks the content
   checks, the connector and the runtime use alike. */
import ALLOW from '../../../tools/embed_allow.json' with { type: 'json' };

export const RUNTIME = 'external-embed@1';
const MAX_URL = 2048,
  FALLBACK_MIN = 40;

/** a provider of the allow-list */
export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly origins: readonly string[];
  readonly path: string;
  readonly query: string | null;
  readonly hash: string | null;
  readonly sandbox: readonly string[];
  readonly licenses: readonly string[];
  readonly creditMust: string;
  readonly credit: string;
  readonly terms: string;
  readonly supportsResult: boolean;
  readonly notes: string;
}

export const PROVIDERS: readonly Provider[] = Object.freeze(ALLOW.providers as readonly Provider[]);

/** the sandbox tokens a provider may be given; everything else (allow-top-navigation*, allow-popups-to-escape-sandbox,
    allow-modals, allow-downloads, allow-storage-access-by-user-activation, allow-presentation, allow-orientation-lock) is refused */
export const SANDBOX_OK: ReadonlySet<string> = new Set([
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-pointer-lock',
  'allow-popups',
]);

const SAFE = /^[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]+$/;
const URL_RE =
  /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(:[0-9]{1,5})?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/;
const BAD_PATH = /\/\/|\/\.\.?(\/|$)|%2e|%2f|%5c|%00/i;

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const full = (re: string, s: string): boolean => {
  try {
    return new RegExp('^(?:' + re + ')$').test(s);
  } catch {
    return false; // a pattern that is not a regex matches nothing
  }
};
export const provider = (id: unknown, list: readonly Provider[] = PROVIDERS): Provider | null =>
  (Array.isArray(list) ? (list as readonly unknown[]) : []).find((p): p is Provider => isObj(p) && p.id === id) ?? null;

export interface ParsedUrl {
  readonly origin: string;
  readonly path: string;
  readonly query: string | null;
  readonly hash: string | null;
}
export interface Refused {
  readonly code: string;
}
export type Match = { readonly ok: true; readonly provider: Provider; readonly origin: string } | (Refused & { readonly ok?: undefined });

/** a URL string → its parts (query / hash without ? / #, null when absent) | { code } */
export function parse(u: unknown): ParsedUrl | Refused {
  if (typeof u !== 'string' || !u) return { code: 'url-missing' };
  if (u.length > MAX_URL) return { code: 'url-long' };
  if (!u.startsWith('https://')) return { code: 'url-scheme' }; // http:, javascript:, data:, //host, HTTPS:… all refused
  if (!SAFE.test(u)) return { code: 'url-chars' }; // spaces, controls, backslashes, quotes, <>, non-ASCII
  if ((u.slice(8).split(/[/?#]/)[0] ?? '').includes('@')) return { code: 'url-userinfo' };
  const m = URL_RE.exec(u);
  if (!m) return { code: 'url-host' };
  const path = m[3] ?? '/';
  if (BAD_PATH.test(path)) return { code: 'url-path' };
  return {
    origin: 'https://' + (m[1] ?? '') + (m[2] ?? ''),
    path,
    query: m[4] == null ? null : m[4].slice(1),
    hash: m[5] == null ? null : m[5].slice(1),
  };
}
const refused = (u: ParsedUrl | Refused): u is Refused => 'code' in u;

/** does the URL match this provider exactly? */
export function match(url: unknown, p: Provider | null | undefined): Match {
  const u = parse(url);
  if (refused(u)) return u;
  if (!p || !Array.isArray(p.origins) || !p.origins.includes(u.origin)) return { code: 'url-origin' };
  if (!full(p.path, u.path)) return { code: 'url-path' };
  if (u.query != null && (p.query == null || !full(p.query, u.query))) return { code: 'url-query' };
  if (u.query == null && p.query != null && !full(p.query, '')) return { code: 'url-query' };
  if (u.hash != null && (p.hash == null || !full(p.hash, u.hash))) return { code: 'url-hash' };
  return { ok: true, provider: p, origin: u.origin };
}

export interface Report {
  readonly errors: string[];
  readonly warnings: string[];
}
export interface CheckOptions {
  readonly providers?: readonly Provider[];
}

/** one registry item → { errors: ['code: what'], warnings } */
export function check(a: unknown, opts: CheckOptions = {}): Report {
  const list = opts.providers ?? PROVIDERS,
    E: string[] = [],
    W: string[] = [];
  const e = (code: string, what: string): void => {
    E.push(code + ': ' + what);
  };
  if (!isObj(a)) return { errors: ['item: not an object'], warnings: W };
  if (a.runtime !== RUNTIME) e('runtime', 'runtime must be ' + RUNTIME);
  const p = typeof a.provider === 'string' ? provider(a.provider, list) : null;
  if (!p) e('provider-unknown', 'provider must be one of the allow-list (tools/embed_allow.json)');
  else {
    if (p.status !== 'allowed') e('provider-pending', 'provider ' + p.id + ' is not allowed yet (its embedding terms are not confirmed)');
    const sb: unknown = p.sandbox;
    if (!Array.isArray(sb) || sb.some((t: unknown) => typeof t !== 'string' || !SANDBOX_OK.has(t)) || !sb.includes('allow-scripts'))
      e('provider-sandbox', 'the provider asks for sandbox tokens outside ' + [...SANDBOX_OK].join(' '));
    const m = match(a.url, p);
    if (!m.ok) e(m.code, 'url does not match provider ' + p.id + ' exactly');
    if (!isStr(a.credit)) e('credit-missing', 'credit is required');
    else if (isStr(p.creditMust) && !a.credit.includes(p.creditMust)) e('credit-provider', 'credit must name "' + p.creditMust + '"');
    if (!isStr(a.license)) e('license-missing', 'license is required');
    else if (!Array.isArray(p.licenses) || !p.licenses.includes(a.license))
      e('license-provider', 'license must be one of ' + (Array.isArray(p.licenses) ? p.licenses : []).join(', '));
  }
  if (p == null && typeof a.url === 'string') {
    const u = parse(a.url);
    if (refused(u)) e(u.code, 'url');
  }
  const fb = isObj(a.fallback) ? a.fallback : {};
  if (!(isStr(fb.text) && fb.text.trim().length >= FALLBACK_MIN) || !isStr(fb.media))
    e('fallback-missing', `fallback {media, text >= ${FALLBACK_MIN} characters} is required (offline, refused, not chosen)`);
  if (a.capabilities != null && !(Array.isArray(a.capabilities) && a.capabilities.length === 0))
    e('capabilities', 'an embed has no capabilities (it does not speak the activity protocol)');
  if ('html' in a || 'spec' in a || 'entry' in a) e('not-embed', 'an embed carries no bundle, spec or entry');
  const st = a.strings;
  if (!isObj(st) || !Object.keys(st).length || Object.values(st).some(t => !isObj(t) || !isStr(t.title)))
    e('strings-title', 'strings.<locale>.title (what opens, in each language) is required');
  if (a.height != null && !(typeof a.height === 'number' && a.height >= 120 && a.height <= 2000)) e('height', 'height must be 120–2000');
  if (p && p.status === 'allowed' && typeof a.license === 'string' && /NC/.test(a.license))
    W.push('license-nc: ' + a.license + ' is non-commercial: fine for a free study app, not for a paid one');
  return { errors: E, warnings: W };
}

const listOf = (v: unknown): readonly unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);

/** a pack → { errors, warnings } for its embed items, and the sim exercises that would grade one (none can) */
export function checkPack(pack: unknown, opts: CheckOptions = {}): Report {
  const list = opts.providers ?? PROVIDERS,
    E: string[] = [],
    W: string[] = [],
    items = new Map<string, Obj>();
  const P = isObj(pack) ? pack : {};
  for (const a of listOf(isObj(P.activities) ? P.activities.items : null)) {
    if (!isObj(a) || a.runtime !== RUNTIME) continue;
    const id = String(a.id);
    items.set(id, a);
    const r = check(a, { providers: list });
    E.push(...r.errors.map(m => 'activity ' + id + ': ' + m));
    W.push(...r.warnings.map(m => 'activity ' + id + ': ' + m));
  }
  for (const c of listOf(P.chapters))
    for (const ex of listOf(isObj(c) ? c.exercises : null)) {
      if (!isObj(ex) || ex.type !== 'sim' || !items.has(String(ex.activity))) continue;
      const p = provider(items.get(String(ex.activity))?.provider, list);
      if (!(p && p.supportsResult))
        E.push(`${String(ex.id)}: sim-embed: activity ${String(ex.activity)} is an outside page (explore only): use it in a theory block`);
    }
  return { errors: E, warnings: W };
}

/** the checker the content checks read (src/features/content/domain/env.ts EmbedChecks) */
export const EMBED_CHECKS = Object.freeze({ RUNTIME, PROVIDERS, SANDBOX_OK, parse, match, check, checkPack });
