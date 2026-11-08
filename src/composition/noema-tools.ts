/**
 * THE NODE TOOLS ROOT (build/noema-tools.cjs, an entry of tools/esbuild.mjs; the skill zip carries it as scripts/noema-tools.cjs):
 * the one bridge from the Python tools to the content checks. tools/noema_core.py runs it; so do the skill's scripts, build.py,
 * pipeline.py and the tests. The checks are the app's and the connector's (src/features/content), with every engine of the
 * library in hand (src/engines/node.ts) and the activity runtimes' own checkers (src/runtimes; engine/src/38 and 44, run in a scope of their own).
 *
 *   node noema-tools.cjs batch                      stdin: [[op, ...args], …] → stdout: [{ok: true, value} | {ok: false, error}, …]
 *   node noema-tools.cjs validate CHAPTER.json [--media M.json] [--activities A.json] [--min-visual N] [--quality error|warn]
 *                                 [--balance N | --balance-warn N] [--features code,math] [--source SRC.json]
 *   node noema-tools.cjs validate subject.json --subject [--translations el,fr]
 *   node noema-tools.cjs check-pack PACK.json [--strict] [--expect ID] [--require-quality] [--balance N]
 *   node noema-tools.cjs rules                      the pack rules (RULES, QUALITY, LANGUAGES) as JSON
 * Exit code 1 when a check has errors (validate, check-pack), 2 on a usage error.
 * Required as a module (the node suites: tests/engines.cjs content()), it exports the checks and runs no command.
 */
import fs from 'node:fs';
import path from 'node:path';
import h5pSource from 'legacy:engine/src/38_activity_h5p.js';
import wasmSource from 'legacy:engine/src/44_activity_wasm.js';
import * as contracts from '../contracts/index.ts';
import { runLegacy } from '../connector/engine/legacy.ts';
import { nodeEngines } from '../engines/node.ts';
import { pyRepr, type ChapterOptions } from '../features/content/domain/chapter.ts';
import { isObj, type Obj } from '../features/content/domain/util.ts';
import { contentChecks, scopeCheckers } from '../features/content/application/index.ts';
import { RUNTIME_CHECKS } from '../runtimes/checks.ts';

const engines = nodeEngines();
/** the activity runtimes' checkers, run once in a scope of their own (they read NoemaCore by name, as on the page) */
const scope = runLegacy(
  [
    { path: 'engine/src/38_activity_h5p.js', text: h5pSource },
    { path: 'engine/src/44_activity_wasm.js', text: wasmSource },
  ],
  { NoemaCore: Object.freeze({ version: 1, contracts, engines }) },
);
const C = contentChecks(
  engines,
  scopeCheckers(() => scope, RUNTIME_CHECKS),
);

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** the .h5p checks of a package file (activity_new.py, h5p_import.py): its rules, and the main library */
async function h5pFile(file: string): Promise<{ errors: string[]; warnings: string[]; main: string | null }> {
  const H = scope.NoemaH5P as
    | {
        unzip(b: Uint8Array): Promise<Record<string, Uint8Array>>;
        check(f: Record<string, Uint8Array>): { errors: string[]; warnings: string[]; main?: string };
      }
    | undefined;
  if (!H) return { errors: ['the package checker (NoemaH5P) is not loaded'], warnings: [], main: null };
  let files: Record<string, Uint8Array>;
  try {
    files = await H.unzip(new Uint8Array(fs.readFileSync(file)));
  } catch (e) {
    return { errors: [`not a .h5p (zip) file (${errText(e)})`], warnings: [], main: null };
  }
  const r = H.check(files);
  return { errors: r.errors, warnings: r.warnings, main: r.main ?? null };
}

