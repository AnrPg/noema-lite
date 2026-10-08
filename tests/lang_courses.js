/* Every language course in library/languages: the runtime reads it, every bank sentence tokenizes back to its annotated words,
   every word card builds, and a new learner's first session is sensible. Usage: node tests/lang_courses.js */
const fs = require('fs'), path = require('path');
const N = require(path.join(__dirname, '..', 'engine', 'langcore.js'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const LIB = path.join(__dirname, '..', 'library', 'languages');
for (const id of fs.existsSync(LIB) ? fs.readdirSync(LIB) : []) {
  const root = path.join(LIB, id);
  if (!fs.existsSync(path.join(root, 'course.json'))) continue;
  console.log(`— ${id}`);
  const read = rel => { const p = path.join(root, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  const list = rel => { const p = path.join(root, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
  const C = N.course(N.readCourse(read, list));
  for (const code of C.languages) {
    const X = C.lang[code], prepared = Object.keys(X.prepared).filter(n => X.prepared[n]);
    const bad = [];
    for (const s of X.sentences) {
      const flat = []; const walk = ks => ks.forEach(t => t.parts ? walk(t.parts) : !t.p && flat.push(t.l)); walk(s.tokens);
      const got = []; for (const t of N.tokenize(C, code, s.text)) { if (t.p) continue; if (t.parts) t.parts.forEach(p => got.push(p.matches.map(m => m.l))); else got.push(t.matches.map(m => m.l)); }
      if (got.length !== flat.length || got.some((alts, i) => !alts.includes(flat[i]))) bad.push(s.id);
    }
    ok(!bad.length, `${code}: ${X.sentences.length} sentences tokenize back to their words` + (bad.length ? ' — not: ' + bad.slice(0, 8).join(', ') : ''));
    const L = N.newLearner(C); let cards = 0, unknownIn = 0, err = [];
    for (const lid of Object.keys(X.lex)) { try { const c = N.wordCard(C, L, code, lid); cards++; } catch (e) { err.push(lid + ': ' + e.message); } }
    ok(!err.length && cards === Object.keys(X.lex).length, `${code}: ${cards} word cards (${prepared.length} prepared nodes)` + (err.length ? ' — ' + err.slice(0, 3) : ''));
    if (code === 'de') {
      const bad = Object.keys(X.lex).filter(id => X.lex[id].pos === 'NOUN').map(id => N.wordCard(C, L, code, id).parts[0]?.[1] || '').filter(p => !/^(der|die|das) /.test(p));
      ok(!bad.length, 'de: every noun card starts with its article' + (bad.length ? ' — ' + bad.slice(0, 5) : ''));
      const gh = Object.values(X.lex).find(x => /Heinrich/.test(x.lemma));
      if (gh) ok(N.wordCard(C, L, code, gh.id).parts[0][1] === 'der Gute Heinrich', 'de: der Gute Heinrich (the form after the article)');
    }
    const plan = N.planSession(C, L, { day: 0, minutes: 30, languages: [code] });
    ok(plan.steps[0]?.kind === 'learn' && plan.steps[0].node === C.order[0], `${code}: a new learner starts with ${plan.steps[0]?.node} (${plan.steps[0]?.concepts.length} words)`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
