/// <reference types="node" />
/** The vault's domain (docs/VAULT.md): the formats and their first bytes, the field graph (the seed of
    tools/vault_fields), the filters and the search of the files, the address, the folders, the pins. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeFilters,
  checkFile,
  fieldFolder,
  fieldGraph,
  filterFiles,
  isPinned,
  parseVaultParams,
  pin,
  pinsOf,
  schoolFolder,
  snapName,
  sortFiles,
  unpin,
  valuesOf,
  vaultHash,
  type FieldRow,
  type VaultFile,
} from './index.ts';

const SEED = (JSON.parse(readFileSync(new URL('../../../../tools/vault_fields/fields.json', import.meta.url), 'utf8')) as FieldRow[]).map(
  f => ({ ...f, status: 'accepted' as const }),
);
const G = fieldGraph(SEED);
const en = (id: string): string => G.name(id, 'en');
const bytes = (s: string): Uint8Array => Uint8Array.from(Array.from(s, c => c.charCodeAt(0)));
const why = (name: string, head: string | number[], size?: number, used = 0): string => {
  const h = typeof head === 'string' ? bytes(head) : Uint8Array.from(head);
  const r = checkFile(name, size ?? h.length, h, used);
  return r.ok ? '' : r.error;
};

describe('the formats', () => {
  test('a file is what its first bytes say', () => {
    assert.equal(why('notes.pdf', '%PDF-1.7 ...'), '');
    assert.equal(why('notes.pdf', 'MZ\x90\x00 a program'), 'notWhatItSays');
    assert.equal(why('slides.pptx', 'PK\x03\x04....'), '');
    assert.equal(why('talk.mp3', 'ID3....'), '');
    assert.equal(why('notes.txt', [65, 0, 66]), 'notWhatItSays', 'a “text” with binary in it');
    assert.equal(why('photo.webp', 'RIFF....WEBP'), '');
  });
  test('programs, SVG and archives are refused; the sizes and the quota', () => {
    for (const n of ['setup.exe', 'a.svg', 'all.zip', 'noext']) assert.equal(why(n, 'MZ'), 'badFormat', n);
    assert.equal(why('big.pdf', '%PDF', 21 * 1048576), 'tooBig');
    assert.equal(why('a.pdf', '%PDF', 5 * 1048576, 48 * 1048576), 'quotaFull');
    assert.equal(why('a.pdf', '', 0), 'empty');
  });
});

describe('the field graph', () => {
  test('a graph, not a tree: Medical physics under Physics and under Medicine', () => {
    const up = G.up('Q1120908');
    for (const id of ['Q413', 'Q11190', 'b_hw', 'b_ns']) assert.ok(up.has(id), id);
    assert.equal(G.roots().length, 10);
    assert.ok(G.roots().every(id => id.startsWith('b_')));
  });
  test('names: the locale, its language, English', () => {
    assert.equal(en('Q413'), 'Physics');
    assert.equal(G.name('Q413', 'el-CY'), G.name('Q413', 'el'));
    assert.equal(G.name('nope', 'en'), 'nope');
  });
  test('finding a field: part of a name in any language, a typo, initials; the close ones first', () => {
    assert.equal(G.find('ιατρική φυσ', 'en')[0], 'Q1120908');
    assert.ok(G.find('radiolog', 'en').some(id => en(id) === 'Radiology'));
    assert.equal(G.find('физика', 'en')[0], 'Q413');
    assert.ok(G.find('genitcs', 'en').some(id => en(id) === 'Genetics'));
    assert.ok(G.find('machin lerning', 'en').some(id => en(id) === 'Machine learning'));
    assert.ok(G.find('ml', 'en').some(id => en(id) === 'Machine learning'));
    assert.ok(G.find('γενετκη', 'en').some(id => en(id) === 'Genetics'));
    assert.equal(G.find('physics', 'en')[0], 'Q413');
    assert.deepEqual(G.find('', 'en'), []);
  });
  test('the fields a title names, the most specific', () => {
    assert.ok(G.fromText('Σημειώσεις Γενετικής', 'en').includes('Q7162'));
    assert.equal(G.fromText('Medical physics lecture 3', 'en').join(), 'Q1120908');
    assert.deepEqual(G.fromText('Lecture 1', 'en'), []);
    assert.ok(G.fromText('the modern ai and data platform · AI systems', 'en').includes('Q11660'));
    assert.equal(G.fromText('Organic chemistry exam', 'en').map(en).join(), 'Organic chemistry');
  });
  test('a field I propose is mine at once', () => {
    const g2 = G.with({ id: 'u_1', names: { en: 'Quantum biology' }, parents: ['Q7162'], status: 'proposed' });
    assert.equal(g2.get('u_1')?.status, 'proposed');
    assert.ok(g2.children('Q7162').includes('u_1'));
    assert.equal(G.get('u_1'), undefined, 'the graph before is unchanged');
  });
});

const rows: VaultFile[] = [
  {
    id: '1',
    university: 'University of Crete',
    department: 'Biology',
    course: 'Genetics',
    year: 2023,
    semester: 3,
    kind: 'notes',
    fields: ['Q7162'],
    language: 'en',
    title: 'Genetics notes',
    file_name: 'g.pdf',
    created_at: '2026-01-02',
  },
  {
    id: '2',
    university: 'Πανεπιστήμιο Αθηνών',
    department: 'Βιολογίας',
    course: 'Γενετική',
    year: 2021,
    semester: 3,
    kind: 'notes',
    fields: ['Q7162'],
    language: 'el',
    title: 'Σημειώσεις Γενετικής',
    file_name: 'g2.pdf',
    has_solutions: true,
    created_at: '2026-01-03',
  },
  {
    id: '3',
    university: 'University of Crete',
    department: 'Biology',
    course: 'Genetics',
    year: 2023,
    semester: 3,
    kind: 'exam',
    fields: ['Q7162', 'Q420'],
    language: 'en',
    title: 'Exam 2023',
    file_name: 'e.pdf',
    created_at: '2026-01-01',
    rating_n: 2,
    rating_sum: 9,
  },
  {
    id: '4',
    university: 'University of Crete',
    department: 'Physics',
    course: 'Mechanics',
    year: 2022,
    semester: 1,
    kind: 'notes',
    fields: ['Q413'],
    language: 'en',
    title: 'Mechanics',
    file_name: 'm.mp4',
    created_at: '2026-01-04',
  },
  {
    id: '5',
    university: null,
    department: null,
    course: null,
    year: 2026,
    semester: null,
    kind: 'other',
    fields: ['Q1120908'],
    language: 'el,ru',
    title: 'Glossary el–ru',
    file_name: 'gl.pdf',
    created_at: '2026-01-05',
  },
];
/** what a file is searched in (the page adds its menus' words: vault.js hayOf) */
const hay = (f: VaultFile): string =>
  [f.title, f.university, f.department, f.course, f.year ? String(f.year) : '', ...(f.fields ?? []).flatMap(id => G.allNames(id))]
    .filter(Boolean)
    .join(' · ');
