/* The catalogue of the search (engine/catalog.js, docs/SEARCH.md), in Node — no browser:
     A. fold(): accents, case, ß, final sigma, Hebrew points, Arabic vowel marks, pinyin tones do not matter
     B. stable ids: a block keeps its id when the pack is rebuilt; two identical blocks differ; traps by their title
     C. records of a pack, a Roadmap, a language course and conversations: kinds, fields, addresses, paths
     D. search: grouped by kind in a fixed order, the field that matched, exact matches on top, snippets, filters
   Usage: node tests/search_catalog.js */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'engine', 'catalog.js'));
const C = window.NoemaCatalog;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };

console.log('A. fold');
ok(C.fold('Μεταστόρ ΣΟΦΟΣ') === 'μεταστορ σοφοσ', 'Greek: no accents, lower case, final sigma = σ');
ok(C.fold('Straße Ärger') === 'strasse arger', 'German: ß = ss, umlauts as plain vowels');
ok(C.fold('שָׁלוֹם') === 'שלום', 'Hebrew: the vowel points do not matter');
ok(C.fold('أَنَا') === 'انا' && C.fold('ʾana') === 'ana', 'Arabic: the vowel marks and hamza do not matter; ʾ in transliterations neither');
ok(C.toneNumbers('nǐ hǎo') === 'ni3 hao3' && C.fold('wǒ') === 'wo', 'pinyin: with tone marks, without, or with tone numbers');
const fm = C.foldMap('Ärger über Straße');
ok(fm.t === 'arger uber strasse' && fm.map[fm.t.indexOf('strasse') + 5] === 'Ärger über Straße'.indexOf('ß'), 'foldMap: every folded letter knows where it came from (to cut snippets)');
ok(C.plain('Kinetic **energy** is $E_k = \\tfrac{1}{2} m v^2$, see [docs](http://x)') === 'Kinetic energy is E_k = 1/2 m v^2, see docs', 'plain(): no markdown, links or math markup');

ok(C.fold('ǧamal ḵubz ṯalāṯa ġayn') === 'jamal khubz thalatha ghayn', 'scholarly letters read as the plain ones typed (š sh, ǧ j, ḵ kh, ṯ th, ġ gh)');
console.log('B. stable ids');
const blocks = [{ t: 'p', text: 'One' }, { t: 'p', text: 'Two' }, { t: 'p', text: 'One' }];
const ids = C.blockIds(blocks);
ok(new Set(ids).size === 3 && ids[2] === ids[0] + '-2', 'two identical blocks get different ids: ' + ids.join(', '));
ok(C.blockIds([{ t: 'p', text: 'Zero' }, ...blocks])[1] === ids[0], 'a block keeps its id when another one is added before it');
ok(C.blockIds([{ t: 'p', text: 'One', _new: true }])[0] === ids[0], 'what the engine adds at run time (_keys) does not change the id');
ok(C.trapId({ title: 'Squared velocity', text: 'x' }) === C.trapId({ title: 'Squared velocity', text: 'x' }) && C.trapId({ title: 'A' }) !== C.trapId({ title: 'B' }), 'traps: an id from their title and text');

console.log('C. records');
const pack = { subject: { id: 'phys', title: 'Physics', description: 'Energy and motion' }, media: { fig: { alt: 'A metastore drawing' } }, sources: { sources: [{ id: 's1', title: 'Metastore handbook' }] },
  chapters: [{ id: 'ch01', num: 1, title: 'Unity Catalog', subtitle: 'the metastore and its children', objectives: ['Explain the metastore'], mantra: 'm',
    sections: [{ id: 'ch01-s01', title: 'Metastore', hook: 'top of the tree', blocks: [{ t: 'p', text: 'The **metastore** holds catalogs.' }, { t: 'table', head: ['Level', 'What'], rows: [['metastore', 'top']] }, { t: 'terms', items: [{ term: 'Metastore', def: 'the top container' }] }, { t: 'figure', media: 'fig', caption: 'Figure' }] }],
    exercises: [{ id: 'ch01-e001', type: 'mcq', section: 'ch01-s01', q: 'What does a metastore hold?', options: ['catalogs', 'tables'], answer: 0, explain: 'secret explanation' }],
    flashcards: [{ q: 'Metastore?', a: 'top container' }], pitfalls: [{ title: 'One metastore per region', text: 'x', fix: 'y' }], debug: [{ id: 'pb1', title: 'Metastore missing', symptom: 'no catalogs' }] }] };
