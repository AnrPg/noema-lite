/* noema-lite — NoemaSchemaForm: forms generated from JSON Schemas (docs/activities-dev/authoring_ui.md).
   A subset of JSON Schema 2020-12 that the app's schemas use (tools/schemas/*.schema.json):
     $ref (local "#/$defs/…" and other schemas of the registry by $id, relative or absolute), allOf, oneOf / anyOf (alternatives, or
     objects told apart by a discriminator: a property that is a const or a one-value enum in every branch), not, if / then / else,
     type (one or a list), const, enum, properties, required, additionalProperties, propertyNames, maxProperties, items, minItems,
     maxItems, uniqueItems, minimum, maximum, exclusiveMinimum, exclusiveMaximum, minLength, maxLength, pattern, unevaluatedProperties
     (the properties of the schema, its allOf / $ref and its matching branch), default, title, description; "x-noema" (an annotation
     for the authoring UI: expr, key, name, element, series, longtext).
   The core (registry, validate, skeleton, branches) has no DOM and runs in Node (tests/activity_author.js). The form (form()) keeps
   the document as plain JSON — the source of truth — and changes it only at the paths the user edits, so a document read back is
   the document given (unknown fields included): a lossless round trip.
   Labels: the schema's `title` is a KEY; opts.label(title, prop) gives the words (engine.author.* in the app's catalogs). */
