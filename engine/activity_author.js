/* noema-lite — NoemaActivityAuthor: build an interactive activity with a form generated from the JSON Schemas
   (docs/activities-dev/authoring_ui.md; ADR 001 D12 "an authoring UI generated from the same JSON Schemas as the validators").
   • Types: sim-spec@1 with formula@1 or circuit-mna@1 (registerType() for later runtimes: html-app@1, py-module@1, h5p@1), and with
     EVERY engine of the library whose module exports its `table` (docs/INTERACTIVE_LIBRARY.md §1.5): its form comes from that table
     (NoemaCore.engines.schema().specSchema, src/engines/kernel/schema.js; the page loads the library's engines and that kernel before the author: loadAuthor in engine/src/40_views.js); the picker groups the engines as #/engines does and offers the engine's
     reference activity (NoemaActivityRefs, written into activity_author_schemas.js by tools/build.py) or a blank one.
   • The forms: NoemaSchemaForm over src/contracts/schemas/noema.activities.v1 (the registry entry) and noema.sim-spec.v1 (+ noema.circuit.v1);
     the words of each label key in every language right under the key, and a table of all words (en, el, ru, de, fr, + any language).
   • Checks at the field: the schema, then the validators' own rules (NoemaPackCheck.checkSimSpec, checkActivities) — the same
     messages as activity_lint.py / make_pack.py / the connector; every formula through the expression language (NoemaCore.engines.expr.check) with the declared names.
   • The preview: the app's real sim-spec@1 runtime (ACT.mount), debounced, beside the form (stacked below 960 px).
   • Files: the activity folder (activities/activities.json, activities/<id>/spec.json, strings.<locale>.json) as a .zip or one by
     one; import of the same (a .zip or the JSON files). No server. Undo / redo (buttons, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y).
   Mount in the app: NoemaActivityAuthor.view(mainElement) (the route #/author, wired by the integrator). The core (doc, check,
   files, zip / unzip, fromFiles) has no DOM and runs in Node (tests/activity_author.js). */
