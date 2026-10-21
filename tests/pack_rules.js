// The pack rules (tools/pack_rules.json): one file for Python (validate.py + pack_quality.py / make_pack.py / build.py) and JS
// (engine/packcheck.js RULES + QUALITY: app, Gemini generator, connector). 'rules': every exercise type, difficulty and focus tag
// >= 3 per chapter (authoring.minPerKind). 'quality': the full rules of packs with authoring.rules >= 2 — both checkers must give
// exactly the same issues on the same chapters (docs/PIPELINES.md §4).
//   node tests/pack_rules.js
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'engine', 'packcheck.js'));
const P = globalThis.NoemaPackCheck;
let n = 0; const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } n++; console.log('✓ ' + m); };

const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'pack_rules.json'), 'utf8'));
ok(JSON.stringify(file.rules) === JSON.stringify(P.RULES), 'engine/packcheck.js RULES is exactly tools/pack_rules.json "rules"');
ok(P.RULES.every(r => /^[a-z]+\.[a-z]+$/.test(r.id) && r.min >= 1 && ['type', 'difficulty', 'tags'].includes(r.field)), 'every rule has an id, a field and a minimum');
const pics = P.RULES.find(r => r.id === 'balance.type').features.pictures;
ok(pics.length === 7 && pics.every(t => P.TYPES.has(t)), 'the 7 picture types are required only when the chapter has a picture');

// a chapter that meets every rule: 3 of each text type, each difficulty and each tag
const TEXT = ['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'scenario', 'free'], TAGS = ['concept', 'pitfall', 'debug', 'exam', 'interview', 'compare'];
const mk = (types, extraTags = []) => types.flatMap((t, i) => [0, 1, 2].map(k => ({ id: `ch01-e${String(i * 3 + k + 1).padStart(3, '0')}`, type: t, section: 'ch01-s01', difficulty: k + 1, tags: [TAGS[(i * 3 + k) % TAGS.length], ...extraTags] })));
const good = { id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'p', text: 'x' }] }], exercises: mk(TEXT) };
ok(P.checkBalance(good, {}).length === 0, 'a balanced chapter has no issues');
const short = { ...good, exercises: good.exercises.filter(e => !(e.type === 'odd' && e.difficulty === 3)) };
const iss = P.checkBalance(short, {});
ok(iss.length === 1 && iss[0].rule === 'balance.type' && iss[0].value === 'odd' && iss[0].have === 2 && iss[0].need === 3 && /^ch01: \[balance\.type\] odd: 2/.test(iss[0].msg), 'a missing exercise is named: rule id, value, have, need');
ok(P.checkBalance(good, { features: { code: true } }).map(i => i.value).sort().join() === 'spotbug,syntax,write', 'features.code makes spotbug, write and the syntax tag required');
ok(P.checkBalance(good, { features: { math: true } }).map(i => i.rule + ':' + i.value).sort().join() === 'balance.tag:calc,balance.type:calc', 'features.math makes calc (type and tag) required');
const oneCalc = { ...good, exercises: [...good.exercises, { id: 'ch01-e900', type: 'calc', section: 'ch01-s01', difficulty: 2, tags: ['concept'] }] };
ok(P.checkBalance(oneCalc, {}).some(i => i.value === 'calc' && i.have === 1), 'an optional type the chapter uses anyway needs 3 too');
const withFig = { ...good, sections: [{ id: 'ch01-s01', blocks: [{ t: 'figure', media: 'm' }] }] };
ok(P.checkBalance(withFig, {}).filter(i => pics.includes(i.value)).length === 7 && P.checkBalance(good, {}).length === 0, 'a chapter with a picture needs every picture type; one without needs none');
ok(P.checkBalance(short, {}, { min: 2 }).length === 0, 'min overrides the rules\' own minimum');

