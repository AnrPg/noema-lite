/* Tool input checked against the tool's JSON Schema before the handler runs (the subset the tools use: type, properties,
   required, enum, items). Claude sometimes sends a scalar as a string ("false", "12"): like ajv's coerceTypes, a scalar is
   converted to the declared scalar type when that is lossless; anything else that does not fit is refused with every problem.
   `required` of the top level is the handler's: a tool answers a missing argument with its own instructions (which course,
   what a request still needs, the upload command…), which tell Claude more than "required" — so only nested objects
   are checked for it here (checkArgs(…, { required: true }) checks the top level too). */

export type JsonType = 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
export interface JsonSchema {
  type?: JsonType;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: readonly (string | number | boolean)[];
  items?: JsonSchema;
}

export type Checked = { ok: true; value: Record<string, unknown> } | { ok: false; problems: string[] };

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function coerce(v: unknown, s: JsonSchema, at: string, out: string[]): unknown {
  const t = s.type;
  let x = v;
  if (t === 'string' && (typeof x === 'number' || typeof x === 'boolean')) x = String(x);
  else if ((t === 'integer' || t === 'number') && typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) x = Number(x);
  else if (t === 'boolean' && (x === 'true' || x === 'false')) x = x === 'true';
  const ok =
    t == null
      ? true
      : t === 'integer'
        ? typeof x === 'number' && Number.isInteger(x)
        : t === 'number'
          ? typeof x === 'number' && Number.isFinite(x)
          : t === 'array'
            ? Array.isArray(x)
            : t === 'object'
              ? typeOf(x) === 'object'
              : typeof x === t;
  if (!ok) {
    out.push(
      `${at}: must be ${t === 'integer' ? 'an integer' : t === 'array' || t === 'object' ? `an ${t}` : `a ${t ?? ''}`} (got ${typeOf(v)})`,
    );
    return v;
  }
  if (s.enum && !s.enum.includes(x as string | number | boolean)) {
    out.push(`${at}: must be one of ${s.enum.join(', ')} (got ${JSON.stringify(x)})`);
    return x;
  }
  if (t === 'array' && s.items && Array.isArray(x)) return x.map((e, i) => coerce(e, s.items as JsonSchema, `${at}[${i}]`, out));
  if (t === 'object' && s.properties && typeOf(x) === 'object') return object(x as Record<string, unknown>, s, at, out);
  return x;
}
function object(v: Record<string, unknown>, s: JsonSchema, at: string, out: string[], required = true): Record<string, unknown> {
  const o: Record<string, unknown> = { ...v };
  if (required) for (const k of s.required ?? []) if (o[k] == null) out.push(`${at ? at + '.' : ''}${k}: required`);
  for (const [k, ps] of Object.entries(s.properties ?? {})) if (o[k] != null) o[k] = coerce(o[k], ps, at ? `${at}.${k}` : k, out);
  return o;
}

/** Check (and coerce) a tool's arguments. */
export function checkArgs(schema: JsonSchema, args: unknown, { required = false }: { required?: boolean } = {}): Checked {
  const out: string[] = [];
  if (args != null && typeOf(args) !== 'object') return { ok: false, problems: ['the arguments must be an object'] };
  const value = object((args ?? {}) as Record<string, unknown>, schema, '', out, required);
  return out.length ? { ok: false, problems: out } : { ok: true, value };
}
