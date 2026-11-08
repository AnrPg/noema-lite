#!/usr/bin/env node
/* noema-lite — the contracts build (npm run contracts; package.json "prebuild" runs it before every build).

   The JSON Schemas in src/contracts/schemas/*.schema.json are the ONE source of every data format. From them this writes
   (all GENERATED, git-ignored, never edited by hand):

     src/contracts/generated/<name>.v<N>.ts   the TypeScript types of each schema (json-schema-to-typescript): the root
                                              type and one type per $defs entry
     src/contracts/generated/index.ts         re-exports them, one namespace per schema
     src/contracts/validate.ts                the compiled validators (ajv standalone code: plain functions, no eval or
                                              new Function at run time, so it runs under a strict CSP and in Workers),
                                              keyed by contract id ("noema.chapter.v1", "noema.chapter.v1#exercise"),
                                              and the message index the error formatter reads (x-message); the app
                                              (build/app.js: NoemaCore.contracts), the connector and the Node tools
                                              (build/noema-tools.cjs, which the Python tools call) bundle it
     src/contracts/validate-start.ts          the same, for the contracts the app's page checks before its validators are
                                              in (START_CONTRACTS: the learning log's events, checked when the log
                                              opens): build/app.js holds these few, build/contracts.js all of them
                                              (src/contracts/page.ts)

   Checks while it builds: every file is draft 2020-12 with a stable versioned $id
   (https://noema-lite.netlify.app/schemas/noema.<name>.v<N>.schema.json, the file's own name), every schema compiles in
   ajv's strict mode, and every $ref resolves.
   Usage: node tools/contracts.mjs [--check]   (--check: only compile and report, write nothing) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneMod from 'ajv/dist/standalone/index.js';
import { compile as toTs } from 'json-schema-to-typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src', 'contracts');
const SCHEMAS = path.join(DIR, 'schemas');
const GEN = path.join(DIR, 'generated');
const BASE = 'https://noema-lite.netlify.app/schemas/';
const ID_RE = /^https:\/\/noema-lite\.netlify\.app\/schemas\/(noema\.[a-z][a-z0-9-]*\.v[0-9]+)\.schema\.json$/;
const standalone = standaloneMod.default;
const CHECK = process.argv.includes('--check');

/** Every schema file → { file, id, name (noema.x.vN), schema } */
export function loadSchemas() {
  const out = [];
  for (const file of fs.readdirSync(SCHEMAS).filter(f => f.endsWith('.schema.json')).sort()) {
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS, file), 'utf8'));
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${file}: $schema must be draft 2020-12`);
    const m = ID_RE.exec(schema.$id || '');
    if (!m) throw new Error(`${file}: $id must be ${BASE}noema.<name>.v<N>.schema.json (got ${schema.$id})`);
    if (`${m[1]}.schema.json` !== file) throw new Error(`${file}: the file name must be its $id's (${m[1]}.schema.json)`);
    out.push({ file, id: schema.$id, name: m[1], schema });
  }
  return out;
}

export function makeAjv(schemas, opts = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictTuples: false, strictRequired: false, validateFormats: false, inlineRefs: false, ...opts });
  ajv.addKeyword({ keyword: 'x-message', schemaType: 'string' });   // the message a failure here shows (src/contracts/messages.ts)
  ajv.addKeyword({ keyword: 'x-noema' });                           // the authoring form's hints (src/features/author/domain/form.ts)
  for (const s of schemas) {
    ajv.addSchema(compiledForm(s.schema, s.id));
    for (const [d, sub] of Object.entries(s.schema.$defs || {})) ajv.addSchema({ $id: defId(s.id, d), ...compiledForm(sub, s.id) });
  }
  return ajv;
}

/* ajv compiles a definition once for every schema whose $refs reach it (it caches the code per root), so a definition
   that many schemas share (an exercise, a text) would be emitted many times over. Each $defs entry is therefore also added
   as a schema of its own (defId), and every $ref is pointed at that: then each definition is compiled once. The files and
   the ids stay as they are; only the compiled form differs. */
