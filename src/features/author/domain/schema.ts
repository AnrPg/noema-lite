/**
 * The JSON Schema core of the authoring forms (docs/activities-dev/authoring_ui.md): the subset of JSON Schema 2020-12 the
 * app's schemas use (src/contracts/schemas/*.schema.json) — $ref (local "#/$defs/…" and the other schemas of the registry by
 * $id, relative or absolute), allOf, oneOf / anyOf (alternatives, or objects told apart by a discriminator: a property that is
 * a const or a one-value enum in every branch), not, if / then / else, type (one or a list), const, enum, properties,
 * required, additionalProperties, propertyNames, maxProperties, items, minItems, maxItems, uniqueItems, minimum, maximum,
 * exclusiveMinimum, exclusiveMaximum, minLength, maxLength, pattern, unevaluatedProperties (the properties of the schema, its
 * allOf / $ref and its matching branch), default, title, description; and "x-noema", the authoring hints (expr, key, name,
 * element, series, longtext, of, scene, sound, ref, part).
 * Pure: the registry, validation, skeletons and branches; the form's view of a document is form.ts.
 */

export type Obj = Record<string, unknown>;
export type Path = readonly (string | number)[];
/** a schema node with the $id of the document it sits in */
export interface SNode {
  readonly s: Obj;
  readonly b: string | undefined;
}
export interface SchemaError {
  readonly path: Path;
  readonly kw: string;
  readonly msg: string;
  /** the values the message names (the catalogs' engine.author.v.<kw> placeholders) */
  readonly p?: Readonly<Record<string, string | number>>;
}
export interface Registry {
  add(schema: unknown): void;
  resolve(ref: string, base: string | undefined): { schema: unknown; base: string };
  get(id: string): Obj | null;
  ids(): string[];
}
/** an object schema flattened with its allOf and sibling $ref */
export interface FlatView {
  properties: Record<string, unknown>;
  required: string[];
  order: string[];
  bases: Record<string, string | undefined>;
  title: unknown;
  description: unknown;
  additionalProperties?: unknown;
  propertyNames?: unknown;
  maxProperties?: unknown;
  unevaluatedProperties?: unknown;
  'x-noema'?: unknown;
}
export interface Discriminator {
  readonly prop: string;
  readonly values: readonly unknown[];
  readonly opts: readonly { readonly value: unknown; readonly branch: number }[];
}
export interface ObjectView {
  readonly view: FlatView;
  readonly d: Discriminator | null;
  readonly bs: readonly SNode[] | null;
  readonly bi: number;
}
export type EditorKind = 'const' | 'enum' | 'alt' | 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | null;

export const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);
export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
export const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const arr = (v: unknown): readonly unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');

