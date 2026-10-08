/* noema-lite · langcore — the runtime of the language courses (docs/LANGUAGES.md §5, §7).
   Pure JavaScript: no DOM, no storage, no network. The same file runs in the app, in Node (tests) and in the connector.
   The Python twin of the shared helpers is tools/langlib.py; both are checked against tests/fixtures/lang-vectors.json.

   Overview
     NoemaLang.readCourse(read, list)   → course data from a folder (read(rel) → JSON, list(relDir) → [file names])
     NoemaLang.course(data)             → C, the indexed course (concepts, nodes, lexemes, sentences, form index per language)
     NoemaLang.newLearner(C, settings)  → L, the learner state (plain JSON; stored per node by toKV / fromKV)
     review(C, L, lang, lexId, track, grade, day)     one answer → the spaced-repetition state of one track
     itemState / nodeState / nodeStates / known / functionState / feasibility / selectSentences / tokenize / analyze / planSession
*/
(function (root) {
  'use strict';
  const nfc = s => String(s == null ? '' : s).normalize('NFC');

  /* ---------- feature cells ---------- */
  const cellParts = c => String(c || '').split(';').filter(Boolean);
  const canon = c => { const p = cellParts(c); return p.length ? [p[0], ...p.slice(1).sort()].join(';') : ''; };
  const cellHas = (c, tags) => { const p = cellParts(c); return tags.every(t => p.includes(t)); };

  /* ---------- vowel marks ---------- */
  const inRange = (o, a, b) => o >= a && o <= b;
  const AR_MARK = o => inRange(o, 0x064B, 0x0652) || o === 0x0670;
  const HE_MARK = o => inRange(o, 0x0591, 0x05BD) || o === 0x05BF || o === 0x05C1 || o === 0x05C2 || o === 0x05C4 || o === 0x05C5 || o === 0x05C7;
  const markTest = lang => lang === 'ar' ? AR_MARK : lang === 'he' ? HE_MARK : () => false;
  function stripMarks(lang, s) {
    const t = markTest(lang); let out = '';
    for (const ch of nfc(s)) if (!t(ch.codePointAt(0))) out += ch;
    return lang === 'ar' ? out.replace(/\u0671/g, '\u0627') : out;
  }
  const hasMarks = (lang, s) => { const t = markTest(lang); for (const ch of String(s)) if (t(ch.codePointAt(0))) return true; return false; };

  /* ---------- Chinese ---------- */
  const isHan = ch => { const o = ch.codePointAt(0); return inRange(o, 0x4E00, 0x9FFF) || inRange(o, 0x3400, 0x4DBF) || inRange(o, 0x20000, 0x2EBEF) || inRange(o, 0xF900, 0xFAFF); };
  const TONE = { 'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4], 'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4], 'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4], 'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4] };
  const MARK_OF = {}; for (const [m, [v, t]] of Object.entries(TONE)) MARK_OF[v + t] = m;
  const FINALS = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er', 'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing',
    'iong', 'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng', 'ü', 'üe', 'üan', 'ün', 'ue'];
  const SYL = new RegExp('^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(' + [...FINALS].sort((a, b) => b.length - a.length).join('|') + ')$');
  const pinyinSplit = s => nfc(s).trim().toLowerCase().split(/[\s']+/).filter(Boolean);
  function pinyinTone(syl) {
    let base = '', tone = 5;
    for (const ch of nfc(syl).toLowerCase()) {
      if (TONE[ch]) { if (tone !== 5) return 'two tone marks'; base += TONE[ch][0]; tone = TONE[ch][1]; }
      else base += ch === 'v' ? 'ü' : ch;
    }
    return [base, tone];
  }
  function markPosition(base) {
    for (const v of 'ae') if (base.includes(v)) return base.indexOf(v);
    if (base.includes('ou')) return base.indexOf('o');
    for (let i = base.length - 1; i >= 0; i--) if ('iouü'.includes(base[i])) return i;
    return -1;
  }
  function pinyinSyllableErrors(syl) {
    const r = pinyinTone(syl);
    if (typeof r === 'string') return [`“${syl}”: ${r}`];
    const [base, tone] = r, m = base.match(SYL);
    if (!m) return [`“${syl}” is not a pinyin syllable`];
    const ini = m[1] || '', fin = m[2], err = [];
    if (['j', 'q', 'x'].includes(ini) && !(fin[0] === 'i' || fin[0] === 'u')) err.push(`“${syl}”: j/q/x go only with i or u (= ü)`);
    if (['j', 'q', 'x', 'y'].includes(ini) && fin[0] === 'ü') err.push(`“${syl}”: after ${ini} write u, not ü`);
    if (['g', 'k', 'h', 'f', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(ini) && ((fin[0] === 'i' && fin !== 'i') || fin[0] === 'ü')) err.push(`“${syl}”: impossible after ${ini}`);
    if (['g', 'k', 'h', 'f'].includes(ini) && fin === 'i') err.push(`“${syl}”: impossible after ${ini}`);
    if (fin === 'er' && ini) err.push(`“${syl}”: er takes no initial`);
    if (!ini && !['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'er'].includes(fin)) err.push(`“${syl}”: write it with y- or w-`);
    if (tone !== 5) {
      const want = markPosition(base), got = [...nfc(syl).toLowerCase()].findIndex(ch => TONE[ch]);
      if (want !== got) err.push(`“${syl}”: the tone mark belongs on “${base[want]}”`);
    }
    return err;
  }
  function pinyinNumbersToMarks(s) {
    return pinyinSplit(s).map(syl => {
      const m = syl.match(/^([a-zü:v]+)([0-5])?$/);
      if (!m) return syl;
      const base = m[1].replace(/u:/g, 'ü').replace(/v/g, 'ü'), t = +(m[2] || 5);
      if (t === 0 || t === 5) return base;
      const i = markPosition(base);
      return i >= 0 ? base.slice(0, i) + MARK_OF[base[i] + t] + base.slice(i + 1) : base;
    }).join(' ');
  }
  const pinyinMarksToNumbers = s => pinyinSplit(s).map(syl => { const r = pinyinTone(syl); return typeof r === 'string' ? syl : r[0] + r[1]; }).join(' ');

  /* ---------- sentences ---------- */
  function joinTokens(tokens, how) {
    let out = '', glueNext = true;
    for (const k of tokens) {
      if (how === 'none' || !out || glueNext || k.p === true) out += k.t; else out += ' ' + k.t;
      glueNext = k.p === 'open';
    }
    return out;
  }
  const capFirst = s => s.slice(0, 1).toUpperCase() + s.slice(1);
  const decapFirst = s => s.slice(0, 1).toLowerCase() + s.slice(1);

  /* ---------- reading a course folder ---------- */
  /** read(rel) → parsed JSON or null; list(relDir) → file names. Layout: docs/LANGUAGES.md §4.1. */
  function readCourse(read, list) {
    const course = read('course.json');
    const data = { course, fields: list('core/fields').map(f => read('core/fields/' + f)), nodes: read('core/nodes.json').nodes,
      functions: list('core/functions').map(f => read('core/functions/' + f)), frames: (read('core/frames.json') || {}).frames || [], langs: {} };
    for (const code of course.languages) {
      const base = `lang/${code}/`, lexicon = {}, grammar = {};
      for (const n of data.nodes) { const f = read(`${base}lexicon/${n.id}.json`); if (f) lexicon[n.id] = f; }   // a node without its file is not prepared yet
      for (const f of data.functions) { const g = read(`${base}grammar/${f.id}.json`); if (g) grammar[f.id] = g; }
      const bank = []; for (const f of list(`${base}bank`)) bank.push(...((read(`${base}bank/${f}`) || {}).sentences || []));
      data.langs[code] = { language: read(base + 'language.json'), lexicon, grammar, bank };
    }
    return data;
  }

  /* ---------- the indexed course ---------- */
  function course(data) {
    const C = { data, id: data.course.id, explainLang: data.course.explainLang || 'en', languages: data.course.languages.slice(),
      concepts: {}, nodes: {}, order: [], owner: {}, functions: {}, frames: {}, lang: {} };
    for (const f of data.fields) for (const c of f.concepts) C.concepts[c.id] = { ...c, field: f.field };
    for (const n of data.nodes) { C.nodes[n.id] = n; for (const c of n.concepts) C.owner[c] = n.id; }
    // topological order (prerequisites first, stable by file order)
    const seen = {}; const visit = id => { if (seen[id]) return; seen[id] = 1; for (const p of C.nodes[id].prereqs || []) if (C.nodes[p]) visit(p); C.order.push(id); };
    data.nodes.forEach(n => visit(n.id));
    for (const f of data.functions) C.functions[f.id] = f;
    for (const f of data.frames) C.frames[f.id] = f;
    for (const code of C.languages) {
      const src = data.langs[code], X = { code, language: src.language || {}, lex: {}, byNode: {}, byConcept: {}, absent: {}, grammar: src.grammar || {}, prepared: {},
        sentences: [], sentenceById: {}, forms: new Map(), prefixes: [], maxWord: 1, maxWords: 1 };
      for (const nid of Object.keys(C.nodes)) {
        X.prepared[nid] = !!src.lexicon[nid];
        const file = src.lexicon[nid] || { lexemes: [], absent: [] };
        X.byNode[nid] = [];
        for (const x of file.lexemes || []) {
          const lx = { ...x, node: nid }; X.lex[x.id] = lx; X.byNode[nid].push(x.id);
          for (const s of x.senses || []) (X.byConcept[s] = X.byConcept[s] || []).push(x.id);
        }
        for (const a of file.absent || []) X.absent[a.concept] = a;
      }
      // form index: every form (and the lemma of invariant words) → [{l, f}]; unvocalized spellings too (ar, he)
      const add = (form, l, f) => {
        for (const k of new Set([nfc(form), stripMarks(code, form)])) {
          if (!k) continue;
          const arr = X.forms.get(k) || []; if (!arr.some(m => m.l === l && m.f === f)) arr.push({ l, f }); X.forms.set(k, arr);
          X.maxWord = Math.max(X.maxWord, [...k].length); X.maxWords = Math.max(X.maxWords, k.split(' ').length);
        }
      };
      for (const lx of Object.values(X.lex)) {
        const forms = lx.forms || {};
        if (Object.keys(forms).length) for (const [c, f] of Object.entries(forms)) add(f, lx.id, c); else { add(lx.lemma, lx.id, null); for (const a of lx.alts || []) add(a, lx.id, null); }
        for (const [c, f] of Object.entries(lx.plene || {})) add(f, lx.id, c);   // he: the full unvocalized spelling (ktiv male)
        if (lx.prefix) for (const p of [lx.lemma, ...(lx.alts || [])]) X.prefixes.push({ t: nfc(p), plain: stripMarks(code, p), l: lx.id });   // וְ and its spellings וּ, וַ …
      }
      X.prefixes.sort((a, b) => b.t.length - a.t.length);
      for (const s of src.bank || []) {
        const req = new Set();
        const walk = ks => ks.forEach(k => { if (k.parts) walk(k.parts); else if (!k.p && k.l) req.add(k.l); });
        walk(s.tokens || []);
        const S = { ...s, req: [...req] }; X.sentences.push(S); X.sentenceById[s.id] = S;
      }
      C.lang[code] = X;
    }
    return C;
  }

  /* ---------- the learner ---------- */
  function newLearner(C, settings = {}) {
    const L = { course: C.id, settings: { languages: settings.languages || C.languages.slice(), depth: { ...(C.data.course.defaults?.depth || {}), ...(settings.depth || {}) },
      batch: settings.batch || C.data.course.defaults?.batch || 12 }, langs: {} };
    for (const code of C.languages) L.langs[code] = { items: {}, fns: {} };
    return L;
  }
  const ensureLang = (L, code) => (L.langs[code] = L.langs[code] || { items: {}, fns: {} });

  /* ---------- spaced repetition (SM-2, day granularity), two tracks per item ---------- */
  const GRADE = { true: 4, false: 1, again: 1, hard: 3, good: 4, easy: 5 };
  function sm2(t, grade, day) {
    const q = typeof grade === 'number' ? grade : GRADE[String(grade)];
    if (q == null) throw new Error('unknown grade ' + grade);
    const s = { reps: 0, ivl: 0, ease: 2.5, lapses: 0, streak: 0, due: day, ...(t || {}) };
    if (q < 3) { s.reps = 0; s.ivl = 1; s.streak = 0; if (t && t.reps > 0) s.lapses++; }
    else {
      s.reps++; s.streak++;
      s.ivl = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.max(s.ivl + 1, Math.round(s.ivl * s.ease));
    }
    s.ease = Math.max(1.3, +(s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)).toFixed(3));
    s.due = day + s.ivl; s.last = day;
    return s;
  }
  /** Mark an item as introduced (seen) without a review. */
  function introduce(C, L, code, lexId, day) {
    const it = ensureLang(L, code).items[lexId] = ensureLang(L, code).items[lexId] || {};
    if (it.seen == null) it.seen = day;
    return it;
  }
  /** One answer. track: 'r' (recognition) | 'p' (production); grade: true/false or again|hard|good|easy or 0–5. */
  function review(C, L, code, lexId, track, grade, day) {
    if (!C.lang[code]?.lex[lexId]) throw new Error(`unknown word ${lexId} in ${code}`);
    if (track !== 'r' && track !== 'p') throw new Error('track must be r or p');
    const it = introduce(C, L, code, lexId, day);
    it[track] = sm2(it[track], grade, day);
    return it;
  }

  /* ---------- states (always derived from the tracks — nothing to drift) ---------- */
  const ITEM_STATES = ['locked', 'ready', 'seen', 'learning', 'known_r', 'known_p', 'mastered'];
  const rank = s => ITEM_STATES.indexOf(s);
  const trackOk = (t, minIvl, minStreak) => !!t && t.ivl >= minIvl && t.streak >= minStreak;
  function itemState(C, L, code, lexId, nodeStates) {
    const it = L.langs[code]?.items[lexId];
    const ns = (nodeStates || {})[C.lang[code].lex[lexId].node];
    if (!it || (it.seen == null && !it.r && !it.p)) return ns && ns !== 'locked' ? 'ready' : 'locked';
    if (!it.r && !it.p) return 'seen';
    if (!trackOk(it.r, 3, 2)) return 'learning';
    if (!trackOk(it.p, 3, 2)) return 'known_r';
    if (!trackOk(it.p, 21, 1)) return 'known_p';
    return 'mastered';
  }
  const NODE_DONE = new Set(['known', 'mastered', 'skipped']);
  /** States of every node in one language: locked · open · learning · known · mastered · skipped (tier above the chosen depth)
      · unprepared (its words are not written yet in this language — it blocks what follows, like a locked node). */
  function nodeStates(C, L, code) {
    const X = C.lang[code], out = {}, depth = L.settings.depth?.[code] ?? 3;
    for (const nid of C.order) {
      const n = C.nodes[nid];
      if (n.kind === 'field' && n.tier > depth) { out[nid] = 'skipped'; continue; }
      if (!X.prepared[nid]) { out[nid] = 'unprepared'; continue; }
      if ((n.prereqs || []).some(p => !NODE_DONE.has(out[p]))) { out[nid] = 'locked'; continue; }
      const ids = X.byNode[nid] || [];
      if (!ids.length) { out[nid] = 'known'; continue; }                     // everything absent in this language: nothing to learn
      const st = ids.map(id => itemState(C, L, code, id, { [nid]: 'open' }));
      const share = s => st.filter(x => rank(x) >= rank(s)).length / st.length;
      if (st.every(x => x === 'ready')) out[nid] = 'open';
      else if (share('mastered') >= 0.9) out[nid] = 'mastered';
      else if (share('known_r') >= 0.9 && share('known_p') >= 0.7) out[nid] = 'known';
      else out[nid] = 'learning';
    }
    return out;
  }
  const nodeState = (C, L, code, nid) => nodeStates(C, L, code)[nid];
  /** The known sets of one language (§5.3): R = state ≥ learning, P = state ≥ known_r. Sets of lexeme ids. */
  function known(C, L, code) {
    const ns = nodeStates(C, L, code), R = new Set(), P = new Set(), state = {};
    for (const id of Object.keys(C.lang[code].lex)) {
      const s = state[id] = itemState(C, L, code, id, ns);
      if (rank(s) >= rank('learning')) R.add(id);
      if (rank(s) >= rank('known_r')) P.add(id);
    }
    return { R, P, state, nodes: ns };
  }
  /** The state of a concept in a language (for the flag dot): the best state of its words; 'absent' when the language has no word. */
  function conceptState(C, L, code, cid, k) {
    const X = C.lang[code];
    if (X.absent[cid]) return 'absent';
    const ids = X.byConcept[cid] || []; k = k || known(C, L, code);
    return ids.reduce((best, id) => rank(k.state[id]) > rank(best) ? k.state[id] : best, 'locked');
  }

  /* ---------- grammar functions ---------- */
  /** Record a block of answers on a function: n answers, c correct, on a day. */
  function practiceFunction(C, L, code, fid, correct, total, day) {
    const f = ensureLang(L, code).fns[fid] = ensureLang(L, code).fns[fid] || { log: [] };
    const last = f.log[f.log.length - 1];
    if (last && last.day === day) { last.c += correct; last.n += total; } else f.log.push({ day, c: correct, n: total });
    if (f.log.length > 60) f.log.splice(0, f.log.length - 60);
    return f;
  }
  /** new → practicing → solid (≥ 2 days, ≥ 10 answers, ≥ 80 % over the last two days) → mastered (≥ 3 days over ≥ 7 days, ≥ 85 % on each of the last three). */
  function functionState(C, L, code, fid) {
    const log = L.langs[code]?.fns[fid]?.log || [];
    if (!log.length) return 'new';
    const acc = e => e.n ? e.c / e.n : 0;
    const last3 = log.slice(-3), last2 = log.slice(-2);
    if (last3.length === 3 && last3[2].day - last3[0].day >= 7 && last3.every(e => acc(e) >= 0.85 && e.n >= 5)) return 'mastered';
    const n2 = last2.reduce((a, e) => a + e.n, 0), c2 = last2.reduce((a, e) => a + e.c, 0);
    if (last2.length === 2 && n2 >= 10 && c2 / n2 >= 0.8) return 'solid';
    return 'practicing';
  }

  /* ---------- the sentence bank ---------- */
  /** Sentences whose words are all known (or at most maxUnknown unknown). opts: {known: Set, functions: [ids] (all of them), frame, maxUnknown = 0, variants = true} */
  function selectSentences(C, code, opts = {}) {
    const X = C.lang[code], K = opts.known || new Set(), max = opts.maxUnknown || 0;
    return X.sentences.filter(s => {
      if (opts.frame && s.frame !== opts.frame) return false;
      if (opts.variants === false && s.variantOf) return false;
      if ((opts.functions || []).some(f => !(s.functions || []).includes(f))) return false;
      return s.req.filter(l => !K.has(l)).length <= max;
    }).map(s => ({ ...s, unknown: s.req.filter(l => !K.has(l)) }));
  }
  /** Can a function be trained now in this language? (§7.3) → {state: ready|thin|locked|absent, sentences, needs: {POS: [have, need]}, unlockBy: [node ids]} */
  function feasibility(C, L, code, fid, opts = {}) {
    const X = C.lang[code], g = X.grammar[fid], min = opts.minSentences || 12;
    if (!g) return { state: 'absent', reason: 'no realization file', sentences: 0, needs: {}, unlockBy: [] };
    if (g.status === 'absent') return { state: 'absent', reason: g.summary, sentences: 0, needs: {}, unlockBy: [] };
    const k = opts.k || known(C, L, code);
    const ok = selectSentences(C, code, { known: k.R, functions: [fid] });
    const needs = {}; let needsMet = true;
    for (const [pos, n] of Object.entries(g.needs || {})) {
      const have = [...k.R].filter(id => X.lex[id].pos === pos).length;
      needs[pos] = [have, n]; if (have < n) needsMet = false;
    }
    // which nodes would help most: the nodes of the missing words of the function's sentences, and of words of the needed parts of speech
    const votes = {};
    for (const s of selectSentences(C, code, { known: k.R, functions: [fid], maxUnknown: 99 })) for (const l of s.unknown) { const n = X.lex[l].node; votes[n] = (votes[n] || 0) + 1; }
    for (const [pos, [have, n]] of Object.entries(needs)) if (have < n) for (const lx of Object.values(X.lex)) if (lx.pos === pos && !k.R.has(lx.id)) votes[lx.node] = (votes[lx.node] || 0) + 1;
    const unlockBy = Object.keys(votes).filter(n => !['known', 'mastered'].includes(k.nodes[n])).sort((a, b) => votes[b] - votes[a] || C.order.indexOf(a) - C.order.indexOf(b));
    const state = !needsMet || !ok.length ? 'locked' : ok.length >= min ? 'ready' : 'thin';
    return { state, sentences: ok.length, needs, unlockBy };
  }

  /* ---------- reading text: form index, clitics, segmentation ---------- */
  const PUNCT = /^[\p{P}\p{S}]+$/u;
  function lookup(C, code, w) {
    const X = C.lang[code], lj = X.language, out = [];
    // every reading of the written word: as written, without vowel marks, and — at the start of a sentence — with a small first letter (Sie / sie)
    const tryWord = s => {
      const all = [];
      for (const k of new Set([s, stripMarks(code, s), ...(lj.capitalizeFirst ? [decapFirst(s)] : [])])) for (const m of X.forms.get(k) || []) if (!all.some(x => x.l === m.l && x.f === m.f)) all.push(m);
      return all.length ? all : null;
    };
    const direct = tryWord(nfc(w));
    if (direct) return { matches: direct };
    // prefix clitics (ar wa-/bi-…, he ve-/ha-/be-…): up to two, longest first
    const strip = (s, depth) => {
      if (depth > 2) return null;
      for (const p of X.prefixes) for (const pre of [p.t, p.plain]) {
        if (pre && s.startsWith(pre) && s.length > pre.length) {
          const rest = s.slice(pre.length).replace(/^\p{M}+/u, ''), m = tryWord(rest);   // the plain prefix letter may carry vowel marks of its own
          if (m) return [{ t: pre, matches: [{ l: p.l, f: null }] }, { t: rest, matches: m }];
          const deeper = strip(rest, depth + 1);
          if (deeper) return [{ t: pre, matches: [{ l: p.l, f: null }] }, ...deeper];
        }
      }
      return null;
    };
    const parts = strip(nfc(w), 1);
    return parts ? { matches: [], parts } : { matches: out };
  }
  /** Text → tokens [{t, p?, matches:[{l,f}], parts?, unknown?}]. Spaces split words; Chinese is segmented by longest match over the course words. */
  function tokenize(C, code, text) {
    const X = C.lang[code], out = [];
    const pushWord = w => { const r = lookup(C, code, w); out.push({ t: w, matches: r.matches, ...(r.parts ? { parts: r.parts } : {}), unknown: !r.matches.length && !r.parts }); };
    if (X.language.tokenJoin === 'none') {
      const chars = [...nfc(text)]; let i = 0;
      while (i < chars.length) {
        const ch = chars[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (PUNCT.test(ch)) { out.push({ t: ch, p: true, matches: [] }); i++; continue; }
        let hit = null;
        for (let n = Math.min(X.maxWord, chars.length - i); n >= 1; n--) { const w = chars.slice(i, i + n).join(''); if (X.forms.has(w)) { hit = w; break; } }
        if (hit) { out.push({ t: hit, matches: X.forms.get(hit) }); i += [...hit].length; }
        else { out.push({ t: ch, matches: [], unknown: true }); i++; }
      }
      return out;
    }
    // words with their punctuation split off; multi-word words (Rote Bete, תַּפּוּחַ אֲדָמָה) are matched first, longest first
    const items = [];
    for (const raw of nfc(text).split(/\s+/).filter(Boolean)) {
      const [, lead, core, trail] = raw.match(/^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u);
      items.push({ lead, core, trail });
    }
    for (let i = 0; i < items.length; i++) {
      for (const ch of items[i].lead) out.push({ t: ch, p: 'open', matches: [] });
      let used = 1;
      for (let n = Math.min(X.maxWords, items.length - i); n >= 2; n--) {
        const span = items.slice(i, i + n);
        if (span.slice(0, -1).some(x => x.trail) || span.slice(1).some(x => x.lead)) continue;   // punctuation inside: not one word
        const w = span.map(x => x.core).join(' '), r = lookup(C, code, w);
        if (r.matches.length) { out.push({ t: w, matches: r.matches }); used = n; break; }
      }
      if (used === 1 && items[i].core) pushWord(items[i].core);
      for (const ch of items[i + used - 1].trail) out.push({ t: ch, p: true, matches: [] });
      i += used - 1;
    }
    return out;
  }
  /** Check a text against the known words (§7.2): {tokens, unknown: [words not in the course], unlearned: [course words not known yet]} */
  function analyze(C, code, text, knownSet) {
    const tokens = tokenize(C, code, text), unknown = [], unlearned = [];
    for (const k of tokens) {
      if (k.p) continue;
      if (k.unknown) { unknown.push(k.t); continue; }
      const ls = k.parts ? k.parts.map(p => p.matches.map(m => m.l)) : [k.matches.map(m => m.l)];
      if (knownSet && ls.some(alts => !alts.some(l => knownSet.has(l)))) unlearned.push(k.t);
    }
    return { tokens, unknown, unlearned };
  }

  /* ---------- the word card: everything about one word, in depth (§4.6) ---------- */
  const ARTICLE = { MASC: 'der', FEM: 'die', NEUT: 'das' };
  /** The forms a learner memorizes with the word, per language: [[label, value], …] */
  function principalParts(C, code, lx) {
    const f = lx.forms || {}, get = c => { const k = Object.keys(f).find(x => canon(x) === canon(c)); return k ? f[k] : null; }, out = [];
    const G = { MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter' };
    if (code === 'de' && lx.pos === 'NOUN') { out.push(['article', ARTICLE[lx.gender] + ' ' + lx.lemma]); if (get('N;GEN;SG')) out.push(['genitive', (lx.gender === 'FEM' ? 'der ' : 'des ') + get('N;GEN;SG')]); if (get('N;NOM;PL')) out.push(['plural', 'die ' + get('N;NOM;PL')]); }
    else if (code === 'de' && lx.pos === 'VERB') { for (const [l, c] of [['er/sie/es', 'V;PRS;3;SG'], ['du', 'V;PRS;2;SG']]) if (get(c)) out.push([l, get(c)]); if (lx.aux) out.push(['perfect with', lx.aux]); }
    else if (lx.pos === 'NOUN' && lx.class === 'collective') { out.push(['collective', lx.lemma]); if (lx.unit) out.push(['one (unit noun)', lx.unit]); if (get('N;NOM;PL;INDF')) out.push(['counted plural', get('N;NOM;PL;INDF')]); }
    else if (code === 'he' && lx.pos === 'NOUN') { if (get('N;PL;INDF')) out.push(['plural', get('N;PL;INDF')]); if (get('N;SG;DEF')) out.push(['with the article', get('N;SG;DEF')]); }
    else if (lx.pos === 'VERB' && lx.root) { out.push(['root', lx.root]); if (lx.binyan) out.push(['binyan', lx.binyan]); if (lx.verbForm) out.push(['verb form', lx.verbForm]); }
    if (lx.gender && !(code === 'de' && lx.pos === 'NOUN')) out.push(['gender', G[lx.gender]]);
    if (lx.root && lx.pos !== 'VERB') out.push(['root', lx.root]);
    if (code === 'zh') { if (lx.pinyin) out.push(['pinyin', lx.pinyin.replace(/\s+/g, '')]); if (lx.trad && lx.trad !== lx.lemma) out.push(['traditional', lx.trad]); if (lx.measure) out.push(['measure word', lx.measure.join(' · ')]); }
    if (lx.translit && code !== 'zh') out.push(['transliteration', lx.translit]);
    return out;
  }
  /** → {lex, lemma, pos, parts, flags (the concept in every course language), meaning, register, examples (with their words checked against what the learner knows), sections} */
  function wordCard(C, L, code, lexId, opts = {}) {
    const X = C.lang[code], lx = X.lex[lexId];
    if (!lx) throw new Error(`unknown word ${lexId} in ${code}`);
    const p = lx.profile || {}, k = opts.k || known(C, L, code), concept = (lx.senses || [])[0] || null;
    const flags = concept
      ? C.languages.map(c => ({ lang: c, state: conceptState(C, L, c, concept), words: (C.lang[c].byConcept[concept] || []).map(id => ({ lex: id, lemma: C.lang[c].lex[id].lemma })), absent: C.lang[c].absent[concept] || null }))
      : [{ lang: code, state: k.state[lexId], words: [{ lex: lexId, lemma: lx.lemma }], absent: null }];
    const examples = (p.examples || []).map(e => {
      const a = analyze(C, code, e.text, k.R);
      return { ...e, plain: X.language.vowelMarks ? stripMarks(code, e.text) : e.text, unknown: a.unknown, unlearned: a.unlearned,
        senseDef: (p.senses || []).find(s => s.id === e.sense)?.def || '' };
    });
    const byRegister = {};
    for (const s of p.synonyms || []) for (const r of [].concat(s.register)) (byRegister[r] = byRegister[r] || []).push(s);
    const sec = (key, title, items) => (items && (Array.isArray(items) ? items.length : Object.keys(items).length)) ? { key, title, items } : null;
    const sections = [
      sec('senses', 'Meanings', p.senses),
      sec('examples', 'In sentences — contexts and registers', examples),
      sec('collocations', 'Goes with', p.collocations),
      sec('particleVerbs', 'Verbs built on it', p.particleVerbs),
      sec('phrases', 'Idioms, sayings and quotes', p.phrases),
      sec('synonyms', 'Synonyms by register', byRegister),
      sec('antonyms', 'Opposites', p.antonyms),
      sec('pitfalls', '⚠️ Watch out', p.pitfalls),
      sec('subtleties', 'Subtleties', p.subtleties),
      sec('etymology', 'Where it comes from', p.etymology ? [p.etymology] : []),
      sec('funFacts', 'Fun facts', p.funFacts),
    ].filter(Boolean);
    return { lex: lexId, lang: code, lemma: lx.lemma, pos: lx.pos, concept, gloss: concept ? C.concepts[concept]?.gloss : (lx.role || ''), parts: principalParts(C, code, lx),
      state: k.state[lexId], flags, frequency: p.frequency || null, status: p.status || null, register: [].concat(p.register || []), connotation: p.connotation || null,
      intensity: p.intensity ?? null, feeling: p.feeling || '', synonymsNone: p.synonymsNone || '', examples, sections, hasProfile: !!lx.profile };
  }

  /* ---------- the daily session (§7.5) ---------- */
  const SECONDS = { review: 8, learn: 40, grammar: 300, extra: 120 };
  /** → {steps: [{kind:'review', items:[{lang, lex, track}]}, {kind:'learn', node, concepts:[{concept, langs:[{lang, lex}]}]}, {kind:'grammar', lang, fn}], seconds} */
  function planSession(C, L, { day, minutes = 30, languages } = {}) {
    const langs = (languages || L.settings.languages).filter(c => C.lang[c]);
    let budget = minutes * 60; const steps = [];
    const K = {}; for (const c of langs) K[c] = known(C, L, c);
    // 1 · reviews due, grouped by concept across languages (the same idea in every language one after the other)
    const due = [];
    for (const c of langs) for (const [id, it] of Object.entries(L.langs[c]?.items || {})) for (const tr of ['r', 'p']) {
      const t = it[tr]; if (t && t.due <= day) due.push({ lang: c, lex: id, track: tr, due: t.due, concept: (C.lang[c].lex[id].senses || [])[0] || id });
    }
    due.sort((a, b) => a.due - b.due || (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0) || langs.indexOf(a.lang) - langs.indexOf(b.lang) || (a.track < b.track ? -1 : 1));
    const order = []; const byConcept = {};
    for (const d of due) { if (!byConcept[d.concept]) { byConcept[d.concept] = []; order.push(d.concept); } byConcept[d.concept].push(d); }
    const reviews = [];
    for (const cid of order) { const g = byConcept[cid]; if (budget < g.length * SECONDS.review) break; reviews.push(...g); budget -= g.length * SECONDS.review; }
    if (reviews.length) steps.push({ kind: 'review', items: reviews.map(({ lang, lex, track }) => ({ lang, lex, track })) });
    // 2 · a new batch: the first node (prerequisites first) still to learn in some language; its concepts in every language where it is open
    const batch = Math.max(1, L.settings.batch || 12);
    for (const nid of C.order) {
      if (budget < SECONDS.learn) break;
      const open = langs.filter(c => ['open', 'learning'].includes(K[c].nodes[nid]));
      if (!open.length) continue;
      const concepts = [];
      const n = C.nodes[nid];
      const cs = n.concepts.slice().sort((a, b) => { const A = C.concepts[a], B = C.concepts[b]; return (A.subgroup || '').localeCompare(B.subgroup || '') || A.tier - B.tier || A.rank - B.rank; });
      const pushConcept = (key, entries) => { if (entries.length && concepts.length < batch && budget >= SECONDS.learn) { concepts.push({ concept: key, langs: entries }); budget -= SECONDS.learn; } };
      for (const cid of cs) pushConcept(cid, open.flatMap(c => (C.lang[c].byConcept[cid] || []).filter(id => K[c].state[id] === 'ready').slice(0, 1).map(id => ({ lang: c, lex: id }))));
      for (const c of open) for (const id of C.lang[c].byNode[nid]) if (!(C.lang[c].lex[id].senses || []).length && K[c].state[id] === 'ready') pushConcept(id, [{ lang: c, lex: id }]);
      if (concepts.length) { steps.push({ kind: 'learn', node: nid, concepts }); break; }
    }
    // 3 · one grammar function: the first (by "after") that is ready or thin in some language and not mastered there
    if (budget >= SECONDS.grammar) {
      const fns = Object.keys(C.functions).sort((a, b) => (C.functions[a].after || []).length - (C.functions[b].after || []).length || a.localeCompare(b));
      outer: for (const fid of fns) for (const c of langs) {
        if (functionState(C, L, c, fid) === 'mastered') continue;
        const f = feasibility(C, L, c, fid, { k: K[c], minSentences: 1 });
        if (f.state === 'ready' || f.state === 'thin') { steps.push({ kind: 'grammar', lang: c, fn: fid, feasibility: f.state }); budget -= SECONDS.grammar; break outer; }
      }
    }
    return { day, steps, seconds: minutes * 60 - budget };
  }

  /* ---------- storage: one key per (language, node) and per (language, function) (§5.6) ---------- */
  function toKV(C, L) {
    const kv = { settings: L.settings };
    for (const [code, S] of Object.entries(L.langs)) {
      const X = C.lang[code]; if (!X) continue;
      for (const [id, it] of Object.entries(S.items)) { const n = X.lex[id]?.node; if (!n) continue; const k = `lang:${code}:node:${n}`; (kv[k] = kv[k] || { items: {} }).items[id] = it; }
      for (const [fid, f] of Object.entries(S.fns)) kv[`lang:${code}:fn:${fid}`] = f;
    }
    return kv;
  }
  function fromKV(C, kv) {
    const L = newLearner(C, kv.settings || {});
    for (const [k, v] of Object.entries(kv)) {
      let m = k.match(/^lang:([^:]+):node:(.+)$/);
      if (m && C.lang[m[1]]) { Object.assign(ensureLang(L, m[1]).items, v.items || {}); continue; }
      m = k.match(/^lang:([^:]+):fn:(.+)$/);
      if (m && C.lang[m[1]]) ensureLang(L, m[1]).fns[m[2]] = v;
    }
    return L;
  }

  const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

  const API = { version: 1, nfc, canon, cellParts, cellHas, stripMarks, hasMarks, isHan, pinyinSplit, pinyinTone, pinyinSyllableErrors,
    pinyinNumbersToMarks, pinyinMarksToNumbers, joinTokens, capFirst,
    readCourse, course, newLearner, introduce, review, sm2, itemState, nodeStates, nodeState, known, conceptState, ITEM_STATES,
    practiceFunction, functionState, selectSentences, feasibility, lookup, tokenize, analyze, planSession, toKV, fromKV, dayNumber, wordCard, principalParts };
  root.NoemaLang = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
