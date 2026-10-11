#!/usr/bin/env node
/* Language names per UI locale (CLDR, through Intl.DisplayNames) for the D19 lint of tools/lang_facade.py, used when
   Python's babel is not installed. Writes tools/i18n/langnames/<locale>.json = { "<code>": "<name>" }.
   Usage: node tools/i18n/langnames/make.js        (re-run when the locales or the code list change) */
'use strict';
const fs = require('fs'), path = require('path');
const LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT'];
// every two-letter code CLDR names, the profiles of _typology/languages.json and the historical / source languages
// etymologies and comparisons name most often
const EXTRA = ['ang', 'enm', 'fro', 'frm', 'goh', 'gmh', 'nds', 'grc', 'akk', 'arc', 'phn', 'syc', 'syr', 'gez', 'cop', 'egy', 'non', 'got',
  'sux', 'peo', 'pal', 'ota', 'lad', 'nah', 'haw', 'yue', 'wuu', 'hak', 'nan', 'gsw', 'bar', 'pdc', 'yi', 'chr', 'ast', 'scn', 'nap', 'vec',
  'fil', 'ceb', 'sco', 'frr', 'fy', 'lb', 'rm', 'mt', 'eo', 'tlh', 'sa', 'pi', 'la', 'ckb', 'kmr', 'prs', 'tg', 'ps', 'arq', 'ary', 'arz',
  'apc', 'acm', 'afb', 'aii', 'jpr', 'jrb', 'smp', 'sem', 'gem', 'ine', 'roa', 'sla', 'cel', 'ira', 'inc', 'trk', 'urj', 'bnt', 'sit', 'aav'];
const typ = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../library/languages/_typology/languages.json'), 'utf8')).languages.map(x => x.code);
const en = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const codes = new Set();
const A = 'abcdefghijklmnopqrstuvwxyz';
for (const a of A) for (const b of A) { const c = a + b; if (en.of(c)) codes.add(c); }
for (const c of [...typ, ...EXTRA]) if (en.of(c)) codes.add(c);
for (const loc of LOCALES) {
  const dn = new Intl.DisplayNames([loc], { type: 'language', fallback: 'none' }), out = {};
  for (const c of [...codes].sort()) { const n = dn.of(c); if (n && n !== c) out[c] = n; }
  fs.writeFileSync(path.join(__dirname, loc + '.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(loc, Object.keys(out).length);
}
