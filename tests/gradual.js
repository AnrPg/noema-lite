// Q0, the gradual introduction of concepts (src/features/content/domain/gradual.ts; tools/CONTENT_SPEC.md "Q0"): nothing is
// used before it is taught, one focus per page, every page in depth. First the real case the rule was made for (2026-11-19):
// chapter 1 of "Circuits from first principles" (Roadmap "Build your own gadgets") converted mAh to coulombs and asked about
// amperes, volts and joules in its section on charge, before current, voltage or energy had been introduced.
//   node tests/gradual.js
'use strict';
const path = require('path');
const P = require('./engines.cjs').content();
let n = 0; const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exit(1); } n++; console.log('✓ ' + m); };
const copy = x => JSON.parse(JSON.stringify(x));
const Q0 = new Set(P.QUALITY.checks.filter(c => c.minRules).map(c => c.id));
ok(['concept.map', 'concept.order', 'concept.undeclared', 'theory.focus', 'theory.depth'].every(id => Q0.has(id)) && P.QUALITY.checks[0].id === 'concept.map', 'Q0: five checks, the first quality rules');
const SJ = { authoring: { rules: 3, by: 'claude' }, features: { math: true } };
const q0 = (ch, sj = SJ, place) => P.checkQuality(ch, sj, place).filter(i => Q0.has(i.rule));
const has = (iss, rule, re) => iss.some(i => i.rule === rule && re.test(i.msg));

