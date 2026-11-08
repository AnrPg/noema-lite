/**
 * An activity as the author writes it (docs/activities-dev/authoring_ui.md): the document {item, spec, strings} — its
 * registry entry (noema.activities/v1), its sim-spec@1 spec and its word tables — the names a formula may use at a place of
 * the spec, a part's own spec, and the files of the activity folder. Pure.
 */
import type { AuthorDoc, FieldPath, WordTables } from '../../../ports/authoring.ts';
import { clone, isObj, type Obj } from './schema.ts';

export const SIM_ID = 'https://noema-lite.netlify.app/schemas/noema.sim-spec.v1.schema.json';
export const REG_ID = 'https://noema-lite.netlify.app/schemas/noema.activities.v1.schema.json';
/** a key of the word tables, and a locale tag */
export const KEY_RE = /^[a-z][a-zA-Z0-9_.-]{0,63}$/;
export const LOC_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
/** the languages a new activity has word tables in */
export const DEFAULT_LOCALES = ['en', 'el', 'ru', 'de', 'fr'] as const;

/** the registry entry of a new sim-spec@1 activity */
export function item(id: string): Obj {
  return {
    id,
    runtime: 'sim-spec@1',
    entry: `activities/${id}/spec.json`,
    stateVersion: 1,
    capabilities: ['state', 'events'],
    fallback: { media: `${id}-still`, text: '' },
    origin: 'own',
    credit: '',
    license: 'own',
  };
}
/** word tables in the default languages, each key's text the key itself */
export const tables = (keys: readonly string[]): WordTables =>
  Object.fromEntries(DEFAULT_LOCALES.map(l => [l, Object.fromEntries(keys.map(k => [k, k]))]));
/** the one slider a new spec starts with */
export const firstSlider = (): Obj => ({ id: 'x', kind: 'slider', label: 'x', min: 0, max: 1, default: 0.5 });

const list = (v: unknown): Obj[] => (Array.isArray(v) ? (v as unknown[]).filter(isObj) : []);
/** the part a path of the spec is in (parts[i]…), or null */
export const partOf = (spec: Obj, path: FieldPath): Obj | null => {
  const parts = spec['parts'],
    i = path[1];
  if (path[0] !== 'parts' || typeof i !== 'number' || !Array.isArray(parts)) return null;
  const p: unknown = parts[i];
  return isObj(p) ? p : null;
};
/** the spec one part shows its engine (NoemaCore.content.partSpec): its model and outputs, the consts and params, its inputs as names */
export function partSub(spec: Obj, p: Obj): Obj {
  const consts: Obj = { ...(isObj(spec['consts']) ? spec['consts'] : {}) };
  for (const k of Object.keys(isObj(p['inputs']) ? p['inputs'] : {})) if (!(k in consts)) consts[k] = 1;
  return {
    format: spec['format'],
    engine: p['engine'],
    consts,
    params: Array.isArray(spec['params']) ? spec['params'] : [],
    model: p['model'],
    outputs: Array.isArray(p['outputs']) ? p['outputs'] : [],
  };
}
/** every output of the spec: its own and its parts' */
export const allOutputs = (spec: Obj): Obj[] => [...list(spec['outputs']), ...list(spec['parts']).flatMap(p => list(p['outputs']))];

/** the names a formula may use at a path of the spec (the validators' order rules) */
export function namesAt(spec: Obj, path: FieldPath): string[] {
  const ids = (k: string): string[] =>
    list(spec[k])
      .map(x => x['id'])
      .filter((x): x is string => typeof x === 'string' && !!x);
  const base = [...(isObj(spec['consts']) ? Object.keys(spec['consts']) : []), ...ids('params')];
  const der = ids('derived'),
    scal = allOutputs(spec)
      .filter(o => o['kind'] === 'scalar' && typeof o['id'] === 'string')
      .map(o => o['id'] as string);
  const pt = partOf(spec, path);
  if (pt && path[2] === 'model') return base.concat(Object.keys(isObj(pt['inputs']) ? pt['inputs'] : {}));
  if (pt && path[2] === 'inputs')
    return base.concat(
      der,
      scal.filter(o => !list(pt['outputs']).some(x => x['id'] === o)),
    );
  if (path[0] === 'derived') return base.concat(der.slice(0, typeof path[1] === 'number' ? path[1] : der.length));
  if (path[0] === 'model' || path[0] === 'bench') return base.concat(der);
  const all = base.concat(der, scal);
  if (path[0] === 'plots' && path[2] === 'series' && typeof path[1] === 'number') {
    const p = list(spec['plots'])[path[1]],
      x = p && isObj(p['x']) ? p['x'] : null;
    if (p && p['kind'] === 'function' && x && typeof x['var'] === 'string' && x['var']) return all.concat(x['var']);
  }
  return all;
}

