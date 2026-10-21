// The quantity rules (tools/pack_rules.json): one list for Python (validate.py / make_pack.py / build.py) and JS
// (engine/packcheck.js RULES: app, Gemini generator, connector). Every exercise type, difficulty and focus tag >= 3 per chapter.
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
fs.rmSync(td, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