const pr = C.fromPack(pack, { id: 'phys', title: 'Physics' });
const kinds = {}; pr.forEach(r => kinds[r.ty] = (kinds[r.ty] || 0) + 1);
ok(JSON.stringify(kinds) === JSON.stringify({ subject: 1, chapter: 1, section: 1, theory: 4, exercise: 1, card: 1, trap: 1, drill: 1, source: 1 }), 'a pack: subject, chapter, section, 4 theory blocks, exercise, card, trap, drill, source: ' + JSON.stringify(kinds));
const tb = pr.find(r => r.ty === 'theory' && r.x.bt === 'table');
ok(tb.h === `#/s/ch01-s01/${C.blockIds(pack.chapters[0].sections[0].blocks)[1]}` && tb.pa.join(' › ') === 'Physics › 1. Unity Catalog › Metastore', 'a table: its own address (#/s/<section>/<block>) and its place');
const ex = pr.find(r => r.ty === 'exercise');
ok(ex.h === '#/ex/ch01-e001' && !JSON.stringify(ex.f).includes('secret') && ex.x.n === 1, 'an exercise: its question and choices, never its answer or explanation; its number in the chapter');
ok(C.fromPack({ chapters: [{ id: 'c', flashcards: [{ id: 'c-f001', q: 'Q?', a: 'A' }] }] }, { id: 'x' }).find(r => r.ty === 'card').x.card === 'c-f001', 'a card with an id is keyed by it, as the decks key it');
ok(pr.find(r => r.ty === 'card').h === '#/cards/ch01%230' && pr.find(r => r.ty === 'trap').h.startsWith('#/ch/ch01/traps/p'), 'a card and a trap: their own addresses');
const cur = C.fromCurriculum({ id: 'cx', title: 'Learn Databricks', goal: 'Learn Databricks', description: 'from zero', nodes: { uc: { title: 'Unity Catalog', summary: 'governance', learningGoals: ['Set up a metastore'], chapters: [{ title: 'Metastores', goals: ['why one per region'] }], pack: { id: 'phys', status: 'ready' } } } });
ok(cur.length === 2 && cur[1].ty === 'station' && cur[1].h === '#/map/cx/uc' && cur[1].f.map(f => f[0]).join() === 'title,summary,goals,chapters' && cur[1].x.pack === 'phys', 'a Roadmap and its station: title, summary, learning goals, planned chapters; the address of the station');
const lang = { course: { id: 'mini', title: 'Mini' }, fields: [{ field: 'daily', title: 'Daily life', concepts: [{ id: 'verb.wakeup', gloss: 'to wake up' }] }],
  nodes: [{ id: 'cr.01', kind: 'lesson', title: 'Yesterday', concepts: ['verb.wakeup'] }], functions: [{ id: 'fn.past', title: 'The past' }],
  langs: { de: { language: { name: 'German' }, lexicon: { 'cr.01': { lexemes: [{ id: 'de:aufwachen', lemma: 'aufwachen', senses: ['verb.wakeup'], forms: { a: 'wacht auf', b: 'aufgewacht' } }] } }, grammar: { 'fn.past': { summary: 'Perfekt with haben or sein' } }, bank: [{ id: 's1', text: 'Ich bin aufgewacht.', gloss: 'I woke up.', functions: ['fn.past'], tokens: [{ l: 'de:ich' }] }] },
    zh: { language: { name: 'Chinese' }, lexicon: { 'cr.01': { lexemes: [{ id: 'zh:xing', lemma: '醒', pinyin: 'xǐng', senses: ['verb.wakeup'] }] } }, grammar: {}, bank: [] } }, world: { phenomena: { de: [{ id: 'de.sep', title: 'Separable verbs', what: 'auf … wachen' }] } } };
const lr = C.fromLangCourse(lang, { courseId: 'mini', title: 'Mini' });
const lk = {}; lr.forEach(r => lk[r.ty] = (lk[r.ty] || 0) + 1);
ok(JSON.stringify(lk) === JSON.stringify({ word: 2, sentence: 1, phenomenon: 1, meaning: 1, grammar: 1, lesson: 1, field: 1 }), 'a language course: words, sentences, peculiarities, meanings, grammar, lessons, fields: ' + JSON.stringify(lk));
ok(lr.every(r => r.w === 'lang' && r.co === 'mini') && lr.find(r => r.ty === 'word').h === '#/lang/mini/w/de/de%3Aaufwachen', 'every language record says it is on the Languages side; a word opens its card');
const cv = C.fromConvos([{ id: 'cv_1', title: 'Why one metastore', mode: 'explain', subject: { id: 'phys', title: 'Physics' }, context: { type: 'exercise', id: 'ch01-e001', origin: { via: 'explainDifferently', ex: 'ch01-e001' } }, messages: [{ role: 'user', content: 'explain the metastore' }, { role: 'assistant', content: 'It is <noema-state>{}</noema-state> the top.' }] }, { id: 'cv_2', deleted: true, messages: [{ content: 'x' }] }]);
ok(cv.length === 1 && cv[0].x.mode === 'explain' && cv[0].x.origin.via === 'explainDifferently' && !cv[0].f[1][1].includes('noema-state'), 'a conversation: its style and where it began are kept; deleted ones and the tutor’s hidden notes are left out');

