/**
 * The form of a JSON document under its schema (docs/activities-dev/authoring_ui.md): the view of every value (`formTree`,
 * which `noema-schema-form` draws) and the edits on it (`applyIntent`). The document is plain JSON, the source of truth: an
 * edit changes it only at its own path, so a document read back is the document given, unknown fields included (a lossless
 * round trip). Labels: a schema's `title` is a KEY; `FormWords.label(title, prop)` gives the words.
 */
import type {
  AltField,
  ArrayField,
  ArrayItem,
  FieldNode,
  FieldOption,
  FieldPath,
  FormIntent,
  FormResult,
  InputField,
  MapEntry,
  ObjectField,
  SchemaFormModel,
} from '../../../ports/authoring.ts';
import {
  branches,
  branchIndex,
  clone,
  delAt,
  eq,
  flat,
  follow,
  getAt,
  has,
  isObj,
  node,
  objectView,
  parseNum,
  setAt,
  skeleton,
  skeletonOfBranch,
  typeOfSchema,
  typeOk,
  type Obj,
  type Registry,
  type SNode,
} from './schema.ts';

/** the words of a form: a field's label from its schema's title (a key) or its property, its help, the controls' words */
export interface FormWords {
  label(title: string | null, prop: string | null, fallback?: string): string;
  help(title: string | null, prop: string | null): string;
  text(key: string, vars?: Readonly<Record<string, string | number>>): string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const titleOf = (s: unknown): string | null => (isObj(s) ? str(s['title']) : null);
const propName = (prop: string | number | null): string | null => (typeof prop === 'string' ? prop : null);

/** the alternatives of an "alt" node: its branches, or one node per type of a type list */
function altBranches(n: SNode): SNode[] {
  const t = n.s['type'];
  return Array.isArray(t) ? (t as unknown[]).map(x => node({ type: x }, n.b)) : [];
}
function altIndex(reg: Registry, n: SNode, bs: readonly SNode[], v: unknown): number {
  if (!bs.length) return 0;
  if (n.s['oneOf'] || n.s['anyOf']) return branchIndex(reg, n, v);
  return Math.max(
    0,
    bs.findIndex(b => typeOk(b.s['type'], v)),
  );
}
/** an alternative followed to the branch its value takes (alternatives inside alternatives too) */
function resolveAlt(reg: Registry, n0: SNode, v: unknown): SNode {
  let n = follow(reg, n0);
  for (let g = 0; g < 16 && typeOfSchema(reg, n) === 'alt'; g++) {
    const bs = branches(reg, n) ?? altBranches(n);
    const b = bs[altIndex(reg, n, bs, v)];
    if (!b) break;
    n = follow(reg, b);
  }
  return n;
}
/** the schema of the value at key k under n, as the form draws it */
function child(reg: Registry, n0: SNode, v: unknown, k: string | number): SNode {
  const n = resolveAlt(reg, n0, v),
    t = typeOfSchema(reg, n);
  if (t === 'object' && isObj(v)) {
    const { view } = objectView(reg, n, v);
    const key = String(k);
    if (has(view.properties, key)) return node(view.properties[key], view.bases[key]);
    if (isObj(view.additionalProperties)) return node(view.additionalProperties, n.b);
    return node({}, n.b);
  }
  if (t === 'array') return node(n.s['items'] ?? {}, n.b);
  return node({}, n.b);
}
/** the schema node at a path of the document (an alternative at the end is not followed into its branch) */
export function nodeAt(reg: Registry, root: SNode, doc: unknown, path: FieldPath): SNode {
  let n = follow(reg, root),
    v = doc;
  for (const k of path) {
    n = follow(reg, child(reg, n, v, k));
    v = getAt(v, [k]);
  }
  return n;
}

/** the summary of an array item's card: its id, label, kind … (two at most) */
export function summaryOf(x: Obj): string {
  const bits: string[] = [];
  for (const k of ['id', 'label', 'kind', 'type', 'element', 'expr', 'title']) {
    const s = x[k];
    if (typeof s === 'string' && s && bits.length < 2) bits.push(s.length > 28 ? s.slice(0, 27) + '…' : s);
  }
  return bits.join(' · ');
}

/** The view of `doc` under the schema node `root`: the tree of fields (null when the root is a constant). */
export function formTree(reg: Registry, root: SNode, doc: unknown, W: FormWords): FieldNode | null {
  const labelOf = (s: unknown, prop: string | number | null): string => W.label(titleOf(s), propName(prop));
  const helpOf = (s: unknown, prop: string | number | null): string => W.help(titleOf(s), propName(prop));
  const optionLabel = (s: Obj, x: unknown): string =>
    typeof x === 'string' ? W.label((str(s['title']) ?? 'opt') + '.' + x, null, x) : JSON.stringify(x);

  function render(
    n0: SNode,
    path: FieldPath,
    v: unknown,
    prop: string | number | null,
    required: boolean,
    removable: boolean,
  ): FieldNode | null {
    const n = follow(reg, n0),
      s = n.s,
      t = typeOfSchema(reg, n);
    if (t === 'const') return null;
    if (t === 'object' && isObj(v)) return renderObject(n, path, v, prop, required, removable);
    if (t === 'array' && Array.isArray(v)) return renderArray(n, path, v, prop, required, removable);
    if (t === 'alt') return renderAlt(n, path, v, prop, required, removable);
    const base = { path, label: labelOf(s, prop), help: helpOf(s, prop), required, removable: !required && removable };
    const hint = str(s['x-noema']);
    const lim = {
      ...(typeof s['minimum'] === 'number' ? { min: s['minimum'] } : {}),
      ...(typeof s['maximum'] === 'number' ? { max: s['maximum'] } : {}),
    };
    let f: InputField;
    if (t === 'enum') {
      const en = s['enum'] as unknown[];
      const options: FieldOption[] = en.map((x, i) => ({ value: String(i), label: optionLabel(s, x) }));
      const i = en.findIndex(x => eq(x, v));
      if (i < 0) options.push({ value: '-1', label: v === undefined ? '' : JSON.stringify(v) });
      f = { kind: 'input', ...base, control: 'select', value: String(i < 0 ? -1 : i), options, mono: false, hint, ...lim };
    } else if (t === 'boolean' && typeof v === 'boolean')
      f = { kind: 'input', ...base, control: 'checkbox', value: v, mono: false, hint, ...lim };
    else if ((t === 'number' || t === 'integer') && typeof v === 'number')
      f = { kind: 'input', ...base, control: t, value: String(v), mono: true, hint, ...lim };
    else if (t === 'string' && typeof v === 'string') {
      const long = hint === 'longtext';
      f = { kind: 'input', ...base, control: long ? 'textarea' : 'text', value: v, mono: hint === 'expr', hint, ...lim };
    } else
      f = {
        kind: 'input',
        ...base,
        control: 'json',
        value: JSON.stringify(v === undefined ? null : v, null, 1),
        mono: true,
        hint,
        ...lim,
      };
    return f;
  }
  function altLabel(b: SNode): string {
    const t = titleOf(b.s);
    if (t) return W.label(t, null, t);
    const k = typeOfSchema(reg, b);
    if (k === 'object') {
      const f = flat(reg, b);
      if (f.required.length === 1 && f.required[0]) return W.label(null, f.required[0]);
    }
    return W.text('type.' + (k ?? 'any'));
  }
  function renderAlt(n: SNode, path: FieldPath, v: unknown, prop: string | number | null, required: boolean, removable: boolean): AltField {
    const bs = branches(reg, n) ?? altBranches(n);
    const bi = altIndex(reg, n, bs, v);
    const b = bs[bi];
    const inner = b ? render(b, path, v, null, true, false) : null;
    return {
      kind: 'alt',
      path,
      label: labelOf(n.s, prop),
      help: helpOf(n.s, prop),
      required,
      removable: !required && removable,
      options: bs.map((x, i) => ({ value: String(i), label: altLabel(x) })),
      selected: String(bi),
      body: inner && (inner.kind === 'input' || inner.kind === 'alt') ? { ...inner, bare: true } : inner,
    };
  }
  function renderObject(
    n: SNode,
    path: FieldPath,
    v: Obj,
    prop: string | number | null,
    required: boolean,
    removable: boolean,
  ): ObjectField {
    const ov = objectView(reg, n, v),
      view = ov.view;
    let disc: ObjectField['disc'] = null;
    if (ov.d) {
      const d = ov.d,
        ds = view.properties[d.prop];
      const multi = d.opts.length > d.values.length; // a branch with several values (NPN | PNP): name each value, not the branch
      const options: FieldOption[] = d.opts.map((o, i) => {
        const br = ov.bs?.[o.branch];
        const label = multi
          ? optionLabel(follow(reg, node(ds ?? {}, n.b)).s, o.value)
          : br && titleOf(br.s)
            ? W.label(titleOf(br.s), null, String(o.value))
            : optionLabel(follow(reg, node(ds ?? {}, br ? br.b : undefined)).s, o.value);
        return { value: String(i), label };
      });
      const cur = d.opts.findIndex(o => eq(o.value, v[d.prop]));
      if (cur < 0) options.push({ value: '-1', label: v[d.prop] === undefined ? '' : JSON.stringify(v[d.prop]) });
      const dsch = isObj(ds) && ds['title'] ? ds : (flat(reg, n).properties[d.prop] ?? {});
      disc = { path: [...path, d.prop], label: labelOf(dsch, d.prop), help: helpOf(dsch, d.prop), options, selected: String(cur) };
    }
    const fields: FieldNode[] = [],
      absent: FieldOption[] = [];
    for (const k of view.order) {
      if (ov.d && k === ov.d.prop) continue;
      const psch = view.properties[k],
        req = view.required.includes(k);
      if (!has(v, k)) {
        const fs = follow(reg, node(psch, view.bases[k]));
        if (typeOfSchema(reg, fs) !== 'const') absent.push({ value: k, label: labelOf(isObj(psch) && psch['title'] ? psch : fs.s, k) });
        continue;
      }
      const r = render(node(psch, view.bases[k]), [...path, k], v[k], k, req, true);
      if (r) fields.push(r);
    }
    // a map (additionalProperties: a schema): its entries, renamable; else fields this schema does not describe, kept as JSON
    const extra = Object.keys(v).filter(k => !has(view.properties, k));
    let map: ObjectField['map'] = null;
    if (isObj(view.additionalProperties) || (view.additionalProperties === true && !view.order.length)) {
      const as = view.additionalProperties === true ? {} : view.additionalProperties;
      const keyHint = view.propertyNames != null ? str(follow(reg, node(view.propertyNames, n.b)).s['x-noema']) : null;
      const entries: MapEntry[] = extra.map(k => ({
        key: k,
        path: [...path, k],
        keyHint,
        value: render(node(as, n.b), [...path, k], v[k], null, true, false),
      }));
      const max = typeof view.maxProperties === 'number' ? view.maxProperties : Infinity;
      map = { entries, canAdd: Object.keys(v).length < max };
    } else
      for (const k of extra) {
        const r = render(node({}, n.b), [...path, k], v[k], k, false, true);
        if (r) fields.push(r.kind === 'input' ? { ...r, unknown: true } : r);
      }
    const frame = !path.length ? 'root' : typeof prop === 'number' ? 'item' : 'fieldset';
    return {
      kind: 'object',
      path,
      label: labelOf(n.s, prop),
      help: helpOf(n.s, prop),
      required,
      removable: frame === 'fieldset' && !required && removable,
      frame,
      disc,
      fields,
      map,
      absent,
    };
  }
  function renderArray(
    n: SNode,
    path: FieldPath,
    v: readonly unknown[],
    prop: string | number | null,
    required: boolean,
    removable: boolean,
  ): ArrayField {
    const s = n.s,
      items = node(s['items'] ?? {}, n.b);
    const max = typeof s['maxItems'] === 'number' ? s['maxItems'] : null,
      min = typeof s['minItems'] === 'number' ? s['minItems'] : 0;
    const it = follow(reg, items),
      objItems = typeOfSchema(reg, it) === 'object';
    const list: ArrayItem[] = v.map((x, i) => {
      const ip = [...path, i];
      const body = render(items, ip, x, i, true, false);
      const object = objItems && isObj(x);
      return {
        index: i,
        path: ip,
        object,
        summary: object ? summaryOf(x) : '',
        body: body && !object && (body.kind === 'input' || body.kind === 'alt') ? { ...body, bare: true } : body,
      };
    });
    return {
      kind: 'array',
      path,
      label: labelOf(s, prop),
      help: helpOf(s, prop),
      required,
      removable: !required && removable,
      items: list,
      canAdd: max === null || v.length < max,
      min,
      max,
    };
  }
  return render(root, [], doc, null, true, false);
}

/** Applies one edit to a copy of `value` (the document under `root`). */
export function applyIntent(reg: Registry, root: SNode, value: unknown, intent: FormIntent, W: FormWords): FormResult {
  const doc = clone(value),
    path = intent.path;
  const put = (p: FieldPath, x: unknown, structural: boolean, focus?: FieldPath): FormResult => ({
    value: setAt(doc, p, x),
    structural,
    ...(focus ? { focus } : {}),
  });
  const same = (structural = false): FormResult => ({ value: doc, structural });
  const at = getAt(doc, path);
  switch (intent.op) {
    case 'input': {
      const n = resolveAlt(reg, nodeAt(reg, root, doc, path), at),
        raw = intent.raw;
      if (intent.control === 'select') {
        const k = Number(raw),
          en = Array.isArray(n.s['enum']) ? (n.s['enum'] as unknown[]) : [];
        return k >= 0 && k < en.length ? put(path, clone(en[k]), true) : same();
      }
      if (intent.control === 'checkbox') return put(path, raw === true, false);
      if (intent.control === 'number' || intent.control === 'integer') {
        const x = parseNum(raw);
        const bad = x === null ? W.text('notNumber') : intent.control === 'integer' && !Number.isInteger(x) ? W.text('notWhole') : null;
        return bad || x === null ? { value: doc, structural: false, error: bad ?? '' } : put(path, x, false);
      }
      if (intent.control === 'json') {
        try {
          return put(path, JSON.parse(String(raw)) as unknown, false);
        } catch {
          return { value: doc, structural: false, error: W.text('notJson') };
        }
      }
      return put(path, String(raw), false);
    }
    case 'remove': {
      delAt(doc, path);
      return { value: path.length ? doc : null, structural: true };
    }
    case 'add': {
      if (!isObj(at)) return same();
      const n = resolveAlt(reg, nodeAt(reg, root, doc, path), at),
        { view } = objectView(reg, n, at);
      at[intent.prop] = skeleton(reg, node(view.properties[intent.prop], view.bases[intent.prop]));
      return { value: doc, structural: true, focus: [...path, intent.prop] };
    }
    case 'push': {
      if (!Array.isArray(at)) return same();
      const n = resolveAlt(reg, nodeAt(reg, root, doc, path), at);
      (at as unknown[]).push(skeleton(reg, node(n.s['items'] ?? {}, n.b)));
      return { value: doc, structural: true, focus: [...path, at.length - 1] };
    }
    case 'move': {
      if (!Array.isArray(at) || intent.to < 0 || intent.to >= at.length) return same();
      const a = at as unknown[],
        x = a[intent.from];
      a[intent.from] = a[intent.to];
      a[intent.to] = x;
      return { value: doc, structural: true, focus: [...path, intent.to] };
    }
    case 'branch': {
      if (!isObj(at)) return same();
      const n = resolveAlt(reg, nodeAt(reg, root, doc, path), at),
        ov = objectView(reg, n, at),
        o = ov.d?.opts[intent.option];
      if (!ov.d || !ov.bs || !o) return same();
      const known = new Set(ov.bs.flatMap(b => flat(reg, b).order)),
        base = flat(reg, n);
      const target = objectView(reg, n, { [ov.d.prop]: o.value });
      const nv: Obj = {};
      for (const [a, b] of Object.entries(at)) if (has(base.properties, a) || has(target.view.properties, a) || !known.has(a)) nv[a] = b;
      nv[ov.d.prop] = clone(o.value);
      const sk = skeletonOfBranch(reg, n, o.branch, o.value);
      if (isObj(sk)) for (const [a, b] of Object.entries(sk)) if (!has(nv, a)) nv[a] = b;
      return put(path, nv, true);
    }
    case 'alt': {
      const n = nodeAt(reg, root, doc, path),
        bs = branches(reg, n) ?? altBranches(n),
        target = bs[intent.option];
      if (!target) return same();
      const tt = typeOfSchema(reg, target);
      let nv = skeleton(reg, target);
      const asNum = typeof at === 'string' ? parseNum(at) : null;
      if ((tt === 'number' || tt === 'integer') && asNum !== null) nv = asNum;
      else if (tt === 'string' && typeof at === 'number') nv = String(at);
      return put(path, nv, true);
    }
    case 'entry': {
      if (!isObj(at)) return same();
      const n = resolveAlt(reg, nodeAt(reg, root, doc, path), at),
        { view } = objectView(reg, n, at);
      const as = isObj(view.additionalProperties) ? view.additionalProperties : {};
      let i = 1,
        k = 'k1';
      while (has(at, k)) k = `k${++i}`;
      at[k] = skeleton(reg, node(as, n.b));
      return { value: doc, structural: true, focus: [...path, k, '$key'] };
    }
    case 'rename': {
      const nk = intent.to.trim();
      if (!isObj(at) || !nk || nk === intent.from || has(at, nk)) return same(true);
      const o: Obj = {};
      for (const [a, b] of Object.entries(at)) o[a === intent.from ? nk : a] = b;
      return put(path, o, true);
    }
  }
}

/** A form over one schema of the registry: its tree and its edits (the SchemaFormModel of the authoring port). */
export function schemaForm(reg: Registry, schema: unknown, base: string | undefined, W: FormWords): SchemaFormModel {
  const root = node(schema, base ?? (isObj(schema) && typeof schema['$id'] === 'string' ? schema['$id'] : undefined));
  return {
    tree: v => formTree(reg, root, v, W),
    apply: (v, intent) => applyIntent(reg, root, v, intent, W),
    text: (k, vars) => W.text(k, vars),
  };
}
