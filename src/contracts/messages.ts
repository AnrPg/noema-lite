/* noema-lite — the words of a contract error (English diagnostics, like every check message: read by the AI that repairs
   its file, by Claude through the connector, and by people as the technical detail after a translated sentence).

   ajv reports where the data fails (instancePath) and which keyword failed. A schema can name the message of a failure
   with "x-message" on the subschema that fails, or on any schema that applies at that place (an allOf wrapper, the
   property's own schema). To find it, the formatter walks the schema skeleton (tools/contracts.mjs keeps only the keywords
   that lead to a subschema, and x-message) along the instance path, through $ref, allOf, anyOf, oneOf, if/then/else. */

export interface AjvError {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message?: string | undefined;
  readonly propertyName?: string | undefined;
}

/** One problem: where (a dotted path, "" = the whole document), the failed keyword, and the words. */
export interface ContractIssue {
  readonly path: string;
  readonly pointer: string;
  readonly keyword: string;
  readonly message: string;
  /** path + message, ready to show: `subject.i18n.xx: "xx" is not a locale code …` */
  readonly text: string;
}

type Skel = { readonly [k: string]: unknown };
export interface SchemaIndex {
  readonly skeletons: Readonly<Record<string, Skel>>;
}

const isObj = (v: unknown): v is Skel => v !== null && typeof v === 'object' && !Array.isArray(v);
const pointerSegments = (p: string): string[] => (p === '' ? [] : p.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')));

/** "/chapters/0/exercises/3/q" → "chapters[0].exercises[3].q" */
export function dotted(pointer: string): string {
  let out = '';
  for (const seg of pointerSegments(pointer)) out += /^[0-9]+$/.test(seg) ? `[${seg}]` : (out ? '.' : '') + seg;
  return out;
}

interface At { readonly s: Skel; readonly base: string }

/** Resolve a $ref against the schema it appears in. */
function deref(ix: SchemaIndex, at: At, ref: string): At | null {
  const [file, frag = ''] = ref.split('#');
  const base = file ? new URL(file, at.base).href : at.base;
  let s: unknown = ix.skeletons[base];
  for (const seg of pointerSegments(frag)) { if (!isObj(s)) return null; s = s[seg]; }
  return isObj(s) ? { s, base } : null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const TYPE_OF: Readonly<Record<string, (v: unknown) => boolean>> = {
  string: v => typeof v === 'string', number: v => typeof v === 'number', integer: v => Number.isInteger(v), boolean: v => typeof v === 'boolean',
  object: isObj, array: Array.isArray, null: v => v === null,
};
/** Does the value meet an "if" schema? true / false, or undefined when the skeleton cannot tell (a keyword it does not
    keep): then both branches are words that may apply. The ifs of the contracts test a type field, so this is exact. */
function holds(s: unknown, v: unknown): boolean | undefined {
  if (!isObj(s)) return undefined;
  const parts: (boolean | undefined)[] = [];
  for (const [k, x] of Object.entries(s)) {
    if (k === 'const') parts.push(same(x, v));
    else if (k === 'enum') parts.push(Array.isArray(x) && x.some(y => same(y, v)));
    else if (k === 'not') { const n = holds(x, v); parts.push(n === undefined ? undefined : !n); }
    else if (k === 'required') parts.push(isObj(v) && Array.isArray(x) && x.every(p => typeof p === 'string' && p in v));
    else if (k === 'type') parts.push((Array.isArray(x) ? x : [x]).some(t => TYPE_OF[String(t)]?.(v) ?? false));
    else if (k === 'properties') { if (isObj(x) && isObj(v)) for (const [p, ps] of Object.entries(x)) if (p in v) parts.push(holds(ps, v[p])); }
    else if (k !== 'x-message' && k !== 'description') parts.push(undefined);
  }
  return parts.includes(false) ? false : parts.includes(undefined) ? undefined : true;
}

/** Every schema that applies at one place to the value v: the schema itself and everything it pulls in ($ref, allOf,
    the branch of an if that the value takes …). */
function expand(ix: SchemaIndex, start: At, v: unknown): At[] {
  const out: At[] = [], todo: At[] = [start], seen = new Set<Skel>();
  while (todo.length) {
    const at = todo.pop() as At;
    if (seen.has(at.s)) continue;
    seen.add(at.s); out.push(at);
    const base = typeof at.s.$id === 'string' ? at.s.$id : at.base;
    const here: At = { s: at.s, base };
    if (typeof at.s.$ref === 'string') { const r = deref(ix, here, at.s.$ref); if (r) todo.push(r); }
    for (const k of ['allOf', 'anyOf', 'oneOf']) { const x = at.s[k]; if (Array.isArray(x)) for (const y of x) if (isObj(y)) todo.push({ s: y, base }); }
    const cond = 'if' in at.s ? holds(at.s.if, v) : undefined;
    if (isObj(at.s.then) && cond !== false) todo.push({ s: at.s.then, base });
    if (isObj(at.s.else) && cond !== true) todo.push({ s: at.s.else, base });
  }
  return out;
}

/** The schemas that apply to the value at an instance path (data: the whole document). */
function schemasAt(ix: SchemaIndex, root: At, pointer: string, data: unknown): At[] {
  let v = data, set = expand(ix, root, v);
  for (const seg of pointerSegments(pointer)) {
    const next: At[] = [];
    for (const at of set) {
      const props = at.s.properties;
      if (isObj(props) && isObj(props[seg])) next.push({ s: props[seg] as Skel, base: at.base });
      else if (isObj(at.s.additionalProperties)) next.push({ s: at.s.additionalProperties, base: at.base });
      const pre = at.s.prefixItems;
      if (/^[0-9]+$/.test(seg) && Array.isArray(pre) && isObj(pre[Number(seg)])) next.push({ s: pre[Number(seg)] as Skel, base: at.base });
      else if (/^[0-9]+$/.test(seg) && isObj(at.s.items)) next.push({ s: at.s.items, base: at.base });
    }
    v = Array.isArray(v) ? v[Number(seg)] : isObj(v) ? v[seg] : undefined;
    set = next.flatMap(a => expand(ix, a, v));
    if (!set.length) break;
  }
  return set;
}

const xmsg = (set: readonly At[]): string | null => {
  for (const at of set) if (typeof at.s['x-message'] === 'string') return at.s['x-message'];
  return null;
};
const show = (v: unknown): string => { const t = JSON.stringify(v); return t === undefined ? String(v) : t.length > 60 ? t.slice(0, 57) + '…' : t; };

function defaultMessage(e: AjvError): string {
  const p = e.params;
  switch (e.keyword) {
    case 'type': return `must be ${String(p.type).replace(',', ' or ')}`;
    case 'enum': return `must be one of ${(p.allowedValues as unknown[]).map(show).join(', ')}`;
    case 'const': return `must be ${show(p.allowedValue)}`;
    case 'pattern': return `does not match ${String(p.pattern)}`;
    case 'minItems': return `needs at least ${String(p.limit)} item(s)`;
    case 'maxItems': return `has more than ${String(p.limit)} item(s)`;
    case 'minLength': return Number(p.limit) === 1 ? 'must not be empty' : `must be at least ${String(p.limit)} characters`;
    case 'maxLength': return `longer than ${String(p.limit)} characters`;
    case 'minimum': case 'exclusiveMinimum': case 'maximum': case 'exclusiveMaximum': return `must be ${String(p.comparison)} ${String(p.limit)}`;
    case 'uniqueItems': return `items ${String(p.j)} and ${String(p.i)} are the same`;
    case 'minProperties': return `needs at least ${String(p.limit)} entr${Number(p.limit) === 1 ? 'y' : 'ies'}`;
    case 'contains': return `needs at least ${String(p.minContains)} matching item(s)`;
    case 'oneOf': return 'matches none of the allowed shapes';
    case 'anyOf': return 'matches none of the allowed shapes';
    case 'not': return 'is not allowed here';
    default: return e.message || e.keyword;
  }
}

/** The keywords about an object itself, never about one of its property names. */
const OBJECT_KEYWORDS = new Set(['required', 'additionalProperties', 'minProperties', 'maxProperties', 'type', 'dependentRequired', 'oneOf', 'anyOf', 'not', 'const', 'enum']);

/** ajv errors of one validation → the issues, worded. root: the schema id the validator was compiled from. */
export function word(ix: SchemaIndex, rootRef: string, errors: readonly AjvError[], data: unknown): ContractIssue[] {
  const [file = '', frag = ''] = rootRef.split('#');
  const rootSkel = deref({ skeletons: ix.skeletons }, { s: ix.skeletons[file] ?? {}, base: file }, '#' + frag);
  const root: At = rootSkel ?? { s: {}, base: file };
  // the branches of a failed oneOf / anyOf are one problem ("matches none"), not each branch's complaints
  const groups = errors.filter(e => e.keyword === 'oneOf' || e.keyword === 'anyOf').map(e => ({ at: e.instancePath, sp: e.schemaPath.replace(/\/(oneOf|anyOf)$/, '/$1/') }));
  // a bad property name: ajv reports what the name failed (inline: with propertyName; through a $ref: without it, just
  // before) and then "propertyNames" with the name in params — one problem, worded once on the propertyNames error
  const skip = new Set<AjvError>();
  errors.forEach((e, i) => {
    if (e.keyword !== 'propertyNames') return;
    for (let j = i - 1; j >= 0; j--) {
      const x = errors[j] as AjvError;
      if (x.instancePath !== e.instancePath || x.keyword === 'propertyNames' || OBJECT_KEYWORDS.has(x.keyword)) break;
      skip.add(x);
    }
  });
  const out: ContractIssue[] = [], seen = new Set<string>();
  for (const e of errors) {
    if (e.keyword === 'if' || skip.has(e)) continue;
    if (groups.some(g => e.keyword !== 'oneOf' && e.keyword !== 'anyOf' && e.instancePath.startsWith(g.at) && e.schemaPath.startsWith(g.sp))) continue;
    if (e.keyword === 'contains' && errors.some(x => x !== e && x.keyword === 'contains' && x.instancePath === e.instancePath)) continue;
    let pointer = e.instancePath, message: string;
    if (e.keyword === 'required') {
      const prop = String(e.params.missingProperty);
      pointer = `${e.instancePath}/${prop.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      const own = schemasAt(ix, root, pointer, data)[0]?.s['x-message'];   // only the property's own words (not a shared text's)
      message = typeof own === 'string' ? `missing — ${own}` : 'missing';
    } else if (e.keyword === 'additionalProperties') {
      const prop = String(e.params.additionalProperty);
      pointer = `${e.instancePath}/${prop}`;
      const own = xmsg(schemasAt(ix, root, e.instancePath, data));
      message = `unknown field${own && own.startsWith('(') ? ' ' + own : ''}`;
    } else if (e.keyword === 'propertyNames' || e.propertyName !== undefined) {
      const name = String(e.propertyName ?? e.params.propertyName);
      pointer = `${e.instancePath}/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      const set = schemasAt(ix, root, e.instancePath, data).flatMap(a => isObj(a.s.propertyNames) ? expand(ix, { s: a.s.propertyNames, base: a.base }, name) : []);
      message = `${show(name)} ${xmsg(set) ?? (e.keyword === 'propertyNames' ? 'is not an allowed name' : defaultMessage(e))}`;
    } else {
      message = xmsg(schemasAt(ix, root, pointer, data)) ?? defaultMessage(e);
    }
    const path = dotted(pointer), text = path ? `${path}: ${message}` : message;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ path, pointer, keyword: e.keyword, message, text });
  }
  return out;
}