type Op = (...args: unknown[]) => unknown;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** the operations of a batch: [op, ...args] → a JSON value */
const OPS: Readonly<Record<string, Op>> = {
  'contracts.check': (id, doc) => contracts.check(str(id), doc).issues,
  rules: () => C.PACK_RULES,
  'activities.rules': () => C.ACTIVITY_RULES,
  'chapter.check': (chapter, opts) => {
    const o = isObj(opts) ? (opts as ChapterOptions) : {};
    return C.checkChapter(chapter, o);
  },
  'subject.check': (subject, translated) => C.checkSubject(subject, Array.isArray(translated) ? translated.map(String) : []),
  'pack.check': (pack, expectId, opts) => C.checkPack(pack, expectId ?? undefined, isObj(opts) ? opts : {}),
  'activities.check': (pack, translations) => C.checkActivities(pack, Array.isArray(translations) ? translations.map(String) : null),
  /** the .h5p packages of the pack's h5p@1 items, read from base (each item's entry is a path below it) */
  'activities.packages': (pack, base) =>
    C.checkActivityPackages(pack, a => {
      const f = path.join(str(base), ...str(a.entry).split('/'));
      return typeof a.entry === 'string' && fs.existsSync(f) && fs.statSync(f).isFile() ? new Uint8Array(fs.readFileSync(f)) : null;
    }),
  'activities.requires': (items, parts) => C.needRequires(items, parts),
  'activities.engines': pack => C.enginesNamed(pack),
  'simspec.check': (spec, tables, opts) => C.checkSimSpec(spec, tables, null, isObj(opts) ? opts : null),
  'lint.html': html => C.lintHtml(html),
  'lint.python': (src, packages) => C.lintPython(src, packages),
  'h5p.file': file => h5pFile(str(file)),
  'quality.check': (chapter, subject) => C.checkQuality(chapter, subject),
  'balance.check': (chapter, subject, min) => C.checkBalance(chapter, subject, { min: typeof min === 'number' ? min : undefined }),
  'translation.check': (t, pack) => C.checkTranslation(t, pack),
  'bridge.check': (b, pack) => C.checkBridge(b, pack),
  'locales.required': own => C.requiredLocales(own),
  'exercise.check': (e, media) => C.checkExercise(e, media),
};

/** JSON for Python: a Set is its sorted list, a RegExp its source */
const plain = (_k: string, v: unknown): unknown =>
  v instanceof Set ? [...(v as Set<unknown>)].map(String).sort() : v instanceof RegExp ? v.source : v;

async function batch(): Promise<void> {
  const jobs = JSON.parse(fs.readFileSync(0, 'utf8')) as unknown;
  if (!Array.isArray(jobs)) throw new Error('batch: stdin must be a JSON list of [op, ...args]');
  const out: unknown[] = [];
  for (const j of jobs as unknown[]) {
    const [op, ...args] = Array.isArray(j) ? (j as unknown[]) : [];
    const f = typeof op === 'string' ? OPS[op] : undefined;
    if (!f) {
      out.push({ ok: false, error: `unknown operation ${JSON.stringify(op)} (one of ${Object.keys(OPS).sort().join(', ')})` });
      continue;
    }
    try {
      out.push({ ok: true, value: await f(...args) });
    } catch (e) {
      out.push({ ok: false, error: errText(e) });
    }
  }
  process.stdout.write(JSON.stringify(out, plain));
}

/** the value of a flag (--name value), or undefined */
const flag = (a: readonly string[], name: string): string | undefined => {
  const i = a.indexOf(name);
  return i >= 0 ? a[i + 1] : undefined;
};
const list = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const int = (v: string | undefined): number => (v === undefined ? 0 : Number.parseInt(v, 10) || 0);