export const defId = (schemaId, def) => `${schemaId.replace(/\.schema\.json$/, '')}/${def}`;
const VALUE = new Set(['enum', 'const', 'examples', 'default']);
function compiledForm(x, base) {
  if (Array.isArray(x)) return x.map(y => compiledForm(y, base));
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === '$ref' && typeof v === 'string') {
      const [file, frag = ''] = new URL(v, base).href.split('#');
      const m = /^\/\$defs\/([^/]+)$/.exec(frag);
      o[k] = m ? defId(file, m[1]) : frag ? `${file}#${frag}` : file;
    } else if (k === '$defs' || k === 'properties' || k === 'patternProperties') o[k] = Object.fromEntries(Object.entries(v).map(([n, y]) => [n, compiledForm(y, base)]));
    else o[k] = VALUE.has(k) ? v : compiledForm(v, base);
  }
  return o;
}

/** The contracts the page needs at its start (src/contracts/page.ts): the learning log checks every event it reads or
    makes against the first, and the log opens before the first screen. */
export const START_CONTRACTS = ['noema.events.v1#event'];
/** a schema without its words for people (description, title, $comment, examples): the standalone code embeds the
    schema objects it reads, and the page's copy needs only what validates (x-message stays: the formatter's words) */
function bare(x) {
  if (Array.isArray(x)) return x.map(bare);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'description' || k === 'title' || k === '$comment' || k === 'examples') continue;
    o[k] = (k === 'properties' || k === '$defs' || k === 'patternProperties') ? Object.fromEntries(Object.entries(v).map(([n, y]) => [n, bare(y)])) : VALUE.has(k) ? v : bare(v);
  }
  return o;
}

/** The entry points: every schema's root (when it has one) and every $defs entry. → [{ key, ref }] */
function entries(schemas) {
  const out = [];
  for (const s of schemas) {
    const { $defs, $schema, $id, title, description, ...rest } = s.schema;
    if (Object.keys(rest).length) out.push({ key: s.name, ref: s.id });
    for (const d of Object.keys($defs || {})) out.push({ key: `${s.name}#${d}`, ref: `${s.id}#/$defs/${d}` });
  }
  return out;
}

/** The skeleton the error formatter walks: only the keywords that lead to a subschema, x-message, and each "if" whole. */
const WALK = new Set(['properties', 'patternProperties', 'additionalProperties', 'items', 'prefixItems', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', '$ref', '$defs', 'propertyNames', 'contains', 'not', 'x-message', '$id']);
function skeleton(x) {
  if (Array.isArray(x)) return x.map(skeleton);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (!WALK.has(k)) continue;
    if (k === 'if') { o[k] = v; continue; }   // whole: the formatter tells which branch the data took
    if (k === 'properties' || k === 'patternProperties' || k === '$defs') { const p = {}; for (const [n, s] of Object.entries(v)) { const sk = skeleton(s); p[n] = sk; } o[k] = p; }
    else o[k] = typeof v === 'object' ? skeleton(v) : v;
  }
  return o;
}

/* ajv's standalone code reaches four small runtime helpers with require(); they are written out here (the same algorithms),
   so the generated module imports nothing and runs anywhere. */
const RUNTIME = {
  'ajv/dist/runtime/ucs2length': `function ucs2length(str) { let n = 0; for (let i = 0; i < str.length; i++) { n++; const c = str.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if ((d & 0xfc00) === 0xdc00) i++; } } return n; }`,
  'ajv/dist/runtime/equal': `function equal(a, b) { if (a === b) return true; if (a && b && typeof a === 'object' && typeof b === 'object') { if (a.constructor !== b.constructor) return false; if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = a.length; i-- !== 0;) if (!equal(a[i], b[i])) return false; return true; } const keys = Object.keys(a); if (keys.length !== Object.keys(b).length) return false; for (let i = keys.length; i-- !== 0;) if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false; for (let i = keys.length; i-- !== 0;) { const k = keys[i]; if (!equal(a[k], b[k])) return false; } return true; } return a !== a && b !== b; }`,
};

function validatorsModule(schemas, ajvCode, list) {
  let code = ajvCode.replace(/^"use strict";/, '');
  const used = new Map();
  code = code.replace(/const (func[0-9]+) = require\("([^"]+)"\)\.default;?/g, (m, fn, mod) => {
    if (!RUNTIME[mod]) throw new Error(`the standalone code needs ${mod}: add it to RUNTIME in tools/contracts.mjs`);
    used.set(mod, fn); return `const ${fn} = ${RUNTIME[mod].split('(')[0].replace('function ', '')};`;
  });
  if (/require\(/.test(code)) throw new Error('the standalone code still calls require(): ' + code.match(/require\([^)]*\)/)[0]);
  const helpers = [...used.keys()].map(m => RUNTIME[m]).join('\n');
  const keys = list.map(e => e.key);
  const index = list.map((e, i) => `  ${JSON.stringify(e.key)}: v${i},`).join('\n');
  const sk = Object.fromEntries(schemas.map(s => [s.id, skeleton(s.schema)]));
  return `// @ts-nocheck — GENERATED by tools/contracts.mjs from src/contracts/schemas (npm run contracts). Do not edit.
/* eslint-disable */
${helpers}
${code}
/** Every contract id (a schema "noema.<name>.v<N>", or one of its $defs "noema.<name>.v<N>#<def>"). */
export const CONTRACT_IDS = ${JSON.stringify(keys)};
/** The compiled validator of each contract id: (data) → boolean, the errors in .errors (ajv's error objects). */
export const VALIDATORS = {
${index}
};
/** The schema id of each contract id, and the skeleton of every schema (the keywords that lead to a subschema, and
    x-message): what src/contracts/messages.ts walks to word an error. */
export const REFS = ${JSON.stringify(Object.fromEntries(list.map(e => [e.key, e.ref])))};
export const SKELETONS = ${JSON.stringify(sk)};
`;
}

