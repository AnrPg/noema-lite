#!/usr/bin/env node
/* The app's runtime reads a language course back (docs/LANGUAGES.md §10.2, §11) — the read-back of tests/lang_courses.js for
   any course folder, so the skill noema-language-builder can run it in a sandbox (it carries langcore.js next to this file):
     node tools/lang_readback.js <course-dir> [--lang <code>] [--package <pkg.json> --course <course file>]
   Per language: every bank sentence tokenizes back to its annotated words, every word card builds, a new learner starts with
   the first lesson, and every lesson exercise is made from stored data with ≤ ⌈30 %⌉ unknown words, each listed (D19).
   --package: also checks a language package against the course file (course.pack.js / course.json) exactly as the app and
   the connector do (langcore.checkLangPackage), and reads the course back with the package applied.
   Exit 0 when everything passes. */
const fs = require('fs'), path = require('path');
const LC = [path.join(__dirname, '..', 'engine', 'langcore.js'), path.join(__dirname, 'langcore.js')].find(p => fs.existsSync(p));
if (!LC) { console.error('langcore.js not found (engine/langcore.js or next to this script)'); process.exit(2); }
const N = require(LC);
const a = process.argv.slice(2), opt = k => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
if (!a[0] || a[0].startsWith('--')) { console.log('usage: node lang_readback.js <course-dir> [--lang <code>] [--package <pkg.json> --course <course file>]'); process.exit(2); }
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const only = opt('--lang');
/** A course file (course.pack.js of the website, course.json of an account course) → data (with the word profiles next to it). */
function readFile(f) {
  const raw = fs.readFileSync(f, 'utf8'), body = s => JSON.parse(s.slice(s.indexOf('] = ') + 4).trim().replace(/;$/, ''));
  if (!f.endsWith('.js')) return JSON.parse(raw);
  const d = body(raw), pf = path.join(path.dirname(f), 'course.profiles.js');
  if (fs.existsSync(pf)) { const pr = body(fs.readFileSync(pf, 'utf8')); for (const L of Object.values(d.langs || {})) for (const x of Object.values(L.lexicon || {})) for (const lx of x.lexemes || []) if (pr[lx.id]) lx.profile = pr[lx.id]; }
  return d;
}
function readBack(data, label) {
  console.log(`— ${label}`);
  data = { ...data, course: { ...data.course, draft: [] } };
  const C = N.course(data);
  for (const code of C.languages) {
    if (only && code !== only) continue;
    const X = C.lang[code], bad = [];
    for (const s of X.sentences) {
      const flat = [], names = new Set(); const walk = ks => ks.forEach(t => t.parts && t.parts.some(x => x.name) ? names.add(t.t) : t.parts ? walk(t.parts) : t.name ? names.add(t.t) : !t.p && flat.push(t.l)); walk(s.tokens);
      let text = s.text; for (const nm of names) if (nm.includes(' ')) text = text.split(nm).join(' ');
      const got = []; for (const t of N.tokenize(C, code, text)) { if (t.p || (t.unknown && names.has(t.t))) continue; if (t.parts) t.parts.forEach(p => got.push(p.matches.map(m => m.l))); else got.push(t.matches.map(m => m.l)); }
      if (got.length !== flat.length || got.some((alts, i) => !alts.includes(flat[i]))) bad.push(s.id);
    }
    ok(!bad.length, `${code}: ${X.sentences.length} sentences tokenize back to their words` + (bad.length ? ' — not: ' + bad.slice(0, 8).join(', ') : ''));
    const L = N.newLearner(C), err = []; let cards = 0;
    for (const lid of Object.keys(X.lex)) { try { N.wordCard(C, L, code, lid); cards++; } catch (e) { err.push(lid + ': ' + e.message); } }
    ok(!err.length, `${code}: ${cards} word cards` + (err.length ? ' — ' + err.slice(0, 3).join('; ') : ''));
    const lessons = C.order.filter(n => C.nodes[n].kind === 'lesson' && X.applies[n]);
    const first = N.planSession(C, L, { day: 0, minutes: 30, languages: [code] }).steps[0];
    if (lessons.length) ok(first?.kind === 'lesson' && first.node === lessons[0], `${code}: a new learner starts with lesson ${first?.node}`);
    const T = N.newLearner(C), bad2 = []; let n = 0;
    for (const nid of lessons) {
      if (!X.prepared[nid]) break;
      for (const id of X.byNode[nid] || []) N.review(C, T, code, id, 'r', true, 0);
      N.recordCheck(C, T, code, nid, 1, 0);
      const k = N.known(C, T, code);
      for (const f of N.lessonFunctions(C, code, nid)) for (const it of N.exercises(C, T, code, f, { k, max: 200 })) {
        n++;
        if (it.type === 'choose' && !it.options.includes(it.answer)) bad2.push(`${nid} ${f}: answer not among the options`);
        if (it.sentence) { const S = X.sentenceById[it.sentence], un = S.req.filter(l => !k.R.has(l)); if (un.length > S.cap) bad2.push(`${nid} ${f}: ${it.sentence} has ${un.length} unknown words (at most ${S.cap})`); if (un.some(l => !(it.unknown || []).includes(l))) bad2.push(`${nid} ${f}: ${it.sentence} does not list its unknown words as 🆕`); }
      }
    }
    if (lessons.length) ok(!bad2.length, `${code}: ${n} lesson exercises from stored data, ≤ ⌈30 %⌉ unknown words, each listed` + (bad2.length ? ' — ' + bad2.slice(0, 5).join('; ') : ''));
  }
}
const root = path.resolve(a[0]);
const read = rel => { const p = path.join(root, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const list = rel => { const p = path.join(root, rel); return fs.existsSync(p) ? fs.readdirSync(p).filter(f => f.endsWith('.json')).sort() : []; };
readBack(N.readCourse(read, list), path.basename(root));
if (opt('--package')) {
  const pkg = JSON.parse(fs.readFileSync(opt('--package'), 'utf8'));
  if (!opt('--course')) { console.error('--package needs --course <the course file the package is for>'); process.exit(2); }
  const base = readFile(opt('--course'));
  const probs = N.checkLangPackage(base, pkg);
  ok(!probs.length, `the package ${pkg.code} for ${pkg.course}: ${probs.length ? probs.length + ' problem(s)\n     - ' + probs.slice(0, 40).join('\n     - ') : 'accepted (the same check as the app and the connector)'}`);
  if (!probs.length) readBack(N.langApplyPackage(base, pkg), `${base.course.id} + the package (${pkg.code})`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