const got = (P: Parameters<typeof filterFiles>[1]): string =>
  filterFiles(rows, P, G, hay)
    .map(r => r.id)
    .join(' ');

describe('the files', () => {
  test('filters: a field and every field below it, a type, a semester (a file of no semester is in every one)', () => {
    assert.equal(got({ sub: 'Q420', k: 'notes', sem: '3' }), '1 2');
    assert.equal(got({ sem: '1' }), '4 5');
    assert.equal(got({ sub: 'Q413' }), '4 5');
    assert.equal(got({ sub: 'b_ns' }).split(' ').length, 5);
  });
  test('a university in any case, a year, has solutions, a language of several, a format group, a rating', () => {
    assert.equal(got({ u: 'university of crete', y: '2023' }), '1 3');
    assert.equal(got({ sol: '1' }), '2');
    assert.equal(got({ lg: 'ru' }), '5');
    assert.equal(got({ lg: 'el' }), '2 5');
    assert.equal(got({ ft: 'video' }), '4');
    assert.equal(got({ r: '4' }), '3');
  });
  test('the search words in any script: Greek in Latin letters, the fields’ names in every language', () => {
    assert.equal(got({ q: 'genetiki' }), '1 2 3');
    assert.equal(got({ q: 'athinon' }), '2');
    assert.equal(got({ q: 'ιατρική φυσική' }), '5');
    assert.equal(got({ q: 'physique medicale' }), '5');
    assert.equal(got({ q: 'glossary 2026' }), '5');
  });
  test('sorts, values, a name written another way', () => {
    assert.deepEqual(
      sortFiles(rows, undefined).map(f => f.id),
      ['5', '4', '2', '1', '3'],
    );
    assert.equal(sortFiles(rows, 'rating')[0]?.id, '3');
    assert.deepEqual(valuesOf(rows, 'university')[0], { v: 'University of Crete', n: 3 });
    assert.equal(snapName(rows, 'university', '  university OF crete '), 'University of Crete');
    assert.equal(snapName(rows, 'university', 'Nowhere'), null);
  });
  test('the address', () => {
    assert.equal(vaultHash({ q: 'dna', sem: '3', k: 'notes,exam' }), '#/vault?q=dna&sem=3&k=notes%2Cexam');
    assert.deepEqual(parseVaultParams('#/vault?q=dna&zz=1&sort=year'), { q: 'dna', sort: 'year' });
    assert.deepEqual(activeFilters({ q: 'x', v: 'files', sem: '3', k: 'notes' }), ['sem', 'k']);
  });
});

