/* =====================================================================================
   noema-lite — word linking: the one place that finds a dictionary's words in a page's text (docs/BRIDGE.md §4).
   A dictionary is a list of entries { k, forms: [...], case? } (forms may be several words: "data skew"); the text is
   cut into words (letters, marks and digits; ' and - inside a word belong to it), every word is compared folded
   (engine/catalog.js fold(): accents, case, final sigma … do not matter), the longest entry that starts at a word wins.
     · tokenize(text) → [{ t, i, j }] · index(entries) → idx · find(text, idx) → [{ i, j, entry, form }]
     · decorate(root, idx, { pick }) wraps the matches of every text node in root (never inside code, maths, buttons,
       links, inputs, ASCII diagrams or an exercise) in <span class="nw"> — with a gloss <span class="nw nw-g">word<span class="nw-rt">…</span></span>
       (the gloss sits under the word without widening it, as a <ruby> would) — and
       undecorate(root) puts the plain text back. pick(entry, ctx) decides per match: null = leave it, else
       { sense, gloss?, glossLang?, cls? }; ctx = { block, blockText, offset (in blockText), text (of the node), form }.
   No DOM in tokenize / index / find: they run in Node too (tests/bridge_core.js). Modelled on the language courses'
   linkRuns (engine/lang/00_base.js), which may move onto this core later (docs/LANGUAGE_RULES.md process).
   ===================================================================================== */
(function (root) {
  'use strict';
  const fold = s => (root.NoemaCatalog ? root.NoemaCatalog.fold(s) : String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase());
  /* i18n-ignore-start */   // patterns and CSS selectors
  const WORD = /[\p{L}\p{M}\p{N}]+(?:['’\-‐][\p{L}\p{M}\p{N}]+)*/gu;
  const GAP = /^[ \t ]+$/;   // between the words of one entry: spaces only (never across a line or punctuation)
  /** Where words are never linked: code, maths, controls, links, the learner's own input, exercises (no answer may leak). */
  const SKIP = 'code, pre, kbd, samp, .pre, .katex, .katex-display, svg, math, button, a, input, textarea, select, option, label, '
    + '.diagram, .nw, .nw-rt, [data-nowl], .quickzone, .excard, .ex, .opts, .opt, .fb, .sectools, .secnav, .continue';
  /* i18n-ignore-end */

  function tokenize(text) {
    const s = String(text ?? ''), out = []; let m; WORD.lastIndex = 0;
    while ((m = WORD.exec(s))) out.push({ t: m[0], i: m.index, j: m.index + m[0].length });
    return out;
  }
  /** entries → { first: Map(folded first word → [{ toks, entry, form }] longest first), size } */
  function index(entries) {
    const first = new Map(); let size = 0;
    for (const entry of entries || []) {
      const forms = [...new Set([entry.k, ...(entry.forms || [])].filter(f => typeof f === 'string' && f.trim()))];
      for (const form of forms) {
        const toks = tokenize(form).map(x => entry.case ? x.t : fold(x.t)); if (!toks.length) continue;
        const key = entry.case ? fold(toks[0]) : toks[0];
        if (!first.has(key)) first.set(key, []);
        first.get(key).push({ toks, entry, form }); size++;
      }
    }
    for (const list of first.values()) list.sort((a, b) => b.toks.length - a.toks.length);
    return { first, size };
  }
  /** Every match in text, left to right, never overlapping; the longest entry that starts at a word wins. */
  function find(text, idx) {
    const s = String(text ?? ''), toks = tokenize(s), out = [];
    if (!idx || !idx.size) return out;
    for (let n = 0; n < toks.length; n++) {
      const cands = idx.first.get(fold(toks[n].t)); if (!cands) continue;
      let hit = null;
      for (const c of cands) {
        if (n + c.toks.length > toks.length) continue;
        let ok = true;
        for (let q = 0; q < c.toks.length && ok; q++) {
          const tk = toks[n + q];
          ok = (c.entry.case ? tk.t === c.toks[q] : fold(tk.t) === c.toks[q]) && (q === 0 || GAP.test(s.slice(toks[n + q - 1].j, tk.i)));
        }
        if (ok) { hit = c; break; }
      }
      if (!hit) continue;
      const last = toks[n + hit.toks.length - 1];
      out.push({ i: toks[n].i, j: last.j, entry: hit.entry, form: s.slice(toks[n].i, last.j) });
      n += hit.toks.length - 1;
    }
    return out;
  }

  /* ---------- the DOM ---------- */
  /** Wrap the matches inside root. → how many words were wrapped. */
  function decorate(rootEl, idx, { pick, skip = '', blockSel = '[data-bid]' } = {}) {
    if (!rootEl || !idx || !idx.size || typeof document === 'undefined') return 0;
    const sel = skip ? SKIP + ', ' + skip : SKIP, offsets = new Map(), texts = new Map(); let n = 0;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT), nodes = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) nodes.push(t);
    for (const t of nodes) {
      const par = t.parentElement, block = par?.closest(blockSel) || rootEl, at = offsets.get(block) || 0;
      offsets.set(block, at + t.data.length);
      if (!texts.has(block)) texts.set(block, block.textContent);   // the block's text before any gloss went in
      if (!par || par.closest(sel) || !t.data.trim()) continue;
      const hits = find(t.data, idx); if (!hits.length) continue;
      const frag = document.createDocumentFragment(); let pos = 0, used = 0;
      for (const m of hits) {
        const p = pick ? pick(m.entry, { block, blockText: texts.get(block), offset: at + m.i, text: t.data, form: m.form }) : { sense: null };
        if (!p) continue;
        if (m.i > pos) frag.append(t.data.slice(pos, m.i));
        frag.append(wordEl(m, p)); pos = m.j; used++;
      }
      if (!used) continue;
      if (pos < t.data.length) frag.append(t.data.slice(pos));
      t.replaceWith(frag); n += used;
    }
    return n;
  }
  function wordEl(m, p) {
    const gl = p.gloss != null && p.gloss !== '';
    const w = document.createElement('span');
    w.className = 'nw' + (gl ? ' nw-g' : '') + (p.cls ? ' ' + p.cls : '');
    w.dataset.k = m.entry.k; if (p.sense) w.dataset.s = p.sense;
    w.tabIndex = 0; w.setAttribute('role', 'button');
    w.append(m.form);
    if (gl) {
      const rt = document.createElement('span'); rt.className = 'nw-rt'; rt.textContent = p.gloss;
      if (p.glossLang) { rt.lang = p.glossLang; rt.dir = 'auto'; }
      w.append(rt);
    }
    return w;
  }
  /** Back to plain text (a level changed, the help was turned off). */
  function undecorate(rootEl) {
    if (!rootEl) return;
    for (const w of rootEl.querySelectorAll('.nw')) { w.querySelector('.nw-rt')?.remove(); w.replaceWith(document.createTextNode(w.textContent)); }
    rootEl.normalize();
  }

  root.NoemaWordlink = { SKIP, fold, tokenize, index, find, decorate, undecorate };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NoemaWordlink;
})(typeof window !== 'undefined' ? window : globalThis);
