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
    const mj = read('core/media/media.json'); if (mj) { data.media = {}; for (const m of mj.items || []) data.media[m.id] = { file: m.file, alt: m.alt, credit: m.credit, license: m.license, url: m.url }; data.mediaBase = 'core/media/'; }
    // D16: the shared typological vocabulary, the profiles of the world's languages, the catalogues of the course languages
    const tf = read('../_typology/features.json'), tl = read('../_typology/languages.json');
    if (tf && tl) data.world = { features: tf.features, languages: tl.languages,
      phenomena: Object.fromEntries(course.languages.map(c => [c, ((read(`../_phenomena/${c}.json`) || {}).phenomena || []).map(trimPhenomenon)])) };
    return data;
  }

  /** What the app needs of a phenomenon (the catalogue keeps more: model, gaps …). */
  const trimPhenomenon = p => ({ id: p.id, title: p.title, area: p.area, kind: p.kind || 'has', typology: p.typology || [], what: p.what, examples: (p.examples || []).slice(0, 2), when: p.when || '', notes: p.notes || [], ...(p.specific ? { specific: true, alsoIn: p.alsoIn || [], alsoNote: p.alsoNote || '' } : {}) });
  /** D16 — what is new and what is familiar in a language for a learner who knows `knows` (language codes), computed from the
   *  shared typological profiles, never written from one point of view. → {knownProfiles, unknownLangs, new: [{p, notes}], familiar: [{p, from}]} */
  const UNKNOWN_SHARE = 0.3;   // D19
  /** The learner's languages (D18): settings.knows = [{code | name, level, type?, family?}] → the ones that decide what is familiar
   *  (native, C2) as profiles; a language without a profile gets the prototype of its family, else of its type. */
  function learnerProfiles(C, knows) {
    const W = C.data.world; if (!W) return [];
    const prof = Object.fromEntries(W.languages.map(l => [l.code, l]));
    const out = [];
    for (const k of (knows || []).map(x => typeof x === 'string' ? { code: x, level: 'native' } : x)) {
      if (!['native', 'C2'].includes(k.level || 'native')) continue;
      if (k.code && prof[k.code]) { out.push({ ...prof[k.code], level: k.level || 'native' }); continue; }
      const p = prototype(C, k.family ? { family: k.family } : null) || prototype(C, k.type ? { typology: k.type } : null);
      if (p) out.push({ code: k.code || k.name, name: k.name || k.code, typology: k.type || p.typology, family: k.family || p.family, values: p.values, inferred: k.family && prototype(C, { family: k.family }) ? 'family' : 'type', level: k.level || 'native' });
    }
    return out;
  }
  /** The prototype of a family or a type: the majority value of every feature among its profiled languages. */
  function prototype(C, by) {
    const W = C.data.world; if (!W || !by) return null;
    const [k, val] = Object.entries(by)[0], ls = W.languages.filter(l => l[k] === val);
    if (!ls.length) return null;
    const values = {};
    for (const f of W.features) {
      const n = {}; for (const l of ls) { const v = l.values[f.id]; if (v && v !== 'unknown') n[v] = (n[v] || 0) + 1; }
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; values[f.id] = best ? best[0] : 'unknown';
    }
    return { typology: k === 'typology' ? val : ls[0].typology, family: k === 'family' ? val : null, values };
  }
  /** Is a set of typological tags familiar to the learner? → the languages (names) that have every value, or [] */
  function familiarFrom(C, tags, knows) {
    const ps = learnerProfiles(C, knows); if (!tags?.length || !ps.length) return [];
    const from = ps.filter(p => tags.every(t => p.values[t.feature] === t.value));
    return from.map(p => p.name || p.code);
  }
  /** The comparison notes a learner sees (D18): those for one of their languages, its family or its type (any level). */
  function notesFor(C, notes, knows) {
    const W = C.data.world, prof = W ? Object.fromEntries(W.languages.map(l => [l.code, l])) : {};
    const ks = (knows || []).map(x => typeof x === 'string' ? { code: x } : x);
    const keys = new Set(ks.flatMap(k => [k.code, k.type && 'type:' + k.type, k.family && 'family:' + k.family, prof[k.code] && 'type:' + prof[k.code].typology, prof[k.code] && 'family:' + prof[k.code].family].filter(Boolean)));
    return (notes || []).filter(n => keys.has(n.for));
  }
  function forLearner(C, code, knows) {
    const W = C.data.world; if (!W) return null;
    const feat = Object.fromEntries(W.features.map(f => [f.id, f]));
    const ps = learnerProfiles(C, knows).filter(p => p.code !== code), prof = Object.fromEntries(ps.map(p => [p.code, p]));
    const mine = ps.map(p => p.code), unknownLangs = (knows || []).map(x => typeof x === 'string' ? x : x.code || x.name).filter(k => k && !prof[k] && !(W.languages.find(l => l.code === k)));
    const out = { knownProfiles: mine, unknownLangs, new: [], familiar: [] };
    for (const p of (W.phenomena[code] || [])) {
      const tags = (p.typology || []).filter(t => feat[t.feature]);
      if (!tags.length) continue;
      if (p.specific) {   // the tags only approximate it: familiar only to speakers of the languages that really have it
        const from = mine.filter(k => (p.alsoIn || []).includes(k));
        if (from.length) out.familiar.push({ p, from }); else out.new.push({ p, notes: p.alsoNote ? [{ feature: '', title: 'Specific to this language', value: '', note: p.alsoNote }] : [] });
        continue;
      }
      const from = new Set(), notes = []; let familiar = true;
      for (const t of tags) {
        const has = mine.filter(k => prof[k].values[t.feature] === t.value);
        if (has.length) has.forEach(k => from.add(k));
        else { familiar = false; const f = feat[t.feature]; notes.push({ feature: f.id, title: f.title, value: (f.values.find(v => v.id === t.value) || {}).title || t.value, note: f.learnerNote || '' }); }
      }
      if (familiar && mine.length) out.familiar.push({ p, from: [...from] }); else out.new.push({ p, notes });
    }
    return out;
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
        const nwords = (s.tokens || []).filter(k => !k.p).length;   // words of the sentence (a prefixed word is one word; names count)
        const S = { ...s, req: [...req], nwords, cap: Math.ceil(UNKNOWN_SHARE * nwords) }; X.sentences.push(S); X.sentenceById[s.id] = S;
      }
      C.lang[code] = X;
    }
    return C;
  }

  /* ---------- the learner ---------- */
  function newLearner(C, settings = {}) {
    const L = { course: C.id, settings: { languages: settings.languages || C.languages.slice(), depth: { ...(C.data.course.defaults?.depth || {}), ...(settings.depth || {}) },
      batch: settings.batch || C.data.course.defaults?.batch || 12, ...(settings.knows ? { knows: settings.knows } : {}), ...(settings.aiNotes ? { aiNotes: true } : {}) }, langs: {} };
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
  /** Sentences for an exercise or an example. maxUnknown: a number, or 'auto' = at most ⌈30 %⌉ of the sentence's words
   *  unknown to the learner (D19: every aspect but vocabulary trains with any vocabulary). Fewest unknown words first. */
  function selectSentences(C, code, opts = {}) {
    const X = C.lang[code], K = opts.known || new Set(), max = opts.maxUnknown || 0;
    return X.sentences.filter(s => {
      if (opts.frame && s.frame !== opts.frame) return false;
      if (opts.variants === false && s.variantOf) return false;
      if ((opts.functions || []).some(f => !(s.functions || []).includes(f))) return false;
      return s.req.filter(l => !K.has(l)).length <= (max === 'auto' ? s.cap : max);
    }).map(s => ({ ...s, unknown: s.req.filter(l => !K.has(l)) })).sort((a, b) => a.unknown.length - b.unknown.length);
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
  /** Generator registry: each phase adds its exercise types here (GEN.paradigm = ctx => items), keeping exercises() one place. */
  const GEN = {};
  /** Items for one grammar function in one language, from its generators. opts: {k (known), rng, max = 12}.
      Item kinds: {type:'choose', kind, prompt, ask, options, answer, why} · {type:'build', kind, source?, change?, tiles, answers, punct, gloss}. */
  function exercises(C, L, code, fid, opts = {}) {
    const X = C.lang[code], g = X.grammar[fid], rng = opts.rng || Math.random, max = opts.max ?? 12;
    if (!g || g.status === 'absent' && !(g.quiz || []).length) return [];
    const k = opts.k || known(C, L, code), K = k.R;
    const gens = (g.generators && g.generators.length) ? g.generators : [{ type: 'sentence_meaning' }, { type: 'build_sentence' }, { type: 'transform' }];
    const fnsOf = gen => gen.bank?.functions || [fid];
    // the sentences a generator draws on: by functions (default: this one) or by frames (for points no word shows, e.g. a verbless “to be”)
    const U = opts.strictKnown ? 0 : 'auto';   // D19: up to ⌈30 %⌉ unknown words (marked 🆕); strictKnown: only known words
    const bankFor = gen => gen.bank?.frames ? selectSentences(C, code, { known: K, maxUnknown: U }).filter(s => gen.bank.frames.includes(s.frame)) : selectSentences(C, code, { known: K, functions: fnsOf(gen), maxUnknown: U });
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
        const all = selectSentences(C, code, { known: K, maxUnknown: U });
        // two sentences mean the same when their words stand for the same concepts (再见 / 拜拜, 你 / 您): never offer one as a wrong meaning of the other
        const conceptKey = o => o.req.map(l => (X.lex[l]?.senses || [])[0] || l).sort().join('|');
        for (const s of ss) {
          const key = conceptKey(s);
          const others = shuffled(all.filter(o => o.id !== s.id && o.gloss !== s.gloss && conceptKey(o) !== key), rng);
          const near = others.filter(o => o.req.some(l => s.req.includes(l))), wrong = uniqStr([...near, ...others].map(o => o.gloss)).slice(0, 3);
          if (wrong.length < 2) continue;
          items.push({ type: 'choose', kind: 'meaning', fn: fid, lang: code, sentence: s.id, prompt: s.text, ask: 'What does it mean?', options: shuffled([s.gloss, ...wrong], rng), answer: s.gloss, why: s.gloss, unknown: s.unknown });
        }
      } else if (gen.type === 'build_sentence' || gen.type === 'word_order') {
        for (const s of bankFor(gen)) {
          const tiles = sentenceTiles(s); if (tiles.length < 2) continue;
          const wt = wrongTile(C, code, s, rng);
          items.push({ type: 'build', kind: 'build', fn: fid, lang: code, sentence: s.id, gloss: s.gloss, tiles: shuffled(wt ? [...tiles, wt] : tiles, rng), size: tiles.length,
            answers: [s.text, ...(s.alts || [])], punct: endPunct(s), why: s.text, unknown: s.unknown });
        }
      } else if (gen.type === 'transform') {
        const want = gen.bank?.variant;
        for (const s2 of selectSentences(C, code, { known: K, functions: gen.bank?.functions ? fnsOf(gen) : [], maxUnknown: U })) {
          if (!s2.variantOf || (want && !(want in (s2.variant || {}))) || (gen.bank?.frames && !gen.bank.frames.includes(s2.frame))) continue;
          const s1 = X.sentenceById[s2.variantOf]; if (!s1 || s1.req.filter(l => !K.has(l)).length > (U === 'auto' ? s1.cap : 0)) continue;
          if (!gen.bank?.functions && !gen.bank?.frames && !(s2.functions || []).includes(fid) && !(s1.functions || []).includes(fid)) continue;
          const tiles = sentenceTiles(s2), extra = sentenceTiles(s1).filter(t => !tiles.includes(t));
          items.push({ type: 'build', kind: 'transform', fn: fid, lang: code, sentence: s2.id, source: s1.text, sourceGloss: s1.gloss, change: variantLabel(s2.variant), gloss: s2.gloss,
            tiles: shuffled([...tiles, ...extra.slice(0, 1)], rng), size: tiles.length, answers: [s2.text, ...(s2.alts || [])], punct: endPunct(s2), why: s2.text,
            unknown: [...new Set([...s2.unknown, ...s1.req.filter(l => !K.has(l))])] });
        }
      } else if (GEN[gen.type]) {   // generators added by later phases (P4–P7): GEN[type](ctx) → items
        items.push(...(GEN[gen.type]({ C, L, code, fid, g, gen, k, K, rng, bank: () => bankFor(gen), max }) || []));
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
    readCourse, course, forLearner, learnerProfiles, prototype, familiarFrom, notesFor, UNKNOWN_SHARE, newLearner, introduce, review, sm2, itemState, nodeStates, nodeState, known, conceptState, ITEM_STATES,
    practiceFunction, functionState, selectSentences, feasibility, lookup, tokenize, analyze, planSession, toKV, fromKV, dayNumber, wordCard, principalParts,
    TYPES, applies, pathGroups, lessonFunctions, addProfiles, recordCheck, nextLessons, exercises, checkBuilt, wordItems, lessonCheck, cellLabel, variantLabel, shuffled, PASS };
  /* ---------- P8 — Through Claude (course creation and generation): account courses, task queue, checks and merges (§7.4, §10.1) ---------- */
  /* The same code runs in the app (engine/lang/95_claude.js) and in the connector (cloud/mcp/server.mjs, bundled by tools/build.py):
     a task, the check of its answer and the way the answer changes the course are identical everywhere. Pure: no DOM, no storage. */
  const LANG_P8 = (() => {
    const FORMAT = 'noema.langjobs/v1', DATA = 'noema.langdata/v1', PATCH = 'noema.langpatch/v1';
    const IN = 'a:langin:', CLAIM = 'a:langclaim:', LEASE = 4 * 3600e3, KEEP = 400;
    const KIND = { core: 'lang.core', node: 'lang.node', function: 'lang.function', compare: 'lang.compare', refill: 'lang.refill' };
    const POS = new Set(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PART', 'INTJ', 'CLF', 'X']);
    const CONTENT = new Set(['NOUN', 'VERB', 'ADJ', 'ADV']);
    const GENDERED = new Set(['de', 'ar', 'he', 'fr', 'es', 'it', 'pt', 'ru', 'el', 'hi']);
    // D18: the reference set (library/languages/_typology/reference.json) with the type of each language
    const REF = { el: 'fusional', ru: 'fusional', es: 'fusional', en: 'fusional', fr: 'fusional', de: 'fusional', hi: 'fusional', fa: 'fusional', mr: 'fusional', ar: 'fusional', he: 'fusional',
      tr: 'agglutinating', ja: 'agglutinating', ko: 'agglutinating', fi: 'agglutinating', hu: 'agglutinating', sw: 'agglutinating', lg: 'agglutinating', zh: 'isolating', vi: 'isolating', iu: 'polysynthetic' };
    const STATUS = new Set(['realized', 'periphrastic', 'absent']);
    const CATS = new Set(['overview', 'script', 'phonology', 'morphology', 'morphosyntax', 'syntax', 'semantics', 'pragmatics', 'lexicon', 'reading', 'writing', 'speaking', 'listening', 'production', 'culture']);
    const GENS = new Set(['quiz', 'sentence_meaning', 'glyph_form', 'transliterate', 'vowelize', 'tone_mark', 'char_compose', 'trace', 'spell', 'learn_batch', 'recognize', 'picture_name', 'exhaustive_recall', 'field_map',
      'gender_article', 'principal_parts', 'measure_word', 'root_family', 'compound_split', 'sense_split', 'collocation', 'confusables', 'intensity_scale', 'paradigm', 'inflect', 'analyze', 'morph_build', 'root_pattern', 'agree',
      'build_sentence', 'word_order', 'transform', 'contrast', 'parse', 'gloss', 'proofread', 'combine', 'translate', 'rewrite', 'expand', 'guided_compose', 'graded_reader', 'number_words', 'clock', 'date', 'register',
      'dialogue_turn', 'parallel_translate', 'parallel_align', 'which_language', 'cognate_bridge', 'compare_rule', 'register_pick', 'nuance_pick', 'connotation', 'idiom_meaning', 'example_cloze', 'sense_pick', 'etymology_link']);
    const clone = o => JSON.parse(JSON.stringify(o));
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const str = v => typeof v === 'string' && v.trim() !== '';
    const iso = now => new Date(now == null ? Date.now() : now).toISOString();
    const NAMES = { ar: 'Arabic', he: 'Hebrew', zh: 'Chinese', de: 'German', en: 'English', el: 'Greek', ru: 'Russian', tr: 'Turkish', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi', fa: 'Persian', fi: 'Finnish', hu: 'Hungarian', sw: 'Swahili', vi: 'Vietnamese', nl: 'Dutch', pl: 'Polish' };
    const nameOf = c => NAMES[c] || c;

    /* ---------- the account course: its record (synced key a:langcourse:<id>) and its content (device + cloud storage) ---------- */
    const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    function newCourseId(title, rnd = Math.random) { let r = ''; for (let i = 0; i < 4; i++) r += 'abcdefghijkmnpqrstuvwxyz'[Math.floor(rnd() * 24)]; return `u-${slug(title) || 'course'}-${r}`; }
    /** A new course made through Claude → {record, data}. library: built library courses (their language.json and typology are reused). */
    function newCourse({ title, languages, explainLang = 'en', depth = {}, knownLanguages = [], provider = 'claudeapp', id = null, now = Date.now(), library = [] } = {}) {
      const langs = [...new Set((languages || []).map(x => String(x).trim().toLowerCase()).filter(x => /^[a-z]{2,3}$/.test(x)))];
      if (!str(title)) throw new Error('A course needs a title.');
      if (!langs.length) throw new Error('Choose at least one language.');
      id = id || newCourseId(title);
      const dep = Object.fromEntries(langs.map(c => [c, [1, 2, 3].includes(+depth[c]) ? +depth[c] : 3]));
      const known = [...new Set((knownLanguages || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))];
      const libLang = c => { for (const d of library || []) if (d?.langs?.[c]?.language) return clone(d.langs[c].language); return null; };
      const data = { format: DATA, rev: 1, course: { format: 'noema.langcourse/v1', id, title: title.trim(), explainLang, languages: langs, defaults: { depth: dep, batch: 12, dailyMinutes: 30 }, knownLanguages: known, account: true, draft: [] },
        typology: clone((library || []).find(d => d?.typology)?.typology || null), fields: [], nodes: [], functions: [], frames: [], compare: {},
        langs: Object.fromEntries(langs.map(c => [c, { language: libLang(c), lexicon: {}, grammar: {}, bank: [] }])) };
      const record = { format: FORMAT, id, origin: 'account', title: data.course.title, languages: langs, explainLang, depth: dep, knownLanguages: known, provider, created: iso(now), updated: iso(now), rev: 1, tasks: [], log: [] };
      queueTask(record, KIND.core, {}, { now });
      return { record, data };
    }
    /** The record of a library course: only its refill queue lives in the account (the learner's private patch). */
    const libraryRecord = (C, now = Date.now()) => ({ format: FORMAT, id: C.id, origin: 'library', title: C.data.course.title, languages: C.languages.slice(), explainLang: C.explainLang, depth: {}, knownLanguages: C.data.course.knownLanguages || [], provider: 'claudeapp', created: iso(now), updated: iso(now), rev: 0, tasks: [], log: [] });
    const emptyPatch = (cid) => ({ format: PATCH, course: cid, rev: 0, langs: {} });
    /** A library course with the learner's patch laid over it (refill sentences, §7.4). Mutates and returns data. */
    function applyPatch(data, patch) {
      for (const [code, P] of Object.entries(patch?.langs || {})) {
        const L = data.langs?.[code]; if (!L) continue;
        const have = new Set((L.bank || []).map(s => s.id));
        for (const s of P.bank || []) if (!have.has(s.id)) { L.bank.push(s); have.add(s.id); }
      }
      return data;
    }

    /* ---------- the queue ---------- */
    const taskIdOf = (kind, a) => kind === KIND.core ? 'core' : kind === KIND.node ? `node:${a.node}:${a.lang}` : kind === KIND.function ? `function:${a.fn}:${a.lang}` : kind === KIND.compare ? `compare:${a.fn}` : `refill:${a.fn}:${a.lang}:${a.n}`;
    const isOpen = t => t && (t.status === 'queued');
    /** Queue a task (the open one when it is queued already) → the task. */
    function queueTask(rec, kind, args = {}, { now = Date.now(), night = false } = {}) {
      if (!Object.values(KIND).includes(kind)) throw new Error('unknown task kind ' + kind);
      rec.tasks = rec.tasks || [];
      if (kind === KIND.refill && args.n == null) args = { ...args, n: 1 + rec.tasks.filter(t => t.kind === KIND.refill && t.fn === args.fn && t.lang === args.lang).length };
      const id = taskIdOf(kind, args);
      const open = rec.tasks.find(t => t.id === id && isOpen(t)); if (open) return open;
      const t = { id, kind, ...args, status: 'queued', queuedAt: iso(now), ...(night ? { night: true } : {}) };
      rec.tasks.push(t); rec.updated = iso(now);
      const done = rec.tasks.filter(x => !isOpen(x)); if (done.length > KEEP) rec.tasks = rec.tasks.filter(x => isOpen(x) || done.indexOf(x) >= done.length - KEEP);
      return t;
    }
    const order = rec => (rec.tasks || []).filter(isOpen).sort((a, b) => (a.kind === KIND.core ? -1 : 0) - (b.kind === KIND.core ? -1 : 0) || String(a.queuedAt).localeCompare(String(b.queuedAt)) || (a.seq || 0) - (b.seq || 0));
    /** The queue as it really is: a task with a live claim (KV a:langclaim:<course>:<task>) is being written by another run. */
    function settle(rec, { claims = [], now = Date.now(), lease = LEASE } = {}) {
      const r = clone(rec), pre = CLAIM + rec.id + ':';
      const live = {}; for (const c of claims) { if (!String(c.key).startsWith(pre)) continue; const t = Date.parse(c.updated_at || '') || 0; if (now - t < lease) live[c.key.slice(pre.length)] = iso(t); }
      for (const t of r.tasks || []) if (isOpen(t) && live[t.id]) t.claimedAt = live[t.id];
      return r;
    }
    /** {queued: [free tasks in order], claimed: [taken by a run], done, refused} */
    function work(rec) {
      const o = order(rec);
      return { queued: o.filter(t => !t.claimedAt), claimed: o.filter(t => t.claimedAt), done: (rec.tasks || []).filter(t => t.status === 'done').length, refused: (rec.tasks || []).filter(t => t.status === 'refused').length };
    }
    const byId = (rec, id) => (rec.tasks || []).find(t => t.id === id && isOpen(t)) || null;
    /** The next task: want 'any' or a kind (lang.node …); task: one task id (even when another run took it, with force). */
    function next(rec, { want = 'any', task = '', force = false } = {}) {
      if (task) { const t = byId(rec, task); if (!t) return { error: `No open task “${task}” in “${rec.title}”.` }; if (t.claimedAt && !force) return { error: `“${task}” is being written by another run since ${t.claimedAt} — do not write it twice (force = true takes it over when that run stopped).` }; return t; }
      if (rec.tasks?.some(t => isOpen(t) && t.kind === KIND.core) && want !== 'any' && want !== KIND.core) return null;   // nothing can be written before the core
      const w = work(rec);
      return w.queued.find(t => want === 'any' || t.kind === want || t.kind === 'lang.' + want) || null;
    }
    /** What the course still needs, in course order: {core, nodes: [{node, lang}], functions: [{fn, lang}], compare: [fn]} */
    function needs(rec, data) {
      const out = { core: !(data.nodes || []).length, nodes: [], functions: [], compare: [] };
      if (out.core) return out;
      let C; try { C = course(data); } catch (e) { return out; }
      const langs = rec.languages || C.languages;
      for (const nid of C.order) for (const code of langs) {
        const X = C.lang[code]; if (!X || !X.applies[nid]) continue;
        if (C.nodes[nid].concepts.length && !data.langs[code].lexicon[nid]) out.nodes.push({ node: nid, lang: code });
        if (C.nodes[nid].kind === 'lesson') for (const fid of lessonFunctions(C, code, nid)) if (C.functions[fid] && !X.grammar[fid] && !out.functions.some(x => x.fn === fid && x.lang === code)) out.functions.push({ fn: fid, lang: code });
      }
      for (const fid of Object.keys(C.functions)) if (C.functions[fid].category !== 'overview' && langs.filter(c => C.lang[c]?.grammar[fid]).length >= 2 && !(data.compare || {})[fid]) out.compare.push(fid);
      return out;
    }
    /** 🌙 Queue every unwritten node (and the realizations its lessons need) — for a night of scheduled runs → how many were queued. */
    function queueNight(rec, data, { now = Date.now(), langs = null, functions = true } = {}) {
      const nd = needs(rec, data); let n = 0, i = 0;
      const want = c => !langs || langs.includes(c);
      const before = new Set(order(rec).map(t => t.id));
      const add = (kind, a) => { const t = queueTask(rec, kind, a, { now, night: true }); t.seq = t.seq || ++i; if (!before.has(t.id)) { before.add(t.id); n++; } };
      for (const x of nd.nodes) if (want(x.lang)) add(KIND.node, x);
      if (functions) for (const x of nd.functions) if (want(x.lang)) add(KIND.function, x);
      return n;
    }
    /** The refill request of §7.4: the function, the language and the learner's known lexemes (R and P) right now. */
    function refillRequest(C, L, code, fid) {
      const k = known(C, L, code);
      return { fn: fid, lang: code, R: [...k.R].sort(), P: [...k.P].sort(), have: selectSentences(C, code, { known: k.R, functions: [fid] }).length };
    }

    /* ---------- the parallel order (D13, §4.4.3) — the JS twin of validate_lang.course_paths / order_conflicts ---------- */
    const lessonFns = (n, L, typ) => { const f = n.functions || []; if (Array.isArray(f)) return f.slice(); const out = []; for (const k of ['*', typ, L]) for (const x of f[k] || []) if (!out.includes(x)) out.push(x); return out; };
    function topo(nodes) { const by = {}, seen = {}, out = []; for (const n of nodes) if (n.id) by[n.id] = n; const visit = id => { if (seen[id] || !by[id]) return; seen[id] = 1; for (const p of by[id].prereqs || []) visit(p); out.push(id); }; for (const n of nodes) visit(n.id); return { by, out }; }
    /** The path of every language of the course and of every language type: [[name, [[node id, Set(subjects)]]]] */
    function coursePaths(data, label = null) {
      label = label || data.course?.id || 'course';
      const { by, out } = topo(data.nodes || []);
      const holders = [];
      for (const L of data.course?.languages || []) { const typ = data.langs?.[L]?.language?.typology; if (typ) holders.push([`${label}/${L}`, L, typ]); }
      for (const t of TYPES.slice().sort()) holders.push([`${label}/${t} type`, null, t]);
      return holders.map(([name, L, typ]) => {
        const seen = new Set(), steps = [];
        for (const nid of out) {
          const n = by[nid]; if (!applies(n, L, typ)) continue;
          const g = new Set(['node ' + nid, ...lessonFns(n, L, typ).map(f => 'grammar ' + f), ...(n.concepts || []).map(c => 'word ' + c)].filter(x => !seen.has(x)));
          g.forEach(x => seen.add(x)); steps.push([nid, g]);
        }
        return [name, steps];
      });
    }
    /** Pairs of subjects taught in opposite orders by two paths (one of them starts with `mine`) → messages */
    function orderConflicts(paths, mine = null, limit = 12) {
      const pos = paths.map(([, steps]) => { const p = new Map(); steps.forEach(([nid, g], i) => g.forEach(x => p.set(x, [i, nid]))); return p; });
      const found = new Map();
      for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
        if (mine && !(paths[a][0].startsWith(mine) || paths[b][0].startsWith(mine))) continue;
        const A = pos[a], B = pos[b];
        const common = [...A.keys()].filter(x => B.has(x)).sort((x, y) => A.get(x)[0] - A.get(y)[0] || B.get(x)[0] - B.get(y)[0]);
        let best = null, i = 0;
        while (i < common.length) {
          let j = i; while (j < common.length && A.get(common[j])[0] === A.get(common[i])[0]) j++;
          for (const y of common.slice(i, j)) if (best && B.get(y)[0] < B.get(best)[0]) { const k = best + '|' + y; if (!found.has(k)) found.set(k, `“${best}” comes before “${y}” in ${paths[a][0]} (${A.get(best)[1]} → ${A.get(y)[1]}) but after it in ${paths[b][0]} (${B.get(y)[1]} → ${B.get(best)[1]})`); }
          for (const y of common.slice(i, j)) if (best === null || B.get(y)[0] > B.get(best)[0]) best = y;
          i = j;
        }
      }
      const msgs = [...found.values()];
      return msgs.slice(0, limit).concat(msgs.length > limit ? [`… and ${msgs.length - limit} more`] : []);
    }

    /* ---------- the answer schemas (the tool input of the in-app runner; the connector checks the same) ---------- */
    const S_SENT = { type: 'object', required: ['id', 'frame', 'text', 'tokens', 'gloss'], properties: { id: { type: 'string' }, frame: { type: 'string' }, text: { type: 'string' }, gloss: { type: 'string' }, tokens: { type: 'array', minItems: 1, items: { type: 'object' } }, functions: { type: 'array', items: { type: 'string' } }, level: { type: 'string' }, variantOf: { type: 'string' }, variant: { type: 'object' } } };
    const SCHEMA = {
      [KIND.core]: { type: 'object', required: ['fields', 'nodes', 'functions', 'frames'], properties: { fields: { type: 'array', items: { type: 'object' } }, nodes: { type: 'array', minItems: 1, items: { type: 'object' } }, functions: { type: 'array', items: { type: 'object' } }, frames: { type: 'array', items: { type: 'object' } }, typology: { type: 'object' }, languages: { type: 'object', description: 'language.json of each course language that has none yet' } } },
      [KIND.node]: { type: 'object', required: ['lexicon'], properties: { lexicon: { type: 'object', required: ['lexemes'], properties: { lexemes: { type: 'array', items: { type: 'object' } }, absent: { type: 'array', items: { type: 'object' } } } }, bank: { type: 'array', items: S_SENT }, grammar: { type: 'object', description: 'function id → realization (lang/<code>/grammar/<fn>.json), for the lesson\'s functions' } } },
      [KIND.function]: { type: 'object', required: ['grammar'], properties: { grammar: { type: 'object' }, bank: { type: 'array', items: S_SENT } } },
      [KIND.compare]: { type: 'object', required: ['compare'], properties: { compare: { type: 'object', required: ['function', 'rows'], properties: { function: { type: 'string' }, rows: { type: 'array', minItems: 1, items: { type: 'object', required: ['aspect', 'cells'], properties: { aspect: { type: 'string' }, cells: { type: 'object' } } } }, notes: { type: 'array', items: { type: 'object' } } } } } },
      [KIND.refill]: { type: 'object', required: ['bank'], properties: { bank: { type: 'array', minItems: 1, items: S_SENT } } },
    };
    /** The JSON-Schema subset of the answer schemas → problems */
    function shape(schema, v, at = '$', out = []) {
      if (!schema || out.length > 40) return out;
      const t = schema.type;
      const ok = !t || (t === 'array' ? Array.isArray(v) : t === 'object' ? isObj(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t);
      if (!ok) { out.push(`${at}: expected ${t}`); return out; }
      if (t === 'array') { if (schema.minItems && v.length < schema.minItems) out.push(`${at}: needs ≥ ${schema.minItems} items`); if (schema.items) v.forEach((x, i) => shape(schema.items, x, `${at}[${i}]`, out)); }
      if (t === 'object') { for (const r of schema.required || []) if (v[r] === undefined) out.push(`${at}.${r}: missing`); for (const [k, x] of Object.entries(v)) if (schema.properties?.[k]) shape(schema.properties[k], x, `${at}.${k}`, out); }
      return out;
    }

    /* ---------- checks: the validator's rules the app and the connector need (tools/validate_lang.py is the full check) ---------- */
    /** Every lexeme of a language in the course (+ extra ones) → Map id → {x, node} */
    function lexIndex(data, code, extra = [], skipNode = null) {
      const m = new Map();
      for (const [nid, f] of Object.entries(data.langs?.[code]?.lexicon || {})) { if (nid === skipNode) continue; for (const x of f.lexemes || []) m.set(x.id, { x, node: nid }); }
      for (const [x, nid] of extra) m.set(x.id, { x, node: nid });
      return m;
    }
    /** Which node teaches each concept in a language (ownership, §4.4). */
    function owners(data, code) {
      const typ = data.langs?.[code]?.language?.typology, own = {};
      for (const n of data.nodes || []) if (applies(n, code, typ)) for (const c of n.concepts || []) if (!own[c]) own[c] = n.id;
      return own;
    }
    const conceptsOf = data => { const m = {}; for (const f of data.fields || []) for (const c of f.concepts || []) m[c.id] = { ...c, field: f.field }; return m; };
    function checkLexemes(E, data, code, nid, lexicon, lj) {
      const where = `lang/${code}/lexicon/${nid}.json`, concepts = conceptsOf(data), own = owners(data, code), node = (data.nodes || []).find(n => n.id === nid);
      const others = lexIndex(data, code, [], nid), ids = new Set(), covered = new Set(), pcells = lj.paradigmCells || {}, cite = lj.citationCells || {}, marks = !!lj.vowelMarks;
      const wf = lj.wordFeatures || null;
      const profiles = (data.course?.profiles || 'required') === 'required';
      for (const x of lexicon.lexemes || []) {
        const w = `${where} · ${x?.id}`;
        if (!isObj(x)) { E.push(`${where}: a lexeme must be an object`); continue; }
        if (!(str(x.id) && x.id.startsWith(code + ':'))) { E.push(`${w}: lexeme id must start with “${code}:”`); continue; }
        if (ids.has(x.id) || others.has(x.id)) E.push(`${w}: lexeme id used twice`); ids.add(x.id);
        if (!str(x.lemma)) E.push(`${w}: “lemma” is required (text)`);
        if (!POS.has(x.pos)) E.push(`${w}: unknown part of speech “${x.pos}”`);
        if (!Array.isArray(x.senses)) { E.push(`${w}: “senses” must be a list (empty for a word with no shared concept)`); continue; }
        x.senses.forEach((s, i) => {
          if (!concepts[s]) { E.push(`${w}: unknown concept “${s}”`); return; }
          if (i === 0 && own[s] !== nid && !(x.role && (concepts[s].pending || own[s]))) E.push(`${w}: concept “${s}” belongs to node ${own[s] || '(none)'} in ${code}, not ${nid}`);
          covered.add(s);
        });
        if (!x.senses.length && !str(x.role)) E.push(`${w}: a word without a concept needs its “role”`);
        if (!isObj(x.ref)) E.push(`${w}: “ref” is required (how the word was checked: {"src": "kaikki", "checked": "<date>"}, tools/lang_refcheck.py)`);
        const forms = x.forms == null ? {} : x.forms;
        if (!isObj(forms)) { E.push(`${w}: “forms” must be an object`); continue; }
        const seen = {};
        for (const [c, f] of Object.entries(forms)) {
          if (!cellParts(c).length) E.push(`${w}: an empty cell`);
          if (seen[canon(c)]) E.push(`${w}: cells ${seen[canon(c)]} and ${c} are the same`); seen[canon(c)] = c;
          if (!str(f)) E.push(`${w}: cell ${c}: empty form`);
          else if (marks && [...stripMarks(code, f)].filter(ch => /\p{L}/u.test(ch)).length > 1 && !hasMarks(code, f)) E.push(`${w}: cell ${c}: “${f}” has no vowel marks (store ${code} forms fully vocalized)`);
        }
        const key = x.class ? `${x.pos}.${x.class}` : x.pos;
        for (const c of pcells[key] || pcells[x.pos] || []) if (!seen[canon(c)]) E.push(`${w}: missing cell ${c}`);
        const cc = cite[key] || cite[x.pos];
        if (cc && Object.keys(forms).length) { if (!seen[canon(cc)]) E.push(`${w}: missing citation cell ${cc}`); else if (forms[seen[canon(cc)]] !== x.lemma) E.push(`${w}: the lemma “${x.lemma}” must be the ${cc} form “${forms[seen[canon(cc)]]}”`); }
        if (marks && str(x.lemma) && [...stripMarks(code, x.lemma)].filter(ch => /\p{L}/u.test(ch)).length > 1 && !hasMarks(code, x.lemma)) E.push(`${w}: the lemma has no vowel marks`);
        if (x.pos === 'NOUN' && GENDERED.has(code) && x.class !== 'plt' && !['MASC', 'FEM', 'NEUT'].includes(x.gender)) E.push(`${w}: gender is required (MASC, FEM or NEUT)`);
        if (profiles && CONTENT.has(x.pos) && x.senses.length && !isObj(x.profile)) E.push(`${w}: a content word needs its profile (§4.6: senses, examples, collocations … — the validator checks it in full)`);
        // D14: the facade — every parameter its language declares for the part of speech
        if (wf) {
          if (!Array.isArray(wf[x.pos])) E.push(`${w}: no wordFeatures for ${x.pos} in ${code} (language.json)`);
          const feats = isObj(x.features) ? x.features : {};
          const mine = (wf[x.pos] || []).filter(d => !d.classes || d.classes.includes(key)), known = new Set(mine.map(d => d.id));
          for (const k of Object.keys(feats)) if (!known.has(k)) E.push(`${w}: features.${k}: not a parameter of ${key} in ${code} (wordFeatures)`);
          for (const d of mine) {
            const val = d.at === 'top' ? x[d.id] : feats[d.id];
            if (val == null) { E.push(`${w}: the word does not state its ${d.title || d.id} (${d.id}${d.at === 'top' ? ' at the top level' : ''}): give a value${d.none ? ' or {"none": "<why>"}' : ''} (D14)`); continue; }
            if (isObj(val) && Object.keys(val).length === 1 && 'none' in val) { if (!d.none) E.push(`${w} · ${d.id}: this parameter cannot be “none”`); else if (!str(val.none)) E.push(`${w} · ${d.id}: say why it is none`); continue; }
            if (d.type === 'enum' && !(d.values || []).includes(val)) E.push(`${w} · ${d.id}: “${val}” is not one of ${(d.values || []).join(', ')}`);
          }
        }
        for (const ct of x.contrasts || []) { if (!x.senses.includes(ct.concept)) E.push(`${w}: contrasts: “${ct.concept}” is not one of the word's concepts`); if (!str(ct.axis) || !str(ct.value)) E.push(`${w} · contrasts: axis and value are required`); }
        if (code === 'zh') {
          const lemma = String(x.lemma || ''), chars = [...lemma];
          if (!chars.every(isHan)) E.push(`${w}: “${lemma}” must be written in characters only`);
          if (!str(x.trad) || [...x.trad].length !== chars.length) E.push(`${w}: the traditional form (trad) is required, with as many characters as the lemma`);
          const syl = pinyinSplit(x.pinyin || '');
          const erhua = lemma.endsWith('儿') && chars.length > 1 && syl.length === chars.length - 1 && /r$/.test(syl[syl.length - 1] || '');
          if (!syl.length) E.push(`${w}: pinyin is required (syllables separated by spaces)`);
          else if (syl.length !== chars.length && !erhua) E.push(`${w}: ${syl.length} pinyin syllables for ${chars.length} characters`);
          else syl.forEach((s, i) => { for (const e of pinyinSyllableErrors(erhua && i === syl.length - 1 ? s.slice(0, -1) : s)) E.push(`${w}: ${e}`); });
          const ms = (x.features || {}).measure ?? x.measure;
          if (x.pos === 'NOUN' && !ms && !x.measureNone) E.push(`${w}: a noun needs its measure word(s) (features.measure), or {"none": "<why>"}`);
        }
      }
      for (const a of lexicon.absent || []) {
        const w = `${where} · absent ${a?.concept}`;
        if (!node || !(node.concepts || []).includes(a?.concept)) E.push(`${w}: concept “${a?.concept}” is not in node ${nid}`);
        if (covered.has(a?.concept)) E.push(`${w}: the concept has a word and is also marked absent`);
        if (!str(a?.reason)) E.push(`${w}: “reason” is required (and what is said instead: use)`);
        covered.add(a?.concept);
      }
      // every concept of the node has a word or an absent entry (a word written elsewhere with this meaning counts too)
      const elsewhere = new Set([...others.values()].flatMap(({ x }) => x.senses || []));
      for (const cid of node?.concepts || []) if (!covered.has(cid) && !elsewhere.has(cid)) E.push(`${where}: concept “${cid}” has no word and is not marked absent`);
      // D14: one concept, several words → each says what separates it, on one axis
      const all = lexIndex(data, code, (lexicon.lexemes || []).filter(isObj).map(x => [x, nid]), nid), by = {};
      for (const { x } of all.values()) for (const c of x.senses || []) (by[c] = by[c] || []).push(x);
      for (const [cid, xs] of Object.entries(by)) {
        if (xs.length < 2 || !xs.some(x => (lexicon.lexemes || []).includes(x))) continue;
        const got = xs.map(x => (x.contrasts || []).find(ct => ct.concept === cid));
        if (got.some(g => !g)) { E.push(`lang/${code} · concept ${cid}: ${xs.length} words (${xs.map(x => x.id).join(', ')}): each says what separates it (contrasts, D14) — missing in ${xs.filter((x, i) => !got[i]).map(x => x.id).join(', ')}`); continue; }
        if (new Set(got.map(g => g.axis)).size > 1) E.push(`lang/${code} · concept ${cid}: the words of one concept are contrasted on ONE axis`);
        if (new Set(got.map(g => g.value)).size < got.length) E.push(`lang/${code} · concept ${cid}: two words have the same contrast value`);
      }
    }
    /** A realization (lang/<code>/grammar/<fn>.json). */
    function checkRealization(E, data, code, fid, g, lj) {
      const where = `lang/${code}/grammar/${fid}.json`, fn = (data.functions || []).find(f => f.id === fid);
      if (!isObj(g)) { E.push(`${where}: the realization must be an object`); return; }
      if (!fn) { E.push(`${where}: unknown function “${fid}”`); return; }
      if (g.function !== fid) E.push(`${where}: function must be “${fid}”`);
      if (!STATUS.has(g.status)) E.push(`${where}: status must be one of realized, periphrastic, absent`);
      if (!str(g.summary)) E.push(`${where}: “summary” is required (text)`);
      const fors = new Set([...(g.notes || []), ...(g.blocks || []).flatMap(b => isObj(b) ? b.notes || [] : [])].map(n => n?.for).filter(Boolean));
      for (const n of [...(g.notes || []), ...(g.blocks || []).flatMap(b => isObj(b) ? b.notes || [] : [])]) if (!str(n?.for) || !str(n?.text)) E.push(`${where}: a comparison note needs “for” and “text”`);
      const refs = [...fors].filter(f => REF[f]), types = new Set([...refs.map(f => REF[f]), ...[...fors].filter(f => String(f).startsWith('type:')).map(f => f.slice(5))]);
      if (refs.length < 8 || !TYPES.every(t => types.has(t))) E.push(`${where}: comparison notes for the reference set: ${refs.length} of at least 8 languages, types ${[...types].sort().join(', ') || 'none'} of all four (D18: ${Object.keys(REF).join(' ')})`);
      for (const gen of g.generators || []) {
        if (!GENS.has(gen?.type)) E.push(`${where}: unknown exercise type “${gen?.type}”`);
        if (gen?.type === 'inflect' && !gen.pos) E.push(`${where}: inflect needs pos`);
        for (const fr of gen?.bank?.frames || []) if (!(data.frames || []).some(f => f.id === fr)) E.push(`${where}: generator bank: unknown frame “${fr}”`);
        if (gen?.type === 'quiz' && !(g.quiz || []).length) E.push(`${where}: quiz: the questions (quiz) are missing`);
      }
      (g.quiz || []).forEach((q, i) => {
        const qw = `${where} · quiz ${i + 1}`;
        if (!str(q?.q) || !str(q?.why)) E.push(`${qw}: q and why are required`);
        if (!Array.isArray(q?.options) || q.options.length < 2 || !q.options.every(str)) E.push(`${qw}: options: at least 2 non-empty strings`);
        else if (new Set(q.options).size !== q.options.length) E.push(`${qw}: two options are the same`);
        else if (!q.options.includes(q.answer)) E.push(`${qw}: answer must be one of the options (the text)`);
      });
      if (fn.category === 'overview') {
        if (g.typology?.type !== lj?.typology) E.push(`${where}: typology.type must be the language's type “${lj?.typology}”`);
        if ((g.facts || []).length < 3) E.push(`${where}: facts: at least 3`);
        if ((g.peculiarities || []).length < 3) E.push(`${where}: peculiarities: at least 3 (D11)`);
        if ((g.quiz || []).length < 3) E.push(`${where}: quiz: at least 3 questions`);
      } else if (g.status !== 'absent' && !(g.procedure?.askYourself || []).length) E.push(`${where}: procedure.askYourself (the “ask yourself” checklist) is required`);
    }
    /** Sentences for the bank. opts: {lex (Map), grams {fid: realization}, fn (must list it), only (Set of lexeme ids the words must come from)} */
    function checkBank(E, data, code, sents, lj, { lex, grams = {}, fn = null, only = null, label = 'bank' } = {}) {
      const old = new Set((data.langs?.[code]?.bank || []).map(s => s.id)), mine = new Map();
      for (const s of sents || []) if (isObj(s) && str(s.id)) mine.set(s.id, s);
      const frames = new Set((data.frames || []).map(f => f.id)), fns = new Set((data.functions || []).map(f => f.id));
      const seen = new Set();
      for (const s of sents || []) {
        const w = `lang/${code}/${label} · ${s?.id}`;
        if (!isObj(s)) { E.push(`lang/${code}/${label}: a sentence must be an object`); continue; }
        if (!(str(s.id) && s.id.startsWith(code + '.'))) E.push(`${w}: sentence id must start with “${code}.”`);
        if (old.has(s.id) || seen.has(s.id)) E.push(`${w}: sentence id used twice (choose new ids)`); seen.add(s.id);
        if (!frames.has(s.frame)) E.push(`${w}: unknown frame “${s.frame}”`);
        if (!str(s.gloss)) E.push(`${w}: “gloss” is required (the meaning, in the explanation language)`);
        const toks = Array.isArray(s.tokens) ? s.tokens : [];
        if (!toks.length) { E.push(`${w}: tokens are required`); continue; }
        const used = []; let first = true;
        const one = (k, tw, isFirst) => {
          const e = lex.get(k.l); if (!e) { E.push(`${tw}: unknown lexeme “${k.l}”`); return; }
          const x = e.x, forms = x.forms || {}; let want;
          if (k.f) { const cm = {}; for (const c of Object.keys(forms)) cm[canon(c)] = c; if (!cm[canon(k.f)]) { E.push(`${tw}: “${k.l}” has no cell ${k.f}`); used.push([k.l, k.f]); return; } want = forms[cm[canon(k.f)]]; }
          else { if (Object.keys(forms).length) { E.push(`${tw}: “${k.l}” is inflected: the cell (f) is required`); used.push([k.l, null]); return; } want = x.lemma; }
          used.push([k.l, k.f || null]);
          if (!k.f && (x.alts || []).includes(k.t)) return;
          if (code === 'ar' && !isFirst && k.t !== want && want.length > 2 && want[0] === 'ا' && 'َُِ'.includes(want[1]) && (k.t === 'ٱ' + want.slice(2) || k.t === 'ا' + want.slice(2))) return;   // hamzat al-waṣl inside a sentence
          if (k.t !== want && !(isFirst && lj.capitalizeFirst && k.t === capFirst(want))) E.push(`${tw}: “${k.t}” is not the ${k.f || 'lemma'} form of ${k.l} (“${want}”)`);
        };
        toks.forEach((k, i) => {
          const tw = `${w} · token ${i + 1} “${k?.t}”`;
          if (!isObj(k)) { E.push(`${tw}: a token must be an object`); return; }
          if (k.p) { if (k.t && '.?!。？！؟'.includes(String(k.t).slice(-1))) first = true; return; }
          if (k.name) { if (k.l || k.f) E.push(`${tw}: a name has no lexeme (l) and no cell (f)`); first = false; return; }
          if (k.parts) { if (k.parts.map(p => p.t || '').join('') !== k.t) E.push(`${tw}: the parts do not spell the token`); k.parts.forEach((p, j) => { if (!p.name) one(p, `${tw} · part ${j + 1}`, first && j === 0); }); }
          else one(k, tw, first);
          first = false;
        });
        if (joinTokens(toks, lj.tokenJoin) !== s.text) E.push(`${w}: text “${s.text}” ≠ the tokens joined “${joinTokens(toks, lj.tokenJoin)}”`);
        if (only) { const out = used.map(u => u[0]).filter(l => !only.has(l)); if (out.length) E.push(`${w}: uses words the learner does not know yet: ${[...new Set(out)].join(', ')} (a refill uses only the known words listed in the task)`); }
        if (fn && !(s.functions || []).includes(fn)) E.push(`${w}: must list ${fn} in functions (this task writes sentences for it)`);
        for (const fid of s.functions || []) {
          if (!fns.has(fid)) { E.push(`${w}: unknown function “${fid}”`); continue; }
          const g = grams[fid] || data.langs?.[code]?.grammar?.[fid] || {};
          if (g.status === 'absent') { E.push(`${w}: ${fid} is absent in ${code}; a sentence cannot show it`); continue; }
          const ev = g.evidence || {};
          if (!(ev.tags || ev.lemmas || ev.punct)) { E.push(`${w}: ${fid} has no evidence in its realization (tags, lemmas or punct) yet: a sentence cannot show it`); continue; }
          let tagsets = ev.tags || []; tagsets = tagsets.length && Array.isArray(tagsets[0]) ? tagsets : tagsets.length ? [tagsets] : [];
          let ok = used.some(([l]) => (ev.lemmas || []).includes(l)) || used.some(([, f]) => f && tagsets.some(ts => ts.length && ts.every(t => cellParts(f).includes(t)))) || toks.some(k => k.p && (ev.punct || []).includes(k.t));
          if (ok && used.some(([l]) => (ev.exclude || []).includes(l))) ok = false;
          if (!ok) E.push(`${w}: listed as ${fid}, but no word shows it (evidence ${JSON.stringify(ev)})`);
        }
        if (s.variantOf) { const o = mine.get(s.variantOf) || (data.langs?.[code]?.bank || []).find(x => x.id === s.variantOf); if (!o) E.push(`${w}: variantOf “${s.variantOf}” does not exist`); else if (o.frame !== s.frame) E.push(`${w}: a variant must have the frame of its original`); if (!s.variant) E.push(`${w}: a variant must say what changed (variant)`); }
      }
    }
    function checkCore(E, rec, data, ans, peers) {
      const langs = data.course.languages, concepts = {}, fns = {}, frames = {}, nodes = {};
      for (const f of ans.fields || []) {
        const where = `core/fields/${f?.field}.json`;
        if (!str(f?.field) || !str(f?.title)) E.push(`${where}: field and title are required`);
        if (!Array.isArray(f?.sources) || !f.sources.length) E.push(`${where}: “sources” is required: how the list was made complete`);
        const subs = new Set((f?.subgroups || []).map(s => s.id)), ranks = {};
        for (const c of f?.concepts || []) {
          const w = `${where} · ${c?.id}`;
          if (!str(c?.id)) { E.push(`${where}: a concept without id`); continue; }
          if (concepts[c.id]) E.push(`${w}: concept id used twice`); concepts[c.id] = { ...c, field: f.field };
          if (!str(c.gloss)) E.push(`${w}: “gloss” is required (in the explanation language)`);
          if (subs.size && !subs.has(c.subgroup)) E.push(`${w}: unknown subgroup “${c.subgroup}”`);
          if (![1, 2, 3].includes(c.tier)) E.push(`${w}: tier must be 1, 2 or 3`);
          if (!(Number.isInteger(c.rank) && c.rank > 0)) E.push(`${w}: rank must be a positive integer`);
          else if ((ranks[c.tier] = ranks[c.tier] || new Set()).has(c.rank)) E.push(`${w}: rank ${c.rank} used twice in tier ${c.tier}`); else ranks[c.tier].add(c.rank);
        }
      }
      for (const f of ans.functions || []) {
        if (!str(f?.id) || fns[f.id]) { E.push(`core/functions: function id missing or used twice (${f?.id})`); continue; }
        fns[f.id] = f;
        if (!str(f.title)) E.push(`core/functions/${f.id}.json: “title” is required`);
        if (!CATS.has(f.category)) E.push(`core/functions/${f.id}.json: category must be one of ${[...CATS].join(', ')} (D19)`);
      }
      for (const f of Object.values(fns)) for (const a of f.after || []) if (!fns[a]) E.push(`core/functions/${f.id}.json: unknown function “${a}” in after`);
      for (const f of ans.frames || []) { if (!str(f?.id) || frames[f.id]) E.push(`core/frames.json: frame id missing or used twice (${f?.id})`); else frames[f.id] = f; if (!str(f?.meaning)) E.push(`core/frames.json · ${f?.id}: “meaning” is required`); }
      const own = {};
      for (const n of ans.nodes || []) {
        const w = `core/nodes.json · ${n?.id}`;
        if (!str(n?.id)) { E.push('core/nodes.json: a node without id'); continue; }
        if (nodes[n.id]) E.push(`${w}: node id used twice`); nodes[n.id] = n;
        if (!str(n.title)) E.push(`${w}: “title” is required`);
        if (!['core', 'field', 'lesson'].includes(n.kind)) E.push(`${w}: kind must be "core", "field" or "lesson"`);
        if (!(n.concepts || []).length && n.kind !== 'lesson') E.push(`${w}: a node needs concepts`);
        if (n.path != null && !TYPES.includes(n.path)) E.push(`${w}: path must be one of ${TYPES.join(', ')}`);
        if (n.kind === 'lesson') {
          const fl = n.functions, allf = Array.isArray(fl) ? fl : isObj(fl) ? Object.values(fl).flat() : [];
          if (isObj(fl)) for (const k of Object.keys(fl)) if (k !== '*' && !TYPES.includes(k) && !langs.includes(k)) E.push(`${w}: functions: “${k}” is not "*", a language type or a course language`);
          if (!allf.length) E.push(`${w}: a lesson needs its grammar (functions)`);
          for (const f of allf) if (!fns[f]) E.push(`${w}: unknown function “${f}”`);
          if (n.step != null && !(Number.isInteger(n.step) && n.step >= 0)) E.push(`${w}: step must be a whole number ≥ 0`);
        } else if (n.functions) E.push(`${w}: only lessons have functions`);
        if (n.stage != null && !['foundations', 'core', 'advanced'].includes(n.stage)) E.push(`${w}: stage must be foundations, core or advanced (D17)`);
        if (n.stage === 'advanced' && !['field', 'grammar', 'lexicon', 'variety', 'text', 'culture'].includes(n.family)) E.push(`${w}: an advanced module names its family (D17)`);
        for (const x of n.langs || []) if (!langs.includes(x)) E.push(`${w}: “${x}” in langs is not a course language`);
        (n.concepts || []).forEach((cid, i) => {
          if (!concepts[cid]) { E.push(`${w}: unknown concept “${cid}”`); return; }
          if (n.concepts.indexOf(cid) !== i) E.push(`${w}: concept “${cid}” listed twice`);
          (own[cid] = own[cid] || []).push(n.id);
          if (n.kind === 'field' && (concepts[cid].field !== n.field || concepts[cid].tier !== n.tier)) E.push(`${w}: concept “${cid}” is ${concepts[cid].field} tier ${concepts[cid].tier}, the node is ${n.field} tier ${n.tier}`);
        });
      }
      for (const n of Object.values(nodes)) for (const p of n.prereqs || []) if (!nodes[p]) E.push(`core/nodes.json · ${n.id}: unknown prerequisite “${p}”`);
      for (const [cid, c] of Object.entries(concepts)) { if (c.pending && own[cid]) E.push(`concept ${cid}: is pending but node ${own[cid][0]} teaches it: remove "pending"`); else if (!c.pending && !own[cid]) E.push(`concept ${cid}: is in no node (a meaning not taught yet is "pending": true)`); }
      const state = {}; const visit = (x, path) => { if (state[x] === 1) { E.push('core/nodes.json: cycle: ' + [...path, x].join(' → ')); return; } if (state[x] === 2 || !nodes[x]) return; state[x] = 1; for (const p of nodes[x].prereqs || []) visit(p, [...path, x]); state[x] = 2; };
      Object.keys(nodes).forEach(x => visit(x, []));
      // additive: a course that has content keeps every node and concept it had
      for (const n of data.nodes || []) if (!nodes[n.id]) E.push(`core/nodes.json: node “${n.id}” is missing — the core of a course that has content only grows (progress is kept by its ids)`);
      for (const c of Object.keys(conceptsOf(data))) if (!concepts[c]) E.push(`concept ${c}: is missing — concepts are never removed`);
      // the declarations of every language (language.json): from the course, the library, or this answer
      const decl = {};
      for (const L of langs) {
        const lj = ans.languages?.[L] || data.langs?.[L]?.language;
        if (!isObj(lj)) { E.push(`lang/${L}/language.json: missing — give it in "languages" (code, typology, script, dir, tokenJoin, paradigmCells, citationCells, wordFeatures; its catalogue of phenomena comes first, D14)`); continue; }
        decl[L] = lj;
        if (ans.languages?.[L]) {
          if (lj.code !== L) E.push(`lang/${L}/language.json: code must be “${L}”`);
          if (!['ltr', 'rtl'].includes(lj.dir)) E.push(`lang/${L}/language.json: dir must be "ltr" or "rtl"`);
          if (!['space', 'none'].includes(lj.tokenJoin)) E.push(`lang/${L}/language.json: tokenJoin must be "space" or "none"`);
          if (!TYPES.includes(lj.typology)) E.push(`lang/${L}/language.json: typology must be one of ${TYPES.join(', ')} (D10)`);
          if (!isObj(lj.paradigmCells)) E.push(`lang/${L}/language.json: paradigmCells is required (the cells every word of a part of speech fills)`);
          if (!isObj(lj.wordFeatures)) E.push(`lang/${L}/language.json: wordFeatures is required (D14, §4.5.1)`);
        }
      }
      for (const L of Object.keys(ans.languages || {})) if (!langs.includes(L)) E.push(`languages.${L}: not a course language`);
      // per language: lessons form one chain, a concept is taught at most once
      for (const L of Object.keys(decl)) {
        const typ = decl[L].typology, app = new Set(Object.values(nodes).filter(n => applies(n, L, typ)).map(n => n.id));
        for (const [cid, ns] of Object.entries(own)) { const m = ns.filter(x => app.has(x)); if (m.length > 1) E.push(`core/nodes.json · ${L}: concept “${cid}” is taught twice in ${L}: ${m.join(', ')}`); }
      }
      const lessons = Object.values(nodes).filter(n => n.kind === 'lesson');
      const ty = ans.typology || data.typology;
      if (lessons.length && !(isObj(ty) && Array.isArray(ty.types) && TYPES.every(t => ty.types.some(x => x.id === t)))) E.push('core/typology.json: the four language types (isolating, agglutinating, fusional, polysynthetic) are required when the course has lessons');
      // D13: one common order of the subjects — within the course and against the library courses
      if (!E.length) {
        const mineData = { course: data.course, nodes: ans.nodes, langs: Object.fromEntries(Object.entries(decl).map(([L, lj]) => [L, { language: lj }])) };
        const paths = coursePaths(mineData, rec.id);
        for (const p of peers || []) { try { paths.push(...coursePaths(p)); } catch (e) { } }
        for (const m of orderConflicts(paths, rec.id + '/')) E.push(`parallel order (D13): ${m} — a subject common to several paths keeps the same place in all of them (docs/LANGUAGES.md §4.4.3)`);
      }
    }
    /** Is this answer good for this task? → [problems] (empty: accepted). peers: the library courses (D13). */
    function checkAnswer(rec, data, task, ans, { peers = [] } = {}) {
      if (!isObj(ans)) return ['the answer must be ONE JSON object (not a list, not text)'];
      const E = shape(SCHEMA[task.kind], ans); if (E.length) return E;
      if (task.kind === KIND.core) { checkCore(E, rec, data, ans, peers); return E.slice(0, 80); }
      if (!(data.nodes || []).length) return ['the course has no core yet: its core task comes first'];
      const code = task.lang, L = data.langs?.[code], lj = L?.language;
      if (task.kind !== KIND.compare) {
        if (!L) return [`“${code}” is not a language of this course`];
        if (!isObj(lj)) return [`lang/${code}/language.json is missing — the course's core task gives it first`];
      }
      if (task.kind === KIND.node) {
        const node = (data.nodes || []).find(n => n.id === task.node); if (!node) return [`node “${task.node}” is not in the course`];
        if (!applies(node, code, lj.typology)) return [`node ${task.node} does not apply to ${code} (path / langs)`];
        checkLexemes(E, data, code, task.node, ans.lexicon, lj);
        const lex = lexIndex(data, code, (ans.lexicon.lexemes || []).filter(isObj).map(x => [x, task.node]), task.node);
        const grams = isObj(ans.grammar) ? ans.grammar : {};
        for (const [fid, g] of Object.entries(grams)) checkRealization(E, data, code, fid, g, lj);
        checkBank(E, data, code, ans.bank || [], lj, { lex, grams, label: `bank/${task.node}.json` });
      } else if (task.kind === KIND.function) {
        checkRealization(E, data, code, task.fn, ans.grammar, lj);
        checkBank(E, data, code, ans.bank || [], lj, { lex: lexIndex(data, code), grams: { [task.fn]: ans.grammar }, fn: task.fn, label: `bank/${task.fn}.json` });
      } else if (task.kind === KIND.compare) {
        const c = ans.compare;
        if (c.function !== task.fn) E.push(`compare/${task.fn}.json: function must be “${task.fn}”`);
        if (!(data.functions || []).some(f => f.id === task.fn)) E.push(`compare: unknown function “${task.fn}”`);
        c.rows.forEach((r, i) => {
          const ks = Object.keys(r.cells || {});
          if (!str(r.aspect)) E.push(`compare/${task.fn}.json · row ${i + 1}: aspect is required`);
          for (const k of ks) { if (!data.course.languages.includes(k)) E.push(`compare/${task.fn}.json · row ${i + 1}: “${k}” is not a course language`); else if (!str(r.cells[k])) E.push(`compare/${task.fn}.json · row ${i + 1}: empty cell for ${k}`); }
          if (ks.length < 2) E.push(`compare/${task.fn}.json · row ${i + 1}: at least two languages side by side`);
        });
      } else if (task.kind === KIND.refill) {
        const only = new Set([...(task.R || []), ...(task.P || [])]);
        checkBank(E, data, code, ans.bank, lj, { lex: lexIndex(data, code), fn: task.fn, only, label: `bank/refill.json` });
      }
      return E.slice(0, 80);
    }

    /* ---------- merges: additive, by id ---------- */
    const upsert = (arr, items, key = 'id') => { for (const it of items || []) { const i = arr.findIndex(x => x?.[key] === it?.[key]); if (i >= 0) arr[i] = it; else arr.push(it); } return arr; };
    /** Apply a checked answer (mutates data — or, for a library course's refill, the patch — and the record) → a log line. */
    function applyAnswer(rec, data, task, ans, { now = Date.now(), patch = null } = {}) {
      let line;
      if (task.kind === KIND.core) {
        upsert(data.fields, clone(ans.fields), 'field'); upsert(data.nodes, clone(ans.nodes)); upsert(data.functions, clone(ans.functions)); upsert(data.frames, clone(ans.frames));
        if (ans.typology) data.typology = clone(ans.typology);
        for (const [L, lj] of Object.entries(ans.languages || {})) if (data.langs[L]) data.langs[L].language = clone(lj);
        line = `the core: ${ans.nodes.length} nodes, ${ans.fields.reduce((a, f) => a + (f.concepts || []).length, 0)} concepts, ${ans.functions.length} grammar points, ${ans.frames.length} frames`;
      } else if (task.kind === KIND.node) {
        const L = data.langs[task.lang], f = L.lexicon[task.node] = L.lexicon[task.node] || { lexemes: [], absent: [] };
        f.absent = f.absent || []; upsert(f.lexemes, clone(ans.lexicon.lexemes)); upsert(f.absent, clone(ans.lexicon.absent || []), 'concept');
        for (const [fid, g] of Object.entries(ans.grammar || {})) L.grammar[fid] = clone(g);
        upsert(L.bank, clone(ans.bank || []));
        line = `${task.node} in ${nameOf(task.lang)}: ${ans.lexicon.lexemes.length} words, ${(ans.lexicon.absent || []).length} absent, ${(ans.bank || []).length} sentences`;
      } else if (task.kind === KIND.function) {
        const L = data.langs[task.lang]; L.grammar[task.fn] = clone(ans.grammar); upsert(L.bank, clone(ans.bank || []));
        line = `${task.fn} in ${nameOf(task.lang)}: the realization + ${(ans.bank || []).length} sentences`;
      } else if (task.kind === KIND.compare) {
        (data.compare = data.compare || {})[task.fn] = clone(ans.compare); line = `${task.fn} compared across ${data.course.languages.length} languages`;
      } else if (task.kind === KIND.refill) {
        if (patch) { const P = patch.langs[task.lang] = patch.langs[task.lang] || { bank: [] }; upsert(P.bank, clone(ans.bank)); patch.rev = (patch.rev || 0) + 1; }
        upsert(data.langs[task.lang].bank, clone(ans.bank));
        line = `${ans.bank.length} new sentences for ${task.fn} in ${nameOf(task.lang)} with the words you know`;
      }
      if (!patch) { data.rev = (data.rev || 0) + 1; rec.rev = data.rev; }
      const t = (rec.tasks || []).find(x => x.id === task.id && isOpen(x)); if (t) { t.status = 'done'; t.doneAt = iso(now); delete t.claimedAt; }
      rec.updated = iso(now); (rec.log = rec.log || []).push({ t: now, m: '✓ ' + line }); if (rec.log.length > 200) rec.log = rec.log.slice(-200);
      return line;
    }
    /** The course as it will be once the app has merged the answers waiting in the inbox (the connector works on this). */
    function merged(rec, data, rows, { peers = [] } = {}) {
      const r = clone(rec), d = clone(data);
      for (const row of [...rows].sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
        let e; try { e = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch (x) { continue; }
        const t = byId(r, e?.task); if (t && !checkAnswer(r, d, t, e.data, { peers }).length) applyAnswer(r, d, t, e.data);
      }
      return { rec: r, data: d };
    }
    const inboxKey = (cid, seq) => `${IN}${cid}:${seq || Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 6)}`;
    const claimKey = (cid, tid) => `${CLAIM}${cid}:${tid}`;

    /* ---------- the task as text (the connector, a copied task, the in-app runner) ---------- */
    const RULES = `The binding rules (docs/LANGUAGE_RULES.md, D1–D19 — read the whole file: noema_authoring_guide part "languages", or references/LANGUAGE_RULES.md of the skill):
- D1 every gloss, rule text, trap and feedback is written in the course's explanation language.
- D3/D5 correctness over speed: every form, gender, plural, vowel mark, tone and fact is grounded (Wiktionary via kaikki.org — tools/lang_refcheck.py —, CC-CEDICT, reference grammars); leave out what you are not sure of; ref.override only with a reason. You never invent an answer key: exercises are made by the app from the paradigms and sentences you store.
- D6 UniMorph cells (N;NOM;SG, V;PRS;3;SG) and Universal Dependencies parts of speech.
- D9 complete thematic word groups that combine with the words already taught (verbs take the nouns taught, adjectives fit them).
- D10/D13 ONE common order of subjects across every language of every course and every language type: a node, grammar function or concept common to several paths keeps the same place in all of them; type- or language-specific grammar goes inside the common step (functions by "*" / type / code) or into an extra node (path, langs) between the common ones — never a different order for one language.
- D14 every word states its language's whole facade: features for every parameter of wordFeatures (a value, or {"none": "<why>"}); several words for one concept each give contrasts (one axis per concept).
- D15 every distinct meaning of a word is its own concept (pending until a node teaches it); a nuance says "of" the sense it belongs to.
- D16 no built-in point of view: texts describe the language itself, never "unlike English / as in Greek"; comparisons go into notes.
- D18 every grammar page has comparison notes ({for, rel: same|similar|different|new|trap, text}) for at least 8 languages of the reference set covering all four types: fusional el ru es en fr de hi fa mr ar he · agglutinating tr ja ko fi hu sw lg · isolating zh vi · polysynthetic iu.
- D19 every word used anywhere is in the lexicon with its full facade; sentences for the other aspects may hold up to ⌈30 %⌉ unknown words; every field brings ≥ 2 sentences for every non-vocabulary node before it.
- ar and he forms are stored fully vocalized; zh words give pinyin (syllables separated by spaces), trad, and measure words for nouns.`;
    const fmtForms = x => { const f = x.forms || {}; const ks = Object.keys(f); return ks.length ? ' {' + ks.map(k => `${k}=${f[k]}`).join(', ') + '}' : ''; };
    /** The words of a language written so far (before a node in course order when `before` is given): one line each, with all forms. */
    function wordLines(data, code, { before = null, only = null, max = 1500 } = {}) {
      const { out } = topo(data.nodes || []), stop = before ? out.indexOf(before) : out.length, lines = [];
      for (const nid of out.slice(0, stop < 0 ? out.length : stop)) for (const x of data.langs?.[code]?.lexicon?.[nid]?.lexemes || []) {
        if (only && !only.has(x.id)) continue;
        lines.push(`${x.id} · ${x.lemma} · ${x.pos}${x.gender ? ' ' + x.gender : ''} · ${(x.senses || []).join(', ') || x.role || ''}${fmtForms(x)}`);
      }
      return lines.length > max ? lines.slice(0, max).concat([`… and ${lines.length - max} more (in the course file)`]) : lines;
    }
    const nodeLine = (n, code, typ) => `${n.id} (${n.kind}${n.stage ? ', ' + n.stage : ''}${n.field ? ', ' + n.field + ' tier ' + n.tier : ''}${n.path ? ', path ' + n.path : ''}${n.langs ? ', only ' + n.langs.join('/') : ''}) — ${n.title}${n.prereqs?.length ? ' · after ' + n.prereqs.join(', ') : ''}${n.kind === 'lesson' ? ' · grammar: ' + (code ? lessonFns(n, code, typ).join(', ') : JSON.stringify(n.functions)) : ''} · ${(n.concepts || []).length} concepts`;
    /** {id, kind, title, system, prompt, schema} — the prompt says everything but how to deliver the answer. */
    function taskSpec(rec, data, task, { peers = [], courseUrl = '' } = {}) {
      const c = data.course, code = task.lang, lj = code ? data.langs?.[code]?.language : null, typ = lj?.typology;
      const concepts = conceptsOf(data), head = `Course “${c.title}” (${c.id}) · languages: ${c.languages.map(x => `${nameOf(x)} (${x})`).join(', ')} · explanations in ${nameOf(c.explainLang)} (${c.explainLang})${(c.knownLanguages || []).length ? ' · the learner already speaks: ' + c.knownLanguages.join(', ') : ''}`;
      const system = `You write content for a noema-lite language course (docs/LANGUAGES.md). Correctness first: every form, gender, plural, vowel mark, tone and fact is grounded in reference data. Answer only through the requested JSON structure.`;
      const frames = (data.frames || []).map(f => `${f.id}: ${f.meaning}`).join('\n') || '(none yet)';
      const fnsList = (data.functions || []).map(f => `${f.id} (${f.category}) — ${f.title}`).join('\n') || '(none yet)';
      let title, what, ctx = '';
      if (task.kind === KIND.core) {
        title = 'The core of the course: concepts (fields), the node DAG, grammar functions, frames';
        what = `Write the language-neutral core of this course (docs/LANGUAGES.md §4.1–§4.4, §4.7, §4.8): \`fields\` (core/fields/<field>.json each: field, title, subgroups, sources — how the list was made complete —, concepts {id, gloss, subgroup, tier 1–3, rank, wikidata?, pending?}), \`nodes\` (core/nodes.json: the foundations S00–S18 as lessons fd.00–fd.18 with step, stage and functions by "*" / type / language code, then the core lessons and the field branches with tiers; prerequisites; every non-pending concept in exactly one node), \`functions\` (core/functions/<id>.json: id, title, category, level, after), \`frames\` (core/frames.json: id, meaning), \`typology\` (core/typology.json: the four types, when the course has lessons) and \`languages\` (language.json for every course language that has none below).
Depth per language: ${Object.entries(c.defaults?.depth || {}).map(([k, v]) => `${k} ${v}`).join(', ')}. Build on the library course: the same node ids, function ids and concept ids for the same subjects, in the same order (D13) — then the check of the parallel order passes. The library course file (with every concept) is ${courseUrl || 'library/languages/<id>/course.pack.js on the noema-lite website'}.`;
        ctx = (peers || []).map(p => { const tp = topo(p.nodes || []); return `### The common order of the library course “${p.course?.title}” (${p.course?.id}) — keep it\n` + tp.out.map(id => nodeLine(tp.by[id])).join('\n') + `\nFunctions: ${(p.functions || []).map(f => f.id).join(', ')}`; }).join('\n\n');
        ctx += `\n\n### The languages\n` + c.languages.map(L => `${L}: ${data.langs[L]?.language ? `language.json exists (typology ${data.langs[L].language.typology}) — do not repeat it` : 'NO language.json yet — give it in "languages" (its catalogue of phenomena must exist: library/languages/_phenomena/' + L + '.json, D14)'}`).join('\n');
      } else if (task.kind === KIND.node) {
        const n = (data.nodes || []).find(x => x.id === task.node) || { concepts: [] };
        title = `${n.title} (${task.node}) in ${nameOf(code)}`;
        what = `Write node ${task.node} in ${nameOf(code)} (${code}): \`lexicon\` = lang/${code}/lexicon/${task.node}.json — a lexeme for every concept of the node (or an "absent" entry with reason and what is said instead), each with id "${code}:<lemma>", lemma, pos, senses (concept ids; every meaning a concept, D15), forms (every cell of paradigmCells for its part of speech; fully vocalized for ar/he), gender, features (the whole facade, D14), contrasts when a concept has several words, ref, and its profile (§4.6) — and \`bank\`: sentences (lang/${code}/bank) that combine the new words with the earlier ones (at least 3 per new content word over the course's frames, variants for negation / questions / plural where the functions allow), every token {t, l, f} equal to its paradigm cell, ids "${code}.${task.node}.001"…, gloss in ${nameOf(c.explainLang)}; list in "functions" only grammar a word of the sentence shows (by the realization's evidence).` + (n.kind === 'lesson' ? ` This is a lesson: give in \`grammar\` the realization of every function of the lesson in ${code} that is not written yet (${lessonFns(n, code, typ).filter(f => !data.langs[code].grammar[f]).join(', ') || 'none'}).` : '');
        ctx = `### The node\n${nodeLine(n, code, typ)}\nConcepts:\n${(n.concepts || []).map(cid => `- ${cid}: ${concepts[cid]?.gloss || ''}${concepts[cid]?.subgroup ? ' [' + concepts[cid].subgroup + ']' : ''}${concepts[cid]?.note ? ' — ' + concepts[cid].note : ''}`).join('\n')}\n\n### language.json of ${code}\n${JSON.stringify({ typology: lj?.typology, dir: lj?.dir, tokenJoin: lj?.tokenJoin, capitalizeFirst: lj?.capitalizeFirst, vowelMarks: lj?.vowelMarks, paradigmCells: lj?.paradigmCells, citationCells: lj?.citationCells, extraTags: lj?.extraTags, wordFeatures: lj?.wordFeatures })}\n\n### The words of ${code} written before this node (id · lemma · pos · concepts {cell=form})\n${wordLines(data, code, { before: task.node }).join('\n') || '(none yet)'}\n\n### Grammar realized in ${code} (a sentence may list these when a word shows them)\n${Object.entries(data.langs[code].grammar || {}).map(([fid, g]) => `${fid}: ${g.status}; evidence ${JSON.stringify(g.evidence || {})}`).join('\n') || '(none yet)'}`;
      } else if (task.kind === KIND.function) {
        const f = (data.functions || []).find(x => x.id === task.fn) || {};
        title = `${f.title || task.fn} (${task.fn}) in ${nameOf(code)}`;
        what = `Write the realization of ${task.fn} in ${nameOf(code)}: \`grammar\` = lang/${code}/grammar/${task.fn}.json (function, status realized | periphrastic | absent, summary, blocks, procedure.askYourself, traps, evidence {tags | lemmas | punct, exclude?}, paradigmCells, needs, generators — exercise ids of §6 —, notes for the reference set, D18; an absent point says how the language expresses the meaning instead) — and \`bank\`: at least 12 sentences that show it (each lists ${task.fn} in functions and a word of it shows the evidence), made only of words of the lexicon below.`;
        ctx = `### The function\n${JSON.stringify(f)}\n\n### language.json of ${code}\n${JSON.stringify({ typology: lj?.typology, tokenJoin: lj?.tokenJoin, paradigmCells: lj?.paradigmCells, extraTags: lj?.extraTags })}\n\n### The words of ${code} (id · lemma · pos · concepts {cell=form})\n${wordLines(data, code).join('\n') || '(none yet)'}${data.langs[code]?.grammar?.[task.fn] ? `\n\n### The realization written so far (improve it, keep what is right)\n${JSON.stringify(data.langs[code].grammar[task.fn])}` : ''}`;
      } else if (task.kind === KIND.compare) {
        const f = (data.functions || []).find(x => x.id === task.fn) || {};
        title = `${f.title || task.fn} (${task.fn}) across the course languages`;
        what = `Write \`compare\` = compare/${task.fn}.json: {function: "${task.fn}", rows: [{aspect, cells: {<language code>: text}}], notes?} — one row per aspect of the point (form, position, agreement, what it marks, what is absent …), every course language side by side, neutral (D16), examples in the languages themselves.`;
        ctx = c.languages.map(L => `### ${nameOf(L)} (${L})\n${data.langs[L]?.grammar?.[task.fn] ? JSON.stringify({ status: data.langs[L].grammar[task.fn].status, summary: data.langs[L].grammar[task.fn].summary, traps: data.langs[L].grammar[task.fn].traps }) : '(not written yet)'}`).join('\n\n');
      } else {
        const f = (data.functions || []).find(x => x.id === task.fn) || {}, g = data.langs?.[code]?.grammar?.[task.fn] || {};
        const only = new Set([...(task.R || []), ...(task.P || [])]);
        title = `More sentences for ${f.title || task.fn} in ${nameOf(code)} with the words the learner knows`;
        what = `Write \`bank\`: new sentences (at least 12, more is better, all different) for ${task.fn} in ${nameOf(code)} that use ONLY the learner's known words below (§7.4: requirements ⊆ known) — every sentence lists ${task.fn} in functions and a word of it shows the evidence; tokens {t, l, f} equal to the paradigm cells; new ids "${code}.refill.${task.fn.replace(/^fn\./, '')}.${task.n}.001"…; gloss in ${nameOf(c.explainLang)}; frames from the list (the meaning of a frame may be stretched: the frame groups sentences of one pattern).`;
        ctx = `### The point\n${task.fn}: ${f.title || ''} — ${g.summary || ''}\nevidence: ${JSON.stringify(g.evidence || {})}\nThe learner has ${task.have ?? '?'} usable sentences for it now.\n\n### The learner's known words in ${code} (R: recognized; the ones marked P are also produced)\n${wordLines(data, code, { only }).map(l => (task.P || []).includes(l.split(' · ')[0]) ? l + ' · P' : l).join('\n')}\n\n### language.json\n${JSON.stringify({ tokenJoin: lj?.tokenJoin, capitalizeFirst: lj?.capitalizeFirst })}`;
      }
      const prompt = `${head}\nTask ${task.id} (${task.kind})\n\n${RULES}\n\n## What to write\n${what}\n\n## The course\nFrames:\n${frames}\n\nGrammar functions:\n${fnsList}\n\n${ctx}`;
      return { id: task.id, kind: task.kind, title, system, prompt, schema: SCHEMA[task.kind] };
    }
    /** The whole task as text. mode 'connector' (answer with noema_lang_submit) or 'paste' (answer with the JSON only). */
    /** files: how Claude gets the course file(s) into its sandbox: [{url, name}] (the first one is unpacked; a library course
        comes as course.pack.js + course.profiles.js; a library course's private patch as patch.json). */
    function taskText(rec, data, task, { mode = 'connector', files = [], peers = [], libraryUrl = '' } = {}) {
      const t = taskSpec(rec, data, task, { peers, courseUrl: libraryUrl });
      const folder = `work/lang/${data.course.id}`, L = task.lang ? ` --lang ${task.lang}` : '';
      const main = files[0]?.name || 'course.json', patch = files.find(f => f.name === 'patch.json');
      const get = files.length ? files.map(f => `curl -sSL -o ${f.name} "${f.url}"`).join('\n   ') : `(the learner attaches the course file course-${data.course.id}.json to this chat — save it as course.json)`;
      const check = `## Check it before you answer (the noema-pack-builder toolkit: the skill, or noema_get_toolkit)
1. ${get}
2. python3 scripts/lang_course.py unpack ${main} work/lang${patch ? ' --patch patch.json' : ''}        → the course as a folder: ${folder}
3. Write your answer as ONE JSON object to answer.json (the structure below), then
   python3 scripts/lang_course.py apply ${folder} answer.json ${task.id}   (writes it into the folder)
4. python3 scripts/validate_lang.py ${folder}${L} --alone               → fix every ❌ (warnings about nodes not written yet are fine)
${task.kind === KIND.compare || task.kind === KIND.core ? '' : `5. python3 scripts/lang_refcheck.py ${folder}${L}                       → every form against Wiktionary (kaikki.org); explain a deliberate difference in ref.override\n`}6. python3 scripts/lang_course.py answer ${folder} ${task.id} > answer.json   → the answer, read back from the folder`;
      const how = mode === 'connector'
        ? `## How to answer\nCall **noema_lang_submit** with course_id "${data.course.id}", task_id "${task.id}" and result_json = the answer (ONE JSON object, no prose, no code fence). It is checked exactly as noema-lite checks it: if it lists problems, fix ALL of them and submit the corrected object again. When it is accepted, call noema_lang_task for the next task.`
        : `## How to answer\nAnswer with exactly ONE JSON object that matches the JSON Schema below — only the JSON, nothing before or after it. The learner pastes it into noema-lite, which checks it; if it lists problems, fix all of them and send the whole corrected object again.`;
      return `# noema-lite language task — ${t.title}\n\n## Your role\n${t.system}\n\n${t.prompt}\n\n${check}\n\n${how}\n\n## JSON Schema of the answer\n${JSON.stringify(t.schema)}\nThe full schema of every file: schemas/noema.lang.v1.schema.json in the toolkit; the contract: references/LANGUAGES.md (§4) and the skill's LANGUAGES.md.`;
    }
    /** The message the learner pastes into a Claude chat with the connector. */
    function message(rec, { count = 1 } = {}) {
      const w = work(rec), n = w.queued.length;
      return `Use the noema-lite connector to write my noema-lite language course “${rec.title}” (course_id ${rec.id}): ${n ? `do the next ${count > 1 ? Math.min(count, n) + ' queued tasks' : 'queued task'} (${n} waiting)` : 'see what is left to do'}.\nCall noema_lang_task with course_id "${rec.id}" and follow what it returns — check every answer with the toolkit (validate_lang.py, lang_refcheck.py) before noema_lang_submit; after each accepted answer call noema_lang_task again. Stop after ${count > 1 ? count + ' tasks' : 'one task'} or when it says there is nothing left. Do not ask me questions — choose sensible defaults.`;
    }

    return { LANGJOBS: { FORMAT, DATA, PATCH, IN, CLAIM, LEASE, KIND, SCHEMA, REF },
      langNewCourseId: newCourseId, langNewCourse: newCourse, langLibraryRecord: libraryRecord, langEmptyPatch: emptyPatch, langApplyPatch: applyPatch,
      langQueue: queueTask, langOpenTasks: order, langSettle: settle, langWork: work, langTaskById: byId, langNext: next, langNeeds: needs, langQueueNight: queueNight, langRefillRequest: refillRequest,
      langCoursePaths: coursePaths, langOrderConflicts: orderConflicts, checkLangAnswer: checkAnswer, applyLangAnswer: applyAnswer, langMerged: merged, langInboxKey: inboxKey, langClaimKey: claimKey,
      langTaskSpec: taskSpec, langTaskText: taskText, langMessage: message, langWordLines: wordLines };
  })();
  API.GEN = GEN;
  Object.assign(API, LANG_P8);   // P8 — Through Claude: account courses, tasks, checks, merges
  /* ---------- extensions by phase (P4 script, P5 grammar, P6 polyglot, P7 production): each adds its functions with Object.assign(API, {…}) in its own section below ---------- */
  root.NoemaLang = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