/* ---------- the files of the activity folder ---------- */
const pretty = (v: unknown): string => JSON.stringify(v, null, 1) + '\n';
/** activities/activities.json, activities/<id>/spec.json and strings.<locale>.json */
export function files(doc: AuthorDoc): Record<string, string> {
  const id = String(doc.item['id']),
    out: Record<string, string> = {};
  out['activities/activities.json'] = pretty({ format: 'noema.activities/v1', items: [doc.item] });
  out[`activities/${id}/spec.json`] = pretty(doc.spec);
  for (const loc of Object.keys(doc.strings).sort()) out[`activities/${id}/strings.${loc}.json`] = pretty(doc.strings[loc]);
  return out;
}
/** files {name: text} (from a folder, a zip, single JSON files) → a document; what they lack comes from `base` */
export function fromFiles(fs: Readonly<Record<string, string>>, base: AuthorDoc): AuthorDoc {
  const got: { item: Obj | null; spec: Obj | null; strings: WordTables } = { item: null, spec: null, strings: {} };
  for (const [name, text] of Object.entries(fs)) {
    const b = name.split('/').pop() ?? name;
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      continue; // not JSON: not a file of the folder
    }
    if (b === 'activities.json' && isObj(j) && Array.isArray(j['items'])) {
      const items = (j['items'] as unknown[]).filter(isObj);
      got.item = items.find(x => x['runtime'] === 'sim-spec@1') ?? items[0] ?? null;
    } else if (b === 'activity.json' && isObj(j)) got.item = j;
    else if (b === 'spec.json' && isObj(j)) got.spec = j;
    else {
      const m = /^strings\.([A-Za-z0-9-]+)\.json$/.exec(b);
      if (m?.[1] && isObj(j)) got.strings[m[1]] = j as Record<string, string>;
    }
  }
  const out = clone(base);
  if (got.item) {
    out.item = got.item;
    if (!out.item['entry'] && typeof out.item['id'] === 'string') out.item['entry'] = `activities/${out.item['id']}/spec.json`;
  }
  if (got.spec) out.spec = got.spec;
  if (Object.keys(got.strings).length) out.strings = got.strings;
  return out;
}
/** a reference activity (tools/activities_examples/<ref>) as a document */
export function fromRef(r: Obj): AuthorDoc {
  const it = clone(isObj(r['item']) ? r['item'] : {});
  if (!it['entry'] && typeof it['id'] === 'string') it['entry'] = `activities/${it['id']}/spec.json`;
  return {
    item: it,
    spec: clone(isObj(r['spec']) ? r['spec'] : {}),
    strings: clone(isObj(r['strings']) ? (r['strings'] as WordTables) : {}),
  };
}
/** the registry entry after an edit: a new id renames its entry and its still when they followed the old one */
export function itemEdited(old: Obj, next: Obj): Obj {
  const was = old['id'],
    id = next['id'];
  if (id === was || typeof id !== 'string') return next;
  const v = clone(next);
  if (v['entry'] === `activities/${String(was)}/spec.json`) v['entry'] = `activities/${id}/spec.json`;
  const fb = v['fallback'];
  if (isObj(fb) && fb['media'] === `${String(was)}-still`) fb['media'] = `${id}-still`;
  return v;
}

/* ---------- the word tables in the spec ---------- */
/** the ids in a model (any depth up to 8): the suggestions of a "ref" field */
export function idsIn(v: unknown, d = 0, out = new Set<string>()): Set<string> {
  if (d > 8) return out;
  if (Array.isArray(v)) for (const x of v as unknown[]) idsIn(x, d + 1, out);
  else if (isObj(v)) {
    if (typeof v['id'] === 'string' && v['id']) out.add(v['id']);
    for (const x of Object.values(v)) idsIn(x, d + 1, out);
  }
  return out;
}