/** json-schema-to-typescript: one module per schema. Cross-file $refs are read from the local files (never fetched). */
async function typesOf(s, byId) {
  const strip = x => {
    if (Array.isArray(x)) return x.map(strip);
    if (!x || typeof x !== 'object') return x;
    const o = {};
    for (const [k, v] of Object.entries(x)) { if (k === 'title' || k === 'x-message' || k === 'x-noema') continue; o[k] = (k === 'properties' || k === '$defs' || k === 'patternProperties') ? Object.fromEntries(Object.entries(v).map(([n, y]) => [n, strip(y)])) : strip(v); }
    return o;
  };
  const pascal = s.name.replace(/^noema\./, '').replace(/\.v([0-9]+)$/, '').split(/[-.]/).map(w => w[0].toUpperCase() + w.slice(1)).join('');
  const root = bundle(s, byId, strip);
  const { $defs, $schema, $id, description, ...rest } = root;
  const schema = Object.keys(rest).length ? root : { ...root, type: 'object', additionalProperties: false, properties: {}, tsType: 'never' };
  return toTs(schema, pascal, {
    bannerComment: `/* GENERATED by tools/contracts.mjs from src/contracts/schemas/${s.file} (npm run contracts). Do not edit. */`,
    unreachableDefinitions: true, declareExternallyReferenced: true, additionalProperties: true, strictIndexSignatures: true,
    format: false, cwd: SCHEMAS, $refOptions: { resolve: { http: false, file: false } },
  });
}

/** One schema with every $ref into a sibling file ("noema.common.v1.schema.json#/$defs/text", or a whole file) turned
    into a local one: the definitions it reaches are copied into its own $defs (as "<file>_<def>"), so the types need no
    resolver and a type of another schema keeps its own name. */
