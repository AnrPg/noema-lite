/* The words of the UI foundation: every key the code asks for is in i18n/ui/en.arb (or built at run time from a prefix
   of dynamic_keys.txt), every key of en.arb is used, and each of the 14 drafts has every key with the same placeholders. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOCALES, uiCatalogs } from './services.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = [
  join(ROOT, 'src/ui'),
  join(ROOT, 'src/composition/ui-kit-root.ts'),
  join(ROOT, 'src/composition/ui-root.ts'),
  join(ROOT, 'src/composition/shell'),
];

function files(p: string): string[] {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p)
    .flatMap(f => (f === 'test' ? [] : files(join(p, f))))
    .filter(f => f.endsWith('.ts'));
}

const code = SRC.flatMap(files)
  .map(f => readFileSync(f, 'utf8'))
  .join('\n');
const used = new Set([...code.matchAll(/['"`](ui\.[a-zA-Z0-9_.]+[a-zA-Z0-9_])['"`]/g)].map(m => m[1] ?? ''));
const dynamic = readFileSync(join(ROOT, 'i18n/ui/dynamic_keys.txt'), 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l !== '' && !l.startsWith('#'));
const cats = uiCatalogs();
const en = cats['en'] ?? {};
const placeholders = (m: string): string[] => [...new Set([...m.matchAll(/\{(\w+)/g)].map(x => x[1] ?? ''))].sort();

test('every key the code names is in en.arb', () => {
  const missing = [...used].filter(k => !(k in en));
  assert.deepEqual(missing, []);
});

test('every key of en.arb is named in the code or built from a dynamic prefix', () => {
  const isDynamic = (k: string): boolean => dynamic.some(d => (d.endsWith('*') ? k.startsWith(d.slice(0, -1)) : k === d));
  const unused = Object.keys(en).filter(k => !used.has(k) && !isDynamic(k));
  assert.deepEqual(unused, []);
});

test('the 14 drafts: every key, the same placeholders, no ASCII apostrophe', () => {
  const tags = LOCALES.map(l => l.tag).filter(t => t !== 'en');
  assert.deepEqual(
    Object.keys(cats)
      .filter(t => t !== 'en')
      .sort(),
    [...tags].sort(),
  );
  for (const tag of tags) {
    const d = cats[tag] ?? {};
    assert.deepEqual(
      Object.keys(en).filter(k => !(k in d)),
      [],
      `${tag}: missing keys`,
    );
    assert.deepEqual(
      Object.keys(d).filter(k => !(k in en)),
      [],
      `${tag}: keys not in en.arb`,
    );
    for (const [k, m] of Object.entries(en)) assert.deepEqual(placeholders(d[k] ?? ''), placeholders(m), `${tag} ${k}`);
  }
  for (const [tag, c] of Object.entries(cats)) for (const [k, m] of Object.entries(c)) assert.ok(!m.includes("'"), `${tag} ${k}: ’ not '`);
});