// checkPack: errors when the pack declares authoring.minPerKind (make_pack.py, start_subject.py), warnings when it does not, 0 = off
const pack = a => ({ format: 'noema-pack', subject: { id: 'demo-x', title: 'Demo', ...(a == null ? {} : { authoring: { minPerKind: a } }) }, chapters: [short], media: {} });
ok(P.checkPack(pack(3)).errors.some(e => e.includes('[balance.type] odd')), 'checkPack: a pack with authoring.minPerKind gets errors');
ok(!P.checkPack(pack(null)).errors.some(e => e.includes('[balance')) && P.checkPack(pack(null)).warnings.some(w => w.includes('[balance.type] odd')), 'checkPack: an older pack without it gets warnings');
ok(!P.checkPack(pack(0)).warnings.some(w => w.includes('[balance')), 'checkPack: minPerKind 0 turns the rules off');
ok(P.checkPack(pack(null), null, { balance: 3 }).errors.some(e => e.includes('[balance')), 'checkPack: { balance } forces errors (Gemini generator, curriculum steps in the connector)');

// validate.py reads the same file: --balance → errors, --balance-warn → warnings, --features
const td = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-'));
const ch = { id: 'ch01', num: 1, title: 'T', subtitle: 'S', emoji: '📘', sourcePages: 'x', mantra: 'm', objectives: ['o'], sections: [{ id: 'ch01-s01', title: 'S', blocks: [{ t: 'p', text: 'a' }, { t: 'p', text: 'b' }, { t: 'p', text: 'c' }] }], debug: [], pitfalls: [], flashcards: [],
  exercises: short.exercises.map(e => ({ ...e, q: 'Q?', explain: 'Because.', ...({ mcq: { options: ['a', 'b'], answer: 0 }, odd: { options: ['a', 'b', 'c', 'd'], answer: 0 }, tf: { answer: true }, order: { items: ['a', 'b', 'c'] }, match: { pairs: [['a', '1'], ['b', '2'], ['c', '3']] }, bucket: { buckets: ['x', 'y'], items: [0, 1, 0, 1].map((b, i) => ({ text: 't' + i, bucket: b })) }, cloze: { text: 'a [[b]] c' }, scenario: { steps: [{ prompt: 'p', options: [{ text: 'a', ok: true, fb: 'f' }, { text: 'b', ok: false, fb: 'g' }] }] }, free: { model: 'm', rubric: ['r'] } })[e.type] })) };
