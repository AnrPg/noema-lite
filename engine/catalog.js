/* =====================================================================================
   noema-lite — the catalogue: every piece of the app as one searchable record (docs/SEARCH.md).
   A record says what it is (type), on which side of the app it lives (world: know | lang), where it sits (path),
   the texts it can be found by (fields) and the address that opens exactly it (href).
     · ids that survive a rebuilt pack: a theory block's id comes from its content (blockIds), a trap's from its title
     · fold(): accents, case, ß, final sigma, Hebrew points, Arabic vowel marks and pinyin tones do not matter
     · one index per source (a subject's pack, a Roadmap, a language course, the conversations), kept on this device in
       IndexedDB (noema-lite-search) and rebuilt in the background when its source changes
   No DOM here except IndexedDB: the same builders run in Node (tests/search_catalog.js).
   ===================================================================================== */
(function (root) {
  'use strict';
  const SCHEMA = 4;   // bump when records change shape: every source is rebuilt once

  /* ---------- text ---------- */
  const MARKS = /[̀-֑ͯ-ׇֽֿׁׂׅׄؐ-ًؚ-ٰٟۖ-ۭ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;
  /** The form texts are compared in: no accents, tones or vowel points, lower case, ß = ss, ς = σ, every space one ' '.
      Works character by character (foldMap relies on it). */
  function foldChar(ch) {
    return ch.normalize('NFKD').replace(MARKS, '').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ').replace(/[\u0640\u02be\u02bf]/g, '').replace(/ى/g, 'ي')
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
  /** Pinyin with tone marks → with tone numbers ("nǐ hǎo" → "ni3 hao3"), so both ways of typing find the word. */
  const TONE = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };
  function toneNumbers(p) {
    return String(p || '').split(/(\s+|')/).map(syl => { const d = syl.normalize('NFD'); let n = ''; const base = d.replace(/[̄́̌̀]/g, m => { n = TONE[m]; return ''; }); return n ? base.normalize('NFC') + n : syl; }).join('');
  }
  /** Plain text from the packs' markdown-lite (bold, code, links, tags, math dollars). */
  function plain(s) {
    return String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`+/g, '').replace(/(^|[\s(])[*_](\S)/g, '$1$2').replace(/(\S)[*_](?=[\s.,;:!?)]|$)/g, '$1')
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2').replace(/\$+/g, '').replace(/\\(tfrac|dfrac|frac|cdot|times|mathrm|text|left|right)\b/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }
  function hash36(s) { let h1 = 0x811c9dc5, h2 = 0; s = String(s); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (h2 * 31 + c) >>> 0; } return (h1.toString(36) + h2.toString(36)).slice(0, 10); }
  const noPrivate = (k, v) => k && k[0] === '_' ? undefined : v;

  /* ---------- the parts of a lesson ---------- */
  /** What a theory block says, as text (the search reads it; the record's snippet is cut from it). */
  function blockText(b, media = {}) {
    if (!b || typeof b !== 'object') return '';
    switch (b.t) {
      case 'p': return plain(b.text);
      case 'list': return (b.items || []).map(plain).join(' · ');
      case 'code': return [b.caption ? plain(b.caption) : '', String(b.code || '')].filter(Boolean).join(' — ');
      case 'diagram': return [plain(b.caption), String(b.text || '')].filter(Boolean).join(' — ');
      case 'table': return [plain(b.caption), (b.head || []).map(plain).join(' | '), ...(b.rows || []).map(r => (r || []).map(plain).join(' | '))].filter(Boolean).join(' · ');
      case 'callout': return [plain(b.title), plain(b.text)].filter(Boolean).join(': ');
      case 'compare': return (b.items || []).map(i => plain(i.title) + ': ' + (i.points || []).map(plain).join('; ')).join(' · ');
      case 'flow': return [(b.items || []).map(plain).join(' → '), plain(b.caption)].filter(Boolean).join(' — ');
      case 'reveal': return [plain(b.label), plain(b.text)].filter(Boolean).join(' — ');
      case 'ask': return [plain(b.title), ...(b.questions || []).map(plain)].filter(Boolean).join(' · ');
      case 'terms': return (b.items || []).map(t => plain(t.term) + ': ' + plain(t.def)).join(' · ');
      case 'figure': { const m = media[b.media] || {}; return [plain(b.caption), plain(m.alt), ...(m.labels || m.parts || []).map(x => plain(typeof x === 'string' ? x : x?.label || x?.name || ''))].filter(Boolean).join(' · '); }
    }
    return '';
  }
  /** Stable ids for the blocks of one section: from what each block holds (the same text keeps its id when the pack is
      rebuilt or patched), a second identical block gets "-2". engine/src/40_views.js gives the same ids to the page. */
  function blockIds(blocks) {
    const seen = {};
    return (blocks || []).map(b => { let id = 'b' + hash36((b?.t || '') + '|' + JSON.stringify(b, noPrivate).slice(0, 6000)); if (seen[id]) id += '-' + (++seen[id]); else seen[id] = 1; return id; });
  }
  const trapId = p => 'p' + hash36(plain(p?.title) + '|' + plain(p?.text).slice(0, 200));
  const cardKey = (c, f, i) => f.id || f._key || c.id + '#' + i;   // as the decks key them (engine/src/50_sources.js)
  /** A theory block's kind as the results name it (one group "Theory", its kind on each result). */
  const BLOCK_KIND = { p: 'paragraph', list: 'list', code: 'code', diagram: 'diagram', table: 'table', callout: 'note', compare: 'comparison', flow: 'process', reveal: 'question', ask: 'questions', terms: 'terms', figure: 'figure' };

  /* ---------- records ---------- */
  /** rec(type, world, key, title, fields [[name, text], …], href, extra) — fields keep their order: the first that matches names the result. */
  function rec(o) { o.f = (o.f || []).filter(x => x && x[1] && String(x[1]).trim()).map(([n, t]) => [n, String(t).slice(0, 20000)]); return o; }

  /** A subject's pack → its subject, chapters, sections, theory blocks, exercises, cards, traps, drills and sources. */
  function fromPack(pack, meta = {}) {
    const out = [], sid = meta.id || pack?.subject?.id, subj = { ...(pack?.subject || {}), ...meta }, title = subj.title || sid;
    if (!sid || !pack) return out;
    const media = pack.media || {}, base = { w: 'know', sj: sid };
    const sp = [title];
    out.push(rec({ ...base, ty: 'subject', k: `s:${sid}`, ti: title, f: [['title', title], ['description', plain(subj.description)]], h: '#/subject', pa: [] }));
    for (const c of pack.chapters || []) {
      const cp = [title, `${c.num ? c.num + '. ' : ''}${c.title}`];
      out.push(rec({ ...base, ty: 'chapter', k: `s:${sid}:ch:${c.id}`, ti: c.title, f: [['title', c.title], ['subtitle', plain(c.subtitle)], ['objectives', (c.objectives || []).map(plain).join(' · ')], ['mantra', plain(c.mantra)]], h: '#/ch/' + c.id, pa: sp, x: { ch: c.id, n: c.num } }));
      for (const s of c.sections || []) {
        out.push(rec({ ...base, ty: 'section', k: `s:${sid}:s:${s.id}`, ti: s.title, f: [['title', s.title], ['hook', plain(s.hook)]], h: '#/s/' + s.id, pa: cp, x: { ch: c.id, sec: s.id } }));
        const ids = blockIds(s.blocks), secPath = [...cp, s.title];
        (s.blocks || []).forEach((b, i) => {
          const text = blockText(b, media); if (!text) return;
          const kind = BLOCK_KIND[b.t] || 'paragraph', head = b.t === 'callout' || b.t === 'reveal' || b.t === 'ask' ? plain(b.title || b.label) : b.caption ? plain(b.caption) : '';
          out.push(rec({ ...base, ty: 'theory', k: `s:${sid}:b:${s.id}:${ids[i]}`, ti: head || s.title, f: [[kind, text]], h: `#/s/${s.id}/${ids[i]}`, pa: secPath, x: { ch: c.id, sec: s.id, bt: kind, bid: ids[i] },
            ex: b.t === 'terms' ? (b.items || []).map(t => plain(t.term)) : undefined }));
        });
      }
      const exN = {}; (c.exercises || []).forEach((e, i) => { exN[e.id] = i + 1; });
      for (const e of c.exercises || []) {
        const opts = Array.isArray(e.options) ? e.options.map(o => typeof o === 'string' ? plain(o) : plain(o?.text || o?.label || '')).filter(Boolean).join(' · ') : '';
        const items = Array.isArray(e.items) ? e.items.map(o => typeof o === 'string' ? plain(o) : plain(o?.text || o?.label || '')).filter(Boolean).join(' · ') : '';
        const sec = (c.sections || []).find(s => s.id === e.section);
        out.push(rec({ ...base, ty: 'exercise', k: `s:${sid}:ex:${e.id}`, ti: plain(e.q || e.prompt || e.id).slice(0, 140), f: [['question', plain(e.q || e.prompt)], ['options', opts || items]], h: '#/ex/' + encodeURIComponent(e.id), pa: sec ? [...cp, sec.title] : cp,
          x: { ch: c.id, sec: e.section || null, exid: e.id, n: exN[e.id], et: e.type, tags: e.tags || [] } }));
      }
      (c.flashcards || []).forEach((f, i) => {
        const key = cardKey(c, f, i);
        out.push(rec({ ...base, ty: 'card', k: `s:${sid}:fc:${key}`, ti: plain(f.q).slice(0, 140), f: [['front', plain(f.q)], ['back', plain(f.a)]], h: '#/cards/' + encodeURIComponent(key), pa: cp, x: { ch: c.id, sec: f.section || null, card: key } }));
      });
      for (const p of c.pitfalls || []) {
        const pid = trapId(p);
        out.push(rec({ ...base, ty: 'trap', k: `s:${sid}:tr:${c.id}:${pid}`, ti: plain(p.title), f: [['title', plain(p.title)], ['text', plain(p.text)], ['fix', plain(p.fix)]], h: `#/ch/${c.id}/traps/${pid}`, pa: cp, x: { ch: c.id, trap: pid } }));
      }
      for (const d of c.debug || []) {
        out.push(rec({ ...base, ty: 'drill', k: `s:${sid}:dr:${d.id}`, ti: plain(d.title), f: [['title', plain(d.title)], ['symptom', plain(d.symptom)], ['steps', [...(d.askYourself || []), ...(d.steps || [])].map(x => plain(typeof x === 'string' ? x : x?.text || x?.do || '')).join(' · ')]],
          h: '#/drill/' + encodeURIComponent(d.id), pa: cp, x: { ch: c.id, drill: d.id } }));
      }
    }
    for (const s of pack.sources?.sources || []) {
      out.push(rec({ ...base, ty: 'source', k: `s:${sid}:src:${s.id}`, ti: plain(s.title || s.name || s.file || s.id), f: [['title', plain(s.title || s.name || '')], ['file', plain(s.file || s.path || '')], ['description', plain(s.description || s.note || '')]], h: '#/subject/sources', pa: sp, x: { src: s.id } }));
    }
    return out;
  }

  /** A Roadmap → the Roadmap and its stations (title, what it teaches, learning goals, planned chapters). */
  function fromCurriculum(c) {
    const out = []; if (!c?.id) return out;
    const title = c.title || c.goal || c.id, base = { w: 'know', cu: c.id };
    out.push(rec({ ...base, ty: 'roadmap', k: `c:${c.id}`, ti: title, f: [['title', title], ['goal', c.goal !== title ? plain(c.goal) : ''], ['description', plain(c.description || c.scope)]], h: '#/map/' + encodeURIComponent(c.id), pa: [] }));
    for (const [nid, n] of Object.entries(c.nodes || {})) {
      const chapters = (n.chapters || []).map(ch => [ch.title, ...(ch.goals || []), ...(ch.coverage || [])].map(plain).filter(Boolean).join(': ')).join(' · ');
      out.push(rec({ ...base, ty: 'station', k: `c:${c.id}:n:${nid}`, ti: plain(n.title), f: [['title', plain(n.title)], ['summary', plain(n.summary)], ['goals', (n.learningGoals || []).map(plain).join(' · ')], ['chapters', chapters]],
        h: '#/map/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(nid), pa: [title], x: { node: nid, pack: n.pack?.status === 'ready' ? n.pack.id : null } }));
    }
    return out;
  }

  /** A language course (its data, as the course pack holds it) → words, meanings, grammar, lessons, fields, sentences, phenomena. */
  function fromLangCourse(data, meta = {}) {
    const out = []; if (!data?.course) return out;
    const co = meta.courseId || data.course.id, ct = meta.title || data.course.title || co, base = { w: 'lang', co }, H = p => `#/lang/${encodeURIComponent(co)}/${p}`;
    const concepts = {}, fieldOf = {};
    for (const f of data.fields || []) for (const c of f.concepts || []) { concepts[c.id] = c; fieldOf[c.id] = f; }
    const nameOf = code => data.langs?.[code]?.language?.name || code;
    const gloss = id => plain(concepts[id]?.gloss || id);
    const wordsOf = {};   // concept → [lemma (lang)]
    for (const [code, L] of Object.entries(data.langs || {})) {
      const nm = nameOf(code);
      for (const [nid, node] of Object.entries(L.lexicon || {})) for (const x of node?.lexemes || []) {
        if (!x?.id) continue;
        const forms = [...new Set(Object.values(x.forms || {}).flat().map(String))].filter(f => f && f !== x.lemma);
        const spoken = [x.translit, x.pinyin, x.pinyin ? toneNumbers(x.pinyin) : '', x.trad && x.trad !== x.lemma ? x.trad : ''].filter(Boolean);
        const means = (x.senses || []).map(gloss);
        for (const s of x.senses || []) (wordsOf[s] = wordsOf[s] || []).push(`${x.lemma} (${code})`);
        out.push(rec({ ...base, ty: 'word', k: `l:${co}:w:${x.id}`, ti: x.lemma + (x.translit || x.pinyin ? ` · ${x.translit || x.pinyin}` : ''), lg: [code],
          f: [['word', x.lemma], ['forms', forms.join(' · ')], ['reading', spoken.join(' · ')], ['meanings', means.join(' · ')]],
          ex: [x.lemma, ...forms, ...spoken], h: H(`w/${code}/${encodeURIComponent(x.id)}`), pa: [ct, nm], x: { lex: x.id, pos: x.pos, senses: x.senses || [], node: nid } }));
      }
      for (const [i, s] of (L.bank || []).entries()) {
        if (!s?.text) continue;
        const fn = (s.functions || [])[0], first = (s.tokens || []).find(t => t.l && !t.p);
        out.push(rec({ ...base, ty: 'sentence', k: `l:${co}:s:${s.id || code + i}`, ti: s.text, lg: [code], f: [['sentence', s.text], ['translation', plain(s.gloss)], ['reading', s.translit || s.pinyin || '']],
          h: fn ? H(`fn/${encodeURIComponent(fn)}/${code}`) : first ? H(`w/${code}/${encodeURIComponent(first.l)}`) : H(''), pa: [ct, nm], x: { level: s.level || null } }));
      }
      for (const p of data.world?.phenomena?.[code] || []) {
        out.push(rec({ ...base, ty: 'phenomenon', k: `l:${co}:p:${p.id}`, ti: plain(p.title), lg: [code], f: [['title', plain(p.title)], ['text', plain(p.what)], ['examples', (p.examples || []).map(e => [e.text, e.translit, e.note].filter(Boolean).join(' ')).join(' · ')]],
          h: H(`peculiar/${code}`), pa: [ct, nm], x: { area: p.area || null } }));
      }
    }
    for (const [id, c] of Object.entries(concepts)) {
      const f = fieldOf[id];
      out.push(rec({ ...base, ty: 'meaning', k: `l:${co}:c:${id}`, ti: gloss(id), lg: [...new Set((wordsOf[id] || []).map(w => w.slice(w.lastIndexOf('(') + 1, -1)))], f: [['meaning', gloss(id)], ['words', (wordsOf[id] || []).join(' · ')]],
        ex: [gloss(id)], h: H(`c/${encodeURIComponent(id)}`), pa: [ct, f ? plain(f.title) : ''].filter(Boolean), x: { concept: id, field: f?.field || null } }));
    }
    for (const fn of data.functions || []) {
      const per = Object.entries(data.langs || {}).filter(([, L]) => L.grammar?.[fn.id]?.summary).map(([code, L]) => [code, L.grammar[fn.id]]);
      out.push(rec({ ...base, ty: 'grammar', k: `l:${co}:g:${fn.id}`, ti: plain(fn.title), lg: per.map(([code]) => code), f: [['title', plain(fn.title)], ...per.map(([code, g]) => ['summary:' + code, plain(g.summary)])],
        h: H(`fn/${encodeURIComponent(fn.id)}`), pa: [ct], x: { fn: fn.id, level: fn.level || null } }));
    }
    for (const n of data.nodes || []) {
      const lesson = n.kind === 'lesson';
      out.push(rec({ ...base, ty: 'lesson', k: `l:${co}:n:${n.id}`, ti: plain(n.title), f: [['title', plain(n.title)], ['meanings', (n.concepts || []).slice(0, 80).map(gloss).join(' · ')]],
        h: H(`${lesson ? 'lesson' : 'node'}/${encodeURIComponent(n.id)}`), pa: [ct], x: { node: n.id, field: n.field || null, step: n.step ?? null, stage: n.stage || null } }));
    }
    for (const f of data.fields || []) out.push(rec({ ...base, ty: 'field', k: `l:${co}:f:${f.field}`, ti: plain(f.title), f: [['title', plain(f.title)]], h: H(`field/${encodeURIComponent(f.field)}`), pa: [ct], x: { field: f.field } }));
    return out;
  }

  /** The conversations with the character (engine/convos.js records) → one record each: its title, what was said, its
      style (mode) and where it began (context + origin: the button and the exact paragraph, table, exercise, card …). */
  function fromConvos(list) {
    const out = [];
    for (const r of list || []) {
      if (!r?.id || r.deleted || !r.messages?.length) continue;
      const say = r.messages.map(m => String(m.content || '').replace(/<noema-state>[\s\S]*?<\/noema-state>/g, '')).join(' \n ').slice(0, 30000);
      const first = String(r.messages.find(m => m.role === 'user')?.content || '').replace(/\s+/g, ' ').slice(0, 80);
      const cx = r.context || {}, o = cx.origin || {};
      // the language tutor (engine/langui.js) files its conversations under the subject "lang:<course>"
      const lc = /^lang:(.+)$/.exec(r.subject?.id || '')?.[1] || null;
      out.push(rec({ w: o.world || (lc || cx.type === 'lang' ? 'lang' : 'know'), ty: 'convo', k: `v:${r.id}`, ti: r.title || first || r.id, sj: lc ? null : r.subject?.id || null, co: o.course || lc, lg: lc && /^[a-z]{2,3}(-[A-Za-z]+)?:/.test(cx.id || '') ? [cx.id.split(':')[0]] : undefined,
        f: [['title', r.title || ''], ['said', plain(say)]], h: 'convo:' + r.id, pa: [r.subject?.title || ''].filter(Boolean),
        x: { id: r.id, kind: r.kind || 'tutor', mode: r.mode || null, ctx: cx.type || 'course', ctxId: cx.id || null, label: cx.label || null, sec: cx.sectionId || null, ch: cx.chapterId || null, origin: o, at: r.updatedAt || r.createdAt || null, n: r.messages.length } }));
    }
    return out;
  }

  /* ---------- the index ---------- */
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
    for (const l of byType.values()) l.sort((a, b) => b.score - a.score || String(a.r.ti).localeCompare(String(b.r.ti)));
    exact.sort((a, b) => (a.r.ty === 'word' ? 0 : 1) - (b.r.ty === 'word' ? 0 : 1) || b.score - a.score);
    const groups = ORDER.filter(t => byType.has(t)).map(t => [t, byType.get(t)]);
    return { exact: exact.slice(0, 6), groups, total, q: qf, toks };
  }
  /** The snippet of one result (computed only for the results shown). */
  function snip(res, q) {
    const qf = fold(q).trim(), first = qf.split(' ').filter(Boolean)[0] || qf, [name, text] = res.r.f[res.fi] || res.r.f[0] || ['', ''];
    return { field: name, ...snippet(text, first, res.at, first.length) };
  }

  /* ---------- storage: one entry per source and account, on this device ---------- */
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!root.indexedDB) return rej(new Error('IndexedDB unavailable'));
        const r = indexedDB.open('noema-lite-search', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('src')) r.result.createObjectStore('src'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error);
      });
    },
    async all(prefix) { const d = await this.open(); return new Promise((res, rej) => { const out = []; const q = d.transaction('src').objectStore('src').openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return res(out); if (String(c.key).startsWith(prefix)) out.push([c.key, c.value]); c.continue(); }; q.onerror = () => rej(q.error); }); },
    async put(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('src', 'readwrite'); t.objectStore('src').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(k) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('src', 'readwrite'); t.objectStore('src').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  const strip = recs => recs.map(r => { const o = {}; for (const k in r) if (k[0] !== '_') o[k] = r[k]; return o; });

  /** The index of one account: what is in memory now, and the background job that brings every source up to date.
      sources(): [{ key, sig, label, build: async () => records }] — given by the app (engine/search.js knows where
      packs, Roadmaps, courses and conversations come from). */
  function Index(acc, sources) {
    const mem = new Map();   // source key → { sig, recs }
    let loaded = null, running = null;
    const listeners = new Set();
    const state = { done: 0, total: 0, busy: false, label: '' };
    const emit = () => listeners.forEach(f => { try { f(state); } catch (e) { } });
    async function load() {
      if (!loaded) loaded = DB.all(acc + '|').then(list => { for (const [k, v] of list) if (v?.schema === SCHEMA) mem.set(k.slice(acc.length + 1), { sig: v.sig, recs: v.recs || [] }); changed(); }).catch(() => { });
      return loaded;
    }
    /** Bring every source up to date: the ones that changed are rebuilt one by one, the results grow as they come. */
    function refresh() {
      if (running) return running;
      running = (async () => {
        await load();
        let list = []; try { list = await sources(); } catch (e) { console.warn('[search] sources', e); }
        const want = new Set(list.map(s => s.key));
        for (const k of [...mem.keys()]) if (!want.has(k)) { mem.delete(k); changed(); DB.del(acc + '|' + k).catch(() => { }); }
        const stale = list.filter(s => mem.get(s.key)?.sig !== s.sig);
        Object.assign(state, { done: 0, total: stale.length, busy: !!stale.length, label: '' }); emit();
        for (const s of stale) {
          state.label = s.label || s.key; emit();
          try {
            const recs = await s.build();
            if (recs) { mem.set(s.key, { sig: s.sig, recs }); changed(); if (s.store !== false) DB.put(acc + '|' + s.key, { schema: SCHEMA, sig: s.sig, at: Date.now(), recs: strip(recs) }).catch(e => console.warn('[search] store', e)); }
          } catch (e) { console.warn('[search] could not index', s.key, e); }
          state.done++; emit();
          await new Promise(r => setTimeout(r, 0));
        }
        state.busy = false; state.label = ''; emit();
      })().finally(() => { running = null; });
      return running;
    }
    let all = null, keys = null;   // the records of every source together, and by key (made again when a source changes)
    const changed = () => { all = null; keys = null; };
    const records = () => { if (!all) { all = []; for (const v of mem.values()) for (const r of v.recs) all.push(r); } return all; };
    const byKey = k => { if (!keys) { keys = new Map(); for (const r of records()) keys.set(r.k, r); } return keys.get(k) || null; };
    return { load, refresh, records, byKey, state, on: f => { listeners.add(f); return () => listeners.delete(f); }, forget: key => { mem.delete(key); changed(); return DB.del(acc + '|' + key).catch(() => { }); } };
  }

  root.NoemaCatalog = { SCHEMA, TYPES, ORDER, BLOCK_KIND, fold, foldMap, toneNumbers, plain, hash36, blockText, blockIds, trapId, fromPack, fromCurriculum, fromLangCourse, fromConvos, search, snip, prep, Index, DB };
})(typeof window !== 'undefined' ? window : globalThis);
