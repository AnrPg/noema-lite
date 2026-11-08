/// <reference types="node" />
/** The vault's use cases over a recording server: an upload leaves nothing half-made, the field graph is kept on the
    device until a field changes or a day passes, the answers come as the screens want them. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult, type Result } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import type { FieldRow, VaultServer } from '../../../ports/vault.ts';
import { FIELDS_TTL_MS, fieldsCacheKey, vaultService } from './vault.ts';

function mapKv(): KeyValueStore & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: k => ok(map.get(k) ?? null),
    set: (k, v) => {
      map.set(k, v);
      return OK_VOID;
    },
    delete: k => {
      map.delete(k);
      return OK_VOID;
    },
    keys: (p = '') => ok([...map.keys()].filter(k => k.startsWith(p))),
  };
}
const clockAt = (t: { now: number }): Clock => ({ now: () => t.now }) as unknown as Clock;
const fail = (code: 'cloud.network' | 'cloud.server' = 'cloud.server'): Result<never> => err(new NoemaError(code, 'no'));
const done = (): AsyncResult<void> => Promise.resolve(OK_VOID);

/** A server that records its calls; each method can be replaced. */
function server(over: Partial<VaultServer> = {}): VaultServer & { readonly calls: string[] } {
  const calls: string[] = [];
  const rec =
    <A extends unknown[], T>(name: string, f: (...a: A) => AsyncResult<T>) =>
    (...a: A): AsyncResult<T> => {
      calls.push(name + (a.length ? ' ' + JSON.stringify(a[0]) : ''));
      return f(...a);
    };
  const FIELDS: FieldRow[] = [{ id: 'Q7162', names: { en: 'Genetics' }, parents: [], status: 'accepted' }];
  const base: VaultServer = {
    uid: () => 'me',
    list: () => Promise.resolve(ok([])),
    myRatings: () => Promise.resolve(ok([{ file_id: 'f1', stars: 4 }])),
    myReports: () => Promise.resolve(ok([{ file_id: 'f2', reason: 'spam' }])),
    insert: done,
    putObject: done,
    finish: done,
    removeObject: done,
    removeRow: done,
    edit: done,
    rate: done,
    report: done,
    count: done,
    download: () => Promise.resolve(ok(new Blob(['x']))),
    fields: (o: number) => Promise.resolve(ok(o === 0 ? FIELDS : [])),
    fieldsStamp: () => Promise.resolve(ok('s1')),
    propose: () => Promise.resolve(ok('u_9')),
    suggest: () => Promise.resolve(ok([{ field: 'Q7162' }])),
    ...over,
  };
  const out = { calls } as VaultServer & { calls: string[] };
  for (const [k, v] of Object.entries(base))
    (out as unknown as Record<string, unknown>)[k] = k === 'uid' ? v : rec(k, v as (...a: unknown[]) => AsyncResult<unknown>);
  return out;
}
const META = { title: 'Notes', kind: 'notes', fields: ['Q7162'], language: 'en' };
const FILE = { name: 'Notes.PDF', size: 3, blob: new Blob(['%PD']) };

describe('the vault service', () => {
  test('an upload: the row, the object, the server’s check → the id', async () => {
    const s = server();
    const v = vaultService({ server: s, kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'id1' });
    const r = await v.upload(META, FILE);
    assert.deepEqual(r, ok('id1'));
    assert.deepEqual(
      s.calls.map(c => c.split(' ')[0]),
      ['insert', 'putObject', 'finish'],
    );
    assert.match(s.calls[0] ?? '', /"path":"files\/id1\.pdf".*|"mime":"application\/pdf"/);
  });
  test('an upload that fails half-way leaves nothing behind (the object and the row go), and says why', async () => {
    for (const where of ['putObject', 'finish'] as const) {
      const s = server({ [where]: () => Promise.resolve(fail('cloud.network')) });
      const v = vaultService({ server: s, kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'id2' });
      const r = await v.upload(META, FILE);
      assert.equal(r.ok, false);
      assert.deepEqual(r, fail('cloud.network'));
      assert.deepEqual(s.calls.slice(-2), ['removeObject "files/id2.pdf"', 'removeRow "id2"'], where);
    }
    const s = server({ insert: () => Promise.resolve(fail()) });
    await vaultService({ server: s, kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'id3' }).upload(META, FILE);
    assert.deepEqual(s.calls, [
      'insert {"title":"Notes","kind":"notes","fields":["Q7162"],"language":"en","id":"id3","file_name":"Notes.PDF","mime":"application/pdf","size":3,"path":"files/id3.pdf"}',
    ]);
    const bad = await vaultService({ server: server(), kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'x' }).upload(META, {
      ...FILE,
      name: 'a.exe',
    });
    assert.equal(bad.ok, false, 'a format the vault does not take never reaches the server');
  });
  test('my ratings and reports by file; a rating is 1 to 5; a count never fails', async () => {
    const v = vaultService({
      server: server({ count: () => Promise.resolve(fail()) }),
      kv: mapKv(),
      clock: clockAt({ now: 0 }),
      newId: () => 'x',
    });
    assert.deepEqual(await v.myRatings(), ok({ f1: 4 }));
    assert.deepEqual(await v.myReports(), ok({ f2: 'spam' }));
    assert.ok((await v.count('f1', 'download')).ok);
    const stars: number[] = [];
    const s = server({
      rate: (_id, n) => {
        stars.push(n);
        return done();
      },
    });
    const w = vaultService({ server: s, kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'x' });
    await w.rate('f1', 9);
    await w.rate('f1', -2);
    await w.rate('f1', 3.6);
    assert.deepEqual(stars, [5, 1, 4]);
  });
  test('the field graph: read once, kept on the device; read again when a field changed or a day later', async () => {
    const kv = mapKv(),
      t = { now: 1000 },
      stamp = { v: 's1' };
    const make = () => {
      const s = server({ fieldsStamp: () => Promise.resolve(ok(stamp.v)) });
      return { s, v: vaultService({ server: s, kv, clock: clockAt(t), newId: () => 'x' }) };
    };
    const a = make();
    const g = await a.v.loadFields();
    assert.ok(g.ok && g.value.get('Q7162'));
    assert.ok(kv.map.has(fieldsCacheKey('me')));
    assert.equal(a.v.fields().size, 1);
    const b = make();
    await b.v.loadFields();
    assert.ok(!b.s.calls.some(c => c.startsWith('fields ')), 'the copy of this device');
    stamp.v = 's2';
    const c = make();
    await c.v.loadFields();
    assert.ok(
      c.s.calls.some(x => x.startsWith('fields ')),
      'a field changed: read again',
    );
    t.now += FIELDS_TTL_MS + 1;
    const d = make();
    await d.v.loadFields();
    assert.ok(
      d.s.calls.some(x => x.startsWith('fields ')),
      'a day later: read again',
    );
    kv.map.set(fieldsCacheKey('me'), '{not json');
    const e = make();
    assert.ok((await e.v.loadFields()).ok, 'a copy that cannot be read is read again');
  });
  test('a field I propose is in my graph at once; suggestions as ids', async () => {
    const v = vaultService({ server: server(), kv: mapKv(), clock: clockAt({ now: 0 }), newId: () => 'x' });
    await v.loadFields();
    assert.deepEqual(await v.propose('Quantum biology', 'en', ['Q7162']), ok('u_9'));
    assert.equal(v.fields().name('u_9', 'en'), 'Quantum biology');
    assert.deepEqual(await v.suggest('Genetics', null), ok(['Q7162']));
  });
});
