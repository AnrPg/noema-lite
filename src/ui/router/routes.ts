/**
 * Typed routes over the address's hash, as the app writes them today: `#/ch/<id>`, `#/map/<id>/<step>`, `#/search?q=…`
 * (the page's own settings after `?`). A route table names each page and its pattern; the parameters' names and which
 * of them are optional come from the pattern's text, so `href('chapter', { id })` and `match(hash).params.id` are
 * checked by the compiler.
 *
 *   const routes = defineRoutes({ today: '/', chapter: '/ch/:id', map: '/map/:id/:step?', files: '/files/*path' });
 *   routes.href('map', { id: 'r1' })                  → '#/map/r1'
 *   routes.match('#/map/r1/s2?view=list')             → { name: 'map', params: { id: 'r1', step: 's2' }, query: { view: 'list' } }
 *
 * Segments: a word matches itself; `:name` one segment; `:name?` an optional last segment; `*name` the rest (with its
 * slashes). Values are percent-encoded in an href and decoded in a match (a broken escape stays as written). The first
 * route of the table that matches wins.
 */

type Trim<P extends string> = P extends `/${infer R}` ? Trim<R> : P extends `${infer R}/` ? Trim<R> : P;
type Seg<S extends string> = S extends `:${infer N}?`
  ? { readonly [K in N]?: string }
  : S extends `:${infer N}`
    ? { readonly [K in N]: string }
    : S extends `*${infer N}`
      ? { readonly [K in N]: string }
      : unknown;
type Segs<P extends string> = P extends `${infer A}/${infer B}` ? Seg<A> & Segs<B> : Seg<P>;
type Flat<T> = { [K in keyof T]: T[K] } & {};
/** The parameters of a pattern: '/map/:id/:step?' → { id: string; step?: string } */
export type ParamsOf<P extends string> = Flat<Trim<P> extends '' ? unknown : Segs<Trim<P>>>;

export type Query = Readonly<Record<string, string>>;

export type RouteTable = Readonly<Record<string, string>>;

/** A matched address: the route's name, its parameters, the query after `?`. */
export type RouteMatch<R extends RouteTable> = {
  [N in keyof R & string]: { readonly name: N; readonly params: ParamsOf<R[N]>; readonly query: Query };
}[keyof R & string];

/** href's arguments: the params only when the pattern has some (required ones required). */
type HrefArgs<P extends string> = keyof ParamsOf<P> extends never
  ? [params?: ParamsOf<P>, query?: Query]
  : [params: ParamsOf<P>, query?: Query];

export interface Routes<R extends RouteTable> {
  readonly table: R;
  /** The route an address (a hash: '#/…', '/…' or '') names, or null when none does. */
  match(hash: string): RouteMatch<R> | null;
  /** The address of a route: '#/…' */
  href<N extends keyof R & string>(name: N, ...args: HrefArgs<R[N]>): string;
}

interface Compiled {
  readonly name: string;
  readonly parts: readonly { readonly kind: 'word' | 'param' | 'optional' | 'rest'; readonly text: string }[];
}

function compile(name: string, pattern: string): Compiled {
  const segs = pattern.split('/').filter(Boolean);
  const parts = segs.map((s, i) => {
    const last = i === segs.length - 1;
    if (s.startsWith('*')) {
      if (!last) throw new Error(`route ${name}: *${s.slice(1)} must be the last segment of "${pattern}"`);
      return { kind: 'rest' as const, text: s.slice(1) };
    }
    if (s.startsWith(':') && s.endsWith('?')) {
      if (!last) throw new Error(`route ${name}: only the last segment of "${pattern}" may be optional`);
      return { kind: 'optional' as const, text: s.slice(1, -1) };
    }
    if (s.startsWith(':')) return { kind: 'param' as const, text: s.slice(1) };
    return { kind: 'word' as const, text: s };
  });
  for (const p of parts)
    if (p.kind !== 'word' && !/^[A-Za-z_]\w*$/.test(p.text)) throw new Error(`route ${name}: "${p.text}" is not a parameter name`);
  return { name, parts };
}

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a broken escape (a hand-typed address): the text as written
  }
};

/** '#/a/b?x=1' → { path: ['a', 'b'], query: { x: '1' } } */
export function splitHash(hash: string): { readonly path: readonly string[]; readonly query: Query } {
  const h = hash.replace(/^#/, '');
  const q = h.indexOf('?');
  const path = (q < 0 ? h : h.slice(0, q)).split('/').filter(Boolean);
  const query: Record<string, string> = {};
  if (q >= 0) for (const [k, v] of new URLSearchParams(h.slice(q + 1))) query[k] = v;
  return { path, query };
}

function matchOne(c: Compiled, path: readonly string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  let i = 0;
  for (const p of c.parts) {
    const seg = path[i];
    if (p.kind === 'rest') {
      if (i >= path.length) return null;
      params[p.text] = path.slice(i).map(decode).join('/');
      return params;
    }
    if (seg === undefined) {
      if (p.kind === 'optional') return params;
      return null;
    }
    if (p.kind === 'word') {
      if (decode(seg) !== p.text) return null;
    } else params[p.text] = decode(seg);
    i++;
  }
  return i === path.length ? params : null;
}

export function defineRoutes<const R extends RouteTable>(table: R): Routes<R> {
  const compiled = Object.entries(table).map(([n, p]) => compile(n, p));
  const byName = new Map(compiled.map(c => [c.name, c]));
  return {
    table,
    match(hash) {
      const { path, query } = splitHash(hash);
      for (const c of compiled) {
        const params = matchOne(c, path);
        if (params) return { name: c.name, params, query } as unknown as RouteMatch<R>;
      }
      return null;
    },
    href(name, ...args) {
      const c = byName.get(name);
      if (!c) throw new Error(`no route named ${name}`);
      const params = (args[0] ?? {}) as Readonly<Record<string, string | undefined>>,
        query = args[1];
      const segs: string[] = [];
      for (const p of c.parts) {
        if (p.kind === 'word') segs.push(encodeURIComponent(p.text));
        else {
          const v = params[p.text];
          if (v === undefined || v === '') {
            if (p.kind === 'optional') break;
            throw new Error(`route ${name} needs ${p.text}`);
          }
          segs.push(p.kind === 'rest' ? v.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(v));
        }
      }
      const qs = query && Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
      return '#/' + segs.join('/') + qs;
    },
  };
}