// ---------- the real chapter ----------
const F = require(path.join(__dirname, 'fixtures', 'quality', 'gradual_circuits_ch01.json'));
const real = () => { const ch = copy(F.chapter); ch.map = { concepts: copy(F.concepts), known: copy(F.known) }; return ch; };
let iss = q0(real(), SJ, { before: [], after: [F.ch02] });
ok(iss.length && iss.every(i => i.level === 'error'), `the real chapter: ${iss.length} Q0 errors for a pack with authoring.rules 3`);
ok(has(iss, 'concept.order', /ampere-hour \(ch01-s01\) needs current .* comes only later \(ch01-s02\)/), 'ampere-hours in the section on charge, before current is introduced');
ok(has(iss, 'concept.order', /ch01-e002 \(ch01-s01\): uses “current” \(introduced in ch01-s02; (q|explain|unit): “[^”]+”\)/), 'the 2000 mAh exercise sits in section 1, before current and the ampere');
ok(has(iss, 'concept.order', /ch01-e009 \(ch01-s01\): uses “current” .*“voltage” \(introduced in ch01-s04; /), 'the unit-matching exercise names amperes and volts in section 1');
ok(has(iss, 'concept.order', /uses “energy” \(energy\), which ch02 introduces later/) && has(iss, 'concept.order', /voltage \(ch01-s04\) needs energy .* ch02 introduces later/), 'joules and energy belong to chapter 2, yet voltage is defined with them in chapter 1');
ok(has(iss, 'concept.order', /ch01-s01 \(a reveal block, blocks\[\d+\]\): uses “voltage”/), 'the think-first reveal of section 1 already leans on voltage');
ok(has(iss, 'concept.undeclared', /unit W \(watt, power\)/) && has(iss, 'concept.undeclared', /acronym LED/), 'the summary table quotes watts and an LED: neither is in the concept list');
ok(has(iss, 'theory.focus', /ch01-s01: introduces 4 new concepts/), 'section 1 throws four new concepts at once');
ok(has(iss, 'theory.depth', /ch01-s01: 141 words of teaching text, needs >= 850/) && has(iss, 'theory.depth', /ch01-s06: \d+ words .*needs >= 400/), 'section 1 has 141 words for four concepts; every section is too short');
ok(has(iss, 'theory.focus', /ch01-s01: no focus/), 'no section says its one idea');
// as published: no concept list at all
const pub = copy(F.chapter); pub.map = {};
ok(q0(pub).map(i => i.rule).join() === 'concept.map', 'as published (no concept list): concept.map refuses it, the other Q0 rules wait for the list');
// older packs keep working: rules 2 → warnings; learner-made packs → warnings
ok(q0(real(), { authoring: { rules: 2, by: 'claude' } }).every(i => i.level === 'warn'), 'a pack with authoring.rules 2 gets Q0 as warnings only');
const pk = sj => ({ format: 'noema-pack', subject: { id: 'circ-demo', title: 'Circuits', ...sj }, chapters: [real(), { id: 'ch02', sections: [], exercises: [], map: F.ch02.map }], media: {} });
const cp = P.checkPack(pk(SJ));
ok(cp.errors.some(e => e.includes('[concept.order] uses “energy” (energy), which ch02 introduces later')), 'checkPack (the connector, make_pack): the whole pack, so a later chapter’s concepts are seen');
ok(!P.checkPack(pk({ authoring: { rules: 3, by: 'learner' } })).errors.some(e => /\[concept\.|\[theory\.(focus|depth)/.test(e)), 'checkPack: a learner-made pack gets warnings, never errors');

// the connector (requireQuality): a new pack cannot skip Q0 by an older rules number or by authoring.by
const fresh = sj => ({ ...pk(sj), builtAt: '2026-11-19T13:00:00+00:00' });
ok(P.checkPack(fresh({ authoring: { rules: 2, by: 'claude' } }), null, { requireQuality: true }).errors.some(e => e.includes('authoring.rules must be 3')), 'connector: a pack built since Q0 with authoring.rules 2 is refused');
ok(P.checkPack(fresh({ authoring: { rules: 3, by: 'learner' } }), null, { requireQuality: true }).errors.some(e => e.includes('[concept.order]')), 'connector: by "learner" does not turn Q0 into warnings for a new pack');
ok(!P.checkPack({ ...pk({ authoring: { rules: 2, by: 'claude' } }), builtAt: '2026-11-01T10:00:00+00:00' }, null, { requireQuality: true }).errors.some(e => /authoring\.rules must be 3|\[concept\./.test(e)), 'connector: a pack built before Q0 keeps uploading (Q0 as warnings)');

// ---------- a gradual chapter passes ----------
const say = (topic, k) => Array.from({ length: k }, (_, i) => ({ t: 'p', text: `Picture ${i + 1}: think about ${topic} on a small bench, with a battery, a switch and a lamp you can touch. Ask what you would see, then what you would measure, then what would change if you made one part bigger, and write the answer down before reading on. Each answer builds the picture one piece at a time.` }));
const sec = (id, title, focus, def, topic, extra = []) => ({ id, title, focus, hook: `Why ${topic} matters before anything else.`, blocks: [{ t: 'p', text: def }, ...say(topic, 9), { t: 'reveal', label: 'Think first: what would you expect?', text: `Write your guess about ${topic}, then check it against the picture above.` }, ...extra] });
const good = {
  id: 'ch01', title: 'Charge and current',
  sections: [
    sec('ch01-s01', 'What charge is', 'Charge is a property that comes in two kinds and is counted in coulombs.', 'Electric **charge** comes in two kinds, positive and negative; it is counted in **coulombs**, and one electron carries 1.602×10⁻¹⁹ C.', 'charge'),
    sec('ch01-s02', 'Charge on the move', 'Current is how much charge passes per second; its unit is the ampere.', '**Current** is the charge that passes a point each second: 1 **ampere** (A) is 1 C per second.', 'current'),
    sec('ch01-s03', 'Counting a battery', 'Battery labels count charge as current times hours.', 'A battery label counts charge in **ampere-hours**: 1 Ah is 1 A for one hour, 3600 C, so 1 mAh is 3.6 C.', 'ampere-hours'),
  ],
  exercises: [
    { id: 'ch01-e001', type: 'calc', section: 'ch01-s03', q: 'A cell is labelled 2000 mAh. How many coulombs of charge is that?', answer: 7200, unit: 'C', explain: '2000 mAh is 2 Ah, and 1 Ah is 3600 C, so 7200 C. Forgetting the 3600 seconds per hour is the classic slip.' },
    { id: 'ch01-e002', type: 'tf', section: 'ch01-s02', q: 'A steady current of 2 A moves 2 C past a point every second.', answer: true, explain: 'One ampere is one coulomb per second, so 2 A is 2 C each second. The trap is to think an ampere is a lump of charge.' },
  ],
  flashcards: [{ id: 'ch01-f001', q: 'What is 1 A?', a: '1 coulomb per second', section: 'ch01-s02' }],
  map: {
    concepts: [
      { id: 'charge', terms: ['charge', 'electric charge', 'coulomb'], units: ['C'], in: 'ch01-s01', def: 'A property of particles that comes in two kinds; counted in coulombs.' },
      { id: 'current', terms: ['current', 'ampere'], units: ['A'], in: 'ch01-s02', def: 'The charge that passes a point each second; 1 A = 1 C/s.', needs: ['charge', 'second'] },
      { id: 'ampere-hour', terms: ['ampere-hour'], units: ['Ah'], in: 'ch01-s03', def: 'One ampere for one hour: 3600 C, the unit on battery labels.', needs: ['current', 'hour'] },
    ],
    known: [{ id: 'second', terms: ['second'], from: 'everyday' }, { id: 'hour', terms: ['hour'], units: ['h'], from: 'everyday' }, { id: 'battery', terms: ['battery', 'lamp', 'switch', 'cell', 'electron'], from: 'everyday' }],
  },
};
iss = q0(good);
ok(iss.length === 0, 'a gradual chapter (charge → current → ampere-hours, one idea per section, in depth) has no Q0 issue' + (iss.length ? '\n   ' + iss.map(i => i.msg).join('\n   ') : ''));

// ---------- each rule on its own ----------
const bad = f => { const ch = copy(good); f(ch); return q0(ch); };
ok(has(bad(ch => { ch.exercises[0].section = 'ch01-s01'; }), 'concept.order', /ch01-e001 \(ch01-s01\): uses “ampere-hour” \(introduced in ch01-s03; q: “2000 mAh”\)/), 'concept.order: an exercise moved before the section that teaches its concept');
ok(has(bad(ch => { ch.exercises[0].q = 'How many coulombs is 2000 mAh?'; ch.exercises[0].section = 'ch01-s01'; ch.exercises[0].explain = 'Multiply by 3.6 and you have it. It is just arithmetic, nothing more.'; }), 'concept.order', /uses “ampere-hour”/), 'concept.order: the unit alone (mAh after a number) is enough to see the concept');
ok(has(bad(ch => { ch.exercises[0].unit = 'A'; ch.exercises[0].section = 'ch01-s01'; ch.exercises[0].q = 'Which number?'; ch.exercises[0].explain = 'It is that number. Nothing else is asked here at all.'; }), 'concept.order', /uses “current”/), 'concept.order: an exercise whose answer unit is A, in the section on charge');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'Later we will see how current moves it.' }); }), 'concept.order', /ch01-s01 \(a paragraph, blocks\[\d+\]\): uses “current”/), 'concept.order: a theory paragraph that names a concept two sections early');
ok(has(bad(ch => { ch.map.concepts[1].needs = ['charge', 'ampere-hour']; }), 'concept.order', /current \(ch01-s02\) needs ampere-hour/), 'concept.order: a concept that needs one taught after it');
ok(has(bad(ch => { ch.map.concepts[1].in = 'ch01-s03'; }), 'concept.order', /ch01-s02 \([^)]*\): uses “current”/), 'concept.order: the map places it later than the text uses it');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'A small lamp takes about 0.5 W.' }); }), 'concept.undeclared', /unit W \(watt, power\)/), 'concept.undeclared: a unit after a number that no concept lists');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'An LED glows when charge moves through it.' }); }), 'concept.undeclared', /acronym LED/), 'concept.undeclared: an acronym that is in neither list');
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'An LED glows when charge moves through it.' }); ch.map.known.push({ id: 'led', terms: ['LED'], from: '@real_components_and_analog_switching' }); }).length, 'concept.undeclared: … unless it is known from an earlier step of the Roadmap');
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'This is NOT the same as a magnet, and THIS matters.' }); }).length, 'concept.undeclared: capitals for emphasis are not acronyms');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'terms', items: [{ term: 'insulator', def: 'a material that holds its charge in place' }] }); }), 'concept.undeclared', /the term “insulator”/), 'concept.undeclared: a terms-block term that is not in the concept list');
ok(has(bad(ch => { delete ch.sections[1].focus; }), 'theory.focus', /ch01-s02: no focus/), 'theory.focus: a section without its one idea');
ok(has(bad(ch => { ch.map.concepts.push(...['insulator', 'conductor', 'semiconductor'].map(id => ({ id, terms: [id], in: 'ch01-s01', def: 'One more concept squeezed into the first section.' }))); }), 'theory.focus', /ch01-s01: introduces 4 new concepts/), 'theory.focus: more than 3 new concepts on one page');
ok(has(bad(ch => { ch.sections[2].blocks = ch.sections[2].blocks.slice(0, 3); }), 'theory.depth', /ch01-s03: \d+ words of teaching text, needs >= 400/), 'theory.depth: a short page');
ok(has(bad(ch => { ch.sections[2].blocks = ch.sections[2].blocks.filter(b => b.t !== 'reveal'); }), 'theory.depth', /ch01-s03: no reveal/), 'theory.depth: no think-first reveal');
ok(has(bad(ch => { ch.sections[1].blocks[0].text = ch.sections[1].blocks[0].text.replace(/\*\*/g, ''); }), 'theory.depth', /introduces “current” \(current\) without defining it/), 'theory.depth: a concept introduced without its definition (bold or terms block)');
ok(has(bad(ch => { ch.map.concepts[0].in = 'ch01-s09'; }), 'concept.map', /in "ch01-s09" is not a section/), 'concept.map: in names a section of the chapter');
ok(has(bad(ch => { ch.map.known[0].from = 'the previous lesson'; }), 'concept.map', /from must be/), "concept.map: known.from is chNN, @<step id> or 'everyday'");
const fromLater = copy(good); fromLater.map.known.push({ id: 'x', terms: ['xylophone'], from: 'ch03' });
ok(has(q0(fromLater, SJ, { before: [], after: [] }), 'concept.map', /from ch03, which is not an earlier chapter/), 'concept.map: known from a chapter that is not earlier');
// review fixes: LaTeX units, symbol tables, prefixed declared units, hooks/pitfalls/playbooks
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'A small lamp takes $0.5\\,\\mathrm{W}$ of it.' }); }), 'concept.undeclared', /unit W/), 'concept.undeclared: a LaTeX measurement ($0.5\\,\\mathrm{W}$) is a unit after a number too');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'It is about $2\\text{ mA}$ in a small lamp.' }); }), 'concept.order', /ch01-s01 \(a paragraph, blocks\[\d+\]\): uses “current”/), 'concept.order: $2\\text{ mA}$ uses current');
ok(has(bad(ch => { ch.map.concepts[1].symbols = ['I']; ch.sections[0].blocks.push({ t: 'table', kind: 'summary', head: ['Quantity', 'Symbol'], rows: [['the one we count', 'Q'], ['the flow', 'I']] }); }), 'concept.order', /ch01-s01 \(a table block, blocks\[\d+\]\): uses “current”/), 'concept.order: a bare symbol in a table cell (I) is a use');
ok(!bad(ch => { ch.map.concepts[2].units = ['mAh']; }).length, 'concept.undeclared: a concept that declares units ["mAh"] covers 2000 mAh');
ok(has(bad(ch => { ch.debug = [{ id: 'pb1', title: 'Dim lamp', askYourself: ['Is the LED in backwards?'] }]; }), 'concept.undeclared', /pb1: the acronym LED/), 'concept.undeclared: playbooks are scanned');
ok(has(bad(ch => { ch.pitfalls = [{ title: 'Watts', text: 'A 5 W lamp gets hot.', fix: 'Check it.' }]; }), 'concept.undeclared', /pitfall 1: uses the unit W/), 'concept.undeclared: pitfalls are scanned');
ok(has(bad(ch => { ch.sections[0].hook = 'Your USB charger counts it.'; }), 'concept.undeclared', /acronym USB/), 'concept.undeclared: section hooks are scanned');
// tokens that only look like units (bug report 2026-11-21): a hex number, a part number, a hyphenated word; the rest via map.plainText
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'The register at address 0x0C holds the charge count.' }); }).length, 'concept.undeclared: 0x0C is a hex number, not 0 coulombs');
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'A board with 4 N-channel parts and 2 P-type layers holds charge.' }); }).length, 'concept.undeclared: 4 N-channel is not 4 newtons');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'The cable of grade 5 W holds charge.' }); }), 'concept.undeclared', /“5 W” is not that unit .*list it in map\.plainText/), 'concept.undeclared: a token read as a unit names itself and map.plainText');
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'The cable of grade 5 W holds charge, and so does the 0x1F register.' }); ch.map.plainText = ['5 W']; }).length, 'concept.undeclared: … not once it is listed in map.plainText');
ok(has(bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'The cable of grade 5 W, and a lamp takes 0.5 W.' }); ch.map.plainText = ['5 W']; }), 'concept.undeclared', /unit W/), 'map.plainText hides only what it lists (0.5 W is still a watt)');
ok(!bad(ch => { ch.sections[0].blocks.push({ t: 'p', text: 'A 3S pack of cells holds charge.' }); ch.map.plainText = ['3S']; ch.map.concepts[0].units = ['C', 'S']; }).length, 'concept.order: 3S in map.plainText is not a use of a declared unit S');
// look-alikes the checker reads as plain text by itself, without map.plainText (limits report 2026-11-22, item 4)
const plainOk = (text, f) => bad(ch => { ch.sections[0].blocks.push({ t: 'p', text }); if (f) f(ch); });
const iss4 = [
  ['A 3S1P pack, a 2S pack and a 4S2P pack each hold charge.', ch => { ch.map.concepts[0].units = ['C', 'S']; }, 'cell-pack notation (3S1P, 2S, 4S2P) where a concept declares S'],
  ['The loop runs 5 N times, and the last row is 2 N + 1.', null, 'N as a count or a variable after a number'],
  ['The chip is soldered at 183 C, the reflow peak of the paste.', null, '183 C beside solder and reflow is a temperature, even where charge (C) is a concept'],
  ['The register at 0x0C and the one at 0x1F hold the charge count.', null, 'hex numbers'],
  ['Pick the 5 N strongest cells: they hold charge.', null, 'a lone 5 N in a chapter that never names newtons'],
].map(([text, f, what]) => [what, plainOk(text, f)]);
for (const [what, iss] of iss4) ok(!iss.length, 'look-alikes without map.plainText: ' + what + (iss.length ? '\n   ' + iss.map(i => i.msg).join('\n   ') : ''));
ok(has(plainOk('A 7200 C charge is moved before section 2: a real use.', ch => { ch.sections[0].blocks.push({ t: 'p', text: 'Later, 2 A moves it.' }); }), 'concept.order', /current/), 'look-alikes: a real unit use (2 A) is still seen');
const ch02force = { id: 'ch02', map: { concepts: [{ id: 'force', terms: ['force', 'newton'], units: ['N'], in: 'ch02-s01', def: 'A push or a pull, counted in newtons.' }] } };
ok(has(q0((() => { const ch = copy(good); ch.sections[0].blocks.push({ t: 'p', text: 'Push the cart with 5 N and it starts to roll.' }); return ch; })(), SJ, { before: [], after: [ch02force] }), 'concept.order', /“force” \(force\), which ch02 introduces later/), 'look-alikes: 5 N in a pack that teaches newtons later is still flagged');
ok(has(plainOk('The 2 kg cart is pushed with 5 N; a newton is a push.'), 'concept.undeclared', /unit N \(newton, force\)/), 'look-alikes: 5 N is a newton where the chapter names newtons and no concept lists them');
ok(!plainOk('The thermistor reads 25 C, and the temperature of the junction is 85 C.', ch => { ch.map.concepts.push({ id: 'temp', terms: ['temperature', 'thermistor', 'junction'], units: ['°C'], in: 'ch01-s01', def: 'How hot something is, in degrees Celsius.' }); }).some(i => /coulomb|“charge”/.test(i.msg)), 'look-alikes: 25 C beside temperature is read as °C (a temperature concept), never as coulombs');
// inflected languages: a stem with *
const el = copy(good); el.map.concepts[1].terms = ['ρεύμα*']; el.sections[0].blocks.push({ t: 'p', text: 'Η ένταση του ρεύματος θα έρθει αργότερα.' });
ok(has(q0(el), 'concept.order', /ch01-s01 \(a paragraph, blocks\[\d+\]\): uses “ρεύμα\*”/), 'a stem (ρεύμα*) finds the inflected form (ρεύματος)');
console.log(`\n${n} checks passed`);
