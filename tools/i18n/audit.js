/* Finds learner-facing text that is still hard-coded in the code (docs/i18n.md §3, §7): string and template literals that look
   like words for people, not code (keys, classes, selectors, storage keys, URLs, SVG paths …).
   Usage:
     node tools/i18n/audit.js                 per-file counts of every source file in scope
     node tools/i18n/audit.js --list [files]  every finding as file:line: text
     node tools/i18n/audit.js --diff <base>   only the lines added since git <base> (CI: exit 1 when any)
     node tools/i18n/audit.js --json          machine-readable
   Not text for learners — mark it so the audit skips it:
     // i18n-ignore            on the line (a code word that looks like text, a test hook, a log)
     /* i18n-ignore-start *\/ … /* i18n-ignore-end *\/   a block (e.g. a prompt for the AI, which is approach 6, not the UI)
   Out of scope (docs/i18n.md §3): cloud/mcp/ (the connector's texts are instructions for Claude), generated files, vendor code. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const SCOPE = ['engine', 'cloud', 'index.html'];
const SKIP = /(^|\/)(vendor|i18n|node_modules)\/|^engine\/(engine|langui|authoring)\.js$|^cloud\/mcp\/|^engine\/i18n\.js$|\.min\.js$/;

/** A small JavaScript tokenizer: every string / template literal with its line, skipping comments and regular expressions. */
function literals(src) {
  const out = []; let i = 0, line = 1, prev = '';   // prev: the last significant token (to tell a regex from a division)
  const KW = /^(return|typeof|case|in|of|new|delete|void|throw|else|do|yield|await)$/;
  const regexAllowed = () => !prev || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || KW.test(prev) || prev === '=>';
  function str(q) {   // i at the opening quote
    const start = line; let s = ''; i++;
    while (i < src.length && src[i] !== q) { if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2; continue; } if (src[i] === '\n') line++; s += src[i++]; }
    i++; out.push({ line: start, text: s, q }); prev = 'str';
  }
  function tpl() {   // i at the backtick; ${…} parts are tokenized recursively and shown as {…}
    const start = line; let s = ''; i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; s += '{…}'; code(1); continue; }
      if (src[i] === '\n') line++; s += src[i++];
    }
    i++; out.push({ line: start, text: s, q: '`' }); prev = 'str';
  }
  function code(depth) {   // until the brace that closes a ${ (depth 1) or the end
    let d = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const body = src.slice(i, e < 0 ? src.length : e + 2); line += (body.match(/\n/g) || []).length; i = e < 0 ? src.length : e + 2; continue; }
      if (c === '"' || c === "'") { str(c); continue; }
      if (c === '`') { tpl(); continue; }
      if (c === '/' && regexAllowed()) {   // a regular expression literal
        i++; let cls = false;
        while (i < src.length && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; }
        i++; while (/[a-z]/i.test(src[i] || '')) i++; prev = 'regex'; continue;
      }
      if (c === '{') { d++; prev = c; i++; continue; }
      if (c === '}') { if (depth && d === 0) { i++; return; } d--; prev = c; i++; continue; }
      if (/[\w$]/.test(c)) { let w = ''; while (i < src.length && /[\w$]/.test(src[i])) w += src[i++]; prev = w; continue; }
      if (c === '=' && n === '>') { prev = '=>'; i += 2; continue; }
      prev = c; i++;
    }
  }
  code(0);
  return out;
}

