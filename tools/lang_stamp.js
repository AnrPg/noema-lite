/* noema-lite · the keys a language course's runtime needs besides its texts, computed from the master (docs/language-packs.md §3, D19).
   Usage (tools/build.py): node tools/lang_stamp.js < course-data.json > stamps.json
   In: the course data as tools/build.py assembles it (readCourse shape). Out: {sentence id: {mk, time?, date?}} — the meaning key of every
   bank sentence (parallel sentences) and the time / date it names (clock, date exercises), so that a locale facade that translates the
   glosses can never change what the exercises check. The same function (NoemaLang.masterStamps) runs in the app for courses not built here. */
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '..', 'engine', 'langcore.js'));
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  const st = N.masterStamps(JSON.parse(raw)), out = {};
  for (const [id, x] of Object.entries(st)) out[id] = { mk: x.mk, ...(x.time ? { time: x.time } : {}), ...(x.date ? { date: x.date } : {}) };
  process.stdout.write(JSON.stringify(out));
});
