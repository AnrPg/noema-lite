/**
 * The activity author (docs/activities-dev/authoring_ui.md; ADR 001 D12 "an authoring UI generated from the same JSON Schemas
 * as the validators"):
 * • Kinds: sim-spec@1 with formula@1 or circuit-mna@1 (registerType() for later runtimes), and EVERY engine of the library whose
 *   module exports its `table` (docs/INTERACTIVE_LIBRARY.md §1.5): its form comes from that table (the schema kernel's
 *   specSchema); several engines in one spec (parts, docs/INTERACTIVE.md §12.8), each part with the form of its engine.
 * • Checks at the field: the schema, then the validators' own rules (checkSimSpec, checkActivities) — the same messages as
 *   activity_lint.py, make_pack.py and the connector; every formula through the expression language with the declared names.
 * • Files: the activity folder (activities/activities.json, activities/<id>/spec.json, strings.<locale>.json), one .zip.
 * No DOM: the screens are src/ui/screens/author; the node suites call it through build/noema-tools.cjs (tests/activity_author.js).
 */
import type {
  AuthorDoc,
  AuthorKind,
  AuthorLists,
  AuthorProblem,
  AuthorService,
  FieldPath,
  KindPick,
  SchemaFormModel,
} from '../../../ports/authoring.ts';
import {
  allOutputs,
  firstSlider,
  files,
  fromFiles,
  fromRef,
  idsIn,
  item,
  itemEdited,
  KEY_RE,
  LOC_RE,
  namesAt,
  partOf,
  partSub,
  REG_ID,
  SIM_ID,
  tables,
} from '../domain/activity.ts';
import { schemaForm, type FormWords } from '../domain/form.ts';
import {
  clone,
  getAt,
  isObj,
  node,
  parsePath,
  pathStr,
  registry as makeRegistry,
  skeleton,
  validate,
  walk,
  type Obj,
  type Registry,
} from '../domain/schema.ts';
import { unzip, zip } from '../domain/zip.ts';
import type { AuthorDeps, AuthorEngineModule } from './ports.ts';

/** a kind of activity */
export interface ActivityType {
  readonly id: string;
  /** a catalog key (engine.author.<label>) */
  readonly label?: string;
  readonly runtime: string;
  /** the $id of its spec's schema */
  readonly schema: string;
  match(doc: AuthorDoc): boolean;
  blank(): AuthorDoc;
  convert?(doc: AuthorDoc): AuthorDoc;
  readonly lib?: boolean;
  readonly engine?: string;
  readonly slug?: string;
  readonly parts?: boolean;
}
export interface LibEngine {
  readonly id: string;
  readonly slug: string;
  readonly M: AuthorEngineModule & { readonly table: Readonly<Record<string, unknown>> };
}

/** = ENGINE_GROUPS of the engines' page (#/engines), used when the page gives none */
const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['math', ['formula@1', 'ode@1', 'prob@1', 'graph@1', 'geom@1']],
  ['life', ['genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1']],
  ['arts', ['timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1']],
];
const CIRCUIT_MODEL = (): Obj => ({
  netlist: {
    format: 'noema.circuit/v1',
    nodes: ['in', 'out'],
    elements: [
      { id: 'V1', type: 'V', n: ['in', 'gnd'], value: 5 },
      { id: 'R1', type: 'R', n: ['in', 'out'], value: 1000 },
      { id: 'C1', type: 'C', n: ['out', 'gnd'], value: 1e-6 },
    ],
  },
  bindings: [{ element: 'V1', expr: 'Vs' }],
  transient: { tEnd: 0.01 },
});
const under = (p: FieldPath, q: FieldPath): boolean => q.length <= p.length && q.every((x, i) => p[i] === x);
const asObj = (v: unknown): Obj => (isObj(v) ? v : {});

export type Authoring = ReturnType<typeof createAuthoring>;

