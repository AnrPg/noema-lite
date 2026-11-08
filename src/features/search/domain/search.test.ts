/// <reference types="node" />
/** The search's domain (docs/SEARCH.md): folding, the transliteration rule, the query and its scores, the snippets, the
    page's address, saved and recent searches, the filters and a practice round. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fold,
  foldMap,
  forms,
  hereOf,
  hereParams,
  keeper,
  latin,
  latinMap,
  matchesAll,
  newSavedSearch,
  pageHash,
  parseParams,
  recentSearches,
  rememberSearch,
  removeSaved,
  renameSaved,
  roundSteps,
  sameQuery,
  savedFor,
  savedSearches,
  search,
  searchTerms,
  snip,
  toneNumbers,
  type SearchRecord,
} from './index.ts';

const rec = (o: Partial<SearchRecord> & Pick<SearchRecord, 'k' | 'ti'>): SearchRecord => ({
  ty: 'section',
  w: 'know',
  f: [['title', o.ti]],
  h: '#',
  ...o,
});

describe('fold', () => {
  test('accents, case, final sigma, ß, Hebrew points, Arabic marks, tatweel, hamza signs, quotes, spaces', () => {
    assert.equal(fold('Μεταστόρ ΣΟΦΟΣ'), 'μεταστορ σοφοσ');
    assert.equal(fold('Straße Ärger'), 'strasse arger');
    assert.equal(fold('שָׁלוֹם'), 'שלום');
    assert.equal(fold('أَنَا'), 'انا');
    assert.equal(fold('عربيـة'), 'عربية');
    assert.equal(fold('ʾana ʿayn'), 'ana ayn');
    assert.equal(fold('“quoted” ‘x’'), '"quoted" \'x\'');
    assert.equal(fold('a\tb\nc'), 'a b c');
    assert.equal(fold(null), '');
    assert.equal(fold(undefined), '');
    assert.equal(fold(12), '12');
  });
  test('scholarly Latin letters read as the plain ones typed', () => {
    assert.equal(fold('ǧamal ḵubz ṯalāṯa ġayn'), 'jamal khubz thalatha ghayn');
    assert.equal(fold('šālôm čaj žena'), 'shalom chaj zhena');
    assert.equal(fold('ṣaḥn'), 'sahn');
  });
  test('foldMap: every folded letter knows where it came from', () => {
    const m = foldMap('Ärger über Straße');
    assert.equal(m.t, 'arger uber strasse');
    assert.equal(m.map[m.t.indexOf('strasse') + 5], 'Ärger über Straße'.indexOf('ß'));
    assert.equal(m.map[m.map.length - 1], 'Ärger über Straße'.length);
  });
  test('pinyin tone marks as numbers', () => {
    assert.equal(toneNumbers('nǐ hǎo'), 'ni3 hao3');
    assert.equal(toneNumbers("xī'ān"), "xi1'an1");
    assert.equal(toneNumbers('ma'), 'ma');
  });
});

describe('the transliteration rule', () => {
  test('Greek in plain and in scholarly Latin, ου = ou', () => {
    assert.equal(latin(fold('Βιολογία'), 'plain'), 'viologia');
    assert.equal(latin(fold('Βιολογία'), 'scholarly'), 'biologia');
    assert.equal(latin(fold('Χημεία'), 'scholarly'), 'khemeia');
    assert.equal(latin(fold('Ουρανός'), 'plain'), 'ouranos');
    assert.deepEqual(forms('Βιολογία'), ['βιολογια', 'viologia', 'biologia']);
    assert.deepEqual(forms('Biology'), ['biology'], 'a Latin text has one form');
  });
  test('Cyrillic in Latin', () => {
    assert.equal(latin(fold('Щука Юля'), 'plain'), 'shchuka yulya');
    assert.equal(latin(fold('объект'), 'plain'), 'obekt');
  });
  test('latinMap maps every Latin letter back to its letter', () => {
    const m = latinMap('θεα', 'plain');
    assert.equal(m.t, 'thea');
    assert.deepEqual(m.map, [0, 0, 1, 2, 3]);
  });
  test('matchesAll: every word, in any form', () => {
    assert.ok(matchesAll('Σημειώσεις Βιολογίας · Πανεπιστήμιο Κρήτης', 'viologias kritis'));
    assert.ok(matchesAll('Σημειώσεις Βιολογίας', 'biologias'));
    assert.ok(matchesAll('Βιολογία', 'ΒΙΟΛΟΓΊΑ'));
    assert.ok(matchesAll('Biologia', 'Βιολογία'), 'the other way too');
    assert.ok(matchesAll('Генетика, МГУ', 'genetika'));
    assert.ok(matchesAll('Café Économie', 'cafe economie'));
    assert.ok(!matchesAll('Genetics', 'physics'));
    assert.ok(matchesAll('anything', '  '), 'no words: everything');
  });
  test('a name as searched on the server: each word once, ≤ 600', () => {
    assert.equal(searchTerms('Νίκος Παπαδάκης'), 'νικοσ παπαδακησ nikos papadakis papadakes', 'η: i typed, e in the scholarly letters');
    assert.equal(searchTerms('x '.repeat(400) + 'Ωω'.repeat(400)).length, 600);
  });
});

describe('search', () => {
  const recs: SearchRecord[] = [
    rec({ k: 'a', ty: 'section', ti: 'Metastore', f: [['title', 'Metastore']] }),
    rec({ k: 'b', ty: 'theory', ti: 'p', f: [['paragraph', 'The **metastore** holds catalogs.']], x: { bt: 'paragraph' } }),
    rec({
      k: 'c',
      ty: 'chapter',
      ti: 'Unity Catalog',
      f: [
        ['title', 'Unity Catalog'],
        ['subtitle', 'the metastore and its children'],
      ],
    }),
    rec({
      k: 'd',
      ty: 'word',
      w: 'lang',
      ti: 'aufwachen',
      f: [
        ['word', 'aufwachen'],
        ['forms', 'wacht auf'],
      ],
      lg: ['de'],
    }),
    rec({
      k: 'e',
      ty: 'section',
      ti: 'Βιολογία',
      f: [
        ['title', 'Βιολογία'],
        ['hook', 'Η μελέτη της ζωής: κύτταρα'],
      ],
    }),
    rec({
      k: 'f',
      ty: 'word',
      w: 'lang',
      ti: 'صَحْن',
      f: [
        ['word', 'صَحْن'],
        ['translit', 'ṣaḥn'],
      ],
      ex: ['ṣaḥn'],
      lg: ['ar'],
    }),
  ];
  test('grouped by kind in the fixed order; exact matches on top; the field that matched', () => {
    const r = search(recs, 'metastore');
    assert.deepEqual(
      r.groups.map(g => g[0]),
      ['chapter', 'section', 'theory'],
    );
    assert.equal(r.total, 3);
    assert.deepEqual(
      r.exact.map(h => h.r.k),
      ['a'],
    );
    const ch = r.groups[0]?.[1][0];
    assert.ok(ch);
    assert.equal(snip(ch).field, 'subtitle');
  });
  test('a word by any of its forms; one letter is no search', () => {
    assert.equal(search(recs, 'wacht auf').groups[0]?.[1][0]?.r.k, 'd');
    assert.equal(search(recs, 'm').total, 0);
    assert.equal(search(recs, '   ').total, 0);
  });
  test('the transliteration rule in the search: Greek in plain and scholarly Latin; Arabic by its transliteration', () => {
    for (const q of ['βιολογια', 'viologia', 'biologia']) assert.equal(search(recs, q).exact[0]?.r.k, 'e', q);
    for (const q of ['ṣaḥn', 'sahn', 'SAHN', 'صحن']) assert.equal(search(recs, q).exact[0]?.r.k, 'f', q);
  });
  test('the snippet: the hit as written, a little around it; a Latin match shows the original script', () => {
    const p = search(recs, 'METASTORE').groups.find(g => g[0] === 'theory')?.[1][0];
    assert.ok(p);
    const s = snip(p);
    assert.equal(s.hit, 'metastore');
    assert.equal(s.pre, 'The **');
    assert.ok(s.post.startsWith('** holds'));
    const g = search(recs, 'kyttara').groups[0]?.[1][0];
    assert.ok(g);
    assert.equal(snip(g).hit, 'κύτταρα');
  });
  test('filters: the side, the kinds, the languages, any other test', () => {
    assert.equal(search(recs, 'metastore', { w: 'lang' }).total, 0);
    assert.equal(search(recs, 'metastore', { types: ['theory'] }).total, 1);
    assert.equal(search(recs, 'sahn', { langs: ['de'] }).total, 0);
    assert.equal(search(recs, 'metastore', { keep: r => r.k !== 'a' }).total, 2);
  });
  test('equal scores in the order of the given collation', () => {
    const two = [rec({ k: 'z', ti: 'Zeta notes' }), rec({ k: 'y', ti: 'Alpha notes' })];
    assert.deepEqual(
      search(two, 'notes').groups[0]?.[1].map(h => h.r.k),
      ['y', 'z'],
    );
    assert.deepEqual(
      search(two, 'notes', {}, (a, b) => b.localeCompare(a)).groups[0]?.[1].map(h => h.r.k),
      ['z', 'y'],
    );
  });
});

describe('the page, saved and recent searches', () => {
  test('the address holds the settings', () => {
    const P = parseParams('#/search?q=dna&t=exercise%2Ccard&x=1');
    assert.deepEqual(P, { q: 'dna', t: 'exercise,card' });
    assert.equal(pageHash(P), '#/search?q=dna&t=exercise%2Ccard');
    assert.equal(pageHash({}), '#/search');
    assert.deepEqual(hereOf({ h: 'subj:phys', it: 'Physics' }), { kind: 'subj', id: 'phys', title: 'Physics' });
    assert.equal(hereOf({ h: 'x:y' }), null);
    assert.deepEqual(hereParams({ kind: 'cur', id: 'c1', title: '' }), { h: 'cur:c1', it: '' });
    assert.ok(sameQuery({ q: 'a', c: 'x', it: 'T' }, { q: 'a' }), 'the collection shown and the place’s title do not make another search');
  });
  test('collections: made, found, renamed, removed; what cannot be one is left out', () => {
    const c = newSavedSearch({ q: 'dna', c: 'old', w: 'know' }, '  My DNA  ', 'q1', '2026-11-08T00:00:00.000Z');
    assert.deepEqual(c, { id: 'q1', name: 'My DNA', p: { q: 'dna', w: 'know' }, at: '2026-11-08T00:00:00.000Z' });
    const list = savedSearches([c, null, { id: '', p: { q: 'x' } }, { id: 'q2', p: {} }]);
    assert.deepEqual(list, [c]);
    assert.equal(savedFor(list, { q: 'dna', w: 'know', c: 'q1' })?.id, 'q1');
    assert.equal(renameSaved(list, 'q1', 'x'.repeat(90))[0]?.name.length, 80);
    assert.deepEqual(removeSaved(list, 'q1'), []);
  });
  test('recent searches: this one first, once, at most 8; one letter is not kept', () => {
    let r = recentSearches([{ q: 'a1' }, 'junk', { q: '' }]);
    assert.deepEqual(r, [{ q: 'a1' }]);
    for (let i = 0; i < 10; i++) r = rememberSearch(r, { q: `q${i}` });
    r = rememberSearch(r, { q: 'q3', c: 'x' });
    assert.equal(r.length, 8);
    assert.deepEqual(r[0], { q: 'q3' });
    assert.equal(r.filter(p => p.q === 'q3').length, 1);
    assert.deepEqual(rememberSearch(r, { q: 'x' }), r);
  });
});

describe('the filters that need the learner', () => {
  const recs = [
    rec({ k: 's1', ty: 'section', ti: 'A', sj: 'phys', x: { sec: 's1' } }),
    rec({ k: 'e1', ty: 'exercise', ti: 'B', sj: 'phys', x: { exid: 'e1' } }),
    rec({ k: 'e2', ty: 'exercise', ti: 'C', sj: 'phys', x: { exid: 'e2' } }),
    rec({ k: 'w1', ty: 'word', ti: 'D', co: 'mini' }),
    rec({ k: 'st', ty: 'station', ti: 'E', cu: 'cur1' }),
  ];
  const src = {
    subject: (id: string) =>
      id === 'phys' ? { read: { s1: true }, res: { e1: { ok: 1, last: true }, e2: { ok: 0, last: false } } } : null,
    roadmapPacks: (id: string) => (id === 'cur1' ? ['phys'] : []),
  };
  const kept = (P: Parameters<typeof keeper>[0]): string[] => {
    const k = keeper(P, src);
    return recs.filter(r => !k || k(r)).map(r => r.k);
  };
  test('none: no test', () => {
    assert.equal(keeper({ q: 'x' }, src), null);
  });
  test('only here: a subject, a course, a Roadmap with its stations’ packs', () => {
    assert.deepEqual(kept({ h: 'subj:phys', in: '1' }), ['s1', 'e1', 'e2']);
    assert.deepEqual(kept({ h: 'course:mini', in: '1' }), ['w1']);
    assert.deepEqual(kept({ h: 'cur:cur1', in: '1' }), ['s1', 'e1', 'e2', 'st']);
    assert.equal(kept({ h: 'subj:phys' }).length, 5, 'here without “only here”: everything');
  });
  test('the status: unread, unsolved, wrong', () => {
    assert.deepEqual(kept({ st: 'unread' }), []);
    assert.deepEqual(kept({ st: 'unsolved' }), ['e2']);
    assert.deepEqual(kept({ st: 'wrong' }), ['e2']);
  });
});

describe('a practice round', () => {
  test('per subject its exercises then its cards (≤ 60); per course the fields of its words and its lessons (≤ 8)', () => {
    const by: Record<string, SearchRecord> = {
      's:phys': rec({ k: 's:phys', ti: 'Physics' }),
      'l:mini:c:verb.wakeup': rec({ k: 'l:mini:c:verb.wakeup', ti: 'wake', x: { field: 'daily' } }),
      'l:mini:f:daily': rec({ k: 'l:mini:f:daily', ti: 'Daily life' }),
    };
    const ex = Array.from({ length: 70 }, (_, i) => ({
      r: rec({ k: `x${i}`, ty: 'exercise', ti: 'E', sj: 'phys', x: { exid: `e${i}` } }),
    }));
    const groups: [string, { r: SearchRecord }[]][] = [
      ['exercise', ex],
      ['card', [{ r: rec({ k: 'c', ty: 'card', ti: 'C', sj: 'phys', x: { card: 'ch01#0' } }) }]],
      ['word', [{ r: rec({ k: 'w', ty: 'word', w: 'lang', ti: 'aufwachen', co: 'mini', x: { senses: ['verb.wakeup'] } }) }]],
      [
        'lesson',
        [{ r: rec({ k: 'l', ty: 'lesson', w: 'lang', ti: 'Yesterday', co: 'mini', h: '#/lang/mini/n/cr.01', x: { node: 'cr.01' } }) }],
      ],
    ];
    const steps = roundSteps(groups, k => by[k]);
    assert.deepEqual(
      steps.map(s => s.kind),
      ['ex', 'cards', 'lang', 'lang'],
    );
    const [e, c, f, l] = steps;
    assert.ok(e?.kind === 'ex' && e.n === 60 && e.ids.length === 60 && e.subject === 'Physics');
    assert.ok(c?.kind === 'cards' && c.keys[0] === 'ch01#0');
    assert.ok(f?.kind === 'lang' && f.fieldTitle === 'Daily life' && f.href === '#/lang/mini/recall/daily');
    assert.ok(l?.kind === 'lang' && l.lesson === 'Yesterday' && l.href === '#/lang/mini/n/cr.01');
  });
});
