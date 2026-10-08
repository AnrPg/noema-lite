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
    const data = { course, typology: read('core/typology.json') || null, fields: list('core/fields').map(f => read('core/fields/' + f)), nodes: read('core/nodes.json').nodes,
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

  /* ---------- paths by language type (D10): which nodes apply to which language ---------- */
  const TYPES = ['isolating', 'agglutinating', 'fusional', 'polysynthetic'];
  const applies = (n, code, typ) => (!n.path || n.path === typ) && (!n.langs || n.langs.includes(code));
  /** The grammar a lesson teaches in one language: its list, or "*" + the type's + the language's (§4.4.1). */
  function lessonFunctions(C, code, nid) {
    const f = C.nodes[nid]?.functions || [];
    if (Array.isArray(f)) return f.slice();
    const out = []; for (const k of ['*', C.lang[code]?.typology, code]) for (const x of f[k] || []) if (!out.includes(x)) out.push(x);
    return out;
  }
  /** The languages grouped by the path of their type, in course order: [{path, langs}] (D10: a polyglot course moves group by group). */
  function pathGroups(C, langs) {
    const out = [];
    for (const c of (langs || C.languages)) {
      const t = C.lang[c]?.typology || null, g = out.find(x => x.path === t);
      if (g) g.langs.push(c); else out.push({ path: t, langs: [c] });
    }
    return out;
  }

  /** The stated parameters of a word (features, D14) as plain fields; a parameter stated as {none: why} is left out. */
  function facade(x) {
    const out = {};
    for (const [k, v] of Object.entries(x.features || {})) if (!(v && typeof v === 'object' && !Array.isArray(v) && 'none' in v)) out[k] = v;
    return out;
  }

  /* ---------- the indexed course ---------- */
  function course(data) {
    const C = { data, id: data.course.id, explainLang: data.course.explainLang || 'en', languages: data.course.languages.slice(),
      concepts: {}, nodes: {}, order: [], owner: {}, functions: {}, frames: {}, lang: {}, typology: data.typology || null };
    for (const f of data.fields) for (const c of f.concepts) C.concepts[c.id] = { ...c, field: f.field };
    for (const n of data.nodes) { C.nodes[n.id] = n; for (const c of n.concepts) C.owner[c] = n.id; }
    // topological order (prerequisites first, stable by file order)
    const seen = {}; const visit = id => { if (seen[id]) return; seen[id] = 1; for (const p of C.nodes[id].prereqs || []) if (C.nodes[p]) visit(p); C.order.push(id); };
    data.nodes.forEach(n => visit(n.id));
    for (const f of data.functions) C.functions[f.id] = f;
    for (const f of data.frames) C.frames[f.id] = f;
    for (const code of C.languages) {
      const src = data.langs[code], X = { code, language: src.language || {}, typology: (src.language || {}).typology || null, lex: {}, byNode: {}, byConcept: {}, absent: {}, grammar: src.grammar || {}, prepared: {},
        applies: {}, owner: {}, sentences: [], sentenceById: {}, forms: new Map(), prefixes: [], maxWord: 1, maxWords: 1 };
      for (const nid of Object.keys(C.nodes)) {
        const n = C.nodes[nid];
        X.applies[nid] = applies(n, code, X.typology);
        if (X.applies[nid]) for (const c of n.concepts) if (!X.owner[c]) X.owner[c] = nid;
        X.prepared[nid] = X.applies[nid] && (!!src.lexicon[nid] || !n.concepts.length) && !(data.course.draft || []).includes(nid);   // a node still being written is not offered yet
        const file = src.lexicon[nid] || { lexemes: [], absent: [] };
        X.byNode[nid] = [];
        for (const x of file.lexemes || []) {
          const lx = { ...facade(x), ...x, node: nid }; X.lex[x.id] = lx; X.byNode[nid].push(x.id);   // the word's facade (features, D14) readable as fields: lx.root, lx.measure …
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
        if ([...req].some(l => !X.lex[l])) continue;   // a sentence with a word that is not in the course (yet) is never offered
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
    for (const code of C.languages) L.langs[code] = { items: {}, fns: {}, checks: {} };
    return L;
  }
  const ensureLang = (L, code) => { const S = L.langs[code] = L.langs[code] || { items: {}, fns: {}, checks: {} }; S.checks = S.checks || {}; return S; };
  /** The result of a lesson check (§6.7): score 0…1. The best result counts; ≥ 0.8 passes the lesson (§5.2). */
  function recordCheck(C, L, code, nid, score, day) {
    if (C.nodes[nid]?.kind !== 'lesson') throw new Error(`${nid} is not a lesson`);
    const S = ensureLang(L, code), old = S.checks[nid] || {};
    S.checks[nid] = { day, score: +score.toFixed(3), best: Math.max(old.best || 0, +score.toFixed(3)), tries: (old.tries || 0) + 1 };
    return S.checks[nid];
  }
  const PASS = 0.8;

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
  const NODE_DONE = new Set(['known', 'mastered', 'skipped', 'passed']);
  /** States of every node in one language: locked · open · learning · passed (a lesson whose check is passed, §5.2) · known · mastered
      · skipped (tier above the chosen depth) · unprepared (its words are not written yet in this language — it blocks what follows)
      · na (the node does not apply to this language: another path or other languages, D10 — passed through: done when its prerequisites are). */
  function nodeStates(C, L, code) {
    const X = C.lang[code], out = {}, done = {}, depth = L.settings.depth?.[code] ?? 3, checks = L.langs[code]?.checks || {};
    for (const nid of C.order) {
      const n = C.nodes[nid], pre = (n.prereqs || []).filter(p => C.nodes[p]), ready = pre.every(p => done[p]);
      if (!X.applies[nid]) { out[nid] = 'na'; done[nid] = ready; continue; }
      if (n.kind === 'field' && n.tier > depth) { out[nid] = 'skipped'; done[nid] = true; continue; }
      if (!X.prepared[nid]) { out[nid] = 'unprepared'; done[nid] = false; continue; }
      if (!ready) { out[nid] = 'locked'; done[nid] = false; continue; }
      const ids = X.byNode[nid] || [], lesson = n.kind === 'lesson';
      const st = ids.map(id => itemState(C, L, code, id, { [nid]: 'open' }));
      const share = s => st.filter(x => rank(x) >= rank(s)).length / st.length;
      const passed = lesson && (checks[nid]?.best || 0) >= PASS && st.every(x => rank(x) >= rank('seen'));
      if (!ids.length) out[nid] = lesson ? (passed ? 'passed' : (checks[nid] ? 'learning' : 'open')) : 'known';   // nothing to learn (all absent) / a grammar-only lesson
      else if (share('mastered') >= 0.9 && (!lesson || passed)) out[nid] = 'mastered';
      else if (share('known_r') >= 0.9 && share('known_p') >= 0.7 && (!lesson || passed)) out[nid] = 'known';
      else if (passed) out[nid] = 'passed';
      else if (st.every(x => x === 'ready') && !checks[nid]) out[nid] = 'open';
      else out[nid] = 'learning';
      done[nid] = NODE_DONE.has(out[nid]);
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
    const X = C.lang[code], lj = X.language;
    // readings of a written word: as written (and, at the start of a sentence, with a small first letter: Sie / sie);
    // "loose" also without vowel marks. A vocalized word is first read exactly — so بِكَمْ is بِ + كَمْ, not بِكُمْ.
    const tryWord = (s, loose) => {
      const all = [];
      for (const k of new Set([s, ...(loose ? [stripMarks(code, s)] : []), ...(lj.capitalizeFirst ? [decapFirst(s)] : [])])) for (const m of X.forms.get(k) || []) if (!all.some(x => x.l === m.l && x.f === m.f)) all.push(m);
      return all.length ? all : null;
    };
    // prefix clitics (ar wa-/bi-…, he ve-/ha-/be-…): up to two, longest first
    const strip = (s, depth, loose) => {
      if (depth > 2) return null;
      for (const p of X.prefixes) for (const pre of [p.t, p.plain]) {
        if (pre && s.startsWith(pre) && s.length > pre.length) {
          const rest = s.slice(pre.length).replace(/^\p{M}+/u, ''), m = tryWord(rest, loose);   // the plain prefix letter may carry vowel marks of its own
          if (m) return [{ t: pre, matches: [{ l: p.l, f: null }] }, { t: rest, matches: m }];
          const deeper = strip(rest, depth + 1, loose);
          if (deeper) return [{ t: pre, matches: [{ l: p.l, f: null }] }, ...deeper];
        }
      }
      return null;
    };
    const W = nfc(w);
    for (const loose of [false, true]) {
      const direct = tryWord(W, loose);
      if (direct) return { matches: direct };
      const parts = strip(W, 1, loose);
      if (parts) return { matches: [], parts };
    }
    return { matches: [] };
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
        else { const prev = out[out.length - 1]; if (prev && prev.unknown && !prev.p) prev.t += ch; else out.push({ t: ch, matches: [], unknown: true }); i++; }   // unknown characters stay together (a name: 小明)
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
        if (r.matches.length || (r.parts && r.parts[r.parts.length - 1].t.includes(' '))) { out.push({ t: w, matches: r.matches, ...(r.parts ? { parts: r.parts } : {}) }); used = n; break; }
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
    // German: the article with the form used after it (der Gute Heinrich); plural-only nouns (die Edamame)
    if (code === 'de' && lx.pos === 'NOUN' && lx.class === 'plt') { out.push(['plural only', 'die ' + (get('N;NOM;PL') || lx.lemma)]); }
    else if (code === 'de' && lx.pos === 'NOUN') { out.push(['article', ARTICLE[lx.gender] + ' ' + (get('N;NOM;SG;DEF') || lx.lemma)]); if (get('N;GEN;SG')) out.push(['genitive', (lx.gender === 'FEM' ? 'der ' : 'des ') + get('N;GEN;SG')]); if (get('N;NOM;PL')) out.push(['plural', 'die ' + get('N;NOM;PL')]); }
    else if (code === 'de' && lx.pos === 'VERB') { for (const [l, c] of [['er/sie/es', 'V;PRS;3;SG'], ['du', 'V;PRS;2;SG']]) if (get(c)) out.push([l, get(c)]); if (lx.aux) out.push(['perfect with', lx.aux]); }
    else if (lx.pos === 'NOUN' && lx.class === 'collective') { out.push(['collective', lx.lemma]); if (lx.unit) out.push(['one (unit noun)', lx.unit]); if (get('N;NOM;PL;INDF')) out.push(['counted plural', get('N;NOM;PL;INDF')]); }
    else if (code === 'he' && lx.pos === 'NOUN') { if (get('N;SG;FEM;INDF')) out.push(['feminine', get('N;SG;FEM;INDF')]); if (get('N;PL;INDF')) out.push(['plural', get('N;PL;INDF')]); if (get('N;SG;DEF')) out.push(['with the article', get('N;SG;DEF')]); }
    else if (code === 'ar' && lx.pos === 'NOUN') {
      const pick = (...cs) => { for (const c of cs) { const f = get(c); if (f) return f; } return null; };
      const fem = pick('N;NOM;SG;FEM;INDF'), pl = pick('N;NOM;PL;INDF', 'N;NOM;PL;MASC;INDF'), plf = pick('N;NOM;PL;FEM;INDF'), def = pick('N;NOM;SG;DEF', 'N;NOM;SG;MASC;DEF');
      if (fem) out.push(['feminine', fem]); if (pl) out.push(['plural', pl]); if (plf) out.push(['feminine plural', plf]); if (def) out.push(['with the article', def]);
    }
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
    const p = lx.profile || {}, k = opts.k || known(C, L, code);
    const concept = opts.concept && (lx.senses || []).includes(opts.concept) ? opts.concept : (lx.senses || [])[0] || null;   // the meaning it is shown for (D15)
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
      sec('senses', 'Meanings', meanings(C, code, lx, concept)),
      sec('facade', 'This word in ' + (X.language.name || code), facadeOf(C, code, lx)),
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

  /** Every meaning of a word (D15): its concept, whether it is the meaning shown, its nuances, its own forms. */
  function meanings(C, code, lx, concept) {
    const ss = (lx.profile || {}).senses || [], X = C.lang[code];
    const forms = {};   // sense id → [label: form] from the parameters whose items name senses (another plural, reading …)
    const decl = ((X.language.wordFeatures || {})[lx.pos] || []);
    for (const d of decl) {
      const val = (lx.features || {})[d.id];
      if (!Array.isArray(val)) continue;
      for (const it of val) if (it && Array.isArray(it.senses)) {
        const txt = Object.entries(it).filter(([k2, v2]) => k2 !== 'senses' && typeof v2 === 'string').map(([, v2]) => v2).join(' · ');
        for (const sid of it.senses) (forms[sid] = forms[sid] || []).push({ label: d.title || d.id, text: txt });
      }
    }
    const one = s => {
      const c = s.concept || null, con = c ? C.concepts[c] : null;
      return { id: s.id, def: s.def, register: s.register, domains: s.domains, concept: c, gloss: con?.gloss || '', pending: !!con?.pending,
        current: !!c && c === concept, forms: forms[s.id] || [], contrast: c ? (lx.contrasts || []).find(t => t.concept === c) || null : null, words: c ? (X.byConcept[c] || []).filter(id => id !== lx.id).map(id => X.lex[id].lemma) : [],
        nuances: ss.filter(n => n.of === s.id).map(n => ({ id: n.id, def: n.def, register: n.register, forms: forms[n.id] || [] })) };
    };
    const main = ss.filter(s => !s.of).map(one);
    return main.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
  }
  /** The word's parameters as its language declares them (D14): [{title, text}] — what is stated, and what does not apply. */
  function facadeOf(C, code, lx) {
    const X = C.lang[code], key = lx.class ? lx.pos + '.' + lx.class : lx.pos, out = [];
    for (const d of ((X.language.wordFeatures || {})[lx.pos] || [])) {
      if (d.classes && !d.classes.includes(key)) continue;
      const val = d.at === 'top' ? lx[d.id] : (lx.features || {})[d.id];
      if (val == null) continue;
      const show = v => v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : Array.isArray(v) ? v.map(show).filter(Boolean).join(' · ')
        : typeof v === 'object' ? ('none' in v ? '— ' + v.none : Object.entries(v).filter(([k2]) => k2 !== 'senses').map(([, v2]) => show(v2)).filter(Boolean).join(' ')
          + (v.senses ? ' (' + v.senses.map(sid => ((lx.profile || {}).senses || []).find(x => x.id === sid)?.def?.split(/[;,(—]/)[0].trim() || sid).join(', ') + ')' : '')) : String(v);
      const text = show(val); if (text) out.push({ id: d.id, title: d.title || d.id, text, none: !!(val && typeof val === 'object' && 'none' in val) });
    }
    return out;
  }

  /* ---------- exercises made from stored data (§6.7 generators) — every answer comes from the course files ---------- */
  const TAG_LABEL = { NOM: 'nominative', ACC: 'accusative', DAT: 'dative', GEN: 'genitive', SG: 'singular', PL: 'plural', DU: 'dual', COLL: 'collective',
    MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter', DEF: 'definite (“the”)', INDF: 'indefinite', PRS: 'present', PST: 'past', FUT: 'future',
    PFV: 'perfective', IPFV: 'imperfective', IND: 'indicative', SBJV: 'subjunctive', JUSS: 'jussive', IMP: 'imperative', NFIN: 'infinitive', CSTR: 'construct state',
    '1': '1st person', '2': '2nd person', '3': '3rd person' };
  Object.assign(TAG_LABEL, { STRG: 'strong ending (no article)', WEAK: 'weak ending (after der / die / das)', MIX: 'mixed ending (after ein / kein / mein)', SEP: 'the separated particle', PFX: 'after an attached preposition', ALT: 'before the article (another spelling)', CONST: 'construct state (“the … of”)', POSS: 'with an owner ending', INFM: 'informal', FORM: 'formal', CMPR: 'comparative', SPRL: 'superlative', NEG: 'negative', PTCP: 'participle', MSDR: 'verbal noun' });
  const OWNER = { '1S': 'my', '2S': 'your', '2SM': 'your (m.)', '2SF': 'your (f.)', '3S': 'his/her', '3SM': 'his', '3SF': 'her', '1P': 'our', '2P': 'your (pl.)', '2PM': 'your (pl. m.)', '2PF': 'your (pl. f.)', '3P': 'their', '3PM': 'their (m.)', '3PF': 'their (f.)', '2D': 'your (two)', '3D': 'their (two)' };
  /** A feature cell in words: V;PRS;3;SG → “present · 3rd person · singular”; possessed forms name the owner: N;NOM;SG;PSS1S → “nominative · singular · owner: my” */
  function cellLabel(cell) {
    const p = cellParts(canon(cell)).slice(1), pss = p.find(t => /^PSS\d/.test(t));
    if (pss) return [...p.filter(t => t !== pss && t !== 'POSS').map(t => TAG_LABEL[t] || t), 'owner: ' + (OWNER[pss.slice(3)] || pss.slice(3))].join(' · ');
    if (p.includes('POSS') && p[0] !== 'POSS') {   // N;POSS;3;PL;FEM — person, number and gender are the owner's
      const own = p.filter(t => ['1', '2', '3', 'SG', 'PL', 'DU', 'MASC', 'FEM'].includes(t)), key = (own.find(t => /\d/.test(t)) || '') + ((own.includes('PL') ? 'P' : own.includes('DU') ? 'D' : 'S')) + (own.includes('MASC') ? 'M' : own.includes('FEM') ? 'F' : '');
      const rest = p.filter(t => t !== 'POSS' && !own.includes(t)).map(t => TAG_LABEL[t] || t);
      return [...rest, 'owner: ' + (OWNER[key] || OWNER[key.slice(0, 2)] || own.join(' '))].join(' · ');
    }
    return p.map(t => TAG_LABEL[t] || t).join(' · ') || 'basic form';
  }
  const VARIANT_LABEL = { Polarity: { NEG: 'Make it negative', POS: 'Make it positive' }, Mood: { INT: 'Make it a question', IMP: 'Make it a command' },
    Number: { PL: 'Make it plural', SG: 'Make it singular', DU: 'Make it dual (two)' }, Definiteness: { DEF: 'Make it definite (“the”)', INDF: 'Make it indefinite' },
    Gender: { FEM: 'Say it about / to a woman', MASC: 'Say it about / to a man' }, Addressee: { FEM: 'Say it to a woman', MASC: 'Say it to a man' },
    Tense: { PST: 'Put it in the past', FUT: 'Put it in the future', PRS: 'Put it in the present' }, Aspect: { PFV: 'Say that it happened (completed)', IPFV: 'Say that it is going on' },
    Formality: { formal: 'Say it politely (formal)', informal: 'Say it informally' }, Address: { formal: 'Say it politely (formal)', informal: 'Say it informally' },
    Deixis: { FAR: 'Point to something farther away (that)', NEAR: 'Point to something near (this)' },
    QuestionForm: { 'A-not-A': 'Ask with A-not-A (是不是, 要不要)' }, QuestionMarker: { intonation: 'Ask with intonation only' } };
  const variantLabel = v => Object.entries(v || {}).map(([k, x]) => VARIANT_LABEL[k]?.[x] || VARIANT_LABEL[k]?.[String(x).split(' ')[0].toLowerCase()] || (/formal/i.test(x) ? (/informal/i.test(x) ? VARIANT_LABEL.Formality.informal : VARIANT_LABEL.Formality.formal) : `${k}: ${x}`)).join(' · ');
  const GENDER_WORD = { MASC: 'masculine', FEM: 'feminine', NEUT: 'neuter' };
  function shuffled(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const uniqStr = a => [...new Set(a)];
  /** The pieces of a sentence a learner puts in order: its written words (a word with attached prefixes stays one tile). */
  const sentenceTiles = s => (s.tokens || []).filter(k => !k.p).map(k => k.t);
  const endPunct = s => { const ps = (s.tokens || []).filter(k => k.p === true); const last = (s.tokens || [])[s.tokens.length - 1]; return last && last.p === true ? last.t : ''; };
  const cmpText = (code, t) => nfc(t).replace(/[\p{P}\s]+/gu, ' ').trim().toLowerCase();
  /** A wrong tile for a sentence: another form of one of its inflected words (never a form that is in the sentence). */
  function wrongTile(C, code, s, rng) {
    const X = C.lang[code], used = new Set(sentenceTiles(s).map(nfc)), cands = [];
    for (const k of s.tokens || []) {
      if (k.p || !k.l || !k.f) continue;
      const lx = X.lex[k.l]; if (!lx) continue;
      for (const f of Object.values(lx.forms || {})) if (!used.has(nfc(f)) && stripMarks(code, f).toLowerCase() !== stripMarks(code, k.t).toLowerCase()) cands.push(f);
    }
    const u = uniqStr(cands); return u.length ? u[Math.floor(rng() * u.length)] : null;
  }
  /** Items for one grammar function in one language, from its generators. opts: {k (known), rng, max = 12}.
      Item kinds: {type:'choose', kind, prompt, ask, options, answer, why} · {type:'build', kind, source?, change?, tiles, answers, punct, gloss}. */
  function exercises(C, L, code, fid, opts = {}) {
    const X = C.lang[code], g = X.grammar[fid], rng = opts.rng || Math.random, max = opts.max ?? 12;
    if (!g || g.status === 'absent' && !(g.quiz || []).length) return [];
    const k = opts.k || known(C, L, code), K = k.R;
    const gens = (g.generators && g.generators.length) ? g.generators : [{ type: 'sentence_meaning' }, { type: 'build_sentence' }, { type: 'transform' }];
    const fnsOf = gen => gen.bank?.functions || [fid];
    // the sentences a generator draws on: by functions (default: this one) or by frames (for points no word shows, e.g. a verbless “to be”)
    const bankFor = gen => gen.bank?.frames ? selectSentences(C, code, { known: K }).filter(s => gen.bank.frames.includes(s.frame)) : selectSentences(C, code, { known: K, functions: fnsOf(gen) });
    const pools = [];
    for (const gen of gens) {
      const items = [];
      if (['inflect', 'principal_parts', 'paradigm'].includes(gen.type)) {
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || (gen.pos && lx.pos !== gen.pos) || (gen.class && lx.class !== gen.class) || (gen.lemmas && !gen.lemmas.includes(lx.id)) || (gen.exclude || []).includes(lx.id)) continue;
          if (gen.concepts && !(lx.senses || []).some(c => gen.concepts.some(p => c.startsWith(p)))) continue;
          if (lx.separable && !gen.lemmas) continue;   // a separable verb's stem alone is not its whole form (komme … an)
          const forms = lx.forms || {}, cells = (gen.cells || Object.keys(forms).filter(c => !/(^|;)(PFX|ALT|SEP)(;|$)/.test(c))).filter(c => Object.keys(forms).some(x => canon(x) === canon(c)));
          for (const c of cells) {
            const key = Object.keys(forms).find(x => canon(x) === canon(c)), ans = forms[key];
            const alsoRight = new Set([ans, ...((lx.formsAlt || {})[key] || [])].map(f => stripMarks(code, nfc(f)).toLowerCase()));   // e.g. Onkel / Onkels
            const wrong = uniqStr(Object.entries(forms).filter(([c2, f]) => !/(^|;)(PFX|ALT|SEP)(;|$)/.test(c2) && !alsoRight.has(stripMarks(code, nfc(f)).toLowerCase())).map(([, f]) => f));   // a spelling variant is never offered as wrong
            if (!wrong.length || key === Object.keys(forms).find(x => forms[x] === lx.lemma) && cells.length > 1) continue;   // asking for the lemma itself teaches nothing
            items.push({ type: 'choose', kind: 'inflect', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: cellLabel(c), cell: canon(c),
              options: shuffled([ans, ...shuffled(wrong, rng).slice(0, 3)], rng), answer: ans, why: `${lx.lemma} — ${cellLabel(c)}: ${ans}` });
          }
        }
      } else if (gen.type === 'gender_article') {
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || lx.pos !== 'NOUN' || !GENDER_WORD[lx.gender] || lx.class === 'plt' || (gen.concepts && !(lx.senses || []).some(c => gen.concepts.some(p => c.startsWith(p))))) continue;
          if (code === 'de') { const a = { MASC: 'der', FEM: 'die', NEUT: 'das' }[lx.gender], f = lx.forms || {}, after = f[Object.keys(f).find(x => canon(x) === canon('N;NOM;SG;DEF'))] || lx.lemma; items.push({ type: 'choose', kind: 'gender', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'Its article?', options: ['der', 'die', 'das'], answer: a, why: `${a} ${after} (${GENDER_WORD[lx.gender]})` }); }
          else { const opts2 = code === 'ar' || code === 'he' ? ['masculine', 'feminine'] : ['masculine', 'feminine', 'neuter']; items.push({ type: 'choose', kind: 'gender', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'Its gender?', options: opts2, answer: GENDER_WORD[lx.gender], why: `${lx.lemma}: ${GENDER_WORD[lx.gender]}` }); }
        }
      } else if (gen.type === 'measure_word') {
        const clf = Object.values(X.lex).filter(x => x.pos === 'CLF'), knownClf = clf.filter(x => K.has(x.id)).map(x => x.lemma), allClf = clf.map(x => x.lemma);
        for (const lx of Object.values(X.lex)) {
          if (!K.has(lx.id) || lx.pos !== 'NOUN' || !(lx.measure || []).length) continue;
          const ans = lx.measure[0], wrong = (knownClf.length >= 3 ? knownClf : allClf).filter(m => !lx.measure.includes(m) && m !== '个');   // 个 is never offered as wrong: it is often heard with anything
          if (wrong.length < 1) continue;
          items.push({ type: 'choose', kind: 'measure', fn: fid, lang: code, lex: lx.id, prompt: lx.lemma, ask: 'one … — which measure word?', options: shuffled([ans, ...shuffled(wrong, rng).slice(0, 3)], rng).map(m => '一' + m), answer: '一' + ans, why: `一${lx.measure.join(' / 一')}${lx.lemma}` });
        }
      } else if (gen.type === 'sentence_meaning') {
        const ss = bankFor(gen);
        const all = selectSentences(C, code, { known: K });
        // two sentences mean the same when their words stand for the same concepts (再见 / 拜拜, 你 / 您): never offer one as a wrong meaning of the other
        const conceptKey = o => o.req.map(l => (X.lex[l]?.senses || [])[0] || l).sort().join('|');
        for (const s of ss) {
          const key = conceptKey(s);
          const others = shuffled(all.filter(o => o.id !== s.id && o.gloss !== s.gloss && conceptKey(o) !== key), rng);
          const near = others.filter(o => o.req.some(l => s.req.includes(l))), wrong = uniqStr([...near, ...others].map(o => o.gloss)).slice(0, 3);
          if (wrong.length < 2) continue;
          items.push({ type: 'choose', kind: 'meaning', fn: fid, lang: code, sentence: s.id, prompt: s.text, ask: 'What does it mean?', options: shuffled([s.gloss, ...wrong], rng), answer: s.gloss, why: s.gloss });
        }
      } else if (gen.type === 'build_sentence' || gen.type === 'word_order') {
        for (const s of bankFor(gen)) {
          const tiles = sentenceTiles(s); if (tiles.length < 2) continue;
          const wt = wrongTile(C, code, s, rng);
          items.push({ type: 'build', kind: 'build', fn: fid, lang: code, sentence: s.id, gloss: s.gloss, tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length,
            answers: [s.text, ...(s.alts || [])], punct: endPunct(s), why: s.text });
        }
      } else if (gen.type === 'transform') {
        const want = gen.bank?.variant;
        for (const s2 of selectSentences(C, code, { known: K, functions: gen.bank?.functions ? fnsOf(gen) : [] })) {
          if (!s2.variantOf || (want && !(want in (s2.variant || {}))) || (gen.bank?.frames && !gen.bank.frames.includes(s2.frame))) continue;
          const s1 = X.sentenceById[s2.variantOf]; if (!s1 || s1.req.some(l => !K.has(l))) continue;
          if (!gen.bank?.functions && !gen.bank?.frames && !(s2.functions || []).includes(fid) && !(s1.functions || []).includes(fid)) continue;
          const tiles = sentenceTiles(s2), extra = sentenceTiles(s1).filter(t => !tiles.includes(t));
          items.push({ type: 'build', kind: 'transform', fn: fid, lang: code, sentence: s2.id, source: s1.text, sourceGloss: s1.gloss, change: variantLabel(s2.variant), gloss: s2.gloss,
            tiles: shuffled([...tiles, ...extra.slice(0, 1)], rng), size: tiles.length, answers: [s2.text, ...(s2.alts || [])], punct: endPunct(s2), why: s2.text });
        }
      } else if (gen.type === 'quiz') {
        for (const q of g.quiz || []) items.push({ type: 'choose', kind: 'quiz', fn: fid, lang: code, prompt: q.q, ask: '', options: shuffled(q.options, rng), answer: q.answer, why: q.why });
      }
      if (items.length) pools.push(shuffled(items, rng));
    }
    // take from the generators in turn, so a short set still has every kind
    const out = []; let i = 0;
    while (out.length < max && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }
  /** Is a built sentence right? (the tiles in order vs the sentence and its alternatives) */
  function checkBuilt(C, code, item, tiles) {
    const X = C.lang[code], text = joinTokens(tiles.map(t => ({ t })), X.language.tokenJoin);
    return item.answers.some(a => cmpText(code, a) === cmpText(code, text));
  }
  /** Recognition items for words: the word → its meaning (distractors: other words of the same lesson/node first). */
  function wordItems(C, L, code, lexIds, opts = {}) {
    const X = C.lang[code], rng = opts.rng || Math.random, gl = id => { const c = (X.lex[id].senses || [])[0]; return c ? C.concepts[c].gloss : (X.lex[id].role || ''); };
    return lexIds.filter(id => (X.lex[id].senses || []).length).map(id => {
      const pool = uniqStr([...lexIds, ...Object.keys(X.lex)].filter(x => x !== id && (X.lex[x].senses || []).length && !(X.lex[x].senses || []).some(s => X.lex[id].senses.includes(s))).map(gl)).filter(g => g && g !== gl(id));
      return { type: 'choose', kind: 'word', lang: code, lex: id, prompt: X.lex[id].lemma, ask: 'What does it mean?', options: shuffled([gl(id), ...pool.slice(0, 3)], rng), answer: gl(id), why: `${X.lex[id].lemma} — ${gl(id)}` };
    });
  }
  /** The lesson check (§6.7): n items mixing the lesson's words and its functions, in one language. */
  function lessonCheck(C, L, code, nid, opts = {}) {
    const n = C.nodes[nid], rng = opts.rng || Math.random, size = opts.size || 10, k = opts.k || known(C, L, code);
    const words = shuffled(wordItems(C, L, code, C.lang[code].byNode[nid] || [], { rng }), rng);
    const fx = lessonFunctions(C, code, nid).map(f => exercises(C, L, code, f, { k, rng, max: size }));
    const out = []; const pools = [words, ...fx].filter(p => p.length); let i = 0;
    while (out.length < size && pools.some(p => p.length)) { const p = pools[i++ % pools.length]; if (p.length) out.push(p.shift()); }
    return out;
  }

  /** The word profiles, loaded separately (course.profiles.js: {lexeme id: profile}). */
  function addProfiles(C, map) {
    let n = 0;
    for (const X of Object.values(C.lang)) for (const [id, lx] of Object.entries(X.lex)) if (map && map[id] && !lx.profile) { lx.profile = map[id]; n++; }
    return n;
  }

  /* ---------- the daily session (§7.5) ---------- */
  const SECONDS = { review: 8, learn: 40, grammar: 300, extra: 120, lesson: 600 };
  /** The next lesson of every language, languages at the same lesson together (D10: the steps are parallel): [{kind:'lesson', node, step, langs}] */
  function nextLessons(C, L, langs, K) {
    const out = [];
    for (const c of langs) {
      const nid = C.order.find(x => C.nodes[x].kind === 'lesson' && ['open', 'learning'].includes(K[c].nodes[x]));
      if (!nid) continue;
      const st = out.find(x => x.node === nid);
      if (st) st.langs.push(c); else out.push({ kind: 'lesson', node: nid, step: C.nodes[nid].step ?? null, langs: [c] });
    }
    return out.sort((a, b) => C.order.indexOf(a.node) - C.order.indexOf(b.node));
  }
  /** → {steps: [{kind:'review', items:[{lang, lex, track}]}, {kind:'lesson', node, path, langs}, {kind:'learn', node, concepts:[{concept, langs:[{lang, lex}]}]}, {kind:'grammar', lang, fn}], seconds} */
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
    // 2 · the foundations (D9, D10): the next lesson of every path group
    const lessons = nextLessons(C, L, langs, K);
    for (const st of lessons) { steps.push(st); budget -= SECONDS.lesson; }
    // 3 · a new batch: the first node (prerequisites first) still to learn in some language; its concepts in every language where it is open
    const batch = Math.max(1, L.settings.batch || 12);
    for (const nid of C.order) {
      if (budget < SECONDS.learn) break;
      if (C.nodes[nid].kind === 'lesson') continue;   // lesson words are learned inside their lesson
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
    // 4 · one grammar function: the first (by "after") that is ready or thin in some language and not mastered there
    if (budget >= SECONDS.grammar && !lessons.length) {
      // in the common order of the course (D13): where the function is taught, then by "after"
      const at = {}; C.order.forEach((nid, i) => { const f = C.nodes[nid].functions || []; for (const x of (Array.isArray(f) ? f : Object.values(f).flat())) if (!(x in at)) at[x] = i; });
      const fns = Object.keys(C.functions).sort((a, b) => (at[a] ?? 1e9) - (at[b] ?? 1e9) || (C.functions[a].after || []).length - (C.functions[b].after || []).length || a.localeCompare(b));
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
      for (const [nid, ch] of Object.entries(S.checks || {})) { const k = `lang:${code}:node:${nid}`; (kv[k] = kv[k] || { items: {} }).check = ch; }
    }
    return kv;
  }
  function fromKV(C, kv) {
    const L = newLearner(C, kv.settings || {});
    for (const [k, v] of Object.entries(kv)) {
      let m = k.match(/^lang:([^:]+):node:(.+)$/);
      if (m && C.lang[m[1]]) { Object.assign(ensureLang(L, m[1]).items, v.items || {}); if (v.check) ensureLang(L, m[1]).checks[m[2]] = v.check; continue; }
      m = k.match(/^lang:([^:]+):fn:(.+)$/);
      if (m && C.lang[m[1]]) ensureLang(L, m[1]).fns[m[2]] = v;
    }
    return L;
  }

  const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

  const API = { version: 1, nfc, canon, cellParts, cellHas, stripMarks, hasMarks, isHan, pinyinSplit, pinyinTone, pinyinSyllableErrors,
    pinyinNumbersToMarks, pinyinMarksToNumbers, joinTokens, capFirst,
    readCourse, course, newLearner, introduce, review, sm2, itemState, nodeStates, nodeState, known, conceptState, ITEM_STATES,
    practiceFunction, functionState, selectSentences, feasibility, lookup, tokenize, analyze, planSession, toKV, fromKV, dayNumber, wordCard, principalParts,
    TYPES, applies, pathGroups, lessonFunctions, addProfiles, recordCheck, nextLessons, exercises, checkBuilt, wordItems, lessonCheck, cellLabel, variantLabel, shuffled, PASS };
  root.NoemaLang = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