fs.writeFileSync(path.join(td, 'ch01.json'), JSON.stringify(ch));
const V = (...a) => { try { return { code: 0, out: execFileSync('python3', [path.join(ROOT, 'tools', 'validate.py'), path.join(td, 'ch01.json'), ...a], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
let r = V('--balance', '3');
ok(r.code === 1 && /ERROR: \[balance\.type\] odd: 2 exercise\(s\), need >= 3/.test(r.out), 'validate.py --balance 3: the same issue, as an error');
r = V('--balance-warn', '3');
ok(r.code === 0 && /WARN: \[balance\.type\] odd: 2/.test(r.out), 'validate.py --balance-warn 3: a warning only (chapters of an older pack being extended)');
r = V('--balance', '3', '--features', 'code');
ok(/\[balance\.type\] spotbug: 0/.test(r.out) && /\[balance\.tag\] syntax: 0/.test(r.out), 'validate.py --features code: spotbug, write, syntax required');
r = V();
ok(r.code === 0 && !/balance/.test(r.out), 'validate.py without --balance: no balance check (library packs made before the rule)');

// ---------- quality (authoring.rules >= 2) ----------
ok(JSON.stringify(file.quality) === JSON.stringify(P.QUALITY), 'engine/packcheck.js QUALITY is exactly tools/pack_rules.json "quality"');
ok(JSON.stringify(file.quality.vocab.types) === JSON.stringify([...P.TYPES].sort()), 'quality.vocab.types are the exercise types the engine knows (packcheck.js TYPES)');
const QV = file.quality.vocab, T9 = ['mcq', 'tf', 'odd', 'order', 'match', 'bucket', 'cloze', 'scenario', 'free'], TG6 = ['concept', 'pitfall', 'debug', 'exam', 'interview', 'compare'];
const M6 = QV.modes.slice(0, 6), why = o => o.map((x, i) => `Option ${i + 1} is ${i ? 'wrong because it mixes up the cause' : 'right because it follows from the rule'}.`);
const EXPL = 'The rule holds because the force falls with the square of the distance. The tempting answer forgets the square and halves it.';
const SHAPE = { tf: { answer: true }, order: { items: ['a', 'b', 'c'] }, match: { pairs: [['a', '1'], ['b', '2'], ['c', '3']] }, bucket: { buckets: ['x', 'y'], items: [0, 1, 0, 1].map((b, i) => ({ text: 't' + i, bucket: b })) },
  cloze: { text: 'The force falls with the [[square]] of the distance.' }, scenario: { steps: [{ prompt: 'p', options: [{ text: 'a', ok: true, fb: 'f' }, { text: 'b', ok: false, fb: 'g' }] }] }, free: { model: 'm', rubric: ['r'] } };
function goodQ() {
  const ex = Array.from({ length: 40 }, (_, i) => {
    const t = T9[i % 9], id = `ch01-e${String(i + 1).padStart(3, '0')}`;
    return { id, type: t, section: 'ch01-s01', difficulty: i < 8 ? 1 : i < 18 ? 2 : 3, tags: [TG6[i % 6]], q: `Question number ${i + 1} about the distance and the force?`,
      ...(t === 'mcq' || t === 'odd' ? { options: ['a short one', 'another one', 'a third one', 'a fourth one'], answer: 0, why: why([1, 2, 3, 4]) } : SHAPE[t]),
      lr: `ch01-l${String(Math.floor(i / 2) + 1).padStart(2, '0')}`, think: i < 10 ? 'recall' : i < 20 ? 'explain' : i < 30 ? 'apply' : 'analyze',
      ...(i < 12 ? { mode: M6[i % 6] } : {}), cite: { src: 'book', loc: 'ch 1', ...(i === 0 ? { sq: 'ch01-q01' } : {}) }, explain: EXPL };
  });
  const points = Array.from({ length: 22 }, (_, i) => ({ id: `ch01-k${String(i + 1).padStart(2, '0')}`, text: `Point ${i + 1}`, level: QV.levels[i % 3], cite: { src: 'book' },
    ...(i === 1 ? { cats: ['confusable'], with: ['ch01-k03'] } : {}), ...(i >= 20 ? { taughtIn: 'cur-step-0' } : {}) }));
  const learnables = Array.from({ length: 20 }, (_, i) => ({ id: `ch01-l${String(i + 1).padStart(2, '0')}`, kp: [points[i].id], goal: 'g' }));
  return { id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'p', text: 'The force between two charges falls with distance.' }] }], flashcards: [{ id: 'ch01-f001', q: 'Q', a: 'A' }], exercises: ex,
    map: { format: 'noema.map/v1', chapter: 'ch01', points, learnables, fits: { types: T9, focus: TG6, modes: M6 }, unfit: Object.fromEntries(QV.modes.slice(6).map(m => [m, 'nothing in this chapter to argue about'])),
      sourceQuestions: [{ id: 'ch01-q01', text: 'Full text of the source question.', answer: 'Its checked answer.', cite: { src: 'book', loc: 'Q1' } }] },
    review: { format: 'noema.review/v1', chapter: 'ch01', rubric: learnables.slice(0, 15).map(l => ({ lr: l.id, ok: true })), blind: { solved: 40, mismatches: [{ id: 'ch01-e003', fixed: true }] } } };
}
const qd = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-'));
const PY = ch => { const f = path.join(qd, 'c.json'); fs.writeFileSync(f, JSON.stringify(ch));
  return JSON.parse(execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); from pack_quality import check_quality
print(json.dumps([[l, r, m] for l, r, m in check_quality(json.load(open(sys.argv[1], encoding="utf-8")), set())]))`, f], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: path.join(ROOT, 'tools') } })); };
const same = (name, ch) => { const js = P.checkQuality(ch, {}).map(i => [i.level, i.rule, i.msg]), py = PY(ch);
  ok(JSON.stringify(js) === JSON.stringify(py), `${name}: Python and JS give the same issues (${js.length})${JSON.stringify(js) === JSON.stringify(py) ? '' : '\n   JS ' + JSON.stringify(js) + '\n   PY ' + JSON.stringify(py)}`); return js; };
const g = goodQ();
ok(same('a chapter that meets every quality rule', g).length === 0, 'a chapter that meets every quality rule has no issues');
const mut = f => { const c = JSON.parse(JSON.stringify(g)); f(c); return c; };
const rules = (name, f) => same(name, mut(f)).map(i => i[1]);
let rs = rules('no map', c => { delete c.map; });
ok(rs.includes('map.present') && rs.includes('lr.link') && rs.includes('fit.declared'), 'no map: map.present, and every exercise lacks its learnable');
ok(rules('a point in no learnable', c => { c.map.points.push({ id: 'ch01-k99', text: 'lost', level: 'core' }); }).join() === 'map.exhaustive', 'map.exhaustive: a knowledge point in no learnable and without taughtIn');
ok(rules('a type neither fitting nor excused', c => { c.map.unfit = {}; }).every(r => r === 'fit.declared'), 'fit.declared: a paradigm that is neither in fits nor has a reason');
ok(rules('debate-like value excused', c => { c.map.fits.modes = M6.slice(0, 5); c.map.unfit[M6[5]] = 'no room for it'; c.exercises.filter(e => e.mode === M6[5]).forEach(e => delete e.mode); }).length === 0, 'a paradigm with a reason in unfit needs no exercises');
ok(rules('a fitting type with 2 exercises', c => { c.map.fits.types = [...T9, 'spotbug']; c.exercises[0].type = 'spotbug'; c.exercises[9].type = 'spotbug'; }).includes('fit.types'), 'fit.types: every type in fits.types >= 3');
ok(rules('one paradigm used once', c => { delete c.exercises[6].mode; }).join() === 'mode.coverage', 'mode.coverage: every paradigm in fits.modes >= 2');
ok(rules('too many easy', c => { c.exercises.slice(8, 14).forEach(e => e.difficulty = 1); }).includes('mix.difficulty'), 'mix.difficulty: 20/25/55 ± 5');
ok(rules('too much recall', c => { c.exercises.slice(10, 14).forEach(e => e.think = 'recall'); }).join() === 'mix.think', 'mix.think: recall <= 25 %');
ok(rules('too little application', c => { c.exercises.slice(20, 25).forEach(e => e.think = 'explain'); }).join() === 'mix.think', 'mix.think: apply or higher >= 40 %');
ok(rules('a learnable with one version', c => { c.exercises[1].lr = 'ch01-l03'; }).includes('lr.facades'), 'lr.facades: every learnable >= 2 versions in >= 2 types');
ok(rules('a pointer to the source', c => { c.exercises[4].q = 'In Q14 of Round 1, what happens?'; }).join() === 'self.contained', 'self.contained: “Q14” in a question');
ok(rules('a pointer in the theory (Greek)', c => { c.sections[0].blocks[0].text = 'Όπως λέει η πηγή στη σελίδα 3, η δύναμη πέφτει.'; }).join() === 'self.contained', 'self.contained: Greek “η πηγή” / “σελίδα 3” in the theory');
ok(rules('a short explanation', c => { c.exercises[2].explain = 'Because.'; }).join() === 'explain.depth', 'explain.depth: >= 2 sentences, >= 80 characters');
ok(rules('an option without why', c => { c.exercises[0].why = c.exercises[0].why.slice(1); }).join() === 'mcq.why', 'mcq.why: every option has its why');
ok(rules('the answer in the question', c => { c.exercises[0].q = 'Is a short one the right answer?'; }).join() === 'trivial.answer', 'trivial.answer: the right option written in the question');
ok(same('the longest option', mut(c => { c.exercises[0].options[0] = 'a very much longer right option that gives it away'; })).every(i => i[1] === 'trivial.longest' && i[0] === 'warn'), 'trivial.longest is a warning only');
ok(rules('no cite', c => { delete c.exercises[5].cite; }).join() === 'cite.present', 'cite.present: every exercise keeps its provenance in cite');
ok(rules('a source question nobody cites', c => { delete c.exercises[0].cite.sq; }).join() === 'source.questions', 'source.questions: every question of the sources has an exercise');
ok(rules('a categorised point with one type', c => { c.exercises[3].type = c.exercises[2].type; c.exercises[3].type === c.exercises[2].type; }).some(r => r === 'cats.facades'), 'cats.facades: a confusable point needs >= 2 exercises in >= 2 types');
ok(rules('no review', c => { delete c.review; }).join() === 'review.done', 'review.done: the second-pass review is required');
ok(rules('an open mismatch', c => { c.review.blind.mismatches[0].fixed = false; }).join() === 'review.done', 'review.done: every blind-solve mismatch fixed');
ok(rules('hard exercises first', c => { c.exercises.reverse(); }).join() === 'mix.order', 'mix.order: easier first inside a section (a warning)');
// strictness in checkPack
const qpack = (auth, extra = {}) => ({ format: 'noema-pack', subject: { id: 'demo-q', title: 'Q', authoring: auth }, chapters: [mut(c => { delete c.review; })], media: {}, ...extra });
ok(P.checkPack(qpack({ rules: 2, by: 'claude' })).errors.some(e => e.includes('[review.done]')), 'checkPack: authoring.rules 2 + by claude → errors');
ok(!P.checkPack(qpack({ rules: 2, by: 'learner' })).errors.some(e => e.includes('[review.done]')) && P.checkPack(qpack({ rules: 2, by: 'learner' })).warnings.some(w => w.includes('[review.done]')), 'checkPack: by learner → warnings');
ok(!P.checkPack(qpack({})).errors.concat(P.checkPack(qpack({})).warnings).some(e => e.includes('[review.done]')), 'checkPack: an older pack without authoring.rules is not checked');
ok(P.checkPack(qpack({}), null, { requireQuality: true }).errors.some(e => e.includes('authoring.rules must be 2')), 'connector: a new pack without authoring.rules is refused');
ok(!P.checkPack(qpack({}, { builtAt: '2026-10-08T10:00:00+00:00' }), null, { requireQuality: true }).errors.some(e => e.includes('authoring.rules')), 'connector: a pack built before the rules keeps working (TD-11)');
// validate.py --quality: the same issues through the skill's validator
const qc = { ...mut(c => { c.exercises[4].q = 'See Q14: what happens?'; c.sections[0].title = 'S'; c.sections[0].blocks.push({ t: 'p', text: 'b' }, { t: 'p', text: 'c' }); }), num: 1, title: 'T', subtitle: 'S', emoji: '📘', sourcePages: 'x', mantra: 'm', objectives: ['o'], debug: [], pitfalls: [] };
fs.writeFileSync(path.join(qd, 'ch01.json'), JSON.stringify(qc));
const VQ = (...a) => { try { return { code: 0, out: execFileSync('python3', [path.join(ROOT, 'tools', 'validate.py'), path.join(qd, 'ch01.json'), ...a], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) }; } };
r = VQ('--quality', 'error');
ok(r.code === 1 && /ERROR: \[self\.contained\] ch01-e005: “Q14”/.test(r.out), 'validate.py --quality error: the same issue, as an error');
r = VQ('--quality', 'warn');
ok(r.code === 0 && /WARN: \[self\.contained\]/.test(r.out), 'validate.py --quality warn: a warning only');
fs.rmSync(qd, { recursive: true, force: true });
// the languages every new pack gets (pack_rules.json "languages", docs/PIPELINES.md §4b) and the translation files
ok(JSON.stringify(file.languages) === JSON.stringify(P.LANGS), 'engine/packcheck.js LANGS is exactly tools/pack_rules.json "languages"');
const RL = P.requiredLocales;
ok(JSON.stringify(RL('en')) === JSON.stringify({ translations: ['el', 'ru'], bridges: ['el', 'ru', 'ar'] }) && JSON.stringify(RL('el-GR').translations) === '["en","ru"]' && JSON.stringify(RL('ar').translations) === '["en","el","ru"]' && RL('de').bridges.length === 4,
  'requiredLocales: en, el, ru translations and en, el, ru, ar bridges, minus the pack\'s own language');
{
  const src = { id: 'ch01', sections: [{ id: 'ch01-s01', blocks: [{ t: 'p', text: 'Hello' }, { t: 'code', lang: 'python', code: 'print(1)' }] }], exercises: [{ id: 'ch01-e001', type: 'mcq', section: 'ch01-s01', options: ['a', 'b'], answer: 0 }], flashcards: [], debug: [] };
  const pk = { subject: { id: 'tiny', language: 'en' }, version: 'v1', chapters: [src, { id: 'ch02', sections: [], exercises: [] }] };
  const tf = ch => ({ format: 'noema-translation', v: 1, pack: 'tiny', locale: 'el', version: 'v1', chapters: [ch] });
  const good = JSON.parse(JSON.stringify(src)); good.sections[0].blocks[0].text = 'Γεια'; good.exercises[0].options = ['α', 'β'];
  let t = P.checkTranslation(tf(good), pk);
  ok(!t.errors.length && t.warnings.some(w => /not translated yet: ch02/.test(w)), 'checkTranslation: a good translation passes; a chapter not translated yet is a warning');
  const badA = JSON.parse(JSON.stringify(good)); badA.exercises[0].answer = 1;
  const badC = JSON.parse(JSON.stringify(good)); badC.sections[0].blocks[1].code = 'εκτύπωσε(1)';
  ok(P.checkTranslation(tf(badA), pk).errors.some(e => /answer differs/.test(e)) && P.checkTranslation(tf(badC), pk).errors.some(e => /code blocks must stay/.test(e)), 'checkTranslation: a changed answer or code is refused');
  ok(P.checkTranslation({ ...tf(good), locale: 'en' }, pk).errors.some(e => /pack's own language/.test(e)) && P.checkTranslation({ ...tf(good), pack: 'other' }, pk).errors.some(e => /another subject/.test(e)), 'checkTranslation: its own language or another pack is refused');
  ok(P.checkTranslation({ ...tf(good), version: 'v0' }, pk).warnings.some(w => /made for pack version v0/.test(w)), 'checkTranslation: made for another version → a warning');
  const stub = { format: 'noema-pack', subject: { id: 'tiny', title: 'T', language: 'en', i18n: { el: { title: 'Τ' } } }, chapters: [], translations: { el: { file: true, chapters: 1 } } };
  ok(!P.checkPack(stub).errors.some(e => /translations/.test(e)) && P.checkPack({ ...stub, translations: { el: { file: 'yes' } } }).errors.some(e => /translations\.el/.test(e)), 'checkPack: a pack that names a translation in its own file is valid');
  // the same rule for code in validate.py --source
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-')), A = { ...src, num: 1, title: 'T', subtitle: 's', emoji: 'x', mantra: 'm', objectives: ['o'], pitfalls: [] }, B = JSON.parse(JSON.stringify(A)); B.sections[0].blocks[1].code = 'x = 2';
  fs.writeFileSync(path.join(tdir, 'a.json'), JSON.stringify(A)); fs.writeFileSync(path.join(tdir, 'b.json'), JSON.stringify(B));
  let out = ''; try { out = execFileSync('python3', [path.join(ROOT, 'tools', 'validate.py'), path.join(tdir, 'b.json'), '--source', path.join(tdir, 'a.json')], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || ''); }
  ok(/code must stay exactly/.test(out), 'validate.py --source: a translated code block is refused too');
  fs.rmSync(tdir, { recursive: true, force: true });
}
fs.rmSync(td, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
