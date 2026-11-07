#!/usr/bin/env node
/* noema-lite — run the format migrations (src/contracts/migrations) over every data file of the repository
   (src/contracts/repo.ts lists them) and prove nothing was lost: for every file the counts of what it holds (chapters,
   sections, blocks, exercises, cards, playbooks, sources, media, translations, words, sentences …) are the same before
   and after, and the migrated file satisfies its contract. A built pack's pack.js beside its pack.json is migrated with it.

   Usage: npm run migrate            migrate, write the files, print what changed and the counts
          npm run migrate -- --check write nothing; exit 1 when a file still needs a migration (CI)
   (node --experimental-strip-types tools/migrate/run.mjs: the migrations are TypeScript) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoFiles } from '../../src/contracts/repo.ts';
import { migrateText, counts } from '../../src/contracts/migrations/index.ts';
import { problems } from '../../src/contracts/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const show = c => Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');

/** A generated pack.js: the header line and the pack's JSON after "= " (with "</" written "<\/"). */
const PACK_JS = /^(\/\* GENERATED subject pack:[^\n]*\n\(window\.NOEMA_PACKS = window\.NOEMA_PACKS \|\| \{\}\)\[[^\]]+\] = )([\s\S]*);\n$/;

let failed = 0, changed = 0;
const report = [];
for (const { rel, kind } of repoFiles(ROOT)) {
  const file = path.join(ROOT, rel), text = fs.readFileSync(file, 'utf8');
  const before = counts(JSON.parse(text));
  const { text: out, applied } = migrateText(text);
  if (!applied.length) continue;
  const doc = JSON.parse(out), after = counts(doc), bad = problems(kind.contract, doc);
  const ok = same(before, after) && !bad.length;
  if (!ok) failed++;
  changed++;
  const entry = { file: rel, applied, before, after, ok, problems: bad.slice(0, 5) };
  const js = path.join(path.dirname(file), 'pack.js');
  if (path.basename(file) === 'pack.json' && fs.existsSync(js)) {
    const m = PACK_JS.exec(fs.readFileSync(js, 'utf8'));
    if (!m) { failed++; entry.ok = false; entry.problems.push('pack.js is not the generated form'); }
    else {
      const jsOut = migrateText(m[2]);
      const jsOk = same(counts(JSON.parse(m[2])), counts(JSON.parse(jsOut.text))) && JSON.stringify(JSON.parse(jsOut.text)) === JSON.stringify(doc);
      if (!jsOk) { failed++; entry.ok = false; entry.problems.push('pack.js does not hold the same pack as pack.json'); }
      entry.alsoFile = path.relative(ROOT, js).split(path.sep).join('/');
      if (!CHECK && jsOk) fs.writeFileSync(js, m[1] + jsOut.text + ';\n');
    }
  }
  if (!CHECK && entry.ok) fs.writeFileSync(file, out);
  report.push(entry);
  console.log(`${entry.ok ? '✓' : '✗'} ${rel}${entry.alsoFile ? ` (+ ${entry.alsoFile})` : ''}: ${applied.join(', ')}  —  ${show(before)}${same(before, after) ? '  (the same after)' : `  →  ${show(after)}`}${entry.problems.length ? `\n    ${entry.problems.join('\n    ')}` : ''}`);
}
console.log(`migrate: ${changed} file(s) ${CHECK ? 'need a migration' : 'migrated'}, ${failed} failed`);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
process.exit(failed || (CHECK && changed) ? 1 : 0);
