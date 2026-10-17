#!/usr/bin/env node
/* D23 report for a language course: in the foundations (S00–S18) every sentence an exercise may use contains only words taught up to
   that lesson. Per language and lesson: the sentences usable that way (fewer than 6 = a content gap) and the foundation words that lack
   their transliteration / pinyin (D24 — an error, exit code 1).   Usage: node tools/lang_strict_report.js <course-dir> */
const fs = require('fs'), path = require('path'), N = require('../engine/langcore.js');
const root = path.resolve(process.argv[2] || 'library/languages/polyglot-semitic-zh-de'), MIN = 6;
const read = rel => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch (e) { return null; } };
const list = rel => { try { return fs.readdirSync(path.join(root, rel)); } catch (e) { return []; } };
const C = N.course(N.readCourse(read, list));
const lessons = C.order.filter(n => C.nodes[n].kind === 'lesson' && C.nodes[n].stage === 'foundations');
let gaps = 0, missing = 0;
for (const code of C.languages) {
  const X = C.lang[code], known = new Set(), rows = [], noTr = [];
  const roman = X.language.script !== 'Latn' && X.language.romanization;
  for (const nid of lessons) {
    for (const id of X.byNode[nid] || []) { known.add(id); const w = X.lex[id]; if (roman && !(code === 'zh' ? w.pinyin : w.translit)) noTr.push(w.lemma); }
    const seen = new Set(); let usable = 0;
    const fns = N.lessonFunctions(C, code, nid).filter(f => f !== 'fn.overview');
    for (const f of fns) for (const s of X.sentences.filter(s => (s.functions || []).includes(f))) { if (seen.has(s.id)) continue; seen.add(s.id); if (s.req.every(l => known.has(l))) usable++; }
    if (usable < MIN && fns.length) { rows.push(`  ${nid}: ${usable} usable of ${seen.size} sentences`); gaps++; }
  }
  console.log(`${code}: ${rows.length ? rows.length + ' lesson(s) with fewer than ' + MIN + ' usable sentences' : 'every lesson has enough usable sentences'}`);
  if (rows.length) console.log(rows.join('\n'));
  if (noTr.length) { missing += noTr.length; console.log(`  ✖ ${noTr.length} foundation word(s) without ${code === 'zh' ? 'pinyin' : 'transliteration'}: ${noTr.slice(0, 8).join(' ')}`); }
}
console.log(`\n${gaps} content gap(s) (warning), ${missing} missing transliteration(s) (error)`);
process.exit(missing ? 1 : 0);