describe('the folders and the pins', () => {
  const nameOf = (_: string, v: string): string => v;
  test('by school: university › department › course, the files without that detail last', () => {
    const top = schoolFolder(rows, [], nameOf);
    assert.equal(top.level, 'university');
    assert.deepEqual(
      top.kids.map(k => [k.v, k.n]),
      [
        ['University of Crete', 3],
        ['Πανεπιστήμιο Αθηνών', 1],
        ['-', 1],
      ],
    );
    const dep = schoolFolder(rows, ['university of crete'], nameOf);
    assert.deepEqual(
      dep.kids.map(k => k.v),
      ['Biology', 'Physics'],
    );
    const end = schoolFolder(rows, ['University of Crete', 'Biology', 'Genetics'], nameOf);
    assert.equal(end.level, null);
    assert.deepEqual(
      end.here.map(f => f.id),
      ['1', '3'],
    );
    assert.deepEqual(
      schoolFolder(rows, ['-'], nameOf).here.map(f => f.id),
      ['5'],
    );
  });
  test('by field: down the graph; a file under two fields shows in both', () => {
    const top = fieldFolder(rows, [], G, en);
    assert.ok(top.kids.some(k => k.v === 'b_ns'));
    const phys = fieldFolder(rows, ['b_ns', 'Q413'], G, en);
    assert.equal(phys.node, 'Q413');
    assert.deepEqual(
      phys.direct.map(f => f.id),
      ['4'],
    );
    assert.ok(phys.kids.some(k => k.v === 'Q1120908'));
    const lost = fieldFolder([{ id: 'x', title: 'x', kind: 'other', file_name: 'x.pdf', fields: ['nope'] }], [], G, en);
    assert.deepEqual(lost.kids, [{ v: '-', n: 1 }]);
  });
  test('pins: once each, newest first, at most 12; what cannot be one is left out', () => {
    let p = pinsOf([{ by: 'school', f: 'a', label: 'A' }, { by: 'x', f: 'b' }, null]);
    assert.equal(p.length, 1);
    for (let i = 0; i < 14; i++) p = pin(p, { by: 'field', f: `f${i}`, label: String(i) });
    assert.equal(p.length, 12);
    assert.equal(p[0]?.f, 'f13');
    assert.ok(isPinned(p, 'field', 'f13'));
    assert.ok(!isPinned(unpin(p, 'field', 'f13'), 'field', 'f13'));
  });
});
