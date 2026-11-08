import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { fromBase64, sha256Hex, toBase64, utf8Length, utf8Text, utf8Bytes } from './bytes.ts';

test('sha256Hex: the published vectors and node:crypto on random lengths', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
  for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 70_000]) {
    const b = new Uint8Array(randomBytes(n));
    assert.equal(sha256Hex(b), createHash('sha256').update(b).digest('hex'), `${n} bytes`);
  }
  assert.equal(sha256Hex('Ωmega ✓'), createHash('sha256').update('Ωmega ✓', 'utf8').digest('hex'));
});

test('base64 both ways, as Buffer does', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 100, 4097]) {
    const b = new Uint8Array(randomBytes(n)),
      t = Buffer.from(b).toString('base64');
    assert.equal(toBase64(b), t);
    assert.deepEqual(fromBase64(t), b);
    assert.deepEqual(fromBase64('data:application/zip;base64,' + t.replace(/(.{10})/g, '$1\n')), b);
  }
  assert.equal(fromBase64('a$b'), null);
  assert.equal(fromBase64('abcde'), null);
});

test('utf8', () => {
  assert.equal(utf8Length('aΩ✓😀'), 1 + 2 + 3 + 4);
  assert.equal(utf8Text(utf8Bytes('aΩ✓😀')), 'aΩ✓😀');
});
