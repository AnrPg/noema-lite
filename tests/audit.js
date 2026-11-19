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
console.log(`\n${n} checks passed`);
