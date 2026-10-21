/* The critical-thinking exercise types (CONTENT_SPEC.md "Types": flaw, case, predict, tree, inquiry, debate),
   the "How sure?" chips, ⚑ report, the source chip after the answer and the facades of one learnable in a round.
   Usage: node tests/thinking_types.js <prepared-repo-dir>   (needs the demo-physics fixture, see tests/run_e2e.sh) */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const ROOT = path.resolve(process.argv[2] || REPO);
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/fixtures/quality/thinking_types.json'), 'utf8')).exercises;
const byType = Object.fromEntries(FIX.map(e => [e.type, e]));

/* ---------- schemas: the app's checker and validate.py agree ---------- */
console.log('— schemas');
require(path.join(REPO, 'engine/packcheck.js')); const P = globalThis.NoemaPackCheck;
for (const e of FIX) ok(P.checkExercise(e, {}).length === 0, `${e.type}: valid for engine/packcheck.js${P.checkExercise(e, {}).length ? ' — ' + P.checkExercise(e, {}).join('; ') : ''}`);
const broken = [
  ['flaw', e => { e.reason = 9; }], ['flaw', e => { e.flaws = [7]; }],
  ['case', e => { e.parts = e.parts.slice(0, 1); }], ['case', e => { e.parts[0].type = 'order'; }],
  ['predict', e => { delete e.outcome; }],
  ['tree', e => { e.nodes.b.options[0].to = 'a'; }], ['tree', e => { e.nodes.a.options[1].ok = true; }], ['tree', e => { e.start = 'zz'; }],
  ['inquiry', e => { e.scores = [3, 3, 0, 0]; }], ['inquiry', e => { e.why = e.why.slice(1); }],
  ['debate', e => { e.sides[0].best = 5; }], ['debate', e => { e.sides = e.sides.slice(0, 1); }],
];
const PYCHECK = `import json,sys; sys.argv=['validate.py']; sys.path.insert(0, ${JSON.stringify(path.join(REPO, 'tools'))}); import validate as V
for e in json.load(sys.stdin):
    V.errors.clear(); V.check_thinking(e['id'], e); print(len(V.errors))`;
const cases = [...FIX, ...broken.map(([t, f]) => { const e = JSON.parse(JSON.stringify(byType[t])); f(e); return e; })];
const py = execFileSync('python3', ['-c', PYCHECK], { input: JSON.stringify(cases), encoding: 'utf8' }).trim().split('\n').map(Number);
FIX.forEach((e, i) => ok(py[i] === 0, `${e.type}: valid for tools/validate.py`));
broken.forEach(([t, f], i) => {
  const e = cases[FIX.length + i], js = P.checkExercise(e, {}).length;
  ok(js > 0 && py[FIX.length + i] > 0, `${t}: a broken one is refused by both (${f.toString().replace(/^e => \{ | \}$/g, '')})`);
});
ok(['flaw', 'case', 'predict', 'tree', 'inquiry', 'debate'].every(t => P.TYPES.has(t) && P.QUALITY.vocab.types.includes(t)), 'the six types are in packcheck TYPES and pack_rules.json quality.vocab.types');

