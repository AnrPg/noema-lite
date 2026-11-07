/* noema-lite — the format migrations never lose a thing: for every data file of the repository the counts of what it
   holds are the same before and after, a migrated file satisfies its contract, a second run changes nothing, and the
   files in the repository are all migrated already (tools/migrate/run.mjs wrote them; npm run migrate -- --check). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, migrateText, counts, packV3, stringifyLike } from './index.ts';
import { repoFiles } from '../repo.ts';
import { check } from '../index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FILES = repoFiles(ROOT);
const PACKS = FILES.filter(f => f.kind.contract === 'noema.pack.v3').map(f => f.rel);

test('every file of the repository is migrated already, and a run over it changes nothing', () => {
  const pending = FILES.filter(f => migrateText(read(f.rel)).applied.length).map(f => f.rel);
  assert.deepEqual(pending, []);
  for (const f of FILES.slice(0, 50)) { const t = read(f.rel); assert.equal(migrateText(t).text, t, f.rel); }
});

test('pack.v3: a pack of v 1 or 2 becomes v 3 — the same bytes but the version, the same counts, its contract met', () => {
  assert.ok(PACKS.length >= 6, PACKS.join(', '));
  for (const rel of PACKS) {
    const now = read(rel), doc = JSON.parse(now) as Record<string, unknown>;
    assert.equal(doc.v, 3, rel);
    for (const old of [1, 2]) {
      const before = now.replace(/("format"\s*:\s*"noema-pack"\s*,\s*"v"\s*:\s*)3/, `$1${old}`);
      assert.notEqual(before, now);
      const { text, applied } = migrateText(before);
      assert.deepEqual(applied, ['pack.v3'], rel);
      assert.equal(text, now, `${rel}: v ${old} → 3 gives back the file byte for byte`);
      assert.deepEqual(counts(JSON.parse(before)), counts(JSON.parse(text)), `${rel}: the counts`);
      assert.deepEqual(migrateText(text).applied, [], `${rel}: a second run changes nothing`);
    }
    assert.ok(check('noema.pack.v3', doc).ok, rel);
  }
});

test('the counts of the learning material, file by file (what a migration must keep)', () => {
  const pack = counts(JSON.parse(read('library/subjects/databricks/pack.json')));
  assert.ok(pack.chapters === 13 && (pack.sections ?? 0) > 100 && (pack.exercises ?? 0) > 1000 && (pack.flashcards ?? 0) > 100 && pack.sources === 2, JSON.stringify(pack));
  const lex = FILES.filter(f => f.kind.contract === 'noema.lang.v1#lexicon').reduce((n, f) => n + (counts(JSON.parse(read(f.rel))).words ?? 0), 0);
  const bank = FILES.filter(f => f.kind.contract === 'noema.lang.v1#bank').reduce((n, f) => n + (counts(JSON.parse(read(f.rel))).sentences ?? 0), 0);
  assert.ok(lex > 2000 && bank > 100, `${lex} words, ${bank} sentences`);
  for (const f of FILES) {
    const d = JSON.parse(read(f.rel)) as unknown, after = migrate(d).doc;
    assert.deepEqual(counts(after), counts(d), f.rel);
  }
});

test('a migration is idempotent and keeps the order of the keys', () => {
  const p = { format: 'noema-pack', subject: { id: 'x', title: 'X' }, chapters: [{ id: 'ch01' }] };
  const once = migrate(p), twice = migrate(once.doc);
  assert.deepEqual(once.applied, ['pack.v3']);
  assert.deepEqual(Object.keys(once.doc as object), ['format', 'v', 'subject', 'chapters']);
  assert.deepEqual(twice.applied, []);
  assert.equal(twice.doc, once.doc);
  assert.ok(!packV3.applies({ format: 'noema-translation', v: 1 }) && !packV3.applies({ format: 'noema-pack', v: 3 }));
  // a text the patch cannot reach is written out again in the file's own layout
  assert.equal(migrateText('{\n  "subject": {},\n  "format": "noema-pack"\n}\n').text, stringifyLike('{\n  "x": 1\n}\n', { subject: {}, format: 'noema-pack', v: 3 }));
});