(function (root) {
  'use strict';
  /* i18n-ignore-start */   // code words; every visible word goes through T() (the app's catalogs: engine.author.* in i18n/engine/)
  const SIM_ID = 'https://noema-lite.netlify.app/schemas/noema.sim-spec.v1.schema.json';
  const REG_ID = 'https://noema-lite.netlify.app/schemas/noema.activities.v1.schema.json';
  const SF = () => root.NoemaSchemaForm || (typeof require === 'function' ? require('./schemaform.js') : null);
  const PC = () => root.NoemaPackCheck || null;
  const ENG = () => root.NoemaCore?.engines || null;   // the engine library (src/engines): the catalogue, the loaded engines, the schema kernel
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const KEY_RE = /^[a-z][a-zA-Z0-9_.-]{0,63}$/, LOC_RE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/;
  const DEFAULT_LOCALES = ['en', 'el', 'ru', 'de', 'fr'];

  /* ---------- words ---------- */
  const uiLoc = () => (root.NoemaI18n && root.NoemaI18n.locale) || 'en';
  /** a word of the author: the app's catalogs (i18n/engine/<locale>.arb, keys engine.author.<key>) through NoemaI18n, as every
      engine text; null when the key is not there (a label then falls back to the field's own name) */
  function T(k, vars) {
    const full = 'engine.author.' + k, I = root.NoemaI18n;
    return I && I.has && I.has(full) ? I.t(full, vars) : null;
  }
  const TT = (k, vars) => { const r = T(k, vars); return r == null ? k : r; };
  const label = (title, prop, fallback) => (title && title.startsWith('eng.') ? engLabel(title.slice(4)) : null) || (title && T('f.' + title)) || (title && title.startsWith('lib.') ? fallback || title.slice(4) : null) || (prop && T('p.' + prop)) || fallback || prop || title || '';
  const help = (title) => (title && T('h.' + title)) || '';

  /* ---------- the document: {item, spec, strings} ---------- */
  function item(id, spec) {
    return { id, runtime: 'sim-spec@1', entry: `activities/${id}/spec.json`, stateVersion: 1, capabilities: ['state', 'events'],
      fallback: { media: `${id}-still`, text: '' }, origin: 'own', credit: '', license: 'own' };
  }
  const tables = (keys) => Object.fromEntries(DEFAULT_LOCALES.map(l => [l, Object.fromEntries(keys.map(k => [k, k]))]));
  const TYPES = [];
  /** a kind of activity: { id, label (a key), runtime, schema ($id of the spec's schema), match(doc), blank() → doc, convert?(doc) → doc } */
  function registerType(def) { const i = TYPES.findIndex(t => t.id === def.id); if (i >= 0) TYPES[i] = def; else TYPES.push(def); }
  registerType({ id: 'sim-formula', label: 'type.formula', runtime: 'sim-spec@1', schema: SIM_ID,
    match: d => d.item.runtime === 'sim-spec@1' && (d.spec.engine || 'formula@1') === 'formula@1' && !('parts' in d.spec),
    blank: () => ({ item: item('my-activity'), spec: { format: 'noema.sim-spec/v1', engine: 'formula@1', params: [{ id: 'x', kind: 'slider', label: 'x', min: 0, max: 1, default: 0.5 }] }, strings: tables(['x']) }),
    convert(d) { const s = d.spec; s.engine = 'formula@1'; delete s.model; delete s.outputs; delete s.bench; if (Array.isArray(s.plots)) s.plots = s.plots.filter(p => p.kind !== 'series'); if (s.plots && !s.plots.length) delete s.plots; return d; } });
  const CIRCUIT_MODEL = () => ({ netlist: { format: 'noema.circuit/v1', nodes: ['in', 'out'], elements: [
    { id: 'V1', type: 'V', n: ['in', 'gnd'], value: 5 }, { id: 'R1', type: 'R', n: ['in', 'out'], value: 1000 }, { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6 }] },
    bindings: [{ element: 'V1', expr: 'Vs' }], transient: { tEnd: 0.01 } });
  registerType({ id: 'sim-circuit', label: 'type.circuit', runtime: 'sim-spec@1', schema: SIM_ID,
    match: d => d.item.runtime === 'sim-spec@1' && d.spec.engine === 'circuit-mna@1',
    blank: () => ({ item: item('my-circuit'), spec: { format: 'noema.sim-spec/v1', engine: 'circuit-mna@1',
      params: [{ id: 'Vs', kind: 'slider', label: 'vs', min: 0, max: 10, default: 5, unit: 'V' }], model: CIRCUIT_MODEL(),
      outputs: [{ id: 't', kind: 'series', time: true }, { id: 'vout', kind: 'series', node: 'out' }],
      plots: [{ kind: 'series', x: { series: 't', label: 'time', unit: 's' }, series: [{ y: 'vout', label: 'vout' }] }] }, strings: tables(['vs', 'time', 'vout']) }),
    convert(d) { const s = d.spec; s.engine = 'circuit-mna@1'; if (!isObj(s.model)) s.model = CIRCUIT_MODEL(); return d; } });

  /* ---------- the engine library: a kind for every engine whose module exports its table (docs/INTERACTIVE_LIBRARY.md §1.5) ---------- */
  const LS = () => ENG()?.schema() || null;
  const GROUPS = [['math', ['formula@1', 'ode@1', 'prob@1', 'graph@1', 'geom@1']], ['life', ['genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1']],
    ['arts', ['timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1']]];   // = ENGINE_GROUPS of 49_lib_view.js (the #/engines page), used when that file is not loaded
  /* global ENGINE_GROUPS */
  const groups = () => (typeof ENGINE_GROUPS !== 'undefined' && Array.isArray(ENGINE_GROUPS) ? ENGINE_GROUPS : GROUPS);
  /** the library engines here: catalogue entries whose module is loaded with its checker and table (and, in the app, runnable) */
  function libEngines() {
    const L = ENG(), out = [];
    if (!L || !LS()) return out;
    for (const e of L.catalog.CATALOG) {
      const M = e.layer === 'library' && e.plugin ? L.loaded(e.id) : null;
      if (!M || typeof M.checkSpec !== 'function' || !isObj(M.table)) continue;
      if (typeof ACT !== 'undefined' && ACT && typeof ACT.engine === 'function' && !ACT.engine(e.id)) continue;   // eslint-disable-line no-undef
      out.push({ id: e.id, slug: e.slug, M });
    }
    return out;
  }
  const libOf = id => libEngines().find(e => e.id === id) || null;
  const engWord = (slug, k) => { const I = root.NoemaI18n, key = 'engine.engines.' + slug + '.' + k; return I && I.has && I.has(key) ? I.t(key) : null; };
  /** a part's engine in a select: its catalogue name and id */
  function engLabel(id) {
    const K = ENG()?.catalog, e = K ? K.byId(id) : null;
    const n = e && e.slug ? engWord(e.slug, 'name') : id === 'circuit-mna@1' ? engWord('circuit', 'name') : null;
    return n ? `${n} (${id})` : id;
  }
  /** the reference activities this page can start from: {id: {item, spec, strings}} (tools/activities_examples/, shipped by tools/build.py) */
  const partsRefs = () => Object.entries(root.NoemaActivityRefs || {}).filter(([, r]) => isObj(r) && isObj(r.spec) && Array.isArray(r.spec.parts)).map(([k, r]) => Object.assign({ ref: k }, r));
  const refsFor = id => Object.entries(root.NoemaActivityRefs || {}).filter(([, r]) => isObj(r) && isObj(r.spec) && r.spec.engine === id).map(([k, r]) => Object.assign({ ref: k }, r));
  function fromRef(r) {
    const it = clone(r.item); if (!it.entry && it.id) it.entry = `activities/${it.id}/spec.json`;
    return { item: it, spec: clone(r.spec), strings: clone(r.strings || {}) };
  }
  function libBlank(id, reg) {
    const sch = (reg || REG || registry()).get(LS().schemaId(id));
    const model = sch ? SF().skeleton(reg || REG, sch.properties.model, sch.$id) : {};
    return { item: item('my-' + id.replace(/@.*$/, '')), spec: { format: 'noema.sim-spec/v1', engine: id, params: [{ id: 'x', kind: 'slider', label: 'x', min: 0, max: 1, default: 0.5 }], model: isObj(model) ? model : {}, outputs: [] }, strings: tables(['x']) };
  }
  /* ---------- parts: several engines in one spec (docs/INTERACTIVE.md §12.8), each with the form of its engine ---------- */
  const PARTS_ID = () => (LS() && LS().PARTS_ID) || '';
  const hasParts = d => isObj(d) && isObj(d.spec) && Array.isArray(d.spec.parts);
  const partOf = (spec, path) => (path[0] === 'parts' && typeof path[1] === 'number' && Array.isArray(spec.parts) && isObj(spec.parts[path[1]]) ? spec.parts[path[1]] : null);
  /** the spec one part shows its engine (packcheck partSpec): its model and outputs, the consts and params, its inputs as names */
  function partSub(spec, p) {
    const consts = Object.assign({}, isObj(spec.consts) ? spec.consts : {});
    for (const k of Object.keys(isObj(p.inputs) ? p.inputs : {})) if (!(k in consts)) consts[k] = 1;
    return { format: spec.format, engine: p.engine, consts, params: Array.isArray(spec.params) ? spec.params : [], model: p.model, outputs: Array.isArray(p.outputs) ? p.outputs : [] };
  }
  /** every output of the spec: its own and its parts' */
  const allOutputs = spec => (Array.isArray(spec.outputs) ? spec.outputs : []).concat(...(Array.isArray(spec.parts) ? spec.parts : []).map(p => (isObj(p) && Array.isArray(p.outputs) ? p.outputs : []))).filter(isObj);
  function partsBlank() {
    const e = libEngines()[0], sch = e && REG ? REG.get(LS().schemaId(e.id)) : null;
    const model = sch ? SF().skeleton(REG, sch.properties.model, sch.$id) : {};
    return { item: item('my-parts'), spec: { format: 'noema.sim-spec/v1', params: [{ id: 'x', kind: 'slider', label: 'x', min: 0, max: 1, default: 0.5 }],
      parts: [{ id: 'a', engine: e ? e.id : 'ode@1', model: isObj(model) ? model : {}, outputs: [] }] }, strings: tables(['x']) };
  }
  function registerParts() {
    registerType({ id: 'sim-parts', label: 'type.parts', parts: true, runtime: 'sim-spec@1', schema: PARTS_ID(), match: d => d.item.runtime === 'sim-spec@1' && hasParts(d), blank: partsBlank });
  }
  function registerLib() {
    for (const e of libEngines()) registerType({ id: 'lib:' + e.id, engine: e.id, slug: e.slug, lib: true, runtime: 'sim-spec@1', schema: LS().schemaId(e.id),
      match: d => d.item.runtime === 'sim-spec@1' && d.spec.engine === e.id, blank: () => libBlank(e.id) });
  }
  const typeOf = d => TYPES.find(t => t.match(d)) || TYPES[0];
  /** the schema of a spec: its engine's own (a library engine) or sim-spec */
  const specSchemaId = (spec, reg) => {
    if (isObj(spec) && Array.isArray(spec.parts) && PARTS_ID() && (reg || REG) && (reg || REG).get(PARTS_ID())) return PARTS_ID();
    const t = isObj(spec) && TYPES.find(x => x.lib && x.engine === spec.engine); return t && (reg || REG) && (reg || REG).get(t.schema) ? t.schema : SIM_ID;
  };

  /* ---------- names a formula may use at a path of the spec (the validators' order rules) ---------- */
  function namesAt(spec, path) {
    const ids = k => (Array.isArray(spec[k]) ? spec[k] : []).filter(x => isObj(x) && typeof x.id === 'string' && x.id).map(x => x.id);
    const base = [...(isObj(spec.consts) ? Object.keys(spec.consts) : []), ...ids('params')];
    const der = ids('derived'), scal = allOutputs(spec).filter(o => o.kind === 'scalar' && typeof o.id === 'string').map(o => o.id);
    const pt = partOf(spec, path);
    if (pt && path[2] === 'model') return base.concat(Object.keys(isObj(pt.inputs) ? pt.inputs : {}));
    if (pt && path[2] === 'inputs') return base.concat(der, scal.filter(o => !(Array.isArray(pt.outputs) && pt.outputs.some(x => isObj(x) && x.id === o))));
    if (path[0] === 'derived') return base.concat(der.slice(0, typeof path[1] === 'number' ? path[1] : der.length));
    if (path[0] === 'model' || path[0] === 'bench') return base.concat(der);
    const all = base.concat(der, scal);
    if (path[0] === 'plots' && path[2] === 'series') { const p = spec.plots?.[path[1]]; if (p && p.kind === 'function' && typeof p.x?.var === 'string' && p.x.var) return all.concat(p.x.var); }
    return all;
  }

  /* ---------- checks: the schema at the field, then the validators' rules ---------- */
  let REG = null;
  function registry(schemas) {
    const list = schemas ? (Array.isArray(schemas) ? schemas : Object.values(schemas)) : Object.values(root.NoemaActivitySchemas || {});
    REG = SF().registry(list);
    const sim = list.find(x => isObj(x) && x.$id === SIM_ID);
    if (sim && LS()) {
      for (const e of libEngines()) REG.add(LS().specSchema(e.id, e.M.table, sim));
      registerLib();
      if (LS().partsSchema) { REG.add(LS().partsSchema(libEngines().map(e => ({ id: e.id, table: e.M.table })), sim)); registerParts(); }
    }
    return REG;
  }
  /** the registry entry's schema as the page offers it: the runtimes of the registered types only (the schema itself names every runtime) */
  const itemSchema = reg => { const it = reg.get(REG_ID).$defs.item, rts = [...new Set(TYPES.map(t => t.runtime))];
    return Object.assign({}, it, { properties: Object.assign({}, it.properties, { runtime: Object.assign({}, it.properties.runtime, { enum: it.properties.runtime.enum.filter(r => rts.includes(r)) }) }) }); };
  const under = (p, q) => q.length <= p.length && q.every((x, i) => p[i] === x);
  /** → [{tab: 'item' | 'spec' | 'strings', path, msg, key?}] — every problem of the document */
  function check(doc, reg = REG || registry()) {
    const S = SF(), out = [], P = PC();
    const sch = (tab, schema, v, base) => S.validate(reg, schema, v, base).map(e => ({ tab, path: e.path, msg: TT('v.' + e.kw, e.p || {}), kw: e.kw }));
    // the spec: the validators' own messages first (the same as activity_lint.py), the schema's where they say nothing
    const vs = [];
    if (P) for (const m of P.checkSimSpec(doc.spec, doc.strings)) {
      const miss = /the string (\S+) is missing in/.exec(m);
      if (miss) { out.push({ tab: 'strings', path: [], key: miss[1], msg: m }); continue; }
      const path = S.parsePath(m, 'spec') || [];
      vs.push({ tab: 'spec', path, msg: m.replace(/^spec(?:\.[\w$-]+|\[\d+\])*:?\s*/, '') || m });
    }
    const sid = specSchemaId(doc.spec, reg);
    for (const e of sch('spec', reg.get(sid), doc.spec, sid)) if (!vs.some(v => under(e.path, v.path) && v.path.length)) vs.push(e);
    out.push(...vs);
    // the registry entry
    const it = sch('item', itemSchema(reg), doc.item, REG_ID);
    const exp = `activities/${doc.item.id}/spec.json`;
    if (doc.item.runtime === 'sim-spec@1' && doc.item.entry !== exp && !it.some(e => e.path[0] === 'entry')) it.push({ tab: 'item', path: ['entry'], msg: exp });
    if (P && P.checkActivities) {
      const locs = Object.keys(doc.strings || {}), own = locs.includes('en') ? 'en' : locs[0] || 'en';
      const media = {}; if (isObj(doc.item.fallback) && typeof doc.item.fallback.media === 'string' && doc.item.fallback.media) media[doc.item.fallback.media] = { w: 1, h: 1 };
      const a = Object.assign({}, doc.item, { spec: doc.spec, strings: doc.strings }); delete a.entry;
      const pk = { subject: { language: own }, media, chapters: [], translations: Object.fromEntries(locs.filter(l => l !== own).map(l => [l, { file: true }])), activities: { format: 'noema.activities/v1', items: [a] } };
      pk.requires = P.needRequires([a]);
      for (const m0 of P.checkActivities(pk, locs.filter(l => l !== own)).errors) {
        const m = m0.replace(/^activity (?:\S+|"[^"]*")(?::)? ?/, '');
        if (/^spec\b/.test(m)) continue;   // (above, at the field)
        if (/^strings\b/.test(m)) { out.push({ tab: 'strings', path: [], msg: m }); continue; }
        const f = /^(fallback\.text|fallback\.media|stateVersion|capabilities|id|runtime|origin|credit|license)\b/.exec(m) || (/\bid must\b/.test(m) ? [0, 'id'] : null);
        const path = f ? f[1].split('.') : [];
        if (!it.some(e => e.path.join('.') === path.join('.'))) it.push({ tab: 'item', path, msg: m });
      }
    }
    out.push(...it);
    // the word tables: the same keys everywhere, texts not empty
    for (const [loc, tab] of Object.entries(doc.strings || {})) {
      if (!LOC_RE.test(loc)) out.push({ tab: 'strings', path: [], msg: TT('localeBad') + ': ' + loc });
      for (const [k, v] of Object.entries(tab || {})) if (typeof v !== 'string' || !v.trim()) out.push({ tab: 'strings', path: [], key: k, loc, msg: TT('missingText') + ': ' + k + ' (' + loc + ')' });
    }
    return out;
  }
  /** the keys of the string tables that the spec names (labels, titles), in order */
  function usedKeys(spec, reg = REG || registry()) {
    const out = [];
    const sid = specSchemaId(spec, reg);
    SF().walk(reg, reg.get(sid), spec, (path, s, v) => { if (s && s['x-noema'] === 'key' && typeof v === 'string' && v && !out.includes(v)) out.push(v); });
    return out;
  }

  /* ---------- files of the activity folder ---------- */
  const pretty = v => JSON.stringify(v, null, 1) + '\n';
  function files(doc) {
    const id = doc.item.id, out = {};
    out['activities/activities.json'] = pretty({ format: 'noema.activities/v1', items: [doc.item] });
    out[`activities/${id}/spec.json`] = pretty(doc.spec);
    for (const loc of Object.keys(doc.strings || {}).sort()) out[`activities/${id}/strings.${loc}.json`] = pretty(doc.strings[loc]);
    return out;
  }
  /** files {name: text} (from a folder, a zip, single JSON files) → a document (missing parts from `base`) */
  function fromFiles(fs, base) {
    const d = base ? clone(base) : null, got = { item: null, spec: null, strings: {} };
    for (const [name, text] of Object.entries(fs)) {
      const b = name.split('/').pop();
      let j; try { j = JSON.parse(text); } catch (e) { continue; }
      if (b === 'activities.json' && isObj(j) && Array.isArray(j.items)) got.item = j.items.find(x => x && x.runtime === 'sim-spec@1') || j.items[0] || null;
      else if (b === 'activity.json' && isObj(j)) got.item = j;
      else if (b === 'spec.json' && isObj(j)) got.spec = j;
      else { const m = /^strings\.([A-Za-z0-9-]+)\.json$/.exec(b); if (m && isObj(j)) got.strings[m[1]] = j; }
    }
    const out = d || TYPES[0].blank();
    if (got.item) { out.item = got.item; if (!out.item.entry && out.item.id) out.item.entry = `activities/${out.item.id}/spec.json`; }
    if (got.spec) out.spec = got.spec;
    if (Object.keys(got.strings).length) out.strings = got.strings;
    return out;
  }
  /* zip: stored entries (no compression); reading also takes deflated ones (DecompressionStream) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  function zip(fs) {
    const parts = [], central = []; let off = 0;
    const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const [name, text] of Object.entries(fs)) {
      const nb = enc(name), data = enc(text), c = crc32(data);
      const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
      parts.push(new Uint8Array(head), nb, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
      off += head.length + nb.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0), n = Object.keys(fs).length;
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(csize), ...u32(off), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
    return out;
  }
  async function unzip(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = {};
    let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip file');
    let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory');
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = b.subarray(ds, ds + csz);
      if (name.endsWith('/')) continue;
      if (method === 0) out[name] = dec(raw);
      else if (method === 8 && typeof DecompressionStream === 'function') out[name] = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      else throw new Error('unsupported zip compression in ' + name);
    }
    return out;
  }

  /* ---------- the preview in the app: the real sim-spec@1 runtime (32_activities.js ACT.mount) ---------- */
  const PREVIEW_ID = 'author-preview';
  function actPreview() {
    if (typeof ACT === 'undefined' || !ACT || typeof ACT.mount !== 'function') return null;   // eslint-disable-line no-undef
    const key = 'blk:author:' + PREVIEW_ID;
    const forget = () => { try { if (typeof S !== 'undefined' && S.act?.[key]) NoemaCore.learning.record({ type: 'activity.saved', subject: Noema.subject.id, item: key, data: { v: 1, state: null } }); } catch (e) { } };   // eslint-disable-line no-undef
    return {
      show(box, it, spec, strings, locale) {
        forget();   // a preview always starts from the spec's defaults (never from a saved state)
        ACT.ITEMS[PREVIEW_ID] = Object.assign({}, it, { id: PREVIEW_ID, spec: clone(spec), strings: { [locale]: strings[locale] || {} } });   // eslint-disable-line no-undef
        const sess = ACT.mount(box, PREVIEW_ID, { place: 'author', start: true });   // eslint-disable-line no-undef
        return { destroy() { try { sess.destroy(); } catch (e) { } forget(); delete ACT.ITEMS[PREVIEW_ID]; } };   // eslint-disable-line no-undef
      },
    };
  }
  /* i18n-ignore-end */

  /* =====================================================================================================================
     The page. mount(el, { preview?, schemas?, value? }) → { get(), set(doc), undo(), redo(), files(), check(), destroy() }
     ===================================================================================================================== */
  function mount(host, opts = {}) {
    const reg = registry(opts.schemas), S = SF();
    const preview = opts.preview === undefined ? actPreview() : opts.preview;
    let doc = opts.value ? clone(opts.value) : TYPES[0].blank();
    let hist = [JSON.stringify(doc)], hi = 0, commitT = null, checkT = null, prevT = null, live = null, lastGood = null, tab = 'spec', probs = [];
    let prevLoc = null;
    /* i18n-ignore-start */
    const h = (tag, attrs, ...kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
      }
      for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
      return e;
    };
    const PATHS = { undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', file: 'M14 3H6v18h12V7zM14 3v4h4', down: 'M12 4v12M6 11l6 6 6-6M5 20h14', up: 'M12 20V8M6 13l6-6 6 6M5 4h14', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', warn: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', ok: 'M5 12l5 5 9-10' };
    const icon = k => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'aa-ico'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', PATHS[k]); s.append(p); return s; };
    const btn = (ic, text, onclick, cls = 'btn small ghost', attrs = {}) => h('button', Object.assign({ type: 'button', class: cls + ' aa-btn', onclick, title: attrs.title || text, 'aria-label': ic ? text : null }, attrs), ic ? icon(ic) : null, h('span', { class: 'aa-bt' }, text));
    const info = (text, attrs = {}) => h('span', Object.assign({ class: 'aa-info', tabindex: '0', role: 'img', title: text, 'aria-label': text }, attrs), 'ⓘ');
    /* i18n-ignore-end */

    const rootEl = h('div', { class: 'aa', 'data-author': '1' });
    const typeSel = h('select', { class: 'sf-in aa-type', id: 'aa-type', 'data-aa': 'type' });
    const typeName = t => (t.lib ? engWord(t.slug, 'name') || t.engine : TT(t.label));
    const typeWhat = t => (t.lib ? engWord(t.slug, 'what') : t.parts ? TT('type.partsWhat') : null) || (t.id === 'sim-formula' ? engWord('formula', 'what') : t.id === 'sim-circuit' ? engWord('circuit', 'what') : null) || typeName(t);
    /** the picker: the engines grouped as on #/engines (only those this app has), the circuit bench with the plugins */
    function paintTypes() {
      typeSel.innerHTML = '';
      const opt = t => h('option', { value: t.id, text: typeName(t), title: typeWhat(t) });
      const byEngine = id => TYPES.find(t => (t.lib ? t.engine : t.id === 'sim-formula' ? 'formula@1' : t.id === 'sim-circuit' ? 'circuit-mna@1' : null) === id);
      const used = new Set();
      for (const [g, ids] of groups()) {
        const ts = ids.map(byEngine).filter(Boolean); if (!ts.length) continue;
        const og = h('optgroup', { label: engGroup(g) }); for (const t of ts) { og.append(opt(t)); used.add(t.id); } typeSel.append(og);
      }
      const pt = TYPES.find(t => t.parts); if (pt) { const og = h('optgroup', { label: TT('typeGroupParts') }); og.append(opt(pt)); typeSel.append(og); used.add(pt.id); }   // several engines in one spec
      const rest = TYPES.filter(t => !used.has(t.id));
      if (rest.length) { const og = h('optgroup', { label: (root.NoemaI18n && root.NoemaI18n.has && root.NoemaI18n.has('engine.engines.plugins') ? root.NoemaI18n.t('engine.engines.plugins') : TT('type')) }); for (const t of rest) og.append(opt(t)); typeSel.append(og); }
    }
    const engGroup = g => { const I = root.NoemaI18n, k = 'engine.engines.group.' + g; return I && I.has && I.has(k) ? I.t(k) : g; };
    paintTypes();
    const typeInfo = info('', { 'data-aa': 'type-info' });
    const paintTypeInfo = () => { const t = typeById(typeSel.value), w = typeWhat(t); typeInfo.title = w; typeInfo.setAttribute('aria-label', w); };
    const undoB = btn('undo', TT('undo'), () => undo(), 'btn small ghost', { 'data-aa': 'undo', 'aria-keyshortcuts': 'Control+Z' });
    const redoB = btn('redo', TT('redo'), () => redo(), 'btn small ghost', { 'data-aa': 'redo', 'aria-keyshortcuts': 'Control+Shift+Z' });
    const fileIn = h('input', { type: 'file', multiple: true, accept: '.zip,.json,application/zip,application/json', class: 'aa-file', 'data-aa': 'import-input', tabindex: '-1', 'aria-hidden': 'true' });
    const note = h('p', { class: 'aa-note', role: 'status', 'aria-live': 'polite' });
    const filesBox = h('div', { class: 'aa-files', hidden: true });
    const filesB = btn('file', TT('exportFiles'), () => { filesBox.hidden = !filesBox.hidden; filesB.setAttribute('aria-expanded', String(!filesBox.hidden)); if (!filesBox.hidden) paintFiles(); }, 'btn small ghost', { 'aria-expanded': 'false', 'data-aa': 'files' });
    // a library engine picked: start from its reference activity, or blank (the document changes only on a click)
    const startBar = h('div', { class: 'aa-start', hidden: true, role: 'group', 'aria-labelledby': 'aa-startq' });
    function offerStart(t) {
      const refs = t.parts ? partsRefs() : refsFor(t.engine), r = refs[0];
      startBar.innerHTML = '';
      const go = d => { startBar.hidden = true; load(d, true); };
      startBar.append(h('span', { class: 'aa-startq', id: 'aa-startq' }, TT('startQ', { engine: typeName(t) })),
        h('span', { class: 'aa-row aa-startb' },
          r ? btn(null, TT('startRef'), () => go(fromRef(r)), 'btn small primary', { 'data-aa': 'start-ref', title: TT('startRefTip', { id: r.ref }) }) : null,
          btn(null, TT('startBlank'), () => go(t.blank()), r ? 'btn small ghost' : 'btn small primary', { 'data-aa': 'start-blank', title: TT('startBlankTip') }),
          btn('x', TT('close'), () => { startBar.hidden = true; typeSel.value = typeOf(doc).id; paintTypeInfo(); }, 'btn small ghost aa-ic', { 'data-aa': 'start-cancel' })));
      startBar.hidden = false;
    }
    const top = h('header', { class: 'aa-top' },
      h('div', { class: 'aa-head' }, h('h1', { class: 'aa-h1' }, TT('title')), info(TT('intro'), { 'aria-describedby': 'aa-intro' }), h('p', { class: 'aa-intro aa-vh', id: 'aa-intro' }, TT('intro'))),
      h('div', { class: 'aa-bar' },
        h('label', { class: 'aa-tl', for: 'aa-type' }, TT('type')), typeSel, typeInfo,
        h('span', { class: 'aa-sp' }),
        btn('plus', TT('new'), () => { if (confirmNew()) load(typeById(typeSel.value).blank(), true); }, 'btn small ghost', { 'data-aa': 'new' }),
        undoB, redoB,
        btn('up', TT('import'), () => fileIn.click(), 'btn small ghost', { 'data-aa': 'import' }), fileIn,
        btn('down', TT('exportZip'), () => download(doc.item.id + '.zip', new Blob([zip(files(doc))], { type: 'application/zip' })), 'btn small primary', { 'data-aa': 'zip' }),
        filesB),
      startBar, filesBox, note);
    const typeById = id => TYPES.find(t => t.id === id) || TYPES[0];
    const confirmNew = () => typeof opts.confirm === 'function' ? opts.confirm(TT('newConfirm')) : (typeof confirm === 'function' ? confirm(TT('newConfirm')) : true);

    // tabs
    const tabs = [['item', 'tab.item'], ['spec', 'tab.spec'], ['strings', 'tab.strings']];
    const tabBtns = {}, panels = {};
    const tablist = h('div', { class: 'aa-tabs', role: 'tablist' });
    for (const [k, lab] of tabs) {
      tabBtns[k] = h('button', { type: 'button', role: 'tab', id: 'aa-tab-' + k, 'aria-controls': 'aa-panel-' + k, class: 'aa-tab', 'data-tab': k, onclick: () => showTab(k) }, h('span', {}, TT(lab)), h('span', { class: 'aa-badge', hidden: true }));
      tablist.append(tabBtns[k]);
      panels[k] = h('section', { class: 'aa-panel', role: 'tabpanel', id: 'aa-panel-' + k, 'aria-labelledby': 'aa-tab-' + k });
    }
    tablist.addEventListener('keydown', e => {
      const i = tabs.findIndex(([k]) => k === tab), n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return; e.preventDefault(); const k = tabs[(i + n + tabs.length) % tabs.length][0]; showTab(k); tabBtns[k].focus();
    });
    function showTab(k) { tab = k; for (const [x] of tabs) { const on = x === k; tabBtns[x].setAttribute('aria-selected', String(on)); tabBtns[x].tabIndex = on ? 0 : -1; panels[x].hidden = !on; } }

    const probBox = h('div', { class: 'aa-probs', 'aria-live': 'polite' });
    const edit = h('div', { class: 'aa-edit' }, probBox, tablist, ...Object.values(panels));
    const prevBox = h('div', { class: 'aa-pbox' });
    const prevNote = h('p', { class: 'aa-pnote', role: 'status' });
    const locSel = h('select', { class: 'sf-in aa-ploc', id: 'aa-ploc', 'data-aa': 'preview-locale' });
    const side = h('aside', { class: 'aa-prev', 'aria-labelledby': 'aa-ph' },
      h('div', { class: 'aa-phead' }, h('h2', { class: 'aa-h2', id: 'aa-ph' }, TT('preview')), h('label', { class: 'aa-tl', for: 'aa-ploc' }, TT('previewLang')), locSel),
      prevNote, prevBox);
    rootEl.append(top, h('div', { class: 'aa-main' }, edit, side));
    host.append(rootEl);

    /* ---------- the forms ---------- */
    const keyList = h('datalist', { id: 'aa-keys' }), elList = h('datalist', { id: 'aa-els' }), serList = h('datalist', { id: 'aa-series' });
    const sceneList = h('datalist', { id: 'aa-scenes' }), soundList = h('datalist', { id: 'aa-sounds' }), idList = h('datalist', { id: 'aa-ids' });
    const partList = h('datalist', { id: 'aa-parts' });
    rootEl.append(keyList, elList, serList, sceneList, soundList, idList, partList);
    const decorate = (kind, input, wrap, path) => {
      if (kind === 'key') { input.setAttribute('list', 'aa-keys'); input.dataset.x = 'key'; const kt = h('div', { class: 'aa-kt' }); wrap.append(kt); paintKeyTexts(kt, input.value); input.addEventListener('input', () => paintKeyTexts(kt, input.value)); }
      else if (kind === 'expr') { input.dataset.x = 'expr'; input.dataset.xpath = JSON.stringify(path); const fb = h('div', { class: 'aa-xfb' }); wrap.append(fb); input.addEventListener('input', () => exprFeedback(input)); }
      else if (kind === 'element') input.setAttribute('list', 'aa-els');
      else if (kind === 'series') input.setAttribute('list', 'aa-series');
      else if (kind === 'name') input.classList.add('sf-mono');
      else if (kind === 'of') { const id = 'aa-of-' + (++ofN), dl = h('datalist', { id }); input.setAttribute('list', id); input.classList.add('sf-mono'); input.dataset.x = 'of'; input.dataset.xpath = JSON.stringify(path); wrap.append(dl); paintOf(input, dl); }
      else if (kind === 'scene' || kind === 'sound') input.setAttribute('list', 'aa-' + kind + 's');
      else if (kind === 'ref') { input.setAttribute('list', 'aa-ids'); input.classList.add('sf-mono'); }
      else if (kind === 'part') { input.setAttribute('list', 'aa-parts'); input.classList.add('sf-mono'); }
    };
    let ofN = 0;
    /** what an output of the engine may compute: its kind's list for this model (the engine's table, or what the model offers) */
    function paintOf(input, dl) {
      const path = JSON.parse(input.dataset.xpath), o = SF().getAt(doc.spec, path.slice(0, -1)), t = typeOf(doc), pt = partOf(doc.spec, path);
      const e = pt ? libOf(pt.engine) : t.lib ? libOf(t.engine) : null;
      dl.innerHTML = ''; if (!e || !isObj(o)) return;
      for (const v of LS().ofs(e.M.table, pt ? pt.model : doc.spec.model, o.kind).slice(0, 400)) dl.append(h('option', { value: v }));
    }
    const sfOpts = { registry: reg, label, help, text: TT, decorate };
    let specForm = null, itemForm = null;
    function buildForms() {
      panels.spec.innerHTML = ''; panels.item.innerHTML = '';
      const sid = specSchemaId(doc.spec, reg);
      specForm = S.form(Object.assign({}, sfOpts, { schema: reg.get(sid), base: sid, value: doc.spec, onChange: (v, o) => { doc.spec = v; changed(o.structural); }, onRender: () => refreshAll() }));
      itemForm = S.form(Object.assign({}, sfOpts, { schema: itemSchema(reg), base: REG_ID, value: doc.item, onChange: (v, o) => { itemChanged(v); changed(o.structural); } }));
      panels.spec.append(specForm.el); panels.item.append(itemForm.el);
      paintStrings();
    }
    function itemChanged(v) {
      const old = doc.item.id; doc.item = v;
      if (v.id !== old && typeof v.id === 'string') {
        if (v.entry === `activities/${old}/spec.json`) v.entry = `activities/${v.id}/spec.json`;
        if (isObj(v.fallback) && v.fallback.media === `${old}-still`) v.fallback.media = `${v.id}-still`;
        doc.item = v; itemForm.set(v);
      }
    }

    /* ---------- words: under each key field, and the full table ---------- */
    const locs = () => Object.keys(doc.strings || {});
    function setText(loc, key, text) {
      doc.strings[loc] = doc.strings[loc] || {};
      if (text) doc.strings[loc][key] = text; else delete doc.strings[loc][key];
      changed(false);
    }
    function paintKeyTexts(kt, key) {
      kt.innerHTML = '';
      if (!KEY_RE.test(key || '')) return;
      const g = h('div', { class: 'aa-ktg', role: 'group', 'aria-label': TT('keyTexts') + ': ' + key });
      for (const loc of locs()) {
        const id = 'aa-kt-' + Math.random().toString(36).slice(2, 9), v = doc.strings[loc]?.[key] ?? '';
        const inp = h('input', { id, type: 'text', class: 'sf-in aa-ktin' + (v ? '' : ' aa-miss'), value: v, placeholder: TT('missingText'), 'aria-label': TT('textIn', { loc }), 'data-strkey': key, 'data-loc': loc, lang: loc, autocomplete: 'off' });
        inp.addEventListener('input', () => { inp.classList.toggle('aa-miss', !inp.value); setText(loc, key, inp.value); syncTexts(inp); });
        g.append(h('label', { class: 'aa-ktl', for: id }, loc), inp);
      }
      kt.append(g);
    }
    /** the same key's other boxes (under another field, in the table) follow what is typed */
    function syncTexts(src) {
      for (const x of rootEl.querySelectorAll('input[data-strkey]')) if (x !== src && x.dataset.strkey === src.dataset.strkey && x.dataset.loc === src.dataset.loc) { x.value = src.value; x.classList.toggle('aa-miss', !x.value); }
    }
    function paintStrings() {
      const p = panels.strings; p.innerHTML = '';
      const used = usedKeys(doc.spec), all = [...used];
      for (const l of locs()) for (const k of Object.keys(doc.strings[l] || {})) if (!all.includes(k)) all.push(k);
      p.append(h('p', { class: 'sf-help' }, TT('stringsIntro')));
      const list = h('div', { class: 'aa-st' });
      for (const k of all) {
        const row = h('div', { class: 'aa-strow' + (used.includes(k) ? '' : ' aa-unused'), 'data-key': k },
          h('div', { class: 'aa-stk' }, h('code', {}, k), used.includes(k) ? null : h('span', { class: 'aa-tag' }, TT('unused')),
            used.includes(k) ? null : h('button', { type: 'button', class: 'sf-ib', 'aria-label': TT('removeKey', { key: k }), title: TT('removeKey', { key: k }), onclick: () => { for (const l of locs()) delete doc.strings[l][k]; specForm.rerender(); changed(true); } }, icon('x'))));
        const kt = h('div', { class: 'aa-kt' }); paintKeyTexts(kt, k); row.append(kt); list.append(row);
      }
      p.append(list);
      const code = h('input', { type: 'text', class: 'sf-in aa-locin', id: 'aa-newloc', placeholder: 'fr', autocomplete: 'off', spellcheck: 'false', 'data-aa': 'new-locale' });
      const err = h('p', { class: 'sf-err', hidden: true, role: 'alert' });
      const add = () => { const l = code.value.trim(); if (!LOC_RE.test(l) || doc.strings[l]) { err.hidden = false; err.textContent = TT('localeBad'); return; } doc.strings[l] = {}; specForm.rerender(); changed(true); };
      code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      const locRow = h('div', { class: 'aa-locs' }, ...locs().map(l => h('span', { class: 'aa-chip' }, l, locs().length > 1 ? h('button', { type: 'button', class: 'sf-ib', 'aria-label': TT('removeLocale', { loc: l }), title: TT('removeLocale', { loc: l }), onclick: () => { delete doc.strings[l]; specForm.rerender(); changed(true); } }, icon('x')) : null)));
      p.append(h('div', { class: 'aa-addloc' }, locRow, h('label', { class: 'aa-tl', for: 'aa-newloc' }, TT('localeCode')), h('div', { class: 'aa-row' }, code, btn('plus', TT('addLocale'), add, 'btn small ghost', { 'data-aa': 'add-locale' })), err));
    }

    /* ---------- formulas: live check with the declared names ---------- */
    function exprFeedback(input) {
      const fb = input.closest('.sf-f')?.querySelector('.aa-xfb'); if (!fb) return;
      const path = JSON.parse(input.dataset.xpath), X = ENG()?.expr;
      let names = namesAt(doc.spec, path);
      const t = typeOf(doc), pt = partOf(doc.spec, path), inPart = pt && (path[2] === 'model' || path[2] === 'outputs');
      const e = inPart ? libOf(pt.engine) : t.lib && (path[0] === 'model' || path[0] === 'outputs') ? libOf(t.engine) : null;
      if (inPart && !e) { fb.innerHTML = ''; return; }   // (a circuit part: the validators check it)
      if (e) {   // an engine's text field is a formula only where its exprs() says so, over the spec's names and its own
        const sub = inPart ? partSub(doc.spec, pt) : doc.spec, at = SF().pathStr(inPart ? path.slice(2) : path);
        let x = null; try { x = (e.M.exprs(sub) || []).find(r => r[1] === at); } catch (er) { x = null; }
        if (!x) { fb.innerHTML = ''; if (!input.closest('.sf-f')?.querySelector(':scope > .sf-err')) input.removeAttribute('aria-invalid'); return; }
        names = names.concat(x[2] || []);
      }
      let msg = null;
      if (X && input.value.trim()) { const p = X.check(input.value, { vars: names }); if (p.length) msg = p[0].msg; }
      fb.innerHTML = '';
      fb.append(h('p', { class: 'aa-names' }, names.length ? TT('names', { names: names.join(', ') }) : TT('namesNone')));
      if (msg) { const id = 'aa-x-' + Math.random().toString(36).slice(2, 9); fb.append(h('p', { class: 'sf-err sf-keep aa-xerr', role: 'alert', id }, msg)); input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', id); }
      else if (!input.closest('.sf-f')?.querySelector(':scope > .sf-err')) input.removeAttribute('aria-invalid');
    }
    function refreshAll() {
      for (const i of rootEl.querySelectorAll('[data-x="expr"]')) exprFeedback(i);
      keyList.innerHTML = ''; const ks = new Set([...usedKeys(doc.spec), ...locs().flatMap(l => Object.keys(doc.strings[l] || {}))]); for (const k of ks) keyList.append(h('option', { value: k }));
      elList.innerHTML = ''; for (const e of (doc.spec.model?.netlist?.elements || [])) if (e && e.id) elList.append(h('option', { value: e.id }));
      serList.innerHTML = ''; for (const o of allOutputs(doc.spec)) if (o.kind === 'series' && o.id) serList.append(h('option', { value: o.id }));
      for (const [k, dl] of [['scene', sceneList], ['sound', soundList]]) { dl.innerHTML = ''; for (const o of allOutputs(doc.spec)) if (o.kind === k && o.id) dl.append(h('option', { value: o.id })); }
      partList.innerHTML = ''; for (const p of (Array.isArray(doc.spec.parts) ? doc.spec.parts : [])) if (isObj(p) && typeof p.id === 'string' && p.id) partList.append(h('option', { value: p.id }));
      idList.innerHTML = ''; const ids = new Set(); (function ws(v, d) { if (d > 8) return; if (Array.isArray(v)) v.forEach(x => ws(x, d + 1)); else if (isObj(v)) { if (typeof v.id === 'string' && v.id) ids.add(v.id); Object.values(v).forEach(x => ws(x, d + 1)); } })(Array.isArray(doc.spec.parts) ? doc.spec.parts.map(p => isObj(p) ? p.model : null) : doc.spec.model, 0);
      for (const i of [...ids].slice(0, 400)) idList.append(h('option', { value: i }));
      for (const i of rootEl.querySelectorAll('[data-x="of"]')) { const dl = i.list; if (dl) paintOf(i, dl); }
    }

    /* ---------- checks at the fields ---------- */
    function runChecks() {
      probs = check(doc, reg);
      const left = [...(specForm ? specForm.setErrors(probs.filter(p => p.tab === 'spec')) : []), ...(itemForm ? itemForm.setErrors(probs.filter(p => p.tab === 'item')) : [])];
      for (const r of panels.strings.querySelectorAll('.aa-strow')) r.classList.toggle('aa-bad', probs.some(p => p.tab === 'strings' && p.key === r.dataset.key));
      for (const [k] of tabs) { const n = probs.filter(p => p.tab === k).length, b = tabBtns[k].querySelector('.aa-badge'); b.hidden = !n; b.textContent = String(n); }
      probBox.innerHTML = '';
      if (!probs.length) { probBox.append(h('p', { class: 'aa-ok' }, icon('ok'), TT('problemsNone'))); return; }
      const det = h('details', { class: 'aa-pd' }, h('summary', {}, icon('warn'), TT('problems', { n: probs.length })));
      const ul = h('ul', { class: 'aa-pl' });
      for (const p of probs.slice(0, 50)) ul.append(h('li', {}, h('span', { class: 'aa-pt' }, TT('tab.' + p.tab)), ' ', h('span', {}, p.msg), ' ', h('button', { type: 'button', class: 'btn small ghost', onclick: () => goTo(p) }, TT('goTo'))));
      det.append(ul); probBox.append(det);
      void left;
    }
    function goTo(p) {
      showTab(p.tab);
      const form = p.tab === 'spec' ? specForm : p.tab === 'item' ? itemForm : null;
      if (form) form.focusPath(p.path);
      else if (p.key) requestAnimationFrame(() => panels.strings.querySelector(`.aa-strow[data-key="${CSS.escape(p.key)}"] input`)?.focus());
    }

    /* ---------- the preview ---------- */
    function paintLocales() {
      const ls = locs(); if (!ls.includes(prevLoc)) prevLoc = ls.includes(uiLoc()) ? uiLoc() : ls.includes('en') ? 'en' : ls[0] || 'en';
      locSel.innerHTML = ''; for (const l of ls) locSel.append(h('option', { value: l, text: l })); locSel.value = prevLoc;
    }
    locSel.addEventListener('change', () => { prevLoc = locSel.value; lastGood = null; schedulePreview(0); });
    function schedulePreview(ms = 400) { clearTimeout(prevT); prevT = setTimeout(paintPreview, ms); }
    function paintPreview() {
      if (!preview) { prevNote.textContent = TT('previewOff'); return; }
      const specProbs = probs.filter(p => p.tab === 'spec' || (p.tab === 'strings' && p.key));
      if (specProbs.length) { prevNote.textContent = TT('previewStale'); prevBox.classList.add('aa-stale'); return; }
      const sig = JSON.stringify([doc.spec, doc.strings[prevLoc], prevLoc]);
      prevNote.textContent = ''; prevBox.classList.remove('aa-stale');
      if (sig === lastGood && live) return;
      lastGood = sig;
      live?.destroy(); prevBox.innerHTML = '';
      try { live = preview.show(prevBox, doc.item, doc.spec, doc.strings, prevLoc); } catch (e) { console.warn('[noema] author preview', e); live = null; }   // i18n-ignore
    }

    /* ---------- changes, undo / redo ---------- */
    function changed(structural) {
      if (structural) { paintStrings(); paintLocales(); }
      refreshAll();
      clearTimeout(commitT); if (structural) commit(); else commitT = setTimeout(commit, 400);
      clearTimeout(checkT); checkT = setTimeout(() => { runChecks(); schedulePreview(); }, structural ? 0 : 200);
      paintUndo();
    }
    function commit() {
      clearTimeout(commitT); commitT = null;
      const s = JSON.stringify(doc); if (s === hist[hi]) return;
      hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 200) hist.shift(); hi = hist.length - 1; paintUndo();
    }
    function paintUndo() { undoB.disabled = !(hi > 0 || (commitT && JSON.stringify(doc) !== hist[hi])); redoB.disabled = hi >= hist.length - 1; }
    function undo() { if (commitT) commit(); if (hi > 0) { hi--; load(JSON.parse(hist[hi]), false); } }
    function redo() { if (commitT) commit(); if (hi < hist.length - 1) { hi++; load(JSON.parse(hist[hi]), false); } }
    function load(d, record) {
      const a = document.activeElement, fp = a && rootEl.contains(a) ? a.getAttribute('data-path') : null;
      doc = clone(d); if (!isObj(doc.strings)) doc.strings = {};
      typeSel.value = typeOf(doc).id; paintTypeInfo(); startBar.hidden = true;
      buildForms(); paintLocales(); refreshAll();
      if (fp) { const b = panels[tab].querySelector(`[data-path="${CSS.escape(fp)}"]`); if (b) b.focus({ preventScroll: true }); }
      if (record) commit();
      runChecks(); schedulePreview(0); paintUndo();
    }
    typeSel.addEventListener('change', () => {
      const t = typeById(typeSel.value), d = clone(doc);
      paintTypeInfo();
      if (t.lib || t.parts) { offerStart(t); return; }   // a library engine, or parts: a reference activity or a blank one (offerStart)
      load(t.convert ? t.convert(d) : t.blank(), true);
    });
    const onKey = e => {
      if (!rootEl.isConnected || !(rootEl.contains(e.target) || e.target === document.body || e.target === document.documentElement)) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);

    /* ---------- files ---------- */
    function download(name, blob) {
      const a = h('a', { href: URL.createObjectURL(blob), download: name, class: 'aa-dl' }); document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function paintFiles() {
      filesBox.innerHTML = '';
      const fs = files(doc), ul = h('ul', { class: 'aa-fl' });
      for (const [name, text] of Object.entries(fs)) ul.append(h('li', {}, h('button', { type: 'button', class: 'btn small ghost aa-btn', 'data-file': name, 'aria-label': TT('exportFile', { file: name }), onclick: () => download(name.split('/').pop(), new Blob([text], { type: 'application/json' })) }, icon('down'), h('code', {}, name))));
      filesBox.append(ul);
    }
    fileIn.addEventListener('change', async () => {
      const fs = {}, bad = [];
      for (const f of [...fileIn.files]) {
        try {
          if (/\.zip$/i.test(f.name)) Object.assign(fs, await unzip(new Uint8Array(await f.arrayBuffer())));
          else { const t = await f.text(); JSON.parse(t); fs[f.webkitRelativePath || f.name] = t; }
        } catch (e) { bad.push(TT('importBad', { file: f.name, why: String(e.message || e) })); }
      }
      fileIn.value = '';
      if (Object.keys(fs).length) load(fromFiles(fs, doc), true);
      note.textContent = [TT('importDone', { n: Object.keys(fs).length }), ...bad].join(' · ');
    });

    showTab(tab);
    load(doc, false);
    return {
      el: rootEl, get: () => clone(doc), set: d => load(d, true), undo, redo, files: () => files(doc), zip: () => zip(files(doc)), check: () => check(doc, reg),
      showTab, flush() { if (commitT) commit(); clearTimeout(checkT); runChecks(); clearTimeout(prevT); paintPreview(); },
      destroy() { document.removeEventListener('keydown', onKey); live?.destroy(); clearTimeout(commitT); clearTimeout(checkT); clearTimeout(prevT); rootEl.remove(); },
    };
  }
  /** the route #/author in the app: the page in <main>, with the app's own runtime for the preview */
  /** the route #/author (engine/src/40_views.js authorView): the page in <main>, with the app's runtime as its preview; the page
      open now is API.current (the browser test drives it) */
  function view(main, opts) { if (API.current) try { API.current.destroy(); } catch (e) { } main.innerHTML = ''; return (API.current = mount(main, Object.assign({ preview: actPreview() }, opts || {}))); }

  const API = { current: null, mount, view, registerType, TYPES, check, usedKeys, namesAt, files, fromFiles, zip, unzip, crc32, registry, actPreview, T, SIM_ID, REG_ID,
    libEngines, refsFor, fromRef, libBlank, specSchemaId, typeOf, partsRefs, partsBlank, partSub, engLabel };
  root.NoemaActivityAuthor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