/* ---------- in the app ---------- */
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage(); const E = [];
  p.on('pageerror', e => E.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) E.push(m.text()); });
  await p.goto('file://' + ROOT + '/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(700);
  await p.click('.noema-chip:has-text("Demo Physics")'); await wait(1300);
  await p.evaluate(fx => { for (const e of fx) { e._ch = COURSE[0]; EX[e.id] = e; } }, FIX);
  const card = async id => { await p.evaluate(id => { const m = document.querySelector('main'); m.innerHTML = ''; const c = exerciseCard(EX[id]); c.id = 'T'; m.append(c); }, id); await wait(200); };
  const result = () => p.evaluate(() => { const c = document.getElementById('T'); return c._locked() ? (c.querySelector('.explain.ok') ? 'ok' : 'bad') : 'open'; });
  const check = async () => { await p.click('#T .actions button:has-text("Check")'); await wait(150); };
  const opt = (text, scope = '#T') => p.click(`${scope} .opt:has-text(${JSON.stringify(text)})`);
  console.log('— the six types in the app');

  // flaw: the line and the reason
  await card('ch01-e901');
  await p.click('#T .codelines button:nth-child(3)'); await check();
  ok(await result() === 'open', 'flaw: the line alone is not an answer yet (the reason is missing)');
  await opt('The speed was not squared'); await check();
  ok(await result() === 'ok', 'flaw: the right line + the right reason = right');
  ok(await p.locator('#T .fb.ok:has-text("9 J")').count() === 1, 'flaw: the fix is shown after the answer');
  await card('ch01-e901'); await p.click('#T .codelines button:nth-child(3)'); await opt('Joules are the wrong unit for energy'); await check();
  ok(await result() === 'bad', 'flaw: the right line with the wrong reason is wrong');

  // case: three parts, one Check
  await card('ch01-e902');
  ok(await p.locator('#T .casepart').count() === 3, 'case: three parts');
  await p.fill('#T .casepart:nth-child(1) input', '50'); await p.click('#T .casepart:nth-child(2) .tfbtn.t');
  ok(await result() === 'open', 'case: a true/false part does not end the card on its own');
  await opt('Both energies double', '#T .casepart:nth-child(3)'); await check();
  ok(await result() === 'ok', 'case: all three parts right = right');
  ok(await p.locator('#T .casepart.ok').count() === 3, 'case: each part is marked');
  await card('ch01-e902'); await p.fill('#T .casepart:nth-child(1) input', '25'); await p.click('#T .casepart:nth-child(2) .tfbtn.t'); await opt('Both energies double', '#T .casepart:nth-child(3)'); await check();
  ok(await result() === 'bad' && await p.locator('#T .casepart.bad').count() === 1, 'case: one wrong part makes it wrong and is marked alone');

  // predict: one tap, then the outcome
  await card('ch01-e903'); await opt('The heavy ball');
  ok(await result() === 'bad', 'predict: a wrong prediction is wrong (one tap)');
  ok(await p.locator('#T .fb.info:has-text("0.63 s")').count() === 1, 'predict: what actually happens is shown');

  // tree: a wrong branch explains where it leads, then the right path
  await card('ch01-e904'); await opt('Buy a new generator');
  ok(await p.locator('#T .fb.bad:has-text("impossible")').count() === 1 && await result() === 'open', 'tree: a wrong branch shows where it leads and the walk goes on');
  await opt('same units'); await wait(100); await opt('same time interval'); await wait(150);
  ok(await result() === 'bad', 'tree: reaching the end after a detour counts as a mistake');
  ok(await p.locator('#T .treepath li').count() === 2, 'tree: the path walked is listed');
  await card('ch01-e904'); await opt('same units'); await wait(100); await opt('same time interval'); await wait(150);
  ok(await result() === 'ok', 'tree: the clean path is right');

  // inquiry: the most informative option, values shown after
  await card('ch01-e905'); await opt('Drop the same ball from several heights');
  ok(await result() === 'ok', 'inquiry: the best experiment is right');
  ok(await p.locator('#T .opt .value').count() === 4, 'inquiry: every option shows its value afterwards');

  // debate: any side, then the strongest objection
  await card('ch01-e906'); await opt('Against: coal');
  ok(await result() === 'open' && await p.locator('#T .opt:has-text("CO₂ emissions")').count() === 1, 'debate: taking a side is not graded; its objections appear');
  await opt('Coal is black');
  ok(await result() === 'bad', 'debate: a weak objection is wrong');

  console.log('— how sure, ⚑, source chip');
  await card('ch01-e903');
  await p.click('#T .confchip:has-text("Sure")'); await opt('The light ball');
  ok(await p.evaluate(() => S.res['ch01-e903'].conf === 'sure' && S.res['ch01-e903'].last === false), 'how sure: kept with the answer');
  ok(await p.locator('#T .confnote').count() === 1, 'how sure: a confident mistake is pointed out');
  await p.click('#T .exflag'); await wait(150);
  await p.click('.modal .opt:has-text("Unclear")'); await p.fill('.modal textarea', 'two balls of the same size?'); await p.click('.modal .btn.primary'); await wait(150);
  ok(await p.evaluate(() => S.flags?.['ch01-e903']?.why === 'unclear' && /same size/.test(S.flags['ch01-e903'].note)), '⚑: the report is kept in the subject state');
  ok(await p.locator('#T .exflag.on').count() === 1, '⚑: the button shows it was reported');
  const src = await p.evaluate(() => SOURCES[0]?.id);
  await p.evaluate(src => { EX['ch01-e903'].cite = { src, loc: 'p. 3' }; }, src); await card('ch01-e903');
  ok(await p.locator('#T .excite').count() === 0, 'source chip: never before the answer');
  await opt('Both at the same moment');
  ok(await p.locator('#T .explain .excite .srcref:has-text("p. 3")').count() === 1, 'source chip: shown after the answer, with the place');

  console.log('— facades of one learnable in a round');
  const order = await p.evaluate(() => spreadFacades([{ id: 1, lr: 'a' }, { id: 2, lr: 'a' }, { id: 3, lr: 'b' }, { id: 4, lr: 'a' }, { id: 5, lr: 'c' }]).map(e => e.lr).join(''));
  ok(!/(.)\1/.test(order.slice(0, 4)), `facades are spread out (${order})`);
  await p.evaluate(() => { const a = EX['ch01-e901'], b = { ...EX['ch01-e903'], id: 'ch01-e907', lr: a.lr }; EX[b.id] = b; ALL_EX.push(a, b); });
  ok(await p.evaluate(() => siblingOf(EX['ch01-e901'], [EX['ch01-e901']])?.id === 'ch01-e907'), 'after a mistake: a sibling in another type is found for the round');

  ok(!E.length, 'no page errors' + (E.length ? ': ' + E.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n❌ ${fails} failed` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
