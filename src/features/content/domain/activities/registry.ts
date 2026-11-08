/* noema-lite — the activities of a pack (pack.activities, docs/INTERACTIVE.md): every item of the registry by its runtime, the
   interactive blocks and sim exercises that use them, pack.requires; and the .h5p packages that travel beside a pack
   (checkActivityPackages). createActivityChecks(env) gives the checks bound to the engines and runtime checkers of env. */
import { fromBase64, sha256Hex, utf8Bytes, utf8Length } from '../../../../kernel/bytes.ts';
import type { CheckEnv } from '../env.ts';
import { has, isNum, isObj, isStr, list, LOCALE_RE, objs, qv, s, type Obj, type Report } from '../util.ts';
import { lintHtml, lintPython } from './lint.ts';
import {
  APP_ENGINES_MAX,
  CAPS,
  CHECKS_RUNTIMES,
  DEFAULT_ENGINE,
  EMBED,
  ENGINES,
  FALLBACK_MIN,
  FORMAT,
  GRADE_MODES,
  H5P,
  H5P_MAX,
  HINTS_MAX,
  ID_RE,
  isLib,
  KEY_RE,
  LATER,
  LIB,
  PART_KEYS,
  PY,
  PY_BASE,
  PY_EXTRAS,
  PY_PACKAGES_MAX,
  PY_STEP,
  RUNTIMES,
  SHA_RE,
  SPEC_LIM,
  USE_RE,
  WASM,
  WASM_ENGINE,
} from './rules.ts';
import { createSimSpec, ownSpec, SHOWS_NOTHING, showsNothing, specOf, unknownKeys } from './simspec.ts';

/** the engines of the library an html-app@1 item lists (its "engines"; only known ids) */
const appEngines = (a: unknown): string[] =>
  isObj(a) && a.runtime === 'html-app@1' && Array.isArray(a.engines) ? (a.engines as unknown[]).filter((e): e is string => isLib(e)) : [];
