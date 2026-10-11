#!/usr/bin/env node
/* Prune Claude's drafts that Weblate has approved (docs/i18n.md §9.5). After the owner merges a Weblate pull request,
   i18n/<component>/<locale>.arb holds the approved translations; the same keys in i18n/<component>/drafts/<locale>.arb
   are no longer needed (the runtime shows a draft only where no approved text exists, and an approved key must not go
   back to Weblate as a draft). The glossary likewise: rows of i18n/glossary/drafts/<locale>.csv whose term has a
   translation in i18n/glossary/<locale>.csv.

   node tools/i18n/prune_drafts.js                  what would be removed (dry run)
   node tools/i18n/prune_drafts.js --write          remove it; a draft file with nothing left is deleted
   node tools/i18n/prune_drafts.js --check          exit 1 when something could be pruned (for CI)
   options: --not-in-english  also drop draft keys en.arb no longer has · --keep-empty  keep emptied files ·
            --root DIR  another checkout (tests)

   Only drafts are touched: approved catalogs, en.arb and the language-course facades never are. A draft whose
   approved counterpart is empty ("") is kept. Formatting is preserved (ARB: 2-space JSON; CSV: the original lines). */
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const opt = n => args.includes(n);
const ri = args.indexOf('--root');
const ROOT = ri >= 0 ? path.resolve(args[ri + 1]) : path.resolve(__dirname, '..', '..');
const I18N = path.join(ROOT, 'i18n');

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error(p + ': ' + e.message); } };
const isMsg = k => !k.startsWith('@');
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/** ARB drafts: [{file, removed: [keys], left, empty}] */
function pruneArb({ notInEnglish = false } = {}) {
  const out = [];
  if (!fs.existsSync(I18N)) return out;
  for (const comp of fs.readdirSync(I18N).sort()) {
    const dd = path.join(I18N, comp, 'drafts');
    if (comp === 'glossary' || !fs.existsSync(dd)) continue;
    const en = readJson(path.join(I18N, comp, 'en.arb')) || {};
    for (const f of fs.readdirSync(dd).filter(f => f.endsWith('.arb')).sort()) {
      const loc = f.slice(0, -4), file = path.join(dd, f);
      const draft = readJson(file), approved = readJson(path.join(I18N, comp, loc + '.arb')) || {};
      const removed = [], kept = {};
      for (const [k, v] of Object.entries(draft || {})) {
        const done = isMsg(k) && typeof approved[k] === 'string' && approved[k] !== '';
        const gone = isMsg(k) && notInEnglish && !has(en, k);
        if (done || gone) removed.push(k); else kept[k] = v;
      }
      out.push({ file, removed, kept, left: Object.keys(kept).filter(isMsg).length, kind: 'arb' });
    }
  }
  return out;
}

/** CSV records with their raw text: [{fields, raw}] (RFC 4180: quotes, doubled quotes, commas and newlines in quotes). */
function parseCsv(text) {
  const recs = []; let i = 0;
  while (i < text.length) {
    const start = i, fields = []; let f = '', q = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { fields.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; i++; break; }
      else f += c;
    }
    fields.push(f);
    recs.push({ fields, raw: text.slice(start, i) });
  }
  return recs;
}

function pruneGlossary() {
  const out = [], gd = path.join(I18N, 'glossary'), dd = path.join(gd, 'drafts');
  if (!fs.existsSync(dd)) return out;
  for (const f of fs.readdirSync(dd).filter(f => f.endsWith('.csv')).sort()) {
    const file = path.join(dd, f), ap = path.join(gd, f);
    const recs = parseCsv(fs.readFileSync(file, 'utf8'));
    if (!recs.length) continue;
    const head = recs[0].fields, si = head.indexOf('source'), ti = head.indexOf('target');
    const done = new Set();
    if (fs.existsSync(ap)) {
      const ar = parseCsv(fs.readFileSync(ap, 'utf8')), ah = ar[0] ? ar[0].fields : [];
      const s = ah.indexOf('source'), t = ah.indexOf('target');
      for (const r of ar.slice(1)) if (s >= 0 && t >= 0 && (r.fields[t] || '').trim()) done.add(r.fields[s]);
    }
    const removed = [], keptRaw = [recs[0].raw];
    for (const r of recs.slice(1)) {
      if (r.fields.length === 1 && r.fields[0] === '') { keptRaw.push(r.raw); continue; }   // blank line
      if (si >= 0 && ti >= 0 && done.has(r.fields[si])) removed.push(r.fields[si]); else keptRaw.push(r.raw);
    }
    out.push({ file, removed, keptRaw, left: keptRaw.length - 1, kind: 'csv' });
  }
  return out;
}

function main() {
  const write = opt('--write'), keepEmpty = opt('--keep-empty');
  const res = [...pruneArb({ notInEnglish: opt('--not-in-english') }), ...pruneGlossary()].filter(r => r.removed.length);
  let keys = 0;
  for (const r of res) {
    keys += r.removed.length;
    const rel = path.relative(ROOT, r.file), del = r.left === 0 && !keepEmpty;
    console.log(`${write ? 'pruned' : 'would prune'} ${rel}: ${r.removed.length} approved key(s)` + (del ? ' — file deleted (nothing left)' : `, ${r.left} left`));
    if (!write) continue;
    if (del) { fs.unlinkSync(r.file); continue; }
    if (r.kind === 'arb') fs.writeFileSync(r.file, JSON.stringify(r.kept, null, 2) + '\n');
    else fs.writeFileSync(r.file, r.keptRaw.join(''));
  }
  console.log(`prune_drafts: ${keys} key(s) in ${res.length} file(s)` + (write || !res.length ? '' : ' — dry run, add --write'));
  if (opt('--check') && res.length) process.exit(1);
}

if (require.main === module) main();
module.exports = { pruneArb, pruneGlossary, parseCsv };
