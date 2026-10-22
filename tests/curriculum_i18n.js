/* 🌐 A Roadmap in several languages (docs/CURRICULUM.md §10) in Node: which locale is shown, the drawn copies of a step,
   the checks of a translation, merging, the inbox entry, edits and new plans dropping what no longer fits, two copies. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
function boot(ui) {
  const store = {};
  const w = { console, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
    Intl, Promise, Date, Array, Object, JSON, Math, String, Number, Map, Set, setTimeout, clearTimeout };
  w.window = w; w.addEventListener = () => { };
  if (ui) w.NoemaI18n = { locale: ui, chain: t => [...new Set([t, t.split('-')[0], 'en'])], t: k => k, err: e => String(e?.message || e) };
  vm.createContext(w);
  for (const f of ['engine/curriculum.js', 'engine/curjobs.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), w, { filename: f });
  return w;
}
const rec = () => ({ id: 'cabc123', format: 'noema.curriculum/v1', title: 'Transcription', goal: 'Transcription', language: 'en', edges: [{ from: 'a', to: 'b' }],
  nodes: { a: { title: 'NTP architecture', summary: 'Bases and phosphates', learningGoals: ['Draw an NTP', 'Explain polarity'], chapters: [{ ref: 'c1', title: 'Bases' }, { ref: 'c2', title: 'Phosphates' }] },
    b: { title: 'Phosphoryl transfer', learningGoals: [], chapters: [] } } });
const EL = { title: 'Μεταγραφή', goal: 'Μεταγραφή', nodes: { a: { title: 'Αρχιτεκτονική NTP', summary: 'Βάσεις και φωσφορικά', learningGoals: ['Σχεδίασε ένα NTP', 'Εξήγησε την πολικότητα'], chapters: { c1: 'Βάσεις', c2: 'Φωσφορικά' } } } };

console.log('which locale');
let w = boot('el'), C = w.NoemaCurriculum, c = rec();
ok(C.trLocale(c) === null, 'no i18n → the own words');
ok(C.checkI18n(c, 'el', EL).length === 0, 'a whole Greek translation passes the check');
C.setI18n(c, 'el', EL);
ok(C.trLocale(c) === 'el' && C.shownTitle(c) === 'Μεταγραφή', 'Greek UI → the Greek title');
let n = C.shownNode(c, 'a');
ok(n.title === 'Αρχιτεκτονική NTP' && n.summary === 'Βάσεις και φωσφορικά' && n.learningGoals[1] === 'Εξήγησε την πολικότητα' && n.chapters[1].title === 'Φωσφορικά' && n.chapters[1].ref === 'c2', 'the step: title, summary, goals, chapters');
ok(c.nodes.a.title === 'NTP architecture' && c.nodes.a.chapters[0].title === 'Bases', 'the record keeps its own words');
ok(C.shownNode(c, 'b').title === 'Phosphoryl transfer', 'an untranslated step: its own words');
ok(boot('ru').NoemaCurriculum.shownTitle(c) === 'Transcription', 'Russian UI without ru → the own words');
ok(boot('en').NoemaCurriculum.trLocale(c) === null, 'English UI on an English Roadmap → the own words');
ok(boot(null).NoemaCurriculum.shownTitle(c) === 'Transcription', 'no i18n runtime (the connector) → the own words');
const g = rec(); g.language = 'el'; g.i18n = { en: { title: 'Transcription EN' }, el: { title: 'x' } };
ok(boot('el').NoemaCurriculum.trLocale(g) === null, 'the own language comes first');
ok(boot('fr').NoemaCurriculum.trLocale(g) === null, 'never English for someone else');

console.log('checks');
const errs = C.checkI18n(c, 'el', { nodes: { zz: { title: 'x' }, a: { learningGoals: ['one'], chapters: { c9: 'x' }, foo: 1 } } });
ok(errs.some(e => /nodes\.zz: no such step/.test(e)) && errs.some(e => /learningGoals: 2 strings/.test(e)) && errs.some(e => /chapters\.c9: no such chapter/.test(e)) && errs.some(e => /foo: unknown field/.test(e)), 'unknown step, wrong goal count, unknown chapter, unknown field');
ok(C.checkI18n(c, 'en', { title: 'x' }).some(e => /own language/.test(e)), "the Roadmap's own language is refused");
ok(C.checkI18n(c, 'xx_1', {}).length === 1, 'a bad locale code');

console.log('merging, edits, new plans');
C.setI18n(c, 'el', { nodes: { b: { title: 'Μεταφορά φωσφορυλίου' } } });
ok(C.shownNode(c, 'b').title === 'Μεταφορά φωσφορυλίου' && C.shownNode(c, 'a').title === 'Αρχιτεκτονική NTP', 'a partial translation is merged');
let todo = C.i18nTodo(c, 'el'); ok(!todo.title && !todo.nodes.length && !todo.goals.length && !todo.chapters.length, 'nothing left in el');
todo = C.i18nTodo(c, 'ru'); ok(todo.title && todo.nodes.length === 2 && todo.goals.join() === 'a' && todo.chapters.join() === 'a', 'everything left in ru');
C.applyPlans(c, { plans: [{ nodeId: 'a', learningGoals: ['New goal'], chapters: [{ ref: 'c1', title: 'New', teachingGoals: ['g'], requiredCoverage: ['r'] }] }] });
n = C.shownNode(c, 'a');
ok(n.title === 'Αρχιτεκτονική NTP' && n.learningGoals[0] === 'New goal' && n.chapters[0].title === 'New', 'a new plan drops the step\'s translated goals and chapters, keeps its title');
c.nodes.a.learningGoals = ['g1', 'g2', 'g3'];
ok(C.shownNode(c, 'a').learningGoals.length === 3, 'goals of another length show the own words');

console.log('two copies');
const old = JSON.parse(JSON.stringify(rec())), newer = JSON.parse(JSON.stringify(c));
ok(C.mergePlans(old, newer) && old.i18n?.el?.nodes?.b?.title === 'Μεταφορά φωσφορυλίου', 'an older copy takes the later translation');
ok(!C.mergePlans(newer, rec()) && newer.i18n.el, 'a copy without one never drops it');

console.log('the inbox (Claude through the connector)');
const J = w.NoemaCurJobs, c2 = rec();
const m = J.merged(c2, [{ key: 'a:curin:cabc123:1', value: JSON.stringify({ v: 1, kind: 'i18n', locale: 'el', data: EL }) }, { key: 'a:curin:cabc123:2', value: JSON.stringify({ v: 1, kind: 'i18n', locale: 'el', data: { nodes: { zz: { title: 'x' } } } }) }]);
ok(m.i18n?.el?.title === 'Μεταγραφή' && !c2.i18n, "the connector's view has the translation; a wrong entry is skipped");

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
