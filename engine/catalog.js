/* =====================================================================================
   noema-lite — the search's query side (docs/SEARCH.md): folding, scoring and snippets over the catalogue's records.
     · fold(): accents, case, ß, final sigma, Hebrew points, Arabic vowel marks and pinyin tones do not matter
   The records themselves (what each piece of the app is, its fields and address, the ids that survive a rebuilt
   pack) and the index of each account (built in the Worker, kept in IndexedDB noema-lite-search) are
   src/features/catalog (NoemaCore.catalog). No DOM here: the same code runs in Node (tests/search_catalog.js).
   ===================================================================================== */
(function (root) {
  'use strict';

  /* ---------- text ---------- */
  const MARKS = /[̀-֑ͯ-ׇֽֿׁׂׅׄؐ-ًؚ-ٰٟۖ-ۭ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;
  /** Scholarly Latin letters read as the plain letters people type: š = sh, č = ch, ž = zh, ḵ / ẖ / ḫ = kh, ṯ = th, ḏ = dh, ġ = gh
      (so «ṣaḥn», «sahn» and «صحن» are one search; dots, macrons, ʿ and ʾ are dropped by MARKS below). */
  const TRANSLIT_TO = { 's\u030c': 'sh', 'c\u030c': 'ch', 'z\u030c': 'zh', 'k\u0331': 'kh', 'h\u0331': 'kh', 'h\u032e': 'kh', 't\u0331': 'th', 'd\u0331': 'dh', 'g\u0307': 'gh', 'g\u0331': 'gh', 'g\u030c': 'j', 'j\u030c': 'j' };
  const TRANSLIT = /([sczkhtdgj])([\u030c\u0331\u032e\u0307])/g;
  /** The form texts are compared in: no accents, tones or vowel points, lower case, ß = ss, ς = σ, every space one ' '.
      Works character by character (foldMap relies on it). */
  function foldChar(ch) {
    return ch.normalize('NFKD').toLowerCase().replace(TRANSLIT, (m, b, d) => TRANSLIT_TO[b + d] || m).replace(MARKS, '').replace(/ß/g, 'ss').replace(/ς/g, 'σ').replace(/[\u0640\u02be\u02bf]/g, '').replace(/ى/g, 'ي')
      .replace(/[‘’ʼ`´]/g, "'").replace(/[“”«»„]/g, '"').replace(/\s/g, ' ');
  }
  const FOLD_CACHE = new Map();
  function fold(s) {
    s = String(s ?? '');
    let out = '';
    for (const ch of s) { let f = FOLD_CACHE.get(ch); if (f === undefined) { f = foldChar(ch); if (FOLD_CACHE.size < 20000) FOLD_CACHE.set(ch, f); } out += f; }
    return out;
  }
  /** fold() with, for every folded character, the index of the original character it came from (to cut snippets). */
  function foldMap(s) {
    s = String(s ?? ''); let t = ''; const map = []; let i = 0;
    for (const ch of s) { const f = fold(ch); for (let k = 0; k < f.length; k++) map.push(i); t += f; i += ch.length; }
    map.push(s.length);
    return { t, map };
  }
  /* ---------- the query ---------- */
  const TYPES = { know: ['roadmap', 'station', 'subject', 'chapter', 'section', 'theory', 'exercise', 'card', 'trap', 'drill', 'source'], lang: ['word', 'meaning', 'grammar', 'lesson', 'field', 'sentence', 'phenomenon'], both: ['convo'] };
  const ORDER = [...TYPES.know, ...TYPES.lang, ...TYPES.both];
  /** Make a record searchable in memory: its fields folded once, joined (each field starts at off[i]). */
  function prep(r) {
    if (r._t != null) return r;
    let t = ''; r._o = [];
    for (const [, txt] of r.f) { r._o.push(t.length); t += fold(txt) + '\u0001'; }
    r._t = t; r._ti = fold(r.ti || '').trim(); r._ex = (r.ex || []).map(x => fold(x).trim()).filter(Boolean);
    return r;
  }
  const FIELD_W = { title: 30, word: 30, meaning: 26, sentence: 12, question: 10, front: 10 };
  const isWordStart = (t, i) => i === 0 || /[\s\u0001"'(\[{\-–—/.,;:!?·|→]/.test(t[i - 1]);
  /** One record against the folded query tokens → { score, fi (field index), at (position in that field) } or null. */
  function match(r, toks, qf) {
    const t = r._t; let score = 0, fi = -1, at = -1;
    for (let k = 0; k < toks.length; k++) {
      const w = toks[k]; let i = t.indexOf(w); if (i < 0) return null;
      // prefer a match at the start of a word, and in the earliest field
      let best = i, j = i; while (j >= 0 && !isWordStart(t, j)) { j = t.indexOf(w, j + 1); }
      if (j >= 0) best = j;
      const f = fieldAt(r, best);
      score += isWordStart(t, best) ? 8 : 2;
      score += FIELD_W[r.f[f][0]] || (f === 0 ? 14 : 4);
      if (k === 0) { fi = f; at = best - r._o[f]; }
    }
    if (r._ti === qf) score += 1000; else if (r._ti.startsWith(qf)) score += 60;
    if (r._ex.includes(qf)) score += 900;
    return { score, fi, at };
  }
  function fieldAt(r, pos) { let f = 0; while (f + 1 < r._o.length && r._o[f + 1] <= pos) f++; return f; }
  /** A short piece of the field around the match: { pre, hit, post } (the hit as written, accents and all). */
  function snippet(text, folded, at, len, room = 60) {
    const { t, map } = foldMap(text);
    let p = at; if (t.slice(p, p + folded.length) !== folded) p = t.indexOf(folded);
    if (p < 0) return { pre: '', hit: '', post: String(text).slice(0, room * 2) };
    const s = map[p], e = map[Math.min(p + folded.length, map.length - 1)];
    let a = Math.max(0, s - room), b = Math.min(text.length, e + room * 1.5);
    if (a > 0) { const sp = text.lastIndexOf(' ', s - room * 0.6); if (sp > a - 20 && sp > 0) a = sp + 1; }
    if (b < text.length) { const sp = text.indexOf(' ', b); if (sp > 0 && sp - b < 20) b = sp; }
    return { pre: (a > 0 ? '…' : '') + text.slice(a, s), hit: text.slice(s, e), post: text.slice(e, b) + (b < text.length ? '…' : '') };
  }

  /** Search records. filters: { w: 'know'|'lang'|'', types: [..], keep: rec => bool } → { exact, groups: [[type, results]], total } */
  function search(records, q, filters = {}) {
    const qf = fold(q).trim(); const toks = qf.split(' ').filter(Boolean);
    if (!toks.length || qf.length < 2) return { exact: [], groups: [], total: 0, q: qf };
    const types = filters.types?.length ? new Set(filters.types) : null, byType = new Map(); let total = 0; const exact = [];
    for (const r of records) {
      if (filters.w && r.w !== filters.w) continue;
      if (types && !types.has(r.ty)) continue;
      if (filters.langs?.length && !(r.lg || []).some(l => filters.langs.includes(l))) continue;
      prep(r);
      const m = match(r, toks, qf); if (!m) continue;
      if (filters.keep && !filters.keep(r)) continue;
      const res = { r, score: m.score, fi: m.fi, at: m.at };
      total++;
      if (r._ti === qf || r._ex.includes(qf)) exact.push(res);
      if (!byType.has(r.ty)) byType.set(r.ty, []);
      byType.get(r.ty).push(res);
    }
    for (const l of byType.values()) l.sort((a, b) => b.score - a.score || (window.NoemaI18n ? NoemaI18n.fmt.compare(a.r.ti, b.r.ti) : String(a.r.ti).localeCompare(String(b.r.ti))));
    exact.sort((a, b) => (a.r.ty === 'word' ? 0 : 1) - (b.r.ty === 'word' ? 0 : 1) || b.score - a.score);
    const groups = ORDER.filter(t => byType.has(t)).map(t => [t, byType.get(t)]);
    return { exact: exact.slice(0, 6), groups, total, q: qf, toks };
  }
  /** The snippet of one result (computed only for the results shown). */
  function snip(res, q) {
    const qf = fold(q).trim(), first = qf.split(' ').filter(Boolean)[0] || qf, [name, text] = res.r.f[res.fi] || res.r.f[0] || ['', ''];
    return { field: name, ...snippet(text, first, res.at, first.length) };
  }

  root.NoemaCatalog = { TYPES, ORDER, fold, foldMap, search, snip, prep };
})(typeof window !== 'undefined' ? window : globalThis);
