/* ===================== interactive activities — the engine library's model tables as JSON Schemas (docs/INTERACTIVE_LIBRARY.md §1.5) =====================
   One source of truth: the table an engine's checkSpec walks (NoemaLibCore.walk) also gives the activity author its form. A library
   engine exports `table` (its module's frozen object):
     table = { model:   T                                   the model's table (the kinds and shapes of 46_lib_core.js walk), or
                        { $by: 'mode', $cases: { <mode>: T } }   a model whose fields depend on one field (genetics@1, craft@1, …),
               outputs: { <kind>: [<of>, …] | { <of>: T } }  the output kinds and what each may name (T: that output's own fields),
                        or { $by: 'mode', $cases: { <mode>: { <kind>: … } } },
               fields?: T                                    fields any output may carry (node, code, labels …),
               offered?(model) → { <kind>: [<of>, …] } }     what a given model offers (ids of its own parts), when the lists depend on it
   toSchema(table) → { model, output } (JSON Schema 2020-12 nodes that $ref the sim-spec schema's $defs: key, expr, numOrExpr, libId, libName);
   specSchema(id, table, simSchema) → a whole sim-spec@1 schema for that engine (its own $id); ofs(table, model, kind) → the `of` an
   output of that kind may name (suggestions: checkSpec says the last word). Field titles are `lib.<field>` (labels
   engine.author.f.lib.<field> in the app's catalogs). Kinds the core does not know (an engine's own, such as text@1's raw) become
   free values. Pure JS, no DOM: Node runs it (tests/activity_author.js). */
