/* noema-lite — which contract every data file of the repository satisfies: the learning material (library/), the test
   fixtures and the examples. src/contracts/repo.test.ts validates them all, tools/migrate/run.mjs migrates them, and a
   new kind of file is added here (a file that matches no pattern is not checked: the list below is the whole claim). */
import fs from 'node:fs';
import path from 'node:path';

export interface FileKind {
  /** a path relative to the repository; "*" is any part of one path segment, [a-z] one character of a class */
  readonly glob: string;
  readonly contract: string;
}

const SUBJECTS = ['library/subjects/*', 'tests/fixtures/demo-physics'];
const COURSES = ['library/languages/polyglot-semitic-zh-de', 'tests/fixtures/lang-mini'];

export const FILE_KINDS: readonly FileKind[] = [
  ...SUBJECTS.flatMap(s => [
    { glob: `${s}/subject.json`, contract: 'noema.subject.v1' },
    { glob: `${s}/sources.json`, contract: 'noema.sources.v1' },
    { glob: `${s}/chapters/ch*.json`, contract: 'noema.chapter.v1' },
    { glob: `${s}/translations/*/ch*.json`, contract: 'noema.chapter.v1' },
    { glob: `${s}/patches/*.json`, contract: 'noema.chapter.v1#patchFile' },
    { glob: `${s}/map/ch*.json`, contract: 'noema.chapter.v1#map' },
    { glob: `${s}/review/ch*.json`, contract: 'noema.chapter.v1#review' },
    { glob: `${s}/media/media.json`, contract: 'noema.visual.v1#mediaRegistry' },
    { glob: `${s}/bridges/core.json`, contract: 'noema.bridge.v1#core' },
    { glob: `${s}/bridges/[a-z][a-z].json`, contract: 'noema.bridge.v1#locale' },
    { glob: `${s}/pack.json`, contract: 'noema.pack.v3' },
  ]),
  { glob: 'tests/fixtures/bridges/*/pack.json', contract: 'noema.pack.v3' },
  { glob: 'tests/fixtures/bridges/*/bridges/core.json', contract: 'noema.bridge.v1#core' },
  { glob: 'tests/fixtures/bridges/*/bridges/[a-z][a-z].json', contract: 'noema.bridge.v1#locale' },
  ...COURSES.flatMap(c => [
    { glob: `${c}/course.json`, contract: 'noema.lang.v1#course' },
    { glob: `${c}/core/fields/*.json`, contract: 'noema.lang.v1#field' },
    { glob: `${c}/core/nodes.json`, contract: 'noema.lang.v1#nodes' },
    { glob: `${c}/core/functions/*.json`, contract: 'noema.lang.v1#function' },
    { glob: `${c}/core/frames.json`, contract: 'noema.lang.v1#frames' },
    { glob: `${c}/core/typology.json`, contract: 'noema.lang.v1#typology' },
    { glob: `${c}/lang/*/language.json`, contract: 'noema.lang.v1#language' },
    { glob: `${c}/lang/*/lexicon/*.json`, contract: 'noema.lang.v1#lexicon' },
    { glob: `${c}/lang/*/grammar/*.json`, contract: 'noema.lang.v1#grammar' },
    { glob: `${c}/lang/*/bank/*.json`, contract: 'noema.lang.v1#bank' },
  ]),
  { glob: 'library/languages/_phenomena/[a-z][a-z].json', contract: 'noema.lang.v1#phenomena' },
  { glob: 'library/languages/*/facades/*/facade.json', contract: 'noema.langfacade.v1#manifest' },
  { glob: 'library/languages/*/facades/*/core.json', contract: 'noema.langfacade.v1#entries' },
  { glob: 'library/languages/*/facades/*/[a-z][a-z].json', contract: 'noema.langfacade.v1#entries' },
  { glob: 'library/languages/_typology/facades/[a-z][a-z].json', contract: 'noema.langfacade.v1#entries' },
  // (the fixture's entries carry src "test" instead of a master's hash on purpose: tests/langcore.js reads them as stale)
  { glob: 'tests/fixtures/lang-facade/*/facade.json', contract: 'noema.langfacade.v1#manifest' },
  { glob: 'tools/activities_examples/*/activity.json', contract: 'noema.activities.v1#item' },
  { glob: 'library/groups.json', contract: 'noema.account.v1#groups' },
];

const reOf = (glob: string): RegExp => new RegExp(`^${glob.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

/** The kind of a file (its path relative to the repository), or null. */
export function kindOf(rel: string): FileKind | null {
  const p = rel.split(path.sep).join('/');
  return FILE_KINDS.find(k => reOf(k.glob).test(p)) ?? null;
}

const SKIP = new Set(['node_modules', '.git', '.claude', 'dist', '_to_delete']);
/** Every file of the repository that has a kind → [{ rel, kind }], sorted. */
export function repoFiles(root: string): { rel: string; kind: FileKind }[] {
  const out: { rel: string; kind: FileKind }[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.json')) { const k = kindOf(rel); if (k) out.push({ rel, kind: k }); }
    }
  };
  for (const top of ['library', 'tests/fixtures', 'tools/activities_examples']) if (fs.existsSync(path.join(root, top))) walk(top);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