/** The author over its dependencies (looked up at every use: the page loads the engines and the checks lazily). */
export function createAuthoring(deps: AuthorDeps) {
  const W = deps.words;
  /** a word of the author (engine.author.<k>), or null when the catalogs do not have it (a label then falls back to the field's name) */
  function T(k: string, vars?: Readonly<Record<string, string | number>>): string | null {
    const full = 'engine.author.' + k;
    return W.has(full) ? W.t(full, vars) : null;
  }
  const TT = (k: string, vars?: Readonly<Record<string, string | number>>): string => T(k, vars) ?? k;
  const engWord = (slug: string, k: string): string | null => {
    const key = 'engine.engines.' + slug + '.' + k;
    return W.has(key) ? W.t(key) : null;
  };
  const ENG = () => deps.engines();
  const LS = () => ENG()?.schema() ?? null;
  /** a part's engine in a select: its catalogue name and id */
  function engLabel(id: string): string {
    const e = ENG()?.catalog.byId(id) ?? null;
    const n = e?.slug ? engWord(e.slug, 'name') : id === 'circuit-mna@1' ? engWord('circuit', 'name') : null;
    return n ? `${n} (${id})` : id;
  }
  const label = (title: string | null, prop: string | null, fallback?: string): string =>
    (title?.startsWith('eng.') ? engLabel(title.slice(4)) : null) ||
    (title ? T('f.' + title) : null) ||
    (title?.startsWith('lib.') ? fallback || title.slice(4) : null) ||
    (prop ? T('p.' + prop) : null) ||
    fallback ||
    prop ||
    title ||
    '';
  const help = (title: string | null): string => (title ? T('h.' + title) : null) ?? '';
  const words: FormWords = { label, help: t => help(t), text: (k, v) => TT(k, v) };

  /* ---------- the kinds ---------- */
  const TYPES: ActivityType[] = [];
  /** adds a kind of activity (or replaces the one with its id) */
  function registerType(def: ActivityType): void {
    const i = TYPES.findIndex(t => t.id === def.id);
    if (i >= 0) TYPES[i] = def;
    else TYPES.push(def);
  }
  const rt = (d: AuthorDoc): boolean => d.item['runtime'] === 'sim-spec@1';
  registerType({
    id: 'sim-formula',
    label: 'type.formula',
    runtime: 'sim-spec@1',
    schema: SIM_ID,
    match: d => rt(d) && (d.spec['engine'] ?? 'formula@1') === 'formula@1' && !('parts' in d.spec),
    blank: () => ({
      item: item('my-activity'),
      spec: { format: 'noema.sim-spec/v1', engine: 'formula@1', params: [firstSlider()] },
      strings: tables(['x']),
    }),
    convert(d) {
      const s = d.spec;
      s['engine'] = 'formula@1';
      delete s['model'];
      delete s['outputs'];
      delete s['bench'];
      if (Array.isArray(s['plots'])) s['plots'] = (s['plots'] as unknown[]).filter(p => !isObj(p) || p['kind'] !== 'series');
      if (Array.isArray(s['plots']) && !s['plots'].length) delete s['plots'];
      return d;
    },
  });
  registerType({
    id: 'sim-circuit',
    label: 'type.circuit',
    runtime: 'sim-spec@1',
    schema: SIM_ID,
    match: d => rt(d) && d.spec['engine'] === 'circuit-mna@1',
    blank: () => ({
      item: item('my-circuit'),
      spec: {
        format: 'noema.sim-spec/v1',
        engine: 'circuit-mna@1',
        params: [{ id: 'Vs', kind: 'slider', label: 'vs', min: 0, max: 10, default: 5, unit: 'V' }],
        model: CIRCUIT_MODEL(),
        outputs: [
          { id: 't', kind: 'series', time: true },
          { id: 'vout', kind: 'series', node: 'out' },
        ],
        plots: [{ kind: 'series', x: { series: 't', label: 'time', unit: 's' }, series: [{ y: 'vout', label: 'vout' }] }],
      },
      strings: tables(['vs', 'time', 'vout']),
    }),
    convert(d) {
      d.spec['engine'] = 'circuit-mna@1';
      if (!isObj(d.spec['model'])) d.spec['model'] = CIRCUIT_MODEL();
      return d;
    },
  });

  /* ---------- the engine library: a kind for every engine whose module exports its table ---------- */
  /** the library engines here: catalogue entries whose module is loaded with its checker and table (and runnable in this app) */
  function libEngines(): LibEngine[] {
    const L = ENG(),
      out: LibEngine[] = [];
    if (!L || !LS()) return out;
    for (const e of L.catalog.CATALOG) {
      const M = e.layer === 'library' && e.plugin ? L.loaded(e.id) : null;
      if (!M || typeof M.checkSpec !== 'function' || !isObj(M.table)) continue;
      if (deps.runnable && !deps.runnable(e.id)) continue;
      out.push({ id: e.id, slug: e.slug, M: M as LibEngine['M'] });
    }
    return out;
  }
  const libOf = (id: unknown): LibEngine | null => libEngines().find(e => e.id === id) ?? null;
  const refEntries = (): [string, Obj][] =>
    Object.entries(deps.refs()).filter((e): e is [string, Obj] => isObj(e[1]) && isObj(e[1]['spec']));
  /** the reference activities with parts */
  const partsRefs = (): Obj[] =>
    refEntries()
      .filter(([, r]) => Array.isArray(asObj(r['spec'])['parts']))
      .map(([k, r]) => ({ ref: k, ...r }));
  /** the reference activities of an engine */
  const refsFor = (id: string): Obj[] =>
    refEntries()
      .filter(([, r]) => asObj(r['spec'])['engine'] === id)
      .map(([k, r]) => ({ ref: k, ...r }));

  let REG: Registry | null = null;
  const forms = new Map<string, SchemaFormModel>();
  const reg = (): Registry => REG ?? registry();
  const modelSkeleton = (R: Registry, id: string): Obj => {
    const L = LS(),
      sch = L ? R.get(L.schemaId(id)) : null;
    const props = sch ? asObj(sch['properties']) : {};
    const m = sch ? skeleton(R, node(props['model'], typeof sch['$id'] === 'string' ? sch['$id'] : undefined)) : {};
    return isObj(m) ? m : {};
  };
  /** a blank activity of a library engine: one slider, the skeleton of its model */
  function libBlank(id: string, R?: Registry): AuthorDoc {
    return {
      item: item('my-' + id.replace(/@.*$/, '')),
      spec: { format: 'noema.sim-spec/v1', engine: id, params: [firstSlider()], model: modelSkeleton(R ?? reg(), id), outputs: [] },
      strings: tables(['x']),
    };
  }
  const PARTS_ID = (): string => LS()?.PARTS_ID ?? '';
  const hasParts = (d: AuthorDoc): boolean => Array.isArray(d.spec['parts']);
  function partsBlank(): AuthorDoc {
    const e = libEngines()[0];
    return {
      item: item('my-parts'),
      spec: {
        format: 'noema.sim-spec/v1',
        params: [firstSlider()],
        parts: [{ id: 'a', engine: e ? e.id : 'ode@1', model: e && REG ? modelSkeleton(REG, e.id) : {}, outputs: [] }],
      },
      strings: tables(['x']),
    };
  }
  function registerLib(): void {
    const L = LS();
    if (!L) return;
    for (const e of libEngines())
      registerType({
        id: 'lib:' + e.id,
        engine: e.id,
        slug: e.slug,
        lib: true,
        runtime: 'sim-spec@1',
        schema: L.schemaId(e.id),
        match: d => rt(d) && d.spec['engine'] === e.id,
        blank: () => libBlank(e.id),
      });
  }
  const typeOf = (d: AuthorDoc): ActivityType => TYPES.find(t => t.match(d)) ?? (TYPES[0] as ActivityType);
  /** the schema of a spec: its parts' schema, its engine's own (a library engine) or sim-spec */
  function specSchemaId(spec: unknown, R?: Registry): string {
    const r = R ?? REG;
    if (isObj(spec) && Array.isArray(spec['parts']) && PARTS_ID() && r?.get(PARTS_ID())) return PARTS_ID();
    const t = isObj(spec) ? TYPES.find(x => x.lib && x.engine === spec['engine']) : undefined;
    return t && r?.get(t.schema) ? t.schema : SIM_ID;
  }

  /** the registry of the forms' schemas (sim-spec, circuit, activities), with every library engine's spec schema and the parts schema */
  function registry(schemas?: readonly unknown[] | Readonly<Record<string, unknown>>): Registry {
    const list = schemas ? (Array.isArray(schemas) ? (schemas as unknown[]) : Object.values(schemas)) : [...(deps.schemas?.() ?? [])];
    const R = makeRegistry(list);
    REG = R;
    forms.clear();
    const sim = list.find(x => isObj(x) && x['$id'] === SIM_ID);
    const L = LS();
    if (sim && L) {
      for (const e of libEngines()) R.add(L.specSchema(e.id, e.M.table as never, sim as never));
      registerLib();
      if (L.partsSchema) {
        R.add(
          L.partsSchema(
            libEngines().map(e => ({ id: e.id, table: e.M.table as never })),
            sim as never,
          ),
        );
        registerType({
          id: 'sim-parts',
          label: 'type.parts',
          parts: true,
          runtime: 'sim-spec@1',
          schema: PARTS_ID(),
          match: d => rt(d) && hasParts(d),
          blank: partsBlank,
        });
      }
    }
    return R;
  }
  /** the registry entry's schema as the page offers it: the runtimes of the registered kinds only */
  function itemSchema(R: Registry): Obj {
    const it = asObj(asObj(R.get(REG_ID)?.['$defs'])['item']),
      props = asObj(it['properties']),
      run = asObj(props['runtime']);
    const rts = [...new Set(TYPES.map(t => t.runtime))];
    const en = Array.isArray(run['enum']) ? (run['enum'] as unknown[]) : [];
    return { ...it, properties: { ...props, runtime: { ...run, enum: en.filter(r => typeof r === 'string' && rts.includes(r)) } } };
  }

  /* ---------- checks: the schema at the field, then the validators' rules ---------- */
  /** every problem of the document */
  function check(doc: AuthorDoc, R: Registry = reg()): AuthorProblem[] {
    const out: AuthorProblem[] = [],
      P = deps.checks();
    const sch = (tab: AuthorProblem['tab'], schema: unknown, v: unknown, base: string): AuthorProblem[] =>
      validate(R, schema, v, base).map(e => ({ tab, path: e.path, msg: TT('v.' + e.kw, e.p ?? {}), kw: e.kw }));
    // the spec: the validators' own messages first (the same as activity_lint.py), the schema's where they say nothing
    const vs: AuthorProblem[] = [];
    if (P)
      for (const m of P.checkSimSpec(doc.spec, doc.strings)) {
        const miss = /the string (\S+) is missing in/.exec(m);
        if (miss?.[1]) {
          out.push({ tab: 'strings', path: [], key: miss[1], msg: m });
          continue;
        }
        vs.push({ tab: 'spec', path: parsePath(m, 'spec') ?? [], msg: m.replace(/^spec(?:\.[\w$-]+|\[\d+\])*:?\s*/, '') || m });
      }
    const sid = specSchemaId(doc.spec, R);
    for (const e of sch('spec', R.get(sid), doc.spec, sid)) if (!vs.some(v => under(e.path, v.path) && v.path.length)) vs.push(e);
    out.push(...vs);
    // the registry entry
    const it = sch('item', itemSchema(R), doc.item, REG_ID);
    const id = String(doc.item['id']),
      exp = `activities/${id}/spec.json`;
    if (doc.item['runtime'] === 'sim-spec@1' && doc.item['entry'] !== exp && !it.some(e => e.path[0] === 'entry'))
      it.push({ tab: 'item', path: ['entry'], msg: exp });
    if (P?.checkActivities) {
      const locs = Object.keys(doc.strings),
        own = locs.includes('en') ? 'en' : (locs[0] ?? 'en');
      const media: Obj = {},
        fb = doc.item['fallback'];
      if (isObj(fb) && typeof fb['media'] === 'string' && fb['media']) media[fb['media']] = { w: 1, h: 1 };
      const a: Obj = { ...doc.item, spec: doc.spec, strings: doc.strings };
      delete a['entry'];
      const pk: Obj = {
        subject: { language: own },
        media,
        chapters: [],
        translations: Object.fromEntries(locs.filter(l => l !== own).map(l => [l, { file: true }])),
        activities: { format: 'noema.activities/v1', items: [a] },
      };
      pk['requires'] = P.needRequires?.([a]);
      for (const m0 of P.checkActivities(
        pk,
        locs.filter(l => l !== own),
      ).errors) {
        const m = m0.replace(/^activity (?:\S+|"[^"]*")(?::)? ?/, '');
        if (/^spec\b/.test(m)) continue; // (above, at the field)
        if (/^strings\b/.test(m)) {
          out.push({ tab: 'strings', path: [], msg: m });
          continue;
        }
        const f =
          /^(fallback\.text|fallback\.media|stateVersion|capabilities|id|runtime|origin|credit|license)\b/.exec(m)?.[1] ??
          (/\bid must\b/.test(m) ? 'id' : null);
        const path = f ? f.split('.') : [];
        if (!it.some(e => e.path.join('.') === path.join('.'))) it.push({ tab: 'item', path, msg: m });
      }
    }
    out.push(...it);
    // the word tables: the same keys everywhere, texts not empty
    for (const [loc, tab] of Object.entries(doc.strings)) {
      if (!LOC_RE.test(loc)) out.push({ tab: 'strings', path: [], msg: TT('localeBad') + ': ' + loc });
      for (const [k, v] of Object.entries(asObj(tab)))
        if (typeof v !== 'string' || !v.trim())
          out.push({ tab: 'strings', path: [], key: k, loc, msg: TT('missingText') + ': ' + k + ' (' + loc + ')' });
    }
    return out;
  }
  /** the keys of the word tables that the spec names (labels, titles), in order */
  function usedKeys(spec: unknown, R: Registry = reg()): string[] {
    const out: string[] = [],
      sid = specSchemaId(spec, R);
    walk(R, node(R.get(sid), sid), spec, [], (_p, s, v) => {
      if (s['x-noema'] === 'key' && typeof v === 'string' && v && !out.includes(v)) out.push(v);
    });
    return out;
  }

  /* ---------- the UI's service (the authoring port) ---------- */
  const typeName = (t: ActivityType): string => (t.lib ? (engWord(t.slug ?? '', 'name') ?? t.engine ?? t.id) : TT(t.label ?? t.id));
  const typeWhat = (t: ActivityType): string =>
    (t.lib ? engWord(t.slug ?? '', 'what') : t.parts ? TT('type.partsWhat') : null) ??
    (t.id === 'sim-formula' ? engWord('formula', 'what') : t.id === 'sim-circuit' ? engWord('circuit', 'what') : null) ??
    typeName(t);
  const kindOfType = (t: ActivityType): AuthorKind => ({ id: t.id, name: typeName(t), what: typeWhat(t) });
  const typeById = (id: string): ActivityType => TYPES.find(t => t.id === id) ?? (TYPES[0] as ActivityType);
  const formOf = (id: string, schema: unknown): SchemaFormModel => {
    let f = forms.get(id);
    if (!f) {
      f = schemaForm(reg(), schema, id === 'item' ? REG_ID : id, words);
      forms.set(id, f);
    }
    return f;
  };
  /** the formula feedback at a field: the names it may use, its first problem */
  function formula(doc: AuthorDoc, path: FieldPath, text: string): { names: string[]; error: string | null } | null {
    const X = ENG()?.expr;
    let names = namesAt(doc.spec, path);
    const t = typeOf(doc),
      pt = partOf(doc.spec, path),
      inPart = !!pt && (path[2] === 'model' || path[2] === 'outputs');
    const e = pt && inPart ? libOf(pt['engine']) : t.lib && (path[0] === 'model' || path[0] === 'outputs') ? libOf(t.engine) : null;
    if (inPart && !e) return null; // (a circuit part: the validators check it)
    if (e) {
      // an engine's text field is a formula only where its exprs() says so, over the spec's names and its own
      const sub = pt && inPart ? partSub(doc.spec, pt) : doc.spec,
        at = pathStr(inPart ? path.slice(2) : path);
      let x: readonly [string, string, (readonly string[])?] | undefined;
      try {
        x = (e.M.exprs?.(sub) ?? []).find(r => r[1] === at);
      } catch {
        x = undefined; // an engine that cannot list its formulas for this model: no feedback here, its checks speak
      }
      if (!x) return null;
      names = names.concat(x[2] ?? []);
    }
    let error: string | null = null;
    if (X && text.trim()) error = X.check(text, { vars: names })[0]?.msg ?? null;
    return { names, error };
  }
  const service: AuthorService = {
    kinds() {
      const out: { label: string; kinds: AuthorKind[] }[] = [];
      const byEngine = (id: string): ActivityType | undefined =>
        TYPES.find(t => (t.lib ? t.engine : t.id === 'sim-formula' ? 'formula@1' : t.id === 'sim-circuit' ? 'circuit-mna@1' : null) === id);
      const used = new Set<string>();
      const groupWord = (g: string): string => (W.has('engine.engines.group.' + g) ? W.t('engine.engines.group.' + g) : g);
      const given = deps.groups?.();
      for (const [g, ids] of given?.length ? given : GROUPS) {
        const ts = ids.map(byEngine).filter((t): t is ActivityType => !!t);
        if (!ts.length) continue;
        ts.forEach(t => used.add(t.id));
        out.push({ label: groupWord(g), kinds: ts.map(kindOfType) });
      }
      const pt = TYPES.find(t => t.parts);
      if (pt) {
        out.push({ label: TT('typeGroupParts'), kinds: [kindOfType(pt)] }); // several engines in one spec
        used.add(pt.id);
      }
      const rest = TYPES.filter(t => !used.has(t.id));
      if (rest.length)
        out.push({ label: W.has('engine.engines.plugins') ? W.t('engine.engines.plugins') : TT('type'), kinds: rest.map(kindOfType) });
      return out;
    },
    kindOf: d => kindOfType(typeOf(d)),
    blank: () => (TYPES[0] as ActivityType).blank(),
    blankOf: id => typeById(id).blank(),
    pick(id, doc): KindPick {
      const t = typeById(id);
      if (t.lib || t.parts) {
        const r = (t.parts ? partsRefs() : refsFor(t.engine ?? ''))[0];
        return {
          ask: TT('startQ', { engine: typeName(t) }),
          ref: r ? { tip: TT('startRefTip', { id: String(r['ref']) }), doc: fromRef(r) } : null,
          blank: t.blank(),
        };
      }
      return { doc: t.convert ? t.convert(clone(doc)) : t.blank() };
    },
    specForm(spec) {
      const id = specSchemaId(spec);
      return { id, form: formOf(id, reg().get(id)) };
    },
    itemForm: () => formOf('item', itemSchema(reg())),
    check: d => check(d),
    usedKeys: s => usedKeys(s),
    formula,
    ofs(doc, path) {
      const o = getAt(doc.spec, path.slice(0, -1)),
        t = typeOf(doc),
        pt = partOf(doc.spec, path);
      const e = pt ? libOf(pt['engine']) : t.lib ? libOf(t.engine) : null,
        L = LS();
      if (!e || !L || !isObj(o)) return [];
      return L.ofs(e.M.table as never, pt ? pt['model'] : doc.spec['model'], String(o['kind'])).slice(0, 400);
    },
    lists(doc): AuthorLists {
      const s = doc.spec,
        outs = allOutputs(s);
      const ofKind = (k: string): string[] =>
        outs.filter(o => o['kind'] === k && typeof o['id'] === 'string' && o['id']).map(o => o['id'] as string);
      const parts = Array.isArray(s['parts']) ? (s['parts'] as unknown[]).filter(isObj) : null;
      const els = asObj(asObj(s['model'])['netlist'])['elements'];
      return {
        keys: [...new Set([...usedKeys(s), ...Object.values(doc.strings).flatMap(t => Object.keys(asObj(t)))])],
        els: (Array.isArray(els) ? (els as unknown[]) : [])
          .filter(isObj)
          .map(e => e['id'])
          .filter((x): x is string => typeof x === 'string' && !!x),
        series: ofKind('series'),
        scenes: ofKind('scene'),
        sounds: ofKind('sound'),
        ids: [...idsIn(parts ? parts.map(p => p['model']) : s['model'])].slice(0, 400),
        parts: (parts ?? []).map(p => p['id']).filter((x): x is string => typeof x === 'string' && !!x),
      };
    },
    itemEdited,
    isKey: k => KEY_RE.test(k),
    isLocale: l => LOC_RE.test(l),
    files,
    zip,
    unzip,
    fromFiles: (fs, base) => fromFiles(fs, base ?? (TYPES[0] as ActivityType).blank()),
  };

  return {
    T,
    TT,
    TYPES,
    registerType,
    registry,
    check,
    usedKeys,
    namesAt,
    files,
    fromFiles: (fs: Readonly<Record<string, string>>, base?: AuthorDoc): AuthorDoc => service.fromFiles(fs, base),
    zip: (fs: Readonly<Record<string, string>>): Uint8Array => zip(fs),
    unzip,
    libEngines,
    refsFor,
    partsRefs,
    fromRef,
    libBlank,
    partsBlank,
    specSchemaId,
    typeOf,
    partSub,
    engLabel,
    SIM_ID,
    REG_ID,
    service,
  };
}