(function noemaLibSchemaModule(root) {
  /* i18n-ignore-start */   // schema data and code, no words for people
  'use strict';
  const C = root.NoemaLibCore;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const D = '#/$defs/';
  const SIM_BASE = 'https://noema-lite.netlify.app/schemas/noema.sim-spec.';
  const ref = (n, title) => (title ? { title, $ref: D + n } : { $ref: D + n });
  const T = k => 'lib.' + k;

  /** a kind of the core ('pos', 'int:0:9', 'enum:a|b', 'ref!' …) → a schema */
  function kindSchema(kind, title) {
    const k = String(kind).replace(/!$/, ''), t = title ? { title } : {};
    if (k === 'pos') return { ...t, type: 'number', exclusiveMinimum: 0 };
    if (k === 'nonneg') return { ...t, type: 'number', minimum: 0 };
    if (k === 'unit') return { ...t, type: 'number', minimum: 0, maximum: 1 };
    if (k === 'fin') return { ...t, type: 'number' };
    if (k === 'bool') return { ...t, type: 'boolean' };
    if (k.startsWith('int:')) { const [, a, b] = k.split(':'); return { ...t, type: 'integer', minimum: +a, maximum: +b }; }
    if (k.startsWith('enum:')) return { ...t, enum: k.slice(5).split('|') };
    if (k === 'id' || k === 'ref') return ref('libId', title);
    if (k === 'name') return ref('libName', title);
    if (k === 'key') return ref('key', title);
    if (k === 'expr') return ref('expr', title);
    if (k === 'numx') return ref('numOrExpr', title);
    if (k === 'any') return { ...t };
    return { ...t, type: 'string', minLength: 1 };   // an engine's own kind (text@1 raw, geom@1 pick …): a short text
  }
  const must = kd => (typeof kd === 'string' ? kd.endsWith('!') : isObj(kd) && kd.$req === true);
  /** a value of a table (a kind or a shape) → a schema */
  function shape(kd, title) {
    if (typeof kd === 'string') return kindSchema(kd, title);
    if (!isObj(kd)) return title ? { title } : {};
    if (kd.$obj) return Object.assign(obj(kd.$obj), title ? { title } : {});
    if (kd.$map) {
      const s = { type: 'object', propertyNames: ref('libName'), additionalProperties: shape(kd.$map, T('value')) };
      if (kd.max) s.maxProperties = kd.max;
      return Object.assign(title ? { title } : {}, s);
    }
    if (kd.$list !== undefined) {
      const s = { type: 'array', items: shape(kd.$list) };
      if (kd.min) s.minItems = kd.min;
      if (kd.max) s.maxItems = kd.max;
      return Object.assign(title ? { title } : {}, s);
    }
    if (kd.$by) return by(kd);
    return title ? { title } : {};
  }
  /** a table {field: kind or shape} → an object schema (fields it does not list stay: the checker only warns about them) */
  function obj(table) {
    const s = { type: 'object', properties: {} }, req = [];
    for (const [k, kd] of Object.entries(table || {})) { s.properties[k] = shape(kd, T(k)); if (must(kd)) req.push(k); }
    if (req.length) s.required = req;
    return s;
  }
  /** {$by: field, $cases: {value: table}} → one object schema whose branches are told apart by that field (a const in each) */
  function by(kd) {
    const f = kd.$by, cases = Object.keys(kd.$cases || {});
    const s = { type: 'object', required: [f], properties: { [f]: { title: T(f), enum: cases } } };
    s.oneOf = cases.map(c => {
      const b = obj(Object.assign({}, kd.$cases[c]));
      b.properties[f] = { const: c };
      b.required = (b.required || []).filter(x => x !== f);
      if (!b.required.length) delete b.required;
      delete b.type;
      return b;
    });
    return s;
  }

  /* ---------- outputs: {id, kind, of} and every field an output of this engine may carry ---------- */
  const outCases = o => (isObj(o) && o.$by ? Object.values(o.$cases || {}) : [o || {}]);
  function outKinds(table) {
    const ks = [];
    for (const c of outCases(table.outputs)) for (const k of Object.keys(c || {})) if (!ks.includes(k)) ks.push(k);
    return ks;
  }
  /** the union of the outputs' own fields; a field with different kinds in different outputs gets the loosest schema */
  function outFields(table) {
    const seen = {};
    const add = (k, kd) => { if (['id', 'kind', 'of'].includes(k)) return; (seen[k] = seen[k] || []).push(kd); };
    for (const [k, kd] of Object.entries(table.fields || {})) add(k, kd);
    for (const c of outCases(table.outputs)) for (const per of Object.values(c || {})) if (isObj(per)) for (const t of Object.values(per)) if (isObj(t)) for (const [k, kd] of Object.entries(t)) add(k, kd);
    const out = {};
    for (const [k, kds] of Object.entries(seen)) {
      const flat = [...new Set(kds.map(x => (typeof x === 'string' ? x.replace(/!$/, '') : JSON.stringify(x))))];
      if (flat.length === 1) { out[k] = shape(typeof kds[0] === 'string' ? flat[0] : kds[0], T(k)); continue; }
      const strs = flat.filter(x => !x.startsWith('{'));
      if (strs.length === flat.length && strs.every(x => x.startsWith('enum:'))) { out[k] = { title: T(k), enum: [...new Set(strs.flatMap(x => x.slice(5).split('|')))] }; continue; }
      const textual = x => /^(enum:|id$|ref$|name$|expr$|key$|raw$)/.test(x) || !/^(pos|nonneg|unit|fin|bool|int:|numx|any)/.test(x);
      if (strs.length === flat.length && strs.every(textual)) out[k] = { title: T(k), type: 'string', minLength: 1 };
      else if (strs.length === flat.length && strs.every(x => x !== 'bool' && x !== 'any')) out[k] = ref('numOrExpr', T(k));
      else out[k] = { title: T(k) };
    }
    return out;
  }
  function toSchema(table) {
    const tb = table || {};
    const model = isObj(tb.model) && tb.model.$by ? by(tb.model) : obj(tb.model || {});
    const output = { type: 'object', required: ['id', 'kind', 'of'], properties: Object.assign({
      id: ref('name', 'id'), kind: { title: 'outKind', enum: outKinds(tb) }, of: { title: T('of'), type: 'string', minLength: 1, 'x-noema': 'of' },
    }, outFields(tb)) };
    return { model, output };
  }
  /** what an output of `kind` may name for this model (suggestions, in the engine's order) */
  function ofs(table, model, kind) {
    const tb = table || {};
    if (typeof tb.offered === 'function') { try { const o = tb.offered(isObj(model) ? model : {}); if (o && Array.isArray(o[kind])) return o[kind].slice(); } catch (e) { /* a model half typed */ } }
    const o = tb.outputs;
    const pick = c => { const l = c && c[kind]; return Array.isArray(l) ? l.slice() : isObj(l) ? Object.keys(l) : []; };
    if (isObj(o) && o.$by) {
      const m = isObj(model) ? model[o.$by] : undefined;
      if (typeof m === 'string' && o.$cases && o.$cases[m]) return pick(o.$cases[m]);
      return [...new Set(Object.values(o.$cases || {}).flatMap(pick))];
    }
    return pick(o);
  }

  /* ---------- a whole sim-spec@1 schema for one library engine ---------- */
  const STYLES = ['line', 'bars', 'steps', 'points'];
  const slug = id => String(id).replace(/@.*$/, '').replace(/[^a-z0-9-]/gi, '');
  const schemaId = id => SIM_BASE + 'lib.' + slug(id) + '.json';
  /** specSchema(id, table, sim) → sim-spec@1 as this engine takes it: engine fixed, model and outputs from its table, plots with
      scene and sound and line styles (docs/INTERACTIVE_LIBRARY.md §1.4), no bench */
  function specSchema(id, table, sim) {
    const s = JSON.parse(JSON.stringify(sim)), conv = toSchema(table);
    s.$id = schemaId(id);
    s.title = 'spec';
    delete s.if; delete s.then; delete s.else;
    s.required = [...new Set((s.required || []).concat(['engine', 'model', 'outputs']))];
    s.properties.engine = { title: 'engine', const: id };
    s.properties.model = Object.assign({ title: 'model' }, conv.model);
    s.properties.outputs = { title: 'outputs', type: 'array', maxItems: 24, items: ref('libOutput') };
    delete s.properties.bench;
    s.$defs.libId = { type: 'string', pattern: C ? C.ID_RE.source : '^[A-Za-z][A-Za-z0-9_-]{0,31}$', 'x-noema': 'ref' };
    s.$defs.libName = { type: 'string', pattern: C ? C.NAME_RE.source : '^[A-Za-z_][A-Za-z0-9_]{0,31}$', not: { enum: C ? C.RESERVED.slice() : ['t', 'n', 'pi', 'e', 'true', 'false'] }, 'x-noema': 'name' };
    s.$defs.libOutput = conv.output;
    // plots: the formula and series plots (each line may have a style), a scene, a sound
    const p0 = s.$defs.plot, line = br => { const b = JSON.parse(JSON.stringify(br)); const it = b.properties.series.items; it.properties.style = { title: 'lineStyle', enum: STYLES.slice() }; b.required = ['x', 'series']; return b; };
    s.$defs.libPlot = {
      type: 'object', required: ['kind'],
      properties: { kind: { title: 'plotKind', enum: ['function', 'series', 'scene', 'sound'] }, title: ref('key', 'title') },
      oneOf: [line(p0.oneOf[0]), line(p0.oneOf[1]),
        { title: 'plotKind.scene', required: ['of'], properties: { kind: { const: 'scene' }, of: { title: T('plotOf'), type: 'string', minLength: 1, 'x-noema': 'scene' }, height: { title: T('height'), type: 'integer', minimum: 120, maximum: 900 } } },
        { title: 'plotKind.sound', required: ['of'], properties: { kind: { const: 'sound' }, of: { title: T('plotOf'), type: 'string', minLength: 1, 'x-noema': 'sound' }, height: { title: T('height'), type: 'integer', minimum: 120, maximum: 900 } } }],
    };
    s.properties.plots = Object.assign({}, s.properties.plots, { items: ref('libPlot') });
    return s;
  }
  /** every title of a schema (the labels it needs: engine.author.f.<title>) */
  function titles(s, out) {
    out = out || new Set();
    if (Array.isArray(s)) s.forEach(x => titles(x, out));
    else if (isObj(s)) { if (typeof s.title === 'string') out.add(s.title); for (const v of Object.values(s)) titles(v, out); }
    return out;
  }

  root.NoemaLibSchema = Object.freeze({ toSchema, specSchema, ofs, outKinds, schemaId, titles, kindSchema, STYLES: Object.freeze(STYLES.slice()) });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NoemaLibSchema;
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