/* ---------- the registry: schemas by $id; $ref resolution ---------- */
export function registry(schemas: unknown): Registry {
  const byId = new Map<string, Obj>();
  const add = (s: unknown): void => {
    if (isObj(s) && typeof s['$id'] === 'string') byId.set(s['$id'], s);
  };
  (Array.isArray(schemas) ? (schemas as unknown[]) : [schemas]).forEach(add);
  function pointer(doc: unknown, frag: string): unknown {
    if (!frag || frag === '/') return doc;
    let cur: unknown = doc;
    for (const raw of frag.replace(/^\//, '').split('/')) {
      const k = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
      if (!cur || typeof cur !== 'object' || !has(cur, k)) return null;
      cur = (cur as Obj)[k];
    }
    return cur;
  }
  /** → {schema, base} of a $ref seen in a schema whose document is `base` (an $id) */
  function resolve(ref: string, base: string | undefined): { schema: unknown; base: string } {
    const [u = '', frag = ''] = ref.split('#');
    let id = base ?? '';
    if (u) {
      if (/^[a-z]+:/i.test(u)) id = u;
      else id = (base ?? '').replace(/[^/]*$/, '') + u;
      if (!byId.has(id)) {
        const tail = u.split('/').pop();
        for (const k of byId.keys())
          if (k.split('/').pop() === tail) {
            id = k;
            break;
          }
      }
    }
    const doc = byId.get(id);
    if (!doc) throw new Error('schema not in the registry: ' + ref);
    const s = pointer(doc, frag);
    if (s == null) throw new Error('unresolved $ref ' + ref);
    return { schema: s, base: id };
  }
  return { add, resolve, get: id => byId.get(id) ?? null, ids: () => [...byId.keys()] };
}

/** A schema node with its base. `true` and a missing schema accept anything ({}). */
const FALSE: Obj = Object.freeze({ not: {} });
export function node(s: unknown, b: string | undefined): SNode {
  return { s: isObj(s) ? s : s === false ? FALSE : {}, b };
}
/** Follows a bare $ref (one with no siblings but title, description and default) to its target. */
export function follow(reg: Registry, n0: SNode): SNode {
  let n = n0,
    g = 0;
  while (
    typeof n.s['$ref'] === 'string' &&
    Object.keys(n.s).every(k => k === '$ref' || k === 'title' || k === 'description' || k === 'default')
  ) {
    const r = reg.resolve(n.s['$ref'], n.b),
      extra: Obj = {};
    for (const k of ['title', 'description', 'default']) if (has(n.s, k)) extra[k] = n.s[k];
    n = node(Object.keys(extra).length && isObj(r.schema) ? { ...r.schema, ...extra } : r.schema, r.base);
    if (++g > 64) throw new Error('$ref loop');
  }
  return n;
}

/* ---------- validation ---------- */
const typeOfValue = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
export const typeOk = (t: unknown, v: unknown): boolean => {
  const a = typeOfValue(v);
  return t === a || (t === 'number' && a === 'integer');
};
const reCache = new Map<string, RegExp>();
const re = (p: string): RegExp => {
  let r = reCache.get(p);
  if (!r) {
    r = new RegExp(p, 'u');
    reCache.set(p, r);
  }
  return r;
};
const num = (v: unknown): v is number => typeof v === 'number';

/** the problems of `v` under n, into out; `ev` collects the evaluated property names (unevaluatedProperties) */
function check(reg: Registry, n: SNode, v: unknown, path: Path, out: SchemaError[], ev: Set<string> | null): void {
  const s = n.s,
    b = n.b;
  const local = new Set<string>();
  const push = (e: SchemaError): void => {
    out.push(e);
  };
  if (s === FALSE) {
    push({ path, kw: 'false', msg: 'not allowed' });
    return;
  }
  if (typeof s['$ref'] === 'string') {
    const r = reg.resolve(s['$ref'], b);
    check(reg, node(r.schema, r.base), v, path, out, local);
  }
  if (has(s, 'const') && !eq(s['const'], v))
    push({ path, kw: 'const', p: { value: JSON.stringify(s['const']) }, msg: 'must be ' + JSON.stringify(s['const']) });
  if (Array.isArray(s['enum']) && !(s['enum'] as unknown[]).some(x => eq(x, v))) {
    const values = (s['enum'] as unknown[]).map(x => JSON.stringify(x)).join(', ');
    push({ path, kw: 'enum', p: { values }, msg: 'must be one of ' + values });
  }
  if (s['type'] != null) {
    const ts = Array.isArray(s['type']) ? (s['type'] as unknown[]) : [s['type']];
    if (!ts.some(t => typeOk(t, v))) {
      push({ path, kw: 'type', p: { type: ts.join(' | ') }, msg: 'must be ' + ts.join(' or ') });
      return;
    }
  }
  if (typeof v === 'number') {
    const { minimum: mn, maximum: mx, exclusiveMinimum: xn, exclusiveMaximum: xx } = s;
    if (num(mn) && v < mn) push({ path, kw: 'minimum', p: { limit: mn }, msg: `must be >= ${mn}` });
    if (num(mx) && v > mx) push({ path, kw: 'maximum', p: { limit: mx }, msg: `must be <= ${mx}` });
    if (num(xn) && !(v > xn)) push({ path, kw: 'exclusiveMinimum', p: { limit: xn }, msg: `must be > ${xn}` });
    if (num(xx) && !(v < xx)) push({ path, kw: 'exclusiveMaximum', p: { limit: xx }, msg: `must be < ${xx}` });
  }
  if (typeof v === 'string') {
    const len = Array.from(v).length,
      { minLength: mn, maxLength: mx, pattern: pt } = s;
    if (num(mn) && len < mn) push({ path, kw: 'minLength', p: { limit: mn }, msg: `at least ${mn} characters` });
    if (num(mx) && len > mx) push({ path, kw: 'maxLength', p: { limit: mx }, msg: `at most ${mx} characters` });
    if (typeof pt === 'string' && !re(pt).test(v)) push({ path, kw: 'pattern', msg: 'does not match ' + pt });
  }
  if (Array.isArray(v)) {
    const { minItems: mn, maxItems: mx } = s;
    if (num(mn) && v.length < mn) push({ path, kw: 'minItems', p: { limit: mn }, msg: `at least ${mn} items` });
    if (num(mx) && v.length > mx) push({ path, kw: 'maxItems', p: { limit: mx }, msg: `at most ${mx} items` });
    if (s['uniqueItems'] && new Set(v.map(x => JSON.stringify(x))).size !== v.length)
      push({ path, kw: 'uniqueItems', msg: 'items must be different' });
    if (s['items'] != null)
      (v as unknown[]).forEach((x, i) => {
        check(reg, node(s['items'], b), x, [...path, i], out, null);
      });
  }
  if (isObj(v)) {
    const props = isObj(s['properties']) ? s['properties'] : {};
    for (const k of strs(s['required'])) if (!has(v, k)) push({ path: [...path, k], kw: 'required', msg: 'is required' });
    for (const [k, ps] of Object.entries(props)) {
      local.add(k);
      if (has(v, k)) check(reg, node(ps, b), v[k], [...path, k], out, null);
    }
    const keys = Object.keys(v),
      mp = s['maxProperties'];
    if (num(mp) && keys.length > mp) push({ path, kw: 'maxProperties', p: { limit: mp }, msg: `at most ${mp} entries` });
    if (s['propertyNames'] != null)
      for (const k of keys) {
        const e: SchemaError[] = [];
        check(reg, node(s['propertyNames'], b), k, [...path, k], e, null);
        if (e.length) push({ path: [...path, k], kw: 'propertyNames', msg: 'is not a usable name' });
      }
    if (has(s, 'additionalProperties'))
      for (const k of keys)
        if (!has(props, k)) {
          if (s['additionalProperties'] === false) push({ path: [...path, k], kw: 'additionalProperties', msg: 'unknown field' });
          else {
            check(reg, node(s['additionalProperties'], b), v[k], [...path, k], out, null);
            local.add(k);
          }
        }
  }
  for (const a of arr(s['allOf'])) check(reg, node(a, b), v, path, out, local);
  for (const kw of ['oneOf', 'anyOf'] as const)
    if (Array.isArray(s[kw])) {
      const results = (s[kw] as unknown[]).map(a => {
        const e: SchemaError[] = [],
          l = new Set<string>();
        check(reg, node(a, b), v, path, e, l);
        return { e, l };
      });
      const okN = results.filter(r => !r.e.length);
      if (kw === 'oneOf' ? okN.length !== 1 : !okN.length) {
        const best = branchIndex(reg, n, v);
        const r = results[best];
        if (okN.length > 1) push({ path, kw, msg: 'matches more than one alternative' });
        else if (best >= 0 && r?.e.length) out.push(...r.e);
        else push({ path, kw, msg: 'matches no alternative' });
      } else
        okN.forEach(r => {
          r.l.forEach(k => local.add(k));
        });
    }
  if (s['not'] != null) {
    const e: SchemaError[] = [];
    check(reg, node(s['not'], b), v, path, e, null);
    if (!e.length) push({ path, kw: 'not', msg: 'is not allowed here' });
  }
  if (s['if'] != null) {
    const e: SchemaError[] = [];
    check(reg, node(s['if'], b), v, path, e, null);
    const br = !e.length ? s['then'] : s['else'];
    if (br != null) check(reg, node(br, b), v, path, out, local);
  }
  if (s['unevaluatedProperties'] === false && isObj(v))
    for (const k of Object.keys(v)) if (!local.has(k)) push({ path: [...path, k], kw: 'unevaluatedProperties', msg: 'unknown field' });
  if (ev)
    local.forEach(k => {
      ev.add(k);
    });
}
/** every problem of `value` under `schema` (whose document is `base`, else its own $id) */
export function validate(reg: Registry, schema: unknown, value: unknown, base?: string): SchemaError[] {
  const out: SchemaError[] = [];
  const n = node(schema, base ?? (isObj(schema) && typeof schema['$id'] === 'string' ? schema['$id'] : undefined));
  check(reg, n, value, [], out, null);
  return out;
}

/* ---------- branches: alternatives and discriminated objects ---------- */
/** the branches of n (oneOf or anyOf) as followed nodes */
export function branches(reg: Registry, n: SNode): SNode[] | null {
  const list = Array.isArray(n.s['oneOf']) ? n.s['oneOf'] : Array.isArray(n.s['anyOf']) ? n.s['anyOf'] : null;
  return list ? (list as unknown[]).map(x => follow(reg, node(x, n.b))) : null;
}
/** a schema merged with its allOf members and a sibling $ref into one object view (no branches) */
export function flat(reg: Registry, n: SNode, depth = 0): FlatView {
  const out: FlatView = { properties: {}, required: [], order: [], bases: {}, title: n.s['title'], description: n.s['description'] };
  const take = (m: SNode, d: number): void => {
    if (d > 16) return;
    if (typeof m.s['$ref'] === 'string') {
      const r = reg.resolve(m.s['$ref'], m.b);
      take(node(r.schema, r.base), d + 1);
    }
    for (const a of arr(m.s['allOf'])) take(node(a, m.b), d + 1);
    for (const [k, ps] of Object.entries(isObj(m.s['properties']) ? m.s['properties'] : {})) {
      if (!out.order.includes(k)) out.order.push(k);
      const prev = out.properties[k];
      // a later, more specific definition (a branch's const) wins; titles survive
      out.properties[k] = prev && isObj(ps) && isObj(prev) && !ps['title'] && prev['title'] ? { title: prev['title'], ...ps } : ps;
      out.bases[k] = m.b;
    }
    for (const r of strs(m.s['required'])) if (!out.required.includes(r)) out.required.push(r);
    for (const k of ['additionalProperties', 'propertyNames', 'maxProperties', 'unevaluatedProperties', 'x-noema'] as const)
      if (has(m.s, k)) out[k] = m.s[k];
  };
  take(n, depth);
  return out;
}
/** the values a property may take in one branch: [const] or a short enum (a discriminator), else undefined */
function constsOf(reg: Registry, ps: unknown, b: string | undefined): readonly unknown[] | undefined {
  if (!isObj(ps)) return undefined;
  const n = follow(reg, node(ps, b));
  if (has(n.s, 'const')) return [n.s['const']];
  const en = n.s['enum'];
  if (Array.isArray(en) && en.length >= 1 && en.length <= 4) return en as unknown[];
  return undefined;
}
/** the discriminator of an object's branches: the property that is a const / a short enum in every branch, all different */
export function discriminator(reg: Registry, bs: readonly SNode[] | null): Discriminator | null {
  if (!bs || bs.length < 2) return null;
  const views = bs.map(x => flat(reg, x));
  const first = views[0];
  if (!first) return null;
  const cands = first.order.filter(k => views.every(v => constsOf(reg, v.properties[k], v.bases[k]) !== undefined));
  for (const k of cands) {
    const per = views.map(v => constsOf(reg, v.properties[k], v.bases[k]) ?? []),
      all = per.flat().map(x => JSON.stringify(x));
    if (new Set(all).size === all.length)
      return { prop: k, values: per.map(p => p[0]), opts: per.flatMap((p, i) => p.map(value => ({ value, branch: i }))) };
  }
  return null;
}
/** which branch a value belongs to (the best guess when it matches none): valid > discriminator / required keys > type > first */
export function branchIndex(reg: Registry, n: SNode, v: unknown): number {
  const bs = branches(reg, n);
  if (!bs) return -1;
  const d = isObj(v) ? discriminator(reg, bs) : null;
  if (d && isObj(v) && has(v, d.prop)) {
    const o = d.opts.find(x => eq(x.value, v[d.prop]));
    if (o) return o.branch;
  }
  let best = 0,
    score = -1;
  bs.forEach((x, i) => {
    let sc = 0;
    const e: SchemaError[] = [];
    check(reg, x, v, [], e, null);
    if (!e.length) sc = 4;
    else {
      const f = flat(reg, x),
        t = typeOfSchema(reg, x);
      if (isObj(v) && t === 'object' && f.required.length && f.required.every(k => has(v, k))) sc = 3;
      else if (isObj(v) && t === 'object' && Object.keys(v).some(k => has(f.properties, k))) sc = 2;
      else if (t && typeOk(t === 'enum' || t === 'const' ? typeOfValue(v) : t, v)) sc = 1;
    }
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  return best;
}
/** what kind of editor a (followed) schema needs */
export function typeOfSchema(reg: Registry, n: SNode): EditorKind {
  const s = n.s;
  if (has(s, 'const')) return 'const';
  if (Array.isArray(s['enum'])) return 'enum';
  if (Array.isArray(s['type'])) return s['type'].length === 1 ? (s['type'][0] as EditorKind) : 'alt';
  if (typeof s['type'] === 'string') return s['type'] as EditorKind;
  if (isObj(s['properties']) || s['additionalProperties'] != null || s['required']) return 'object';
  if (s['items']) return 'array';
  if (s['oneOf'] || s['anyOf']) {
    const bs = branches(reg, n) ?? [];
    return bs.every(x => typeOfSchema(reg, x) === 'object') && discriminator(reg, bs) ? 'object' : 'alt';
  }
  if (typeof s['$ref'] === 'string') {
    const r = reg.resolve(s['$ref'], n.b);
    return typeOfSchema(reg, node(r.schema, r.base));
  }
  for (const a of arr(s['allOf'])) {
    const t = typeOfSchema(reg, follow(reg, node(a, n.b)));
    if (t) return t;
  }
  return null;
}
/** the object view of `v` under n: the flat schema merged with the matching branch */
export function objectView(reg: Registry, n: SNode, v: unknown): ObjectView {
  const base = flat(reg, n),
    bs = branches(reg, n);
  if (!bs) return { view: base, d: null, bs: null, bi: -1 };
  const d = discriminator(reg, bs),
    bi = branchIndex(reg, n, v);
  const branch = bs[bi];
  const bv = branch ? flat(reg, branch) : null;
  const view: FlatView = {
    ...base,
    properties: { ...base.properties },
    required: [...base.required],
    order: [...base.order],
    bases: { ...base.bases },
  };
  if (bv) {
    for (const k of bv.order) {
      if (!view.order.includes(k)) view.order.push(k);
      const prev = view.properties[k],
        ps = bv.properties[k];
      view.properties[k] = prev && isObj(prev) && isObj(ps) ? { ...prev, ...ps, title: ps['title'] || prev['title'] } : ps;
      view.bases[k] = bv.bases[k];
    }
    for (const r of bv.required) if (!view.required.includes(r)) view.required.push(r);
    if (has(bv, 'additionalProperties')) view.additionalProperties = bv.additionalProperties;
    if (has(bv, 'unevaluatedProperties')) view.unevaluatedProperties = bv.unevaluatedProperties;
  }
  return { view, d, bs, bi };
}

/* ---------- skeletons: the smallest value a schema accepts (what Add puts in) ---------- */
export function skeleton(reg: Registry, n0: SNode, depth = 0): unknown {
  const n = follow(reg, n0),
    s = n.s;
  if (depth > 12) return null;
  if (has(s, 'default')) return clone(s['default']);
  const t = typeOfSchema(reg, n);
  if (t === 'const') return clone(s['const']);
  if (t === 'enum') return clone((s['enum'] as unknown[])[0]);
  if (t === 'alt') {
    const bs = branches(reg, n);
    if (bs?.[0]) return skeleton(reg, bs[0], depth + 1);
    const t0 = arr(s['type'])[0];
    return typeof t0 === 'string' ? skeleton(reg, node({ type: t0 }, n.b), depth + 1) : null;
  }
  if (t === 'object') {
    const bs = branches(reg, n);
    const seed = bs ? branchSeed(reg, bs, 0) : {};
    const ov = objectView(reg, n, seed),
      out: Obj = {};
    for (const k of ov.view.order)
      if (ov.view.required.includes(k) || (ov.d && k === ov.d.prop))
        out[k] = skeleton(reg, node(ov.view.properties[k], ov.view.bases[k]), depth + 1);
    for (const k of ov.view.required) if (!has(out, k)) out[k] = null;
    if (ov.d) out[ov.d.prop] = clone(ov.d.values[ov.bi]);
    return out;
  }
  if (t === 'array') {
    const out: unknown[] = [],
      mn = num(s['minItems']) ? s['minItems'] : 0;
    for (let i = 0; i < mn; i++) out.push(skeleton(reg, node(s['items'], n.b), depth + 1));
    return out;
  }
  if (t === 'number' || t === 'integer') {
    let v = num(s['minimum']) ? s['minimum'] : num(s['exclusiveMinimum']) ? s['exclusiveMinimum'] + 1 : 0;
    if (num(s['maximum']) && v > s['maximum']) v = s['maximum'];
    return v;
  }
  if (t === 'boolean') return false;
  if (t === 'string') return '';
  return null;
}
function branchSeed(reg: Registry, bs: readonly SNode[], i: number): Obj {
  const d = discriminator(reg, bs);
  return d ? { [d.prop]: d.values[i] } : {};
}
/** the skeleton of branch i of n (its discriminator set to `value`, else the branch's first) */
export function skeletonOfBranch(reg: Registry, n: SNode, i: number, value?: unknown): unknown {
  const bs = branches(reg, n) ?? [],
    d = discriminator(reg, bs);
  const b = bs[i];
  if (!d) return b ? skeleton(reg, b) : null;
  const dv = value === undefined ? d.values[i] : value;
  const ov = objectView(reg, n, { [d.prop]: dv }),
    out: Obj = {};
  for (const k of ov.view.order)
    if (ov.view.required.includes(k) || k === d.prop) out[k] = skeleton(reg, node(ov.view.properties[k], ov.view.bases[k]));
  out[d.prop] = clone(dv);
  return out;
}

/* ---------- paths ---------- */
export function pathStr(path: Path, rootName = ''): string {
  let s = rootName;
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : (s ? '.' : '') + p;
  return s;
}
/** "spec.params[0].min: …" → ['params', 0, 'min'] (the longest path at the start of a validator's message) */
export function parsePath(msg: string, rootName: string): (string | number)[] | null {
  const m = new RegExp('^' + rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '((?:\\.[A-Za-z_$][\\w$-]*|\\[\\d+\\])*)').exec(msg);
  if (!m) return null;
  const out: (string | number)[] = [];
  for (const t of (m[1] ?? '').matchAll(/\.([A-Za-z_$][\w$-]*)|\[(\d+)\]/g)) out.push(t[1] !== undefined ? t[1] : Number(t[2]));
  return out;
}
const step = (o: unknown, k: string | number): unknown =>
  o != null && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined;
export const getAt = (v: unknown, path: Path): unknown => path.reduce<unknown>((o, k) => step(o, k), v);
/** sets the value at path (in place); the root itself when the path is empty */
export function setAt(v: unknown, path: Path, x: unknown): unknown {
  if (!path.length) return x;
  const o = getAt(v, path.slice(0, -1));
  if (o != null && typeof o === 'object') (o as Record<string | number, unknown>)[path[path.length - 1] as string | number] = x;
  return v;
}
/** removes the value at path (in place): an array's item, an object's key */
export function delAt(v: unknown, path: Path): unknown {
  const o = getAt(v, path.slice(0, -1)),
    k = path[path.length - 1];
  if (Array.isArray(o) && typeof k === 'number') o.splice(k, 1);
  else if (isObj(o) && k !== undefined) Reflect.deleteProperty(o, String(k));
  return v;
}
/** "4,7" → 4.7; "1e-9" → 1e-9; "−2" → -2; anything else → null */
export function parseNum(t: unknown): number | null {
  const s = String(t).trim().replace(/^−/, '-').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

/** visits every value of a document with its (followed) schema: fn(path, schema, value, base) */
export function walk(
  reg: Registry,
  n0: SNode,
  v: unknown,
  path: Path,
  fn: (path: Path, s: Obj, v: unknown, b: string | undefined) => void,
  depth = 0,
): void {
  if (depth > 40) return;
  const n = follow(reg, n0),
    t = typeOfSchema(reg, n);
  fn(path, n.s, v, n.b);
  if (t === 'object' && isObj(v)) {
    const { view } = objectView(reg, n, v);
    for (const k of Object.keys(v)) {
      if (has(view.properties, k)) walk(reg, node(view.properties[k], view.bases[k]), v[k], [...path, k], fn, depth + 1);
      else if (isObj(view.additionalProperties)) walk(reg, node(view.additionalProperties, n.b), v[k], [...path, k], fn, depth + 1);
    }
  } else if (t === 'array' && Array.isArray(v) && n.s['items'] != null)
    (v as unknown[]).forEach((x, i) => {
      walk(reg, node(n.s['items'], n.b), x, [...path, i], fn, depth + 1);
    });
  else if (t === 'alt' && v !== undefined) {
    const bs = branches(reg, n);
    const b = bs?.[branchIndex(reg, n, v)];
    if (b) {
      const tb = typeOfSchema(reg, b);
      if (tb === 'object' || tb === 'array') walk(reg, b, v, path, fn, depth + 1);
      else fn(path, b.s, v, b.b);
    }
  }
}

/** the base of a schema: the given one, else its own $id */
export const baseOf = (s: unknown, base?: string): string | undefined =>
  base ?? (isObj(s) && typeof s['$id'] === 'string' ? s['$id'] : undefined);

/** The API of the former NoemaSchemaForm core, schema-first (the node suites and the author call it this way). */
export const schemaApi = Object.freeze({
  registry,
  validate,
  walk: (
    reg: Registry,
    s: unknown,
    v: unknown,
    fn: (path: Path, s: Obj, v: unknown, b: string | undefined) => void,
    base?: string,
  ): void => {
    walk(reg, node(s, baseOf(s, base)), v, [], fn);
  },
  skeleton: (reg: Registry, s: unknown, base?: string): unknown => skeleton(reg, node(s, baseOf(s, base))),
  branchIndex: (reg: Registry, s: unknown, v: unknown, base?: string): number => branchIndex(reg, follow(reg, node(s, baseOf(s, base))), v),
  objectView: (reg: Registry, s: unknown, v: unknown, base?: string): ObjectView =>
    objectView(reg, follow(reg, node(s, baseOf(s, base))), v),
  typeOf: (reg: Registry, s: unknown, base?: string): EditorKind => typeOfSchema(reg, follow(reg, node(s, baseOf(s, base)))),
  pathStr,
  parsePath,
  getAt,
  setAt,
  delAt,
  parseNum,
  clone,
});