/** Context right before a literal that makes it code, not text. */
const CODE_CTX = /(class:?|className:?|'class':|classList\.\w+\(|querySelector(All)?\(|\$\$?\(|closest\(|matches\(|addEventListener\(|removeEventListener\(|dispatchEvent\(new \w+\(|getItem\(|setItem\(|removeItem\(|getAttribute\(|setAttribute\(|removeAttribute\(|hasAttribute\(|createElement(NS)?\(|\bh\(|\bel\(|dataset\.\w+\s*=|type:|role:|name:|\bid:|key:|method:|mode:|kind:|rel:|target:|\bhref:|\bsrc:|\bd:|viewBox:|fill:|stroke:|style:|accept:|autocomplete:|inputmode:|for:|\bas:|lang:|dir:|console\.\w+\(|new RegExp\(|import\(|fetch\(|require\(|postMessage\(|\.startsWith\(|\.endsWith\(|\.includes\(|\.split\(|\.join\(|\.replace(All)?\(|\.test\(|\.indexOf\(|===?|!==?|case|t\(|tr\(|\bL\(|NoemaI18n\.t\(|has\(|\.t\(|['"]?data-[\w-]+['"]?:)\s*$/;
const LETTER = /\p{L}/u;
/** Every CSS class the app defines: a string made only of these is a class list, not text. */
const CLASSES = new Set();
(function css(d) { for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/vendor/.test(f)) css(p); } else if (/\.(css|js|mjs)$/.test(f)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) CLASSES.add(m[1]); } })(path.join(ROOT, 'engine'));
function isText(lit, before) {
  let s = lit.text.replace(/\\n/g, ' ').replace(/\\u[0-9a-f]{4}|\\./gi, ' ').trim();
  if (!s || !LETTER.test(s)) return false;
  if (CODE_CTX.test(before)) return false;
  if (/^\s*</.test(s) && />/.test(s)) {   // markup (SVG, HTML): only its text nodes and labels count
    const txt = [...s.matchAll(/>([^<>]*)</g)].map(m => m[1]).concat([...s.matchAll(/\b(?:title|alt|aria-label|placeholder)="([^"]*)"/g)].map(m => m[1])).join(' ').replace(/\{…\}/g, ' ');
    return /\p{L}{2,}/u.test(txt);
  }
  if (s.split(/\s+/).every(w => CLASSES.has(w) || w === '{…}')) return false;
  const words = s.replace(/\{…\}/g, 'X').trim();
  if (!LETTER.test(words)) return false;
  if (/^(https?:|data:|mailto:|blob:|file:|#\/|\.\/|\/)/.test(words)) return false;
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]+$/.test(words) && /\d/.test(words)) return false;   // SVG path data
  if (/^[\w$.:\-/@*#[\]=>~+()"' ,|^]+$/.test(words) && !/ /.test(words.trim())) {   // one token
    if (/^\p{Lu}\p{Ll}{2,}[.!?…:]?$/u.test(words)) return true;                      // 'Save', 'Close'
    if (/[^\x00-\x7f]/.test(words) && /\p{L}{2}/u.test(words)) return true;          // non-Latin words
    return false;
  }
  if (/^[a-z0-9_-]+( [a-z0-9_-]+)*$/.test(words) && /-|_/.test(words)) return false;   // class lists 'btn small ai'
  if (/^[.#[]?[\w-]+([.#[:>\s,+~][\w\-="\]()*]+)+$/.test(words) && !/\s\p{Ll}{3,}\s\p{Ll}{3,}/u.test(words)) return false;   // CSS selectors
  if (/[{};]\s*$/.test(words) && /:\s*[^ ]+;/.test(words)) return false;   // CSS text
  if (/^[a-z][\w-]*:[\w:-]+$/.test(words)) return false;   // storage keys a:settings
  if (/^\s*(function|const|let|var|return|if|for)\b/.test(words)) return false;   // code in strings
  if (/^[\w.]+$/.test(words)) return false;
  return /\p{L}{2,}/u.test(words);
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8'), rel = path.relative(ROOT, file).replace(/\\/g, '/'), lines = src.split('\n');
  if (/\.html$/.test(file)) {   // static text in an HTML page
    const res = []; let body = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
    body.split('\n').forEach((l, n) => { for (const m of l.matchAll(/>([^<>]*\p{L}{2,}[^<>]*)</gu)) if (!/i18n-ignore/.test(lines[n])) res.push({ file: rel, line: n + 1, text: m[1].trim() }); for (const m of l.matchAll(/\b(title|alt|aria-label|placeholder)="([^"]*\p{L}{2,}[^"]*)"/gu)) res.push({ file: rel, line: n + 1, text: m[2] }); });
    return res;
  }
  const ignored = new Set(); let on = false;
  lines.forEach((l, n) => { if (/i18n-ignore-start/.test(l)) on = true; if (on || /i18n-ignore(?!-)/.test(l)) ignored.add(n + 1); if (/i18n-ignore-end/.test(l)) on = false; });
  const res = [];
  const offs = []; { let o = 0; for (const l of lines) { offs.push(o); o += l.length + 1; } }
  for (const lit of literals(src)) {
    if (ignored.has(lit.line)) continue;
    const ln = lines[lit.line - 1] || '', at = ln.indexOf(lit.q === '`' ? '`' : lit.q + lit.text.slice(0, 12));
    const before = (lines[lit.line - 2] || '').slice(-80) + ' ' + (at >= 0 ? ln.slice(Math.max(0, at - 80), at) : '');
    if (isText(lit, before.trimEnd())) res.push({ file: rel, line: lit.line, text: lit.text.replace(/\s+/g, ' ').slice(0, 140) });
  }
  return res;
}
function files() {
  const out = [];
  const walk = p => { const rel = path.relative(ROOT, p).replace(/\\/g, '/'); if (SKIP.test(rel)) return; const st = fs.statSync(p); if (st.isDirectory()) fs.readdirSync(p).forEach(f => walk(path.join(p, f))); else if (/\.(m?js|html)$/.test(p)) out.push(p); };
  SCOPE.forEach(s => fs.existsSync(path.join(ROOT, s)) && walk(path.join(ROOT, s)));
  return out;
}
function addedLines(base) {
  const diff = cp.execSync(`git diff -U0 ${base} -- ${SCOPE.join(' ')}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const map = {}; let f = null;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { f = l.slice(6); map[f] = map[f] || new Set(); continue; }
    const m = l.match(/^@@ .*\+(\d+)(?:,(\d+))? @@/); if (m && f) for (let k = 0; k < (m[2] == null ? 1 : +m[2]); k++) map[f].add(+m[1] + k);
  }
  return map;
}
if (require.main === module) {
  const args = process.argv.slice(2), di = args.indexOf('--diff');
  let found = [];
  const only = args.filter(a => !a.startsWith('--') && a !== args[di + 1]);
  for (const f of only.length ? only.map(x => path.resolve(x)) : files()) found = found.concat(scan(f));
  if (di >= 0) { const add = addedLines(args[di + 1] || 'main'); found = found.filter(x => add[x.file] && add[x.file].has(x.line)); }
  if (args.includes('--json')) console.log(JSON.stringify(found, null, 1));
  else if (args.includes('--list') || di >= 0) { for (const x of found) console.log(`${x.file}:${x.line}: ${x.text}`); console.log(`${found.length} hard-coded text(s)`); }
  else { const by = {}; for (const x of found) by[x.file] = (by[x.file] || 0) + 1; for (const [f, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(5) + '  ' + f); console.log(String(found.length).padStart(5) + '  total'); }
  process.exit(di >= 0 && found.length ? 1 : 0);
}
module.exports = { scan, files, literals, isText };