/** the "engines" of an html-app@1 item: a list of library engine ids, and every engine the bundle names in noema.engine('…') among them */
export function checkAppEngines(a: Obj): string[] {
  const E: string[] = [],
    es = a.engines,
    lib = Object.keys(LIB).sort();
  if (es != null) {
    if (!(Array.isArray(es) && es.length >= 1 && es.length <= APP_ENGINES_MAX && es.every(x => typeof x === 'string')))
      E.push(`engines must be a list of 1–${APP_ENGINES_MAX} engine ids of the library (${lib.join(', ')})`);
    else {
      for (const x of es)
        if (!lib.includes(x)) E.push(`engine ${qv(x)} is not an engine of the library (a mini-app can use ${lib.join(', ')})`);
      if (new Set(es).size !== es.length) E.push('engines lists an engine twice');
    }
  }
  const hv: readonly unknown[] = Array.isArray(es) ? es : [];
  const used =
    typeof a.html === 'string'
      ? [...new Set([...a.html.matchAll(/\bnoema\.engine\(\s*(['"])([^'"\n]{1,40})\1/g)].map(m => m[2] ?? ''))]
      : [];
  for (const x of used) if (!hv.includes(x)) E.push(`the bundle uses the engine ${qv(x)}: list it in "engines"`);
  return E;
}
/** the engines of the parts of a sim-spec@1 item (a part from activities/_parts: its engine there) */
const partEngines = (a: unknown, lib: unknown): unknown[] =>
  isObj(a) && a.runtime === 'sim-spec@1' && isObj(a.spec) && Array.isArray(a.spec.parts)
    ? objs(a.spec.parts).map(p => {
        if (p.engine !== undefined) return p.engine;
        if (typeof p.use === 'string' && isObj(lib)) {
          const d = lib[p.use];
          if (isObj(d)) return isObj(p.with) && p.with.engine !== undefined ? p.with.engine : d.engine;
        }
        return null;
      })
    : [];
/** what pack.requires must list: the core, each runtime, each engine other than formula@1 (and the engines a mini-app lists) */
export function needRequires(itemsIn: unknown, lib?: unknown): string[] {
  const items = objs(itemsIn);
  if (!items.length) return [];
  const rts = [...new Set(items.map(a => a.runtime).filter((r): r is string => typeof r === 'string'))].sort().map(r => 'runtime:' + r);
  const engs = [
    ...new Set(
      [
        ...items
          .filter(a => (a.runtime === 'sim-spec@1' || a.runtime === WASM) && isObj(a.spec))
          .map(a => (a.runtime === WASM ? WASM_ENGINE : isObj(a.spec) && 'engine' in a.spec ? a.spec.engine : DEFAULT_ENGINE)),
        ...items.flatMap(appEngines),
        ...items.flatMap(a => partEngines(a, lib)),
      ].filter((e): e is string => typeof e === 'string' && e !== DEFAULT_ENGINE),
    ),
  ]
    .sort()
    .map(e => 'engine:' + e);
  return ['activities/v1', ...rts, ...engs];
}
/** enginesNamed(pack) → the ids of the engines of the library a pack names (its activities and their parts, pack.requires): what a
    caller loads (NoemaCore.engines.load) before it checks the pack, so that each engine's own checks run */
export function enginesNamed(p: unknown): string[] {
  const reg = isObj(p) ? p.activities : null,
    items = isObj(reg) ? objs(reg.items) : [],
    parts = isObj(reg) && isObj(reg.parts) ? reg.parts : null;
  const ids = new Set<string>();
  for (const r of [...needRequires(items, parts), ...list(isObj(p) ? p.requires : null)])
    if (typeof r === 'string' && r.startsWith('engine:')) ids.add(r.slice(7));
  if (parts) for (const d of Object.values(parts)) if (isObj(d) && typeof d.engine === 'string') ids.add(d.engine);
  return [...ids].filter(id => ENGINES.has(id) && id !== DEFAULT_ENGINE).sort();
}
export function checkBlockAct(b: Obj, items: Obj): string[] {
  const E: string[] = [];
  if (typeof b.activity !== 'string' || !has(items, b.activity))
    E.push(`interactive: activity ${qv(b.activity)} is not in pack.activities`);
  else if (showsNothing(items[b.activity])) E.push(`interactive: activity ${b.activity} ${SHOWS_NOTHING}`);
  const hg = b.height;
  if (hg != null && hg !== 'auto' && !(Number.isInteger(hg) && (hg as number) >= 120 && (hg as number) <= 2000))
    E.push('interactive: height is "auto" or 120–2000 (px)');
  if (b.aspect != null && !(typeof b.aspect === 'string' && /^\d{1,2}:\d{1,2}$/.test(b.aspect)))
    E.push('interactive: aspect is like "16:9"');
  if (b.caption != null && typeof b.caption !== 'string') E.push('interactive: caption must be a text');
  return E;
}
/** the registry fields of an h5p@1 item (the package itself: checkActivityPackages) */
function checkH5PItem(a: Obj, aid: string, locs: readonly string[], own: unknown): string[] {
  const E: string[] = [],
    entry = a.entry;
  if (
    entry != null &&
    !(typeof entry === 'string' && entry.startsWith('activities/') && entry.endsWith('.h5p') && !entry.split('/').includes('..'))
  )
    E.push(`entry must be the .h5p file beside the pack (activities/${aid}/item.h5p)`);
  if (!(typeof a.sha256 === 'string' && SHA_RE.test(a.sha256))) E.push('sha256 (of the .h5p file) is required');
  if (!(Number.isInteger(a.bytes) && (a.bytes as number) > 0 && (a.bytes as number) <= H5P_MAX))
    E.push(`bytes (the size of the .h5p file, at most ${H5P_MAX / 1048576} MB) is required`);
  if ('html' in a) E.push('an h5p@1 item has no html (its .h5p file travels beside the pack)');
  if (a.h5p != null && typeof a.h5p !== 'string') E.push('h5p (inline) must be the .h5p file in base64');
  const by = a.h5pByLocale;
  if (by != null) {
    if (!isObj(by)) E.push('h5pByLocale must be {locale: {content} | {h5p, sha256}}');
    else
      for (const [loc, v] of Object.entries(by)) {
        if (!locs.includes(loc)) {
          E.push(`h5pByLocale.${loc}: the pack is not read in ${loc} (${locs.join(', ')})`);
          continue;
        }
        if (!isObj(v) || !(isObj(v.content) || (typeof v.h5p === 'string' && typeof v.sha256 === 'string' && SHA_RE.test(v.sha256))))
          E.push(`h5pByLocale.${loc} must be {content} (its content.json) or {h5p, sha256} (another package in base64)`);
        else if (v.l10n != null && !isObj(v.l10n)) E.push(`h5pByLocale.${loc}.l10n must be an object (H5P's own strings)`);
      }
  }
  for (const loc of locs)
    if (loc !== own && !(isObj(by) && has(by, loc)))
      E.push(`h5pByLocale.${loc} is missing: the item's words in ${loc} (activities/${aid}/content.${loc}.json)`);
  return E;
}
const missingIn = (tables: Obj, k: string): string[] =>
  Object.keys(tables)
    .filter(l => {
      const t = tables[l];
      return isObj(t) && !has(t, k);
    })
    .sort();

/** the checks of pack.activities bound to env */
export function createActivityChecks(env: CheckEnv) {
  const sim = createSimSpec(env);

  function checkSim(e: Obj, items: Obj): string[] {
    const E: string[] = [];
    const hv = typeof e.activity === 'string' && has(items, e.activity);
    if (!hv) E.push(`activity ${qv(e.activity)} is not in pack.activities`);
    const a = hv && isObj(items[s(e.activity)]) ? (items[s(e.activity)] as Obj) : null,
      rt = a ? a.runtime : null;
    const spec = specOf(a);
    if (showsNothing(a)) E.push(`activity ${s(e.activity)} ${SHOWS_NOTHING}`);
    if (rt === EMBED && a) {
      const pv = (env.embed?.PROVIDERS ?? []).find(x => isObj(x) && x.id === a.provider);
      if (!(isObj(pv) && pv.supportsResult === true))
        E.push(`sim-embed: activity ${s(e.activity)} is an outside page (explore only): use it in a theory block`);
    }
    const g = e.grade;
    if (!isObj(g) || typeof g.mode !== 'string' || !GRADE_MODES.has(g.mode))
      E.push(
        'grade must be {"mode": "reported"} (the activity reports its result) or {"mode": "checks", "checks": [{"expr": …}]} (sim-spec@1)',
      );
    else {
      if (g.pass != null && !(isNum(g.pass) && g.pass > 0 && g.pass <= 1)) E.push('grade.pass must be a number in (0, 1]');
      if (g.mode === 'reported' && typeof rt === 'string' && CHECKS_RUNTIMES.has(rt) && rt !== PY)
        E.push(`a ${rt} activity reports nothing itself: grade it with {"mode": "checks", "checks": […]}`);
      if (g.mode === 'checks') {
        if (rt != null && !(typeof rt === 'string' && CHECKS_RUNTIMES.has(rt)))
          E.push(
            `grade.mode "checks" needs an activity whose values the app can see (sim-spec@1, py-module@1, wasm-module@1); ${s(rt)} reports its own result: use "reported"`,
          );
        const cs = g.checks;
        if (!(Array.isArray(cs) && cs.length >= 1 && cs.length <= SPEC_LIM.checks))
          E.push(`grade.checks must be a list of 1–${SPEC_LIM.checks} checks {expr, label?, weight?}`);
        else {
          const names = spec ? sim.specNames(spec) : null,
            tables = a && isObj(a.strings) ? a.strings : {};
          (cs as unknown[]).forEach((c, i) => {
            const w = `grade.checks[${i}]`;
            if (!isObj(c)) {
              E.push(`${w} must be an object {expr, label?, weight?}`);
              return;
            }
            const m = sim.exprProblem(c.expr, names, w + '.expr');
            if (m) E.push(m);
            if (c.weight != null && !(isNum(c.weight) && c.weight > 0)) E.push(`${w}.weight must be a number > 0`);
            if (c.label != null) {
              if (!(typeof c.label === 'string' && KEY_RE.test(c.label)))
                E.push(`${w}.label must be a key of the activity's string tables`);
              else {
                const miss = missingIn(tables, c.label);
                if (miss.length) E.push(`${w}.label: the string ${c.label} is missing in strings.${miss.join(', strings.')}`);
              }
            }
          });
        }
      }
    }
    const t = e.task;
    if (t != null) {
      if (!isObj(t)) E.push('task must be an object {seed, params}');
      else {
        const sd = t.seed ?? 'auto';
        if (!(sd === 'auto' || (Number.isInteger(sd) && (sd as number) >= 0)))
          E.push('task.seed is "auto" (a new one each attempt) or a whole number');
        if (t.params != null && !isObj(t.params)) E.push('task.params must be an object');
        else if (spec && isObj(t.params)) {
          const consts = isObj(spec.consts) ? spec.consts : {};
          const fids = isObj(spec.bench) ? objs(spec.bench.faults).map(f => f.id) : null;
          for (const [k, v] of Object.entries(t.params)) {
            if (k === 'fault' && fids) {
              if (
                !(typeof v === 'string'
                  ? fids.includes(v)
                  : Array.isArray(v) && v.length >= 1 && v.every(x => typeof x === 'string' && fids.includes(x)))
              )
                E.push('task.params.fault must be the id of a fault of the bench, or a list of them (the seed draws one)');
            } else if (!has(consts, k)) {
              if (rt !== PY) E.push(`task.params.${k}: not a constant of the spec (a sim-spec@1 task sets only the spec's consts)`);
            } else if (!isNum(v)) E.push(`task.params.${k} must be a number`);
          }
        }
      }
    }
    if (e.hints != null && !(Array.isArray(e.hints) && e.hints.length <= HINTS_MAX && e.hints.every(isStr)))
      E.push(`hints must be a list of at most ${HINTS_MAX} texts`);
    if (e.reveal != null && !isStr(e.reveal)) E.push('reveal must be a text');
    return E;
  }

  /** checkActivities(pack, locales?) → pack.activities, the blocks and sim exercises that use them, pack.requires */
  function checkActivities(p: unknown, translations?: readonly string[] | null): Report {
    const E: string[] = [],
      W: string[] = [];
    const pk = isObj(p) ? p : {},
      reg = pk.activities,
      media = isObj(pk.media) ? pk.media : {},
      own = isObj(pk.subject) && pk.subject.language ? pk.subject.language : 'en';
    const locs = [...new Set([s(own), ...(translations ?? Object.keys(isObj(pk.translations) ? pk.translations : {}))])].sort();
    const items: Record<string, Obj> = {},
      every: Record<string, Obj> = {};
    for (const x of isObj(reg) ? objs(reg.items) : []) if (typeof x.id === 'string') every[x.id] = x;
    const partLib = isObj(reg) && isObj(reg.parts) ? reg.parts : null;
    if (reg != null) {
      if (!isObj(reg) || reg.format !== FORMAT) E.push(`activities: format must be "${FORMAT}"`);
      if (isObj(reg) && reg.parts !== undefined) {
        if (!isObj(reg.parts)) E.push('activities.parts must be an object {name: part} (the files activities/_parts/<name>.json)');
        else
          for (const [k, d] of Object.entries(reg.parts)) {
            if (!USE_RE.test(k)) E.push(`activities/_parts/${k}.json: the name is lower-case letters, digits and - (at most 61)`);
            else if (!isObj(d)) E.push(`activities/_parts/${k}.json must be a part {engine, model, outputs, inputs?}`);
            else
              unknownKeys(
                d,
                PART_KEYS.filter(x => x !== 'id' && x !== 'use' && x !== 'with'),
                `activities/_parts/${k}.json`,
                E,
              );
          }
      }
      for (const a0 of isObj(reg) ? list(reg.items) : []) {
        const aid = isObj(a0) ? a0.id : null;
        if (typeof aid !== 'string' || !ID_RE.test(aid)) {
          E.push(`activity ${qv(aid)}: id must be lower-case letters, digits and - (2–61)`);
          continue;
        }
        const a = a0 as Obj;
        if (has(items, aid)) {
          E.push(`activity ${aid}: duplicate id`);
          continue;
        }
        items[aid] = a;
        const w = `activity ${aid}`,
          rt = a.runtime;
        if (typeof rt === 'string' && has(LATER, rt))
          E.push(
            `${w}: runtime ${rt} arrives in a later version of the app (${LATER[rt] ?? ''}); use html-app@1, sim-spec@1, py-module@1 or h5p@1 for now`,
          );
        else if (typeof rt !== 'string' || !RUNTIMES.has(rt))
          E.push(`${w}: unknown runtime ${qv(rt)} (one of ${[...RUNTIMES].sort().join(', ')})`);
        if (!(Number.isInteger(a.stateVersion) && (a.stateVersion as number) >= 1))
          E.push(`${w}: stateVersion must be a whole number >= 1`);
        if (rt !== 'html-app@1' && a.engines != null)
          E.push(`${w}: engines: only an html-app@1 item lists engines (a sim-spec@1 spec names its engine in spec.engine)`);
        const caps = a.capabilities ?? [];
        if (!Array.isArray(caps) || caps.some(c => !(typeof c === 'string' && CAPS.has(c))))
          E.push(`${w}: capabilities must be some of ${[...CAPS].sort().join(', ')}`);
        const fb = isObj(a.fallback) ? a.fallback : {};
        if (!(isStr(fb.text) && fb.text.trim().length >= FALLBACK_MIN))
          E.push(`${w}: fallback.text (>= ${FALLBACK_MIN} characters: what the activity shows and teaches) is required`);
        if (!isStr(fb.media)) E.push(`${w}: fallback.media (a still picture in media/) is required`);
        else if (!media[fb.media]) E.push(`${w}: fallback.media ${qv(fb.media)} is not a picture of the pack`);
        const strings = isObj(a.strings) ? a.strings : null;
        if (rt === 'html-app@1') {
          if (typeof a.html !== 'string') E.push(`${w}: the bundle (html) is missing`);
          else {
            const l = lintHtml(a.html);
            E.push(...l.errors.map(m => `${w}: ${m}`));
            W.push(...l.warnings.map(m => `${w}: ${m}`));
            if (a.sha256 != null && !(typeof a.sha256 === 'string' && SHA_RE.test(a.sha256) && sha256Hex(a.html) === a.sha256))
              E.push(`${w}: sha256 does not match the bundle`);
            if (a.bytes != null && a.bytes !== utf8Length(a.html)) E.push(`${w}: bytes does not match the bundle`);
          }
          E.push(...checkAppEngines(a).map(m => `${w}: ${m}`));
        } else if (rt === 'sim-spec@1') {
          if (!('spec' in a)) E.push(`${w}: the spec (activities/${aid}/spec.json) is missing`);
          else E.push(...sim.checkSimSpec(a.spec, strings, null, { items: every, parts: partLib }).map(m => `${w}: ${m}`));
        } else if (rt === PY) {
          const pkg = a.packages == null ? [] : a.packages,
            allowed: readonly string[] = [...PY_BASE, ...PY_EXTRAS];
          if (!(Array.isArray(pkg) && pkg.length <= PY_PACKAGES_MAX && pkg.every(x => typeof x === 'string')))
            E.push(`${w}: packages must be a list of names (${allowed.join(', ')})`);
          else {
            const names = pkg,
              extras: readonly string[] = PY_EXTRAS;
            for (const x of names)
              if (!allowed.includes(x))
                E.push(`${w}: package ${qv(x)} is not available (numpy, scipy and the allow-listed extras: ${PY_EXTRAS.join(', ')})`);
            if (new Set(names).size !== names.length) E.push(`${w}: packages lists a name twice`);
            if (names.some(x => extras.includes(x)) && a.requiresNetwork !== true)
              E.push(
                `${w}: an extra package (${names.filter(x => extras.includes(x)).join(', ')}) is downloaded the first time: set "requiresNetwork": true`,
              );
          }
          if (a.requiresNetwork != null && typeof a.requiresNetwork !== 'boolean') E.push(`${w}: requiresNetwork must be true or false`);
          if (a.stepMs != null && !(Number.isInteger(a.stepMs) && (a.stepMs as number) >= PY_STEP[0] && (a.stepMs as number) <= PY_STEP[1]))
            E.push(`${w}: stepMs is a whole number ${PY_STEP[0]}–${PY_STEP[1]} (the budget of one step(), in ms)`);
          if (typeof a.python !== 'string') E.push(`${w}: the Python file (activities/${aid}/main.py) is missing`);
          else {
            const l = lintPython(a.python, Array.isArray(pkg) ? pkg : []);
            E.push(...l.errors.map(m => `${w}: ${m}`));
            W.push(...l.warnings.map(m => `${w}: ${m}`));
            if (a.sha256 != null && !(typeof a.sha256 === 'string' && SHA_RE.test(a.sha256) && sha256Hex(a.python) === a.sha256))
              E.push(`${w}: sha256 does not match the Python file`);
            if (a.bytes != null && a.bytes !== utf8Length(a.python)) E.push(`${w}: bytes does not match the Python file`);
          }
          if (!('spec' in a))
            E.push(`${w}: the spec (activities/${aid}/spec.json: the controls, readouts and plots the app draws) is missing`);
          else E.push(...sim.checkSimSpec(a.spec, strings, null, { python: true }).map(m => `${w}: ${m}`));
        } else if (rt === WASM) {
          if (!env.wasm) E.push(`${w}: the WebAssembly checker (src/runtimes/wasm-module) is not loaded here`);
          else E.push(...env.wasm.checkItem(a).problems.map(m => `${w}: ${m}`));
          const sp = a.spec;
          if (sp !== undefined && sp !== null) {
            if (isObj(sp) && ('engine' in sp ? sp.engine : WASM_ENGINE) !== WASM_ENGINE)
              E.push(`${w}: spec.engine: the own spec of a ${WASM} item runs on ${WASM_ENGINE} (leave engine out)`);
            if (isObj(sp) && isObj(sp.model) && (sp.model.module !== undefined ? sp.model.module : aid) !== aid)
              E.push(`${w}: spec.model.module: the own spec of a ${WASM} item runs this item (leave module out)`);
            E.push(...sim.checkSimSpec(ownSpec(a), strings, null, { items: every }).map(m => `${w}: ${m}`));
          }
        } else if (rt === EMBED) {
          if (!env.embed) E.push(`${w}: the outside-page checker (src/runtimes/external-embed) is not loaded here`);
          else {
            const r = env.embed.check(a);
            E.push(...r.errors.map(m => `${w}: ${m}`));
            W.push(...r.warnings.map(m => `${w}: ${m}`));
          }
        } else if (rt === H5P) E.push(...checkH5PItem(a, aid, locs, own).map(m => `${w}: ${m}`));
        const st = a.strings;
        if (rt === H5P && (st == null || (isObj(st) && !Object.keys(st).length))) {
          /* an H5P item keeps its words in content.json (h5pByLocale for the other languages) */
        } else if (!isObj(st) || !Object.keys(st).length)
          E.push(`${w}: strings {locale: {key: text}} are required (an activity shows no words of its own)`);
        else {
          let keys: [string, Set<string>] | null = null;
          for (const [loc, tab] of Object.entries(st)) {
            if (!LOCALE_RE.test(loc)) {
              E.push(`${w}: strings: ${qv(loc)} is not a locale`);
              continue;
            }
            if (!isObj(tab) || !Object.entries(tab).every(([k, v]) => KEY_RE.test(k) && isStr(v))) {
              E.push(`${w}: strings.${loc} must map keys (a-z, digits, . _ -) to non-empty texts`);
              continue;
            }
            const ks = new Set(Object.keys(tab));
            if (!keys) keys = [loc, ks];
            else {
              const [l0, k0] = keys;
              const d = [...k0]
                .filter(k => !ks.has(k))
                .concat([...ks].filter(k => !k0.has(k)))
                .sort()
                .slice(0, 5);
              if (d.length) E.push(`${w}: strings.${loc} and strings.${l0} have different keys (${d.join(', ')})`);
            }
          }
          for (const loc of locs) if (!st[loc]) E.push(`${w}: strings for ${loc} are missing (the pack is read in ${locs.join(', ')})`);
        }
        for (const k of ['origin', 'credit', 'license']) if (k in a && typeof a[k] !== 'string') E.push(`${w}: ${k} must be a text`);
      }
    }
    const used = new Set<unknown>();
    for (const c of objs(pk.chapters)) {
      for (const sec of objs(c.sections))
        list(sec.blocks).forEach((b, i) => {
          if (!isObj(b) || b.t !== 'interactive') return;
          used.add(b.activity);
          E.push(...checkBlockAct(b, items).map(m => `${s(sec.id)} block ${i}: ${m}`));
        });
      for (const e of objs(c.exercises)) {
        if (e.type !== 'sim') continue;
        used.add(e.activity);
        E.push(...checkSim(e, items).map(m => `${s(e.id)}: ${m}`));
      }
    }
    for (const a of Object.values(items)) {
      const sp = a.runtime === 'sim-spec@1' ? a.spec : null;
      if (isObj(sp) && sp.engine === WASM_ENGINE && isObj(sp.model) && typeof sp.model.module === 'string' && has(items, sp.model.module))
        used.add(sp.model.module);
    }
    for (const aid of Object.keys(items)) if (!used.has(aid)) W.push(`activity ${aid}: not used by any interactive block or sim exercise`);
    if (Object.keys(items).length) {
      const req = list(pk.requires);
      const need = needRequires(Object.values(items), partLib);
      const miss = need.filter(x => !req.includes(x));
      if (miss.length) E.push(`pack.requires must list ${miss.join(', ')} (make_pack.py writes it)`);
    }
    return { errors: E, warnings: W };
  }

  /** checkActivityPackages(pack, bytesOf?) → the .h5p files of the pack's h5p@1 items: sha256 and bytes as the registry says, the
      package rules (env.h5p), each h5pByLocale translation with the same rules. bytesOf(item) → the bytes or null (an inline "h5p"
      in base64 is used first). The connector and the tools run it on the files beside a pack; the app when an item mounts. */
  async function checkActivityPackages(
    p: unknown,
    bytesOf?: (item: Obj) => Uint8Array | null | Promise<Uint8Array | null>,
  ): Promise<Report> {
    const E: string[] = [],
      W: string[] = [],
      H = env.h5p;
    const reg = isObj(p) ? p.activities : null;
    const items = (isObj(reg) ? objs(reg.items) : []).filter(a => a.runtime === H5P && typeof a.id === 'string');
    if (!items.length) return { errors: E, warnings: W };
    if (!H) return { errors: E, warnings: ['h5p@1: the package checker (src/runtimes/h5p) is not loaded here'] };
    const b64 = (x: unknown): Uint8Array => fromBase64(s(x)) ?? new Uint8Array(0);
    const unzip = async (u: Uint8Array): Promise<Readonly<Record<string, Uint8Array>> | null> => {
      try {
        return await H.unzip(u);
      } catch {
        return null;
      }
    };
    for (const a of items) {
      const w = `activity ${s(a.id)}`;
      const b = typeof a.h5p === 'string' ? b64(a.h5p) : bytesOf ? await bytesOf(a) : null;
      if (b == null) {
        E.push(`${w}: the .h5p file ${typeof a.entry === 'string' ? a.entry : ''} is missing`);
        continue;
      }
      if (a.sha256 !== sha256Hex(b)) E.push(`${w}: sha256 does not match the .h5p file`);
      if (a.bytes !== b.length) E.push(`${w}: bytes does not match the .h5p file`);
      const files = await unzip(b);
      if (!files) {
        E.push(`${w}: not a .h5p (zip) file`);
        continue;
      }
      const r = H.check(files);
      E.push(...r.errors.map(m => `${w}: ${m}`));
      W.push(...r.warnings.map(m => `${w}: ${m}`));
      const by = isObj(a.h5pByLocale) ? a.h5pByLocale : {};
      for (const loc of Object.keys(by).sort()) {
        const v = by[loc];
        if (!isObj(v)) continue;
        let f2: Readonly<Record<string, Uint8Array>> | null;
        if (typeof v.h5p === 'string') {
          const b2 = b64(v.h5p);
          f2 = await unzip(b2);
          if (!f2) {
            E.push(`${w}: h5pByLocale.${loc}: not a .h5p (zip) file`);
            continue;
          }
          if (v.sha256 !== sha256Hex(b2)) E.push(`${w}: h5pByLocale.${loc}: sha256 does not match the .h5p file`);
        } else if (isObj(v.content)) f2 = { ...files, 'content/content.json': utf8Bytes(JSON.stringify(v.content)) };
        else continue;
        E.push(...H.check(f2).errors.map(m => `${w}: h5pByLocale.${loc}: ${m}`));
      }
    }
    return { errors: E, warnings: W };
  }

  return {
    ...sim,
    checkActivities,
    checkActivityPackages,
    checkBlockAct,
    checkSim,
    checkAppEngines,
    needRequires,
    enginesNamed,
    lintHtml,
    lintPython,
  };
}
export type ActivityChecks = ReturnType<typeof createActivityChecks>;
