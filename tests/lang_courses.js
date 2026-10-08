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
  const data = N.readCourse(read, list);
  if ((data.course.draft || []).length) console.log(`  (nodes in progress: ${data.course.draft.join(', ')} — checked here as if finished)`);
  data.course = { ...data.course, draft: [] };
  const C = N.course(data);
  for (const code of C.languages) {
    const X = C.lang[code], prepared = Object.keys(X.prepared).filter(n => X.prepared[n]);
    const bad = [];
    for (const s of X.sentences) {
      const flat = [], names = new Set(); const walk = ks => ks.forEach(t => t.parts && t.parts.some(x => x.name) ? names.add(t.t) : t.parts ? walk(t.parts) : t.name ? names.add(t.t) : !t.p && flat.push(t.l)); walk(s.tokens);
      let text = s.text; for (const nm of names) if (nm.includes(' ')) text = text.split(nm).join(' ');   // a multi-word name (תֵּל אָבִיב) is not read as words
      const got = []; for (const t of N.tokenize(C, code, text)) { if (t.p || (t.unknown && names.has(t.t))) continue; if (t.parts) t.parts.forEach(p => got.push(p.matches.map(m => m.l))); else got.push(t.matches.map(m => m.l)); }
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
    const first = plan.steps[0], lessons = C.order.filter(n => C.nodes[n].kind === 'lesson' && X.applies[n]);
    if (lessons.length) ok(first?.kind === 'lesson' && first.node === lessons[0], `${code}: a new learner starts with lesson ${first?.node}`);
    else ok(first?.kind === 'learn' && first.node === C.order[0], `${code}: a new learner starts with ${first?.node} (${first?.concepts.length} words)`);
    // every lesson exercise is made from stored data; at most ⌈30 %⌉ of a sentence's words are unknown, and those are listed as 🆕 (D19)
    if (lessons.length) {
      const T = N.newLearner(C), bad2 = []; let n = 0;
      for (const nid of lessons) {
        if (!X.prepared[nid]) break;
        for (const id of X.byNode[nid] || []) N.review(C, T, code, id, 'r', true, 0);
        N.recordCheck(C, T, code, nid, 1, 0);
        const k = N.known(C, T, code);
        for (const f of N.lessonFunctions(C, code, nid)) for (const it of N.exercises(C, T, code, f, { k, max: 200 })) {
          n++;
          if (it.type === 'choose' && !it.options.includes(it.answer)) bad2.push(`${nid} ${f}: answer not among the options`);
          if (it.sentence) { const S = X.sentenceById[it.sentence], un = S.req.filter(l => !k.R.has(l));
            if (un.length > S.cap) bad2.push(`${nid} ${f}: ${it.sentence} has ${un.length} unknown words (at most ${S.cap})`);
            if (un.some(l => !(it.unknown || []).includes(l))) bad2.push(`${nid} ${f}: ${it.sentence} does not list its unknown words as 🆕`); }
        }
      }
      ok(!bad2.length, `${code}: ${n} lesson exercises, all from stored data, ≤ ⌈30 %⌉ unknown words, each listed` + (bad2.length ? ' — ' + bad2.slice(0, 5).join('; ') : ''));
    }
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