(function (root) {
  'use strict';
  /* i18n-ignore-start */   // code words (schema keywords, classes, paths); every visible word comes from opts.label / opts.text
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /* ---------- the registry: schemas by $id; $ref resolution ---------- */
  function registry(schemas) {
    const byId = new Map();
    const add = s => { if (isObj(s) && s.$id) byId.set(s.$id, s); };
    (Array.isArray(schemas) ? schemas : [schemas]).forEach(add);
    function docOf(base) { return byId.get(base) || null; }
    function pointer(doc, frag) {
      if (!frag || frag === '/') return doc;
      let cur = doc;
      for (const raw of frag.replace(/^\//, '').split('/')) { const k = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~'); if (!cur || !has(cur, k)) return null; cur = cur[k]; }
      return cur;
    }
    /** → {schema, base} of a $ref seen in a schema whose document is `base` (an $id) */
    function resolve(ref, base) {
      const [u, frag] = ref.split('#');
      let id = base;
      if (u) {
        if (/^[a-z]+:/i.test(u)) id = u;
        else { const b = (base || '').replace(/[^/]*$/, ''); id = b + u; }
        if (!byId.has(id)) { const tail = u.split('/').pop(); for (const k of byId.keys()) if (k.split('/').pop() === tail) { id = k; break; } }
      }
      const doc = docOf(id);
      if (!doc) throw new Error('schema not in the registry: ' + ref);
      const s = pointer(doc, frag || '');
      if (s == null) throw new Error('unresolved $ref ' + ref);
      return { schema: s, base: id };
    }
    return { add, resolve, get: id => byId.get(id) || null, ids: () => [...byId.keys()] };
  }

  /** A schema node with its base: {s, b}. Follows a bare $ref (one without siblings) to its target. */
  function node(s, b) { return { s: s === true || s == null ? {} : s, b }; }
  function follow(reg, n) {
    let g = 0;
    while (isObj(n.s) && typeof n.s.$ref === 'string' && Object.keys(n.s).every(k => k === '$ref' || k === 'title' || k === 'description' || k === 'default')) {
      const r = reg.resolve(n.s.$ref, n.b), extra = {};
      for (const k of ['title', 'description', 'default']) if (has(n.s, k)) extra[k] = n.s[k];
      n = node(Object.keys(extra).length ? Object.assign({}, r.schema, extra) : r.schema, r.base);
      if (++g > 64) throw new Error('$ref loop');
    }
    return n;
  }

  /* ---------- validation ---------- */
  const typeOfValue = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
  const typeOk = (t, v) => { const a = typeOfValue(v); return t === a || (t === 'number' && a === 'integer'); };
  const reCache = new Map();
  const re = p => { let r = reCache.get(p); if (!r) { r = new RegExp(p, 'u'); reCache.set(p, r); } return r; };

  /** → [{path: [...], msg, kw}] ; `ev` collects the evaluated property names (unevaluatedProperties) */
  function check(reg, n, v, path, out, ev) {
    const s = n.s, b = n.b;
    if (s === false) { out.push({ path, kw: 'false', msg: 'not allowed' }); return; }
    if (!isObj(s)) return;
    const local = new Set();
    if (typeof s.$ref === 'string') { const r = reg.resolve(s.$ref, b); check(reg, node(r.schema, r.base), v, path, out, local); }
    if (has(s, 'const') && !eq(s.const, v)) out.push({ path, kw: 'const', p: { value: JSON.stringify(s.const) }, msg: 'must be ' + JSON.stringify(s.const) });
    if (Array.isArray(s.enum) && !s.enum.some(x => eq(x, v))) out.push({ path, kw: 'enum', p: { values: s.enum.map(x => JSON.stringify(x)).join(', ') }, msg: 'must be one of ' + s.enum.map(x => JSON.stringify(x)).join(', ') });
    if (s.type != null) { const ts = Array.isArray(s.type) ? s.type : [s.type]; if (!ts.some(t => typeOk(t, v))) { out.push({ path, kw: 'type', p: { type: ts.join(' | ') }, msg: 'must be ' + ts.join(' or ') }); return; } }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) out.push({ path, kw: 'minimum', p: { limit: s.minimum }, msg: 'must be >= ' + s.minimum });
      if (typeof s.maximum === 'number' && v > s.maximum) out.push({ path, kw: 'maximum', p: { limit: s.maximum }, msg: 'must be <= ' + s.maximum });
      if (typeof s.exclusiveMinimum === 'number' && !(v > s.exclusiveMinimum)) out.push({ path, kw: 'exclusiveMinimum', p: { limit: s.exclusiveMinimum }, msg: 'must be > ' + s.exclusiveMinimum });
      if (typeof s.exclusiveMaximum === 'number' && !(v < s.exclusiveMaximum)) out.push({ path, kw: 'exclusiveMaximum', p: { limit: s.exclusiveMaximum }, msg: 'must be < ' + s.exclusiveMaximum });
    }
    if (typeof v === 'string') {
      const len = [...v].length;
      if (typeof s.minLength === 'number' && len < s.minLength) out.push({ path, kw: 'minLength', p: { limit: s.minLength }, msg: 'at least ' + s.minLength + ' characters' });
      if (typeof s.maxLength === 'number' && len > s.maxLength) out.push({ path, kw: 'maxLength', p: { limit: s.maxLength }, msg: 'at most ' + s.maxLength + ' characters' });
      if (typeof s.pattern === 'string' && !re(s.pattern).test(v)) out.push({ path, kw: 'pattern', msg: 'does not match ' + s.pattern });
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) out.push({ path, kw: 'minItems', p: { limit: s.minItems }, msg: 'at least ' + s.minItems + ' items' });
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) out.push({ path, kw: 'maxItems', p: { limit: s.maxItems }, msg: 'at most ' + s.maxItems + ' items' });
      if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) out.push({ path, kw: 'uniqueItems', msg: 'items must be different' });
      if (s.items != null) v.forEach((x, i) => check(reg, node(s.items, b), x, path.concat(i), out, null));
    }
    if (isObj(v)) {
      const props = isObj(s.properties) ? s.properties : {};
      for (const k of (Array.isArray(s.required) ? s.required : [])) if (!has(v, k)) out.push({ path: path.concat(k), kw: 'required', msg: 'is required' });
      for (const [k, ps] of Object.entries(props)) { local.add(k); if (has(v, k)) check(reg, node(ps, b), v[k], path.concat(k), out, null); }
      const keys = Object.keys(v);
      if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties) out.push({ path, kw: 'maxProperties', p: { limit: s.maxProperties }, msg: 'at most ' + s.maxProperties + ' entries' });
      if (s.propertyNames != null) for (const k of keys) { const e = []; check(reg, node(s.propertyNames, b), k, path.concat(k), e, null); if (e.length) out.push({ path: path.concat(k), kw: 'propertyNames', msg: 'is not a usable name' }); }
      if (has(s, 'additionalProperties')) for (const k of keys) if (!has(props, k)) {
        if (s.additionalProperties === false) out.push({ path: path.concat(k), kw: 'additionalProperties', msg: 'unknown field' });
        else check(reg, node(s.additionalProperties, b), v[k], path.concat(k), out, null), local.add(k);
      }
    }
    for (const a of (Array.isArray(s.allOf) ? s.allOf : [])) check(reg, node(a, b), v, path, out, local);
    for (const kw of ['oneOf', 'anyOf']) if (Array.isArray(s[kw])) {
      const results = s[kw].map(a => { const e = [], l = new Set(); check(reg, node(a, b), v, path, e, l); return { e, l }; });
      const okN = results.filter(r => !r.e.length);
      if (kw === 'oneOf' ? okN.length !== 1 : !okN.length) {
        const best = branchIndex(reg, n, v, kw);
        if (okN.length > 1) out.push({ path, kw, msg: 'matches more than one alternative' });
        else if (best >= 0 && results[best].e.length) out.push(...results[best].e);
        else out.push({ path, kw, msg: 'matches no alternative' });
      } else okN.forEach(r => r.l.forEach(k => local.add(k)));
    }
    if (s.not != null) { const e = []; check(reg, node(s.not, b), v, path, e, null); if (!e.length) out.push({ path, kw: 'not', msg: 'is not allowed here' }); }
    if (s.if != null) {
      const e = []; check(reg, node(s.if, b), v, path, e, null);
      const br = !e.length ? s.then : s.else; if (br != null) check(reg, node(br, b), v, path, out, local);
    }
    if (s.unevaluatedProperties === false && isObj(v)) for (const k of Object.keys(v)) if (!local.has(k)) out.push({ path: path.concat(k), kw: 'unevaluatedProperties', msg: 'unknown field' });
    if (ev) local.forEach(k => ev.add(k));
  }
  function validate(reg, schema, value, base) { const out = []; check(reg, node(schema, base || schema.$id), value, [], out, null); return out; }

  /* ---------- branches: alternatives and discriminated objects ---------- */
  /** the branches of s (oneOf or anyOf) as followed nodes */
  function branches(reg, n) { const s = n.s, list = Array.isArray(s.oneOf) ? s.oneOf : Array.isArray(s.anyOf) ? s.anyOf : null; return list ? list.map(x => follow(reg, node(x, n.b))) : null; }
  /** merge a schema with its allOf members and a sibling $ref into one object view {properties, required, ...} (no branches) */
  function flat(reg, n, depth = 0) {
    const s = n.s, out = { properties: {}, required: [], order: [], bases: {}, title: s.title, description: s.description };
    const take = (m, depth2) => {
      if (!isObj(m.s) || depth2 > 16) return;
      if (typeof m.s.$ref === 'string') { const r = reg.resolve(m.s.$ref, m.b); take(node(r.schema, r.base), depth2 + 1); }
      for (const a of (Array.isArray(m.s.allOf) ? m.s.allOf : [])) take(node(a, m.b), depth2 + 1);
      for (const [k, ps] of Object.entries(isObj(m.s.properties) ? m.s.properties : {})) {
        if (!out.order.includes(k)) out.order.push(k);
        const prev = out.properties[k];
        // a later, more specific definition (a branch's const) wins; titles survive
        out.properties[k] = prev && isObj(ps) && isObj(prev) && !ps.title && prev.title ? Object.assign({ title: prev.title }, ps) : ps;
        out.bases[k] = m.b;
      }
      for (const r of (Array.isArray(m.s.required) ? m.s.required : [])) if (!out.required.includes(r)) out.required.push(r);
      for (const k of ['additionalProperties', 'propertyNames', 'maxProperties', 'unevaluatedProperties', 'x-noema']) if (has(m.s, k)) out[k] = m.s[k];
    };
    take(n, depth);
    return out;
  }
  /** the discriminator of an object's branches: the property that is a const / a one-value enum in every branch, all different */
  function discriminator(reg, bs) {
    if (!bs || bs.length < 2) return null;
    const views = bs.map(x => flat(reg, x));
    const cands = views[0].order.filter(k => views.every(v => constsOf(reg, v.properties[k], v.bases[k]) !== undefined));
    for (const k of cands) {
      const per = views.map(v => constsOf(reg, v.properties[k], v.bases[k])), all = per.flat().map(x => JSON.stringify(x));
      if (new Set(all).size === all.length) return { prop: k, values: per.map(p => p[0]), opts: per.flatMap((p, i) => p.map(value => ({ value, branch: i }))) };
    }
    return null;
  }
  /** the values a property may take in one branch: [const] or a short enum (a discriminator), else undefined */
  function constsOf(reg, ps, b) {
    if (!isObj(ps)) return undefined;
    const n = follow(reg, node(ps, b));
    if (has(n.s, 'const')) return [n.s.const];
    if (Array.isArray(n.s.enum) && n.s.enum.length >= 1 && n.s.enum.length <= 4) return n.s.enum;
    return undefined;
  }
  /** which branch a value belongs to (the best guess when it matches none): valid > discriminator / required keys > type > first */
  function branchIndex(reg, n, v, kw) {
    const bs = branches(reg, n); if (!bs) return -1;
    const d = isObj(v) ? discriminator(reg, bs) : null;
    if (d && has(v, d.prop)) { const o = d.opts.find(x => eq(x.value, v[d.prop])); if (o) return o.branch; }
    let best = 0, score = -1;
    bs.forEach((x, i) => {
      let sc = 0; const e = []; check(reg, x, v, [], e, null);
      if (!e.length) sc = 4;
      else {
        const f = flat(reg, x), t = typeOfSchema(reg, x);
        if (isObj(v) && t === 'object' && f.required.length && f.required.every(k => has(v, k))) sc = 3;
        else if (isObj(v) && t === 'object' && Object.keys(v).some(k => has(f.properties, k))) sc = 2;
        else if (t && typeOk(t === 'enum' || t === 'const' ? typeOfValue(v) : t, v)) sc = 1;
      }
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }
  /** what kind of editor a (followed) schema needs */
  function typeOfSchema(reg, n) {
    const s = n.s;
    if (!isObj(s)) return null;
    if (has(s, 'const')) return 'const';
    if (Array.isArray(s.enum)) return 'enum';
    if (Array.isArray(s.type)) return s.type.length === 1 ? s.type[0] : 'alt';
    if (typeof s.type === 'string') return s.type;
    if (isObj(s.properties) || s.additionalProperties != null || s.required) return 'object';
    if (s.items) return 'array';
    if (s.oneOf || s.anyOf) { const bs = branches(reg, n); return bs.every(x => typeOfSchema(reg, x) === 'object') && discriminator(reg, bs) ? 'object' : 'alt'; }
    if (typeof s.$ref === 'string') { const r = reg.resolve(s.$ref, n.b); const t = typeOfSchema(reg, node(r.schema, r.base)); return t; }
    if (Array.isArray(s.allOf)) { for (const a of s.allOf) { const t = typeOfSchema(reg, follow(reg, node(a, n.b))); if (t) return t; } }
    return null;
  }
  /** the object view of `v` under n: the flat schema merged with the matching branch {view, d, bs, bi} */
  function objectView(reg, n, v) {
    const base = flat(reg, n), bs = branches(reg, n);
    if (!bs) return { view: base, d: null, bs: null, bi: -1 };
    const d = discriminator(reg, bs), bi = branchIndex(reg, n, v);
    const bv = flat(reg, bs[bi]), view = { ...base, properties: { ...base.properties }, required: [...base.required], order: [...base.order], bases: { ...base.bases } };
    for (const k of bv.order) {
      if (!view.order.includes(k)) view.order.push(k);
      const prev = view.properties[k], ps = bv.properties[k];
      view.properties[k] = prev && isObj(prev) && isObj(ps) ? Object.assign({}, prev, ps, { title: ps.title || prev.title }) : ps;
      view.bases[k] = bv.bases[k];
    }
    for (const r of bv.required) if (!view.required.includes(r)) view.required.push(r);
    for (const k of ['additionalProperties', 'unevaluatedProperties']) if (has(bv, k)) view[k] = bv[k];
    return { view, d, bs, bi };
  }

  /* ---------- skeletons: the smallest value a schema accepts (what Add puts in) ---------- */
  function skeleton(reg, n0, depth = 0) {
    const n = follow(reg, n0), s = n.s;
    if (depth > 12 || !isObj(s)) return null;
    if (has(s, 'default')) return clone(s.default);
    const t = typeOfSchema(reg, n);
    if (t === 'const') return clone(s.const);
    if (t === 'enum') return clone(s.enum[0]);
    if (t === 'alt') { const bs = branches(reg, n); if (bs) return skeleton(reg, bs[0], depth + 1); return typeof s.type[0] === 'string' ? skeleton(reg, node({ type: s.type[0] }, n.b), depth + 1) : null; }
    if (t === 'object') {
      const bs = branches(reg, n);
      const ov = objectView(reg, n, bs ? skeletonBranchSeed(reg, n, bs, 0) : {}), out = {};
      for (const k of ov.view.order) {
        const ps = ov.view.properties[k];
        if (ov.view.required.includes(k) || (ov.d && k === ov.d.prop)) out[k] = skeleton(reg, node(ps, ov.view.bases[k]), depth + 1);
      }
      for (const k of ov.view.required) if (!has(out, k)) out[k] = null;
      if (ov.d) out[ov.d.prop] = clone(ov.d.values[ov.bi]);
      return out;
    }
    if (t === 'array') { const out = []; for (let i = 0; i < (s.minItems || 0); i++) out.push(skeleton(reg, node(s.items, n.b), depth + 1)); return out; }
    if (t === 'number' || t === 'integer') { let v = typeof s.minimum === 'number' ? s.minimum : typeof s.exclusiveMinimum === 'number' ? s.exclusiveMinimum + 1 : 0; if (typeof s.maximum === 'number' && v > s.maximum) v = s.maximum; return v; }
    if (t === 'boolean') return false;
    if (t === 'string') return '';
    return null;
  }
  function skeletonBranchSeed(reg, n, bs, i) { const d = discriminator(reg, bs); return d ? { [d.prop]: d.values[i] } : {}; }
  function skeletonOfBranch(reg, n, i, value) {
    const bs = branches(reg, n), d = discriminator(reg, bs);
    if (!d) return skeleton(reg, bs[i]);
    const dv = value === undefined ? d.values[i] : value;
    const ov = objectView(reg, n, { [d.prop]: dv }), out = {};
    for (const k of ov.view.order) if (ov.view.required.includes(k) || k === d.prop) out[k] = skeleton(reg, node(ov.view.properties[k], ov.view.bases[k]));
    out[d.prop] = clone(dv);
    return out;
  }

  /* ---------- paths ---------- */
  function pathStr(path, rootName = '') {
    let s = rootName;
    for (const p of path) s += typeof p === 'number' ? '[' + p + ']' : (s ? '.' : '') + p;
    return s;
  }
  /** "spec.params[0].min: …" → ['params', 0, 'min'] (the longest path at the start of a validator's message) */
  function parsePath(msg, rootName) {
    const m = new RegExp('^' + rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '((?:\\.[A-Za-z_$][\\w$-]*|\\[\\d+\\])*)').exec(String(msg));
    if (!m) return null;
    const out = []; for (const t of m[1].matchAll(/\.([A-Za-z_$][\w$-]*)|\[(\d+)\]/g)) out.push(t[1] !== undefined ? t[1] : +t[2]);
    return out;
  }
  const getAt = (v, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), v);
  function setAt(v, path, x) {
    if (!path.length) return x;
    let o = v; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = x; return v;
  }
  function delAt(v, path) { const o = getAt(v, path.slice(0, -1)), k = path[path.length - 1]; if (Array.isArray(o)) o.splice(k, 1); else if (o) delete o[k]; return v; }

  /* =====================================================================================================================
     The form (browser). opts: { schema, registry, value, label(title, prop) → text, help(title) → text, text(key, vars) → UI
     words (add, remove, up, down, field, alt.*), onChange(value, {structural}), decorate(kind, input, wrap, path) — the x-noema
     fields (expr, key, name, …) get their widgets from the caller, rootName ('spec' for the validator's paths) }
     → { el, get(), set(value), setErrors([{path, msg}]) → the errors it could not place, focusPath(path), rerender() }
     ===================================================================================================================== */
  let FORMS = 0;
  function form(opts) {
    const reg = opts.registry, L = opts.label || ((t, p) => t || p), H = opts.help || (() => ''), T = opts.text || (k => k);
    let doc = clone(opts.value);
    const el = document.createElement('div'); el.className = 'sf';
    const closed = new Set();   // collapsed array items, by path
    let uid = 0; const pre = 'sf' + (++FORMS) + '-';
    const h = (tag, attrs, ...kids) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
      }
      for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
      return e;
    };
    const ICONS = { up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M19 12l-7 7-7-7', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14' };
    const icon = k => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'sf-ico'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[k]); s.append(p); return s; };
    const iconBtn = (k, label, onclick, disabled) => h('button', { type: 'button', class: 'sf-ib', 'aria-label': label, title: label, onclick, disabled: !!disabled }, icon(k));
    const ps = path => JSON.stringify(path);
    function changed(structural) { if (structural) rerender(); opts.onChange?.(clone(doc), { structural: !!structural }); }
    function put(path, v, structural) { if (!path.length) doc = v; else setAt(doc, path, v); changed(structural); }

    function labelOf(s, prop) { return L(isObj(s) ? s.title : null, typeof prop === 'number' ? null : prop); }
    function field(path, s, prop, required, inner, onRemove, labelFor) {
      const lab = labelOf(s, prop), help = H(isObj(s) ? s.title : null, prop);
      const wrap = h('div', { class: 'sf-f', 'data-field': ps(path) });
      const head = h('div', { class: 'sf-fh' }, labelFor ? h('label', { class: 'sf-l', for: labelFor }, lab) : h('span', { class: 'sf-l' }, lab),
        !required && onRemove ? iconBtn('x', T('remove', { what: lab }), onRemove) : null);
      wrap.append(head);
      if (help) wrap.append(h('p', { class: 'sf-help', id: pre + 'h' + (++uid) }, help));
      wrap.append(inner);
      return wrap;
    }
    function render(n0, path, v, prop, required, onRemove) {
      const n = follow(reg, n0), s = n.s, t = typeOfSchema(reg, n);
      if (t === 'const') return null;
      if (t === 'object' && isObj(v)) return renderObject(n, path, v, prop, required, onRemove);
      if (t === 'array' && Array.isArray(v)) return renderArray(n, path, v, prop, required, onRemove);
      if (t === 'alt') return renderAlt(n, path, v, prop, required, onRemove);
      const id = pre + (++uid);
      let input;
      if (t === 'enum') {
        input = h('select', { id, class: 'sf-in', 'data-path': ps(path) });
        s.enum.forEach((x, i) => input.append(h('option', { value: String(i), text: optionLabel(s, x) })));
        const i = s.enum.findIndex(x => eq(x, v));
        if (i < 0) { input.append(h('option', { value: '-1', text: v === undefined ? '' : JSON.stringify(v) })); input.value = '-1'; } else input.value = String(i);
        input.addEventListener('change', () => { const k = +input.value; if (k >= 0) put(path, clone(s.enum[k]), true); });
      } else if (t === 'boolean' && typeof v === 'boolean') {
        input = h('input', { id, type: 'checkbox', class: 'sf-cb', 'data-path': ps(path) }); input.checked = v;
        input.addEventListener('change', () => put(path, input.checked, false));
      } else if ((t === 'number' || t === 'integer') && typeof v === 'number') {
        input = h('input', { id, type: 'text', inputmode: 'decimal', class: 'sf-in sf-num', 'data-path': ps(path), autocomplete: 'off', spellcheck: 'false' }); input.value = String(v);
        input.addEventListener('input', () => {
          const x = parseNum(input.value);
          const bad = x === null ? T('notNumber') : (t === 'integer' && !Number.isInteger(x)) ? T('notWhole') : null;
          localErr(input, bad);
          if (!bad) put(path, x, false);
        });
      } else if (t === 'string' && typeof v === 'string') {
        const long = s['x-noema'] === 'longtext';
        input = h(long ? 'textarea' : 'input', { id, class: 'sf-in' + (s['x-noema'] === 'expr' ? ' sf-mono' : ''), 'data-path': ps(path), autocomplete: 'off', spellcheck: s['x-noema'] ? 'false' : null, rows: long ? 3 : null, type: long ? null : 'text' });
        input.value = v;
        input.addEventListener('input', () => { put(path, input.value, false); });
      } else {   // anything else (a value of the wrong type, a schema without a type): edit as JSON, losslessly
        input = h('textarea', { id, class: 'sf-in sf-mono sf-json', 'data-path': ps(path), rows: 3, spellcheck: 'false' }); input.value = JSON.stringify(v === undefined ? null : v, null, 1);
        input.addEventListener('input', () => { let x; try { x = JSON.parse(input.value); } catch (e) { localErr(input, T('notJson')); return; } localErr(input, null); put(path, x, false); });
        input.addEventListener('change', () => { try { JSON.parse(input.value); rerender(); } catch (e) { } });
      }
      if (typeof s.minimum === 'number') input.setAttribute('aria-valuemin', s.minimum);
      if (typeof s.maximum === 'number') input.setAttribute('aria-valuemax', s.maximum);
      const w = field(path, s, prop, required, input, onRemove, id);
      if (s['x-noema'] && opts.decorate) opts.decorate(s['x-noema'], input, w, path);
      const hp = w.querySelector('.sf-help'); if (hp) input.setAttribute('aria-describedby', hp.id);
      return w;
    }
    function optionLabel(s, x) { return typeof x === 'string' ? L((s.title || 'opt') + '.' + x, null, x) : JSON.stringify(x); }
    function localErr(input, msg) {
      const w = input.closest('.sf-f'); let p = w && w.querySelector(':scope > .sf-lerr');
      if (!msg) { p?.remove(); input.removeAttribute('aria-invalid'); return; }
      if (!p) { p = h('p', { class: 'sf-err sf-lerr', role: 'alert', id: pre + 'e' + (++uid) }); w.append(p); }
      p.textContent = msg; input.setAttribute('aria-invalid', 'true');
    }
    function renderAlt(n, path, v, prop, required, onRemove) {
      const bs = branches(reg, n) || (Array.isArray(n.s.type) ? n.s.type.map(t => node({ type: t }, n.b)) : []);
      const bi = bs.length ? (n.s.oneOf || n.s.anyOf ? branchIndex(reg, n, v) : Math.max(0, bs.findIndex(b => typeOk(b.s.type, v)))) : 0;
      const id = pre + (++uid);
      const sel = h('select', { id, class: 'sf-in sf-alt', 'data-path': ps(path.concat('$alt')), 'aria-label': T('altOf', { what: labelOf(n.s, prop) }) });
      bs.forEach((b, i) => sel.append(h('option', { value: String(i), text: altLabel(b) })));
      sel.value = String(bi);
      sel.addEventListener('change', () => {
        const k = +sel.value, target = bs[k], tt = typeOfSchema(reg, target);
        let nv = skeleton(reg, target);
        if ((tt === 'number' || tt === 'integer') && typeof v === 'string' && parseNum(v) !== null) nv = parseNum(v);
        else if (tt === 'string' && typeof v === 'number') nv = String(v);
        put(path, nv, true);
      });
      const inner = bs.length ? render(bs[bi], path, v, null, true, null) : null;
      if (inner) { inner.classList.add('sf-altbody'); const hd = inner.querySelector(':scope > .sf-fh'); if (hd && !hd.querySelector('button')) hd.remove(); }
      const box = h('div', { class: 'sf-altrow' }, sel, inner);
      return field(path, n.s, prop, required, box, onRemove, id);
    }
    function altLabel(b) {
      const s = b.s;
      if (s.title) return L(s.title, null, s.title);
      const t = typeOfSchema(reg, b);
      if (t === 'object') { const f = flat(reg, b); if (f.required.length === 1) return L(null, f.required[0]); }
      return T('type.' + (t || 'any'));
    }
    function renderObject(n, path, v, prop, required, onRemove) {
      const ov = objectView(reg, n, v), view = ov.view;
      const box = h('div', { class: 'sf-obj' });
      // the discriminator first, as a select of the branches
      if (ov.d) {
        const id = pre + (++uid), d = ov.d, ds = view.properties[d.prop];
        const sel = h('select', { id, class: 'sf-in', 'data-path': ps(path.concat(d.prop)) });
        const multi = d.opts.length > d.values.length;   // a branch with several values (NPN | PNP): name each value, not the branch
        d.opts.forEach((o, i) => sel.append(h('option', { value: String(i), text: multi ? optionLabel(follow(reg, node(ds || {}, n.b)).s, o.value) : altLabelOf(ov.bs[o.branch], ds, o.value) })));
        const cur = d.opts.findIndex(o => eq(o.value, v[d.prop]));
        if (cur < 0) { sel.append(h('option', { value: '-1', text: v[d.prop] === undefined ? '' : JSON.stringify(v[d.prop]) })); sel.value = '-1'; } else sel.value = String(cur);
        sel.addEventListener('change', () => { const o = d.opts[+sel.value]; if (o) switchBranch(n, path, v, o.branch, o.value); });
        box.append(field(path.concat(d.prop), isObj(ds) && ds.title ? ds : (flat(reg, n).properties[d.prop] || {}), d.prop, true, sel, null, id));
      }
      const absent = [];
      for (const k of view.order) {
        if (ov.d && k === ov.d.prop) continue;
        const psch = view.properties[k], req = view.required.includes(k);
        if (!has(v, k)) { const fs = follow(reg, node(psch, view.bases[k])); if (typeOfSchema(reg, fs) !== 'const') absent.push([k, psch]); continue; }
        const r = render(node(psch, view.bases[k]), path.concat(k), v[k], k, req, () => { delete v[k]; changed(true); });
        if (r) box.append(r);
      }
      // a map (additionalProperties: a schema): its entries, renamable
      const extra = Object.keys(v).filter(k => !has(view.properties, k));
      if (isObj(view.additionalProperties) || view.additionalProperties === true && !view.order.length) {
        const as = view.additionalProperties === true ? {} : view.additionalProperties;
        const list = h('div', { class: 'sf-map' });
        for (const k of extra) {
          const kid = pre + (++uid);
          const name = h('input', { id: kid, class: 'sf-in sf-mono sf-key', 'data-path': ps(path.concat(k, '$key')), value: k, 'aria-label': T('entryName'), spellcheck: 'false', autocomplete: 'off' });
          name.addEventListener('change', () => { const nk = name.value.trim(); if (!nk || nk === k || has(v, nk)) { name.value = k; return; } const o = {}; for (const [a, b] of Object.entries(v)) o[a === k ? nk : a] = b; put(path, o, true); });
          if (view.propertyNames && opts.decorate) { const pn = follow(reg, node(view.propertyNames, n.b)); if (pn.s['x-noema']) opts.decorate(pn.s['x-noema'], name, list, path.concat(k, '$key')); }
          const val = render(node(as, n.b), path.concat(k), v[k], null, true, null);
          const row = h('div', { class: 'sf-mrow', 'data-field': ps(path.concat(k)) }, name, val, iconBtn('x', T('remove', { what: k }), () => { delete v[k]; changed(true); }));
          list.append(row);
        }
        const max = typeof view.maxProperties === 'number' ? view.maxProperties : Infinity;
        list.append(h('div', { class: 'sf-add' }, h('button', { type: 'button', class: 'btn small ghost sf-addbtn', disabled: Object.keys(v).length >= max, onclick: () => { let i = 1, k = 'k1'; while (has(v, k)) k = 'k' + (++i); v[k] = skeleton(reg, node(as, n.b)); changed(true); focusPath(path.concat(k, '$key')); } }, icon('plus'), T('addEntry'))));
        box.append(list);
      } else for (const k of extra) {   // fields this schema does not describe: kept as they are, editable as JSON
        const r = render(node({}, n.b), path.concat(k), v[k], k, false, () => { delete v[k]; changed(true); });
        r.classList.add('sf-unknown'); box.append(r);
      }
      if (absent.length) {
        const sel = h('select', { class: 'sf-in sf-more', 'aria-label': T('addField'), 'data-path': ps(path.concat('$add')) });
        sel.append(h('option', { value: '', text: T('addField') }));
        for (const [k, s] of absent) sel.append(h('option', { value: k, text: labelOf(isObj(s) && s.title ? s : follow(reg, node(s, view.bases[k])).s, k) }));
        sel.addEventListener('change', () => { const k = sel.value; if (!k) return; const s = view.properties[k]; v[k] = skeleton(reg, node(s, view.bases[k])); changed(true); focusPath(path.concat(k)); });
        box.append(h('div', { class: 'sf-add' }, sel));
      }
      if (!path.length) return box;
      if (typeof prop === 'number') return box;   // an array item: its card is the frame
      const fs = h('fieldset', { class: 'sf-fs', 'data-field': ps(path) }, h('legend', { class: 'sf-l' }, labelOf(n.s, prop)));
      if (!required && onRemove) fs.append(h('div', { class: 'sf-fsx' }, iconBtn('x', T('remove', { what: labelOf(n.s, prop) }), onRemove)));
      const help = H(n.s.title, prop); if (help) fs.append(h('p', { class: 'sf-help' }, help));
      fs.append(box);
      return fs;
    }
    function altLabelOf(b, ds, x) { return b && b.s.title ? L(b.s.title, null, String(x)) : optionLabel(follow(reg, node(ds || {}, b ? b.b : null)).s, x); }
    function switchBranch(n, path, v, k, value) {
      const ov = objectView(reg, n, v), bsViews = ov.bs.map(b => flat(reg, b));
      const known = new Set(bsViews.flatMap(b => b.order)), base = flat(reg, n);
      const target = objectView(reg, n, { [ov.d.prop]: value });
      const nv = {};
      for (const [a, b] of Object.entries(v)) if (has(base.properties, a) || has(target.view.properties, a) || !known.has(a)) nv[a] = b;
      nv[ov.d.prop] = clone(value);
      const sk = skeletonOfBranch(reg, n, k, value); for (const [a, b] of Object.entries(sk)) if (!has(nv, a)) nv[a] = b;
      put(path, nv, true);
    }
    function renderArray(n, path, v, prop, required, onRemove) {
      const s = n.s, items = node(s.items || {}, n.b), max = typeof s.maxItems === 'number' ? s.maxItems : Infinity, min = s.minItems || 0;
      const lab = labelOf(s, prop);
      const list = h('ol', { class: 'sf-arr' });
      v.forEach((x, i) => {
        const ip = path.concat(i), key = ps(ip);
        const ctrls = h('span', { class: 'sf-ctl' },
          iconBtn('up', T('up', { n: i + 1 }), () => { [v[i - 1], v[i]] = [v[i], v[i - 1]]; changed(true); focusPath(path.concat(i - 1), '.sf-ib[data-dir=up]'); }, i === 0),
          iconBtn('down', T('down', { n: i + 1 }), () => { [v[i + 1], v[i]] = [v[i], v[i + 1]]; changed(true); focusPath(path.concat(i + 1)); }, i === v.length - 1),
          iconBtn('x', T('removeItem', { n: i + 1 }), () => { v.splice(i, 1); changed(true); }, v.length <= min));
        const body = render(items, ip, x, i, true, null);
        const it = follow(reg, items), isObjItem = typeOfSchema(reg, it) === 'object' && isObj(x);
        if (isObjItem) {
          const det = h('details', { class: 'sf-item', 'data-field': key }); if (!closed.has(key)) det.open = true;
          det.addEventListener('toggle', () => { if (det.open) closed.delete(key); else closed.add(key); });
          det.append(h('summary', { class: 'sf-sum' }, h('span', { class: 'sf-n' }, String(i + 1)), h('span', { class: 'sf-st' }, summaryOf(x)), ctrls));
          ctrls.addEventListener('click', e => e.stopPropagation());
          det.append(body); list.append(h('li', {}, det));
        } else {
          if (body) { const hd = body.querySelector(':scope > .sf-fh'); if (hd) hd.remove(); body.classList.add('sf-row'); }
          list.append(h('li', { class: 'sf-item sf-prim', 'data-field': key }, h('span', { class: 'sf-n' }, String(i + 1)), body, ctrls));
        }
      });
      const add = h('button', { type: 'button', class: 'btn small ghost sf-addbtn', disabled: v.length >= max, 'aria-label': T('addTo', { what: lab }), onclick: () => { v.push(skeleton(reg, items)); changed(true); focusPath(path.concat(v.length - 1)); } }, icon('plus'), T('add'));
      const box = h('div', { class: 'sf-arrbox' }, list, h('div', { class: 'sf-add' }, add, max < Infinity ? h('small', { class: 'sf-cnt' }, T('count', { n: v.length, max })) : null));
      const fs = h('fieldset', { class: 'sf-fs', 'data-field': ps(path) }, h('legend', { class: 'sf-l' }, lab));
      if (!required && onRemove) fs.append(h('div', { class: 'sf-fsx' }, iconBtn('x', T('remove', { what: lab }), onRemove)));
      const help = H(s.title, prop); if (help) fs.append(h('p', { class: 'sf-help' }, help));
      fs.append(box);
      return fs;
    }
    function summaryOf(x) {
      const bits = [];
      for (const k of ['id', 'label', 'kind', 'type', 'element', 'expr', 'title']) if (typeof x[k] === 'string' && x[k] && bits.length < 2) bits.push(x[k].length > 28 ? x[k].slice(0, 27) + '…' : x[k]);
      return bits.join(' · ');
    }
    function rerender() {
      const a = document.activeElement, fp = a && el.contains(a) ? a.getAttribute('data-path') : null, sel = fp && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
      uid = 0; el.innerHTML = '';
      const r = render(node(opts.schema, opts.base || opts.schema.$id), [], doc, null, true, null);
      if (r) el.append(r);
      if (fp) { const b = el.querySelector(`[data-path="${CSS.escape(fp)}"]`); if (b) { b.focus({ preventScroll: true }); if (sel) try { b.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
      opts.onRender?.();
    }
    function focusPath(path) {
      requestAnimationFrame(() => {
        const f = el.querySelector(`[data-field="${CSS.escape(ps(path))}"]`) || el.querySelector(`[data-path^="${CSS.escape(ps(path).slice(0, -1))}"]`);
        const t = f && (f.matches('input,select,textarea') ? f : f.querySelector('input,select,textarea,summary'));
        t?.focus();
      });
    }
    /** show validator messages at their fields; → the ones that have no field (shown by the caller in its summary) */
    function setErrors(list) {
      el.querySelectorAll('.sf-err:not(.sf-lerr):not(.sf-keep)').forEach(e => e.remove());
      el.querySelectorAll('[aria-invalid="true"]').forEach(i => { if (!i.closest('.sf-f')?.querySelector(':scope > .sf-lerr')) i.removeAttribute('aria-invalid'); });
      const left = [];
      for (const e of list) {
        let p = e.path.slice(), f = null;
        while (true) { f = el.querySelector(`[data-field="${CSS.escape(ps(p))}"]`); if (f || !p.length) break; p.pop(); }
        if (!f || !p.length && !e.path.length) { left.push(e); continue; }
        const msg = h('p', { class: 'sf-err', role: 'alert', id: pre + 'e' + (++uid), text: e.msg });
        if (f.tagName === 'DETAILS') { f.open = true; f.querySelector('summary').after(msg); }
        else if (f.tagName === 'FIELDSET') f.querySelector('legend').after(msg);
        else f.append(msg);
        const inp = f.matches('.sf-f') ? f.querySelector('input,select,textarea') : null;
        if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', ((inp.getAttribute('aria-describedby') || '') + ' ' + msg.id).trim()); }
      }
      return left;
    }
    rerender();
    return { el, get: () => clone(doc), set(v) { doc = clone(v); rerender(); }, setErrors, focusPath, rerender, at: p => clone(getAt(doc, p)) };
  }
  /** "4,7" → 4.7; "1e-9" → 1e-9; anything else → null */
  function parseNum(t) { const s = String(t).trim().replace(/^−/, '-').replace(',', '.'); if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null; const x = Number(s); return isFinite(x) ? x : null; }

  /** visit every value of a document with its (followed) schema: fn(path, schema, value) — the x-noema fields of a spec, its keys */
  function walk(reg, n0, v, path, fn, depth = 0) {
    if (depth > 40) return;
    const n = follow(reg, n0), t = typeOfSchema(reg, n);
    fn(path, n.s, v, n.b);
    if (t === 'object' && isObj(v)) {
      const { view } = objectView(reg, n, v);
      for (const k of Object.keys(v)) {
        if (has(view.properties, k)) walk(reg, node(view.properties[k], view.bases[k]), v[k], path.concat(k), fn, depth + 1);
        else if (isObj(view.additionalProperties)) walk(reg, node(view.additionalProperties, n.b), v[k], path.concat(k), fn, depth + 1);
      }
    } else if (t === 'array' && Array.isArray(v) && n.s.items != null) v.forEach((x, i) => walk(reg, node(n.s.items, n.b), x, path.concat(i), fn, depth + 1));
    else if (t === 'alt' && v !== undefined) { const bs = branches(reg, n); if (bs) walk2(reg, bs[branchIndex(reg, n, v)], v, path, fn, depth + 1); }
  }
  function walk2(reg, n, v, path, fn, depth) { const t = typeOfSchema(reg, n); if (t === 'object' || t === 'array') walk(reg, n, v, path, fn, depth); else fn(path, n.s, v, n.b); }

  /* i18n-ignore-end */
  const API = { walk: (reg, s, v, fn, base) => walk(reg, node(s, base || s.$id), v, [], fn), registry, validate, skeleton: (reg, s, base) => skeleton(reg, node(s, base || s.$id)), branchIndex: (reg, s, v, base) => branchIndex(reg, follow(reg, node(s, base || s.$id)), v),
    objectView: (reg, s, v, base) => objectView(reg, follow(reg, node(s, base || s.$id)), v), typeOf: (reg, s, base) => typeOfSchema(reg, follow(reg, node(s, base || s.$id))),
    pathStr, parsePath, getAt, setAt, delAt, parseNum, clone, form };
  root.NoemaSchemaForm = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