const lv = C.fromConvos([{ id: 'cv_3', mode: 'lang-chat', subject: { id: 'lang:mini', title: 'Mini' }, context: { type: 'function', id: 'de:fn.past', label: 'The past' }, messages: [{ role: 'user', content: 'Wann sein, wann haben?' }] }]);
ok(lv[0].w === 'lang' && lv[0].co === 'mini' && !lv[0].sj && lv[0].lg.join() === 'de', 'a conversation with the language tutor is on the Languages side, in its course and language');

console.log('D. search');
const all = [...pr, ...cur, ...lr, ...cv];
const r1 = C.search(all, 'metastore');
const order = r1.groups.map(g => g[0]);
ok(order.join() === ['roadmap', 'station', 'chapter', 'section', 'theory', 'exercise', 'card', 'trap', 'drill', 'source', 'convo'].filter(t => order.includes(t)).join() && order.includes('station') && order.includes('convo'), 'grouped by kind, in one fixed order: ' + order.join(', '));
const chap = r1.groups.find(g => g[0] === 'chapter')[1][0];
ok(C.snip(chap, 'metastore').field === 'subtitle', 'a chapter found by its subtitle says so (Chapter · Subtitle)');
const sn = C.snip(r1.groups.find(g => g[0] === 'theory')[1].find(x => x.r.x.bt === 'paragraph'), 'METASTORE');
ok(sn.hit === 'metastore' && sn.pre === 'The ' && sn.post.startsWith(' holds'), 'the snippet: a little before and after, the word as written: ' + JSON.stringify(sn));
ok(r1.exact.some(x => x.r.ty === 'section') && r1.exact.some(x => x.r.ty === 'theory' && x.r.x.bt === 'terms'), 'exact matches on top: the section titled “Metastore” and the term “Metastore”');
const r2 = C.search(all, 'wacht auf');
ok(r2.groups[0]?.[0] === 'word' && r2.groups[0][1][0].r.ti === 'aufwachen', 'a word is found by any of its forms (“wacht auf” → aufwachen)');
ok(C.search(all, 'xing3').exact[0]?.r.ti.startsWith('醒') && C.search(all, 'xing').total >= 1, 'Chinese: pinyin with or without tone numbers finds 醒');
const ar = C.fromLangCourse({ course: { id: 'ar', title: 'Ar' }, fields: [{ field: 'f', title: 'Home', concepts: [{ id: 'n.dish', gloss: 'dish' }] }], nodes: [{ id: 'n1', kind: 'lesson', title: 'Home', concepts: ['n.dish'] }], functions: [],
  langs: { ar: { language: { name: 'Arabic' }, lexicon: { n1: { lexemes: [{ id: 'ar:sahn', lemma: 'صَحْن', translit: 'ṣaḥn', senses: ['n.dish'] }, { id: 'he:shalom', lemma: 'שָׁלוֹם', translit: 'šālôm', senses: ['n.dish'] }] } }, grammar: {}, bank: [] } } }, { courseId: 'ar', title: 'Ar' });
ok(['صحن', 'صَحْن', 'ṣaḥn', 'sahn', 'SAHN'].every(q => C.search(ar, q).total >= 1) && ['שלום', 'šālôm', 'shalom'].every(q => C.search(ar, q).total >= 1), 'transliteration: a word is found in its own script, scholarly Latin (ṣaḥn, šālôm) or plain Latin (sahn, shalom)');
ok(C.search(all, 'metastore', { w: 'lang' }).total === 0 && C.search(all, 'wake', { w: 'know' }).total === 0, 'filter: one side of the app');
ok(C.search(all, 'aufwachen', { types: ['sentence'] }).total === 0 && C.search(all, 'aufgewacht', { types: ['sentence'] }).total === 1, 'filter: kinds');
ok(C.search(all, 'wake', { langs: ['zh'] }).groups.every(([, l]) => l.every(x => x.r.lg.includes('zh'))), 'filter: languages');
ok(C.search(all, 'm').total === 0 && C.search(all, '  ').total === 0, 'one letter is not a search');
const big = []; for (let i = 0; i < 40000; i++) big.push({ ty: 'theory', w: 'know', k: 'k' + i, ti: 't', f: [['paragraph', 'lorem ipsum dolor sit amet consectetur ' + i]], h: '#' });
C.search(big, 'warm'); const t0 = Date.now(); C.search(big, 'consectetur 3999'); const ms = Date.now() - t0;
ok(ms < 400, `40 000 records searched in ${ms} ms`);

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
