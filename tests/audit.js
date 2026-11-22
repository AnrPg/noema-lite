// The deep quality audit (src/features/content/domain/audit.ts; the connector's noema_quality_audit, the toolkit's audit.py):
// every rule at today's strictness, whatever the pack says about itself, and a learning report per chapter — on the real
// chapter 1 of "Circuits from first principles" (tests/fixtures/quality/gradual_circuits_ch01.json).
//   node tests/audit.js
'use strict';
const path = require('path');
const P = require('./engines.cjs').content();
let n = 0; const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } n++; console.log('✓ ' + m); };
const copy = x => JSON.parse(JSON.stringify(x));
const F = require(path.join(__dirname, 'fixtures', 'quality', 'gradual_circuits_ch01.json'));
const pack = (sj, ch) => ({ format: 'noema-pack', v: 3, subject: { id: 'circ-demo', title: 'Circuits', language: 'en', ...sj }, chapters: [ch], media: {}, builtAt: '2026-10-01T00:00:00Z' });

// as published: an older pack (rules 2, built in October) — the upload still takes it, the audit holds it to today's rules
const pub = copy(F.chapter); pub.map = {};
const old = pack({ authoring: { rules: 2, by: 'import' } }, pub);
ok(!P.checkPack(old, undefined, { requireQuality: true }).errors.some(e => /\[concept\./.test(e)), 'the published chapter as an older pack: the upload gives Q0 as warnings');
const a = P.auditPack(old);
ok(a.errors.some(e => /\[concept\.map\] no concept list/.test(e)) && a.verdict === 'poor', `the audit: Q0 errors at today's rules, whatever authoring.rules, .by and builtAt say — ${a.score}/100, ${a.verdict}`);
const c = a.chapters[0];
ok(c.measures.gradual.score === 0 && /concept ladder/.test(c.measures.gradual.todo[0]), 'gradual: no concept ladder → 0, and what to write first');
ok(c.measures.depth.score < 50 && c.measures.depth.facts.some(f => /^ch01-s01: 141 words/.test(f)) && c.measures.depth.todo.some(t => /^ch01-s01: \d+ more words of teaching on its one idea/.test(t)), 'depth: section 1 has 141 words; how many more each section needs');
ok(c.engines.some(h => h.id === 'circuit-mna@1') && c.measures.interactivity.todo.some(t => /circuit-mna@1/.test(t) && /noema_request_engine/.test(t)), 'interactivity: a circuits chapter without a simulation is told which engine fits (circuit-mna@1), or to request one');
ok(!c.engines.some(h => h.id === 'genetics@1'), 'the engines named clearly fit (no stray word match)');
ok(c.measures.interactivity.todo.some(t => /circuit-mna@1 — [A-Z][^(]{10,} \(fits: /.test(t)), 'each engine named comes with what it is for, then the words that made it fit: ' + c.measures.interactivity.todo.find(t => /circuit-mna@1/.test(t)));
{ // the purpose of every catalogue entry is the engine catalogue's engine.engines.<slug>.what (the #/engines page), word for word
  const arb = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'i18n', 'engine', 'en.arb'), 'utf8'));
  const cat = require('./engines.cjs').lib.catalog.CATALOG, src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'features', 'content', 'domain', 'engine_purpose.ts'), 'utf8');
  const what = new Function('return ' + src.slice(src.indexOf('Object.freeze({') + 14, src.lastIndexOf('})') + 1))();   // a plain object literal
  const off = cat.filter(e => what[e.id] !== arb[`engine.engines.${e.slug}.what`]).map(e => e.id);
  ok(cat.length > 20 && !off.length && Object.keys(what).length === cat.length, `every catalogue engine has its one-line purpose (engine_purpose.ts), the same as engine.engines.<slug>.what (${cat.length} engines${off.length ? '; differ: ' + off : ''})`);
}
ok(['depth', 'gradual', 'retention', 'interactivity', 'variety'].every(k => typeof c.measures[k].score === 'number' && c.measures[k].score >= 0 && c.measures[k].score <= 100), 'five measures per chapter, each 0–100 with its facts and what to add');
ok(a.judgement.length >= 8 && a.judgement.some(q => /newcomer/.test(q)) && a.judgement.some(q => /Correct/.test(q)), 'the judgement questions a program cannot answer, for the agent to answer by reading');
const r = P.auditReport(a);
ok(/^Quality audit: \d+\/100 — poor\. \d+ rule error\(s\)/.test(r) && /# ch01 .* — \d+\/100/.test(r) && /## interactivity \d+\/100/.test(r) && /# Judgement/.test(r), 'the report: verdict, rule errors, each chapter by measure, the judgement');

// adding what it asks for raises the measure: a simulation block and picture exercises
const more = copy(pub); more.sections[0].blocks.push({ t: 'interactive', activity: 'charge-lab' }, { t: 'interactive', activity: 'current-lab' });
for (let i = 0; i < 3; i++) more.exercises.push({ ...copy(more.exercises[0]), id: `ch01-e9${i}`, type: 'img_label' });
const b = P.auditPack(pack({ authoring: { rules: 2 } }, more)).chapters[0];
ok(b.measures.interactivity.score > c.measures.interactivity.score && b.measures.interactivity.facts[0].includes('charge-lab'), `interactivity rises with the activities and picture exercises (${c.measures.interactivity.score} → ${b.measures.interactivity.score})`);
// the honest concept ladder: gradual now measures the real Q0 issues instead of the missing list
const lad = copy(F.chapter); lad.map = { concepts: copy(F.concepts), known: copy(F.known) };
const g = P.auditPack(pack({ authoring: { rules: 3, by: 'claude' } }, lad)).chapters[0];
ok(g.measures.gradual.facts[0].startsWith(`${F.concepts.length} concepts`) && g.measures.gradual.todo.some(t => /introduced/.test(t)), 'gradual with the ladder: its Q0 issues (what is used before it is taught) are the to-do list');
const bad = copy(lad); const mq = { ...copy(bad.exercises[0]), id: 'ch01-e777', type: 'mcq', options: ['a', 'b'], answer: 99, why: ['x', 'y'] }; delete mq.answer_; bad.exercises.push(mq);
const strictErr = P.auditPack(pack({ authoring: { rules: 3, by: 'claude' } }, bad)).errors.filter(e => e.includes('ch01-e777') && !e.includes('['));
ok(strictErr.length > 0 && !P.checkPack(pack({ authoring: { rules: 3, by: 'claude' } }, bad), undefined, { requireQuality: true }).errors.some(e => e.includes('ch01-e777') && !e.includes('[')), 'strict: an exercise that cannot be graded (an MCQ answer outside its options) is an error of the audit');
const lr = copy(lad); lr.map.learnables = [{ id: 'ch01-l99', kp: [], goal: 'g' }];
ok(P.auditPack(pack({ authoring: { rules: 3 } }, lr)).chapters[0].measures.retention.todo.some(t => /fewer than 2 exercise types.*ch01-l99/.test(t)), 'retention: a learnable with no exercise at all counts as practised in fewer than 2 types');
ok(P.auditPack({}).chapters.length === 0 && P.auditPack(null).verdict === 'poor', 'not a pack → nothing to praise');
// one validator (DNA upgrade handoff 2026-11-22, item 1): what make_pack.py and pipeline.py check … write refuse is an audit error
{
  const ch = copy(F.chapter);
  ch.map = { concepts: copy(F.concepts), known: copy(F.known) };
  ch.flashcards = [{ q: 'What is charge?', a: 'A property of matter.', section: ch.sections[0].id }];
  const e0 = ch.exercises[0];
  ch.exercises.push({ ...copy(e0), id: 'ch01-e900', type: 'spotbug', q: 'Which line is wrong?', lines: ['a = 1', 'b = 2', 'c = a +'], bugs: [2] });
  delete ch.exercises[ch.exercises.length - 1].options; delete ch.exercises[ch.exercises.length - 1].answer;
  ch.exercises.push({ ...copy(e0), id: 'ch01-e901', tags: ['sequence'] });
  const au = P.auditPack(pack({ authoring: { rules: 3, by: 'claude' } }, ch));
  ok(au.errors.some(e => /^ch01: flashcard needs an id like ch01-f001/.test(e)), 'audit: a flashcard without its id is a rule error (as make_pack.py refuses it)');
  ok(au.errors.some(e => /ch01-e900: .*fix/.test(e)), 'audit: a spotbug without its fix is a rule error');
  ok(au.errors.some(e => /ch01-e901: tags\[0\]: must be one of/.test(e)), 'audit: an unknown exercise tag ("sequence") is a rule error');
  ok(new Set(au.errors).size === au.errors.length, 'audit: each message once (the pack check and the chapter check share the quality rules)');
}
// an activity's still picture needs no exercises; a source exercise keeps its options (no longest-option warning)
{
  const p = pack({ authoring: { rules: 3, by: 'claude' } }, copy(F.chapter));
  p.media = { 'act-still': { w: 800, h: 400, alt: 'the still', data: 'data:image/svg+xml,<svg/>' } };
  p.activities = { format: 'noema.activities/v1', items: [{ id: 'act', runtime: 'sim-spec@1', fallback: { media: 'act-still', text: 'x' } }] };
  ok(!P.checkPack(p).warnings.some(w => /picture act-still has 0 exercises/.test(w)), 'an activity still picture is not asked for exercises');
  const q = P.checkQuality({ id: 'ch01', sections: [{ id: 'ch01-s01' }], exercises: [
    { id: 'ch01-e001', section: 'ch01-s01', type: 'mcq', q: 'Pick one.', options: ['a', 'b', 'the right answer is a much longer option than the rest'], answer: 2, cite: { src: 's1', sq: 'q1' } },
    { id: 'ch01-e002', section: 'ch01-s01', type: 'mcq', q: 'Pick one.', options: ['a', 'b', 'the right answer is a much longer option than the rest'], answer: 2, cite: { src: 's1' } },
  ], map: {} }, { authoring: { rules: 3 } });
  const longest = q.filter(i => i.rule === 'trivial.longest').map(i => i.msg);
  ok(longest.length === 1 && /ch01-e002/.test(longest[0]), 'trivial.longest: skipped for a source exercise (cite.sq), kept for the rest');
}
console.log(`\n${n} checks passed`);
