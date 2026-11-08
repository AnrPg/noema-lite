/// <reference types="node" />
/**
 * The vault's server contract (src/ports/vault.ts): every VaultServer adapter passes it (src/adapters/<x>/<x>.test.ts calls
 * it with its factory). `make()` gives a server signed in as a fresh person, on a vault whose field graph holds the seed
 * (tools/vault_fields/fields.json: Genetics is Q7162, Physics Q413).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoemaError } from '../../kernel/errors.ts';
import type { VaultServer } from '../vault.ts';

export type VaultFactory = () => Promise<VaultServer>;

const value = <T>(r: { ok: true; value: T } | { ok: false; error: NoemaError }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const PDF = new TextEncoder().encode('%PDF-1.7 the notes of a lecture');

export function vaultContract(name: string, make: VaultFactory): void {
  describe(`Vault server contract: ${name}`, () => {
    test('a file: its row, its object, finished — then listed as mine, downloaded byte for byte, edited, removed', async () => {
      const s = await make();
      const id = globalThis.crypto.randomUUID(),
        path = `files/${id}.pdf`;
      assert.ok(s.uid(), 'signed in');
      value(
        await s.insert({
          id,
          path,
          title: 'Genetics notes',
          kind: 'notes',
          fields: ['Q7162'],
          language: 'en',
          file_name: 'genetics.pdf',
          mime: 'application/pdf',
          size: PDF.length,
        }),
      );
      value(await s.putObject(path, new Blob([PDF], { type: 'application/pdf' }), 'application/pdf'));
      value(await s.finish(id));
      const mine = value(await s.list()).find(f => f.id === id);
      assert.ok(mine, 'listed');
      assert.equal(mine.mine, true);
      assert.equal(mine.title, 'Genetics notes');
      const blob = value(await s.download(path, 'application/pdf'));
      assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), PDF);
      value(await s.edit(id, { title: 'Genetics notes, week 1' }));
      assert.equal(value(await s.list()).find(f => f.id === id)?.title, 'Genetics notes, week 1');
      value(await s.count(id, 'download'));
      value(await s.removeObject(path));
      value(await s.removeRow(id));
      assert.equal(
        value(await s.list()).find(f => f.id === id),
        undefined,
        'gone',
      );
    });

    test('ratings and reports: mine, one per file', async () => {
      const s = await make();
      const id = globalThis.crypto.randomUUID(),
        path = `files/${id}.pdf`;
      value(
        await s.insert({
          id,
          path,
          title: 'Mechanics',
          kind: 'notes',
          fields: ['Q413'],
          language: 'en',
          file_name: 'm.pdf',
          mime: 'application/pdf',
          size: PDF.length,
        }),
      );
      value(await s.putObject(path, new Blob([PDF]), 'application/pdf'));
      value(await s.finish(id));
      value(await s.rate(id, 4));
      value(await s.rate(id, 5));
      assert.deepEqual(
        value(await s.myRatings())
          .filter(r => r.file_id === id)
          .map(r => r.stars),
        [5],
        'one rating per file: the last',
      );
      value(await s.report(id, 'labels', null));
      assert.equal(value(await s.myReports()).find(r => r.file_id === id)?.reason, 'labels');
      assert.equal((await s.report(id, 'labels', null)).ok, false, 'a second report of the same file is refused');
    });

    test('a row the server refuses (an unknown field) leaves nothing behind', async () => {
      const s = await make();
      const id = globalThis.crypto.randomUUID();
      const r = await s.insert({
        id,
        path: `files/${id}.pdf`,
        title: 'x',
        kind: 'notes',
        fields: ['no-such-field'],
        language: 'en',
        file_name: 'x.pdf',
        mime: 'application/pdf',
        size: 3,
      });
      assert.equal(r.ok, false);
      assert.equal(
        value(await s.list()).find(f => f.id === id),
        undefined,
      );
    });

    test('the fields: read in pages, a stamp, a proposal mine at once, suggestions', async () => {
      const s = await make();
      const page = value(await s.fields(0, 1000));
      assert.ok(page.some(f => f.id === 'Q7162'));
      assert.ok(page.every(f => typeof f.id === 'string'));
      assert.ok(value(await s.fields(1000000, 1000)).length === 0, 'past the end: nothing');
      assert.equal(typeof value(await s.fieldsStamp()), 'string');
      const id = value(await s.propose('Quantum biology', 'en', ['Q7162']));
      assert.ok(id);
      const all = [];
      for (let o = 0; ; o += 1000) {
        const rows = value(await s.fields(o, 1000));
        all.push(...rows);
        if (rows.length < 1000) break;
      }
      assert.ok(
        all.some(f => f.id === id && f.status === 'proposed'),
        'my proposal is in my graph',
      );
      assert.equal(value(await s.propose('quantum  BIOLOGY', 'en', [])), id, 'the same name again: the same field');
      assert.ok(Array.isArray(value(await s.suggest('Genetics notes', null))));
    });
  });
}