function bundle(s, byId, strip) {
  const fileOf = f => byId.get(BASE + f);
  const short = f => f.replace(/^noema\./, '').replace(/\.schema\.json$/, '').replace(/[^A-Za-z0-9]+/g, '_');
  const defs = {}, todo = [];
  const want = (file, def) => {
    const key = def === null ? short(file) : `${short(file)}_${def}`;
    if (!(key in defs)) { defs[key] = null; todo.push([file, def, key]); }
    return `#/$defs/${key}`;
  };
  const rewrite = (x, file) => {
    if (Array.isArray(x)) return x.map(y => rewrite(y, file));
    if (!x || typeof x !== 'object') return x;
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === '$ref' && typeof v === 'string') {
        const [f, frag = ''] = v.split('#');
        const target = f || file;
        const m = /^\/\$defs\/([^/]+)$/.exec(frag);
        if (target === s.file) o[k] = m ? `#/$defs/${m[1]}` : '#';
        else if (m) o[k] = want(target, m[1]);
        else if (!frag) o[k] = want(target, null);
        else throw new Error(`${s.file}: cannot bundle $ref ${v}`);
      } else if (k === 'properties' || k === '$defs' || k === 'patternProperties') o[k] = Object.fromEntries(Object.entries(v).map(([n, y]) => [n, rewrite(y, file)]));
      else o[k] = rewrite(v, file);
    }
    return o;
  };
  const root = rewrite(strip(s.schema), s.file);
  while (todo.length) {
    const [file, def, key] = todo.shift();
    const other = fileOf(file);
    if (!other) throw new Error(`${s.file}: $ref to an unknown schema ${file}`);
    const src = strip(other.schema);
    let part;
    if (def === null) { const { $defs, $schema, $id, ...rest } = src; part = rest; }
    else { part = src.$defs?.[def]; if (!part) throw new Error(`${s.file}: ${file} has no $defs/${def}`); }
    defs[key] = rewrite(part, file);
  }
  root.$defs = { ...(root.$defs || {}), ...defs };
  return root;
}

async function main() {
  const schemas = loadSchemas();
  const byId = new Map(schemas.map(s => [s.id, s]));
  const list = entries(schemas);
  const ajv = makeAjv(schemas, { code: { source: true, esm: true } });
  const entryId = e => { const [file, frag] = e.ref.split('#/$defs/'); return frag ? defId(file, frag) : file; };
  for (const e of list) { if (!ajv.getSchema(entryId(e))) throw new Error(`${e.key}: does not compile`); }
  const code = standalone(ajv, Object.fromEntries(list.map((e, i) => [`v${i}`, entryId(e)])));
  console.log(`contracts: ${schemas.length} schemas, ${list.length} contracts compiled`);
  if (CHECK) return;

  fs.mkdirSync(GEN, { recursive: true });
  for (const f of fs.readdirSync(GEN)) fs.rmSync(path.join(GEN, f));
  const mods = [];
  for (const s of schemas) {
    const ts = await typesOf(s, byId);
    const out = `${s.name.replace(/^noema\./, '')}.ts`;
    fs.writeFileSync(path.join(GEN, out), ts);
    mods.push([s.name, out]);
  }
  const ns = n => n.replace(/^noema\./, '').replace(/[-.]([a-z0-9])/g, (m, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase());
  fs.writeFileSync(path.join(GEN, 'index.ts'), `/* GENERATED by tools/contracts.mjs (npm run contracts). Do not edit. One namespace per schema. */\n` +
    mods.map(([n, f]) => `export type * as ${ns(n)} from './${f}';`).join('\n') + '\n');
  const vpath = path.join(DIR, 'validate.ts');
  fs.writeFileSync(vpath, validatorsModule(schemas, code, list));
  const start = list.filter(e => START_CONTRACTS.includes(e.key));
  if (start.length !== START_CONTRACTS.length) throw new Error(`START_CONTRACTS names a contract that does not exist: ${START_CONTRACTS.join(', ')}`);
  const startSchemas = schemas.filter(s => start.some(e => e.ref.startsWith(s.id)));
  const startAjv = makeAjv(startSchemas.map(s => ({ ...s, schema: bare(s.schema) })), { code: { source: true, esm: true } });
  const startCode = standalone(startAjv, Object.fromEntries(start.map((e, i) => [`v${i}`, entryId(e)])));
  fs.writeFileSync(path.join(DIR, 'validate-start.ts'), validatorsModule(startSchemas, startCode, start));
  console.log(`contracts: wrote src/contracts/generated/ (${mods.length} modules), src/contracts/validate.ts, src/contracts/validate-start.ts`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('✗ contracts:', e.message); process.exit(1); });