/** validate: the authoring check of one chapter or of subject.json, worded as the skill's authors read it */
function validate(a: readonly string[]): number {
  const file = a[0];
  if (!file) {
    process.stderr.write('usage: noema-tools validate CHAPTER.json [options] | subject.json --subject [--translations el,fr]\n');
    return 2;
  }
  let doc: unknown;
  try {
    doc = readJson(file);
  } catch (e) {
    console.log('ERROR: invalid JSON:', errText(e));
    return 1;
  }
  const print = (errors: readonly string[], warnings: readonly string[]): number => {
    for (const m of errors) console.log('ERROR:', m);
    for (const m of warnings) console.log('WARN:', m);
    console.log(errors.length ? `${errors.length} ERRORS` : 'OK');
    return errors.length ? 1 : 0;
  };
  if (a.includes('--subject')) {
    const translated = list(flag(a, '--translations'));
    const r = C.checkSubject(doc, translated);
    console.log(
      `== ${file}: language ${r.language}, metadata in ${r.metadata.join(', ') || '—'}, content in ${[...translated].sort().join(', ') || '—'}`,
    );
    return print(r.errors, r.warnings);
  }
  if (!isObj(doc)) {
    console.log('ERROR: a chapter is a JSON object');
    return 1;
  }
  const json = (name: string): Obj | null => {
    const f = flag(a, name);
    return f === undefined ? null : (readJson(f) as Obj);
  };
  const quality = flag(a, '--quality');
  const opts: ChapterOptions = {
    media: json('--media'),
    activities: json('--activities'),
    minVisual: int(flag(a, '--min-visual')),
    quality: quality === 'error' || quality === 'warn' ? quality : null,
    balance: int(flag(a, '--balance')),
    balanceWarn: int(flag(a, '--balance-warn')),
    features: list(flag(a, '--features')),
    ...(flag(a, '--source') !== undefined ? { source: json('--source') } : {}),
  };
  const r = C.checkChapter(doc, opts),
    S = r.summary;
  console.log(
    `== ${file}: ${S.sections} sections, ${S.exercises} exercises (${S.visual} visual, ${S.figures} figures), ${S.playbooks} playbooks, ${S.flashcards} flashcards, ${S.pitfalls} pitfalls`,
  );
  console.log('   types:', pyRepr(S.types));
  console.log('   tags:', pyRepr(S.tags));
  return print(r.errors, r.warnings);
}

/** check-pack: a whole pack as the app and the connector check it */
async function checkPackFile(a: readonly string[]): Promise<number> {
  const file = a[0];
  if (!file) {
    process.stderr.write('usage: noema-tools check-pack PACK.json [--strict] [--expect ID] [--require-quality] [--balance N]\n');
    return 2;
  }
  const pack = readJson(file);
  const bal = flag(a, '--balance');
  const r = C.checkPack(pack, flag(a, '--expect'), {
    strict: a.includes('--strict'),
    requireQuality: a.includes('--require-quality'),
    ...(bal !== undefined ? { balance: int(bal) } : {}),
  });
  const pk = await C.checkActivityPackages(pack, it => {
    const f = path.join(path.dirname(file), ...str(it.entry).split('/'));
    return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null;
  });
  const errors = [...r.errors, ...pk.errors],
    warnings = [...r.warnings, ...pk.warnings];
  for (const m of errors) console.log('ERROR:', m);
  for (const m of warnings) console.log('WARN:', m);
  console.log(
    `${errors.length ? '✗' : '✓'} ${file}: ${JSON.stringify(r.counts)}: ${errors.length} error(s), ${warnings.length} warning(s)`,
  );
  return errors.length ? 1 : 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === 'batch') {
    await batch();
    return 0;
  }
  if (cmd === 'validate') return validate(rest);
  if (cmd === 'check-pack') return checkPackFile(rest);
  if (cmd === 'rules') {
    process.stdout.write(JSON.stringify(C.PACK_RULES, null, 1) + '\n');
    return 0;
  }
  process.stderr.write('usage: noema-tools batch | validate … | check-pack … | rules (src/composition/noema-tools.ts)\n');
  return 2;
}

/** required as a module (the node suites, tests/engines.cjs content()): the checks, without running a command */
export const checks = C;
export { engines };

const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain)
  main(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    (e: unknown) => {
      process.stderr.write(`noema-tools: ${errText(e)}\n`);
      process.exitCode = 2;
    },
  );
